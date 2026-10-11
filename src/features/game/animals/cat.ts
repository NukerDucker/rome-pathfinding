/**
 * PEEKING CAT / STANDING CAT (just for fun) — ported from origin/ui-game
 * script.js 1508-1680; meow 1517-1540 and mrrp 1593-1608 live in ./audio.
 *
 * Each Merge toggle has a 1-in-10 chance to make the cat peek up from the
 * bottom edge of a visible map (random spot), look around ~2s and slide back
 * down. Only its head shows; the map clips the body. Ignored: it just hides.
 * Click: startled mrrp, it jumps out of the map and runs off the screen, then
 * runs in to its Guide slot (once that's on screen) and stays there. One cat:
 * once it lives on the Guide it no longer peeks on the map.
 *
 * Elements come in via props (React owns them); the factory re-parents the
 * standing cat to <body> for its run, so dispose() puts it back.
 */
import { meow, mrrp } from './audio';
import { hopFrames, EASE_HOP, EASE_SOFT, MS_HOP } from './motion';
import { createLifecycle } from './lifecycle';

export interface CatOptions {
  /** #peekCat */
  peekBtn: HTMLElement;
  /** #catStand */
  standBtn: HTMLElement;
  /** .algo-box — the standing cat's React-owned parent */
  algoBoxEl: HTMLElement;
  /** the .algo-canvas elements inside #compareWrap */
  canvases: HTMLElement[];
  /** #perchCat */
  perchCat: HTMLElement;
}

export interface CatHandle {
  /** The Merge-toggle gate (script.js 1560-1563). */
  trigger(): void;
  /** One peek (script.js 1542-1558). */
  peek(): void;
  dispose(): void;
}

const CAT_CHANCE = 0.1;  // 1512
const CAT_HEAD = 32 / 48; // 1513 the head (cap + face) is the top 32 of the sprite's 48 rows

export function createCat({ peekBtn, standBtn, algoBoxEl, canvases, perchCat }: CatOptions): CatHandle {
  let catAnim: Animation | null = null;   // 1515
  let catRunning = false;                 // 1580
  let catState: 'home' | 'toGuide' | 'guide' = 'home'; // 1581 'home' (A vs B box) | 'toGuide' | 'guide'

  // the React-owned parents the factory must restore on dispose()
  const peekOwner: HTMLElement | null = peekBtn.parentElement;
  const standOwner: HTMLElement = standBtn.parentElement ?? algoBoxEl;

  const lc = createLifecycle();
  const { signal } = lc;
  lc.cancelOnDispose(peekBtn, standBtn);
  lc.onDispose(() => { peekBtn.hidden = true; standBtn.hidden = true; });
  lc.onDispose(() => { catAnim = null; catState = 'home'; catRunning = false; });
  lc.onDispose(() => { peekBtn.removeAttribute('style'); standBtn.removeAttribute('style'); });
  lc.onDispose(() => { standBtn.classList.remove('in-slot'); });
  // re-parent the stolen / <body>-lifted nodes to their React-owned parents
  lc.restore(peekBtn, peekOwner);
  lc.restore(standBtn, standOwner);

  function peek(): void {
    // a visible map: map A, or (split view) map A or B.
    // The original filtered `#compareWrap .algo-panel` by computed visibility;
    // .algo-panel-hidden is `visibility: hidden`, which inherits down, so
    // filtering the canvases themselves by their own computed visibility is the
    // same set.
    const visible = canvases.filter(c => getComputedStyle(c).visibility !== 'hidden');
    const canvas = visible[Math.floor(Math.random() * visible.length)];
    if (!canvas) return; // no visible map (the original would have thrown)
    canvas.appendChild(peekBtn);
    peekBtn.hidden = false;
    const room = canvas.clientWidth - peekBtn.offsetWidth;
    peekBtn.style.left = Math.round(room * (0.05 + Math.random() * 0.9)) + 'px';
    const hiddenY = 'translateY(100%)', peekY = `translateY(${(1 - CAT_HEAD) * 100}%)`;
    const frames: Keyframe[] = [{ transform: hiddenY }, { transform: peekY, offset: 0.15 }, { transform: peekY, offset: 0.85 }, { transform: hiddenY }];
    catAnim = peekBtn.animate(frames, { duration: 2800, easing: EASE_SOFT }); // ~0.4s up, ~2s peek, ~0.4s down
    // not clicked while peeking: it just slides back down and hides
    // (a click cancels this animation, so this only runs when it was ignored)
    catAnim.finished.then(() => {
      if (lc.disposed) return;
      peekBtn.hidden = true;
      catAnim = null;
    }).catch(() => {});
  }

  function trigger(): void {
    // one cat: no peeks while it runs off or once it lives on the Guide
    if (!catAnim && !catRunning && catState === 'home' && Math.random() < CAT_CHANCE) peek();
  }
  // (the caller wires this to the mergeChk change event)

  // keep presses on the cat from panning the map underneath
  peekBtn.addEventListener('pointerdown', e => e.stopPropagation(), { signal });
  peekBtn.addEventListener('click', () => {
    if (!catAnim || catRunning || lc.disposed || catState !== 'home') return;
    catRunning = true;
    mrrp();
    // where the cat is on screen right now (the map clips the part below its edge)
    const box = peekBtn.getBoundingClientRect();
    const mapBottom = (peekBtn.parentElement ?? peekBtn).getBoundingClientRect().bottom;
    catAnim.cancel();
    catAnim = null;
    peekBtn.hidden = true;
    // the standing cat takes over at the same spot and size, lifted onto the
    // screen (position:fixed in <body>) so it can leave the map without clipping
    document.body.appendChild(standBtn);
    standBtn.hidden = false;
    Object.assign(standBtn.style, {
      position: 'fixed', left: box.left + 'px', top: box.top + 'px', right: 'auto', bottom: 'auto',
      width: box.width + 'px', height: box.height + 'px', zIndex: '950',
    });
    liftImg(true);
    // jump up out of the map, land with its feet on the map's bottom edge,
    // then a bouncy dash off the right edge of the screen
    const landY = mapBottom - box.bottom - 4;
    const distance = window.innerWidth - box.left + 20;
    standBtn.animate(catJumpOutFrames(landY, distance), { duration: 1500, easing: 'linear', fill: 'forwards' }).finished.then(() => {
      if (lc.disposed) return;
      standBtn.getAnimations().forEach(an => an.cancel());
      standBtn.removeAttribute('style');
      liftImg(false);
      standBtn.hidden = true;
      // next stop: its slot on the Guide intro card, once that's on screen
      perchCat.appendChild(standBtn);
      standBtn.classList.add('in-slot');
      catState = 'toGuide';
      catRunning = false;
      catPerchObserver.observe(perchCat);
    }).catch(() => {});
  }, { signal });

  // ---- Running cat: after the jump out it runs in to its slot on top of the
  //      Guide intro card (once that slot is on screen), where it stays:
  //      clicks = meow + hop ----
  // Lifted into <body> the cat is outside .game-root, where game.css's
  // `.cat-stand img` sizing no longer applies (the sprite would drop to its
  // native 48px); keep the image filling the button while it runs.
  const standImg = standBtn.querySelector('img');
  function liftImg(on: boolean): void {
    if (!standImg) return;
    if (on) Object.assign(standImg.style, { width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' });
    else standImg.removeAttribute('style');
  }
  lc.onDispose(() => liftImg(false));

  // little bouncy run frames: from x offset `from` to `to` (px), optional startled hop first
  function catRunFrames(from: number, to: number, startle: boolean): Keyframe[] {
    const frames: Keyframe[] = startle
      ? [{ transform: `translate(${from}px, 0)`, offset: 0 }, { transform: `translate(${from}px, -26px)`, offset: 0.15 }, { transform: `translate(${from}px, 0)`, offset: 0.25 }]
      : [{ transform: `translate(${from}px, 0)`, offset: 0 }];
    const start = startle ? 0.25 : 0, STEPS = 8;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const hop = i % 2 && i < STEPS ? -12 : 0; // little bounces while running, lands flat
      frames.push({ transform: `translate(${from + (to - from) * t}px, ${hop}px)`, offset: start + (1 - start) * t });
    }
    return frames;
  }

  // jump up out of the map (peaking 60px above where it lands), land at y
  // offset `landY`, then the same bouncy run as catRunFrames to x offset `to`
  function catJumpOutFrames(landY: number, to: number): Keyframe[] {
    const frames: Keyframe[] = [
      { transform: 'translate(0px, 0px)', offset: 0 },
      { transform: `translate(0px, ${landY - 60}px)`, offset: 0.18 },
      { transform: `translate(0px, ${landY}px)`, offset: 0.3 },
    ];
    const start = 0.3, STEPS = 8;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const hop = i % 2 && i < STEPS ? -12 : 0;
      frames.push({ transform: `translate(${to * t}px, ${landY + hop}px)`, offset: start + (1 - start) * t });
    }
    return frames;
  }

  standBtn.addEventListener('click', () => {
    // on its Guide perch it stays: meow + hop (the jump-out run ignores clicks)
    if (catRunning || lc.disposed || catState !== 'guide') return;
    meow();
    standBtn.animate(hopFrames(16), { duration: MS_HOP, easing: EASE_HOP });
  }, { signal });

  // Run in to the Guide slot from the nearest screen edge, then stand there
  const catPerchObserver = lc.observer(entries => {
    if (catState !== 'toGuide' || !entries.some(e => e.isIntersecting)) return;
    catPerchObserver.disconnect();
    catState = 'guide';
    catRunning = true;
    standBtn.hidden = false;
    standBtn.style.visibility = 'hidden';
    const box = standBtn.getBoundingClientRect(); // its standing spot in the slot
    document.body.appendChild(standBtn);
    standBtn.classList.remove('in-slot');
    Object.assign(standBtn.style, {
      position: 'fixed', left: box.left + 'px', top: box.top + 'px', right: 'auto', bottom: 'auto',
      width: box.width + 'px', height: box.height + 'px', zIndex: '950', visibility: '',
    });
    liftImg(true);
    const fromRight = box.left + box.width / 2 > window.innerWidth / 2;
    const from = fromRight ? window.innerWidth - box.left + 20 : -(box.right + 20); // start just off that edge
    standBtn.animate(catRunFrames(from, 0, false), { duration: 1000, easing: 'linear', fill: 'forwards' }).finished.then(() => {
      if (lc.disposed) return;
      standBtn.getAnimations().forEach(an => an.cancel());
      standBtn.removeAttribute('style');
      liftImg(false);
      perchCat.appendChild(standBtn);
      standBtn.classList.add('in-slot');
      meow(); // "I live here now"
      catRunning = false;
    }).catch(() => {});
  }, { threshold: 0.6 }); // 1680

  function dispose(): void {
    lc.dispose();
  }

  return { trigger, peek, dispose };
}
