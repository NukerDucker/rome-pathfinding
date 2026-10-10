/**
 * Shared motion vocabulary for the animals (stage E readability refactor).
 *
 * Everything here is a pure builder or a literal the modules used to repeat.
 * The values are the exact ones the modules shipped with — changing one
 * changes the animation, so treat them as frozen (the stage E parity gate
 * hashes every emitted keyframe array).
 */

export type Point = { x: number; y: number }

// ── Easings ─────────────────────────────────────────────────────────────────
export const EASE_ROLL = 'cubic-bezier(.4,0,.6,1)'   // duck roll off / in
export const EASE_HOP = 'ease-out'                    // little hops and pops
export const EASE_SOFT = 'ease-in-out'                // cat peek
export const EASE_IN = 'ease-in'                      // cat duck-away, whale dive
export const EASE_FALL = 'cubic-bezier(.5,0,.9,.6)'   // whale drop from the sky

// ── Durations (ms) ──────────────────────────────────────────────────────────
export const MS_ROLL = 1000         // duck roll
export const MS_WHALE_JUMP = 1500   // whale arc
export const MS_WHALE_DIVE = 350    // whale sink after landing
export const MS_WHALE_DROP = 900    // whale fall onto its Guide perch
export const MS_HOP = 320           // cat / bird hop on a click
export const MS_WHALE_HOP = 360     // whale perch hop (slightly slower)

// ── Frame builders ──────────────────────────────────────────────────────────

/** Symmetric hop: up by `px` at 40% of the curve, back to rest. */
export function hopFrames(px: number): Keyframe[] {
  return [{ transform: 'none' }, { transform: `translateY(-${px}px)`, offset: 0.4 }, { transform: 'none' }]
}

/** The whale sprite box (rendered px) — used to centre it on a point. */
export const WHALE_SIZE = 96

/** Transform that centres the whale sprite on `p`; `extra` appends further
 *  transforms (rotate / mirror). */
export function whaleAt(p: Point, extra = ''): string {
  return `translate(${p.x - WHALE_SIZE / 2}px, ${p.y - WHALE_SIZE / 2}px)${extra}`
}

export interface ArcOptions {
  start: Point
  end: Point
  /** y of the arc's apex (above both maps' top edge) */
  peakY: number
  /** travel direction — right = clockwise flip, left = counter-clockwise */
  goingRight: boolean
  /** mirror suffix for the sprite (' scaleX(-1)' when heading left) */
  face: string
  /**
   * The 5th (leaving) jump: y the whale exits at, above the screen top.
   * When set, the arc rises to the apex at t 0.5, then keeps launching up off
   * the top of the screen, still spinning — one continuous motion rather than
   * the apex frames spliced onto a line.
   */
  exitY?: number
}

/**
 * The whale's jump: a 24-step parabola from `start` to `end` through `peakY`,
 * one full flip, fading in over the first 8% of the arc.
 */
export function arcFrames({ start, end, peakY, goingRight, face, exitY }: ArcOptions): Keyframe[] {
  const N = 24
  const frames: Keyframe[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = start.x + (end.x - start.x) * t
    const base = start.y + (end.y - start.y) * t
    const arc = base + (peakY - base) * 4 * t * (1 - t) // parabola through the apex
    // Leaving jump: past the apex the whale keeps launching straight up off the
    // top of the screen, still spinning. Both the extra height and the extra
    // spin ramp in as u^2, so they start from nothing at the apex — the
    // parabola's vertical speed is already zero there, and a linear join would
    // snap from a standstill to full speed and double the spin in one frame.
    const u = exitY === undefined || t <= 0.5 ? 0 : (t - 0.5) * 2
    const y = exitY === undefined || u === 0 ? arc : peakY + (exitY - peakY) * u * u
    // one full flip over the jump, rolling forward in its direction of travel,
    // plus a further half turn while it launches away
    const spin = (goingRight ? 360 : -360) * t + (goingRight ? 1 : -1) * 180 * u * u
    frames.push({
      transform: whaleAt({ x, y }, ` rotate(${spin}deg)${face}`),
      opacity: Math.min(1, t / 0.08),
      offset: t,
    })
  }
  return frames
}
