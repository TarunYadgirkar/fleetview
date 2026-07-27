# Decisions

Autonomous choices. Bias: pick the option easier to test, log it, continue.

## D1 — Build tooling: Vite + TypeScript strict + Vitest
"Runs from a static file" satisfied by Vite's static build (`dist/`, relative base). A build
step is justified by Web Worker bundling, TS strict, and a real test runner (Vitest) for the
acceptance suite. Alternative (single hand-written HTML) rejected: no module system, no test
runner, worker inlining pain.

## D2 — No UI framework (vanilla TS + Canvas)
UI is canvas-and-panels. React/Vue add bundle + ceremony for little gain here. Vanilla keeps
the landing bundle within the perf budget and keeps the render loop explicit. DOM panels are
plain elements.

## D3 — npm, not pnpm
pnpm not installed on this machine (`no pnpm`). Global pref is pnpm-when-available; it isn't.
Using npm. Lockfile: package-lock.json.

## D4 — CBS graded on unit-cost 4-connected grid; turn cost lives in the sim
The spec asks CBS to find "optimal cost" on known instances AND robots to have a turn cost.
These fight: classic optimal-MAPF fixtures are unit-cost and orientation-free. Decision:
- CBS core plans on a 4-connected grid, wait allowed, every move cost 1, objective = sum of
  costs. This is the textbook formulation the known-optimal fixtures are defined against.
- Turn cost, speed, and battery are applied by the simulation as per-move timing on top of the
  MAPF cell sequence. So MAPF optimality is testable and matches literature, while robots still
  pay to turn during playback. Documented in SPEC §1.3.

## D5 — CBS objective = sum of costs (SOC), not makespan
SOC is the standard optimality metric for CBS and is what the classic fixtures cite. Path cost
for an agent = index of the last timestep at which it (last) departs toward / sits before goal;
concretely the arrival time T where path = [start … goal] and the agent rests at goal for t≥T.
SOC = Σ Tᵢ.

## D6 — Goal persistence via max-constraint-time
Low-level A* treats (goal, t) as a real goal only when t ≥ the largest time index among that
agent's constraints. Guarantees the agent can sit on its goal forever without violating a
future constraint — the standard CBS completeness trick.

## D7 — Fallback trigger: node-expansion budget (deterministic), plus wall-clock guard
Wall-clock alone is non-deterministic across machines and would break determinism tests.
Primary budget is a node-expansion count (deterministic). A wall-clock cap is a secondary
safety net only for the interactive path; tests use the deterministic node budget so results
are reproducible.

## D8 — Task assignment: greedy nearest idle robot
Simpler than auction/Hungarian, deterministic with id tie-break, adequate to exercise MAPF and
metrics. Marked as a future upgrade in HANDOFF.

## D9 — Project location
Created under the invocation working dir: `/Users/tarunyadgirkar/Claude/fleetview`. User said
"make any repo." Kept next to where the session launched for discoverability rather than the
usual ~/TarunsCode convention.

## D10 — Manhattan heuristic; wait action always available
4-connected ⇒ admissible Manhattan heuristic. Wait (stay in cell, cost 1, time+1) is always a
legal move so agents can yield in corridors — required for corridor-swap solvability.

## D11 — Order distribution: Poisson arrivals (seeded) with fixed-interval option
Poisson is the realistic default for order arrivals; a fixed-interval mode makes some tests
trivially deterministic to reason about. Both flow through the one seeded PRNG.
