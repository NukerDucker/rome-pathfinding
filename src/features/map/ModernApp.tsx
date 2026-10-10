import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { type NodeId } from '@/algorithms/romania'
import { ALGORITHMS } from '@/algorithms/search'
import { type LandmarkPreset } from '@/algorithms/heuristic'
import { Guide } from '@/components/Guide'
// Shared with the game guide (which passes no argument and gets #tabGuide).
import { attachGuideExtras } from '@/components/guide/guideScrollSpy'
import {
  ThemeRoll, DndAurora,
  SpaceField,
  type Theme,
} from '@/theme'
import {
  ensureAudio, setMuted,
  playDice, playExpand, playVictory,
  playCrow, playOwl, playGlitter, playWhoosh, playLaser,
  startCeltic, stopCeltic, startSpaceHum, stopSpaceHum,
} from '@/features/map/audio'
import { type LandmarkCount } from './map/landmarks'
import { benchmarkOne, landmarkEffect, withAltConfig } from './map/bench'
import { StatsSidebar } from './map/StatsSidebar'
import { heatmapFor, countMoves, randomPair } from './map/mapData'
import { TitleRow } from './map/TitleRow'
import { TabBar } from './map/TabBar'
import { RouteCard } from './map/RouteCard'
import { AlgorithmCard } from './map/AlgorithmCard'
import { ToolbarRow } from './map/ToolbarRow'
import { MapStage } from './map/MapStage'
import { DEFAULT_DELAY } from './map/PlaybackBar'
import '@/styles/app.css'
import '@/styles/themes.css'

function ModernApp({ theme, mode, onSelectTheme, onToggleMode }: {
  theme: Theme
  mode: 'modern' | 'game'
  onSelectTheme: (t: Theme) => void
  onToggleMode: () => void
}) {
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
  // The theme itself lives in App (shared with the game UI); this component
  // only runs the reveal roll and tells App which theme was picked.
  const [roll, setRoll] = useState<{ theme: Theme; nonce: number } | null>(null)
  const rollNonce = useRef(0)
  const [muted, setMutedFlag] = useState<boolean>(() => {
    try { return window.localStorage.getItem('muted') === '1' } catch { return false }
  })
  const [audioReady, setAudioReady] = useState(false)
  const victoryPlayed = useRef(false)
  const themeRef = useRef(theme)
  themeRef.current = theme

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

  // Guide extras — contents highlight and the broken-GIF fallback — which the
  // game guide has always had and the modern one never did. Re-attached on each
  // visit to the tab, because the guide unmounts when you leave it.
  useEffect(() => {
    if (tab !== 'guide') return
    return attachGuideExtras(document.querySelector('.guide-page-wrap'))
  }, [tab])


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

  // Gacha-style roll on selection: the reveal card plays, the theme switches
  // mid-animation, then the card fades out. Each theme opens with its own sound.
  function selectTheme(next: Theme) {
    if (roll || next === theme) return
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
      onSelectTheme(next)
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

  // Algorithm-comparison stats. Rendered once, slotted either into the right
  // sidebar or below the map depending on statsInSidebar.
  const statsPanel = (
    <StatsSidebar
      theme={theme} start={start} goal={goal} algo={algo} algo2={algo2} stepIdx={stepIdx}
      laneA={{ meta, result, bench: benchA, lmEffect: lmEffectA, lastIdx, landmark: landmarkA, custom: customA }}
      laneB={{ meta: meta2, result: result2, bench: benchB, lmEffect: lmEffectB, lastIdx: lastIdx2, landmark: landmarkB, custom: customB }}
    />
  )

  return (
    <div className="app-shell">
    {theme === 'dnd' && <DndAurora />}
    {theme === 'space' && <SpaceField />}
    <div className="app-main">
    <TitleRow
      theme={theme} onSelect={selectTheme} busy={roll !== null}
      mode={mode} onToggleMode={onToggleMode}
      muted={muted}
      onToggleMute={() => { const m = !muted; setMutedFlag(m); if (!m) ensureAudio() }}
    />

      <TabBar tab={tab} onTab={setTab} />

      {tab === 'guide' && (
        <main id="tabpanel-guide" aria-labelledby="tab-guide" className="guide-page-wrap">
          <Guide />
        </main>
      )}

      {tab === 'map' && <>
      <div className="query-bars-row">
        {/* Map card */}
        <RouteCard
          start={start} goal={goal}
          onStart={handleStartChange}
          onGoal={handleGoalChange}
          onHover={setHoveredCity}
          onRandomize={handleRandomize}
        />
        {/* Algo card */}
        <div className="query-bar query-bar-algo" role="toolbar" aria-label="Algorithm selection">
          <AlgorithmCard
            lane="A" algo={algo} onAlgo={handleAlgoChange} usesLandmarks={meta.usesLandmarks}
            overlay={lmOverlayA} setOverlay={setLmOverlayA} count={landmarkA} onCount={handleLandmarkAChange}
            customCount={customA.length}
            onClearCustom={() => { setCustomA([]); setStepIdx(0); setPlaying(false) }}
          />
          <span className="query-word">vs</span>
          <AlgorithmCard
            lane="B" algo={algo2} onAlgo={handleAlgoChange2} usesLandmarks={meta2.usesLandmarks}
            overlay={lmOverlayB} setOverlay={setLmOverlayB} count={landmarkB} onCount={handleLandmarkBChange}
            customCount={customB.length}
            onClearCustom={() => { setCustomB([]); setStepIdx(0); setPlaying(false) }}
          />
        </div>
      </div>

      <div id="tabpanel-map" role="tabpanel" aria-labelledby="tab-map" className="workspace">
      <main className="app">
        {/* Toolbar — above the map */}
        <ToolbarRow
          showLine={showLine} onToggleLine={() => setShowLine(v => !v)}
          showHeatmap={showHeatmap} onToggleHeatmap={() => setShowHeatmap(v => !v)}
          merged={merged} onToggleMerged={() => { setMerged(v => !v); setStepIdx(0); setPlaying(false) }}
          pickLandmarkMode={pickLandmarkMode} onTogglePickLandmark={() => setPickLandmarkMode(v => !v)}
          customCount={customA.length + customB.length}
        />

        <MapStage
          theme={theme} merged={merged} stepIdx={stepIdx} hoveredCity={hoveredCity}
          start={start} goal={goal} showLine={showLine} showHeatmap={showHeatmap}
          pickLandmarkMode={pickLandmarkMode}
          laneA={{
            side: 'a', algo, meta, result, lastIdx, heatmap: heatA,
            landmark: landmarkA, custom: customA, overlay: lmOverlayA,
            currentCity: currentCityA, warp: warpA, onCityClick: onCityClickA,
          }}
          laneB={{
            side: 'b', algo: algo2, meta: meta2, result: result2, lastIdx: lastIdx2, heatmap: heatB,
            landmark: landmarkB, custom: customB, overlay: lmOverlayB,
            currentCity: currentCityB, warp: warpB, onCityClick: onCityClickB,
          }}
          onMergedCityClick={onCityClickMerged}
          statsPanel={statsPanel}
          playing={playing} delay={delay}
          onReset={handleReset} onBack={handleStepBack} onPlayPause={handlePlayPause}
          onForward={handleStepForward} onDelay={setDelay}
        />
      </main>
      </div>
      </>}
    </div>
      {roll && <ThemeRoll theme={roll.theme} nonce={roll.nonce} />}
    </div>
  )
}

export default ModernApp
