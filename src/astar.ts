import { ROMANIA, type NodeId } from './romania'
import { reconstructPath, type SearchResult, type Step } from './search'
import { h } from './heuristic'

// A* search: f(n) = g(n) + h(n). Frontier is a priority queue ordered
// by f-value. Optimal when h is admissible — the elliptical arc
// heuristic is admissible (190/190 verified).
export function astar(start: NodeId, goal: NodeId): SearchResult {
  const parent: Record<NodeId, NodeId | null> = {}

  if (!(start in ROMANIA) || !(goal in ROMANIA)) {
    return { steps: [], parent, path: [], found: false, generated: 0 }
  }

  const discovered = new Set<NodeId>([start])
  parent[start] = null

  if (start === goal) {
    const steps: Step[] = [{ current: start, frontier: [], visited: [] }]
    return { steps, parent, path: [start], found: true, generated: 1 }
  }

  const steps: Step[] = []
  // Frontier entries: [f, g, node]
  const frontier: [number, number, NodeId][] = [[h(start, goal), 0, start]]
  const expanded: NodeId[] = []
  const bestG: Record<NodeId, number> = { [start]: 0 }
  let generated = 1
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

    if (g > (bestG[current] ?? Infinity)) continue // stale entry

    const neighbors = ROMANIA[current].edges

    for (const edge of neighbors) {
      const neighbor = edge.to
      const ng = g + edge.km

      if (ng < (bestG[neighbor] ?? Infinity)) {
        bestG[neighbor] = ng
        parent[neighbor] = current
        if (!discovered.has(neighbor)) {
          discovered.add(neighbor)
          generated += 1
        }
        if (neighbor === goal) {
          found = true
        }
        frontier.push([ng + h(neighbor, goal), ng, neighbor])
      }
    }

    expanded.push(current)
    steps.push({
      current,
      frontier: frontier.map((e) => e[2]),
      visited: [...expanded],
    })
  }

  if (!found) {
    return { steps, parent, path: [], found: false, generated }
  }

  steps.push({ current: goal, frontier: [], visited: [...expanded] })

  const path = reconstructPath(parent, goal)
  if (path.length === 0) return { steps, parent, path: [], found: false, generated }

  return { steps, parent, path, found: true, generated }
}

// Self-check: with admissible heuristic, still finds Arad -> Bucharest.
function selfCheck(): void {
  const result = astar('Arad', 'Bucharest')
  if (
    !result.found ||
    result.path[0] !== 'Arad' ||
    result.path[result.path.length - 1] !== 'Bucharest'
  ) {
    throw new Error('astar.ts self-check failed: Arad -> Bucharest should be found')
  }
}

selfCheck()
