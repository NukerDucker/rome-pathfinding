import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ChevronLeft, ChevronRight, Columns2, Dices, MapPin, Pause, Play, RotateCcw, Sparkles, Thermometer, Volume2, VolumeX, X } from 'lucide-react'
import { CITIES, ROMANIA, cityCode, type NodeId } from '@/romania'
import { ALGORITHMS, pathCost, type Step, type AlgoMeta, type SearchResult } from '@/search'
import {
  setALTPreset,
  setCustomLandmarks, saveALTState, restoreALTState,
  altHWith,
  type LandmarkPreset,
} from '@/heuristic'
import { LANDMARK_PRESETS } from '@/alt'
import { Button } from '@/components/ui/button'
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
import { cached, lmEffectCache, modernBenchCache } from '@/game/benchCache'
import {
  THEME_ORDER, ThemeControl, ThemeRoll, DndAurora,
  SpaceField, PlanetWindow, planetFor, applyTheme, initialTheme,
  type Theme, type PlanetInfo,
} from '@/theme'
import {
  ensureAudio, setMuted,
  playDice, playExpand, playVictory,
  playCrow, playOwl, playGlitter, playWhoosh, playLaser,
  startCeltic, stopCeltic, startSpaceHum, stopSpaceHum,
} from '@/audio'
import '../App.css'
import '../themes.css'

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
  // Cached across mounts (the memo above dies on unmount): remounting modern
  // after the game reran 800 searches for numbers that never change.
  return cached(modernBenchCache, `${meta.label}|${start}|${goal}|${cfg}|${custom.join(',')}`, () =>
    withAltConfig(cfg, custom, () => {
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
  }))
}

// Nodes generated by one algorithm under each of the three landmark presets.
// Returns null for algorithms that do not use landmarks at all.
function landmarkEffect(meta: AlgoMeta, start: NodeId, goal: NodeId): { lm2: number; lm4: number; lm8: number } | null {
  if (!meta.usesLandmarks) return null
  // Shared cache with the game UI: same (algo,start,goal) → same numbers
  return cached(lmEffectCache, `${meta.label}|${start}|${goal}`, () => {
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
  })
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

// Real city changes up to (and including) `upto` — a pure function of the step
// list, so the FTL burst counters stay safe under StrictMode/concurrent
// rendering (no render-phase ref mutation). A parked ship stops incrementing.
function countMoves(steps: Step[], upto: number, start: NodeId): number {
  if (upto <= 0) return 0
  let count = 0
  let prev: NodeId = steps[0]?.current ?? start
  for (let i = 1; i <= upto; i++) {
    const cur = steps[i]?.current
    if (cur !== undefined && cur !== prev) count++
    prev = cur ?? prev
  }
  return count
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

function SVGMap({ algoKey, stepIdx, lastIdx, result, hoveredCity, start, goal, showLine, heatmapValues, landmarks, onCityClick, pickLandmarkMode, showMapBg, spaceTheme }: SVGMapParams) {
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

function MergedSVGMap({
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

function ModernApp() {
  // Swap the comparison table's orientation below 1100px (render only one table).
  void useMediaQuery('(max-width: 1100px)')
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
  type AppTab = 'map' | 'guide'
  const [tab, setTab] = useState<AppTab>('map')

  // ── Theme system ──────────────────────────────────────────────────────
  // Four themes cycled from the masthead. `applyTheme` runs in the initializer so
  // the classes land before first paint (no flash); the effect below persists it.
  const [theme, setTheme] = useState<Theme>(() => {
    const t = initialTheme()
    applyTheme(t)
    return t
  })
  const [roll, setRoll] = useState<{ theme: Theme; nonce: number } | null>(null)
  const rollNonce = useRef(0)
  const [muted, setMutedFlag] = useState<boolean>(() => {
    try { return window.localStorage.getItem('muted') === '1' } catch { return false }
  })
  const [audioReady, setAudioReady] = useState(false)
  const victoryPlayed = useRef(false)
  const themeRef = useRef(theme)
  themeRef.current = theme

  // Stats always go to right sidebar in merged mode; fit-mode keeps the map
  // from overflowing the viewport. Both collapse to column below 1100px via CSS.
  void useMediaQuery('(min-width: 1500px)')
  const fit = merged && tab === 'map'
  const statsInSidebar = fit
  void true // useTall removed — bento grid replaces table

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

  // The planet each ship is currently at (the node being expanded) — drives the
  // cockpit window, so it changes as the search jumps between systems.
  const currentCityA = result.steps[Math.min(stepIdx, lastIdx)]?.current ?? start
  const currentCityB = result2.steps[Math.min(stepIdx, lastIdx2)]?.current ?? start

  // FTL burst counters: how many times each ship has actually moved. Pure
  // derivations of the step list (safe under StrictMode/concurrent rendering), so
  // a ship that has reached its goal (parked) goes quiet — no render mutations.
  const warpA = useMemo(() => countMoves(result.steps, Math.min(stepIdx, lastIdx), start), [result, stepIdx, lastIdx, start])
  const warpB = useMemo(() => countMoves(result2.steps, Math.min(stepIdx, lastIdx2), start), [result2, stepIdx, lastIdx2, start])

  // A laser fires when a ship actually jumps to a new planet (space theme).
  const prevWarpA = useRef(warpA)
  useEffect(() => {
    if (warpA === prevWarpA.current) return
    prevWarpA.current = warpA
    if (themeRef.current === 'space') playLaser()
  }, [warpA])
  const prevWarpB = useRef(warpB)
  useEffect(() => {
    if (warpB === prevWarpB.current) return
    prevWarpB.current = warpB
    if (themeRef.current === 'space') playLaser()
  }, [warpB])

  useEffect(() => {
    if (!playing || stepIdx >= largerLastIdx) return
    const id = setTimeout(() => {
      if (stepIdx + 1 >= largerLastIdx) setPlaying(false)
      setStepIdx(stepIdx + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [playing, stepIdx, delay, largerLastIdx])

  // Re-arm the victory fanfare when a new run is computed (its inputs change),
  // then fire it once as the animation first reaches the final frame.
  useEffect(() => { victoryPlayed.current = false }, [result, result2, largerLastIdx])
  useEffect(() => {
    if (victoryPlayed.current || largerLastIdx <= 0) return
    if (stepIdx >= largerLastIdx) {
      victoryPlayed.current = true
      if (themeRef.current === 'dnd') playVictory()
    }
  }, [stepIdx, largerLastIdx])

  // Each frame expands one node: a short wooden "dup" as the frontier advances
  // (the D&D sound set), throttled so fast playback doesn't machine-gun it.
  const lastStepRef = useRef(stepIdx)
  const lastDupAt = useRef(0)
  useEffect(() => {
    const prev = lastStepRef.current
    lastStepRef.current = stepIdx
    if (stepIdx <= prev) return
    const now = performance.now()
    if (now - lastDupAt.current >= 70) {
      lastDupAt.current = now
      if (themeRef.current === 'dnd') playExpand()
    }
  }, [stepIdx])

  useEffect(() => {
    applyTheme(theme)
    try { window.localStorage.setItem('theme', theme) } catch { /* ignore */ }
  }, [theme])

  // Audio: unlock the context on the first gesture (pointer OR keyboard) — browsers
  // keep it suspended until then, so the roll sounds and Celtic loop depend on it.
  useEffect(() => {
    const unlock = () => {
      ensureAudio(); setAudioReady(true)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Keep the engine in sync with the mute toggle, and remember the choice.
  useEffect(() => {
    setMuted(muted)
    try { window.localStorage.setItem('muted', muted ? '1' : '0') } catch { /* ignore */ }
  }, [muted])

  // The D&D theme gets its own Celtic jig; the space theme gets a warp-core hum
  // with scattered electrical sparks. Every other theme is silent.
  useEffect(() => {
    if (theme === 'dnd' && audioReady) startCeltic(); else stopCeltic()
    return () => { if (theme === 'dnd') stopCeltic() }
  }, [theme, audioReady])

  useEffect(() => {
    if (theme === 'space' && audioReady) startSpaceHum(); else stopSpaceHum()
    return () => { if (theme === 'space') stopSpaceHum() }
  }, [theme, audioReady])

  // Cycle with a gacha-style roll: the reveal card plays, the theme switches
  // mid-animation, then the card fades out. Each theme opens with its own sound.
  function cycleTheme() {
    if (roll) return
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
    if (next === 'light') playCrow()
    else if (next === 'dark') playOwl()
    else if (next === 'dnd') playGlitter()
    else playWhoosh()
    const nonce = ++rollNonce.current
    setRoll({ theme: next, nonce })
    window.setTimeout(() => {
      const el = document.documentElement
      el.classList.add('theme-anim')
      window.setTimeout(() => el.classList.remove('theme-anim'), 500)
      setTheme(next)
    }, 780)
    window.setTimeout(() => setRoll((r) => (r && r.nonce === nonce ? null : r)), 1700)
  }

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
    // The wooden dice roll belongs to the D&D sound set: play it when the run
    // starts or restarts (not on pause).
    const dice = () => { if (themeRef.current === 'dnd') playDice() }
    if (stepIdx >= largerLastIdx) { dice(); setStepIdx(0); setPlaying(true); return }
    if (!playing) dice()
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

  type Col = { label: string; a: ReactNode; b: ReactNode; better?: 'a' | 'b'; wrap?: boolean; section?: string }
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
      section: 'Live',
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
      section: 'Result',
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
    { label: 'Time (µs)', section: 'Performance', a: fmtUs(benchA.ms), b: fmtUs(benchB.ms), better: betterLower(benchA.ms, benchB.ms) },
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
    { label: 'T(n)', section: 'Complexity', a: <Tex>{meta.time}</Tex>, b: <Tex>{meta2.time}</Tex> },
    { label: 'S(n)', a: <Tex>{meta.space}</Tex>, b: <Tex>{meta2.space}</Tex> },
    { label: 'Optimal', a: meta.optimal, b: meta2.optimal, better: betterYes(meta.optimal, meta2.optimal) },
    { label: 'Complete', a: meta.complete, b: meta2.complete, better: betterYes(meta.complete, meta2.complete) },
    {
      label: 'landmarks 2',
      section: 'Landmarks',
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
  const bentoSections = cols.reduce<{ title: string; rows: Col[] }[]>((acc, c) => {
    if (c.section) acc.push({ title: c.section, rows: [] })
    acc[acc.length - 1].rows.push(c)
    return acc
  }, [])

  const chipBase = 'font-mono text-[11px] px-2 py-[2px] rounded-full whitespace-nowrap'

  const renderKanbanCol = (side: 'a' | 'b', label: string, badgeCls: string, accentCls: string, winnerCls: string, winnerBg: string) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)]">
        <span className={`lane-badge ${badgeCls}`} aria-hidden="true">{side.toUpperCase()}</span>
        <span className={`text-xs font-semibold ${accentCls} truncate`}>{label}</span>
      </div>
      {bentoSections.map(({ title, rows }) => (
        <div key={title} className="ck-card flex flex-col gap-0 rounded-xl bg-[var(--surface-2)] px-3 pt-2 pb-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-ink opacity-50 mb-2">{title}</div>
          {rows.map((c) => {
            const val = c[side], isBetter = c.better === side
            const isYes = val === 'Yes', isNo = val === 'No'
            const rowCls = c.wrap
              ? 'flex flex-col items-start gap-1 py-[3px] border-b border-[rgba(255,255,255,0.04)] last:border-0'
              : 'flex items-center justify-between gap-2 py-[3px] border-b border-[rgba(255,255,255,0.04)] last:border-0'
            return (
              <div key={c.label} className={rowCls}>
                <span className="text-[11px] text-ink truncate">{c.label}</span>
                {isYes ? <span className={`${chipBase} bg-state-path/20 text-state-path font-semibold`}>{val}</span>
                 : isNo ? <span className={`${chipBase} text-ink opacity-40`}>{val}</span>
                 : isBetter ? <span className={`${chipBase} ${winnerBg} ${winnerCls} font-semibold`}>{val}</span>
                 : <span className={`${chipBase} text-ink-bold`}>{val}</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )

  // Algorithm-comparison stats. Rendered once, slotted either into the right
  // sidebar or below the map depending on STATS_IN_SIDEBAR.
  const statsPanel = (
    <section className="compare-panel" aria-labelledby="compare-title">
      <h2 id="compare-title" className="compare-title">
        <span>{theme === 'dnd' ? 'Alchemy comparison' : 'Algorithm comparison'}</span>
        <span className="ct-route">{start} → {goal}</span>
      </h2>
      <div className="grid grid-cols-2 gap-3 p-3">
        {renderKanbanCol('a', rowLabelA, 'lane-badge-a', 'text-map-accent', 'text-map-accent', 'bg-map-accent/15')}
        {renderKanbanCol('b', rowLabelB, 'lane-badge-b', 'text-lane-b', 'text-lane-b', 'bg-lane-b/15')}
      </div>
      <ul className="footnotes">
        {[
          `Time = x̄ of ${BENCH_ITERS} runs (µs)`,
          'live step metrics (Visited/Frontier/Path) compared only at the final frame',
          ALGO_FOOTNOTES[algo] ? `A: ${ALGO_FOOTNOTES[algo]}` : '',
          ALGO_FOOTNOTES[algo2] ? `B: ${ALGO_FOOTNOTES[algo2]}` : '',
        ].filter(Boolean).map((t) => <li key={t}>{t}</li>)}
      </ul>
    </section>
  )

  return (
    <div className={`app-shell${fit ? ' app-shell-fit' : ''}`}>
    {theme === 'dnd' && <DndAurora />}
    {theme === 'space' && <SpaceField />}
    <div className="app-main">
    <h1 className="app-title">
      <span>Uninformed &amp; Informed search</span>
      <span className="app-title-sep" aria-hidden="true">·</span>
      <span className="app-title-sub">Romania map</span>
      <ThemeControl theme={theme} onCycle={cycleTheme} busy={roll !== null} />
      <button
        type="button"
        className="mute-toggle"
        aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
        aria-pressed={muted}
        title={muted ? 'Unmute sounds' : 'Mute sounds'}
        onClick={() => { const m = !muted; setMutedFlag(m); if (!m) ensureAudio() }}
      >
        {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
    </h1>

      <div className="tab-bar" role="tablist">
        <button
          role="tab"
          id="tab-map"
          aria-controls="tabpanel-map"
          className={`tab-btn${tab === 'map' ? ' tab-btn-active' : ''}`}
          aria-selected={tab === 'map'}
          onClick={() => setTab('map')}
        >Map</button>
        <button
          role="tab"
          id="tab-guide"
          aria-controls="tabpanel-guide"
          className={`tab-btn${tab === 'guide' ? ' tab-btn-active' : ''}`}
          aria-selected={tab === 'guide'}
          onClick={() => setTab('guide')}
        >Guide</button>
      </div>

      {tab === 'guide' && (
        <div id="tabpanel-guide" role="tabpanel" aria-labelledby="tab-guide" className="guide-page-wrap">
          <Guide />
        </div>
      )}

      {tab === 'map' && <>
      <div className="query-bars-row">
        {/* Map card */}
        <div className="query-bar" role="group" aria-label="Route selection">
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
        {/* Algo card */}
        <div className="query-bar query-bar-algo" role="toolbar" aria-label="Algorithm selection">
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

      <div id="tabpanel-map" role="tabpanel" aria-labelledby="tab-map" className={`workspace${fit ? ' workspace-fit' : ''}`}>
      <main className="app">
        {/* Toolbar — above the map */}
        <div className="toolbar" role="toolbar" aria-label="Visualizer controls">

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

        </div>

        <div className="app-body">
        <div className={`lanes${merged ? ' lanes-merged' : ''}`}>
          {/* Lane A */}
          <div className="lanes-container">
            <section className="lane lane-a" aria-label="Lane A">
              <div className="lane-header">
                <span className="lane-badge lane-badge-a" aria-hidden="true">A</span>
                <span className="lane-algo-name">{meta.label}</span>
              </div>
              {theme === 'space' && <PlanetWindow variant="a" city={currentCityA} nonce={warpA} />}
              <div className="map-wrap">
                <SVGMap
                  algoKey={algo} stepIdx={stepIdx} lastIdx={lastIdx}
                  result={result} hoveredCity={hoveredCity} start={start} goal={goal} showLine={showLine}
                  heatmapValues={heatA}
                  landmarks={laneLandmarkCities(meta.usesLandmarks, lmOverlayA, landmarkA, customA)}
                  onCityClick={onCityClickA} pickLandmarkMode={pickLandmarkMode}
                  showMapBg={theme === 'dnd'}
                  spaceTheme={theme === 'space'}
                />
                <span className="heatmap-legend" aria-label="Heatmap scale"
                  style={{ visibility: showHeatmap ? 'visible' : 'hidden' }}>
                  <span className="heatmap-legend-label">Near</span>
                  <span className="heatmap-legend-bar" aria-hidden="true" />
                  <span className="heatmap-legend-label">Far</span>
                </span>
              </div>
              <div className="map-frame-bar">
                <ul className="legend" aria-label="Node state colors">
                  <li><span className="swatch swatch-current" aria-hidden="true" />Current</li>
                  <li><span className="swatch swatch-frontier" aria-hidden="true" />Frontier</li>
                  <li><span className="swatch swatch-visited" aria-hidden="true" />Visited</li>
                  <li><span className="swatch swatch-path" aria-hidden="true" />Path</li>
                  <li><span className="swatch swatch-unvisited" aria-hidden="true" />Unvisited</li>
                  <li><span className="swatch swatch-start-ring" aria-hidden="true" />Start</li>
                  <li><span className="swatch swatch-goal-ring" aria-hidden="true" />Goal</li>
                </ul>
              </div>
            </section>

            <div className="lane-vs" aria-hidden="true">vs</div>

            <div className="playback-controls">
              <div className="transport">
                <Button variant="outline" size="icon" aria-label="Reset" onClick={handleReset} disabled={stepIdx === 0}><RotateCcw aria-hidden="true" /></Button>
                <Button variant="outline" size="icon" aria-label="Step back" onClick={handleStepBack} disabled={stepIdx === 0}><ChevronLeft aria-hidden="true" /></Button>
                <Button variant="outline" size="icon" aria-label={playing ? 'Pause' : 'Play'} onClick={handlePlayPause}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</Button>
                <Button variant="outline" size="icon" aria-label="Step forward" onClick={handleStepForward} disabled={stepIdx >= largerLastIdx}><ChevronRight aria-hidden="true" /></Button>
              </div>
              <div className="speed toolbar-group-speed">
                <span className="speed-labels"><span>Slow</span><span className="speed-value">{delay}ms</span><span>Fast</span></span>
                <Slider min={MIN_DELAY} max={MAX_DELAY} step={50} value={MAX_DELAY - delay} onValueChange={(v) => setDelay(MAX_DELAY - (Array.isArray(v) ? v[0] : v))} aria-label="Animation speed" />
              </div>
            </div>

            {/* Lane B */}
            <section className="lane lane-b" aria-label="Lane B">
              <div className="lane-header">
                <span className="lane-badge lane-badge-b" aria-hidden="true">B</span>
                <span className="lane-algo-name">{meta2.label}</span>
              </div>
              {theme === 'space' && <PlanetWindow variant="b" city={currentCityB} nonce={warpB} />}
              <div className="map-wrap">
                <SVGMap
                  algoKey={algo2} stepIdx={stepIdx} lastIdx={lastIdx2}
                  result={result2} hoveredCity={hoveredCity} start={start} goal={goal} showLine={showLine}
                  heatmapValues={heatB}
                  landmarks={laneLandmarkCities(meta2.usesLandmarks, lmOverlayB, landmarkB, customB)}
                  onCityClick={onCityClickB} pickLandmarkMode={pickLandmarkMode}
                  showMapBg={theme === 'dnd'}
                  spaceTheme={theme === 'space'}
                />
                <span className="heatmap-legend" aria-label="Heatmap scale"
                  style={{ visibility: showHeatmap ? 'visible' : 'hidden' }}>
                  <span className="heatmap-legend-label">Near</span>
                  <span className="heatmap-legend-bar" aria-hidden="true" />
                  <span className="heatmap-legend-label">Far</span>
                </span>
              </div>
              <div className="map-frame-bar">
                <ul className="legend" aria-label="Node state colors">
                  <li><span className="swatch swatch-current" aria-hidden="true" />Current</li>
                  <li><span className="swatch swatch-frontier" aria-hidden="true" />Frontier</li>
                  <li><span className="swatch swatch-visited" aria-hidden="true" />Visited</li>
                  <li><span className="swatch swatch-path" aria-hidden="true" />Path</li>
                  <li><span className="swatch swatch-unvisited" aria-hidden="true" />Unvisited</li>
                  <li><span className="swatch swatch-start-ring" aria-hidden="true" />Start</li>
                  <li><span className="swatch swatch-goal-ring" aria-hidden="true" />Goal</li>
                </ul>
              </div>
            </section>
          </div>

          {/* Merged single-map view — shown only when “Merge maps” is toggled on */}
          <section className="lane lane-merged" aria-label="Merged map (lane A and B)">
            <div className="lane-header lane-header-merged">
              <span className="lane-badge lane-badge-a" aria-hidden="true">A</span>
              <span className="lane-algo-name">{meta.label}{laneLmSuffix(meta.usesLandmarks, landmarkA, customA)}</span>
              <span className="lane-vs-inline" aria-hidden="true">vs</span>
              <span className="lane-badge lane-badge-b" aria-hidden="true">B</span>
              <span className="lane-algo-name">{meta2.label}{laneLmSuffix(meta2.usesLandmarks, landmarkB, customB)}</span>
              <span className="merged-legend">
                <span className="ml-item"><span className="ml-swatch ml-a" aria-hidden="true" />{meta.label}{laneLmSuffix(meta.usesLandmarks, landmarkA, customA)}</span>
                <span className="ml-item"><span className="ml-swatch ml-b" aria-hidden="true" />{meta2.label}{laneLmSuffix(meta2.usesLandmarks, landmarkB, customB)}</span>
              </span>
            </div>
            {theme === 'space' && (
              <div className="planet-windows">
                <PlanetWindow variant="a" city={currentCityA} nonce={warpA} />
                <PlanetWindow variant="b" city={currentCityB} nonce={warpB} />
              </div>
            )}
            <div className="map-wrap">
              <MergedSVGMap
                stepIdx={stepIdx} lastIdx={lastIdx} lastIdx2={lastIdx2}
                result={result} result2={result2}
                hoveredCity={hoveredCity} start={start} goal={goal} showLine={showLine}
                heatA={heatA} heatB={heatB}
                landmarksA={laneLandmarkCities(meta.usesLandmarks, lmOverlayA, landmarkA, customA)}
                landmarksB={laneLandmarkCities(meta2.usesLandmarks, lmOverlayB, landmarkB, customB)}
                onCityClick={onCityClickMerged} pickLandmarkMode={pickLandmarkMode}
                showMapBg={theme === 'dnd'}
                spaceTheme={theme === 'space'}
              />
              <span className="heatmap-legend" aria-label="Heatmap scale"
                style={{ visibility: showHeatmap ? 'visible' : 'hidden' }}>
                <span className="heatmap-legend-label">Near</span>
                <span className="heatmap-legend-bar" aria-hidden="true" />
                <span className="heatmap-legend-label">Far</span>
              </span>
            </div>
            <div className="map-frame-bar">
              <ul className="legend" aria-label="Node state colors">
                <li><span className="swatch swatch-current" aria-hidden="true" />Current</li>
                <li><span className="swatch swatch-frontier" aria-hidden="true" />Frontier</li>
                <li><span className="swatch swatch-visited" aria-hidden="true" />Visited</li>
                <li><span className="swatch swatch-path" aria-hidden="true" />Path</li>
                <li><span className="swatch swatch-unvisited" aria-hidden="true" />Unvisited</li>
                <li><span className="swatch swatch-start-ring" aria-hidden="true" />Start</li>
                <li><span className="swatch swatch-goal-ring" aria-hidden="true" />Goal</li>
              </ul>
              <span className="map-frame-sep" aria-hidden="true" />
              <div className="flex-row">
              <div className="transport">
                <Button variant="outline" size="icon" aria-label="Reset" onClick={handleReset} disabled={stepIdx === 0}><RotateCcw aria-hidden="true" /></Button>
                <Button variant="outline" size="icon" aria-label="Step back" onClick={handleStepBack} disabled={stepIdx === 0}><ChevronLeft aria-hidden="true" /></Button>
                <Button variant="outline" size="icon" aria-label={playing ? 'Pause' : 'Play'} onClick={handlePlayPause}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</Button>
                <Button variant="outline" size="icon" aria-label="Step forward" onClick={handleStepForward} disabled={stepIdx >= largerLastIdx}><ChevronRight aria-hidden="true" /></Button>
              </div>
              <span className="map-frame-sep" aria-hidden="true" />
              <div className="speed toolbar-group-speed">
                <span className="speed-labels"><span>Slow</span><span className="speed-value">{delay}ms</span><span>Fast</span></span>
                <Slider min={MIN_DELAY} max={MAX_DELAY} step={50} value={MAX_DELAY - delay} onValueChange={(v) => setDelay(MAX_DELAY - (Array.isArray(v) ? v[0] : v))} aria-label="Animation speed" />
              </div>
              </div>
            </div>
          </section>
        </div>

        {statsInSidebar && (
          <aside className="stats-panel" aria-label="Algorithm comparison">
            {statsPanel}
          </aside>
        )}
        </div>{/* .app-body */}
        {!statsInSidebar && statsPanel}
      </main>
      </div>
      </>}
    </div>
      {roll && <ThemeRoll theme={roll.theme} nonce={roll.nonce} />}
    </div>
  )
}

export default ModernApp
