import { ROMANIA, type NodeId } from './romania'
import { bfs } from './bfs'
import { dfs } from './dfs'
import { greedy } from './greedy'
import { astar } from './astar'

export type Step = { current: NodeId; frontier: NodeId[]; visited: NodeId[] }

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

export const ALGORITHMS: Record<string, AlgoMeta> = {
  //bfs: { label: 'BFS', run: bfs, time: 'O(b^d)', space: 'O(b^d)', optimal: 'Yes*', complete: 'Yes*' },
  //dfs: { label: 'DFS', run: dfs, time: 'O(b^m)', space: 'O(b·m)', optimal: 'No', complete: 'Yes*' },
  greedy: { label: 'Greedy', run: greedy, time: 'O(b^m)', space: 'O(b^m)', optimal: 'No', complete: 'No*' },
  astar: { label: 'A*', run: astar, time: 'O(b^d)', space: 'O(b^d)', optimal: 'Yes', complete: 'Yes' },
}

// Self-check: known Arad -> Bucharest cost (140 + 99 + 211).
if (pathCost(['Arad', 'Sibiu', 'Fagaras', 'Bucharest']) !== 450) {
  throw new Error('search.ts self-check failed: pathCost Arad->Bucharest should be 450')
}
