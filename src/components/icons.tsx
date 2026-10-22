import type { LucideProps } from 'lucide-react'
import clsx from 'clsx'
import { Accessibility, Armchair, Cctv, CloudDrizzle, Flower2, Footprints, Lightbulb, Moon, TrafficCone, Trees, Umbrella, WavesHorizontal } from 'lucide-react'
import type { ComponentType } from 'react'
import type { BadgeKind } from '../lib/features'
import { fmtRM } from '../lib/meta'
import { TOOL_GROUPS, TOOL_INFO, type Tool } from '../lib/placements'

/** Lucide has no stairs glyph; drawn to match its 24px, 2px-stroke grid. */
export function Stairs({ size = 24, strokeWidth = 2, ...rest }: LucideProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(rest as object)}
    >
      <path d="M3 20h5v-5h5v-5h5V5h3" />
    </svg>
  )
}

export const BADGE_META: Record<BadgeKind, { icon: ComponentType<LucideProps>; color: string; label: string; avoided?: boolean }> = {
  canopy: { icon: Trees, color: '#1d7a4b', label: 'Tree canopy' },
  covered: { icon: Umbrella, color: '#3b6fd8', label: 'Covered walkway' },
  crossing: { icon: TrafficCone, color: '#d9900f', label: 'Road crossing' },
  'crossing-avoided': { icon: TrafficCone, color: '#d9900f', label: 'Crossing avoided', avoided: true },
  'step-free': { icon: Accessibility, color: '#6b5ca5', label: 'Step-free route' },
  'stairs-avoided': { icon: Stairs, color: '#6b5ca5', label: 'Stairs avoided', avoided: true },
  lit: { icon: Lightbulb, color: '#c98a0b', label: 'Well-lit corridor' },
  'dark-avoided': { icon: Moon, color: '#171c36', label: 'Dark path avoided', avoided: true },
}

export function BadgeIcon({ kind, size = 22 }: { kind: BadgeKind; size?: number }) {
  const m = BADGE_META[kind]
  const Icon = m.icon
  return (
    <span
      className={m.avoided ? 'ss-badge ss-badge-avoided' : 'ss-badge'}
      style={{ width: size, height: size, ['--c' as string]: m.color }}
    >
      <Icon size={Math.round(size * 0.58)} strokeWidth={2.4} />
    </span>
  )
}

export const TOOL_ICON: Record<Tool, ComponentType<LucideProps>> = {
  tree: Trees,
  pergola: Flower2,
  canopy: Umbrella,
  shelter: Armchair,
  mist: CloudDrizzle,
  light: Lightbulb,
  cctv: Cctv,
  crossing: Footprints,
  drain: WavesHorizontal,
}

export const TOOL_COLOR: Record<Tool, string> = {
  tree: '#1d7a4b',
  pergola: '#5f9a3a',
  canopy: '#3b6fd8',
  shelter: '#7a5cc2',
  mist: '#1f9fb4',
  light: '#c98a0b',
  cctv: '#2d3a6b',
  crossing: '#d9900f',
  drain: '#2f6fdb',
}

/** Grouped grid of placeable items, shared by the resident proposal and planner tools. */
export function ToolPicker({
  tool,
  setTool,
  counts,
}: {
  tool: Tool | null
  setTool: (t: Tool | null) => void
  counts: Partial<Record<Tool, number>>
}) {
  return (
    <div className="space-y-2">
      {TOOL_GROUPS.map((g) => (
        <div key={g.group}>
          <div className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">{g.label}</div>
          <div className="grid grid-cols-3 gap-1">
            {g.tools.map((t) => {
              const Icon = TOOL_ICON[t]
              const on = tool === t
              const n = counts[t] ?? 0
              return (
                <button
                  key={t}
                  onClick={() => setTool(on ? null : t)}
                  aria-pressed={on}
                  title={`${TOOL_INFO[t].label} · ${fmtRM(TOOL_INFO[t].cost)}`}
                  className={clsx(
                    'relative flex flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-2 text-center transition',
                    on ? 'bg-ink text-white shadow-soft' : 'hover:bg-paper-2',
                  )}
                >
                  <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: TOOL_COLOR[t] }}>
                    <Icon size={15} strokeWidth={2.3} />
                  </span>
                  <span className="text-[10.5px] font-semibold leading-tight">{TOOL_INFO[t].label}</span>
                  {n > 0 && (
                    <span className="absolute right-1 top-1 min-w-4 rounded-full bg-leaf px-1 font-mono text-[10px] font-bold leading-4 text-white tabular">
                      {n}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
