// ponytail: static markup — wired in stage 3

export default function GameMap() {
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
          {/* merged map only (script.js hides these when Merge is off) */}
          <span className="legend-merged"><span className="dot dot-split" aria-hidden="true"></span>Left A / right B</span>
          <span className="legend-merged"><span className="road-dash" aria-hidden="true"></span>Lane B road</span>
        </div>
      </div>

      {/* Duck (just for fun): merged view only (CSS); click = quack (script.js).
          After 10 clicks it rolls off to the Guide intro card and stays there. */}
      <div className="duck-home" id="duckHomeMap">
        <button className="duck-btn" id="duckBtn" type="button" aria-label="Quack" title="Quack"><img src="/assets/duck.png" alt="" /></button>
      </div>
    </div>
  )
}
