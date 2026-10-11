import type { NodeId } from './romania'
import type { SearchResult } from './search'
import { aStar } from './astar-core'
import { hLP } from './heuristic'

// A* with the LP vector-decomposition heuristic (admissible). Pathmax restores
// consistency along the live tree path, so an expanded node is never re-opened
// and the animation shows no visited→frontier flicker.
export function astar(start: NodeId, goal: NodeId): SearchResult {
  return aStar(start, goal, hLP, { pathmax: true })
}

// Self-check: Arad -> Bucharest is found (418 km via Sibiu-Rimnicu-Pitesti).
function selfCheck(): void {
  const r = astar('Arad', 'Bucharest')
  if (!r.found || r.path[0] !== 'Arad' || r.path[r.path.length - 1] !== 'Bucharest') {
    throw new Error('astar.ts self-check: Arad -> Bucharest not found')
  }
}

selfCheck()
