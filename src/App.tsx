import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { CITIES, ROMANIA, type NodeId } from './romania'
import { ALGORITHMS, pathCost, type Step } from './search'
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
}

type NodeState = 'unvisited' | 'frontier' | 'current' | 'visited' | 'path'
type EdgePair = { a: NodeId; b: NodeId }

const MIN_DELAY = 0
const MAX_DELAY = 1500
const DEFAULT_DELAY = 600
const BENCH_ITERS = 400 // averaging window for execution-time measurement

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

// Run every registered algorithm on the same start/goal and collect metrics:
// execution time (mean of BENCH_ITERS runs), memory (peak frontier size),
// solution quality (path cost in km). Peak frontier derives from steps —
// no search-internal contract change needed.
function compareAlgorithms(start: NodeId, goal: NodeId): CompareRow[] {
  return Object.entries(ALGORITHMS).map(([key, meta]) => {
    const res = meta.run(start, goal)
    const t0 = performance.now()
    for (let i = 0; i < BENCH_ITERS; i++) meta.run(start, goal)
    const ms = (performance.now() - t0) / BENCH_ITERS
    const peakFrontier = res.steps.reduce((max, s) => Math.max(max, s.frontier.length), 0)
    return {
      key,
      label: meta.label,
      ms,
      peakFrontier,
      generated: res.generated,
      cost: res.found ? pathCost(res.path) : NaN,
      hops: res.found ? res.path.length - 1 : 0,
      found: res.found,
    }
  })
}

const BASE_EDGES: EdgePair[] = buildBaseEdges()

function buildBaseEdges(): EdgePair[] {
  const seen = new Set<string>()
  const out: EdgePair[] = []
  for (const id of CITIES) {
    for (const edge of ROMANIA[id].edges) {
      const key = [id, edge.to].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ a: id, b: edge.to })
    }
  }
  return out
}

function nodeState(
  node: NodeId,
  step: Step,
  isFinalFrame: boolean,
  found: boolean,
  path: NodeId[],
): NodeState {
  if (isFinalFrame && found && path.includes(node)) return 'path'
  if (node === step.current) return 'current'
  if (step.frontier.includes(node)) return 'frontier'
  if (step.visited.includes(node)) return 'visited'
  return 'unvisited'
}

function renderTreeEdges(step: Step, parent: Record<NodeId, NodeId | null>, start: NodeId) {
  const nodes = new Set<NodeId>([...step.visited, ...step.frontier, step.current])
  const edges = []
  for (const n of nodes) {
    if (n === start) continue
    const p = parent[n]
    if (p === undefined || p === null) continue
    edges.push(
      <line
        key={`tree-${p}-${n}`}
        className="edge-tree"
        x1={ROMANIA[p].x}
        y1={ROMANIA[p].y}
        x2={ROMANIA[n].x}
        y2={ROMANIA[n].y}
      />,
    )
  }
  return edges
}

function renderPathEdges(path: NodeId[]) {
  const edges = []
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    edges.push(
      <line
        key={`path-${a}-${b}`}
        className="edge-path"
        x1={ROMANIA[a].x}
        y1={ROMANIA[a].y}
        x2={ROMANIA[b].x}
        y2={ROMANIA[b].y}
      />,
    )
  }
  return edges
}

function App() {
  const [algo, setAlgo] = useState('bfs')
  const [start, setStart] = useState<NodeId>('Arad')
  const [goal, setGoal] = useState<NodeId>('Bucharest')
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [delay, setDelay] = useState(DEFAULT_DELAY)
  const [hoveredCity, setHoveredCity] = useState<NodeId | null>(null)

  const meta = ALGORITHMS[algo]
  const result = meta.run(start, goal)
  const comparison = compareAlgorithms(start, goal)
  const lastIdx = result.steps.length - 1
  const clampedIdx = Math.min(stepIdx, Math.max(lastIdx, 0))
  const step: Step | undefined = result.steps[clampedIdx]
  const isFinalFrame = clampedIdx === lastIdx

  useEffect(() => {
    if (!playing || stepIdx >= lastIdx) return
    const id = setTimeout(() => {
      if (stepIdx + 1 >= lastIdx) setPlaying(false)
      setStepIdx(stepIdx + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [playing, stepIdx, delay, lastIdx])

  function handleAlgoChange(next: string) {
    setAlgo(next)
    setStepIdx(0)
    setPlaying(false)
  }

  function handleStartChange(next: NodeId) {
    setStart(next)
    setStepIdx(0)
    setPlaying(false)
  }

  function handleGoalChange(next: NodeId) {
    setGoal(next)
    setStepIdx(0)
    setPlaying(false)
  }

  function handleReset() {
    setStepIdx(0)
    setPlaying(false)
  }

  function handleStepBack() {
    setPlaying(false)
    setStepIdx((i) => Math.max(0, i - 1))
  }

  function handleStepForward() {
    setPlaying(false)
    setStepIdx((i) => Math.min(lastIdx, i + 1))
  }

  function handlePlayPause() {
    if (clampedIdx >= lastIdx) return
    setPlaying((p) => !p)
  }

  const pathLabel = result.found
    ? `${result.path.join(' → ')} (${result.path.length} cities)`
    : '—'

  return (
    <>
    <main className="app">
      <section className="map-panel">
        <svg
          className="map"
          viewBox="-40 -30 640 490"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby="map-title"
        >
          <title id="map-title">Romania road map — {meta.label} visualizer</title>
          {BASE_EDGES.map((edge) => (
            <line
              key={`${edge.a}-${edge.b}`}
              className="edge-base"
              x1={ROMANIA[edge.a].x}
              y1={ROMANIA[edge.a].y}
              x2={ROMANIA[edge.b].x}
              y2={ROMANIA[edge.b].y}
            />
          ))}
          {step && renderTreeEdges(step, result.parent, start)}
          {step && isFinalFrame && result.found && renderPathEdges(result.path)}
          {CITIES.map((city) => {
            const state = step ? nodeState(city, step, isFinalFrame, result.found, result.path) : 'unvisited'
            const coord = ROMANIA[city]
            const isHovered = city === hoveredCity
            const isStart = city === start && !isFinalFrame
            const isGoal = city === goal && !isFinalFrame
            return (
              <g key={city} className={`node node-${state}${isHovered ? ' node-hover' : ''}`}>
                {isHovered && <circle className="node-glow" cx={coord.x} cy={coord.y} r={14} />}
                {isStart && <circle className="marker-ring marker-start" cx={coord.x} cy={coord.y} r={19} />}
                {isGoal && <circle className="marker-ring marker-goal" cx={coord.x} cy={coord.y} r={16.5} />}
                <circle cx={coord.x} cy={coord.y} r={14} />
                <text x={coord.x} y={coord.y - 20}>
                  {city}
                </text>
              </g>
            )
          })}
        </svg>

        <ul className="legend" aria-label="Node state colors">
          <li><span className="swatch swatch-current" aria-hidden="true" />Current</li>
          <li><span className="swatch swatch-frontier" aria-hidden="true" />Frontier</li>
          <li><span className="swatch swatch-visited" aria-hidden="true" />Visited</li>
          <li><span className="swatch swatch-path" aria-hidden="true" />Path</li>
          <li><span className="swatch swatch-unvisited" aria-hidden="true" />Unvisited</li>
          <li><span className="swatch swatch-start-ring" aria-hidden="true" />Start</li>
          <li><span className="swatch swatch-goal-ring" aria-hidden="true" />Goal</li>
        </ul>

        <div className="controls">
          <div className="control">
            <span id="algo-label">Algorithm</span>
            <Select value={algo} onValueChange={(v) => v && handleAlgoChange(v)}>
              <SelectTrigger className="w-36" aria-labelledby="algo-label">
                <SelectValue>{(v) => ALGORITHMS[v as string]?.label ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ALGORITHMS).map(([key, algoMeta]) => (
                  <SelectItem key={key} value={key}>
                    {algoMeta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="control">
            <span id="start-label">Start</span>
            <Select
              value={start}
              onValueChange={(v) => v && handleStartChange(v as NodeId)}
              onOpenChange={(open) => !open && setHoveredCity(null)}
            >
              <SelectTrigger className="w-36" aria-labelledby="start-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map((city) => (
                  <SelectItem
                    key={city}
                    value={city}
                    onMouseEnter={() => setHoveredCity(city)}
                    onMouseLeave={() => setHoveredCity(null)}
                  >
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="control">
            <span id="goal-label">Goal</span>
            <Select
              value={goal}
              onValueChange={(v) => v && handleGoalChange(v as NodeId)}
              onOpenChange={(open) => !open && setHoveredCity(null)}
            >
              <SelectTrigger className="w-36" aria-labelledby="goal-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map((city) => (
                  <SelectItem
                    key={city}
                    value={city}
                    onMouseEnter={() => setHoveredCity(city)}
                    onMouseLeave={() => setHoveredCity(null)}
                  >
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="transport">
            <Button variant="outline" size="icon" aria-label="Reset to start" onClick={handleReset} disabled={clampedIdx === 0}>
              <RotateCcw aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Step back" onClick={handleStepBack} disabled={clampedIdx === 0}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={handlePlayPause}
              disabled={clampedIdx >= lastIdx}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Step forward"
              onClick={handleStepForward}
              disabled={clampedIdx >= lastIdx}
            >
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
              min={MIN_DELAY}
              max={MAX_DELAY}
              step={50}
              value={MAX_DELAY - delay}
              onValueChange={(v) => setDelay(MAX_DELAY - (Array.isArray(v) ? v[0] : v))}
              aria-label="Animation speed, slow to fast"
            />
          </div>
        </div>
      </section>

      <Card className="stats-panel">
        <CardContent>
          <h1>{meta.label} Pathfinding</h1>
          <dl className="stats">
            <div className="stats-row">
              <dt>Algorithm</dt>
              <dd>{meta.label}</dd>
            </div>
            <div className="stats-row">
              <dt>Time</dt>
              <dd>{meta.time}</dd>
            </div>
            <div className="stats-row">
              <dt>Space</dt>
              <dd>{meta.space}</dd>
            </div>
            <div className="stats-row">
              <dt>Optimal</dt>
              <dd>{meta.optimal}</dd>
            </div>
            <div className="stats-row">
              <dt>Complete</dt>
              <dd>{meta.complete}</dd>
            </div>
          </dl>
          <p className="footnotes">{ALGO_FOOTNOTES[algo] ?? ''}</p>

          <hr className="my-3 border-border" />

          <dl className="stats">
            <div className="stats-row">
              <dt>Step</dt>
              <dd>
                {result.steps.length === 0 ? 0 : clampedIdx + 1} / {result.steps.length}
              </dd>
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
        </CardContent>
      </Card>
    </main>

      <section className="compare-panel" aria-labelledby="compare-title">
        <Card>
          <CardContent>
            <h2 id="compare-title">
              Algorithm comparison — {start} → {goal}
            </h2>
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
                  {comparison.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td>{row.ms.toFixed(3)}</td>
                      <td>{row.peakFrontier}</td>
                      <td>{row.generated}</td>
                      <td>{row.found ? row.cost : '—'}</td>
                      <td>{row.found ? row.hops : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="footnotes">
              Time = mean of {BENCH_ITERS} runs. Memory = peak frontier size (space proxy). Path
              cost = Σ road km (lower = better quality).
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  )
}

export default App
