import { useState } from 'react'
import { Tex } from './Tex'

// ── Left-hand guide ─────────────────────────────────────────────────────────
// A scrollable explainer that walks from Uniform-Cost Search, through A*, into
// the heuristic, how this app builds one (LP + ALT), why combining them works,
// and whether the combination actually performs better (measured, not asserted).
//
// Each animation lives in public/gifs/; if one fails to load the <Figure>
// placeholder falls back to a labelled "pending" box naming the missing asset.

function Figure({ src, alt, caption, spec }: { src: string; alt: string; caption: string; spec: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className="guide-figure">
      {failed ? (
        <div className="guide-figure-missing" aria-label={`${alt} (animation pending)`}>
          <span>
            {alt}
            <br />
            GIF pending · <code>{spec}</code>
          </span>
        </div>
      ) : (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

const NAV: { id: string; label: string }[] = [
  { id: 'g-ucs', label: '1 · Uniform-Cost Search' },
  { id: 'g-astar', label: '2 · A★: adding a guess' },
  { id: 'g-heuristic', label: '3 · What a heuristic is' },
  { id: 'g-lp', label: '4 · Our heuristic: LP (vector)' },
  { id: 'g-alt', label: '5 · Our heuristic: ALT (landmarks)' },
  { id: 'g-ensemble', label: '6 · The ensemble: max(LP, ALT)' },
  { id: 'g-perf', label: '7 · Does it perform better?' },
  { id: 'g-map', label: '8 · Reading the maps' },
]

export function Guide() {
  return (
    <article
      className="guide-page"
      aria-label="How the search works"
    >
      <div className="guide-head">
        <span className="guide-eyebrow">Romania Pathfinding</span>
        <span className="guide-title">How the search works</span>
      </div>

      <div className="guide-body">
        <p className="guide-lede">
          Finding a cheapest route on this map is a <strong>search</strong>. We start with a
          method that knows nothing about the goal (<em>uninformed</em>), watch it waste effort,
          then upgrade it with a <em>heuristic</em>, and finally combine two heuristics into one.
          Every number below was measured on all 380 ordered city pairs.
        </p>

        <nav className="guide-nav" aria-label="Contents">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`}>{n.label}</a>
          ))}
        </nav>

        <div className="guide-sections">

        {/* ── 1. UCS ─────────────────────────────────────────────────── */}
        <section className="guide-section" id="g-ucs">
          <h3>1 · Uniform-Cost Search (UCS)</h3>
          <p>
            Keep a <strong>frontier</strong> of nodes to explore. Always expand the node with the
            smallest known cost from the start, <Tex>g(n)</Tex>, the kilometres already driven.
            Because every road cost is non-negative, the cheapest frontier node can never be
            beaten later, so UCS is <strong>optimal</strong> and <strong>complete</strong>.
          </p>
          <p>
            The catch: the frontier grows as expanding <em>cost contours</em>, rings of equal{' '}
            <Tex>g</Tex>, that spread in <strong>every direction</strong>. UCS cannot look at the
            map and see where Bucharest is, so it explores west, north and south just as eagerly as
            east. Its work grows like <Tex>{'O(b^{1+\\lfloor C^*/\\varepsilon \\rfloor})'}</Tex>.
          </p>
          <div className="guide-note guide-try">
            <strong>Try it.</strong> Set lane <strong>A</strong> to <em>UCS</em>, run Arad → Bucharest,
            and press play. Watch the visited ring sweep outward on all sides before it finally
            reaches the goal.
          </div>
          <Figure
            src="/gifs/ucs-cost-rings.gif"
            alt="UCS cost contours spreading outward"
            caption="UCS expands in expanding cost rings, blind to the goal."
            spec="GIF-1"
          />
        </section>

        {/* ── 2. A* ──────────────────────────────────────────────────── */}
        <section className="guide-section" id="g-astar">
          <h3>2 · A★: adding a guess</h3>
          <p>
            A★ keeps the same <Tex>g(n)</Tex> but adds a <strong>heuristic</strong>{' '}
            <Tex>h(n)</Tex>: our estimate of the remaining cost from <Tex>n</Tex> to the goal.
            It expands whatever node has the smallest
          </p>
          <div className="guide-eq">
            <Tex>{'f(n) = g(n) + h(n)'}</Tex>
          </div>
          <p>
            The two parts do different jobs. <Tex>g</Tex> is <em>exact</em> and keeps the result
            optimal; <Tex>h</Tex> is a <em>guess</em> that steers the search toward the goal so it
            wastes less time on the wrong side of the map.
          </p>
          <p>
            The heuristic decides how good A★ is. With <Tex>h \equiv 0</Tex> it degenerates back
            into UCS. With a perfect <Tex>h</Tex> it walks straight to the goal. Using <Tex>h</Tex>{' '}
            alone and no <Tex>g</Tex> gives greedy best-first: fast, but easily fooled into a
            non-optimal route.
          </p>
          <div className="guide-note">
            <strong>Key rule.</strong> If <Tex>h</Tex> never <em>overestimates</em> the true cost,
            A★ stays optimal. An optimistic heuristic only ever makes A★ try something that turns
            out slightly worse; it can never hide the best route.
          </div>
          <div className="guide-note guide-try">
            <strong>Try it.</strong> Set <strong>A</strong> = <em>A★ (LP+ALT)</em> and{' '}
            <strong>B</strong> = <em>UCS</em>. Compare <em>Visited</em> and <em>Generated</em> in the
            table: same optimal 418 km, far fewer nodes explored.
          </div>
          <Figure
            src="/gifs/astar-vs-ucs.gif"
            alt="A* reaching the goal while UCS spreads outward"
            caption="A★ uses h to head for the goal; UCS can't."
            spec="GIF-2"
          />
        </section>

        {/* ── 3. Heuristic ───────────────────────────────────────────── */}
        <section className="guide-section" id="g-heuristic">
          <h3>3 · What a heuristic actually is</h3>
          <p>
            A heuristic <Tex>h(n)</Tex> is a cheap estimate of the cost still to go, computed
            <em> without</em> solving the rest of the search. Two properties matter:
          </p>
          <ul>
            <li>
              <strong>Admissible</strong> (optimistic): <Tex>{'h(n) \\le h^{*}(n)'}</Tex>, the true
              cheapest cost to the goal. This is what guarantees A★ optimality.
            </li>
            <li>
              <strong>Consistent</strong> (monotonic):{' '}
              <Tex>{'h(n) \\le c(n,n\\prime) + h(n\\prime)'}</Tex> for every road{' '}
              <Tex>{'n \\to n\\prime'}</Tex>. Consistency implies admissibility, and it stops A★
              from ever reopening a node.
            </li>
          </ul>
          <p>
            Quality is about <strong>informedness</strong>. We say <Tex>h_2</Tex>{' '}
            <strong>dominates</strong> <Tex>h_1</Tex> when{' '}
            <Tex>{'h_2(n) \\ge h_1(n)'}</Tex> for every node. A dominating (and consistent)
            heuristic expands no more nodes; bigger guesses mean fewer surprises, as long as they
            stay under the truth.
          </p>
          <div className="guide-note">
            <strong>The twist for this assignment.</strong> The textbook heuristic is straight-line
            distance (SLD), but the rules ban SLD and GPS. So we build our own bounds from the{' '}
            <em>road kilometre values alone</em>. Two methods, then we combine them.
          </div>
          <Figure
            src="/gifs/admissible-consistent.gif"
            alt="h stays below the true distance; consistency across an edge"
            caption="Admissible = h never pokes above the true cost. Consistent = it can only rise by as much as a road costs."
            spec="GIF-3"
          />
        </section>

        {/* ── 4. LP ──────────────────────────────────────────────────── */}
        <section className="guide-section" id="g-lp">
          <h3>4 · Our first bound: LP vector-decomposition</h3>
          <p>
            Draw each road as a little arrow (a vector) whose length is its real kilometre value,
            laid out using the map's schematic pixel coordinates. To get from <Tex>a</Tex> to{' '}
            <Tex>b</Tex> you must cross the <strong>chord</strong> between them. A road route is a
            chain of these arrows, so its arrows must add up to that chord. The shortest any route
            can possibly be is therefore the cheapest combination of arrows that still adds up to
            the chord: a small <strong>linear program</strong>:
          </p>
          <div className="guide-eq">
            <Tex>{'h_{LP}(a,b) = \\min \\textstyle\\sum_i \\alpha_i\\, km_i \\;\\; \\text{s.t.} \\; \\textstyle\\sum_i \\alpha_i\\, \\vec{v}_i = \\vec{chord}_{ab},\\;\\; 0 \\le \\alpha_i \\le 1'}</Tex>
          </div>
          <p>
            Why it is admissible: the LP <em>relaxes</em> the real problem; it allows fractional
            use of roads and ignores connectivity, so its optimum can only be{' '}
            <strong>lower</strong> than any actual route. A lower bound is exactly what we want.
            Two neighbouring cities come out exact (e.g. <Tex>{'h_{LP}(\\text{Arad},\\text{Sibiu}) = 140'}</Tex>).
            It is solved offline with scipy/HiGHS and read from a lookup table at runtime. No SLD,
            no GPS, only the PDF's metre/kilometre data.
          </p>
          <div className="guide-note guide-try">
            Measured alone, LP is a valid but <em>loose</em> bound: mean <Tex>{'h/\\text{road} \\approx 0.68'}</Tex>.
            Useful, but we can do better.
          </div>
          <Figure
            src="/gifs/lp-vector-decomposition.gif"
            alt="The chord decomposed into road vectors"
            caption="The chord a→b rewritten as a combination of road vectors; the LP prices that combination."
            spec="GIF-4"
          />
        </section>

        {/* ── 5. ALT ─────────────────────────────────────────────────── */}
        <section className="guide-section" id="g-alt">
          <h3>5 · Our second bound: ALT (landmarks)</h3>
          <p>
            Pick a few <strong>landmark</strong> cities <Tex>L</Tex>, far-flung corners of the map.
            Then precompute the true shortest road distance <Tex>d(L,n)</Tex> from each landmark to
            every node (one Dijkstra run per landmark). For any node <Tex>n</Tex> and goal:
          </p>
          <div className="guide-eq">
            <Tex>{'h_{ALT}(n, goal) = \\max_{L} \\;\\big|\\, d(L,n) - d(L, goal) \\,\\big|'}</Tex>
          </div>
          <p>
            This is the <strong>triangle inequality</strong> doing the work. Going through{' '}
            <Tex>L</Tex> is one (usually longer) way to get from <Tex>n</Tex> to the goal, so{' '}
            <Tex>{'d(n, goal) \\ge |d(L,n) - d(L,goal)|'}</Tex>. The right side never exceeds the
            true distance, so it is admissible by construction, no empirical checking needed. It
            uses only road kilometres. Taking the <Tex>\max</Tex> over landmarks keeps it a lower
            bound while making it tighter.
          </p>
          <p>
            <strong>More landmarks, tighter bound.</strong> The app ships three presets:
          </p>
          <table className="guide-table">
            <thead>
              <tr><th>Preset</th><th>Landmarks</th><th>h/road</th></tr>
            </thead>
            <tbody>
              <tr><td>lm2</td><td>Eforie, Oradea</td><td>0.87</td></tr>
              <tr><td>lm4</td><td>+ Neamt, Giurgiu</td><td>0.97</td></tr>
              <tr><td>lm8</td><td>+ Timisoara, Vaslui, Drobeta, Hirsova</td><td>0.99</td></tr>
            </tbody>
          </table>
          <div className="guide-note">
            <strong>Backdoor.</strong> If a landmark <Tex>L</Tex> is a dead-end (degree 1) and the
            goal is its only neighbour, the bound becomes <em>exact</em>:{' '}
            <Tex>{'|d(L,n) - d(L,goal)| = d(n, goal)'}</Tex>. That is why, e.g., landmark Eforie
            gives a perfect estimate when the goal is Hirsova.
          </div>
          <Figure
            src="/gifs/alt-triangle-inequality.gif"
            alt="Triangle inequality via a landmark"
            caption="Any real route through the landmark is at least as long as the difference the landmark certifies."
            spec="GIF-5"
          />
        </section>

        {/* ── 6. Ensemble ────────────────────────────────────────────── */}
        <section className="guide-section" id="g-ensemble">
          <h3>6 · The ensemble: take the maximum</h3>
          <p>
            We have two admissible bounds that come from <em>different evidence</em>. Combine them
            by taking whichever is larger:
          </p>
          <div className="guide-eq">
            <Tex>{'h(n, goal) = \\max\\big(\\, h_{LP}(n, goal),\\; h_{ALT}(n, goal)\\,\\big)'}</Tex>
          </div>
          <p><strong>Why this works (three reasons):</strong></p>
          <ol>
            <li>
              <strong>Still admissible.</strong> Both inputs are <Tex>{'\\le'}</Tex> the true cost,
              so their maximum is too. A★ therefore stays optimal. (This is why you may only take a{' '}
              <Tex>\max</Tex> when <em>every</em> component is admissible; one overestimating
              component would leak straight in.)
            </li>
            <li>
              <strong>Tighter than either alone.</strong> The max is{' '}
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
          <Figure
            src="/gifs/ensemble-max.gif"
            alt="Two lower bounds, the larger one wins"
            caption="Each bound certifies “the answer is at least this much”; the max keeps the strongest certificate."
            spec="GIF-6"
          />
        </section>

        {/* ── 7. Performance ─────────────────────────────────────────── */}
        <section className="guide-section" id="g-perf">
          <h3>7 · Does it perform better? (measured)</h3>
          <p>
            An independent evaluation re-ran everything over all 380 ordered city pairs with its
            own Dijkstra oracle and a standard A★. Two things matter:{' '}
            <strong>informedness</strong> (how close <Tex>h</Tex> sits to the truth, as mean{' '}
            <Tex>{'h/\\text{road}'}</Tex>) and <strong>expansions</strong> (work done).
          </p>
          <table className="guide-table">
            <thead>
              <tr><th>Heuristic</th><th>h/road</th></tr>
            </thead>
            <tbody>
              <tr><td>LP only</td><td>0.683</td></tr>
              <tr><td>ALT lm2</td><td>0.872</td></tr>
              <tr><td>ALT lm4</td><td>0.972</td></tr>
              <tr><td>ALT lm8</td><td>0.985</td></tr>
              <tr><td><strong>LP + ALT (lm8)</strong></td><td><strong>0.986</strong></td></tr>
            </tbody>
          </table>
          <table className="guide-table">
            <thead>
              <tr><th>Search</th><th>expanded</th><th>generated</th></tr>
            </thead>
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
            UCS expands 4180 nodes across the pair set; A★ with the ensemble only 1922, roughly a{' '}
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
          <Figure
            src="/gifs/ensemble-performance.gif"
            alt="Bars: informedness and expansions across heuristics"
            caption="Informedness rises and expansions fall as the heuristic tightens; the ensemble tops it off."
            spec="GIF-7"
          />
        </section>

        {/* ── 8. Reading the maps ────────────────────────────────────── */}
        <section className="guide-section" id="g-map">
          <h3>8 · Reading the maps</h3>
          <p>
            <strong>Two lanes.</strong> Pick any two algorithms, A (purple) and B (teal), and run
            them on the same start/goal. The comparison table rates each metric and highlights the
            better value.
          </p>
          <ul>
            <li><strong>Node colours:</strong> current · frontier · visited · path (legend in the toolbar).</li>
            <li><strong>★ Landmarks:</strong> choose 2 / 4 / 8 per lane, or use the ★ tool to click cities and build a custom set.</li>
            <li><strong>Heatmap:</strong> each lane's <Tex>h</Tex>-values: red near the goal, blue far away.</li>
            <li><strong>Straight line:</strong> the SLD that would be “cheating”; shown only for intuition, never fed to the heuristic.</li>
          </ul>
          <p>
            <strong>Merged map (default).</strong> The two lanes share one picture. Color is the
            key: <span className="swatch swatch-lm-a" /> <strong>purple is lane A</strong>,{' '}
            <span className="swatch swatch-lm-b" /> <strong>teal is lane B</strong>. Every road is
            drawn as two coloured strands separated by a thin seam, so you can see at a glance which
            algorithm claimed each road. Node discs split into a left (A) and right (B) half, and
            landmark rings split the same way: a purple half means A picked that city, a teal half
            means B did. Use the ⬓ <em>Merged map</em> toggle to switch back to the side-by-side
            split view.
          </p>
        </section>

        </div>{/* /guide-sections */}

        <p className="guide-foot">
          Guide based on the implementation in <code>src/</code>. Measurements: see{' '}
          <code>eval/independent-eval.ts</code>.
        </p>
      </div>
    </article>
  )
}
