import manifest from '../data/cities.json'
import type { PlaceKind, Township } from './engine'

export interface CityTrip {
  origin: string
  dest: string
}
export interface CityInfo {
  id: string
  name: string
  area: string
  bounds: [number, number, number, number]
  places: { id: string; name: string; kind: PlaceKind }[]
  scenarios: { heat: CityTrip; rain: CityTrip; night: CityTrip }
}

export const CITIES = manifest as unknown as CityInfo[]
export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0]

const cache = new Map<string, Promise<Township>>()
export function loadCity(id: string) {
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(`/cities/${id}.json`).then((r) => {
        if (!r.ok) throw new Error(`city ${id} failed to load`)
        return r.json() as Promise<Township>
      }),
    )
  }
  return cache.get(id)!
}
