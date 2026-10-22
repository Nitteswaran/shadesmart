# ShadeSmart

Heat-aware, safe and flood-resilient walking navigation for Sime Darby Property townships. Hackathon prototype, modelled on Elmina, Shah Alam.

## What it does

**Resident app (B2C)**
- Computes two routes side by side: the plain shortest path (red, dashed) and the ShadeSmart route (green), using Dijkstra on a real Elmina street graph.
- Sunny mode weights paths by shade at the chosen time of day (tree canopy, covered walkways, building shadow).
- Rainy mode blocks flood-prone, low-lying segments, marks them on the map ("Blocked due to flood risk — Rerouted"), and favours covered walkways.
- Night safety mode (CPTED) favours lit corridors with CCTV and shows streetlights, CCTV and guard posts.
- Shade-preference slider, wheelchair mode, fewer road crossings, and a walk-preview animation.
- SOS Emergency Alert: tap to confirm with a countdown, or hold to send silently. Shows the live GPS position, the nearest guard post and a patrol ETA.

**Developer dashboard (B2B)**
- Heat Gap Map: every path coloured by shade, with an hour-of-day scrubber you can play through the day, and line width showing footfall.
- Flood-risk and night-safety map layers.
- Hotspots: corridors with under 20% shade at noon, ranked by people × exposure.
- Intervention simulator: set the number of trees, metres of covered walkway and streetlights, then see the cost (RM), the shade and walkability uplift, and the residents who benefit.
- Capital plan with a budget tracker and impact per RM 100k.
- Safety and flood watch lists, plus a mock SOS response log.

## Routing cost

```
cost = distance × (1 + (1 − coverage) × (weight − 1) × 1.5)
```

`coverage` means shade on a sunny day, roof cover in the rain, and lighting at night. A weight of 1.0 gives the shortest path.

## Data

The street geometry is real OpenStreetMap data (© OpenStreetMap contributors, ODbL). Shade, cover, lighting, flood risk, footfall, guard posts and SOS history are **synthetic demo data**. They are generated deterministically by `scripts/build-graph.mjs`:

```
node scripts/build-graph.mjs   # data/osm/*.json  →  src/data/township.json
```

Basemap tiles come from [OpenFreeMap](https://openfreemap.org) and need no API key.

## Stack

Vite, React and TypeScript, with Tailwind CSS v4, MapLibre GL, Recharts, Lucide icons and Motion. The app has no backend, no auth and no database.

```
npm install
npm run dev
npm run build
```
