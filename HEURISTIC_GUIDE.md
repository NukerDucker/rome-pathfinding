# Heuristic Search — Implementation Guide

**Status (2026-08-21):** Heuristic fully implemented. All algorithms wired. App live.

---

## CONSTRAINTS — READ BEFORE TOUCHING HEURISTIC CODE

From the assignment PDF. Violations → wrong mark.

- **Only data from PDF page 2.** No other source.
- **SLD is banned** — including as an input to derive anything else (no "SLD ÷ speed", no "SLD × factor").
- **No GPS / real-world coords / external APIs.** `x`/`y` in `src/romania.ts` are SVG layout coords for drawing — not geography.
- **Must be a custom heuristic** — something you derive yourself from PDF data.

---

## The SearchResult contract

Every algorithm returns the same shape (`src/search.ts`):

```ts
export type SearchResult = {
  steps: Step[]                          // one frame per expansion → animation
  parent: Record<NodeId, NodeId | null>  // search tree → renderTreeEdges()
  path: NodeId[]                         // [] if unreachable → path stat + overlay
  found: boolean
  generated: number                      // nodes ever discovered → "Generated" stat
}
```

`App.tsx` renders `steps`, `parent`, `path` — it doesn't care which algorithm produced them.

Reference implementations: `src/bfs.ts`, `src/dfs.ts`.

---

## Heuristic: Combined LP+ALT (`src/heuristic.ts`)

```ts
h(node, goal) = max(hLP(node, goal), hALT(node, goal))
```

Max of admissible heuristics → admissible and tighter than either alone.

### LP — Vector-Decomposition (`src/heuristic_table.ts`)

Offline LP: `h(a,b) = min Σ αᵢ·kmᵢ` s.t. `Σ αᵢ·vecᵢ = chord_AB`, `0 ≤ αᵢ ≤ 1`

Solved with scipy/HiGHS using pixel coords + road km from PDF. No SLD, no GPS.

- Mean h/road: **0.729**
- Admissible: 190/190 pairs ✅

Values live in `HEURISTIC_TABLE` — a `Record<NodeId, Record<NodeId, number>>` lookup. `h()` reads it directly.

### ALT — Landmarks + Triangle Inequality (`src/alt.ts`)

```
h(n, goal) = max_L |d(L, n) − d(L, goal)|
```

Admissible by triangle inequality — no empirical verification needed.

Dijkstra precomputed at module load (8 × 20 nodes, negligible cost). Three presets:

| Preset | Landmarks |
|--------|-----------|
| lm2 | Eforie, Oradea |
| lm4 | + Neamt, Giurgiu |
| lm8 | + Timisoara, Vaslui, Drobeta, Hirsova |

Select with `setALTPreset()` in `heuristic.ts`. `makeHALTArbitrary()` supports click-to-landmark UI.

#### Degree-1 backdoor landmarks (exact h for specific goals)

When landmark L is degree-1 and goal = L's only neighbor: `|d(L,n) − d(L,goal)| = d(goal,n)` — exact true distance.

| Landmark | Backdoor goal | In preset |
|----------|---------------|-----------|
| Giurgiu → Bucharest | exact h for goal=Bucharest | lm4+ |
| Eforie → Hirsova | exact h for goal=Hirsova | lm2+ |
| Neamt → Iasi | exact h for goal=Iasi | lm4+ |

**Demo tip:** to show Eforie backdoor, use goal=Hirsova (not goal=Eforie).

Why `generated` often doesn't change between presets: even perfect h still discovers neighbors of each expanded node. Count only drops when weaker h causes extra expansions — rarely visible on 20 nodes.

### Combined performance

| Heuristic | Mean h/road (380 directed pairs) |
|-----------|----------------------------------|
| LP only | 0.729 |
| ALT lm8 | 0.985 |
| LP+ALT combined | **0.986** |

LP buys +0.001 over ALT alone. **Q&A answer for "why keep LP":** LP is an independent bound from vector decomposition — different data and method from triangle-inequality landmarks. `max(hLP, hALT)` means admissibility never rests solely on landmark choice.

---

## Algorithms registry (`src/search.ts`)

All algorithms wired in `ALGORITHMS`:

| Key | File | Uses h |
|-----|------|--------|
| bfs | bfs.ts | — |
| dfs | dfs.ts | — |
| ucs | ucs.ts | — |
| biucs | biucs.ts | — |
| greedy | greedy.ts | h() |
| astar | astar.ts | hLP only |
| astaralt | astar-alt.ts | max(hLP, hALT) |
| astaraltonly | astar-alt-only.ts | hALT (active preset) |
| biastar | biastar.ts | max(hLP, hALT) |

**Bidirectional A\*:** Pohl 1971 stopping — terminate when `minF_fwd + minF_bwd ≥ μ`. On 20 nodes slower than unidirectional (overhead > savings); O(b^(d/2)) advantage appears at millions of nodes.

---

## Self-checks (run at module load)

| File | What it checks |
|------|---------------|
| `heuristic.ts` | hLP(Arad,Bucharest) ≈ 388; combined h ≤ 418 |
| `astar.ts` | Arad→Bucharest = 418 |
| `biastar.ts` | Arad→Bucharest = 418; trivial same-city case |
| `search.ts` | pathCost(Arad→Sibiu→Fagaras→Bucharest) = 450 |

Run manually:

```bash
bun x tsc -b
bun run src/heuristic.ts
bun run src/astar.ts
bun run src/biastar.ts
```

---

## Adding a new algorithm

1. Copy `src/bfs.ts` → new file. Same structure: guard clauses, `discovered` set, per-iteration `steps.push(...)`, synthetic final step, `reconstructPath`. Change only frontier data structure + pop order.
2. Add one line to `ALGORITHMS` in `src/search.ts`.
3. Import at top of `search.ts`.

That's it — `App.tsx` reads `ALGORITHMS` via `Object.entries(...)` to build the dropdown and stats panel.
