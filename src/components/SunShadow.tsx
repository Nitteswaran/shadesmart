import clsx from 'clsx'
import { Hand, Trees, Umbrella } from 'lucide-react'
import { useRef, useState } from 'react'
import { airTemp, type Conditions } from '../lib/engine'
import { fmtTime } from '../lib/meta'
import { Eyebrow } from './ui'

const W = 320
const GROUND = 118
const PED_X = 168
const BLDG = { x0: 58, x1: 108, h: 74 } // a 3-storey shophouse, ~12 m
const PX_PER_M = BLDG.h / 12
const SUNRISE = 6.75
const SUNSET = 19.25

function sunAt(h: number) {
  const t = Math.min(1, Math.max(0, (h - SUNRISE) / (SUNSET - SUNRISE)))
  const elev = 84 * Math.sin(Math.PI * t) // Klang Valley: sun nearly overhead at noon
  return { t, elev, x: 22 + (W - 44) * t, y: GROUND - 6 - 96 * Math.sin(Math.PI * t), up: h > SUNRISE && h < SUNSET }
}

/** Shadow cast on the ground by something of height `hgt` spanning [x0, x1]. Sun moves left → right. */
function shadow(x0: number, x1: number, hgt: number, elev: number, sunX: number) {
  const len = elev < 2 ? 400 : hgt / Math.tan((elev * Math.PI) / 180)
  const dir = sunX < (x0 + x1) / 2 ? 1 : -1
  return dir > 0 ? [x0, x1 + len] : [x0 - len, x1]
}

function sky(h: number, night: boolean) {
  if (night || h >= 19.5 || h < 6.5) return ['#0f1430', '#26305e']
  if (h < 7.75) return ['#f3b07a', '#fbe3c4']
  if (h > 17.75) return ['#d9785a', '#f6c79a']
  return ['#bcd9e8', '#f4efe3']
}

export function SunShadow({ cond, onHour }: { cond: Conditions; onHour: (h: number) => void }) {
  const [tree, setTree] = useState(false)
  const [roof, setRoof] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const night = cond.night
  const s = sunAt(cond.hour)
  const up = s.up && !night
  const rainy = cond.weather === 'rainy'

  const shadows: [number, number][] = []
  if (up) {
    shadows.push(shadow(BLDG.x0, BLDG.x1, BLDG.h, s.elev, s.x) as [number, number])
    if (tree) {
      // the canopy sits ~58px up, so its shadow slides away from the sun as it drops
      const cx = PED_X + 18
      const off = Math.min(200, 58 / Math.tan((Math.max(s.elev, 1) * Math.PI) / 180)) * (s.x < cx ? 1 : -1)
      shadows.push([cx - 34 + off, cx + 34 + off])
    }
  }
  const roofShade = roof && (up || rainy)
  const roofSpan: [number, number] = [PED_X - 34, PED_X + 34]
  if (roof && up) {
    const off = Math.min(60, 40 / Math.tan((Math.max(s.elev, 5) * Math.PI) / 180)) * (s.x < PED_X ? 1 : -1)
    shadows.push([roofSpan[0] + off, roofSpan[1] + off])
  }
  const shaded = up && shadows.some(([a, b]) => PED_X >= Math.min(a, b) && PED_X <= Math.max(a, b))
  const dry = rainy && roofShade
  const air = airTemp(cond.hour, cond.weather, night)
  const feels = night || rainy ? air : shaded ? air - 1 : air + 6 * Math.sin((s.elev * Math.PI) / 180)
  const shadowM = up ? BLDG.h / Math.tan((Math.max(s.elev, 1) * Math.PI) / 180) / PX_PER_M : 0

  const status = night
    ? { text: 'After dark — routing for light, not shade', tone: 'text-[#9aa5ff]' }
    : rainy
      ? dry
        ? { text: 'Dry under the covered walkway', tone: 'text-leaf' }
        : { text: 'Soaked — trees barely stop heavy rain', tone: 'text-rain' }
      : shaded
        ? { text: `In shade · feels ${feels.toFixed(0)}°C`, tone: 'text-leaf' }
        : { text: `Exposed · feels ${feels.toFixed(0)}°C`, tone: 'text-heat' }

  const setFromPointer = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, ((clientX - r.left) / r.width) * (W / (W - 44)) - 22 / (W - 44)))
    onHour(Math.round((SUNRISE + 0.25 + t * (SUNSET - SUNRISE - 0.5)) * 4) / 4)
  }

  const [skyTop, skyBottom] = sky(cond.hour, night)
  const pedColor = night ? '#c9cff7' : rainy ? (dry ? '#1d7a4b' : '#2f6fdb') : shaded ? '#1d7a4b' : '#e4572e'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Eyebrow>Why noon has no shade</Eyebrow>
          <div className={clsx('mt-1 text-[12.5px] font-semibold', status.tone)}>{status.text}</div>
        </div>
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-paper-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-2">
          <Hand size={11} /> drag the sun
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} 150`}
        className="mt-2 w-full cursor-grab touch-none select-none overflow-hidden rounded-xl active:cursor-grabbing"
        onPointerDown={(e) => {
          dragging.current = true
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          setFromPointer(e.clientX)
        }}
        onPointerMove={(e) => dragging.current && setFromPointer(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        role="slider"
        aria-label="Sun position"
        aria-valuenow={cond.hour}
        aria-valuetext={fmtTime(cond.hour)}
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="1" stopColor={skyBottom} />
          </linearGradient>
          <radialGradient id="sunGlow">
            <stop offset="0" stopColor="#ffd56b" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffd56b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height="150" fill="url(#sky)" style={{ transition: 'fill 0.4s' }} />
        {/* sun path */}
        <path d={`M22 ${GROUND - 6} Q ${W / 2} ${GROUND - 198} ${W - 22} ${GROUND - 6}`} fill="none" stroke={night ? '#ffffff22' : '#00000018'} strokeDasharray="3 4" />
        {night ? (
          <>
            {[30, 70, 120, 200, 260, 290, 150].map((x, i) => (
              <circle key={i} cx={x} cy={14 + ((i * 23) % 50)} r="1.1" fill="#fff" opacity="0.7" />
            ))}
            <circle cx="250" cy="34" r="11" fill="#f1ecd7" />
            <circle cx="255" cy="30" r="10" fill={skyTop} />
          </>
        ) : (
          up && (
            <g style={{ transition: 'transform 0.15s' }}>
              <circle cx={s.x} cy={s.y} r="26" fill="url(#sunGlow)" />
              <circle cx={s.x} cy={s.y} r="9" fill={rainy ? '#e8e2d0' : '#f2b33d'} stroke="#fff" strokeWidth="2" />
            </g>
          )
        )}
        {rainy &&
          Array.from({ length: 26 }, (_, i) => (
            <line key={i} x1={(i * 37) % W} y1={(i * 53) % 110} x2={((i * 37) % W) - 4} y2={((i * 53) % 110) + 10} stroke="#2f6fdb" strokeOpacity="0.45" strokeWidth="1.2" />
          ))}
        {/* ground */}
        <rect y={GROUND} width={W} height="32" fill={night ? '#1a1f3d' : '#d9d1c0'} />
        <rect y={GROUND} width={W} height="5" fill={night ? '#262c52' : '#c8bea9'} />
        {/* shadows */}
        {shadows.map(([a, b], i) => (
          <rect key={i} x={Math.min(a, b)} y={GROUND} width={Math.abs(b - a)} height="14" fill="#13140f" opacity="0.28" rx="3" />
        ))}
        {/* building */}
        <rect x={BLDG.x0} y={GROUND - BLDG.h} width={BLDG.x1 - BLDG.x0} height={BLDG.h} fill={night ? '#2a3160' : '#efe7d6'} stroke={night ? '#3a4275' : '#cdbfa3'} />
        {[0, 1, 2].map((r) =>
          [0, 1].map((c) => (
            <rect key={`${r}${c}`} x={BLDG.x0 + 9 + c * 19} y={GROUND - BLDG.h + 10 + r * 22} width="12" height="12" rx="1.5" fill={night ? '#ffd56b' : '#c9dce4'} opacity={night ? 0.8 : 1} />
          )),
        )}
        {/* streetlight */}
        <line x1="236" y1={GROUND} x2="236" y2={GROUND - 64} stroke={night ? '#6b73a8' : '#9b9585'} strokeWidth="2.5" />
        <line x1="236" y1={GROUND - 64} x2="226" y2={GROUND - 64} stroke={night ? '#6b73a8' : '#9b9585'} strokeWidth="2.5" />
        {night && <ellipse cx="226" cy={GROUND + 4} rx="34" ry="8" fill="#ffd56b" opacity="0.35" />}
        {night && <circle cx="226" cy={GROUND - 62} r="5" fill="#ffd56b" />}
        {/* roof */}
        {roof && (
          <g>
            <rect x={roofSpan[0]} y={GROUND - 42} width={roofSpan[1] - roofSpan[0]} height="5" rx="2" fill="#3b6fd8" />
            <line x1={roofSpan[0] + 4} y1={GROUND - 37} x2={roofSpan[0] + 4} y2={GROUND} stroke="#3b6fd8" strokeWidth="2.5" />
            <line x1={roofSpan[1] - 4} y1={GROUND - 37} x2={roofSpan[1] - 4} y2={GROUND} stroke="#3b6fd8" strokeWidth="2.5" />
          </g>
        )}
        {/* tree */}
        {tree && (
          <g>
            <rect x={PED_X + 22} y={GROUND - 46} width="5" height="46" fill="#7a5a3a" />
            <ellipse cx={PED_X + 18} cy={GROUND - 58} rx="34" ry="18" fill="#2f8a55" />
            <ellipse cx={PED_X + 6} cy={GROUND - 64} rx="20" ry="12" fill="#3fa266" />
          </g>
        )}
        {/* pedestrian */}
        <g transform={`translate(${PED_X} ${GROUND})`}>
          {!shaded && up && !rainy && (
            <g opacity="0.7">
              <path d="M-9 -40 q3 -5 0 -10 q-3 -5 0 -10" stroke="#e4572e" strokeWidth="1.6" fill="none" />
              <path d="M9 -40 q3 -5 0 -10 q-3 -5 0 -10" stroke="#e4572e" strokeWidth="1.6" fill="none" />
            </g>
          )}
          <circle cx="0" cy="-30" r="5" fill={pedColor} />
          <path d="M0 -25 L0 -11 M0 -21 L-6 -15 M0 -21 L6 -15 M0 -11 L-5 0 M0 -11 L5 0" stroke={pedColor} strokeWidth="3" strokeLinecap="round" />
        </g>
        {/* readout */}
        <text x="8" y="144" fontSize="9" fontFamily="var(--font-mono)" fill={night ? '#c9cff7' : '#4a4b44'}>
          {fmtTime(cond.hour)} · {up ? `sun ${Math.round(s.elev)}° · shophouse shadow ${shadowM < 30 ? shadowM.toFixed(1) + ' m' : 'long'}` : night ? 'night' : 'sun below horizon'}
        </text>
      </svg>
      <div className="mt-2 flex gap-1.5">
        <button
          onClick={() => setTree(!tree)}
          aria-pressed={tree}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-[11.5px] font-semibold transition',
            tree ? 'border-leaf bg-leaf text-white' : 'border-line hover:bg-paper-2',
          )}
        >
          <Trees size={13} /> {tree ? 'Tree planted' : 'Plant a tree'}
        </button>
        <button
          onClick={() => setRoof(!roof)}
          aria-pressed={roof}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-[11.5px] font-semibold transition',
            roof ? 'border-[#3b6fd8] bg-[#3b6fd8] text-white' : 'border-line hover:bg-paper-2',
          )}
        >
          <Umbrella size={13} /> {roof ? 'Roof built' : 'Add a roof'}
        </button>
      </div>
    </div>
  )
}
