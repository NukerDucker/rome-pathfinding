/**
 * WebAudio synths ported from origin/ui-game script.js:
 *   quack      1351-1371
 *   meow       1517-1540
 *   mrrp       1593-1608
 *   whaleSound 1691-1718
 *   capySound  1864-1887
 *   birdSound  2029-2056
 *
 * The original kept ONE module-scope `quackCtx` shared by every animal
 * ("shared with the duck") and built it lazily on the first gesture, because
 * browsers block audio until then. That is preserved: `ensure()` is the only
 * place the context is constructed and it is only reached from a click/change
 * handler. Every synth call is the same call the original made.
 */

type AudioContextCtor = typeof AudioContext;

/** script.js 1352: `new (window.AudioContext || window.webkitAudioContext)()` */
function audioCtor(): AudioContextCtor | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  return (globalThis as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
}

let ctx: AudioContext | null = null;

/**
 * The shared, lazily-built context (script.js 1352 `quackCtx ??= ...`).
 * No-op (null) where WebAudio is missing; the original assumed it exists.
 */
export function ensure(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  // built inside the gesture handler, as the autoplay policy requires
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/**
 * Release the shared context. NOT called by any animal's dispose() — the
 * context is shared, so only the game shell (on unmount) may close it.
 */
export function close(): void {
  const closing = ctx;
  ctx = null;
  if (closing) void closing.close().catch(() => {});
}

// pitch: 1 = normal; length: seconds
export function quack(pitch = 1, length = 0.22): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  // nasal buzz (sawtooth) that drops in pitch, shaped by a "beak" band-pass filter
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(420 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(260 * pitch, t + length * 0.8);
  const beak = c.createBiquadFilter();
  beak.type = 'bandpass';
  beak.frequency.setValueAtTime(1300 * pitch, t);
  beak.frequency.exponentialRampToValueAtTime(800 * pitch, t + length * 0.8);
  beak.Q.value = 4;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.6, t + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(beak).connect(amp).connect(c.destination);
  osc.start(t);
  osc.stop(t + length + 0.03);
}

export function meow(): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  // "mee-ow": pitch rises then falls, through a vowel-like band-pass that opens then closes
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.linearRampToValueAtTime(820, t + 0.18);
  osc.frequency.exponentialRampToValueAtTime(480, t + 0.55);
  const mouth = c.createBiquadFilter();
  mouth.type = 'bandpass';
  mouth.Q.value = 3;
  mouth.frequency.setValueAtTime(900, t);
  mouth.frequency.linearRampToValueAtTime(1800, t + 0.2);
  mouth.frequency.exponentialRampToValueAtTime(700, t + 0.55);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
  amp.gain.setValueAtTime(0.5, t + 0.35);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  osc.connect(mouth).connect(amp).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.65);
}

/** short, high, surprised "mrrp!" */
export function mrrp(): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator(), mouth = c.createBiquadFilter(), amp = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(700, t);
  osc.frequency.exponentialRampToValueAtTime(1150, t + 0.12);
  mouth.type = 'bandpass'; mouth.Q.value = 3;
  mouth.frequency.setValueAtTime(1400, t);
  mouth.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(mouth).connect(amp).connect(c.destination);
  osc.start(t); osc.stop(t + 0.2);
}

/** Short burst of filtered noise: a whoosh (band-pass sweep) or a splash (low-pass hit) */
export function whaleSound(kind: 'whoosh' | 'splash', volume = 1): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const len = kind === 'whoosh' ? 0.7 : 0.5;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  if (kind === 'whoosh') {
    filter.type = 'bandpass'; filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2500, t + len);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.35 * volume, t + len * 0.5);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  } else {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + len);
    amp.gain.setValueAtTime(0.7 * volume, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }
  src.connect(filter).connect(amp).connect(c.destination);
  src.start(t);
}

/** soft "poof" (crumble) or a little rising chime (rebuild) */
export function capySound(kind: 'poof' | 'chime'): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  if (kind === 'poof') {
    const len = 0.6;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = c.createBufferSource(), hp = c.createBiquadFilter(), amp = c.createGain();
    src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 2500; amp.gain.value = 0.1; // quiet
    src.connect(hp).connect(amp).connect(c.destination);
    src.start(t);
  } else {
    [660, 880, 1320].forEach((f, i) => {
      const osc = c.createOscillator(), amp = c.createGain(), at = t + i * 0.09;
      osc.type = 'triangle'; osc.frequency.value = f;
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(0.08, at + 0.01); // quiet
      amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      osc.connect(amp).connect(c.destination);
      osc.start(at); osc.stop(at + 0.3);
    });
  }
}

export function birdSound(kind: 'chirp' | 'flap'): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  if (kind === 'chirp') {
    // two quick rising "tweet"s
    for (const start of [0, 0.13]) {
      const osc = c.createOscillator(), amp = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2300, t + start);
      osc.frequency.exponentialRampToValueAtTime(3800, t + start + 0.08);
      amp.gain.setValueAtTime(0.0001, t + start);
      amp.gain.exponentialRampToValueAtTime(0.3, t + start + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.09);
      osc.connect(amp).connect(c.destination);
      osc.start(t + start); osc.stop(t + start + 0.1);
    }
  } else {
    // one soft wing flap: a tiny burst of low-passed noise
    const len = 0.07;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource(), lp = c.createBiquadFilter(), amp = c.createGain();
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 900; amp.gain.value = 0.25;
    src.connect(lp).connect(amp).connect(c.destination);
    src.start(t);
  }
}
