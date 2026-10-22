import clsx from 'clsx'
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  ChevronDown,
  MapPin,
  CircleDollarSign,
  CloudRain,
  Droplets,
  Flame,
  Lightbulb,
  Moon,
  Plus,
  ShieldAlert,
  Siren,
  Sun,
  Trash2,
  Undo2,
  X,
  MousePointerClick,
  Trees,
  TrendingUp,
  Umbrella,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Area,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { FLOOD_BLOCK, town } from '../lib/engine'
import { fmtDist, fmtRM, fmtTime, pct, SHADE_STOPS, SURFACE_META } from '../lib/meta'
import {
  allCorridorStats,
  COST,
  corridorStats,
  networkHourly,
  PEAK,
  recommend,
  simulate,
  sosLog,
  surfaceMix,
  type CorridorStats,
  type Intervention,
} from '../lib/planner'
import type { PlannerLayer } from './MapView'
import { headline, placementImpact, TOOL_INFO, type Tool } from '../lib/placements'
import { WalkOrDrive } from './WalkOrDrive'
import { CITIES, type CityInfo } from '../lib/cities'
import { AnimatePresence, motion } from 'motion/react'
import { TOOL_COLOR, TOOL_ICON, ToolPicker } from './icons'
import { ProposalsInbox } from './Propose'
import type { Proposal, Status } from '../lib/proposals'
import { Card, Eyebrow, Range, Segmented } from './ui'

export interface PlanItem {
  corridorId: string
  name: string
  intervention: Intervention
  cost: number
  uplift: number
  residents: number
  exposureSaved: number
}

const tooltipStyle = { borderRadius: 12, border: '1px solid #e0d9ca', background: '#fbf9f4', fontSize: 12 }

// ---------- map overlays ----------

export interface PlantImpact {
  cost: number
  before: number
  after: number
  localBefore: number
  localAfter: number
  localLen: number
  walkers: number
  counts: Record<Tool, number>
}


function PlantToolbar({
  tool,
  setTool,
  impact,
  count,
  onUndo,
  onClear,
}: {
  tool: Tool | null
  setTool: (t: Tool | null) => void
  impact: PlantImpact
  count: number
  onUndo: () => void
  onClear: () => void
}) {
  const delta = (impact.after - impact.before) * 100
  const hl = headline((Object.keys(impact.counts) as Tool[]).filter((t) => impact.counts[t] > 0), impact as ReturnType<typeof placementImpact>)
  return (
    <div className="thin-scroll absolute right-3 top-[64px] z-10 max-h-[calc(100%-140px)] w-[252px] overflow-y-auto rounded-[20px] md:right-4 md:top-4">
      <div className="rounded-[20px] border border-line bg-card/95 p-3 shadow-float backdrop-blur">
        <div className="flex items-center justify-between px-1">
          <Eyebrow>Plant it yourself</Eyebrow>
          <div className="flex gap-1">
            <button aria-label="Undo last placement" disabled={!count} onClick={onUndo} className="grid size-7 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 disabled:opacity-30">
              <Undo2 size={14} />
            </button>
            <button aria-label="Clear all placements" disabled={!count} onClick={onClear} className="grid size-7 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-heat disabled:opacity-30">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="mt-1.5">
          <ToolPicker tool={tool} setTool={setTool} counts={impact.counts} />
        </div>
        {tool ? (
          <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-sun/20 px-2.5 py-2 text-[11px] font-semibold text-[#7a5200]">
            <MousePointerClick size={13} /> {TOOL_INFO[tool].label} · {fmtRM(TOOL_INFO[tool].cost)} — click a path
          </div>
        ) : (
          !count && <div className="mt-2 px-1 text-[11px] leading-snug text-ink-3">Pick a tool, then click a red street.</div>
        )}
        {count > 0 && (
          <div className="mt-2.5 border-t border-line px-1 pt-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold capitalize text-ink-2">
                {hl.label} · {Math.round(impact.localLen)} m improved
              </span>
            </div>
            <div className="mt-1 font-display text-[24px] font-extrabold leading-none tabular">
              {hl.before} <span className="text-ink-3">→</span> <span className="text-leaf">{hl.after}</span>
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-ink-3 tabular">
              whole township {(impact.before * 100).toFixed(1)}% → {(impact.after * 100).toFixed(1)}% (+{delta.toFixed(2)})
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <div className="font-display text-[16px] font-extrabold tabular">{fmtRM(impact.cost)}</div>
                <div className="text-[10px] text-ink-3">capex</div>
              </div>
              <div>
                <div className="font-display text-[16px] font-extrabold tabular">{impact.walkers.toLocaleString()}</div>
                <div className="text-[10px] text-ink-3">walkers/day</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Small screens: a floating button opens the tools in a slide-up sheet that can be closed. */
function PlantSheet(props: {
  tool: Tool | null
  setTool: (t: Tool | null) => void
  impact: PlantImpact
  count: number
  onUndo: () => void
  onClear: () => void
}) {
  const { tool, setTool, impact, count, onUndo, onClear } = props
  const [open, setOpen] = useState(false)
  const pick = (t: Tool | null) => {
    setTool(t)
    if (t) setOpen(false) // get out of the way so the map can be tapped
  }
  return (
    <>
      {tool ? (
        <div className="absolute inset-x-2 bottom-2 z-20 flex items-center gap-2 rounded-2xl bg-ink p-1.5 pl-3 text-white shadow-float">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: TOOL_COLOR[tool] }}>
            {(() => {
              const I = TOOL_ICON[tool]
              return <I size={14} strokeWidth={2.4} />
            })()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">Tap a street to add {TOOL_INFO[tool].label.toLowerCase()}</span>
          <button aria-label="Undo" disabled={!count} onClick={onUndo} className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-30">
            <Undo2 size={14} />
          </button>
          <button onClick={() => setTool(null)} className="rounded-full bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink">
            Done
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-full bg-leaf px-4 py-2.5 text-[13px] font-bold text-white shadow-float active:scale-95"
        >
          <Trees size={15} /> Plant{count ? ` · ${count}` : ''}
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[65]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
            <motion.div
              role="dialog"
              aria-label="Plant it yourself"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[28px] bg-card px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 shadow-float"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
              <div className="flex items-center justify-between">
                <div className="font-display text-[20px] font-extrabold tracking-[-0.02em]">Plant it yourself</div>
                <div className="flex gap-1">
                  <button aria-label="Clear all" disabled={!count} onClick={onClear} className="grid size-9 place-items-center rounded-full bg-paper-2 disabled:opacity-30">
                    <Trash2 size={15} />
                  </button>
                  <button aria-label="Close" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full bg-paper-2">
                    <X size={16} />
                  </button>
                </div>
              </div>
              {count > 0 && (
                <div className="mt-3 rounded-2xl bg-forest px-4 py-3 text-white">
                  <div className="text-[11px] text-white/60">Shade on streets you changed</div>
                  <div className="font-display text-[22px] font-extrabold tabular">
                    {Math.round(impact.localBefore * 100)}% → <span className="text-mint">{Math.round(impact.localAfter * 100)}%</span>
                  </div>
                  <div className="text-[11.5px] text-white/70">{fmtRM(impact.cost)} · {impact.walkers.toLocaleString()} walkers/day</div>
                </div>
              )}
              <div className="mt-3">
                <ToolPicker tool={tool} setTool={pick} counts={impact.counts} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export function PlannerMapOverlay({
  layer,
  setLayer,
  hour,
  tool,
  setTool,
  impact,
  placementCount,
  onUndo,
  onClear,
  compact,
}: {
  compact?: boolean
  layer: PlannerLayer
  setLayer: (l: PlannerLayer) => void
  hour: number
  tool: Tool | null
  setTool: (t: Tool | null) => void
  impact: PlantImpact
  placementCount: number
  onUndo: () => void
  onClear: () => void
}) {
  const legend = {
    heat: ['Fully exposed', 'Fully shaded'],
    flood: ['Floods in downpour', 'Dry & elevated'],
    night: ['Dark', 'Well lit'],
  }[layer]
  const dark = layer === 'night'
  return (
    <>
      {compact ? (
        <PlantSheet tool={tool} setTool={setTool} impact={impact} count={placementCount} onUndo={onUndo} onClear={onClear} />
      ) : (
        <PlantToolbar tool={tool} setTool={setTool} impact={impact} count={placementCount} onUndo={onUndo} onClear={onClear} />
      )}
      <div className="absolute left-3 right-3 top-3 z-10 md:left-4 md:right-auto md:top-4 md:w-[min(400px,calc(100%-284px))]">
        <div className={clsx('rounded-full p-0 shadow-float', dark ? 'bg-night' : 'bg-card')}>
          <Segmented
            size="sm"
            dark={dark}
            value={layer}
            onChange={setLayer}
            options={[
              { value: 'heat', label: 'Heat gaps', icon: Flame },
              { value: 'flood', label: 'Flood risk', icon: Droplets },
              { value: 'night', label: 'Night safety', icon: Moon },
            ]}
          />
        </div>
      </div>

      <div className={clsx('absolute bottom-3 left-3 z-10 rounded-2xl border border-line bg-card/95 px-3.5 py-3 shadow-float backdrop-blur md:bottom-4 md:left-4', compact && 'hidden')}>
        <Eyebrow>{layer === 'heat' ? `Shade at ${fmtTime(hour)}` : layer === 'flood' ? 'Flood risk' : 'Lighting'}</Eyebrow>
        <div
          className="mt-2 h-2 w-44 rounded-full"
          style={{ background: `linear-gradient(to right, ${SHADE_STOPS.map(([s, c]) => `${c} ${s * 100}%`).join(',')})` }}
        />
        <div className="mt-1.5 flex justify-between text-[10.5px] font-medium text-ink-3">
          <span>{legend[0]}</span>
          <span>{legend[1]}</span>
        </div>
        {layer === 'night' && (
          <div className="mt-2 flex gap-3 text-[10.5px] font-medium text-ink-2">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#ffc95c]" />Streetlight</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#5b8def] ring-1 ring-white" />CCTV</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-rain" />Guard post</span>
          </div>
        )}
      </div>

    </>
  )
}

// ---------- side panel ----------

type Tab = 'overview' | 'proposals' | 'hotspots' | 'plan' | 'safety'

export function PlannerPanel({
  hour,
  layer,
  selected,
  setSelected,
  plan,
  setPlan,
  onPlanAdded,
  proposals,
  reviewing,
  setReviewing,
  onDecide,
  city,
  onCity,
}: {
  city: CityInfo
  onCity: (id: string) => void
  hour: number
  layer: PlannerLayer
  selected: string | null
  setSelected: (id: string | null) => void
  plan: PlanItem[]
  setPlan: (p: PlanItem[]) => void
  onPlanAdded: (item: PlanItem) => void
  proposals: Proposal[]
  reviewing: string | null
  setReviewing: (id: string | null) => void
  onDecide: (id: string, s: Status) => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const pending = proposals.filter((p) => p.status === 'review').length
  useEffect(() => {
    if (reviewing) setTab('proposals')
  }, [reviewing])
  const stats = useMemo(() => allCorridorStats(PEAK), [])
  useEffect(() => {
    if (selected) setTab('hotspots')
  }, [selected])
  useEffect(() => {
    if (layer === 'night' || layer === 'flood') setTab((t) => (t === 'overview' ? 'safety' : t))
  }, [layer])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-5 pb-4 pt-5 md:px-6">
        <div className="flex items-center gap-2 text-leaf">
          <Building2 size={15} strokeWidth={2.4} />
          <Eyebrow className="text-leaf">Developer dashboard</Eyebrow>
        </div>
        <h2 className="mt-2 font-display text-[30px] font-extrabold leading-[0.95] tracking-[-0.04em]">
          Infrastructure Heat
          <br />& Safety Insights
        </h2>
        <label className="mt-4 flex items-center gap-2.5 rounded-2xl border border-line bg-card px-3 py-2 shadow-soft">
          <MapPin size={15} className="shrink-0 text-leaf" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">City</span>
            <select
              value={city.id}
              onChange={(e) => onCity(e.target.value)}
              aria-label="City"
              className="-ml-1 w-full cursor-pointer appearance-none bg-transparent text-[15px] font-bold outline-none"
            >
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.area}
                </option>
              ))}
            </select>
          </span>
          <ChevronDown size={16} className="shrink-0 text-ink-3" />
        </label>
        <div className="no-scrollbar -mx-1 mt-4 flex gap-1 overflow-x-auto px-1">
          {(
            [
              ['overview', 'Overview'],
              ['proposals', `Proposals${pending ? ` · ${pending}` : ''}`],
              ['hotspots', 'Hotspots'],
              ['plan', `Plan${plan.length ? ` · ${plan.length}` : ''}`],
              ['safety', 'Safety'],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={clsx(
                'whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
                tab === k ? 'bg-ink text-white' : 'text-ink-2 hover:bg-paper-2',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === 'overview' && <Overview stats={stats} hour={hour} onPick={setSelected} />}
        {tab === 'hotspots' &&
          (selected ? (
            <CorridorDetail
              key={selected}
              id={selected}
              hour={hour}
              onBack={() => setSelected(null)}
              inPlan={plan.some((p) => p.corridorId === selected)}
              onAdd={(item) => {
                setPlan([...plan.filter((p) => p.corridorId !== item.corridorId), item])
                onPlanAdded(item)
              }}
            />
          ) : (
            <Hotspots stats={stats} onPick={setSelected} />
          ))}
        {tab === 'plan' && <CapitalPlan plan={plan} setPlan={setPlan} goHotspots={() => setTab('hotspots')} />}
        {tab === 'safety' && <Safety />}
        {tab === 'proposals' && <ProposalsInbox proposals={proposals} selected={reviewing} setSelected={setReviewing} onDecide={onDecide} />}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: string; sub: string; tone?: 'heat' | 'leaf' | 'rain' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-2">
        <Icon size={13} strokeWidth={2.4} className={tone === 'heat' ? 'text-heat' : tone === 'rain' ? 'text-rain' : 'text-leaf'} />
        {label}
      </div>
      <div className="mt-2 font-display text-[32px] font-extrabold leading-none tracking-[-0.04em] tabular">{value}</div>
      <div className="mt-1.5 text-[11.5px] text-ink-3">{sub}</div>
    </Card>
  )
}

function Overview({ stats, hour, onPick }: { stats: CorridorStats[]; hour: number; onPick: (id: string) => void }) {
  const hourly = useMemo(() => networkHourly(), [])
  const mix = useMemo(() => surfaceMix(), [])
  const totalLen = town.edges.reduce((s, e) => s + e.len, 0)
  const noon = hourly.find((h) => h.hour === PEAK)!.shade
  const hotspots = stats.filter((s) => s.peakShade < 0.2)
  const avgWalk = Math.round(stats.reduce((s, x) => s + x.walkability * x.corridor.len, 0) / stats.reduce((s, x) => s + x.corridor.len, 0))
  const dailyWalkers = hourly.reduce((s, h) => s + h.pedestrians, 0)
  const flooded = town.edges.filter((e) => e.flood >= FLOOD_BLOCK).reduce((s, e) => s + e.len, 0)
  const dark = town.edges.filter((e) => e.lit < 0.4).reduce((s, e) => s + e.len, 0)

  const radar = [
    { k: 'Thermal', v: noon },
    { k: 'Safety', v: Math.round((1 - dark / totalLen) * 100) },
    { k: 'Flood', v: Math.round((1 - flooded / totalLen) * 100) },
    { k: 'Access', v: Math.round((town.edges.filter((e) => e.wheelchair).reduce((s, e) => s + e.len, 0) / totalLen) * 100) },
    { k: 'Connect', v: 74 },
  ]
  const donut = (['canopy', 'covered', 'building', 'open'] as const)
    .map((k) => ({ k, name: SURFACE_META[k].label, v: Math.round(mix[k]), color: SURFACE_META[k].color }))
    .filter((d) => d.v > 0)

  return (
    <div className="space-y-4 p-5 md:p-6">
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={Sun} label="Network shaded at 1pm" value={`${noon}%`} sub={`of ${(totalLen / 1000).toFixed(0)} km of paths`} tone="heat" />
        <Kpi icon={TrendingUp} label="Walkability score" value={`${avgWalk}`} sub="out of 100" />
        <Kpi icon={Users} label="Daily pedestrians" value={dailyWalkers.toLocaleString()} sub="walking trips" />
        <Kpi icon={Flame} label="Heat hotspots" value={`${hotspots.length}`} sub="streets under 20% shade" tone="heat" />
      </div>

      <Card className="p-4">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow>Shade through the day</Eyebrow>
            <div className="mt-1 text-[13px] font-semibold">Network shade vs. people walking</div>
          </div>
          <div className="flex gap-3 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-leaf" />Shade %</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sun" />Walkers</span>
          </div>
        </div>
        <div className="mt-3 h-[170px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hourly} margin={{ top: 4, right: -14, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gShade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d7a4b" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#1d7a4b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e7e0d2" />
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="s" domain={[0, 100]} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="p" orientation="right" tick={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${h}:00`} formatter={(v, n) => (n === 'shade' ? [`${v}%`, 'Network shade'] : [Number(v).toLocaleString(), 'Pedestrians'])} />
              <Bar yAxisId="p" dataKey="pedestrians" fill="#f2b33d" fillOpacity={0.55} radius={[4, 4, 0, 0]} barSize={12} />
              <Area yAxisId="s" type="monotone" dataKey="shade" stroke="#1d7a4b" strokeWidth={2.4} fill="url(#gShade)" />
              <ReferenceLine yAxisId="s" x={Math.round(hour)} stroke="#13140f" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
          Shade collapses to <b>{noon}%</b> at 1pm — exactly when the lunch crowd walks to the shops.
        </p>
      </Card>

      <WalkOrDrive />

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <Eyebrow>Path surfaces</Eyebrow>
          <div className="relative mt-1 h-[130px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="v" innerRadius={38} outerRadius={58} paddingAngle={2} stroke="none">
                  {donut.map((d) => (
                    <Cell key={d.k} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtDist(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="font-display text-[20px] font-extrabold leading-none text-heat">{pct(mix.open / totalLen)}</div>
                <div className="text-[9.5px] font-semibold text-ink-3">exposed</div>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {donut.map((d) => (
              <div key={d.k} className="flex items-center gap-1.5 text-[11px] font-medium text-ink-2">
                <span className="size-2 rounded-sm" style={{ background: d.color }} />
                <span className="flex-1">{d.name}</span>
                <span className="tabular text-ink-3">{pct(d.v / totalLen)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <Eyebrow>Liveability index</Eyebrow>
          <div className="mt-1 h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="66%" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <PolarGrid stroke="#e0d9ca" />
                <PolarAngleAxis dataKey="k" tick={{ fontSize: 9, fill: '#4a4b44', fontWeight: 600 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke="#1d7a4b" strokeWidth={2} fill="#1d7a4b" fillOpacity={0.22} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}/100`, 'Score']} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Top heat gaps</Eyebrow>
        </div>
        <div className="mt-2">
          {[...stats].sort((a, b) => b.priority - a.priority).slice(0, 3).map((s, i) => (
            <HotspotRow key={s.corridor.id} s={s} rank={i + 1} onPick={onPick} />
          ))}
        </div>
      </Card>
    </div>
  )
}

function HotspotRow({ s, rank, onPick }: { s: CorridorStats; rank: number; onPick: (id: string) => void }) {
  return (
    <button
      onClick={() => onPick(s.corridor.id)}
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-paper-2/70"
    >
      <span className="w-5 shrink-0 font-mono text-[12px] font-semibold text-ink-3 tabular">{String(rank).padStart(2, '0')}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{s.corridor.name}</span>
        <span className="mt-0.5 flex gap-2 text-[11.5px] text-ink-3">
          <span className="tabular">{fmtDist(s.corridor.len)}</span>·<span className="tabular">{s.footfall.toLocaleString()} walkers/day</span>
        </span>
      </span>
      <span
        className={clsx(
          'rounded-full px-2 py-0.5 font-mono text-[11.5px] font-bold tabular',
          s.peakShade < 0.2 ? 'bg-heat/12 text-heat' : s.peakShade < 0.45 ? 'bg-sun/20 text-[#8a5a00]' : 'bg-leaf/12 text-leaf',
        )}
      >
        {pct(s.peakShade)}
      </span>
      <ChevronRight size={15} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function Hotspots({ stats, onPick }: { stats: CorridorStats[]; onPick: (id: string) => void }) {
  const [filter, setFilter] = useState<'hot' | 'all'>('hot')
  const [more, setMore] = useState(false)
  const list = [...stats]
    .filter((s) => (filter === 'hot' ? s.peakShade < 0.2 : true))
    .sort((a, b) => b.priority - a.priority)
  return (
    <div className="p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold">Heat Gap corridors</div>
        </div>
        <div className="w-[150px]">
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'hot', label: '<20%' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-heat/8 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#8f2f12]">
        <b>{stats.filter((s) => s.peakShade < 0.2).length} corridors</b> have under 20% shade between 12pm and 3pm.
      </div>
      <div className="mt-2">
        {(more ? list : list.slice(0, 12)).map((s, i) => (
          <HotspotRow key={s.corridor.id} s={s} rank={i + 1} onPick={onPick} />
        ))}
        {list.length > 12 && (
          <button onClick={() => setMore(!more)} className="mt-2 w-full rounded-xl bg-paper-2 py-2.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
            {more ? 'Show top 12' : `Show all ${list.length}`}
          </button>
        )}
      </div>
    </div>
  )
}

function Stepper({
  icon: Icon,
  label,
  unit,
  value,
  max,
  step,
  onChange,
  cost,
}: {
  icon: LucideIcon
  label: string
  unit: string
  value: number
  max: number
  step: number
  onChange: (v: number) => void
  cost: string
}) {
  return (
    <div className="rounded-2xl border border-line px-3.5 pb-1.5 pt-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-paper-2 text-ink">
          <Icon size={15} strokeWidth={2.3} />
        </span>
        <span className="flex-1">
          <span className="block text-[13px] font-semibold leading-tight">{label}</span>
          <span className="block text-[11px] text-ink-3">{cost}</span>
        </span>
        <span className="font-display text-[22px] font-extrabold tabular">
          {value}
          <span className="ml-0.5 text-[12px] font-semibold text-ink-3">{unit}</span>
        </span>
      </div>
      <Range label={label} value={value} min={0} max={max} step={step} onChange={onChange} />
    </div>
  )
}

function CorridorDetail({
  id,
  hour,
  onBack,
  onAdd,
  inPlan,
}: {
  id: string
  hour: number
  onBack: () => void
  onAdd: (p: PlanItem) => void
  inPlan: boolean
}) {
  const c = town.corridors.find((x) => x.id === id)!
  const s = useMemo(() => corridorStats(c, hour), [c, hour])
  const [iv, setIv] = useState<Intervention>(() => recommend(s))
  const sim = simulate(s, iv)
  const after = s.hourly.map((h) => ({ ...h, after: Math.round(Math.min(100, h.shade + (sim.peakAfter - s.peakShade) * 100 * (h.hour === PEAK ? 1 : 0.85))) }))

  return (
    <div className="space-y-4 p-5 md:p-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2 hover:text-ink">
        <ArrowLeft size={14} /> All hotspots
      </button>
      <div>
        <h3 className="font-display text-[26px] font-extrabold leading-[1] tracking-[-0.035em]">{c.name}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Tag>{fmtDist(c.len)}</Tag>
          <Tag>{s.footfall.toLocaleString()} walkers/day</Tag>
          <Tag tone={s.peakShade < 0.2 ? 'heat' : undefined}>{pct(s.peakShade)} shade at 1pm</Tag>
          {s.floodProne && <Tag tone="rain">Flood-prone</Tag>}
          {s.lit < 0.4 && <Tag tone="night">Poorly lit</Tag>}
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Shade by hour</Eyebrow>
          <div className="flex gap-3 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-heat" />Today</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-leaf" />With plan</span>
          </div>
        </div>
        <div className="mt-2 h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={after} margin={{ top: 4, right: 0, left: -26, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e7e0d2" />
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(h) => `${h}:00`} formatter={(v, n) => [`${v}%`, n === 'after' ? 'With plan' : 'Today']} />
              <ReferenceLine y={20} stroke="#e4572e" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="shade" stroke="#e4572e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="after" stroke="#1d7a4b" strokeWidth={2.6} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Eyebrow>Intervention simulator</Eyebrow>
          <button onClick={() => setIv(recommend(s))} className="text-[11.5px] font-semibold text-leaf hover:underline">
            Reset to recommended
          </button>
        </div>
        <div className="space-y-2">
          <Stepper icon={Trees} label="Canopy trees" unit="" value={iv.trees} max={80} step={1} onChange={(v) => setIv({ ...iv, trees: v })} cost={`${fmtRM(COST.tree)} each · mature in 3–5 yrs`} />
          <Stepper icon={Umbrella} label="Covered walkway" unit="m" value={iv.canopyMeters} max={Math.min(300, Math.round(c.len / 10) * 10)} step={10} onChange={(v) => setIv({ ...iv, canopyMeters: v })} cost={`${fmtRM(COST.canopyPerMeter)} per metre`} />
          <Stepper icon={Lightbulb} label="Solar streetlights" unit="" value={iv.lights} max={30} step={1} onChange={(v) => setIv({ ...iv, lights: v })} cost={`${fmtRM(COST.light)} each`} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[22px] bg-forest p-5 text-white">
        <div className="absolute -right-12 -top-12 size-44 rounded-full bg-mint/12 blur-2xl" />
        <Eyebrow className="relative text-white/60">Projected impact</Eyebrow>
        <div className="relative mt-2 flex items-end gap-3">
          <div className="font-display text-[54px] font-extrabold leading-[0.85] tracking-[-0.05em] text-mint tabular">
            +{Math.round(sim.uplift * 100)}%
          </div>
          <div className="pb-1 text-[12.5px] leading-tight text-white/75">
            walkability
            <br />
            <span className="tabular">{s.walkability} → {sim.walkabilityAfter}</span>
          </div>
        </div>
        <p className="relative mt-3 text-[13px] leading-relaxed text-white/85">
          {iv.trees > 0 && <>Planting <b className="text-white">{iv.trees} canopy trees</b>{iv.canopyMeters > 0 ? ' and ' : ' '}</>}
          {iv.canopyMeters > 0 && <>building a <b className="text-white">{iv.canopyMeters} m covered walkway</b> </>}
          along {c.name} lifts noon shade from <b className="text-white">{pct(s.peakShade)}</b> to{' '}
          <b className="text-white">{pct(sim.peakAfter)}</b> for <b className="text-white">{sim.residents.toLocaleString()} residents</b> a day.
        </p>
        <div className="relative mt-4 grid grid-cols-3 gap-3 border-t border-white/12 pt-4">
          <MiniStat label="Capex" value={fmtRM(sim.cost)} />
          <MiniStat label="Per resident" value={fmtRM(sim.costPerResident)} />
          <MiniStat label="New walkers/day" value={`+${sim.extraWalkers}`} />
        </div>
        <button
          onClick={() =>
            onAdd({
              corridorId: c.id,
              name: c.name,
              intervention: iv,
              cost: sim.cost,
              uplift: sim.uplift,
              residents: sim.residents,
              exposureSaved: sim.exposureSaved,
            })
          }
          disabled={sim.cost === 0}
          className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-mint py-3 text-[14px] font-bold text-forest transition hover:bg-[#8fe09b] disabled:opacity-40"
        >
          <Plus size={16} strokeWidth={2.6} /> {inPlan ? 'Update in capital plan' : 'Add to capital plan'}
        </button>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-[19px] font-extrabold leading-none tabular">{value}</div>
      <div className="mt-1 text-[10.5px] text-white/55">{label}</div>
    </div>
  )
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'heat' | 'rain' | 'night' }) {
  return (
    <span
      className={clsx(
        'rounded-full px-2.5 py-1 text-[11px] font-semibold tabular',
        tone === 'heat' ? 'bg-heat/12 text-heat' : tone === 'rain' ? 'bg-rain/12 text-rain' : tone === 'night' ? 'bg-night text-white' : 'bg-paper-2 text-ink-2',
      )}
    >
      {children}
    </span>
  )
}

function CapitalPlan({ plan, setPlan, goHotspots }: { plan: PlanItem[]; setPlan: (p: PlanItem[]) => void; goHotspots: () => void }) {
  const BUDGET = 1_500_000
  const total = plan.reduce((s, p) => s + p.cost, 0)
  const residents = plan.reduce((s, p) => s + p.residents, 0)
  const hours = Math.round(plan.reduce((s, p) => s + p.exposureSaved, 0) / 60)
  const trees = plan.reduce((s, p) => s + p.intervention.trees, 0)
  const chart = plan.map((p) => ({ name: p.name.length > 16 ? p.name.slice(0, 15) + '…' : p.name, value: Math.round((p.uplift * 100 * 100000) / Math.max(1, p.cost)) }))

  if (!plan.length)
    return (
      <div className="p-6">
        <div className="rounded-[22px] border border-dashed border-line p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-paper-2">
            <CircleDollarSign size={22} />
          </span>
          <div className="mt-4 font-display text-[22px] font-extrabold tracking-[-0.03em]">No projects yet</div>
          <p className="mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-ink-2">
            Model an intervention on a heat gap corridor and add it here to build the landscape budget.
          </p>
          <button onClick={goHotspots} className="mt-5 rounded-full bg-ink px-5 py-2.5 text-[13px] font-bold text-white">
            Browse hotspots
          </button>
        </div>
      </div>
    )

  return (
    <div className="space-y-4 p-5 md:p-6">
      <Card className="p-5">
        <Eyebrow>FY2027 landscape budget</Eyebrow>
        <div className="mt-2 flex items-end justify-between">
          <div className="font-display text-[40px] font-extrabold leading-none tracking-[-0.045em] tabular">{fmtRM(total)}</div>
          <div className="pb-1 text-[12px] text-ink-3 tabular">of {fmtRM(BUDGET)}</div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-paper-2">
          <div
            className={clsx('h-full rounded-full transition-all duration-500', total > BUDGET ? 'bg-heat' : 'bg-leaf')}
            style={{ width: `${Math.min(100, (total / BUDGET) * 100)}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <div className="font-display text-[22px] font-extrabold leading-none tabular">{residents.toLocaleString()}</div>
            <div className="mt-1 text-[11px] text-ink-3">residents/day</div>
          </div>
          <div>
            <div className="font-display text-[22px] font-extrabold leading-none tabular">{hours.toLocaleString()}h</div>
            <div className="mt-1 text-[11px] text-ink-3">sun exposure saved/day</div>
          </div>
          <div>
            <div className="font-display text-[22px] font-extrabold leading-none tabular">{trees}</div>
            <div className="mt-1 text-[11px] text-ink-3">trees planted</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <Eyebrow>Impact per RM 100k</Eyebrow>
        <div className="mt-2" style={{ height: Math.max(90, chart.length * 38) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11, fill: '#4a4b44', fontWeight: 600 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`+${v} walkability pts`, 'per RM 100k']} />
              <Bar dataKey="value" fill="#1d7a4b" radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="space-y-2">
        {plan.map((p) => (
          <div key={p.corridorId} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-leaf/12 text-leaf">
              <Trees size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
              <span className="block text-[11.5px] text-ink-3">
                {[p.intervention.trees && `${p.intervention.trees} trees`, p.intervention.canopyMeters && `${p.intervention.canopyMeters} m canopy`, p.intervention.lights && `${p.intervention.lights} lights`].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-mono text-[12.5px] font-semibold tabular">{fmtRM(p.cost)}</span>
              <span className="block text-[11px] font-semibold text-leaf tabular">+{Math.round(p.uplift * 100)}%</span>
            </span>
            <button
              aria-label={`Remove ${p.name}`}
              onClick={() => setPlan(plan.filter((x) => x.corridorId !== p.corridorId))}
              className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-heat"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Safety() {
  const floodLen = town.edges.filter((e) => e.flood >= FLOOD_BLOCK).reduce((s, e) => s + e.len, 0)
  const darkLen = town.edges.filter((e) => e.lit < 0.4).reduce((s, e) => s + e.len, 0)
  const darkCorridors = useMemo(
    () =>
      allCorridorStats(PEAK)
        .filter((s) => s.lit < 0.45)
        .sort((a, b) => b.footfall - a.footfall)
        .slice(0, 4),
    [],
  )
  const floodCorridors = useMemo(
    () =>
      allCorridorStats(PEAK)
        .filter((s) => s.floodProne)
        .sort((a, b) => b.footfall - a.footfall)
        .slice(0, 4),
    [],
  )
  return (
    <div className="space-y-4 p-5 md:p-6">
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={CloudRain} label="Flood-prone paths" value={fmtDist(floodLen)} sub="auto-rerouted in rain" tone="rain" />
        <Kpi icon={Moon} label="Poorly-lit paths" value={fmtDist(darkLen)} sub="need lighting" tone="heat" />
        <Kpi icon={ShieldAlert} label="Guard posts" value={`${town.guardPosts.length}`} sub={`${town.cctvs.length} CCTV cameras`} />
        <Kpi icon={Siren} label="SOS avg response" value="4.9 min" sub="last 30 days" />
      </div>

      <Card className="p-4">
        <Eyebrow>Dark corridors · CPTED priority</Eyebrow>
        <div className="mt-2 space-y-0.5">
          {darkCorridors.map((s) => (
            <RiskRow key={s.corridor.id} name={s.corridor.name} meta={`${s.footfall.toLocaleString()} walkers/day`} value={`${pct(s.lit)} lit`} tone="night" />
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <Eyebrow>Flash-flood watch</Eyebrow>
        <div className="mt-2 space-y-0.5">
          {floodCorridors.map((s) => (
            <RiskRow key={s.corridor.id} name={s.corridor.name} meta="Low-lying · near retention lake" value={`Risk ${Math.round(s.flood * 100)}`} tone="rain" />
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Recent SOS alerts</Eyebrow>
        </div>
        <ul className="mt-2 divide-y divide-line">
          {sosLog().map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sos/10 text-sos">
                <Siren size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{s.kind}</span>
                <span className="block truncate text-[11.5px] text-ink-3">
                  {s.where} · {s.date}, {s.time}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-[12px] font-semibold tabular">{s.response} min</span>
                <span className={clsx('block text-[10.5px] font-semibold', s.status === 'Resolved' ? 'text-leaf' : 'text-[#8a5a00]')}>{s.status}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function RiskRow({ name, meta, value, tone }: { name: string; meta: string; value: string; tone: 'night' | 'rain' }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-1 py-2">
      <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg text-white', tone === 'night' ? 'bg-night' : 'bg-rain')}>
        {tone === 'night' ? <Moon size={14} /> : <Droplets size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{name}</span>
        <span className="block text-[11.5px] text-ink-3">{meta}</span>
      </span>
      <span className="font-mono text-[12px] font-semibold tabular">{value}</span>
    </div>
  )
}
