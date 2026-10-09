import { useEffect, useState } from 'react'
import GameGuide from '@/game/GameGuide'
import { attachGuideExtras } from '@/game/guideScrollSpy'

/** Game-style UI, ported from origin/ui-game (index.html + script.js).
 *  Stage 1: chrome, tabs and layout shell — behaviour lands in stages 2–4. */

type GameTab = 'map' | 'guide'
type DayNight = 'day' | 'night'

const THEME_KEY = 'game-theme'

function readGameTheme(): DayNight | null {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'day' || t === 'night' ? t : null
  } catch {
    return null
  }
}

export default function GameApp() {
  const [tab, setTab] = useState<GameTab>('map')
  // null = no stored choice: CSS follows prefers-color-scheme.
  const [theme, setTheme] = useState<DayNight | null>(readGameTheme)

  const toggleTheme = () => {
    const next: DayNight = theme === 'night' ? 'day' : 'night'
    setTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* storage denied — theme just won't persist */
    }
  }

  // GIF-failure fallback + guide contents scroll-spy (script.js 1246–1276)
  useEffect(() => attachGuideExtras(), [])

  return (
    <div className="game-root" data-theme={theme ?? undefined}>
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
          <p className="game-placeholder">Map tab — ported in stages 2–3.</p>
        </div>

        <div id="tabGuide" className="tab-panel" role="tabpanel" aria-labelledby="tabBtnGuide" hidden={tab !== 'guide'}>
          <GameGuide />
        </div>
      </div>

      {/* Fixed chrome: day/night toggle owns the top-right. */}
      <button type="button" className="theme-toggle" id="themeToggle" onClick={toggleTheme} aria-label="Toggle day and night">
        {theme === 'night' ? '☀' : '☾'}
      </button>
    </div>
  )
}
