import { ROMANIA, type NodeId } from './romania'
import { reconstructPath, type SearchResult, type Step } from './search'

// Goal-test on generation (AIMA: O(b^d), not O(b^{d+1})). Discovered marked
// on enqueue, never on dequeue, so no node is ever queued twice.
export function bfs(start: NodeId, goal: NodeId): SearchResult {
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
  const queue: NodeId[] = [start]
  const expanded: NodeId[] = []
  let generated = 1
  let found = false

  while (queue.length > 0 && !found) {
    const current = queue.shift() as NodeId
    const neighbors = ROMANIA[current].edges.map((edge) => edge.to) // pre-sorted alphabetically

    for (const neighbor of neighbors) {
      if (discovered.has(neighbor)) continue
      discovered.add(neighbor)
      parent[neighbor] = current
      generated += 1
      if (neighbor === goal) {
        found = true
        break
      }
      queue.push(neighbor)
    }

    expanded.push(current)
    steps.push({ current, frontier: [...queue], visited: [...expanded] })
  }

  if (!found) {
    return { steps, parent, path: [], found: false, generated }
  }

  // Synthetic step: goal is discovered but never dequeued, so animation needs
  // one more frame to visibly land on it.
  steps.push({ current: goal, frontier: [], visited: [...expanded] })

  const path = reconstructPath(parent, goal)
  if (path.length === 0) return { steps, parent, path: [], found: false, generated }

  return { steps, parent, path, found: true, generated }
}

// Self-check: known Arad -> Bucharest path, plus start===goal and
// final-step-lands-on-goal invariants.
function selfCheck(): void {
  const result = bfs('Arad', 'Bucharest')
  const expectedPath: NodeId[] = ['Arad', 'Sibiu', 'Fagaras', 'Bucharest']

  if (!result.found) {
    throw new Error('bfs.ts self-check failed: Arad -> Bucharest should be found')
  }
  const matches =
    result.path.length === expectedPath.length &&
    result.path.every((city, i) => city === expectedPath[i])
  if (!matches) {
    throw new Error(
      `bfs.ts self-check failed: expected path ${expectedPath.join(' -> ')}, got ${result.path.join(' -> ')}`,
    )
  }

  const lastStep = result.steps[result.steps.length - 1]
  if (lastStep === undefined || lastStep.current !== 'Bucharest') {
    throw new Error('bfs.ts self-check failed: final step must land on goal')
  }

  const trivial = bfs('Arad', 'Arad')
  if (!trivial.found || trivial.path.length !== 1 || trivial.path[0] !== 'Arad') {
    throw new Error('bfs.ts self-check failed: start === goal case broken')
  }
}

selfCheck()
