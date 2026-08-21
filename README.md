# rome-pathfinding

Romania map pathfinding visualizer — AI assignment (KMITL Year 3, 2026).

**Live:** Vercel deploy | **Video:** YouTube 10–15 min demo | **Due:** 2026-10-13

---

## What it does

Step-by-step animation of search algorithms on the Romania map. Bento two-lane layout for side-by-side algorithm comparison. Frontier/visited highlighting, arc overlay, speed slider, play/pause/step, H-value heatmap, click-to-set-landmark.

## Stack

- Vite 8 + React 19 + TypeScript ~6.0
- shadcn/ui + lucide-react
- Package manager: **bun**
- React Compiler enabled (`babel-plugin-react-compiler`)
- Pure client-side SPA, no SSR → Vercel

## Run

```bash
bun install
bun dev
```

Type-check + self-checks:

```bash
bun x tsc -b
bun run src/heuristic.ts   # LP+ALT admissibility checks
bun run src/astar.ts       # Arad→Bucharest = 418
bun run src/biastar.ts     # bidirectional check
```

## Algorithms

| Key | Label | Heuristic | Optimal | Complete |
|-----|-------|-----------|---------|----------|
| bfs | BFS | — | Yes* | Yes |
| dfs | DFS | — | No | No* |
| ucs | UCS | — | Yes | Yes |
| biucs | Bidirectional UCS | — | Yes | Yes |
| greedy | Greedy | LP+ALT | No | No* |
| astar | A* (LP) | LP only | Yes | Yes |
| astaralt | A* (LP+ALT) | LP+ALT combined | Yes | Yes |
| astaraltonly | A* (ALT only) | ALT (active preset) | Yes | Yes |
| biastar | Bidirectional A* | LP+ALT | Yes | Yes |

## Heuristic

`h = max(hLP, hALT)` — max of two independently admissible bounds.

**LP (vector-decomposition):** offline scipy/HiGHS LP using pixel coords + edge km. Mean h/road = 0.729.

**ALT (Landmarks + Triangle Inequality):** `h(n,goal) = max_L |d(L,n) − d(L,goal)|`. Three presets: lm2 / lm4 / lm8. Dijkstra precomputed at module load.

Combined: mean h/road = **0.986** on 380 directed pairs.

**Data source: PDF page 2 only. SLD and GPS are banned by assignment rules.**

## Source layout

```
src/
  romania.ts          — graph data (edges + schematic SVG coords, no SLD)
  search.ts           — SearchResult type, ALGORITHMS registry
  heuristic.ts        — h() = max(hLP, hALT), self-checks
  heuristic_table.ts  — LP lookup table (offline-solved)
  alt.ts              — ALT landmarks, Dijkstra, makeHALTArbitrary()
  bfs.ts / dfs.ts     — reference implementations
  ucs.ts / biucs.ts   — cost-based uninformed search
  greedy.ts           — greedy best-first (uses h)
  astar.ts            — A* with LP heuristic
  astar-alt.ts        — A* with combined LP+ALT
  astar-alt-only.ts   — A* with ALT only
  biastar.ts          — bidirectional A* (Pohl 1971 stopping)
  App.tsx             — UI, toolbar, map render, heatmap, lane comparison
```
