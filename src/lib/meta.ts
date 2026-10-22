import {
  Building2,
  Bus,
  Coffee,
  Home,
  Landmark,
  ShoppingBag,
  Trees,
  type LucideIcon,
} from 'lucide-react'
import type { PlaceKind, Surface } from './engine'

export const KIND_META: Record<PlaceKind, { icon: LucideIcon; color: string; group: string }> = {
  home: { icon: Home, color: '#13140f', group: 'Residences' },
  shop: { icon: ShoppingBag, color: '#c2410c', group: 'Shops & retail' },
  food: { icon: Coffee, color: '#9a5b2b', group: 'Food & drink' },
  park: { icon: Trees, color: '#1d7a4b', group: 'Parks & lakes' },
  transit: { icon: Bus, color: '#2f6fdb', group: 'Transit' },
  civic: { icon: Landmark, color: '#6b5ca5', group: 'Community' },
}
export const KIND_ORDER: PlaceKind[] = ['home', 'shop', 'food', 'park', 'transit', 'civic']

export const SURFACE_META: Record<Surface, { label: string; color: string; icon: LucideIcon }> = {
  canopy: { label: 'Tree canopy', color: '#1d7a4b', icon: Trees },
  covered: { label: 'Covered walkway', color: '#5b8def', icon: Building2 },
  building: { label: 'Building shade', color: '#b7a77a', icon: Building2 },
  open: { label: 'Open asphalt', color: '#e4572e', icon: Building2 },
}

/** Shade ramp: exposed (hot) → fully shaded (cool). */
export const SHADE_STOPS: [number, string][] = [
  [0, '#d6402a'],
  [0.2, '#ef7a35'],
  [0.4, '#f2b33d'],
  [0.6, '#9cc77a'],
  [0.8, '#3f9a5c'],
  [1, '#17663f'],
]

export function shadeColor(v: number) {
  for (let i = 1; i < SHADE_STOPS.length; i++) {
    if (v <= SHADE_STOPS[i][0]) return SHADE_STOPS[i][1]
  }
  return SHADE_STOPS[SHADE_STOPS.length - 1][1]
}

export const fmtTime = (h: number) => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
export const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`)
export const fmtRM = (v: number) =>
  v >= 1_000_000 ? `RM ${(v / 1_000_000).toFixed(2)}M` : v >= 1000 ? `RM ${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k` : `RM ${Math.round(v)}`
export const pct = (v: number) => `${Math.round(v * 100)}%`
