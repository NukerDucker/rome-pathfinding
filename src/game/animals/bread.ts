/**
 * BREAD (just for fun) — ported from origin/ui-game script.js 1309-1341,
 * plus the theme-toggle unlock it hangs off (1278-1307, split out: the
 * day/night toggle itself lives with the theme code; this module owns the
 * secret and the button).
 *
 * Plays the full-screen "GET BREAD" animation once (CSS .play); clicks while
 * it's playing are ignored; it cleans up when the overlay's fade ends.
 * After the first GET BREAD, a little bread pops up in its slot on top of the
 * Guide intro card (once that slot is on screen) and stays; clicking that
 * bread plays GET BREAD again.
 *
 * The secret: 5 day/night switches in one visit reveal the bread button
 * (hidden again after refresh). The toggle's switch counter is external; it
 * calls unlock() on its 5th switch.
 *
 * Elements come in via props (React owns them).
 */

export interface BreadOptions {
  /** #breadBtn */
  btn: HTMLElement;
  /** #breadOverlay — the full-screen overlay (CSS .play drives it) */
  overlay: HTMLElement;
  /** #breadPerch — the small clickable bread */
  perchBtn: HTMLElement;
  /** #perchBread — its slot on the Guide intro card (observed) */
  perchSlot: HTMLElement;
}

export interface BreadHandle {
  /** Play the GET BREAD animation once (script.js playBread 1318-1321). */
  trigger(): void;
  /** Reveal the bread button (script.js 1297-1302, the 5th theme switch). */
  unlock(): void;
  dispose(): void;
}

/** Day/night switches in one visit that reveal the bread button (script.js 1304). */
export const BREAD_UNLOCK_SWITCHES = 5;

export function createBread({ btn, overlay, perchBtn, perchSlot }: BreadOptions): BreadHandle {
  let breadPerchPending = false; // 1317
  let disposed = false;

  const ac = new AbortController();
  const { signal } = ac;

  function playBread(): void {
    if (disposed) return;
    if (overlay.classList.contains('play')) return;
    overlay.classList.add('play');
  }

  btn.addEventListener('click', playBread, { signal });
  perchBtn.addEventListener('click', playBread, { signal });
  overlay.addEventListener('animationend', e => {
    if (e.target !== overlay) return; // ignore the bread/text animations
    overlay.classList.remove('play');
    if (perchBtn.hidden && !breadPerchPending) { // first GET BREAD: send a bread to the Guide card
      breadPerchPending = true;
      breadPerchObserver.observe(perchSlot);
    }
  }, { signal });

  const breadPerchObserver = new IntersectionObserver(entries => {
    if (!breadPerchPending || !entries.some(e => e.isIntersecting)) return;
    breadPerchPending = false;
    breadPerchObserver.disconnect();
    perchBtn.hidden = false;
    perchBtn.animate( // pops up with a bounce
      [{ transform: 'translateY(30px) scale(.4)', opacity: 0 }, { transform: 'translateY(-12px) scale(1.1)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }],
      { duration: 500, easing: 'ease-out' });
  }, { threshold: 0.6 }); // 1340

  // (script.js 1297-1302: the 5th day/night switch reveals the button)
  function unlock(): void {
    if (disposed) return;
    btn.hidden = false;
    btn.classList.add('reveal');
    btn.addEventListener('animationend', () => btn.classList.remove('reveal'), { once: true, signal });
  }

  function dispose(): void {
    disposed = true;
    breadPerchObserver.disconnect();
    ac.abort();
    overlay.getAnimations().forEach(an => an.cancel());
    perchBtn.getAnimations().forEach(an => an.cancel());
    overlay.classList.remove('play');   // mid-play: clean up, as the fade end would
    btn.classList.remove('reveal');
    // back to the initial state: the secret hidden again
    btn.hidden = true;
    perchBtn.hidden = true;
    perchBtn.removeAttribute('style');
    breadPerchPending = false;
  }

  return { trigger: playBread, unlock, dispose };
}
