# Search state model: `visited` / `frontier` / `generated`

Status: fixed & enforced (2026-10-11). Regression net: `tests/state-invariants.test.ts`.

## The contract

`Step` (`src/algorithms/search.ts`) is the only interface between search
algorithms and every renderer/counter. Its meaning is fixed:

| Field | Meaning |
|---|---|
| `frontier` | **open now** — has a live frontier entry, has not been expanded. A node re-opened after a cheaper path is found returns here. |
| `visited` | **closed now** — expanded and no longer open. |
| `current` | the node expanded on this frame (also present in `visited`). |
| `SearchResult.generated` | **superset statistic**, not a state: the number of *distinct* nodes ever discovered (start included), in every algorithm. |

Invariants, enforced for **all 9 algorithms × all 380 ordered city pairs**:

1. `frontier ∩ visited = ∅`
2. no duplicates in either array
3. `|frontier ∪ visited| ≤ generated`
4. a found run's final frame has an empty `frontier`
5. a run's `visited` never shrinks between frames — `closed` is final (no re-open)

`nodeState()` and `countStates()` in `search.ts` are the single derivation used
by both the map paint (`svgMap.tsx`) and the comparison table
(`StatsSidebar.tsx`), so the picture and the numbers cannot disagree.
Precedence is documented, not incidental: `path > current > visited > frontier > unvisited`.

For bidirectional searches the union rule is **R1 — closed wins**: a node
closed by *either* direction renders as `visited`; `frontier` holds nodes still
open in some direction that no direction has closed.

## What was wrong (before)

| Defect | Evidence |
|---|---|
| Committed build: single A* emitted superseded frontier entries; a visited city could still render/serialize as frontier | `frontier: frontier.map(e => e[2])` (pre-fix `astar.ts`) |
| Bidirectional searches concatenated per-direction arrays: cross-direction overlap + duplicates. Counters read raw `.length` | biastar Arad→Bucharest frame 4: map painted 7 frontier, counter said **11** (2 dual + 2 duplicates); biucs: 380/380 pairs affected |
| `generated` had three different definitions: A* counted distinct discoveries, biastar counted **edge relaxations**, biucs counted pending-adds | `biastar.ts` `generated++` inside the relax branch |
| LP heuristic admissible but **inconsistent** (39/920 directed edges) → A* (LP) could legitimately re-open an expanded node mid-animation | consistency scan over all goal/edge combinations |
| biucs "goal next to start" shortcut fired when the goal was merely *in the frontier* (reachable via intermediates) and returned `[start, goal]` — fabricating roads that don't exist | 128/380 pairs returned 2-node paths; e.g. `Oradea→Arad` has no direct road |
| biucs terminated at the **first node settled by both** directions; that node need not lie on the optimal path, and crossing edges (settled-F → settled-B) were not counted as candidates | 8/380 pairs suboptimal, worst +89 km (`Sibiu→Drobeta` 435 vs 346) |

## What changed

- `astar-core.ts`: one shared A* loop; `frontier` derived as `discovered ∧ ¬closed`;
  optional **pathmax** (`h′(n) = max(h(n), h′(parent) − c(parent,n))`) on the LP
  lane — restores consistency, so `closed` is final (no re-open flicker, optimality kept: eval mismatches = 0).
- `biastar.ts`: set-derived emission (R1); per-direction **pathmax** so each direction's
  `closed` stays final even when `h` is inconsistent (the LP component always is).
- `biucs.ts`: set-derived emission (R1), `generated` = distinct discovered.
- `biucs.ts`: adjacency shortcut requires the frontier entry to have been generated
  *by start*; termination is now μ-based with **node meetings and crossing-edge
  meetings**, reconstruction through the optimal meeting (including the crossing hop `u → v`).
- `ucs.ts`, `biucs.ts`: synthetic landing frame so the final found-frame carries an empty frontier.
- `ucs.ts`: `generated` counted every relaxation (overcounted, e.g. 21 on a 20-city graph) — now counts first discovery, matching every other algorithm.
- `astar-alt.ts`: pathmax enabled too — the named landmark presets are consistent (0/920), but runtime **custom** landmark sets can be inconsistent (13–22 violations measured), and pathmax restores `closed`-is-final for every admissible h.

## Verification

```bash
bun test                     # 29 tests incl. all-algorithms × all-pairs contract + optimality
bunx tsc -b && bun run lint
bun eval/independent-eval.ts # A* lanes: mismatches = 0
```

Spot check (2026-10-11): every algorithm × every ordered pair — 0 dual-membership
frames, 0 cost-vs-UCS violations, 0 not-found, 0 bad endpoints.

## Known limits / possible polish

- R1 renders a node closed-forward + open-backward as plain `visited`. The
  per-direction split (two-tone node) is deliberately out of scope; the data to
  do it (per-direction records) exists in `biastar.ts` / `biucs.ts`.
- `stepViolations()` intentionally recomputes sets from the arrays rather than
  trusting producers — the test failing is the alarm, not a runtime guard.
- `SearchResult.parent` is a start-rooted tree only for the single-direction
  searches. `biastar` stores a mix of forward- and backward-oriented parent links,
  and `biucs`'s shared `parentToNode` can contain cycles — so
  `reconstructPath(result.parent, goal)` is wrong for `biastar` and non-terminating
  for `biucs`. The renderers only ever walk `parent` one hop (`treeEdgeKeys`), so the
  app is unaffected; route reconstruction uses each algorithm's own `path`.
- The bidirectional landing frames set `current` to the meeting node, not the goal
  (BFS/DFS/UCS/A* land on the goal). Inert on screen — the final frame paints every
  path node as `path` before `nodeState` consults `current` — but a consumer reading
  that field expecting the goal would be wrong. `tests/algorithms.test.ts` pins it.
