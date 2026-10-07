import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Columns2, Dices, MapPin, Moon, Pause, Play, RotateCcw, Sparkles, Sun, Thermometer, X } from 'lucide-react'
import { CITIES, ROMANIA, cityCode, type NodeId } from './romania'
import { ALGORITHMS, pathCost, type Step, type AlgoMeta, type SearchResult } from './search'
import {
  setALTPreset,
  setCustomLandmarks, saveALTState, restoreALTState,
  altHWith,
  type LandmarkPreset,
} from './heuristic'
import { LANDMARK_PRESETS } from './alt'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Guide } from '@/components/Guide'
import { Tex } from '@/components/Tex'
import './App.css'

const ALGO_FOOTNOTES: Record<string, string> = {
  bfs: 'Yes* = only when step costs are equal.',
  dfs: 'No* = only if the branching factor b is finite (visited set stops cycles).',
  greedy: 'Not optimal; complete only if b is finite.',
  astar: 'Optimal while the LP heuristic is admissible; complete if b is finite.',
  astaraltonly: 'Optimal (admissible ALT heuristic); complete if b is finite.',
  ucs: 'Optimal & complete for non-negative costs.',
  biucs: 'Optimal & complete for non-negative costs — bidirectional.',
}

// Which ALT landmark-count presets a lane can select. Independent per lane.
type LandmarkCount = 'lm2' | 'lm4' | 'lm8'
const LM_OPTIONS: { value: LandmarkCount; label: string }[] = [
  { value: 'lm2', label: '2' },
  { value: 'lm4', label: '4' },
  { value: 'lm8', label: '8' },
]
const LM_SHORT: Record<LandmarkCount, string> = { lm2: '2', lm4: '4', lm8: '8' }

// Resolve the landmark cities a lane should draw on its map. Drawn when the
// algorithm uses landmarks (its heuristic is driven by them) OR when the user
// explicitly opted in to the overlay for a non-landmark algorithm. Either way
// the drawn set is the lane's custom picks if present, else the preset.
function laneLandmarkCities(
  usesLandmarks: boolean | undefined,
  overlay: boolean,
  count: LandmarkCount,
  custom: NodeId[],
): readonly NodeId[] | undefined {
  if (!usesLandmarks && !overlay) return undefined
  return custom.length > 0 ? custom : LANDMARK_PRESETS[count]
}

// Typeset a LaTeX expression inline (span element). The time/space complexity
// strings in search.ts are already LaTeX, so they are passed straight through.
// Row-name suffix describing which landmark config a lane runs with.
function laneLmSuffix(
  usesLandmarks: boolean | undefined,
  count: LandmarkCount,
  custom: NodeId[],
): string {
  if (!usesLandmarks) return ''
  return custom.length > 0 ? ` · Custom (${custom.length})` : ` · ${LM_SHORT[count]} Landmark`
}

type LandmarkPickerProps = {
  lane: string
  usesLandmarks: boolean | undefined
  overlay: boolean
  setOverlay: (v: boolean) => void
  count: LandmarkCount
  onCount: (v: LandmarkCount) => void
  customCount: number
  onClearCustom: () => void
}

// Per-lane landmark controls in the query bar. Landmark algorithms always show
// their active set (preset count or a click-picked custom set). Non-landmark
// algorithms get an opt-in overlay toggle so the user can display landmarks for
// context without changing the algorithm's own behavior.
function LandmarkPicker(props: LandmarkPickerProps) {
  const { lane, usesLandmarks, overlay, setOverlay, count, onCount, customCount, onClearCustom } = props
  const active = usesLandmarks || overlay
  if (!active) {
    return (
      <button
        className="lm-toggle"
        title={`Show landmark overlay for ${lane} (visual only — algorithm unchanged)`}
        onClick={() => setOverlay(true)}
      ><Sparkles size={12} aria-hidden="true" /> Landmarks</button>
    )
  }
  return (
    <div className="query-lm">
      {customCount > 0 ? (
        <button
          className="query-lm-custom"
          title={`Custom landmarks active (${customCount}). Click to clear and return to the preset.`}
          onClick={onClearCustom}
        ><MapPin size={12} aria-hidden="true" /> Custom ({customCount})</button>
      ) : (
        <>
          <Select value={count} onValueChange={(v) => v && onCount(v as LandmarkCount)}>
            <SelectTrigger className="w-16" aria-label={`Landmark count for ${lane}`}>
              <SelectValue>{LM_SHORT[count]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="query-word query-word-lm">LM</span>
        </>
      )}
      {!usesLandmarks && (
        <button
          className="query-lm-off"
          aria-label={`Hide landmark overlay for ${lane}`}
          title="Hide landmark overlay"
          onClick={() => setOverlay(false)}
        ><X size={12} aria-hidden="true" /></button>
      )}
    </div>
  )
}

// Algorithm options in alphabetical order (by display label) for the selects.
const ALGO_OPTIONS: [string, (typeof ALGORITHMS)[string]][] = Object.entries(ALGORITHMS)
  .sort(([, a], [, b]) => a.label.localeCompare(b.label))

// Fixed pixel widths for the wide comparison table's columns. Columns keep a
// constant size (so they never reflow while live step values change); the table
// is allowed to be wider than the viewport and scrolls horizontally instead of
// clipping or shrinking cells.
const ALGO_COL_PX = 190
const DEFAULT_COL_PX = 90
const COL_PX: Record<string, number> = {
  Step: 96,
  Current: 100,
  Visited: 90,
  Frontier: 90,
  Generated: 110,
  Path: 260,
  'Time (µs)': 120,
  'Peak memory': 130,
  'Cost (km)': 120,
  Hops: 70,
  'T(n)': 200,
  'S(n)': 200,
  Optimal: 90,
  Complete: 90,
  'landmarks 2': 120,
  4: 56,
  8: 56,
}

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

const MIN_DELAY = 0
const MAX_DELAY = 1500
const DEFAULT_DELAY = 600
const BENCH_ITERS = 400

type CompareRow = {
  key: string
  label: string
  ms: number
  peakFrontier: number
  generated: number
  cost: number
  hops: number
  found: boolean
}

// Point the module-level ALT heuristic at a specific preset/custom set, run the
// search, then restore whatever ALT state was active before — keeps the two
// lanes (and the benchmark tables) independent despite the shared module state.
function withAltConfig<T>(preset: LandmarkPreset, custom: NodeId[], fn: () => T): T {
  const saved = saveALTState()
  if (preset === 'custom') {
    if (custom.length > 0) setCustomLandmarks(custom)
    else setALTPreset('lm8')
  } else {
    setALTPreset(preset)
  }
  try {
    return fn()
  } finally {
    restoreALTState(saved)
  }
}

// Benchmark a single algorithm under an explicit preset — mean wall time over
// BENCH_ITERS runs, plus peak frontier as a space proxy.
function benchmarkOne(meta: AlgoMeta, start: NodeId, goal: NodeId, cfg: LandmarkPreset, custom: NodeId[]): CompareRow {
  return withAltConfig(cfg, custom, () => {
    const res = meta.run(start, goal)
    const t0 = performance.now()
    for (let i = 0; i < BENCH_ITERS; i++) meta.run(start, goal)
    const ms = (performance.now() - t0) / BENCH_ITERS
    const peakFrontier = res.steps.reduce((max, s) => Math.max(max, s.frontier.length), 0)
    return {
      key: '', label: meta.label, ms, peakFrontier,
      generated: res.generated,
      cost: res.found ? pathCost(res.path) : NaN,
      hops: res.found ? res.path.length - 1 : 0,
      found: res.found,
    }
  })
}

// Nodes generated by one algorithm under each of the three landmark presets.
// Returns null for algorithms that do not use landmarks at all.
function landmarkEffect(meta: AlgoMeta, start: NodeId, goal: NodeId): { lm2: number; lm4: number; lm8: number } | null {
  if (!meta.usesLandmarks) return null
  const saved = saveALTState()
  try {
    const out = {} as { lm2: number; lm4: number; lm8: number }
    for (const preset of ['lm2', 'lm4', 'lm8'] as const) {
      setALTPreset(preset)
      out[preset] = meta.run(start, goal).generated
    }
    return out
  } finally {
    restoreALTState(saved)
  }
}

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

function randomPair(): { start: NodeId; goal: NodeId } {
  const start = CITIES[Math.floor(Math.random() * CITIES.length)]
  const rest = CITIES.filter((city) => city !== start)
  return { start, goal: rest[Math.floor(Math.random() * rest.length)] }
}

function nodeState(node: NodeId, step: Step, isFinalFrame: boolean, found: boolean, path: NodeId[]): NodeState {
  if (isFinalFrame && found && path.includes(node)) return 'path'
  if (node === step.current) return 'current'
  if (step.frontier.includes(node)) return 'frontier'
  if (step.visited.includes(node)) return 'visited'
  return 'unvisited'
}

// Pure normalized h-values for a given preset/custom set (no module globals).
function heatmapFor(goal: NodeId, preset: LandmarkPreset, custom: NodeId[]): Record<NodeId, number> | undefined {
  const vals: Record<NodeId, number> = {}
  let max = 0
  for (const city of CITIES) {
    vals[city] = altHWith(city, goal, preset, custom)
    if (vals[city] > max) max = vals[city]
  }
  if (max === 0) return undefined
  for (const city of CITIES) vals[city] /= max
  return vals
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
}

function SVGMap({ algoKey, stepIdx, lastIdx, result, hoveredCity, start, goal, showLine, heatmapValues, landmarks, onCityClick, pickLandmarkMode }: SVGMapParams) {
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
      <rect className="map-bg" x={625} y={325} width={2750} height={1850} rx={80} />

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
        return (
          <g
            key={city}
            className={`node node-${state}${isHovered ? ' node-hover' : ''}${pickLandmarkMode ? ' node-clickable' : ''}`}
            onClick={() => onCityClick?.(city)}
          >
            <title>{city}{isLandmark ? ' ★ landmark' : ''}</title>
            {isHovered && <circle className="node-glow" cx={coord.x} cy={coord.y} r={NODE_R} />}
            {isStart && <circle className="marker-ring marker-start" cx={coord.x} cy={coord.y} r={60} />}
            {isGoal && <circle className="marker-ring marker-goal" cx={coord.x} cy={coord.y} r={60} />}
            {isLandmark && <circle className="marker-ring marker-landmark" cx={coord.x} cy={coord.y} r={70} />}
            <circle cx={coord.x} cy={coord.y} r={NODE_R} />
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
}

function MergedSVGMap({
  stepIdx, lastIdx, lastIdx2, result, result2, hoveredCity, start, goal,
  showLine, heatA, heatB, landmarksA, landmarksB, onCityClick, pickLandmarkMode,
}: MergedMapParams) {
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
            <g clipPath={`url(#mclipL-${code})`} className={`mhalf node node-${cA}`}>
              <circle cx={coord.x} cy={coord.y} r={NODE_R} />
              <text x={coord.x} y={coord.y} dominantBaseline="central">{code}</text>
            </g>
            <g clipPath={`url(#mclipR-${code})`} className={`mhalf node node-${cB}`}>
              <circle cx={coord.x} cy={coord.y} r={NODE_R} />
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
// orientation (wide on desktop, transposed on narrow screens).
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// Sun/Moon theme toggle. Applies a `.dark` class on <html> and matches the
// native color scheme so the app's CSS variables (now keyed to `.dark`) switch.
function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const initial = true  // dark is default
    document.documentElement.classList.toggle('dark', initial)
    document.documentElement.style.colorScheme = 'dark'
    return initial
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      onClick={() => {
        // Animate the theme change, then drop the class so normal transitions resume.
        document.documentElement.classList.add('theme-anim')
        window.setTimeout(() => document.documentElement.classList.remove('theme-anim'), 450)
        setDark((d) => !d)
      }}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  )
}

function App() {
  // Swap the comparison table's orientation below 1100px (render only one table).
  const isCompact = useMediaQuery('(max-width: 1100px)')
  const [algo, setAlgo] = useState('ucs')
  const [algo2, setAlgo2] = useState('astaralt')

  const [start, setStart] = useState<NodeId>('Arad')
  const [goal, setGoal] = useState<NodeId>('Bucharest')
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [delay, setDelay] = useState(DEFAULT_DELAY)
  const [hoveredCity, setHoveredCity] = useState<NodeId | null>(null)
  const [showLine, setShowLine] = useState(false)
  const [landmarkA, setLandmarkA] = useState<LandmarkCount>('lm8')
  const [landmarkB, setLandmarkB] = useState<LandmarkCount>('lm8')
  const [customA, setCustomA] = useState<NodeId[]>([])
  const [customB, setCustomB] = useState<NodeId[]>([])
  const [lmOverlayA, setLmOverlayA] = useState(false)
  const [lmOverlayB, setLmOverlayB] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [pickLandmarkMode, setPickLandmarkMode] = useState(false)
  const [merged, setMerged] = useState(true)
  // Guide sidebar: open on wide screens, collapsed on narrow ones.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > 1100,
  )

  // Stats go to the right sidebar only when the merged view has room (wide
  // window); otherwise they sit below the map so the centre column stays wide.
  const isWide = useMediaQuery('(min-width: 1500px)')
  const statsInSidebar = merged && isWide
  const useTall = merged || isCompact

  const meta = ALGORITHMS[algo]
  const meta2 = ALGORITHMS[algo2]

  // Each lane has an independent landmark config: preset count (2/4/8) unless the
  // user click-picked a custom set for that lane, which overrides the preset.
  const customActiveA = customA.length > 0
  const customActiveB = customB.length > 0
  const cfgA: LandmarkPreset = customActiveA ? 'custom' : landmarkA
  const cfgB: LandmarkPreset = customActiveB ? 'custom' : landmarkB

  // Each lane's run sets & restores the module ALT state around its own search,
  // so lanes can hold different landmark presets without cross-talk.
  const result = useMemo(
    () => withAltConfig(cfgA, customA, () => meta.run(start, goal)),
    [meta, start, goal, cfgA, customA],
  )
  const result2 = useMemo(
    () => withAltConfig(cfgB, customB, () => meta2.run(start, goal)),
    [meta2, start, goal, cfgB, customB],
  )
  // Benchmark + landmark-effect numbers for the two selected algorithms only.
  const benchA = useMemo(
    () => benchmarkOne(meta, start, goal, cfgA, customA),
    [meta, start, goal, cfgA, customA],
  )
  const benchB = useMemo(
    () => benchmarkOne(meta2, start, goal, cfgB, customB),
    [meta2, start, goal, cfgB, customB],
  )
  const lmEffectA = useMemo(() => landmarkEffect(meta, start, goal), [meta, start, goal])
  const lmEffectB = useMemo(() => landmarkEffect(meta2, start, goal), [meta2, start, goal])

  // h-value heatmap per lane (pure; each lane reflects its own landmark preset).
  const heatA = useMemo(
    () => (showHeatmap ? heatmapFor(goal, cfgA, customA) : undefined),
    [showHeatmap, goal, cfgA, customA],
  )
  const heatB = useMemo(
    () => (showHeatmap ? heatmapFor(goal, cfgB, customB) : undefined),
    [showHeatmap, goal, cfgB, customB],
  )

  const lastIdx = result.steps.length - 1
  const lastIdx2 = result2.steps.length - 1
  const largerLastIdx = Math.max(lastIdx, lastIdx2)

  useEffect(() => {
    if (!playing || stepIdx >= largerLastIdx) return
    const id = setTimeout(() => {
      if (stepIdx + 1 >= largerLastIdx) setPlaying(false)
      setStepIdx(stepIdx + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [playing, stepIdx, delay, largerLastIdx])

  function handleAlgoChange(next: string) { setAlgo(next); setStepIdx(0); setPlaying(false) }
  function handleAlgoChange2(next: string) { setAlgo2(next); setStepIdx(0); setPlaying(false) }
  function handleStartChange(next: NodeId) { setStart(next); setStepIdx(0); setPlaying(false) }
  function handleGoalChange(next: NodeId) { setGoal(next); setStepIdx(0); setPlaying(false) }
  function handleLandmarkAChange(next: LandmarkCount) { setLandmarkA(next); setStepIdx(0); setPlaying(false) }
  function handleLandmarkBChange(next: LandmarkCount) { setLandmarkB(next); setStepIdx(0); setPlaying(false) }

  // Toggle a city in a specific lane's custom landmark set (edits that lane only).
  function toggleCustom(setCustom: Dispatch<SetStateAction<NodeId[]>>, city: NodeId) {
    setCustom((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]))
    setStepIdx(0)
    setPlaying(false)
  }

  const onCityClickA = (city: NodeId) => {
    if (!pickLandmarkMode) return
    if (!meta.usesLandmarks) setLmOverlayA(true) // picking a non-landmark lane should reveal the overlay
    toggleCustom(setCustomA, city)
  }
  const onCityClickB = (city: NodeId) => {
    if (!pickLandmarkMode) return
    if (!meta2.usesLandmarks) setLmOverlayB(true)
    toggleCustom(setCustomB, city)
  }
  // Merged map: one click adds/removes the city as a landmark in BOTH lanes, so
  // the split ring immediately shows both halves.
  const onCityClickMerged = (city: NodeId) => {
    if (!pickLandmarkMode) return
    if (!meta.usesLandmarks) setLmOverlayA(true)
    if (!meta2.usesLandmarks) setLmOverlayB(true)
    toggleCustom(setCustomA, city)
    toggleCustom(setCustomB, city)
  }

  function handleRandomize() {
    const next = randomPair()
    setStart(next.start)
    setGoal(next.goal)
    setStepIdx(0)
    setPlaying(false)
  }

  function handleReset() { setStepIdx(0); setPlaying(false) }
  function handleStepBack() { setPlaying(false); setStepIdx((i) => Math.max(0, i - 1)) }
  function handleStepForward() { setPlaying(false); setStepIdx((i) => Math.min(largerLastIdx, i + 1)) }
  function handlePlayPause() {
    if (stepIdx >= largerLastIdx) { setStepIdx(0); setPlaying(true); return }
    setPlaying((p) => !p)
  }

  const pathLabel = result.found
    ? `${result.path.map(cityCode).join(' → ')}`
    : '—'
  const pathLabel2 = result2.found
    ? `${result2.path.map(cityCode).join(' → ')}`
    : '—'

  const stepA: Step | undefined = result.steps[Math.min(stepIdx, lastIdx)]
  const stepB: Step | undefined = result2.steps[Math.min(stepIdx, lastIdx2)]
  const finalA: boolean = stepIdx >= lastIdx
  const finalB: boolean = stepIdx >= lastIdx2

  // Combined table — one row per selected algorithm (A and B), one column per
  // metric. Live step-dependent metrics are rated only once both runs are done.
  const atEnd = finalA && finalB
  const finalVisitedA = atEnd ? (result.steps[lastIdx]?.visited.length ?? 0) : NaN
  const finalVisitedB = atEnd ? (result2.steps[lastIdx2]?.visited.length ?? 0) : NaN
  const finalFrontierA = atEnd ? (result.steps[lastIdx]?.frontier.length ?? 0) : NaN
  const finalFrontierB = atEnd ? (result2.steps[lastIdx2]?.frontier.length ?? 0) : NaN
  const costA = result.found ? pathCost(result.path) : NaN
  const costB = result2.found ? pathCost(result2.path) : NaN

  // Which value is objectively better?
  const betterLower = (va: number, vb: number): 'a' | 'b' | undefined =>
    Number.isNaN(va) || Number.isNaN(vb) ? undefined : va < vb ? 'a' : vb < va ? 'b' : undefined
  const betterYes = (sa: string, sb: string): 'a' | 'b' | undefined => {
    const aYes = sa.startsWith('Yes'), bYes = sb.startsWith('Yes')
    if (aYes && !bYes) return 'a'
    if (bYes && !aYes) return 'b'
    return undefined
  }
  const betterPath = (): 'a' | 'b' | undefined => {
    if (result.found && !result2.found) return 'a'
    if (!result.found && result2.found) return 'b'
    if (result.found && result2.found && !Number.isNaN(costA) && !Number.isNaN(costB)) {
      if (costA < costB) return 'a'
      if (costB < costA) return 'b'
    }
    return undefined
  }

  type Col = { label: string; a: ReactNode; b: ReactNode; better?: 'a' | 'b'; wrap?: boolean }
  // Mean time over BENCH_ITERS runs, shown in microseconds.
  const fmtUs = (ms: number) => `${(ms * 1000).toFixed(1)}`
  // Right-aligned mono cells: pad single-digit step totals so “/ 5” lines up
  // under “/ 12” in the other lane instead of shifting the slash per row.
  const stepText = (len: number, idx: number) => {
    if (len === 0) return '0 / 0'
    const cur = Math.min(stepIdx, idx) + 1
    const total = len < 10 ? ` ${len}` : String(len)
    return `${cur} / ${total}`
  }
  const benchCost = (r: CompareRow) => (r.found ? String(r.cost) : '—')
  const lmValue = (e: { lm2: number; lm4: number; lm8: number } | null, key: 'lm2' | 'lm4' | 'lm8') =>
    e ? String(e[key]) : '—'

  const cols: Col[] = [
    {
      label: 'Step',
      a: stepText(result.steps.length, lastIdx),
      b: stepText(result2.steps.length, lastIdx2),
    },
    { label: 'Current', a: stepA?.current ?? '—', b: stepB?.current ?? '—' },
    {
      label: 'Visited',
      a: String(stepA?.visited.length ?? 0),
      b: String(stepB?.visited.length ?? 0),
      better: atEnd ? betterLower(finalVisitedA, finalVisitedB) : undefined,
    },
    {
      label: 'Frontier',
      a: String(stepA?.frontier.length ?? 0),
      b: String(stepB?.frontier.length ?? 0),
      better: atEnd ? betterLower(finalFrontierA, finalFrontierB) : undefined,
    },
    {
      label: 'Generated',
      a: String(result.generated),
      b: String(result2.generated),
      better: betterLower(result.generated, result2.generated),
    },
    {
      label: 'Peak memory',
      a: String(benchA.peakFrontier),
      b: String(benchB.peakFrontier),
      better: betterLower(benchA.peakFrontier, benchB.peakFrontier),
    },
    {
      label: 'Path',
      a: finalA ? pathLabel : '—',
      b: finalB ? pathLabel2 : '—',
      better: atEnd ? betterPath() : undefined,
      wrap: true,
    },
    { label: 'Time (µs)', a: fmtUs(benchA.ms), b: fmtUs(benchB.ms), better: betterLower(benchA.ms, benchB.ms) },
    {
      label: 'Cost (km)',
      a: benchCost(benchA),
      b: benchCost(benchB),
      better: betterLower(benchA.found ? benchA.cost : NaN, benchB.found ? benchB.cost : NaN),
    },
    {
      label: 'Hops',
      a: benchA.found ? String(benchA.hops) : '—',
      b: benchB.found ? String(benchB.hops) : '—',
      better: betterLower(benchA.found ? benchA.hops : NaN, benchB.found ? benchB.hops : NaN),
    },
    { label: 'T(n)', a: <Tex>{meta.time}</Tex>, b: <Tex>{meta2.time}</Tex> },
    { label: 'S(n)', a: <Tex>{meta.space}</Tex>, b: <Tex>{meta2.space}</Tex> },
    { label: 'Optimal', a: meta.optimal, b: meta2.optimal, better: betterYes(meta.optimal, meta2.optimal) },
    { label: 'Complete', a: meta.complete, b: meta2.complete, better: betterYes(meta.complete, meta2.complete) },
    {
      label: 'landmarks 2',
      a: lmValue(lmEffectA, 'lm2'),
      b: lmValue(lmEffectB, 'lm2'),
      better: lmEffectA && lmEffectB ? betterLower(lmEffectA.lm2, lmEffectB.lm2) : undefined,
    },
    {
      label: '4',
      a: lmValue(lmEffectA, 'lm4'),
      b: lmValue(lmEffectB, 'lm4'),
      better: lmEffectA && lmEffectB ? betterLower(lmEffectA.lm4, lmEffectB.lm4) : undefined,
    },
    {
      label: '8',
      a: lmValue(lmEffectA, 'lm8'),
      b: lmValue(lmEffectB, 'lm8'),
      better: lmEffectA && lmEffectB ? betterLower(lmEffectA.lm8, lmEffectB.lm8) : undefined,
    },
  ]

  // Full row labels (badge name + landmark suffix) reused by both table orientations.
  const rowLabelA = `${meta.label}${laneLmSuffix(meta.usesLandmarks, landmarkA, customA)}`
  const rowLabelB = `${meta2.label}${laneLmSuffix(meta2.usesLandmarks, landmarkB, customB)}`

  // Cell classes for the comparison tables. Numeric-ish Step cells stay on one
  // line (they can reach two digits, e.g. “10 / 12”) instead of wrapping.
  const cellCls = (
    label: string,
    wrap: boolean | undefined,
    better: 'a' | 'b' | undefined,
    side: 'a' | 'b',
  ) =>
    `${wrap ? 'col-wrap' : ''}${better === side ? (side === 'a' ? ' better-a' : ' better-b') : ''}${label === 'Step' ? ' col-nowrap' : ''}`

  // Algorithm-comparison stats. Rendered once, slotted either into the right
  // sidebar or below the map depending on STATS_IN_SIDEBAR.
  const statsPanel = (
    <section className="compare-panel" aria-labelledby="compare-title">
      <Card>
        <CardContent>
          <h2 id="compare-title" className="compare-title">
            <span>Algorithm comparison</span>
            <span className="ct-route">{start} → {goal}</span>
          </h2>
          <div className="compare-scroll">
            {useTall ? (
            <table className="compare compare-tall">
              <thead>
                <tr>
                  <th scope="col" className="tall-metric-col">Metric</th>
                  <th scope="col" className="tall-head tall-head-a">
                    <span className="lane-badge lane-badge-a" aria-hidden="true">A</span>
                    <span className="tall-head-label">{rowLabelA}</span>
                  </th>
                  <th scope="col" className="tall-head tall-head-b">
                    <span className="lane-badge lane-badge-b" aria-hidden="true">B</span>
                    <span className="tall-head-label">{rowLabelB}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cols.map((c) => (
                  <tr key={c.label}>
                    <th scope="row" className={c.label === 'Time (µs)' ? 'th-unit' : ''}>{c.label}</th>
                    <td className={cellCls(c.label, c.wrap, c.better, 'a')}>{c.a}</td>
                    <td className={cellCls(c.label, c.wrap, c.better, 'b')}>{c.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
            <table className="compare compare-fixed table-wide">
              <thead>
                <tr>
                  <th scope="col" style={{ width: ALGO_COL_PX }}>Algorithm</th>
                  {cols.map((c) => (
                    <th key={c.label} scope="col" style={{ width: COL_PX[c.label] ?? DEFAULT_COL_PX }} className={c.label === 'Time (µs)' ? 'th-unit' : ''}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="row-lane-a">
                  <th scope="row">
                    <div className="run-cell">
                      <span className="run-label">
                        <span className="lane-badge lane-badge-a">A</span>
                        <span className="run-label-text">{rowLabelA}</span>
                      </span>
                    </div>
                  </th>
                  {cols.map((c) => (
                    <td key={c.label} className={cellCls(c.label, c.wrap, c.better, 'a')}>
                      <div className="run-cell">{c.a}</div>
                    </td>
                  ))}
                </tr>
                <tr className="row-lane-b">
                  <th scope="row">
                    <div className="run-cell">
                      <span className="run-label">
                        <span className="lane-badge lane-badge-b">B</span>
                        <span className="run-label-text">{rowLabelB}</span>
                      </span>
                    </div>
                  </th>
                  {cols.map((c) => (
                    <td key={c.label} className={cellCls(c.label, c.wrap, c.better, 'b')}>
                      <div className="run-cell">{c.b}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            )}
          </div>
          <ul className="footnotes">
            {[
              `Time = x̄ of ${BENCH_ITERS} runs (µs)`,
              'live step metrics (Visited/Frontier/Path) compared only at the final frame',
              ALGO_FOOTNOTES[algo] ? `A: ${ALGO_FOOTNOTES[algo]}` : '',
              ALGO_FOOTNOTES[algo2] ? `B: ${ALGO_FOOTNOTES[algo2]}` : '',
            ].filter(Boolean).map((t) => <li key={t}>{t}</li>)}
          </ul>
        </CardContent>
      </Card>
    </section>
  )

  return (
    <div className={`app-shell${statsInSidebar ? ' app-shell-fit' : ''}`}>
    <Guide open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <div className="app-main">
    <h1 className="app-title">
      <button
        className="sidebar-toggle"
        aria-label={sidebarOpen ? 'Hide the guide' : 'Show the guide'}
        aria-pressed={sidebarOpen}
        title={sidebarOpen ? 'Hide guide' : 'Show guide'}
        onClick={() => setSidebarOpen((v) => !v)}
      >
        <BookOpen aria-hidden="true" />
      </button>
      <span>Uninformed &amp; Informed search</span>
      <span className="app-title-sep" aria-hidden="true">·</span>
      <span className="app-title-sub">Romania map</span>
      <ThemeToggle />
    </h1>
      <div className="query-bar" role="toolbar" aria-label="Search configuration">
        {/* Row 1: route */}
        <div className="query-row">
          <Select
            value={start}
            onValueChange={(v) => v && handleStartChange(v as NodeId)}
            onOpenChange={(open) => !open && setHoveredCity(null)}
          >
            <SelectTrigger className="w-32 city-trigger" aria-label="Start city"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITIES.map((city) => (
                <SelectItem
                  key={city} value={city}
                  onMouseEnter={() => setHoveredCity(city)}
                  onMouseLeave={() => setHoveredCity(null)}
                >{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="query-word" aria-hidden="true">→</span>
          <Select
            value={goal}
            onValueChange={(v) => v && handleGoalChange(v as NodeId)}
            onOpenChange={(open) => !open && setHoveredCity(null)}
          >
            <SelectTrigger className="w-32 city-trigger" aria-label="Goal city"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITIES.map((city) => (
                <SelectItem
                  key={city} value={city}
                  onMouseEnter={() => setHoveredCity(city)}
                  onMouseLeave={() => setHoveredCity(null)}
                >{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="icon"
            aria-label="Randomize start and goal cities"
            title="Randomize"
            onClick={handleRandomize}
          >
            <Dices aria-hidden="true" />
          </Button>
        </div>
        {/* Row 2: algorithm comparison */}
        <div className="query-row">
          <div className="query-algo query-algo-a">
            <span className="lane-badge lane-badge-a" aria-hidden="true">A</span>
            <Select value={algo} onValueChange={(v) => v && handleAlgoChange(v)}>
              <SelectTrigger className="w-40 algo-trigger" aria-label="Algorithm for lane A">
                <SelectValue>{ALGORITHMS[algo]?.label ?? algo}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ALGO_OPTIONS.map(([key, m]) => (
                  <SelectItem key={key} value={key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <LandmarkPicker
              lane="A"
              usesLandmarks={meta.usesLandmarks}
              overlay={lmOverlayA}
              setOverlay={setLmOverlayA}
              count={landmarkA}
              onCount={handleLandmarkAChange}
              customCount={customA.length}
              onClearCustom={() => { setCustomA([]); setStepIdx(0); setPlaying(false) }}
            />
          </div>
          <span className="query-word">vs</span>
          <div className="query-algo query-algo-b">
            <span className="lane-badge lane-badge-b" aria-hidden="true">B</span>
            <Select value={algo2} onValueChange={(v) => v && handleAlgoChange2(v)}>
              <SelectTrigger className="w-40 algo-trigger" aria-label="Algorithm for lane B">
                <SelectValue>{ALGORITHMS[algo2]?.label ?? algo2}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ALGO_OPTIONS.map(([key, m]) => (
                  <SelectItem key={key} value={key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <LandmarkPicker
              lane="B"
              usesLandmarks={meta2.usesLandmarks}
              overlay={lmOverlayB}
              setOverlay={setLmOverlayB}
              count={landmarkB}
              onCount={handleLandmarkBChange}
              customCount={customB.length}
              onClearCustom={() => { setCustomB([]); setStepIdx(0); setPlaying(false) }}
            />
          </div>
        </div>
      </div>

      <div className={`workspace${statsInSidebar ? ' workspace-fit' : ''}`}>
      <main className="app">
        {/* Toolbar — above the map */}
        <div className="toolbar flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)] flex-wrap" role="toolbar" aria-label="Visualizer controls">

          {/* Legend */}
          <ul className="legend" aria-label="Node state colors">
            <li><span className="swatch swatch-current" aria-hidden="true" />Current</li>
            <li><span className="swatch swatch-frontier" aria-hidden="true" />Frontier</li>
            <li><span className="swatch swatch-visited" aria-hidden="true" />Visited</li>
            <li><span className="swatch swatch-path" aria-hidden="true" />Path</li>
            <li><span className="swatch swatch-unvisited" aria-hidden="true" />Unvisited</li>
            <li><span className="swatch swatch-start-ring" aria-hidden="true" />Start</li>
            <li><span className="swatch swatch-goal-ring" aria-hidden="true" />Goal</li>
          </ul>

          <span className="w-px h-5 bg-[var(--border)] self-center" aria-hidden="true" />

          {/* Overlays */}
          <Button
            variant={showLine ? 'default' : 'outline'} size="sm"
            onClick={() => setShowLine(v => !v)} aria-pressed={showLine}
            title="Show straight line from origin to destination"
          >
            <span className="swatch swatch-arc" aria-hidden="true" />
            Straight Line
          </Button>
          <Button
            variant={showHeatmap ? 'default' : 'outline'} size="sm"
            onClick={() => setShowHeatmap(v => !v)} aria-pressed={showHeatmap}
            title="h-value heatmap — stronger red = nearer the goal (lower h)"
          >
            <Thermometer size={14} aria-hidden="true" /> Heatmap
          </Button>
          <Button
            variant={merged ? 'default' : 'outline'} size="sm"
            onClick={() => { setMerged(v => !v); setStepIdx(0); setPlaying(false) }}
            aria-pressed={merged}
            title="Merge the two maps into one — each road becomes two coloured strands (purple = lane A, teal = lane B) and node discs split down the middle"
          >
            <Columns2 size={14} aria-hidden="true" /> {merged ? 'Merged map' : 'Merge maps'}
          </Button>

          <span className="w-px h-5 bg-[var(--border)] self-center" aria-hidden="true" />

          {/* Tool */}
          <Button
            variant={pickLandmarkMode ? 'default' : 'outline'} size="sm"
            onClick={() => setPickLandmarkMode(v => !v)} aria-pressed={pickLandmarkMode}
            title="Pick landmarks per lane — click a city on either map to add/remove that lane's landmarks"
          >
            <MapPin size={14} aria-hidden="true" /> Landmarks ({customA.length + customB.length})
          </Button>

          <span className="w-px h-5 bg-[var(--border)] self-center" aria-hidden="true" />

          {/* Playback */}
          <div className="transport">
            <Button variant="outline" size="icon" aria-label="Reset" onClick={handleReset} disabled={stepIdx === 0}>
              <RotateCcw aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Step back" onClick={handleStepBack} disabled={stepIdx === 0}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" aria-label={playing ? 'Pause' : 'Play'} onClick={handlePlayPause}>
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
            <Button variant="outline" size="icon" aria-label="Step forward" onClick={handleStepForward} disabled={stepIdx >= largerLastIdx}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>

          <span className="w-px h-5 bg-[var(--border)] self-center" aria-hidden="true" />

          {/* Speed */}
          <div className="speed toolbar-group-speed">
            <span className="speed-labels">
              <span>Slow</span>
              <span className="speed-value">{delay}ms</span>
              <span>Fast</span>
            </span>
            <Slider
              min={MIN_DELAY} max={MAX_DELAY} step={50}
              value={MAX_DELAY - delay}
              onValueChange={(v) => setDelay(MAX_DELAY - (Array.isArray(v) ? v[0] : v))}
              aria-label="Animation speed"
            />
          </div>

        </div>

        <div className={`lanes${merged ? ' lanes-merged' : ''}`}>
          {/* Lane A */}
          <section className="lane lane-a" aria-label="Lane A">
            <div className="lane-header">
              <span className="lane-badge lane-badge-a" aria-hidden="true">A</span>
              <span className="lane-algo-name">{meta.label}</span>
            </div>
            <div className="map-wrap">
              <SVGMap
                algoKey={algo} stepIdx={stepIdx} lastIdx={lastIdx}
                result={result} hoveredCity={hoveredCity} start={start} goal={goal} showLine={showLine}
                heatmapValues={heatA}
                landmarks={laneLandmarkCities(meta.usesLandmarks, lmOverlayA, landmarkA, customA)}
                onCityClick={onCityClickA} pickLandmarkMode={pickLandmarkMode}
              />
              <span className="heatmap-legend" aria-label="Heatmap scale"
                style={{ visibility: showHeatmap ? 'visible' : 'hidden' }}>
                <span className="heatmap-legend-label">Near</span>
                <span className="heatmap-legend-bar" aria-hidden="true" />
                <span className="heatmap-legend-label">Far</span>
              </span>
            </div>
          </section>

          <div className="lane-vs" aria-hidden="true">vs</div>

          {/* Lane B */}
          <section className="lane lane-b" aria-label="Lane B">
            <div className="lane-header">
              <span className="lane-badge lane-badge-b" aria-hidden="true">B</span>
              <span className="lane-algo-name">{meta2.label}</span>
            </div>
            <div className="map-wrap">
              <SVGMap
                algoKey={algo2} stepIdx={stepIdx} lastIdx={lastIdx2}
                result={result2} hoveredCity={hoveredCity} start={start} goal={goal} showLine={showLine}
                heatmapValues={heatB}
                landmarks={laneLandmarkCities(meta2.usesLandmarks, lmOverlayB, landmarkB, customB)}
                onCityClick={onCityClickB} pickLandmarkMode={pickLandmarkMode}
              />
              <span className="heatmap-legend" aria-label="Heatmap scale"
                style={{ visibility: showHeatmap ? 'visible' : 'hidden' }}>
                <span className="heatmap-legend-label">Near</span>
                <span className="heatmap-legend-bar" aria-hidden="true" />
                <span className="heatmap-legend-label">Far</span>
              </span>
            </div>
          </section>

          {/* Merged single-map view — shown only when “Merge maps” is toggled on */}
          <section className="lane lane-merged" aria-label="Merged map (lane A and B)">
            <div className="lane-header lane-header-merged">
              <span className="lane-badge lane-badge-a" aria-hidden="true">A</span>
              <span className="lane-algo-name">{meta.label}{laneLmSuffix(meta.usesLandmarks, landmarkA, customA)}</span>
              <span className="lane-vs-inline" aria-hidden="true">vs</span>
              <span className="lane-badge lane-badge-b" aria-hidden="true">B</span>
              <span className="lane-algo-name">{meta2.label}{laneLmSuffix(meta2.usesLandmarks, landmarkB, customB)}</span>
              <span className="merged-legend">
                <span className="ml-item"><span className="ml-swatch ml-a" aria-hidden="true" />{meta.label}</span>
                <span className="ml-item"><span className="ml-swatch ml-b" aria-hidden="true" />{meta2.label}</span>
              </span>
            </div>
            <div className="map-wrap">
              <MergedSVGMap
                stepIdx={stepIdx} lastIdx={lastIdx} lastIdx2={lastIdx2}
                result={result} result2={result2}
                hoveredCity={hoveredCity} start={start} goal={goal} showLine={showLine}
                heatA={heatA} heatB={heatB}
                landmarksA={laneLandmarkCities(meta.usesLandmarks, lmOverlayA, landmarkA, customA)}
                landmarksB={laneLandmarkCities(meta2.usesLandmarks, lmOverlayB, landmarkB, customB)}
                onCityClick={onCityClickMerged} pickLandmarkMode={pickLandmarkMode}
              />
              <span className="heatmap-legend" aria-label="Heatmap scale"
                style={{ visibility: showHeatmap ? 'visible' : 'hidden' }}>
                <span className="heatmap-legend-label">Near</span>
                <span className="heatmap-legend-bar" aria-hidden="true" />
                <span className="heatmap-legend-label">Far</span>
              </span>
            </div>
          </section>
        </div>

        {!statsInSidebar && statsPanel}
      </main>

      {statsInSidebar && (
        <aside className="stats-panel" aria-label="Algorithm comparison">
          {statsPanel}
        </aside>
      )}
      </div>
    </div>
    </div>
  )
}

export default App
