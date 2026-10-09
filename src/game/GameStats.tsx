// ponytail: static markup — wired in stage 3

export default function GameStats() {
  return (
    <aside className="stats-sidebar section" aria-label="Algorithm comparison">
      {/* frame stays fixed; only this inner area scrolls when the cards are taller than the map */}
      <div className="stats-scroll">
        <h2 className="stats-title">Algorithm Comparison</h2>
        <p className="stats-route" id="routeLabel">Arad &#8594; Bucharest</p>

        <div className="stats-cols">
          <div className="stats-col">
            <div className="stats-head"><span id="rowA">A &middot; UCS</span></div>
            <div className="stats-card">
              <h4>Live</h4>
              <div className="stat-row"><span>Step</span><b id="fullStepA">0/0</b></div>
              <div className="stat-row"><span>Current</span><b id="fullCurA">-</b></div>
              <div className="stat-row"><span>Visited</span><b id="fullVisA">0</b></div>
              <div className="stat-row"><span>Frontier</span><b id="fullFroA">0</b></div>
            </div>
            <div className="stats-card">
              <h4>Result</h4>
              <div className="stat-row"><span>Generated</span><b id="fullGenA">0</b></div>
              <div className="stat-row"><span>Peak memory</span><b id="fullMemA">-</b></div>
              <div className="stat-row stat-row-wrap"><span>Path</span><b id="fullPathA">-</b></div>
              <div className="stat-row"><span>Cost</span><b id="fullCostA">-</b></div>
              <div className="stat-row"><span>Hops</span><b id="fullHopsA">-</b></div>
              <div className="stat-row"><span>Time (<span className="no-caps">&micro;s</span>)</span><b id="fullTimeA">-</b></div>
            </div>
            <div className="stats-card">
              <h4>Complexity</h4>
              <div className="stat-row stat-row-wrap"><span>T(n)</span><b id="fullTnA">O(b^d)</b></div>
              <div className="stat-row stat-row-wrap"><span>S(n)</span><b id="fullSnA">O(b^d)</b></div>
              <div className="stat-row"><span>Optimal</span><b id="fullOptA">Yes</b></div>
              <div className="stat-row"><span>Complete</span><b id="fullCompA">Yes</b></div>
            </div>
            <div className="stats-card">
              <h4>Landmarks</h4>
              <div className="stat-row"><span>2</span><b id="fullLM2A">-</b></div>
              <div className="stat-row"><span>4</span><b id="fullLM4A">-</b></div>
              <div className="stat-row"><span>8</span><b id="fullLM8A">-</b></div>
            </div>
          </div>

          <div className="stats-col">
            <div className="stats-head"><span id="rowB">B &middot; A* (LP+ALT)</span></div>
            <div className="stats-card">
              <h4>Live</h4>
              <div className="stat-row"><span>Step</span><b id="fullStepB">0/0</b></div>
              <div className="stat-row"><span>Current</span><b id="fullCurB">-</b></div>
              <div className="stat-row"><span>Visited</span><b id="fullVisB">0</b></div>
              <div className="stat-row"><span>Frontier</span><b id="fullFroB">0</b></div>
            </div>
            <div className="stats-card">
              <h4>Result</h4>
              <div className="stat-row"><span>Generated</span><b id="fullGenB">0</b></div>
              <div className="stat-row"><span>Peak memory</span><b id="fullMemB">-</b></div>
              <div className="stat-row stat-row-wrap"><span>Path</span><b id="fullPathB">-</b></div>
              <div className="stat-row"><span>Cost</span><b id="fullCostB">-</b></div>
              <div className="stat-row"><span>Hops</span><b id="fullHopsB">-</b></div>
              <div className="stat-row"><span>Time (<span className="no-caps">&micro;s</span>)</span><b id="fullTimeB">-</b></div>
            </div>
            <div className="stats-card">
              <h4>Complexity</h4>
              <div className="stat-row stat-row-wrap"><span>T(n)</span><b id="fullTnB">O(b^d)</b></div>
              <div className="stat-row stat-row-wrap"><span>S(n)</span><b id="fullSnB">O(b^d)</b></div>
              <div className="stat-row"><span>Optimal</span><b id="fullOptB">Yes</b></div>
              <div className="stat-row"><span>Complete</span><b id="fullCompB">Yes</b></div>
            </div>
            <div className="stats-card">
              <h4>Landmarks</h4>
              <div className="stat-row"><span>2</span><b id="fullLM2B">-</b></div>
              <div className="stat-row"><span>4</span><b id="fullLM4B">-</b></div>
              <div className="stat-row"><span>8</span><b id="fullLM8B">-</b></div>
            </div>
          </div>
        </div>

        <p className="stats-caption">Time = mean of 400 runs (&mu;s) &middot; Peak Memory = largest frontier &middot; Landmarks 2/4/8 = nodes generated per preset &middot; live step metrics compared at final frame.</p>
      </div>
    </aside>
  )
}
