# rome-pathfinding

Romania map pathfinding visualizer — AI assignment (KMITL Year 3, 2026).

**Due:** 2026-10-13 · **Status:** feature-complete; `tsc -b` clean, `bun test` 44/44 green.

Pure client-side SPA — no server routes, no SSR. One search core, two UIs over it.

## What it does

**Modern UI** — step-by-step animation of search algorithms on the Romania map.
Bento two-lane layout for side-by-side algorithm comparison: frontier / visited
highlighting, solid straight-line overlay, speed slider, play/pause/step, h-value
heatmap, click-to-set landmark, and a 17-metric comparison sidebar. The two lanes
can be merged into one map (roads split down the middle, node discs and landmark
rings split vertically, one colour per lane). Four themes: light, dark, D&D,
space.

**Game UI** — pixel-art Romania with pan/zoom viewport, castles, day/night, and
six easter-egg animals; reachable from the mode toggle in the top-left corner.
Same algorithms, its own controls, stats and guide.

**Guide tab** — a 9-section walk from Uniform-Cost Search to A\*, into the
heuristic (LP + ALT), the `max` ensemble, and its measured performance, with 8
animated figures (`public/gifs/`). Present in the DOM whether or not the tab is
open, so the text is crawlable — see `public/llms.txt`.

## Stack

- Vite 8 + React 19 + TypeScript ~6.0, React Compiler enabled
- Tailwind v4 + shadcn/Base UI primitives + lucide-react icons
- KaTeX (via `components/Tex.tsx`) for the guide's math
- Self-hosted fonts: Geist, JetBrains Mono, Cinzel (`@fontsource`)
- Package manager: **bun** · deploy target: static `dist/` → Vercel

## Run

```bash
bun install
bun dev            # dev server
bun run build      # tsc -b && vite build
bun run preview    # serve the built dist/
```

Type-check, tests, and the heuristic evaluation:

```bash
bun x tsc -b                     # type-check (clean)
bun test                         # 44 tests / 3 files, ~73k assertions
bun run eval/independent-eval.ts # heuristic informedness + expansion counts
```

`tests/` holds three suites: `algorithms.test.ts` (every registry algorithm over
all 380 ordered city pairs, cross-checked against Floyd–Warshall and UCS
oracles), `state-invariants.test.ts` (the `Step`/`SearchResult` contract the UI
relies on), and `biastar.test.ts` (bidirectional-A\* regression plus a
custom-landmark sweep).

## Algorithms

Every entry in the registry (`src/algorithms/search.ts`), which is also the
source of the UI's complexity table:

| Key | Label | Heuristic | Time | Space | Optimal | Complete |
|-----|-------|-----------|------|-------|---------|----------|
| bfs | BFS | — | O(b^d) | O(b^d) | Yes* | Yes |
| dfs | DFS | — | O(b^m) | O(bm) | No | No* |
| ucs | UCS | — | O(b^(1+⌊C*/ε⌋)) | same | Yes | Yes |
| biucs | Bidirectional UCS | — | O(b^(1+C/2ε)) | same | Yes | Yes |
| greedy | Greedy (LP+ALT only) | LP+ALT | O(b^m) | O(b^m) | No | No* |
| astar | A\* (LP) | LP only | O(b^d) | O(b^d) | Yes | Yes |
| astaralt | A\* (LP+ALT) | LP+ALT combined | O(b^d) | O(b^d) | Yes | Yes |
| astaraltonly | A\* (ALT only) | ALT (active preset) | O(b^d) | O(b^d) | Yes | Yes |
| biastar | Bidir. A\* (LP+ALT) | LP+ALT | O(b^(d/2)) | O(b^(d/2)) | Yes | Yes |

\* Optimality/completeness caveats are on the UI's own complexity table.

## Heuristic

`h = max(hLP, hALT)` — max of two independently admissible bounds
(`src/algorithms/heuristic.ts`).

**LP (vector-decomposition):** offline scipy/HiGHS LP using pixel coords + edge
km. Informedness on the 380 ordered pairs: **0.683** as a ratio of sums (the
definition the Guide's tables use) and **0.729** as a mean of per-pair ratios.
`eval/independent-eval.ts` prints both.

**ALT (Landmarks + Triangle Inequality):** `h(n,goal) = max_L |d(L,n) − d(L,goal)|`.
Three presets: lm2 / lm4 / lm8. Dijkstra precomputed at module load.

**Combined:** 0.986 informedness; 0 admissibility violations across every preset.
Measured expansions over all 380 pairs: UCS 4180 → A\* (LP+ALT) 1922 (54% fewer).

**Data source: PDF page 2 only. SLD and GPS are banned by assignment rules** —
the straight-line overlay is illustrative geometry, never fed to the heuristic.

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
    search.ts           — SearchResult type, ALGORITHMS registry (labels, time/space)
    heuristic.ts        — h() = max(hLP, hALT), ALT preset state
    heuristic_table.ts  — LP lookup table (AUTO-GENERATED, see scripts/)
    alt.ts              — ALT landmarks, Dijkstra, ALL_CITY_DIST, makeHALTArbitrary()
    astar-core.ts       — shared A* loop used by the three A* variants
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
                          `cols` table), AlgorithmCard, RouteCard, PlaybackBar,
                          ToolbarRow, TitleRow, TabBar, LandmarkPicker,
                          landmarks.ts, mapData.ts, bench.ts, svgMap.tsx
    game/               — game UI: GameApp / GameMap / GameControls / GameSelect /
                          GamePlayback / GameStats / GameGuide, scenery.ts (SVG
                          world build), viewport.ts (pan/zoom), useGameState.ts,
                          data/ (castle + path positions), animals/, audio
      animals/          — the six easter-egg creatures (see animals/README.md)

  components/    — shared across both UIs
    Guide.tsx         — Guide tab explainer (UCS → A* → heuristic → ensemble)
    Tex.tsx           — shared KaTeX inline renderer
    ModeToggle.tsx    — modern ⇄ game switch
    guide/            — Figure, GuideNav, GuideSection, scroll-spy, sections.ts
                        (the one list both guides render from)
    ui/               — shadcn/Base UI primitives (paths pinned by components.json)

  lib/
    utils.ts          — cn()
    benchCache.ts     — session caches for the expensive benchmark/heatmap numbers

  styles/
    index.css         — Tailwind entry (components.json points here)
    app.css           — modern layout
    themes.css        — light/dark/D&D/space theme layer
    game.css          — game UI styles (scoped under .game-root)

docs/
  rendering.md        — game-map zoom pixelation: cause, fix, rejected alternatives
public/
  gifs/               — the guide's 8 animations · assets/ — game sprites and art
  llms.txt            — machine-readable summary of the app for agents
eval/
  independent-eval.ts — self-contained measurement: own Dijkstra, own A*, no repo deps
scripts/
  gen_heuristic_table.py — regenerates src/algorithms/heuristic_table.ts
tests/
  algorithms.test.ts / state-invariants.test.ts / biastar.test.ts
```
