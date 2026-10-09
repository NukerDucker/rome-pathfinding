import { useEffect, useState } from 'react'
import GameControls from '@/game/GameControls'
import GameGuide from '@/game/GameGuide'
import GameMap from '@/game/GameMap'
import GamePlayback from '@/game/GamePlayback'
import GameStats from '@/game/GameStats'
import { attachGuideExtras } from '@/game/guideScrollSpy'
import { useGameState } from '@/game/useGameState'

/** Game-style UI, ported from origin/ui-game (index.html + script.js).
 *  React owns state/controls/tables; the map engine and the animals stay
 *  imperative modules (mounted in stage 2/4). */

type GameTab = 'map' | 'guide'
type DayNight = 'day' | 'night'

const THEME_KEY = 'game-theme'
const BREAD_UNLOCK_SWITCHES = 5 // theme toggles before the bread button appears

function readGameTheme(): DayNight | null {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'day' || t === 'night' ? t : null
  } catch {
    return null
  }
}

export default function GameApp() {
  const g = useGameState()
  const [tab, setTab] = useState<GameTab>('map')
  // null = no stored choice: CSS follows prefers-color-scheme.
  const [theme, setTheme] = useState<DayNight | null>(readGameTheme)
  const [themeSwitches, setThemeSwitches] = useState(0)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)

  const toggleTheme = () => {
    const next: DayNight = theme === 'night' ? 'day' : 'night'
    setTheme(next)
    setThemeSwitches((n) => n + 1)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* storage denied — theme just won't persist */
    }
  }
  const breadUnlocked = themeSwitches >= BREAD_UNLOCK_SWITCHES

  // GIF-failure fallback + guide contents scroll-spy (script.js 1246–1276)
  useEffect(() => attachGuideExtras(), [])

  // Landmark-picking cursor: the CSS keys off `body.picking-landmarks` in the
  // source; here it sits on the game root so it can never leak into modern mode.
  useEffect(() => {
    rootEl?.classList.toggle('picking-landmarks', g.pickLandmarks)
  }, [rootEl, g.pickLandmarks])

  return (
    <div className="game-root" data-theme={theme ?? undefined} ref={setRootEl}>
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

        <div id="tabMap" className="tab-panel" role="tabpanel" aria-labelledby="tabBtnMap" hidden={tab !== 'map'}>
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
            onRandom={g.randomize}
            onTogglePick={g.togglePickLandmarks}
            onShowLine={g.setShowLine}
            onShowHeat={g.setShowHeat}
            onShowDistances={g.setShowDistances}
            onMerged={g.setMerged}
          />
          <GameMap
            playback={
              <GamePlayback
                playing={g.playing}
                delay={g.delay}
                onPlay={g.play}
                onNext={g.next}
                onPrev={g.prev}
                onRestart={g.restart}
                onDelay={g.setDelay}
              />
            }
          >
            <GameStats />
          </GameMap>
        </div>

        <div id="tabGuide" className="tab-panel" role="tabpanel" aria-labelledby="tabBtnGuide" hidden={tab !== 'guide'}>
          <GameGuide />
        </div>
      </div>

      {/* Fixed chrome: day/night toggle owns the top-right. Five switches
          reveal the bread button (bread.ts, wired in stage 4). */}
      <button
        type="button"
        className="theme-toggle"
        id="themeToggle"
        onClick={toggleTheme}
        aria-label="Toggle day and night"
        data-bread-unlocked={breadUnlocked || undefined}
      >
        {theme === 'night' ? '☀' : '☾'}
      </button>
    </div>
  )
}
