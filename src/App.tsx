import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
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

  const toggle = useCallback(() => {
    const swap = () => flushSync(() => setMode((m) => (m === 'modern' ? 'game' : 'modern')))
    const doc = document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => {
        ready: Promise<void>
        finished: Promise<void>
        updateCallbackDone: Promise<void>
      }
    }
    // Reduced motion or no View Transitions: instant swap (the DOM update still
    // happens through flushSync, so the fallback is a plain cut).
    if (typeof doc.startViewTransition !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      swap()
      return
    }
    try {
      const vt = doc.startViewTransition(async () => {
        swap()
        // The incoming game measures the DOM and draws its map in PASSIVE
        // effects; flushSync only guarantees render + layout effects. Wait a
        // couple of frames' worth so the "new" snapshot is taken AFTER the
        // first scenery sync — but wait on the TIMER queue, never rAF:
        // requestAnimationFrame callbacks are deferred while a transition sits
        // between captures, so awaiting one here deadlocks the transition
        // (callback never settles -> ready/finished never resolve -> the
        // :active-view-transition overlay stays stuck over the page).
        await new Promise<void>((r) => setTimeout(r, 120))
        // The pixel font loads after first paint and shifts every sprite
        // offset; race it so a stalled font request cannot wedge us.
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 300))])
      })
      // A second toggle aborts the in-flight transition, which rejects ALL
      // THREE promises — an uncaught `ready`/`updateCallbackDone` rejection is
      // still an unhandled rejection in the console.
      vt.finished.catch(() => { /* aborted by a second toggle — expected */ })
      vt.ready.catch(() => {})
      vt.updateCallbackDone.catch(() => {})
    } catch {
      swap()
    }
  }, [])

  return (
    <>
      <ModeToggle mode={mode} onToggle={toggle} />
      {mode === 'modern' ? <ModernApp /> : <GameApp />}
    </>
  )
}
