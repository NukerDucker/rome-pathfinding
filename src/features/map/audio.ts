// ── Audio: fully synthesised with the Web Audio API ─────────────────────────
// No external files, so there is nothing to licence (the brief asked for
// copyright-free audio). Everything is generated on the fly:
//   • Celtic loop      — a D-dorian jig (plucked melody + drone) for the D&D theme
//   • Dice roll        — rattling filtered-noise bursts, played when the search starts
//   • Expand "dup"     — a short wooden click as each node is explored
//   • Scene reveals    — crow caw / owl hoot / glitter / whoosh for the theme roll
//   • Victory trumpet  — a brass fanfare when the route is found
//
// Autoplay policy: the AudioContext starts suspended until a user gesture, so
// every entry point resumes it and App also installs a one-time pointerdown
// unlock.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicGain: GainNode | null = null
let muted = false

function ac(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.55
    master.connect(ctx.destination)
    musicGain = ctx.createGain()
    musicGain.gain.value = 0.34
    musicGain.connect(master)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Resume the audio context after a gesture (safe to call often). */
export function ensureAudio(): void { ac() }

export function setMuted(m: boolean): void {
  muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02)
}

// ── noise helper ────────────────────────────────────────────────────────────
let noiseBuf: AudioBuffer | null = null
function noise(c: AudioContext, seconds: number): AudioBuffer {
  if (!noiseBuf || noiseBuf.duration < seconds) {
    noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

// ── sound effects ───────────────────────────────────────────────────────────
export function playDice(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime
  for (let i = 0; i < 7; i++) {
    const t = t0 + i * 0.075 + Math.random() * 0.02
    const src = c.createBufferSource(); src.buffer = noise(c, 0.06)
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'
    bp.frequency.value = 1100 + Math.random() * 1900; bp.Q.value = 1.3
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    src.connect(bp); bp.connect(g); g.connect(master!)
    src.start(t); src.stop(t + 0.08)
  }
}

export function playExpand(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime
  const src = c.createBufferSource(); src.buffer = noise(c, 0.04)
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 760; bp.Q.value = 0.9
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(0.42, t0 + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07)
  src.connect(bp); bp.connect(g); g.connect(master!)
  src.start(t0); src.stop(t0 + 0.08)

  const osc = c.createOscillator(); osc.type = 'triangle'
  osc.frequency.setValueAtTime(180, t0); osc.frequency.exponentialRampToValueAtTime(98, t0 + 0.07)
  const g2 = c.createGain()
  g2.gain.setValueAtTime(0.0001, t0)
  g2.gain.exponentialRampToValueAtTime(0.24, t0 + 0.004)
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1)
  osc.connect(g2); g2.connect(master!)
  osc.start(t0); osc.stop(t0 + 0.11)
}

function brass(c: AudioContext, freq: number, t: number, dur: number): void {
  const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = freq
  const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = freq; o2.detune.value = 7
  const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 2600; filt.Q.value = 0.7
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.26, t + 0.025)
  g.gain.setValueAtTime(0.26, t + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(master!)
  o1.start(t); o2.start(t)
  o1.stop(t + dur + 0.03); o2.stop(t + dur + 0.03)
}

export function playVictory(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime + 0.02
  // C5  E5  G5  C6 — a short fanfare, last note held
  brass(c, 523.25, t0, 0.16)
  brass(c, 659.25, t0 + 0.16, 0.16)
  brass(c, 783.99, t0 + 0.32, 0.16)
  brass(c, 1046.5, t0 + 0.5, 0.6)
}

// ── Per-theme reveal sounds (played when the roll starts) ────────────────────
// Crow caw for the sunrise/light theme.
export function playCrow(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime + 0.02
  const caw = (t: number, base: number) => {
    const osc = c.createOscillator(); osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(base * 1.6, t)
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.13)
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * 2.3; bp.Q.value = 2.4
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.014)
    g.gain.setValueAtTime(0.28, t + 0.07)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
    const n = c.createBufferSource(); n.buffer = noise(c, 0.05)
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100
    const ng = c.createGain(); ng.gain.value = 0.07
    osc.connect(bp); bp.connect(g); g.connect(master!)
    n.connect(hp); hp.connect(ng); ng.connect(g)
    osc.start(t); osc.stop(t + 0.2)
    n.start(t); n.stop(t + 0.1)
  }
  caw(t0, 700)
  caw(t0 + 0.21, 620)
}

// Soft low "hoo — hoo" for the night/dark theme.
export function playOwl(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime + 0.02
  const hoo = (t: number, f: number, dur: number, vol: number) => {
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = f
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2.02
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const g2 = c.createGain(); g2.gain.value = 0.3
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(master!)
    o1.start(t); o1.stop(t + dur + 0.05)
    o2.start(t); o2.stop(t + dur + 0.05)
  }
  hoo(t0, 330, 0.42, 0.26)
  hoo(t0 + 0.48, 294, 0.7, 0.24)
}

// A shimmering fairy-dust sparkle for the D&D theme.
export function playGlitter(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime + 0.02
  const scale = [1046.5, 1318.5, 1568, 2093, 2637, 3136, 3520]
  for (let i = 0; i < 14; i++) {
    const t = t0 + i * 0.045 + Math.random() * 0.012
    const f = scale[i % scale.length] * (Math.random() < 0.5 ? 1 : 2)
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    o.connect(g); g.connect(master!)
    o.start(t); o.stop(t + 0.2)
  }
}

// A filtered-noise sweep for the space theme.
export function playWhoosh(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime + 0.01
  const src = c.createBufferSource(); src.buffer = noise(c, 0.7)
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1
  bp.frequency.setValueAtTime(320, t0)
  bp.frequency.exponentialRampToValueAtTime(4200, t0 + 0.35)
  bp.frequency.exponentialRampToValueAtTime(520, t0 + 0.6)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.16)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62)
  src.connect(bp); bp.connect(g); g.connect(master!)
  src.start(t0); src.stop(t0 + 0.7)
}

// ── Celtic loop ─────────────────────────────────────────────────────────────
// A D-dorian jig: a plucked melody over a drone. Scheduled with a look-ahead
// timer so it stays steady.
const D = 293.66, E = 329.63, F = 349.23, G = 392.0, A = 440.0, B = 493.88, C = 523.25, D5 = 587.33

// 16 eighth-notes (one loop)
const MELODY: number[] = [D5, A, B, C, D5, A, G, F, G, A, B, C, A, F, E, D]
const EIGHTH = 60 / 108 / 2 // 108 BPM, eighth notes

let musicTimer: number | null = null
let nextTime = 0
let idx = 0

function pluck(c: AudioContext, freq: number, t: number, dur: number): void {
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2; o2.detune.value = 4
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g); o2.connect(g); g.connect(musicGain!)
  o.start(t); o2.start(t)
  o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02)
}

function drone(c: AudioContext, t: number, dur: number): void {
  for (const f of [D / 2, D / 2 * 1.005]) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.4)
    g.gain.setValueAtTime(0.16, t + dur - 0.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(musicGain!)
    o.start(t); o.stop(t + dur + 0.05)
  }
}

function schedule(): void {
  const c = ctx
  if (!c) return
  while (nextTime < c.currentTime + 0.25) {
    pluck(c, MELODY[idx % MELODY.length], nextTime, EIGHTH * 1.6)
    nextTime += EIGHTH
    idx++
  }
}

export function startCeltic(): void {
  if (musicTimer !== null) return
  const c = ac()
  nextTime = c.currentTime + 0.08
  idx = 0
  drone(c, c.currentTime + 0.02, EIGHTH * MELODY.length)
  schedule()
  musicTimer = window.setInterval(schedule, 60)
}

export function stopCeltic(): void {
  if (musicTimer !== null) { window.clearInterval(musicTimer); musicTimer = null }
}

// ── Space theme: FTL laser + ambience ───────────────────────────────────────
// A quick descending "pew" fired on every hyperlane jump.
export function playLaser(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime
  const osc = c.createOscillator(); osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(2400, t0)
  osc.frequency.exponentialRampToValueAtTime(240, t0 + 0.2)
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 7
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
  osc.connect(bp); bp.connect(g); g.connect(master!)
  osc.start(t0); osc.stop(t0 + 0.24)

  // tiny noise transient so the zap has an edge
  const n = c.createBufferSource(); n.buffer = noise(c, 0.05)
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.14, t0)
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)
  n.connect(hp); hp.connect(ng); ng.connect(master!)
  n.start(t0); n.stop(t0 + 0.06)
}

// A short electrical crackle, scattered at random through the hum.
function playSpark(): void {
  if (muted) return
  const c = ac(); const t0 = c.currentTime + Math.random() * 0.04
  const n = c.createBufferSource(); n.buffer = noise(c, 0.16)
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'
  bp.frequency.value = 2600 + Math.random() * 2800; bp.Q.value = 2.6
  const g = c.createGain()
  const vol = 0.05 + Math.random() * 0.08
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07 + Math.random() * 0.06)
  n.connect(bp); bp.connect(g); g.connect(master!)
  n.start(t0); n.stop(t0 + 0.24)

  const o = c.createOscillator(); o.type = 'square'
  o.frequency.setValueAtTime(4200 + Math.random() * 3000, t0)
  o.frequency.exponentialRampToValueAtTime(1100, t0 + 0.05)
  const g2 = c.createGain()
  g2.gain.setValueAtTime(0.0001, t0)
  g2.gain.exponentialRampToValueAtTime(0.045, t0 + 0.003)
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06)
  o.connect(g2); g2.connect(master!)
  o.start(t0); o.stop(t0 + 0.08)
}

// ── Space hum ───────────────────────────────────────────────────────────────
// A low warp-core drone with scattered electrical sparks; runs while the space
// theme is active (after the first gesture).
let humGain: GainNode | null = null
let humOscs: OscillatorNode[] = []
let humTimer: number | null = null

export function startSpaceHum(): void {
  if (humTimer !== null) return
  const c = ac()
  const gain = c.createGain()
  gain.gain.value = 0.0001
  gain.connect(master!)
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 0.4
  lp.connect(gain)
  const spec: [OscillatorType, number][] = [['sine', 58], ['sine', 87.4], ['triangle', 29], ['sine', 116.5]]
  humOscs = spec.map(([type, f]) => {
    const o = c.createOscillator(); o.type = type; o.frequency.value = f
    o.connect(lp); o.start(); return o
  })
  gain.gain.setValueAtTime(0.0001, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 1.4)
  humGain = gain
  humTimer = window.setInterval(() => { if (Math.random() < 0.55) playSpark() }, 1300)
}

export function stopSpaceHum(): void {
  if (humTimer === null) return
  window.clearInterval(humTimer)
  humTimer = null
  const c = ctx
  const gain = humGain
  humGain = null
  const oscs = humOscs
  humOscs = []
  if (gain && c) {
    gain.gain.cancelScheduledValues(c.currentTime)
    gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.25)
  }
  window.setTimeout(() => { for (const o of oscs) { try { o.stop() } catch { /* already stopped */ } } }, 900)
}
