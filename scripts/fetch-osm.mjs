// Downloads raw OpenStreetMap extracts for each city into data/osm/<city>/.
//   node scripts/fetch-osm.mjs [cityId ...]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { CITIES } from './cities.mjs'

const API = 'https://overpass-api.de/api/interpreter'
const want = process.argv.slice(2)

async function overpass(q) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API, { method: 'POST', headers: { 'User-Agent': 'shadesmart-prototype' }, body: new URLSearchParams({ data: q }) })
    if (res.ok) return res.text()
    await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)))
  }
  throw new Error('overpass failed')
}

for (const c of CITIES) {
  if (want.length ? !want.includes(c.id) : c.id === 'elmina') continue
  const dir = `data/osm/${c.id}`
  if (existsSync(`${dir}/pois.json`) && !want.length) continue
  mkdirSync(dir, { recursive: true })
  const b = c.bbox.join(',')
  const raw = await overpass(
    `[out:json][timeout:90];(way["highway"](${b});way["natural"="water"](${b});way["leisure"="park"](${b});way["landuse"~"retail|commercial|grass"](${b}););out geom;`,
  )
  writeFileSync(`${dir}/raw.json`, raw)
  await new Promise((r) => setTimeout(r, 3000))
  const pois = await overpass(
    `[out:json][timeout:90];(nwr["name"]["tourism"~"attraction|museum|hotel|viewpoint"](${b});nwr["name"]["shop"~"mall|supermarket|department_store"](${b});nwr["name"]["amenity"~"restaurant|cafe|food_court|marketplace|place_of_worship|school|hospital|library|townhall|bus_station"](${b});nwr["name"]["leisure"="park"](${b});nwr["name"]["railway"="station"](${b});nwr["name"]["public_transport"="station"](${b});node["name"]["highway"="bus_stop"](${b});nwr["name"]["building"~"apartments|residential"](${b});nwr["name"]["landuse"="residential"](${b}););out center tags;`,
  )
  writeFileSync(`${dir}/pois.json`, pois)
  console.log(c.id, (raw.length / 1e6).toFixed(2) + 'MB', (pois.length / 1e3).toFixed(0) + 'kB')
  await new Promise((r) => setTimeout(r, 3000))
}
