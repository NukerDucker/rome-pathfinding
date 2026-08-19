import { ROMANIA, CITIES, type NodeId } from './romania'

// ============================================================================
// ALT Heuristic — A*, Landmarks, Triangle Inequality
// ============================================================================
// Landmarks are geographic extremes (all degree-1 or degree-2 nodes):
//   Eforie  — far east (1 edge)
//   Neamt   — far north-east (1 edge)
//   Giurgiu — far south (1 edge)
//   Oradea  — far north-west (2 edges)
//
// Admissibility proof (triangle inequality):
//   d(n, goal) ≥ d(L, n) - d(L, goal)   for any landmark L
//   d(n, goal) ≥ d(L, goal) - d(L, n)   (same, flipped)
//   ∴ h(n, goal) = max_L |d(L,n) - d(L,goal)| ≤ d(n, goal)   □
//
// No SLD, no GPS — only road km from the assignment PDF.
// Dijkstra runs 4× at module load on a 20-node graph: negligible cost.

// Landmark presets — geographic extremes. More = tighter bounds, free at 20 nodes.
export const LANDMARK_PRESETS = {
  lm2: ['Eforie', 'Oradea'],
  lm4: ['Eforie', 'Neamt', 'Giurgiu', 'Oradea'],
  lm8: ['Eforie', 'Neamt', 'Giurgiu', 'Oradea', 'Timisoara', 'Vaslui', 'Drobeta', 'Hirsova'],
} as const satisfies Record<string, NodeId[]>

type DistMap = Record<string, number>

function dijkstra(source: NodeId): DistMap {
  const dist: DistMap = {}
  for (const city of Object.keys(ROMANIA)) dist[city] = Infinity
  dist[source] = 0

  const visited = new Set<NodeId>()
  const queue: [number, NodeId][] = [[0, source]]

  while (queue.length > 0) {
    // ponytail: linear scan fine — 20 nodes, runs once at module load
    let bi = 0
    for (let i = 1; i < queue.length; i++) if (queue[i][0] < queue[bi][0]) bi = i
    const [d, u] = queue[bi]
    queue[bi] = queue[queue.length - 1]
    queue.pop()

    if (visited.has(u)) continue
    visited.add(u)

    for (const edge of ROMANIA[u].edges) {
      const nd = d + edge.km
      if (nd < dist[edge.to]) {
        dist[edge.to] = nd
        queue.push([nd, edge.to])
      }
    }
  }

  return dist
}

// Precompute Dijkstra for all lm8 landmarks (superset — covers all presets)
// ponytail: 8 × Dijkstra on 20 nodes at module load, negligible cost
const LANDMARK_DIST: Record<NodeId, DistMap> = {}
for (const L of LANDMARK_PRESETS.lm8) LANDMARK_DIST[L] = dijkstra(L)

// Precompute Dijkstra from ALL cities — used by makeHALTArbitrary (click-to-landmark)
// ponytail: 20 × Dijkstra on 20 nodes, still < 1ms total
export const ALL_CITY_DIST: Record<NodeId, DistMap> = {}
for (const L of CITIES) ALL_CITY_DIST[L] = dijkstra(L as NodeId)

// Like makeHALT but accepts any city as a landmark (not restricted to lm8 set).
export function makeHALTArbitrary(landmarks: readonly NodeId[]) {
  return (node: NodeId, goal: NodeId): number => {
    if (node === goal) return 0
    let best = 0
    for (const L of landmarks) {
      const dists = ALL_CITY_DIST[L]
      if (!dists) continue
      const bound = Math.abs(dists[node] - dists[goal])
      if (bound > best) best = bound
    }
    return best
  }
}

export function makeHALT(landmarks: readonly NodeId[]) {
  return (node: NodeId, goal: NodeId): number => {
    if (node === goal) return 0
    let best = 0
    for (const L of landmarks) {
      const dLn = LANDMARK_DIST[L][node]
      const dLg = LANDMARK_DIST[L][goal]
      if (dLn === undefined || dLg === undefined) continue
      const bound = Math.abs(dLn - dLg)
      if (bound > best) best = bound
    }
    return best
  }
}

export const hALT2 = makeHALT(LANDMARK_PRESETS.lm2)
export const hALT4 = makeHALT(LANDMARK_PRESETS.lm4)
export const hALT8 = makeHALT(LANDMARK_PRESETS.lm8)
export const hALT = hALT8 // default: tightest preset

// ── self-check ──────────────────────────────────────────────────────────────

function selfCheck(): void {
  // All presets must be admissible and non-trivial on Arad→Bucharest (true = 418)
  for (const [name, fn] of [['lm2', hALT2], ['lm4', hALT4], ['lm8', hALT8]] as const) {
    const h = fn('Arad', 'Bucharest')
    if (h > 418) throw new Error(`alt.ts self-check ${name}: h=${h} > 418 (inadmissible)`)
    if (h <= 0)  throw new Error(`alt.ts self-check ${name}: h=${h} — landmarks not working`)
  }
  // lm8 must be at least as tight as lm4 (more landmarks = tighter or equal)
  if (hALT8('Arad', 'Bucharest') < hALT4('Arad', 'Bucharest')) {
    throw new Error('alt.ts self-check: lm8 weaker than lm4 — landmark selection issue')
  }
  if (hALT('Bucharest', 'Bucharest') !== 0) throw new Error('alt.ts self-check: h(X,X) should be 0')
}

selfCheck()
