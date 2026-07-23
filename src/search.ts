import type { NodeId } from './romania'
import { bfs } from './bfs'
import { dfs } from './dfs'

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

export const ALGORITHMS: Record<string, AlgoMeta> = {
  bfs: { label: 'BFS', run: bfs, time: 'O(b^d)', space: 'O(b^d)', optimal: 'Yes*', complete: 'Yes*' },
  dfs: { label: 'DFS', run: dfs, time: 'O(b^m)', space: 'O(b·m)', optimal: 'No', complete: 'Yes*' },
  // friend adds greedy/astar here (one line each) — see HEURISTIC_GUIDE.md
}
