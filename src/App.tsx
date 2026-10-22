import clsx from 'clsx'
import { CircleCheck, CloudRain, Moon, Siren, Sun, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomNav, Header, Logo, Toasts, useIsDesktop, type MobileTab, type Toast, type View } from './components/Chrome'
import MapView, { type PlannerLayer } from './components/MapView'
import { ConditionsStrip, InsightsStrip, PreferencesStrip, NavigatePanel, RouteCompare, scenariosFor, type Scenario } from './components/Navigate'
import { PlannerMapOverlay, PlannerPanel, type PlanItem } from './components/Planner'
import { SOSButton, SOSSheet, type Phase } from './components/SOS'
import { authority, dijkstra, edgeCost, placeById, routeStats, setTown, town, type Conditions } from './lib/engine'
import { cityById, loadCity, type CityInfo } from './lib/cities'
import { routeBadges, routeTags } from './lib/features'
import { isNightHour } from './lib/daylight'
import { computeOverrides, placementImpact, snapToNetwork, type Placement, type Tool } from './lib/placements'
import { RaceHUD, type MapApi } from './components/Race'
import { MobileInsights } from './components/MobileInsights'
import { ImproveStreet, ResidentForum } from './components/Community'
import { ProposalSent, ProposeOverlay } from './components/Propose'
import { newRef, seedProposals, type Proposal, type Reason, type Status } from './lib/proposals'
import { BadgeIcon, BADGE_META } from './components/icons'
import type { BadgeKind } from './lib/features'

interface Target {
  city: string
  origin?: string
  dest?: string
  view?: View
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
      onCity={(city, origin, dest, view) => setTarget({ city, origin, dest, view, n: target.n + 1 })}
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
  onCity: (city: string, origin?: string, dest?: string, view?: View) => void
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

  const [view, setViewState] = useState<View>(start.view ?? 'navigate')
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
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3200)
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
        title: 'Heavy rain — rerouting',
        body: s.floodSegments.length ? `${s.floodSegments.length} flooded path${s.floodSegments.length > 1 ? 's' : ''} avoided.` : 'Taking covered walkways.',
      })
    }
    if (next.weather === 'sunny' && prev.weather === 'rainy' && !next.night) {
      pushToast({ tone: 'heat', icon: Sun, title: 'Rain cleared', body: 'Back to shade routing.' })
    }
    if (next.night && !prev.night) {
      pushToast({
        tone: 'night',
        icon: Moon,
        title: 'Night mode on',
        body: 'Following lit, watched streets.',
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
        body: `GPS shared with ${authority().police}.`,
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
        ? { tone: 'leaf', icon: CircleCheck, title: 'Proposal approved', body: `${p.ref} added to the works plan.` }
        : { tone: 'heat', icon: TriangleAlert, title: 'Proposal declined', body: `${p.ref} · resident notified.` },
    )
  }

  const sosButton = (
    <SOSButton onTap={() => setSos('arming')} onHoldComplete={() => sendSOS(true)} />
  )

  const fitKey = `${origin}-${dest}-${cond.weather}-${cond.night}-${cond.wheelchair}`

  const desktop = useIsDesktop()
  const [mtab, setMtab] = useState<MobileTab>(start.view === 'planner' ? 'planner' : 'route')
  const mobileMain = useRef<HTMLElement>(null)
  const goTab = (t: MobileTab) => {
    setMtab(t)
    setViewState(t === 'planner' ? 'planner' : 'navigate')
    if (t === 'planner') {
      setDraft(null)
      setProposeTool(null)
    }
    setWalking(false)
    mobileMain.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const navPanel = (section?: 'plan' | 'steps' | 'improve') => (
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
    section={section}
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
      mobileMain.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }}
  />
  )
  const mapInner = (
    <>
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
              compact={!desktop}
              part={desktop ? undefined : 'tools'}
            />
          )}
          {desktop && (
          <RouteCompare
            cond={cond}
            short={shortStats}
            smart={smartStats}
            walking={walking}
            onPreview={() => setWalking(true)}
            rerouted={cond.weather === 'rainy' && (shortStats?.floodSegments.length ?? 0) > 0}
          />
          )}
          <AnimatePresence>
            {desktop && walking && !draft && shortRoute.found && smartRoute.found && (
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
          {desktop && !draft && <MapLegend night={cond.night} rainy={cond.weather === 'rainy'} kinds={[...new Set(badges.map((b) => b.kind))]} />}
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
          compact={!desktop}
        />
      )}
    </>
  )
  const plannerPanel = (
  <PlannerPanel
    city={city}
    onCity={(id) => id !== city.id && onCity(id, undefined, undefined, 'planner')}
    hour={plannerHour}
    layer={plannerLayer}
    selected={selectedCorridor}
    setSelected={(id) => {
      setSelectedCorridor(id)
      if (id) mobileMain.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }}
    plan={plan}
    setPlan={setPlan}
    proposals={proposals}
    reviewing={reviewing}
    setReviewing={(id) => {
      setReviewing(id)
      if (id) mobileMain.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }}
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
  )
  const insights = (
  <InsightsStrip cond={cond} shortRoute={shortRoute} smartRoute={smartRoute} short={shortStats} smart={smartStats} ov={overrides} onHour={(h) => setCond({ hour: h })} />
  )
  const compareInline = (
    <RouteCompare
        inline
        cond={cond}
        short={shortStats}
        smart={smartStats}
        walking={walking}
        onPreview={() => {
      setWalking(true)
      mobileMain.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }}
        rerouted={cond.weather === 'rainy' && (shortStats?.floodSegments.length ?? 0) > 0}
      />
  )

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

      {desktop ? (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {view === 'navigate' && (
          <aside className="thin-scroll shrink-0 border-line lg:w-[400px] lg:overflow-y-auto lg:border-r">
            {navPanel()}
          </aside>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={clsx('relative min-h-[560px] flex-1 lg:min-h-0', cond.night && view === 'navigate' && 'bg-night')}>
            {mapInner}
          </div>
          {view === 'navigate' && insights}
        </section>

        {view === 'planner' && (
          <aside className="flex shrink-0 flex-col border-line bg-paper lg:w-[460px] lg:border-l">
            {plannerPanel}
          </aside>
        )}
      </main>
      ) : (
        <>
          <main ref={mobileMain} className="min-h-0 flex-1 overflow-y-auto pb-28">
            <div className="px-3 pt-3">
              <div
                className={clsx(
                  'relative h-[54dvh] min-h-[340px] max-h-[620px] overflow-hidden rounded-[26px] border border-line shadow-soft md:h-[58dvh]',
                  cond.night && view === 'navigate' && 'bg-night',
                )}
              >
                {mapInner}
              </div>
            </div>
            <AnimatePresence>
              {view === 'navigate' && walking && !draft && shortRoute.found && smartRoute.found && (
                <div className="px-3 pt-3">
                  <RaceHUD
                    inline
                    key={`${origin}-${dest}`}
                    shortRoute={shortRoute}
                    smartRoute={smartRoute}
                    cond={cond}
                    ov={overrides}
                    mapApi={mapApi}
                    onClose={() => setWalking(false)}
                  />
                </div>
              )}
            </AnimatePresence>
            {view === 'navigate' && !draft && mtab !== 'improve' && (
              <div className="px-3 pt-3">
                {mtab === 'steps' ? (
                  <PreferencesStrip cond={cond} setCond={setCond} showNetwork={showNetwork} setShowNetwork={setShowNetwork} />
                ) : (
                  <ConditionsStrip cond={cond} setCond={setCond} />
                )}
              </div>
            )}
            {view === 'navigate' && draft && (
              <div className="px-3 pt-3">
                <ProposeOverlay
                  part="sheet"
                  compact
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
              </div>
            )}
            {view === 'navigate' && mtab !== 'insights' && mtab !== 'improve' && <div className="px-3 pt-3">{compareInline}</div>}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mtab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
                className="pt-4"
              >
                {mtab === 'route' && navPanel('plan')}
                {mtab === 'steps' && navPanel('steps')}
                {mtab === 'insights' && (
                  <MobileInsights
                    cond={cond}
                    shortRoute={shortRoute}
                    smartRoute={smartRoute}
                    short={shortStats}
                    smart={smartStats}
                    ov={overrides}
                    onHour={(h) => setCond({ hour: h })}
                  />
                )}
                {mtab === 'improve' && (
                  <div className="space-y-6 px-3">
                    <ImproveStreet
                      active={draft !== null}
                      mine={proposals.filter((p) => p.mine)}
                      all={proposals}
                      onStart={(t) => {
                        setDraft([])
                        setProposeTool(t)
                        setWalking(false)
                        mobileMain.current?.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    />
                    <ResidentForum />
                    <section>
                      <div className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Township Guardian</div>
                      <SOSButton variant="block" onTap={() => setSos('arming')} onHoldComplete={() => sendSOS(true)} />
                    </section>
                  </div>
                )}
                {mtab === 'planner' && plannerPanel}
              </motion.div>
            </AnimatePresence>
          </main>
          <BottomNav tab={mtab} onTab={goTab} pending={proposals.filter((p) => p.status === 'review').length} />
        </>
      )}

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
