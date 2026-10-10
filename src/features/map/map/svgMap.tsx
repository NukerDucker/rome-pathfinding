// Map rendering for the modern UI: the SVG cartography (base roads, arcs, node
// discs, wood/planet surfaces) and the two mountings — per-lane `SVGMap` and the
// merged `MergedSVGMap`. Pure render: all state arrives as props.
import { useId, type CSSProperties, type ReactNode } from 'react'
import { CITIES, ROMANIA, cityCode, type NodeId } from '@/algorithms/romania'
import { ALGORITHMS, type Step, type SearchResult } from '@/algorithms/search'
import { planetFor, type PlanetInfo } from '@/theme'

type NodeState = 'unvisited' | 'frontier' | 'current' | 'visited' | 'path'
type EdgeState = 'base' | 'tree' | 'path'
type EdgePair = { a: NodeId; b: NodeId; km: number }
type EdgeView = EdgePair & { state: EdgeState }

// Map geometry (SVG user units, viewBox 600 300 2800 1900).
const NODE_R = 50
const LABEL_H = 65
const LABEL_RX = 18

// Elliptical-arc heuristic overlay — illustrative, shown for greedy/astar.
const ARC_BASE_BULGE = 0.02
const ARC_BULGE_SCALE = 0.07
const ARC_BULGE_CAP = 0.08

function mapArcGeometry(start: NodeId, goal: NodeId) {
  const ca = ROMANIA[start], cb = ROMANIA[goal]
  const dx = cb.x - ca.x, dy = cb.y - ca.y
  const chord = Math.hypot(dx, dy)
  if (chord === 0) return null
  const a = chord / 2, mx = ca.x + dx / 2, my = ca.y + dy / 2
  const ux = dx / chord, uy = dy / chord
  const bucharest = ROMANIA['Bucharest']
  const vx = bucharest.x - mx, vy = bucharest.y - my
  const dbuc = Math.hypot(vx, vy)
  const bf = Math.min(ARC_BASE_BULGE + ARC_BULGE_SCALE * dbuc / chord, ARC_BULGE_CAP)
  const b = chord * bf, wLen = dbuc || 1
  return { mx, my, a, b, ux, uy, wx: vx / wLen, wy: vy / wLen }
}

function renderArcEdges(start: NodeId, goal: NodeId) {
  const g = mapArcGeometry(start, goal)
  if (!g) return null
  const ca = ROMANIA[start], cb = ROMANIA[goal]
  let pts = ''
  const STEPS = 50
  for (let i = 0; i <= STEPS; i++) {
    const t = Math.PI * i / STEPS
    const ct = Math.cos(t), st = Math.sin(t)
    pts += (g.mx + g.a * ct * g.ux + g.b * st * g.wx) + ',' + (g.my + g.a * ct * g.uy + g.b * st * g.wy) + ' '
  }
  return [
    <line key="arc-chord" className="edge-arc-chord" x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} />,
    <polyline key="arc-curve" className="edge-arc" points={pts.trim()} />,
  ]
}

// Later states paint over earlier ones, so a road on the solution path wins.
const EDGE_ORDER: Record<EdgeState, number> = { base: 0, tree: 1, path: 2 }

const BASE_EDGES: EdgePair[] = buildBaseEdges()

function buildBaseEdges(): EdgePair[] {
  const seen = new Set<string>()
  const out: EdgePair[] = []
  for (const id of CITIES) {
    for (const edge of ROMANIA[id].edges) {
      const key = edgeKey(id, edge.to)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ a: id, b: edge.to, km: edge.km })
    }
  }
  return out
}

function edgeKey(a: NodeId, b: NodeId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function treeEdgeKeys(step: Step, parent: Record<NodeId, NodeId | null>, start: NodeId): Set<string> {
  const nodes = new Set<NodeId>([...step.visited, ...step.frontier, step.current])
  const keys = new Set<string>()
  for (const n of nodes) {
    if (n === start) continue
    const p = parent[n]
    if (p === undefined || p === null) continue
    keys.add(edgeKey(p, n))
  }
  return keys
}

function pathEdgeKeys(path: NodeId[]): Set<string> {
  const keys = new Set<string>()
  for (let i = 0; i < path.length - 1; i++) keys.add(edgeKey(path[i], path[i + 1]))
  return keys
}

function buildEdgeViews(
  step: Step | undefined,
  parent: Record<NodeId, NodeId | null>,
  start: NodeId,
  path: NodeId[],
  showPath: boolean,
): EdgeView[] {
  const tree = step ? treeEdgeKeys(step, parent, start) : new Set<string>()
  const onPath = showPath ? pathEdgeKeys(path) : new Set<string>()
  return BASE_EDGES.map((edge) => {
    const key = edgeKey(edge.a, edge.b)
    const state: EdgeState = onPath.has(key) ? 'path' : tree.has(key) ? 'tree' : 'base'
    return { ...edge, state }
  }).sort((x, y) => EDGE_ORDER[x.state] - EDGE_ORDER[y.state])
}

function labelWidth(km: number): number {
  return 60 + String(km).length * 27.5
}

function nodeState(node: NodeId, step: Step, isFinalFrame: boolean, found: boolean, path: NodeId[]): NodeState {
  if (isFinalFrame && found && path.includes(node)) return 'path'
  if (node === step.current) return 'current'
  if (step.frontier.includes(node)) return 'frontier'
  if (step.visited.includes(node)) return 'visited'
  return 'unvisited'
}
// ── D&D theme: wooden board-game tabletop ──────────────────────────────
// The map panel doubles as the table the graph sits on. Drawn as an in-SVG
// <pattern> (userSpaceOnUse) so the grain/seams stay locked to graph coordinates
// under `preserveAspectRatio="…meet"` letterboxing, and cost no image request.
// `ns` (from useId) keeps the defs unique per mounted map. Deterministic.
const WOOD_PANEL = { x: 625, y: 325, width: 2750, height: 1850, rx: 80 } as const

function WoodDefs({ ns }: { ns: string }) {
  return (
    <>
      <pattern
        id={`${ns}-wood`}
        x={WOOD_PANEL.x}
        y={WOOD_PANEL.y}
        width={1100}
        height={460}
        patternUnits="userSpaceOnUse"
        patternContentUnits="userSpaceOnUse"
      >
        <rect width={1100} height={460} fill="var(--map-bg)" />
        <rect width={1100} height={230} fill="#ffe0aa" opacity={0.045} />

        {/* Grain curves meet at the tile boundary, so the repeat is seamless. */}
        <g fill="none" stroke="#3e2418" strokeWidth={2} opacity={0.12}>
          <path d="M0 40 C180 40 240 66 440 48 S880 40 1100 40" />
          <path d="M0 92 C160 92 300 72 520 99 S900 92 1100 92" />
          <path d="M0 157 C240 157 280 181 550 163 S900 157 1100 157" />
          <path d="M0 205 C200 205 360 188 620 211 S930 205 1100 205" />
          <path d="M0 274 C190 274 300 300 510 281 S900 274 1100 274" />
          <path d="M0 333 C200 333 390 310 600 340 S920 333 1100 333" />
          <path d="M0 399 C210 399 320 420 580 405 S920 399 1100 399" />
          <path d="M0 439 C180 439 330 425 590 445 S940 439 1100 439" />
          <ellipse cx={740} cy={136} rx={75} ry={14} />
          <ellipse cx={740} cy={136} rx={39} ry={6} />
        </g>

        <g fill="none" stroke="#ffe6bc" strokeWidth={2} opacity={0.1}>
          <path d="M0 61 C200 61 360 82 600 65 S930 61 1100 61" />
          <path d="M0 184 C230 184 370 167 630 189 S950 184 1100 184" />
          <path d="M0 304 C190 304 350 325 610 309 S940 304 1100 304" />
          <path d="M0 422 C230 422 350 402 600 426 S950 422 1100 422" />
        </g>

        {/* Long planks with staggered end joints. */}
        <path d="M0 1 H1100 M0 231 H1100 M350 0 V230 M900 230 V460"
          fill="none" stroke="#352018" strokeWidth={4} opacity={0.32} />
        <path d="M0 5 H1100 M0 235 H1100 M354 5 V228 M904 235 V458"
          fill="none" stroke="#ffe1af" strokeWidth={2} opacity={0.14} />

        {/* Sparse worn varnish marks, not noise. */}
        <path d="M128 119 l83 -3 M165 126 l42 -2 M815 369 l112 4"
          fill="none" stroke="#ffe8c6" strokeWidth={2} strokeLinecap="round" opacity={0.12} />
      </pattern>

      <radialGradient id={`${ns}-varnish`} cx="43%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#ffe3b0" stopOpacity={0.1} />
        <stop offset="55%" stopColor="#ffe3b0" stopOpacity={0} />
        <stop offset="100%" stopColor="#24150e" stopOpacity={0.2} />
      </radialGradient>
    </>
  )
}

function WoodSurface({ ns }: { ns: string }) {
  return (
    <g className="map-wood" aria-hidden="true" pointerEvents="none">
      <rect {...WOOD_PANEL} fill={`url(#${ns}-wood)`} />
      <rect {...WOOD_PANEL} fill={`url(#${ns}-varnish)`} />
      <rect {...WOOD_PANEL} className="map-wood-rim" />
    </g>
  )
}

// ── Space theme: node planets ────────────────────────────────────────────
// The planet model itself lives in theme.tsx (shared with the cockpit window).
function PlanetDefs({ ns }: { ns: string }) {
  return (
    <>
      <radialGradient id={`${ns}shade`} cx="0.7" cy="0.72" r="0.72">
        <stop offset="35%" stopColor="rgba(2,6,16,0)" />
        <stop offset="100%" stopColor="rgba(2,6,16,0.82)" />
      </radialGradient>
      {CITIES.flatMap((city) => {
        const p = planetFor(city, ns)
        const c = ROMANIA[city]
        return [
          <radialGradient key={`${city}-g`} id={p.id} cx="0.36" cy="0.3" r="0.75">
            <stop offset="0%" stopColor={p.light} />
            <stop offset="46%" stopColor={p.mid} />
            <stop offset="100%" stopColor={p.deep} />
          </radialGradient>,
          <clipPath key={`${city}-c`} id={p.clipId}>
            <circle cx={c.x} cy={c.y} r={NODE_R} />
          </clipPath>,
        ]
      })}
    </>
  )
}

// Surface detail for a node planet — bands, craters or continents picked from
// the city hash, so a given city always looks the same (never changes as the
// search navigates). Clipped to the node circle.
function planetSurface(coord: { x: number; y: number }, p: PlanetInfo, shadeId: string): ReactNode {
  const { x, y } = coord
  const r = NODE_R
  const s = (fill: string, opacity?: number): CSSProperties => ({ fill, stroke: 'none', opacity })
  return (
    <g className="node-surface" clipPath={`url(#${p.clipId})`} style={{ pointerEvents: 'none' }}>
      {p.pattern === 'bands' ? (
        <g style={{ opacity: 0.5 }}>
          <ellipse cx={x} cy={y - r * 0.52} rx={r} ry={r * 0.14} style={s(p.light)} />
          <ellipse cx={x} cy={y - r * 0.12} rx={r} ry={r * 0.12} style={s(p.deep)} />
          <ellipse cx={x} cy={y + r * 0.3} rx={r} ry={r * 0.16} style={s(p.light, 0.8)} />
          <ellipse cx={x} cy={y + r * 0.64} rx={r} ry={r * 0.12} style={s(p.deep)} />
        </g>
      ) : p.pattern === 'craters' ? (
        <g style={{ opacity: 0.5 }}>
          <circle cx={x - r * 0.3} cy={y - r * 0.25} r={r * 0.22} style={s(p.deep)} />
          <circle cx={x + r * 0.25} cy={y + r * 0.22} r={r * 0.28} style={s(p.deep)} />
          <circle cx={x + r * 0.34} cy={y - r * 0.34} r={r * 0.16} style={s(p.deep)} />
        </g>
      ) : p.pattern === 'cracks' ? (
        <g style={{ opacity: 0.6 }}>
          <path d={`M${x - r} ${y} L${x - r * 0.2} ${y - r * 0.2} L${x + r * 0.3} ${y + r * 0.1} L${x + r} ${y - r * 0.1}`} fill="none" style={{ stroke: p.deep, strokeWidth: r * 0.16, strokeLinecap: 'round' }} />
          <path d={`M${x - r * 0.5} ${y - r * 0.5} L${x} ${y - r * 0.1} L${x + r * 0.5} ${y - r * 0.55}`} fill="none" style={{ stroke: p.deep, strokeWidth: r * 0.12, strokeLinecap: 'round' }} />
        </g>
      ) : (
        <g style={{ opacity: 0.6 }}>
          <ellipse cx={x - r * 0.18} cy={y - r * 0.14} rx={r * 0.5} ry={r * 0.3} transform={`rotate(-16 ${x} ${y})`} style={s(p.light)} />
          <ellipse cx={x + r * 0.28} cy={y + r * 0.3} rx={r * 0.38} ry={r * 0.22} transform={`rotate(14 ${x} ${y})`} style={s(p.light)} />
        </g>
      )}
      <circle cx={x} cy={y} r={r} style={s(`url(#${shadeId})`)} />
      <ellipse cx={x - r * 0.32} cy={y - r * 0.34} rx={r * 0.3} ry={r * 0.19} transform={`rotate(-28 ${x} ${y})`} style={s('rgba(255,255,255,0.22)')} />
    </g>
  )
}

type SVGMapParams = {
  algoKey: string
  stepIdx: number
  lastIdx: number
  result: SearchResult
  hoveredCity: NodeId | null
  start: NodeId
  goal: NodeId
  showLine: boolean
  heatmapValues?: Record<NodeId, number>
  landmarks?: readonly NodeId[]
  onCityClick?: (city: NodeId) => void
  pickLandmarkMode?: boolean
  showMapBg?: boolean
  spaceTheme?: boolean
}

export function SVGMap({ algoKey, stepIdx, lastIdx, result, hoveredCity, start, goal, showLine, heatmapValues, landmarks, onCityClick, pickLandmarkMode, showMapBg, spaceTheme }: SVGMapParams) {
  const planetNs = useId().replace(/:/g, '')
  const step: Step = result.steps[Math.min(stepIdx, lastIdx)]
  const isFinalFrame: boolean = stepIdx >= lastIdx
  const edgeViews: EdgeView[] = buildEdgeViews(
    step, result.parent, start, result.path, isFinalFrame && result.found,
  )

  return (
    <svg
      className="map"
      width="2800"
      height="1900"
      viewBox="600 300 2800 1900"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Romania road map — ${ALGORITHMS[algoKey]?.label ?? algoKey} visualizer`}
    >
      <defs>
        {spaceTheme && <PlanetDefs ns={planetNs} />}
        {showMapBg && <WoodDefs ns={planetNs} />}
      </defs>

      <rect className="map-bg" x={625} y={325} width={2750} height={1850} rx={80} />
      {showMapBg && <WoodSurface ns={planetNs} />}

      {edgeViews.map((edge) => (
        <line
          key={`road-${edge.a}-${edge.b}`}
          className={`edge edge-${edge.state}`}
          x1={ROMANIA[edge.a].x} y1={ROMANIA[edge.a].y}
          x2={ROMANIA[edge.b].x} y2={ROMANIA[edge.b].y}
        />
      ))}

      {showLine && renderArcEdges(start, goal)}

      {edgeViews.map((edge) => {
        const mx = (ROMANIA[edge.a].x + ROMANIA[edge.b].x) / 2
        const my = (ROMANIA[edge.a].y + ROMANIA[edge.b].y) / 2
        const w = labelWidth(edge.km)
        return (
          <g key={`km-${edge.a}-${edge.b}`} className={`edge-label edge-label-${edge.state}`}>
            <rect x={mx - w / 2} y={my - LABEL_H / 2} width={w} height={LABEL_H} rx={LABEL_RX} />
            <text x={mx} y={my} dominantBaseline="central">{edge.km}</text>
          </g>
        )
      })}

      {/* Heatmap layer — separate from .node groups so .node-state circle CSS rules don't override fill */}
      {heatmapValues && (
        <g className="heatmap-layer" style={{ pointerEvents: 'none' }}>
          {CITIES.map((city) => {
            const norm = heatmapValues[city]
            if (norm === undefined) return null
            const coord = ROMANIA[city]
            return (
              <circle
                key={`heat-${city}`}
                cx={coord.x} cy={coord.y}
                r={NODE_R + 14}
                style={{ fill: 'var(--marker-goal)', fillOpacity: 0.85 - 0.77 * norm }}
              />
            )
          })}
        </g>
      )}

      {CITIES.map((city) => {
        const state = step ? nodeState(city, step, isFinalFrame, result.found, result.path) : 'unvisited'
        const coord = ROMANIA[city]
        const isHovered = city === hoveredCity
        const isStart = city === start && !isFinalFrame
        const isGoal = city === goal && !isFinalFrame
        const isLandmark = landmarks?.includes(city) ?? false
        const planet = spaceTheme ? planetFor(city, planetNs) : null
        return (
          <g
            key={city}
            className={`node node-${state}${spaceTheme ? ' node-space' : ''}${isHovered ? ' node-hover' : ''}${pickLandmarkMode ? ' node-clickable' : ''}`}
            onClick={() => onCityClick?.(city)}
          >
            <title>{city}{isLandmark ? ' ★ landmark' : ''}</title>
            {isHovered && <circle className="node-glow" cx={coord.x} cy={coord.y} r={NODE_R} />}
            {isStart && <circle className="marker-ring marker-start" cx={coord.x} cy={coord.y} r={60} />}
            {isGoal && <circle className="marker-ring marker-goal" cx={coord.x} cy={coord.y} r={60} />}
            {isLandmark && <circle className="marker-ring marker-landmark" cx={coord.x} cy={coord.y} r={70} />}
            {planet?.ring && (
              <ellipse className="node-orbit" cx={coord.x} cy={coord.y} rx={NODE_R + 24} ry={NODE_R * 0.45}
                transform={`rotate(${planet.ringRot} ${coord.x} ${coord.y})`} />
            )}
            <circle className="node-disc" cx={coord.x} cy={coord.y} r={NODE_R}
              style={planet ? ({ ['--planet']: `url(#${planet.id})` } as CSSProperties) : undefined} />
            {planet && planetSurface(coord, planet, `${planetNs}shade`)}
            <text x={coord.x} y={coord.y} dominantBaseline="central">{cityCode(city)}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Merged single-map view ──────────────────────────────────────────────────
// Both lanes share one map. Every road is drawn as two parallel strands split
// down the middle (left strand = lane A, right strand = lane B); each node disc
// is split vertically the same way; landmark rings show a coloured half for each
// lane that selected the city. Reads two algorithms' progress on one picture.
const MROAD_W = 15
const MROAD_OFF = 9
const MROAD_SEAM = 4
const MCLIP_R = 80

function mergedEdgeClass(lane: 'a' | 'b', state: EdgeState): string {
  if (state === 'base') return 'mroad mroad-base'
  return `mroad mroad-${lane}-${state}`
}

type MergedMapParams = {
  stepIdx: number
  lastIdx: number
  lastIdx2: number
  result: SearchResult
  result2: SearchResult
  hoveredCity: NodeId | null
  start: NodeId
  goal: NodeId
  showLine: boolean
  heatA?: Record<NodeId, number>
  heatB?: Record<NodeId, number>
  landmarksA?: readonly NodeId[]
  landmarksB?: readonly NodeId[]
  onCityClick?: (city: NodeId) => void
  pickLandmarkMode?: boolean
  showMapBg?: boolean
  spaceTheme?: boolean
}

export function MergedSVGMap({
  stepIdx, lastIdx, lastIdx2, result, result2, hoveredCity, start, goal,
  showLine, heatA, heatB, landmarksA, landmarksB, onCityClick, pickLandmarkMode, showMapBg, spaceTheme,
}: MergedMapParams) {
  const planetNs = useId().replace(/:/g, '')
  const stepA: Step | undefined = result.steps[Math.min(stepIdx, lastIdx)]
  const stepB: Step | undefined = result2.steps[Math.min(stepIdx, lastIdx2)]
  const finalA: boolean = stepIdx >= lastIdx
  const finalB: boolean = stepIdx >= lastIdx2
  const stateA = new Map<string, EdgeState>(
    buildEdgeViews(stepA, result.parent, start, result.path, finalA && result.found)
      .map((e) => [edgeKey(e.a, e.b), e.state] as [string, EdgeState]),
  )
  const stateB = new Map<string, EdgeState>(
    buildEdgeViews(stepB, result2.parent, start, result2.path, finalB && result2.found)
      .map((e) => [edgeKey(e.a, e.b), e.state] as [string, EdgeState]),
  )
  const searching = !(finalA && finalB)

  return (
    <svg
      className="map"
      width="2800"
      height="1900"
      viewBox="600 300 2800 1900"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Merged Romania road map — lane A vs lane B"
    >
      <defs>
        {spaceTheme && <PlanetDefs ns={planetNs} />}
        {showMapBg && <WoodDefs ns={planetNs} />}
        {CITIES.map((city) => {
          const code = cityCode(city)
          const c = ROMANIA[city]
          return (
            <g key={`mclip-${city}`}>
              <clipPath id={`mclipL-${code}`}>
                <rect x={c.x - MCLIP_R} y={c.y - MCLIP_R} width={MCLIP_R} height={MCLIP_R * 2} />
              </clipPath>
              <clipPath id={`mclipR-${code}`}>
                <rect x={c.x} y={c.y - MCLIP_R} width={MCLIP_R} height={MCLIP_R * 2} />
              </clipPath>
            </g>
          )
        })}
      </defs>

      <rect className="map-bg" x={625} y={325} width={2750} height={1850} rx={80} />
      {showMapBg && <WoodSurface ns={planetNs} />}

      {/* Roads — two parallel strands, split down the middle */}
      {BASE_EDGES.map((edge) => {
        const a = ROMANIA[edge.a], b = ROMANIA[edge.b]
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const ux = -dy / len, uy = dx / len
        const key = edgeKey(edge.a, edge.b)
        const sA = stateA.get(key) ?? 'base'
        const sB = stateB.get(key) ?? 'base'
        return (
          <g key={`mroad-${edge.a}-${edge.b}`}>
            <line className={mergedEdgeClass('a', sA)} strokeWidth={MROAD_W}
              x1={a.x + ux * MROAD_OFF} y1={a.y + uy * MROAD_OFF}
              x2={b.x + ux * MROAD_OFF} y2={b.y + uy * MROAD_OFF} />
            <line className={mergedEdgeClass('b', sB)} strokeWidth={MROAD_W}
              x1={a.x - ux * MROAD_OFF} y1={a.y - uy * MROAD_OFF}
              x2={b.x - ux * MROAD_OFF} y2={b.y - uy * MROAD_OFF} />
          </g>
        )
      })}

      {/* Centre seam — drawn over every road so the split reads even when both
          halves are the neutral “base” colour */}
      {BASE_EDGES.map((edge) => {
        const a = ROMANIA[edge.a], b = ROMANIA[edge.b]
        return (
          <line key={`mseam-${edge.a}-${edge.b}`} className="mroad-seam"
            strokeWidth={MROAD_SEAM}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        )
      })}

      {showLine && renderArcEdges(start, goal)}

      {/* km pills — tinted by the “busier” of the two lanes' states */}
      {BASE_EDGES.map((edge) => {
        const mx = (ROMANIA[edge.a].x + ROMANIA[edge.b].x) / 2
        const my = (ROMANIA[edge.a].y + ROMANIA[edge.b].y) / 2
        const w = labelWidth(edge.km)
        const key = edgeKey(edge.a, edge.b)
        const sA = stateA.get(key) ?? 'base'
        const sB = stateB.get(key) ?? 'base'
        const labelState: EdgeState = (sA === 'path' || sB === 'path') ? 'path'
          : (sA === 'tree' || sB === 'tree') ? 'tree' : 'base'
        return (
          <g key={`mlabel-${edge.a}-${edge.b}`} className={`edge-label edge-label-${labelState}`}>
            <rect x={mx - w / 2} y={my - LABEL_H / 2} width={w} height={LABEL_H} rx={LABEL_RX} />
            <text x={mx} y={my} dominantBaseline="central">{edge.km}</text>
          </g>
        )
      })}

      {/* Heatmap — split vertically: left = lane A, right = lane B */}
      {(heatA || heatB) && (
        <g className="heatmap-layer" style={{ pointerEvents: 'none' }}>
          {CITIES.map((city) => {
            const c = ROMANIA[city]
            const code = cityCode(city)
            const nA = heatA?.[city]
            const nB = heatB?.[city]
            return (
              <g key={`mheat-${city}`}>
                {nA !== undefined && (
                  <g clipPath={`url(#mclipL-${code})`}>
                    <circle cx={c.x} cy={c.y} r={NODE_R + 14} style={{ fill: 'var(--marker-goal)', fillOpacity: 0.85 - 0.77 * nA }} />
                  </g>
                )}
                {nB !== undefined && (
                  <g clipPath={`url(#mclipR-${code})`}>
                    <circle cx={c.x} cy={c.y} r={NODE_R + 14} style={{ fill: 'var(--marker-goal)', fillOpacity: 0.85 - 0.77 * nB }} />
                  </g>
                )}
              </g>
            )
          })}
        </g>
      )}

      {/* Nodes — split vertically: left half lane A, right half lane B */}
      {CITIES.map((city) => {
        const coord = ROMANIA[city]
        const code = cityCode(city)
        const cA = stepA ? nodeState(city, stepA, finalA, result.found, result.path) : 'unvisited'
        const cB = stepB ? nodeState(city, stepB, finalB, result2.found, result2.path) : 'unvisited'
        const planet = spaceTheme ? planetFor(city, planetNs) : null
        const isHovered = city === hoveredCity
        const isStart = city === start && searching
        const isGoal = city === goal && searching
        const lmInA = landmarksA?.includes(city) ?? false
        const lmInB = landmarksB?.includes(city) ?? false
        return (
          <g
            key={city}
            className={`node-split${isHovered ? ' node-hover' : ''}${pickLandmarkMode ? ' node-clickable' : ''}`}
            onClick={() => onCityClick?.(city)}
          >
            <title>{city}{lmInA || lmInB ? ' ★ landmark' : ''}</title>
            {isStart && <circle className="marker-ring marker-start" cx={coord.x} cy={coord.y} r={60} />}
            {isGoal && <circle className="marker-ring marker-goal" cx={coord.x} cy={coord.y} r={60} />}
            {lmInA && (
              <g clipPath={`url(#mclipL-${code})`}>
                <circle className="marker-ring marker-lm-a" cx={coord.x} cy={coord.y} r={70} />
              </g>
            )}
            {lmInB && (
              <g clipPath={`url(#mclipR-${code})`}>
                <circle className="marker-ring marker-lm-b" cx={coord.x} cy={coord.y} r={70} />
              </g>
            )}
            <g clipPath={`url(#mclipL-${code})`} className={`mhalf node node-${cA}${spaceTheme ? ' node-space' : ''}`}>
              <circle className="node-disc" cx={coord.x} cy={coord.y} r={NODE_R}
                style={planet ? ({ ['--planet']: `url(#${planet.id})` } as CSSProperties) : undefined} />
              {planet && planetSurface(coord, planet, `${planetNs}shade`)}
              <text x={coord.x} y={coord.y} dominantBaseline="central">{code}</text>
            </g>
            <g clipPath={`url(#mclipR-${code})`} className={`mhalf node node-${cB}${spaceTheme ? ' node-space' : ''}`}>
              <circle className="node-disc" cx={coord.x} cy={coord.y} r={NODE_R}
                style={planet ? ({ ['--planet']: `url(#${planet.id})` } as CSSProperties) : undefined} />
              {planet && planetSurface(coord, planet, `${planetNs}shade`)}
              <text x={coord.x} y={coord.y} dominantBaseline="central">{code}</text>
            </g>
            {stepA && stepA.current === city && !finalA && (
              <g clipPath={`url(#mclipL-${code})`}>
                <circle key={`pa-${stepIdx}`} className="cur-ping" style={{ stroke: 'var(--map-accent)' }} cx={coord.x} cy={coord.y} r={NODE_R} />
              </g>
            )}
            {stepB && stepB.current === city && !finalB && (
              <g clipPath={`url(#mclipR-${code})`}>
                <circle key={`pb-${stepIdx}`} className="cur-ping" style={{ stroke: 'var(--lane-b)' }} cx={coord.x} cy={coord.y} r={NODE_R} />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// Subscribe a component to a CSS media query. Used to pick the comparison-table
