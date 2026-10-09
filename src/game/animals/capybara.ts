/**
 * CAPYBARA (just for fun) — ported from origin/ui-game script.js 1832-1999;
 * capySound 1864-1887 lives in ./audio.
 *
 * Each Next / Previous press has a 1-in-10 chance to make the capybara rise
 * out of the top edge of the map box. Click it: it crumbles into pixel dust
 * that drifts away, then (once its Guide slot is on screen) the dust swirls
 * in and rebuilds it there. On the Guide card each click crumbles and
 * rebuilds it in place. The dust is the sprite's own 48x48 pixels, drawn on
 * a full-screen canvas.
 *
 * Elements come in via props (React owns them). The dust canvases are
 * body-appended; they are tracked and removed in dispose().
 */
import { capySound } from './audio';

export interface CapybaraOptions {
  /** #capy */
  capyEl: HTMLElement;
  /** the <img> inside #capy (the pixel source for the dust) */
  capyImg: HTMLImageElement;
  /** .map-panel — comfyCapy's React-owned parent */
  mapPanelEl: HTMLElement;
  /** #capyPerch */
  perchCapy: HTMLElement;
}

export interface CapybaraHandle {
  /** The Next/Prev gate (script.js 1955-1957). */
  trigger(): void;
  /** Rise out of the map box (script.js 1945-1954). */
  spawn(): void;
  dispose(): void;
}

const CAPY_CHANCE = 0.1; // 1839

export function createCapybara({ capyEl, capyImg, mapPanelEl, perchCapy }: CapybaraOptions): CapybaraHandle {
  type CapyState = 'none' | 'map' | 'busy' | 'toGuide' | 'guide';
  let capyState: CapyState = 'none'; // 1842 'none' | 'map' | 'busy' | 'toGuide' | 'guide'
  let disposed = false;
  let rebuildTimer: number | null = null;

  // live .capy-dust canvases (the rAF loop removes each one; dispose removes the rest)
  const dustCanvases = new Set<HTMLCanvasElement>();

  const ac = new AbortController();
  const { signal } = ac;

  // the sprite's opaque pixels: [{ x, y, color }] in sprite pixels (0..47)
  // (original: new URL('./assets/capy.png', import.meta.url) — same sprite as the prop)
  const capyPixels: { x: number; y: number; color: string }[] = (() => {
    const img = new Image();
    img.src = capyImg.src;
    const list: { x: number; y: number; color: string }[] = [];
    img.decode().then(() => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      if (!g) return;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] > 20) list.push({ x, y, color: `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3] / 255})` });
      }
    }).catch(() => {});
    return list;
  })();

  // Run the dust on a temporary full-screen canvas.
  //  'crumble': from the sprite at `rect`, pixels peel off left to right and drift up-right, fading
  //  'rebuild': the same played backwards: dust swirls in and settles into the sprite at `rect`
  //  mirrored: build the sprite flipped left-right (the Guide capy faces the centre)
  function capyDust(rect: DOMRect, mode: 'crumble' | 'rebuild', mirrored = false): Promise<void> {
    return new Promise<void>(resolve => {
      if (!capyPixels.length) { resolve(); return; } // sprite data not ready: skip the effect
      const canvas = document.createElement('canvas');
      canvas.className = 'capy-dust';
      const dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      // the on-screen size must be set explicitly: a canvas doesn't stretch to inset:0,
      // so without this it shows at width*dpr CSS px and the dust looks enlarged
      canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
      document.body.appendChild(canvas);
      dustCanvases.add(canvas);
      const g = canvas.getContext('2d');
      if (!g) { canvas.remove(); dustCanvases.delete(canvas); resolve(); return; }
      g.scale(dpr, dpr);
      const px = rect.width / 48; // screen px per sprite px
      const parts = capyPixels.map(p => {
        const sx = mirrored ? 47 - p.x : p.x;
        const home = { x: rect.left + sx * px, y: rect.top + p.y * px };
        const angle = -Math.PI / 4 + (Math.random() - 0.5) * 1.6; // mostly up-right
        const dist = 60 + Math.random() * 140;
        return {
          color: p.color, home,
          away: { x: home.x + Math.cos(angle) * dist, y: home.y + Math.sin(angle) * dist - 30 },
          delay: (sx / 48) * 0.45 + Math.random() * 0.1, // left-to-right sweep
          spin: (Math.random() - 0.5) * 6,
        };
      });
      const DURATION = 1300;
      const t0 = performance.now();
      function frame(now: number): void {
        if (disposed) { canvas.remove(); dustCanvases.delete(canvas); return; } // never resolves; the caller's .then stops running
        const T = (now - t0) / DURATION;
        g.clearRect(0, 0, innerWidth, innerHeight);
        for (const q of parts) {
          // each pixel's own progress 0..1 after its delay
          let k = Math.min(1, Math.max(0, (T - q.delay) / (1 - 0.55)));
          if (mode === 'rebuild') k = 1 - k; // backwards: dust -> sprite
          const e = k * k * (3 - 2 * k);    // smoothstep
          // swirl: curve sideways a little on the way
          const x = q.home.x + (q.away.x - q.home.x) * e + Math.sin(e * Math.PI) * q.spin * 6;
          const y = q.home.y + (q.away.y - q.home.y) * e;
          g.globalAlpha = 1 - e;
          g.fillStyle = q.color;
          const size = px * (1 - e * 0.5);
          g.fillRect(x, y, size + 0.25, size + 0.25); // tiny overlap: no hairline gaps between pixels
        }
        if (T < 1) requestAnimationFrame(frame);
        else { canvas.remove(); dustCanvases.delete(canvas); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  // Rise out of the map box's top edge (the clip hides the part still "underground")
  function spawn(): void {
    capyState = 'map';
    capyEl.hidden = false;
    const H = 80, edge = 10; // the capy stands 10px down into the box's frame
    capyEl.animate([
      { transform: `translateY(${H - edge}px)`, clipPath: `inset(0 0 ${H - edge}px 0)` },
      { transform: 'translateY(-6px)', clipPath: 'inset(0 0 0 0)', offset: 0.8 },
      { transform: 'none', clipPath: 'inset(0 0 0 0)' },
    ], { duration: 700, easing: 'ease-out' });
  }

  function trigger(): void {
    if (disposed) return;
    if (capyState === 'none' && Math.random() < CAPY_CHANCE) spawn();
  }
  // (the caller wires this to both the Next and Previous buttons)

  // Map: crumble away, then wait for the Guide slot to come on screen
  capyEl.addEventListener('click', () => {
    if (disposed || capyState !== 'map') return;
    capyState = 'busy';
    const rect = (capyEl.querySelector('img') ?? capyEl).getBoundingClientRect();
    capySound('poof');
    capyEl.style.visibility = 'hidden';
    capyDust(rect, 'crumble').then(() => {
      if (disposed) return;
      capyEl.hidden = true;
      capyEl.style.visibility = '';
      capyState = 'toGuide';
      capyGuideObserver.observe(perchCapy);
    });
  }, { signal });

  const capyGuideObserver = new IntersectionObserver(entries => {
    if (capyState !== 'toGuide' || !entries.some(e => e.isIntersecting)) return;
    capyGuideObserver.disconnect();
    capyRebuild();
  }, { threshold: 0.6 }); // 1977

  // Rebuild on the Guide slot from dust
  function capyRebuild(): void {
    if (disposed) return;
    capyState = 'busy';
    perchCapy.hidden = false;
    perchCapy.style.visibility = 'hidden';
    const rect = (perchCapy.querySelector('img') ?? perchCapy).getBoundingClientRect();
    capySound('chime');
    capyDust(rect, 'rebuild', true).then(() => { // assembles facing the centre (mirrored)
      if (disposed) return;
      perchCapy.style.visibility = '';
      capyState = 'guide';
    });
  }

  // Guide: each click crumbles it and rebuilds it in the same spot
  perchCapy.addEventListener('click', () => {
    if (disposed || capyState !== 'guide') return;
    capyState = 'busy';
    const rect = (perchCapy.querySelector('img') ?? perchCapy).getBoundingClientRect();
    capySound('poof');
    perchCapy.style.visibility = 'hidden';
    capyDust(rect, 'crumble', true).then(() => {
      if (disposed) return;
      rebuildTimer = window.setTimeout(capyRebuild, 250);
    });
  }, { signal });

  function dispose(): void {
    disposed = true;
    capyGuideObserver.disconnect();
    ac.abort();
    if (rebuildTimer !== null) { clearTimeout(rebuildTimer); rebuildTimer = null; }
    capyEl.getAnimations().forEach(an => an.cancel());
    perchCapy.getAnimations().forEach(an => an.cancel());
    dustCanvases.forEach(c => c.remove());
    dustCanvases.clear();
    // back to the initial state: both hidden, no inline styles
    capyEl.hidden = true;
    perchCapy.hidden = true;
    capyEl.removeAttribute('style');
    perchCapy.removeAttribute('style');
    capyState = 'none';
    // the element never leaves its React-owned parent, but keep the invariant explicit
    mapPanelEl.appendChild(capyEl);
  }

  return { trigger, spawn, dispose };
}
