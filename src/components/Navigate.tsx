import clsx from 'clsx'
import {
  Accessibility,
  ArrowDownUp,
  Car,
  Clock,
  CloudRain,
  Flame,
  Footprints,
  Layers,
  Lightbulb,
  Moon,
  Play,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  Thermometer,
  TrafficCone,
  Umbrella,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  protectionAt,
  routeProfile,
  town,
  type Conditions,
  type Route,
  type RouteStats,
  type Surface,
  type EdgeOverrides,
} from '../lib/engine'
import { DAY_END, DAY_START } from '../lib/daylight'
import { fmtDist, fmtTime, KIND_META, KIND_ORDER, pct, SURFACE_META } from '../lib/meta'
import { Card, Eyebrow, PlaceSelect, Range, Segmented, Toggle, type SelectOption } from './ui'
import { SOSButton } from './SOS'
import { SunShadow } from './SunShadow'

export interface Scenario {
  id: string
  label: string
  sub: string
  icon: typeof Sun
  origin: string
  dest: string
  cond: Partial<Conditions>
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'heat',
    label: 'Noon heatwave',
    sub: 'Cendana → Lakeside Mall',
    icon: Sun,
    origin: 'cendana',
    dest: 'mall',
    cond: { weather: 'sunny', night: false, hour: 13, shadeWeight: 3.5 },
  },
  {
    id: 'rain',
    label: 'Monsoon downpour',
    sub: 'Kanopi → Central Park',
    icon: CloudRain,
    origin: 'kanopi',
    dest: 'centralpark',
    cond: { weather: 'rainy', night: false, hour: 16.5, shadeWeight: 3.5 },
  },
  {
    id: 'night',
    label: 'Late-night walk',
    sub: 'Cendana → Central Park',
    icon: Moon,
    origin: 'cendana',
    dest: 'centralpark',
    cond: { weather: 'sunny', night: true, hour: 21.5, shadeWeight: 4 },
  },
]

const placeOptions: SelectOption[] = KIND_ORDER.flatMap((k) =>
  town.places
    .filter((p) => p.kind === k)
    .map((p) => ({ value: p.id, label: p.name, group: KIND_META[k].group, icon: KIND_META[k].icon, color: KIND_META[k].color })),
)

export const coverageLabel = (c: Conditions) => (c.night ? 'Lit' : c.weather === 'rainy' ? 'Rain cover' : 'Shade')

const weightLabel = (w: number) => (w < 1.6 ? 'Fastest' : w < 2.8 ? 'Balanced' : w < 4 ? 'Prefer shade' : 'Max shade')

function Chip({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: typeof Sun; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        'flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-semibold transition-all',
        on ? 'border-leaf bg-leaf text-white shadow-soft' : 'border-line bg-card text-ink-2 hover:border-ink/25 hover:text-ink',
      )}
    >
      <Icon size={14} strokeWidth={2.3} />
      {label}
    </button>
  )
}

// ---------- left panel ----------

export function NavigatePanel({
  origin,
  dest,
  setOrigin,
  setDest,
  cond,
  setCond,
  scenario,
  applyScenario,
  smart,
  showNetwork,
  setShowNetwork,
  onSOSTap,
  onSOSHold,
}: {
  origin: string
  dest: string
  setOrigin: (v: string) => void
  setDest: (v: string) => void
  cond: Conditions
  setCond: (c: Partial<Conditions>) => void
  scenario: string | null
  applyScenario: (s: Scenario) => void
  smart: Route | null
  showNetwork: boolean
  setShowNetwork: (v: boolean) => void
  onSOSTap: () => void
  onSOSHold: () => void
}) {
  const [allSteps, setAllSteps] = useState(false)
  const segments = useMemo(() => {
    if (!smart?.found) return []
    const out: { name: string; len: number; surface: Surface; cov: number }[] = []
    for (const s of smart.steps) {
      const name = s.edge.name ?? SURFACE_META[s.edge.surface].label
      const last = out[out.length - 1]
      const cov = protectionAt(s.edge, cond)
      if (last && last.name === name && last.surface === s.edge.surface) {
        last.cov = (last.cov * last.len + cov * s.edge.len) / (last.len + s.edge.len)
        last.len += s.edge.len
      } else out.push({ name, len: s.edge.len, surface: s.edge.surface, cov })
    }
    // fold tiny connectors into their neighbour so the list reads like directions
    return out.filter((s) => s.len >= 25)
  }, [smart, cond])

  return (
    <div className="flex flex-col gap-5 p-5 md:p-6">
      <div>
        <h1 className="font-display text-[40px] font-extrabold leading-[0.92] tracking-[-0.045em] md:text-[46px]">
          Walk the
          <br />
          <span className="text-leaf">cool</span> way.
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-line bg-card px-3 py-2.5">
            <svg width="30" height="6" aria-hidden>
              <line x1="1" y1="3" x2="29" y2="3" stroke="#e4572e" strokeWidth="4" strokeDasharray="5 3.5" />
            </svg>
            <div className="mt-1.5 text-[12.5px] font-bold leading-tight">Shortest path</div>
            <div className="text-[11px] text-ink-3">Fast, but hot</div>
          </div>
          <div className="rounded-2xl bg-forest px-3 py-2.5 text-white">
            <span className="block h-1.5 w-[30px] rounded-full bg-mint" />
            <div className="mt-1.5 text-[12.5px] font-bold leading-tight">ShadeSmart</div>
            <div className="text-[11px] text-white/60">A little longer, much cooler</div>
          </div>
        </div>
      </div>

      {/* scenarios */}
      <div>
        <Eyebrow className="mb-2 flex items-center gap-1.5">
          <Sparkles size={11} /> Try a scenario
        </Eyebrow>
        <div className="grid grid-cols-3 gap-2">
          {SCENARIOS.map((s) => {
            const Icon = s.icon
            const active = scenario === s.id
            return (
              <button
                key={s.id}
                onClick={() => applyScenario(s)}
                className={clsx(
                  'group rounded-2xl border p-2.5 text-left transition-all',
                  active ? 'border-ink bg-ink text-white shadow-float' : 'border-line bg-card hover:border-ink/25 hover:shadow-soft',
                )}
              >
                <Icon size={17} strokeWidth={2.3} className={active ? 'text-sun' : 'text-ink-2'} />
                <div className="mt-2 text-[12.5px] font-bold leading-tight">{s.label}</div>
                <div className={clsx('mt-0.5 truncate text-[10.5px]', active ? 'text-white/60' : 'text-ink-3')}>{s.sub}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* route */}
      <Card className="relative p-1.5">
        <PlaceSelect
          label="From"
          value={origin}
          onChange={setOrigin}
          options={placeOptions}
          disabledValue={dest}
          accent={<span className="ml-1 size-3 shrink-0 rounded-full border-[3px] border-ink bg-card" />}
        />
        <div className="ml-[13px] h-4 border-l-2 border-dotted border-ink-3/60" />
        <PlaceSelect
          label="To"
          value={dest}
          onChange={setDest}
          options={placeOptions}
          disabledValue={origin}
          accent={<span className="ml-1 size-3 shrink-0 rounded-[4px] bg-leaf" />}
        />
        <button
          aria-label="Swap origin and destination"
          onClick={() => {
            setOrigin(dest)
            setDest(origin)
          }}
          className="absolute right-11 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-card text-ink-2 shadow-soft transition hover:rotate-180 hover:text-ink"
        >
          <ArrowDownUp size={15} />
        </button>
      </Card>

      {/* conditions */}
      <section className="space-y-3">
        <Eyebrow>Conditions</Eyebrow>
        <Segmented
          value={cond.weather}
          onChange={(v) => setCond({ weather: v })}
          options={[
            { value: 'sunny', label: 'Sunny · 33°C', icon: Sun },
            { value: 'rainy', label: 'Heavy rain', icon: CloudRain },
          ]}
        />
        <div className="rounded-2xl border border-line px-4 pb-2 pt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">
              <Clock size={14} /> Time of day
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[13px] font-semibold tabular">
              {cond.night ? <Moon size={13} /> : <Sun size={13} />}
              {fmtTime(cond.hour)}
            </span>
          </div>
          <Range
            label="Time of day"
            value={cond.hour}
            min={DAY_START}
            max={DAY_END}
            step={0.25}
            onChange={(v) => setCond({ hour: v })}
            fill={cond.night ? '#4b55a8' : '#f2b33d'}
          />
        </div>
        <Toggle
          checked={cond.night}
          onChange={(v) => setCond({ night: v })}
          icon={Moon}
          tone="night"
          label="Night safety mode"
        />
      </section>

      {/* preferences */}
      <section className="space-y-3">
        <Eyebrow>Preferences</Eyebrow>
        <div className="rounded-2xl border border-line px-4 pb-2.5 pt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">
              {cond.night ? <Lightbulb size={14} /> : cond.weather === 'rainy' ? <Umbrella size={14} /> : <Sun size={14} />}
              {cond.night ? 'Light vs. distance' : cond.weather === 'rainy' ? 'Cover vs. distance' : 'Shade vs. distance'}
            </span>
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11.5px] font-semibold text-white">{weightLabel(cond.shadeWeight)}</span>
          </div>
          <Range label="Shade preference" value={cond.shadeWeight} min={1} max={5} step={0.1} onChange={(v) => setCond({ shadeWeight: v })} />
          <div className="flex justify-between text-[11px] font-medium text-ink-3">
            <span>Shortest</span>
            <span>{cond.night ? 'Brightest' : cond.weather === 'rainy' ? 'Driest' : 'Shadiest'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip on={cond.wheelchair} onClick={() => setCond({ wheelchair: !cond.wheelchair })} icon={Accessibility} label="Step-free" />
          <Chip on={cond.fewerCrossings} onClick={() => setCond({ fewerCrossings: !cond.fewerCrossings })} icon={TrafficCone} label="Fewer crossings" />
          <Chip on={showNetwork} onClick={() => setShowNetwork(!showNetwork)} icon={Layers} label="Shade layer" />
        </div>
      </section>

      {/* directions */}
      {segments.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <Eyebrow>Your route</Eyebrow>
            {segments.length > 4 && (
              <button onClick={() => setAllSteps(!allSteps)} className="text-[11.5px] font-semibold text-leaf hover:underline">
                {allSteps ? 'Show less' : `All ${segments.length} steps`}
              </button>
            )}
          </div>
          <ol className="relative space-y-0.5">
            {(allSteps ? segments : segments.slice(0, 4)).map((s, i) => {
              const meta = SURFACE_META[s.surface]
              const Icon = meta.icon
              return (
                <li key={i} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-white"
                    style={{ background: cond.night ? '#171c36' : meta.color }}
                  >
                    {cond.night ? <Lightbulb size={14} /> : <Icon size={14} strokeWidth={2.3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{s.name}</span>
                    <span className="block text-[11.5px] text-ink-3">{fmtDist(s.len)}</span>
                  </span>
                  <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-paper-2">
                    <span className="block h-full rounded-full bg-leaf" style={{ width: pct(s.cov) }} />
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section>
        <Eyebrow className="mb-2">Township Guardian</Eyebrow>
        <SOSButton variant="block" onTap={onSOSTap} onHoldComplete={onSOSHold} />
      </section>
    </div>
  )
}

// ---------- compare cards (map overlay) ----------

export function RouteCompare({
  cond,
  short,
  smart,
  onPreview,
  walking,
  rerouted,
}: {
  cond: Conditions
  short: RouteStats | null
  smart: RouteStats | null
  onPreview: () => void
  walking: boolean
  rerouted: boolean
}) {
  if (!short || !smart) return null
  const label = coverageLabel(cond)
  const dDist = smart.distance - short.distance
  const dMin = smart.minutes - short.minutes
  const dCov = Math.round((smart.coverage - short.coverage) * 100)
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 grid grid-cols-2 gap-2.5 md:inset-x-4 md:top-4 md:max-w-[600px] md:gap-3">
      <div className="pointer-events-auto rounded-[20px] border border-line bg-card/95 p-3.5 shadow-float backdrop-blur md:p-4">
        <div className="flex items-center gap-2">
          <svg width="26" height="6" aria-hidden>
            <line x1="1" y1="3" x2="25" y2="3" stroke="#e4572e" strokeWidth="4" strokeDasharray="5 3.5" />
          </svg>
          <span className="text-[12.5px] font-bold">Shortest path</span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1">
          <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular text-heat md:text-[36px]">
            {Math.round(short.coverage * 100)}%
          </span>
          <span className="text-[12px] font-semibold text-ink-3">{label.toLowerCase()}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-ink-2">
          <span className="flex items-center gap-1 tabular"><RouteIcon size={12} />{fmtDist(short.distance)}</span>
          <span className="flex items-center gap-1 tabular"><Clock size={12} />{Math.round(short.minutes)} min</span>
          {short.floodSegments.length > 0 && cond.weather === 'rainy' && (
            <span className="flex items-center gap-1 font-semibold text-sos"><Zap size={12} />Floods</span>
          )}
        </div>
      </div>
      <div className="pointer-events-auto relative overflow-hidden rounded-[20px] bg-forest p-3.5 text-white shadow-float md:p-4">
        <div className="absolute -right-8 -top-10 size-32 rounded-full bg-mint/15 blur-xl" />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-1 w-6 shrink-0 rounded-full bg-mint" />
            <span className="text-[12.5px] font-bold">ShadeSmart</span>
          </div>
          <button
            onClick={onPreview}
            disabled={walking}
            aria-label="Race both routes"
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/12 px-2 py-1 text-[11px] font-bold transition hover:bg-white/20 disabled:opacity-50 sm:px-2.5"
          >
            <Play size={11} fill="currentColor" /> <span className="hidden sm:inline">{walking ? 'Racing' : 'Race both'}</span>
          </button>
        </div>
        <div className="relative mt-2.5 flex items-baseline gap-1">
          <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular text-mint md:text-[36px]">
            {Math.round(smart.coverage * 100)}%
          </span>
          <span className="text-[12px] font-semibold text-white/60">{label.toLowerCase()}</span>
          {dCov > 0 && (
            <span className="ml-auto hidden rounded-full bg-mint px-2 py-0.5 font-mono text-[11px] font-bold text-forest tabular sm:inline">
              +{dCov}%
            </span>
          )}
        </div>
        <div className="relative mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-white/80">
          <span className="flex items-center gap-1 tabular"><RouteIcon size={12} />{fmtDist(smart.distance)}</span>
          <span className="flex items-center gap-1 tabular"><Clock size={12} />{Math.round(smart.minutes)} min</span>
          <span className="tabular text-white/55">
            {dDist >= 1 ? `+${Math.round(dDist)} m · +${Math.max(1, Math.round(dMin))} min` : 'same distance'}
          </span>
        </div>
        {rerouted && (
          <div className="relative mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-mint">
            <ShieldCheck size={12} /> Flooded segments avoided
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- bottom insights ----------

export function InsightsStrip({
  cond,
  shortRoute,
  smartRoute,
  short,
  smart,
  ov,
  onHour,
}: {
  cond: Conditions
  shortRoute: Route | null
  smartRoute: Route | null
  short: RouteStats | null
  smart: RouteStats | null
  ov?: EdgeOverrides
  onHour: (h: number) => void
}) {
  const [tab, setTab] = useState<'impact' | 'surface'>('impact')
  const profile = useMemo(() => {
    if (!shortRoute?.found || !smartRoute?.found) return []
    const a = routeProfile(shortRoute, cond, 40, ov)
    const b = routeProfile(smartRoute, cond, 40, ov)
    return a.map((x, i) => ({ k: Math.round((i / 40) * 100), short: x.v, smart: b[i]?.v ?? 0 }))
  }, [shortRoute, smartRoute, cond, ov])

  if (!short || !smart) return null
  const label = coverageLabel(cond)
  const sunMinSaved = Math.max(0, short.exposedMinutes - smart.exposedMinutes)
  const carKgCO2 = (smart.distance / 1000) * 2 * 0.192 // a return trip by car
  const kcal = Math.round(smart.distance * 0.06)

  return (
    <div className="grid shrink-0 gap-3 border-t border-line bg-paper p-3 md:grid-cols-2 md:p-4 lg:grid-cols-[1.3fr_1.15fr_1fr]">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>{label} along your walk</Eyebrow>
          </div>
          <div className="flex gap-3 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-heat" />Shortest</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-leaf" />ShadeSmart</span>
          </div>
        </div>
        <div className="mt-2 h-[118px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={profile} margin={{ top: 6, right: 4, left: -26, bottom: 0 }}>
              <defs>
                <linearGradient id="gSmart" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d7a4b" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#1d7a4b" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gShort" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e4572e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#e4572e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e7e0d2" />
              <XAxis dataKey="k" tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} interval={9} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e0d9ca', background: '#fbf9f4', fontSize: 12 }}
                labelFormatter={(v) => `${v}% along route`}
                formatter={(v, n) => [`${v}%`, n === 'smart' ? 'ShadeSmart' : 'Shortest']}
              />
              <Area type="stepAfter" dataKey="short" stroke="#e4572e" strokeWidth={2} strokeDasharray="5 3" fill="url(#gShort)" />
              <Area type="stepAfter" dataKey="smart" stroke="#1d7a4b" strokeWidth={2.4} fill="url(#gSmart)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <SunShadow cond={cond} onHour={onHour} />
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow>{tab === 'impact' ? 'Why it matters' : 'Surface mix'}</Eyebrow>
          <div className="w-[150px]">
            <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'impact', label: 'Impact' }, { value: 'surface', label: 'Surfaces' }]} />
          </div>
        </div>
        {tab === 'surface' ? (
          <>
            <div className="mt-3 space-y-3">
              {[
                { name: 'Shortest', s: short },
                { name: 'ShadeSmart', s: smart },
              ].map(({ name, s }) => (
                <div key={name}>
                  <div className="mb-1.5 flex justify-between text-[12px] font-semibold">
                    <span>{name}</span>
                    <span className="tabular text-ink-3">{fmtDist(s.distance)}</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-paper-2">
                    {(['canopy', 'covered', 'building', 'open'] as Surface[]).map((k) => (
                      <span
                        key={k}
                        title={`${SURFACE_META[k].label}: ${fmtDist(s.surface[k])}`}
                        style={{ width: `${(s.surface[k] / s.distance) * 100}%`, background: SURFACE_META[k].color }}
                        className="h-full transition-all duration-500"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {(['canopy', 'covered', 'building', 'open'] as Surface[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px] font-medium text-ink-2">
                  <span className="size-2 rounded-sm" style={{ background: SURFACE_META[k].color }} />
                  {SURFACE_META[k].label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {cond.night ? (
            <>
                  <Stat icon={Lightbulb} value={pct(smart.lit)} label="route lit" accent />
                  <Stat icon={ShieldCheck} value={pct(smart.cctvCoverage)} label="CCTV watched" />
                  <Stat icon={Footprints} value={`${smart.crossings}`} label="road crossings" />
                  <Stat icon={Clock} value={`${Math.round(smart.minutes)}m`} label="walk time" />
            </>
          ) : (
            <>
                  <Stat
                    icon={Thermometer}
                    value={`${smart.feelsLike.toFixed(0)}°`}
                    label={`feels like · vs ${short.feelsLike.toFixed(0)}°`}
                    accent
                  />
                  <Stat
                    icon={cond.weather === 'rainy' ? Umbrella : Flame}
                    value={`${sunMinSaved.toFixed(1)}m`}
                    label={cond.weather === 'rainy' ? 'less in the rain' : 'less in direct sun'}
                  />
                  <Stat icon={Car} value={`${carKgCO2.toFixed(2)}kg`} label="CO₂ saved vs driving" />
                  <Stat icon={Footprints} value={`${kcal}`} label="kcal burned" />
            </>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function Stat({ icon: Icon, value, label, accent }: { icon: typeof Sun; value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-ink-3">
        <Icon size={13} strokeWidth={2.3} />
      </div>
      <div className={clsx('mt-1 font-display text-[24px] font-extrabold leading-none tracking-[-0.03em] tabular', accent && 'text-leaf')}>
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-tight text-ink-3">{label}</div>
    </div>
  )
}
