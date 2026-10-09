// The map stage: the split lane pair or the merged map, the node-state legend,
// the playback transport, and the stats sidebar slot.
import { type ReactNode } from 'react'
import { type NodeId } from '@/romania'
import { type AlgoMeta, type SearchResult } from '@/search'
import { PlanetWindow, type Theme } from '@/theme'
import { laneLandmarkCities, laneLmSuffix, type LandmarkCount } from './landmarks'
import { SVGMap, MergedSVGMap } from './svgMap'
import { PlaybackBar } from './PlaybackBar'

// One lane's live map data.
export type LaneStage = {
  side: 'a' | 'b'
  algo: string
  meta: AlgoMeta
  result: SearchResult
  lastIdx: number
  heatmap?: Record<NodeId, number>
  landmark: LandmarkCount
  custom: NodeId[]
  overlay: boolean
  currentCity: NodeId
  warp: number
  onCityClick: (city: NodeId) => void
}

type MapStageProps = {
  theme: Theme
  merged: boolean
  stepIdx: number
  hoveredCity: NodeId | null
  start: NodeId
  goal: NodeId
  showLine: boolean
  showHeatmap: boolean
  pickLandmarkMode: boolean
  laneA: LaneStage
  laneB: LaneStage
  onMergedCityClick: (city: NodeId) => void
  statsPanel: ReactNode
  playing: boolean
  delay: number
  onReset: () => void
  onBack: () => void
  onPlayPause: () => void
  onForward: () => void
  onDelay: (delay: number) => void
}

// The node-state colour key that sits under every map.
function Legend() {
  return (
    <ul className="legend" aria-label="Node state colors">
      <li><span className="swatch swatch-current" aria-hidden="true" />Current</li>
      <li><span className="swatch swatch-frontier" aria-hidden="true" />Frontier</li>
      <li><span className="swatch swatch-visited" aria-hidden="true" />Visited</li>
      <li><span className="swatch swatch-path" aria-hidden="true" />Path</li>
      <li><span className="swatch swatch-unvisited" aria-hidden="true" />Unvisited</li>
      <li><span className="swatch swatch-start-ring" aria-hidden="true" />Start</li>
      <li><span className="swatch swatch-goal-ring" aria-hidden="true" />Goal</li>
    </ul>
  )
}

function HeatmapKey({ visible }: { visible: boolean }) {
  return (
    <span className="heatmap-legend" aria-label="Heatmap scale"
      style={{ visibility: visible ? 'visible' : 'hidden' }}>
      <span className="heatmap-legend-label">Near</span>
      <span className="heatmap-legend-bar" aria-hidden="true" />
      <span className="heatmap-legend-label">Far</span>
    </span>
  )
}

export function MapStage(props: MapStageProps) {
  const {
    theme, merged, stepIdx, hoveredCity, start, goal, showLine, showHeatmap, pickLandmarkMode,
    laneA, laneB, onMergedCityClick, statsPanel, playing, delay,
    onReset, onBack, onPlayPause, onForward, onDelay,
  } = props
  const largerLastIdx = Math.max(laneA.lastIdx, laneB.lastIdx)

  const laneSection = (lane: LaneStage) => (
    <section className={`lane lane-${lane.side}`} aria-label={`Lane ${lane.side.toUpperCase()}`}>
      <div className="lane-header">
        <span className={`lane-badge lane-badge-${lane.side}`} aria-hidden="true">{lane.side.toUpperCase()}</span>
        <span className="lane-algo-name">{lane.meta.label}</span>
      </div>
      {theme === 'space' && <PlanetWindow variant={lane.side} city={lane.currentCity} nonce={lane.warp} />}
      <div className="map-wrap">
        <SVGMap
          algoKey={lane.algo} stepIdx={stepIdx} lastIdx={lane.lastIdx}
          result={lane.result} hoveredCity={hoveredCity} start={start} goal={goal} showLine={showLine}
          heatmapValues={lane.heatmap}
          landmarks={laneLandmarkCities(lane.meta.usesLandmarks, lane.overlay, lane.landmark, lane.custom)}
          onCityClick={lane.onCityClick} pickLandmarkMode={pickLandmarkMode}
          showMapBg={theme === 'dnd'}
          spaceTheme={theme === 'space'}
        />
        <HeatmapKey visible={showHeatmap} />
      </div>
      <div className="map-frame-bar">
        <Legend />
      </div>
    </section>
  )

  return (
    <div className="app-body">
      <div className={`lanes${merged ? ' lanes-merged' : ''}`}>
        {/* Lane A + B, shown when "Merge maps" is off */}
        <div className="lanes-container">
          {laneSection(laneA)}

          <div className="lane-vs" aria-hidden="true">vs</div>

          {laneSection(laneB)}
        </div>

        {/* Merged single-map view — shown only when “Merge maps” is toggled on */}
        <section className="lane lane-merged" aria-label="Merged map (lane A and B)">
          <div className="lane-header lane-header-merged">
            <span className="lane-badge lane-badge-a" aria-hidden="true">A</span>
            <span className="lane-algo-name">{laneA.meta.label}{laneLmSuffix(laneA.meta.usesLandmarks, laneA.landmark, laneA.custom)}</span>
            <span className="lane-vs-inline" aria-hidden="true">vs</span>
            <span className="lane-badge lane-badge-b" aria-hidden="true">B</span>
            <span className="lane-algo-name">{laneB.meta.label}{laneLmSuffix(laneB.meta.usesLandmarks, laneB.landmark, laneB.custom)}</span>
            <span className="merged-legend">
              <span className="ml-item"><span className="ml-swatch ml-a" aria-hidden="true" />{laneA.meta.label}{laneLmSuffix(laneA.meta.usesLandmarks, laneA.landmark, laneA.custom)}</span>
              <span className="ml-item"><span className="ml-swatch ml-b" aria-hidden="true" />{laneB.meta.label}{laneLmSuffix(laneB.meta.usesLandmarks, laneB.landmark, laneB.custom)}</span>
            </span>
          </div>
          {theme === 'space' && (
            <div className="planet-windows">
              <PlanetWindow variant="a" city={laneA.currentCity} nonce={laneA.warp} />
              <PlanetWindow variant="b" city={laneB.currentCity} nonce={laneB.warp} />
            </div>
          )}
          <div className="map-wrap">
            <MergedSVGMap
              stepIdx={stepIdx} lastIdx={laneA.lastIdx} lastIdx2={laneB.lastIdx}
              result={laneA.result} result2={laneB.result}
              hoveredCity={hoveredCity} start={start} goal={goal} showLine={showLine}
              heatA={laneA.heatmap} heatB={laneB.heatmap}
              landmarksA={laneLandmarkCities(laneA.meta.usesLandmarks, laneA.overlay, laneA.landmark, laneA.custom)}
              landmarksB={laneLandmarkCities(laneB.meta.usesLandmarks, laneB.overlay, laneB.landmark, laneB.custom)}
              onCityClick={onMergedCityClick} pickLandmarkMode={pickLandmarkMode}
              showMapBg={theme === 'dnd'}
              spaceTheme={theme === 'space'}
            />
            <HeatmapKey visible={showHeatmap} />
          </div>
          <div className="map-frame-bar">
            <Legend />
          </div>
        </section>

        {/* Playback sits in flow under the map, in both views. */}
        <div className="playback-bar">
          <PlaybackBar
            playing={playing} stepIdx={stepIdx} largerLastIdx={largerLastIdx} delay={delay}
            onReset={onReset} onBack={onBack} onPlayPause={onPlayPause}
            onForward={onForward} onDelay={onDelay}
          />
        </div>
      </div>

      <aside className="stats-panel" aria-label="Algorithm comparison">
        {statsPanel}
      </aside>
    </div>
  )
}
