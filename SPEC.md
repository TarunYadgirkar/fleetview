# FleetView — Specification

Browser-based warehouse robot fleet planner. Floor plan in → throughput + ROI out.
Single-page app, no backend, ships as static files.

## 1. Scope

### 1.1 Floor plan editor
- Grid-based canvas. Every cell is one of: `empty`, `wall`, `rack`, `pick` (pick station),
  `charge` (charging dock), `deposit` (drop-off / packing).
- Tools: paint/erase each cell type. Grid-snapped (integer cell coords).
- Import/export layout as JSON (schema in §4).
- Import a PNG as a backdrop and trace over it (PNG never becomes authoritative geometry;
  it is a visual reference layer only).
- Adjustable grid dimensions (width × height in cells) and cell size (px, view-only).

### 1.2 Robots
- Place N robots at start cells (must be non-wall).
- Per-fleet configurable spec:
  - `speed` — cells per second (maps to ticks-per-cell in sim).
  - `turnCost` — extra ticks to rotate 90° (0 = holonomic).
  - `payload` — items carried per trip (≥1).
  - `batteryCapacity` — ticks of active operation on full charge.
  - `chargeRate` — battery ticks restored per tick spent on a dock.
  - `chargeThreshold` — battery fraction below which a robot routes to charge.

### 1.3 MAPF (the technical core)
- **Conflict-Based Search (CBS)**, complete + optimal (sum-of-costs) on 4-connected grid
  with wait actions and unit move cost.
  - Low level: space-time A* honoring vertex + edge (swap) constraints, with goal-persistence
    handling (agent may wait at goal only when no later constraint touches the goal).
  - High level: best-first over the constraint tree, deterministic tie-breaking.
  - Detects vertex conflicts and edge/swap conflicts.
- **Prioritized planning** fallback: fixed deterministic priority order, each agent plans
  around higher-priority agents' full space-time reservations. Used when CBS exceeds a
  configurable time / node-expansion budget. The planner reports which strategy produced the
  solution (`cbs` | `prioritized` | `partial`).
- Turn cost is layered by the simulation (travel timing), not by the optimality-graded CBS
  core, so "optimal cost" stays well-defined against the MAPF literature. See DECISIONS.md.

### 1.4 Discrete-event simulation
- Tick-based, integer time. Fully deterministic given `(layout, fleetSpec, seed, config)`.
- Orders arrive per configurable distribution (Poisson by arrival rate, or fixed interval).
- Robot lifecycle: idle → assigned order → travel to pick → pick (dwell) → travel to deposit
  → deposit (dwell) → idle; routes to charge when battery below threshold.
- Task assignment: greedy nearest-idle-robot (deterministic tie-break by robot id).
- Movement follows MAPF plans; robots replan on a fixed cadence / when goals change.
- Hard invariants enforced/asserted every tick (§5).

### 1.5 Outputs / metrics
- Orders per hour (completed).
- Robot utilization (fraction of ticks in active work vs idle/charging).
- Congestion heatmap: per-cell contention accumulated over time.
- Order latency: mean + p95 (ticks from arrival to completion).
- Throughput-vs-fleet-size curve with saturation point (knee) detection.

### 1.6 ROI panel
- Inputs: hardware cost per robot, annual labor cost displaced per shift-equivalent,
  robots' throughput vs a human baseline.
- Outputs: displaced labor value/yr, total capex, payback period (months), simple ROI %.

### 1.7 Runtime / UX
- Simulation runs in a **Web Worker**; UI thread renders only.
- Canvas rendering. Real-time playback with play/pause, scrub, and speed control.
- Three realistic demo layouts as presets.

## 2. Non-goals / out of scope
- No server, no persistence beyond JSON download / localStorage.
- No continuous-space / kinodynamic planning; grid world only.
- No multi-floor, no 3D.
- No account system, no collaboration.
- Turn cost / battery are modeled in the sim but are NOT part of CBS optimality grading.
- ROI is a simple deterministic model, not a financial-grade forecast.

## 3. Module map

```
src/core/rng.ts              seeded PRNG (mulberry32) + helpers
src/core/grid.ts             Grid type, cell types, neighbors, passability
src/core/types.ts            shared domain types
src/core/pathfinding/astar.ts        space-time A* with constraints
src/core/pathfinding/cbs.ts          Conflict-Based Search
src/core/pathfinding/prioritized.ts  prioritized planning fallback
src/core/pathfinding/mapf.ts         planner facade (CBS + budget + fallback)
src/sim/orders.ts            order generation from a seeded distribution
src/sim/robot.ts             robot state machine
src/sim/simulation.ts        tick loop, invariants, metrics collection
src/sim/metrics.ts           aggregation (utilization, latency, heatmap, curve)
src/sim/scan.ts              throughput-vs-fleet-size sweep
src/worker/sim.worker.ts     worker entry: run sim, stream frames + metrics
src/ui/*                     editor, canvas renderer, panels, playback
src/presets/*                three demo layouts
```

## 4. Layout JSON schema (v1)

```jsonc
{
  "version": 1,
  "width": 20,            // cells
  "height": 12,
  "cells": "….",          // width*height chars, row-major; legend below
  "robots": [ { "id": 0, "x": 1, "y": 1 } ],
  "meta": { "name": "…", "cellSizePx": 32 }
}
```
Cell legend (one char each): `.` empty, `#` wall, `R` rack, `P` pick, `C` charge, `D` deposit.

## 5. Hard invariants (asserted every tick in tests)
1. No two robots occupy the same cell at the same tick.
2. No robot occupies a wall cell.
3. No edge-swap: two robots never exchange cells in one tick.
4. Every accepted order eventually completes within the run (given a solvable layout).
5. Item conservation: items picked − items deposited − items in transit == 0.

## 6. Acceptance tests (authored before implementation)
- **MAPF optimality**: ≥8 hand-built instances with known optimal sum-of-cost; assert CBS
  matches. Includes corridor swap and bottleneck.
- **Invariants**: asserted every tick across long randomized runs.
- **Determinism**: same seed + layout ⇒ identical metrics (deep equal).
- **Degenerate**: single corridor, fully blocked, zero robots, 200 robots.
- **Performance**: 50 robots on 100×100 grid, 10k ticks < 10s.

## 7. Determinism rules
- All randomness flows through one seeded PRNG instance threaded explicitly.
- No `Date.now()` / `Math.random()` in core or sim.
- All priority queues + neighbor iteration use explicit, total tie-break orders.
