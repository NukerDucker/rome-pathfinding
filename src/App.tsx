import { useCallback, useEffect, useState } from 'react'
import ModernApp from '@/components/ModernApp'
import ModeToggle from '@/components/ModeToggle'
import GameApp from '@/game/GameApp'
import { THEME_META, THEME_ORDER } from '@/theme'

// Imported LAST on purpose: .game-root ties :root on specificity (0,1,0),
// so CSS order decides the token collisions (see plan §6).
import '@/game/game.css'

type UiMode = 'modern' | 'game'
const MODE_KEY = 'ui-mode'

function readMode(): UiMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'game' ? 'game' : 'modern'
  } catch {
    return 'modern'
  }
}

export default function App() {
  const [mode, setMode] = useState<UiMode>(readMode)

  // Entering game mode: strip the modern theme classes/attrs from <html>, or
  // themes.css rules (:root.space body{...} etc.) would tint/blank the game.
  // Leaving: ModernApp re-applies its theme in its state initializer on remount.
  useEffect(() => {
    const el = document.documentElement
    if (mode === 'game') {
      for (const t of THEME_ORDER) for (const cls of THEME_META[t].classes) el.classList.remove(cls)
      delete el.dataset.theme
      el.style.colorScheme = ''
    }
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* storage can be denied (private mode) — mode just won't persist */
    }
  }, [mode])

  const toggle = useCallback(() => setMode((m) => (m === 'modern' ? 'game' : 'modern')), [])

  return (
    <>
      <ModeToggle mode={mode} onToggle={toggle} />
      {mode === 'modern' ? <ModernApp /> : <GameApp />}
    </>
  )
}
