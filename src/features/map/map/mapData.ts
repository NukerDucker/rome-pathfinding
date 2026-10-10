// Map-derived values that the modern shell needs but the SVG renderers do not:
// random route selection, normalized h-values, and the step move count.
import { CITIES, type NodeId } from '@/algorithms/romania'
import { type Step } from '@/algorithms/search'
import { altHWith, type LandmarkPreset } from '@/algorithms/heuristic'

export function randomPair(): { start: NodeId; goal: NodeId } {
  const start = CITIES[Math.floor(Math.random() * CITIES.length)]
  const rest = CITIES.filter((city) => city !== start)
  return { start, goal: rest[Math.floor(Math.random() * rest.length)] }
}

// Pure normalized h-values for a given preset/custom set (no module globals).
export function heatmapFor(goal: NodeId, preset: LandmarkPreset, custom: NodeId[]): Record<NodeId, number> | undefined {
  const vals: Record<NodeId, number> = {}
  let max = 0
  for (const city of CITIES) {
    vals[city] = altHWith(city, goal, preset, custom)
    if (vals[city] > max) max = vals[city]
  }
  if (max === 0) return undefined
  for (const city of CITIES) vals[city] /= max
  return vals
}

// list, so the FTL burst counters stay safe under StrictMode/concurrent
// rendering (no render-phase ref mutation). A parked ship stops incrementing.
export function countMoves(steps: Step[], upto: number, start: NodeId): number {
  if (upto <= 0) return 0
  let count = 0
  let prev: NodeId = steps[0]?.current ?? start
  for (let i = 1; i <= upto; i++) {
    const cur = steps[i]?.current
    if (cur !== undefined && cur !== prev) count++
    prev = cur ?? prev
  }
  return count
}
