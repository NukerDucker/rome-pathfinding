// ponytail: static markup — wired in stage 4
import type { CSSProperties } from 'react'
import { Tex } from '@/components/Tex'
import { Figure } from '@/components/guide/Figure'
import { GuideNav } from '@/components/guide/GuideNav'
import { GuideSection } from '@/components/guide/GuideSection'

export default function GameGuide() {
  return (
    <article className="guide-page guide-body" aria-label="How the search works">
      <header className="section guide-intro">
        {/* Perches along the top of this card (just for fun), left to right. */}
        <div className="guide-perch duck-home" id="duckHomeGuide" style={{ '--slot': '8%' } as CSSProperties} />
        <div className="guide-perch" id="perchBread" style={{ '--slot': '22%' } as CSSProperties}>
          <button className="perch-bread" id="breadPerch" type="button" aria-label="Get bread" title="Get bread" hidden><img src="/assets/bread.png" alt="" /></button>
        </div>
        <div className="guide-perch" id="perchCat" style={{ '--slot': '34%' } as CSSProperties} />
        <div className="guide-perch" id="perchWhale" style={{ '--slot': '66%' } as CSSProperties}>
          <button className="perch-whale" id="whalePerch" type="button" aria-label="Whale" title="Splash" hidden><img src="/assets/whale.png" alt="" /></button>
        </div>
        <div className="guide-perch" id="perchCapy" style={{ '--slot': '80%' } as CSSProperties}>
          <button className="perch-capy" id="capyPerch" type="button" aria-label="Capybara" title="Poof" hidden><img src="/assets/capy.png" alt="" /></button>
        </div>
        <div className="guide-perch" id="perchBird" style={{ '--slot': '92%' } as CSSProperties} />
        <div className="guide-head">
          <span className="guide-eyebrow">Romania Pathfinding</span>
          <h2 className="guide-title">How the search works</h2>
        </div>
        <p className="guide-lede">
          Finding a cheapest route on this map is a <strong>search</strong>. We start with a
          method that knows nothing about the goal (<em>uninformed</em>), watch it waste effort,
          then upgrade it with a <em>heuristic</em>, and finally combine two heuristics into one.
          Every number below was measured on all 380 ordered city pairs.
        </p>
      </header>

      {/* two columns: sticky topic list box (left) | topic boxes (right) */}
      <div className="guide-layout">
        <GuideNav className="section" />

        <div className="guide-sections">

          {/* ── 1. UCS ── */}
          <GuideSection id="g-ucs" className="section">
            <p>
              Keep a <strong>frontier</strong> of nodes to explore. Always expand the node with the
              smallest known cost from the start, <Tex>{'g(n)'}</Tex>, the kilometres already driven.
              Because every road cost is non-negative, the cheapest frontier node can never be
              beaten later, so UCS is <strong>optimal</strong> and <strong>complete</strong>.
            </p>
            <p>
              The catch: the frontier grows as expanding <em>cost contours</em>, rings of equal
              <Tex>{'g'}</Tex>, that spread in <strong>every direction</strong>. UCS cannot look at the
              map and see where Bucharest is, so it explores west, north and south just as eagerly as
              east. Its work grows like <Tex>{'O(b^{1+\\lfloor C^*/\\varepsilon \\rfloor})'}</Tex>.
            </p>
            <div className="guide-note guide-try">
              <strong>Try it.</strong> Set lane <strong>A</strong> to <em>UCS</em>, run Arad → Bucharest,
              and press play. Watch the visited ring sweep outward on all sides before it finally
              reaches the goal.
            </div>
            <Figure src="/gifs/ucs-cost-rings.gif" alt="UCS cost contours spreading outward" caption="UCS expands in expanding cost rings, blind to the goal." spec="GIF-1" />
          </GuideSection>

          {/* ── 2. A* ── */}
          <GuideSection id="g-astar" className="section">
            <p>
              A★ keeps the same <Tex>{'g(n)'}</Tex> but adds a <strong>heuristic</strong>
              <Tex>{'h(n)'}</Tex>: our estimate of the remaining cost from <Tex>{'n'}</Tex> to the goal.
              It expands whatever node has the smallest
            </p>
            <div className="guide-eq"><Tex className="tex-display">{'f(n) = g(n) + h(n)'}</Tex></div>
            <p>
              The two parts do different jobs. <Tex>{'g'}</Tex> is <em>exact</em> and keeps the result
              optimal; <Tex>{'h'}</Tex> is a <em>guess</em> that steers the search toward the goal so it
              wastes less time on the wrong side of the map.
            </p>
            <p>
              The heuristic decides how good A★ is. With <Tex>{'h \\equiv 0'}</Tex> it degenerates back
              into UCS. With a perfect <Tex>{'h'}</Tex> it walks straight to the goal. Using <Tex>{'h'}</Tex>
              alone and no <Tex>{'g'}</Tex> gives greedy best-first: fast, but easily fooled into a
              non-optimal route.
            </p>
            <div className="guide-note">
              <strong>Key rule.</strong> If <Tex>{'h'}</Tex> never <em>overestimates</em> the true cost,
              A★ stays optimal. An optimistic heuristic only ever makes A★ try something that turns
              out slightly worse; it can never hide the best route.
            </div>
            <div className="guide-note guide-try">
              <strong>Try it.</strong> Set <strong>A</strong> = <em>A★ (LP+ALT)</em> and
              <strong>B</strong> = <em>UCS</em>. Compare <em>Visited</em> and <em>Generated</em> in the
              table: same optimal 418 km, far fewer nodes explored.
            </div>
            <Figure src="/gifs/astar-vs-ucs.gif" alt="A* reaching the goal while UCS spreads outward" caption="A★ uses h to head for the goal; UCS can't." spec="GIF-2" />
          </GuideSection>

          {/* ── 3. Heuristic ── */}
          <GuideSection id="g-heuristic" className="section">
            <p>
              A heuristic <Tex>{'h(n)'}</Tex> is a cheap estimate of the cost still to go, computed
              <em>without</em> solving the rest of the search. Two properties matter:
            </p>
            <ul>
              <li>
                <strong>Admissible</strong> (optimistic): <Tex>{'h(n) \\le h^{*}(n)'}</Tex>, the true
                cheapest cost to the goal. This is what guarantees A★ optimality.
              </li>
              <li>
                <strong>Consistent</strong> (monotonic):
                <Tex>{'h(n) \\le c(n,n\\prime) + h(n\\prime)'}</Tex> for every road
                <Tex>{'n \\to n\\prime'}</Tex>. Consistency implies admissibility, and it stops A★
                from ever reopening a node.
              </li>
            </ul>
            <p>
              Quality is about <strong>informedness</strong>. We say <Tex>{'h_2'}</Tex>
              <strong>dominates</strong> <Tex>{'h_1'}</Tex> when
              <Tex>{'h_2(n) \\ge h_1(n)'}</Tex> for every node. A dominating (and consistent)
              heuristic expands no more nodes; bigger guesses mean fewer surprises, as long as they
              stay under the truth.
            </p>
            <div className="guide-note">
              <strong>The twist for this assignment.</strong> The textbook heuristic is straight-line
              distance (SLD), but the rules ban SLD and GPS. So we build our own bounds from the
              <em>road kilometre values alone</em>. Two methods, then we combine them.
            </div>
            <Figure src="/gifs/admissible-consistent.gif" alt="h stays below the true distance; consistency across an edge" caption="Admissible = h never pokes above the true cost. Consistent = it can only rise by as much as a road costs." spec="GIF-3" />
          </GuideSection>

          {/* ── 4. LP ── */}
          <GuideSection id="g-lp" className="section">
            <p>
              Draw each road as a little arrow (a vector) whose length is its real kilometre value,
              laid out using the map's schematic pixel coordinates. To get from <Tex>{'a'}</Tex> to
              <Tex>{'b'}</Tex> you must cross the <strong>chord</strong> between them. A road route is a
              chain of these arrows, so its arrows must add up to that chord. The shortest any route
              can possibly be is therefore the cheapest combination of arrows that still adds up to
              the chord: a small <strong>linear program</strong>:
            </p>
            <div className="guide-eq"><Tex className="tex-display">{'h_{LP}(a,b) = \\min \\textstyle\\sum_i \\alpha_i\\, km_i \\;\\; \\text{s.t.} \\; \\textstyle\\sum_i \\alpha_i\\, \\vec{v}_i = \\vec{chord}_{ab},\\;\\; 0 \\le \\alpha_i \\le 1'}</Tex></div>
            <p>
              Why it is admissible: the LP <em>relaxes</em> the real problem; it allows fractional
              use of roads and ignores connectivity, so its optimum can only be
              <strong>lower</strong> than any actual route. A lower bound is exactly what we want.
              Two neighbouring cities come out exact (e.g. <Tex>{'h_{LP}(\\text{Arad},\\text{Sibiu}) = 140'}</Tex>).
              It is solved offline with scipy/HiGHS and read from a lookup table at runtime. No SLD,
              no GPS, only the PDF's metre/kilometre data.
            </p>
            <div className="guide-note guide-try">
              Measured alone, LP is a valid but <em>loose</em> bound: mean <Tex>{'h/\\text{road} \\approx 0.68'}</Tex>.
              Useful, but we can do better.
            </div>
            <Figure src="/gifs/lp-vector-decomposition.gif" alt="The chord decomposed into road vectors" caption="The chord a→b rewritten as a combination of road vectors; the LP prices that combination." spec="GIF-4" />
          </GuideSection>

          {/* ── 5. ALT ── */}
          <GuideSection id="g-alt" className="section">
            <p>
              Pick a few <strong>landmark</strong> cities <Tex>{'L'}</Tex>, far-flung corners of the map.
              Then precompute the true shortest road distance <Tex>{'d(L,n)'}</Tex> from each landmark to
              every node (one Dijkstra run per landmark). For any node <Tex>{'n'}</Tex> and goal:
            </p>
            <div className="guide-eq"><Tex className="tex-display">{'h_{ALT}(n, goal) = \\max_{L} \\;\\big|\\, d(L,n) - d(L, goal) \\,\\big|'}</Tex></div>
            <p>
              Forming a triangle over <Tex>{'n'}</Tex>, <Tex>{'L'}</Tex> and the goal, the{' '}
              <strong>triangle inequality</strong> gives two bounds. The first,{' '}
              <Tex>{'d(n, goal) \\le d(n,L) + d(L,goal)'}</Tex>, is an upper bound: it can exceed the
              true distance, so it is not admissible as a heuristic. The second,{' '}
              <Tex>{'d(n, goal) \\ge |d(n,L) - d(L,goal)|'}</Tex>, is a lower-bound term that never
              exceeds the true optimal distance. Because it is a lower bound, taking the largest value
              across landmarks gives the closest estimate to the true optimal distance that still never
              overshoots it. Every term is road kilometres, so the bound never leaves the map's own edge
              weights — nothing is measured off the page.
            </p>
            <p><strong>More landmarks, tighter bound.</strong> The app ships three presets:</p>
            <table className="guide-table">
              <thead><tr><th>Preset</th><th>Landmarks</th><th>h/road</th></tr></thead>
              <tbody>
                <tr><td>lm2</td><td>Eforie, Oradea</td><td>0.87</td></tr>
                <tr><td>lm4</td><td>+ Neamt, Giurgiu</td><td>0.97</td></tr>
                <tr><td>lm8</td><td>+ Timisoara, Vaslui, Drobeta, Hirsova</td><td>0.99</td></tr>
              </tbody>
            </table>
            <div className="guide-note">
              <strong>Backdoor.</strong> If a landmark <Tex>{'L'}</Tex> is a dead-end (degree 1) and the
              goal is its only neighbour, the bound becomes <em>exact</em>:
              <Tex>{'|d(L,n) - d(L,goal)| = d(n, goal)'}</Tex>. That is why, e.g., landmark Eforie
              gives a perfect estimate when the goal is Hirsova.
            </div>
            <Figure src="/gifs/alt-triangle-inequality.gif" alt="Triangle inequality via a landmark" caption="Any real route through the landmark is at least as long as the difference the landmark certifies." spec="GIF-5" />
            <Figure src="/gifs/alt-worked-example.gif" alt="A landmark's own route to the goal, with the two legs of the bound added up" caption="One landmark priced end to end: the shared node→goal path is 80 + 99 = 179 km, the bound this landmark contributes." spec="GIF-8" />
          </GuideSection>

          {/* ── 6. Ensemble ── */}
          <GuideSection id="g-ensemble" className="section">
            <p>
              We have two admissible bounds that come from <em>different evidence</em>. Combine them
              by taking whichever is larger:
            </p>
            <div className="guide-eq"><Tex className="tex-display">{'h(n, goal) = \\max\\big(\\, h_{LP}(n, goal),\\; h_{ALT}(n, goal)\\,\\big)'}</Tex></div>
            <p><strong>Why this works (three reasons):</strong></p>
            <ol>
              <li>
                <strong>Still admissible.</strong> Both inputs are <Tex>{'\\le'}</Tex> the true cost,
                so their maximum is too. A★ therefore stays optimal. (This is why you may only take a
                <Tex>{'\\max'}</Tex> when <em>every</em> component is admissible; one overestimating
                component would leak straight in.)
              </li>
              <li>
                <strong>Tighter than either alone.</strong> The max is
                <Tex>{'\\ge'}</Tex> both components at every node: it <em>dominates</em> each of them.
                By the dominance rule, A★ with the ensemble expands no more nodes than A★ with either
                bound by itself.
              </li>
              <li>
                <strong>Different failure modes.</strong> LP judges by geometry and distance; ALT
                judges by pure road metrics. Each is weak on different node pairs, so the max collects
                the stronger certificate wherever it exists: the best of both.
              </li>
            </ol>
            <div className="guide-note">
              <strong>Admissibility is all we need.</strong> Because both bounds stay at or below the
              true cost, the ensemble does too, and an admissible heuristic is exactly what makes
              A★ return an <em>optimal</em> route and, on this finite map, always terminate
              (<em>complete</em>). So the ensemble is correct by construction: it never depends on the
              two bounds agreeing, only on each one being optimistic.
            </div>
            <Figure src="/gifs/ensemble-max.gif" alt="Two lower bounds, the larger one wins" caption="Each bound certifies “the answer is at least this much”; the max keeps the strongest certificate." spec="GIF-6" />
          </GuideSection>

          {/* ── 7. Performance ── */}
          <GuideSection id="g-perf" className="section">
            <p>
              An independent evaluation re-ran everything over all 380 ordered city pairs with its
              own Dijkstra oracle and a standard A★. Two things matter:
              <strong>informedness</strong> (how close <Tex>{'h'}</Tex> sits to the truth, as mean
              <Tex>{'h/\\text{road}'}</Tex>) and <strong>expansions</strong> (work done).
            </p>
            <table className="guide-table">
              <thead><tr><th>Heuristic</th><th>h/road</th></tr></thead>
              <tbody>
                <tr><td>LP only</td><td>0.683</td></tr>
                <tr><td>ALT lm2</td><td>0.872</td></tr>
                <tr><td>ALT lm4</td><td>0.972</td></tr>
                <tr><td>ALT lm8</td><td>0.985</td></tr>
                <tr><td><strong>LP + ALT (lm8)</strong></td><td><strong>0.986</strong></td></tr>
              </tbody>
            </table>
            <table className="guide-table">
              <thead><tr><th>Search</th><th>expanded</th><th>generated</th></tr></thead>
              <tbody>
                <tr><td>UCS (h = 0)</td><td>4180</td><td>4971</td></tr>
                <tr><td>A★ · LP</td><td>2316</td><td>3558</td></tr>
                <tr><td>A★ · ALT lm2</td><td>2191</td><td>3419</td></tr>
                <tr><td>A★ · ALT lm4</td><td>1984</td><td>3335</td></tr>
                <tr><td>A★ · ALT lm8</td><td>1924</td><td>3310</td></tr>
                <tr><td><strong>A★ · LP+ALT</strong></td><td><strong>1922</strong></td><td><strong>3306</strong></td></tr>
              </tbody>
            </table>
            <p>
              <strong>Reading the numbers.</strong> Going from uninformed to informed is the big win
              UCS expands 4180 nodes across the pair set; A★ with the ensemble only 1922, roughly a
              55% cut, for the <em>same</em> optimal cost. Within informed search, tighter really is
              cheaper: the LM ladder (0.87 → 0.97 → 0.99) walks expansions down step by step.
            </p>
            <p>
              The ensemble sits at the bottom, but honestly <em>only just</em>: against ALT lm8 alone
              it adds +0.0005 informedness and saves 2 expansions, because on this map ALT lm8
              usually already dominates LP. Its real value is <strong>robustness</strong>: it is a
              bound from a second, independently-derived method, so admissibility never rests on the
              landmark choice. Zero admissibility violations and zero wrong optimal costs were
              measured for every variant.
            </p>
            <Figure src="/gifs/ensemble-performance.gif" alt="Bars: informedness and expansions across heuristics" caption="Informedness rises and expansions fall as the heuristic tightens; the ensemble tops it off." spec="GIF-7" />
          </GuideSection>

          {/* ── 8. Reading the maps (describes this app's controls) ── */}
          <GuideSection id="g-map" className="section">
            <p>
              <strong>Two lanes.</strong> Pick any two algorithms in the algorithm box, lane
              <strong>A</strong> and lane <strong>B</strong>, and run them on the same From → To route.
              The <em>Algorithm Comparison</em> cards beside the map show each lane's live and final
              numbers, and the better value of each pair is marked with a green chip.
            </p>
            <ul>
              <li><strong>Node colours:</strong> current · frontier · visited · path · unvisited, with start and goal rings (legend under the map).</li>
              <li><strong>Landmarks:</strong> each lane has a landmark dropdown. Algorithms that need landmarks choose 2 / 4 / 8; the others can pick Off / 2 / 4 / 8 to show landmarks on the map (visual only). Turn on the <em>Landmarks</em> tool and click cities to build a custom set; the dropdown then shows <em>Custom (n)</em>.</li>
              <li><strong>Distances:</strong> each road's length in km. A badge turns pink-purple when a lane has explored that road and orange-red when it is on the final route.</li>
              <li><strong>Heatmap:</strong> each city coloured by its lane's <Tex>{'h'}</Tex>-value: red near the goal, blue far away.</li>
              <li><strong>Straight Line:</strong> the SLD arc from start to goal that would be “cheating”; shown only for intuition, never fed to the heuristic.</li>
            </ul>
            <p>
              <strong>Merged map (default).</strong> With <em>Merge</em> on, both lanes share one map.
              Every city disc is split down the middle: the <strong>left half is lane A</strong>, the
              <strong>right half is lane B</strong>, each in the usual legend colours. Each road draws
              as <strong>two parallel strands</strong>, one per lane, nudged to either side of the
              centreline — so a road both lanes explored shows both colours side by side, and a road
              only one lane used shows a single strand. Turn <em>Merge</em> off to put
              map A and map B side by side, each showing only its own lane. With Merge on, a click with the
              Landmarks tool sets that city for both lanes; with Merge off, click on map A or map B to
              set it for that lane only.
            </p>
          </GuideSection>

          {/* ── 9. Complexity ── */}
          <GuideSection id="g-complexity" className="section">
            <p>
              Two costs, and they behave differently. <strong>Time</strong> is how many nodes the
              search expands before it settles the goal — one expansion per pop from the frontier.{' '}
              <strong>Space</strong> is everything it holds while doing that: the frontier, the closed
              set, and the accumulated cost of every node it has reached. On a 20-city graph both are
              small enough to watch, which is what makes lane A against lane B worth looking at.
            </p>
            <p>
              In the usual asymptotic form — <Tex>{'b'}</Tex> the branching factor, <Tex>{'d'}</Tex>{' '}
              the depth of the shallowest goal, <Tex>{'m'}</Tex> the maximum depth, <Tex>{'C^*'}</Tex>{' '}
              the optimal cost, <Tex>{'\\varepsilon'}</Tex> the smallest edge weight:
            </p>
            <table className="guide-table">
              <thead>
                <tr><th>Algorithm</th><th>Time</th><th>Space</th><th>Optimal</th><th>Complete</th></tr>
              </thead>
              <tbody>
                <tr><td>BFS</td><td><Tex>{'O(b^d)'}</Tex></td><td><Tex>{'O(b^d)'}</Tex></td><td>Yes*</td><td>Yes</td></tr>
                <tr><td>DFS</td><td><Tex>{'O(b^m)'}</Tex></td><td><Tex>{'O(bm)'}</Tex></td><td>No</td><td>No*</td></tr>
                <tr><td>UCS</td><td><Tex>{'O(b^{1+\\lfloor C^*/\\varepsilon \\rfloor})'}</Tex></td><td><Tex>{'O(b^{1+\\lfloor C^*/\\varepsilon \\rfloor})'}</Tex></td><td>Yes</td><td>Yes</td></tr>
                <tr><td>Greedy</td><td><Tex>{'O(b^m)'}</Tex></td><td><Tex>{'O(b^m)'}</Tex></td><td>No</td><td>No*</td></tr>
                <tr><td>A★ (LP)</td><td><Tex>{'O(b^d)'}</Tex></td><td><Tex>{'O(b^d)'}</Tex></td><td>Yes</td><td>Yes</td></tr>
                <tr><td>A★ (ALT only)</td><td><Tex>{'O(b^d)'}</Tex></td><td><Tex>{'O(b^d)'}</Tex></td><td>Yes</td><td>Yes</td></tr>
                <tr><td>A★ (LP+ALT)</td><td><Tex>{'O(b^d)'}</Tex></td><td><Tex>{'O(b^d)'}</Tex></td><td>Yes</td><td>Yes</td></tr>
                <tr><td>Bidirectional UCS</td><td><Tex>{'O(b^{1 + C/2\\varepsilon})'}</Tex></td><td><Tex>{'O(b^{1 + C/2\\varepsilon})'}</Tex></td><td>Yes</td><td>Yes</td></tr>
                <tr><td>Bidirectional A★ (LP+ALT)</td><td><Tex>{'O(b^{d/2})'}</Tex></td><td><Tex>{'O(b^{d/2})'}</Tex></td><td>Yes</td><td>Yes</td></tr>
              </tbody>
            </table>
            <div className="guide-note">
              <strong>Read the A★ rows carefully.</strong> The asymptotic class is the same{' '}
              <Tex>{'O(b^d)'}</Tex> as BFS, which makes the heuristic sound worthless on paper. It is
              not. Class says nothing about the exponent that actually bites: an admissible{' '}
              <Tex>{'h'}</Tex> that is close to the true distance makes the search expand a thin
              corridor toward the goal instead of a ball around the start. The class is unchanged; the
              constant and the effective depth are not. That gap is what section 7 measures.
            </div>
            <div className="guide-note">
              <strong>What the heuristic costs in space.</strong> ALT precomputes one Dijkstra
              distance table per landmark — <Tex>{'|L| \\times |V|'}</Tex> numbers, built once and
              reused for every query. That is the only place a heuristic buys time with memory here:
              eight landmarks cost eight tables, and in exchange <Tex>{'h'}</Tex>/road rises from 0.87
              to 0.99. The tables never change after precomputation, so they are pure overhead paid up
              front, not per expansion.
            </div>
          </GuideSection>

          <p className="guide-foot">
            Guide based on the implementation in <code>src/</code>. Measurements: see{' '}
            <code>eval/independent-eval.ts</code>, over all 380 ordered city pairs.
          </p>
        </div>
      </div>
    </article>
  )
}
