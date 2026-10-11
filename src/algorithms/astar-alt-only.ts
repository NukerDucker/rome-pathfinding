import type { NodeId } from './romania'
import type { SearchResult } from './search'
import { aStar } from './astar-core'
import { hALTOnly } from './heuristic'

// A* using the ALT heuristic only (no LP component). Respects the active
// landmark preset set via setALTPreset(). Consistent by triangle inequality,
// so no pathmax is needed.
export function astarAltOnly(start: NodeId, goal: NodeId): SearchResult {
  return aStar(start, goal, hALTOnly)
}

function selfCheck(): void {
  const r = astarAltOnly('Arad', 'Bucharest')
  if (!r.found || r.path[0] !== 'Arad' || r.path[r.path.length - 1] !== 'Bucharest') {
    throw new Error('astar-alt-only.ts self-check: Arad -> Bucharest not found')
  }
}

selfCheck()
