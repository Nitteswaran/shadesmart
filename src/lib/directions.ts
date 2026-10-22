import { protectionAt, type Conditions, type LngLat, type Route, type Surface } from './engine'

export type Turn = 'start' | 'straight' | 'slight-left' | 'slight-right' | 'left' | 'right' | 'sharp-left' | 'sharp-right' | 'arrive'

export interface Direction {
  turn: Turn
  name: string | null
  len: number
  surface: Surface
  cov: number
}

const rad = (d: number) => (d * Math.PI) / 180

function metres(a: LngLat, b: LngLat) {
  return Math.hypot(rad(b[0] - a[0]) * Math.cos(rad(a[1])), rad(b[1] - a[1])) * 6371000
}

function bearing(a: LngLat, b: LngLat) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return (Math.atan2(y, x) * 180) / Math.PI
}

/** Point roughly `dist` metres along `pts`, so bearings ignore tiny kinks at junctions. */
function pointAlong(pts: LngLat[], dist: number) {
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    acc += metres(pts[i - 1], pts[i])
    if (acc >= dist) return pts[i]
  }
  return pts[pts.length - 1]
}

function classify(delta: number): Turn {
  const a = Math.abs(delta)
  if (a < 28) return 'straight'
  const side = delta < 0 ? 'left' : 'right'
  if (a < 60) return `slight-${side}` as Turn
  if (a < 140) return side
  return `sharp-${side}` as Turn
}

/** Group a route into named stretches and work out the turn at the start of each one. */
export function buildDirections(r: Route | null, c: Conditions): Direction[] {
  if (!r?.found || !r.steps.length) return []
  type Seg = { key: string; name: string | null; coords: LngLat[]; len: number; bySurface: Record<Surface, number>; cov: number }
  const segs: Seg[] = []
  for (const s of r.steps) {
    const e = s.edge
    const key = e.name ?? `~${e.surface}`
    const last = segs[segs.length - 1]
    const cov = protectionAt(e, c)
    if (last && (last.key === key || e.len < 20)) {
      last.cov = (last.cov * last.len + cov * e.len) / (last.len + e.len)
      last.len += e.len
      last.coords.push(...s.geom.slice(1))
      last.bySurface[e.surface] += e.len
    } else {
      const bySurface = { open: 0, covered: 0, canopy: 0, building: 0 }
      bySurface[e.surface] = e.len
      segs.push({ key, name: e.name, coords: [...s.geom], len: e.len, bySurface, cov })
    }
  }
  // fold short unnamed connectors into the stretch before them
  const merged: Seg[] = []
  for (const s of segs) {
    const prev = merged[merged.length - 1]
    if (prev && s.len < 30 && !s.name) {
      prev.cov = (prev.cov * prev.len + s.cov * s.len) / (prev.len + s.len)
      prev.len += s.len
      prev.coords.push(...s.coords.slice(1))
      for (const k of Object.keys(s.bySurface) as Surface[]) prev.bySurface[k] += s.bySurface[k]
    } else merged.push(s)
  }

  const out: Direction[] = merged.map((s, i) => {
    let turn: Turn = 'start'
    if (i > 0) {
      const prev = merged[i - 1].coords
      const back = pointAlong([...prev].reverse(), 18)
      const pivot = prev[prev.length - 1]
      const ahead = pointAlong(s.coords, 18)
      let delta = bearing(pivot, ahead) - bearing(back, pivot)
      delta = ((delta + 540) % 360) - 180
      turn = classify(delta)
    }
    const surface = (Object.entries(s.bySurface) as [Surface, number][]).sort((a, b) => b[1] - a[1])[0][0]
    return { turn, name: s.name, len: s.len, surface, cov: s.cov }
  })
  out.push({ turn: 'arrive', name: null, len: 0, surface: out[out.length - 1].surface, cov: 1 })
  return out
}
