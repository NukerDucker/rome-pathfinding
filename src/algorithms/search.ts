import { ROMANIA, type NodeId } from './romania'
import { bfs } from './bfs'
import { dfs } from './dfs'
import { greedy } from './greedy'
import { astar } from './astar'
import { astarAlt } from './astar-alt'
import { astarAltOnly } from './astar-alt-only'
import { biastar } from './biastar'
import { ucs } from './ucs'
import { biucs } from './biucs'

// One frame of a search, in the node-state contract every algorithm must honour:
//
//   frontier — OPEN now: has a live frontier entry, has not been expanded
//              (a node re-opened after a cheaper path is found returns here)
//   visited  — CLOSED now: expanded and no longer open
//   current  — the node this frame highlights: the node expanded (also present
//              in `visited`), or the goal on the synthetic landing frame of
//              BFS/DFS/Greedy, where the goal is discovered but not expanded
//
// Union rule for the bidirectional searches (R1 — closed wins): a node settled
// by EITHER direction is emitted as `visited`, and `frontier` excludes any node
// some direction has closed. Same precedence as nodeState() below.
//
// Invariants (enforced by tests/state-invariants.test.ts):
//   frontier ∩ visited = ∅ · no duplicates in either array ·
//   |frontier ∪ visited| ≤ generated · final found-frame has frontier = []
//
// `generated` on SearchResult is a superset statistic, not a state: the number
// of DISTINCT nodes ever discovered (start included), in every algorithm.
export type Step = { current: NodeId; frontier: NodeId[]; visited: NodeId[] }

// Visual + counted categories. `current` and `path` are per-frame annotations;
// the partition itself is unvisited | frontier | visited.
export type NodeState = 'unvisited' | 'frontier' | 'current' | 'visited' | 'path'

// Single derivation for both paint (svgMap) and counters (StatsSidebar) so the
// map and the numbers can never disagree. Precedence is part of the contract:
// path > current > visited > frontier > unvisited.
export function nodeState(
  step: Step,
  node: NodeId,
  ctx?: { isFinalFrame?: boolean; found?: boolean; path?: NodeId[] },
): NodeState {
  if (ctx?.isFinalFrame && ctx.found && ctx.path?.includes(node)) return 'path'
  if (node === step.current) return 'current'
  if (step.visited.includes(node)) return 'visited'
  if (step.frontier.includes(node)) return 'frontier'
  return 'unvisited'
}

// Frame counters — same derived sets the map paints.
export function countStates(step: Step): { visited: number; frontier: number } {
  return { visited: new Set(step.visited).size, frontier: new Set(step.frontier).size }
}

// Contract check, used by the invariant test. Returns [] when the frame obeys
// the Step contract.
export function stepViolations(step: Step, generated: number): string[] {
  const v = new Set(step.visited)
  const f = new Set(step.frontier)
  const out: string[] = []
  if (v.size !== step.visited.length) out.push(`visited has duplicates (${step.visited.length} entries, ${v.size} unique)`)
  if (f.size !== step.frontier.length) out.push(`frontier has duplicates (${step.frontier.length} entries, ${f.size} unique)`)
  const both = [...f].filter((n) => v.has(n))
  if (both.length > 0) out.push(`visited ∩ frontier = [${both.join(',')}]`)
  const union = new Set([...v, ...f])
  if (union.size > generated) out.push(`|visited ∪ frontier| = ${union.size} > generated = ${generated}`)
  return out
}

export type SearchResult = {
  steps: Step[]
  parent: Record<NodeId, NodeId | null>
  path: NodeId[] // [] if unreachable
  found: boolean
  generated: number // nodes ever discovered
}

export type SearchFn = (start: NodeId, goal: NodeId) => SearchResult

export type AlgoMeta = {
  label: string
  run: SearchFn
  time: string
  space: string
  optimal: string
  complete: string
  // true when the algorithm's heuristic is driven by the active ALT landmark preset
  usesLandmarks?: boolean
}

// Walk parent chain from goal back to start, reverse into start->goal order.
export function reconstructPath(parent: Record<NodeId, NodeId | null>, goal: NodeId): NodeId[] {
  const path: NodeId[] = []
  let node: NodeId | undefined = goal
  while (node !== undefined) {
    path.unshift(node)
    const prev: NodeId | null | undefined = parent[node]
    if (prev === undefined) return [] // broken parent chain
    if (prev === null) break
    node = prev
  }
  return path
}

// Sum edge km along a path (solution quality). Returns 0 for a trivial/empty path.
export function pathCost(path: NodeId[]): number {
  let cost = 0
  for (let i = 0; i < path.length - 1; i++) {
    const edge = ROMANIA[path[i]].edges.find((e) => e.to === path[i + 1])
    if (edge === undefined) return NaN // non-adjacent hop — broken path
    cost += edge.km
  }
  return cost
}

// time/space hold KaTeX LaTeX, typeset directly in the comparison table.
export const ALGORITHMS: Record<string, AlgoMeta> = {
  bfs: { label: 'BFS', run: bfs, time: 'O(b^d)', space: 'O(b^d)', optimal: 'Yes*', complete: 'Yes' },
  dfs: { label: 'DFS', run: dfs, time: 'O(b^m)', space: 'O(bm)', optimal: 'No', complete: 'No*' },
  greedy: { label: 'Greedy (LP+ALT only)', run: greedy, time: 'O(b^m)', space: 'O(b^m)', optimal: 'No', complete: 'No*', usesLandmarks: true },
  astar: { label: 'A* (LP)', run: astar, time: 'O(b^d)', space: 'O(b^d)', optimal: 'Yes', complete: 'Yes' },
  astaralt: { label: 'A* (LP+ALT)', run: astarAlt, time: 'O(b^d)', space: 'O(b^d)', optimal: 'Yes', complete: 'Yes', usesLandmarks: true },
  astaraltonly: { label: 'A* (ALT only)', run: astarAltOnly, time: 'O(b^d)', space: 'O(b^d)', optimal: 'Yes', complete: 'Yes', usesLandmarks: true },
  biastar: { label: 'Bidir. A* (LP+ALT)', run: biastar, time: 'O(b^{d/2})', space: 'O(b^{d/2})', optimal: 'Yes', complete: 'Yes', usesLandmarks: true },
  ucs: { label: 'UCS', run: ucs, time: 'O(b^{1+\\lfloor C^* / \\varepsilon \\rfloor})', space: 'O(b^{1+\\lfloor C^* / \\varepsilon \\rfloor})', optimal: 'Yes', complete: 'Yes' },
  biucs: { label: 'Bidirectional UCS', run: biucs, time: 'O(b^{1 + C / 2 \\varepsilon})', space: 'O(b^{1 + C / 2 \\varepsilon})', optimal: 'Yes', complete: 'Yes' },
}

// Self-check: known Arad -> Bucharest cost (140 + 99 + 211).
if (pathCost(['Arad', 'Sibiu', 'Fagaras', 'Bucharest']) !== 450) {
  throw new Error('search.ts self-check failed: pathCost Arad->Bucharest should be 450')
}
