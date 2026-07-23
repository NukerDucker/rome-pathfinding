# Heuristic Search Extension Guide

For whoever is adding greedy best-first search or A* to this visualizer.

## CONSTRAINTS — READ BEFORE WRITING ANY CODE

These come straight from the assignment (see `[[project-rome-heuristic]]` in the course notes). They are not optional style preferences — a heuristic that violates them gets the assignment marked wrong.

- **Only data from the assignment PDF, page 2.** Whatever table/figure is on that page is the only legal source for heuristic values.
- **Straight-line distance (SLD) is banned.** Not just "don't use SLD as `h()`" — you may not use it as an *input* to derive some other heuristic either (e.g. no "SLD divided by average speed").
- **No GPS / real-world coordinates / external distance APIs.** The `x`/`y` fields in `src/romania.ts` are schematic SVG layout coordinates for drawing the map, not real geography — don't reverse-engineer distances from them.
- **The heuristic must be custom** — something you derive yourself from the PDF page-2 data (pixel coordinates/angles read off a diagram are fine, actual geographic distance is not).

If you're not sure whether a value counts as "derived from SLD," don't use it.

## The contract

Every algorithm implements the same function shape, defined in `src/search.ts`:

```ts
export type SearchFn = (start: NodeId, goal: NodeId) => SearchResult

export type SearchResult = {
  steps: Step[]                          // one frame per expansion, drives the animation
  parent: Record<NodeId, NodeId | null>  // search tree, drives renderTreeEdges() in App.tsx
  path: NodeId[]                         // [] if unreachable, drives renderPathEdges() + path stat
  found: boolean
  generated: number                      // total nodes ever discovered, shown as the "Generated" stat
}
```

`App.tsx` doesn't know or care which algorithm produced a `SearchResult` — it just renders `steps`, `parent`, and `path`. So as long as your function returns this shape, it plugs into the existing UI, stepper, and play/pause controls with zero changes there.

Look at `src/bfs.ts` or `src/dfs.ts` for a full worked example — the overall structure (guard clauses, `discovered` set, per-iteration `steps.push(...)`, synthetic final step, `reconstructPath`) is the same for every algorithm; only the frontier data structure and pop order change.

## Where the heuristic goes

`src/greedy.ts` is a **runnable stub** already wired up structurally — it compiles and its `selfCheck()` passes today. The only thing missing is a real heuristic.

The frontier in `greedy.ts` is a plain array re-sorted by `h(n)` before each pop:

```ts
frontier.sort((a, b) => h(a, goal) - h(b, goal))
const current = frontier.shift() as NodeId
```

That's greedy best-first search: always expand whichever frontier node has the lowest `h(n)`. For A*, change the sort key to `g(n) + h(n)`, where `g(n)` is path cost so far — accumulate it from `edge.km` in `romania.ts` as you push nodes onto the frontier (BFS/DFS don't need this, they're unweighted).

**The one function to write** lives in `src/heuristic.ts`:

```ts
export function h(node: NodeId, goal: NodeId): number
```

It currently returns `0` for everything — a valid but useless heuristic (this is why `greedy.ts` still finds a path today: `h=0` just makes it behave like an arbitrary-order search, per Constraints above it must NOT stay this way for the final submission).

## Where heuristic data lives

Put your per-city values in `src/heuristic.ts`, not in `romania.ts`. `romania.ts` is deliberately SLD-free (see the comment at the top of that file) — don't add distance data to it. A `Record<NodeId, number>` table keyed by city name, populated from the PDF page-2 data, is the expected shape; `h()` can just look values up in it.

## Wiring it into the app

Once `h()` is real, `greedy.ts` needs no further changes — just add one line to the registry in `src/search.ts`:

```ts
export const ALGORITHMS: Record<string, AlgoMeta> = {
  bfs: { ... },
  dfs: { ... },
  greedy: { label: 'Greedy', run: greedy, time: 'O(b^m)', space: 'O(b^m)', optimal: 'No', complete: 'No*' },
}
```

(You'll need `import { greedy } from './greedy'` at the top of `search.ts`.) That's it — `App.tsx` reads `ALGORITHMS` via `Object.entries(...)` to build the dropdown and stats panel, so a new entry there is the entire UI wiring.

For A*, copy `greedy.ts` to `astar.ts`, change the sort key as described above, and add a second registry line the same way.

## Verify

```bash
bun x tsc -b
bun run src/greedy.ts   # or your new file — selfCheck() throws on failure
bun dev                 # pick your algorithm from the dropdown, confirm it animates and lands on the goal
```
