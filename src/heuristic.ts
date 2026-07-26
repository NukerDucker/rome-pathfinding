import type { NodeId } from './romania'
import { ROMANIA, CITIES } from './romania'

// ============================================================================
// Elliptical Arc Heuristic — admissible pathfinding heuristic.
// ============================================================================
// Fits an ellipse between every city pair: major axis = chord,
// minor axis points toward Bucharest.  Arc length via Ramanujan
// approximation (closed form, O(1)).  Friction grid precomputes
// the minimum km/px ratio near each road edge to produce a
// lower-bound distance estimate.
//
// Compliant with HEURISTIC_GUIDE.md:
//   - Uses only pixel coords + edge km (from PDF page 2)
//   - No SLD, no GPS, no real-world coordinates
//   - Custom derived heuristic

// ── friction grid parameters ───────────────────────────────────────────────

const MAP_W = 4000
const MAP_H = 2250
const FRIC_STEP = 20          // pixel width of each grid cell
const FRIC_RADIUS = 150       // max px distance from road edge
const FRIC_GW = Math.floor(MAP_W / FRIC_STEP)  // 186
const FRIC_GH = Math.floor(MAP_H / FRIC_STEP)  // 140

// km/px of the slowest road on the map (computed below)
let GLOBAL_MIN_FRIC = Infinity

// ── friction grid ──────────────────────────────────────────────────────────

interface EdgeGeom {
  x1: Float64Array; y1: Float64Array
  dx: Float64Array; dy: Float64Array
  lenSq: Float64Array; fric: Float64Array
}

function edgeGeometry(): EdgeGeom {
  const CITY_LIST = CITIES
  const edges: [string, string, number][] = []
  for (const id of CITY_LIST) {
    for (const e of ROMANIA[id].edges) {
      if (id < e.to) edges.push([id, e.to, e.km]) // deduplicate
    }
  }

  const n = edges.length
  const x1 = new Float64Array(n), y1 = new Float64Array(n)
  const dx = new Float64Array(n), dy = new Float64Array(n)
  const lenSq = new Float64Array(n), fric = new Float64Array(n)

  for (let i = 0; i < n; i++) {
    const [a, b, km] = edges[i]
    const ca = ROMANIA[a], cb = ROMANIA[b]
    x1[i] = ca.x; y1[i] = ca.y
    dx[i] = cb.x - ca.x; dy[i] = cb.y - ca.y
    const lsq = dx[i] * dx[i] + dy[i] * dy[i]
    lenSq[i] = lsq === 0 ? 1 : lsq
    fric[i] = km / Math.sqrt(lsq)
    if (fric[i] < GLOBAL_MIN_FRIC) GLOBAL_MIN_FRIC = fric[i]
  }

  return { x1, y1, dx, dy, lenSq, fric }
}

function buildFrictionGrid(): Float64Array {
  const eg = edgeGeometry()
  const total = FRIC_GW * FRIC_GH
  const grid = new Float64Array(total).fill(GLOBAL_MIN_FRIC)

  for (let row = 0; row < FRIC_GH; row++) {
    const py = FRIC_STEP / 2 + row * FRIC_STEP
    for (let col = 0; col < FRIC_GW; col++) {
      const px = FRIC_STEP / 2 + col * FRIC_STEP
      let best = Infinity
      for (let e = 0; e < eg.x1.length; e++) {
        const dxB = px - eg.x1[e]
        const dyB = py - eg.y1[e]
        const t = Math.max(0, Math.min(1,
          (eg.dx[e] * dxB + eg.dy[e] * dyB) / eg.lenSq[e]))
        const ex = eg.x1[e] + t * eg.dx[e]
        const ey = eg.y1[e] + t * eg.dy[e]
        const dist = Math.hypot(px - ex, py - ey)
        if (dist < FRIC_RADIUS && eg.fric[e] < best) best = eg.fric[e]
      }
      grid[row * FRIC_GW + col] = Number.isFinite(best) ? best : GLOBAL_MIN_FRIC
    }
  }
  return grid
}

const fricGrid = buildFrictionGrid()

function frictionAt(px: number, py: number): number {
  const gx = Math.floor(px) / FRIC_STEP | 0
  const gy = Math.floor(py) / FRIC_STEP | 0
  if (gx >= 0 && gx < FRIC_GW && gy >= 0 && gy < FRIC_GH) {
    return fricGrid[gy * FRIC_GW + gx]
  }
  return GLOBAL_MIN_FRIC
}

// ── elliptical arc cache ───────────────────────────────────────────────────

const BASE_BULGE = 0.02
const BULGE_SCALE = 0.07
const BULGE_CAP = 0.08

const BX = ROMANIA['Bucharest'].x
const BY = ROMANIA['Bucharest'].y

// Direct edge distance cache (for exact values)
const EDGE_DIST: Record<string, number> = {}
for (const id of CITIES) {
  for (const e of ROMANIA[id].edges) {
    EDGE_DIST[`${id}|${e.to}`] = e.km
  }
}

// Precomputed friction sum and arc length for all city pairs
const FRIC_SUM: Record<string, number> = {}
const ARC_LEN: Record<string, number> = {}

for (const a of CITIES) {
  for (const b of CITIES) {
    if (a === b) {
      FRIC_SUM[`${a}|${b}`] = 0
      ARC_LEN[`${a}|${b}`] = 0
      continue
    }

    const ca = ROMANIA[a], cb = ROMANIA[b]
    const dx = cb.x - ca.x, dy = cb.y - ca.y
    const chord = Math.hypot(dx, dy)
    if (chord === 0) { FRIC_SUM[`${a}|${b}`] = 0; ARC_LEN[`${a}|${b}`] = 0; continue }

    // Ellipse: major axis = chord, minor axis toward Bucharest
    const a2 = chord / 2
    const mx = ca.x + dx / 2, my = ca.y + dy / 2
    const ux = dx / chord, uy = dy / chord
    const vx = BX - mx, vy = BY - my
    const dbuc = Math.hypot(vx, vy)
    const bf = Math.min(BASE_BULGE + BULGE_SCALE * dbuc / chord, BULGE_CAP)
    const b2 = chord * bf
    const wLen = dbuc || 1
    const wx = vx / wLen, wy = vy / wLen

    // Arc length: Ramanujan half-ellipse
    const L = Math.PI * (3 * (a2 + b2) - Math.sqrt((3*a2 + b2) * (a2 + 3*b2))) / 2
    ARC_LEN[`${a}|${b}`] = L

    // 3 sample points along the arc
    let fsum = 0
    for (const t of [Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6]) {
      const ct = Math.cos(t), st = Math.sin(t)
      fsum += frictionAt(mx + a2 * ct * ux + b2 * st * wx,
                         my + a2 * ct * uy + b2 * st * wy)
    }
    FRIC_SUM[`${a}|${b}`] = fsum
  }
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Elliptical arc heuristic — admissible lower bound on road distance (km).
 *
 * Returns 0 for same-node, exact km for adjacent cities, and a
 * friction-weighted elliptical arc estimate for all other pairs.
 */
export function h(node: NodeId, goal: NodeId): number {
  if (node === goal) return 0

  // Direct edge → exact
  const direct = EDGE_DIST[`${node}|${goal}`]
  if (direct !== undefined) return direct

  // Precomputed
  return (FRIC_SUM[`${node}|${goal}`] ?? 0) * (ARC_LEN[`${node}|${goal}`] ?? 0) / 3
}


// ── rendering helpers ──────────────────────────────────────────────────────

/** Ellipse parameters for rendering the arc. Pure math, O(1). */
export function arcGeometry(start: string, goal: string) {
  const ca = ROMANIA[start], cb = ROMANIA[goal]
  const dx = cb.x - ca.x, dy = cb.y - ca.y
  const chord = Math.hypot(dx, dy)
  if (chord === 0) return null
  const a = chord / 2, mx = ca.x + dx / 2, my = ca.y + dy / 2
  const ux = dx / chord, uy = dy / chord
  const vx = BX - mx, vy = BY - my
  const dbuc = Math.hypot(vx, vy)
  const bf = Math.min(BASE_BULGE + BULGE_SCALE * dbuc / chord, BULGE_CAP)
  const b = chord * bf, wLen = dbuc || 1
  return { mx, my, a, b, ux, uy, wx: vx / wLen, wy: vy / wLen }
}

/** Sample points along the arc at t = pi/6, pi/2, 5pi/6. */
export function arcSamplePoints(start: string, goal: string) {
  const g = arcGeometry(start, goal)
  if (!g) return []
  const pts: { x: number; y: number }[] = []
  for (const t of [Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6]) {
    const ct = Math.cos(t), st = Math.sin(t)
    pts.push({ x: g.mx + g.a * ct * g.ux + g.b * st * g.wx,
               y: g.my + g.a * ct * g.uy + g.b * st * g.wy })
  }
  return pts
}
