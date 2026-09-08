import { afterEach, describe, expect, test } from 'bun:test'
import { biastar } from '../src/biastar'
import { ucs } from '../src/ucs'
import { CITIES, ROMANIA } from '../src/romania'
import { ALGORITHMS, pathCost } from '../src/search'
import { h, restoreALTState, saveALTState, setALTPreset, setCustomLandmarks } from '../src/heuristic'

const originalState = saveALTState()
afterEach(() => restoreALTState(originalState))

// Independent Floyd–Warshall oracle, without heuristic or search code.
const distances = Object.fromEntries(CITIES.map(a => [a, Object.fromEntries(
  CITIES.map(b => [b, a === b ? 0 : ROMANIA[a].edges.find(e => e.to === b)?.km ?? Infinity]),
)]))
for (const k of CITIES) for (const a of CITIES) for (const b of CITIES)
  distances[a][b] = Math.min(distances[a][b], distances[a][k] + distances[k][b])

test('regression: Zerind to Bucharest must cost 493, not 525', () => {
  setALTPreset('lm8')
  const result = biastar('Zerind', 'Bucharest')
  expect(result.path).toEqual(['Zerind', 'Arad', 'Sibiu', 'Rimnicu Vilcea', 'Pitesti', 'Bucharest'])
  expect(pathCost(result.path)).toBe(493)
})

test('invalid and identical endpoints', () => {
  expect(biastar('missing', 'Arad').found).toBe(false)
  expect(biastar('Arad', 'missing').path).toEqual([])
  expect(biastar('Arad', 'Arad').path).toEqual(['Arad'])
})

describe('all-pairs integration through the UI algorithm registry', () => {
  const settings = ['lm2', 'lm4', 'lm8', ...CITIES] as const
  for (const setting of settings) test(`optimal routes and admissible bounds: ${setting}`, () => {
    if (setting === 'lm2' || setting === 'lm4' || setting === 'lm8') setALTPreset(setting)
    else setCustomLandmarks([setting])
    for (const start of CITIES) for (const goal of CITIES) {
      const result = ALGORITHMS.biastar.run(start, goal)
      expect(result.found).toBe(true)
      expect(result.path[0]).toBe(start)
      expect(result.path.at(-1)).toBe(goal)
      expect(new Set(result.path).size).toBe(result.path.length)
      expect(pathCost(result.path)).toBe(distances[start][goal])
      expect(pathCost(result.path)).toBe(pathCost(ucs(start, goal).path))
      expect(h(start, goal)).toBeLessThanOrEqual(distances[start][goal] + 1e-6)
      expect(result.steps.at(-1)?.frontier).toEqual([])
    }
  })
})
