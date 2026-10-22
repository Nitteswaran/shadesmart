import { shadeAt, town, type Edge, type LngLat } from './engine'

export type Tool = 'tree' | 'pergola' | 'canopy' | 'shelter' | 'mist' | 'light' | 'cctv' | 'drain' | 'crossing'
export type ToolGroup = 'shade' | 'safety' | 'flood'

export interface Placement {
  id: number
  tool: Tool
  at: LngLat
  /** suggested by a resident, not yet built */
  proposed?: boolean
}

/** Edge id → edge with the planner's what-if changes applied. */
export type Overrides = Map<number, Edge>

export const TOOL_INFO: Record<Tool, { label: string; short: string; group: ToolGroup; cost: number; reach: number }> = {
  tree: { label: 'Rain tree', short: 'tree', group: 'shade', cost: 1850, reach: 16 },
  pergola: { label: 'Green pergola', short: 'pergola', group: 'shade', cost: 18000, reach: 18 },
  canopy: { label: 'Covered walkway', short: 'covered walkway', group: 'shade', cost: 72500, reach: 26 },
  shelter: { label: 'Rest shelter', short: 'shelter', group: 'shade', cost: 28000, reach: 14 },
  mist: { label: 'Misting fan', short: 'misting fan', group: 'shade', cost: 9500, reach: 14 },
  light: { label: 'Streetlight', short: 'streetlight', group: 'safety', cost: 3200, reach: 30 },
  cctv: { label: 'CCTV camera', short: 'CCTV camera', group: 'safety', cost: 6500, reach: 40 },
  crossing: { label: 'Zebra crossing', short: 'zebra crossing', group: 'safety', cost: 12000, reach: 14 },
  drain: { label: 'Raised path & drain', short: 'drainage fix', group: 'flood', cost: 45000, reach: 30 },
}

export const TOOL_GROUPS: { group: ToolGroup; label: string; tools: Tool[] }[] = [
  { group: 'shade', label: 'Shade & cooling', tools: ['tree', 'pergola', 'canopy', 'shelter', 'mist'] },
  { group: 'safety', label: 'Safety', tools: ['light', 'cctv', 'crossing'] },
  { group: 'flood', label: 'Flood', tools: ['drain'] },
]

export function itemsSummary(pl: Placement[]) {
  const counts = new Map<Tool, number>()
  for (const p of pl) counts.set(p.tool, (counts.get(p.tool) ?? 0) + 1)
  return [...counts]
    .map(([t, n]) => `${n} ${TOOL_INFO[t].short}${n > 1 && !TOOL_INFO[t].short.endsWith('s') ? 's' : ''}`)
    .join(' · ')
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
      const part = (m: number) => Math.min(1, m / e.len)
      switch (p.tool) {
        case 'tree':
          e.canopy = Math.min(0.95, e.canopy + part(11) * 0.85 * (1 - e.canopy))
          break
        case 'pergola':
          e.canopy = Math.min(0.95, e.canopy + part(20) * 0.7 * (1 - e.canopy))
          break
        case 'mist':
          // not shade, but cools a short stretch about as much as light shade does
          e.canopy = Math.min(0.95, e.canopy + part(15) * 0.45 * (1 - e.canopy))
          break
        case 'canopy':
          e.covered = Math.min(1, e.covered + part(50) * (1 - e.covered))
          e.flood = Math.min(e.flood, 0.5)
          break
        case 'shelter':
          e.covered = Math.min(1, e.covered + part(12) * (1 - e.covered))
          e.lit = Math.min(1, e.lit + part(12) * 0.5)
          break
        case 'light':
          e.lit = Math.min(1, e.lit + part(30) * 0.8)
          break
        case 'cctv':
          e.cctv = true
          e.lit = Math.min(1, e.lit + part(20) * 0.2)
          break
        case 'crossing':
          e.crossing = false
          break
        case 'drain':
          e.flood = Math.min(e.flood, 0.2)
          break
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
  let litBefore = 0
  let litAfter = 0
  let floodFixed = 0
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
      litBefore += e.lit * e.len
      litAfter += o.lit * e.len
      if (e.flood >= 0.72 && o.flood < 0.72) floodFixed += e.len
      if (sa - sb > 0.05 || o.lit - e.lit > 0.05 || o.flood < e.flood || o.cctv !== e.cctv || o.crossing !== e.crossing) walkers += e.footfall
    }
  }
  return {
    cost,
    before: before / total,
    after: after / total,
    localBefore: localLen ? localBefore / localLen : 0,
    localAfter: localLen ? localAfter / localLen : 0,
    localLen,
    litBefore: localLen ? litBefore / localLen : 0,
    litAfter: localLen ? litAfter / localLen : 0,
    floodFixed,
    edgesImproved: ov.size,
    walkers: Math.round(walkers / 3),
    counts: Object.fromEntries((Object.keys(TOOL_INFO) as Tool[]).map((t) => [t, placements.filter((p) => p.tool === t).length])) as Record<Tool, number>,
  }
}

/** The single most meaningful before → after for a set of placements. */
export function headline(tools: Tool[], im: ReturnType<typeof placementImpact>) {
  const groups = new Set(tools.map((t) => TOOL_INFO[t].group))
  if (groups.has('shade') || !tools.length)
    return { label: 'shade at 1pm', before: `${Math.round(im.localBefore * 100)}%`, after: `${Math.round(im.localAfter * 100)}%` }
  if (groups.has('safety'))
    return { label: 'lighting', before: `${Math.round(im.litBefore * 100)}%`, after: `${Math.round(im.litAfter * 100)}%` }
  return { label: 'flood-proofed', before: '0 m', after: `${Math.round(im.floodFixed)} m` }
}
