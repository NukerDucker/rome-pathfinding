import { ROMANIA, type NodeId } from './romania'
import { type SearchResult, type Step } from './search'
import { h } from './heuristic'

// ============================================================================
// Bidirectional A* with LP+ALT heuristic
// ============================================================================
// Forward:  f(n) = g_f(n) + h(n, goal)
// Backward: f(n) = g_b(n) + h(n, start)   [Romania is undirected → h symmetric]
//
// Each frontier minimum bounds the WHOLE start-to-goal distance. Halt when
//   max(min_f(forward_frontier), min_f(backward_frontier)) ≥ μ
// where μ = best complete path cost seen so far.
// Adding these independent bounds double-counts the trip. Each direction applies
// pathmax so its h′ is consistent along its own parent tree, keeping closed final
// (the re-open line below is retained only as a safety net).

function popMin(frontier: [number, number, NodeId][]): [number, number, NodeId] | null {
  if (frontier.length === 0) return null
  let bi = 0
  for (let i = 1; i < frontier.length; i++) if (frontier[i][0] < frontier[bi][0]) bi = i
  const item = frontier[bi]
  frontier[bi] = frontier[frontier.length - 1]
  frontier.pop()
  return item
}

function minF(frontier: [number, number, NodeId][]): number {
  let m = Infinity
  for (const e of frontier) if (e[0] < m) m = e[0]
  return m
}

export function biastar(start: NodeId, goal: NodeId): SearchResult {
  const parent: Record<NodeId, NodeId | null> = {}

  if (!(start in ROMANIA) || !(goal in ROMANIA)) {
    return { steps: [], parent, path: [], found: false, generated: 0 }
  }

  if (start === goal) {
    return {
      steps: [{ current: start, frontier: [], visited: [start] }],
      parent: { [start]: null },
      path: [start],
      found: true,
      generated: 1,
    }
  }

  // Forward
  const gF: Record<NodeId, number> = { [start]: 0 }
  const parF: Record<NodeId, NodeId | null> = { [start]: null }
  const closedF = new Set<NodeId>()
  // Per-direction pathmax h (h′(n) = max(h(n), h′(parent) − c)), carried with its own
  // parent tree. The combined LP+ALT h is admissible but NOT consistent (LP alone:
  // 39/920 pairs; custom landmark sets worse), so without pathmax a settled node could
  // re-open. With it, each direction's `closed` stays final.
  const hPF: Record<NodeId, number> = { [start]: h(start, goal) }
  const frontF: [number, number, NodeId][] = [[hPF[start], 0, start]]

  // Backward
  const gB: Record<NodeId, number> = { [goal]: 0 }
  const parB: Record<NodeId, NodeId | null> = { [goal]: null }
  const closedB = new Set<NodeId>()
  const hPB: Record<NodeId, number> = { [goal]: h(goal, start) }
  const frontB: [number, number, NodeId][] = [[hPB[goal], 0, goal]]

  let mu = Infinity
  let muNode: NodeId | null = null
  const steps: Step[] = []

  // Emitted state follows the Step contract (search.ts). R1 union rule for the
  // two directions: a node closed by EITHER search is `visited`; `frontier` is
  // every node still open in at least one direction that no direction has
  // closed. Derived from the g-records, so superseded entries in the internal
  // pop arrays can never leak into a frame (and no duplicates survive concat).
  const emit = (current: NodeId): Step => {
    const closed = new Set<NodeId>([...closedF, ...closedB])
    const open = new Set<NodeId>()
    for (const n of Object.keys(gF)) if (!closedF.has(n) && !closedB.has(n)) open.add(n)
    for (const n of Object.keys(gB)) if (!closedF.has(n) && !closedB.has(n)) open.add(n)
    return { current, frontier: [...open], visited: [...closed] }
  }
  // generated = DISTINCT nodes ever discovered by either direction.
  const generatedCount = () => new Set([...Object.keys(gF), ...Object.keys(gB)]).size

  function expand(
    u: NodeId, gu: number,
    gSelf: Record<NodeId, number>, parSelf: Record<NodeId, NodeId | null>,
    closedSelf: Set<NodeId>, frontSelf: [number, number, NodeId][],
    gOther: Record<NodeId, number>,
    hTarget: NodeId,
    hPA: Record<NodeId, number>,
  ) {
    closedSelf.add(u)
    if (u in gOther) {
      const candidate = gu + gOther[u]
      if (candidate < mu) { mu = candidate; muNode = u }
    }
    for (const edge of ROMANIA[u].edges) {
      const ng = gu + edge.km
      if (ng < (gSelf[edge.to] ?? Infinity)) {
        const base = h(edge.to, hTarget)
        const hEff = Math.max(base, (hPA[u] ?? base) - edge.km) // pathmax along this tree
        gSelf[edge.to] = ng
        parSelf[edge.to] = u
        hPA[edge.to] = hEff
        // Kept for safety, but unreachable while h′ is consistent along the tree
        // (the pathmax above) — so a settled node stays settled (no re-open).
        closedSelf.delete(edge.to)
        frontSelf.push([ng + hEff, ng, edge.to])
      }
    }
  }

  while (frontF.length > 0 && frontB.length > 0) {
    if (Math.max(minF(frontF), minF(frontB)) >= mu) break

    const fe = popMin(frontF)
    if (fe) {
      const [, gf, u] = fe
      if (!closedF.has(u) && gf <= (gF[u] ?? Infinity)) {
        expand(u, gf, gF, parF, closedF, frontF, gB, goal, hPF)
      }
      steps.push(emit(u))
    }

    if (Math.max(minF(frontF), minF(frontB)) >= mu) break

    const be = popMin(frontB)
    if (be) {
      const [, gb, u] = be
      if (!closedB.has(u) && gb <= (gB[u] ?? Infinity)) {
        expand(u, gb, gB, parB, closedB, frontB, gF, start, hPB)
      }
      steps.push(emit(u))
    }
  }

  if (muNode === null) return { steps, parent, path: [], found: false, generated: generatedCount() }

  // Reconstruct: forward chain start→muNode, backward chain muNode→goal
  const fwd: NodeId[] = []
  let n: NodeId | null | undefined = muNode
  while (n != null) { fwd.unshift(n); n = parF[n] }

  const bwd: NodeId[] = []
  n = parB[muNode]
  while (n != null) { bwd.push(n); n = parB[n] }

  const path = [...fwd, ...bwd]

  for (const [node, par] of Object.entries(parF)) parent[node] = par
  for (const [node, par] of Object.entries(parB)) if (!(node in parent)) parent[node] = par

  // Landing frame. `current` is the meeting node (where the frontiers crossed),
  // not the goal — unlike BFS/DFS/UCS/A*, which land on the goal. Inert on screen:
  // nodeState paints every path node as 'path' on the final frame before it consults
  // `current`, and the meeting node is always on the path.
  steps.push({ ...emit(muNode), frontier: [] })
  return { steps, parent, path, found: true, generated: generatedCount() }
}

// ── self-check ───────────────────────────────────────────────────────────────

function selfCheck(): void {
  const r = biastar('Arad', 'Bucharest')
  if (!r.found) throw new Error('biastar self-check: Arad→Bucharest not found')
  const cost = r.path.reduce((acc, _, i) => {
    if (i === 0) return 0
    const edge = ROMANIA[r.path[i - 1]].edges.find(e => e.to === r.path[i])
    return acc + (edge?.km ?? Infinity)
  }, 0)
  if (cost !== 418) throw new Error(`biastar self-check: expected cost 418, got ${cost}`)

  const trivial = biastar('Arad', 'Arad')
  if (!trivial.found || trivial.path[0] !== 'Arad') throw new Error('biastar self-check: same-city case broken')
}

selfCheck()
