import { ROMANIA, type NodeId } from './romania'
import { reconstructPath, type SearchResult, type Step } from './search'
import { h } from './heuristic'

// Priority frontier ordered by h(n) (greedy best-first). With h()=0 this
// stub still runs a valid (arbitrary but deterministic) search — no crash.
export function greedy(start: NodeId, goal: NodeId): SearchResult {
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
  const frontier: NodeId[] = [start]
  const expanded: NodeId[] = []
  let generated = 1
  let found = false

  while (frontier.length > 0 && !found) {
    frontier.sort((a, b) => h(a, goal) - h(b, goal)) // stable sort — deterministic under h=0
    const current = frontier.shift() as NodeId
    const neighbors = ROMANIA[current].edges.map((edge) => edge.to)

    for (const neighbor of neighbors) {
      if (discovered.has(neighbor)) continue
      discovered.add(neighbor)
      parent[neighbor] = current
      generated += 1
      if (neighbor === goal) {
        found = true
        break
      }
      frontier.push(neighbor)
    }

    expanded.push(current)
    steps.push({ current, frontier: [...frontier], visited: [...expanded] })
  }

  if (!found) {
    return { steps, parent, path: [], found: false, generated }
  }

  steps.push({ current: goal, frontier: [], visited: [...expanded] })

  const path = reconstructPath(parent, goal)
  if (path.length === 0) return { steps, parent, path: [], found: false, generated }

  return { steps, parent, path, found: true, generated }
}

// Self-check: with h()=0 stub, still finds Arad -> Bucharest.
function selfCheck(): void {
  const result = greedy('Arad', 'Bucharest')
  if (
    !result.found ||
    result.path[0] !== 'Arad' ||
    result.path[result.path.length - 1] !== 'Bucharest'
  ) {
    throw new Error('greedy.ts self-check failed: Arad -> Bucharest should be found')
  }
}

selfCheck()
