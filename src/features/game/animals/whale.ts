/**
 * WHALE (just for fun) — ported from origin/ui-game script.js 1682-1830;
 * whaleSound 1691-1718 lives in ./audio.
 *
 * Click the VS badge (split view): the whale leaps out of the bottom of one map
 * (random: A or B) with a splash and whoosh, flips over the badge, splashes
 * down at the bottom of the other map and dives. Positions come from the maps'
 * on-screen boxes. After 5 jumps it launches up off the screen instead of
 * landing, then falls from the sky onto its slot on the Guide intro card and
 * stays there: clicks = splash + hop. The VS badge does nothing after that.
 *
 * Elements come in via props (React owns them). Only the splash nodes are
 * body-appended — they are tracked and removed in dispose().
 */
import { whaleSound } from './audio';
import {
  arcFrames, hopFrames, whaleAt, WHALE_SIZE,
  EASE_FALL, EASE_HOP, EASE_IN,
  MS_WHALE_DIVE, MS_WHALE_DROP, MS_WHALE_HOP, MS_WHALE_JUMP,
  type Point,
} from './motion';
import { createLifecycle } from './lifecycle';

export interface WhaleOptions {
  /** #whale */
  whaleEl: HTMLElement;
  /** #vsBadge */
  vsBadge: HTMLElement;
  /** #compareWrap */
  compareWrap: HTMLElement;
  /** #perchWhale — the Guide slot (observed; the source watches the slot and
   *  reveals its inner button, which is what actually perches) */
  perchSlot: HTMLElement;
}

export interface WhaleHandle {
  /** One VS-badge click's jump (script.js 1737-1804). */
  trigger(): void;
  dispose(): void;
}

export function createWhale({ whaleEl, vsBadge, compareWrap, perchSlot }: WhaleOptions): WhaleHandle {
  const perchWhale = (perchSlot.querySelector('button') ?? perchSlot) as HTMLElement;
  const WHALE_LEAVE_AFTER = 5;              // 1733
  let whaleJumps = 0;                        // 1734
  let whaleState: 'map' | 'toGuide' | 'guide' = 'map'; // 1734 'map' | 'toGuide' | 'guide'
  let whaleJumping = false;                  // 1688

  // live .whale-splash nodes (animationend removes them; dispose removes the rest)
  const splashes = new Set<HTMLElement>();

  const lc = createLifecycle();
  const { signal } = lc;
  lc.cancelOnDispose(whaleEl, perchWhale);
  lc.onDispose(() => { splashes.forEach(s => s.remove()); splashes.clear(); });
  lc.onDispose(() => { whaleEl.hidden = true; perchWhale.hidden = true; });
  lc.onDispose(() => { whaleEl.removeAttribute('style'); perchWhale.removeAttribute('style'); });
  lc.onDispose(() => { whaleJumping = false; whaleState = 'map'; });

  // splash at (x, y): in the maps' container, or on the screen (onScreen = viewport coords)
  function whaleSplash(x: number, y: number, onScreen = false): void {
    const s = document.createElement('div');
    s.className = 'whale-splash';
    s.style.left = x + 'px'; s.style.top = y + 'px';
    if (onScreen) { s.style.position = 'fixed'; s.style.zIndex = '960'; document.body.appendChild(s); }
    else compareWrap.appendChild(s);
    splashes.add(s);
    s.addEventListener('animationend', () => { splashes.delete(s); s.remove(); }, { once: true });
  }

  function trigger(): void {
    if (whaleJumping || whaleState !== 'map') return;
    const leaving = ++whaleJumps >= WHALE_LEAVE_AFTER;
    const panels = compareWrap.querySelectorAll('.algo-panel .algo-canvas');
    if (panels.length < 2) return;
    whaleJumping = true;
    const wrap = compareWrap.getBoundingClientRect();
    const a = panels[0].getBoundingClientRect(), b = panels[1].getBoundingClientRect();
    // centre points (relative to the maps' container), just inside each map's bottom edge
    const spot = (r: DOMRect) => ({ x: r.left + r.width / 2 - wrap.left, y: r.bottom - wrap.top - 34 });
    // random direction each click: map B -> map A, or map A -> map B
    const [start, end] = Math.random() < 0.5 ? [spot(b), spot(a)] : [spot(a), spot(b)];
    const goingRight = end.x > start.x;
    // the sprite faces right: mirror it when heading left, so it always faces where it's going
    const face = goingRight ? '' : ' scaleX(-1)';
    const peakY = Math.min(a.top, b.top) - wrap.top - 60; // arc ~60px above both maps' top edge
    const at = (p: Point, extra = '') => whaleAt(p, extra + face);

    whaleEl.hidden = false;
    whaleSplash(start.x, start.y + 20);
    whaleSound('whoosh');

    // parabola from start to end through peakY, rising out of the water and fading in
    // (always plays in full, even with the OS "reduce motion" setting: click-only fun)
    const arc = { start, end, peakY, goingRight, face };
    if (leaving) {
      // 5th jump: rise to the top of the arc, then keep launching up off the
      // top of the screen, still spinning
      const rise = arcFrames({ ...arc, exitY: -wrap.top - WHALE_SIZE * 1.5 });
      whaleEl.animate(rise, { duration: MS_WHALE_JUMP, easing: 'linear', fill: 'forwards' }).finished.then(() => {
        if (lc.disposed) return;
        whaleEl.getAnimations().forEach(an => an.cancel());
        whaleEl.hidden = true;
        whaleJumping = false;
        whaleState = 'toGuide';
        whaleGuideObserver.observe(perchSlot);
      }).catch(() => {});
      return;
    }
    whaleEl.animate(arcFrames(arc), { duration: MS_WHALE_JUMP, easing: 'linear', fill: 'forwards' }).finished
      .then(() => {
        if (lc.disposed) return;
        whaleSplash(end.x, end.y + 20);
        whaleSound('splash', 0.35); // Map-page landing: quieter splash
        // dive: sink a little and fade into the water
        return whaleEl.animate(
          [{ transform: at(end), opacity: 1 }, { transform: at({ x: end.x, y: end.y + 30 }), opacity: 0 }],
          { duration: MS_WHALE_DIVE, easing: EASE_IN, fill: 'forwards' }).finished;
      })
      .finally(() => {
        if (lc.disposed) return;
        whaleEl.getAnimations().forEach(an => an.cancel());
        whaleEl.hidden = true;
        whaleJumping = false;
      })
      .catch(() => {}); // dispose() cancels in-flight animations; swallow the rejection
  }
  vsBadge.addEventListener('click', trigger, { signal });

  // Falls from the sky onto its Guide slot with a flip and a splash, then stays
  const whaleGuideObserver = lc.observer(entries => {
    if (whaleState !== 'toGuide' || !entries.some(e => e.isIntersecting)) return;
    whaleGuideObserver.disconnect();
    whaleState = 'guide';
    perchWhale.hidden = false;
    perchWhale.style.visibility = 'hidden';
    const box = perchWhale.getBoundingClientRect(); // its spot in the slot
    perchWhale.style.visibility = '';
    const drop = -(box.bottom + 40); // start just above the top of the screen
    whaleSound('whoosh');
    perchWhale.animate(
      [{ transform: `translateY(${drop}px) rotate(-360deg)` }, { transform: 'translateY(0) rotate(0deg)' }],
      { duration: MS_WHALE_DROP, easing: EASE_FALL }) // speeds up as it falls
      .finished.then(() => {
        if (lc.disposed) return;
        whaleSplash(box.left + box.width / 2, box.bottom - 10, true);
        whaleSound('splash');
      }).catch(() => {});
  }, { threshold: 0.6 }); // 1824

  perchWhale.addEventListener('click', () => { // on its Guide perch: splash + hop
    if (lc.disposed) return;
    const box = perchWhale.getBoundingClientRect();
    whaleSplash(box.left + box.width / 2, box.bottom - 10, true);
    whaleSound('splash');
    perchWhale.animate(hopFrames(18), { duration: MS_WHALE_HOP, easing: EASE_HOP });
  }, { signal });

  function dispose(): void {
    lc.dispose();
  }

  return { trigger, dispose };
}
