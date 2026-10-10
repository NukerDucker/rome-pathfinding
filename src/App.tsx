import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import ModernApp from '@/features/map/ModernApp'
import GameApp from '@/features/game/GameApp'
import { THEME_META, THEME_ORDER, applyTheme, initialTheme, type Theme } from '@/theme'

// Imported LAST on purpose: .game-root ties :root on specificity (0,1,0),
// so CSS order decides the token collisions (see plan §6).
import '@/styles/game.css'

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
  // One shared theme for both UIs: the masthead dropdown and the game dropdown
  // both write this (localStorage `theme`), so a pick in either mode skins the
  // other. Modern paints it on <html>; the game reads .game-root[data-theme].
  const [theme, setTheme] = useState<Theme>(initialTheme)

  // In game mode the modern theme classes/attrs are stripped from <html>, or
  // themes.css rules (:root.space body{...} etc.) would tint/blank the game
  // under its own skin. Modern mode re-applies the full theme. Layout effect:
  // no flash of unthemed content between modes.
  useLayoutEffect(() => {
    const el = document.documentElement
    if (mode === 'modern') {
      applyTheme(theme)
    } else {
      for (const t of THEME_ORDER) for (const cls of THEME_META[t].classes) el.classList.remove(cls)
      delete el.dataset.theme
      el.style.colorScheme = ''
    }
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      /* storage can be denied (private mode) — mode just won't persist */
    }
  }, [mode, theme])

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage denied — theme just won't persist */
    }
  }, [theme])

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

  // The mode switch lives inside each UI's own control row (modern masthead /
  // game corner), not as a floating pill — both rows get [theme][…][mode].
  return mode === 'modern' ? (
    <ModernApp theme={theme} mode={mode} onSelectTheme={setTheme} onToggleMode={toggle} />
  ) : (
    <GameApp theme={theme} mode={mode} onSelectTheme={setTheme} onToggleMode={toggle} />
  )
}
