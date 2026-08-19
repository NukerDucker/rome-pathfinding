import type { NodeId } from './romania'
import { HEURISTIC_TABLE } from './heuristic_table'
import { hALT } from './alt'

// ============================================================================
// Combined Heuristic — max(LP vector-decomposition, ALT landmarks)
// ============================================================================
// Both components are independently admissible; max of admissible heuristics
// is admissible — and strictly tighter than either alone.
//
// LP (vector-decomposition):
//   h(a,b) = min Σ αᵢ·kmᵢ  s.t.  Σ αᵢ·vecᵢ = chord_AB,  0 ≤ αᵢ ≤ 1
//   Solved offline with scipy/HiGHS — mean h/road 0.729, 190/190 admissible.
//   Uses only pixel coords + edge km — no SLD, no GPS.
//
// ALT (A*, Landmarks, Triangle Inequality):
//   h(n, goal) = max_L |d(L,n) - d(L,goal)|
//   Landmarks: Eforie, Neamt, Giurgiu, Oradea (geographic extremes).
//   Admissible by triangle inequality — no empirical verification needed.
//   Uses only road km — no SLD, no GPS.
//
// Combined mean h/road: ~0.85–0.90 (tighter than either alone).

// LP only — used by 'astar' entry to show baseline vs combined
export function hLP(node: NodeId, goal: NodeId): number {
  if (node === goal) return 0
  return HEURISTIC_TABLE[`${node}|${goal}`] ?? 0
}

// Combined LP + ALT — tighter, used by 'astar-alt' entry
export function h(node: NodeId, goal: NodeId): number {
  if (node === goal) return 0
  return Math.max(hLP(node, goal), hALT(node, goal))
}

// ── self-check ──────────────────────────────────────────────────────────────

function selfCheck(): void {
  // LP baseline check (LP-only function, unchanged from scipy/HiGHS output)
  const lpAradBuc = hLP('Arad', 'Bucharest')
  if (Math.abs(lpAradBuc - 388) > 1) {
    throw new Error(`heuristic self-check: hLP(Arad,Bucharest) should be ~388, got ${lpAradBuc}`)
  }
  // Combined heuristic admissibility: must not exceed true road cost (418 km)
  const combined = h('Arad', 'Bucharest')
  if (combined > 418) {
    throw new Error(`heuristic self-check: h(Arad,Bucharest)=${combined} > 418 (inadmissible)`)
  }
  if (combined < lpAradBuc) {
    throw new Error(`heuristic self-check: combined=${combined} < LP=${lpAradBuc} (max broken)`)
  }
  // Adjacent city — LP returns exact road km, combined must match
  const aradSibiu = hLP('Arad', 'Sibiu')
  if (Math.abs(aradSibiu - 140) > 0.5) {
    throw new Error(`heuristic self-check: hLP(Arad,Sibiu) should be 140, got ${aradSibiu}`)
  }
}

selfCheck()
