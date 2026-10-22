import type { LucideProps } from 'lucide-react'
import { Accessibility, Lightbulb, Moon, TrafficCone, Trees, Umbrella } from 'lucide-react'
import type { ComponentType } from 'react'
import type { BadgeKind } from '../lib/features'

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
