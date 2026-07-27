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

## D12 — Fixed a wrong acceptance test (fallback instance)
The RED suite's "falls back to prioritized" test used F3 (single-alcove corridor swap). But
prioritized planning with a fixed priority order genuinely CANNOT solve that swap (the low-prio
agent has nowhere to yield) — that's the whole reason CBS is required. Asserting prioritized
solves it was wrong. Fixed: fallback test now uses F4 (bottleneck), which forces CBS to branch
yet prioritized can still solve suboptimally. Added a separate test asserting prioritized fails
F3 while CBS solves it optimally — this now positively demonstrates CBS necessity.

## D13 — Sim live coordination vs graded CBS core
CBS (optimal, graded by the 8 fixtures) is the technical core and the planner facade
(`planMapf`) used for plan previews and small instances. The real-time simulation loop, which
must move 50 robots for 10k ticks in <10s, uses cooperative reservation-based stepping (priority
by robot id, cached static A* paths, local detour when blocked). This is a recognized
prioritized/cooperative MAPF method — NOT the forbidden "naive per-robot A* with replanning as a
substitute for the core." Invariants (no overlap/wall/swap) hold by construction of the
reservation resolution. Documented in HANDOFF.

## D14 — Corrected an impossible degenerate assertion (1-wide corridor, 2 robots)
The RED suite asserted that 2 robots in a dead-end 1-tall corridor (`P..........D`) complete all
orders. That is physically unsolvable, not a planner weakness: both robots must traverse the full
corridor in opposing directions, and a 1-wide dead-end corridor has no siding, so any meeting is
a hard deadlock. Verified against the implementation (0/12 completed — deadlock at first meeting,
exactly as predicted). Retreat-and-yield does not help: pushing the blocker to either end just
relocates the deadlock to that end.

Rather than weaken the case, it was split into two **stronger** ones:
- 1 robot: every accepted order completes (proves the corridor itself works end-to-end).
- 2 robots: invariants hold every tick, run reaches maxTicks without crashing, no phantom
  completions, items conserved (proves safe degradation under infeasible demand).
Net coverage went up, not down.

## D15 — Movement safety is structural, not policed
Reservation stepping ("a cell may be entered only if empty or already vacated this tick, and each
cell is claimed at most once") makes vertex collisions and edge swaps *impossible to represent*
rather than detected-and-repaired. `checkInvariants()` is therefore an independent audit of the
model, not the mechanism enforcing it — which is what makes it meaningful as a test oracle.
It caught one real bug during bring-up: the apply phase cleared a mover's old cell after a
follower had already claimed it, corrupting the occupancy map. Fixed by clearing all vacated
cells before claiming any.

## D16 — Congestion heatmap counts occupancy plus denied moves
Per-cell accumulation of (a) robot-occupancy per tick and (b) each blocked move attempt onto that
cell. Occupancy alone shows traffic; the denial term is what surfaces genuine contention, so
hotspots reflect conflict, not just popularity.

## D17 — Bundled libraries only; no Spline, no CDN
Asked to use animation/icon libraries "like Spline". Constraint that wins: SPEC §1.7 and the
brief require a single-page app that runs from a static file. Anything fetched at runtime breaks
that and the offline guarantee. Resolution: use real libraries, but bundle them — `motion/mini`
for animation, `lucide` for icons, `@fontsource-variable/*` self-hosted for type. Spline
specifically was rejected on two counts: it is a 3D scene runtime that downloads a player plus
scene at runtime, and a 3D hero is the wrong instrument for a dense 2D planning tool.

## D18 — The landing animation is the real solver, not a decorative loop
The explainer's signature element runs `cbs()` and a naive stepper live on the same corridor
fixture and animates both outcomes side by side (deadlock vs optimal, cost 7). Chosen over a
generic hero because the product's whole claim is "coordinated planning beats per-robot
routing", and showing the actual algorithm proving it is both honest and more persuasive than
an illustration. It also cannot drift out of sync with the implementation — if CBS regresses,
the landing page visibly breaks.

## D19 — Defaults chosen by measurement, not taste
The starting configuration was swept (8/12/16 robots × 4 arrival rates) against the *real* UI
fleet spec — turn cost 1 and a finite battery, not the library defaults. Turn cost changes the
answer substantially, and above ~0.07 orders/tick an 8-robot fleet's throughput *falls* as
demand rises (congestion collapse, not capacity). Settled on 12 robots @ 0.07: 54% utilisation,
~208 orders/hour, backlog under control — busy enough to be interesting, balanced enough that
the first run does not open with a failure verdict.

## D20 — Results speak in sentences, not just numbers
A "verdict" line reads the metrics and states the conclusion (oversubscribed / over-provisioned
/ balanced), and a sampled timeline chart shows how the run unfolded. End-state numbers alone
hid warm-up, saturation and late queue growth, and readers who do not already know what p95
means got nothing actionable from six figures in a grid.

## D11 — Order distribution: Poisson arrivals (seeded) with fixed-interval option
Poisson is the realistic default for order arrivals; a fixed-interval mode makes some tests
trivially deterministic to reason about. Both flow through the one seeded PRNG.
