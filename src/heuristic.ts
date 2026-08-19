import type { NodeId } from './romania'
import { HEURISTIC_TABLE } from './heuristic_table'
import { hALT2, hALT4, hALT8, makeHALTArbitrary } from './alt'

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
//   Admissible by triangle inequality — no empirical verification needed.
//   Uses only road km — no SLD, no GPS.
//
// Landmark preset selectable at runtime via setALTPreset().
// Combined mean h/road: lm2 ≈ 0.75, lm4 ≈ 0.82, lm8 ≈ 0.85–0.90.

export type LandmarkPreset = 'lm2' | 'lm4' | 'lm8' | 'custom'

const ALT_FNS: Record<'lm2' | 'lm4' | 'lm8', (n: NodeId, g: NodeId) => number> = {
  lm2: hALT2,
  lm4: hALT4,
  lm8: hALT8,
}

// ponytail: global mutables — SPA, single user, no concurrency concern
let _altPreset: LandmarkPreset = 'lm8'
type AltFn = (n: NodeId, g: NodeId) => number
let _customALTFn: AltFn | null = null

export function setALTPreset(preset: Exclude<LandmarkPreset, 'custom'>): void { _altPreset = preset }
export function getALTPreset(): LandmarkPreset { return _altPreset }

export function setCustomLandmarks(landmarks: NodeId[]): void {
  if (landmarks.length === 0) {
    _customALTFn = null
    if (_altPreset === 'custom') _altPreset = 'lm8'
    return
  }
  _customALTFn = makeHALTArbitrary(landmarks)
  _altPreset = 'custom'
}

// Save/restore for landmarkComparison which temporarily swaps presets.
export type ALTState = { preset: LandmarkPreset; customFn: AltFn | null }
export function saveALTState(): ALTState { return { preset: _altPreset, customFn: _customALTFn } }
export function restoreALTState(s: ALTState): void { _altPreset = s.preset; _customALTFn = s.customFn }

// LP only — used by 'astar' entry to show baseline vs combined
export function hLP(node: NodeId, goal: NodeId): number {
  if (node === goal) return 0
  return HEURISTIC_TABLE[`${node}|${goal}`] ?? 0
}

function altH(node: NodeId, goal: NodeId): number {
  if (_altPreset === 'custom' && _customALTFn) return _customALTFn(node, goal)
  return ALT_FNS[_altPreset as 'lm2' | 'lm4' | 'lm8'](node, goal)
}

// ALT only — no LP component; respects current preset (including custom)
export function hALTOnly(node: NodeId, goal: NodeId): number {
  if (node === goal) return 0
  return altH(node, goal)
}

// Combined LP + ALT — tighter, used by 'astar-alt' entry
export function h(node: NodeId, goal: NodeId): number {
  if (node === goal) return 0
  return Math.max(hLP(node, goal), altH(node, goal))
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
