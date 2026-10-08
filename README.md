# Pathfinding Explorer

An interactive, pixel-art visualizer for classic search algorithms on the AIMA
"Map of Romania" (20 cities, 23 roads). Pick a start and goal city and two
algorithms, then watch them race side by side on an island map, step by step,
with a live comparison table of their stats.

## Features

- **Side-by-side comparison.** Algorithm A vs. Algorithm B on two independent,
  pannable and zoomable maps.
- **Nine algorithms:** BFS, DFS, UCS, Bidirectional UCS, Greedy best-first,
  A* (LP), A* (ALT only), A* (LP+ALT), and Bidirectional A* (LP+ALT).
- **Custom admissible heuristic.** It doesn't use straight-line distance (see
  [Heuristic](#heuristic)).
- **Playback controls:** play/pause, step forward and back, restart, and a
  speed slider.
- **Landmarks (ALT).** Choose a preset of 2, 4 or 8 landmarks for each side, or
  turn on the *Landmarks* tool and click cities to set your own.
- **Overlays:**
  - *Straight Line* draws the start→goal arc.
  - *Heatmap* colors each city by its ALT h-value (red is near the goal, blue
    is far).
- **Comparison table:** step, current node, visited, frontier, generated,
  path, cost, hops, mean runtime (400 runs), peak frontier size, T(n)/S(n)
  rendered with KaTeX, optimality, completeness, and nodes generated for each
  landmark preset.

## Getting started

You need [Node.js](https://nodejs.org/) 18 or later. [Bun](https://bun.sh/) is
also required to run the tests.

```bash
npm install        # or: bun install
npm run dev        # start the Vite dev server, then open the printed URL
```

| Script              | What it does                                    |
|---------------------|-------------------------------------------------|
| `npm run dev`       | Vite dev server with hot reload                 |
| `npm run build`     | Type-check, then build to `dist/`               |
| `npm run preview`   | Serve the built `dist/` locally                 |
| `npm run typecheck` | `tsc --noEmit` over `src/`                      |
| `bun test`          | Run the test suite in `tests/`                  |

## Project structure

```
index.html              Page layout: controls, two map panels, comparison table
script.js               UI: rendering, playback, map pan/zoom, overlays, DevMode
style.css               Styling (state colors are --state-* CSS tokens)
src/engine/
  romania.ts            Graph data: cities, road km, layout coordinates
  search.ts             Shared types, ALGORITHMS registry, pathCost()
  bfs.ts dfs.ts ucs.ts biucs.ts greedy.ts
  astar.ts astar-alt.ts astar-alt-only.ts biastar.ts
  heuristic.ts          h() = max(hLP, hALT) and landmark preset state
  heuristic_table.ts    Precomputed LP heuristic table (generated)
  alt.ts                ALT landmarks, Dijkstra tables, presets
scripts/
  gen_heuristic_table.py  Regenerates heuristic_table.ts
tests/
  biastar.test.ts       Correctness tests checked against Floyd–Warshall
assets/                 Map, sprites, UI pieces, font, position JSON
HEURISTIC_GUIDE.md      In-depth notes on the heuristic and algorithms
```

## How it works

Every algorithm is a pure function `(start, goal) => SearchResult`:

```ts
type SearchResult = {
  steps: Step[]                          // one frame per expansion, used for animation
  parent: Record<NodeId, NodeId | null>  // search tree
  path: NodeId[]                         // [] if unreachable
  found: boolean
  generated: number                      // nodes ever discovered
}
```

The UI never needs to know which algorithm produced a result. It reads
`ALGORITHMS` from `src/engine/search.ts` to fill the dropdowns and the table.

### Heuristic

The project follows an assignment constraint: **straight-line distance (SLD) and
real-world coordinates are not allowed**, not even as an input to derive another
heuristic. The heuristic is built from two admissible lower bounds, and their
maximum is used:

```
h(n, goal) = max(hLP(n, goal), hALT(n, goal))
```

- **LP (vector decomposition).** An offline linear program finds the cheapest
  way to express the start→goal map vector as a weighted sum of road vectors.
  The real route is one feasible solution, so the LP optimum is a lower bound
  on road km. The values are precomputed in `heuristic_table.ts`.
- **ALT (landmarks + triangle inequality).** `max over L of |d(L,n) − d(L,goal)|`
  using Dijkstra distances from each landmark.

Combined, h averages about 98.6% of the true road distance across all 380
city pairs. For the full derivation, presets and demo tips, see
[HEURISTIC_GUIDE.md](HEURISTIC_GUIDE.md).

### Regenerating the LP table

Do this only if you change the cities or roads in `romania.ts`:

```bash
pip install numpy scipy
python3 scripts/gen_heuristic_table.py
```

## Adding an algorithm

1. Copy `src/engine/bfs.ts` and change only the frontier data structure and
   pop order. Keep the `steps.push(...)` per expansion and use
   `reconstructPath`.
2. Import it in `src/engine/search.ts` and add an entry to `ALGORITHMS` with
   its label, complexity (as LaTeX), optimality and completeness. If it uses
   the ALT heuristic, also set `usesLandmarks: true`.

The dropdowns and comparison table pick it up automatically.

## Editing map positions (DevMode)

City castles, flags and road paths are placed from
`assets/MapElements/Coordinates/castle_positions.json` and `path_positions.json`.
Both use map-image pixel coordinates. When `const DevMode = true` at the top
of `script.js`, a small editor window lets you place marker squares and export
positions in the same JSON format. Set it to `false` before shipping.

## Self-checks and tests

Several engine modules assert known results when they load. For example,
Arad→Bucharest must cost 418, and the path cost of Arad→Sibiu→Fagaras→Bucharest
must be 450. A broken change therefore fails loudly in the browser console.
`bun test` runs regression tests for bidirectional A* and the heuristic,
checked against an independent Floyd–Warshall oracle.

## Tech

Vite, TypeScript (engine), plain JavaScript (UI), and KaTeX for the
complexity formulas.
