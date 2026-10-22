import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  Heart,
  MapPinned,
  MousePointerClick,
  Send,
  Sprout,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { authority } from '../lib/engine'
import { fmtRM } from '../lib/meta'
import { computeOverrides, headline, itemsSummary, placementImpact, TOOL_INFO, type Placement, type Tool } from '../lib/placements'
import { REASONS, type Proposal, type Reason, type Status } from '../lib/proposals'
import { ToolPicker } from './icons'
import { Card, Eyebrow } from './ui'

const impactOf = (pl: Placement[]) => placementImpact(pl, computeOverrides(pl))


export function StatusPill({ status }: { status: Status }) {
  const look = {
    review: { text: 'Under review', cls: 'bg-sun/20 text-[#7a5200]', icon: Clock },
    approved: { text: 'Approved', cls: 'bg-leaf/12 text-leaf', icon: CircleCheck },
    declined: { text: 'Declined', cls: 'bg-heat/10 text-heat', icon: CircleX },
  }[status]
  const Icon = look.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', look.cls)}>
      <Icon size={11} /> {look.text}
    </span>
  )
}

// ---------- resident: entry point + my proposals (left panel) ----------

export function ProposeCard({ onStart, mine, active }: { onStart: () => void; mine: Proposal[]; active: boolean }) {
  return (
    <section>
      <Eyebrow className="mb-2">Improve your street</Eyebrow>
      <button
        onClick={onStart}
        disabled={active}
        className="group flex w-full items-center gap-3 rounded-2xl border border-leaf/30 bg-leaf/8 px-4 py-3.5 text-left transition hover:bg-leaf/12 disabled:opacity-60"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-leaf text-white">
          <Sprout size={19} strokeWidth={2.3} />
        </span>
        <span className="flex-1">
          <span className="block text-[14.5px] font-bold leading-tight">{active ? 'Placing on the map…' : 'Suggest trees, shade or lights'}</span>
          <span className="block text-[12px] text-ink-2">Send your idea to {authority().short}</span>
        </span>
      </button>
      {mine.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {mine.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2">
              <MapPinned size={15} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] font-semibold">{p.ref}</span>
                <span className="block truncate text-[11.5px] text-ink-3">{itemsSummary(p.placements)}</span>
              </span>
              <StatusPill status={p.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------- resident: map toolbar + bottom sheet ----------

export function ProposeOverlay({
  tool,
  setTool,
  draft,
  onUndo,
  onClear,
  onCancel,
  onSubmit,
  compact,
}: {
  compact?: boolean
  tool: Tool | null
  setTool: (t: Tool | null) => void
  draft: Placement[]
  onUndo: () => void
  onClear: () => void
  onCancel: () => void
  onSubmit: (reasons: Reason[], note: string) => void
}) {
  const [reasons, setReasons] = useState<Reason[]>(['heat'])
  const [note, setNote] = useState('')
  const [step, setStep] = useState<'place' | 'details'>('place')
  const impact = useMemo(() => impactOf(draft), [draft])
  const counts = useMemo(() => {
    const c: Partial<Record<Tool, number>> = {}
    for (const p of draft) c[p.tool] = (c[p.tool] ?? 0) + 1
    return c
  }, [draft])
  const hl = headline(Object.keys(counts) as Tool[], impact)
  const toggle = (r: Reason) => setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]))

  return (
    <>
      {/* tool picker */}
      {compact ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-x-2 top-2 z-20 flex items-center gap-1.5 rounded-2xl border border-line bg-card/95 p-1.5 shadow-float backdrop-blur"
        >
          <div className="min-w-0 flex-1">
            <ToolPicker tool={tool} setTool={setTool} counts={counts} strip />
          </div>
          <button aria-label="Undo" disabled={!draft.length} onClick={onUndo} className="grid size-8 shrink-0 place-items-center rounded-full bg-paper-2 disabled:opacity-30">
            <Undo2 size={14} />
          </button>
        </motion.div>
      ) : (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="thin-scroll absolute right-3 top-[150px] z-20 max-h-[calc(100%-230px)] w-[252px] overflow-y-auto rounded-[20px] border border-line bg-card/95 p-2.5 shadow-float backdrop-blur md:right-4 md:top-4"
      >
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <Eyebrow>Place on map</Eyebrow>
          <div className="flex">
            <button aria-label="Undo" disabled={!draft.length} onClick={onUndo} className="grid size-7 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 disabled:opacity-30">
              <Undo2 size={14} />
            </button>
            <button aria-label="Clear" disabled={!draft.length} onClick={onClear} className="grid size-7 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 disabled:opacity-30">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <ToolPicker tool={tool} setTool={setTool} counts={counts} />
        {tool && (
          <div className="mt-1 flex items-center gap-1.5 rounded-xl bg-sun/20 px-2.5 py-2 text-[11.5px] font-semibold text-[#7a5200]">
            <MousePointerClick size={13} /> Tap a path to add {TOOL_INFO[tool].label.toLowerCase()}
          </div>
        )}
      </motion.div>

      )}
      {/* proposal sheet: compact while placing, expands for details */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-3 left-1/2 z-20 w-[min(560px,calc(100%-24px))] -translate-x-1/2 rounded-[22px] border border-line bg-card/97 p-3.5 shadow-float backdrop-blur md:bottom-4"
      >
        {step === 'place' ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold leading-tight">
                {draft.length ? itemsSummary(draft) : 'Tap a red street to place'}
              </div>
              <div className="mt-0.5 text-[12px] text-ink-3">
                {draft.length ? (
                  <>
                    <span className="capitalize">{hl.label}</span> <b className="text-ink">{hl.before}</b> → <b className="text-leaf">{hl.after}</b> ·{' '}
                    {impact.walkers.toLocaleString()} walkers/day
                  </>
                ) : (
                  'Your proposal'
                )}
              </div>
            </div>
            <button aria-label="Cancel proposal" onClick={onCancel} className="grid size-10 shrink-0 place-items-center rounded-full bg-paper-2 hover:bg-line">
              <X size={16} />
            </button>
            <button
              disabled={!draft.length}
              onClick={() => setStep('details')}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-leaf px-4 text-[13.5px] font-bold text-white transition hover:bg-forest disabled:opacity-40"
            >
              Next <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <button aria-label="Back to map" onClick={() => setStep('place')} className="grid size-8 place-items-center rounded-full bg-paper-2 hover:bg-line">
                <ArrowLeft size={15} />
              </button>
              <div className="flex-1">
                <div className="text-[14px] font-bold leading-tight">{itemsSummary(draft)}</div>
                <div className="text-[12px] text-ink-3">
                  <span className="capitalize">{hl.label}</span> {hl.before} → {hl.after} · est. {fmtRM(impact.cost)}
                </div>
              </div>
            </div>
            <div className="mt-3 text-[12.5px] font-semibold">What's the problem here?</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(Object.keys(REASONS) as Reason[]).map((r) => (
                <button
                  key={r}
                  onClick={() => toggle(r)}
                  aria-pressed={reasons.includes(r)}
                  className={clsx(
                    'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition',
                    reasons.includes(r) ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:border-ink/30',
                  )}
                >
                  {reasons.includes(r) && <Check size={12} strokeWidth={3} />}
                  {REASONS[r]}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Add a note (optional)"
              className="mt-2.5 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none placeholder:text-ink-3 focus:border-leaf"
            />
            <button
              disabled={!draft.length || !reasons.length}
              onClick={() => onSubmit(reasons, note.trim())}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-leaf py-3 text-[14px] font-bold text-white transition hover:bg-forest disabled:opacity-40"
            >
              <Send size={15} /> Send to {authority().short}
            </button>
          </div>
        )}
      </motion.div>
    </>
  )
}

export function ProposalSent({ proposal, onClose }: { proposal: Proposal | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {proposal && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-[400px] rounded-[28px] bg-card p-7 text-center shadow-float"
          >
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-leaf text-white">
              <Send size={26} />
            </span>
            <h2 className="mt-5 font-display text-[30px] font-extrabold leading-none tracking-[-0.03em]">Proposal sent</h2>
            <p className="mt-2 text-[13.5px] text-ink-2">{authority().office}</p>
            <div className="mt-4 rounded-2xl bg-paper-2 px-4 py-3 font-mono text-[14px] font-semibold">{proposal.ref}</div>
            <ol className="mt-5 space-y-2.5 text-left text-[13px]">
              {[
                ['Submitted', true],
                ['Planner review', false],
                ['Decision & works schedule', false],
              ].map(([t, done], i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span className={clsx('grid size-6 place-items-center rounded-full', done ? 'bg-leaf text-white' : 'border-2 border-line text-ink-3')}>
                    {done ? <Check size={13} strokeWidth={3} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                  </span>
                  <span className={done ? 'font-semibold' : 'text-ink-2'}>{t}</span>
                </li>
              ))}
            </ol>
            <button onClick={onClose} className="mt-6 w-full rounded-2xl bg-ink py-3.5 text-[14px] font-bold text-white">
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------- planner: inbox ----------

export function ProposalsInbox({
  proposals,
  selected,
  setSelected,
  onDecide,
}: {
  proposals: Proposal[]
  selected: string | null
  setSelected: (id: string | null) => void
  onDecide: (id: string, s: Status) => void
}) {
  const p = proposals.find((x) => x.id === selected)
  if (p) {
    const impact = impactOf(p.placements)
    const phl = headline(p.placements.map((x) => x.tool), impact)
    return (
      <div className="space-y-4 p-5 md:p-6">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2 hover:text-ink">
          <ArrowLeft size={14} /> All proposals
        </button>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] font-semibold text-ink-3">{p.ref}</span>
            <StatusPill status={p.status} />
          </div>
          <h3 className="mt-1.5 font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em]">{itemsSummary(p.placements)}</h3>
          <div className="mt-1 text-[12.5px] text-ink-2">
            {p.author} · {p.when}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.reasons.map((r) => (
            <span key={r} className="rounded-full bg-paper-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-2">
              {REASONS[r]}
            </span>
          ))}
          <span className="flex items-center gap-1 rounded-full bg-heat/10 px-2.5 py-1 text-[11.5px] font-semibold text-heat">
            <Heart size={11} fill="currentColor" /> {p.supporters} neighbours support
          </span>
        </div>
        {p.note && (
          <blockquote className="rounded-2xl border-l-4 border-leaf bg-card px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">“{p.note}”</blockquote>
        )}
        <div className="grid grid-cols-3 gap-2 rounded-[20px] bg-forest p-4 text-white">
          <div>
            <div className="font-display text-[20px] font-extrabold leading-none tabular">
              {phl.before}→<span className="text-mint">{phl.after}</span>
            </div>
            <div className="mt-1 text-[10.5px] text-white/60">{phl.label}</div>
          </div>
          <div>
            <div className="font-display text-[20px] font-extrabold leading-none tabular">{impact.walkers.toLocaleString()}</div>
            <div className="mt-1 text-[10.5px] text-white/60">walkers/day</div>
          </div>
          <div>
            <div className="font-display text-[20px] font-extrabold leading-none tabular">{fmtRM(impact.cost)}</div>
            <div className="mt-1 text-[10.5px] text-white/60">capex</div>
          </div>
        </div>
        {p.status === 'review' ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onDecide(p.id, 'declined')} className="rounded-2xl border border-line bg-card py-3 text-[14px] font-bold hover:bg-paper-2">
              Decline
            </button>
            <button onClick={() => onDecide(p.id, 'approved')} className="flex items-center justify-center gap-1.5 rounded-2xl bg-leaf py-3 text-[14px] font-bold text-white hover:bg-forest">
              <Check size={16} strokeWidth={3} /> Approve
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-paper-2 px-4 py-3 text-[13px] text-ink-2">
            {p.status === 'approved' ? 'Approved and added to the works plan. The resident has been notified.' : 'Declined. The resident has been notified.'}
          </div>
        )}
      </div>
    )
  }

  const pending = proposals.filter((x) => x.status === 'review').length
  return (
    <div className="p-5 md:p-6">
      <div className="text-[15px] font-bold">Resident proposals</div>
      <div className="text-[12px] text-ink-3">{pending} waiting for review</div>
      <div className="mt-3 space-y-2">
        {proposals.map((x) => {
          const ic = impactOf(x.placements)
          const ihl = headline(x.placements.map((y) => y.tool), ic)
          return (
            <Card key={x.id} className="overflow-hidden">
              <button onClick={() => setSelected(x.id)} className="w-full p-4 text-left transition hover:bg-paper-2/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] font-semibold text-ink-3">{x.ref}</span>
                    {x.mine && <span className="rounded-full bg-leaf px-1.5 py-0.5 text-[10px] font-bold text-white">NEW</span>}
                  </span>
                  <StatusPill status={x.status} />
                </div>
                <div className="mt-1.5 text-[14px] font-bold">{itemsSummary(x.placements)}</div>
                <div className="mt-0.5 truncate text-[12px] text-ink-3">{x.author}</div>
                <div className="mt-2.5 flex items-center gap-3 text-[11.5px] font-semibold">
                  <span className="text-leaf tabular">
                    {ihl.before}→{ihl.after} {ihl.label.replace(' at 1pm', '')}
                  </span>
                  <span className="text-ink-2 tabular">{fmtRM(ic.cost)}</span>
                  <span className="ml-auto flex items-center gap-1 text-heat tabular">
                    <Heart size={11} fill="currentColor" /> {x.supporters}
                  </span>
                </div>
              </button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
