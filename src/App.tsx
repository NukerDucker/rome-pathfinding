import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Dices, Pause, Play, RotateCcw } from 'lucide-react'
import { CITIES, ROMANIA, cityCode, type NodeId } from './romania'
import { ALGORITHMS, pathCost, type Step, type AlgoMeta, type SearchResult } from './search'
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
type EdgeState = 'base' | 'tree' | 'path'
type EdgePair = { a: NodeId; b: NodeId; km: number }
type EdgeView = EdgePair & { state: EdgeState }

// Map geometry (SVG user units, viewBox 600 300 2800 1900).
const NODE_R = 50
const LABEL_H = 65
const LABEL_RX = 18
// Later states paint over earlier ones, so a road on the solution path wins.
const EDGE_ORDER: Record<EdgeState, number> = { base: 0, tree: 1, path: 2 }

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
      const key = edgeKey(id, edge.to)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ a: id, b: edge.to, km: edge.km })
    }
  }
  return out
}

// Roads are undirected; key both endpoints in a fixed order so a parent->child
// tree edge and the base edge it rides on hash the same.
function edgeKey(a: NodeId, b: NodeId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function treeEdgeKeys(
  step: Step,
  parent: Record<NodeId, NodeId | null>,
  start: NodeId,
): Set<string> {
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

// One pass over the road network: every road is drawn exactly once, coloured by
// whether the search currently owns it. Sorted so highlights paint last.
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

// Pill width tracks digit count so 2- and 3-digit distances both sit snugly.
function labelWidth(km: number): number {
  return 60 + String(km).length * 27.5
}

// Random start/goal pair. Drawing the goal from the cities minus the chosen
// start keeps every pair equally likely without a retry loop, and rules out the
// degenerate start === goal search.
function randomPair(): { start: NodeId; goal: NodeId } {
  const start = CITIES[Math.floor(Math.random() * CITIES.length)]
  const rest = CITIES.filter((city) => city !== start)
  return { start, goal: rest[Math.floor(Math.random() * rest.length)] }
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

type SVGMapParams = {
  algoName: string, 
  stepIdx: number, 
  lastIdx: number, 
  result: SearchResult, 
  hoveredCity: NodeId | null, 
  start: NodeId, 
  goal: NodeId,
};

function SVGMap({algoName, stepIdx, lastIdx, result, hoveredCity, start, goal}: SVGMapParams){
  const step: Step = result.steps[Math.min(stepIdx, lastIdx)];
  const isFinalFrame: boolean = stepIdx >= lastIdx;
  const edgeViews: EdgeView[] = buildEdgeViews(
    step,
    result.parent,
    start,
    result.path,
    isFinalFrame && result.found,
  );
  
  return(
    <svg
      className="map"
      viewBox="600 300 2800 1900"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-labelledby="map-title"
      >
      <title id="map-title">Romania road map — {algoName} visualizer</title>
      <rect className="map-bg" x={625} y={325} width={2750} height={1850} rx={80} />

      {edgeViews.map((edge) => (
        <line
        key={`road-${edge.a}-${edge.b}`}
        className={`edge edge-${edge.state}`}
        x1={ROMANIA[edge.a].x}
        y1={ROMANIA[edge.a].y}
        x2={ROMANIA[edge.b].x}
        y2={ROMANIA[edge.b].y}
        />
      ))}

      {edgeViews.map((edge) => {
        const mx = (ROMANIA[edge.a].x + ROMANIA[edge.b].x) / 2
        const my = (ROMANIA[edge.a].y + ROMANIA[edge.b].y) / 2
        const w = labelWidth(edge.km)
        return (
        <g key={`km-${edge.a}-${edge.b}`} className={`edge-label edge-label-${edge.state}`}>
          <rect x={mx - w / 2} y={my - LABEL_H / 2} width={w} height={LABEL_H} rx={LABEL_RX} />
          <text x={mx} y={my} dominantBaseline="central">
          {edge.km}
          </text>
        </g>
        )
      })}

      {CITIES.map((city) => {
        const state = step ? nodeState(city, step, isFinalFrame, result.found, result.path) : 'unvisited'
        const coord = ROMANIA[city]
        const isHovered = city === hoveredCity
        const isStart = city === start && !isFinalFrame
        const isGoal = city === goal && !isFinalFrame
        return (
        <g key={city} className={`node node-${state}${isHovered ? ' node-hover' : ''}`}>
          <title>{city}</title>
          {isHovered && <circle className="node-glow" cx={coord.x} cy={coord.y} r={NODE_R} />}
          {isStart && <circle className="marker-ring marker-start" cx={coord.x} cy={coord.y} r={60} />}
          {isGoal && <circle className="marker-ring marker-goal" cx={coord.x} cy={coord.y} r={60} />}
          <circle cx={coord.x} cy={coord.y} r={NODE_R} />
          <text x={coord.x} y={coord.y} dominantBaseline="central">
          {cityCode(city)}
          </text>
        </g>
        )
      })}
    </svg>
  );
}

type StatsCardParams = {
  meta: AlgoMeta, 
  footnotes: string, 
  result: SearchResult, 
  stepIdx: number, 
  lastIdx: number, 
  pathLabel: string,
};
function StatsCard({meta, footnotes, result, stepIdx, lastIdx, pathLabel}: StatsCardParams){
  const step: Step = result.steps[Math.min(stepIdx, lastIdx)]; 
  const isFinalFrame: boolean = stepIdx >= lastIdx;  
  
  return(
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
        <p className="footnotes">{footnotes ?? ''}</p>

        <hr className="my-3 border-border" />

        <dl className="stats">
          <div className="stats-row">
            <dt>Step</dt>
            <dd>
              {result.steps.length === 0 ? 0 : Math.min(stepIdx, lastIdx) + 1} / {result.steps.length}
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
  );
}

function App() {
  const [algo, setAlgo] = useState('bfs')
  const [algo2, setAlgo2] = useState('bfs')
  
  const [start, setStart] = useState<NodeId>('Arad')
  const [goal, setGoal] = useState<NodeId>('Bucharest')
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [delay, setDelay] = useState(DEFAULT_DELAY)
  const [hoveredCity, setHoveredCity] = useState<NodeId | null>(null)

  const meta = ALGORITHMS[algo]
  const meta2 = ALGORITHMS[algo2]
  const result = meta.run(start, goal)
  const result2 = meta2.run(start, goal)
  const comparison = compareAlgorithms(start, goal)
  const lastIdx = result.steps.length - 1
  const lastIdx2 = result2.steps.length - 1;
  const largerLastIdx = Math.max(lastIdx, lastIdx2);

  useEffect(() => {
    if (!playing || stepIdx >= largerLastIdx) return
    const id = setTimeout(() => {
      if (stepIdx + 1 >= largerLastIdx) setPlaying(false)
      setStepIdx(stepIdx + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [playing, stepIdx, delay, largerLastIdx])

  function handleAlgoChange(next: string) {
    setAlgo(next)
    setStepIdx(0)
    setPlaying(false)
  }
  function handleAlgoChange2(next: string) {
    setAlgo2(next)
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

  function handleRandomize() {
    const next = randomPair()
    setStart(next.start)
    setGoal(next.goal)
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
    setStepIdx((i) => Math.min(largerLastIdx, i + 1))
  }

  function handlePlayPause() {
    if (stepIdx >= largerLastIdx) return
    setPlaying(playing => !playing)
  }

  const pathLabel: string = result.found
    ? `${result.path.join(' → ')} (${result.path.length} cities)`
    : '—'
  const pathLabel2: string = result.found
    ? `${result2.path.join(' → ')} (${result2.path.length} cities)`
    : '—'

  return (
    <>
    <main className="app">
      <section className="map-panel">
      <div className="map-container">
        <SVGMap
          algoName={meta.label}
          stepIdx={stepIdx}
          lastIdx={lastIdx} 
          result={result}
          hoveredCity={hoveredCity}
          start={start}
          goal={goal}
        />
        <SVGMap
          algoName={meta2.label}
          stepIdx={stepIdx}
          lastIdx={lastIdx2} 
          result={result2}
          hoveredCity={hoveredCity}
          start={start}
          goal={goal}
        /> 
      </div>

        <ul className="legend" aria-label="Node state colors">
          <li><span className="swatch swatch-current" aria-hidden="true" />Current</li>
          <li><span className="swatch swatch-frontier" aria-hidden="true" />Frontier</li>
          <li><span className="swatch swatch-visited" aria-hidden="true" />Visited</li>
          <li><span className="swatch swatch-path" aria-hidden="true" />Path</li>
          <li><span className="swatch swatch-unvisited" aria-hidden="true" />Unvisited</li>
          <li><span className="swatch swatch-start-ring" aria-hidden="true" />Start</li>
          <li><span className="swatch swatch-goal-ring" aria-hidden="true" />Goal</li>
        </ul>
        <p className="footnotes">
          Nodes are city initials and edge pills are road distances in km — hover a node for its
          full name.
        </p>

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
            <span id="algo-label">Algorithm</span>
            <Select value={algo2} onValueChange={(v) => v && handleAlgoChange2(v)}>
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

          <Button
            variant="outline"
            size="icon"
            aria-label="Randomize start and goal cities"
            title="Randomize start and goal cities"
            onClick={handleRandomize}
          >
            <Dices aria-hidden="true" />
          </Button>

          <div className="transport">
            <Button variant="outline" size="icon" aria-label="Reset to start" onClick={handleReset} disabled={stepIdx === 0}>
              <RotateCcw aria-hidden="true" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Step back" onClick={handleStepBack} disabled={stepIdx === 0}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={handlePlayPause}
              disabled={stepIdx >= largerLastIdx}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Step forward"
              onClick={handleStepForward}
              disabled={stepIdx >= largerLastIdx}
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
      
      <div className="stats-container">
        <StatsCard
          meta={meta} 
          footnotes={ALGO_FOOTNOTES[algo]}
          result={result}
          stepIdx={stepIdx}
          lastIdx={lastIdx}
          pathLabel={pathLabel}
        />
        <StatsCard
          meta={meta2} 
          footnotes={ALGO_FOOTNOTES[algo2]}
          result={result2}
          stepIdx={stepIdx}
          lastIdx={lastIdx2}
          pathLabel={pathLabel2}
        /> 
      </div>
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
