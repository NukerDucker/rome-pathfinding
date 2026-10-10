/* Ported verbatim from origin/ui-game script.js (MAP ENTITIES -> MERGE TOGGLE).
   Imperative leaf: createScenery() builds both map viewports and every overlay
   and returns { sync, dispose }. React owns the controls/state; sync() applies a
   snapshot of it exactly where the original read globals (recompute/render and
   the Merge/Distance toggles); dispose() undoes every listener, node and object
   URL so StrictMode remounts stay clean. */

import { CITIES, cityCode, ROMANIA, type NodeId } from '@/romania'
import type { SearchResult, Step } from '@/search'
import { createViewport, type ViewportApi } from './viewport'
import castlePositions from './data/castle_positions.json'
import pathPositions from './data/path_positions.json'

/* ===================== MAP ENTITIES =====================
   Map elements (castles, and future ones) are placed from JSON position files
   in assets/MapElements/Coordinates/, never hardcoded here. Each file is
     { "1": { "x": 210, "y": 594 }, "2": { ... }, ... }
   in map image pixels (same format the DevMode editor exports).
   Castles/flags use castle_positions.json, keyed by engine city name.
   Anchor is the exact centre of the image (0.5, 0.5): the middle of each
   sprite sits on its position.

   Position JSON is imported through Vite (still the single source: edit the
   file, the page hot-reloads — the copies under src/game/data/ are
   byte-identical to assets/MapElements/Coordinates/). Sprite paths stay as
   plain 'assets/...' strings; assetUrl() maps them to the URLs served from
   public/ so they survive `vite build`. */

const CITY_POSITIONS = castlePositions as Record<NodeId, { x: number; y: number }>
const ROAD_POSITIONS = pathPositions as Record<NodeId, { x: number; y: number }>

// Sprites live in public/assets/MapElements, so the original's plain
// 'assets/...' paths resolve to '/assets/...' at runtime.
const assetUrl = (path: string): string => (path.startsWith('/') ? path : '/' + path)

// `z` sets the layer order (higher draws on top). Below the sprites:
// z 1 = road/arc/heatmap SVG, z 2 = node-state discs; above: z 5 = city names.
type MapEntityType = {
  name: string
  positions: Record<NodeId, { x: number; y: number }>
  sprite?: string
  sprites?: string[]
  size: number
  resScale?: number
  z: number
}
const MAP_ENTITY_TYPES: MapEntityType[] = [
  {
    // Same 512x512 frame as the castle sprite, with the flag drawn at the pole
    // top, so it reuses the castle positions and size and lines up on its own.
    name: 'flag',
    positions: CITY_POSITIONS,
    sprite: 'assets/MapElements/flag_animated.gif',
    size: 60,
    z: 3, // below the castles
  },
  {
    name: 'castle',
    positions: CITY_POSITIONS,
    // `sprites` (instead of `sprite`): each item picks one at random per page
    // load; both maps share the same picks. Every castle type, all 8 frames.
    sprites: ['Castle1', 'Castle2', 'Castle1_ruins', 'Castle2_ruins'].flatMap((folder) =>
      Array.from({ length: 8 }, (_, i) =>
        `assets/MapElements/EntityAssets/${folder}/${folder.toLowerCase()}_${i + 1}.png`)),
    size: 60, // sprite width/height in map image pixels
    resScale: 0.25, // render from a downsampled copy (0.25 = 128px), nearest-neighbour (see lowResSprite)
    z: 4,
  },
]

// Sprites live in an unscaled overlay above the stage, not inside it: the stage
// is a composited layer that the browser rasterises once and then stretches
// when zooming, which made sprites look downscaled. Here each sprite gets its
// real on-screen size every frame (size * zoom), so it is drawn straight from
// the full-resolution source at whatever zoom is current.
function addMapEntityLayer(
  vp: ViewportApi,
  type: MapEntityType,
  positions: Record<NodeId, { x: number; y: number }>,
  spriteFor: Record<NodeId, string>,
): void {
  const layer = document.createElement('div')
  layer.className = 'map-entity-layer'
  layer.dataset.entity = type.name
  layer.style.zIndex = String(type.z)
  vp.stage.after(layer)

  const sprites = Object.entries(positions).map(([key, pos]) => {
    const el = document.createElement('img')
    el.src = spriteFor[key]
    el.alt = ''
    el.className = 'map-entity ' + type.name + (type.resScale !== undefined && type.resScale < 1 ? ' pixelated' : '')
    el.dataset.key = key
    el.draggable = false
    layer.appendChild(el)
    return { el, pos, sx: 0, sy: 0 }
  })
  let baseSize = 0 // sprite size in untransformed stage px

  // On layout: map image px -> untransformed stage coords (cached)
  function layout(): void {
    const box = vp.stageBox()
    layer.style.left = box.left + 'px'
    layer.style.top = box.top + 'px'
    layer.style.width = box.w + 'px'
    layer.style.height = box.h + 'px'
    const corner = vp.imageToStage(0, 0), far = vp.imageToStage(type.size, type.size)
    if (!corner || !far) { baseSize = 0; return } // map image not loaded yet; runs again on load
    baseSize = far.x - corner.x
    for (const sp of sprites) {
      const p = vp.imageToStage(sp.pos.x, sp.pos.y)!
      sp.sx = p.x
      sp.sy = p.y
    }
  }

  // Every frame: apply the current pan/zoom by hand, centre anchor (0.5, 0.5)
  function draw(view: { s: number; x: number; y: number }): void {
    if (!baseSize) return
    const size = baseSize * view.s
    for (const sp of sprites) {
      const x = view.x + sp.sx * view.s - size / 2
      const y = view.y + sp.sy * view.s - size / 2
      sp.el.style.transform = `translate(${x}px, ${y}px)`
      sp.el.style.width = sp.el.style.height = size + 'px'
    }
  }

  vp.onLayout(layout)
  vp.onDraw(draw)
  layout()
  draw(vp.view())
}

// `resScale` (optional, 0..1): downsample a sprite to resScale x its native
// resolution with nearest-neighbour sampling, then display it with
// image-rendering:pixelated so it upscales blocky too. 1 / omitted = untouched.
// Static images only: a canvas copy of an animated GIF keeps just one frame.
// Module-level (shared across mounts, like the original). The URLs are never
// revoked in the original; dispose() revokes them, so the cache is emptied
// there too (a fresh mount re-creates its entries instead of reusing revoked URLs).
const lowResCache = new Map<string, Promise<string>>() // "src|scale" -> Promise<object URL>
function lowResSprite(src: string, scale?: number): Promise<string> {
  if (!scale || scale >= 1) return Promise.resolve(src)
  const cacheKey = src + '|' + scale
  if (!lowResCache.has(cacheKey)) {
    lowResCache.set(cacheKey, new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d')!
        ctx.imageSmoothingEnabled = false // nearest-neighbour downsample
        ctx.drawImage(img, 0, 0, w, h)
        cv.toBlob((blob) => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed')))
      }
      img.onerror = () => reject(new Error('Could not load ' + src))
      img.src = src
    }))
  }
  return lowResCache.get(cacheKey)!
}

async function loadMapEntities(vps: ViewportApi[], type: MapEntityType, isDisposed: () => boolean): Promise<void> {
  const positions = type.positions
  // Resolve each item's sprite once, so both maps show identical results
  const spriteFor: Record<NodeId, string> = {}
  for (const key of Object.keys(positions)) {
    spriteFor[key] = assetUrl(type.sprites
      ? type.sprites[Math.floor(Math.random() * type.sprites.length)]
      : type.sprite!)
  }
  try {
    if (type.resScale && type.resScale < 1) {
      // swap every picked sprite for its low-res copy (each unique file processed once)
      await Promise.all(Object.keys(spriteFor).map(async (key) => {
        spriteFor[key] = await lowResSprite(spriteFor[key], type.resScale)
      }))
    }
  } catch (err) {
    console.error(`Could not prepare ${type.name} sprites`, err)
  }
  if (isDisposed()) return // unmounted mid-load: don't add layers after dispose()
  vps.forEach((vp) => addMapEntityLayer(vp, type, positions, spriteFor))
}

/* ===================== MAP OVERLAYS: SEARCH STATE =====================
   Per lane (map A = viewport 0, map B = viewport 1), all in map image pixels
   from CITY_POSITIONS, with pan/zoom applied every frame like the sprites:
   - SVG (z 1): heatmap circles, search-tree roads, path roads, straight-line arc
     (the roads themselves are painted on island-map.png; these highlight them,
     drawn between road junctions from ROAD_POSITIONS, not between castles)
   - discs (z 2): one oval per city, centred on its road junction (ROAD_POSITIONS),
     filled with the node-state colour (legend), green/red ring = start/goal,
     dashed = landmark
   - labels (z 5): city initial / name just under each node disc */
const DISC_SIZE = 44 // disc width in map image px
const DISC_Y_SCALE = 0.6 // discs are ovals: height = width * DISC_Y_SCALE
const LABEL_GAP = 4 // map image px between the bottom of the node disc and its label
// City label font grows with zoom: LABEL_FONT_MIN px at 1x -> LABEL_FONT_MAX px at MAX_SCALE
const LABEL_FONT_MIN = 15, LABEL_FONT_MAX = 28
// Labels show just the city's initial (larger, see .node-label in style.css)
// until the city is hovered (mouse within TAP_RADIUS) or tapped (touch).
const TREE_WIDTH = 5, PATH_WIDTH = 7, ARC_WIDTH = 6 // map image px
const TAP_RADIUS = 36 // map image px: how close a click must be to a node (road junction) to pick it
const SVG_NS = 'http://www.w3.org/2000/svg'
const MIN_SCALE = 1, MAX_SCALE = 8

const edgeKey = (a: NodeId, b: NodeId): string => a < b ? `${a}|${b}` : `${b}|${a}`

// All 23 roads once each (they are also painted on the island map)
const BASE_EDGES: { a: NodeId; b: NodeId; km: number; key: string }[] = []
{
  const seen = new Set<string>()
  for (const id of CITIES) {
    for (const edge of ROMANIA[id].edges) {
      const key = edgeKey(id, edge.to)
      if (seen.has(key)) continue
      seen.add(key)
      BASE_EDGES.push({ a: id, b: edge.to, km: edge.km, key })
    }
  }
}

function treeEdgeKeys(step: Step, parent: Record<NodeId, NodeId | null>, start: NodeId): Set<string> {
  const nodes = new Set<NodeId>([...step.visited, ...step.frontier, step.current])
  const keys = new Set<string>()
  for (const n of nodes) {
    if (n === start) continue
    const p = parent[n]
    if (p === undefined || p === null) continue
    keys.add(edgeKey(p, n))
  }
  return keys
}

function pathEdgeKeys(path: NodeId[]): Set<string> {
  const keys = new Set<string>()
  for (let i = 0; i < path.length - 1; i++) keys.add(edgeKey(path[i], path[i + 1]))
  return keys
}

function nodeState(node: NodeId, step: Step, isFinalFrame: boolean, found: boolean, path: NodeId[]): string {
  if (isFinalFrame && found && path.includes(node)) return 'path'
  if (node === step.current) return 'current'
  if (step.frontier.includes(node)) return 'frontier'
  if (step.visited.includes(node)) return 'visited'
  return 'unvisited'
}

// Straight Line overlay: chord + gentle elliptical arc between start and goal,
// bulging toward Bucharest (same illustrative geometry as the original UI).
// Uses display positions only; it is a visual aid, not part of any heuristic.
function arcPoints(start: NodeId, goal: NodeId): { ca: { x: number; y: number }; cb: { x: number; y: number }; pts: string } | null {
  const ca = ROAD_POSITIONS[start], cb = ROAD_POSITIONS[goal], buc = ROAD_POSITIONS.Bucharest
  const dx = cb.x - ca.x, dy = cb.y - ca.y, chord = Math.hypot(dx, dy)
  if (chord === 0) return null
  const a = chord / 2, mx = ca.x + dx / 2, my = ca.y + dy / 2, ux = dx / chord, uy = dy / chord
  const vx = buc.x - mx, vy = buc.y - my, dbuc = Math.hypot(vx, vy)
  const b = chord * Math.min(0.02 + 0.07 * dbuc / chord, 0.08), wLen = dbuc || 1
  const pts: string[] = []
  for (let i = 0; i <= 50; i++) {
    const t = Math.PI * i / 50, ct = Math.cos(t), st = Math.sin(t)
    pts.push((mx + a * ct * ux + b * st * vx / wLen).toFixed(1) + ',' + (my + a * ct * uy + b * st * vy / wLen).toFixed(1))
  }
  return { ca, cb, pts: pts.join(' ') }
}

// The lane-B canvas stays measured at all times (the split panel is hidden with
// visibility, never display), so both viewports are always live.
export type LaneKey = 'A' | 'B'

export type SceneryLaneSnapshot = {
  last: number
  result: SearchResult
  heat: Record<NodeId, number> | null
  // Resolved landmark cities for this lane (landmarkCitiesFor(meta, laneState)).
  // The original read the {count, custom, overlay} controls + algo meta directly
  // here; a resolved list is what update() actually needs (presets are not
  // prefix-nested and custom picks are arbitrary, so a number cannot rebuild it).
  landmarks: NodeId[]
}

export type ScenerySnapshot = {
  stepIdx: number
  start: NodeId
  goal: NodeId
  showLine: boolean
  pickLandmarks: boolean
  merged: boolean
  showDistances: boolean
  lane: Record<LaneKey, SceneryLaneSnapshot>
}

export type CreateSceneryOpts = {
  canvases: [HTMLElement, HTMLElement]
  getState: () => ScenerySnapshot
  onPickLandmark: (lane: LaneKey, city: NodeId) => void
}

export type SceneryHandle = {
  sync(snapshot: ScenerySnapshot): void
  dispose(): void
}

type LaneOverlay = {
  update(): void
  setVisible(v: boolean): void
  draw(): void
  dispose(): void
}

// `synced` is the snapshot handed to sync() (the recompute/render pass, same as
// the original's renderMaps()); `live` reads current state at event time, which
// is what the original's tap handler did against its globals.
function makeLaneOverlay(
  vp: ViewportApi,
  lane: LaneKey,
  synced: () => ScenerySnapshot,
  live: () => ScenerySnapshot,
  onPickLandmark: (lane: LaneKey, city: NodeId) => void,
): LaneOverlay {
  const svg = document.createElementNS(SVG_NS, 'svg')
  // lane-A / lane-B classes let CSS tell the lanes apart on the merged map
  // (split discs, dark-outlined dashed lane-B roads drawn over lane A's)
  svg.setAttribute('class', 'map-entity-layer map-svg-layer lane-' + lane)
  svg.style.zIndex = String(lane === 'B' ? 2 : 1)
  const world = document.createElementNS(SVG_NS, 'g') // map image px space
  svg.appendChild(world)
  const discLayer = document.createElement('div')
  discLayer.className = 'map-entity-layer lane-' + lane
  discLayer.style.zIndex = String(2)
  const labelLayer = document.createElement('div')
  labelLayer.className = 'map-entity-layer'
  labelLayer.style.zIndex = String(5)
  vp.stage.after(svg, discLayer, labelLayer)

  // Hidden overlays (Merge toggle picks merged-B or split-B) ignore hover/taps
  let visible = true
  function setVisible(v: boolean): void {
    visible = v
    for (const el of [svg, discLayer, labelLayer]) el.style.display = v ? '' : 'none'
  }

  const discs: Record<NodeId, HTMLDivElement> = {}, labels: Record<NodeId, HTMLDivElement> = {}
  for (const city of CITIES) {
    discs[city] = discLayer.appendChild(document.createElement('div'))
    const label = labelLayer.appendChild(document.createElement('div'))
    label.className = 'node-label'
    label.textContent = cityCode(city)
    labels[city] = label
  }

  function layout(): void {
    const box = vp.stageBox()
    for (const el of [svg, discLayer, labelLayer]) {
      el.style.left = box.left + 'px'
      el.style.top = box.top + 'px'
      el.style.width = box.w + 'px'
      el.style.height = box.h + 'px'
    }
  }

  // Every frame: position everything for the current pan/zoom
  function draw(view: { s: number; x: number; y: number }): void {
    const o = vp.imageToStage(0, 0)
    if (!o) return // map image not loaded yet
    const k = (vp.imageToStage(1, 0)!.x - o.x) * view.s // screen px per map image px
    const ox = view.x + o.x * view.s, oy = view.y + o.y * view.s
    world.setAttribute('transform', `translate(${ox} ${oy}) scale(${k})`)
    const zoomT = (view.s - MIN_SCALE) / (MAX_SCALE - MIN_SCALE) // 0 at 1x, 1 at 8x
    labelLayer.style.setProperty('--label-font', (LABEL_FONT_MIN + (LABEL_FONT_MAX - LABEL_FONT_MIN) * zoomT) + 'px')
    const dw = DISC_SIZE * k, dh = dw * DISC_Y_SCALE
    for (const city of CITIES) {
      // disc sits on the city's road junction, label centred just under the disc
      const r = ROAD_POSITIONS[city]
      if (!r) continue
      const x = ox + r.x * k, y = oy + r.y * k
      const disc = discs[city]
      disc.style.transform = `translate(${x - dw / 2}px, ${y - dh / 2}px)`
      disc.style.width = dw + 'px'
      disc.style.height = dh + 'px'
      labels[city].style.transform = `translate(${x}px, ${y + dh / 2 + LABEL_GAP * k}px) translateX(-50%)`
    }
  }

  // Search state changed: recolour discs, rebuild highlighted roads / arc / heat
  function update(): void {
    const state = synced()
    const L = state.lane[lane]
    const step = L.result.steps[Math.min(state.stepIdx, L.last)]
    const final = state.stepIdx >= L.last
    const landmarks = L.landmarks
    for (const city of CITIES) {
      const st = step ? nodeState(city, step, final, L.result.found, L.result.path) : 'unvisited'
      let cls = 'node-disc state-' + st
      if (city === state.start) cls += ' is-start'
      if (city === state.goal) cls += ' is-goal'
      if (landmarks.includes(city)) cls += ' is-landmark'
      discs[city].className = cls
    }

    const tree = step ? treeEdgeKeys(step, L.result.parent, state.start) : new Set<string>()
    const onPath = final && L.result.found ? pathEdgeKeys(L.result.path) : new Set<string>()
    const line = (a: NodeId, b: NodeId, cls: string, w: number): string => {
      const pa = ROAD_POSITIONS[a], pb = ROAD_POSITIONS[b]
      if (!pa || !pb) return ''
      const xy = `x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"`
      // Lane B: a dark dashed copy underneath outlines each dash (shown on the merged map only)
      const casing = lane === 'B' ? `<line class="road-casing" ${xy}/>` : ''
      return casing + `<line class="${cls}" ${xy} stroke-width="${w}"/>`
    }
    let html = ''
    if (L.heat) {
      for (const city of CITIES) {
        const p = ROAD_POSITIONS[city] // same spot and oval shape as the node disc, a bit larger
        const rx = DISC_SIZE * 0.75
        if (p) html += `<ellipse class="heat" cx="${p.x}" cy="${p.y}" rx="${rx}" ry="${rx * DISC_Y_SCALE}" fill="hsl(${Math.round(L.heat[city] * 240)}, 85%, 55%)"/>`
      }
    }
    for (const e of BASE_EDGES) if (tree.has(e.key) && !onPath.has(e.key)) html += line(e.a, e.b, 'road-tree', TREE_WIDTH)
    for (const e of BASE_EDGES) if (onPath.has(e.key)) html += line(e.a, e.b, 'road-path', PATH_WIDTH)
    if (state.showLine) {
      const arc = arcPoints(state.start, state.goal)
      if (arc) {
        html += `<line class="arc-chord" x1="${arc.ca.x}" y1="${arc.ca.y}" x2="${arc.cb.x}" y2="${arc.cb.y}" stroke-width="${ARC_WIDTH * 0.8}"/>`
        html += `<polyline class="arc" points="${arc.pts}" stroke-width="${ARC_WIDTH}"/>`
      }
    }
    world.innerHTML = html
  }

  // Nearest node (road junction, where the disc is drawn) to a screen point,
  // within TAP_RADIUS map px (else null)
  function cityAt(clientX: number, clientY: number): NodeId | null {
    const p = vp.clientToImage(clientX, clientY)
    if (!p) return null
    let best: NodeId | null = null, bestD = TAP_RADIUS
    for (const city of CITIES) {
      const c = ROAD_POSITIONS[city]
      const dist = c ? Math.hypot(c.x - p.x, c.y - p.y) : Infinity
      if (dist < bestD) { best = city; bestD = dist }
    }
    return best
  }

  // Full-name labels: the hovered city (mouse) and the last tapped city (touch)
  let hovered: NodeId | null = null, pinned: NodeId | null = null
  function refreshLabels(): void {
    for (const city of CITIES) {
      const full = city === hovered || city === pinned
      const label = labels[city]
      if (label.classList.contains('full') === full) continue
      label.classList.toggle('full', full)
      label.textContent = full ? city : cityCode(city)
    }
  }
  function onHoverMove(e: PointerEvent): void {
    if (!visible || e.pointerType === 'touch') return
    const city = cityAt(e.clientX, e.clientY)
    if (city !== hovered) { hovered = city; refreshLabels() }
  }
  function onHoverLeave(): void {
    if (hovered) { hovered = null; refreshLabels() }
  }
  vp.canvas.addEventListener('pointermove', onHoverMove)
  vp.canvas.addEventListener('pointerleave', onHoverLeave)

  vp.onTap((clientX, clientY, pointerType) => {
    if (!visible) return
    const city = cityAt(clientX, clientY)
    // touch/pen have no hover: a tap shows that city's name until another tap
    if (pointerType !== 'mouse') { pinned = city; refreshLabels() }
    // Tool on: clicking near a node toggles it as this lane's custom landmark
    if (live().pickLandmarks && city) onPickLandmark(lane, city)
  })

  vp.onLayout(layout)
  vp.onDraw(draw)
  layout()
  return {
    update, setVisible,
    draw: () => draw(vp.view()),
    dispose: () => {
      vp.canvas.removeEventListener('pointermove', onHoverMove)
      vp.canvas.removeEventListener('pointerleave', onHoverLeave)
      for (const el of [svg, discLayer, labelLayer]) el.remove()
    },
  }
}

/* ===================== DISTANCE BADGES =====================
   One km badge per road, at the midpoint between its two junctions, on each
   map. A badge turns "tree" (explored) or "path" (final route) when a lane
   shown on that map uses the road; on the merged map, either lane counts. */
const KM_FONT_MIN = 12, KM_FONT_MAX = 22 // badge text px at 1x .. MAX_SCALE zoom (MIN was 10 — below the legibility floor)
type DistanceLayer = { update(): void; draw(): void; dispose(): void }

function makeDistanceLayer(vp: ViewportApi, synced: () => ScenerySnapshot, lanesShown: () => LaneKey[]): DistanceLayer {
  const layer = document.createElement('div')
  layer.className = 'map-entity-layer km-layer'
  layer.style.zIndex = String(4) // above node discs (2), below city labels (5)
  vp.stage.after(layer)
  const badges = BASE_EDGES.map((e) => {
    const el = layer.appendChild(document.createElement('div'))
    el.className = 'km-badge'
    el.textContent = String(e.km)
    return el
  })

  function layout(): void {
    const box = vp.stageBox()
    layer.style.left = box.left + 'px'
    layer.style.top = box.top + 'px'
    layer.style.width = box.w + 'px'
    layer.style.height = box.h + 'px'
  }

  function draw(view: { s: number; x: number; y: number }): void {
    const o = vp.imageToStage(0, 0)
    if (!o) return // map image not loaded yet
    const k = (vp.imageToStage(1, 0)!.x - o.x) * view.s // screen px per map image px
    const ox = view.x + o.x * view.s, oy = view.y + o.y * view.s
    const zoomT = (view.s - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)
    layer.style.setProperty('--km-font', (KM_FONT_MIN + (KM_FONT_MAX - KM_FONT_MIN) * zoomT) + 'px')
    BASE_EDGES.forEach((e, i) => {
      const pa = ROAD_POSITIONS[e.a], pb = ROAD_POSITIONS[e.b]
      if (!pa || !pb) return
      const x = ox + (pa.x + pb.x) / 2 * k, y = oy + (pa.y + pb.y) / 2 * k
      badges[i].style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
    })
  }

  function update(): void {
    const state = synced()
    layer.hidden = !state.showDistances
    const tree = new Set<string>(), onPath = new Set<string>()
    for (const lane of lanesShown()) {
      const L = state.lane[lane]
      const step = L.result.steps[Math.min(state.stepIdx, L.last)]
      const final = state.stepIdx >= L.last
      if (step) for (const key of treeEdgeKeys(step, L.result.parent, state.start)) tree.add(key)
      if (final && L.result.found) for (const key of pathEdgeKeys(L.result.path)) onPath.add(key)
    }
    BASE_EDGES.forEach((e, i) => {
      badges[i].className = 'km-badge' + (onPath.has(e.key) ? ' km-path' : tree.has(e.key) ? ' km-tree' : '')
    })
  }

  vp.onLayout(layout)
  vp.onDraw(draw)
  layout()
  return { update, draw: () => draw(vp.view()), dispose: () => layer.remove() }
}

export function createScenery(opts: CreateSceneryOpts): SceneryHandle {
  // Per-instance state (the original kept module-level arrays; two mounts
  // would fight over them).
  const mapViewports = [createViewport(opts.canvases[0]), createViewport(opts.canvases[1])]
  let disposed = false
  let snapshot: ScenerySnapshot | null = null
  const synced = (): ScenerySnapshot => snapshot! // only read after the first sync()

  // Castles/flags: one shared random pick per page load, added to both maps
  MAP_ENTITY_TYPES.forEach((type) => {
    void loadMapEntities(mapViewports, type, () => disposed)
  })

  // Lane A always draws on map A. Lane B has two overlays and the Merge toggle
  // shows one of them: merged (on map A, routes overlaid on one shared map) or
  // split (on map B, shown beside map A). mapViewports[1] always exists (its
  // panel is only hidden via CSS while merged).
  const laneOverlays = {
    A: makeLaneOverlay(mapViewports[0], 'A', synced, opts.getState, opts.onPickLandmark),
    Bmerged: makeLaneOverlay(mapViewports[0], 'B', synced, opts.getState, opts.onPickLandmark),
    Bsplit: makeLaneOverlay(mapViewports[1], 'B', synced, opts.getState, opts.onPickLandmark),
  }
  const allOverlays: LaneOverlay[] = Object.values(laneOverlays)

  // Map A counts lane B's roads only while merged (replaces the original's
  // live document.getElementById('mergeChk').checked read).
  const distanceLayers = [
    makeDistanceLayer(mapViewports[0], synced, () => synced().merged ? ['A', 'B'] : ['A']),
    makeDistanceLayer(mapViewports[1], synced, () => ['B']),
  ]

  // First run: draw everything once
  allOverlays.forEach((o) => o.draw())
  distanceLayers.forEach((d) => d.draw())

  // What the original did on recompute/render + the Distance/Merge change
  // handlers (React now calls this whenever any of those controls moves):
  function sync(next: ScenerySnapshot): void {
    snapshot = next
    const merged = next.merged
    document.getElementById('compareWrap')!.classList.toggle('is-split', !merged)
    laneOverlays.Bmerged.setVisible(merged)
    laneOverlays.Bsplit.setVisible(!merged)
    // "left A / right B" and "lane B road" legend items only apply to the merged map
    for (const el of document.querySelectorAll('.legend-merged')) (el as HTMLElement).hidden = !merged
    allOverlays.forEach((o) => o.update())
    distanceLayers.forEach((d) => d.update()) // map A's distance badges count lane B only while merged
  }

  function dispose(): void {
    disposed = true
    allOverlays.forEach((o) => o.dispose())
    distanceLayers.forEach((d) => d.dispose())
    // any entity layers not owned by an overlay (async ones that landed
    // before dispose) hang off the canvas, next to the stage
    for (const vp of mapViewports) {
      vp.canvas.querySelectorAll(':scope > .map-entity-layer').forEach((el) => el.remove())
    }
    // the original leaks every object URL; revoke them (and empty the cache so
    // a remount re-creates its entries instead of reusing revoked URLs)
    for (const p of lowResCache.values()) p.then((url) => URL.revokeObjectURL(url)).catch(() => {})
    lowResCache.clear()
    mapViewports.forEach((vp) => vp.dispose())
  }

  return { sync, dispose }
}
