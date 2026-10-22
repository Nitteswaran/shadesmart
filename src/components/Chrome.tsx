import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import {
  CloudRain,
  Compass,
  LayoutDashboard,
  MapPin,
  Moon,
  Sun,
  ThermometerSun,
  Search,
  Navigation,
  ChartNoAxesColumn,
  Sprout,
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
        <div className="leading-none">
          <div className="font-display text-[22px] font-extrabold tracking-[-0.03em]">ShadeSmart</div>
          <div className="mt-1 flex max-w-[52vw] items-center gap-1 truncate text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            <MapPin size={10} strokeWidth={2.5} /> {town.meta.township} · {town.meta.city}
          </div>
        </div>
      </div>

      <div className="mx-auto hidden min-w-0 flex-1 sm:max-w-[340px] lg:block">
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
      <div className="ml-auto shrink-0 lg:ml-0">{sos}</div>
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
    <div className="pointer-events-none fixed left-1/2 top-[76px] z-[60] flex w-[min(320px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2 lg:left-auto lg:right-4 lg:top-[84px] lg:translate-x-0">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.icon
          return (
            <motion.div
              layout
              key={t.id}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-line bg-card/95 p-2.5 shadow-float backdrop-blur"
              role="status"
            >
              <span className={clsx('grid size-8 shrink-0 place-items-center rounded-xl text-white', TONE[t.tone])}>
                <Icon size={15} strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold leading-tight">{t.title}</div>
                <div className="mt-0.5 truncate text-[12px] text-ink-2">{t.body}</div>
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

export type MobileTab = 'route' | 'steps' | 'insights' | 'improve' | 'planner'

/** Desktop = the original side-by-side layout. Everything below `lg` gets the stacked mobile layout. */
export function useIsDesktop() {
  const q = '(min-width: 1024px)'
  const [desktop, setDesktop] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(q).matches))
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setDesktop(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return desktop
}

const TABS: { id: MobileTab; label: string; icon: LucideIcon }[] = [
  { id: 'route', label: 'Route', icon: Search },
  { id: 'steps', label: 'Steps', icon: Navigation },
  { id: 'insights', label: 'Insights', icon: ChartNoAxesColumn },
  { id: 'improve', label: 'Improve', icon: Sprout },
  { id: 'planner', label: 'Planner', icon: LayoutDashboard },
]

export function BottomNav({ tab, onTab, pending }: { tab: MobileTab; onTab: (t: MobileTab) => void; pending: number }) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-[560px] grid-cols-5 gap-1 rounded-[24px] bg-ink/95 p-1.5 shadow-float backdrop-blur-xl"
    >
      {TABS.map((t) => {
        const on = t.id === tab
        const Icon = t.icon
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            aria-current={on ? 'page' : undefined}
            className={clsx('relative flex flex-col items-center gap-0.5 rounded-[18px] py-2 text-[10.5px] font-semibold transition-colors', on ? 'text-ink' : 'text-white/65')}
          >
            {on && <motion.span layoutId="navpill" className="absolute inset-0 rounded-[18px] bg-white" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <Icon size={19} strokeWidth={2.2} className="relative" />
            <span className="relative">{t.label}</span>
            {t.id === 'planner' && pending > 0 && (
              <span className="absolute right-2 top-1 grid size-4 place-items-center rounded-full bg-sos text-[9.5px] font-bold text-white">{pending}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
