# animals/

The game UI's six easter-egg creatures. Each is an imperative factory —
`createX(options) → XHandle` — mounted once by `GameApp.tsx` in a single
effect and disposed on unmount. React owns the elements; the factories may
temporarily re-parent them (usually to `<body>`, so they can run/roll/fly past
their box) and put them back in `dispose()`.

## Shared helpers

| File | What it owns |
|---|---|
| `motion.ts` | `arcFrames()` (the whale's 24-step parabola), `hopFrames()`, `whaleAt()`, and the easing/duration literals every module used to repeat. Pure — no DOM. |
| `lifecycle.ts` | `createLifecycle()` — the per-factory AbortController (listener `signal`), IntersectionObserver registration, the `disposed` flag, WAAPI cancellation and the re-parent step. `dispose()` runs observer disconnects → abort → animation cancels → registered cleanups **in registration order**. |

A factory reads top-to-bottom as: create the lifecycle → register what it
created (`cancelOnDispose`, `onDispose`, `restore`) → wire events → return.
`dispose()` is one line.

## API + triggers

Audio (`audio.ts`) is shared: every factory calls the same tiny WebAudio
synth; no sound files.

| Module | Factory | Trigger (what the user does) | What happens |
|---|---|---|---|
| `duck.ts` | `createDuck` | click the duck (`#duckBtn`) ×10 | hop per click (grows, quack pitch rises); 10th click: rolls off screen, moves to its other home (Map ↔ Guide), rolls in when that spot is on screen |
| `whale.ts` | `createWhale` | click the VS badge (split view) ×5 | parabola jump between the maps with splash; 5th: launches off the top, falls onto its Guide perch; after that, clicks on the perch = splash + hop |
| `cat.ts` | `createCat` | Merge toggle (1-in-10) | peeks up from a map's bottom edge ~2s; ignored → stands on the A vs B box; click it → runs off, runs in to its Guide slot |
| `capybara.ts` | `createCapybara` | Next/Prev (1-in-10) | rises out of the map box; click → crumbles into pixel dust; rebuilds itself on the Guide slot; there, clicks crumble + rebuild in place |
| `bird.ts` | `createBird` | Random (1-in-10) | flies in a bezier arc to the route box, flapping; click it → flies off to the Guide slot |
| `bread.ts` | `createBread` | 5 theme changes, then the bread button | full-screen GET BREAD (CSS animation); first one sends a small bread to its Guide perch |

`BREAD_UNLOCK_SWITCHES` (5) and the `unlock()` call are wired in `GameApp.tsx`,
which counts theme changes made from the game's theme menu.

## Changing an animation

Behaviour here is gated by the stage-E parity harness
(`.claude/stage-e/capture2.js`, gitignored): it patches
`Element.prototype.animate`, drives every trigger in a fixed sequence (with
`Math.random` seeded), and hashes each `{target, keyframes, options}`. Run it
before and after any change — the hash lists must match.
