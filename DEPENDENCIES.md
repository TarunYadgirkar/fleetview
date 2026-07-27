# External dependencies

Everything pulled in, what it is, why.

## npm packages
| Package | What | Why |
|---|---|---|
| `vite` | build tool / dev server | bundles app + web worker, produces static `dist/` |
| `typescript` | type system | strict-mode source per global prefs |
| `vitest` | test runner | runs the acceptance suite; Vite-native, fast |

No runtime dependencies. Core (RNG, grid, A*, CBS, sim) is hand-written from scratch — no
pathfinding / MAPF library — because the spec requires implementing CBS "properly" and the
acceptance tests grade our own algorithm.

## Cloned repos / model weights / skills
None pulled. (Skill `superpowers:test-driven-development` used for process; it ships with the
environment, not fetched.)

## Deployment
Vercel static hosting (planned) — build `npm run build`, output `dist/`, no serverless
functions. Logged here when wired.
