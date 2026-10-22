import { shadeAt, town, type Edge, type LngLat } from './engine'

export type Tool = 'tree' | 'canopy' | 'light'

export interface Placement {
  id: number
  tool: Tool
  at: LngLat
  /** suggested by a resident, not yet built */
  proposed?: boolean
}

/** Edge id → edge with the planner's what-if changes applied. */
export type Overrides = Map<number, Edge>

export const TOOL_INFO: Record<Tool, { label: string; cost: number; reach: number; note: string }> = {
  tree: { label: 'Rain tree', cost: 1850, reach: 16, note: 'shades ~11 m of path' },
  canopy: { label: 'Covered walkway', cost: 72500, reach: 26, note: '50 m roofed link' },
  light: { label: 'Solar streetlight', cost: 3200, reach: 30, note: 'lights ~30 m' },
}

const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180

/** Nearest point on an edge to p, and its distance in metres. */
function nearestOnEdge(p: LngLat, e: Edge): { d: number; at: LngLat } {
  let best = { d: Infinity, at: e.geom[0] }
  for (let i = 1; i < e.geom.length; i++) {
    const a = e.geom[i - 1]
    const b = e.geom[i]
    const cos = Math.cos(rad(a[1]))
    const ax = rad(p[0] - a[0]) * cos * R
    const ay = rad(p[1] - a[1]) * R
    const bx = rad(b[0] - a[0]) * cos * R
    const by = rad(b[1] - a[1]) * R
    const t = Math.max(0, Math.min(1, (ax * bx + ay * by) / (bx * bx + by * by || 1)))
    const d = Math.hypot(ax - bx * t, ay - by * t)
    if (d < best.d) best = { d, at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
  }
  return best
}

/** Snap a click onto the walking network, or null if it's too far from any path. */
export function snapToNetwork(p: LngLat, maxMetres = 45): LngLat | null {
  let best: { d: number; at: LngLat } | null = null
  for (const e of town.edges) {
    const n = nearestOnEdge(p, e)
    if (!best || n.d < best.d) best = n
  }
  return best && best.d <= maxMetres ? best.at : null
}

/** Distance from a point to the nearest vertex-to-vertex segment of an edge, in metres. */
function distToEdge(p: LngLat, e: Edge) {
  return nearestOnEdge(p, e).d
}

export function computeOverrides(placements: Placement[]): Overrides {
  const out: Overrides = new Map()
  for (const p of placements) {
    const reach = TOOL_INFO[p.tool].reach
    for (const base of town.edges) {
      if (distToEdge(p.at, base) > reach) continue
      const e = out.get(base.id) ?? { ...base }
      if (p.tool === 'tree') {
        const k = Math.min(1, 11 / e.len) * 0.85
        e.canopy = Math.min(0.95, e.canopy + k * (1 - e.canopy))
      } else if (p.tool === 'canopy') {
        e.covered = Math.min(1, e.covered + Math.min(1, 50 / e.len) * (1 - e.covered))
        e.flood = Math.min(e.flood, 0.5)
      } else {
        e.lit = Math.min(1, e.lit + Math.min(1, 30 / e.len) * 0.8)
      }
      if (e.covered > 0.5) e.surface = 'covered'
      else if (e.canopy >= 0.55) e.surface = 'canopy'
      out.set(base.id, e)
    }
  }
  return out
}

export function placementImpact(placements: Placement[], ov: Overrides, hour = 13) {
  const cost = placements.reduce((s, p) => s + TOOL_INFO[p.tool].cost, 0)
  let total = 0
  let before = 0
  let after = 0
  let walkers = 0
  let localLen = 0
  let localBefore = 0
  let localAfter = 0
  for (const e of town.edges) {
    total += e.len
    const sb = shadeAt(e, hour)
    before += sb * e.len
    const o = ov.get(e.id)
    const sa = o ? shadeAt(o, hour) : sb
    after += sa * e.len
    if (o) {
      localLen += e.len
      localBefore += sb * e.len
      localAfter += sa * e.len
      if (sa - sb > 0.05) walkers += e.footfall
    }
  }
  return {
    cost,
    before: before / total,
    after: after / total,
    localBefore: localLen ? localBefore / localLen : 0,
    localAfter: localLen ? localAfter / localLen : 0,
    localLen,
    edgesImproved: ov.size,
    walkers: Math.round(walkers / 3),
    counts: {
      tree: placements.filter((p) => p.tool === 'tree').length,
      canopy: placements.filter((p) => p.tool === 'canopy').length,
      light: placements.filter((p) => p.tool === 'light').length,
    },
  }
}
