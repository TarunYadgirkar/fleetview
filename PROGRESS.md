# Progress

Updated every ~30 min of work. Newest first.

## Log

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
- [ ] Acceptance tests authored (RED)
- [ ] RNG + grid + types
- [ ] Space-time A*
- [ ] CBS
- [ ] Prioritized fallback + planner facade
- [ ] Order gen + robot + simulation + invariants
- [ ] Metrics + fleet-size scan
- [ ] Web worker
- [ ] UI: editor, canvas, playback, panels, PNG trace
- [ ] 3 presets
- [ ] README + HANDOFF
- [ ] Deploy to Vercel
