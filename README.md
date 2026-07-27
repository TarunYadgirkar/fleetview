# FleetView

Browser-based warehouse robot fleet planner. Draw a floor plan, place a robot fleet, and get
throughput, congestion and payback analysis. Single-page app, no backend, ships as static files.

The technical core is a proper **Conflict-Based Search** MAPF solver (optimal sum-of-costs, with
prioritized planning as a budgeted fallback) driving a deterministic discrete-event simulation
that runs in a Web Worker.

## Setup

```bash
npm install
```

## Usage

```bash
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

`npm run build` typechecks and emits a fully static `dist/` — open `dist/index.html` from disk or
host it anywhere. There is no server component and no external network dependency at runtime
(system fonts only, so it works offline).

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
congestion overlay showing per-cell contention accumulated over the run.

**Find the right fleet size.** The sweep runs one simulation per fleet size and plots
throughput against fleet size, marking the saturation knee — the smallest fleet that still
reaches 95% of peak throughput.

**Check the money.** The payback panel takes hardware cost, annual ops cost, displaced labour
cost and headcount, and returns capex, annual net saving, payback period and ROI at your horizon.

**Play it back.** Scrub through the run, or play it at 1×–16×.

Three presets ship with the app: a goods-to-person **Fulfillment Centre**, an open
**Cross-Dock Sortation** floor, and a bottleneck-heavy **Dense Cold Storage** layout.

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
src/ui/              canvas renderer, editor, panels, charts
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

60 tests covering:

- **MAPF optimality** — 8 hand-verified instances (corridor swap, bottleneck, cyclic rotation,
  adjacent swap, and others); CBS must match the known optimal sum-of-costs on each.
- **Hard invariants** asserted every tick across randomized runs: no two robots in one cell, no
  robot inside a wall, no edge swaps, every accepted order completes, item count conserved.
- **Determinism** — same seed and layout produce identical metrics and identical per-tick
  snapshots.
- **Degenerate layouts** — single corridor, fully blocked, zero robots, 200 robots.
- **Performance** — 50 robots on a 100×100 grid, 10,000 ticks in under 10 s (currently ~2 s).
- Presets, layout validation, ROI, and playback frame capture.

## Documents

- `SPEC.md` — scope, interfaces, out-of-scope
- `DECISIONS.md` — every autonomous judgement call and why
- `DEPENDENCIES.md` — what was pulled in and why
- `PROGRESS.md` — running work log
- `HANDOFF.md` — what works, what is stubbed, what to do next
