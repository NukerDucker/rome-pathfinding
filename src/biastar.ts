import { ROMANIA, type NodeId } from './romania'
import { type SearchResult, type Step } from './search'
import { h } from './heuristic'

// ============================================================================
// Bidirectional A* with LP+ALT heuristic
// ============================================================================
// Forward:  f(n) = g_f(n) + h(n, goal)
// Backward: f(n) = g_b(n) + h(n, start)   [Romania is undirected → h symmetric]
//
// Stopping (Pohl 1971): halt when
//   min_f(forward_frontier) + min_f(backward_frontier) ≥ μ
// where μ = best complete path cost seen so far.
// Optimal because any undiscovered path must cost ≥ the frontier lower bound.

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
      steps: [{ current: start, frontier: [], visited: [] }],
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
  const frontF: [number, number, NodeId][] = [[h(start, goal), 0, start]]

  // Backward
  const gB: Record<NodeId, number> = { [goal]: 0 }
  const parB: Record<NodeId, NodeId | null> = { [goal]: null }
  const closedB = new Set<NodeId>()
  const frontB: [number, number, NodeId][] = [[h(goal, start), 0, goal]]

  let mu = Infinity
  let muNode: NodeId | null = null
  const steps: Step[] = []
  let generated = 2

  function expand(
    u: NodeId, gu: number,
    gSelf: Record<NodeId, number>, parSelf: Record<NodeId, NodeId | null>,
    closedSelf: Set<NodeId>, frontSelf: [number, number, NodeId][],
    gOther: Record<NodeId, number>,
    hTarget: NodeId,
  ) {
    closedSelf.add(u)
    if (u in gOther) {
      const candidate = gu + gOther[u]
      if (candidate < mu) { mu = candidate; muNode = u }
    }
    for (const edge of ROMANIA[u].edges) {
      const ng = gu + edge.km
      if (ng < (gSelf[edge.to] ?? Infinity)) {
        gSelf[edge.to] = ng
        parSelf[edge.to] = u
        if (!closedSelf.has(edge.to)) {
          frontSelf.push([ng + h(edge.to, hTarget), ng, edge.to])
          generated++
        }
      }
    }
  }

  while (frontF.length > 0 && frontB.length > 0) {
    if (minF(frontF) + minF(frontB) >= mu) break

    const fe = popMin(frontF)
    if (fe) {
      const [, gf, u] = fe
      if (!closedF.has(u) && gf <= (gF[u] ?? Infinity)) {
        expand(u, gf, gF, parF, closedF, frontF, gB, goal)
      }
      steps.push({
        current: u,
        frontier: [...frontF.map(e => e[2]), ...frontB.map(e => e[2])],
        visited: [...closedF, ...closedB],
      })
    }

    if (minF(frontF) + minF(frontB) >= mu) break

    const be = popMin(frontB)
    if (be) {
      const [, gb, u] = be
      if (!closedB.has(u) && gb <= (gB[u] ?? Infinity)) {
        expand(u, gb, gB, parB, closedB, frontB, gF, start)
      }
      steps.push({
        current: u,
        frontier: [...frontF.map(e => e[2]), ...frontB.map(e => e[2])],
        visited: [...closedF, ...closedB],
      })
    }
  }

  if (muNode === null) return { steps, parent, path: [], found: false, generated }

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

  steps.push({ current: muNode, frontier: [], visited: [...closedF, ...closedB] })
  return { steps, parent, path, found: true, generated }
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
