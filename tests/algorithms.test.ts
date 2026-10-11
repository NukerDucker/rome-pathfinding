// Cross-algorithm suite. Every algorithm in the UI registry is run over every
// ordered city pair and checked against independent oracles (ALL_CITY_DIST, a
// Floyd–Warshall-derived distance table, and UCS) plus the properties the app
// relies on: simple real-road paths, deterministic frames, a parent map the map
// renderer can walk one hop, admissible & consistent heuristics.
//
// Companions: tests/state-invariants.test.ts (the Step contract) and
// tests/biastar.test.ts (bidirectional-A* regression + custom-landmark sweep).
import { afterEach, describe, expect, test } from 'bun:test'
import { ALL_CITY_DIST } from '../src/algorithms/alt'
import { h, hALTOnly, hLP, restoreALTState, saveALTState, setALTPreset } from '../src/algorithms/heuristic'
import { CITIES, ROMANIA, type NodeId } from '../src/algorithms/romania'
import { ALGORITHMS, pathCost, reconstructPath } from '../src/algorithms/search'

const PAIRS: [NodeId, NodeId][] = CITIES.flatMap((s) =>
  CITIES.filter((g) => g !== s).map((g) => [s, g] as [NodeId, NodeId]),
)
const ENTRIES = Object.entries(ALGORITHMS)
const hasEdge = (a: NodeId, b: NodeId) => ROMANIA[a].edges.some((e) => e.to === b)

// Algorithms the metadata advertises as cost-optimal (bfs is 'Yes*' = unweighted only).
const OPTIMAL = ENTRIES.filter(([, m]) => m.optimal === 'Yes').map(([k]) => k)
// Single-direction searches build a start-rooted parent tree. The bidirectional
// ones store only a one-hop relaxation record, so reconstructPath is scoped to
// these (see the renderer-contract test for what bidir parents do guarantee).
const SINGLE_DIRECTION = ['bfs', 'dfs', 'greedy', 'astar', 'astaralt', 'astaraltonly', 'ucs']

const originalALT = saveALTState()
afterEach(() => restoreALTState(originalALT))

describe('registry contract', () => {
  test('all nine algorithms expose complete metadata', () => {
    expect(ENTRIES.length).toBe(9)
    for (const [key, m] of ENTRIES) {
      expect(typeof m.run, key).toBe('function')
      expect(m.label.length, key).toBeGreaterThan(0)
      expect(m.time.length, key).toBeGreaterThan(0)
      expect(m.space.length, key).toBeGreaterThan(0)
      expect(['Yes', 'Yes*', 'No', 'No*']).toContain(m.optimal)
      expect(['Yes', 'Yes*', 'No', 'No*']).toContain(m.complete)
    }
  })
})

describe('all algorithms × all 380 ordered pairs', () => {
  test('finds the goal with a simple path over real roads', () => {
    const failures: string[] = []
    for (const [key, m] of ENTRIES) for (const [s, g] of PAIRS) {
      const r = m.run(s, g)
      if (!r.found) { failures.push(`${key} ${s}->${g}: not found`); continue }
      if (r.path[0] !== s || r.path[r.path.length - 1] !== g) failures.push(`${key} ${s}->${g}: endpoints ${r.path[0]}..${r.path.at(-1)}`)
      if (new Set(r.path).size !== r.path.length) failures.push(`${key} ${s}->${g}: path repeats a node`)
      for (let i = 0; i + 1 < r.path.length; i++) if (!hasEdge(r.path[i], r.path[i + 1])) failures.push(`${key} ${s}->${g}: ${r.path[i]}->${r.path[i + 1]} is not a road`)
      if (!Number.isFinite(pathCost(r.path))) failures.push(`${key} ${s}->${g}: pathCost is not finite`)
    }
    expect(failures).toEqual([])
  })

  test('the final frame lands on the route (the goal for single-direction)', () => {
    const failures: string[] = []
    for (const [key, m] of ENTRIES) for (const [s, g] of PAIRS) {
      const r = m.run(s, g)
      if (r.steps.length === 0) { failures.push(`${key} ${s}->${g}: no steps`); continue }
      const last = r.steps.at(-1)!.current
      // Bidirectional searches land on the meeting node (always on the route);
      // single-direction ones land on the goal itself.
      if (!r.path.includes(last)) failures.push(`${key} ${s}->${g}: final current ${last} is not on the path`)
      if (SINGLE_DIRECTION.includes(key) && last !== g) failures.push(`${key} ${s}->${g}: final current ${last} != goal`)
      // No double landing: the goal frame must be the last one only (UCS regression).
      if (SINGLE_DIRECTION.includes(key) && r.steps.length > 1 && r.steps.at(-2)!.current === g) {
        failures.push(`${key} ${s}->${g}: goal frame duplicated at the end`)
      }
    }
    expect(failures).toEqual([])
  })

  test('is deterministic across repeated runs', () => {
    const failures: string[] = []
    for (const [key, m] of ENTRIES) for (const [s, g] of PAIRS) {
      const a = m.run(s, g), b = m.run(s, g)
      if (JSON.stringify(a.path) !== JSON.stringify(b.path) || a.steps.length !== b.steps.length) failures.push(`${key} ${s}->${g}`)
    }
    expect(failures).toEqual([])
  })

  test('start === goal returns a single frame', () => {
    const failures: string[] = []
    for (const [key, m] of ENTRIES) for (const c of CITIES) {
      const r = m.run(c, c)
      if (!r.found || r.path.length !== 1 || r.path[0] !== c || r.steps.length !== 1 || r.steps[0]?.current !== c) {
        failures.push(`${key} ${c}->${c}`)
      }
    }
    expect(failures).toEqual([])
  })

  test('unknown endpoints report not-found instead of throwing', () => {
    const failures: string[] = []
    const bad: [NodeId, NodeId][] = [['missing', 'Arad'], ['Arad', 'missing'], ['x', 'y']]
    for (const [key, m] of ENTRIES) for (const [s, g] of bad) {
      try {
        const r = m.run(s, g)
        if (r.found || r.path.length !== 0) failures.push(`${key} ${s}->${g}: found=${r.found} path=${r.path.length}`)
      } catch (e) {
        failures.push(`${key} ${s}->${g}: threw ${(e as Error).message}`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('optimality', () => {
  test('cost-optimal algorithms match UCS on every pair', () => {
    const failures: string[] = []
    for (const key of OPTIMAL) for (const [s, g] of PAIRS) {
      const got = pathCost(ALGORITHMS[key].run(s, g).path)
      const want = pathCost(ALGORITHMS.ucs.run(s, g).path)
      if (Math.abs(got - want) > 1e-9) failures.push(`${key} ${s}->${g}: ${got} != ${want}`)
    }
    expect(failures).toEqual([])
  })

  test('BFS returns a fewest-road route', () => {
    const failures: string[] = []
    for (const [s, g] of PAIRS) {
      const bh = ALGORITHMS.bfs.run(s, g).path.length - 1
      let min = Infinity
      for (const [, m] of ENTRIES) min = Math.min(min, m.run(s, g).path.length - 1)
      if (bh > min) failures.push(`${s}->${g}: bfs used ${bh} roads but a ${min}-road route exists`)
    }
    expect(failures).toEqual([])
  })
})

describe('parent map', () => {
  test('single-direction parent reconstructs the route', () => {
    const failures: string[] = []
    for (const key of SINGLE_DIRECTION) for (const [s, g] of PAIRS) {
      const r = ALGORITHMS[key].run(s, g)
      if (JSON.stringify(reconstructPath(r.parent, g)) !== JSON.stringify(r.path)) failures.push(`${key} ${s}->${g}`)
    }
    expect(failures).toEqual([])
  })

  test('every parent link is a real road (renderer walks it one hop)', () => {
    const failures: string[] = []
    for (const [key, m] of ENTRIES) for (const [s, g] of PAIRS) {
      const r = m.run(s, g)
      for (const [n, p] of Object.entries(r.parent)) {
        if (p !== null && !hasEdge(p, n)) failures.push(`${key} ${s}->${g}: parent[${n}] = ${p} is not a road`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('heuristics', () => {
  test('hLP, hALT and the combined h never exceed the true distance', () => {
    const fns = [['hLP', hLP], ['hALTOnly', hALTOnly], ['h', h]] as const
    const failures: string[] = []
    for (const [name, fn] of fns) for (const a of CITIES) for (const b of CITIES) {
      const trueD = ALL_CITY_DIST[a]?.[b] ?? Infinity
      if (fn(a, b) > trueD + 1e-6) failures.push(`${name}(${a},${b}) = ${fn(a, b)} > ${trueD}`)
      if (fn(a, a) !== 0) failures.push(`${name}(${a},${a}) != 0`)
    }
    expect(failures).toEqual([])
  })

  test('named landmark presets are consistent', () => {
    const failures: string[] = []
    for (const preset of ['lm2', 'lm4', 'lm8'] as const) {
      setALTPreset(preset)
      for (const goal of CITIES) for (const u of CITIES) for (const e of ROMANIA[u].edges) {
        if (h(u, goal) > e.km + h(e.to, goal) + 1e-9) failures.push(`${preset} ${u}->${e.to} goal=${goal}`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('pathCost', () => {
  test('empty and single-node paths cost nothing', () => {
    expect(pathCost([])).toBe(0)
    for (const c of CITIES) expect(pathCost([c])).toBe(0)
  })
})
