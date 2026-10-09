// ponytail: static markup — wired in stage 3

export default function GameControls() {
  return (
    <>
      <div className="top-row">
        <div className="section control-row route-box" role="group" aria-label="Route selection">
          <span className="select-wrap">
            <select id="fromSelect" className="city-select" aria-label="Start city"></select>
          </span>
          {/* options filled from the engine's CITIES */}
          <span className="route-arrow" aria-hidden="true">&#8594;</span>
          <span className="select-wrap">
            <select id="toSelect" className="city-select" aria-label="Goal city"></select>
          </span>
          <button className="icon-btn" id="randomBtn" title="Random From/To" type="button">&#127922;</button>
        </div>

        <div className="section control-row algo-box" role="group" aria-label="Algorithm selection">
          {/* Standing cat (just for fun): appears on top of this box when the peeking cat
              goes unclicked; click = startled meow and it runs off (script.js) */}
          <button className="cat-stand" id="catStand" type="button" aria-label="Cat" title="Meow" hidden><img src="/assets/cat.png" alt="" /></button>
          <div className="lane-pill">
            <img className="lane-sign" src="/assets/NavigationBar/A sign.png" alt="A" />
            <span className="select-wrap">
              <select id="algoASelect" className="algo-select" aria-label="Algorithm for lane A"></select>
            </span>
            {/* options filled from the engine's ALGORITHMS */}
            {/* Landmark dropdown: 2/4/8 for algorithms that need landmarks; Off/2/4/8 (visual overlay only)
                for the others; "Custom (n)" appears while map-picked landmarks are active. Options set by script.js */}
            <div className="landmark-control" id="landmarkControlA">
              <span className="select-wrap">
                <select className="landmark-dropdown" id="landmarkDropdownA" aria-label="Landmarks for lane A"></select>
              </span>
              <span className="lm-label" aria-hidden="true">LM</span>
            </div>
          </div>

          <span className="divider-vs">VS</span>

          <div className="lane-pill">
            <img className="lane-sign" src="/assets/NavigationBar/B sign.png" alt="B" />
            <span className="select-wrap">
              <select id="algoBSelect" className="algo-select" aria-label="Algorithm for lane B"></select>
            </span>
            {/* options filled from the engine's ALGORITHMS */}
            {/* Landmark dropdown: 2/4/8 for algorithms that need landmarks; Off/2/4/8 (visual overlay only)
                for the others; "Custom (n)" appears while map-picked landmarks are active. Options set by script.js */}
            <div className="landmark-control" id="landmarkControlB">
              <span className="select-wrap">
                <select className="landmark-dropdown" id="landmarkDropdownB" aria-label="Landmarks for lane B"></select>
              </span>
              <span className="lm-label" aria-hidden="true">LM</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay toggles are checkboxes styled as buttons (ids unchanged for script.js). */}
      <div className="section tools-bar" role="toolbar" aria-label="Tools">
        <label className="tool-toggle"><input type="checkbox" id="straightLineChk" /><img src="/assets/icon-straightline.png" className="overlay-icon" alt="" />Straight Line</label>
        <label className="tool-toggle" title="ALT h-value per city: red = near goal, blue = far"><input type="checkbox" id="heatmapChk" /><img src="/assets/icon-heatmap.png" className="overlay-icon" alt="" />Heatmap</label>
        <label className="tool-toggle" title="Road distance (km) on every road"><input type="checkbox" id="distanceChk" defaultChecked />Distances</label>
        <label className="tool-toggle" title="On: one merged map. Off: map A and map B side by side"><input type="checkbox" id="mergeChk" defaultChecked />Merge</label>
        <span className="tools-sep" aria-hidden="true"></span>
        <button className="tool-toggle" id="toolToggle" title="Click nodes on the map to add/remove that map's custom landmarks" type="button">Landmarks: OFF</button>
      </div>
    </>
  )
}
