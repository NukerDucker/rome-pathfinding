import { ROMANIA, type NodeId } from './romania'
import { reconstructPath, type SearchResult, type Step } from './search'

export function ucs(start: NodeId, goal: NodeId): SearchResult {
  const parent: Record<NodeId, NodeId | null> = {}

  if (!(start in ROMANIA) || !(goal in ROMANIA)) {
    return { steps: [], parent, path: [], found: false, generated: 0 }
  }

  parent[start] = null

  if (start === goal) {
    const steps: Step[] = [{ current: start, frontier: [], visited: [] }]
    return { steps, parent, path: [start], found: true, generated: 1 }
  }

  const steps: Step[] = []
  const frontier: { id: NodeId; cost: number }[] = [{ id: start, cost: 0 }]
  const expanded: NodeId[] = []
  const reached: Record<NodeId, number> = { [start]: 0 }
  
  let generated = 1
  let found = false

  while (frontier.length > 0 && !found) {
    frontier.sort((a, b) => a.cost - b.cost)
    const { id: current, cost: currentCost } = frontier.shift()!

    expanded.push(current)

    if (current === goal) {
      found = true
      steps.push({ current, frontier: frontier.map((f) => f.id), visited: [...expanded] })
      break
    }

    const neighbors = ROMANIA[current].edges

    for (const edge of neighbors) {
      const neighbor = edge.to
      const newCost = currentCost + edge.km

      if (!(neighbor in reached) || newCost < reached[neighbor]) {
        reached[neighbor] = newCost
        parent[neighbor] = current
        generated += 1

        const existingIndex = frontier.findIndex((f) => f.id === neighbor)
        if (existingIndex !== -1) {
          frontier[existingIndex].cost = newCost
        } else {
          frontier.push({ id: neighbor, cost: newCost })
        }
      }
    }
    steps.push({ current, frontier: frontier.map((f) => f.id), visited: [...expanded] })
  }

  if (!found) {
    return { steps, parent, path: [], found: false, generated }
  }

  const path = reconstructPath(parent, goal)
  if (path.length === 0) return { steps, parent, path: [], found: false, generated }

  return { steps, parent, path, found: true, generated }
}

// Self-check: known shortest path Arad -> Bucharest
function selfCheck(): void {
  const result = ucs('Arad', 'Bucharest')
  // DFS finds the 450km path via Fagaras, but UCS must find the 418km path via Rimnicu Vilcea
  const expectedPath: NodeId[] = ['Arad', 'Sibiu', 'Rimnicu Vilcea', 'Pitesti', 'Bucharest']

  if (!result.found) {
    throw new Error('ucs.ts self-check failed: Arad -> Bucharest should be found')
  }
  const matches =
    result.path.length === expectedPath.length &&
    result.path.every((city, i) => city === expectedPath[i])
  if (!matches) {
    throw new Error(
      `ucs.ts self-check failed: expected path ${expectedPath.join(' -> ')}, got ${result.path.join(' -> ')}`,
    )
  }

  const trivial = ucs('Arad', 'Arad')
  if (!trivial.found || trivial.path.length !== 1 || trivial.path[0] !== 'Arad') {
    throw new Error('ucs.ts self-check failed: start === goal case broken')
  }
}

selfCheck()