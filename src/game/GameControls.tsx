// Wired in stage 3: options come from the engine registries, values/handlers
// from useGameState. Ids and structure mirror the source exactly (script.js
// queried them); the port keeps them for landmark-picking and tests.
import { Fragment } from 'react'
import { ALGORITHMS, type AlgoMeta } from '@/search'
import { CITIES, type NodeId } from '@/romania'
import { ALGO_OPTIONS, LM_SHORT, type Lane, type LaneState } from '@/game/useGameState'
import GameSelect from '@/game/GameSelect'

type Props = {
  start: NodeId
  goal: NodeId
  algoA: string
  algoB: string
  laneA: LaneState
  laneB: LaneState
  showLine: boolean
  showHeat: boolean
  showDistances: boolean
  merged: boolean
  pickLandmarks: boolean
  onStart: (v: NodeId) => void
  onGoal: (v: NodeId) => void
  onAlgo: (lane: Lane, v: string) => void
  onLandmark: (lane: Lane, v: string) => void
  onRandom: () => void
  onTogglePick: () => void
  onShowLine: (v: boolean) => void
  onShowHeat: (v: boolean) => void
  onShowDistances: (v: boolean) => void
  onMerged: (v: boolean) => void
}

// makeLandmarkControl().render() — options for a lane's landmark dropdown
function landmarkOptions(meta: AlgoMeta, l: LaneState): [string, string][] {
  const active = meta.usesLandmarks || l.overlay
  const options: [string, string][] = []
  if (!meta.usesLandmarks) options.push(['off', 'Off'])
  if (active && l.custom.length > 0) options.push(['custom', 'Custom (' + l.custom.length + ')'])
  for (const k of Object.keys(LM_SHORT) as (keyof typeof LM_SHORT)[]) options.push([k, LM_SHORT[k]])
  return options
}

function landmarkValue(meta: AlgoMeta, l: LaneState): string {
  const active = meta.usesLandmarks || l.overlay
  if (!active) return 'off'
  return l.custom.length > 0 ? 'custom' : l.count
}

const CITY_OPTIONS: [string, string][] = CITIES.map((c) => [c, c])
const ALGO_SELECT_OPTIONS: [string, string][] = ALGO_OPTIONS.map(([key, meta]) => [key, meta.label])

export default function GameControls(props: Props) {
  const metaA = ALGORITHMS[props.algoA]
  const metaB = ALGORITHMS[props.algoB]
  const lanes: Lane[] = ['A', 'B']
  const laneState: Record<Lane, LaneState> = { A: props.laneA, B: props.laneB }
  const laneMeta: Record<Lane, AlgoMeta> = { A: metaA, B: metaB }
  const laneAlgo: Record<Lane, string> = { A: props.algoA, B: props.algoB }

  return (
    <>
      <div className="top-row">
        <div className="section control-row route-box" role="group" aria-label="Route selection">
          <GameSelect
            id="fromSelect"
            className="city-select"
            ariaLabel="Start city"
            value={props.start}
            options={CITY_OPTIONS}
            onChange={(v) => props.onStart(v as NodeId)}
          />
          <span className="route-arrow" aria-hidden="true">&#8594;</span>
          <GameSelect
            id="toSelect"
            className="city-select"
            ariaLabel="Goal city"
            value={props.goal}
            options={CITY_OPTIONS}
            onChange={(v) => props.onGoal(v as NodeId)}
          />
          <button className="icon-btn" id="randomBtn" title="Random From/To" type="button" onClick={props.onRandom}>&#127922;</button>
        </div>

        <div className="section control-row algo-box" role="group" aria-label="Algorithm selection">
          {/* Standing cat (just for fun): appears on top of this box when the peeking cat
              goes unclicked; click = startled meow and it runs off (script.js) */}
          <button className="cat-stand" id="catStand" type="button" aria-label="Cat" title="Meow" hidden><img src="/assets/cat.png" alt="" /></button>
          {lanes.map((lane) => (
            <Fragment key={lane}>
              {lane === 'B' && <span className="divider-vs">VS</span>}
              <div className="lane-pill">
                <img className="lane-sign" src={`/assets/NavigationBar/${lane} sign.png`} alt={lane} />
              <GameSelect
                id={`algo${lane}Select`}
                className="algo-select"
                ariaLabel={`Algorithm for lane ${lane}`}
                value={laneAlgo[lane]}
                options={ALGO_SELECT_OPTIONS}
                onChange={(v) => props.onAlgo(lane, v)}
              />
              {/* Landmark dropdown: 2/4/8 for algorithms that need landmarks; Off/2/4/8 (visual overlay only)
                  for the others; "Custom (n)" appears while map-picked landmarks are active. */}
              <div className="landmark-control" id={`landmarkControl${lane}`}>
                <GameSelect
                  className="landmark-dropdown"
                  id={`landmarkDropdown${lane}`}
                  ariaLabel={`Landmarks for lane ${lane}`}
                  value={landmarkValue(laneMeta[lane], laneState[lane])}
                  title={
                    laneMeta[lane].usesLandmarks
                      ? 'Number of landmarks this algorithm uses'
                      : 'Optional landmark overlay (visual only, algorithm unchanged)'
                  }
                  options={landmarkOptions(laneMeta[lane], laneState[lane])}
                  onChange={(v) => props.onLandmark(lane, v)}
                />
                <span className="lm-label" aria-hidden="true">LM</span>
              </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Overlay toggles are checkboxes styled as buttons. */}
      <div className="section tools-bar" role="toolbar" aria-label="Tools">
        <label className="tool-toggle"><input type="checkbox" id="straightLineChk" checked={props.showLine} onChange={(e) => props.onShowLine(e.target.checked)} /><img src="/assets/icon-straightline.png" className="overlay-icon" alt="" />Straight Line</label>
        <label className="tool-toggle" title="ALT h-value per city: red = near goal, blue = far"><input type="checkbox" id="heatmapChk" checked={props.showHeat} onChange={(e) => props.onShowHeat(e.target.checked)} /><img src="/assets/icon-heatmap.png" className="overlay-icon" alt="" />Heatmap</label>
        <label className="tool-toggle" title="Road distance (km) on every road"><input type="checkbox" id="distanceChk" checked={props.showDistances} onChange={(e) => props.onShowDistances(e.target.checked)} />Distances</label>
        <label className="tool-toggle" title="On: one merged map. Off: map A and map B side by side"><input type="checkbox" id="mergeChk" checked={props.merged} onChange={(e) => props.onMerged(e.target.checked)} />Merge</label>
        <span className="tools-sep" aria-hidden="true"></span>
        <button
          className={`tool-toggle${props.pickLandmarks ? ' active' : ''}`}
          id="toolToggle"
          title="Click nodes on the map to add/remove that map's custom landmarks"
          type="button"
          onClick={props.onTogglePick}
        >
          Landmarks: {props.pickLandmarks ? 'ON' : 'OFF'}
        </button>
      </div>
    </>
  )
}
