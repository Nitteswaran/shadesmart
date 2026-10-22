export const DAY_START = 6
export const DAY_END = 23

/** Night-time safety routing kicks in after dusk and before dawn. */
export const isNightHour = (h: number) => h >= 19.5 || h < 6.75

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

// [hour, tint colour, opacity] — warm at golden hour, deepening to indigo at dusk
const STOPS: [number, string, number][] = [
  [6, '#1c2050', 0.6],
  [6.75, '#3a3a78', 0.42],
  [7.5, '#f08a4b', 0.2],
  [9, '#ffb36b', 0],
  [16.5, '#ffb36b', 0],
  [17.75, '#f07a3a', 0.2],
  [18.75, '#7a3f78', 0.34],
  [19.5, '#1c2050', 0.55],
  [23, '#0d1124', 0.6],
]

/** Colour wash laid over the basemap so the map visibly follows the clock. */
export function dayTint(h: number) {
  if (h <= STOPS[0][0]) return { color: STOPS[0][1], opacity: STOPS[0][2] }
  for (let i = 1; i < STOPS.length; i++) {
    const [h1, c1, o1] = STOPS[i]
    const [h0, c0, o0] = STOPS[i - 1]
    if (h <= h1) {
      const t = (h - h0) / (h1 - h0)
      return { color: mix(c0, c1, t), opacity: o0 + (o1 - o0) * t }
    }
  }
  const last = STOPS[STOPS.length - 1]
  return { color: last[1], opacity: last[2] }
}
