// ============================================================================
// INDEPENDENT EVALUATION — Romania pathfinding heuristics
// ============================================================================
// This script is deliberately self-contained:
//   * It writes its OWN Dijkstra (below) to compute true all-pairs distances.
//   * ALL_CITY_DIST from src/alt.ts is used ONLY as a cross-check at the end.
//   * It writes its OWN standalone A* that takes an h-function, so every
//     heuristic (including ALT-only) is measured under identical search code.
//
// Run:  bun run eval/independent-eval.ts
//
// Counting conventions (stated explicitly for reproducibility):
//   * "expanded" = a node popped from the frontier with a non-stale g
//     (g > bestG[node] => skip, not counted). The goal IS counted as expanded,
//     and the search stops when the goal is popped (not when generated).
//   * "generated" = distinct nodes ever discovered (first time a node gets a
//     finite bestG), including the start. Matches the repo's SearchResult.generated.
//   * Frontier tie-break on equal f: first entry encountered by the linear scan.

import { ROMANIA, CITIES, type NodeId } from '../src/algorithms/romania'
import { hLP, h } from '../src/algorithms/heuristic'
import { hALT2, hALT4, hALT8, ALL_CITY_DIST } from '../src/algorithms/alt'

// ---------------------------------------------------------------------------
// My own Dijkstra (independent of src/alt.ts)
// ---------------------------------------------------------------------------
type Dist = Record<NodeId, number>

function myDijkstra(source: NodeId): Dist {
  const dist: Dist = {}
  for (const c of CITIES) dist[c] = Infinity
  dist[source] = 0

  const visited = new Set<NodeId>()
  const frontier: [number, NodeId][] = [[0, source]]

  while (frontier.length > 0) {
    let bi = 0
    for (let i = 1; i < frontier.length; i++) if (frontier[i][0] < frontier[bi][0]) bi = i
    const [d, u] = frontier[bi]
    frontier[bi] = frontier[frontier.length - 1]
    frontier.pop()

    if (visited.has(u)) continue
    visited.add(u)

    for (const e of ROMANIA[u].edges) {
      const nd = d + e.km
      if (nd < dist[e.to]) {
        dist[e.to] = nd
        frontier.push([nd, e.to])
      }
    }
  }
  return dist
}

const TRUE_DIST: Record<NodeId, Dist> = {}
for (const c of CITIES) TRUE_DIST[c] = myDijkstra(c)

// ---------------------------------------------------------------------------
// Ordered pairs (a != b)
// ---------------------------------------------------------------------------
const PAIRS: [NodeId, NodeId][] = []
for (const a of CITIES) for (const b of CITIES) if (a !== b) PAIRS.push([a, b])

// ---------------------------------------------------------------------------
// Heuristics under test
// ---------------------------------------------------------------------------
type HFn = (n: NodeId, g: NodeId) => number

const HEURISTICS: { name: string; fn: HFn }[] = [
  { name: 'LP only', fn: hLP },
  { name: 'ALT lm2', fn: hALT2 },
  { name: 'ALT lm4', fn: hALT4 },
  { name: 'ALT lm8', fn: hALT8 },
  { name: 'combined LP+ALT (lm8)', fn: h }, // h = max(hLP, hALT8) at default preset
]

const EPS = 1e-9

// ---------------------------------------------------------------------------
// 1. Admissibility: count ordered pairs with h(a,b) > trueD(a,b)
// ---------------------------------------------------------------------------
console.log('=== Admissibility violations (h(a,b) > trueD(a,b)) over 380 ordered pairs ===')
type AdmRow = { name: string; violations: number }
const admRows: AdmRow[] = []
for (const { name, fn } of HEURISTICS) {
  let viol = 0
  let worst = 0
  for (const [a, b] of PAIRS) {
    const hv = fn(a, b)
    const td = TRUE_DIST[a][b]
    if (hv > td + EPS) viol++
    worst = Math.max(worst, hv - td)
  }
  admRows.push({ name, violations: viol })
  console.log(`  ${name.padEnd(28)} violations=${String(viol).padStart(3)}   worst(h-true)=${worst.toFixed(3)}`)
}

// ---------------------------------------------------------------------------
// 2. Informedness: mean h / trueD ratio
// ---------------------------------------------------------------------------
console.log('\n=== Informedness: sum(h(a,b)) / sum(trueD(a,b)) over 380 ordered pairs ===')
type RatioRow = { name: string; sumH: number; ratio: number }
const ratioRows: RatioRow[] = []
for (const { name, fn } of HEURISTICS) {
  let sumH = 0
  let sumD = 0
  for (const [a, b] of PAIRS) {
    sumH += fn(a, b)
    sumD += TRUE_DIST[a][b]
  }
  const ratio = sumH / sumD
  ratioRows.push({ name, sumH, ratio })
  console.log(`  ${name.padEnd(28)} sumH=${sumH.toFixed(1).padStart(9)}  mean h/road=${ratio.toFixed(4)}`)
}

// ---------------------------------------------------------------------------
// Standalone A* taking an h-function
// ---------------------------------------------------------------------------
function reconstructPath(parent: Record<NodeId, NodeId | null>, goal: NodeId): NodeId[] {
  const path: NodeId[] = []
  let node: NodeId | undefined = goal
  while (node !== undefined) {
    path.unshift(node)
    const prev: NodeId | null | undefined = parent[node]
    if (prev === undefined) return []
    if (prev === null) break
    node = prev
  }
  return path
}

function pathCost(path: NodeId[]): number {
  let cost = 0
  for (let i = 0; i < path.length - 1; i++) {
    const e = ROMANIA[path[i]].edges.find((x) => x.to === path[i + 1])
    if (e === undefined) return NaN
    cost += e.km
  }
  return cost
}

type AStarOut = { cost: number; expanded: number; generated: number; path: NodeId[] }

function astarStandalone(start: NodeId, goal: NodeId, hf: HFn): AStarOut {
  const bestG: Record<NodeId, number> = { [start]: 0 }
  const parent: Record<NodeId, NodeId | null> = { [start]: null }
  const discovered = new Set<NodeId>([start])
  const frontier: { f: number; g: number; node: NodeId }[] = [
    { f: hf(start, goal), g: 0, node: start },
  ]
  let expanded = 0
  let generated = 1

  while (frontier.length > 0) {
    let bi = 0
    for (let i = 1; i < frontier.length; i++) if (frontier[i].f < frontier[bi].f) bi = i
    const cur = frontier[bi]
    frontier[bi] = frontier[frontier.length - 1]
    frontier.pop()

    if (cur.g > (bestG[cur.node] ?? Infinity)) continue // stale
    expanded += 1

    if (cur.node === goal) {
      return { cost: cur.g, expanded, generated, path: reconstructPath(parent, goal) }
    }

    for (const e of ROMANIA[cur.node].edges) {
      const ng = cur.g + e.km
      if (ng < (bestG[e.to] ?? Infinity)) {
        bestG[e.to] = ng
        parent[e.to] = cur.node
        if (!discovered.has(e.to)) {
          discovered.add(e.to)
          generated += 1
        }
        frontier.push({ f: ng + hf(e.to, goal), g: ng, node: e.to })
      }
    }
  }
  return { cost: Infinity, expanded, generated, path: [] }
}

// ---------------------------------------------------------------------------
// 3. Total expansions / generated per algorithm
// ---------------------------------------------------------------------------
console.log('\n=== A* totals over 380 ordered pairs ===')
type AlgoRow = { name: string; expanded: number; generated: number; mismatches: number }
const algoRows: AlgoRow[] = []

const ALGOS: { name: string; fn: HFn }[] = [
  { name: 'UCS (h=0)', fn: () => 0 },
  { name: 'A* LP', fn: hLP },
  { name: 'A* ALT lm2', fn: hALT2 },
  { name: 'A* ALT lm4', fn: hALT4 },
  { name: 'A* ALT lm8', fn: hALT8 },
  { name: 'A* combined LP+ALT (lm8)', fn: h },
]

for (const { name, fn } of ALGOS) {
  let totalExp = 0
  let totalGen = 0
  let mism = 0
  for (const [a, b] of PAIRS) {
    const r = astarStandalone(a, b, fn)
    totalExp += r.expanded
    totalGen += r.generated
    // optimality: A* cost must equal Dijkstra distance (compare path cost too)
    if (Math.abs(r.cost - TRUE_DIST[a][b]) > EPS || Math.abs(pathCost(r.path) - TRUE_DIST[a][b]) > EPS) {
      mism++
    }
  }
  algoRows.push({ name, expanded: totalExp, generated: totalGen, mismatches: mism })
  console.log(
    `  ${name.padEnd(30)} expansions=${String(totalExp).padStart(6)}  generated=${String(totalGen).padStart(6)}  optMismatch=${mism}`,
  )
}

// ---------------------------------------------------------------------------
// 4. Dijkstra sanity + cross-check against ALL_CITY_DIST
// ---------------------------------------------------------------------------
const ab = TRUE_DIST['Arad']['Bucharest']
console.log(`\n=== Sanity & cross-check ===`)
console.log(`  my Dijkstra Arad->Bucharest = ${ab} km (expected 418)`)

let maxDiff = 0
let diffPairs = 0
for (const s of CITIES) {
  for (const t of CITIES) {
    const mine = TRUE_DIST[s][t]
    const repo = ALL_CITY_DIST[s]?.[t]
    if (repo === undefined) {
      console.log(`  MISSING ALL_CITY_DIST[${s}][${t}]`)
      continue
    }
    const d = Math.abs(mine - repo)
    if (d > maxDiff) maxDiff = d
    if (d > EPS) diffPairs++
  }
}
console.log(`  max |myDijkstra - ALL_CITY_DIST| = ${maxDiff} over ${CITIES.length * CITIES.length} ordered (incl. self) pairs`)
console.log(`  pairs differing beyond eps = ${diffPairs}`)

// ---------------------------------------------------------------------------
// Extra diagnostics: alternative ratio definitions + LP symmetry, to interpret
// any divergence from the README's claimed mean h/road figures.
// ---------------------------------------------------------------------------
console.log('\n=== Diagnostics: alternative "mean h/road" definitions (LP only) ===')
{
  // (a) ratio of sums over 380 ordered pairs
  let sumH = 0, sumD = 0
  // (b) mean of per-pair ratios over 380 ordered pairs
  let sumRatio = 0, n = 0
  // (c) ratio of sums over 190 unordered pairs (a<b), LP evaluated as hLP(a,b)
  let sumH190 = 0, sumD190 = 0
  let maxAsym = 0
  for (const [a, b] of PAIRS) {
    const hv = hLP(a, b)
    sumH += hv; sumD += TRUE_DIST[a][b]
    sumRatio += hv / TRUE_DIST[a][b]; n++
    maxAsym = Math.max(maxAsym, Math.abs(hLP(a, b) - hLP(b, a)))
  }
  for (let i = 0; i < CITIES.length; i++) {
    for (let j = i + 1; j < CITIES.length; j++) {
      sumH190 += hLP(CITIES[i], CITIES[j])
      sumD190 += TRUE_DIST[CITIES[i]][CITIES[j]]
    }
  }
  console.log(`  ratio-of-sums (380 ordered)      = ${(sumH / sumD).toFixed(4)}`)
  console.log(`  mean of per-pair ratios (380)    = ${(sumRatio / n).toFixed(4)}`)
  console.log(`  ratio-of-sums (190 unordered)    = ${(sumH190 / sumD190).toFixed(4)}`)
  console.log(`  max |hLP(a,b) - hLP(b,a)|        = ${maxAsym}`)
}

// ---------------------------------------------------------------------------
// Machine-readable summary block
// ---------------------------------------------------------------------------
console.log('\nSUMMARY_JSON ' + JSON.stringify({
  dijkstraAradBucharest: ab,
  maxDiffVsRepoDist: maxDiff,
  admissibility: admRows,
  ratios: ratioRows.map((r) => ({ name: r.name, ratio: Number(r.ratio.toFixed(4)), sumH: Number(r.sumH.toFixed(3)) })),
  algorithms: algoRows,
}))
