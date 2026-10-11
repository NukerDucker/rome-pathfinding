import type { NodeId } from './romania'
import type { SearchResult } from './search'
import { aStar } from './astar-core'
import { h } from './heuristic'

// A* on the combined heuristic h = max(LP, ALT). The named landmark presets
// (lm2/lm4/lm8) are consistent on this graph (0/920 edge violations), but
// CUSTOM landmark sets can be inconsistent (13-22 violations measured), and
// the app allows custom sets at runtime — so pathmax runs here too: closed
// stays final for every config.
export function astarAlt(start: NodeId, goal: NodeId): SearchResult {
  return aStar(start, goal, h, { pathmax: true })
}

// Self-check: Arad -> Bucharest is found (418 km via Sibiu-Rimnicu-Pitesti).
function selfCheck(): void {
  const r = astarAlt('Arad', 'Bucharest')
  if (!r.found || r.path[0] !== 'Arad' || r.path[r.path.length - 1] !== 'Bucharest') {
    throw new Error('astar-alt.ts self-check: Arad -> Bucharest not found')
  }
}

selfCheck()
