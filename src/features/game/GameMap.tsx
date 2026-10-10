// ponytail: static markup — wired in stage 3
import type { ReactNode } from 'react'

export default function GameMap({ playback, children, showHeat = false }: { playback?: ReactNode; children?: ReactNode; showHeat?: boolean }) {
  return (
    <div className="map-row">
      <div className="section map-panel">
        {/* Capybara (just for fun): 1-in-10 chance on each Next/Previous press to rise out of
            the top of this box; click = it turns to dust and rebuilds on the Guide card (script.js) */}
        <button className="capy" id="capy" type="button" aria-label="Capybara" title="Poof" hidden><img src="/assets/capy.png" alt="" /></button>
        {/* Merge on: "A name VS B name" in one line. Merge off: VS hidden, each
            lane's name sits right above its own map (CSS) */}
        <div className="map-panel-head">
          <span className="head-lane">
            <img className="lane-sign" src="/assets/NavigationBar/A sign.png" alt="A" />
            <strong id="algoALabel">UCS</strong>
          </span>
          <span className="divider-vs">VS</span>
          <span className="head-lane">
            <img className="lane-sign" src="/assets/NavigationBar/B sign.png" alt="B" />
            <strong id="algoBLabel">A* (LP+ALT)</strong>
          </span>
        </div>

        <div className="compare-wrap" id="compareWrap">
          <div className="algo-panel">
            <div className="algo-canvas">
              <div className="map-stage"><img src="/assets/island-map.png" alt="Island map - Algorithm A" className="map-img" draggable="false" /></div>
              <div className="map-hud">
                <span className="map-readout">X: 600, Y: 600, Scale: 1.0x</span>
                <button className="map-reset" title="Reset view" type="button">RESET</button>
              </div>
              <div className="heatmap-legend" aria-label="Heatmap scale" hidden={!showHeat}>
                <span className="heatmap-legend-label">Near</span>
                <span className="heatmap-legend-bar" aria-hidden="true" />
                <span className="heatmap-legend-label">Far</span>
              </div>
              <p className="map-hint">Drag to move map, and scroll/pinch to zoom in or out.</p>
              {/* Peeking cat (just for fun): 1-in-10 chance on each Merge toggle, peeks up from
                  the bottom edge of a visible map; click = meow (script.js moves/animates it) */}
              <button className="peek-cat" id="peekCat" type="button" aria-label="Cat" title="Meow" hidden><img src="/assets/cat.png" alt="" /></button>
            </div>
          </div>

          {/* VS badge between the two maps: shown only with Merge off (CSS).
              Click: a whale leaps out of one map and splashes down in the other, direction random (script.js) */}
          <button className="vs-badge" id="vsBadge" type="button" aria-label="VS (click for a whale)" title="Click me"><img src="/assets/vs-badge.png" alt="" /></button>
          <img className="whale" id="whale" src="/assets/whale.png" alt="" aria-hidden="true" hidden />

          {/* Map B: hidden while Merge is on (lane B draws on map A); shown side by side when off */}
          <div className="algo-panel algo-panel-hidden">
            <div className="algo-canvas">
              <div className="map-stage"><img src="/assets/island-map.png" alt="Island map - Algorithm B" className="map-img" draggable="false" /></div>
              <div className="map-hud">
                <span className="map-readout">X: 600, Y: 600, Scale: 1.0x</span>
                <button className="map-reset" title="Reset view" type="button">RESET</button>
              </div>
              <div className="heatmap-legend" aria-label="Heatmap scale" hidden={!showHeat}>
                <span className="heatmap-legend-label">Near</span>
                <span className="heatmap-legend-bar" aria-hidden="true" />
                <span className="heatmap-legend-label">Far</span>
              </div>
              <p className="map-hint">Drag to move map, and scroll/pinch to zoom in or out.</p>
            </div>
          </div>
        </div>

        {/* colours come from the --state-* tokens, shared with the map node markers */}
        <div className="legend-bar" aria-label="Legend">
          <span><span className="dot" style={{ background: 'var(--state-current)' }}></span>Current</span>
          <span><span className="dot" style={{ background: 'var(--state-frontier)' }}></span>Frontier</span>
          <span><span className="dot" style={{ background: 'var(--state-visited)' }}></span>Visited</span>
          <span><span className="dot" style={{ background: 'var(--state-path)' }}></span>Path</span>
          <span><span className="dot" style={{ background: 'var(--state-unvisited)' }}></span>Unvisited</span>
          <span><span className="dot dot-hollow" style={{ borderColor: 'var(--marker-start)' }}></span>Start</span>
          <span><span className="dot dot-hollow" style={{ borderColor: 'var(--marker-goal)' }}></span>Goal</span>
          <span><span className="dot dot-landmark" style={{ borderColor: 'var(--marker-landmark)' }}></span>Landmark</span>
          {/* merged map only (script.js hides these when Merge is off) */}
          <span className="legend-merged"><span className="dot dot-split" aria-hidden="true"></span>Left A / right B</span>
          <span className="legend-merged"><svg className="road-dash" viewBox="0 0 24 10" aria-hidden="true"><line x1="3" y1="3" x2="21" y2="3" stroke="var(--road-tree)" strokeWidth="3" strokeLinecap="round" /><line x1="3" y1="7" x2="21" y2="7" stroke="var(--road-path)" strokeWidth="3" strokeLinecap="round" /></svg>Roads: explored / route</span>
        </div>
        {/* playback bar lives inside the map panel (source nesting, index.html 163) */}
        {playback}
      </div>

      {/* the stats sidebar (aside) is a sibling of .map-panel inside .map-row */}
      {children}
    </div>
  )
}
