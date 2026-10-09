// ponytail: static markup — wired in stage 3

export default function GamePlayback() {
  return (
    <div className="playback-bar" role="group" aria-label="Playback">
      <div className="playback-row">
        <button id="restartBtn" title="Restart" type="button"></button>
        <button id="prevBtn" title="Previous" type="button">&#9664;&#9664;</button>
        <button id="playBtn" title="Start" type="button">&#9654;</button>
        <button id="nextBtn" title="Next" type="button">&#9654;&#9654;</button>
      </div>
      <div className="speed-row">
        <span className="speed-end">Slow<br /><small>1500ms</small></span>
        <div className="speed-track">
          {/* value = speed (right = faster); script.js converts it to a step delay */}
          {/* pixel-art slider: Unfill.png track, Fill.png up to the handle (--frac set by script.js), Handle.png thumb */}
          <div className="pixel-slider" id="speedSliderWrap">
            <div className="ps-fill" aria-hidden="true"></div>
            <input type="range" id="speedSlider" min="0" max="1500" defaultValue={900} aria-label="Step delay" />
          </div>
          <span className="speed-value" id="speedValue" aria-hidden="true">600ms</span>
          {/* current step delay, set by script.js */}
        </div>
        <span className="speed-end">Fast<br /><small>0ms</small></span>
      </div>
    </div>
  )
}
