import clsx from 'clsx'
import { CircleCheck, CloudRain, Moon, Siren, Sun, TriangleAlert } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Header, Logo, Toasts, type Toast, type View } from './components/Chrome'
import MapView, { type PlannerLayer } from './components/MapView'
import { InsightsStrip, NavigatePanel, RouteCompare, scenariosFor, type Scenario } from './components/Navigate'
import { PlannerMapOverlay, PlannerPanel, type PlanItem } from './components/Planner'
import { SOSButton, SOSSheet, type Phase } from './components/SOS'
import { authority, dijkstra, edgeCost, placeById, routeStats, setTown, town, type Conditions } from './lib/engine'
import { cityById, loadCity, type CityInfo } from './lib/cities'
import { routeBadges, routeTags } from './lib/features'
import { isNightHour } from './lib/daylight'
import { computeOverrides, placementImpact, snapToNetwork, type Placement, type Tool } from './lib/placements'
import { RaceHUD, type MapApi } from './components/Race'
import { ProposalSent, ProposeOverlay } from './components/Propose'
import { newRef, seedProposals, type Proposal, type Reason, type Status } from './lib/proposals'
import { BadgeIcon, BADGE_META } from './components/icons'
import type { BadgeKind } from './lib/features'

interface Target {
  city: string
  origin?: string
  dest?: string
  n: number
}

/** Loads a city's graph, then mounts a fresh CityApp for it (all per-city state resets on switch). */
export default function App() {
  const [target, setTarget] = useState<Target>({ city: 'elmina', n: 0 })
  const [ready, setReady] = useState<Target | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setFailed(null)
    loadCity(target.city)
      .then((t) => {
        if (!live) return
        setTown(t)
        setReady(target)
      })
      .catch(() => live && setFailed(cityById(target.city).name))
    return () => {
      live = false
    }
  }, [target])

  if (!ready)
    return (
      <div className="grid h-dvh place-items-center bg-paper">
        <div className="flex flex-col items-center gap-4">
          <Logo size={56} />
          <div className="font-display text-[22px] font-extrabold tracking-[-0.02em]">{failed ? `Couldn't load ${failed}` : 'Loading ShadeSmart…'}</div>
        </div>
      </div>
    )
  return (
    <CityApp
      key={`${ready.city}-${ready.n}`}
      city={cityById(ready.city)}
      start={ready}
      loadingCity={target !== ready ? cityById(target.city).name : null}
      onCity={(city, origin, dest) => setTarget({ city, origin, dest, n: target.n + 1 })}
    />
  )
}

function CityApp({
  city,
  start,
  loadingCity,
  onCity,
}: {
  city: CityInfo
  start: Target
  loadingCity: string | null
  onCity: (city: string, origin?: string, dest?: string) => void
}) {
  const scenarios = useMemo(() => scenariosFor(city), [city])
  const DEFAULT = scenarios[0]
  const [origin, setOrigin] = useState(() => start.origin ?? DEFAULT.origin)
  const [dest, setDest] = useState(() => {
    const d = start.dest ?? DEFAULT.dest
    return d === (start.origin ?? DEFAULT.origin) ? (city.places.find((p) => p.id !== d)?.id ?? d) : d
  })
  const [cond, setCondState] = useState<Conditions>({
    weather: 'sunny',
    night: false,
    hour: 13,
    shadeWeight: 3.5,
    wheelchair: false,
    fewerCrossings: false,
  })
  const [scenario, setScenario] = useState<string | null>(start.origin || start.dest ? null : DEFAULT.id)
  const [showNetwork, setShowNetwork] = useState(false)
  const [walking, setWalking] = useState(false) // heat race running
  const mapApi = useRef<MapApi | null>(null)
  const [placements, setPlacements] = useState<Placement[]>([])
  const [plantTool, setPlantTool] = useState<Tool | null>(null)
  const placeId = useRef(0)
  const plannerOverrides = useMemo(() => computeOverrides(placements), [placements])
  const impact = useMemo(() => placementImpact(placements, plannerOverrides), [placements, plannerOverrides])

  // resident proposals
  const [proposals, setProposals] = useState<Proposal[]>(seedProposals)
  const [draft, setDraft] = useState<Placement[] | null>(null)
  const [proposeTool, setProposeTool] = useState<Tool | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [sentProposal, setSentProposal] = useState<Proposal | null>(null)
  const reviewed = proposals.find((p) => p.id === reviewing)

  const [view, setViewState] = useState<View>('navigate')
  const mapPlacements = useMemo<Placement[]>(() => {
    if (view === 'navigate') return [...placements, ...(draft ?? []).map((p) => ({ ...p, proposed: true }))]
    return reviewed && reviewed.status === 'review' ? [...placements, ...reviewed.placements.map((p) => ({ ...p, proposed: true }))] : placements
  }, [view, placements, draft, reviewed])
  const overrides = useMemo(() => computeOverrides(mapPlacements), [mapPlacements])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [sos, setSos] = useState<Phase>('idle')
  const [silent, setSilent] = useState(false)

  const [plannerLayer, setPlannerLayer] = useState<PlannerLayer>('heat')
  const plannerHour = 13 // planner analyses the peak-heat hour
  const [selectedCorridor, setSelectedCorridor] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanItem[]>([])

  const toastId = useRef(0)
  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastId.current
    setToasts((ts) => [...ts.filter((x) => x.title !== t.title).slice(-2), { ...t, id }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 6000)
  }, [])

  const o = placeById(origin)
  const d = placeById(dest)

  const shortRoute = useMemo(() => dijkstra(o.node, d.node, (e) => e.len), [o, d])
  const smartRoute = useMemo(() => {
    const r = dijkstra(o.node, d.node, (e) => edgeCost(overrides.get(e.id) ?? e, cond))
    return r.found ? r : shortRoute
  }, [o, d, cond, shortRoute, overrides])
  const shortStats = useMemo(() => (shortRoute.found ? routeStats(shortRoute, cond, overrides) : null), [shortRoute, cond, overrides])
  const smartStats = useMemo(() => (smartRoute.found ? routeStats(smartRoute, cond, overrides) : null), [smartRoute, cond, overrides])
  const badges = useMemo(
    () => routeBadges(shortRoute.found ? shortRoute : null, smartRoute.found ? smartRoute : null, cond),
    [shortRoute, smartRoute, cond],
  )
  const tags = useMemo(
    () =>
      routeTags(shortRoute.found ? shortRoute : null, smartRoute.found ? smartRoute : null, shortStats?.coverage ?? 0, smartStats?.coverage ?? 0, cond),
    [shortRoute, smartRoute, shortStats, smartStats, cond],
  )
  const floodHazards = useMemo(
    () => (cond.weather === 'rainy' ? (shortStats?.floodSegments ?? []) : []),
    [cond.weather, shortStats],
  )

  const announce = (prev: Conditions, next: Conditions, from = origin, to = dest) => {
    if (next.weather === 'rainy' && prev.weather !== 'rainy') {
      const s = routeStats(dijkstra(placeById(from).node, placeById(to).node, (e) => e.len), next)
      pushToast({
        tone: 'rain',
        icon: CloudRain,
        title: 'Heavy rain & lightning detected',
        body: s.floodSegments.length
          ? `Water rising near Eco Lake — ${s.floodSegments.length} low-lying segment${s.floodSegments.length > 1 ? 's' : ''} blocked. Rerouting through covered shophouse corridors.`
          : 'Rerouting your walk through covered shophouse corridors and away from low-lying paths.',
      })
      if (s.floodSegments.length)
        setTimeout(
          () =>
            pushToast({
              tone: 'sos',
              icon: TriangleAlert,
              title: 'Blocked due to flood risk — Rerouted',
              body: 'Your shortest path crosses a flood-prone underpass. ShadeSmart sent you around it.',
            }),
          700,
        )
    }
    if (next.weather === 'sunny' && prev.weather === 'rainy' && !next.night) {
      pushToast({ tone: 'heat', icon: Sun, title: 'Rain has cleared', body: 'Back to heat-aware routing via tree canopy and shade.' })
    }
    if (next.night && !prev.night) {
      pushToast({
        tone: 'night',
        icon: Moon,
        title: 'Night-time safety mode on',
        body: 'Routing along well-lit corridors with CCTV coverage and active guard posts.',
      })
    }
  }

  const setCond = (patch: Partial<Conditions>) => {
    const next = { ...cond, ...patch }
    // the clock and night mode drive each other: dusk switches night routing on, the toggle jumps the clock
    if (patch.hour !== undefined) next.night = isNightHour(patch.hour)
    else if (patch.night !== undefined && patch.night !== cond.night) next.hour = patch.night ? 21.5 : 13
    announce(cond, next)
    setCondState(next)
    setScenario(null)
    setWalking(false)
  }

  const applyScenario = (s: Scenario) => {
    const next = { ...cond, wheelchair: false, fewerCrossings: false, ...s.cond }
    if (s.id === 'night') next.weather = 'sunny'
    announce({ ...cond, weather: s.id === 'rain' ? 'sunny' : cond.weather, night: s.id === 'night' ? false : cond.night }, next, s.origin, s.dest)
    setOrigin(s.origin)
    setDest(s.dest)
    setCondState(next)
    setScenario(s.id)
    setWalking(false)
  }

  // pretend the resident is a little way into their walk when they raise the alarm
  const sosPosition = smartRoute.coords.length
    ? smartRoute.coords[Math.floor(smartRoute.coords.length * 0.45)]
    : town.nodes[o.node]

  const sendSOS = useCallback(
    (isSilent: boolean) => {
      setSilent(isSilent)
      setSos('sent')
      pushToast({
        tone: 'sos',
        icon: Siren,
        title: isSilent ? 'Silent SOS sent' : 'SOS sent',
        body: `Live GPS sent to ${authority().police} & the nearest guard post.`,
      })
    },
    [pushToast],
  )

  const submitProposal = (reasons: Reason[], note: string) => {
    if (!draft?.length) return
    const p: Proposal = {
      id: `m${Date.now()}`,
      ref: newRef(),
      author: `You · ${o.name}`,
      when: 'Just now',
      reasons,
      note,
      placements: draft,
      supporters: 1,
      status: 'review',
      mine: true,
    }
    setProposals((ps) => [p, ...ps])
    setDraft(null)
    setProposeTool(null)
    setSentProposal(p)
  }

  const decideProposal = (id: string, status: Status) => {
    const p = proposals.find((x) => x.id === id)
    if (!p) return
    setProposals((ps) => ps.map((x) => (x.id === id ? { ...x, status } : x)))
    if (status === 'approved') setPlacements((ps) => [...ps, ...p.placements.map((x) => ({ ...x, id: ++placeId.current, proposed: false }))])
    pushToast(
      status === 'approved'
        ? { tone: 'leaf', icon: CircleCheck, title: `${p.ref} approved`, body: 'Added to the works plan — the heat map now shows the new shade.' }
        : { tone: 'heat', icon: TriangleAlert, title: `${p.ref} declined`, body: 'The resident has been notified.' },
    )
  }

  const sosButton = (
    <SOSButton onTap={() => setSos('arming')} onHoldComplete={() => sendSOS(true)} />
  )

  const fitKey = `${origin}-${dest}-${cond.weather}-${cond.night}-${cond.wheelchair}`

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <Header
        view={view}
        onView={(v) => {
          setViewState(v)
          setDraft(null)
          setProposeTool(null)
          setWalking(false)
        }}
        cond={view === 'planner' ? { ...cond, weather: 'sunny', night: plannerLayer === 'night', hour: plannerHour } : cond}
        sos={sosButton}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {view === 'navigate' && (
          <aside className="thin-scroll shrink-0 border-line lg:w-[400px] lg:overflow-y-auto lg:border-r">
            <NavigatePanel
              origin={origin}
              dest={dest}
              setOrigin={(v) => { setOrigin(v); setScenario(null); setWalking(false) }}
              setDest={(v) => { setDest(v); setScenario(null); setWalking(false) }}
              cond={cond}
              setCond={setCond}
              scenario={scenario}
              applyScenario={applyScenario}
              city={city}
              scenarios={scenarios}
              onCity={onCity}
              smart={smartRoute}
              showNetwork={showNetwork}
              setShowNetwork={setShowNetwork}
              onSOSTap={() => setSos('arming')}
              onSOSHold={() => sendSOS(true)}
              proposing={draft !== null}
              myProposals={proposals.filter((p) => p.mine)}
              onPropose={() => {
                setDraft([])
                setProposeTool('tree')
                setWalking(false)
              }}
            />
          </aside>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={clsx('relative min-h-[560px] flex-1 lg:min-h-0', cond.night && view === 'navigate' && 'bg-night')}>
            <MapView
              view={view}
              cond={cond}
              shortest={shortRoute.found ? shortRoute : null}
              smart={smartRoute.found ? smartRoute : null}
              origin={o}
              dest={d}
              showNetwork={showNetwork || draft !== null}
              plannerLayer={plannerLayer}
              plannerHour={plannerHour}
              selectedCorridor={selectedCorridor}
              onSelectCorridor={setSelectedCorridor}
              apiRef={mapApi}
              overrides={overrides}
              placements={mapPlacements}
              plantTool={view === 'planner' ? plantTool : draft ? proposeTool : null}
              onPlace={(click, tolerance) => {
                const at = snapToNetwork(click, tolerance)
                if (!at) return
                if (view === 'planner' && plantTool) setPlacements((ps) => [...ps, { id: ++placeId.current, tool: plantTool, at }])
                else if (draft && proposeTool) setDraft([...draft, { id: ++placeId.current, tool: proposeTool, at }])
              }}
              focus={reviewed ? reviewed.placements.map((p) => p.at) : null}
              floodHazards={floodHazards}
              badges={badges}
              tags={tags}
              fitKey={fitKey}
            />
            {loadingCity && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-[14px] font-bold text-white shadow-float">
                <span className="size-2.5 animate-ping rounded-full bg-mint" /> Flying to {loadingCity}…
              </div>
            )}
            {view === 'navigate' ? (
              <>
                {draft && (
                  <ProposeOverlay
                    tool={proposeTool}
                    setTool={setProposeTool}
                    draft={draft}
                    onUndo={() => setDraft(draft.slice(0, -1))}
                    onClear={() => setDraft([])}
                    onCancel={() => {
                      setDraft(null)
                      setProposeTool(null)
                    }}
                    onSubmit={submitProposal}
                  />
                )}
                <RouteCompare
                  cond={cond}
                  short={shortStats}
                  smart={smartStats}
                  walking={walking}
                  onPreview={() => setWalking(true)}
                  rerouted={cond.weather === 'rainy' && (shortStats?.floodSegments.length ?? 0) > 0}
                />
                <AnimatePresence>
                  {walking && !draft && shortRoute.found && smartRoute.found && (
                    <RaceHUD
                      key={`${origin}-${dest}`}
                      shortRoute={shortRoute}
                      smartRoute={smartRoute}
                      cond={cond}
                      ov={overrides}
                      mapApi={mapApi}
                      onClose={() => setWalking(false)}
                    />
                  )}
                </AnimatePresence>
                {!draft && <MapLegend night={cond.night} rainy={cond.weather === 'rainy'} kinds={[...new Set(badges.map((b) => b.kind))]} />}
              </>
            ) : (
              <PlannerMapOverlay
                layer={plannerLayer}
                setLayer={setPlannerLayer}
                hour={plannerHour}
                tool={plantTool}
                setTool={setPlantTool}
                impact={impact}
                placementCount={placements.length}
                onUndo={() => setPlacements((ps) => ps.slice(0, -1))}
                onClear={() => setPlacements([])}
              />
            )}
          </div>
          {view === 'navigate' && (
            <InsightsStrip cond={cond} shortRoute={shortRoute} smartRoute={smartRoute} short={shortStats} smart={smartStats} ov={overrides} onHour={(h) => setCond({ hour: h })} />
          )}
        </section>

        {view === 'planner' && (
          <aside className="flex shrink-0 flex-col border-line bg-paper lg:w-[460px] lg:border-l">
            <PlannerPanel
              hour={plannerHour}
              layer={plannerLayer}
              selected={selectedCorridor}
              setSelected={setSelectedCorridor}
              plan={plan}
              setPlan={setPlan}
              proposals={proposals}
              reviewing={reviewing}
              setReviewing={setReviewing}
              onDecide={decideProposal}
              onPlanAdded={(item) =>
                pushToast({
                  tone: 'leaf',
                  icon: CircleCheck,
                  title: 'Added to capital plan',
                  body: `${item.name} · +${Math.round(item.uplift * 100)}% walkability for ${item.residents.toLocaleString()} residents a day.`,
                })
              }
            />
          </aside>
        )}
      </main>

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((ts) => ts.filter((t) => t.id !== id))} />
      <ProposalSent proposal={sentProposal} onClose={() => setSentProposal(null)} />
      <SOSSheet
        phase={sos}
        silent={silent}
        position={sosPosition}
        onCancel={() => setSos('idle')}
        onSend={() => sendSOS(false)}
        onClose={() => setSos('idle')}
      />
    </div>
  )
}

function MapLegend({ night, rainy, kinds }: { night: boolean; rainy: boolean; kinds: BadgeKind[] }) {
  if (!night && !rainy && !kinds.length) return null
  return (
    <div className="absolute bottom-3 left-3 z-10 hidden flex-col gap-1.5 rounded-2xl border border-line bg-card/95 px-3.5 py-3 text-[11.5px] font-semibold shadow-float backdrop-blur sm:flex md:bottom-4 md:left-4">
      {night && (
        <>
          <span className="flex items-center gap-2"><span className="mx-[7px] size-2 rounded-full bg-[#ffc95c] shadow-[0_0_8px_#ffc95c]" />Streetlights</span>
          <span className="flex items-center gap-2"><span className="mx-[7px] size-2 rounded-full bg-[#5b8def] ring-1 ring-white" />CCTV</span>
          <span className="flex items-center gap-2"><span className="mx-[5px] size-3 rounded-full bg-rain ring-2 ring-white" />Guard post</span>
        </>
      )}
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-2">
          <span className="flex w-[22px] justify-center">
            <BadgeIcon kind={k} size={20} />
          </span>
          {BADGE_META[k].label}
        </span>
      ))}
      {rainy && (
        <span className="flex items-center gap-2">
          <span className="mx-[5px] grid size-3 place-items-center rounded-[3px] bg-sos" />
          Flood blocked
        </span>
      )}
    </div>
  )
}
