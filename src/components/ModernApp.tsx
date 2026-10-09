import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ChevronLeft, ChevronRight, Columns2, Dices, MapPin, Pause, Play, RotateCcw, Thermometer, Volume2, VolumeX } from 'lucide-react'
import { CITIES, cityCode, type NodeId } from '@/romania'
import { ALGORITHMS, pathCost, type Step } from '@/search'
import { type LandmarkPreset } from '@/heuristic'
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
import {
  THEME_ORDER, ThemeControl, ThemeRoll, DndAurora,
  SpaceField, PlanetWindow, applyTheme, initialTheme,
  type Theme,
} from '@/theme'
import {
  ensureAudio, setMuted,
  playDice, playExpand, playVictory,
  playCrow, playOwl, playGlitter, playWhoosh, playLaser,
  startCeltic, stopCeltic, startSpaceHum, stopSpaceHum,
} from '@/audio'
import { LandmarkPicker } from './map/LandmarkPicker'
import { laneLandmarkCities, laneLmSuffix, type LandmarkCount } from './map/landmarks'
import { BENCH_ITERS, benchmarkOne, landmarkEffect, withAltConfig, type CompareRow } from './map/bench'
import { SVGMap, MergedSVGMap } from './map/svgMap'
import { heatmapFor, countMoves, randomPair } from './map/mapData'
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

// Algorithm options in alphabetical order (by display label) for the selects.
const ALGO_OPTIONS: [string, (typeof ALGORITHMS)[string]][] = Object.entries(ALGORITHMS)
  .sort(([, a], [, b]) => a.label.localeCompare(b.label))



const MIN_DELAY = 0
const MAX_DELAY = 1500
const DEFAULT_DELAY = 600

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
