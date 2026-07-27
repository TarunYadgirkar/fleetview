# Handoff

**Live:** https://fleetview-taruns-projects-248def65.vercel.app
**Repo:** https://github.com/TarunYadgirkar/fleetview

```bash
npm install && npm test && npm run dev
```

60 tests green. Build is clean under `tsc --noEmit` with strict mode. Bundle is 8.2 kB gzipped
JS + 1.8 kB CSS, no runtime dependencies, no network calls at runtime.

## What works

**MAPF core — Conflict-Based Search, optimal.** Space-time A* with vertex and edge constraints
and goal-persistence; high-level best-first constraint tree with deterministic tie-breaking;
vertex and edge/swap conflict detection. Verified against 8 hand-computed instances (corridor
swap, bottleneck door, cyclic rotation, adjacent swap, open-room cross, follow, parallel lanes,
straight line) — CBS matches the known optimal sum-of-costs on every one.

**Prioritized planning fallback.** Fixed priority order with full space-time reservations,
including rest-at-goal occupancy. `planMapf` runs CBS under a deterministic node-expansion budget
and falls back when exhausted, reporting which strategy answered. A test asserts prioritized
*fails* the single-alcove corridor swap that CBS solves — the fallback is a real downgrade, not a
free substitute.

**Discrete-event simulation.** Tick-based, deterministic given `(layout, fleet, seed, config)`.
Seeded Poisson or fixed-interval order arrivals; robots assign, travel, pick, dwell, deposit,
recharge below threshold, and return to staging when idle. Turn cost, per-cell travel time,
payload, battery and charge rate all modelled.

**Safety by construction.** Movement uses cooperative reservation stepping: a cell may be entered
only if empty or already vacated this tick, and each cell is claimed at most once. Vertex
collisions and edge swaps cannot be represented. `checkInvariants()` is an independent audit
(cell sharing, wall occupancy, swaps, item conservation) asserted every tick across randomized
runs, 200-robot runs, and every degenerate layout.

**Metrics.** Orders/hour, per-robot and fleet utilisation, mean and p95 latency, congestion
heatmap (occupancy plus denied moves), item accounting. Throughput-vs-fleet-size sweep with
saturation knee detection.

**ROI.** Capex, annual labour saved, ops cost, net saving, payback months, ROI at horizon.

**App.** Grid editor with six cell tools plus robot placement, floor resize/clear, PNG backdrop
tracing, validated JSON import/export, three realistic presets, Web Worker execution, canvas
rendering, playback with scrub and 1×–16× speed, congestion overlay.

## What is stubbed or deliberately limited

Nothing is stubbed behind a fake interface — every module listed in `SPEC.md` is implemented.
The real limitations:

1. **CBS does not drive the live simulation loop.** It powers the planner facade and is graded by
   the fixtures; the tick loop uses reservation stepping over cached BFS distance fields because
   running CBS every tick cannot meet the 10k-tick performance target. Documented in DECISIONS
   D4/D13 — this is the deliberate split, not an accidental substitution.
2. **Cyclic rotation deadlocks.** Reservation stepping requires somebody to vacate first, so a
   closed ring of robots each wanting the next cell cannot rotate. The id-staggered retreat
   breaker resolves most cases; a perfect ring in a loop-free layout will stall.
3. **Physically infeasible layouts stall, by nature.** Two robots with opposing full-length
   traversals in a dead-end single-width corridor cannot both finish. Asserted as safe
   degradation rather than completion (DECISIONS D14).
4. **Greedy nearest-robot assignment** (DECISIONS D8). Deterministic and adequate, but leaves
   throughput on the table.
5. **Turn cost and battery are outside CBS optimality grading** (DECISIONS D4), so fixture optima
   stay comparable to the MAPF literature.
6. **PNG tracing is manual.** The image is a backdrop; you draw the geometry yourself.
7. **No persistence.** Layouts survive only via JSON export.

## Three highest-value next steps

1. **Windowed CBS in the live loop.** Detect congested clusters each replan interval and run CBS
   over just those robots on a short time horizon, keeping reservation stepping elsewhere. This
   makes the optimal core drive playback rather than only the planner facade, and it removes the
   cyclic-rotation limitation, which is the one class of stall the current scheme cannot solve.
2. **Better task assignment.** Replace greedy nearest with regret-based auction or Hungarian
   matching over the pending window. This is the cheapest large gain in orders/hour and would
   visibly move the saturation knee — the number the whole tool exists to produce.
3. **Auto-trace PNG to grid.** Threshold plus morphological cleanup to propose walls and racks
   from an uploaded floor plan, with the user correcting rather than drawing from scratch. It is
   the biggest friction point between "I have a warehouse drawing" and "I have a simulation".

## Where to look

| Question | File |
|---|---|
| Scope and interfaces | `SPEC.md` |
| Why a choice was made | `DECISIONS.md` |
| What was pulled in | `DEPENDENCIES.md` |
| Work log | `PROGRESS.md` |
| Setup and usage | `README.md` |
