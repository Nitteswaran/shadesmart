import { Car, Footprints } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Eyebrow, Range } from './ui'

// Mock stated-preference curves: share of residents who would walk a trip of d metres.
const logistic = (d: number, mid: number, spread: number) => 1 / (1 + Math.exp((d - mid) / spread))
const walkToday = (d: number) => 0.97 * logistic(d, 330, 95)
const walkShaded = (d: number) => 0.97 * logistic(d, 820, 150)

const SHORT_TRIPS_PER_DAY = 6200 // township car trips under 1.5 km (mock)

export function WalkOrDrive() {
  const [d, setD] = useState(400)
  const data = useMemo(
    () =>
      Array.from({ length: 29 }, (_, i) => {
        const x = 100 + i * 50
        return { d: x, today: Math.round(walkToday(x) * 100), shaded: Math.round(walkShaded(x) * 100) }
      }),
    [],
  )
  const today = walkToday(d)
  const shaded = walkShaded(d)
  const tripsWon = Math.round(SHORT_TRIPS_PER_DAY * (shaded - today) * 0.35)
  const co2 = Math.round(tripsWon * (d / 1000) * 2 * 0.192)

  return (
    <Card className="p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Eyebrow>Walk or drive?</Eyebrow>
          <div className="mt-1 text-[13px] font-semibold">Share of residents who'd walk the trip</div>
        </div>
        <div className="flex gap-3 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-heat" />Today</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-leaf" />Shaded</span>
        </div>
      </div>
      <div className="mt-3 h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1d7a4b" stopOpacity={0.22} />
                <stop offset="1" stopColor="#1d7a4b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="d" type="number" domain={[100, 1500]} ticks={[200, 500, 800, 1100, 1400]} tickFormatter={(v) => `${v}m`} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#8a897f' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e0d9ca', background: '#fbf9f4', fontSize: 12 }}
              labelFormatter={(v) => `${v} m trip`}
              formatter={(v, n) => [`${v}% walk`, n === 'shaded' ? 'Shaded route' : '33°C today']}
            />
            <Area type="monotone" dataKey="shaded" stroke="none" fill="url(#gWon)" />
            <Line type="monotone" dataKey="today" stroke="#e4572e" strokeWidth={2.2} dot={false} />
            <Line type="monotone" dataKey="shaded" stroke="#1d7a4b" strokeWidth={2.6} dot={false} />
            <ReferenceLine x={d} stroke="#13140f" strokeDasharray="3 3" />
            <ReferenceDot x={d} y={Math.round(today * 100)} r={5} fill="#e4572e" stroke="#fff" strokeWidth={2} />
            <ReferenceDot x={d} y={Math.round(shaded * 100)} r={5} fill="#1d7a4b" stroke="#fff" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <span className="w-14 shrink-0 font-display text-[18px] font-extrabold tabular">{d} m</span>
        <Range label="Trip distance" value={d} min={100} max={1500} step={50} onChange={setD} fill="#13140f" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-heat/8 px-3 py-2">
          <div className="flex items-center gap-1 text-[10.5px] font-semibold text-heat"><Car size={11} /> Today</div>
          <div className="font-display text-[20px] font-extrabold leading-tight tabular">{Math.round((1 - today) * 100)}%</div>
          <div className="text-[10.5px] text-ink-3">drive it</div>
        </div>
        <div className="rounded-xl bg-leaf/10 px-3 py-2">
          <div className="flex items-center gap-1 text-[10.5px] font-semibold text-leaf"><Footprints size={11} /> With shade</div>
          <div className="font-display text-[20px] font-extrabold leading-tight tabular">{Math.round(shaded * 100)}%</div>
          <div className="text-[10.5px] text-ink-3">walk it</div>
        </div>
        <div className="rounded-xl bg-paper-2 px-3 py-2">
          <div className="text-[10.5px] font-semibold text-ink-2">Car trips saved</div>
          <div className="font-display text-[20px] font-extrabold leading-tight tabular">{tripsWon.toLocaleString()}</div>
          <div className="text-[10.5px] text-ink-3">/day · {co2} kg CO₂</div>
        </div>
      </div>
    </Card>
  )
}
