import clsx from 'clsx'
import {
  Accessibility,
  Car,
  CircleDollarSign,
  Clock,
  CloudRain,
  Droplet,
  Flame,
  Footprints,
  HeartPulse,
  Leaf,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Sun,
  ThermometerSun,
  TrafficCone,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  airTemp,
  routeProfile,
  routeStats,
  uvIndex,
  type Conditions,
  type EdgeOverrides,
  type Route,
  type RouteStats,
  type Surface,
} from '../lib/engine'
import { fmtDist, fmtTime, pct, SURFACE_META } from '../lib/meta'
import { coverageLabel } from './Navigate'
import { SunShadow } from './SunShadow'
import { Card, Eyebrow, Segmented } from './ui'

const tip = { borderRadius: 12, border: '1px solid #e0d9ca', background: '#fbf9f4', fontSize: 12 }

/** Phone/tablet Insights tab: a scrollable story of what the ShadeSmart route means for you. */
export function MobileInsights({
  cond,
  shortRoute,
  smartRoute,
  short,
  smart,
  ov,
  onHour,
}: {
  cond: Conditions
  shortRoute: Route
  smartRoute: Route
  short: RouteStats | null
  smart: RouteStats | null
  ov?: EdgeOverrides
  onHour: (h: number) => void
}) {
  const [freq, setFreq] = useState<'week' | 'month'>('week')

  // shade of the ShadeSmart route at every hour — when is the best time to set off?
  const byHour = useMemo(() => {
    if (!smartRoute.found) return []
    const out = []
    for (let h = 7; h <= 19; h += 0.5) {
      const c = { ...cond, hour: h, night: false, weather: 'sunny' as const }
      const s = routeStats(smartRoute, c, ov)
      const sh = routeStats(shortRoute, c, ov)
      out.push({ h, label: fmtTime(h), smart: Math.round(s.shade * 100), short: Math.round(sh.shade * 100), feels: Math.round(s.feelsLike) })
    }
    return out
  }, [smartRoute, shortRoute, cond, ov])

  const profile = useMemo(() => {
    if (!shortRoute.found || !smartRoute.found) return []
    const a = routeProfile(shortRoute, cond, 30, ov)
    const b = routeProfile(smartRoute, cond, 30, ov)
    return a.map((x, i) => ({ k: Math.round((i / 30) * 100), short: x.v, smart: b[i]?.v ?? 0 }))
  }, [shortRoute, smartRoute, cond, ov])

  if (!short || !smart) return null

  const label = coverageLabel(cond)
  const sunSaved = Math.max(0, short.exposedMinutes - smart.exposedMinutes)
  const best = byHour.length ? byHour.reduce((b, x) => (x.feels < b.feels || (x.feels === b.feels && x.smart > b.smart) ? x : b)) : null
  const worst = byHour.length ? byHour.reduce((b, x) => (x.feels > b.feels ? x : b)) : null

  // heat stress zones on feels-like °C
  const feels = smart.feelsLike
  const zone =
    cond.night || cond.weather === 'rainy'
      ? { name: 'Comfortable', color: '#1d7a4b', tip: 'No heat risk right now.' }
      : feels < 32
        ? { name: 'Comfortable', color: '#1d7a4b', tip: 'Easy walk. Carry water anyway.' }
        : feels < 36
          ? { name: 'Caution', color: '#d9900f', tip: 'Stay in the shade and slow your pace.' }
          : feels < 40
            ? { name: 'High', color: '#e4572e', tip: 'Drink before you leave; avoid the shortest path.' }
            : { name: 'Danger', color: '#b3261e', tip: 'Postpone if you can — heat exhaustion risk.' }
  const gaugePos = Math.max(0, Math.min(1, (feels - 26) / 18))
  const water = Math.round((smart.minutes * (cond.night ? 4 : cond.weather === 'rainy' ? 5 : 9 + uvIndex(cond.hour, cond.weather) * 0.6)) / 5) * 5

  // impact if this trip replaces a return car trip
  const trips = freq === 'week' ? 10 : 44
  const km = (smart.distance / 1000) * 2
  const co2 = km * 0.192 * (trips / 2)
  const rm = km * 0.62 * (trips / 2) // fuel + parking-ish per km
  const kcal = Math.round(smart.distance * 0.06 * trips)
  const sunHrs = (sunSaved * trips) / 60

  const surfaces: Surface[] = ['canopy', 'covered', 'building', 'open']
  const surfData = surfaces.map((s) => ({
    s,
    name: SURFACE_META[s].label,
    short: Math.round((short.surface[s] / short.distance) * 100),
    smart: Math.round((smart.surface[s] / smart.distance) * 100),
    color: SURFACE_META[s].color,
  }))

  return (
    <div className="space-y-3 px-3">
      {/* hero */}
      <div className="relative overflow-hidden rounded-[24px] bg-forest p-5 text-white">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-mint/15 blur-2xl" />
        <div className="relative flex items-center gap-1.5 text-[12px] font-semibold text-mint">
          <Sparkles size={13} /> Your walk, decoded
        </div>
        <div className="relative mt-2 font-display text-[40px] font-extrabold leading-[0.9] tracking-[-0.04em] tabular">
          {cond.night ? pct(smart.lit) : `${sunSaved.toFixed(1)} min`}
        </div>
        <div className="relative mt-1.5 text-[14px] leading-snug text-white/80">
          {cond.night
            ? 'of your route is well lit — vs ' + pct(short.lit) + ' on the shortest path'
            : cond.weather === 'rainy'
              ? 'less time in the rain than the shortest path'
              : 'less time in direct sun than the shortest path'}
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/12 pt-3.5">
          <HeroStat value={`+${Math.round(smart.distance - short.distance)} m`} label="extra walk" />
          <HeroStat value={`+${Math.max(0, Math.round(smart.minutes - short.minutes))} min`} label="extra time" />
          <HeroStat value={`${Math.round((smart.coverage - short.coverage) * 100)}%`} label={`more ${label.toLowerCase()}`} accent />
        </div>
      </div>

      {/* heat stress */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Heat stress on arrival</Eyebrow>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] tabular" style={{ color: zone.color }}>
                {feels.toFixed(0)}°
              </span>
              <span className="text-[13px] font-semibold" style={{ color: zone.color }}>
                {zone.name}
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-paper-2 px-3 py-2 text-right">
            <div className="text-[11px] text-ink-3">Shortest path</div>
            <div className="font-display text-[18px] font-extrabold tabular text-heat">{short.feelsLike.toFixed(0)}°</div>
          </div>
        </div>
        <div className="relative mt-4 h-2.5 rounded-full" style={{ background: 'linear-gradient(90deg,#1d7a4b 0%,#9cc77a 25%,#f2b33d 45%,#e4572e 70%,#b3261e 100%)' }}>
          <span
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-soft transition-[left] duration-500"
            style={{ left: `${gaugePos * 100}%`, background: zone.color }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] font-medium text-ink-3">
          <span>26°</span>
          <span>32°</span>
          <span>36°</span>
          <span>40°+</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini icon={ThermometerSun} value={`${airTemp(cond.hour, cond.weather, cond.night).toFixed(0)}°C`} label="air temp" />
          <Mini icon={Sun} value={`UV ${uvIndex(cond.hour, cond.weather, cond.night)}`} label="sun strength" />
          <Mini icon={Droplet} value={`${water} ml`} label="water to carry" />
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium" style={{ background: `${zone.color}14`, color: zone.color }}>
          <HeartPulse size={14} className="shrink-0" /> {zone.tip}
        </div>
      </Card>

      {/* best time to leave */}
      {best && worst && (
        <Card className="p-4">
          <Eyebrow>Best time to leave</Eyebrow>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular">{best.label}</span>
            <span className="text-[12px] font-semibold text-leaf">feels {best.feels}° · {best.smart}% shade</span>
          </div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            Hottest at {worst.label} — feels {worst.feels}°. Tap a bar to try that time.
          </div>
          <div className="mt-3 h-[130px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byHour} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
                <XAxis dataKey="h" ticks={[8, 10, 12, 14, 16, 18]} tickFormatter={(h) => `${h}h`} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
 <YAxis domain={[24, 'dataMax + 1']} tickFormatter={(v) => `${v}°`} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: '#00000008' }} labelFormatter={(h) => fmtTime(Number(h))} formatter={(v) => [`feels ${v}°C`, 'On ShadeSmart route']} />
                <Bar dataKey="feels" radius={[4, 4, 0, 0]} onClick={(d) => onHour((d as unknown as { h: number }).h)} className="cursor-pointer">
                  {byHour.map((x) => (
                    <Cell
                      key={x.h}
                      fill={x.h === best.h ? '#1d7a4b' : Math.abs(x.h - cond.hour) < 0.26 && !cond.night ? '#13140f' : x.feels < 32 ? '#9cc77a' : x.feels < 36 ? '#f2b33d' : '#ef7a35'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-3 text-[11px] font-medium text-ink-3">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-leaf" />Best</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-ink" />Now</span>
          </div>
        </Card>
      )}

      {/* shade along route */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>{label} along your walk</Eyebrow>
          <div className="flex gap-2.5 text-[11px] font-semibold">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-heat" />Shortest</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-leaf" />ShadeSmart</span>
          </div>
        </div>
        <div className="mt-2 h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={profile} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id="mSmart" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d7a4b" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#1d7a4b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="k" tickFormatter={(v) => (v === 0 ? 'Start' : v === 100 ? 'End' : '')} ticks={[0, 100]} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
              <ReferenceLine y={50} stroke="#e7e0d2" />
              <Area type="stepAfter" dataKey="short" stroke="#e4572e" strokeWidth={2} strokeDasharray="5 3" fill="none" />
              <Area type="stepAfter" dataKey="smart" stroke="#1d7a4b" strokeWidth={2.4} fill="url(#mSmart)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* what you walk on */}
      <Card className="p-4">
        <Eyebrow>What you'll walk on</Eyebrow>
        <div className="mt-3 space-y-2.5">
          {surfData.map((d) => {
            const Icon = SURFACE_META[d.s].icon
            return (
              <div key={d.s}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className="grid size-6 place-items-center rounded-md text-white" style={{ background: d.color }}>
                      <Icon size={12} strokeWidth={2.4} />
                    </span>
                    {d.name}
                  </span>
                  <span className="font-mono text-[11.5px] tabular text-ink-3">
                    {d.short}% → <b style={{ color: d.color }}>{d.smart}%</b>
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-paper-2">
                  <span className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${d.short}%`, background: d.color }} />
                  <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${d.smart}%`, background: d.color }} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2.5 text-[11px] text-ink-3">Faded bar = shortest path · solid = ShadeSmart</div>
      </Card>

      {/* safety snapshot */}
      <Card className="p-4">
        <Eyebrow>Safety snapshot</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Check icon={Lightbulb} label="Lit streets" value={pct(smart.lit)} good={smart.lit >= 0.7} />
          <Check icon={ShieldCheck} label="CCTV watched" value={pct(smart.cctvCoverage)} good={smart.cctvCoverage >= 0.3} />
          <Check icon={TrafficCone} label="Road crossings" value={`${smart.crossings}`} good={smart.crossings <= short.crossings} />
          <Check icon={CloudRain} label="Flood spots" value={`${smart.floodSegments.length}`} good={smart.floodSegments.length === 0} />
          <Check icon={Accessibility} label="Step-free" value={cond.wheelchair ? 'Yes' : 'Not set'} good={cond.wheelchair} />
          <Check icon={Clock} label="Walk time" value={`${Math.round(smart.minutes)} min`} good />
        </div>
      </Card>

      {/* habit impact */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>If you walk this instead of driving</Eyebrow>
          <div className="w-[136px] shrink-0">
            <Segmented
              size="sm"
              value={freq}
              onChange={setFreq}
              options={[
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Impact icon={Leaf} color="#1d7a4b" value={`${co2.toFixed(1)} kg`} label="CO₂ avoided" />
          <Impact icon={CircleDollarSign} color="#c98a0b" value={`RM ${rm.toFixed(0)}`} label="fuel & parking saved" />
          <Impact icon={Flame} color="#e4572e" value={kcal.toLocaleString()} label="kcal burned" />
          <Impact icon={Sun} color="#d9900f" value={`${sunHrs.toFixed(1)} h`} label="less in direct sun" />
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-3">
          <Car size={12} /> Based on {trips} trips ({fmtDist(smart.distance)} each way)
        </div>
      </Card>

      {/* sun & shadow */}
      <Card className="p-4">
        <SunShadow cond={cond} onHour={onHour} />
      </Card>

      <div className="flex items-center justify-center gap-1.5 pb-2 pt-1 text-[11px] text-ink-3">
        <Footprints size={12} /> Estimates from demo data
      </div>
    </div>
  )
}

function HeroStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={clsx('font-display text-[18px] font-extrabold leading-none tabular', accent && 'text-mint')}>{value}</div>
      <div className="mt-1 text-[10.5px] text-white/60">{label}</div>
    </div>
  )
}

function Mini({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="rounded-xl bg-paper-2/70 px-2.5 py-2">
      <Icon size={13} className="text-ink-3" />
      <div className="mt-1 text-[14px] font-bold tabular">{value}</div>
      <div className="text-[10.5px] text-ink-3">{label}</div>
    </div>
  )
}

function Check({ icon: Icon, label, value, good }: { icon: LucideIcon; label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2">
      <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', good ? 'bg-leaf/12 text-leaf' : 'bg-sun/20 text-[#8a5a00]')}>
        <Icon size={15} strokeWidth={2.3} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold leading-tight tabular">{value}</span>
        <span className="block truncate text-[11px] text-ink-3">{label}</span>
      </span>
    </div>
  )
}

function Impact({ icon: Icon, color, value, label }: { icon: LucideIcon; color: string; value: string; label: string }) {
  return (
    <div className="rounded-2xl px-3 py-3" style={{ background: `${color}12` }}>
      <Icon size={16} style={{ color }} />
      <div className="mt-1.5 font-display text-[22px] font-extrabold leading-none tracking-[-0.02em] tabular">{value}</div>
      <div className="mt-1 text-[11px] text-ink-2">{label}</div>
    </div>
  )
}
