import { ROMANIA, type NodeId } from './romania'

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

const LANDMARKS: NodeId[] = ['Eforie', 'Neamt', 'Giurgiu', 'Oradea']

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

// Precomputed once at module load — 4 × Dijkstra on 20 nodes
const LANDMARK_DIST: Record<NodeId, DistMap> = {}
for (const L of LANDMARKS) LANDMARK_DIST[L] = dijkstra(L)

export function hALT(node: NodeId, goal: NodeId): number {
  if (node === goal) return 0
  let best = 0
  for (const L of LANDMARKS) {
    const dLn = LANDMARK_DIST[L][node]
    const dLg = LANDMARK_DIST[L][goal]
    if (dLn === undefined || dLg === undefined) continue
    const bound = Math.abs(dLn - dLg)
    if (bound > best) best = bound
  }
  return best
}

// ── self-check ──────────────────────────────────────────────────────────────

function selfCheck(): void {
  // Arad→Bucharest true shortest = 418. ALT must not exceed it.
  const h = hALT('Arad', 'Bucharest')
  if (h > 418) throw new Error(`alt.ts self-check: h(Arad,Bucharest)=${h} > 418 (inadmissible)`)
  if (h <= 0) throw new Error(`alt.ts self-check: h(Arad,Bucharest)=${h} — landmarks not working`)

  const same = hALT('Bucharest', 'Bucharest')
  if (same !== 0) throw new Error(`alt.ts self-check: h(X,X) should be 0, got ${same}`)
}

selfCheck()
