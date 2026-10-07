import katex from 'katex'
import 'katex/dist/katex.min.css'
import { ALGORITHMS, pathCost } from './src/engine/search'
import { CITIES, ROMANIA, cityCode } from './src/engine/romania'
import { setALTPreset, setCustomLandmarks, saveALTState, restoreALTState, altHWith } from './src/engine/heuristic'
import { LANDMARK_PRESETS } from './src/engine/alt'
import CITY_POSITIONS from './assets/MapElements/Coordinates/castle_positions.json'
// Road junction per city (the marker painted on the map's road network). Road
// highlights run junction to junction, not castle to castle.
import ROAD_POSITIONS from './assets/MapElements/Coordinates/path_positions.json'

/* ===================== PROJECT FLAGS ===================== */
// Internal developer flag. When true, a plain dev window is added to the page
// for placing marker squares on the maps (positions exported as JSON).
// Turn off before shipping.
const DevMode = true;

/* ===================== ENGINE GLUE =====================
   The pathfinding engine lives in src/engine/ (TypeScript, copied unchanged
   from rome-pathfinding). Everything below is UI glue ported from its App.tsx.
   Display positions of cities on the island map come from
   castle_positions.json (keyed by city name). They are DISPLAY ONLY: the
   heuristic must never read them (assignment rule, see HEURISTIC_GUIDE.md). */

// Every engine city must have a castle and a road junction on the map, and vice versa
for(const [file, positions] of [['castle_positions.json', CITY_POSITIONS], ['path_positions.json', ROAD_POSITIONS]]){
  const missing = CITIES.filter(c => !(c in positions));
  const extra = Object.keys(positions).filter(c => !CITIES.includes(c));
  if(missing.length || extra.length){
    console.error(file + ' does not match the engine cities', { missing, extra });
  }
}

const BENCH_ITERS = 400;
const MAX_DELAY = 1500; // speed slider max; step delay = MAX_DELAY - slider value

// Options sorted alphabetically by label, like the original UI
const ALGO_OPTIONS = Object.entries(ALGORITHMS).sort(([, a], [, b]) => a.label.localeCompare(b.label));
const LM_SHORT = { lm2: '2', lm4: '4', lm8: '8' };

const state = {
  start: 'Arad',
  goal: 'Bucharest',
  algo: { A: 'ucs', B: 'astaralt' },
  // per lane: preset count, click-picked custom landmarks (override the preset
  // when non-empty), and the visual-only overlay for non-landmark algorithms
  lanes: {
    A: { count: 'lm8', custom: [], overlay: false },
    B: { count: 'lm8', custom: [], overlay: false },
  },
  stepIdx: 0,
  playing: false,
  showLine: false,
  showHeat: false,
  pickLandmarks: false,
};
let derived = null; // search results + benchmarks, recomputed when inputs change

const laneCfg = lane => state.lanes[lane].custom.length > 0 ? 'custom' : state.lanes[lane].count;

// Point the module-level ALT heuristic at a lane's preset/custom set, run fn,
// then restore whatever ALT state was active before (keeps lanes independent).
function withAltConfig(preset, custom, fn){
  const saved = saveALTState();
  if(preset === 'custom'){
    if(custom.length > 0) setCustomLandmarks(custom);
    else setALTPreset('lm8');
  } else {
    setALTPreset(preset);
  }
  try { return fn(); }
  finally { restoreALTState(saved); }
}

// Mean wall time over BENCH_ITERS runs, plus peak frontier as a space proxy
function benchmarkOne(meta, start, goal, cfg, custom){
  return withAltConfig(cfg, custom, () => {
    const res = meta.run(start, goal);
    const t0 = performance.now();
    for(let i = 0; i < BENCH_ITERS; i++) meta.run(start, goal);
    const ms = (performance.now() - t0) / BENCH_ITERS;
    const peakFrontier = res.steps.reduce((max, s) => Math.max(max, s.frontier.length), 0);
    return {
      ms, peakFrontier,
      generated: res.generated,
      cost: res.found ? pathCost(res.path) : NaN,
      hops: res.found ? res.path.length - 1 : 0,
      found: res.found,
    };
  });
}

// Nodes generated under each landmark preset; null for non-landmark algorithms
function landmarkEffect(meta, start, goal){
  if(!meta.usesLandmarks) return null;
  const saved = saveALTState();
  try {
    const out = {};
    for(const preset of ['lm2', 'lm4', 'lm8']){
      setALTPreset(preset);
      out[preset] = meta.run(start, goal).generated;
    }
    return out;
  } finally {
    restoreALTState(saved);
  }
}

// Normalised ALT h-values toward the goal (0 = near, 1 = far)
function heatmapFor(goal, preset, custom){
  const vals = {};
  let max = 0;
  for(const city of CITIES){
    vals[city] = altHWith(city, goal, preset, custom);
    if(vals[city] > max) max = vals[city];
  }
  if(max === 0) return null;
  for(const city of CITIES) vals[city] /= max;
  return vals;
}

function randomPair(){
  const start = CITIES[Math.floor(Math.random() * CITIES.length)];
  const rest = CITIES.filter(city => city !== start);
  return { start, goal: rest[Math.floor(Math.random() * rest.length)] };
}

const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;

// All 23 roads once each (they are also painted on the island map)
const BASE_EDGES = [];
{
  const seen = new Set();
  for(const id of CITIES){
    for(const edge of ROMANIA[id].edges){
      const key = edgeKey(id, edge.to);
      if(seen.has(key)) continue;
      seen.add(key);
      BASE_EDGES.push({ a: id, b: edge.to, km: edge.km, key });
    }
  }
}

function treeEdgeKeys(step, parent, start){
  const nodes = new Set([...step.visited, ...step.frontier, step.current]);
  const keys = new Set();
  for(const n of nodes){
    if(n === start) continue;
    const p = parent[n];
    if(p === undefined || p === null) continue;
    keys.add(edgeKey(p, n));
  }
  return keys;
}

function pathEdgeKeys(path){
  const keys = new Set();
  for(let i = 0; i < path.length - 1; i++) keys.add(edgeKey(path[i], path[i + 1]));
  return keys;
}

function nodeState(node, step, isFinalFrame, found, path){
  if(isFinalFrame && found && path.includes(node)) return 'path';
  if(node === step.current) return 'current';
  if(step.frontier.includes(node)) return 'frontier';
  if(step.visited.includes(node)) return 'visited';
  return 'unvisited';
}

// Landmark cities a lane draws: active for landmark algorithms, or when the
// user opted into the overlay. Custom picks win over the preset.
function laneLandmarkCities(lane){
  const meta = ALGORITHMS[state.algo[lane]];
  const l = state.lanes[lane];
  if(!meta.usesLandmarks && !l.overlay) return [];
  return l.custom.length > 0 ? l.custom : LANDMARK_PRESETS[l.count];
}

function laneLmSuffix(lane){
  const meta = ALGORITHMS[state.algo[lane]];
  const l = state.lanes[lane];
  if(!meta.usesLandmarks) return '';
  return l.custom.length > 0 ? ` · Custom (${l.custom.length})` : ` · ${LM_SHORT[l.count]} Landmark`;
}

function recompute(){
  const d = {};
  for(const lane of ['A', 'B']){
    const meta = ALGORITHMS[state.algo[lane]];
    const cfg = laneCfg(lane), custom = state.lanes[lane].custom;
    d[lane] = {
      meta,
      result: withAltConfig(cfg, custom, () => meta.run(state.start, state.goal)),
      bench: benchmarkOne(meta, state.start, state.goal, cfg, custom),
      lmEffect: landmarkEffect(meta, state.start, state.goal),
    };
    d[lane].last = d[lane].result.steps.length - 1;
  }
  d.largestLast = Math.max(d.A.last, d.B.last);
  derived = d;
  recomputeHeat();
}

function recomputeHeat(){
  for(const lane of ['A', 'B']){
    derived[lane].heat = state.showHeat ? heatmapFor(state.goal, laneCfg(lane), state.lanes[lane].custom) : null;
  }
}

// Any input change: recompute, rewind playback, redraw everything
function inputsChanged(){
  stopPlaying();
  state.stepIdx = 0;
  recompute();
  render();
}

/* ===================== CONTROL ROW ===================== */
const fromSelect = document.getElementById('fromSelect');
const toSelect = document.getElementById('toSelect');
const algoSelect = { A: document.getElementById('algoASelect'), B: document.getElementById('algoBSelect') };

for(const sel of [fromSelect, toSelect]){
  for(const city of CITIES) sel.add(new Option(city, city));
}
for(const lane of ['A', 'B']){
  for(const [key, meta] of ALGO_OPTIONS) algoSelect[lane].add(new Option(meta.label, key));
}

fromSelect.addEventListener('change', () => { state.start = fromSelect.value; inputsChanged(); });
toSelect.addEventListener('change', () => { state.goal = toSelect.value; inputsChanged(); });
for(const lane of ['A', 'B']){
  algoSelect[lane].addEventListener('change', () => {
    state.algo[lane] = algoSelect[lane].value;
    landmarkControls[lane].collapse();
    inputsChanged();
  });
}

document.getElementById('randomBtn').addEventListener('click', () => {
  const next = randomPair();
  state.start = next.start;
  state.goal = next.goal;
  inputsChanged();
});

/* ===================== LANDMARK CONTROLS =====================
   Landmark algorithms (Greedy, A* LP+ALT, A* ALT only, Bidir. A*): always on,
   locked; the button expands into a 2/4/8 count dropdown.
   Other algorithms: off by default; turning it on shows the landmark overlay
   on the map only (visual, the algorithm is unchanged); X turns it off.
   Custom picks (Tool) override the preset; clicking "Custom (n)" clears them. */
function makeLandmarkControl(lane){
  const btn = document.getElementById('landmarkBtn' + lane);
  const dropdown = document.getElementById('landmarkDropdown' + lane);
  const closeBtn = document.getElementById('landmarkClose' + lane);
  let expanded = false;

  function render(){
    const meta = ALGORITHMS[state.algo[lane]];
    const l = state.lanes[lane];
    const active = meta.usesLandmarks || l.overlay;
    dropdown.value = l.count;
    btn.classList.remove('on', 'locked');
    if(!active){
      btn.textContent = 'Landmark';
      btn.title = 'Show landmark overlay (visual only, algorithm unchanged)';
    } else if(l.custom.length > 0){
      btn.classList.add(meta.usesLandmarks ? 'locked' : 'on');
      btn.textContent = 'Custom (' + l.custom.length + ')';
      btn.title = 'Custom landmarks active. Click to clear and return to the preset.';
    } else {
      btn.classList.add(meta.usesLandmarks ? 'locked' : 'on');
      btn.textContent = 'Landmarks: ' + LM_SHORT[l.count];
      btn.title = meta.usesLandmarks ? 'This algorithm uses landmarks; click to change the count' : 'Landmark overlay (visual only)';
    }
    btn.hidden = expanded;
    dropdown.hidden = !expanded;
    closeBtn.hidden = !expanded;
  }

  function collapse(){ expanded = false; render(); }

  btn.addEventListener('click', () => {
    const meta = ALGORITHMS[state.algo[lane]];
    const l = state.lanes[lane];
    if(l.custom.length > 0 && (meta.usesLandmarks || l.overlay)){ l.custom = []; inputsChanged(); return; }
    if(!meta.usesLandmarks) l.overlay = true;
    expanded = true;
    render();
    dropdown.focus();
    renderMaps(); // overlay may have just turned on
  });

  // X: collapse; also turns the visual overlay off for non-landmark algorithms
  closeBtn.addEventListener('click', () => {
    if(!ALGORITHMS[state.algo[lane]].usesLandmarks) state.lanes[lane].overlay = false;
    collapse();
    renderMaps();
  });

  dropdown.addEventListener('change', () => { state.lanes[lane].count = dropdown.value; inputsChanged(); });
  dropdown.addEventListener('blur', () => {
    // small delay so a click on the X button (which also steals focus) registers first
    setTimeout(collapse, 120);
  });

  return { render, collapse };
}
const landmarkControls = { A: makeLandmarkControl('A'), B: makeLandmarkControl('B') };

/* ===================== OVERLAYS + TOOL ===================== */
const straightLineChk = document.getElementById('straightLineChk');
const heatmapChk = document.getElementById('heatmapChk');
straightLineChk.addEventListener('change', () => { state.showLine = straightLineChk.checked; renderMaps(); });
heatmapChk.addEventListener('change', () => { state.showHeat = heatmapChk.checked; recomputeHeat(); renderMaps(); });

// Tool: landmark picking. While on, clicking a castle on a lane's map
// adds/removes it from that lane's custom landmarks.
const toolToggle = document.getElementById('toolToggle');
toolToggle.addEventListener('click', () => {
  state.pickLandmarks = !state.pickLandmarks;
  document.body.classList.toggle('picking-landmarks', state.pickLandmarks);
  renderControls();
});

function toggleCustomLandmark(lane, city){
  const l = state.lanes[lane];
  if(!ALGORITHMS[state.algo[lane]].usesLandmarks) l.overlay = true; // reveal what was picked
  l.custom = l.custom.includes(city) ? l.custom.filter(c => c !== city) : [...l.custom, city];
  inputsChanged();
}

/* ===================== PLAYBACK ===================== */
const playBtn = document.getElementById('playBtn');
const speedSlider = document.getElementById('speedSlider');
let playTimer = null;

const stepDelay = () => MAX_DELAY - Number(speedSlider.value);

function stopPlaying(){
  state.playing = false;
  clearTimeout(playTimer);
  playTimer = null;
}
function scheduleNextStep(){
  clearTimeout(playTimer);
  playTimer = setTimeout(() => {
    if(!state.playing) return;
    if(state.stepIdx + 1 >= derived.largestLast) state.playing = false;
    state.stepIdx = Math.min(derived.largestLast, state.stepIdx + 1);
    render();
    if(state.playing) scheduleNextStep();
  }, stepDelay());
}

playBtn.addEventListener('click', () => {
  if(state.playing){ stopPlaying(); render(); return; }
  if(state.stepIdx >= derived.largestLast) state.stepIdx = 0; // finished: replay from the start
  state.playing = true;
  render();
  scheduleNextStep();
});
document.getElementById('nextBtn').addEventListener('click', () => {
  stopPlaying(); state.stepIdx = Math.min(derived.largestLast, state.stepIdx + 1); render();
});
document.getElementById('prevBtn').addEventListener('click', () => {
  stopPlaying(); state.stepIdx = Math.max(0, state.stepIdx - 1); render();
});
document.getElementById('restartBtn').addEventListener('click', () => {
  stopPlaying(); state.stepIdx = 0; render();
});
// new speed applies from the next step
speedSlider.addEventListener('input', () => { if(state.playing) scheduleNextStep(); });

/* ===================== RENDER: CONTROLS + TABLE ===================== */
function renderControls(){
  fromSelect.value = state.start;
  toSelect.value = state.goal;
  for(const lane of ['A', 'B']){
    algoSelect[lane].value = state.algo[lane];
    document.getElementById('algo' + lane + 'Label').textContent = ALGORITHMS[state.algo[lane]].label;
    landmarkControls[lane].render();
  }
  document.getElementById('routeLabel').textContent = state.start + ' → ' + state.goal;
  playBtn.textContent = state.playing ? 'PAUSE' : 'START';
  playBtn.classList.toggle('playing', state.playing);
  toolToggle.textContent = 'Landmarks: ' + (state.pickLandmarks ? 'ON' : 'OFF');
  toolToggle.classList.toggle('active', state.pickLandmarks);
}

const texCache = new Map();
function tex(latex){
  if(!texCache.has(latex)) texCache.set(latex, katex.renderToString(latex, { throwOnError: false, displayMode: false }));
  return texCache.get(latex);
}

// Which lane wins a metric: 'A', 'B' or undefined (tie / not comparable)
const betterLower = (va, vb) =>
  Number.isNaN(va) || Number.isNaN(vb) ? undefined : va < vb ? 'A' : vb < va ? 'B' : undefined;
const betterYes = (sa, sb) => {
  const a = sa.startsWith('Yes'), b = sb.startsWith('Yes');
  return a && !b ? 'A' : b && !a ? 'B' : undefined;
};

function setCell(id, lane, content, better, html){
  const el = document.getElementById(id + lane);
  if(html) el.innerHTML = content; else el.textContent = content;
  el.classList.toggle('better', better === lane);
}

function renderTable(){
  const A = derived.A, B = derived.B, i = state.stepIdx;
  const stepOf = L => L.result.steps[Math.min(i, L.last)];
  const finalA = i >= A.last, finalB = i >= B.last, atEnd = finalA && finalB;
  const sA = stepOf(A), sB = stepOf(B);
  const fin = (L, f) => atEnd ? (L.result.steps[L.last]?.[f].length ?? 0) : NaN;
  const pathLabel = (L, final) => final && L.result.found ? L.result.path.map(cityCode).join(' → ') : '—';
  const stepText = L => L.result.steps.length === 0 ? '0 / 0' : `${Math.min(i, L.last) + 1} / ${L.result.steps.length}`;
  const cost = L => L.bench.found ? L.bench.cost : NaN;
  const hops = L => L.bench.found ? L.bench.hops : NaN;
  const lm = (L, k) => L.lmEffect ? String(L.lmEffect[k]) : '—';

  let betterPath;
  if(atEnd){
    if(A.result.found !== B.result.found) betterPath = A.result.found ? 'A' : 'B';
    else if(A.result.found) betterPath = betterLower(pathCost(A.result.path), pathCost(B.result.path));
  }

  const rows = [
    ['fullStep', stepText(A), stepText(B)],
    ['fullCur', sA?.current ?? '—', sB?.current ?? '—'],
    ['fullVis', String(sA?.visited.length ?? 0), String(sB?.visited.length ?? 0), atEnd ? betterLower(fin(A, 'visited'), fin(B, 'visited')) : undefined],
    ['fullFro', String(sA?.frontier.length ?? 0), String(sB?.frontier.length ?? 0), atEnd ? betterLower(fin(A, 'frontier'), fin(B, 'frontier')) : undefined],
    ['fullGen', String(A.result.generated), String(B.result.generated), betterLower(A.result.generated, B.result.generated)],
    ['fullPath', pathLabel(A, finalA), pathLabel(B, finalB), betterPath],
    ['fullTime', (A.bench.ms * 1000).toFixed(1), (B.bench.ms * 1000).toFixed(1), betterLower(A.bench.ms, B.bench.ms)],
    ['fullMem', String(A.bench.peakFrontier), String(B.bench.peakFrontier), betterLower(A.bench.peakFrontier, B.bench.peakFrontier)],
    ['fullCost', A.bench.found ? String(A.bench.cost) : '—', B.bench.found ? String(B.bench.cost) : '—', betterLower(cost(A), cost(B))],
    ['fullHops', A.bench.found ? String(A.bench.hops) : '—', B.bench.found ? String(B.bench.hops) : '—', betterLower(hops(A), hops(B))],
    ['fullOpt', A.meta.optimal, B.meta.optimal, betterYes(A.meta.optimal, B.meta.optimal)],
    ['fullComp', A.meta.complete, B.meta.complete, betterYes(A.meta.complete, B.meta.complete)],
  ];
  for(const k of ['lm2', 'lm4', 'lm8']){
    const both = A.lmEffect && B.lmEffect;
    rows.push(['full' + k.toUpperCase(), lm(A, k), lm(B, k), both ? betterLower(A.lmEffect[k], B.lmEffect[k]) : undefined]);
  }
  for(const [id, a, b, better] of rows){
    setCell(id, 'A', a, better);
    setCell(id, 'B', b, better);
  }
  setCell('fullTn', 'A', tex(A.meta.time), undefined, true);
  setCell('fullTn', 'B', tex(B.meta.time), undefined, true);
  setCell('fullSn', 'A', tex(A.meta.space), undefined, true);
  setCell('fullSn', 'B', tex(B.meta.space), undefined, true);
  document.getElementById('rowA').textContent = 'A · ' + A.meta.label + laneLmSuffix('A');
  document.getElementById('rowB').textContent = 'B · ' + B.meta.label + laneLmSuffix('B');
}

function render(){
  renderControls();
  renderTable();
  renderMaps();
}

/* ===================== MAP ZOOM / PAN ENGINE =====================
   Each map canvas gets its own independent viewport:
   - mouse wheel                    -> zoom toward cursor
   - trackpad two-finger scroll     -> pan
   - trackpad pinch (ctrlKey wheel) -> zoom toward cursor, finer steps
   - drag (mouse, pen, one finger)  -> pan, with a short coast on release
   - two-finger touch pinch         -> zoom + pan around the midpoint
   - RESET button                   -> tweens back to the default view
   Every animated move is driven by a cubic-bezier easing curve. */

// Cubic-bezier easing, same curve model as CSS cubic-bezier(x1, y1, x2, y2).
// Solves x(t) = progress for t (Newton, then bisection fallback), returns y(t).
function cubicBezier(x1, y1, x2, y2){
  const cx = 3*x1, bx = 3*(x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3*y1, by = 3*(y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = t => ((ax*t + bx)*t + cx)*t;
  const sampleY = t => ((ay*t + by)*t + cy)*t;
  const slopeX  = t => (3*ax*t + 2*bx)*t + cx;
  return x => {
    if(x <= 0) return 0;
    if(x >= 1) return 1;
    let t = x;
    for(let i = 0; i < 8; i++){
      const err = sampleX(t) - x, slope = slopeX(t);
      if(Math.abs(err) < 1e-6) return sampleY(t);
      if(Math.abs(slope) < 1e-6) break;
      t -= err / slope;
    }
    let lo = 0, hi = 1; t = x;
    while(hi - lo > 1e-6){
      if(sampleX(t) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

const EASE_ZOOM  = cubicBezier(0.22, 1, 0.36, 1);  // quick response, soft landing
const EASE_COAST = cubicBezier(0.16, 1, 0.3, 1);   // drag release glide
const EASE_RESET = cubicBezier(0.65, 0, 0.35, 1);  // ease-in-out glide home
const MIN_SCALE = 1, MAX_SCALE = 8;

// The usage hint is shared: moving either map fades it out on both (once)
let mapHintsHidden = false;
function hideMapHints(){
  if(mapHintsHidden) return;
  mapHintsHidden = true;
  document.querySelectorAll('.map-hint').forEach(h => h.classList.add('hidden'));
}

function makeMapViewport(canvas){
  const stage = canvas.querySelector('.map-stage');
  const resetBtn = canvas.querySelector('.map-reset');
  const readout = canvas.querySelector('.map-readout');
  const img = stage.querySelector('.map-img');
  let hover = null; // last cursor position over this map (client coords), null when outside
  const HOME = { s:1, x:0, y:0 };
  let cur = { ...HOME };     // what is currently drawn
  let target = { ...HOME };  // where we are heading
  let tween = null, raf = 0;
  const drawListeners = []; // run after every redraw with the current view

  // Layout metrics, cached so the per-frame path never reads layout right after
  // writing a transform (that forces a synchronous reflow every frame).
  // Refreshed on resize, page scroll and image load.
  let m = null;
  function measure(){
    const r = canvas.getBoundingClientRect();
    m = {
      left: r.left + canvas.clientLeft + stage.offsetLeft,
      top:  r.top  + canvas.clientTop  + stage.offsetTop,
      w: stage.offsetWidth, h: stage.offsetHeight,
      imgX: img.offsetLeft - stage.offsetLeft, imgY: img.offsetTop - stage.offsetTop,
      imgW: img.offsetWidth, imgH: img.offsetHeight,
      stageLeft: stage.offsetLeft, stageTop: stage.offsetTop, // stage box inside the canvas
    };
  }

  // Keep scale in range and never let the map edge pull inside its frame
  function clamp(v){
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s));
    return {
      s,
      x: Math.min(0, Math.max(m.w*(1 - s), v.x)),
      y: Math.min(0, Math.max(m.h*(1 - s), v.y)),
    };
  }

  function isHome(){
    return Math.abs(cur.s - 1) < 1e-3 && Math.abs(cur.x) < 0.5 && Math.abs(cur.y) < 0.5;
  }

  function draw(){
    stage.style.transform = `translate(${cur.x}px, ${cur.y}px) scale(${cur.s})`;
    const home = isHome();
    resetBtn.classList.toggle('at-home', home);
    readout.classList.toggle('hidden', home); // readout only shows once the view has moved
    if(!home) updateReadout();
    drawListeners.forEach(fn => fn(cur));
  }

  // "X: xxx, Y: yyy, Scale: 1.0x" -- X/Y in the map image's own pixel grid
  // (e.g. 0..1199 for the 1200x1200 map). Tracks the pixel under the cursor
  // while hovering, otherwise the pixel at the centre of the view.
  let readoutText = '';
  function updateReadout(){
    const p = hover ? localPoint(hover.x, hover.y) : { x: m.w/2, y: m.h/2 };
    // undo the pan/zoom transform -> untransformed stage coords
    const sx = (p.x - cur.x) / cur.s, sy = (p.y - cur.y) / cur.s;
    // stage coords -> image pixel coords (image is centred inside the stage)
    let xy = '-, Y: -';
    const ip = stageToImage(sx, sy);
    if(ip){
      const ix = Math.floor(ip.x), iy = Math.floor(ip.y);
      if(ix >= 0 && iy >= 0 && ix < img.naturalWidth && iy < img.naturalHeight) xy = ix + ', Y: ' + iy;
    }
    const text = 'X: ' + xy + ', Scale: ' + cur.s.toFixed(1) + 'x';
    if(text !== readoutText){ readoutText = text; readout.textContent = text; }
  }

  // Untransformed stage coords <-> map image pixel coords (null until the image loads)
  function stageToImage(sx, sy){
    if(!m.imgW || !m.imgH || !img.naturalWidth) return null;
    return { x: (sx - m.imgX) * img.naturalWidth / m.imgW, y: (sy - m.imgY) * img.naturalHeight / m.imgH };
  }
  function imageToStage(ix, iy){
    if(!m.imgW || !m.imgH || !img.naturalWidth) return null;
    return { x: m.imgX + ix * m.imgW / img.naturalWidth, y: m.imgY + iy * m.imgH / img.naturalHeight };
  }

  // One rAF loop does all drawing: advances a tween if one is running, and
  // batches direct moves (drag / trackpad pan) so many input events per
  // frame still produce a single transform write.
  function schedule(){ if(!raf) raf = requestAnimationFrame(frame); }
  function frame(now){
    raf = 0;
    if(tween){
      const p = Math.min(1, (now - tween.start) / tween.duration);
      const e = tween.ease(p);
      const { from, to } = tween;
      cur = { s: from.s + (to.s - from.s)*e, x: from.x + (to.x - from.x)*e, y: from.y + (to.y - from.y)*e };
      if(p < 1) schedule(); else tween = null;
    }
    draw();
  }

  function tweenTo(next, duration, ease){
    target = clamp(next);
    tween = { from:{ ...cur }, to:{ ...target }, start:performance.now(), duration, ease };
    schedule();
  }

  // Move immediately (follows the input 1:1), drawn on the next frame
  function jumpTo(next){
    tween = null;
    cur = target = clamp(next);
    schedule();
  }

  function stopTween(){
    tween = null;
    target = { ...cur };
  }

  // Point in stage-local coordinates (the stage's untransformed layout box)
  function localPoint(clientX, clientY){
    return { x: clientX - m.left, y: clientY - m.top };
  }

  // New view that scales by `factor` while keeping point (px, py) fixed on screen
  function zoomAround(base, px, py, factor){
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, base.s*factor));
    const ratio = s / base.s;
    return { s, x: px - (px - base.x)*ratio, y: py - (py - base.y)*ratio };
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
  let wheelKind = null, lastWheelTime = 0;
  function classifyWheel(e){
    if(e.ctrlKey) return 'pinch';
    if(e.deltaMode !== 0) return 'wheel';
    if(e.deltaX !== 0) return 'pan';
    if(e.wheelDeltaY) return Math.abs(e.wheelDeltaY + 3*e.deltaY) <= 3 ? 'pan' : 'wheel';
    return 'pan';
  }

  canvas.addEventListener('wheel', e => {
    if(e.target === resetBtn) return;
    e.preventDefault();
    hideMapHints();

    const now = performance.now();
    const kind = e.ctrlKey ? 'pinch'
      : (wheelKind && wheelKind !== 'pinch' && now - lastWheelTime < 150) ? wheelKind
      : classifyWheel(e);
    wheelKind = kind; lastWheelTime = now;

    if(kind === 'pan'){
      // Trackpad scroll already arrives smooth (with native momentum), so it is
      // applied 1:1. Easing it would keep the map permanently chasing the fingers.
      jumpTo({ s:target.s, x:target.x - e.deltaX, y:target.y - e.deltaY });
      return;
    }

    let dy = e.deltaY;
    if(e.deltaMode === 1) dy *= 16;      // lines -> px (Firefox mouse wheel)
    else if(e.deltaMode === 2) dy *= m.h; // pages -> px
    dy = Math.max(-150, Math.min(150, dy));
    const k = kind === 'pinch' ? 0.01 : 0.002;
    const p = localPoint(e.clientX, e.clientY);
    // build on the pending target so fast wheel ticks accumulate instead of fighting
    tweenTo(zoomAround(target, p.x, p.y, Math.exp(-dy*k)), 260, EASE_ZOOM);
  }, { passive:false });

  /* ---- pointers: drag to pan, two-finger pinch on touch screens ---- */
  const pointers = new Map();
  let last = null, pinch = null, vel = { x:0, y:0 }, lastMoveTime = 0;
  // tap = press + release without real movement (used for clicking castles)
  const TAP_SLOP = 5; // px of movement allowed before a press counts as a drag
  let tapStart = null;
  const tapListeners = [];

  function pinchState(){
    const [a, b] = [...pointers.values()];
    const mid = localPoint((a.x + b.x)/2, (a.y + b.y)/2);
    return { mid, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  canvas.addEventListener('pointerdown', e => {
    if(e.target === resetBtn || e.button > 0) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
    stopTween();
    stage.classList.add('dragging');
    vel = { x:0, y:0 };
    last = { x:e.clientX, y:e.clientY };
    pinch = pointers.size === 2 ? pinchState() : null;
    tapStart = pointers.size === 1 ? { x:e.clientX, y:e.clientY } : null; // second finger cancels a tap
  });

  canvas.addEventListener('pointermove', e => {
    if(e.pointerType !== 'touch'){
      hover = { x:e.clientX, y:e.clientY };
      if(!pointers.size && !isHome()) updateReadout(); // hover only; moves redraw below
    }
    if(!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) <= TAP_SLOP) return; // still a tap
    tapStart = null;
    hideMapHints();

    if(pointers.size >= 2 && pinch){
      const now = pinchState();
      let next = zoomAround(target, now.mid.x, now.mid.y, now.dist / pinch.dist);
      next = { ...next, x: next.x + now.mid.x - pinch.mid.x, y: next.y + now.mid.y - pinch.mid.y };
      pinch = now;
      jumpTo(next);
      return;
    }

    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    const t = performance.now(), dt = Math.max(1, t - lastMoveTime);
    vel = { x: vel.x*0.7 + (dx/dt)*0.3, y: vel.y*0.7 + (dy/dt)*0.3 }; // smoothed px/ms
    lastMoveTime = t;
    last = { x:e.clientX, y:e.clientY };
    jumpTo({ s:target.s, x:target.x + dx, y:target.y + dy });
  });

  function endPointer(e){
    if(!pointers.delete(e.pointerId)) return;
    if(pointers.size === 1){
      // pinch -> one finger left: continue as a plain drag from that finger
      const [p] = pointers.values();
      last = { x:p.x, y:p.y }; pinch = null; vel = { x:0, y:0 };
      return;
    }
    if(pointers.size > 0) return;
    stage.classList.remove('dragging');
    if(tapStart && e.type === 'pointerup'){
      tapStart = null;
      tapListeners.forEach(fn => fn(e.clientX, e.clientY, e.pointerType));
      return;
    }
    tapStart = null;
    // coast in the drag direction, unless the pointer was held still before release
    if(performance.now() - lastMoveTime < 80 && Math.hypot(vel.x, vel.y) > 0.05){
      const COAST_MS = 180;
      tweenTo({ s:target.s, x:target.x + vel.x*COAST_MS, y:target.y + vel.y*COAST_MS }, 500, EASE_COAST);
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { hover = null; if(!isHome()) updateReadout(); });

  /* ---- reset button: bezier tween back to the default view ---- */
  resetBtn.addEventListener('click', () => tweenTo(HOME, 650, EASE_RESET));

  // Layout changed (window resize, mobile stacking, image load, page scroll):
  // re-measure, then re-clamp so no gaps appear
  function relayout(){ measure(); cur = clamp(cur); target = clamp(target); schedule(); layoutListeners.forEach(fn => fn()); }
  new ResizeObserver(relayout).observe(canvas);
  img.addEventListener('load', relayout);
  window.addEventListener('scroll', measure, { passive:true });

  const layoutListeners = [];

  // Small API for other tools (DevMode markers) that place things on the map
  const api = {
    stage, img,
    imageToStage,
    // client (screen) point -> map image pixel coords
    clientToImage(clientX, clientY){
      const p = localPoint(clientX, clientY);
      return stageToImage((p.x - cur.x) / cur.s, (p.y - cur.y) / cur.s);
    },
    // map image pixel at the centre of the current view
    viewCenterImage(){
      return stageToImage((m.w/2 - cur.x) / cur.s, (m.h/2 - cur.y) / cur.s);
    },
    onLayout(fn){ layoutListeners.push(fn); }, // called after resize / image load
    onDraw(fn){ drawListeners.push(fn); },     // called every redraw with { s, x, y }
    onTap(fn){ tapListeners.push(fn); },       // called with (clientX, clientY, pointerType) on a click without drag
    view(){ return cur; },                       // current { s, x, y }
    canvas,
    // stage layout box inside the canvas (for overlays that sit on top of the stage)
    stageBox(){ return { left: m.stageLeft, top: m.stageTop, w: m.w, h: m.h }; },
  };

  measure();
  draw();
  return api;
}

const mapViewports = [...document.querySelectorAll('.algo-canvas')].map(makeMapViewport);

/* ===================== MAP ENTITIES =====================
   Map elements (castles, and future ones) are placed from JSON position files
   in assets/MapElements/Coordinates/, never hardcoded here. Each file is
     { "1": { "x": 210, "y": 594 }, "2": { ... }, ... }
   in map image pixels (same format the DevMode editor exports).
   Castles/flags use castle_positions.json, keyed by engine city name.
   Anchor is the exact centre of the image (0.5, 0.5): the middle of each
   sprite sits on its position.

   Position JSON is imported through Vite (still the single source: edit the
   file, the page hot-reloads). Sprite paths stay as plain 'assets/...'
   strings; assetUrl() maps them to Vite's URLs so they survive `vite build`. */
const ASSET_URLS = import.meta.glob('./assets/MapElements/**/*.{png,gif}', { eager: true, query: '?url', import: 'default' });
const assetUrl = path => ASSET_URLS['./' + path] ?? path;

// `z` sets the layer order (higher draws on top). Below the sprites:
// z 1 = road/arc/heatmap SVG, z 2 = node-state discs; above: z 5 = city names.
const MAP_ENTITY_TYPES = [
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
    sprites: ['Castle1', 'Castle2', 'Castle1_ruins', 'Castle2_ruins'].flatMap(folder =>
      Array.from({ length: 8 }, (_, i) =>
        `assets/MapElements/EntityAssets/${folder}/${folder.toLowerCase()}_${i + 1}.png`)),
    size: 60, // sprite width/height in map image pixels
    resScale: 0.25, // render from a downsampled copy (0.25 = 128px), nearest-neighbour (see lowResSprite)
    z: 4,
  },
];

// Sprites live in an unscaled overlay above the stage, not inside it: the stage
// is a composited layer that the browser rasterises once and then stretches
// when zooming, which made sprites look downscaled. Here each sprite gets its
// real on-screen size every frame (size * zoom), so it is drawn straight from
// the full-resolution source at whatever zoom is current.
function addMapEntityLayer(vp, type, positions, spriteFor){
  const layer = document.createElement('div');
  layer.className = 'map-entity-layer';
  layer.dataset.entity = type.name;
  layer.style.zIndex = type.z;
  vp.stage.after(layer);

  const sprites = Object.entries(positions).map(([key, pos]) => {
    const el = document.createElement('img');
    el.src = spriteFor[key];
    el.alt = '';
    el.className = 'map-entity ' + type.name + (type.resScale < 1 ? ' pixelated' : '');
    el.dataset.key = key;
    el.draggable = false;
    layer.appendChild(el);
    return { el, pos, sx:0, sy:0 };
  });
  let baseSize = 0; // sprite size in untransformed stage px

  // On layout: map image px -> untransformed stage coords (cached)
  function layout(){
    const box = vp.stageBox();
    layer.style.left = box.left + 'px';
    layer.style.top = box.top + 'px';
    layer.style.width = box.w + 'px';
    layer.style.height = box.h + 'px';
    const corner = vp.imageToStage(0, 0), far = vp.imageToStage(type.size, type.size);
    if(!corner){ baseSize = 0; return; } // map image not loaded yet; runs again on load
    baseSize = far.x - corner.x;
    for(const sp of sprites){
      const p = vp.imageToStage(sp.pos.x, sp.pos.y);
      sp.sx = p.x; sp.sy = p.y;
    }
  }

  // Every frame: apply the current pan/zoom by hand, centre anchor (0.5, 0.5)
  function draw(view){
    if(!baseSize) return;
    const size = baseSize * view.s;
    for(const sp of sprites){
      const x = view.x + sp.sx * view.s - size/2;
      const y = view.y + sp.sy * view.s - size/2;
      sp.el.style.transform = `translate(${x}px, ${y}px)`;
      sp.el.style.width = sp.el.style.height = size + 'px';
    }
  }

  vp.onLayout(layout);
  vp.onDraw(draw);
  layout();
  draw(vp.view());
}

// `resScale` (optional, 0..1): downsample a sprite to resScale x its native
// resolution with nearest-neighbour sampling, then display it with
// image-rendering:pixelated so it upscales blocky too. 1 / omitted = untouched.
// Static images only: a canvas copy of an animated GIF keeps just one frame.
const lowResCache = new Map(); // "src|scale" -> Promise<object URL>
function lowResSprite(src, scale){
  if(!scale || scale >= 1) return Promise.resolve(src);
  const cacheKey = src + '|' + scale;
  if(!lowResCache.has(cacheKey)){
    lowResCache.set(cacheKey, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = false; // nearest-neighbour downsample
        ctx.drawImage(img, 0, 0, w, h);
        cv.toBlob(blob => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed')));
      };
      img.onerror = () => reject(new Error('Could not load ' + src));
      img.src = src;
    }));
  }
  return lowResCache.get(cacheKey);
}

async function loadMapEntities(type){
  const positions = type.positions;
  // Resolve each item's sprite once, so both maps show identical results
  const spriteFor = {};
  for(const key of Object.keys(positions)){
    spriteFor[key] = assetUrl(type.sprites
      ? type.sprites[Math.floor(Math.random() * type.sprites.length)]
      : type.sprite);
  }
  try {
    if(type.resScale && type.resScale < 1){
      // swap every picked sprite for its low-res copy (each unique file processed once)
      await Promise.all(Object.keys(spriteFor).map(async key => {
        spriteFor[key] = await lowResSprite(spriteFor[key], type.resScale);
      }));
    }
  } catch(err){
    console.error(`Could not prepare ${type.name} sprites`, err);
  }
  mapViewports.forEach(vp => addMapEntityLayer(vp, type, positions, spriteFor));
}

MAP_ENTITY_TYPES.forEach(loadMapEntities);

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
const DISC_SIZE = 44;     // disc width in map image px
const DISC_Y_SCALE = 0.6; // discs are ovals: height = width * DISC_Y_SCALE
const LABEL_GAP = 4;      // map image px between the bottom of the node disc and its label
// City label font grows with zoom: LABEL_FONT_MIN px at 1x -> LABEL_FONT_MAX px at MAX_SCALE
const LABEL_FONT_MIN = 13, LABEL_FONT_MAX = 26;
// Labels show just the city's initial (larger, see .node-label in style.css)
// until the city is hovered (mouse within TAP_RADIUS) or tapped (touch).
const TREE_WIDTH = 5, PATH_WIDTH = 7, ARC_WIDTH = 4; // map image px
const TAP_RADIUS = 36;    // map image px: how close a click must be to pick a castle
const SVG_NS = 'http://www.w3.org/2000/svg';

// Straight Line overlay: chord + gentle elliptical arc between start and goal,
// bulging toward Bucharest (same illustrative geometry as the original UI).
// Uses display positions only; it is a visual aid, not part of any heuristic.
function arcPoints(start, goal){
  const ca = ROAD_POSITIONS[start], cb = ROAD_POSITIONS[goal], buc = ROAD_POSITIONS.Bucharest;
  const dx = cb.x - ca.x, dy = cb.y - ca.y, chord = Math.hypot(dx, dy);
  if(chord === 0) return null;
  const a = chord / 2, mx = ca.x + dx/2, my = ca.y + dy/2, ux = dx / chord, uy = dy / chord;
  const vx = buc.x - mx, vy = buc.y - my, dbuc = Math.hypot(vx, vy);
  const b = chord * Math.min(0.02 + 0.07 * dbuc / chord, 0.08), wLen = dbuc || 1;
  const pts = [];
  for(let i = 0; i <= 50; i++){
    const t = Math.PI * i / 50, ct = Math.cos(t), st = Math.sin(t);
    pts.push((mx + a*ct*ux + b*st*vx/wLen).toFixed(1) + ',' + (my + a*ct*uy + b*st*vy/wLen).toFixed(1));
  }
  return { ca, cb, pts: pts.join(' ') };
}

function makeLaneOverlay(vp, lane){
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-entity-layer map-svg-layer');
  svg.style.zIndex = 1;
  const world = document.createElementNS(SVG_NS, 'g'); // map image px space
  svg.appendChild(world);
  const discLayer = document.createElement('div');
  discLayer.className = 'map-entity-layer';
  discLayer.style.zIndex = 2;
  const labelLayer = document.createElement('div');
  labelLayer.className = 'map-entity-layer';
  labelLayer.style.zIndex = 5;
  vp.stage.after(svg, discLayer, labelLayer);

  const discs = {}, labels = {};
  for(const city of CITIES){
    discs[city] = discLayer.appendChild(document.createElement('div'));
    const label = labelLayer.appendChild(document.createElement('div'));
    label.className = 'node-label';
    label.textContent = cityCode(city);
    labels[city] = label;
  }

  function layout(){
    const box = vp.stageBox();
    for(const el of [svg, discLayer, labelLayer]){
      el.style.left = box.left + 'px'; el.style.top = box.top + 'px';
      el.style.width = box.w + 'px';   el.style.height = box.h + 'px';
    }
  }

  // Every frame: position everything for the current pan/zoom
  function draw(view){
    const o = vp.imageToStage(0, 0);
    if(!o) return; // map image not loaded yet
    const k = (vp.imageToStage(1, 0).x - o.x) * view.s; // screen px per map image px
    const ox = view.x + o.x * view.s, oy = view.y + o.y * view.s;
    world.setAttribute('transform', `translate(${ox} ${oy}) scale(${k})`);
    const zoomT = (view.s - MIN_SCALE) / (MAX_SCALE - MIN_SCALE); // 0 at 1x, 1 at 8x
    labelLayer.style.setProperty('--label-font', (LABEL_FONT_MIN + (LABEL_FONT_MAX - LABEL_FONT_MIN) * zoomT) + 'px');
    const dw = DISC_SIZE * k, dh = dw * DISC_Y_SCALE;
    for(const city of CITIES){
      // disc sits on the city's road junction, label centred just under the disc
      const r = ROAD_POSITIONS[city];
      if(!r) continue;
      const x = ox + r.x * k, y = oy + r.y * k;
      const disc = discs[city];
      disc.style.transform = `translate(${x - dw/2}px, ${y - dh/2}px)`;
      disc.style.width = dw + 'px';
      disc.style.height = dh + 'px';
      labels[city].style.transform = `translate(${x}px, ${y + dh/2 + LABEL_GAP * k}px) translateX(-50%)`;
    }
  }

  // Search state changed: recolour discs, rebuild highlighted roads / arc / heat
  function update(){
    const L = derived[lane];
    const step = L.result.steps[Math.min(state.stepIdx, L.last)];
    const final = state.stepIdx >= L.last;
    const landmarks = laneLandmarkCities(lane);
    for(const city of CITIES){
      const st = step ? nodeState(city, step, final, L.result.found, L.result.path) : 'unvisited';
      let cls = 'node-disc state-' + st;
      if(city === state.start) cls += ' is-start';
      if(city === state.goal) cls += ' is-goal';
      if(landmarks.includes(city)) cls += ' is-landmark';
      discs[city].className = cls;
    }

    const tree = step ? treeEdgeKeys(step, L.result.parent, state.start) : new Set();
    const onPath = final && L.result.found ? pathEdgeKeys(L.result.path) : new Set();
    const line = (a, b, cls, w) => {
      const pa = ROAD_POSITIONS[a], pb = ROAD_POSITIONS[b];
      return pa && pb ? `<line class="${cls}" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke-width="${w}"/>` : '';
    };
    let html = '';
    if(L.heat){
      for(const city of CITIES){
        const p = ROAD_POSITIONS[city]; // same spot and oval shape as the node disc, a bit larger
        const rx = DISC_SIZE * 0.75;
        if(p) html += `<ellipse class="heat" cx="${p.x}" cy="${p.y}" rx="${rx}" ry="${rx * DISC_Y_SCALE}" fill="hsl(${Math.round(L.heat[city] * 240)}, 85%, 55%)"/>`;
      }
    }
    for(const e of BASE_EDGES) if(tree.has(e.key) && !onPath.has(e.key)) html += line(e.a, e.b, 'road-tree', TREE_WIDTH);
    for(const e of BASE_EDGES) if(onPath.has(e.key)) html += line(e.a, e.b, 'road-path', PATH_WIDTH);
    if(state.showLine){
      const arc = arcPoints(state.start, state.goal);
      if(arc){
        html += `<line class="arc-chord" x1="${arc.ca.x}" y1="${arc.ca.y}" x2="${arc.cb.x}" y2="${arc.cb.y}" stroke-width="${ARC_WIDTH * 0.6}"/>`;
        html += `<polyline class="arc" points="${arc.pts}" stroke-width="${ARC_WIDTH}"/>`;
      }
    }
    world.innerHTML = html;
  }

  // Nearest castle to a screen point, within TAP_RADIUS map px (else null)
  function cityAt(clientX, clientY){
    const p = vp.clientToImage(clientX, clientY);
    if(!p) return null;
    let best = null, bestD = TAP_RADIUS;
    for(const city of CITIES){
      const c = CITY_POSITIONS[city];
      const dist = c ? Math.hypot(c.x - p.x, c.y - p.y) : Infinity;
      if(dist < bestD){ best = city; bestD = dist; }
    }
    return best;
  }

  // Full-name labels: the hovered city (mouse) and the last tapped city (touch)
  let hovered = null, pinned = null;
  function refreshLabels(){
    for(const city of CITIES){
      const full = city === hovered || city === pinned;
      const label = labels[city];
      if(label.classList.contains('full') === full) continue;
      label.classList.toggle('full', full);
      label.textContent = full ? city : cityCode(city);
    }
  }
  vp.canvas.addEventListener('pointermove', e => {
    if(e.pointerType === 'touch') return;
    const city = cityAt(e.clientX, e.clientY);
    if(city !== hovered){ hovered = city; refreshLabels(); }
  });
  vp.canvas.addEventListener('pointerleave', () => { if(hovered){ hovered = null; refreshLabels(); } });

  vp.onTap((clientX, clientY, pointerType) => {
    const city = cityAt(clientX, clientY);
    // touch/pen have no hover: a tap shows that city's name until another tap
    if(pointerType !== 'mouse'){ pinned = city; refreshLabels(); }
    // Tool on: clicking near a castle toggles it as this lane's custom landmark
    if(state.pickLandmarks && city) toggleCustomLandmark(lane, city);
  });

  vp.onLayout(layout);
  vp.onDraw(draw);
  layout();
  return { update, draw: () => draw(vp.view()) };
}

const laneOverlays = { A: makeLaneOverlay(mapViewports[0], 'A'), B: makeLaneOverlay(mapViewports[1], 'B') };

function renderMaps(){
  if(!derived) return;
  laneOverlays.A.update();
  laneOverlays.B.update();
}

// First run: compute both lanes and draw everything
recompute();
render();
laneOverlays.A.draw();
laneOverlays.B.draw();

/* ===================== DEV MODE: MARKER SQUARES =====================
   Only runs when DevMode is true. Adds a plain, unstyled window with a
   "Spawn square" button and a JSON textbox. Each square is shown on both
   maps (same map image), can be dragged on either one, and its position is
   stored in map image pixels:
     { "1": { "x": 600, "y": 600 }, "2": { ... }, ... }
   Editing the JSON by hand also works: valid JSON is applied immediately. */
if(DevMode) (function initDevMode(){
  const SQUARE_PX = 24; // square size in map image pixels (scales with zoom)
  const squares = {};   // key "1","2",... -> { x, y } in image pixels

  // ---- the dev window (deliberately unstyled, just enough to float on top) ----
  const win = document.createElement('div');
  win.id = 'devWindow';
  win.style.cssText = 'position:fixed; right:10px; bottom:10px; z-index:1000; width:260px;' +
    'background:#fff; border:1px solid #000; padding:8px; font:12px monospace;';
  win.innerHTML =
    '<div><b>DevMode</b></div>' +
    '<button id="devSpawn">Spawn square</button> ' +
    '<button id="devClear">Clear all</button>' +
    '<textarea id="devJson" rows="10" spellcheck="false" style="display:block; width:100%; margin-top:6px; font:11px monospace;"></textarea>' +
    '<div id="devStatus"></div>';
  document.body.appendChild(win);
  const jsonBox = win.querySelector('#devJson');
  const status = win.querySelector('#devStatus');

  // ---- square elements: one per square per map ----
  const els = mapViewports.map(() => ({})); // [viewportIndex][key] -> element
  // Squares get their own unscaled overlay above the castle layer (same
  // technique as the sprites), so squares on castle positions stay visible.
  const layers = mapViewports.map(vp => {
    const layer = document.createElement('div');
    layer.className = 'map-entity-layer dev-square-layer';
    vp.canvas.querySelector('.map-hud').before(layer);
    return layer;
  });

  function makeSquareEl(vp, key){
    const el = document.createElement('div');
    el.className = 'dev-square';
    el.textContent = key;
    el.style.cssText = 'position:absolute; box-sizing:border-box; border:1px solid #f00;' +
      'background:rgba(255,0,0,.25); color:#000; font:9px monospace; line-height:1;' +
      'display:flex; align-items:center; justify-content:center; cursor:move;' +
      'position:absolute; left:0; top:0; pointer-events:auto;';

    // drag the square (stopPropagation so the map doesn't pan underneath)
    el.addEventListener('pointerdown', e => {
      if(e.button > 0) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const start = vp.clientToImage(e.clientX, e.clientY);
      const origin = { ...squares[key] };
      const move = ev => {
        const p = vp.clientToImage(ev.clientX, ev.clientY);
        if(!p || !start) return;
        setSquare(key, origin.x + p.x - start.x, origin.y + p.y - start.y);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    layers[mapViewports.indexOf(vp)].appendChild(el);
    return el;
  }

  // Keep squares on the map image
  function clampToImage(vp, x, y){
    const w = vp.img.naturalWidth || Infinity, h = vp.img.naturalHeight || Infinity;
    return { x: Math.round(Math.min(w, Math.max(0, x))), y: Math.round(Math.min(h, Math.max(0, y))) };
  }

  function setSquare(key, x, y){
    squares[key] = clampToImage(mapViewports[0], x, y);
    render();
    writeJson();
  }

  // Position every square on every map. Squares live in an unscaled overlay,
  // so the current pan/zoom is applied by hand (centre anchor, like sprites).
  function render(){
    mapViewports.forEach((vp, i) => {
      const map = els[i];
      for(const key of Object.keys(map)){
        if(!(key in squares)){ map[key].remove(); delete map[key]; }
      }
      const box = vp.stageBox(), layer = layers[i];
      layer.style.left = box.left + 'px'; layer.style.top = box.top + 'px';
      layer.style.width = box.w + 'px';   layer.style.height = box.h + 'px';
      const corner = vp.imageToStage(0, 0), far = vp.imageToStage(SQUARE_PX, SQUARE_PX);
      if(!corner) return; // image not loaded yet; onLayout re-renders after load
      const view = vp.view();
      const size = (far.x - corner.x) * view.s;
      for(const [key, pos] of Object.entries(squares)){
        const el = map[key] || (map[key] = makeSquareEl(vp, key));
        const p = vp.imageToStage(pos.x, pos.y);
        const x = view.x + p.x * view.s - size/2, y = view.y + p.y * view.s - size/2;
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.width = el.style.height = size + 'px';
      }
    });
  }

  function writeJson(){
    if(document.activeElement === jsonBox) return; // don't clobber manual edits in progress
    jsonBox.value = JSON.stringify(squares, null, 2);
  }

  function nextKey(){
    const nums = Object.keys(squares).map(Number).filter(Number.isFinite);
    return String(nums.length ? Math.max(...nums) + 1 : 1);
  }

  // ---- controls ----
  win.querySelector('#devSpawn').addEventListener('click', () => {
    // spawn at the centre of whatever map A is currently looking at
    const c = mapViewports[0].viewCenterImage() || { x:0, y:0 };
    setSquare(nextKey(), c.x, c.y);
    status.textContent = Object.keys(squares).length + ' square(s)';
  });

  win.querySelector('#devClear').addEventListener('click', () => {
    for(const key of Object.keys(squares)) delete squares[key];
    render(); writeJson();
    status.textContent = '0 square(s)';
  });

  // hand-edited JSON: apply when valid, report when not
  jsonBox.addEventListener('input', () => {
    let data;
    try { data = JSON.parse(jsonBox.value || '{}'); }
    catch(err){ status.textContent = 'Invalid JSON: ' + err.message; return; }
    const ok = data && typeof data === 'object' && !Array.isArray(data) &&
      Object.values(data).every(v => v && Number.isFinite(v.x) && Number.isFinite(v.y));
    if(!ok){ status.textContent = 'Expected { "1": { "x": n, "y": n }, ... }'; return; }
    for(const key of Object.keys(squares)) delete squares[key];
    for(const [key, v] of Object.entries(data)) squares[key] = clampToImage(mapViewports[0], v.x, v.y);
    render();
    status.textContent = Object.keys(squares).length + ' square(s)';
  });
  jsonBox.addEventListener('paste', e => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    try {
      const data = JSON.parse(text);
      if(!data || typeof data !== 'object' || Array.isArray(data)) return;
    } catch(_){ return; } // not a full JSON object: normal paste
    e.preventDefault();
    jsonBox.value = text;
    jsonBox.dispatchEvent(new Event('input')); // apply it
  });
  jsonBox.addEventListener('blur', writeJson); // normalise formatting after editing

  mapViewports.forEach(vp => { vp.onLayout(render); vp.onDraw(render); });
  writeJson();
})();
