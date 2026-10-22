import { FLOOD_BLOCK, shadeAt, town, type Corridor, type Edge } from './engine'

export const HOURS = Array.from({ length: 13 }, (_, i) => 7 + i) // 07:00 – 19:00
export const PEAK = 13

/** Share of daily pedestrians walking in each hour (mock township counter profile). */
export const FOOTFALL_PROFILE: Record<number, number> = {
  7: 0.08, 8: 0.11, 9: 0.06, 10: 0.05, 11: 0.06, 12: 0.09, 13: 0.09, 14: 0.06, 15: 0.06, 16: 0.08, 17: 0.1, 18: 0.1, 19: 0.06,
}

const edgeById = new Map(town.edges.map((e) => [e.id, e]))
export const edgesOf = (c: Corridor) => c.edges.map((id) => edgeById.get(id)!)

const weighted = (es: Edge[], f: (e: Edge) => number) => {
  const total = es.reduce((s, e) => s + e.len, 0) || 1
  return es.reduce((s, e) => s + f(e) * e.len, 0) / total
}

export interface CorridorStats {
  corridor: Corridor
  shade: number // at selected hour
  peakShade: number
  hourly: { hour: number; shade: number; footfall: number }[]
  footfall: number // pedestrians per day
  lit: number
  flood: number
  floodProne: boolean
  canopy: number
  covered: number
  walkability: number
  exposureMinutes: number // person-minutes in direct sun per day
  priority: number
}

export function walkability(peakShade: number, lit: number, flood: number) {
  return Math.round(100 * (0.6 * peakShade + 0.25 * lit + 0.15 * (1 - flood)))
}

export function corridorStats(c: Corridor, hour: number): CorridorStats {
  const es = edgesOf(c)
  const footfall = Math.round(weighted(es, (e) => e.footfall))
  const peakShade = weighted(es, (e) => shadeAt(e, PEAK))
  const lit = weighted(es, (e) => e.lit)
  const flood = Math.max(...es.map((e) => e.flood))
  const hourly = HOURS.map((h) => ({
    hour: h,
    shade: Math.round(weighted(es, (e) => shadeAt(e, h)) * 100),
    footfall: Math.round(footfall * FOOTFALL_PROFILE[h]),
  }))
  const walkMin = c.len / 78
  const exposureMinutes = Math.round(footfall * walkMin * (1 - peakShade) * 0.55)
  return {
    corridor: c,
    shade: weighted(es, (e) => shadeAt(e, hour)),
    peakShade,
    hourly,
    footfall,
    lit,
    flood,
    floodProne: flood >= FLOOD_BLOCK,
    canopy: weighted(es, (e) => e.canopy),
    covered: weighted(es, (e) => e.covered),
    walkability: walkability(peakShade, lit, flood),
    exposureMinutes,
    priority: footfall * (1 - peakShade) * Math.sqrt(c.len),
  }
}

export function allCorridorStats(hour: number) {
  return town.corridors.map((c) => corridorStats(c, hour))
}

export function networkShade(hour: number) {
  return weighted(town.edges, (e) => shadeAt(e, hour))
}

export function networkHourly() {
  return HOURS.map((h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    shade: Math.round(networkShade(h) * 100),
    pedestrians: Math.round(town.edges.reduce((s, e) => s + e.footfall * e.len, 0) / 3800 * FOOTFALL_PROFILE[h]),
  }))
}

export function surfaceMix() {
  const out = { open: 0, canopy: 0, covered: 0, building: 0 }
  for (const e of town.edges) out[e.surface] += e.len
  return out
}

// ---------- interventions ----------

export interface Intervention {
  trees: number
  canopyMeters: number
  lights: number
}

export const COST = { tree: 1850, canopyPerMeter: 1450, light: 3200 }

export function interventionCost(i: Intervention) {
  return i.trees * COST.tree + i.canopyMeters * COST.canopyPerMeter + i.lights * COST.light
}

export function simulate(s: CorridorStats, i: Intervention) {
  const len = s.corridor.len
  // each mature rain tree shades ~11 m of footpath; a canopy walkway covers what it spans
  const treeCover = Math.min(1, (i.trees * 11) / len)
  const roofCover = Math.min(1, i.canopyMeters / len)
  const covered = Math.min(1, s.covered + roofCover * (1 - s.covered))
  const canopy = Math.min(0.95, s.canopy + treeCover * 0.85 * (1 - s.canopy))
  const open = (1 - 0.92 * canopy) * 0.95
  const peakAfter = Math.min(1, Math.max(s.peakShade, covered + (1 - covered) * (1 - open)))
  const litAfter = Math.min(1, s.lit + (i.lights * 30) / len)
  const floodAfter = roofCover > 0.5 ? Math.min(s.flood, 0.5) : s.flood
  const wAfter = walkability(peakAfter, litAfter, floodAfter)
  const cost = interventionCost(i)
  const extraWalkers = Math.round(s.footfall * (peakAfter - s.peakShade) * 0.6)
  const exposureSaved = Math.round(s.exposureMinutes - s.exposureMinutes * ((1 - peakAfter) / Math.max(0.01, 1 - s.peakShade)))
  return {
    peakAfter,
    litAfter,
    walkabilityAfter: wAfter,
    uplift: s.walkability ? (wAfter - s.walkability) / s.walkability : 0,
    cost,
    residents: s.footfall,
    extraWalkers,
    exposureSaved,
    costPerResident: s.footfall ? cost / s.footfall : 0,
  }
}

/** A sensible default package, used for "Recommended" in the planner. */
export function recommend(s: CorridorStats): Intervention {
  const gap = Math.max(0, 0.75 - s.peakShade)
  const trees = Math.round((gap * s.corridor.len) / 11 / 0.85 / 5) * 5
  const canopyMeters = s.footfall > 900 ? Math.round(Math.min(s.corridor.len * 0.3, 80) / 10) * 10 : 0
  const lights = s.lit < 0.5 ? Math.max(2, Math.round(((0.75 - s.lit) * s.corridor.len) / 30)) : 0
  return { trees: Math.max(5, Math.min(trees, 60)), canopyMeters, lights: Math.min(lights, 20) }
}

// ---------- safety log (mock) ----------
export const SOS_LOG = [
  { id: 'SOS-2291', time: '22:41', date: 'Yesterday', where: 'Park trail near Elmina Valley Central Park', kind: 'Felt followed', response: 3.8, status: 'Resolved' },
  { id: 'SOS-2287', time: '20:12', date: '2 days ago', where: 'Persiaran Alstonia underpass', kind: 'Flash flood', response: 5.1, status: 'Resolved' },
  { id: 'SOS-2284', time: '13:26', date: '3 days ago', where: 'Persiaran Metafasa', kind: 'Heat exhaustion', response: 4.2, status: 'Resolved' },
  { id: 'SOS-2279', time: '23:05', date: '5 days ago', where: 'Lane near Eco Lake Promenade', kind: 'Poor lighting', response: 6.4, status: 'Work order' },
  { id: 'SOS-2270', time: '07:48', date: '1 week ago', where: 'Bulatan Elmina crossing', kind: 'Near-miss vehicle', response: 4.9, status: 'Resolved' },
]
