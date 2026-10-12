# Game-map zoom rendering (pixelated)

Status: **fixed** (2026-10-12) — see *Fix applied*, below. The rest of this doc keeps
the root cause and the alternatives considered.

## Symptom

In the **game UI**, zooming the map (scroll / pinch → `.map-stage`'s
`transform: translate(...) scale(s)`) blurs the island art in the **`dnd`** and
**`space`** themes. **`light`** and **`dark`** are already crisp.

## Root cause

Crispness comes from one rule:

```css
.game-root .map-img { image-rendering: pixelated; }   /* src/styles/game.css */
```

Magnification comes from the stage transform (`src/features/game/viewport.ts`,
`draw()`). `image-rendering` **does** apply when the element is scaled by an
*ancestor* transform — as long as nothing forces the image to be rasterised first.

`dnd` and `space` add a tint filter to the image:

```css
.game-root[data-theme="space"] .map-img { filter: sepia(.6) hue-rotate(175deg) saturate(.65) brightness(.72); }
.game-root[data-theme="dnd"]   .map-img { filter: hue-rotate(240deg) saturate(.5) brightness(1.05); }
```

A CSS `filter` **rasterises the element into its own layer at layout size**; the
`.map-stage` transform then scales that layer with the compositor's *smooth* filter,
so `image-rendering: pixelated` is bypassed → blur. `light`/`dark` put no `filter`
on `.map-img`, so they take the crisp path.

Verified by toggling the `space` filter at ~8×: **filter off → crisp; filter on →
blurry**, everything else unchanged.

## Non-fixes (tested, no effect)

- `will-change: auto` on `.map-stage` (removing `will-change: transform`) — no change.
- `backface-visibility: hidden` / `transform: translateZ(0)` on the stage or the image
  — no change.
- `image-rendering: pixelated` on `.map-stage` / `.algo-canvas` — no effect (it is not
  an image).
- Moving the filter up to `.map-stage` or `.algo-canvas` — **still blurry** *and* it
  tints the UI overlays (buttons, node labels, castles).

## The universal fix

`filter` and "nearest-neighbour magnification via `transform: scale`" are mutually
exclusive: a filter forces the rasterise-then-scale path. So there is **no per-theme
tweak** — the fix is to stop tinting the map with a `filter` on the image. Once no
theme filters `.map-img`, the single existing `image-rendering: pixelated` rule covers
**all four themes** identically.

Options:

1. **Pre-tinted assets (recommended).** Bake the tint into `island-map-dnd.png` /
   `island-map-space.png` (generate with the browser's own `ctx.filter`, so colours
   match the CSS exactly) and pick the `src` per theme. No filter in the transform
   chain → every theme crisp, identical look. Cost: two assets + a `src` swap.
2. **Blend-mode overlay.** Leave the map unfiltered and tint it with a flat
   `mix-blend-mode` layer above it. CSS-only, but `sepia` / `hue-rotate` / `saturate` /
   `brightness` can't be reproduced exactly with blends (approximate tint).
3. **Drop the map tint** for `dnd`/`space` (a theme-design change) → instantly crisp,
   no new code.

## Files involved

- `src/styles/game.css` — the `.map-img` `image-rendering` rule and the dnd/space
  `.map-img` filter rules.
- `src/features/game/viewport.ts` — `draw()` sets the `.map-stage` transform.
- `src/features/game/GameMap.tsx` — renders `<img class="map-img">`.

## Fix applied

The tint is no longer a `filter` on `.map-img`. It is a `backdrop-filter` layer on
`.map-stage` (`::after`), plus `isolation: isolate` on the stage so it becomes the
backdrop root and only the map art is tinted (the sea bands stay untouched):

```css
.game-root[data-theme="space"] .map-stage{ isolation:isolate; }
.game-root[data-theme="space"] .map-stage::after{
  content:''; position:absolute; inset:0; pointer-events:none;
  backdrop-filter:sepia(.6) hue-rotate(175deg) saturate(.65) brightness(.72);
}
/* …same shape for dnd… */
```

`backdrop-filter` takes the same filter functions but filters the *unfiltered, crisp*
backdrop instead of rasterising the image first, so `image-rendering: pixelated` still
applies and the map stays nearest-neighbour at every zoom — for **all four themes**
(light/dark never had a filter; dnd/space now tint via the layer). Verified in the
browser at 8× for both themes: hard pixels, correct tint, sea bands unchanged.
