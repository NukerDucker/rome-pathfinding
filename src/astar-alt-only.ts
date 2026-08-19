import { ROMANIA, type NodeId } from './romania'
import { reconstructPath, type SearchResult, type Step } from './search'
import { hALTOnly as h } from './heuristic'

// A* using ALT heuristic only (no LP component). Respects the active landmark
// preset set via setALTPreset(). Useful for isolating ALT contribution vs LP.
export function astarAltOnly(start: NodeId, goal: NodeId): SearchResult {
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
  const frontier: [number, number, NodeId][] = [[h(start, goal), 0, start]]
  const expanded: NodeId[] = []
  const bestG: Record<NodeId, number> = { [start]: 0 }
  let generated = 1
  let found = false

  while (frontier.length > 0 && !found) {
    let bestI = 0
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i][0] < frontier[bestI][0]) bestI = i
    }
    const [, g, current] = frontier[bestI]
    frontier[bestI] = frontier[frontier.length - 1]
    frontier.pop()

    if (g > (bestG[current] ?? Infinity)) continue

    for (const edge of ROMANIA[current].edges) {
      const ng = g + edge.km
      if (ng < (bestG[edge.to] ?? Infinity)) {
        bestG[edge.to] = ng
        parent[edge.to] = current
        if (!discovered.has(edge.to)) {
          discovered.add(edge.to)
          generated += 1
        }
        if (edge.to === goal) found = true
        frontier.push([ng + h(edge.to, goal), ng, edge.to])
      }
    }

    expanded.push(current)
    steps.push({ current, frontier: frontier.map((e) => e[2]), visited: [...expanded] })
  }

  if (!found) return { steps, parent, path: [], found: false, generated }

  steps.push({ current: goal, frontier: [], visited: [...expanded] })
  const path = reconstructPath(parent, goal)
  if (path.length === 0) return { steps, parent, path: [], found: false, generated }
  return { steps, parent, path, found: true, generated }
}

function selfCheck(): void {
  const r = astarAltOnly('Arad', 'Bucharest')
  if (!r.found || r.path[0] !== 'Arad' || r.path[r.path.length - 1] !== 'Bucharest') {
    throw new Error('astar-alt-only.ts self-check: Arad -> Bucharest not found')
  }
}

selfCheck()
