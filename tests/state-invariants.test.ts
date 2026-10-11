// The Step contract (src/algorithms/search.ts) enforced across EVERY algorithm
// and EVERY ordered city pair. This is the regression net for the state-model
// bugs: stale frontier entries leaking into frames, visited∩frontier overlap in
// the bidirectional searches, and per-algorithm `generated` definitions.
import { describe, expect, test } from 'bun:test'
import { ROMANIA } from '../src/algorithms/romania'
import { ALGORITHMS, pathCost, stepViolations } from '../src/algorithms/search'
import { ucs } from '../src/algorithms/ucs'

const CITIES = Object.keys(ROMANIA)
const PAIRS: [string, string][] = CITIES.flatMap((s) => CITIES.filter((g) => g !== s).map((g) => [s, g] as [string, string]))

describe('Step contract: visited / frontier / generated', () => {
  test('every frame of every algorithm × every ordered pair is contract-clean', () => {
    const failures: string[] = []
    for (const [key, meta] of Object.entries(ALGORITHMS)) {
      for (const [s, g] of PAIRS) {
        const r = meta.run(s, g)
        r.steps.forEach((step, i) => {
          for (const v of stepViolations(step, r.generated)) {
            failures.push(`${key} ${s}->${g} frame ${i}: ${v}`)
          }
        })
      }
    }
    expect(failures).toEqual([])
  })

  test('every pair is found, path endpoints are start and goal', () => {
    const failures: string[] = []
    for (const [key, meta] of Object.entries(ALGORITHMS)) {
      for (const [s, g] of PAIRS) {
        const r = meta.run(s, g)
        if (!r.found) failures.push(`${key} ${s}->${g}: not found`)
        else if (r.path[0] !== s || r.path[r.path.length - 1] !== g) {
          failures.push(`${key} ${s}->${g}: path ends [${r.path[0]}..${r.path[r.path.length - 1]}]`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  test('generated never exceeds the city count (distinct-discovery, not relaxations)', () => {
    const failures: string[] = []
    for (const [key, meta] of Object.entries(ALGORITHMS)) {
      for (const [s, g] of PAIRS) {
        const r = meta.run(s, g)
        if (r.generated > CITIES.length) failures.push(`${key} ${s}->${g}: generated ${r.generated} > ${CITIES.length} cities`)
      }
    }
    expect(failures).toEqual([])
  })

  test('final frame of a found run has an empty frontier', () => {
    const failures: string[] = []
    for (const [key, meta] of Object.entries(ALGORITHMS)) {
      for (const [s, g] of PAIRS) {
        const r = meta.run(s, g)
        if (!r.found) continue
        const last = r.steps[r.steps.length - 1]
        if (last.frontier.length !== 0) failures.push(`${key} ${s}->${g}: final frontier = [${last.frontier.join(',')}]`)
      }
    }
    expect(failures).toEqual([])
  })

  // `closed` is final: once a node is expanded it never returns to the frontier.
  // This is what the code relies on to paint a stable visited set — it holds with
  // the pathmax on the A* lanes and on biastar's two directions. If an h/config ever
  // forces a re-open, this fails rather than letting a node flicker visited→frontier.
  test('closed is final — visited never shrinks (no re-open) on any run', () => {
    const failures: string[] = []
    for (const [key, meta] of Object.entries(ALGORITHMS)) {
      for (const [s, g] of PAIRS) {
        const r = meta.run(s, g)
        let prev = new Set(r.steps[0]?.visited ?? [])
        r.steps.forEach((step, i) => {
          const cur = new Set(step.visited)
          for (const n of prev) if (!cur.has(n)) failures.push(`${key} ${s}->${g} frame ${i}: ${n} left visited`)
          prev = cur
        })
      }
    }
    expect(failures).toEqual([])
  })
})

describe('optimality: cost-optimal algorithms match UCS on every pair', () => {
  test('A* family and both bidirectional searches return the UCS cost', () => {
    const optimal = ['astar', 'astaralt', 'astaraltonly', 'biastar', 'biucs']
    const failures: string[] = []
    for (const key of optimal) {
      const meta = ALGORITHMS[key]
      for (const [s, g] of PAIRS) {
        const got = pathCost(meta.run(s, g).path)
        const want = pathCost(ucs(s, g).path)
        if (Number.isNaN(got) || got - want > 1e-9) failures.push(`${key} ${s}->${g}: cost ${got} > optimal ${want}`)
      }
    }
    expect(failures).toEqual([])
  })
})
