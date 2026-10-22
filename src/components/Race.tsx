import clsx from 'clsx'
import { motion } from 'motion/react'
import { Building2, CloudRain, Droplets, Flag, Footprints, Lightbulb, Moon, RotateCcw, Sun, Trees, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  airTemp,
  protectionAt,
  uvIndex,
  WALK_SPEED,
  type Conditions,
  type EdgeOverrides,
  type LngLat,
  type Route,
  type Surface,
} from '../lib/engine'
import { fmtTime } from '../lib/meta'

export interface Walker {
  id: string
  at: LngLat
  color: string
}
export interface MapApi {
  setWalkers: (w: Walker[]) => void
}

const REAL_SECONDS = 12

interface Track {
  len: number
  cum: number[] // cumulative distance at the start of each step
  cov: number[]
  surface: Surface[]
  geoms: LngLat[][]
  geomCum: number[][]
}

function metres(a: LngLat, b: LngLat) {
  const k = Math.PI / 180
  return Math.hypot((b[0] - a[0]) * k * Math.cos(a[1] * k), (b[1] - a[1]) * k) * 6371000
}

function buildTrack(r: Route, c: Conditions, ov?: EdgeOverrides): Track {
  const cum: number[] = []
  const cov: number[] = []
  const surface: Surface[] = []
  const geoms: LngLat[][] = []
  const geomCum: number[][] = []
  let acc = 0
  for (const s of r.steps) {
    const e = ov?.get(s.edge.id) ?? s.edge
    cum.push(acc)
    cov.push(protectionAt(e, c))
    surface.push(e.surface)
    geoms.push(s.geom)
    const gc = [0]
    for (let i = 1; i < s.geom.length; i++) gc.push(gc[i - 1] + metres(s.geom[i - 1], s.geom[i]))
    // normalise geometry length to the edge length so position and stats agree
    const scale = gc[gc.length - 1] ? s.edge.len / gc[gc.length - 1] : 1
    geomCum.push(gc.map((x) => x * scale))
    acc += s.edge.len
  }
  return { len: acc, cum, cov, surface, geoms, geomCum }
}

function stepAt(t: Track, d: number) {
  let i = 0
  while (i < t.cum.length - 1 && t.cum[i + 1] <= d) i++
  return i
}

function posAt(t: Track, d: number): LngLat {
  const i = stepAt(t, d)
  const local = d - t.cum[i]
  const g = t.geoms[i]
  const gc = t.geomCum[i]
  let k = 1
  while (k < gc.length - 1 && gc[k] < local) k++
  const seg = gc[k] - gc[k - 1] || 1
  const f = Math.max(0, Math.min(1, (local - gc[k - 1]) / seg))
  return [g[k - 1][0] + (g[k][0] - g[k - 1][0]) * f, g[k - 1][1] + (g[k][1] - g[k - 1][1]) * f]
}

interface RunnerState {
  dist: number
  exposure: number // minutes unprotected
  heat: number // 0..100 body heat load
  cov: number
  surface: Surface
  done: boolean
}

const fresh = (): RunnerState => ({ dist: 0, exposure: 0, heat: 8, cov: 1, surface: 'open', done: false })

export function RaceHUD({
  shortRoute,
  smartRoute,
  cond,
  ov,
  mapApi,
  onClose,
}: {
  shortRoute: Route
  smartRoute: Route
  cond: Conditions
  ov?: EdgeOverrides
  mapApi: React.RefObject<MapApi | null>
  onClose: () => void
}) {
  const tracks = useMemo(
    () => ({ short: buildTrack(shortRoute, cond, ov), smart: buildTrack(smartRoute, cond, ov) }),
    [shortRoute, smartRoute, cond, ov],
  )
  const [runId, setRunId] = useState(0)
  const [state, setState] = useState({ simMin: 0, short: fresh(), smart: fresh() })
  const sim = useRef({ short: fresh(), smart: fresh() })

  const mode = cond.night ? 'night' : cond.weather === 'rainy' ? 'rain' : 'sun'
  const uv = uvIndex(cond.hour, cond.weather, cond.night)
  // how hard exposure hits: midday sun is brutal, rain soaks, darkness is about safety not heat
  const intensity = mode === 'sun' ? 4 + uv * 1.1 : mode === 'rain' ? 9 : 7

  useEffect(() => {
    sim.current = { short: fresh(), smart: fresh() }
    const maxMin = Math.max(tracks.short.len, tracks.smart.len) / WALK_SPEED
    const rate = maxMin / REAL_SECONDS // sim minutes per real second
    let last = performance.now()
    const t0 = last
    let raf = 0
    const frame = (now: number) => {
      const dtMin = ((now - last) / 1000) * rate
      last = now
      const simMin = ((now - t0) / 1000) * rate
      for (const key of ['short', 'smart'] as const) {
        const tr = tracks[key]
        const r = sim.current[key]
        if (r.done) continue
        r.dist = Math.min(tr.len, simMin * WALK_SPEED)
        const i = stepAt(tr, r.dist)
        r.cov = tr.cov[i]
        r.surface = tr.surface[i]
        r.exposure += dtMin * (1 - r.cov)
        r.heat = Math.max(4, Math.min(100, r.heat + dtMin * ((1 - r.cov) * intensity - r.cov * 2.2)))
        if (r.dist >= tr.len) r.done = true
      }
      mapApi.current?.setWalkers([
        { id: 'short', at: posAt(tracks.short, sim.current.short.dist), color: '#e4572e' },
        { id: 'smart', at: posAt(tracks.smart, sim.current.smart.dist), color: '#17663f' },
      ])
      setState({ simMin, short: { ...sim.current.short }, smart: { ...sim.current.smart } })
      if (!(sim.current.short.done && sim.current.smart.done)) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [tracks, runId, intensity, mapApi])

  useEffect(() => () => mapApi.current?.setWalkers([]), [mapApi])

  const finished = state.short.done && state.smart.done
  const label = mode === 'night' ? 'in the dark' : mode === 'rain' ? 'in the rain' : 'in direct sun'
  const metricIcon = mode === 'night' ? Moon : mode === 'rain' ? CloudRain : Sun
  const savedMin = state.short.exposure - state.smart.exposure
  const heatDrop = state.short.heat ? Math.round((1 - state.smart.heat / state.short.heat) * 100) : 0
  const lateBy = (tracks.smart.len - tracks.short.len) / WALK_SPEED

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 30, opacity: 0 }}
      className="absolute bottom-3 left-1/2 z-20 w-[min(600px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-[22px] bg-ink/95 p-4 text-white shadow-float backdrop-blur md:bottom-4"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-white/10">
          <Footprints size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] font-extrabold leading-none tracking-[-0.02em]">
            {mode === 'night' ? 'Night walk race' : mode === 'rain' ? 'Downpour race' : 'Heat race'}
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-white/50">
            {fmtTime(cond.hour)} · {airTemp(cond.hour, cond.weather, cond.night).toFixed(0)}°C{mode === 'sun' ? ` · UV ${uv}` : ''} · same start, same pace
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[12px] font-semibold tabular">
          {Math.floor(state.simMin)}:{String(Math.floor((state.simMin % 1) * 60)).padStart(2, '0')}
        </span>
        <button
          aria-label="Replay race"
          onClick={() => setRunId((n) => n + 1)}
          className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <RotateCcw size={14} />
        </button>
        <button aria-label="Close race" onClick={onClose} className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <X size={14} />
        </button>
      </div>

      <div className="mt-3.5 space-y-3">
        {(
          [
            ['Shortest path', 'short', '#e4572e'],
            ['ShadeSmart', 'smart', '#2fbf71'],
          ] as const
        ).map(([name, key, color]) => {
          const r = state[key]
          const tr = tracks[key]
          const exposedNow = !r.done && r.cov < 0.4
          const MetricIcon = metricIcon
          return (
            <div key={key}>
              <div className="flex items-center gap-2 text-[12px]">
                <span className="size-2.5 rounded-full" style={{ background: color }} />
                <span className="font-bold">{name}</span>
                <StatusChip surface={r.surface} cov={r.cov} done={r.done} mode={mode} />
                <span className="ml-auto flex items-center gap-1 font-mono tabular text-white/80">
                  <MetricIcon size={12} />
                  {r.exposure.toFixed(1)} min {label}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-[1fr_118px] items-center gap-3">
                <div className="relative h-2 rounded-full bg-white/10">
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.dist / tr.len) * 100}%`, background: color }} />
                  <span
                    className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-ink text-ink"
                    style={{ left: `${(r.dist / tr.len) * 100}%`, background: color }}
                  >
                    {r.done ? <Flag size={10} strokeWidth={3} /> : <Footprints size={10} strokeWidth={3} />}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Droplets
                    size={13}
                    className={clsx('shrink-0 transition-colors', exposedNow && mode === 'sun' ? 'animate-bounce text-sky-300' : 'text-white/30')}
                  />
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10" title={mode === 'night' ? 'Unease' : 'Body heat load'}>
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
                      style={{
                        width: `${r.heat}%`,
                        background: 'linear-gradient(90deg,#7bd389,#f2b33d 45%,#e4572e 75%,#b3261e)',
                      }}
                    />
                  </div>
                  <span className="w-7 text-right font-mono text-[11px] tabular text-white/70">{Math.round(r.heat)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-end font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/40">
        {mode === 'night' ? 'unease meter' : mode === 'rain' ? 'soaked meter' : 'body heat load'}
      </div>

      {finished && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 rounded-2xl bg-mint px-4 py-3 text-[13px] leading-snug text-forest"
        >
          <b>ShadeSmart arrived {lateBy >= 0.5 ? `${lateBy.toFixed(1)} min later` : 'at the same time'}</b>, but spent{' '}
          <b>{Math.max(0, savedMin).toFixed(1)} fewer minutes {label}</b>
          {mode !== 'night' && heatDrop > 0 && (
            <>
              {' '}— and {mode === 'rain' ? 'stayed' : 'arrived'} <b>{heatDrop}% {mode === 'rain' ? 'drier' : 'cooler'}</b>
            </>
          )}
          .
        </motion.div>
      )}
    </motion.div>
  )
}

function StatusChip({ surface, cov, done, mode }: { surface: Surface; cov: number; done: boolean; mode: 'sun' | 'rain' | 'night' }) {
  if (done) return <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-white/70">Arrived</span>
  let text: string
  let Icon = Sun
  let tone: string
  if (mode === 'night') {
    text = cov > 0.7 ? 'Well lit' : cov > 0.4 ? 'Dim' : 'Dark stretch'
    Icon = cov > 0.4 ? Lightbulb : Moon
    tone = cov > 0.7 ? 'bg-sun/25 text-sun' : 'bg-white/10 text-white/70'
  } else if (surface === 'covered') {
    text = 'Covered walkway'
    Icon = Building2
    tone = 'bg-sky-400/20 text-sky-200'
  } else if (cov > 0.55) {
    text = mode === 'rain' ? 'Under trees' : 'Tree shade'
    Icon = Trees
    tone = 'bg-mint/20 text-mint'
  } else {
    text = mode === 'rain' ? 'Getting soaked' : 'Direct sun'
    Icon = mode === 'rain' ? CloudRain : Sun
    tone = mode === 'rain' ? 'bg-rain/30 text-sky-200' : 'bg-heat/25 text-[#ffb59b]'
  }
  return (
    <span className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', tone)}>
      <Icon size={11} /> {text}
    </span>
  )
}
