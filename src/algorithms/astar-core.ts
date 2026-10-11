import { ROMANIA, type NodeId } from './romania'
import { reconstructPath, type SearchResult, type Step } from './search'

export type H = (node: NodeId, goal: NodeId) => number

// Shared A* loop for the three single-direction A* variants. The frontier is a
// plain array scanned for the minimum f — small graph, keeps the code readable.
//
// Emission follows the Step contract (search.ts): `frontier` is derived as
//   open = discovered ∧ ¬closed
// so superseded entries in the internal pop array can never leak into a frame,
// and no node is ever both frontier and visited.
//
// pathmax: h′(n) = max(h(n), h′(parent) − c(parent, n)) restores heuristic
// consistency along the live tree path. The LP table is admissible but NOT
// consistent (39/920 directed edges violate the triangle step), so without it
// an expanded node can be legitimately re-opened mid-animation. With pathmax,
// `closed` is final — no re-open, and A* stays optimal (h′ stays admissible).
export function aStar(start: NodeId, goal: NodeId, h: H, opts?: { pathmax?: boolean }): SearchResult {
  const parent: Record<NodeId, NodeId | null> = {}

  if (!(start in ROMANIA) || !(goal in ROMANIA)) {
    return { steps: [], parent, path: [], found: false, generated: 0 }
  }

  parent[start] = null

  if (start === goal) {
    const steps: Step[] = [{ current: start, frontier: [], visited: [start] }]
    return { steps, parent, path: [start], found: true, generated: 1 }
  }

  const usePathmax = opts?.pathmax === true
  const discovered = new Set<NodeId>([start])
  const closed = new Set<NodeId>()
  const steps: Step[] = []
  // Frontier entries: [f, g, node]
  const frontier: [number, number, NodeId][] = [[h(start, goal), 0, start]]
  const bestG: Record<NodeId, number> = { [start]: 0 }
  const hPA: Record<NodeId, number> = { [start]: h(start, goal) } // pathmax-adjusted h
  let found = false

  while (frontier.length > 0 && !found) {
    // Extract min f-value (linear scan — fine for 20 nodes)
    let bestI = 0
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i][0] < frontier[bestI][0]) bestI = i
    }
    const [, g, current] = frontier[bestI]
    frontier[bestI] = frontier[frontier.length - 1]
    frontier.pop()

    if (g > (bestG[current] ?? Infinity)) continue // stale entry — better g seen
    if (current === goal) {
      // goal test on pop, not on generation: g(goal) is only final once popped
      closed.add(current)
      found = true
      break
    }

    for (const edge of ROMANIA[current].edges) {
      const ng = g + edge.km
      if (ng < (bestG[edge.to] ?? Infinity)) {
        bestG[edge.to] = ng
        parent[edge.to] = current
        discovered.add(edge.to)
        const base = h(edge.to, goal)
        const hEff = usePathmax ? Math.max(base, (hPA[current] ?? base) - edge.km) : base
        hPA[edge.to] = hEff
        // Re-open on improvement. Cannot fire while h is consistent along the
        // tree path (ALT lanes by triangle inequality; LP lane via pathmax) —
        // kept so the state model stays correct if that ever stops holding.
        closed.delete(edge.to)
        frontier.push([ng + hEff, ng, edge.to])
      }
    }

    closed.add(current)
    // open = discovered ∧ ¬closed. Discovery order, deduped by construction.
    steps.push({ current, frontier: [...discovered].filter((n) => !closed.has(n)), visited: [...closed] })
  }

  const generated = discovered.size
  if (!found) return { steps, parent, path: [], found: false, generated }

  // Synthetic step: the animation needs one more frame to visibly land on the goal.
  steps.push({ current: goal, frontier: [], visited: [...closed] })
  const path = reconstructPath(parent, goal)
  if (path.length === 0) return { steps, parent, path: [], found: false, generated }
  return { steps, parent, path, found: true, generated }
}
