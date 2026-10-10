# rome-pathfinding

Romania map pathfinding visualizer — AI assignment (KMITL Year 3, 2026).

**Due:** 2026-10-13

---

## What it does

Step-by-step animation of search algorithms on the Romania map. Bento two-lane layout for side-by-side algorithm comparison. Frontier/visited highlighting, arc overlay, speed slider, play/pause/step, H-value heatmap, click-to-set-landmark.

Also ships a **Guide tab** that walks from Uniform-Cost Search to A\*, into the heuristic (LP + ALT), the `max` ensemble, and its measured performance, plus a **game-style UI** (pixel-art Romania, animals, day/night) reachable from the mode toggle in the top-left corner. The map view has an optional **merged single-map view** (roads split down the middle, node discs and landmark rings split vertically, one colour per lane).

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
bun x tsc -b   # type-check
bun test       # regression suite: a known-cost case, endpoint edge cases, and an
               # all-pairs cross-check of every registry algorithm against a
               # Floyd–Warshall oracle (25 assertions)
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

**LP (vector-decomposition):** offline scipy/HiGHS LP using pixel coords + edge km. Mean h/road = 0.729 as a mean of per-pair ratios, 0.683 as a ratio of sums (the definition the Guide's tables use). Both are printed by `eval/independent-eval.ts`.

**ALT (Landmarks + Triangle Inequality):** `h(n,goal) = max_L |d(L,n) − d(L,goal)|`. Three presets: lm2 / lm4 / lm8. Dijkstra precomputed at module load.

Combined: mean h/road = **0.986** on 380 directed pairs.

**Data source: PDF page 2 only. SLD and GPS are banned by assignment rules.**

## Source layout

Convention: `@/` is the alias for `src/`, and every cross-directory import uses
it — only siblings are imported relatively. `components/` holds what **both**
UIs share; anything used by one UI lives under its own `features/` folder.

```
src/
  main.tsx       — Vite entry: imports styles/index.css, renders App
  App.tsx        — mode shell (modern ⇄ game) + view-transition crossfade
  theme.tsx      — theme model + ThemeMenu/SpaceField/DndAurora (shared by both UIs)

  algorithms/    — pure search: no React, no DOM
    romania.ts          — graph data (edges + schematic SVG coords, no SLD)
    search.ts           — SearchResult type, ALGORITHMS registry
    heuristic.ts        — h() = max(hLP, hALT)
    heuristic_table.ts  — LP lookup table (AUTO-GENERATED, see scripts/)
    alt.ts              — ALT landmarks, Dijkstra, makeHALTArbitrary()
    bfs.ts / dfs.ts     — reference implementations
    ucs.ts / biucs.ts   — cost-based uninformed search
    greedy.ts           — greedy best-first (uses h)
    astar.ts            — A* with LP heuristic
    astar-alt.ts        — A* with combined LP+ALT
    astar-alt-only.ts   — A* with ALT only
    biastar.ts          — bidirectional A* (independent frontier bounds, reopening)

  features/
    map/
      ModernApp.tsx     — modern UI: state, handlers, layout skeleton
      audio.ts          — synthesised modern-UI audio (Web Audio, no files)
      map/              — modern UI parts: MapStage, StatsSidebar (the 17-metric
                          `cols` table), chrome cards, SVG cartography, benchmark cache
    game/               — game-style UI: pixel scenery, viewport pan/zoom, animals, audio
      animals/          — the six easter-egg creatures (see animals/README.md)

  components/    — shared across both UIs
    Guide.tsx         — Guide tab explainer (UCS → A* → heuristic → ensemble)
    Tex.tsx           — shared KaTeX inline renderer
    ModeToggle.tsx    — modern ⇄ game switch
    guide/            — Figure, GuideNav, GuideSection, scroll-spy, section registry
    ui/               — shadcn primitives (paths pinned by components.json)

  lib/
    utils.ts          — cn()
    benchCache.ts     — session caches for the expensive benchmark/heatmap numbers

  styles/
    index.css         — Tailwind entry (components.json points here)
    app.css           — modern layout
    themes.css        — light/dark/D&D/space theme layer
    game.css          — game UI styles (scoped under .game-root)
docs/
  HEURISTIC_GUIDE.md  — the LP + ALT derivation and its measurements
scripts/
  gen_heuristic_table.py — regenerates src/algorithms/heuristic_table.ts
eval/
  independent-eval.ts — external measurement of heuristic informedness + expansions
tests/
  biastar.test.ts     — regression + all-pairs oracle cross-check (`bun test`)
```
