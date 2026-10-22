import clsx from 'clsx'
import { CircleCheck, CloudRain, Moon, Siren, Sun, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Header, Toasts, type Toast, type View } from './components/Chrome'
import MapView, { type PlannerLayer } from './components/MapView'
import { InsightsStrip, NavigatePanel, RouteCompare, SCENARIOS, type Scenario } from './components/Navigate'
import { PlannerMapOverlay, PlannerPanel, type PlanItem } from './components/Planner'
import { SOSButton, SOSSheet, type Phase } from './components/SOS'
import { dijkstra, edgeCost, placeById, routeStats, town, type Conditions } from './lib/engine'

const DEFAULT = SCENARIOS[0]

export default function App() {
  const [view, setView] = useState<View>('navigate')
  const [origin, setOrigin] = useState(DEFAULT.origin)
  const [dest, setDest] = useState(DEFAULT.dest)
  const [cond, setCondState] = useState<Conditions>({
    weather: 'sunny',
    night: false,
    hour: 13,
    shadeWeight: 3.5,
    wheelchair: false,
    fewerCrossings: false,
  })
  const [scenario, setScenario] = useState<string | null>(DEFAULT.id)
  const [showNetwork, setShowNetwork] = useState(false)
  const [walking, setWalking] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [sos, setSos] = useState<Phase>('idle')
  const [silent, setSilent] = useState(false)

  const [plannerLayer, setPlannerLayer] = useState<PlannerLayer>('heat')
  const [plannerHour, setPlannerHour] = useState(13)
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
    const r = dijkstra(o.node, d.node, (e) => edgeCost(e, cond))
    return r.found ? r : shortRoute
  }, [o, d, cond, shortRoute])
  const shortStats = useMemo(() => (shortRoute.found ? routeStats(shortRoute, cond) : null), [shortRoute, cond])
  const smartStats = useMemo(() => (smartRoute.found ? routeStats(smartRoute, cond) : null), [smartRoute, cond])
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
        body: 'Emergency distress signal & live GPS sent to Sime Darby Auxiliary Police & Local Guard Post.',
      })
    },
    [pushToast],
  )

  const sosButton = (
    <SOSButton onTap={() => setSos('arming')} onHoldComplete={() => sendSOS(true)} />
  )

  const fitKey = `${origin}-${dest}-${cond.weather}-${cond.night}-${cond.wheelchair}`

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <Header
        view={view}
        onView={(v) => {
          setView(v)
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
              smart={smartRoute}
              showNetwork={showNetwork}
              setShowNetwork={setShowNetwork}
              onSOSTap={() => setSos('arming')}
              onSOSHold={() => sendSOS(true)}
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
              showNetwork={showNetwork}
              plannerLayer={plannerLayer}
              plannerHour={plannerHour}
              selectedCorridor={selectedCorridor}
              onSelectCorridor={setSelectedCorridor}
              walking={walking}
              onWalkEnd={() => setWalking(false)}
              floodHazards={floodHazards}
              fitKey={fitKey}
            />
            {view === 'navigate' ? (
              <>
                <RouteCompare
                  cond={cond}
                  short={shortStats}
                  smart={smartStats}
                  walking={walking}
                  onPreview={() => setWalking(true)}
                  rerouted={cond.weather === 'rainy' && (shortStats?.floodSegments.length ?? 0) > 0}
                />
                <MapLegend night={cond.night} rainy={cond.weather === 'rainy'} />
              </>
            ) : (
              <PlannerMapOverlay layer={plannerLayer} setLayer={setPlannerLayer} hour={plannerHour} setHour={setPlannerHour} />
            )}
          </div>
          {view === 'navigate' && (
            <InsightsStrip cond={cond} shortRoute={shortRoute} smartRoute={smartRoute} short={shortStats} smart={smartStats} />
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

function MapLegend({ night, rainy }: { night: boolean; rainy: boolean }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 hidden flex-col gap-1.5 rounded-2xl border border-line bg-card/95 px-3.5 py-3 text-[11.5px] font-semibold shadow-float backdrop-blur sm:flex md:bottom-4 md:left-4">
      <span className="flex items-center gap-2">
        <svg width="22" height="6" aria-hidden><line x1="1" y1="3" x2="21" y2="3" stroke="#e4572e" strokeWidth="3.5" strokeDasharray="4 3" /></svg>
        Shortest path
      </span>
      <span className="flex items-center gap-2">
        <span className="h-1 w-[22px] rounded-full bg-forest" />
        ShadeSmart route
      </span>
      {night && (
        <>
          <span className="flex items-center gap-2"><span className="mx-[7px] size-2 rounded-full bg-[#ffc95c] shadow-[0_0_8px_#ffc95c]" />Streetlights</span>
          <span className="flex items-center gap-2"><span className="mx-[7px] size-2 rounded-full bg-[#5b8def] ring-1 ring-white" />CCTV</span>
          <span className="flex items-center gap-2"><span className="mx-[5px] size-3 rounded-full bg-rain ring-2 ring-white" />Guard post</span>
        </>
      )}
      {rainy && (
        <span className="flex items-center gap-2">
          <span className="mx-[5px] grid size-3 place-items-center rounded-[3px] bg-sos" />
          Flood blocked
        </span>
      )}
    </div>
  )
}
