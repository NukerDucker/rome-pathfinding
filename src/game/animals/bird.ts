/**
 * BIRD (just for fun) — ported from origin/ui-game script.js 2001-2147;
 * birdSound 2029-2056 lives in ./audio.
 *
 * Each Random click has a 1-in-10 chance to make the bird fly in (flapping)
 * and perch on the route box, above the Random button. Click it: tweet, it
 * flies off, and it lands on the Guide intro card once that card is on
 * screen. There it stays: clicks just chirp + hop.
 *
 * Elements come in via props (React owns them). The factory re-parents the
 * button to <body> for its flights, so dispose() puts it back.
 */
import { birdSound } from './audio';
import { hopFrames, EASE_HOP, MS_HOP } from './motion';
import { createLifecycle } from './lifecycle';

export interface BirdOptions {
  /** #bird */
  btn: HTMLElement;
  /** btn.querySelector('img') */
  img: HTMLImageElement;
  /** .route-box — the Map perch */
  routeBoxEl: HTMLElement;
  /** #randomBtn — the Map perch's x anchor */
  randomBtnEl: HTMLElement;
  /** #perchBird — the Guide slot */
  perchBird: HTMLElement;
}

export interface BirdHandle {
  /** The Random-click gate (script.js 2135-2137). */
  trigger(): void;
  /** Fly in to 'map' or 'guide' (script.js 2090-2113). */
  flyIn(where: 'map' | 'guide'): void;
  dispose(): void;
}

const BIRD_CHANCE = 0.1; // 2006

// Two sprite sets, picked by the direction it flies (and kept when it lands)
// (bird.png / bird-fly.png face right; bird-right.png / bird-fly-right.png face left)
// (original: new URL('./assets/x.png', import.meta.url).href)
const BIRD_SPRITES = {
  left:  { stand: '/assets/bird-right.png',      // 48x48
           fly:   '/assets/bird-fly-right.png' },// 48x48
  right: { stand: '/assets/bird.png',            // 48x48
           fly:   '/assets/bird-fly.png' },      // 59x48
} as const;
for (const set of Object.values(BIRD_SPRITES)) for (const src of Object.values(set)) { new Image().src = src; } // 2015 preload

const BIRD = 64; // 2019 on-screen size (px)

export function createBird({ btn: birdBtn, img: birdImg, routeBoxEl, randomBtnEl, perchBird }: BirdOptions): BirdHandle {
  // 'none' | 'flying' | 'map' (perched on route box) | 'waitGuide' | 'guide' (perched on intro card)
  let birdState: 'none' | 'flying' | 'map' | 'waitGuide' | 'guide' = 'none'; // 2021
  let birdFacing: 'left' | 'right' = 'left'; // 2016
  let flapTimer: number | null = null;

  // the React-owned parent the button must return to on dispose()
  const owner: HTMLElement = birdBtn.parentElement ?? routeBoxEl;

  const lc = createLifecycle();
  const { signal } = lc;
  lc.cancelOnDispose(birdBtn);
  lc.onDispose(() => { if (flapTimer !== null) { clearInterval(flapTimer); flapTimer = null; } });
  lc.onDispose(() => { birdBtn.classList.remove('bird-perched', 'in-slot'); });
  // back to its initial state: hidden, standing, no inline styles
  lc.onDispose(() => { birdBtn.hidden = true; });
  lc.onDispose(() => { birdBtn.removeAttribute('style'); });
  lc.onDispose(() => { birdFacing = 'left'; birdImg.src = BIRD_SPRITES.left.stand; birdState = 'none'; });
  lc.restore(birdBtn, owner); // <body>-lifted button returns to its React-owned parent

  const BIRD_PERCHES: Record<'map' | 'guide', { box: () => HTMLElement; x: (box?: HTMLElement) => number }> = {
    map:   { box: () => routeBoxEl, x: () => { // x anchored to the dice button, not the box itself
      const r = randomBtnEl.getBoundingClientRect(); return r.left + r.width / 2; } }, // 2023-2024
    guide: { box: () => perchBird,  x: (box) => { // its slot on the Guide intro card
      const r = (box ?? perchBird).getBoundingClientRect(); return r.left + r.width / 2; } }, // 2025-2026
  };

  // Fly the bird (position:fixed) from `from` to `to` (screen points = its feet),
  // along a curve that rises above both, flapping (sprite swap + flap sound).
  function birdFly(from: { x: number; y: number }, to: { x: number; y: number }, duration: number): Promise<Animation> {
    birdBtn.classList.remove('bird-perched', 'in-slot');
    birdBtn.removeAttribute('style');
    document.body.appendChild(birdBtn);
    birdBtn.hidden = false;
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 90 };
    const frames: Keyframe[] = [];
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t; // quadratic bezier
      const x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x;
      const y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y;
      frames.push({ transform: `translate(${x - BIRD / 2}px, ${y - BIRD}px)`, offset: t });
    }
    birdFacing = to.x >= from.x ? 'right' : 'left'; // face the way it's flying
    const sprites = BIRD_SPRITES[birdFacing];
    let up = true;
    birdImg.src = sprites.fly;
    flapTimer = window.setInterval(() => {
      up = !up;
      birdImg.src = up ? sprites.fly : sprites.stand;
      if (up) birdSound('flap');
    }, 120);
    return birdBtn.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' }).finished
      .finally(() => { if (flapTimer !== null) { clearInterval(flapTimer); flapTimer = null; } birdImg.src = sprites.fly; });
  }

  // A point off the top of the screen, to the left or right of `near`
  const birdOffscreen = (near: { x: number; y: number }) =>
    ({ x: near.x + (Math.random() < 0.5 ? -1 : 1) * window.innerWidth * 0.6, y: -40 }); // 2088

  function flyIn(where: 'map' | 'guide'): void {
    birdState = 'flying';
    const perch = BIRD_PERCHES[where], box = perch.box();
    const boxRect = box.getBoundingClientRect();
    // feet on the route box's top edge, or at the bottom of its Guide slot
    const feet = { x: perch.x(box), y: where === 'guide' ? boxRect.bottom : boxRect.top + 10 };
    birdFly(birdOffscreen(feet), feet, 1400).then(() => {
      if (lc.disposed) return;
      // land: sit inside the box so it scrolls with the page
      birdBtn.getAnimations().forEach(an => an.cancel());
      birdBtn.removeAttribute('style');
      box.appendChild(birdBtn);
      if (where === 'guide') birdBtn.classList.add('in-slot'); // stands in its slot
      else {
        birdBtn.classList.add('bird-perched');
        birdBtn.style.left = (feet.x - box.getBoundingClientRect().left - BIRD / 2) + 'px';
      }
      // turn to face the centre of the screen (route box: left side -> faces right;
      // Guide slot: right side -> faces left)
      birdFacing = feet.x < window.innerWidth / 2 ? 'right' : 'left';
      birdImg.src = BIRD_SPRITES[birdFacing].stand;
      birdSound('chirp');
      birdState = where;
    }).catch(() => {}); // dispose() cancels the flight; swallow the rejection
  }

  function birdFlyAway(thenToGuide: boolean): void {
    birdState = 'flying';
    const r = birdBtn.getBoundingClientRect();
    const feet = { x: r.left + r.width / 2, y: r.bottom };
    birdFly(feet, birdOffscreen(feet), 1100).then(() => {
      if (lc.disposed) return;
      birdBtn.getAnimations().forEach(an => an.cancel());
      birdBtn.hidden = true;
      if (thenToGuide) { birdState = 'waitGuide'; birdGuideObserver.observe(perchBird); }
      else birdState = 'none';
    }).catch(() => {}); // same dispose-cancel guard
  }
  // (thenToGuide is always true in the original: a Map click always sends it to the Guide)

  // Land on the Guide intro card once it's on screen (Guide tab open + scrolled to)
  const birdGuideObserver = lc.observer(entries => {
    if (birdState === 'waitGuide' && entries.some(e => e.isIntersecting)) {
      birdGuideObserver.disconnect();
      flyIn('guide');
    }
  }, { threshold: 0.6 }); // 2133

  function trigger(): void {
    if (lc.disposed) return;
    if (birdState === 'none' && Math.random() < BIRD_CHANCE) flyIn('map');
  }
  randomBtnEl.addEventListener('click', trigger, { signal });

  birdBtn.addEventListener('click', () => {
    if (lc.disposed) return;
    if (birdState === 'guide') { // on its Guide perch it stays: chirp + little hop
      birdSound('chirp');
      birdBtn.animate(hopFrames(14), { duration: MS_HOP, easing: EASE_HOP });
      return;
    }
    if (birdState !== 'map') return;
    birdSound('chirp');
    birdFlyAway(true); // from the Map: off to the Guide
  }, { signal });

  function dispose(): void {
    lc.dispose();
  }

  return { trigger, flyIn, dispose };
}
