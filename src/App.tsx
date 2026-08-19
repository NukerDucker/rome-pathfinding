import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Dices, Pause, Play, RotateCcw } from 'lucide-react'
import { CITIES, ROMANIA, cityCode, type NodeId } from './romania'
import { ALGORITHMS, pathCost, type Step, type AlgoMeta, type SearchResult } from './search'
import {
  setALTPreset, getALTPreset,
  setCustomLandmarks, saveALTState, restoreALTState,
  hALTOnly,
  type LandmarkPreset,
} from './heuristic'
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
import './App.css'

const ALGO_FOOTNOTES: Record<string, string> = {
  bfs: '*Optimal if step costs are equal. *Complete if branching factor b is finite.',
  dfs: '*Complete if branching factor b is finite (graph-search via visited set avoids cycles).',
  greedy: '*Not optimal — ignores path cost so far. *Complete if branching factor b is finite (graph-search avoids cycles).',
  astar: '*Optimal if the heuristic is admissible (LP vector-decomposition heuristic, verified admissible). *Complete if branching factor b is finite.',
  astaraltonly: '*Optimal — ALT heuristic admissible by triangle inequality. *Complete if branching factor b is finite. Uses active landmark preset only — no LP component.',
  ucs: 'Optimal and complete for non-negative step costs (graph-search, Dijkstra-equivalent).',
  biucs: 'Optimal and complete for non-negative step costs — searches from both ends and meets in the middle.',
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

function compareAlgorithms(start: NodeId, goal: NodeId): CompareRow[] {
  return Object.entries(ALGORITHMS).map(([key, meta]) => {
    const res = meta.run(start, goal)
    const t0 = performance.now()
    for (let i = 0; i < BENCH_ITERS; i++) meta.run(start, goal)
    const ms = (performance.now() - t0) / BENCH_ITERS
    const peakFrontier = res.steps.reduce((max, s) => Math.max(max, s.frontier.length), 0)
    return {
      key, label: meta.label, ms, peakFrontier,
      generated: res.generated,
      cost: res.found ? pathCost(res.path) : NaN,
      hops: res.found ? res.path.length - 1 : 0,
      found: res.found,
    }
  })
}

type LmAlgoRow = { key: string; label: string; lm2: number; lm4: number; lm8: number }

function landmarkComparison(start: NodeId, goal: NodeId): LmAlgoRow[] {
  // Collect generated counts for every algo at each landmark preset
  const saved = saveALTState()
  const counts: Record<string, { lm2: number; lm4: number; lm8: number }> = {}
  for (const key of Object.keys(ALGORITHMS)) counts[key] = { lm2: 0, lm4: 0, lm8: 0 }

  for (const preset of ['lm2', 'lm4', 'lm8'] as const) {
    setALTPreset(preset)
    for (const [key, meta] of Object.entries(ALGORITHMS)) {
      counts[key][preset] = meta.run(start, goal).generated
    }
  }
  restoreALTState(saved)

  return Object.entries(ALGORITHMS).map(([key, meta]) => ({
    key, label: meta.label, ...counts[key],
  }))
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

type SVGMapParams = {
  algoKey: string
  stepIdx: number
  lastIdx: number
  result: SearchResult
  hoveredCity: NodeId | null
  start: NodeId
  goal: NodeId
  showArc: boolean
  heatmapValues?: Record<NodeId, number>
  customLandmarks?: NodeId[]
  onCityClick?: (city: NodeId) => void
  pickLandmarkMode?: boolean
}

function SVGMap({ algoKey, stepIdx, lastIdx, result, hoveredCity, start, goal, showArc, heatmapValues, customLandmarks, onCityClick, pickLandmarkMode }: SVGMapParams) {
  const step: Step = result.steps[Math.min(stepIdx, lastIdx)]
  const isFinalFrame: boolean = stepIdx >= lastIdx
  const edgeViews: EdgeView[] = buildEdgeViews(
    step, result.parent, start, result.path, isFinalFrame && result.found,
  )

  return (
    <svg
      className="map"
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

      {showArc && (algoKey === 'greedy' || algoKey === 'astar' || algoKey === 'astaralt' || algoKey === 'biastar') && renderArcEdges(start, goal)}

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
            const hue = Math.round(norm * 240)
            return (
              <circle
                key={`heat-${city}`}
                cx={coord.x} cy={coord.y}
                r={NODE_R + 14}
                fill={`hsl(${hue}, 85%, 55%)`}
                opacity={0.75}
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
        const isCustomLandmark = customLandmarks?.includes(city) ?? false
        return (
          <g
            key={city}
            className={`node node-${state}${isHovered ? ' node-hover' : ''}${pickLandmarkMode ? ' node-clickable' : ''}`}
            onClick={() => onCityClick?.(city)}
          >
            <title>{city}{isCustomLandmark ? ' ★ landmark' : ''}</title>
            {isHovered && <circle className="node-glow" cx={coord.x} cy={coord.y} r={NODE_R} />}
            {isStart && <circle className="marker-ring marker-start" cx={coord.x} cy={coord.y} r={60} />}
            {isGoal && <circle className="marker-ring marker-goal" cx={coord.x} cy={coord.y} r={60} />}
            {isCustomLandmark && <circle className="marker-ring marker-landmark" cx={coord.x} cy={coord.y} r={70} />}
            <circle cx={coord.x} cy={coord.y} r={NODE_R} />
            <text x={coord.x} y={coord.y} dominantBaseline="central">{cityCode(city)}</text>
          </g>
        )
      })}
    </svg>
  )
}

type StatsCardParams = {
  meta: AlgoMeta
  footnotes: string
  result: SearchResult
  stepIdx: number
  lastIdx: number
  pathLabel: string
}

function StatsCard({ meta, footnotes, result, stepIdx, lastIdx, pathLabel }: StatsCardParams) {
  const step: Step = result.steps[Math.min(stepIdx, lastIdx)]
  const isFinalFrame: boolean = stepIdx >= lastIdx

  return (
    <div className="stats-strip">
      <dl className="stats-live">
        <div className="stats-row">
          <dt>Step</dt>
          <dd>{result.steps.length === 0 ? 0 : Math.min(stepIdx, lastIdx) + 1} / {result.steps.length}</dd>
        </div>
        <div className="stats-row">
          <dt>Current</dt>
          <dd>{step?.current ?? '—'}</dd>
        </div>
        <div className="stats-row">
          <dt>Visited</dt>
          <dd>{step?.visited.length ?? 0}</dd>
        </div>
        <div className="stats-row">
          <dt>Frontier</dt>
          <dd>{step?.frontier.length ?? 0}</dd>
        </div>
        <div className="stats-row">
          <dt>Generated</dt>
          <dd>{result.generated}</dd>
        </div>
        <div className="stats-row path-row">
          <dt>Path</dt>
          <dd>{isFinalFrame ? pathLabel : '—'}</dd>
        </div>
      </dl>
      <details className="stats-theory">
        <summary>Complexity &amp; properties</summary>
        <dl className="stats-live stats-theory-body">
          <div className="stats-row"><dt>Time</dt><dd>{meta.time}</dd></div>
          <div className="stats-row"><dt>Space</dt><dd>{meta.space}</dd></div>
          <div className="stats-row"><dt>Optimal</dt><dd>{meta.optimal}</dd></div>
          <div className="stats-row"><dt>Complete</dt><dd>{meta.complete}</dd></div>
        </dl>
        <p className="footnotes">{footnotes ?? ''}</p>
      </details>
    </div>
  )
}

function App() {
  const [algo, setAlgo] = useState('greedy')
  const [algo2, setAlgo2] = useState('astar')

  const [start, setStart] = useState<NodeId>('Arad')
  const [goal, setGoal] = useState<NodeId>('Bucharest')
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [delay, setDelay] = useState(DEFAULT_DELAY)
  const [hoveredCity, setHoveredCity] = useState<NodeId | null>(null)
  const [showArc, setShowArc] = useState(false)
  const [landmarkPreset, setLandmarkPreset] = useState<LandmarkPreset>(getALTPreset())
  const [customLandmarks, setCustomLandmarksState] = useState<NodeId[]>([])
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [pickLandmarkMode, setPickLandmarkMode] = useState(false)

  const meta = ALGORITHMS[algo]
  const meta2 = ALGORITHMS[algo2]
  // ponytail: landmarkPreset in deps so memos recompute after setALTPreset side-effect
  const result = useMemo(() => meta.run(start, goal), [meta, start, goal, landmarkPreset])
  const result2 = useMemo(() => meta2.run(start, goal), [meta2, start, goal, landmarkPreset])
  const comparison = useMemo(() => compareAlgorithms(start, goal), [start, goal, landmarkPreset])
  // ponytail: runs all 3 presets then restores full ALT state — side-effect safe, 3× A* on 20 nodes
  const lmRows = useMemo(() => landmarkComparison(start, goal), [start, goal])

  // h-value heatmap: normalized hALTOnly(n, goal) across all cities. Static per goal+preset.
  const heatmapValues = useMemo<Record<NodeId, number> | undefined>(() => {
    if (!showHeatmap) return undefined
    const vals: Record<NodeId, number> = {}
    let max = 0
    for (const city of CITIES) {
      vals[city] = hALTOnly(city, goal)
      if (vals[city] > max) max = vals[city]
    }
    if (max === 0) return undefined
    for (const city of CITIES) vals[city] /= max
    return vals
  }, [showHeatmap, goal, landmarkPreset, customLandmarks])

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
  function handleLandmarkChange(next: LandmarkPreset) {
    if (next !== 'custom') {
      setALTPreset(next)
      setCustomLandmarks([])
      setCustomLandmarksState([])
    }
    setLandmarkPreset(next)
    setStepIdx(0)
    setPlaying(false)
  }

  function handleCityClick(city: NodeId) {
    if (!pickLandmarkMode) return
    const next = customLandmarks.includes(city)
      ? customLandmarks.filter((c) => c !== city)
      : [...customLandmarks, city]
    setCustomLandmarksState(next)
    setCustomLandmarks(next) // updates global _customALTFn
    setLandmarkPreset(next.length > 0 ? 'custom' : 'lm8')
    setStepIdx(0)
    setPlaying(false)
  }

  function handlePickLandmarkToggle() {
    if (pickLandmarkMode) {
      // exiting pick mode — clear custom landmarks, revert to lm8
      setPickLandmarkMode(false)
      setCustomLandmarksState([])
      setCustomLandmarks([])
      if (landmarkPreset === 'custom') {
        setLandmarkPreset('lm8')
        setALTPreset('lm8')
      }
    } else {
      setPickLandmarkMode(true)
    }
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

  // Fix: pathLabel2 uses result2.found (was incorrectly using result.found)
  const pathLabel = result.found
    ? `${result.path.join(' → ')} (${result.path.length} cities)`
    : '—'
  const pathLabel2 = result2.found
    ? `${result2.path.join(' → ')} (${result2.path.length} cities)`
    : '—'

  return (
    <>
      <header className="app-header">
        <div className="app-header-brand">
          <h1 className="app-title">Romania Search Lab</h1>
          <span className="app-subtitle">Uninformed &amp; informed search · AIMA Romania map</span>
        </div>
        <div className="app-header-controls">
          <div className="control">
            <span id="start-label" className="control-label">Start</span>
            <Select
              value={start}
              onValueChange={(v) => v && handleStartChange(v as NodeId)}
              onOpenChange={(open) => !open && setHoveredCity(null)}
            >
              <SelectTrigger className="w-36" aria-labelledby="start-label"><SelectValue /></SelectTrigger>
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
          </div>
          <div className="control">
            <span id="goal-label" className="control-label">Goal</span>
            <Select
              value={goal}
              onValueChange={(v) => v && handleGoalChange(v as NodeId)}
              onOpenChange={(open) => !open && setHoveredCity(null)}
            >
              <SelectTrigger className="w-36" aria-labelledby="goal-label"><SelectValue /></SelectTrigger>
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
          </div>
          <div className="control">
            <span id="landmark-label" className="control-label">Landmarks</span>
            <Select value={landmarkPreset} onValueChange={(v) => v && handleLandmarkChange(v as LandmarkPreset)}>
              <SelectTrigger className="w-28" aria-labelledby="landmark-label"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lm2">2 landmarks</SelectItem>
                <SelectItem value="lm4">4 landmarks</SelectItem>
                <SelectItem value="lm8">8 landmarks</SelectItem>
                {landmarkPreset === 'custom' && (
                  <SelectItem value="custom">Custom ({customLandmarks.length})</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline" size="icon"
            aria-label="Randomize start and goal cities"
            title="Randomize"
            onClick={handleRandomize}
          >
            <Dices aria-hidden="true" />
          </Button>
        </div>
      </header>

      <main className="app">
        <div className="lanes">
          {/* Lane A */}
          <section className="lane lane-a" aria-label="Lane A">
            <div className="lane-header">
              <span className="lane-badge lane-badge-a" aria-hidden="true">A</span>
              <span id="algo-label-a" className="control-label">Algorithm</span>
              <Select value={algo} onValueChange={(v) => v && handleAlgoChange(v)}>
                <SelectTrigger className="w-40" aria-labelledby="algo-label-a">
                  <SelectValue>{ALGORITHMS[algo]?.label ?? algo}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ALGORITHMS).map(([key, m]) => (
                    <SelectItem key={key} value={key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="lane-complexity">{meta.time}</span>
            </div>
            <SVGMap
              algoKey={algo} stepIdx={stepIdx} lastIdx={lastIdx}
              result={result} hoveredCity={hoveredCity} start={start} goal={goal} showArc={showArc}
              heatmapValues={heatmapValues} customLandmarks={customLandmarks}
              onCityClick={handleCityClick} pickLandmarkMode={pickLandmarkMode}
            />
            <StatsCard
              meta={meta} footnotes={ALGO_FOOTNOTES[algo]}
              result={result} stepIdx={stepIdx} lastIdx={lastIdx} pathLabel={pathLabel}
            />
          </section>

          <div className="lane-vs" aria-hidden="true">vs</div>

          {/* Lane B */}
          <section className="lane lane-b" aria-label="Lane B">
            <div className="lane-header">
              <span className="lane-badge lane-badge-b" aria-hidden="true">B</span>
              <span id="algo-label-b" className="control-label">Algorithm</span>
              <Select value={algo2} onValueChange={(v) => v && handleAlgoChange2(v)}>
                <SelectTrigger className="w-40" aria-labelledby="algo-label-b">
                  <SelectValue>{ALGORITHMS[algo2]?.label ?? algo2}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ALGORITHMS).map(([key, m]) => (
                    <SelectItem key={key} value={key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="lane-complexity">{meta2.time}</span>
            </div>
            <SVGMap
              algoKey={algo2} stepIdx={stepIdx} lastIdx={lastIdx2}
              result={result2} hoveredCity={hoveredCity} start={start} goal={goal} showArc={showArc}
              heatmapValues={heatmapValues} customLandmarks={customLandmarks}
              onCityClick={handleCityClick} pickLandmarkMode={pickLandmarkMode}
            />
            <StatsCard
              meta={meta2} footnotes={ALGO_FOOTNOTES[algo2]}
              result={result2} stepIdx={stepIdx} lastIdx={lastIdx2} pathLabel={pathLabel2}
            />
          </section>
        </div>

        {/* Control dock — sticky bottom */}
        <div className="control-dock">
          <ul className="legend" aria-label="Node state colors">
            <li><span className="swatch swatch-current" aria-hidden="true" />Current</li>
            <li><span className="swatch swatch-frontier" aria-hidden="true" />Frontier</li>
            <li><span className="swatch swatch-visited" aria-hidden="true" />Visited</li>
            <li><span className="swatch swatch-path" aria-hidden="true" />Path</li>
            <li><span className="swatch swatch-unvisited" aria-hidden="true" />Unvisited</li>
            <li><span className="swatch swatch-start-ring" aria-hidden="true" />Start</li>
            <li><span className="swatch swatch-goal-ring" aria-hidden="true" />Goal</li>
            <li>
              <Button
                variant={showArc ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowArc(v => !v)}
                aria-pressed={showArc}
                title="Toggle heuristic arc overlay (Greedy / A* only)"
                className="arc-toggle-btn"
              >
                <span className="swatch swatch-arc" aria-hidden="true" />
                Arc overlay
              </Button>
            </li>
            <li>
              <Button
                variant={showHeatmap ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowHeatmap(v => !v)}
                aria-pressed={showHeatmap}
                title="Show h-value heatmap — red=near goal, blue=far"
              >
                🌡 Heatmap
              </Button>
            </li>
            {showHeatmap && (
              <li className="heatmap-legend" aria-label="Heatmap legend">
                <span className="heatmap-legend-label">Near goal</span>
                <span className="heatmap-legend-bar" aria-hidden="true" />
                <span className="heatmap-legend-label">Far</span>
              </li>
            )}
            <li>
              <Button
                variant={pickLandmarkMode ? 'default' : 'outline'}
                size="sm"
                onClick={handlePickLandmarkToggle}
                aria-pressed={pickLandmarkMode}
                title="Click cities to set custom landmarks for ALT heuristic"
              >
                ★ {pickLandmarkMode ? `Landmarks (${customLandmarks.length})` : 'Pick landmarks'}
              </Button>
            </li>
          </ul>

          <div className="transport">
            <Button variant="outline" size="icon" aria-label="Reset to start" onClick={handleReset} disabled={stepIdx === 0}>
              <RotateCcw aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Step back" onClick={handleStepBack} disabled={stepIdx === 0}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline" size="icon"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={handlePlayPause}
              disabled={false}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
            <Button variant="outline" size="icon" aria-label="Step forward" onClick={handleStepForward} disabled={stepIdx >= largerLastIdx}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>

          <div className="control speed">
            <span className="speed-labels">
              <span>Slow</span>
              <span className="speed-value">{delay}ms</span>
              <span>Fast</span>
            </span>
            <Slider
              min={MIN_DELAY} max={MAX_DELAY} step={50}
              value={MAX_DELAY - delay}
              onValueChange={(v) => setDelay(MAX_DELAY - (Array.isArray(v) ? v[0] : v))}
              aria-label="Animation speed, slow to fast"
            />
          </div>
        </div>

      <section className="compare-panel" aria-labelledby="compare-title">
        <Card>
          <CardContent>
            <h2 id="compare-title">Algorithm comparison — {start} → {goal}</h2>
            <div className="compare-scroll">
              <table className="compare">
                <thead>
                  <tr>
                    <th scope="col">Algorithm</th>
                    <th scope="col">Time (ms)</th>
                    <th scope="col">Memory (peak frontier)</th>
                    <th scope="col">Generated</th>
                    <th scope="col">Path cost (km)</th>
                    <th scope="col">Hops</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => {
                    const isA = row.key === algo
                    const isB = row.key === algo2
                    const rowClass = isA && isB ? 'row-lane-ab' : isA ? 'row-lane-a' : isB ? 'row-lane-b' : ''
                    return (
                      <tr key={row.key} className={rowClass}>
                        <th scope="row">
                          {isA && <span className="lane-badge lane-badge-a">A</span>}
                          {isB && !isA && <span className="lane-badge lane-badge-b">B</span>}
                          {isA && isB && <span className="lane-badge lane-badge-b">B</span>}
                          {' '}{row.label}
                        </th>
                        <td>{row.ms.toFixed(3)}</td>
                        <td>{row.peakFrontier}</td>
                        <td>{row.generated}</td>
                        <td>{row.found ? row.cost : '—'}</td>
                        <td>{row.found ? row.hops : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="footnotes">
              Time = mean of {BENCH_ITERS} runs. Memory = peak frontier size (space proxy). Path cost = Σ road km (lower = better quality).
            </p>
          </CardContent>
        </Card>
      </section>
      <section className="compare-panel" aria-labelledby="lm-compare-title">
        <Card>
          <CardContent>
            <h2 id="lm-compare-title">Landmark count effect — nodes generated — {start} → {goal}</h2>
            <p className="footnotes" style={{ marginBottom: '0.75rem' }}>
              Nodes generated per algorithm at 2 / 4 / 8 landmarks. Uninformed algos are unaffected (same value all columns). Fewer = tighter heuristic.
            </p>
            <div className="compare-scroll">
              <table className="compare">
                <thead>
                  <tr>
                    <th scope="col">Algorithm</th>
                    <th scope="col">2 landmarks</th>
                    <th scope="col">4 landmarks</th>
                    <th scope="col">8 landmarks ★</th>
                  </tr>
                </thead>
                <tbody>
                  {lmRows.map((row) => {
                    const isA = row.key === algo
                    const isB = row.key === algo2
                    const rowClass = isA && isB ? 'row-lane-ab' : isA ? 'row-lane-a' : isB ? 'row-lane-b' : ''
                    const affected = row.lm2 !== row.lm8 || row.lm4 !== row.lm8
                    return (
                      <tr key={row.key} className={rowClass}>
                        <th scope="row">
                          {isA && <span className="lane-badge lane-badge-a">A</span>}
                          {isB && !isA && <span className="lane-badge lane-badge-b">B</span>}
                          {isA && isB && <span className="lane-badge lane-badge-b">B</span>}
                          {' '}{row.label}
                        </th>
                        <td style={{ opacity: affected ? 1 : 0.4 }}>{row.lm2}</td>
                        <td style={{ opacity: affected ? 1 : 0.4 }}>{row.lm4}</td>
                        <td style={{ opacity: affected ? 1 : 0.4, fontWeight: affected ? 600 : undefined }}>{row.lm8}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
      </main>
    </>
  )
}

export default App
