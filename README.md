# FleetView

Browser-based warehouse robot fleet planner. Draw a floor plan, place a robot fleet, and get
throughput, congestion and payback analysis. Single-page app, no backend, ships as static files.

**[Live demo →](https://fleetview-kappa.vercel.app)** — no install, runs entirely in the browser.

Route each robot on its own and two of them eventually want the same cell on the same tick. In a
single-width aisle they meet nose to nose and neither moves again — the floor quietly stops
working. FleetView plans the fleet together with **Conflict-Based Search**: it finds the conflict,
branches on it, and re-plans the cheapest way around. The landing page demonstrates that rather
than asserting it — it calls `cbs()` live and races it against naive per-robot routing on the same
corridor, side by side. CBS drives a deterministic discrete-event simulation that runs in a Web
Worker.

## What holds up

- **69 tests pass**, whole suite in a few seconds: MAPF optimality, property-based verification,
  per-tick invariants, determinism, degenerate layouts, performance.
- **CBS matches the known-optimal sum-of-costs on 8 hand-verified MAPF instances** — corridor
  swap, bottleneck door, cyclic rotation, adjacent swap, open-room cross, follow, parallel lanes,
  straight line.
- **The optimality claim is also checked as a property over 800 seeded random instances** nobody
  chose: solutions are physically valid, never below the sum-of-costs lower bound, never worse
  than prioritized planning, and invariant under permuting the agents.
- **The prioritized fallback is a real downgrade, and a test proves it**: prioritized planning
  *fails* the single-alcove corridor swap that CBS solves.
- **50 robots on a 100×100 grid for 10,000 ticks** finishes in roughly half a second here, against
  a 10 s budget asserted in the suite.
- **19.6 kB gzipped JS + 3.9 kB gzipped CSS.** Self-hosted fonts, no CDN, no network calls at
  runtime.

## What you can do

**Draw a floor.** Pick a tool from the left rail and paint on the grid: walls, racks, pick
stations, deposit lanes, charge docks, and robot homes. Everything is grid-snapped. Resize or
clear the floor at any time.

**Trace a real plan.** *Trace a PNG* loads an image as a backdrop behind the grid so you can draw
over an existing warehouse drawing. The image is reference only — it never becomes geometry.

**Import / export.** Layouts round-trip as JSON (schema v1, validated on import).

**Configure the fleet.** Robot count, ticks per cell, turn cost, payload, battery capacity,
charge rate, and the battery threshold that sends a robot to a dock.

**Run.** Orders arrive on a seeded Poisson (or fixed-interval) process. Robots are assigned work,
travel, pick, deposit, recharge, and return to staging. The run happens in a Web Worker, so the
UI stays responsive.

**Read the results.** Orders per hour, robot utilisation, mean and p95 order latency, and a
congestion overlay showing per-cell contention accumulated over the run. A timeline chart plots
completed orders, robots working and queue depth across the run — that is where warm-up,
saturation and late queue growth show up. A plain-English verdict states the conclusion:
oversubscribed, over-provisioned, or balanced.

**Inspect what happened.** Click any robot during playback to see its state, cell and load.

**Read the explainer.** First visit opens a "what is this" page, whose centrepiece is the live
CBS-vs-naive corridor described above. Because it re-renders from the actual `cbs()`
implementation it cannot drift away from the code. Reopen it any time with the **?** button in the
planner.

Navigating the floor: **pinch, or ctrl/⌘ + scroll, to zoom** — or use the `− 100% +` control in
the corner of the canvas. Drag with the middle or right mouse button to pan; once zoomed in,
plain scrolling pans too. `0` resets the view. Keyboard: `1`–`7` pick a draw tool, `space`
plays/pauses, `r` runs, `h` toggles the heatmap.

**Find the right fleet size.** The sweep runs one simulation per fleet size and plots
throughput against fleet size, marking the saturation knee — the smallest fleet that still
reaches 95% of peak throughput.

**Check the money.** The payback panel takes hardware cost, annual ops cost, displaced labour
cost and headcount, and returns capex, annual net saving, payback period and ROI at your horizon.

**Play it back.** Scrub through the run, or play it at 1×–16×.

Three presets ship with the app: a goods-to-person **Fulfillment Centre**, an open
**Cross-Dock Sortation** floor, and a bottleneck-heavy **Dense Cold Storage** layout.

## Setup

Node 18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173.

Other commands:

```bash
npm test
```

```bash
npm run build
```

`npm run build` typechecks and emits a fully static `dist/` — serve it from anywhere, e.g.
`npx serve dist` or `python3 -m http.server -d dist`. (A module entry script and a module Worker
both need an http origin, so `dist/index.html` opened straight off disk will not boot.) There is
no server component and no external network dependency at runtime — fonts and icons are bundled,
so it works offline once served.

## Determinism

A run is fully determined by `(layout, fleet spec, seed, config)`. All randomness flows through
one seeded PRNG threaded explicitly; there is no `Math.random()` or `Date.now()` in the core or
the simulation, and every queue and neighbour iteration has a total tie-break order. The same
inputs always produce byte-identical metrics — this is asserted in the test suite.

## Architecture

```
src/core/            grid, seeded RNG, layout JSON (validated), shared types
src/core/pathfinding/
  astar.ts           space-time A* with vertex/edge constraints + goal persistence
  cbs.ts             Conflict-Based Search (optimal, sum-of-costs)
  prioritized.ts     prioritized planning fallback (fast, incomplete)
  mapf.ts            planner facade: CBS within a budget, else fallback
src/sim/             orders, distance fields, simulation, metrics, fleet sweep, ROI
src/worker/          worker entry + message protocol
src/ui/
  app.ts             planner controller
  renderer.ts        canvas floor renderer (interpolation, trails, heat)
  intro.ts           explainer view
  demo.ts            live CBS-vs-naive corridor animation
  charts.ts          timeline + fleet-size curve
  icons.ts           inlined lucide SVG
  motion.ts          reduced-motion-aware animation helpers
  toast.ts           transient notices
src/presets/         three demo layouts
tests/               acceptance suite
```

### Why two planners

CBS is complete and optimal but its cost is exponential in the number of conflicts. The facade
runs CBS under a deterministic node-expansion budget and falls back to prioritized planning when
that budget is exhausted, reporting which strategy produced the answer. Prioritized planning is
fast but incomplete — it cannot solve a single-alcove corridor swap, which the test suite asserts
directly, so the fallback is a genuine downgrade rather than an equivalent.

The real-time simulation loop does not run CBS every tick — that could not hit the performance
target. It uses cooperative reservation stepping over cached BFS distance fields, where a robot
may enter a cell only if it is empty or already vacated this tick, and each cell can be claimed
once. Vertex collisions and edge swaps are therefore impossible to represent, not merely
detected. See `DECISIONS.md` (D4, D13, D15).

## Testing

```bash
npm test
```

69 tests covering:

- **MAPF optimality** — 8 hand-verified instances (corridor swap, bottleneck, cyclic rotation,
  adjacent swap, and others); CBS must match the known optimal sum-of-costs on each.
- **MAPF properties** — 4 seeds × 200 generated instances (small grids, random wall density, 2–4
  agents), each asserting four properties of an optimal sum-of-costs solver: physical validity,
  cost at or above the independent-shortest-path lower bound, cost at or below prioritized
  planning, and the same optimal cost after permuting the agent array. The last one is what a
  fixed-order fixture cannot see — it catches per-agent constraint-indexing and tie-breaking bugs.
  Instances that exceed the expansion budget are skipped, and the skip count is asserted small so
  the suite cannot quietly degrade into testing nothing.
- **Hard invariants** asserted every tick across randomized runs: no two robots in one cell, no
  robot inside a wall, no edge swaps, every accepted order completes, item count conserved.
- **Determinism** — same seed and layout produce identical metrics and identical per-tick
  snapshots.
- **Degenerate layouts** — single corridor, fully blocked, zero robots, 200 robots.
- **Performance** — 50 robots on a 100×100 grid, 10,000 ticks in under 10 s (about 0.5 s on a
  current laptop).
- Presets, layout validation, ROI, playback frame capture, and the run timeline (bounded
  sample count, monotonic completions, closes on the true final tick).

## Documents

- `SPEC.md` — scope, interfaces, out-of-scope
- `DECISIONS.md` — every autonomous judgement call and why
- `DEPENDENCIES.md` — what was pulled in and why
- `PROGRESS.md` — running work log
- `HANDOFF.md` — what works, deliberate limitations, what to do next
