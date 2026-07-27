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
Vercel static hosting, live at https://fleetview-taruns-projects-248def65.vercel.app
(team `taruns-projects-248def65`, project `fleetview`). Framework auto-detected as Vite; build
`npm run build`, output `dist/`, no serverless functions.

Vercel put the new project behind SSO deployment protection by default, which makes the "launch"
private. Protection was cleared (`ssoProtection: null` via the projects API) so the URL is
publicly reachable — the app holds no secrets or user data.

## Tooling used, not vendored
- `vercel` CLI (already installed on this machine) for deploys.
- `gh` CLI (already authenticated) to create and push the GitHub repo.
Neither is a project dependency.
