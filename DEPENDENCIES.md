# External dependencies

Everything pulled in, what it is, why.

## Build tooling (dev dependencies)
| Package | What | Why |
|---|---|---|
| `vite` | build tool / dev server | bundles app + web worker, produces static `dist/` |
| `typescript` | type system | strict-mode source per global prefs |
| `vitest` | test runner | runs the acceptance suite; Vite-native, fast |

## Runtime dependencies (all bundled, none fetched at runtime)
| Package | What | Why |
|---|---|---|
| `motion` | animation | only `motion/mini` (~2.5 kB) is imported — WAAPI-backed `animate` for entrances, toasts and button feedback. The full engine was 19 kB gzipped for two functions. |
| `lucide` | icon set | SVG path data, tree-shaken to the ~20 icons actually used and inlined as markup. No icon font, no sprite fetch. |
| `@fontsource-variable/archivo` | display typeface | industrial grotesque for headings/UI. Self-hosted. |
| `@fontsource-variable/jetbrains-mono` | mono typeface | data, labels and metrics. Self-hosted. |

Only the **latin** font subsets are referenced, via hand-written `@font-face` rules in
`styles.css`. The packages' own CSS pulls Cyrillic, Greek and Vietnamese too, which tripled the
font payload for glyphs the UI never renders.

Nothing is loaded from a CDN. The spec requires the app to run from a static file, so every
asset is bundled and the built `dist/` works offline. Spline was considered for the landing
animation and rejected: it is a 3D scene runtime that fetches its player and scene at runtime,
which breaks the offline requirement and costs hundreds of kilobytes for a page whose subject is
a dense 2D data tool. The landing animation is instead the real CBS solver drawn on a canvas.

The simulation core (RNG, grid, A*, CBS, sim) is hand-written from scratch — no pathfinding or
MAPF library — because the spec requires implementing CBS "properly" and the acceptance tests
grade our own algorithm.

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
