import { Moon, Rocket, Sun } from 'lucide-react'
import { useEffect, useId, useRef, type CSSProperties } from 'react'
import type { NodeId } from './romania'
import { CITIES } from './romania'

// ── Theme model ─────────────────────────────────────────────────────────────
// Four themes, cycled by the masthead button. `dnd` shows the illustrated map
// and a mushroom-ish fantasy look; `space` is a deep-space look (drifting
// starfield over a nebula) that reuses the dark tokens as its base.
export type Theme = 'light' | 'dark' | 'dnd' | 'space'

export const THEME_ORDER: Theme[] = ['light', 'dark', 'dnd', 'space']

export const THEME_META: Record<Theme, { label: string; short: string; classes: string[] }> = {
  light: { label: 'Light', short: 'Light', classes: [] },
  dark: { label: 'Dark', short: 'Dark', classes: ['dark'] },
  dnd: { label: 'Dungeons & Dragons', short: 'D&D', classes: ['dnd'] },
  space: { label: 'Space', short: 'Space', classes: ['space', 'dark'] },
}

export function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = window.localStorage.getItem('theme')
    if (stored && (THEME_ORDER as string[]).includes(stored)) return stored as Theme
  } catch { /* storage can be denied (private mode, disabled cookies) */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Apply a theme as classes + data-theme on <html>.
export function applyTheme(theme: Theme): void {
  const el = document.documentElement
  for (const t of THEME_ORDER) for (const cls of THEME_META[t].classes) el.classList.remove(cls)
  for (const cls of THEME_META[theme].classes) el.classList.add(cls)
  el.dataset.theme = theme
  el.style.colorScheme = theme === 'dark' || theme === 'space' ? 'dark' : 'light'
}

// ── Icons ───────────────────────────────────────────────────────────────────
// A small hand-drawn broom glyph (lucide has no broom); others are lucide.
export function BroomIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 3.5 12.5 11" />
      <path d="M12.5 11 7 16.5" />
      <path d="M7 16.5 2 22" />
      <path d="M7 16.5 4.5 23" />
      <path d="M7 16.5 7.5 23.5" />
      <path d="M7 16.5 11 23" />
      <path d="M7 16.5 15 20.5" />
    </svg>
  )
}

export function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light') return <Sun aria-hidden="true" />
  if (theme === 'dark') return <Moon aria-hidden="true" />
  if (theme === 'space') return <Rocket aria-hidden="true" />
  return <BroomIcon />
}

// ── Masthead control ────────────────────────────────────────────────────────
// Cycles the theme on click. The icon shows the theme you'll switch TO.
export function ThemeControl({ theme, onCycle, busy }: { theme: Theme; onCycle: () => void; busy: boolean }) {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
  return (
    <button
      type="button"
      className={`theme-toggle${busy ? ' theme-toggle-busy' : ''}`}
      aria-label={`Switch to ${THEME_META[next].label} theme`}
      title={`${THEME_META[next].label} theme`}
      onClick={onCycle}
      disabled={busy}
    >
      <ThemeIcon theme={next} />
    </button>
  )
}

// ── Gacha-style theme roll ──────────────────────────────────────────────────
// A translucent rounded card pops up from centre-bottom and plays a themed
// reveal — sunset, moonrise, a witch on her broom, a ship lifting off — with a
// light sweep and a spark burst, then the theme switches and the card fades.
export function ThemeRoll({ theme, nonce }: { theme: Theme; nonce: number }) {
  const meta = THEME_META[theme]
  const sparks = Array.from({ length: 12 }, (_, i) => i)
  return (
    <div className="theme-roll" key={nonce} role="status" aria-live="polite" aria-label={`${meta.label} theme`}>
      <div className={`roll-card roll-${theme}`}>
        <span className="roll-rays" aria-hidden="true" />
        <div className="roll-scene" aria-hidden="true">
          <RollScene theme={theme} />
        </div>
        <div className="roll-caption">
          <span className="roll-kicker">New theme</span>
          <span className="roll-name">{meta.label}</span>
        </div>
        <span className="roll-shine" aria-hidden="true" />
        {sparks.map((i) => (
          <span key={i} className="roll-spark" style={{ '--i': i } as CSSProperties} aria-hidden="true" />
        ))}
      </div>
    </div>
  )
}

// Per-theme artwork for the roll card. Kept as inline SVG so it stays crisp at
// any size and needs no image assets. Elements carry classes the stylesheet
// animates (rise / fly / launch / twinkle).
function RollScene({ theme }: { theme: Theme }) {
  if (theme === 'light') {
    return (
      <svg className="roll-art" viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="rs-l-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bfe4ff" />
            <stop offset="52%" stopColor="#ffe2b0" />
            <stop offset="100%" stopColor="#fff6e6" />
          </linearGradient>
          <radialGradient id="rs-l-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#fffbe6" />
            <stop offset="55%" stopColor="#ffd24d" />
            <stop offset="100%" stopColor="#ff9d2b" />
          </radialGradient>
        </defs>
        <rect width="200" height="140" fill="url(#rs-l-sky)" />
        <g className="rs-sun">
          <circle cx="100" cy="84" r="34" fill="url(#rs-l-sun)" />
          <g stroke="#ffcf6a" strokeWidth="3" strokeLinecap="round" opacity="0.8">
            <line x1="100" y1="30" x2="100" y2="18" />
            <line x1="146" y1="48" x2="154" y2="40" />
            <line x1="54" y1="48" x2="46" y2="40" />
            <line x1="160" y1="84" x2="172" y2="84" />
            <line x1="40" y1="84" x2="28" y2="84" />
          </g>
        </g>
        <path d="M0 110 Q50 86 100 110 T200 106 L200 140 L0 140 Z" fill="#8fd694" />
        <path d="M0 120 Q60 102 120 122 T200 120 L200 140 L0 140 Z" fill="#69bd72" />
        <g className="rs-birds" stroke="#7a5a3a" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M58 44 q7 -7 14 0" />
          <path d="M78 34 q6 -6 12 0" />
        </g>
      </svg>
    )
  }
  if (theme === 'dark') {
    return (
      <svg className="roll-art" viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="rs-d-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#141a3e" />
            <stop offset="60%" stopColor="#232c5e" />
            <stop offset="100%" stopColor="#3a4a86" />
          </linearGradient>
          <radialGradient id="rs-d-moon" cx="0.4" cy="0.36" r="0.66">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="58%" stopColor="#cdd8ff" />
            <stop offset="100%" stopColor="#9fb0f0" />
          </radialGradient>
        </defs>
        <rect width="200" height="140" fill="url(#rs-d-sky)" />
        <g className="rs-stars" fill="#ffffff">
          <circle className="tw" cx="26" cy="26" r="1.6" />
          <circle className="tw" cx="60" cy="18" r="1.2" />
          <circle className="tw" cx="150" cy="24" r="1.7" />
          <circle className="tw" cx="178" cy="46" r="1.2" />
          <circle className="tw" cx="118" cy="30" r="1.1" />
          <circle className="tw" cx="42" cy="52" r="1.3" />
        </g>
        <g className="rs-moon">
          <circle cx="100" cy="82" r="32" fill="url(#rs-d-moon)" />
          <circle cx="86" cy="72" r="5" fill="#b9c6f2" opacity="0.55" />
          <circle cx="106" cy="88" r="7" fill="#b9c6f2" opacity="0.4" />
          <circle cx="112" cy="66" r="3.4" fill="#b9c6f2" opacity="0.5" />
        </g>
        <path d="M0 112 Q54 94 104 114 T200 110 L200 140 L0 140 Z" fill="#1c2246" />
        <path d="M0 122 Q64 106 128 124 T200 122 L200 140 L0 140 Z" fill="#141833" />
        <g className="rs-shoot">
          <line x1="30" y1="33" x2="58" y2="14" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="58" cy="14" r="2.4" fill="#ffffff" />
        </g>
      </svg>
    )
  }
  if (theme === 'dnd') {
    return (
      <svg className="roll-art" viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="rs-dd-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#241a52" />
            <stop offset="55%" stopColor="#47276b" />
            <stop offset="100%" stopColor="#6d3a86" />
          </linearGradient>
          <radialGradient id="rs-dd-moon" cx="0.42" cy="0.38" r="0.66">
            <stop offset="0%" stopColor="#fff6ff" />
            <stop offset="60%" stopColor="#eed9ff" />
            <stop offset="100%" stopColor="#c9a8ee" />
          </radialGradient>
        </defs>
        <rect width="200" height="140" fill="url(#rs-dd-sky)" />
        <circle cx="100" cy="58" r="34" fill="url(#rs-dd-moon)" />
        <g className="rs-stars" fill="#fff3ff">
          <circle className="tw" cx="24" cy="30" r="1.5" />
          <circle className="tw" cx="52" cy="18" r="1.1" />
          <circle className="tw" cx="168" cy="26" r="1.6" />
          <circle className="tw" cx="184" cy="56" r="1.1" />
          <circle className="tw" cx="148" cy="16" r="1.2" />
        </g>
        <g className="rs-dust" fill="#ffe9a8">
          <circle cx="70" cy="78" r="1.8" />
          <circle cx="58" cy="84" r="1.3" />
          <circle cx="44" cy="80" r="1.6" />
          <circle cx="30" cy="88" r="1.2" />
        </g>
        <g className="rs-witch">
          {/* mirrored so the bristles trail behind as she flies to the right */}
          <g transform="translate(200 0) scale(-1 1)">
            <line x1="84" y1="70" x2="128" y2="60" stroke="#7b4a24" strokeWidth="3" strokeLinecap="round" />
            <path d="M128 60 L150 51 L151 61 L149 70 Z" fill="#d9a94f" />
            <path d="M92 68 q-9 -3 -5 -15 q3 -10 12 -12 l15 -2 q-6 10 2 16 q-11 13 -24 13 z" fill="#33254f" />
            <circle cx="100" cy="47" r="5.4" fill="#f7dcb4" />
            <path d="M90 46 L112 44 L101 24 Z" fill="#2a1f46" />
            <path d="M88 47 q13 5 26 -2" fill="none" stroke="#2a1f46" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>
        <path d="M0 114 Q52 94 104 116 T200 112 L200 140 L0 140 Z" fill="#2b1c4e" />
        <path d="M0 124 Q64 108 128 126 T200 124 L200 140 L0 140 Z" fill="#1e1438" />
        <g className="rs-mush" fill="#ffd9ec" stroke="#3f2a63" strokeWidth="1.4">
          <path d="M20 136 a5 5 0 0 1 10 0 z" />
          <path d="M172 137 a6 6 0 0 1 12 0 z" />
        </g>
      </svg>
    )
  }
  // space
  return (
    <svg className="roll-art" viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="rs-s-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#05060f" />
          <stop offset="58%" stopColor="#0a1030" />
          <stop offset="100%" stopColor="#182a5e" />
        </linearGradient>
        <linearGradient id="rs-s-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c9d6ff" />
          <stop offset="55%" stopColor="#eef2ff" />
          <stop offset="100%" stopColor="#aebbf0" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" fill="url(#rs-s-sky)" />
      <g className="rs-stars" fill="#ffffff">
        <circle className="tw" cx="30" cy="24" r="1.5" />
        <circle className="tw" cx="66" cy="40" r="1.1" />
        <circle className="tw" cx="160" cy="30" r="1.6" />
        <circle className="tw" cx="150" cy="86" r="1.2" />
        <circle className="tw" cx="180" cy="60" r="1.3" />
        <circle className="tw" cx="112" cy="20" r="1.1" />
      </g>
      <g opacity="0.9">
        <circle cx="34" cy="104" r="20" fill="#3b5bb8" />
        <ellipse cx="34" cy="104" rx="32" ry="8" fill="none" stroke="#8fb0ff" strokeWidth="2" opacity="0.7" />
      </g>
      <g className="rs-ship">
        {/* Exhaust sits behind the craft and starts at the nozzle. */}
        <g className="rs-fire">
          <path className="rs-flame" d="M94 108 Q100 138 106 108 Z" fill="#ff9d2b" />
          <path className="rs-flame2" d="M97 108 Q100 124 103 108 Z" fill="#ffe08a" />
        </g>
        <g className="rs-craft">
          {/* Fins sweep back from the lower body. */}
          <path d="M90 78 L90 100 L70 106 Z" fill="#ff5f6d" />
          <path d="M110 78 L110 100 L130 106 Z" fill="#ff5f6d" />
          {/* Nozzle at the base. */}
          <path d="M92 100 L108 100 L105 110 L95 110 Z" fill="#8a93b8" />
          {/* One continuous tapered fuselage. */}
          <path d="M100 16 C91 30 90 40 90 52 L90 100 L110 100 L110 52 C110 40 109 30 100 16 Z" fill="url(#rs-s-body)" />
          {/* Nose cap. */}
          <path d="M100 16 C91 30 90 40 90 48 L110 48 C110 40 109 30 100 16 Z" fill="#ff5f6d" />
          {/* Inset window. */}
          <circle cx="100" cy="62" r="7" fill="#7fb7ff" stroke="#dbe6ff" strokeWidth="1.6" />
          {/* Soft highlight down the left of the body. */}
          <path d="M94 44 C93 56 93 80 94 96" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}

// ── D&D living background ───────────────────────────────────────────────────
// A fluid field of colour blobs that drift in straight lines and bounce off the
// viewport edges (classic screensaver style), plus a soft blob that trails the
// cursor. Driven in JavaScript so it keeps moving under every OS setting;
// rendered only in D&D and sits behind the frosted panels (z-index: -1).
export function DndAurora() {
  const blobsRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let vw = window.innerWidth
    let vh = window.innerHeight
    let cx = vw / 2
    let cy = vh * 0.4
    let tx = cx
    let ty = cy

    type Blob = { el: HTMLElement; r: number; x: number; y: number; vx: number; vy: number }
    const blobs: Blob[] = []
    const START = [
      { fx: 0.24, fy: 0.24 },
      { fx: 0.76, fy: 0.24 },
      { fx: 0.24, fy: 0.76 },
      { fx: 0.76, fy: 0.76 },
    ]
    const spawn = (el: HTMLElement, i: number): Blob => {
      const r = (el.offsetWidth || 400) / 2
      const loX = r, hiX = Math.max(r, vw - r)
      const loY = r, hiY = Math.max(r, vh - r)
      const s = START[i % START.length]
      const jx = Math.min(1, Math.max(0, s.fx + (Math.random() * 0.16 - 0.08)))
      const jy = Math.min(1, Math.max(0, s.fy + (Math.random() * 0.16 - 0.08)))
      const b: Blob = {
        el, r,
        x: loX + jx * (hiX - loX),
        y: loY + jy * (hiY - loY),
        vx: (Math.random() < 0.5 ? -1 : 1) * (24 + Math.random() * 34),
        vy: (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 30),
      }
      el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`
      return b
    }
    const collect = () => {
      blobs.length = 0
      const els = Array.from(blobsRef.current?.children ?? []) as HTMLElement[]
      els.forEach((el, i) => blobs.push(spawn(el, i)))
    }
    const resize = () => {
      vw = window.innerWidth
      vh = window.innerHeight
      for (const b of blobs) {
        b.r = (b.el.offsetWidth || 400) / 2
        b.x = Math.min(Math.max(b.x, b.r), Math.max(b.r, vw - b.r))
        b.y = Math.min(Math.max(b.y, b.r), Math.max(b.r, vh - b.r))
      }
    }
    const onMove = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY }

    collect()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // cursor blob eases toward the pointer
      cx += (tx - cx) * 0.08
      cy += (ty - cy) * 0.08
      if (cursorRef.current) cursorRef.current.style.transform = `translate3d(${cx}px, ${cy}px, 0)`
      // background blobs drift in a straight line and reflect off the edges
      for (const b of blobs) {
        b.x += b.vx * dt
        b.y += b.vy * dt
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) }
        else if (b.x > vw - b.r) { b.x = vw - b.r; b.vx = -Math.abs(b.vx) }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) }
        else if (b.y > vh - b.r) { b.y = vh - b.r; b.vy = -Math.abs(b.vy) }
        b.el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`
      }
      raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div className="dnd-aurora" aria-hidden="true">
      <div className="aurora-blobs" ref={blobsRef}>
        <span className="aurora-blob aurora-1" />
        <span className="aurora-blob aurora-2" />
        <span className="aurora-blob aurora-3" />
        <span className="aurora-blob aurora-4" />
      </div>
      <span className="aurora-cursor" ref={cursorRef} />
    </div>
  )
}

// ── Space starfield ───────────────────────────────────────────────────────
// A slowly drifting, twinkling starfield painted on a canvas over the nebula
// backdrop (from the stylesheet). Rendered only in the space theme; sits behind
// the frosted panels. Driven in JavaScript so it always animates.
export function SpaceField() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    let w = 0
    let h = 0
    type Star = { x: number; y: number; z: number; r: number; tw: number; ph: number }
    let stars: Star[] = []
    const build = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(420, Math.round((w * h) / 8000))
      stars = Array.from({ length: count }, () => {
        const z = Math.random()
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: 0.4 + z * 1.5,
          tw: 0.5 + Math.random() * 2.4,
          ph: Math.random() * Math.PI * 2,
        }
      })
    }
    build()
    let last = performance.now()
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        // nearer stars (higher z) drift faster — a gentle parallax
        s.x -= (5 + s.z * 18) * dt
        if (s.x < -4) { s.x = w + 4; s.y = Math.random() * h }
        ctx.globalAlpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((now / 1000) * s.tw + s.ph))
        ctx.fillStyle = s.z > 0.8 ? '#bfe6ff' : '#ffffff'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    window.addEventListener('resize', build)
    return () => {
      window.removeEventListener('resize', build)
      cancelAnimationFrame(raf)
    }
  }, [])
  return <canvas className="space-field" ref={ref} aria-hidden="true" />
}

// ── Planets ───────────────────────────────────────────────────────────
// Every system gets a curated planet — a palette + surface pattern picked from
// its name — so each looks deliberate and stays identical across renders.
export type PlanetPattern = 'bands' | 'continents' | 'craters' | 'cracks'

export type PlanetInfo = {
  id: string
  clipId: string
  pattern: PlanetPattern
  light: string
  mid: string
  deep: string
  ring: boolean
  ringRot: number
}

const PLANET_PALETTES: { hue: number; pattern: PlanetPattern }[] = [
  { hue: 210, pattern: 'continents' }, // ocean blue
  { hue: 195, pattern: 'craters' },    // icy blue
  { hue: 180, pattern: 'bands' },      // teal gas
  { hue: 165, pattern: 'continents' }, // shallow sea
  { hue: 150, pattern: 'craters' },    // mossy rock
  { hue: 130, pattern: 'continents' }, // terran
  { hue: 100, pattern: 'cracks' },     // toxic
  { hue: 70, pattern: 'craters' },     // olive desert
  { hue: 50, pattern: 'craters' },     // sand
  { hue: 30, pattern: 'cracks' },      // volcanic
  { hue: 15, pattern: 'craters' },     // rusty
  { hue: 0, pattern: 'cracks' },       // lava
  { hue: 345, pattern: 'continents' }, // crimson sea
  { hue: 330, pattern: 'bands' },      // rose gas
  { hue: 315, pattern: 'craters' },    // magenta rock
  { hue: 300, pattern: 'bands' },      // orchid gas
  { hue: 285, pattern: 'continents' }, // purple sea
  { hue: 270, pattern: 'bands' },      // violet gas
  { hue: 255, pattern: 'craters' },    // indigo rock
  { hue: 235, pattern: 'continents' }, // deep blue
]

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function planetFor(city: string, ns: string): PlanetInfo {
  // Assign a palette by scrambling the city's (stable) list index with a stride
  // coprime with the palette count, so every city gets its own hue + pattern.
  const idx = Math.max(0, CITIES.indexOf(city as NodeId))
  const p = PLANET_PALETTES[(idx * 7) % PLANET_PALETTES.length]
  const h = hashStr(city)
  const key = city.replace(/\W/g, '')
  return {
    id: `${ns}pl${key}`,
    clipId: `${ns}clip${key}`,
    pattern: p.pattern,
    light: `hsl(${p.hue} 88% 82%)`,
    mid: `hsl(${p.hue} 72% 54%)`,
    deep: `hsl(${(p.hue + 26) % 360} 60% 20%)`,
    ring: (h >> 9) % 3 === 0,
    ringRot: ((h >> 5) % 70) - 35,
  }
}

// ── Cockpit planet window ─────────────────────────────────────────────────
// A wide cockpit "screen" above a map, as wide as the map itself. It shows the
// planet the ship is currently at — so it changes as the search jumps between
// systems — plus an FTL light-drag burst on every jump. One per spaceship.
export function PlanetWindow({ variant, city, nonce }: { variant: 'a' | 'b'; city: NodeId; nonce: number }) {
  // Unique per instance so the hidden split/merged lane SVGs don't emit duplicate ids.
  const uid = useId().replace(/:/g, '')
  const p = planetFor(city, `pw${variant}${uid}`)
  // Skip the burst on first mount: entering the space theme mid-run (or returning
  // from the Guide tab) must not replay a jump while the ship is parked.
  const firstNonce = useRef(nonce)
  const jumping = nonce !== firstNonce.current
  return (
    <div className={`planet-window planet-${variant}`} aria-hidden="true">
      {/* The scene (stars + planet) is re-mounted per jump so it can stretch. */}
      <div className={`pw-scene${jumping ? ' pw-jumping' : ''}`} key={nonce}>
        <span className="pw-stars" />
        <PlanetView p={p} />
      </div>
      <span className="pw-callout" />
      <span className="pw-namecard">{city}</span>
      {jumping && (
        <span className="pw-warp" key={`w${nonce}`}>
          {/* Two sets layered: half the arms start at the centre point, half
              start from the inner-circle buffer. All fire at once. */}
          {Array.from({ length: 32 }, (_, i) => (
            <i key={i} style={{
              '--a': `${i * 11.25}deg`,
              '--b': i % 2 === 0 ? '0px' : '26px',
            } as CSSProperties} />
          ))}
        </span>
      )}
      {jumping && <span className="pw-flash" key={`f${nonce}`} />}
      <span className="pw-glass" />
    </div>
  )
}

// The detailed planet view for the cockpit screen (viewBox 0 0 100 100).
function PlanetView({ p }: { p: PlanetInfo }) {
  const uid = p.id
  const band = (yTop: number, h: number, bulge: number) =>
    `M10 ${yTop} Q50 ${yTop + bulge} 90 ${yTop} L90 ${yTop + h} Q50 ${yTop + h + bulge} 10 ${yTop + h} Z`
  return (
    <svg className="pw-planet" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-base`} cx="0.34" cy="0.28" r="0.85">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="52%" stopColor={p.mid} />
          <stop offset="100%" stopColor={p.deep} />
        </radialGradient>
        <radialGradient id={`${uid}-shade`} cx="0.74" cy="0.76" r="0.78">
          <stop offset="30%" stopColor="rgba(2,6,16,0)" />
          <stop offset="100%" stopColor="rgba(2,6,16,0.92)" />
        </radialGradient>
        <filter id={`${uid}-tex`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency={p.pattern === 'bands' ? '0.012 0.03' : '0.03'} numOctaves="4" seed={hashStr(p.id) % 20} result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id={`${uid}-clip`}><circle cx="50" cy="52" r="38" /></clipPath>
      </defs>
      {p.ring && (
        <ellipse cx="50" cy="52" rx="47" ry="13" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3"
          transform={`rotate(${p.ringRot} 50 52)`} />
      )}
      <circle cx="50" cy="52" r="38" fill={`url(#${uid}-base)`} />
      <g clipPath={`url(#${uid}-clip)`}>
        {p.pattern === 'bands' ? (
          <g style={{ opacity: 0.5 }}>
            <path d={band(26, 6, 7)} style={{ fill: p.deep }} />
            <path d={band(38, 5, 8)} style={{ fill: p.light }} />
            <path d={band(49, 8, 9)} style={{ fill: p.deep }} />
            <path d={band(64, 5, 8)} style={{ fill: p.light }} />
            <path d={band(74, 6, 7)} style={{ fill: p.deep }} />
            <ellipse cx="62" cy="60" rx="9" ry="5" style={{ fill: p.light }} />
          </g>
        ) : p.pattern === 'craters' ? (
          <g style={{ opacity: 0.6 }}>
            <circle cx="40" cy="40" r="9" style={{ fill: p.deep }} />
            <circle cx="64" cy="60" r="12" style={{ fill: p.deep }} />
            <circle cx="54" cy="76" r="7" style={{ fill: p.deep }} />
            <circle cx="36" cy="64" r="6" style={{ fill: p.light }} />
            <circle cx="66" cy="38" r="5" style={{ fill: p.light }} />
          </g>
        ) : p.pattern === 'cracks' ? (
          <g style={{ opacity: 0.7 }}>
            <path d="M22 58 L44 50 L60 60 L78 50" fill="none" stroke={p.deep} strokeWidth="6" strokeLinecap="round" />
            <path d="M30 38 L50 46 L72 36" fill="none" stroke={p.deep} strokeWidth="4" strokeLinecap="round" />
            <path d="M40 74 L58 66 L76 74" fill="none" stroke={p.deep} strokeWidth="5" strokeLinecap="round" />
            <circle cx="52" cy="56" r="5" style={{ fill: p.light }} />
          </g>
        ) : (
          <g style={{ opacity: 0.75 }}>
            <ellipse cx="40" cy="42" rx="19" ry="11" transform="rotate(-12 40 42)" style={{ fill: p.light }} />
            <ellipse cx="66" cy="62" rx="14" ry="8" transform="rotate(16 66 62)" style={{ fill: p.light }} />
            <ellipse cx="56" cy="78" rx="10" ry="5" transform="rotate(-8 56 78)" style={{ fill: p.light }} />
            <ellipse cx="46" cy="60" rx="16" ry="9" transform="rotate(8 46 60)" style={{ fill: p.mid }} />
          </g>
        )}
        <circle cx="50" cy="52" r="38" filter={`url(#${uid}-tex)`} style={{ opacity: 0.4, mixBlendMode: 'overlay' }} />
        <circle cx="50" cy="52" r="38" fill={`url(#${uid}-shade)`} />
      </g>
      <circle cx="50" cy="52" r="37.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" />
      <ellipse cx="37" cy="34" rx="10" ry="6" fill="rgba(255,255,255,0.28)" transform="rotate(-26 37 34)" />
    </svg>
  )
}

