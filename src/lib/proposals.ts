import { town, type LngLat } from './engine'
import { allCorridorStats, PEAK } from './planner'
import type { Placement, Tool } from './placements'

export type Reason = 'heat' | 'unsafe' | 'flood' | 'access'
export type Status = 'review' | 'approved' | 'declined'

export const REASONS: Record<Reason, string> = {
  heat: 'Too hot',
  unsafe: 'Feels unsafe at night',
  flood: 'Floods when it rains',
  access: 'Hard for kids & elderly',
}

export interface Proposal {
  id: string
  ref: string
  author: string
  when: string
  reasons: Reason[]
  note: string
  placements: Placement[]
  supporters: number
  status: Status
  mine?: boolean
}

let seq = 1000
export const nextPlacementId = () => ++seq

function along(edges: number[], tool: Tool, count: number): Placement[] {
  const pts: LngLat[] = edges.flatMap((id) => {
    const g = town.edges[id].geom
    return g.length > 2 ? g.slice(1, -1) : [g[0]]
  })
  const step = Math.max(1, Math.floor(pts.length / count))
  return pts
    .filter((_, i) => i % step === 0)
    .slice(0, count)
    .map((at) => ({ id: nextPlacementId(), tool, at }))
}

/** A few proposals other residents "already sent", placed on the worst real heat gaps. */
export function seedProposals(): Proposal[] {
  const hot = allCorridorStats(PEAK)
    .filter((s) => s.peakShade < 0.2)
    .sort((a, b) => b.priority - a.priority)
  const dark = allCorridorStats(PEAK)
    .filter((s) => s.lit < 0.4)
    .sort((a, b) => b.footfall - a.footfall)
  const [a, b] = hot
  const c = dark[0]
  return [
    {
      id: 'p1',
      ref: 'PRP-2026-0138',
      author: 'Aishah R. · Pangsapuri Cendana',
      when: '2 days ago',
      reasons: ['heat', 'access'],
      note: 'My kids walk this way to the mall after school and there is zero shade. Please plant trees here.',
      placements: along(a.corridor.edges, 'tree', 8),
      supporters: 64,
      status: 'review',
    },
    {
      id: 'p2',
      ref: 'PRP-2026-0135',
      author: 'Mr. Tan K. L. · Elmina Valley 1',
      when: '4 days ago',
      reasons: ['heat'],
      note: 'A short covered link would let us walk to the shops even at lunch time.',
      placements: [...along(b.corridor.edges, 'canopy', 1), ...along(b.corridor.edges, 'tree', 4)],
      supporters: 41,
      status: 'review',
    },
    {
      id: 'p3',
      ref: 'PRP-2026-0129',
      author: 'Priya S. · Kanopi Residences',
      when: '1 week ago',
      reasons: ['unsafe'],
      note: 'This footpath is pitch dark after 8pm. A few lights would make a big difference.',
      placements: along(c.corridor.edges, 'light', 4),
      supporters: 87,
      status: 'review',
    },
  ]
}

export const newRef = () => `PRP-2026-${String(140 + Math.floor(Math.random() * 60)).padStart(4, '0')}`
