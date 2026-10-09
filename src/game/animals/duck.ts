/**
 * DUCK (just for fun) — ported from origin/ui-game script.js 1372-1506.
 *
 * Each click: a synthesized quack (no sound file) and a hop. It gets more
 * annoyed as you click (higher quack, bigger hop); on the 10th click it lets
 * out a long quack, rolls off the screen and moves between its Map and Guide
 * homes (see DUCK_HOMES). The audio context is created on the first click, as
 * browsers require (see ./audio).
 *
 * Elements come in via props (React owns them); the factory still re-parents
 * the button to <body> for its rolls, so dispose() puts it back — otherwise
 * React's unmount would throw NotFoundError.
 */
import { quack } from './audio';
import { EASE_ROLL, MS_ROLL } from './motion';
import { createLifecycle } from './lifecycle';

export interface DuckOptions {
  /** #duckBtn */
  btn: HTMLElement;
  /** btn.querySelector('img') */
  img: HTMLImageElement;
  /** #duckHomeMap */
  homeMap: HTMLElement;
  /** #duckHomeGuide */
  homeGuide: HTMLElement;
  /** was new URL('./assets/duck-rolled.png', import.meta.url).href — 53x36 */
  rolledSrc: string;
  /** was new URL('./assets/duck.png', import.meta.url).href — 48x48 */
  standingSrc: string;
}

export interface DuckHandle {
  /** One click's reaction (script.js 1396-1404). */
  trigger(): void;
  /** Clicks accumulated toward DUCK_PATIENCE (script.js 1399). */
  getClickCount(): number;
  dispose(): void;
}

export function createDuck({
  btn, img, homeMap, homeGuide, rolledSrc: DUCK_ROLLED_SRC, standingSrc: DUCK_STANDING_SRC,
}: DuckOptions): DuckHandle {
  const DUCK_PATIENCE = 10;               // 1348
  new Image().src = DUCK_ROLLED_SRC;      // 1376 preload so the sprite swap is instant

  // Two homes: Map page (bottom of the comparison cards) and Guide page (perched
  // on top of the intro card, left end). 10 clicks on the Map page: it rolls off
  // the right edge and rolls in to its Guide perch once that spot is on screen.
  // There it stays: clicks just quack + hop. Back on the Map after a refresh.
  const DUCK_HOMES = {
    map:   { el: homeMap,   exit: 'right', enterFrom: 'right' },
    guide: { el: homeGuide, exit: 'left',  enterFrom: 'left'  },
  } as const;
  type DuckHome = keyof typeof DUCK_HOMES;

  let duckHome: DuckHome = 'map';
  let duckClicks = 0;
  let duckBusy = false;
  let duckPending = false;

  // the React-owned parent the button must return to on dispose()
  const owner: HTMLElement = btn.parentElement ?? homeMap;

  const lc = createLifecycle();
  const { signal } = lc;
  lc.cancelOnDispose(btn);
  lc.onDispose(() => btn.classList.remove('hop'));
  lc.onDispose(() => {
    homeMap.classList.remove('duck-home-waiting');
    homeGuide.classList.remove('duck-home-waiting');
  });
  // back to its initial state: standing, visible, in the Map home, no inline styles
  lc.onDispose(() => { btn.hidden = false; });
  lc.onDispose(() => { btn.removeAttribute('style'); });
  lc.onDispose(() => { img.src = DUCK_STANDING_SRC; });
  lc.restore(btn, owner); // <body>-lifted button returns to its React-owned parent

  // one click's reaction: the lying-down duck flashes during a hop of `hop` px
  function duckHop(hop: number): void {
    btn.style.setProperty('--hop', hop + 'px');
    img.src = DUCK_ROLLED_SRC;
    btn.classList.remove('hop');
    void btn.offsetWidth; // restart the hop animation on rapid clicks
    btn.classList.add('hop');
  }

  function trigger(): void {
    if (lc.disposed || duckBusy) return;
    if (duckHome === 'guide') { quack(); duckHop(-12); return; } // happy on its Guide perch: never leaves
    duckClicks++;
    if (duckClicks >= DUCK_PATIENCE) { duckRollAway(); return; }
    const annoyance = duckClicks / DUCK_PATIENCE;  // 0.1 .. 0.9
    quack(1 + annoyance * 0.6);                    // quack rises in pitch
    duckHop(-12 - annoyance * 28);                 // hop grows
  }
  btn.addEventListener('click', trigger, { signal });
  btn.addEventListener('animationend', () => {
    btn.classList.remove('hop');
    if (!duckBusy) img.src = DUCK_STANDING_SRC; // back to the standing duck after the hop
  }, { signal });

  // Lift the duck out of its box onto the screen as the lying-down sprite, at
  // `box` (its standing spot), so it can roll freely. The map row is a size
  // container that would trap position:fixed, so it moves to <body>.
  function duckLiftOut(box: DOMRect): { w: number; h: number } {
    const scale = box.height / 48; // same pixel scale as the standing duck
    const w = Math.round(53 * scale), h = Math.round(36 * scale);
    img.src = DUCK_ROLLED_SRC;
    document.body.appendChild(btn);
    Object.assign(btn.style, {
      position: 'fixed', margin: '0', zIndex: '900', width: w + 'px', height: h + 'px',
      left: (box.left + (box.width - w) / 2) + 'px', top: (box.bottom - h) + 'px', visibility: '',
    });
    return { w, h };
  }

  // Put the duck back in a home as the standing sprite, with its normal styles
  function duckSettle(home: DuckHome): void {
    btn.getAnimations().forEach(an => an.cancel());
    btn.removeAttribute('style');
    img.src = DUCK_STANDING_SRC;
    DUCK_HOMES[home].el.appendChild(btn);
  }

  // Fed up: long offended quack, roll off this page's edge while fading (~1s),
  // then wait (hidden) in the other home for it to come on screen.
  // Fun animations always play in full (even with the OS "reduce motion"
  // setting): they only run when you click, never on their own.
  function duckRollAway(): void {
    duckBusy = true;
    quack(1.6, 1.2); // lasts through the exit
    btn.classList.remove('hop');
    const box = btn.getBoundingClientRect();
    const { w } = duckLiftOut(box);
    const right = DUCK_HOMES[duckHome].exit === 'right';
    const distance = right ? window.innerWidth - box.left + w : -(box.left + w); // fully off that edge
    const spin = Math.round(distance / w) * 90; // rolls the way it moves
    const frames: Keyframe[] = [
      { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
      { transform: `translateX(${distance / 2}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translateX(${distance}px) rotate(${spin}deg)`, opacity: 0 },
    ];
    btn.animate(frames, { duration: MS_ROLL, easing: EASE_ROLL, fill: 'forwards' })
      .finished.then(() => {
        if (lc.disposed) return;
        duckHome = duckHome === 'map' ? 'guide' : 'map';
        duckSettle(duckHome);
        btn.hidden = true;
        duckClicks = 0;
        duckPending = true;
        duckBusy = false;
        duckWatchArrival();
      })
      // dispose() cancels in-flight animations; .finished then rejects — swallow it
      .catch(() => {});
  }

  // Roll in to the new home once its spot is on screen (tab open + scrolled to)
  const duckArrivalObserver = lc.observer(entries => {
    if (duckPending && entries.some(e => e.isIntersecting)) duckRollIn();
  }, { threshold: 0.5 }); // 1463-1465

  function duckWatchArrival(): void {
    duckArrivalObserver.disconnect();
    // the empty home has no size; give it the duck's footprint so it can be "seen"
    DUCK_HOMES[duckHome].el.classList.add('duck-home-waiting');
    duckArrivalObserver.observe(DUCK_HOMES[duckHome].el);
  }

  function duckRollIn(): void {
    duckPending = false;
    duckBusy = true;
    duckArrivalObserver.disconnect();
    const home = DUCK_HOMES[duckHome];
    home.el.classList.remove('duck-home-waiting');
    // measure the standing spot (invisible), then lift out and roll in to it
    btn.hidden = false;
    btn.style.visibility = 'hidden';
    const box = btn.getBoundingClientRect();
    if (box.width === 0) { // spot not measurable right now (e.g. hidden): keep waiting
      btn.hidden = true;
      btn.removeAttribute('style');
      duckPending = true;
      duckBusy = false;
      duckWatchArrival();
      return;
    }
    const { w } = duckLiftOut(box);
    const fromLeft = home.enterFrom === 'left';
    const distance = fromLeft ? -(box.left + w) : window.innerWidth - box.left + w; // start fully off that edge
    const spin = Math.round(distance / w) * 90;
    const frames: Keyframe[] = [
      { transform: `translateX(${distance}px) rotate(${spin}deg)`, opacity: 0 },
      { transform: `translateX(${distance / 2}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.5 },
      { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
    ];
    quack(1.2, 0.3); // "I'm here"
    btn.animate(frames, { duration: MS_ROLL, easing: EASE_ROLL, fill: 'forwards' })
      .finished.then(() => {
        if (lc.disposed) return;
        duckSettle(duckHome); // stand up in its new home
        btn.classList.add('hop');
        duckBusy = false;
      })
      .catch(() => {}); // same dispose-cancel guard as duckRollAway
  }

  function dispose(): void {
    lc.dispose();
  }

  return { trigger, getClickCount: () => duckClicks, dispose };
}
