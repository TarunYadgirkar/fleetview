# Progress

Updated every ~30 min of work. Newest first.

## Log

### T4 — UI overhaul: explainer page, design system, timeline
- **Explainer view** ("what is this"): hero, live CBS-vs-naive corridor demo driven by the real
  solver, 3-step how-it-works, metric glossary. First visit + reopenable via ?.
- **Design system**: self-hosted Archivo + JetBrains Mono (latin only), lucide icons inlined,
  `motion/mini` for animation. All bundled — no CDN, still runs offline. Spline rejected (3D
  runtime, network-dependent); see DECISIONS D17.
- **Planner**: interpolated robot motion + trails, rack depth, legend, robot inspector, wheel
  zoom / drag pan, toasts, progress bar, keyboard shortcuts, verdict sentence.
- **New feature**: sampled run timeline + chart (completed / busy / queue over time).
- Bug fixed: metrics never rendered in a background tab (count-up was rAF-only).
- Defaults retuned by measurement against the real fleet spec (DECISIONS D19). Found congestion
  collapse: with turn costs, an 8-robot fleet's throughput *falls* as demand rises.
- Mobile: transport re-laid out so the scrubber gets a full-width row; no horizontal overflow.
- **65 tests green.** 19.3 kB gzipped JS.

### T3 — COMPLETE: whole spec green, app built, deployed
- Simulation, metrics, fleet sweep, presets, layout JSON, worker, UI all implemented.
- **60 tests green**, strict typecheck clean, production build 8.2 kB gzipped JS.
- Perf: 50 robots / 100×100 / 10k ticks in ~2.1 s (budget 10 s).
- Deployed: https://fleetview-taruns-projects-248def65.vercel.app (verified running in prod).
- Repo public: https://github.com/TarunYadgirkar/fleetview
- Three bugs found and fixed by the invariant/UI checks, not by guessing:
  occupancy-map corruption on follower moves; idle robots squatting on stations stranding orders;
  saturation knee misreported at 4 robots on a curve still climbing to 16.
- Two tests corrected as genuinely wrong, both made *stronger*, logged in DECISIONS D12/D14.
- **Next**: see HANDOFF.md — windowed CBS in the live loop, better task assignment, PNG auto-trace.
- **Blocked**: nothing.

### T2 — MAPF core + ROI GREEN (checkpoint: user restarting machine)
- **CBS optimal core GREEN**: all 25 MAPF tests pass — optimal SOC on all 8 fixtures, valid
  conflict-free solutions, determinism, prioritized fallback, CBS-necessity proven (prioritized
  fails F3 swap, CBS solves it).
- **ROI GREEN**: 2/2.
- Added fast static A* (`shortestPath.ts`) for robot routing (no test of its own; exercised by sim).
- **Remaining RED**: Simulation (invariants/determinism/degenerate/perf), scan. Simulation still
  stubbed — mid-implementation. Support modules next: orders.ts, metrics.ts, then the tick loop.
- **Resume here**: implement `src/sim/orders.ts`, `src/sim/metrics.ts`, then `Simulation` in
  `src/sim/simulation.ts` (reservation-based stepping + detour-on-block; design in DECISIONS D13),
  then `src/sim/scan.ts`. Run tests/invariants, determinism, degenerate, performance, scan to green.
- Test tweak pending: single-corridor degenerate should use 1 robot for the completion assertion
  and a separate 2-robot case for invariants-only (2 robots in a 1-wide corridor can deadlock by
  construction). See planned change; will note in DECISIONS.
- **Blocked**: nothing.

### T1 — acceptance suite RED + core started (checkpoint: user restarting machine)
- Full acceptance suite authored, all 42 tests RED with clean "not implemented" throws.
- Implemented: rng, grid, types, MinHeap, space-time A* (real), warehouse builder (real).
- Stubs remain (throw): cbs, prioritized, mapf facade, Simulation, scan, roi.
- Fixed one wrong test (fallback instance F3→F4); see DECISIONS D12.
- **Next**: implement cbs.ts → green MAPF optimality tests; then prioritized + mapf facade;
  then Simulation (reservation stepping) → invariants/determinism/degenerate/perf; then scan + roi.
- **Blocked**: nothing. Remote push set up at this checkpoint.

### T0 — scaffold + spec
- Created project, git init, Vite/TS/Vitest config.
- Wrote SPEC.md, DECISIONS.md, DEPENDENCIES.md.
- **Next**: write acceptance test suite (must fail) — MAPF fixtures + invariants +
  determinism + degenerate + perf. Then implement core to green.
- **Blocked**: nothing.

## Status board
- [x] Scaffold + config
- [x] SPEC / DECISIONS / DEPENDENCIES
- [x] Acceptance tests authored (RED)
- [x] RNG + grid + types
- [x] Space-time A*
- [x] CBS
- [x] Prioritized fallback + planner facade
- [x] Order gen + robot + simulation + invariants
- [x] Metrics + fleet-size scan
- [x] Web worker
- [x] UI: editor, canvas, playback, panels, PNG trace
- [x] 3 presets
- [x] README + HANDOFF
- [x] Deploy to Vercel
