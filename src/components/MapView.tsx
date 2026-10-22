import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Flag, Home, ShieldCheck, TriangleAlert, Footprints } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FLOOD_BLOCK,
  protectionAt,
  shadeAt,
  town,
  type Conditions,
  type Edge,
  type LngLat,
  type Place,
  type Route,
} from '../lib/engine'
import { SHADE_STOPS } from '../lib/meta'

maplibregl.setWorkerUrl(workerUrl)

export type PlannerLayer = 'heat' | 'flood' | 'night'

interface Props {
  view: 'navigate' | 'planner'
  cond: Conditions
  shortest: Route | null
  smart: Route | null
  origin: Place
  dest: Place
  showNetwork: boolean
  plannerLayer: PlannerLayer
  plannerHour: number
  selectedCorridor: string | null
  onSelectCorridor: (id: string | null) => void
  walking: boolean
  onWalkEnd: () => void
  floodHazards: Edge[]
  fitKey: string
}

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron'
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'

const corridorOfEdge = new Map<number, string>()
for (const c of town.corridors) for (const id of c.edges) corridorOfEdge.set(id, c.id)

const [minX, minY, maxX, maxY] = town.meta.bounds
const TOWN_BOUNDS: LngLatBoundsLike = [
  [minX, minY],
  [maxX, maxY],
]

const rampExpr = (prop: string) =>
  ['interpolate', ['linear'], ['get', prop], ...SHADE_STOPS.flat()] as unknown as maplibregl.ExpressionSpecification

function tint(map: maplibregl.Map, dark: boolean) {
  const set = (id: string, prop: string, v: unknown) => {
    if (map.getLayer(id)) map.setPaintProperty(id, prop as never, v as never)
  }
  if (dark) {
    set('background', 'background-color', '#0d1124')
    set('water', 'fill-color', '#16244a')
    set('building', 'fill-color', '#151b33')
    set('landuse_residential', 'fill-color', '#10152b')
    set('landuse_park', 'fill-color', '#0f1d24')
    set('landcover_wood', 'fill-color', '#0f1d24')
    set('highway_minor', 'line-color', '#1d2541')
    set('highway_major_inner', 'line-color', '#232c4b')
    set('highway_major_casing', 'line-color', '#2b3558')
  } else {
    set('background', 'background-color', '#efeadf')
    set('park', 'fill-color', '#dfe8d3')
    set('landcover_wood', 'fill-color', '#d9e5cf')
    set('water', 'fill-color', '#bed6dd')
    set('building', 'fill-color', '#e5dfd2')
    set('landuse_residential', 'fill-color', '#ebe5d9')
    set('highway_minor', 'line-color', '#e3dccd')
  }
}

const emptyFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const lineFC = (coords: LngLat[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: coords.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [],
})
const pointFC = (pts: LngLat[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })),
})

function installLayers(map: maplibregl.Map) {
  const src = (id: string) => !map.getSource(id) && map.addSource(id, { type: 'geojson', data: emptyFC })
  ;['network', 'short', 'smart', 'selected', 'lights', 'cctv', 'walker', 'flood'].forEach(src)

  map.addLayer({
    id: 'network',
    type: 'line',
    source: 'network',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': rampExpr('v'),
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, ['*', ['get', 'w'], 2.4], 17, ['*', ['get', 'w'], 6]],
      'line-opacity': ['get', 'o'],
    },
  })
  map.addLayer({
    id: 'flood-zones',
    type: 'line',
    source: 'flood',
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#d92d20', 'line-width': 9, 'line-opacity': 0.25, 'line-blur': 3 },
  })
  map.addLayer({
    id: 'lights-glow',
    type: 'circle',
    source: 'lights',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 6, 17, 16],
      'circle-color': '#ffc95c',
      'circle-opacity': 0.16,
      'circle-blur': 1,
    },
  })
  map.addLayer({
    id: 'lights',
    type: 'circle',
    source: 'lights',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 1.3, 17, 3],
      'circle-color': '#ffe2a1',
    },
  })
  map.addLayer({
    id: 'cctv',
    type: 'circle',
    source: 'cctv',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2.5, 17, 5.5],
      'circle-color': '#5b8def',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.4,
    },
  })
  map.addLayer({
    id: 'short-casing',
    type: 'line',
    source: 'short',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: 'short',
    type: 'line',
    source: 'short',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': '#e4572e', 'line-width': 4.5, 'line-dasharray': [1.6, 1.1] },
  })
  map.addLayer({
    id: 'smart-glow',
    type: 'line',
    source: 'smart',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2fbf71', 'line-width': 18, 'line-opacity': 0.22, 'line-blur': 6 },
  })
  map.addLayer({
    id: 'smart-casing',
    type: 'line',
    source: 'smart',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 10 },
  })
  map.addLayer({
    id: 'smart',
    type: 'line',
    source: 'smart',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#17663f', 'line-width': 6 },
  })
  map.addLayer({
    id: 'selected-casing',
    type: 'line',
    source: 'selected',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#13140f', 'line-width': 13, 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: 'selected',
    type: 'line',
    source: 'selected',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-dasharray': [1, 1.2] },
  })
  map.addLayer({
    id: 'walker-halo',
    type: 'circle',
    source: 'walker',
    paint: { 'circle-radius': 18, 'circle-color': '#2fbf71', 'circle-opacity': 0.25 },
  })
  map.addLayer({
    id: 'walker',
    type: 'circle',
    source: 'walker',
    paint: { 'circle-radius': 7, 'circle-color': '#17663f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 },
  })
}

function markerEl(html: string, className: string, bg?: string, title?: string) {
  const el = document.createElement('div')
  el.className = 'ss-marker'
  if (title) el.title = title
  el.innerHTML = `${bg ? `<span class="ss-ring" style="color:${bg}"></span>` : ''}<span class="${className}" ${bg ? `style="background:${bg}"` : ''}>${html}</span>`
  return el
}
const icon = (node: React.ReactElement) => renderToStaticMarkup(node)

export default function MapView(p: Props) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [styleTick, setStyleTick] = useState(0)
  const darkMap = p.view === 'navigate' ? p.cond.night : p.plannerLayer === 'night'
  const darkRef = useRef(darkMap)
  const markers = useRef<maplibregl.Marker[]>([])
  const hazardMarkers = useRef<maplibregl.Marker[]>([])
  const popup = useRef<maplibregl.Popup | null>(null)
  const onSelectRef = useRef(p.onSelectCorridor)
  const viewRef = useRef(p.view)
  useEffect(() => {
    onSelectRef.current = p.onSelectCorridor
    viewRef.current = p.view
  })

  // ---------- init ----------
  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current!,
      style: darkRef.current ? STYLE_DARK : STYLE_LIGHT,
      bounds: TOWN_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
      maxZoom: 18.5,
      minZoom: 12,
      pitchWithRotate: false,
      dragRotate: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('style.load', () => {
      tint(map, darkRef.current)
      installLayers(map)
      setStyleTick((t) => t + 1)
    })
    popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: '260px' })
    map.on('mousemove', 'network', (e) => {
      if (viewRef.current !== 'planner') return
      map.getCanvas().style.cursor = 'pointer'
      const f = e.features?.[0]
      if (!f) return
      const props = f.properties as { name: string; label: string }
      popup.current!.setLngLat(e.lngLat).setHTML(
        `<div style="font-weight:650;font-size:13px;line-height:1.25">${props.name}</div><div style="font-family:var(--font-mono);font-size:11px;color:#8a897f;margin-top:3px">${props.label}</div>`,
      ).addTo(map)
    })
    map.on('mouseleave', 'network', () => {
      map.getCanvas().style.cursor = ''
      popup.current!.remove()
    })
    map.on('click', 'network', (e) => {
      if (viewRef.current !== 'planner') return
      const cid = e.features?.[0]?.properties?.cid
      if (cid) onSelectRef.current(cid)
    })
    mapRef.current = map
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(box.current!)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ---------- light / dark basemap ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map || darkRef.current === darkMap) return
    darkRef.current = darkMap
    map.setStyle(darkMap ? STYLE_DARK : STYLE_LIGHT, { diff: false })
  }, [darkMap])

  // ---------- network colouring ----------
  const networkData = useMemo<GeoJSON.FeatureCollection>(() => {
    const isPlanner = p.view === 'planner'
    const corridorName = new Map(town.corridors.map((c) => [c.id, c.name]))
    return {
      type: 'FeatureCollection',
      features: town.edges.map((e) => {
        let v: number
        let label: string
        if (!isPlanner) {
          v = protectionAt(e, p.cond)
          label = ''
        } else if (p.plannerLayer === 'heat') {
          v = shadeAt(e, p.plannerHour)
          label = `${Math.round(v * 100)}% shade · ${e.footfall.toLocaleString()} walkers/day`
        } else if (p.plannerLayer === 'flood') {
          v = 1 - e.flood
          label = e.flood >= FLOOD_BLOCK ? `High flood risk · ${Math.round(e.flood * 100)}` : `Flood risk ${Math.round(e.flood * 100)}`
        } else {
          v = e.lit
          label = `${Math.round(e.lit * 100)}% lit${e.cctv ? ' · CCTV' : ''}`
        }
        const w = isPlanner ? 0.55 + Math.min(1.4, e.footfall / 1400) : 0.7
        const o = isPlanner ? 0.95 : p.showNetwork ? 0.5 : 0
        const cid = corridorOfEdge.get(e.id) ?? null
        return {
          type: 'Feature',
          properties: { v, w, o, cid, name: (cid && corridorName.get(cid)) || e.name || 'Footpath', label },
          geometry: { type: 'LineString', coordinates: e.geom },
        }
      }),
    }
  }, [p.view, p.cond, p.plannerLayer, p.plannerHour, p.showNetwork])

  useEffect(() => {
    ;(mapRef.current?.getSource('network') as GeoJSONSource | undefined)?.setData(networkData)
  }, [networkData, styleTick])

  // ---------- routes ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleTick) return
    const nav = p.view === 'navigate'
    ;(map.getSource('short') as GeoJSONSource | undefined)?.setData(lineFC(nav && p.shortest ? p.shortest.coords : []))
    ;(map.getSource('smart') as GeoJSONSource | undefined)?.setData(lineFC(nav && p.smart ? p.smart.coords : []))
  }, [p.shortest, p.smart, p.view, styleTick])

  // ---------- safety + flood overlays ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleTick) return
    const showSafety = (p.view === 'navigate' && p.cond.night) || (p.view === 'planner' && p.plannerLayer === 'night')
    ;(map.getSource('lights') as GeoJSONSource | undefined)?.setData(pointFC(showSafety ? town.streetlights : []))
    ;(map.getSource('cctv') as GeoJSONSource | undefined)?.setData(pointFC(showSafety ? town.cctvs : []))
    const floodEdges =
      p.view === 'planner' && p.plannerLayer === 'flood'
        ? town.edges.filter((e) => e.flood >= FLOOD_BLOCK)
        : p.view === 'navigate' && p.cond.weather === 'rainy'
          ? town.edges.filter((e) => e.flood >= FLOOD_BLOCK)
          : []
    ;(map.getSource('flood') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: floodEdges.map((e) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: e.geom } })),
    })

    for (const m of hazardMarkers.current) m.remove()
    hazardMarkers.current = []
    if (showSafety) {
      for (const g of town.guardPosts) {
        const el = markerEl(icon(<ShieldCheck size={15} strokeWidth={2.4} />), 'ss-dot', '#2f6fdb', g.name)
        el.querySelector('.ss-ring')?.remove()
        hazardMarkers.current.push(
          new maplibregl.Marker({ element: el })
            .setLngLat(g.at)
            .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(`<b>${g.name}</b><div style="font-size:11px;color:#8a897f;margin-top:2px">24/7 · Auxiliary Police patrol</div>`))
            .addTo(map),
        )
      }
    }
    if (p.view === 'navigate') {
      p.floodHazards.forEach((e) => {
        const mid = e.geom[Math.floor(e.geom.length / 2)]
        const el = markerEl(icon(<TriangleAlert size={16} strokeWidth={2.5} />), 'ss-hazard')
        const pop = new maplibregl.Popup({ offset: 18, closeButton: false, maxWidth: '240px' }).setHTML(
          `<div style="font-weight:700;color:#d92d20;font-size:13px">Blocked due to flood risk — Rerouted</div><div style="font-size:11.5px;color:#4a4b44;margin-top:4px">${e.name ?? 'Low-lying footpath'} · water level rising after heavy downpour</div>`,
        )
        hazardMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat(mid).setPopup(pop).addTo(map))
      })
    }
  }, [p.view, p.cond.night, p.cond.weather, p.plannerLayer, p.floodHazards, styleTick])

  // ---------- origin / destination ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const m of markers.current) m.remove()
    markers.current = []
    if (p.view !== 'navigate') return
    const o = markerEl(icon(<Home size={16} strokeWidth={2.4} />), 'ss-pin', '#13140f', p.origin.name)
    o.querySelector('.ss-ring')?.remove()
    const d = markerEl(icon(<Flag size={16} strokeWidth={2.4} />), 'ss-pin', '#17663f', p.dest.name)
    markers.current.push(new maplibregl.Marker({ element: o }).setLngLat(town.nodes[p.origin.node]).addTo(map))
    markers.current.push(new maplibregl.Marker({ element: d }).setLngLat(town.nodes[p.dest.node]).addTo(map))
  }, [p.origin, p.dest, p.view])

  // ---------- camera ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // wait a frame so a view switch has resized the container before we frame the shot
    const t = setTimeout(() => {
      map.resize()
      if (p.view === 'navigate') {
        const pts = [...(p.shortest?.coords ?? []), ...(p.smart?.coords ?? [])]
        if (!pts.length) return
        const b = pts.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0]))
        const narrow = (box.current?.clientWidth ?? 1000) < 640
        map.fitBounds(b, {
          padding: narrow ? { top: 190, bottom: 30, left: 30, right: 30 } : { top: 170, bottom: 50, left: 70, right: 70 },
          duration: 900,
          maxZoom: 17,
        })
      } else if (!p.selectedCorridor) {
        map.fitBounds(TOWN_BOUNDS, { padding: { top: 70, bottom: 80, left: 20, right: 20 }, duration: 900 })
      }
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitKey, p.view])

  // ---------- selected corridor ----------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleTick) return
    const c = p.view === 'planner' && p.selectedCorridor ? town.corridors.find((x) => x.id === p.selectedCorridor) : null
    const es = c ? c.edges.map((id) => town.edges[id]) : []
    ;(map.getSource('selected') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: es.map((e) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: e.geom } })),
    })
    if (es.length) {
      const pts = es.flatMap((e) => e.geom)
      const b = pts.reduce((acc, x) => acc.extend(x), new maplibregl.LngLatBounds(pts[0], pts[0]))
      map.fitBounds(b, { padding: 120, maxZoom: 17, duration: 800 })
    }
  }, [p.selectedCorridor, p.view, styleTick])

  // ---------- walk preview ----------
  useEffect(() => {
    const map = mapRef.current
    const walker = map?.getSource('walker') as GeoJSONSource | undefined
    if (!map || !walker) return
    if (!p.walking || !p.smart?.coords.length) {
      walker.setData(emptyFC)
      return
    }
    const coords = p.smart.coords
    const cum = [0]
    for (let i = 1; i < coords.length; i++) {
      const dx = (coords[i][0] - coords[i - 1][0]) * Math.cos((coords[i][1] * Math.PI) / 180)
      const dy = coords[i][1] - coords[i - 1][1]
      cum.push(cum[i - 1] + Math.hypot(dx, dy))
    }
    const total = cum[cum.length - 1]
    const duration = 8000
    const t0 = performance.now()
    let raf = 0
    const frame = (t: number) => {
      const k = Math.min(1, (t - t0) / duration)
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
      const target = ease * total
      let i = 1
      while (i < cum.length - 1 && cum[i] < target) i++
      const seg = cum[i] - cum[i - 1] || 1
      const f = (target - cum[i - 1]) / seg
      const pt: LngLat = [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f,
      ]
      walker.setData(pointFC([pt]))
      if (k < 1) raf = requestAnimationFrame(frame)
      else setTimeout(() => p.onWalkEnd(), 600)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.walking, p.smart, styleTick])

  return (
    <div className="absolute inset-0">
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {p.walking && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-white shadow-float">
          <Footprints size={15} /> Previewing your shaded walk
        </div>
      )}
    </div>
  )
}
