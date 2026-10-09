// State + derivation + playback for the game-style UI.
// Ported from origin/ui-game:script.js — withAltConfig/benchmarkOne/
// landmarkEffect/heatmapFor/recompute/renderTable/playback are form-for-form
// translations of the original; the React hook replaces the module-level
// `state` object and the DOM control readers.
import { useCallback, useEffect, useMemo, useState } from 'react'
import katex from 'katex'
import { ALGORITHMS, pathCost, type AlgoMeta, type SearchResult } from '@/search'
import { CITIES, cityCode, type NodeId } from '@/romania'
import {
  altHWith,
  restoreALTState,
  saveALTState,
  setALTPreset,
  setCustomLandmarks,
  type LandmarkPreset,
} from '@/heuristic'
import { LANDMARK_PRESETS } from '@/alt'
import { cached, gameBenchCache, heatCache, lmEffectCache } from '@/game/benchCache'

export const BENCH_ITERS = 400
export const MAX_DELAY = 1500 // speed slider max; step delay = MAX_DELAY - slider value
export const LM_SHORT = { lm2: '2', lm4: '4', lm8: '8' } as const

export type Lane = 'A' | 'B'
export type LaneCount = keyof typeof LM_SHORT // 'lm2' | 'lm4' | 'lm8'
export type LaneState = { count: LaneCount; custom: NodeId[]; overlay: boolean }

// Options sorted alphabetically by label, like the original UI
export const ALGO_OPTIONS = Object.entries(ALGORITHMS).sort(([, a], [, b]) => a.label.localeCompare(b.label))

export type Bench = {
  ms: number
  peakFrontier: number
  generated: number
  cost: number
  hops: number
  found: boolean
}
export type LaneDerived = {
  meta: AlgoMeta
  result: SearchResult
  bench: Bench
  lmEffect: Record<LaneCount, number> | null
  last: number
  heat: Record<NodeId, number> | null
}
export type Derived = { A: LaneDerived; B: LaneDerived; largestLast: number }

const laneCfg = (l: LaneState): LandmarkPreset => (l.custom.length > 0 ? 'custom' : l.count)

// Point the module-level ALT heuristic at a lane's preset/custom set, run fn,
// then restore whatever ALT state was active before (keeps lanes independent).
function withAltConfig<T>(preset: LandmarkPreset, custom: readonly NodeId[], fn: () => T): T {
  const saved = saveALTState()
  if (preset === 'custom') {
    if (custom.length > 0) setCustomLandmarks([...custom])
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

// Mean wall time over BENCH_ITERS runs, plus peak frontier as a space proxy
function benchmarkOne(meta: AlgoMeta, start: NodeId, goal: NodeId, cfg: LandmarkPreset, custom: readonly NodeId[]): Bench {
  // Cached across mounts: the 400-run mean is machine-stable, so re-running it
  // on every remount only produced a long task, not a better number.
  return cached(gameBenchCache, `${meta.label}|${start}|${goal}|${cfg}|${custom.join(',')}`, () =>
    withAltConfig(cfg, custom, () => {
    const res = meta.run(start, goal)
    const t0 = performance.now()
    for (let i = 0; i < BENCH_ITERS; i++) meta.run(start, goal)
    const ms = (performance.now() - t0) / BENCH_ITERS
    const peakFrontier = res.steps.reduce((max, s) => Math.max(max, s.frontier.length), 0)
    return {
      ms,
      peakFrontier,
      generated: res.generated,
      cost: res.found ? pathCost(res.path) : NaN,
      hops: res.found ? res.path.length - 1 : 0,
      found: res.found,
    }
  }))
}

// Nodes generated under each landmark preset; null for non-landmark algorithms
function landmarkEffect(meta: AlgoMeta, start: NodeId, goal: NodeId): Record<LaneCount, number> | null {
  if (!meta.usesLandmarks) return null
  // cfg-independent (the presets are reset inside), so the key has no cfg part
  return cached(lmEffectCache, `${meta.label}|${start}|${goal}`, () => {
    const saved = saveALTState()
    try {
      const out = {} as Record<LaneCount, number>
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

// Normalised ALT h-values toward the goal (0 = near, 1 = far)
function heatmapFor(goal: NodeId, preset: LandmarkPreset, custom: readonly NodeId[]): Record<NodeId, number> | null {
  return cached(heatCache, `${goal}|${preset}|${custom.join(',')}`, () => {
    const vals: Record<NodeId, number> = {}
    let max = 0
    for (const city of CITIES) {
      vals[city] = altHWith(city, goal, preset, custom)
      if (vals[city] > max) max = vals[city]
    }
    if (max === 0) return null
    for (const city of CITIES) vals[city] /= max
    return vals
  })
}

export function randomPair(): { start: NodeId; goal: NodeId } {
  const start = CITIES[Math.floor(Math.random() * CITIES.length)]
  const rest = CITIES.filter((city) => city !== start)
  return { start, goal: rest[Math.floor(Math.random() * rest.length)] }
}

// Landmark cities a lane draws: active for landmark algorithms, or when the
// user opted into the overlay. Custom picks win over the preset.
export function landmarkCitiesFor(meta: AlgoMeta, l: LaneState): NodeId[] {
  if (!meta.usesLandmarks && !l.overlay) return []
  return l.custom.length > 0 ? l.custom : LANDMARK_PRESETS[l.count]
}

export function laneLmSuffix(meta: AlgoMeta, l: LaneState): string {
  if (!meta.usesLandmarks) return ''
  return l.custom.length > 0 ? ` · Custom (${l.custom.length})` : ` · ${LM_SHORT[l.count]} Landmark`
}

export type GameInputs = {
  start: NodeId
  goal: NodeId
  algoA: string
  algoB: string
  laneA: LaneState
  laneB: LaneState
  showHeat: boolean
}

// recompute() + recomputeHeat()
export function computeDerived(inp: GameInputs): Derived {
  const cfgA = laneCfg(inp.laneA)
  const cfgB = laneCfg(inp.laneB)
  const metas = { A: ALGORITHMS[inp.algoA], B: ALGORITHMS[inp.algoB] }
  const d = {} as Derived
  for (const lane of ['A', 'B'] as const) {
    const meta = metas[lane]
    const cfg = lane === 'A' ? cfgA : cfgB
    const custom = lane === 'A' ? inp.laneA.custom : inp.laneB.custom
    const result = withAltConfig(cfg, custom, () => meta.run(inp.start, inp.goal))
    d[lane] = {
      meta,
      result,
      bench: benchmarkOne(meta, inp.start, inp.goal, cfg, custom),
      lmEffect: landmarkEffect(meta, inp.start, inp.goal),
      last: result.steps.length - 1,
      heat: inp.showHeat ? heatmapFor(inp.goal, cfg, custom) : null,
    }
  }
  d.largestLast = Math.max(d.A.last, d.B.last)
  return d
}

/* ===================== TABLE SYNC =====================
   The 34 stat cells (and row labels) are written imperatively into the
   static markup by id — a direct port of the original renderTable(). The
   cells are static React children, so React never rewrites their content;
   KaTeX complexity cells go in as innerHTML exactly like the original. */

const texCache = new Map<string, string>()
function tex(latex: string): string {
  let html = texCache.get(latex)
  if (html === undefined) {
    html = katex.renderToString(latex, { throwOnError: false, displayMode: false })
    texCache.set(latex, html)
  }
  return html
}

// Which lane wins a metric: 'A', 'B' or undefined (tie / not comparable)
const betterLower = (va: number, vb: number): Lane | undefined =>
  Number.isNaN(va) || Number.isNaN(vb) ? undefined : va < vb ? 'A' : vb < va ? 'B' : undefined
const betterYes = (sa: string, sb: string): Lane | undefined => {
  const a = sa.startsWith('Yes')
  const b = sb.startsWith('Yes')
  return a && !b ? 'A' : b && !a ? 'B' : undefined
}

function setCell(id: string, lane: Lane, content: string, better: Lane | undefined, html = false): void {
  const el = document.getElementById(id + lane)
  if (!el) return
  if (html) el.innerHTML = content
  else el.textContent = content
  el.classList.toggle('better', better === lane)
}

export function syncTable(
  derived: Derived,
  stepIdx: number,
  laneA: LaneState,
  laneB: LaneState,
  start: string,
  goal: string,
): void {
  const A = derived.A
  const B = derived.B
  const i = stepIdx
  const stepOf = (L: LaneDerived) => L.result.steps[Math.min(i, L.last)]
  const finalA = i >= A.last
  const finalB = i >= B.last
  const atEnd = finalA && finalB
  const sA = stepOf(A)
  const sB = stepOf(B)
  const fin = (L: LaneDerived, f: 'visited' | 'frontier'): number =>
    atEnd ? (L.result.steps[L.last]?.[f].length ?? 0) : NaN
  const pathLabel = (L: LaneDerived, final: boolean) =>
    final && L.result.found ? L.result.path.map(cityCode).join(' → ') : '—'
  const stepText = (L: LaneDerived) =>
    L.result.steps.length === 0 ? '0 / 0' : `${Math.min(i, L.last) + 1} / ${L.result.steps.length}`
  const cost = (L: LaneDerived) => (L.bench.found ? L.bench.cost : NaN)
  const hops = (L: LaneDerived) => (L.bench.found ? L.bench.hops : NaN)
  const lm = (L: LaneDerived, k: LaneCount) => (L.lmEffect ? String(L.lmEffect[k]) : '—')

  let betterPath: Lane | undefined
  if (atEnd) {
    if (A.result.found !== B.result.found) betterPath = A.result.found ? 'A' : 'B'
    else if (A.result.found) betterPath = betterLower(pathCost(A.result.path), pathCost(B.result.path))
  }

  const rows: [string, string, string, Lane | undefined][] = [
    ['fullStep', stepText(A), stepText(B), undefined],
    ['fullCur', sA?.current ?? '—', sB?.current ?? '—', undefined],
    ['fullVis', String(sA?.visited.length ?? 0), String(sB?.visited.length ?? 0), atEnd ? betterLower(fin(A, 'visited'), fin(B, 'visited')) : undefined],
    ['fullFro', String(sA?.frontier.length ?? 0), String(sB?.frontier.length ?? 0), atEnd ? betterLower(fin(A, 'frontier'), fin(B, 'frontier')) : undefined],
    ['fullGen', String(A.result.generated), String(B.result.generated), betterLower(A.result.generated, B.result.generated)],
    ['fullPath', pathLabel(A, finalA), pathLabel(B, finalB), betterPath],
    ['fullTime', (A.bench.ms * 1000).toFixed(1), (B.bench.ms * 1000).toFixed(1), betterLower(A.bench.ms, B.bench.ms)],
    ['fullMem', String(A.bench.peakFrontier), String(B.bench.peakFrontier), betterLower(A.bench.peakFrontier, B.bench.peakFrontier)],
    ['fullCost', A.bench.found ? String(A.bench.cost) : '—', B.bench.found ? String(B.bench.cost) : '—', betterLower(cost(A), cost(B))],
    ['fullHops', A.bench.found ? String(A.bench.hops) : '—', B.bench.found ? String(B.bench.hops) : '—', betterLower(hops(A), hops(B))],
    ['fullOpt', A.meta.optimal, B.meta.optimal, betterYes(A.meta.optimal, B.meta.optimal)],
    ['fullComp', A.meta.complete, B.meta.complete, betterYes(A.meta.complete, B.meta.complete)],
  ]
  for (const k of ['lm2', 'lm4', 'lm8'] as const) {
    const lmEffect = A.lmEffect && B.lmEffect ? { a: A.lmEffect, b: B.lmEffect } : null
    rows.push([
      'full' + k.toUpperCase(),
      lm(A, k),
      lm(B, k),
      lmEffect ? betterLower(lmEffect.a[k], lmEffect.b[k]) : undefined,
    ])
  }
  for (const [id, a, b, better] of rows) {
    setCell(id, 'A', a, better)
    setCell(id, 'B', b, better)
  }
  setCell('fullTn', 'A', tex(A.meta.time), undefined, true)
  setCell('fullTn', 'B', tex(B.meta.time), undefined, true)
  setCell('fullSn', 'A', tex(A.meta.space), undefined, true)
  setCell('fullSn', 'B', tex(B.meta.space), undefined, true)
  const rowA = document.getElementById('rowA')
  if (rowA) rowA.textContent = 'A · ' + A.meta.label + laneLmSuffix(A.meta, laneA)
  const rowB = document.getElementById('rowB')
  if (rowB) rowB.textContent = 'B · ' + B.meta.label + laneLmSuffix(B.meta, laneB)
  // renderControls()' text writes (the buttons/labels that stay React-owned
  // live in props; these three sit in static markup)
  const routeLabel = document.getElementById('routeLabel')
  if (routeLabel) routeLabel.textContent = start + ' → ' + goal
  const algoALabel = document.getElementById('algoALabel')
  if (algoALabel) algoALabel.textContent = A.meta.label
  const algoBLabel = document.getElementById('algoBLabel')
  if (algoBLabel) algoBLabel.textContent = B.meta.label
}

/* ===================== HOOK ===================== */

export function useGameState() {
  const [start, setStartRaw] = useState<NodeId>('Arad')
  const [goal, setGoalRaw] = useState<NodeId>('Bucharest')
  const [algoA, setAlgoARaw] = useState('ucs')
  const [algoB, setAlgoBRaw] = useState('astaralt')
  const [laneA, setLaneARaw] = useState<LaneState>({ count: 'lm8', custom: [], overlay: false })
  const [laneB, setLaneBRaw] = useState<LaneState>({ count: 'lm8', custom: [], overlay: false })
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [delay, setDelay] = useState(900) // slider value; step delay = MAX_DELAY - delay
  const [showLine, setShowLine] = useState(false)
  const [showHeat, setShowHeat] = useState(false)
  const [pickLandmarks, setPickLandmarks] = useState(false)
  const [merged, setMerged] = useState(true) // #mergeChk — checked by default
  const [showDistances, setShowDistances] = useState(true) // #distanceChk — checked by default

  const derived = useMemo(
    () => computeDerived({ start, goal, algoA, algoB, laneA, laneB, showHeat }),
    [start, goal, algoA, algoB, laneA, laneB, showHeat],
  )

  // Any input change: recompute (via memo), rewind playback (inputsChanged())
  const reset = useCallback(() => {
    setPlaying(false)
    setStepIdx(0)
  }, [])

  const stepDelay = MAX_DELAY - delay

  // scheduleNextStep(): each step schedules the next; a mid-play speed change
  // applies from the next step because `delay` is a dependency.
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => {
      setStepIdx((i) => {
        const next = Math.min(derived.largestLast, i + 1)
        if (next >= derived.largestLast) setPlaying(false)
        return next
      })
    }, stepDelay)
    return () => clearTimeout(timer)
  }, [playing, stepIdx, stepDelay, derived])

  // renderTable() + renderControls()' static-markup writes after every commit
  useEffect(() => {
    syncTable(derived, stepIdx, laneA, laneB, start, goal)
  }, [derived, stepIdx, laneA, laneB, start, goal])

  // ── actions ──────────────────────────────────────────────────────────
  const setStart = useCallback((v: NodeId) => { reset(); setStartRaw(v) }, [reset])
  const setGoal = useCallback((v: NodeId) => { reset(); setGoalRaw(v) }, [reset])
  const randomize = useCallback(() => {
    const p = randomPair()
    reset()
    setStartRaw(p.start)
    setGoalRaw(p.goal)
  }, [reset])
  const setAlgo = useCallback((lane: Lane, v: string) => {
    reset()
    ;(lane === 'A' ? setAlgoARaw : setAlgoBRaw)(v)
  }, [reset])
  // landmark dropdown change (makeLandmarkControl's change handler)
  const setLandmarkValue = useCallback((lane: Lane, value: string) => {
    if (value === 'custom') return
    reset()
    const upd = (l: LaneState): LaneState => {
      if (value === 'off') return { ...l, custom: [], overlay: false }
      const count = value as LaneCount
      const meta = ALGORITHMS[lane === 'A' ? algoA : algoB]
      return { ...l, custom: [], count, overlay: meta.usesLandmarks ? l.overlay : true }
    }
    ;(lane === 'A' ? setLaneARaw : setLaneBRaw)(upd)
  }, [reset, algoA, algoB])
  // toggleCustomLandmark(): map click while the landmark tool is on
  const pickLandmark = useCallback((lane: Lane, city: NodeId) => {
    reset()
    const meta = ALGORITHMS[lane === 'A' ? algoA : algoB]
    const upd = (l: LaneState): LaneState => ({
      ...l,
      overlay: !meta.usesLandmarks ? true : l.overlay, // reveal what was picked
      custom: l.custom.includes(city) ? l.custom.filter((c) => c !== city) : [...l.custom, city],
    })
    ;(lane === 'A' ? setLaneARaw : setLaneBRaw)(upd)
  }, [reset, algoA, algoB])
  const togglePickLandmarks = useCallback(() => setPickLandmarks((v) => !v), [])

  const play = useCallback(() => {
    if (playing) { setPlaying(false); return }
    setStepIdx((i) => (i >= derived.largestLast ? 0 : i)) // finished: replay from the start
    setPlaying(true)
  }, [playing, derived.largestLast])
  const next = useCallback(() => { setPlaying(false); setStepIdx((i) => Math.min(derived.largestLast, i + 1)) }, [derived.largestLast])
  const prev = useCallback(() => { setPlaying(false); setStepIdx((i) => Math.max(0, i - 1)) }, [])
  const restart = useCallback(() => { setPlaying(false); setStepIdx(0) }, [])

  return {
    // state
    start, goal, algoA, algoB, laneA, laneB, stepIdx, playing, delay, showLine, showHeat, pickLandmarks,
    merged, showDistances,
    // derived
    derived,
    // actions
    setStart, setGoal, randomize, setAlgo, setLandmarkValue, pickLandmark, togglePickLandmarks,
    play, next, prev, restart,
    setDelay,
    setShowLine, setShowHeat, setMerged, setShowDistances,
  }
}

export type GameState = ReturnType<typeof useGameState>
