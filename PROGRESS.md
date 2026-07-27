# Progress

Updated every ~30 min of work. Newest first.

## Log

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
