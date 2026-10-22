import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Loader2, Phone, Radio, ShieldCheck, Siren, Users, Vibrate, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { town, type LngLat } from '../lib/engine'

export type Phase = 'idle' | 'arming' | 'sent'

const HOLD_MS = 1200

function haversine(a: LngLat, b: LngLat) {
  const r = (d: number) => (d * Math.PI) / 180
  const x =
    Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(x))
}

export function SOSButton({
  onTap,
  onHoldComplete,
  variant = 'pill',
}: {
  onTap: () => void
  onHoldComplete: () => void
  variant?: 'pill' | 'block'
}) {
  const [progress, setProgress] = useState(0)
  const start = useRef(0)
  const raf = useRef(0)
  const fired = useRef(false)

  const down = () => {
    fired.current = false
    start.current = performance.now()
    const tick = () => {
      const k = Math.min(1, (performance.now() - start.current) / HOLD_MS)
      setProgress(k)
      if (k >= 1) {
        fired.current = true
        setProgress(0)
        onHoldComplete()
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const up = () => {
    cancelAnimationFrame(raf.current)
    const held = performance.now() - start.current
    setProgress(0)
    if (!fired.current && held < HOLD_MS && start.current) onTap()
    start.current = 0
  }
  const cancel = () => {
    cancelAnimationFrame(raf.current)
    setProgress(0)
    start.current = 0
  }

  return (
    <button
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={cancel}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onTap())}
      aria-label="SOS Emergency Alert — tap to confirm, hold to send silently"
      className={clsx(
        'relative isolate select-none overflow-hidden font-bold text-white transition-transform active:scale-[0.98]',
        variant === 'pill'
          ? 'flex items-center gap-2 rounded-full bg-sos py-2 pl-2.5 pr-4 text-[13px] shadow-[0_6px_18px_-6px_rgb(217_45_32/0.7)]'
          : 'flex w-full items-center gap-3 rounded-2xl bg-sos px-4 py-3.5 text-left shadow-[0_10px_24px_-10px_rgb(217_45_32/0.8)]',
      )}
    >
      <span
        className="absolute inset-y-0 left-0 -z-10 bg-[#a3160c]"
        style={{ width: `${progress * 100}%` }}
        aria-hidden
      />
      <span
        className={clsx(
          'relative grid place-items-center rounded-full bg-white/20',
          variant === 'pill' ? 'size-6' : 'size-10',
        )}
      >
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-white/40" />
        <Siren size={variant === 'pill' ? 14 : 19} strokeWidth={2.4} />
      </span>
      {variant === 'pill' ? (
        <span>SOS</span>
      ) : (
        <span className="flex-1">
          <span className="block text-[15px] leading-tight">SOS Emergency Alert</span>
          <span className="block text-[11.5px] font-medium text-white/75">Tap to confirm · hold 1s to send silently</span>
        </span>
      )}
    </button>
  )
}

export function SOSSheet({
  phase,
  silent,
  position,
  onCancel,
  onSend,
  onClose,
}: {
  phase: Phase
  silent: boolean
  position: LngLat
  onCancel: () => void
  onSend: () => void
  onClose: () => void
}) {
  const [count, setCount] = useState(5)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (phase !== 'arming') return
    setCount(5)
    const t = setInterval(() => setCount((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [phase])
  useEffect(() => {
    if (phase === 'arming' && count <= 0) onSend()
  }, [count, phase, onSend])
  useEffect(() => {
    if (phase !== 'sent') return
    setStep(0)
    const ts = [500, 1100, 1700, 2300].map((ms, i) => setTimeout(() => setStep(i + 1), ms))
    return () => ts.forEach(clearTimeout)
  }, [phase])

  const guard = town.guardPosts.reduce((b, g) => (haversine(g.at, position) < haversine(b.at, position) ? g : b))
  const guardDist = haversine(guard.at, position)
  const eta = Math.max(2, Math.round(guardDist / 220))

  const recipients = [
    { icon: Siren, label: 'Sime Darby Auxiliary Police', sub: 'Elmina Command Centre' },
    { icon: ShieldCheck, label: guard.name, sub: `${Math.round(guardDist)} m away · patrol dispatched` },
    { icon: Users, label: 'Emergency contacts (2)', sub: 'SMS + WhatsApp with live link' },
    { icon: Radio, label: 'Live GPS sharing', sub: 'Updating every 5s for 30 min' },
  ]

  return (
    <AnimatePresence>
      {phase !== 'idle' && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center bg-ink/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={phase === 'sent' ? onClose : undefined}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label="SOS emergency alert"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 30, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="w-full max-w-[440px] overflow-hidden rounded-[28px] bg-card shadow-float"
          >
            {phase === 'arming' ? (
              <div className="p-7 text-center">
                <div className="relative mx-auto grid size-28 place-items-center">
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-sos/30" />
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 112 112">
                    <circle cx="56" cy="56" r="52" fill="none" stroke="#f3d3cf" strokeWidth="6" />
                    <circle
                      cx="56"
                      cy="56"
                      r="52"
                      fill="none"
                      stroke="#d92d20"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 52}
                      strokeDashoffset={2 * Math.PI * 52 * (1 - count / 5)}
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                  <span className="font-display text-[46px] font-extrabold tabular text-sos">{Math.max(0, count)}</span>
                </div>
                <h2 className="mt-5 font-display text-[28px] font-extrabold leading-none tracking-[-0.03em]">
                  Sending SOS alert
                </h2>
                <p className="mx-auto mt-3 max-w-[320px] text-[14px] leading-relaxed text-ink-2">
                  Your live GPS location will be shared with Sime Darby Auxiliary Police and the nearest guard post.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-2.5">
                  <button
                    onClick={onCancel}
                    className="rounded-2xl border border-line bg-paper px-4 py-3.5 text-[14px] font-bold hover:bg-paper-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSend}
                    className="rounded-2xl bg-sos px-4 py-3.5 text-[14px] font-bold text-white hover:bg-[#bf2418]"
                  >
                    Send now
                  </button>
                </div>
                <div className="mt-5 flex items-center justify-center gap-2 text-[12px] text-ink-3">
                  <Vibrate size={14} /> Tip: hold the SOS button or shake your phone to send silently
                </div>
              </div>
            ) : (
              <div>
                <div className="relative overflow-hidden bg-sos px-7 pb-6 pt-7 text-white">
                  <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
                  <div className="absolute -right-2 top-14 size-20 rounded-full bg-white/10" />
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-white/15 hover:bg-white/25"
                  >
                    <X size={16} />
                  </button>
                  <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-white/80">
                    <span className="size-2 animate-pulse rounded-full bg-white" />
                    {silent ? 'Silent alert active' : 'Alert active'}
                  </div>
                  <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[0.95] tracking-[-0.03em]">
                    Help is on
                    <br />
                    the way.
                  </h2>
                  <div className="mt-5 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-white/70">Live GPS</div>
                      <div className="mt-1 font-mono text-[13px] tabular">
                        {position[1].toFixed(5)}° N, {position[0].toFixed(5)}° E
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-white/70">Patrol ETA</div>
                      <div className="font-display text-[34px] font-extrabold leading-none tabular">
                        {eta}
                        <span className="text-[16px]"> min</span>
                      </div>
                    </div>
                  </div>
                </div>
                <ul className="space-y-1 p-4">
                  {recipients.map((r, i) => {
                    const Icon = r.icon
                    const done = step > i
                    return (
                      <li key={r.label} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                        <span className="grid size-9 place-items-center rounded-xl bg-paper-2 text-ink">
                          <Icon size={16} strokeWidth={2.3} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold">{r.label}</span>
                          <span className="block truncate text-[12px] text-ink-3">{r.sub}</span>
                        </span>
                        <span
                          className={clsx(
                            'grid size-7 place-items-center rounded-full transition-colors',
                            done ? 'bg-leaf text-white' : 'text-ink-3',
                          )}
                        >
                          {done ? <Check size={15} strokeWidth={3} /> : <Loader2 size={15} className="animate-spin" />}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <div className="grid grid-cols-2 gap-2.5 px-5 pb-5">
                  <a
                    href="tel:999"
                    className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-paper px-4 py-3.5 text-[14px] font-bold hover:bg-paper-2"
                  >
                    <Phone size={16} /> Call 999
                  </a>
                  <button
                    onClick={onClose}
                    className="rounded-2xl bg-ink px-4 py-3.5 text-[14px] font-bold text-white hover:bg-black"
                  >
                    I'm safe now
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
