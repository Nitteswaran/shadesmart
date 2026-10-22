import clsx from 'clsx'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-[22px] border border-line bg-card shadow-soft', className)}>{children}</div>
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3', className)}>
      {children}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  dark = false,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: LucideIcon }[]
  size?: 'sm' | 'md'
  dark?: boolean
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        'flex rounded-full p-1',
        dark ? 'bg-white/10' : 'bg-paper-2/80 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]',
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-all duration-200',
              size === 'sm' ? 'px-3 py-1.5 text-[12.5px]' : 'px-4 py-2 text-[13.5px]',
              active
                ? dark
                  ? 'bg-white text-ink shadow-soft'
                  : 'bg-ink text-white shadow-[0_4px_12px_-4px_rgb(0_0_0/0.4)]'
                : dark
                  ? 'text-white/70 hover:text-white'
                  : 'text-ink-2 hover:text-ink',
            )}
          >
            {Icon && <Icon size={size === 'sm' ? 14 : 15} strokeWidth={2.2} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  icon: Icon,
  tone = 'leaf',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  icon: LucideIcon
  tone?: 'leaf' | 'night' | 'rain'
}) {
  const toneBg = { leaf: 'bg-leaf', night: 'bg-night', rain: 'bg-rain' }[tone]
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        'group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all',
        checked ? 'border-ink/15 bg-white shadow-soft' : 'border-line bg-transparent hover:bg-white/60',
      )}
    >
      <span
        className={clsx(
          'grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
          checked ? clsx(toneBg, 'text-white') : 'bg-paper-2 text-ink-2',
        )}
      >
        <Icon size={17} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold leading-tight">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{hint}</span>}
      </span>
      <span
        className={clsx(
          'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors',
          checked ? toneBg : 'bg-[#d8d0bf]',
        )}
      >
        <span
          className={clsx(
            'absolute top-[3px] size-4 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'left-[19px]' : 'left-[3px]',
          )}
        />
      </span>
    </button>
  )
}

export function Range({
  value,
  min,
  max,
  step,
  onChange,
  fill,
  label,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  fill?: string
  label: string
}) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <input
      aria-label={label}
      type="range"
      className="ss-range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--p' as string]: `${p}%`, ['--track-fill' as string]: fill }}
    />
  )
}

export interface SelectOption {
  value: string
  label: string
  group: string
  icon: LucideIcon
  color: string
}

export function PlaceSelect({
  value,
  onChange,
  options,
  label,
  accent,
  disabledValue,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  label: string
  accent: ReactNode
  disabledValue?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)!
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  const groups = [...new Set(options.map((o) => o.group))]
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-paper-2/70"
      >
        {accent}
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">{label}</span>
          <span className="block truncate text-[15px] font-semibold">{current.label}</span>
        </span>
        <ChevronDown size={16} className={clsx('text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="listbox"
          className="thin-scroll absolute left-0 right-0 top-full z-40 mt-1 max-h-[340px] animate-fade-up overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-float"
        >
          {groups.map((g) => (
            <div key={g} className="py-1">
              <Eyebrow className="px-2.5 pb-1 pt-1.5">{g}</Eyebrow>
              {options
                .filter((o) => o.group === g)
                .map((o) => {
                  const Icon = o.icon
                  const disabled = o.value === disabledValue
                  return (
                    <button
                      key={o.value}
                      role="option"
                      aria-selected={o.value === value}
                      disabled={disabled}
                      onClick={() => {
                        onChange(o.value)
                        setOpen(false)
                      }}
                      className={clsx(
                        'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition-colors',
                        disabled ? 'opacity-35' : 'hover:bg-paper-2/80',
                        o.value === value && 'bg-paper-2/80 font-semibold',
                      )}
                    >
                      <span className="grid size-7 place-items-center rounded-lg text-white" style={{ background: o.color }}>
                        <Icon size={14} strokeWidth={2.3} />
                      </span>
                      <span className="flex-1 truncate">{o.label}</span>
                      {o.value === value && <Check size={15} className="text-leaf" />}
                    </button>
                  )
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
