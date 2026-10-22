import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import {
  CloudRain,
  Compass,
  LayoutDashboard,
  MapPin,
  Moon,
  Sun,
  ThermometerSun,
  X,
  type LucideIcon,
} from 'lucide-react'
import { airTemp, town, uvIndex, type Conditions } from '../lib/engine'
import { fmtTime } from '../lib/meta'
import { Segmented } from './ui'

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="18" fill="#143826" />
      <circle cx="26" cy="27" r="11" fill="#F2B33D" />
      <path d="M14 50c4-14 15-23 36-26-2 16-12 27-29 27-3 0-5-.4-7-1z" fill="#7BD389" />
      <path d="M20 47c7-8 15-13 24-17" stroke="#143826" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export type View = 'navigate' | 'planner'

export function Header({
  view,
  onView,
  cond,
  sos,
}: {
  view: View
  onView: (v: View) => void
  cond: Conditions
  sos: React.ReactNode
}) {
  const temp = airTemp(cond.hour, cond.weather, cond.night)
  const uv = uvIndex(cond.hour, cond.weather, cond.night)
  const WIcon = cond.night ? Moon : cond.weather === 'rainy' ? CloudRain : Sun
  return (
    <header className="relative z-30 flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur-xl md:gap-6 md:px-6">
      <div className="flex items-center gap-3">
        <Logo />
        <div className="hidden leading-none sm:block">
          <div className="font-display text-[22px] font-extrabold tracking-[-0.03em]">ShadeSmart</div>
          <div className="mt-1 hidden items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3 sm:flex">
            <MapPin size={10} strokeWidth={2.5} /> {town.meta.township} · {town.meta.city}
          </div>
        </div>
      </div>

      <div className="mx-auto min-w-0 flex-1 sm:max-w-[340px]">
        <Segmented
          value={view}
          onChange={onView}
          options={[
            { value: 'navigate', label: 'Resident', icon: Compass },
            { value: 'planner', label: 'Planner', icon: LayoutDashboard },
          ]}
        />
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        <Chip icon={WIcon} tone={cond.night ? 'night' : cond.weather === 'rainy' ? 'rain' : 'sun'}>
          {cond.night ? 'Night' : cond.weather === 'rainy' ? 'Downpour' : 'Sunny'}
        </Chip>
        <Chip icon={ThermometerSun}>
          <span className="tabular">{temp.toFixed(0)}°C</span>
          <span className="text-ink-3">·</span>
          <span className="tabular">UV {uv}</span>
        </Chip>
        <div className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[12px] font-medium tabular text-ink-2">
          {fmtTime(cond.hour)}
        </div>
      </div>
      <div className="shrink-0">{sos}</div>
    </header>
  )
}

function Chip({ icon: Icon, children, tone }: { icon: LucideIcon; children: React.ReactNode; tone?: 'sun' | 'rain' | 'night' }) {
  const toneCls = {
    sun: 'bg-sun/20 text-[#8a5a00] border-sun/40',
    rain: 'bg-rain/10 text-rain border-rain/30',
    night: 'bg-night text-white border-night',
  }
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold',
        tone ? toneCls[tone] : 'border-line bg-card text-ink',
      )}
    >
      <Icon size={14} strokeWidth={2.3} />
      {children}
    </div>
  )
}

// ---------- toasts ----------
export interface Toast {
  id: number
  title: string
  body: string
  tone: 'rain' | 'night' | 'sos' | 'leaf' | 'heat'
  icon: LucideIcon
}

const TONE: Record<Toast['tone'], string> = {
  rain: 'bg-rain',
  night: 'bg-night',
  sos: 'bg-sos',
  leaf: 'bg-leaf',
  heat: 'bg-heat',
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed right-4 top-[84px] z-[60] flex w-[min(340px,calc(100vw-32px))] flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.icon
          return (
            <motion.div
              layout
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="pointer-events-auto flex gap-3 rounded-2xl border border-line bg-card/95 p-3.5 shadow-float backdrop-blur"
              role="status"
            >
              <span className={clsx('grid size-9 shrink-0 place-items-center rounded-xl text-white', TONE[t.tone])}>
                <Icon size={17} strokeWidth={2.3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold leading-tight">{t.title}</div>
                <div className="mt-1 text-[12.5px] leading-snug text-ink-2">{t.body}</div>
              </div>
              <button
                aria-label="Dismiss"
                onClick={() => onDismiss(t.id)}
                className="grid size-6 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink"
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
