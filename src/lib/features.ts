import { majorNodes, protectionAt, town, type Conditions, type LngLat, type Route, type Step } from './engine'

export type BadgeKind =
  | 'canopy'
  | 'covered'
  | 'crossing'
  | 'crossing-avoided'
  | 'stairs-avoided'
  | 'step-free'
  | 'dark-avoided'
  | 'lit'

export interface Badge {
  id: string
  kind: BadgeKind
  at: LngLat
  title: string
  sub: string
}

const mid = (geom: LngLat[]) => geom[Math.floor(geom.length / 2)]

/** Consecutive steps sharing a surface, so one marker labels a whole stretch. */
function runs(steps: Step[], key: (s: Step) => string) {
  const out: { key: string; steps: Step[]; len: number }[] = []
  for (const s of steps) {
    const k = key(s)
    const last = out[out.length - 1]
    if (last && last.key === k) {
      last.steps.push(s)
      last.len += s.edge.len
    } else out.push({ key: k, steps: [s], len: s.edge.len })
  }
  return out
}

function runMid(steps: Step[]) {
  const total = steps.reduce((a, s) => a + s.edge.len, 0)
  let acc = 0
  for (const s of steps) {
    if (acc + s.edge.len >= total / 2) return mid(s.geom)
    acc += s.edge.len
  }
  return mid(steps[0].geom)
}

function crossingPoints(r: Route) {
  const pts = new Map<number, LngLat>()
  for (const { edge } of r.steps) {
    if (!edge.crossing) continue
    const n = majorNodes.has(edge.a) ? edge.a : edge.b
    pts.set(n, town.nodes[n])
  }
  return pts
}

export function routeBadges(short: Route | null, smart: Route | null, c: Conditions): Badge[] {
  if (!short?.found || !smart?.found) return []
  const out: Badge[] = []
  const smartIds = new Set(smart.steps.map((s) => s.edge.id))

  // what keeps you cool / dry on the ShadeSmart route
  if (!c.night) {
    const surf = runs(smart.steps, (s) => s.edge.surface)
    const canopy = c.weather === 'sunny'
      ? surf.filter((r) => r.key === 'canopy' && r.len >= 60).sort((a, b) => b.len - a.len).slice(0, 4)
      : []
    const covered = surf.filter((r) => r.key === 'covered' && r.len >= 40).sort((a, b) => b.len - a.len).slice(0, 3)
    canopy.forEach((r, i) =>
      out.push({
        id: `canopy${i}`,
        kind: 'canopy',
        at: runMid(r.steps),
        title: 'Tree canopy',
        sub: `${Math.round(r.len)} m · ${Math.round(protectionAt(r.steps[0].edge, c) * 100)}% shade right now`,
      }),
    )
    covered.forEach((r, i) =>
      out.push({
        id: `covered${i}`,
        kind: 'covered',
        at: runMid(r.steps),
        title: 'Covered walkway',
        sub: `${Math.round(r.len)} m · shophouse five-foot way`,
      }),
    )
  }

  // road crossings on your route, and the ones ShadeSmart skipped
  const smartX = crossingPoints(smart)
  for (const [n, at] of smartX)
    out.push({ id: `x${n}`, kind: 'crossing', at, title: 'Road crossing', sub: 'Zebra crossing · look both ways' })
  if (c.fewerCrossings) {
    for (const [n, at] of crossingPoints(short))
      if (!smartX.has(n))
        out.push({ id: `xa${n}`, kind: 'crossing-avoided', at, title: 'Crossing avoided', sub: 'Busy arterial road skipped' })
  }

  // accessibility
  if (c.wheelchair) {
    short.steps
      .filter((s) => s.edge.steps && !smartIds.has(s.edge.id))
      .slice(0, 4)
      .forEach((s) =>
        out.push({ id: `st${s.edge.id}`, kind: 'stairs-avoided', at: mid(s.geom), title: 'Stairs avoided', sub: 'Shortest path has steps here' }),
      )
    const free = runs(smart.steps, () => 'all')[0]
    out.push({
      id: 'stepfree',
      kind: 'step-free',
      at: runMid(free.steps),
      title: 'Step-free route',
      sub: 'Kerb ramps & paved paths all the way',
    })
  }

  // night: dark stretches the safe route walks around
  if (c.night) {
    runs(short.steps, (s) => (s.edge.lit < 0.4 && !smartIds.has(s.edge.id) ? 'dark' : 'ok'))
      .filter((r) => r.key === 'dark' && r.len >= 30)
      .sort((a, b) => b.len - a.len)
      .slice(0, 3)
      .forEach((r, i) =>
        out.push({ id: `dark${i}`, kind: 'dark-avoided', at: runMid(r.steps), title: 'Dark path avoided', sub: `${Math.round(r.len)} m with poor lighting` }),
      )
    const lit = runs(smart.steps, (s) => (s.edge.lit >= 0.85 ? 'lit' : 'no'))
      .filter((r) => r.key === 'lit' && r.len >= 80)
      .sort((a, b) => b.len - a.len)
      .slice(0, 2)
    lit.forEach((r, i) =>
      out.push({ id: `lit${i}`, kind: 'lit', at: runMid(r.steps), title: 'Well-lit corridor', sub: `${Math.round(r.len)} m · streetlights & CCTV` }),
    )
  }
  return out
}

export interface RouteTag {
  id: 'short' | 'smart'
  at: LngLat
  text: string
  sub: string
}

/** Where each route strays furthest from the other — the clearest spot to label it on the map. */
function farthestFrom(a: LngLat[], b: LngLat[]) {
  let best = a[Math.floor(a.length / 2)]
  let bestD = -1
  // skip the ends so labels don't sit on the start/finish pins
  for (let i = Math.floor(a.length * 0.15); i < Math.ceil(a.length * 0.85); i++) {
    let m = Infinity
    for (const q of b) m = Math.min(m, Math.hypot(a[i][0] - q[0], a[i][1] - q[1]))
    if (m > bestD) {
      bestD = m
      best = a[i]
    }
  }
  return best
}

export function routeTags(short: Route | null, smart: Route | null, shortCov: number, smartCov: number, c: Conditions): RouteTag[] {
  if (!short?.found || !smart?.found) return []
  const word = c.night ? 'lit' : c.weather === 'rainy' ? 'covered' : 'shade'
  return [
    { id: 'short', at: farthestFrom(short.coords, smart.coords), text: 'Shortest', sub: `${Math.round(shortCov * 100)}% ${word}` },
    { id: 'smart', at: farthestFrom(smart.coords, short.coords), text: 'ShadeSmart', sub: `${Math.round(smartCov * 100)}% ${word}` },
  ]
}
