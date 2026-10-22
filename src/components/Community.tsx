import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import {
  BadgeCheck,
  CloudRain,
  Flame,
  Lightbulb,
  MapPin,
  MessageCircle,
  Moon,
  Send,
  ShieldAlert,
  Sprout,
  ThumbsUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { authority, town } from '../lib/engine'
import { TOOL_GROUPS, TOOL_INFO, itemsSummary, type Tool } from '../lib/placements'
import type { Proposal } from '../lib/proposals'
import { TOOL_COLOR, TOOL_ICON } from './icons'
import { StatusPill } from './Propose'
import { Card, Eyebrow } from './ui'

// ---------- improve your street ----------

const STEPS = ['Submitted', 'Planner review', 'Decision']

export function ImproveStreet({
  onStart,
  mine,
  all,
  active,
}: {
  onStart: (tool: Tool) => void
  mine: Proposal[]
  all: Proposal[]
  active: boolean
}) {
  const approved = all.filter((p) => p.status === 'approved').length
  const supporters = all.reduce((s, p) => s + p.supporters, 0)
  return (
    <section className="space-y-3">
      <div className="relative overflow-hidden rounded-[24px] bg-forest p-5 text-white">
        <svg className="absolute -right-6 -top-4 h-40 w-40 opacity-20" viewBox="0 0 100 100" aria-hidden>
          <circle cx="62" cy="38" r="26" fill="#7bd389" />
          <circle cx="40" cy="52" r="20" fill="#7bd389" />
          <rect x="47" y="60" width="6" height="34" rx="2" fill="#7bd389" />
        </svg>
        <div className="relative flex items-center gap-1.5 text-[12px] font-semibold text-mint">
          <Sprout size={13} /> Improve your street
        </div>
        <h3 className="relative mt-2 font-display text-[26px] font-extrabold leading-[1] tracking-[-0.03em]">
          What would make
          <br />
          your walk better?
        </h3>
        <p className="relative mt-2 max-w-[260px] text-[13px] text-white/70">
          Tap an idea, drop it on the map, and {authority().short} reviews it.
        </p>
        <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/12 pt-3.5">
          <div>
            <div className="font-display text-[20px] font-extrabold leading-none tabular">{all.length}</div>
            <div className="mt-1 text-[10.5px] text-white/60">proposals</div>
          </div>
          <div>
            <div className="font-display text-[20px] font-extrabold leading-none tabular text-mint">{approved}</div>
            <div className="mt-1 text-[10.5px] text-white/60">approved</div>
          </div>
          <div>
            <div className="font-display text-[20px] font-extrabold leading-none tabular">{supporters}</div>
            <div className="mt-1 text-[10.5px] text-white/60">neighbours joined</div>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <Eyebrow>Pick an idea to place</Eyebrow>
        <div className="mt-3 space-y-3">
          {TOOL_GROUPS.map((g) => (
            <div key={g.group}>
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink-2">{g.label}</div>
              <div className="grid grid-cols-3 gap-2">
                {g.tools.map((t, i) => {
                  const Icon = TOOL_ICON[t]
                  return (
                    <motion.button
                      key={t}
                      disabled={active}
                      onClick={() => onStart(t)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileTap={{ scale: 0.94 }}
                      className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-paper px-1 pb-2.5 pt-3 text-center transition hover:border-ink/25 disabled:opacity-40"
                    >
                      <span className="grid size-10 place-items-center rounded-xl text-white shadow-soft" style={{ background: TOOL_COLOR[t] }}>
                        <Icon size={18} strokeWidth={2.3} />
                      </span>
                      <span className="text-[11.5px] font-semibold leading-tight">{TOOL_INFO[t].label}</span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {mine.length > 0 && (
        <Card className="p-4">
          <Eyebrow>Your proposals</Eyebrow>
          <div className="mt-2 space-y-3">
            {mine.map((p) => {
              const stage = p.status === 'review' ? 1 : 2
              return (
                <div key={p.id} className="rounded-2xl bg-paper-2/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11.5px] font-semibold">{p.ref}</span>
                    <StatusPill status={p.status} />
                  </div>
                  <div className="mt-1 text-[13.5px] font-bold">{itemsSummary(p.placements)}</div>
                  <div className="mt-2.5 flex items-center">
                    {STEPS.map((s, i) => (
                      <div key={s} className="flex flex-1 items-center last:flex-none">
                        <span
                          className={clsx(
                            'grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                            i <= stage
                              ? p.status === 'declined' && i === 2
                                ? 'bg-heat text-white'
                                : 'bg-leaf text-white'
                              : 'border-2 border-line bg-card text-ink-3',
                          )}
                        >
                          {i + 1}
                        </span>
                        {i < STEPS.length - 1 && <span className={clsx('mx-1 h-[2px] flex-1 rounded', i < stage ? 'bg-leaf' : 'bg-line')} />}
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-ink-3">
                    {STEPS.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </section>
  )
}

// ---------- resident forum ----------

type Kind = 'safety' | 'flood' | 'heat' | 'lighting'
const KIND: Record<Kind, { label: string; icon: LucideIcon; color: string }> = {
  safety: { label: 'Safety', icon: ShieldAlert, color: '#d92d20' },
  flood: { label: 'Flood', icon: CloudRain, color: '#2f6fdb' },
  heat: { label: 'Heat', icon: Flame, color: '#e4572e' },
  lighting: { label: 'Lighting', icon: Lightbulb, color: '#c98a0b' },
}

interface Post {
  id: string
  author: string
  when: string
  kind: Kind
  where: string
  text: string
  meToo: number
  replies: number
  reply?: string
  status: 'Resolved' | 'Patrol added' | 'Under review' | 'Works scheduled'
  mine?: boolean
}

function seedPosts(): Post[] {
  const spots = town.corridors.map((c) => c.name.replace(/ · Segment [A-Z]$/, ''))
  const at = (i: number) => spots[(i * 41 + 7) % Math.max(1, spots.length)] ?? town.meta.township
  const a = authority()
  return [
    { id: 'f1', author: 'Farah N.', when: '2h', kind: 'safety', where: at(1), text: 'Someone followed me from the bus stop around 10pm. Used SOS — patrol came in 4 minutes. Thank you!', meToo: 23, replies: 6, reply: `${a.police}: Extra patrol added on this stretch 9pm–1am.`, status: 'Patrol added' },
    { id: 'f2', author: 'Daniel L.', when: '5h', kind: 'flood', where: at(2), text: 'Underpass flooded ankle-deep again after the 5pm storm. ShadeSmart rerouted me, but kids still walk through it.', meToo: 41, replies: 9, reply: `${a.short}: Drainage upgrade scheduled for next month.`, status: 'Works scheduled' },
    { id: 'f3', author: 'Mei Ling T.', when: '1d', kind: 'lighting', where: at(3), text: 'Three streetlights out in a row. Very dark walking back from the shops.', meToo: 17, replies: 3, status: 'Under review' },
    { id: 'f4', author: 'Ravi K.', when: '2d', kind: 'heat', where: at(4), text: 'My dad felt dizzy walking here at 1pm — zero shade for 300 m. Please plant trees.', meToo: 58, replies: 12, reply: `${a.short}: Added to the tree-planting shortlist.`, status: 'Under review' },
    { id: 'f5', author: 'Aina S.', when: '4d', kind: 'safety', where: at(5), text: 'Cars speed through the crossing near the school. Near miss this morning.', meToo: 32, replies: 7, reply: `${a.short}: Zebra crossing + speed bump approved.`, status: 'Resolved' },
  ]
}

export function ResidentForum() {
  const [posts, setPosts] = useState<Post[]>(seedPosts)
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [voted, setVoted] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftKind, setDraftKind] = useState<Kind>('safety')

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { safety: 0, flood: 0, heat: 0, lighting: 0 }
    for (const p of posts) c[p.kind] += p.meToo
    return c
  }, [posts])
  const max = Math.max(...Object.values(counts), 1)
  const top = [...posts].sort((a, b) => b.meToo - a.meToo)[0]
  const shown = posts.filter((p) => filter === 'all' || p.kind === filter)

  const toggle = (id: string) => {
    setVoted((v) => {
      const n = new Set(v)
      const on = !n.has(id)
      if (on) n.add(id)
      else n.delete(id)
      setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, meToo: p.meToo + (on ? 1 : -1) } : p)))
      return n
    })
  }
  const post = () => {
    if (!draft.trim()) return
    setPosts((ps) => [
      { id: `u${Date.now()}`, author: 'You', when: 'now', kind: draftKind, where: town.places[0]?.name ?? town.meta.township, text: draft.trim(), meToo: 1, replies: 0, status: 'Under review', mine: true },
      ...ps,
    ])
    setVoted((v) => new Set(v))
    setDraft('')
    setFilter('all')
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <div>
          <Eyebrow>Resident forum</Eyebrow>
          <div className="mt-0.5 font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em]">What neighbours report</div>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-leaf/12 px-2.5 py-1 text-[11px] font-semibold text-leaf">
          <span className="size-1.5 animate-pulse rounded-full bg-leaf" /> Live
        </span>
      </div>

      {/* report insights */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>SOS & report insights · 30 days</Eyebrow>
          <span className="text-[11px] font-semibold text-ink-3">avg response 4.9 min</span>
        </div>
        <div className="mt-3 space-y-2">
          {(Object.keys(KIND) as Kind[]).map((k) => {
            const m = KIND[k]
            const Icon = m.icon
            return (
              <button key={k} onClick={() => setFilter(filter === k ? 'all' : k)} className="flex w-full items-center gap-2.5 text-left">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: m.color }}>
                  <Icon size={13} strokeWidth={2.4} />
                </span>
                <span className="w-16 shrink-0 text-[12.5px] font-semibold">{m.label}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-paper-2">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: m.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(counts[k] / max) * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right font-mono text-[12px] font-semibold tabular">{counts[k]}</span>
              </button>
            )
          })}
        </div>
        {top && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-heat/8 px-3 py-2 text-[12px] text-[#8f2f12]">
            <TriangleAlert size={14} className="mt-px shrink-0" />
            <span>
              Most reported: <b>{top.where}</b> · {KIND[top.kind].label.toLowerCase()}
            </span>
          </div>
        )}
      </Card>

      {/* composer */}
      <Card className="p-3">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-2">
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => setDraftKind(k)}
              className={clsx(
                'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition',
                draftKind === k ? 'text-white' : 'bg-paper-2 text-ink-2',
              )}
              style={draftKind === k ? { background: KIND[k].color } : undefined}
            >
              {KIND[k].label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Share something neighbours should know…"
            className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none placeholder:text-ink-3 focus:border-leaf"
          />
          <button
            onClick={post}
            disabled={!draft.trim()}
            aria-label="Post"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf text-white transition disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </div>
      </Card>

      {/* filters */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-1">
        {(['all', ...Object.keys(KIND)] as (Kind | 'all')[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={clsx(
              'shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition',
              filter === k ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2',
            )}
          >
            {k === 'all' ? 'All' : KIND[k].label}
          </button>
        ))}
      </div>

      {/* feed */}
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {shown.map((p) => {
            const m = KIND[p.kind]
            const Icon = m.icon
            const on = voted.has(p.id)
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="rounded-[20px] border border-line bg-card p-3.5 shadow-soft"
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-paper-2 text-[12px] font-bold">
                    {p.author.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold">
                      {p.author}
                      <span className="text-[11px] font-medium text-ink-3">· {p.when}</span>
                    </span>
                    <span className="flex items-center gap-1 truncate text-[11.5px] text-ink-3">
                      <MapPin size={11} className="shrink-0" /> {p.where}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-white" style={{ background: m.color }}>
                    <Icon size={11} /> {m.label}
                  </span>
                </div>
                <p className="mt-2.5 text-[13.5px] leading-relaxed">{p.text}</p>
                {p.reply && open === p.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2.5 flex gap-2 rounded-xl bg-leaf/8 px-3 py-2 text-[12.5px] text-forest"
                  >
                    <BadgeCheck size={15} className="mt-px shrink-0 text-leaf" />
                    <span>{p.reply}</span>
                  </motion.div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggle(p.id)}
                    aria-pressed={on}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                      on ? 'bg-ink text-white' : 'bg-paper-2 text-ink-2',
                    )}
                  >
                    <ThumbsUp size={13} fill={on ? 'currentColor' : 'none'} /> Me too · <span className="tabular">{p.meToo}</span>
                  </motion.button>
                  <button
                    onClick={() => setOpen(open === p.id ? null : p.id)}
                    disabled={!p.reply}
                    className="flex items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1.5 text-[12px] font-semibold text-ink-2 disabled:opacity-50"
                  >
                    <MessageCircle size={13} /> {p.replies}
                  </button>
                  <span
                    className={clsx(
                      'ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                      p.status === 'Resolved' || p.status === 'Patrol added'
                        ? 'bg-leaf/12 text-leaf'
                        : p.status === 'Works scheduled'
                          ? 'bg-rain/12 text-rain'
                          : 'bg-sun/20 text-[#7a5200]',
                    )}
                  >
                    {p.status}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {!shown.length && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
            <Moon size={18} className="mx-auto mb-1.5" /> No reports here yet
          </div>
        )}
      </div>
    </section>
  )
}
