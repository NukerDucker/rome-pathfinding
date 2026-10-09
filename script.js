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
const DevMode = false;

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

/* ===================== CUSTOM DROPDOWNS =====================
   Every <select> in a .select-wrap is drawn as a pixel-art button + popup list
   (style.css: .dd-btn, .dd-list). The hidden native select keeps the value, so
   the code below still reads/sets .value and listens for 'change'; picking an
   option sets the value and fires 'change'. After setting .value from code,
   call syncDropdowns() to update the button text (renderControls does). */
const dropdowns = [];
let openDropdown = null;

function makeDropdown(select){
  const wrap = select.parentElement;
  const listId = select.id + 'List';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn ' + select.className;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', listId);
  const list = document.createElement('ul');
  list.className = 'dd-list';
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', select.getAttribute('aria-label'));
  list.tabIndex = -1;
  list.hidden = true;
  wrap.append(btn, list);

  let activeIdx = -1;
  const items = () => [...list.children];

  function sync(){
    const opt = select.selectedOptions[0];
    btn.textContent = opt ? opt.text : '';
    btn.setAttribute('aria-label', select.getAttribute('aria-label') + ': ' + btn.textContent);
    btn.title = select.title;
  }

  function setActive(i){
    const all = items();
    if(!all.length) return;
    activeIdx = Math.max(0, Math.min(all.length - 1, i));
    all.forEach((li, j) => li.classList.toggle('active', j === activeIdx));
    list.setAttribute('aria-activedescendant', all[activeIdx].id);
    all[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  function open(){
    if(openDropdown && openDropdown !== api) openDropdown.close(false);
    // Rebuilt on every open: options can change (landmark dropdown)
    list.replaceChildren(...[...select.options].map((o, i) => {
      const li = document.createElement('li');
      li.className = 'dd-option';
      li.id = listId + '-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(o.selected));
      li.textContent = o.text;
      return li;
    }));
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    openDropdown = api;
    setActive(select.selectedIndex);
    list.focus({ preventScroll: true });
  }

  function close(refocus = true){
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if(openDropdown === api) openDropdown = null;
    if(refocus) btn.focus();
  }

  function choose(i){
    const changed = i !== select.selectedIndex;
    select.selectedIndex = i;
    close();
    sync();
    if(changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  btn.addEventListener('click', () => list.hidden ? open() : close());
  btn.addEventListener('keydown', e => {
    if(['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)){ e.preventDefault(); open(); }
  });
  list.addEventListener('click', e => {
    const li = e.target.closest('.dd-option');
    if(li) choose(items().indexOf(li));
  });
  list.addEventListener('mousemove', e => {
    const li = e.target.closest('.dd-option');
    if(li) setActive(items().indexOf(li));
  });
  list.addEventListener('keydown', e => {
    const n = items().length;
    switch(e.key){
      case 'ArrowDown': setActive(activeIdx + 1); break;
      case 'ArrowUp': setActive(activeIdx - 1); break;
      case 'Home': setActive(0); break;
      case 'End': setActive(n - 1); break;
      case 'PageDown': setActive(activeIdx + 5); break;
      case 'PageUp': setActive(activeIdx - 5); break;
      case 'Enter': case ' ': choose(activeIdx); break;
      case 'Escape': close(); break;
      case 'Tab': close(false); return; // let focus move on
      default: {
        // Type-ahead: jump to the next option starting with the typed letter
        if(e.key.length !== 1) return;
        const k = e.key.toLowerCase();
        const all = items();
        for(let s = 1; s <= n; s++){
          const j = (activeIdx + s) % n;
          if(all[j].textContent.toLowerCase().startsWith(k)){ setActive(j); break; }
        }
      }
    }
    e.preventDefault();
  });

  const api = { sync, close, wrap };
  sync();
  return api;
}

// Click anywhere outside the open dropdown closes it
document.addEventListener('pointerdown', e => {
  if(openDropdown && !openDropdown.wrap.contains(e.target)) openDropdown.close(false);
});

function syncDropdowns(){ for(const d of dropdowns) d.sync(); }

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
    inputsChanged(); // re-renders the landmark dropdown with this algorithm's options
  });
}

document.getElementById('randomBtn').addEventListener('click', () => {
  const next = randomPair();
  state.start = next.start;
  state.goal = next.goal;
  inputsChanged();
});

/* ===================== LANDMARK CONTROLS =====================
   One dropdown per lane.
   Landmark algorithms (Greedy, A* LP+ALT, A* ALT only, Bidir. A*): 2 / 4 / 8.
   Other algorithms: Off / 2 / 4 / 8; a number shows the landmark overlay on the
   map only (visual, the algorithm is unchanged).
   Custom picks (Tool) override the preset and show as "Custom (n)"; choosing
   a number clears them. */
function makeLandmarkControl(lane){
  const dropdown = document.getElementById('landmarkDropdown' + lane);
  let optionsKey = ''; // rebuild options only when they change (render runs every playback step)

  function render(){
    const meta = ALGORITHMS[state.algo[lane]];
    const l = state.lanes[lane];
    const active = meta.usesLandmarks || l.overlay;
    const options = [];
    if(!meta.usesLandmarks) options.push(['off', 'Off']);
    if(active && l.custom.length > 0) options.push(['custom', 'Custom (' + l.custom.length + ')']);
    for(const k of Object.keys(LM_SHORT)) options.push([k, LM_SHORT[k]]);
    const key = options.map(o => o.join('=')).join('|');
    if(key !== optionsKey){
      optionsKey = key;
      dropdown.replaceChildren(...options.map(([value, text]) => new Option(text, value)));
    }
    dropdown.value = !active ? 'off' : l.custom.length > 0 ? 'custom' : l.count;
    dropdown.title = meta.usesLandmarks
      ? 'Number of landmarks this algorithm uses'
      : 'Optional landmark overlay (visual only, algorithm unchanged)';
  }

  dropdown.addEventListener('change', () => {
    const l = state.lanes[lane];
    const v = dropdown.value;
    if(v === 'custom') return;
    l.custom = [];
    if(v === 'off'){ l.overlay = false; }
    else { l.count = v; if(!ALGORITHMS[state.algo[lane]].usesLandmarks) l.overlay = true; }
    inputsChanged();
  });

  return { render };
}
const landmarkControls = { A: makeLandmarkControl('A'), B: makeLandmarkControl('B') };
for(const sel of document.querySelectorAll('.select-wrap select')) dropdowns.push(makeDropdown(sel));

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
// pixel-art slider: green fill follows the handle (0..1 of the range), and the
// text under it shows the current step delay (1500ms slowest .. 0ms fastest)
const speedValue = document.getElementById('speedValue');
const syncSliderFill = () => {
  speedSlider.parentElement.style.setProperty('--frac', speedSlider.value / speedSlider.max);
  speedValue.textContent = stepDelay() + 'ms';
  speedSlider.setAttribute('aria-valuetext', stepDelay() + ' milliseconds per step');
};
speedSlider.addEventListener('input', syncSliderFill);
syncSliderFill();

/* ===================== RENDER: CONTROLS + TABLE ===================== */
function renderControls(){
  fromSelect.value = state.start;
  toSelect.value = state.goal;
  for(const lane of ['A', 'B']){
    algoSelect[lane].value = state.algo[lane];
    document.getElementById('algo' + lane + 'Label').textContent = ALGORITHMS[state.algo[lane]].label;
    landmarkControls[lane].render();
  }
  syncDropdowns();
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
    // Image box inside the untransformed stage, from rects (sub-pixel exact;
    // offsetWidth/Height round, which drifts at high zoom). The stage's
    // transform (origin 0 0) scales both rects alike, so divide it back out.
    const sr = stage.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const s = cur ? cur.s : 1;
    m = {
      left: r.left + canvas.clientLeft + stage.offsetLeft,
      top:  r.top  + canvas.clientTop  + stage.offsetTop,
      w: stage.offsetWidth, h: stage.offsetHeight,
      imgX: (ir.left - sr.left) / s, imgY: (ir.top - sr.top) / s,
      imgW: ir.width / s, imgH: ir.height / s,
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
  // (e.g. 0..1198 x 0..941 for the 1199x942 map). Tracks the pixel under the cursor
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

  canvas.addEventListener('dragstart', e => e.preventDefault()); // belt and braces for browsers that still start an image drag
  canvas.addEventListener('pointerdown', e => {
    if(e.target === resetBtn || e.button > 0) return;
    e.preventDefault(); // no native image drag or text selection: a press on the map always pans
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
  // capture: the page scrolls on <body> (not the window), and element scroll
  // events don't bubble, so listen in the capture phase to catch it
  window.addEventListener('scroll', measure, { passive:true, capture:true });

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
const LABEL_FONT_MIN = 15, LABEL_FONT_MAX = 28;
// Labels show just the city's initial (larger, see .node-label in style.css)
// until the city is hovered (mouse within TAP_RADIUS) or tapped (touch).
const TREE_WIDTH = 5, PATH_WIDTH = 7, ARC_WIDTH = 6; // map image px
const TAP_RADIUS = 36;    // map image px: how close a click must be to a node (road junction) to pick it
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
  // lane-A / lane-B classes let CSS tell the lanes apart on the merged map
  // (split discs, dark-outlined dashed lane-B roads drawn over lane A's)
  svg.setAttribute('class', 'map-entity-layer map-svg-layer lane-' + lane);
  svg.style.zIndex = lane === 'B' ? 2 : 1;
  const world = document.createElementNS(SVG_NS, 'g'); // map image px space
  svg.appendChild(world);
  const discLayer = document.createElement('div');
  discLayer.className = 'map-entity-layer lane-' + lane;
  discLayer.style.zIndex = 2;
  const labelLayer = document.createElement('div');
  labelLayer.className = 'map-entity-layer';
  labelLayer.style.zIndex = 5;
  vp.stage.after(svg, discLayer, labelLayer);

  // Hidden overlays (Merge toggle picks merged-B or split-B) ignore hover/taps
  let visible = true;
  function setVisible(v){
    visible = v;
    for(const el of [svg, discLayer, labelLayer]) el.style.display = v ? '' : 'none';
  }

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
      if(!pa || !pb) return '';
      const xy = `x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"`;
      // Lane B: a dark dashed copy underneath outlines each dash (shown on the merged map only)
      const casing = lane === 'B' ? `<line class="road-casing" ${xy}/>` : '';
      return casing + `<line class="${cls}" ${xy} stroke-width="${w}"/>`;
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
        html += `<line class="arc-chord" x1="${arc.ca.x}" y1="${arc.ca.y}" x2="${arc.cb.x}" y2="${arc.cb.y}" stroke-width="${ARC_WIDTH * 0.8}"/>`;
        html += `<polyline class="arc" points="${arc.pts}" stroke-width="${ARC_WIDTH}"/>`;
      }
    }
    world.innerHTML = html;
  }

  // Nearest node (road junction, where the disc is drawn) to a screen point,
  // within TAP_RADIUS map px (else null)
  function cityAt(clientX, clientY){
    const p = vp.clientToImage(clientX, clientY);
    if(!p) return null;
    let best = null, bestD = TAP_RADIUS;
    for(const city of CITIES){
      const c = ROAD_POSITIONS[city];
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
    if(!visible || e.pointerType === 'touch') return;
    const city = cityAt(e.clientX, e.clientY);
    if(city !== hovered){ hovered = city; refreshLabels(); }
  });
  vp.canvas.addEventListener('pointerleave', () => { if(hovered){ hovered = null; refreshLabels(); } });

  vp.onTap((clientX, clientY, pointerType) => {
    if(!visible) return;
    const city = cityAt(clientX, clientY);
    // touch/pen have no hover: a tap shows that city's name until another tap
    if(pointerType !== 'mouse'){ pinned = city; refreshLabels(); }
    // Tool on: clicking near a node toggles it as this lane's custom landmark
    if(state.pickLandmarks && city) toggleCustomLandmark(lane, city);
  });

  vp.onLayout(layout);
  vp.onDraw(draw);
  layout();
  return { update, setVisible, draw: () => draw(vp.view()) };
}

// Lane A always draws on map A. Lane B has two overlays and the Merge toggle
// shows one of them: merged (on map A, routes overlaid on one shared map) or
// split (on map B, shown beside map A). mapViewports[1] always exists (its
// panel is only hidden via CSS while merged).
const laneOverlays = {
  A: makeLaneOverlay(mapViewports[0], 'A'),
  Bmerged: makeLaneOverlay(mapViewports[0], 'B'),
  Bsplit: makeLaneOverlay(mapViewports[1], 'B'),
};
const allOverlays = Object.values(laneOverlays);

/* ===================== DISTANCE BADGES =====================
   One km badge per road, at the midpoint between its two junctions, on each
   map. A badge turns "tree" (explored) or "path" (final route) when a lane
   shown on that map uses the road; on the merged map, either lane counts. */
const distanceChk = document.getElementById('distanceChk');
const KM_FONT_MIN = 12, KM_FONT_MAX = 22; // badge text px at 1x .. MAX_SCALE zoom
function makeDistanceLayer(vp, lanesShown){
  const layer = document.createElement('div');
  layer.className = 'map-entity-layer km-layer';
  layer.style.zIndex = 4; // above node discs (2), below city labels (5)
  vp.stage.after(layer);
  const badges = BASE_EDGES.map(e => {
    const el = layer.appendChild(document.createElement('div'));
    el.className = 'km-badge';
    el.textContent = e.km;
    return el;
  });

  function layout(){
    const box = vp.stageBox();
    layer.style.left = box.left + 'px'; layer.style.top = box.top + 'px';
    layer.style.width = box.w + 'px';   layer.style.height = box.h + 'px';
  }

  function draw(view){
    const o = vp.imageToStage(0, 0);
    if(!o) return; // map image not loaded yet
    const k = (vp.imageToStage(1, 0).x - o.x) * view.s; // screen px per map image px
    const ox = view.x + o.x * view.s, oy = view.y + o.y * view.s;
    const zoomT = (view.s - MIN_SCALE) / (MAX_SCALE - MIN_SCALE);
    layer.style.setProperty('--km-font', (KM_FONT_MIN + (KM_FONT_MAX - KM_FONT_MIN) * zoomT) + 'px');
    BASE_EDGES.forEach((e, i) => {
      const pa = ROAD_POSITIONS[e.a], pb = ROAD_POSITIONS[e.b];
      if(!pa || !pb) return;
      const x = ox + (pa.x + pb.x) / 2 * k, y = oy + (pa.y + pb.y) / 2 * k;
      badges[i].style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
  }

  function update(){
    layer.hidden = !distanceChk.checked;
    const tree = new Set(), onPath = new Set();
    for(const lane of lanesShown()){
      const L = derived[lane];
      const step = L.result.steps[Math.min(state.stepIdx, L.last)];
      const final = state.stepIdx >= L.last;
      if(step) for(const key of treeEdgeKeys(step, L.result.parent, state.start)) tree.add(key);
      if(final && L.result.found) for(const key of pathEdgeKeys(L.result.path)) onPath.add(key);
    }
    BASE_EDGES.forEach((e, i) => {
      badges[i].className = 'km-badge' + (onPath.has(e.key) ? ' km-path' : tree.has(e.key) ? ' km-tree' : '');
    });
  }

  vp.onLayout(layout);
  vp.onDraw(draw);
  layout();
  return { update, draw: () => draw(vp.view()) };
}
const distanceLayers = [
  makeDistanceLayer(mapViewports[0], () => document.getElementById('mergeChk').checked ? ['A', 'B'] : ['A']),
  makeDistanceLayer(mapViewports[1], () => ['B']),
];
distanceChk.addEventListener('change', renderMaps);

function renderMaps(){
  if(!derived) return;
  allOverlays.forEach(o => o.update());
  distanceLayers.forEach(d => d.update());
}

/* ===================== MERGE TOGGLE ===================== */
const mergeChk = document.getElementById('mergeChk');
function applyMerge(){
  const merged = mergeChk.checked;
  document.getElementById('compareWrap').classList.toggle('is-split', !merged);
  laneOverlays.Bmerged.setVisible(merged);
  laneOverlays.Bsplit.setVisible(!merged);
  // "left A / right B" and "lane B road" legend items only apply to the merged map
  for(const el of document.querySelectorAll('.legend-merged')) el.hidden = !merged;
  renderMaps(); // map A's distance badges count lane B only while merged
}
mergeChk.addEventListener('change', applyMerge);
applyMerge();

// First run: compute both lanes and draw everything
recompute();
render();
allOverlays.forEach(o => o.draw());
distanceLayers.forEach(d => d.draw());

/* ===================== GUIDE: formulas + figures ===================== */
// Every <span class="tex"> holds LaTeX; .tex-display renders as a centred block
for(const el of document.querySelectorAll('#tabGuide .tex')){
  katex.render(el.textContent, el, { throwOnError: false, displayMode: el.classList.contains('tex-display') });
}
// A GIF that fails to load becomes a "pending" box naming its spec
for(const fig of document.querySelectorAll('#tabGuide .guide-figure')){
  const img = fig.querySelector('img');
  const showMissing = () => {
    const box = document.createElement('div');
    box.className = 'guide-figure-missing';
    box.textContent = img.alt + ' — GIF pending (' + fig.dataset.spec + ')';
    img.replaceWith(box);
  };
  if(img.complete && img.naturalWidth === 0 && img.currentSrc) showMissing();
  else img.addEventListener('error', showMissing, { once: true });
}
// Contents list: highlight the section currently being read (the one crossing
// the upper part of the screen)
{
  const navLinks = new Map([...document.querySelectorAll('#tabGuide .guide-nav a')]
    .map(a => [a.getAttribute('href').slice(1), a]));
  const markActive = id => navLinks.forEach((a, key) => {
    a.classList.toggle('active', key === id);
    if(key === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
  const observer = new IntersectionObserver(entries => {
    for(const e of entries) if(e.isIntersecting) markActive(e.target.id);
  }, { rootMargin: '0px 0px -70% 0px' });
  document.querySelectorAll('#tabGuide .guide-section').forEach(sec => observer.observe(sec));
}

/* ===================== DAY / NIGHT =====================
   Only the page background changes (CSS --page-shade). Starts from the
   system setting; the toggle saves an explicit choice (index.html applies a
   saved choice before first paint). */
const themeToggle = document.getElementById('themeToggle');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const isNight = () => (document.documentElement.dataset.theme || (systemDark.matches ? 'night' : 'day')) === 'night';
function renderThemeToggle(){
  const night = isNight();
  themeToggle.textContent = night ? '☀' : '☾'; // shows the theme it switches to
  themeToggle.setAttribute('aria-label', night ? 'Switch to day' : 'Switch to night');
  themeToggle.title = themeToggle.getAttribute('aria-label');
}
themeToggle.addEventListener('click', () => {
  const next = isNight() ? 'day' : 'night';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch(e){ /* private mode: choice lasts this visit only */ }
  renderThemeToggle();
  // Secret: 5 day/night switches this visit reveal the bread button (hidden again after refresh)
  if(++themeSwitches === BREAD_UNLOCK_SWITCHES){
    const breadBtn = document.getElementById('breadBtn');
    breadBtn.hidden = false;
    breadBtn.classList.add('reveal');
    breadBtn.addEventListener('animationend', () => breadBtn.classList.remove('reveal'), { once: true });
  }
});
const BREAD_UNLOCK_SWITCHES = 5;
let themeSwitches = 0;
systemDark.addEventListener('change', renderThemeToggle); // system switch while no choice is saved
renderThemeToggle();

/* ===================== BREAD BUTTON (just for fun) =====================
   Plays the full-screen "GET BREAD" animation once (CSS .play); clicks while
   it's playing are ignored; it cleans up when the overlay's fade ends.
   After the first GET BREAD, a little bread pops up in its slot on top of the
   Guide intro card (once that slot is on screen) and stays; clicking that
   bread plays GET BREAD again. */
const breadOverlay = document.getElementById('breadOverlay');
const breadPerch = document.getElementById('breadPerch');
let breadPerchPending = false;
function playBread(){
  if(breadOverlay.classList.contains('play')) return;
  breadOverlay.classList.add('play');
}
document.getElementById('breadBtn').addEventListener('click', playBread);
breadPerch.addEventListener('click', playBread);
breadOverlay.addEventListener('animationend', e => {
  if(e.target !== breadOverlay) return; // ignore the bread/text animations
  breadOverlay.classList.remove('play');
  if(breadPerch.hidden && !breadPerchPending){ // first GET BREAD: send a bread to the Guide card
    breadPerchPending = true;
    breadPerchObserver.observe(document.getElementById('perchBread'));
  }
});
const breadPerchObserver = new IntersectionObserver(entries => {
  if(!breadPerchPending || !entries.some(e => e.isIntersecting)) return;
  breadPerchPending = false;
  breadPerchObserver.disconnect();
  breadPerch.hidden = false;
  breadPerch.animate( // pops up with a bounce
    [{ transform: 'translateY(30px) scale(.4)', opacity: 0 }, { transform: 'translateY(-12px) scale(1.1)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }],
    { duration: 500, easing: 'ease-out' });
}, { threshold: 0.6 });

/* ===================== DUCK (just for fun) =====================
   Each click: a synthesized quack (no sound file) and a hop. It gets more
   annoyed as you click (higher quack, bigger hop); on the 10th click it lets
   out a long quack, rolls off the screen and moves between its Map and Guide
   homes (see DUCK_HOMES). The audio context is created on the first click, as
   browsers require. */
const DUCK_PATIENCE = 10;
let quackCtx = null;
// pitch: 1 = normal; length: seconds
function quack(pitch = 1, length = 0.22){
  quackCtx ??= new (window.AudioContext || window.webkitAudioContext)();
  const ctx = quackCtx, t = ctx.currentTime;
  // nasal buzz (sawtooth) that drops in pitch, shaped by a "beak" band-pass filter
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(420 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(260 * pitch, t + length * 0.8);
  const beak = ctx.createBiquadFilter();
  beak.type = 'bandpass';
  beak.frequency.setValueAtTime(1300 * pitch, t);
  beak.frequency.exponentialRampToValueAtTime(800 * pitch, t + length * 0.8);
  beak.Q.value = 4;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.6, t + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(beak).connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.03);
}
const duckBtn = document.getElementById('duckBtn');
// new URL(..., import.meta.url) lets Vite include these sprites in `vite build`
const DUCK_ROLLED_SRC = new URL('./assets/duck-rolled.png', import.meta.url).href;  // 53x36
const DUCK_STANDING_SRC = new URL('./assets/duck.png', import.meta.url).href;       // 48x48
new Image().src = DUCK_ROLLED_SRC; // preload so the swap is instant
const duckImg = duckBtn.querySelector('img');
// Two homes: Map page (bottom of the comparison cards) and Guide page (perched
// on top of the intro card, left end). 10 clicks on the Map page: it rolls off
// the right edge and rolls in to its Guide perch once that spot is on screen.
// There it stays: clicks just quack + hop. Back on the Map after a refresh.
const DUCK_HOMES = {
  map:   { el: document.getElementById('duckHomeMap'),   exit: 'right', enterFrom: 'right' },
  guide: { el: document.getElementById('duckHomeGuide'), exit: 'left',  enterFrom: 'left' },
};
let duckHome = 'map', duckClicks = 0, duckBusy = false, duckPending = false;

// one click's reaction: the lying-down duck flashes during a hop of `hop` px
function duckHop(hop){
  duckBtn.style.setProperty('--hop', hop + 'px');
  duckImg.src = DUCK_ROLLED_SRC;
  duckBtn.classList.remove('hop');
  void duckBtn.offsetWidth; // restart the hop animation on rapid clicks
  duckBtn.classList.add('hop');
}
duckBtn.addEventListener('click', () => {
  if(duckBusy) return;
  if(duckHome === 'guide'){ quack(); duckHop(-12); return; } // happy on its Guide perch: never leaves
  duckClicks++;
  if(duckClicks >= DUCK_PATIENCE){ duckRollAway(); return; }
  const annoyance = duckClicks / DUCK_PATIENCE;            // 0.1 .. 0.9
  quack(1 + annoyance * 0.6);                              // quack rises in pitch
  duckHop(-12 - annoyance * 28);                           // hop grows
});
duckBtn.addEventListener('animationend', () => {
  duckBtn.classList.remove('hop');
  if(!duckBusy) duckImg.src = DUCK_STANDING_SRC; // back to the standing duck after the hop
});

// Lift the duck out of its box onto the screen as the lying-down sprite, at
// `box` (its standing spot), so it can roll freely. The map row is a size
// container that would trap position:fixed, so it moves to <body>.
function duckLiftOut(box){
  const scale = box.height / 48; // same pixel scale as the standing duck
  const w = Math.round(53 * scale), h = Math.round(36 * scale);
  duckImg.src = DUCK_ROLLED_SRC;
  document.body.appendChild(duckBtn);
  Object.assign(duckBtn.style, {
    position: 'fixed', margin: '0', zIndex: '900', width: w + 'px', height: h + 'px',
    left: (box.left + (box.width - w) / 2) + 'px', top: (box.bottom - h) + 'px', visibility: '',
  });
  return { w, h };
}
// Put the duck back in a home as the standing sprite, with its normal styles
function duckSettle(home){
  duckBtn.getAnimations().forEach(an => an.cancel());
  duckBtn.removeAttribute('style');
  duckImg.src = DUCK_STANDING_SRC;
  DUCK_HOMES[home].el.appendChild(duckBtn);
}

// Fed up: long offended quack, roll off this page's edge while fading (~1s),
// then wait (hidden) in the other home for it to come on screen.
// Fun animations always play in full (even with the OS "reduce motion"
// setting): they only run when you click, never on their own.
function duckRollAway(){
  duckBusy = true;
  quack(1.6, 1.2); // lasts through the exit
  duckBtn.classList.remove('hop');
  const box = duckBtn.getBoundingClientRect();
  const { w } = duckLiftOut(box);
  const right = DUCK_HOMES[duckHome].exit === 'right';
  const distance = right ? window.innerWidth - box.left + w : -(box.left + w); // fully off that edge
  const spin = Math.round(distance / w) * 90; // rolls the way it moves
  const frames = [
    { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
    { transform: `translateX(${distance / 2}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.5 },
    { transform: `translateX(${distance}px) rotate(${spin}deg)`, opacity: 0 },
  ];
  duckBtn.animate(frames, { duration: 1000, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' })
    .finished.then(() => {
      duckHome = duckHome === 'map' ? 'guide' : 'map';
      duckSettle(duckHome);
      duckBtn.hidden = true;
      duckClicks = 0;
      duckPending = true;
      duckBusy = false;
      duckWatchArrival();
    });
}

// Roll in to the new home once its spot is on screen (tab open + scrolled to)
const duckArrivalObserver = new IntersectionObserver(entries => {
  if(duckPending && entries.some(e => e.isIntersecting)) duckRollIn();
}, { threshold: 0.5 });
function duckWatchArrival(){
  duckArrivalObserver.disconnect();
  // the empty home has no size; give it the duck's footprint so it can be "seen"
  DUCK_HOMES[duckHome].el.classList.add('duck-home-waiting');
  duckArrivalObserver.observe(DUCK_HOMES[duckHome].el);
}
function duckRollIn(){
  duckPending = false;
  duckBusy = true;
  duckArrivalObserver.disconnect();
  const home = DUCK_HOMES[duckHome];
  home.el.classList.remove('duck-home-waiting');
  // measure the standing spot (invisible), then lift out and roll in to it
  duckBtn.hidden = false;
  duckBtn.style.visibility = 'hidden';
  const box = duckBtn.getBoundingClientRect();
  if(box.width === 0){ // spot not measurable right now (e.g. hidden): keep waiting
    duckBtn.hidden = true;
    duckBtn.removeAttribute('style');
    duckPending = true;
    duckBusy = false;
    duckWatchArrival();
    return;
  }
  const { w } = duckLiftOut(box);
  const fromLeft = home.enterFrom === 'left';
  const distance = fromLeft ? -(box.left + w) : window.innerWidth - box.left + w; // start fully off that edge
  const spin = Math.round(distance / w) * 90;
  const frames = [
    { transform: `translateX(${distance}px) rotate(${spin}deg)`, opacity: 0 },
    { transform: `translateX(${distance / 2}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.5 },
    { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
  ];
  quack(1.2, 0.3); // "I'm here"
  duckBtn.animate(frames, { duration: 1000, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' })
    .finished.then(() => {
      duckSettle(duckHome); // stand up in its new home
      duckBtn.classList.add('hop');
      duckBusy = false;
    });
}

/* ===================== PEEKING CAT (just for fun) =====================
   Each Merge toggle has a 1-in-10 chance to make the cat peek up from the
   bottom edge of a visible map (random spot), look around ~2s and slide back
   down. Only its head shows; the map clips the body. Click: meow + duck away. */
const CAT_CHANCE = 0.1;
const CAT_HEAD = 32 / 48; // the head (cap + face) is the top 32 of the sprite's 48 rows
const peekCat = document.getElementById('peekCat');
let catAnim = null;

function meow(){
  quackCtx ??= new (window.AudioContext || window.webkitAudioContext)(); // shared with the duck
  const ctx = quackCtx, t = ctx.currentTime;
  // "mee-ow": pitch rises then falls, through a vowel-like band-pass that opens then closes
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.linearRampToValueAtTime(820, t + 0.18);
  osc.frequency.exponentialRampToValueAtTime(480, t + 0.55);
  const mouth = ctx.createBiquadFilter();
  mouth.type = 'bandpass';
  mouth.Q.value = 3;
  mouth.frequency.setValueAtTime(900, t);
  mouth.frequency.linearRampToValueAtTime(1800, t + 0.2);
  mouth.frequency.exponentialRampToValueAtTime(700, t + 0.55);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
  amp.gain.setValueAtTime(0.5, t + 0.35);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  osc.connect(mouth).connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.65);
}

function catPeek(){
  // a visible map: map A, or (split view) map A or B
  const canvases = [...document.querySelectorAll('#compareWrap .algo-panel')]
    .filter(p => getComputedStyle(p).visibility !== 'hidden')
    .map(p => p.querySelector('.algo-canvas'));
  const canvas = canvases[Math.floor(Math.random() * canvases.length)];
  canvas.appendChild(peekCat);
  peekCat.hidden = false;
  const room = canvas.clientWidth - peekCat.offsetWidth;
  peekCat.style.left = Math.round(room * (0.05 + Math.random() * 0.9)) + 'px';
  const hiddenY = 'translateY(100%)', peekY = `translateY(${(1 - CAT_HEAD) * 100}%)`;
  const frames = [{ transform: hiddenY }, { transform: peekY, offset: 0.15 }, { transform: peekY, offset: 0.85 }, { transform: hiddenY }];
  catAnim = peekCat.animate(frames, { duration: 2800, easing: 'ease-in-out' }); // ~0.4s up, ~2s peek, ~0.4s down
  // not clicked while peeking: it goes and stands on the A vs B box instead
  // (a click cancels this animation, so this only runs when it was ignored)
  catAnim.finished.then(() => { peekCat.hidden = true; catAnim = null; catStandAppear(); }).catch(() => {});
}

mergeChk.addEventListener('change', () => {
  // one cat at a time on the A vs B box (peeks continue after it moved to the Guide)
  if(!catAnim && (catState !== 'home' || catStand.hidden) && Math.random() < CAT_CHANCE) catPeek();
});
// keep presses on the cat from panning the map underneath
peekCat.addEventListener('pointerdown', e => e.stopPropagation());
peekCat.addEventListener('click', () => {
  if(!catAnim) return;
  meow();
  const now = getComputedStyle(peekCat).transform; // duck away fast from wherever it is
  catAnim.cancel();
  catAnim = peekCat.animate([{ transform: now }, { transform: 'translateY(100%)' }], { duration: 180, easing: 'ease-in' });
  catAnim.finished.then(() => { peekCat.hidden = true; catAnim = null; }).catch(() => {});
});

// ---- Standing cat: on top of the A vs B box until clicked, then it runs off
//      the screen and runs in to its slot on top of the Guide intro card
//      (once that slot is on screen), where it stays: clicks = meow + hop ----
const catStand = document.getElementById('catStand');
const catPerch = document.getElementById('perchCat');
let catRunning = false;
let catState = 'home'; // 'home' (A vs B box) | 'toGuide' | 'guide'

function catStandAppear(){
  if(catState !== 'home') return; // it already lives on the Guide page
  catStand.hidden = false;
  // pops up onto the box with a little bounce
  catStand.animate(
    [{ transform: 'translateY(30px) scale(.6)', opacity: 0 }, { transform: 'translateY(-10px) scale(1.05)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }],
    { duration: 450, easing: 'ease-out' });
}

// short, high, surprised "mrrp!"
function mrrp(){
  quackCtx ??= new (window.AudioContext || window.webkitAudioContext)(); // shared with the duck
  const ctx = quackCtx, t = ctx.currentTime;
  const osc = ctx.createOscillator(), mouth = ctx.createBiquadFilter(), amp = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(700, t);
  osc.frequency.exponentialRampToValueAtTime(1150, t + 0.12);
  mouth.type = 'bandpass'; mouth.Q.value = 3;
  mouth.frequency.setValueAtTime(1400, t);
  mouth.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(mouth).connect(amp).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.2);
}

// little bouncy run frames: from x offset `from` to `to` (px), optional startled hop first
function catRunFrames(from, to, startle){
  const frames = startle
    ? [{ transform: `translate(${from}px, 0)`, offset: 0 }, { transform: `translate(${from}px, -26px)`, offset: 0.15 }, { transform: `translate(${from}px, 0)`, offset: 0.25 }]
    : [{ transform: `translate(${from}px, 0)`, offset: 0 }];
  const start = startle ? 0.25 : 0, STEPS = 8;
  for(let i = 1; i <= STEPS; i++){
    const t = i / STEPS;
    const hop = i % 2 && i < STEPS ? -12 : 0; // little bounces while running, lands flat
    frames.push({ transform: `translate(${from + (to - from) * t}px, ${hop}px)`, offset: start + (1 - start) * t });
  }
  return frames;
}

catStand.addEventListener('click', () => {
  if(catRunning) return;
  if(catState === 'guide'){ // on its Guide perch it stays: meow + hop
    meow();
    catStand.animate([{ transform: 'none' }, { transform: 'translateY(-16px)', offset: 0.4 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    return;
  }
  catRunning = true;
  mrrp();
  const box = catStand.getBoundingClientRect();
  // lift onto the screen (position:fixed in <body>) so it can run past the box
  // and off the screen edge without being clipped or moved by page scroll
  document.body.appendChild(catStand);
  Object.assign(catStand.style, {
    position: 'fixed', left: box.left + 'px', top: box.top + 'px', right: 'auto', bottom: 'auto', zIndex: '950',
  });
  // run off the nearest screen edge: startled hop, then a bouncy dash
  const toRight = box.left + box.width / 2 > window.innerWidth / 2;
  const distance = toRight ? window.innerWidth - box.left + 20 : -(box.right + 20);
  catStand.animate(catRunFrames(0, distance, true), { duration: 1100, easing: 'linear', fill: 'forwards' }).finished.then(() => {
    catStand.getAnimations().forEach(an => an.cancel());
    catStand.removeAttribute('style');
    catStand.hidden = true;
    // next stop: its slot on the Guide intro card, once that's on screen
    catPerch.appendChild(catStand);
    catStand.classList.add('in-slot');
    catState = 'toGuide';
    catRunning = false;
    catPerchObserver.observe(catPerch);
  });
});

// Run in to the Guide slot from the nearest screen edge, then stand there
const catPerchObserver = new IntersectionObserver(entries => {
  if(catState !== 'toGuide' || !entries.some(e => e.isIntersecting)) return;
  catPerchObserver.disconnect();
  catState = 'guide';
  catRunning = true;
  catStand.hidden = false;
  catStand.style.visibility = 'hidden';
  const box = catStand.getBoundingClientRect(); // its standing spot in the slot
  document.body.appendChild(catStand);
  catStand.classList.remove('in-slot');
  Object.assign(catStand.style, {
    position: 'fixed', left: box.left + 'px', top: box.top + 'px', right: 'auto', bottom: 'auto', zIndex: '950', visibility: '',
  });
  const fromRight = box.left + box.width / 2 > window.innerWidth / 2;
  const from = fromRight ? window.innerWidth - box.left + 20 : -(box.right + 20); // start just off that edge
  catStand.animate(catRunFrames(from, 0, false), { duration: 1000, easing: 'linear', fill: 'forwards' }).finished.then(() => {
    catStand.getAnimations().forEach(an => an.cancel());
    catStand.removeAttribute('style');
    catPerch.appendChild(catStand);
    catStand.classList.add('in-slot');
    meow(); // "I live here now"
    catRunning = false;
  });
}, { threshold: 0.6 });

/* ===================== WHALE (just for fun) =====================
   Click the VS badge (split view): the whale leaps out of the bottom of one map
   (random: A or B) with a splash and whoosh, flips over the badge, splashes
   down at the bottom of the other map and dives. Positions come from the maps' on-screen boxes. */
const whale = document.getElementById('whale');
const compareWrap = document.getElementById('compareWrap');
let whaleJumping = false;

// Short burst of filtered noise: a whoosh (band-pass sweep) or a splash (low-pass hit)
function whaleSound(kind, volume = 1){ // volume: 1 = normal
  quackCtx ??= new (window.AudioContext || window.webkitAudioContext)(); // shared with the duck
  const ctx = quackCtx, t = ctx.currentTime;
  const len = kind === 'whoosh' ? 0.7 : 0.5;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  if(kind === 'whoosh'){
    filter.type = 'bandpass'; filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2500, t + len);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.35 * volume, t + len * 0.5);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  } else {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + len);
    amp.gain.setValueAtTime(0.7 * volume, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(t);
}

// splash at (x, y): in the maps' container, or on the screen (onScreen = viewport coords)
function whaleSplash(x, y, onScreen = false){
  const s = document.createElement('div');
  s.className = 'whale-splash';
  s.style.left = x + 'px'; s.style.top = y + 'px';
  if(onScreen){ s.style.position = 'fixed'; s.style.zIndex = '960'; document.body.appendChild(s); }
  else compareWrap.appendChild(s);
  s.addEventListener('animationend', () => s.remove(), { once: true });
}

// After 5 jumps it launches up off the screen instead of landing, then falls
// from the sky onto its slot on the Guide intro card (once that's on screen)
// and stays there: clicks = splash + hop. The VS badge does nothing after that.
const WHALE_LEAVE_AFTER = 5;
let whaleJumps = 0, whaleState = 'map'; // 'map' | 'toGuide' | 'guide'
const whalePerch = document.getElementById('whalePerch');

document.getElementById('vsBadge').addEventListener('click', () => {
  if(whaleJumping || whaleState !== 'map') return;
  const leaving = ++whaleJumps >= WHALE_LEAVE_AFTER;
  const panels = compareWrap.querySelectorAll('.algo-panel .algo-canvas');
  if(panels.length < 2) return;
  whaleJumping = true;
  const wrap = compareWrap.getBoundingClientRect();
  const a = panels[0].getBoundingClientRect(), b = panels[1].getBoundingClientRect();
  const W = 96, H = 96;
  // centre points (relative to the maps' container), just inside each map's bottom edge
  const spot = r => ({ x: r.left + r.width / 2 - wrap.left, y: r.bottom - wrap.top - 34 });
  // random direction each click: map B -> map A, or map A -> map B
  const [start, end] = Math.random() < 0.5 ? [spot(b), spot(a)] : [spot(a), spot(b)];
  const goingRight = end.x > start.x;
  // the sprite faces right: mirror it when heading left, so it always faces where it's going
  const face = goingRight ? '' : ' scaleX(-1)';
  const peakY = Math.min(a.top, b.top) - wrap.top - 60; // arc ~60px above both maps' top edge
  const at = (p, extra = '') => `translate(${p.x - W / 2}px, ${p.y - H / 2}px)${extra}${face}`;

  whale.hidden = false;
  whaleSplash(start.x, start.y + 20);
  whaleSound('whoosh');

  // parabola from start to end through peakY, rising out of the water and fading in
  // (always plays in full, even with the OS "reduce motion" setting: click-only fun)
  const frames = [];
  const N = 24;
  for(let i = 0; i <= N; i++){
    const t = i / N;
    const x = start.x + (end.x - start.x) * t;
    const base = start.y + (end.y - start.y) * t;
    const y = base + (peakY - base) * 4 * t * (1 - t);
    // one full flip over the jump, rolling forward in its direction of travel
    // (counter-clockwise heading left, clockwise heading right)
    frames.push({ transform: at({ x, y }, ` rotate(${(goingRight ? 360 : -360) * t}deg)`), opacity: Math.min(1, t / 0.08), offset: t });
  }
  if(leaving){
    // 5th jump: rise to the top of the arc, then keep launching up off the
    // top of the screen, still spinning
    const rise = frames.slice(0, N / 2 + 1); // t 0..0.5: up to the top of the arc (offset 0.5)
    const peak = { x: start.x + (end.x - start.x) * 0.5, y: peakY };
    const gone = { x: peak.x + (end.x - start.x) * 0.25, y: -wrap.top - H * 1.5 }; // above the screen's top
    const spin = goingRight ? 360 : -360;
    rise.push({ transform: at(gone, ` rotate(${spin * 1.5}deg)`), opacity: 1, offset: 1 });
    whale.animate(rise, { duration: 1500, easing: 'linear', fill: 'forwards' }).finished.then(() => {
      whale.getAnimations().forEach(an => an.cancel());
      whale.hidden = true;
      whaleJumping = false;
      whaleState = 'toGuide';
      whaleGuideObserver.observe(document.getElementById('perchWhale'));
    });
    return;
  }
  whale.animate(frames, { duration: 1500, easing: 'linear', fill: 'forwards' }).finished
    .then(() => {
      whaleSplash(end.x, end.y + 20);
      whaleSound('splash', 0.35); // Map-page landing: quieter splash
      // dive: sink a little and fade into the water
      return whale.animate(
        [{ transform: at(end), opacity: 1 }, { transform: at({ x: end.x, y: end.y + 30 }), opacity: 0 }],
        { duration: 350, easing: 'ease-in', fill: 'forwards' }).finished;
    })
    .finally(() => {
      whale.getAnimations().forEach(an => an.cancel());
      whale.hidden = true;
      whaleJumping = false;
    });
});

// Falls from the sky onto its Guide slot with a flip and a splash, then stays
const whaleGuideObserver = new IntersectionObserver(entries => {
  if(whaleState !== 'toGuide' || !entries.some(e => e.isIntersecting)) return;
  whaleGuideObserver.disconnect();
  whaleState = 'guide';
  whalePerch.hidden = false;
  whalePerch.style.visibility = 'hidden';
  const box = whalePerch.getBoundingClientRect(); // its spot in the slot
  whalePerch.style.visibility = '';
  const drop = -(box.bottom + 40); // start just above the top of the screen
  whaleSound('whoosh');
  whalePerch.animate(
    [{ transform: `translateY(${drop}px) rotate(-360deg)` }, { transform: 'translateY(0) rotate(0deg)' }],
    { duration: 900, easing: 'cubic-bezier(.5,0,.9,.6)' }) // speeds up as it falls
    .finished.then(() => {
      whaleSplash(box.left + box.width / 2, box.bottom - 10, true);
      whaleSound('splash');
    });
}, { threshold: 0.6 });
whalePerch.addEventListener('click', () => { // on its Guide perch: splash + hop
  const box = whalePerch.getBoundingClientRect();
  whaleSplash(box.left + box.width / 2, box.bottom - 10, true);
  whaleSound('splash');
  whalePerch.animate([{ transform: 'none' }, { transform: 'translateY(-18px)', offset: 0.4 }, { transform: 'none' }], { duration: 360, easing: 'ease-out' });
});

/* ===================== CAPYBARA (just for fun) =====================
   Each Next / Previous press has a 1-in-10 chance to make the capybara rise
   out of the top edge of the map box. Click it: it crumbles into pixel dust
   that drifts away, then (once its Guide slot is on screen) the dust swirls
   in and rebuilds it there. On the Guide card each click crumbles and
   rebuilds it in place. The dust is the sprite's own 48x48 pixels, drawn on
   a full-screen canvas. */
const CAPY_CHANCE = 0.1;
const capyMap = document.getElementById('capy');
const capyGuide = document.getElementById('capyPerch');
let capyState = 'none'; // 'none' | 'map' | 'busy' | 'toGuide' | 'guide'

// the sprite's opaque pixels: [{ x, y, color }] in sprite pixels (0..47)
const capyPixels = (() => {
  const img = new Image();
  img.src = new URL('./assets/capy.png', import.meta.url).href;
  const list = [];
  img.decode().then(() => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    for(let y = 0; y < c.height; y++) for(let x = 0; x < c.width; x++){
      const i = (y * c.width + x) * 4;
      if(d[i + 3] > 20) list.push({ x, y, color: `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3] / 255})` });
    }
  }).catch(() => {});
  return list;
})();

// soft "poof" (crumble) or a little rising chime (rebuild)
function capySound(kind){
  quackCtx ??= new (window.AudioContext || window.webkitAudioContext)(); // shared with the duck
  const ctx = quackCtx, t = ctx.currentTime;
  if(kind === 'poof'){
    const len = 0.6;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), amp = ctx.createGain();
    src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 2500; amp.gain.value = 0.1; // quiet
    src.connect(hp).connect(amp).connect(ctx.destination);
    src.start(t);
  } else {
    [660, 880, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator(), amp = ctx.createGain(), at = t + i * 0.09;
      osc.type = 'triangle'; osc.frequency.value = f;
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(0.08, at + 0.01); // quiet
      amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      osc.connect(amp).connect(ctx.destination);
      osc.start(at); osc.stop(at + 0.3);
    });
  }
}

// Run the dust on a temporary full-screen canvas.
//  'crumble': from the sprite at `rect`, pixels peel off left to right and drift up-right, fading
//  'rebuild': the same played backwards: dust swirls in and settles into the sprite at `rect`
//  mirrored: build the sprite flipped left-right (the Guide capy faces the centre)
function capyDust(rect, mode, mirrored = false){
  return new Promise(resolve => {
    if(!capyPixels.length){ resolve(); return; } // sprite data not ready: skip the effect
    const canvas = document.createElement('canvas');
    canvas.className = 'capy-dust';
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    // the on-screen size must be set explicitly: a canvas doesn't stretch to inset:0,
    // so without this it shows at width*dpr CSS px and the dust looks enlarged
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    document.body.appendChild(canvas);
    const g = canvas.getContext('2d');
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
    function frame(now){
      const T = (now - t0) / DURATION;
      g.clearRect(0, 0, innerWidth, innerHeight);
      for(const q of parts){
        // each pixel's own progress 0..1 after its delay
        let k = Math.min(1, Math.max(0, (T - q.delay) / (1 - 0.55)));
        if(mode === 'rebuild') k = 1 - k; // backwards: dust -> sprite
        const e = k * k * (3 - 2 * k);    // smoothstep
        // swirl: curve sideways a little on the way
        const x = q.home.x + (q.away.x - q.home.x) * e + Math.sin(e * Math.PI) * q.spin * 6;
        const y = q.home.y + (q.away.y - q.home.y) * e;
        g.globalAlpha = 1 - e;
        g.fillStyle = q.color;
        const size = px * (1 - e * 0.5);
        g.fillRect(x, y, size + 0.25, size + 0.25); // tiny overlap: no hairline gaps between pixels
      }
      if(T < 1) requestAnimationFrame(frame);
      else { canvas.remove(); resolve(); }
    }
    requestAnimationFrame(frame);
  });
}

// Rise out of the map box's top edge (the clip hides the part still "underground")
function capySpawn(){
  capyState = 'map';
  capyMap.hidden = false;
  const H = 80, edge = 10; // the capy stands 10px down into the box's frame
  capyMap.animate([
    { transform: `translateY(${H - edge}px)`, clipPath: `inset(0 0 ${H - edge}px 0)` },
    { transform: 'translateY(-6px)', clipPath: 'inset(0 0 0 0)', offset: 0.8 },
    { transform: 'none', clipPath: 'inset(0 0 0 0)' },
  ], { duration: 700, easing: 'ease-out' });
}
['nextBtn', 'prevBtn'].forEach(id => document.getElementById(id).addEventListener('click', () => {
  if(capyState === 'none' && Math.random() < CAPY_CHANCE) capySpawn();
}));

// Map: crumble away, then wait for the Guide slot to come on screen
capyMap.addEventListener('click', () => {
  if(capyState !== 'map') return;
  capyState = 'busy';
  const rect = capyMap.querySelector('img').getBoundingClientRect();
  capySound('poof');
  capyMap.style.visibility = 'hidden';
  capyDust(rect, 'crumble').then(() => {
    capyMap.hidden = true;
    capyMap.style.visibility = '';
    capyState = 'toGuide';
    capyGuideObserver.observe(document.getElementById('perchCapy'));
  });
});
const capyGuideObserver = new IntersectionObserver(entries => {
  if(capyState !== 'toGuide' || !entries.some(e => e.isIntersecting)) return;
  capyGuideObserver.disconnect();
  capyRebuild();
}, { threshold: 0.6 });

// Rebuild on the Guide slot from dust
function capyRebuild(){
  capyState = 'busy';
  capyGuide.hidden = false;
  capyGuide.style.visibility = 'hidden';
  const rect = capyGuide.querySelector('img').getBoundingClientRect();
  capySound('chime');
  capyDust(rect, 'rebuild', true).then(() => { // assembles facing the centre (mirrored)
    capyGuide.style.visibility = '';
    capyState = 'guide';
  });
}
// Guide: each click crumbles it and rebuilds it in the same spot
capyGuide.addEventListener('click', () => {
  if(capyState !== 'guide') return;
  capyState = 'busy';
  const rect = capyGuide.querySelector('img').getBoundingClientRect();
  capySound('poof');
  capyGuide.style.visibility = 'hidden';
  capyDust(rect, 'crumble', true).then(() => setTimeout(capyRebuild, 250));
});

/* ===================== BIRD (just for fun) =====================
   Each Random click has a 1-in-10 chance to make the bird fly in (flapping)
   and perch on the route box, above the Random button. Click it: tweet, it
   flies off, and it lands on the Guide intro card once that card is on
   screen. There it stays: clicks just chirp + hop. */
const BIRD_CHANCE = 0.1;
// Two sprite sets, picked by the direction it flies (and kept when it lands)
// (bird.png / bird-fly.png face right; bird-right.png / bird-fly-right.png face left)
const BIRD_SPRITES = {
  left:  { stand: new URL('./assets/bird-right.png', import.meta.url).href,      // 48x48
           fly:   new URL('./assets/bird-fly-right.png', import.meta.url).href },// 48x48
  right: { stand: new URL('./assets/bird.png', import.meta.url).href,            // 48x48
           fly:   new URL('./assets/bird-fly.png', import.meta.url).href },      // 59x48
};
for(const set of Object.values(BIRD_SPRITES)) for(const src of Object.values(set)) new Image().src = src; // preload
let birdFacing = 'left';
const birdBtn = document.getElementById('bird');
const birdImg = birdBtn.querySelector('img');
const BIRD = 64; // on-screen size (px)
// 'none' | 'flying' | 'map' (perched on route box) | 'waitGuide' | 'guide' (perched on intro card)
let birdState = 'none';
const BIRD_PERCHES = {
  map:   { box: () => document.querySelector('.route-box'),  x: box => {
    const r = document.getElementById('randomBtn').getBoundingClientRect(); return r.left + r.width / 2; } },
  guide: { box: () => document.getElementById('perchBird'),   x: box => { // its slot on the Guide intro card
    const r = box.getBoundingClientRect(); return r.left + r.width / 2; } },
};

function birdSound(kind){
  quackCtx ??= new (window.AudioContext || window.webkitAudioContext)(); // shared with the duck
  const ctx = quackCtx, t = ctx.currentTime;
  if(kind === 'chirp'){
    // two quick rising "tweet"s
    for(const start of [0, 0.13]){
      const osc = ctx.createOscillator(), amp = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2300, t + start);
      osc.frequency.exponentialRampToValueAtTime(3800, t + start + 0.08);
      amp.gain.setValueAtTime(0.0001, t + start);
      amp.gain.exponentialRampToValueAtTime(0.3, t + start + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.09);
      osc.connect(amp).connect(ctx.destination);
      osc.start(t + start); osc.stop(t + start + 0.1);
    }
  } else {
    // one soft wing flap: a tiny burst of low-passed noise
    const len = 0.07;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), amp = ctx.createGain();
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 900; amp.gain.value = 0.25;
    src.connect(lp).connect(amp).connect(ctx.destination);
    src.start(t);
  }
}

// Fly the bird (position:fixed) from `from` to `to` (screen points = its feet),
// along a curve that rises above both, flapping (sprite swap + flap sound).
function birdFly(from, to, duration){
  birdBtn.classList.remove('bird-perched', 'in-slot');
  birdBtn.removeAttribute('style');
  document.body.appendChild(birdBtn);
  birdBtn.hidden = false;
  const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 90 };
  const frames = [];
  const N = 20;
  for(let i = 0; i <= N; i++){
    const t = i / N, u = 1 - t; // quadratic bezier
    const x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x;
    const y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y;
    frames.push({ transform: `translate(${x - BIRD / 2}px, ${y - BIRD}px)`, offset: t });
  }
  birdFacing = to.x >= from.x ? 'right' : 'left'; // face the way it's flying
  const sprites = BIRD_SPRITES[birdFacing];
  let up = true;
  birdImg.src = sprites.fly;
  const flap = setInterval(() => {
    up = !up;
    birdImg.src = up ? sprites.fly : sprites.stand;
    if(up) birdSound('flap');
  }, 120);
  return birdBtn.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' }).finished
    .finally(() => { clearInterval(flap); birdImg.src = sprites.fly; });
}

// A point off the top of the screen, to the left or right of `near`
const birdOffscreen = near => ({ x: near.x + (Math.random() < 0.5 ? -1 : 1) * window.innerWidth * 0.6, y: -40 });

function birdFlyIn(where){
  birdState = 'flying';
  const perch = BIRD_PERCHES[where], box = perch.box();
  const boxRect = box.getBoundingClientRect();
  // feet on the route box's top edge, or at the bottom of its Guide slot
  const feet = { x: perch.x(box), y: where === 'guide' ? boxRect.bottom : boxRect.top + 10 };
  birdFly(birdOffscreen(feet), feet, 1400).then(() => {
    // land: sit inside the box so it scrolls with the page
    birdBtn.getAnimations().forEach(an => an.cancel());
    birdBtn.removeAttribute('style');
    box.appendChild(birdBtn);
    if(where === 'guide') birdBtn.classList.add('in-slot'); // stands in its slot
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
  });
}

function birdFlyAway(thenToGuide){
  birdState = 'flying';
  const r = birdBtn.getBoundingClientRect();
  const feet = { x: r.left + r.width / 2, y: r.bottom };
  birdFly(feet, birdOffscreen(feet), 1100).then(() => {
    birdBtn.getAnimations().forEach(an => an.cancel());
    birdBtn.hidden = true;
    if(thenToGuide){ birdState = 'waitGuide'; birdGuideObserver.observe(document.getElementById('perchBird')); }
    else birdState = 'none';
  });
}

// Land on the Guide intro card once it's on screen (Guide tab open + scrolled to)
const birdGuideObserver = new IntersectionObserver(entries => {
  if(birdState === 'waitGuide' && entries.some(e => e.isIntersecting)){
    birdGuideObserver.disconnect();
    birdFlyIn('guide');
  }
}, { threshold: 0.6 });

document.getElementById('randomBtn').addEventListener('click', () => {
  if(birdState === 'none' && Math.random() < BIRD_CHANCE) birdFlyIn('map');
});
birdBtn.addEventListener('click', () => {
  if(birdState === 'guide'){ // on its Guide perch it stays: chirp + little hop
    birdSound('chirp');
    birdBtn.animate([{ transform: 'none' }, { transform: 'translateY(-14px)', offset: 0.4 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    return;
  }
  if(birdState !== 'map') return;
  birdSound('chirp');
  birdFlyAway(true); // from the Map: off to the Guide
});

/* ===================== TABS (Map | Guide) ===================== */
const tabs = [
  { btn: document.getElementById('tabBtnMap'), panel: document.getElementById('tabMap') },
  { btn: document.getElementById('tabBtnGuide'), panel: document.getElementById('tabGuide') },
];
for(const tab of tabs){
  tab.btn.addEventListener('click', () => {
    for(const t of tabs){
      const on = t === tab;
      t.btn.classList.toggle('active', on);
      t.btn.setAttribute('aria-selected', String(on));
      t.panel.hidden = !on;
    }
  });
}

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
