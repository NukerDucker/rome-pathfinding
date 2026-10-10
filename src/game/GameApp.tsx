import { useCallback, useEffect, useRef, useState } from 'react'
import GameControls from '@/game/GameControls'
import GameGuide from '@/game/GameGuide'
import GameMap from '@/game/GameMap'
import GamePlayback from '@/game/GamePlayback'
import GameStats from '@/game/GameStats'
import { attachGuideExtras } from '@/components/guide/guideScrollSpy'
import { landmarkCitiesFor, useGameState, type GameState, type Lane } from '@/game/useGameState'
import { createScenery, type SceneryHandle, type ScenerySnapshot } from '@/game/scenery'
import { createDuck, type DuckHandle } from '@/game/animals/duck'
import { createCat, type CatHandle } from '@/game/animals/cat'
import { createWhale, type WhaleHandle } from '@/game/animals/whale'
import { createCapybara, type CapybaraHandle } from '@/game/animals/capybara'
import { createBird, type BirdHandle } from '@/game/animals/bird'
import { createBread, type BreadHandle, BREAD_UNLOCK_SWITCHES } from '@/game/animals/bread'
import { THEME_ORDER, DndAurora, SpaceField, type Theme } from '@/theme'
import ModeToggle from '@/components/ModeToggle'

/** Game-style UI, ported from origin/ui-game (index.html + script.js).
 *  React owns state/controls/tables; the map engine (viewport+scenery) and
 *  the animals stay imperative modules, mounted once and disposed on unmount. */

type GameTab = 'map' | 'guide'

type Animals = {
  duck?: DuckHandle
  cat?: CatHandle
  whale?: WhaleHandle
  capybara?: CapybaraHandle
  bird?: BirdHandle
  bread?: BreadHandle
}

// Game-side labels for the shared themes (App owns the value + persistence).
const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', dnd: 'D&D', space: 'Space' }
const THEME_GLYPH: Record<Theme, string> = { light: '☀', dark: '☾', dnd: '❀', space: '✦' }

const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)

// ScenerySnapshot: the imperative map modules read the world through this
// (the original read module globals; here React state is the single source).
function buildSnapshot(s: GameState): ScenerySnapshot {
  const lane = (key: Lane) => ({
    last: s.derived[key].last,
    result: s.derived[key].result,
    heat: s.derived[key].heat,
    landmarks: landmarkCitiesFor(s.derived[key].meta, key === 'A' ? s.laneA : s.laneB),
  })
  return {
    stepIdx: s.stepIdx,
    start: s.start,
    goal: s.goal,
    showLine: s.showLine,
    pickLandmarks: s.pickLandmarks,
    merged: s.merged,
    showDistances: s.showDistances,
    lane: { A: lane('A'), B: lane('B') },
  }
}

export default function GameApp({ theme, mode, onSelectTheme, onToggleMode }: {
  theme: Theme
  mode: 'modern' | 'game'
  onSelectTheme: (t: Theme) => void
  onToggleMode: () => void
}) {
  const g = useGameState()
  const [tab, setTab] = useState<GameTab>('map')
  const [themeOpen, setThemeOpen] = useState(false)
  const [themeSwitches, setThemeSwitches] = useState(0)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)

  const sceneryRef = useRef<SceneryHandle | null>(null)
  const animalsRef = useRef<Animals | null>(null)
  // Always-fresh state for the imperative modules' event-time reads. Updated
  // after commit (never during render); the modules only read it on events.
  const latest = useRef(g)
  useEffect(() => {
    latest.current = g
  })

  // ── Map engine: one scenery instance driving both viewports (stage 2) ──
  useEffect(() => {
    const canvases = [...document.querySelectorAll<HTMLElement>('#compareWrap .algo-canvas')]
    if (canvases.length < 2) return
    const scenery = createScenery({
      canvases: [canvases[0], canvases[1]],
      getState: () => buildSnapshot(latest.current),
      onPickLandmark: (lane, city) => latest.current.pickLandmark(lane, city),
    })
    sceneryRef.current = scenery
    return () => {
      sceneryRef.current = null
      scenery.dispose()
    }
  }, [])

  // Re-draw after every commit that can change what the map shows.
  useEffect(() => {
    sceneryRef.current?.sync(buildSnapshot(g))
  }, [g, g.derived, g.stepIdx, g.showLine, g.pickLandmarks, g.merged, g.showDistances, g.laneA, g.laneB])

  // ── Animals + secret bread (stage 4) — imperative, dispose on unmount ──
  useEffect(() => {
    const a: Animals = {}
    const duckBtn = q<HTMLButtonElement>('#duckBtn')
    const duckImg = duckBtn?.querySelector('img')
    const homeMap = q('#duckHomeMap')
    const homeGuide = q('#duckHomeGuide')
    if (duckBtn && duckImg && homeMap && homeGuide) {
      a.duck = createDuck({
        btn: duckBtn, img: duckImg, homeMap, homeGuide,
        rolledSrc: '/assets/duck-rolled.png', standingSrc: '/assets/duck.png',
      })
    }
    const peekBtn = q<HTMLButtonElement>('#peekCat')
    const standBtn = q<HTMLButtonElement>('#catStand')
    const algoBoxEl = q('.algo-box')
    const perchCat = q('#perchCat')
    const canvases = [...document.querySelectorAll<HTMLElement>('#compareWrap .algo-canvas')]
    if (peekBtn && standBtn && algoBoxEl && perchCat) {
      a.cat = createCat({ peekBtn, standBtn, algoBoxEl, canvases, perchCat })
    }
    const whaleEl = q('#whale')
    const vsBadge = q('#vsBadge')
    const compareWrap = q('#compareWrap')
    const perchWhale = q('#perchWhale')
    if (whaleEl && vsBadge && compareWrap && perchWhale) {
      a.whale = createWhale({ whaleEl, vsBadge, compareWrap, perchSlot: perchWhale })
    }
    const capyEl = q<HTMLButtonElement>('#capy')
    const capyImg = capyEl?.querySelector('img')
    const mapPanelEl = q('.map-panel')
    const perchCapy = q('#perchCapy')
    if (capyEl && capyImg && mapPanelEl && perchCapy) {
      a.capybara = createCapybara({ capyEl, capyImg, mapPanelEl, perchSlot: perchCapy })
    }
    const birdBtn = q<HTMLButtonElement>('#bird')
    const birdImg = birdBtn?.querySelector('img')
    const routeBoxEl = q('.route-box')
    const randomBtnEl = q('#randomBtn')
    const perchBird = q('#perchBird')
    if (birdBtn && birdImg && routeBoxEl && randomBtnEl && perchBird) {
      a.bird = createBird({ btn: birdBtn, img: birdImg, routeBoxEl, randomBtnEl, perchBird })
    }
    const breadBtn = q<HTMLButtonElement>('#breadBtn')
    const breadOverlay = q('#breadOverlay')
    const breadPerch = q<HTMLButtonElement>('#breadPerch')
    const perchBread = q('#perchBread')
    if (breadBtn && breadOverlay && breadPerch && perchBread) {
      a.bread = createBread({ btn: breadBtn, overlay: breadOverlay, perchBtn: breadPerch, perchSlot: perchBread })
    }
    animalsRef.current = a
    return () => {
      animalsRef.current = null
      a.duck?.dispose()
      a.cat?.dispose()
      a.whale?.dispose()
      a.capybara?.dispose()
      a.bird?.dispose()
      a.bread?.dispose()
    }
  }, [])

  // GIF-failure fallback + guide contents scroll-spy (script.js 1246–1276)
  useEffect(() => attachGuideExtras(), [])

  // Landmark-picking cursor: the CSS keys off `body.picking-landmarks` in the
  // source; here it sits on the game root so it can never leak into modern mode.
  useEffect(() => {
    rootEl?.classList.toggle('picking-landmarks', g.pickLandmarks)
  }, [rootEl, g.pickLandmarks])

  // Theme dropdown: close on outside click or Escape.
  useEffect(() => {
    if (!themeOpen) return
    const onPointer = (e: PointerEvent) => {
      const el = e.target as HTMLElement
      if (!el.closest?.('.theme-menu-wrap')) setThemeOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setThemeOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [themeOpen])

  // Bread is unlocked by count of theme changes made from the game (script.js
  // behaviour); the value itself is shared with the modern UI through App.
  const pickTheme = (next: Theme) => {
    setThemeOpen(false)
    if (next === theme) return
    onSelectTheme(next)
    const switches = themeSwitches + 1
    setThemeSwitches(switches)
    if (switches === BREAD_UNLOCK_SWITCHES) animalsRef.current?.bread?.unlock()
  }

  // ── trigger plumbing: the animals' own gates live in their modules ─────
  const { randomize, next, prev, setMerged } = g
  const onRandom = useCallback(() => {
    randomize()
    animalsRef.current?.bird?.trigger()
  }, [randomize])
  const onNext = useCallback(() => {
    next()
    animalsRef.current?.capybara?.trigger()
  }, [next])
  const onPrev = useCallback(() => {
    prev()
    animalsRef.current?.capybara?.trigger()
  }, [prev])
  const onMerged = useCallback(
    (v: boolean) => {
      setMerged(v)
      animalsRef.current?.cat?.trigger()
    },
    [setMerged],
  )

  return (
    <div className="game-root" data-theme={theme} ref={setRootEl}>
      {/* Same atmospherics the modern UI gets, so dnd and space read as the same
          two themes in both UIs. They are position:fixed, inset:0, z-index:-1,
          pointer-events:none — and .game-root is isolated (game.css) so they
          paint above its page background and below its content. */}
      {theme === 'dnd' && <DndAurora />}
      {theme === 'space' && <SpaceField />}
      <div className="app-shell">
        <div className="section title-bar">
          <h1 id="titleText">
            <img className="title-img" src="/assets/title.png" alt="Pathfinding Explorer" width={1339} height={167} />
          </h1>
        </div>

        <nav className="tab-bar" role="tablist" aria-label="Pages">
          <button
            role="tab"
            id="tabBtnMap"
            aria-controls="tabMap"
            className={`tab-btn${tab === 'map' ? ' active' : ''}`}
            aria-selected={tab === 'map'}
            onClick={() => setTab('map')}
          >
            Map
          </button>
          <button
            role="tab"
            id="tabBtnGuide"
            aria-controls="tabGuide"
            className={`tab-btn${tab === 'guide' ? ' active' : ''}`}
            aria-selected={tab === 'guide'}
            onClick={() => setTab('guide')}
          >
            Guide
          </button>
        </nav>

        {/* One <main> per tab panel; `hidden` keeps exactly one exposed. */}
        <main id="tabMap" className="tab-panel" aria-labelledby="tabBtnMap" hidden={tab !== 'map'}>
          <GameControls
            start={g.start}
            goal={g.goal}
            algoA={g.algoA}
            algoB={g.algoB}
            laneA={g.laneA}
            laneB={g.laneB}
            showLine={g.showLine}
            showHeat={g.showHeat}
            showDistances={g.showDistances}
            merged={g.merged}
            pickLandmarks={g.pickLandmarks}
            onStart={g.setStart}
            onGoal={g.setGoal}
            onAlgo={g.setAlgo}
            onLandmark={g.setLandmarkValue}
            onRandom={onRandom}
            onTogglePick={g.togglePickLandmarks}
            onShowLine={g.setShowLine}
            onShowHeat={g.setShowHeat}
            onShowDistances={g.setShowDistances}
            onMerged={onMerged}
          />
          <GameMap
            playback={
              <GamePlayback
                playing={g.playing}
                delay={g.delay}
                onPlay={g.play}
                onNext={onNext}
                onPrev={onPrev}
                onRestart={g.restart}
                onDelay={g.setDelay}
              />
            }
          >
            <GameStats />
          </GameMap>
        </main>

        <main id="tabGuide" className="tab-panel" aria-labelledby="tabBtnGuide" hidden={tab !== 'guide'}>
          <GameGuide />
        </main>
      </div>

      {/* Fixed chrome (source index.html 18–29): mode switch + theme button */}
      <div className="theme-menu-wrap">
        <ModeToggle mode={mode} onToggle={onToggleMode} />
        <button
          type="button"
          className="theme-toggle"
          id="themeToggle"
          onClick={() => setThemeOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={themeOpen}
          aria-label={`Theme: ${THEME_LABEL[theme]}`}
          title="Theme"
        >
          {THEME_GLYPH[theme]}
        </button>
        {themeOpen && (
          <ul className="theme-menu" role="menu" aria-label="Theme">
            {THEME_ORDER.map((t) => (
              <li key={t} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={t === theme}
                  className={t === theme ? 'is-current' : undefined}
                  onClick={() => pickTheme(t)}
                >
                  <span aria-hidden="true">{THEME_GLYPH[t]}</span> {THEME_LABEL[t]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Bread button (secret): revealed by bread.unlock() on the 5th theme switch */}
      <button className="bread-btn" id="breadBtn" type="button" aria-label="Get bread" title="Get bread" hidden>
        <img src="/assets/bread.png" alt="" />
      </button>
      {/* Bird (1-in-10 on each Random click — gated inside the module) */}
      <button className="bird" id="bird" type="button" aria-label="Bird" title="Tweet" hidden>
        <img src="/assets/bird.png" alt="" />
      </button>
      <div className="bread-overlay" id="breadOverlay" aria-hidden="true">
        <img className="bread-big" src="/assets/bread.png" alt="" />
        <div className="bread-text">GET BREAD</div>
      </div>
    </div>
  )
}
