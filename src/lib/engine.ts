
export type LngLat = [number, number]
export type Surface = 'open' | 'covered' | 'canopy' | 'building'
export type PlaceKind = 'home' | 'shop' | 'food' | 'park' | 'transit' | 'civic'

export interface Edge {
  id: number
  a: number
  b: number
  len: number
  geom: LngLat[]
  hw: string
  name: string | null
  surface: Surface
  canopy: number
  covered: number
  bldg: number
  lit: number
  flood: number
  cctv: boolean
  wheelchair: boolean
  steps: boolean
  crossing: boolean
  footfall: number
}

export interface Place {
  id: string
  name: string
  kind: PlaceKind
  at: LngLat
  node: number
}

export interface Corridor {
  id: string
  key: string
  name: string
  edges: number[]
  len: number
}

export interface Township {
  meta: { id: string; township: string; city: string; source: string; bounds: [number, number, number, number] }
  nodes: LngLat[]
  edges: Edge[]
  places: Place[]
  guardPosts: { id: string; name: string; at: LngLat; node: number }[]
  streetlights: LngLat[]
  cctvs: LngLat[]
  corridors: Corridor[]
  areas: { parks: LngLat[][]; water: { name: string | null; poly: LngLat[] }[] }
}

/** The city currently loaded. Swapped by setTown() when the user switches city. */
export let town: Township

export function setTown(t: Township) {
  town = t
  majorNodes.clear()
  for (const e of t.edges) {
    if (MAJOR_HW.has(e.hw)) {
      majorNodes.add(e.a)
      majorNodes.add(e.b)
    }
  }
  adjacency = t.nodes.map(() => [])
  for (const e of t.edges) {
    adjacency[e.a].push({ to: e.b, edge: e })
    adjacency[e.b].push({ to: e.a, edge: e })
  }
}

/** Who receives proposals and SOS alerts in each city. */
const AUTHORITIES: Record<string, { short: string; office: string; police: string }> = {
  elmina: { short: 'Sime Darby', office: 'Sime Darby Property · Elmina Township Office', police: 'Sime Darby Auxiliary Police' },
  kl: { short: 'DBKL', office: 'Dewan Bandaraya Kuala Lumpur', police: 'PDRM Dang Wangi' },
  georgetown: { short: 'MBPP', office: 'Majlis Bandaraya Pulau Pinang', police: 'PDRM Georgetown' },
  ipoh: { short: 'MBI', office: 'Majlis Bandaraya Ipoh', police: 'PDRM Ipoh' },
  jb: { short: 'MBJB', office: 'Majlis Bandaraya Johor Bahru', police: 'PDRM Johor Bahru Selatan' },
  melaka: { short: 'MBMB', office: 'Majlis Bandaraya Melaka Bersejarah', police: 'PDRM Melaka Tengah' },
  putrajaya: { short: 'PPj', office: 'Perbadanan Putrajaya', police: 'PDRM Putrajaya' },
  kk: { short: 'DBKK', office: 'Dewan Bandaraya Kota Kinabalu', police: 'PDRM Kota Kinabalu' },
  kuching: { short: 'DBKU', office: 'Dewan Bandaraya Kuching Utara', police: 'PDRM Kuching' },
}
export const authority = () => AUTHORITIES[town.meta.id] ?? AUTHORITIES.elmina

export type Weather = 'sunny' | 'rainy'

export interface Conditions {
  weather: Weather
  night: boolean
  hour: number // 7 – 19, decimal
  shadeWeight: number // 1 – 5
  wheelchair: boolean
  fewerCrossings: boolean
}

export const FLOOD_BLOCK = 0.72
export const WALK_SPEED = 78 // metres / minute
const PENALTY = 1.5

/** 0 at solar noon (sun overhead, buildings cast almost no shadow) → 1 at sunrise / sunset. */
export function sunLowness(hour: number) {
  const t = Math.min(1, Math.abs(hour - 13.2) / 6.2)
  return t * t
}

/** Ambient air temperature for a hot Klang Valley afternoon. */
export function airTemp(hour: number, weather: Weather, night = false) {
  if (night) return weather === 'rainy' ? 24 : 27
  const base = 25.5 + 7.5 * Math.max(0, Math.sin(((hour - 7.5) / 12) * Math.PI)) ** 1.3
  return weather === 'rainy' ? base - 5.5 : base
}

export function uvIndex(hour: number, weather: Weather, night = false) {
  if (night) return 0
  const uv = 12 * Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI)) ** 1.6
  return Math.round(weather === 'rainy' ? uv * 0.3 : uv)
}

/** Fraction of an edge sheltered from direct sun at a given hour. */
export function shadeAt(e: Edge, hour: number) {
  const bldgEff = e.bldg * (0.2 + 0.8 * sunLowness(hour))
  const open = (1 - 0.92 * e.canopy) * (1 - bldgEff)
  return e.covered + (1 - e.covered) * (1 - open)
}

/** Fraction of an edge sheltered from rain — only roofs count, trees barely help. */
export function rainCover(e: Edge) {
  return e.covered + (1 - e.covered) * e.canopy * 0.22
}

export function protectionAt(e: Edge, c: Conditions) {
  if (c.night) return e.lit
  return c.weather === 'rainy' ? rainCover(e) : shadeAt(e, c.hour)
}

export function edgeCost(e: Edge, c: Conditions): number {
  if (c.wheelchair && !e.wheelchair) return Infinity
  if (c.weather === 'rainy' && e.flood >= FLOOD_BLOCK) return Infinity
  const w = c.shadeWeight
  let cost: number
  if (c.night) {
    // CPTED: prefer lit, watched corridors over dark shortcuts
    cost = e.len * (1 + (1 - e.lit) * 1.2 * w + (e.cctv ? 0 : 0.15 * w))
    if (c.weather === 'rainy') cost *= 1 + (1 - rainCover(e)) * 0.4
  } else {
    // HeatCost = distance × (1 + (1 − coverage) × (weight − 1) × 1.5)
    cost = e.len * (1 + (1 - protectionAt(e, c)) * (w - 1) * PENALTY)
  }
  if (c.fewerCrossings && e.crossing) cost += 140
  return cost
}

// ---------- graph ----------
const MAJOR_HW = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'])
/** Nodes that sit on an arterial road — where a footpath meets one, the walker has to cross. */
export const majorNodes = new Set<number>()
let adjacency: { to: number; edge: Edge }[][] = []

export interface Step {
  edge: Edge
  geom: LngLat[] // oriented in walking direction
}

export interface Route {
  steps: Step[]
  coords: LngLat[]
  found: boolean
}

class Heap {
  private items: [number, number][] = []
  get size() {
    return this.items.length
  }
  push(n: number, p: number) {
    const a = this.items
    a.push([n, p])
    let i = a.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (a[parent][1] <= a[i][1]) break
      ;[a[parent], a[i]] = [a[i], a[parent]]
      i = parent
    }
  }
  pop(): [number, number] {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][1] < a[m][1]) m = l
        if (r < a.length && a[r][1] < a[m][1]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

export function dijkstra(from: number, to: number, cost: (e: Edge) => number): Route {
  const n = town.nodes.length
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const prevEdge: (Edge | null)[] = new Array(n).fill(null)
  dist[from] = 0
  const heap = new Heap()
  heap.push(from, 0)
  while (heap.size) {
    const [u, d] = heap.pop()
    if (d > dist[u]) continue
    if (u === to) break
    for (const { to: v, edge } of adjacency[u]) {
      const c = cost(edge)
      if (!Number.isFinite(c)) continue
      const nd = d + c
      if (nd < dist[v]) {
        dist[v] = nd
        prev[v] = u
        prevEdge[v] = edge
        heap.push(v, nd)
      }
    }
  }
  if (!Number.isFinite(dist[to])) return { steps: [], coords: [], found: false }
  const steps: Step[] = []
  let cur = to
  while (cur !== from) {
    const e = prevEdge[cur]!
    const p = prev[cur]
    const geom = e.a === p ? e.geom : [...e.geom].reverse()
    steps.unshift({ edge: e, geom })
    cur = p
  }
  const coords: LngLat[] = []
  for (const s of steps) coords.push(...(coords.length ? s.geom.slice(1) : s.geom))
  return { steps, coords, found: true }
}

export interface RouteStats {
  distance: number
  minutes: number
  coverage: number // shade (day), rain cover (rain), lighting (night) — 0..1
  shade: number
  rainCover: number
  lit: number
  crossings: number
  floodSegments: Edge[]
  exposedMinutes: number
  feelsLike: number
  surface: Record<Surface, number>
  cctvCoverage: number
}

/** Optional what-if edits from the planner, keyed by edge id. */
export type EdgeOverrides = Map<number, Edge>

export function routeStats(r: Route, c: Conditions, ov?: EdgeOverrides): RouteStats {
  const surface: Record<Surface, number> = { open: 0, covered: 0, canopy: 0, building: 0 }
  let distance = 0
  let shade = 0
  let cover = 0
  let lit = 0
  let crossings = 0
  let cctv = 0
  const floodSegments: Edge[] = []
  for (const { edge: base } of r.steps) {
    const e = ov?.get(base.id) ?? base
    distance += e.len
    shade += shadeAt(e, c.hour) * e.len
    cover += rainCover(e) * e.len
    lit += e.lit * e.len
    if (e.cctv) cctv += e.len
    if (e.crossing) crossings++
    if (e.flood >= FLOOD_BLOCK) floodSegments.push(e)
    surface[e.surface] += e.len
  }
  const d = distance || 1
  const shadeF = shade / d
  const coverF = cover / d
  const litF = lit / d
  const coverage = c.night ? litF : c.weather === 'rainy' ? coverF : shadeF
  const speed = c.wheelchair ? WALK_SPEED * 0.85 : WALK_SPEED
  const minutes = distance / speed
  const air = airTemp(c.hour, c.weather, c.night)
  const sunGain = c.night || c.weather === 'rainy' ? 0 : 9 * (1 - shadeF) * (uvIndex(c.hour, c.weather) / 12)
  return {
    distance,
    minutes,
    coverage,
    shade: shadeF,
    rainCover: coverF,
    lit: litF,
    crossings,
    floodSegments,
    exposedMinutes: minutes * (1 - coverage),
    feelsLike: air + sunGain,
    surface,
    cctvCoverage: cctv / d,
  }
}

/** Coverage profile sampled along the route, for the exposure chart. */
export function routeProfile(r: Route, c: Conditions, samples = 48, ov?: EdgeOverrides) {
  const total = r.steps.reduce((s, x) => s + x.edge.len, 0)
  if (!total) return []
  const out: { d: number; v: number }[] = []
  let acc = 0
  let i = 0
  for (let k = 0; k <= samples; k++) {
    const target = (k / samples) * total
    while (i < r.steps.length - 1 && acc + r.steps[i].edge.len < target) {
      acc += r.steps[i].edge.len
      i++
    }
    out.push({ d: Math.round(target), v: Math.round(protectionAt(ov?.get(r.steps[i].edge.id) ?? r.steps[i].edge, c) * 100) })
  }
  return out
}

export function placeById(id: string) {
  return town.places.find((p) => p.id === id)!
}
