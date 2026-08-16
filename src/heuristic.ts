import type { NodeId } from './romania'
import { HEURISTIC_TABLE } from './heuristic_table'

// ============================================================================
// LP Vector-Decomposition Heuristic — admissible, precomputed.
// ============================================================================
// h(a,b) = min Σ αᵢ·kmᵢ  s.t.  Σ αᵢ·vecᵢ = chord_AB,  0 ≤ αᵢ ≤ 1, where the
// vecᵢ are the 46 directed road-edge pixel vectors.  The real road path is
// one feasible α assignment, so the LP optimum ≤ road distance — a provable
// admissible lower bound.  Adjacent cities return the exact road km.
//
// The values are solved OFFLINE with scipy/HiGHS (validated 190/190
// admissible, mean h/road 0.729) and baked into heuristic_table.ts by
// scripts/gen_heuristic_table.py — no LP solver runs in the browser.
// Uses only pixel coords + edge km — no SLD, no GPS.

export function h(node: NodeId, goal: NodeId): number {
  if (node === goal) return 0
  return HEURISTIC_TABLE[`${node}|${goal}`] ?? 0
}

// ── self-check ──────────────────────────────────────────────────────────────

function selfCheck(): void {
  // Known values from the scipy/HiGHS precompute (see scripts/gen_heuristic_table.py).
  const aradBuc = h('Arad', 'Bucharest')
  if (Math.abs(aradBuc - 388) > 1) {
    throw new Error(`heuristic self-check: Arad->Bucharest should be ~388, got ${aradBuc}`)
  }
  const aradSibiu = h('Arad', 'Sibiu')
  if (Math.abs(aradSibiu - 140) > 0.5) {
    throw new Error(`heuristic self-check: Arad->Sibiu should be 140, got ${aradSibiu}`)
  }
}

selfCheck()
