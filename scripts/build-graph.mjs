// Builds a ShadeSmart walking graph for each city from raw OpenStreetMap extracts (data/osm/<city>).
// Street geometry is real (OSM, ODbL). Shade, cover, lighting, flood and footfall values are
// synthetic mock data generated from deterministic rules so the hackathon demo is reproducible.
//
//   node scripts/build-graph.mjs [cityId ...]
//     -> public/cities/<city>.json   (full graph, loaded on demand)
//     -> src/data/cities.json        (small manifest: names, bounds, places, demo scenarios)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { CITIES } from './cities.mjs'

// ---------- helpers ----------
const R = 6371000
const rad = (d) => (d * Math.PI) / 180
function dist(a, b) {
  const dLat = rad(b[1] - a[1])
  const dLon = rad(b[0] - a[0])
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}
const rnd = (key, lo, hi) => lo + hash(key) * (hi - lo)
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const round = (v, p = 3) => Math.round(v * 10 ** p) / 10 ** p
const ll = (p) => [round(p.lon, 6), round(p.lat, 6)]

function pointInPoly(pt, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function distToPoly(pt, poly) {
  if (pointInPoly(pt, poly)) return 0
  let best = Infinity
  for (const v of poly) best = Math.min(best, dist(pt, v))
  return best
}
const centroid = (coords) => [
  coords.reduce((s, c) => s + c[0], 0) / coords.length,
  coords.reduce((s, c) => s + c[1], 0) / coords.length,
]


// ---------- automatic places & demo trips for non-curated cities ----------
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

function kindOf(t) {
  if (t.railway === 'station' || t.public_transport === 'station' || t.highway === 'bus_stop' || t.amenity === 'bus_station') return 'transit'
  if (t.shop || t.amenity === 'marketplace' || t.amenity === 'food_court') return t.amenity === 'food_court' ? 'food' : 'shop'
  if (t.amenity === 'restaurant' || t.amenity === 'cafe') return 'food'
  if (t.leisure === 'park' || t.tourism === 'viewpoint') return 'park'
  if (t.building === 'apartments' || t.building === 'residential' || t.landuse === 'residential' || t.tourism === 'hotel') return 'home'
  return 'civic' // museums, attractions, worship, schools, hospitals, libraries
}
const KIND_QUOTA = { transit: 4, shop: 4, park: 3, home: 4, food: 3, civic: 4 }
const KIND_RANK = { attraction: 0, museum: 1, mall: 0, station: 0, park: 0 }

function autoPlaces(pois, edges, coordOf) {
  const nodes = [...new Set(edges.flatMap((e) => [e.a, e.b]))].map((id) => coordOf.get(id))
  const nearNetwork = (pt) => nodes.some((n) => dist(pt, n) < 80)
  const cands = []
  for (const p of pois) {
    const t = p.tags || {}
    const at = p.center ? [round(p.center.lon, 6), round(p.center.lat, 6)] : p.lon ? [round(p.lon, 6), round(p.lat, 6)] : null
    if (!at || !t.name || t.name.length > 40 || /[\u0E00-\u9FFF]/.test(t.name)) continue
    if (!/^[A-Z]/.test(t.name) || /^(opposite|bus to|opp\b)/i.test(t.name) || /^[A-Z]{2}\d+$/.test(t.name)) continue
    const kind = kindOf(t)
    let name = t.name.replace(/^([A-Z]{2}\d+[A-Z]?\s+)+/, '').replace(/^PY\d+\s+/, '')
    if ((t.railway === 'station' || t.public_transport === 'station') && !/station|stesen|sentral|terminal/i.test(name)) name += ' Station'
    if (name.length < 4) continue
    const sub = t.tourism || t.shop || t.railway || t.leisure || t.amenity || ''
    // prefer well-known, well-tagged places
    const score = (KIND_RANK[sub] ?? 3) - (t.wikidata ? 2 : 0) - (t['name:en'] ? 0.5 : 0) + (p.type === 'node' && t.highway === 'bus_stop' ? 1 : 0)
    cands.push({ name, kind, at, score })
  }
  cands.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
  const chosen = []
  const used = {}
  for (const c of cands) {
    if ((used[c.kind] ?? 0) >= KIND_QUOTA[c.kind]) continue
    if (chosen.some((x) => x.name === c.name || dist(x.at, c.at) < 110)) continue
    if (!nearNetwork(c.at)) continue
    chosen.push(c)
    used[c.kind] = (used[c.kind] ?? 0) + 1
    if (chosen.length >= 20) break
  }
  const ids = new Set()
  return chosen.map((c) => {
    let id = slug(c.name) || 'place'
    while (ids.has(id)) id += '-x'
    ids.add(id)
    return { id, name: c.name, kind: c.kind, at: c.at }
  })
}

function autoHeroes(places) {
  const from = ['home', 'transit', 'food', 'civic', 'shop', 'park']
  const pairs = []
  for (const a of places)
    for (const b of places) {
      if (a.id >= b.id && a.kind === b.kind) continue
      if (a.id === b.id) continue
      const d = dist(a.at, b.at)
      if (d < 550 || d > 1300) continue
      const pri = from.indexOf(a.kind) + (b.kind === 'shop' || b.kind === 'park' || b.kind === 'civic' ? 0 : 3) + Math.abs(d - 900) / 400
      pairs.push({ a: a.id, b: b.id, pri })
    }
  pairs.sort((x, y) => x.pri - y.pri)
  const out = []
  const usedPl = new Set()
  for (const p of pairs) {
    if (usedPl.has(p.a) && usedPl.has(p.b)) continue
    out.push([p.a, p.b])
    usedPl.add(p.a)
    usedPl.add(p.b)
    if (out.length >= 5) break
  }
  return out
}
function buildCity(city) {
const raw = JSON.parse(readFileSync(`data/osm/${city.id}/raw.json`, 'utf8')).elements
const pois = JSON.parse(readFileSync(`data/osm/${city.id}/pois.json`, 'utf8')).elements

// ---------- areas ----------
const parks = []
const water = []
const commercial = []
for (const e of raw) {
  const t = e.tags || {}
  if (!e.geometry || e.geometry.length < 4) continue
  const poly = e.geometry.map(ll)
  if (t.leisure === 'park' || t.landuse === 'grass') parks.push({ name: t.name || null, poly })
  else if (t.natural === 'water') water.push({ name: t.name || null, poly })
  else if (t.landuse === 'retail' || t.landuse === 'commercial') commercial.push({ name: t.name || null, poly })
}
if (city.id === 'elmina') {
  const mall = raw.find((e) => e.tags?.name === 'Elmina Lakeside Mall')
  commercial.push({ name: 'Elmina Lakeside Mall', poly: mall.geometry.map(ll) })
}

// ---------- walk graph ----------
const WALK = new Set([
  'footway', 'path', 'pedestrian', 'steps', 'residential', 'service', 'unclassified', 'primary', 'primary_link',
  'tertiary', 'secondary', 'secondary_link', 'tertiary_link', 'living_street', 'track',
])
const MAJOR = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'])
const ways = raw.filter(
  (e) => WALK.has(e.tags?.highway) && e.geometry && e.tags?.access !== 'private' && !['parking_aisle', 'driveway', 'drive-through'].includes(e.tags?.service),
)

const coordOf = new Map()
const useCount = new Map()
const majorNode = new Set()
for (const w of ways) {
  w.nodes.forEach((id, i) => {
    coordOf.set(id, ll(w.geometry[i]))
    useCount.set(id, (useCount.get(id) || 0) + (i === 0 || i === w.nodes.length - 1 ? 1 : 2))
    if (MAJOR.has(w.tags.highway)) majorNode.add(id)
  })
}

let edges = []
for (const w of ways) {
  let start = 0
  for (let i = 1; i < w.nodes.length; i++) {
    const isBreak = i === w.nodes.length - 1 || useCount.get(w.nodes[i]) > 2
    if (!isBreak) continue
    const ids = w.nodes.slice(start, i + 1)
    const geom = ids.map((id) => coordOf.get(id))
    let len = 0
    for (let k = 1; k < geom.length; k++) len += dist(geom[k - 1], geom[k])
    if (len > 0.5) edges.push({ way: w, a: ids[0], b: ids[ids.length - 1], geom, len })
    start = i
  }
}

// keep the largest connected component
const adj = new Map()
for (const e of edges) {
  if (!adj.has(e.a)) adj.set(e.a, [])
  if (!adj.has(e.b)) adj.set(e.b, [])
  adj.get(e.a).push(e.b)
  adj.get(e.b).push(e.a)
}
const seen = new Map()
let best = null
let bestSize = 0
for (const n of adj.keys()) {
  if (seen.has(n)) continue
  const stack = [n]
  seen.set(n, n)
  let size = 0
  while (stack.length) {
    const c = stack.pop()
    size++
    for (const m of adj.get(c)) if (!seen.has(m)) { seen.set(m, n); stack.push(m) }
  }
  if (size > bestSize) { bestSize = size; best = n }
}
edges = edges.filter((e) => seen.get(e.a) === best)

// ---------- places (origin / destination) ----------
const named = (name) => {
  const e = raw.find((x) => x.tags?.name === name && x.geometry)
  return e ? centroid(e.geometry.map(ll)) : null
}
const poiAt = (name) => {
  const p = pois.find((x) => x.tags?.name === name)
  return p ? [round(p.lon, 6), round(p.lat, 6)] : null
}
const ELMINA_PLACES = [
  { id: 'cendana', name: 'Pangsapuri Cendana', kind: 'home', at: poiAt('Pangsapuri Cendana') },
  { id: 'melati', name: 'Pangsapuri Melati', kind: 'home', at: named('Pangsapuri Melati') },
  { id: 'melor', name: 'Pangsapuri Melor', kind: 'home', at: named('Pangsapuri Melor') },
  { id: 'teratai', name: 'Pangsapuri Teratai', kind: 'home', at: named('Pangsapuri Teratai') },
  { id: 'kanopi', name: 'Kanopi Residences', kind: 'home', at: named('Kanopi Residences') },
  { id: 'valley1', name: 'Elmina Valley 1', kind: 'home', at: named('Elmina Valley 1') },
  { id: 'gardens', name: 'Elmina Gardens', kind: 'home', at: named('Elmina Gardens') },
  { id: 'mall', name: 'Elmina Lakeside Mall', kind: 'shop', at: named('Elmina Lakeside Mall') },
  { id: 'jaya', name: 'Jaya Grocer', kind: 'shop', at: poiAt('Jaya Grocer') },
  { id: 'kompleks', name: 'Tasik Elmina Shophouses', kind: 'shop', at: named('Kompleks Perniagaan Tasik Elmina') },
  { id: 'matahari', name: 'Pasar Raya Matahari', kind: 'shop', at: poiAt('Pasar Raya Borong Matahari') },
  { id: 'zus', name: 'ZUS Coffee', kind: 'food', at: poiAt('ZUS Coffee') },
  { id: 'kopitiam', name: 'Rich Kopitiam', kind: 'food', at: poiAt('Rich Kopitiam') },
  { id: 'centralpark', name: 'Elmina Valley Central Park', kind: 'park', at: named('Elmina Valley Central Park') },
  { id: 'urbanpark', name: 'Elmina Urban Park', kind: 'park', at: named('Elmina Urban Park') },
  { id: 'ecolake', name: 'Eco Lake Promenade', kind: 'park', at: named('Eco Lake') },
  { id: 'busstop', name: 'Bus Stop · Cendana', kind: 'transit', at: poiAt('Pangsapuri Cendana (Opp)') },
  { id: 'surau', name: 'Surau At Taqwa', kind: 'civic', at: named('Surau At Taqwa') },
  { id: 'surau2', name: 'Surau Melor', kind: 'civic', at: named('Surau Melor') },
  { id: 'childcare', name: 'Al-Hafiz Childcare', kind: 'civic', at: poiAt('Al-Hafiz Childcare Centre @ Elmina City') },
  { id: 'gym', name: 'Anytime Fitness', kind: 'civic', at: named('Anytime Fitness') },
  { id: 'gallery', name: 'Elmina Sales Gallery', kind: 'civic', at: named('Elmina Sales Gallery') },
].filter((p) => p.at)
const PLACES = city.id === 'elmina' ? ELMINA_PLACES : autoPlaces(pois, edges, coordOf)

const POI_WEIGHT = { home: 900, shop: 1400, food: 500, park: 700, transit: 1100, civic: 400 }

// ---------- per-edge mock attributes ----------
const graphNodes = new Set(edges.flatMap((e) => [e.a, e.b]))
const nearestNode = (pt) => {
  let bn = null
  let bd = Infinity
  for (const id of graphNodes) {
    const d = dist(pt, coordOf.get(id))
    if (d < bd) { bd = d; bn = id }
  }
  return bn
}

const treeLinedStreet = (name) => name && hash('tree:' + name) > 0.68

const out = edges.map((e, idx) => {
  const t = e.way.tags
  const hw = t.highway
  const mid = e.geom[Math.floor(e.geom.length / 2)]
  const key = `${e.way.id}:${idx}`
  const dPark = Math.min(...parks.map((p) => distToPoly(mid, p.poly)))
  const dWater = Math.min(...water.map((p) => distToPoly(mid, p.poly)))
  const dComm = Math.min(...commercial.map((p) => distToPoly(mid, p.poly)))
  const isFoot = ['footway', 'path', 'pedestrian', 'steps', 'track'].includes(hw)
  const isMajor = MAJOR.has(hw)

  let canopy = 0.25
  let covered = 0
  let bldg = 0.15
  let lit = 0.6
  let surface = 'open'

  if (isMajor) {
    canopy = rnd(key + 'c', 0.03, 0.16)
    bldg = rnd(key + 'b', 0.05, 0.2)
    lit = rnd(key + 'l', 0.88, 1)
  } else if (hw === 'residential' || hw === 'unclassified' || hw === 'living_street') {
    canopy = treeLinedStreet(t.name) ? rnd(key + 'c', 0.6, 0.85) : rnd(key + 'c', 0.02, 0.18)
    bldg = rnd(key + 'b', 0.1, 0.35)
    lit = rnd(key + 'l', 0.6, 0.9)
  } else if (hw === 'service') {
    canopy = rnd(key + 'c', 0.02, 0.15)
    bldg = rnd(key + 'b', 0.15, 0.4)
    lit = rnd(key + 'l', 0.4, 0.8)
  } else if (isFoot) {
    canopy = hash(key + 'fw') > 0.6 ? rnd(key + 'c', 0.55, 0.85) : rnd(key + 'c', 0.05, 0.3)
    bldg = rnd(key + 'b', 0.05, 0.2)
    lit = hw === 'path' || hw === 'track' ? rnd(key + 'l', 0.05, 0.25) : rnd(key + 'l', 0.35, 0.75)
  }
  if (dPark < 30 && !isMajor) {
    canopy = Math.max(canopy, rnd(key + 'p', 0.72, 0.95))
    lit = Math.min(lit, rnd(key + 'pl', 0.1, 0.4))
  }
  if (dComm < 40 && !isMajor) {
    covered = rnd(key + 'cv', 0.7, 1)
    lit = Math.max(lit, 0.9)
  } else if (dComm < 60 && isMajor) {
    covered = rnd(key + 'cv', 0.15, 0.35)
  }

  let flood = 0.05
  if (dWater < 70) flood = clamp(0.95 - dWater / 90 + rnd(key + 'f', -0.05, 0.1))
  if (isFoot && dWater < 110) flood = Math.max(flood, rnd(key + 'ff', 0.55, 0.8))
  if (isMajor || covered > 0.5) flood = Math.min(flood, 0.25)

  if (covered > 0.5) surface = 'covered'
  else if (canopy >= 0.55) surface = 'canopy'
  else if (bldg >= 0.3 && canopy >= 0.2) surface = 'building'

  let footfall = 40
  for (const p of PLACES) footfall += POI_WEIGHT[p.kind] * Math.exp(-dist(mid, p.at) / 260)
  footfall *= isMajor ? 1.15 : isFoot ? 0.85 : 0.7
  footfall *= rnd(key + 'ft', 0.8, 1.2)

  const cctv = (covered > 0.5 || isMajor) && hash(key + 'cam') > 0.45
  // stairs / kerb drops on some footpaths (mock) — what wheelchair mode routes around
  const steps = hw === 'steps' || (isFoot && hw !== 'track' && e.len < 90 && hash(key + 'st') > 0.86)
  const wheelchair = !steps && hw !== 'track' && !(hw === 'path' && hash(key + 'wc') > 0.4)
  const crossing = majorNode.has(e.a) && !isMajor ? e.a : majorNode.has(e.b) && !isMajor ? e.b : null

  return {
    id: idx,
    a: e.a,
    b: e.b,
    len: round(e.len, 1),
    geom: e.geom,
    hw,
    name: t.name || null,
    wayId: e.way.id,
    surface,
    canopy: round(canopy, 2),
    covered: round(covered, 2),
    bldg: round(bldg, 2),
    lit: round(lit, 2),
    flood: round(flood, 2),
    cctv,
    wheelchair,
    steps,
    crossing: crossing !== null,
    footfall: Math.round(footfall),
  }
})

// ---------- curated green connectors ----------
// Random attributes alone don't produce coherent corridors, so for a few hero trips we take the
// plain shortest path and its nearest alternative, then make the alternative a tree-lined connector
// and leave the shortest path as bare arterial asphalt — mirroring how real townships look.
function shortestPath(from, to, costFn) {
  const adjE = new Map()
  for (const e of out) {
    if (!adjE.has(e.a)) adjE.set(e.a, [])
    if (!adjE.has(e.b)) adjE.set(e.b, [])
    adjE.get(e.a).push([e.b, e])
    adjE.get(e.b).push([e.a, e])
  }
  const d = new Map([[from, 0]])
  const prev = new Map()
  const done = new Set()
  const queue = [[0, from]]
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0])
    const [du, u] = queue.shift()
    if (done.has(u)) continue
    done.add(u)
    if (u === to) break
    for (const [v, e] of adjE.get(u)) {
      const nd = du + costFn(e)
      if (nd < (d.get(v) ?? Infinity)) { d.set(v, nd); prev.set(v, [u, e]); queue.push([nd, v]) }
    }
  }
  const path = []
  let cur = to
  while (cur !== from) { const [p, e] = prev.get(cur); path.unshift(e); cur = p }
  return path
}
const placeNode = (id) => nearestNode(PLACES.find((p) => p.id === id).at)
const HERO =
  city.id === 'elmina'
    ? [['cendana', 'mall'], ['melor', 'ecolake'], ['teratai', 'kompleks'], ['melati', 'jaya'], ['kanopi', 'centralpark']]
    : autoHeroes(PLACES)
const greened = new Set()
for (const [a, b] of HERO) {
  const S = shortestPath(placeNode(a), placeNode(b), (e) => e.len)
  const sIds = new Set(S.map((e) => e.id))
  const A = shortestPath(placeNode(a), placeNode(b), (e) => e.len * (sIds.has(e.id) ? 1.9 : 1))
  const aIds = new Set(A.map((e) => e.id))
  for (const e of S) {
    if (aIds.has(e.id) || greened.has(e.id) || e.covered > 0.5) continue
    e.canopy = round(rnd(e.id + 'S', 0.02, 0.1), 2)
    e.bldg = round(rnd(e.id + 'Sb', 0.05, 0.15), 2)
    e.surface = 'open'
  }
  for (const e of A) {
    if (sIds.has(e.id) || e.covered > 0.5) continue
    greened.add(e.id)
    e.canopy = round(rnd(e.id + 'A', 0.78, 0.94), 2)
    e.surface = 'canopy'
    if (!MAJOR.has(e.hw)) e.lit = round(Math.min(e.lit, rnd(e.id + 'Al', 0.15, 0.4)), 2)
    if (e.flood >= 0.72 && !MAJOR.has(e.hw)) e.flood = round(rnd(e.id + 'Af', 0.3, 0.6), 2)
  }
}

// make sure the hero shaded routes include a flight of stairs, so wheelchair mode visibly reroutes
for (const [a, b] of [HERO[0], HERO[HERO.length - 1]]) {
  const S = shortestPath(placeNode(a), placeNode(b), (e) => e.len)
  const sIds = new Set(S.map((e) => e.id))
  const A = shortestPath(placeNode(a), placeNode(b), (e) => e.len * (sIds.has(e.id) ? 1.9 : 1))
  const cand = A.filter((e) => !sIds.has(e.id) && !MAJOR.has(e.hw) && e.len > 12 && e.len < 120)
  const pick = cand[Math.floor(cand.length / 2)]
  if (pick) { pick.steps = true; pick.wheelchair = false }
}

if (city.id !== 'elmina' && HERO.length >= 3) {
  const [ra, rb] = HERO[1]
  const S = shortestPath(placeNode(ra), placeNode(rb), (e) => e.len)
  const sIds = new Set(S.map((e) => e.id))
  const A = shortestPath(placeNode(ra), placeNode(rb), (e) => e.len * (sIds.has(e.id) ? 1.9 : 1))
  const aIds = new Set(A.map((e) => e.id))
  const only = S.filter((e) => !aIds.has(e.id))
  only.slice(Math.floor(only.length / 3), Math.floor(only.length / 3) + 2).forEach((e) => (e.flood = 0.88))
  const [na, nb] = HERO[2]
  const S2 = shortestPath(placeNode(na), placeNode(nb), (e) => e.len)
  for (const e of S2) if (!MAJOR.has(e.hw)) e.lit = round(rnd(e.id + 'dk', 0.08, 0.3), 2)
}

// ---------- safety infrastructure ----------
const guardPosts = (
  city.id === 'elmina'
    ? [
        { name: 'Guard Post · Lakeside Mall', at: named('Elmina Lakeside Mall') },
        { name: 'Guard Post · Central Park', at: named('Elmina Valley Central Park') },
        { name: 'Guard House · Cendana', at: poiAt('Pangsapuri Cendana') },
        { name: 'Auxiliary Police · Persiaran Elmina', at: named('Elmina Sales Gallery') },
        { name: 'Guard House · Kanopi', at: named('Kanopi Residences') },
      ]
    : PLACES.filter((p) => ['shop', 'transit', 'park'].includes(p.kind))
        .slice(0, 5)
        .map((p, i) => ({ name: `${i % 2 ? 'Police Beat Base' : 'Guard Post'} · ${p.name}`, at: p.at }))
)
  .filter((g) => g.at)
.map((g, i) => ({ id: `gp${i}`, ...g, node: nearestNode(g.at) }))

const streetlights = []
const cctvs = []
for (const e of out) {
  if (e.lit >= 0.7) {
    const step = 45
    let acc = 0
    for (let k = 1; k < e.geom.length; k++) {
      acc += dist(e.geom[k - 1], e.geom[k])
      if (acc >= step) { streetlights.push(e.geom[k]); acc = 0 }
    }
    if (e.len > 60 && streetlights.length % 2 === 0) streetlights.push(e.geom[Math.floor(e.geom.length / 2)])
  }
  if (e.cctv) cctvs.push(e.geom[Math.floor(e.geom.length / 2)])
}

// ---------- corridors (planner-level segments) ----------
const landmarks = PLACES.map((p) => ({ name: p.name, at: p.at }))
const nearestLandmark = (pt) => landmarks.reduce((b, l) => (dist(pt, l.at) < dist(pt, b.at) ? l : b)).name
const groups = new Map()
for (const e of out) {
  const key = e.name ? `n:${e.name}` : `w:${e.wayId}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(e)
}
const KIND_LABEL = { footway: 'Footpath', path: 'Park trail', pedestrian: 'Pedestrian plaza', steps: 'Stairway', service: 'Service lane', track: 'Trail' }
let corridors = []
const SEGMENT = 320
const segName = (i) => `Segment ${String.fromCharCode(65 + i)}`
for (const [key, es] of groups) {
  const len = es.reduce((s, e) => s + e.len, 0)
  if (len < 90) continue
  // order along the corridor's dominant axis, then cut into ~320 m planning segments
  const mids = es.map((e) => e.geom[Math.floor(e.geom.length / 2)])
  const lonSpan = Math.max(...mids.map((m) => m[0])) - Math.min(...mids.map((m) => m[0]))
  const latSpan = Math.max(...mids.map((m) => m[1])) - Math.min(...mids.map((m) => m[1]))
  const axis = lonSpan > latSpan ? 0 : 1
  const ordered = es.map((e, i) => ({ e, k: mids[i][axis] })).sort((x, y) => x.k - y.k).map((x) => x.e)
  const chunks = [[]]
  let acc = 0
  for (const e of ordered) {
    if (acc >= SEGMENT) { chunks.push([]); acc = 0 }
    chunks[chunks.length - 1].push(e)
    acc += e.len
  }
  if (chunks.length > 1 && acc < 120) chunks[chunks.length - 2].push(...chunks.pop())
  chunks.forEach((ch, i) => {
    const mid = ch[Math.floor(ch.length / 2)].geom[0]
    const base = es[0].name || `${KIND_LABEL[es[0].hw] || 'Lane'} near ${nearestLandmark(mid)}`
    const name = chunks.length > 1 ? `${base} · ${segName(i)}` : base
    corridors.push({ key: `${key}:${i}`, name, edges: ch.map((e) => e.id), len: Math.round(ch.reduce((s, e) => s + e.len, 0)) })
  })
}
// disambiguate duplicate names
const nameCount = {}
for (const c of corridors) nameCount[c.name] = (nameCount[c.name] || 0) + 1
const nameSeen = {}
for (const c of corridors) {
  if (nameCount[c.name] > 1) {
    nameSeen[c.name] = (nameSeen[c.name] || 0) + 1
    c.name = `${c.name} ${String.fromCharCode(64 + nameSeen[c.name])}`
  }
}
corridors = corridors.map((c, i) => ({ id: `c${i}`, ...c }))

// ---------- nodes ----------
const usedNodes = [...new Set(out.flatMap((e) => [e.a, e.b]))]
const nodeIndex = new Map(usedNodes.map((id, i) => [id, i]))
const nodes = usedNodes.map((id) => coordOf.get(id))
for (const e of out) { e.a = nodeIndex.get(e.a); e.b = nodeIndex.get(e.b); delete e.wayId }
for (const g of guardPosts) g.node = nodeIndex.get(g.node)
const places = PLACES.map((p) => ({ ...p, node: nodeIndex.get(nearestNode(p.at)) }))

const bounds = nodes.reduce(
  (b, c) => [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])],
  [Infinity, Infinity, -Infinity, -Infinity],
)

const data = {
  meta: {
    id: city.id,
    township: city.name,
    city: city.area,
    source: 'Street geometry © OpenStreetMap contributors (ODbL). Shade, lighting, flood and footfall values are synthetic demo data.',
    bounds,
  },
  nodes,
  edges: out,
  places,
  guardPosts,
  streetlights,
  cctvs,
  corridors,
  areas: {
    parks: parks.map((p) => p.poly),
    water: water.map((p) => ({ name: p.name, poly: p.poly })),
  },
}
mkdirSync('public/cities', { recursive: true })
writeFileSync(`public/cities/${city.id}.json`, JSON.stringify(data))
const total = out.reduce((s, e) => s + e.len, 0)
console.log(`${city.id.padEnd(11)} nodes ${nodes.length}  edges ${out.length}  ${(total / 1000).toFixed(1)} km  places ${places.length}  heroes ${HERO.length}`)
const pid = (id) => places.find((p) => p.id === id)
const scen = (pair) => pair && pid(pair[0]) && pid(pair[1]) && { origin: pair[0], dest: pair[1] }
const scenarios =
  city.id === 'elmina'
    ? { heat: { origin: 'cendana', dest: 'mall' }, rain: { origin: 'kanopi', dest: 'centralpark' }, night: { origin: 'cendana', dest: 'centralpark' } }
    : { heat: scen(HERO[0]), rain: scen(HERO[1] ?? HERO[0]), night: scen(HERO[2] ?? HERO[0]) }
return {
  id: city.id,
  name: city.name,
  area: city.area,
  bounds,
  places: places.map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
  scenarios,
}
}

const only = process.argv.slice(2)
const manifestPath = 'src/data/cities.json'
const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : []
const manifest = []
for (const c of CITIES) {
  if (!existsSync(`data/osm/${c.id}/pois.json`)) continue
  if (only.length && !only.includes(c.id)) {
    const old = prev.find((x) => x.id === c.id)
    if (old) manifest.push(old)
    continue
  }
  manifest.push(buildCity(c))
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
