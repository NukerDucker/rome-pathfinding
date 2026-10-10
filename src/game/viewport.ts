/* ===================== MAP ZOOM / PAN ENGINE =====================
   Each map canvas gets its own independent viewport:
   - mouse wheel                    -> zoom toward cursor
   - trackpad two-finger scroll     -> pan
   - trackpad pinch (ctrlKey wheel) -> zoom toward cursor, finer steps
   - drag (mouse, pen, one finger)  -> pan, with a short coast on release
   - two-finger touch pinch         -> zoom + pan around the midpoint
   - RESET button                   -> tweens back to the default view
   Every animated move is driven by a cubic-bezier easing curve.

   Ported verbatim from origin/ui-game script.js (makeMapViewport); the only
   additions are types and dispose(), which undoes every listener this module
   creates so StrictMode's double mount and mode switches stay clean. */

export type View = { s: number; x: number; y: number }
export type Point = { x: number; y: number }

export type ViewportApi = {
  stage: HTMLElement
  img: HTMLImageElement
  imageToStage(ix: number, iy: number): Point | null
  clientToImage(clientX: number, clientY: number): Point | null
  viewCenterImage(): Point | null
  onLayout(fn: () => void): void
  onDraw(fn: (view: View) => void): void
  onTap(fn: (clientX: number, clientY: number, pointerType: string) => void): void
  view(): View
  canvas: HTMLElement
  stageBox(): { left: number; top: number; w: number; h: number }
  dispose(): void
}

type Metrics = {
  left: number
  top: number
  w: number
  h: number
  imgX: number
  imgY: number
  imgW: number
  imgH: number
  stageLeft: number
  stageTop: number // stage box inside the canvas
}

type Tween = { from: View; to: View; start: number; duration: number; ease: (x: number) => number }
type Pinch = { mid: Point; dist: number }

// Cubic-bezier easing, same curve model as CSS cubic-bezier(x1, y1, x2, y2).
// Solves x(t) = progress for t (Newton, then bisection fallback), returns y(t).
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x, slope = slopeX(t)
      if (Math.abs(err) < 1e-6) return sampleY(t)
      if (Math.abs(slope) < 1e-6) break
      t -= err / slope
    }
    let lo = 0, hi = 1
    t = x
    while (hi - lo > 1e-6) {
      if (sampleX(t) < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sampleY(t)
  }
}

const EASE_ZOOM = cubicBezier(0.22, 1, 0.36, 1) // quick response, soft landing
const EASE_COAST = cubicBezier(0.16, 1, 0.3, 1) // drag release glide
const EASE_RESET = cubicBezier(0.65, 0, 0.35, 1) // ease-in-out glide home
const MIN_SCALE = 1, MAX_SCALE = 8

// The usage hint is shared: moving either map fades it out on both (once)
let mapHintsHidden = false
function hideMapHints(): void {
  if (mapHintsHidden) return
  mapHintsHidden = true
  document.querySelectorAll('.map-hint').forEach((h) => h.classList.add('hidden'))
}

export function createViewport(canvas: HTMLElement): ViewportApi {
  const stage = canvas.querySelector<HTMLElement>('.map-stage')!
  const resetBtn = canvas.querySelector<HTMLElement>('.map-reset')!
  const readout = canvas.querySelector<HTMLElement>('.map-readout')!
  const img = stage.querySelector<HTMLImageElement>('.map-img')!
  let hover: Point | null = null // last cursor position over this map (client coords), null when outside
  const HOME: View = { s: 1, x: 0, y: 0 }
  let cur: View = { ...HOME } // what is currently drawn
  let target: View = { ...HOME } // where we are heading
  let tween: Tween | null = null, raf = 0
  const drawListeners: ((view: View) => void)[] = [] // run after every redraw with the current view

  // Layout metrics, cached so the per-frame path never reads layout right after
  // writing a transform (that forces a synchronous reflow every frame).
  // Refreshed on resize, page scroll and image load.
  let m!: Metrics
  function measure(): void {
    const r = canvas.getBoundingClientRect()
    // Image box inside the untransformed stage, from rects (sub-pixel exact;
    // offsetWidth/Height round, which drifts at high zoom). The old
    // img.offsetLeft - stage.offsetLeft subtracted the canvas padding twice
    // (img's offsetParent is the stage), misplacing every overlay by 10px on
    // phones. The stage transform (origin 0 0) scales both rects alike.
    const sr = stage.getBoundingClientRect(), ir = img.getBoundingClientRect()
    m = {
      left: r.left + canvas.clientLeft + stage.offsetLeft,
      top: r.top + canvas.clientTop + stage.offsetTop,
      w: stage.offsetWidth,
      h: stage.offsetHeight,
      imgX: (ir.left - sr.left) / cur.s,
      imgY: (ir.top - sr.top) / cur.s,
      imgW: ir.width / cur.s,
      imgH: ir.height / cur.s,
      stageLeft: stage.offsetLeft,
      stageTop: stage.offsetTop, // stage box inside the canvas
    }
  }

  // Keep scale in range and never let the map edge pull inside its frame
  function clamp(v: View): View {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s))
    return {
      s,
      x: Math.min(0, Math.max(m.w * (1 - s), v.x)),
      y: Math.min(0, Math.max(m.h * (1 - s), v.y)),
    }
  }

  function isHome(): boolean {
    return Math.abs(cur.s - 1) < 1e-3 && Math.abs(cur.x) < 0.5 && Math.abs(cur.y) < 0.5
  }

  function draw(): void {
    stage.style.transform = `translate(${cur.x}px, ${cur.y}px) scale(${cur.s})`
    const home = isHome()
    resetBtn.classList.toggle('at-home', home)
    readout.classList.toggle('hidden', home) // readout only shows once the view has moved
    if (!home) updateReadout()
    drawListeners.forEach((fn) => fn(cur))
  }

  // "X: xxx, Y: yyy, Scale: 1.0x" -- X/Y in the map image's own pixel grid
  // (e.g. 0..1198 x 0..941 for the 1199x942 map). Tracks the pixel under the cursor
  // while hovering, otherwise the pixel at the centre of the view.
  let readoutText = ''
  function updateReadout(): void {
    const p = hover ? localPoint(hover.x, hover.y) : { x: m.w / 2, y: m.h / 2 }
    // undo the pan/zoom transform -> untransformed stage coords
    const sx = (p.x - cur.x) / cur.s, sy = (p.y - cur.y) / cur.s
    // stage coords -> image pixel coords (image is centred inside the stage)
    let xy = '-, Y: -'
    const ip = stageToImage(sx, sy)
    if (ip) {
      const ix = Math.floor(ip.x), iy = Math.floor(ip.y)
      if (ix >= 0 && iy >= 0 && ix < img.naturalWidth && iy < img.naturalHeight) xy = ix + ', Y: ' + iy
    }
    const text = 'X: ' + xy + ', Scale: ' + cur.s.toFixed(1) + 'x'
    if (text !== readoutText) {
      readoutText = text
      readout.textContent = text
    }
  }

  // Untransformed stage coords <-> map image pixel coords (null until the image loads)
  function stageToImage(sx: number, sy: number): Point | null {
    if (!m.imgW || !m.imgH || !img.naturalWidth) return null
    return { x: (sx - m.imgX) * img.naturalWidth / m.imgW, y: (sy - m.imgY) * img.naturalHeight / m.imgH }
  }
  function imageToStage(ix: number, iy: number): Point | null {
    if (!m.imgW || !m.imgH || !img.naturalWidth) return null
    return { x: m.imgX + ix * m.imgW / img.naturalWidth, y: m.imgY + iy * m.imgH / img.naturalHeight }
  }

  // One rAF loop does all drawing: advances a tween if one is running, and
  // batches direct moves (drag / trackpad pan) so many input events per
  // frame still produce a single transform write.
  function schedule(): void {
    if (!raf) raf = requestAnimationFrame(frame)
  }
  function frame(now: number): void {
    raf = 0
    if (tween) {
      const p = Math.min(1, (now - tween.start) / tween.duration)
      const e = tween.ease(p)
      const { from, to } = tween
      cur = { s: from.s + (to.s - from.s) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }
      if (p < 1) schedule()
      else tween = null
    }
    draw()
  }

  function tweenTo(next: View, duration: number, ease: (x: number) => number): void {
    target = clamp(next)
    tween = { from: { ...cur }, to: { ...target }, start: performance.now(), duration, ease }
    schedule()
  }

  // Move immediately (follows the input 1:1), drawn on the next frame
  function jumpTo(next: View): void {
    tween = null
    cur = target = clamp(next)
    schedule()
  }

  function stopTween(): void {
    tween = null
    target = { ...cur }
  }

  // Point in stage-local coordinates (the stage's untransformed layout box)
  function localPoint(clientX: number, clientY: number): Point {
    return { x: clientX - m.left, y: clientY - m.top }
  }

  // New view that scales by `factor` while keeping point (px, py) fixed on screen
  function zoomAround(base: View, px: number, py: number, factor: number): View {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, base.s * factor))
    const ratio = s / base.s
    return { s, x: px - (px - base.x) * ratio, y: py - (py - base.y) * ratio }
  }

  /* ---- wheel: mouse wheel, trackpad two-finger scroll and trackpad pinch ---- */
  // Browsers report all three as 'wheel' events, so classify each one:
  //  - ctrlKey set                     -> trackpad pinch (browsers flag it this way) -> zoom
  //  - line/page deltaMode             -> mouse wheel (Firefox)                      -> zoom
  //  - any horizontal delta            -> trackpad scroll                            -> pan
  //  - wheelDeltaY ~= -3 * deltaY      -> trackpad scroll (Chrome/Safari signature)  -> pan
  //    (approximate: deltaY is often fractional on HiDPI / zoomed pages while
  //     wheelDeltaY is an integer, so an exact compare misreads trackpads)
  //  - otherwise, pixel deltaMode with no wheelDeltaY (Firefox trackpad)             -> pan
  // A gesture keeps its first classification until events pause, so a scroll
  // that momentarily looks like a wheel tick doesn't flip into zooming.
  type WheelKind = 'pinch' | 'wheel' | 'pan'
  let wheelKind: WheelKind | null = null, lastWheelTime = 0
  function classifyWheel(e: WheelEvent): WheelKind {
    if (e.ctrlKey) return 'pinch'
    if (e.deltaMode !== 0) return 'wheel'
    if (e.deltaX !== 0) return 'pan'
    // wheelDeltaY is a non-standard (WebKit/Safari) field, so it is not in every DOM lib
    const wheelDeltaY = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY
    if (wheelDeltaY) return Math.abs(wheelDeltaY + 3 * e.deltaY) <= 3 ? 'pan' : 'wheel'
    return 'pan'
  }

  function onWheel(e: WheelEvent): void {
    if (e.target === resetBtn) return
    e.preventDefault()
    hideMapHints()

    const now = performance.now()
    const kind: WheelKind = e.ctrlKey ? 'pinch'
      : (wheelKind && wheelKind !== 'pinch' && now - lastWheelTime < 150) ? wheelKind
      : classifyWheel(e)
    wheelKind = kind
    lastWheelTime = now

    if (kind === 'pan') {
      // Trackpad scroll already arrives smooth (with native momentum), so it is
      // applied 1:1. Easing it would keep the map permanently chasing the fingers.
      jumpTo({ s: target.s, x: target.x - e.deltaX, y: target.y - e.deltaY })
      return
    }

    let dy = e.deltaY
    if (e.deltaMode === 1) dy *= 16 // lines -> px (Firefox mouse wheel)
    else if (e.deltaMode === 2) dy *= m.h // pages -> px
    dy = Math.max(-150, Math.min(150, dy))
    const k = kind === 'pinch' ? 0.01 : 0.002
    const p = localPoint(e.clientX, e.clientY)
    // build on the pending target so fast wheel ticks accumulate instead of fighting
    tweenTo(zoomAround(target, p.x, p.y, Math.exp(-dy * k)), 260, EASE_ZOOM)
  }
  canvas.addEventListener('wheel', onWheel, { passive: false })

  /* ---- pointers: drag to pan, two-finger pinch on touch screens ---- */
  const pointers = new Map<number, Point>()
  let last: Point | null = null, pinch: Pinch | null = null, vel: Point = { x: 0, y: 0 }, lastMoveTime = 0
  // tap = press + release without real movement (used for clicking castles)
  const TAP_SLOP = 5 // px of movement allowed before a press counts as a drag
  let tapStart: Point | null = null
  const tapListeners: ((clientX: number, clientY: number, pointerType: string) => void)[] = []

  function pinchState(): Pinch {
    const [a, b] = [...pointers.values()]
    const mid = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2)
    return { mid, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
  }

  function onDragStart(e: DragEvent): void {
    e.preventDefault() // belt and braces for browsers that still start an image drag
  }
  function onPointerDown(e: PointerEvent): void {
    if (e.target === resetBtn || e.button > 0) return
    e.preventDefault() // no native image drag or text selection: a press on the map always pans
    canvas.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    stopTween()
    stage.classList.add('dragging')
    vel = { x: 0, y: 0 }
    last = { x: e.clientX, y: e.clientY }
    pinch = pointers.size === 2 ? pinchState() : null
    tapStart = pointers.size === 1 ? { x: e.clientX, y: e.clientY } : null // second finger cancels a tap
  }

  function onPointerMove(e: PointerEvent): void {
    if (e.pointerType !== 'touch') {
      hover = { x: e.clientX, y: e.clientY }
      if (!pointers.size && !isHome()) updateReadout() // hover only; moves redraw below
    }
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) <= TAP_SLOP) return // still a tap
    tapStart = null
    hideMapHints()

    if (pointers.size >= 2 && pinch) {
      const now = pinchState()
      let next: View = zoomAround(target, now.mid.x, now.mid.y, now.dist / pinch.dist)
      next = { ...next, x: next.x + now.mid.x - pinch.mid.x, y: next.y + now.mid.y - pinch.mid.y }
      pinch = now
      jumpTo(next)
      return
    }

    const dx = e.clientX - last!.x, dy = e.clientY - last!.y
    const t = performance.now(), dt = Math.max(1, t - lastMoveTime)
    vel = { x: vel.x * 0.7 + (dx / dt) * 0.3, y: vel.y * 0.7 + (dy / dt) * 0.3 } // smoothed px/ms
    lastMoveTime = t
    last = { x: e.clientX, y: e.clientY }
    jumpTo({ s: target.s, x: target.x + dx, y: target.y + dy })
  }

  function endPointer(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) return
    if (pointers.size === 1) {
      // pinch -> one finger left: continue as a plain drag from that finger
      const [p] = pointers.values()
      last = { x: p.x, y: p.y }
      pinch = null
      vel = { x: 0, y: 0 }
      return
    }
    if (pointers.size > 0) return
    stage.classList.remove('dragging')
    if (tapStart && e.type === 'pointerup') {
      tapStart = null
      tapListeners.forEach((fn) => fn(e.clientX, e.clientY, e.pointerType))
      return
    }
    tapStart = null
    // coast in the drag direction, unless the pointer was held still before release
    if (performance.now() - lastMoveTime < 80 && Math.hypot(vel.x, vel.y) > 0.05) {
      const COAST_MS = 180
      tweenTo({ s: target.s, x: target.x + vel.x * COAST_MS, y: target.y + vel.y * COAST_MS }, 500, EASE_COAST)
    }
  }
  function onPointerLeave(): void {
    hover = null
    if (!isHome()) updateReadout()
  }

  canvas.addEventListener('dragstart', onDragStart)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)
  canvas.addEventListener('pointerleave', onPointerLeave)

  /* ---- reset button: bezier tween back to the default view ---- */
  function onResetClick(): void {
    tweenTo(HOME, 650, EASE_RESET)
  }
  resetBtn.addEventListener('click', onResetClick)

  // Layout changed (window resize, mobile stacking, image load, page scroll):
  // re-measure, then re-clamp so no gaps appear
  function relayout(): void {
    measure()
    cur = clamp(cur)
    target = clamp(target)
    schedule()
    layoutListeners.forEach((fn) => fn())
  }
  const ro = new ResizeObserver(relayout) // hoisted so dispose() can disconnect it
  ro.observe(canvas)
  img.addEventListener('load', relayout)
  // capture: the page scrolls on <body> (not the window), and element scroll
  // events don't bubble, so listen in the capture phase to catch it
  window.addEventListener('scroll', measure, { passive: true, capture: true })

  const layoutListeners: (() => void)[] = []

  function dispose(): void {
    cancelAnimationFrame(raf)
    raf = 0
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('dragstart', onDragStart)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', endPointer)
    canvas.removeEventListener('pointercancel', endPointer)
    canvas.removeEventListener('pointerleave', onPointerLeave)
    resetBtn.removeEventListener('click', onResetClick)
    ro.disconnect()
    img.removeEventListener('load', relayout)
    window.removeEventListener('scroll', measure, { capture: true })
  }

  // Small API for the scenery layers that place things on the map
  const api: ViewportApi = {
    stage, img,
    imageToStage,
    // client (screen) point -> map image pixel coords
    clientToImage(clientX, clientY) {
      const p = localPoint(clientX, clientY)
      return stageToImage((p.x - cur.x) / cur.s, (p.y - cur.y) / cur.s)
    },
    // map image pixel at the centre of the current view
    viewCenterImage() {
      return stageToImage((m.w / 2 - cur.x) / cur.s, (m.h / 2 - cur.y) / cur.s)
    },
    onLayout(fn) { layoutListeners.push(fn) }, // called after resize / image load
    onDraw(fn) { drawListeners.push(fn) }, // called every redraw with { s, x, y }
    onTap(fn) { tapListeners.push(fn) }, // called with (clientX, clientY, pointerType) on a click without drag
    view() { return cur }, // current { s, x, y }
    canvas,
    // stage layout box inside the canvas (for overlays that sit on top of the stage)
    stageBox() { return { left: m.stageLeft, top: m.stageTop, w: m.w, h: m.h } },
    dispose,
  }

  measure()
  draw()
  return api
}
