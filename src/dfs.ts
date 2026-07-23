import { ROMANIA, type NodeId } from './romania'
import { reconstructPath, type SearchResult, type Step } from './search'

// Stack (LIFO). Neighbors pushed in reverse alphabetical order so the
// alphabetically-first one sits on top and pops next (textbook left-to-right
// DFS). Discovered marked on push; goal-test on generation.
export function dfs(start: NodeId, goal: NodeId): SearchResult {
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
  const stack: NodeId[] = [start]
  const expanded: NodeId[] = []
  let generated = 1
  let found = false

  while (stack.length > 0 && !found) {
    const current = stack.pop() as NodeId
    const neighbors = [...ROMANIA[current].edges].reverse().map((edge) => edge.to)

    for (const neighbor of neighbors) {
      if (discovered.has(neighbor)) continue
      discovered.add(neighbor)
      parent[neighbor] = current
      generated += 1
      if (neighbor === goal) {
        found = true
        break
      }
      stack.push(neighbor)
    }

    expanded.push(current)
    steps.push({ current, frontier: [...stack], visited: [...expanded] })
  }

  if (!found) {
    return { steps, parent, path: [], found: false, generated }
  }

  // Synthetic step: goal is discovered but never popped, so animation needs
  // one more frame to visibly land on it.
  steps.push({ current: goal, frontier: [], visited: [...expanded] })

  const path = reconstructPath(parent, goal)
  if (path.length === 0) return { steps, parent, path: [], found: false, generated }

  return { steps, parent, path, found: true, generated }
}

// Self-check: known Arad -> Bucharest path under reverse-alpha push order,
// plus start===goal.
function selfCheck(): void {
  const result = dfs('Arad', 'Bucharest')
  const expectedPath: NodeId[] = ['Arad', 'Sibiu', 'Fagaras', 'Bucharest']

  if (!result.found) {
    throw new Error('dfs.ts self-check failed: Arad -> Bucharest should be found')
  }
  const matches =
    result.path.length === expectedPath.length &&
    result.path.every((city, i) => city === expectedPath[i])
  if (!matches) {
    throw new Error(
      `dfs.ts self-check failed: expected path ${expectedPath.join(' -> ')}, got ${result.path.join(' -> ')}`,
    )
  }

  const trivial = dfs('Arad', 'Arad')
  if (!trivial.found || trivial.path.length !== 1 || trivial.path[0] !== 'Arad') {
    throw new Error('dfs.ts self-check failed: start === goal case broken')
  }
}

selfCheck()
