import type { NodeId } from '@/romania'
import { LANDMARK_PRESETS } from '@/alt'

export type LandmarkCount = 'lm2' | 'lm4' | 'lm8'
export const LM_OPTIONS: { value: LandmarkCount; label: string }[] = [
  { value: 'lm2', label: '2' },
  { value: 'lm4', label: '4' },
  { value: 'lm8', label: '8' },
]
export const LM_SHORT: Record<LandmarkCount, string> = { lm2: '2', lm4: '4', lm8: '8' }

// Resolve the landmark cities a lane should draw on its map. Drawn when the
// algorithm uses landmarks (its heuristic is driven by them) OR when the user
// explicitly opted in to the overlay for a non-landmark algorithm. Either way
// the drawn set is the lane's custom picks if present, else the preset.
export function laneLandmarkCities(
  usesLandmarks: boolean | undefined,
  overlay: boolean,
  count: LandmarkCount,
  custom: NodeId[],
): readonly NodeId[] | undefined {
  if (!usesLandmarks && !overlay) return undefined
  return custom.length > 0 ? custom : LANDMARK_PRESETS[count]
}

// Typeset a LaTeX expression inline (span element). The time/space complexity
// strings in search.ts are already LaTeX, so they are passed straight through.
// Row-name suffix describing which landmark config a lane runs with.
export function laneLmSuffix(
  usesLandmarks: boolean | undefined,
  count: LandmarkCount,
  custom: NodeId[],
): string {
  if (!usesLandmarks) return ''
  return custom.length > 0 ? ` · Custom (${custom.length})` : ` · ${LM_SHORT[count]} Landmark`
}
