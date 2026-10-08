# Romania Pathfinding — A\* with a Custom LP + ALT Heuristic

## Overview
- **Topic**: Solving shortest-road-route search on the AIMA Romania map with A\*, using a custom admissible heuristic built without straight-line distance.
- **Hook**: "How do you find the shortest road route when GPS is banned?"
- **Target Audience**: Undergrad AI course. Assumes graphs and Big-O; assumes nothing about A\*, LP, or landmarks.
- **Estimated Length**: 15:00 as specced below (see **Runtime budget** for the 12:00 trim).
- **Key Insight**: A heuristic does not need geography to be sharp. Triangle inequality against landmarks placed at the *ends* of the map gives an estimate that is **exactly** the true road distance on 360 of 380 city pairs — because a landmark behind either endpoint turns the triangle inequality from a bound into an equality.
- **Resolution**: 480p15 for iteration, 1080p60 for the final upload.
- **Aspect Ratio**: 16:9.

---

## Data corrections (read before coding)

Every number in the source brief was checked against the repo. Three needed re-attribution. **No given value was discarded — two were relabelled and one claim was replaced.**

| Brief said | Repo says | Resolution |
|---|---|---|
| A\*(LP+ALT) trace: h(Arad)=388, h(Sibiu)≈255, h(Rimnicu)≈193 | 388.21 / 255.06 / 198.0 are **hLP** values (`src/heuristic_table.ts:13,299,280`). Combined `h=max(hLP,hALT)` gives 418 / 278 / 198 / 101. | Scene 8 runs **two passes**: pass 1 is LP-only (the brief's trace, correctly labelled, f climbs 388→395→413→418), pass 2 is LP+ALT (f flat at 418). The flat line only reads as a payoff because the climb came first. |
| Greedy fails on Arad→Bucharest | Greedy finds 418, the optimum. Verified: 0 suboptimal results on that pair. | Scene 4 uses **Bucharest→Arad**, where greedy returns 450 via Fagaras vs. optimal 418. Same corridor, same two numbers, mirror of the hero problem. 61 of 380 pairs are greedy-suboptimal. |
| Giurgiu backdoor explains exact h for goal=Bucharest | `lm2 = {Eforie, Oradea}` contains no Giurgiu and already yields h(Arad,Bucharest)=418. Six of eight lm8 landmarks yield exactly 418. | Scene 7's key insight is the **general** rule (landmark behind an endpoint ⇒ equality). The three degree-1 backdoors stay in the table as the special case, but they do not explain this pair. |

Also corrected: BFS returns **450**, not the optimum — so Scene 3 cannot call it "correct but slow."

### Verified constants

```
hLP(Arad,Bucharest)      = 388.21      heuristic_table.ts:13
hLP(Sibiu,Bucharest)     = 255.06      heuristic_table.ts:299
hLP(Rimnicu,Bucharest)   = 198.0       heuristic_table.ts:280
hLP(Pitesti,Bucharest)   = 101.0       heuristic_table.ts:261
hLP(Fagaras,Bucharest)   = 211.0       heuristic_table.ts:109

hALT8 to Bucharest: Arad 418 | Sibiu 278 | Rimnicu 198 | Pitesti 101 | Fagaras 211
Combined h = max(hLP,hALT) to Bucharest: 418 / 278 / 198 / 101 / 211

Mean h / true-road-distance over all 380 directed pairs:
  LP only   0.7293      lm2  0.9045      lm4  0.9676
  lm8       0.9849      LP+ALT combined  0.9855
LP admissibility violations: 0 / 380.  lm8 exact (h = true) on 360 / 380 pairs.
```

### Verified algorithm results, Arad → Bucharest

| Algorithm | Expanded | Generated | Cost | Optimal |
|---|---|---|---|---|
| BFS | 6 | 9 | 450 | No |
| DFS | 4 | 8 | 450 | No |
| Greedy | 5 | 10 | 418 | Yes (not guaranteed) |
| UCS | 13 | 14 | 418 | Yes |
| A\* (LP) | 5 | 10 | 418 | Yes |
| **A\* (LP+ALT)** | **5** | **10** | **418** | **Yes** |
| Bidirectional A\* | 6 | 16 | 418 | Yes |

Actual BFS expansion order: `Arad → Sibiu → Timisoara → Zerind → Fagaras → Bucharest`.

**Do not claim LP+ALT expands fewer nodes than LP alone.** They tie at 5/10 on this pair, and `HEURISTIC_GUIDE.md` explains why ("even perfect h still discovers neighbors of each expanded node"). A grader running the app will see the tie. ALT's payoff is the mean ratio across 380 pairs; state it that way.

---

## Narrative Arc

We start with a map and a banned tool: the assignment forbids straight-line distance, which is the one heuristic every textbook reaches for. We watch uninformed search flail — BFS confidently returns a route 32 km too long, UCS gets the right answer but touches almost every city in the country. We watch greedy search take the bait and drive to Fagaras. Then we build a heuristic from nothing but pixel positions and road signs: a linear program that decomposes the straight chord into road vectors, and a set of landmarks whose precomputed distances turn the triangle inequality into a distance estimate. The payoff is a single frozen number — f = 418 at every node A\* touches, because the estimate was never wrong in the first place.

---

## Scene 1: `Scene1_Intro`
**Duration**: ~60 s
**Purpose**: State the problem, state the ban, promise the payoff.

### Visual Elements
- `Text("Romania Pathfinding", font_size=64)` in GOLD, with `Text("A* and a heuristic that never saw a map", font_size=30)` in LIGHT_GRAY beneath.
- Faint pre-rendered `VGroup` of the Romania graph at `opacity=0.15` behind the title (reuse `build_map()` from the shared module — see **Shared Elements**).
- A "banned" motif: `MathTex(r"h(n) = \sqrt{(x_n-x_g)^2 + (y_n-y_g)^2}")` in WHITE, then a red `Line` struck through it, then `FadeOut` with `scale=0.8`.
- Three constraint bullets, `LaggedStart` of `FadeIn(shift=RIGHT*0.3)`.

### Content
Title writes on over the ghosted map. Cut to the problem: Arad to Bucharest, and the phrase "shortest by road, not by air." The SLD formula appears, is struck through, and dissolves — this is the whole reason the project is interesting. Three constraints land as bullets: **one algorithm only**, **SLD banned in every form**, **the heuristic must be your own**. Close on the promise: "By the end, the estimate will be exactly right 95% of the time."

### Voiceover
- **Text**: "This is the map of Romania — twenty cities, twenty-three roads. The question is the oldest one in AI: what is the shortest route from Arad to Bucharest? There is an obvious way to guess. Measure the straight line to the goal and drive toward it. That method is banned. Not just the distance itself — anything derived from it. No GPS, no coordinates that mean anything geographic, no external data. All I get is a picture with dots on it and the number written on each road. Somehow, from that, I need an estimate of how far away the goal is — one that is never an overestimate, or the search breaks. This video is how I built it."
- **Sync Points**: "twenty cities, twenty-three roads" → ghost map brightens briefly to 0.3. "That method is banned" → strike-through line draws. "never an overestimate" → the word *admissible* fades in below in ORANGE.

### Technical Notes
- Set `config.background_color = "#1a1a2e"` once at module level, not per scene.
- Ghost map: `build_map(with_labels=False).set_opacity(0.15)`.
- Strike-through: `Line(formula.get_left(), formula.get_right(), color=RED, stroke_width=6)` animated with `Create`, then `FadeOut(VGroup(formula, strike), scale=0.8)`.
- `self.add_subcaption(...)` on every beat; keep each caption under ~12 words so the SRT chunks read cleanly.

---

## Scene 2: `Scene2_MapReveal`
**Duration**: ~90 s
**Purpose**: Build the graph on screen so every later scene can reuse it. Establish Arad and Bucharest as the endpoints.

### Visual Elements
- 20 `Dot(radius=0.09, color=WHITE)` at scaled positions, each in a `VGroup` with a `Text(city_name, font_size=16)` label positioned by a per-city `direction` vector.
- 23 `Line(stroke_width=2.5, color=GRAY)` edges.
- 23 km labels: `Text(str(km), font_size=13, color=LIGHT_GRAY)` at each edge midpoint, each with a small `BackgroundRectangle` (fill `#1a1a2e`, opacity 0.85) so digits do not sit on the line.
- Endpoint emphasis: `Circle(radius=0.22, color=GREEN)` around Arad, `Circle(radius=0.22, color=GOLD)` around Bucharest, both with `Flash`.
- `Text("Arad → Bucharest", font_size=34)` docked top-left.

### Content
Cities fade in as a `LaggedStart`, west to east — sorted by pixel x, so the reveal sweeps across the country. Roads then draw with `Create`, and the km labels pop in as a second lag wave. Once the graph is whole, the camera settles and the two endpoints get their rings. Narration names the corridor that matters: from Sibiu there are two ways east, one through Fagaras and one through Rimnicu Vilcea and Pitesti. Both reach Bucharest. That fork is the entire drama of the rest of the video, so plant it now: highlight `Sibiu→Fagaras→Bucharest` in dim red and `Sibiu→Rimnicu→Pitesti→Bucharest` in dim green for three seconds, then release both back to GRAY.

### Voiceover
- **Text**: "Here is the whole world for this problem. Twenty cities. Twenty-three roads, each labelled with its length in kilometres. We start at Arad, in the west. We want Bucharest, in the south-east. Watch this fork, because everything turns on it. From Sibiu you can go through Fagaras — two roads, ninety-nine and two-eleven. Or through Rimnicu Vilcea and Pitesti — three roads, eighty, ninety-seven, one-oh-one. The Fagaras route has fewer roads. It is also thirty-two kilometres longer. Every algorithm in this video either notices that or it does not."
- **Sync Points**: "Twenty cities" → city lag wave. "each labelled with its length" → km label wave. "Watch this fork" → the two routes light red and green. "thirty-two kilometres longer" → `MathTex("450 - 418 = 32")` in GOLD, bottom-right, held 2 s.

### Technical Notes
**Coordinate scaling — the exact transform.** Pixel coords are top-left-origin and y-down. Manim's frame is 14.222 × 8 units.

```python
# Pixel extents over all 20 cities: x in [773, 3313], y in [446, 2062]
CX, CY = 2043.0, 1254.0       # (xmin+xmax)/2, (ymin+ymax)/2
SCALE  = 0.0034                # tuned: see below

def to_manim(px, py):
    return np.array([(px - CX) * SCALE, -(py - CY) * SCALE, 0.0])
```

Sign check: the `-` on y is the top-left-origin flip. Verify with Oradea (y=446, the northernmost city) → `-(446-1254)*0.0034 = +2.75`, i.e. near the top. Correct.

Extent check at `SCALE = 0.0034`: half-width `1270*0.0034 = 4.32`, half-height `808*0.0034 = 2.75`. The map occupies x ∈ [-4.32, +4.32], y ∈ [-2.75, +2.75] inside a ±7.11 / ±4.0 frame — so there is **2.79 units of gutter on each side and 1.25 above and below**. Plenty of room.

**Standard placement, used by every scene:** `map_group.shift(LEFT * 1.0 + DOWN * 0.3)`. The map then spans x ∈ [-5.32, +3.32], leaving a clean **3.79-unit right gutter** for the Scene 8 stats panel and the Scene 9 table, and ~1.05 units of title space at the top. Do not scale the map down for those scenes — the gutter is wide enough at full size.

`SCALE = 0.0037` also fits (half-height 2.99) and reads larger, but leaves only ~1.0 unit of headroom and narrows the gutter. Use 0.0034 unless the rendered frame shows the map too small.

Anchor cities (after `SCALE=0.0034` and `shift(LEFT*1.0 + DOWN*0.3)`, for eyeballing a render):

| City | Manim (x, y) |
|---|---|
| Arad | (-5.32, +1.29) |
| Sibiu | (-3.18, +0.37) |
| Rimnicu Vilcea | (-2.71, -0.50) |
| Pitesti | (-1.11, -0.99) |
| Fagaras | (-1.37, +0.22) |
| Bucharest | (+0.35, -2.02) |
| Oradea | (-4.60, +2.45) |
| Eforie | (+3.32, -2.64) |

Label placement: hand-pick a `direction` per city rather than defaulting to `UP` — Sibiu, Rimnicu Vilcea, Pitesti, and Fagaras cluster tightly and will collide. Suggested: Arad `LEFT`, Sibiu `UP`, Fagaras `UP`, Rimnicu Vilcea `LEFT`, Pitesti `DOWN`, Bucharest `RIGHT`, Craiova `DOWN`, everything else `UP`.

Build the map once in a module-level helper returning `(dots, labels, edges, km_labels, lookup)` where `lookup: dict[str, Dot]`. Every scene from 3 onward opens by calling it, so node styling is a `lookup[name].set_color(...)` away.

---

## Scene 3: `Scene3_BlindSearch`
**Duration**: ~90 s
**Purpose**: Show that ignoring the km numbers is not a small inefficiency — BFS gets the wrong answer. Show that UCS gets the right one by brute force.

### Visual Elements
- The Scene 2 map, restored at full opacity.
- BFS pass: expanded nodes turn BLUE via `node.animate.set_color(BLUE)`, frontier nodes YELLOW. A depth counter `Text("Depth: 1")` top-right, updated with `Transform`.
- UCS pass: same map reset to WHITE, expanded nodes turn BLUE, with a running `g` value rendered next to each expanded node in `Text(font_size=14, color=LIGHT_GRAY)`.
- Two result cards, side by side at the end: `VGroup(RoundedRectangle, Text)` — left card BFS (450 km, 6 expanded, red ✗), right card UCS (418 km, 13 expanded, green ✓).

### Content
BFS first. Expand in the exact verified order: **Arad, Sibiu, Timisoara, Zerind, Fagaras, Bucharest.** Six expansions, nine nodes generated. It halts the moment it touches Bucharest and reports `Arad → Sibiu → Fagaras → Bucharest`. Trace that path in RED and put 450 on screen next to it. Then the correction: BFS optimises for *fewest roads*, and nobody driving cares about fewest roads. It never read the numbers we spent Scene 2 painting on the map.

Reset. UCS second. It pops by cheapest cumulative `g`, so it crawls outward as a cost wave. Verified expansion order:

`Arad → Zerind → Timisoara → Sibiu → Oradea → Rimnicu Vilcea → Lugoj → Fagaras → Mehadia → Pitesti → Craiova → Drobeta → Bucharest`

It does find 418. But count the blue: **thirteen of twenty cities expanded**, fourteen generated. Note where it goes — Zerind and Timisoara are its *second and third* expansions, both due west, in the opposite direction from Bucharest. It reaches Mehadia and Drobeta in the far south-west before it ever gets to Bucharest. UCS is right and blind: it has no idea which direction the goal lies, so it searches every direction at once.

### Voiceover
- **Text**: "Breadth-first search expands by layers. Arad, then its neighbours, then theirs. Six expansions and it hits Bucharest — through Fagaras. It reports that route as the answer. It is wrong. Four hundred fifty kilometres, when four hundred eighteen was available. Breadth-first finds the path with the fewest roads, and fewest roads is not shortest. It never looked at a single number on this map. So use the numbers. Uniform-cost search always expands the cheapest path so far — and it does find four hundred eighteen. Look at the cost, though. Its second and third moves are Zerind and Timisoara — due west, the opposite direction from Bucharest. It reaches Mehadia and Drobeta, in the far south-west corner, before it ever reaches the goal. Thirteen of twenty cities expanded. Uniform-cost search is correct and completely blind: it has no notion of which way the goal lies, so it searches every way at once."
- **Sync Points**: "Six expansions" → counter reaches 6. "It is wrong." → beat of silence, red path holds, `450` flashes. "the opposite direction from Bucharest" → a RED arrow from Arad pointing west overlays the Zerind/Timisoara dots. "Thirteen of twenty" → the 13 blue dots pulse in unison via `LaggedStart(Indicate(...))`.

### Technical Notes
- Hard-code both expansion sequences as Python lists rather than reimplementing search in Manim. Both orders are verified above against the shipped `src/bfs.ts` and `src/ucs.ts` — transcribe them exactly, do not re-derive by hand.
- Reset between passes with a single `self.play(*[d.animate.set_color(WHITE) for d in lookup.values()], run_time=0.6)`.
- Frontier ring effect: `Circle(radius=0.16, color=YELLOW).move_to(dot)`, added and removed rather than recoloured, so a node can be simultaneously blue (expanded) and lose its yellow ring.
- Keep per-expansion `run_time` at 0.35 for BFS and 0.22 for UCS — thirteen expansions at 0.35 drags.

---

## Scene 4: `Scene4_GreedyFail`
**Duration**: ~60 s
**Purpose**: Show what a heuristic buys and what it cannot guarantee alone. Motivate the `g` term in `f = g + h`.

### Visual Elements
- Map with the endpoints **reversed**: GOLD ring on Bucharest (start), GREEN ring on Arad (goal). A `Text("Bucharest → Arad")` swaps in.
- ORANGE `h` values floating beside candidate nodes as greedy considers them.
- The taken path traced in RED, the optimum revealed in GREEN beneath it.
- Closing comparison: `MathTex(r"450 \;>\; 418", font_size=52)` with the 450 in RED and the 418 in GREEN.

### Content
Run the problem backwards — Bucharest to Arad — for a reason worth saying out loud: on Arad→Bucharest, greedy actually gets the right answer, and pretending otherwise would be dishonest. Reversed, it breaks. Greedy expands whichever node looks closest to the goal and never reconsiders. From Bucharest, Fagaras looks closer to Arad than Pitesti does, so it commits: `Bucharest → Fagaras → Sibiu → Arad`, four expansions, **450 km**. Fast and wrong. Optimal was 418 through Pitesti and Rimnicu Vilcea.

Generalise with a real number, not a hand-wave: greedy is suboptimal on **61 of 380** city pairs on this map. The failure is structural — greedy throws away everything it already knows about the distance it has driven. Which names the fix, and sets up Scene 5.

### Voiceover
- **Text**: "Let me be fair to greedy search. On Arad to Bucharest, it gets the right answer. So run it backwards. Bucharest to Arad. Greedy picks whichever city looks closest to the goal and never looks back. From Bucharest, Fagaras looks closer to Arad than Pitesti does. It commits. Four expansions, done — four hundred fifty kilometres. The optimum was four hundred eighteen, through Pitesti. Across this map, greedy returns a suboptimal route on sixty-one of three hundred eighty city pairs. The flaw is not the estimate. The flaw is that greedy throws away the one thing it knows for certain — how far it has already driven."
- **Sync Points**: "It commits." → Fagaras turns BLUE with a hard `Flash`. "sixty-one of three hundred eighty" → `Text("61 / 380 pairs suboptimal", color=RED)` fades in. "how far it has already driven" → `MathTex("g(n)")` writes on in GOLD, held into the transition.

### Technical Notes
- Verified greedy path `Bucharest → Fagaras → Sibiu → Arad`, cost 450, 4 expansions, 7 generated. Do not invent a synthetic trap graph — the real map already fails.
- Reversing endpoints means recolouring rings only; do not rebuild the map.
- Let the `MathTex("g(n)")` from the final sync point persist as the opening mobject of Scene 5 (`ReplacementTransform` across the cut) so the two scenes read continuous after ffmpeg concat.

---

## Scene 5: `Scene5_AStarIntro`
**Duration**: ~60 s
**Purpose**: Define `f = g + h`, define admissibility, and hand off the open question: where does `h` come from?

### Visual Elements
- `MathTex(r"f(n) = g(n) + h(n)", font_size=60)` centred, then `.to_edge(UP)`.
- Colour-coded term breakdown: `g(n)` GOLD, `h(n)` ORANGE, `f(n)` WHITE — use `SurroundingRectangle` + a labelled `Brace` under each term.
- A live mini-illustration on the map: pick Sibiu. Draw the traversed `Arad→Sibiu` edge in GOLD labelled `g = 140`, and a dashed ORANGE `DashedLine` from Sibiu toward Bucharest labelled `h = ?`.
- Admissibility card: `MathTex(r"h(n) \leq h^*(n) \quad \forall n", font_size=44)` inside a GOLD `RoundedRectangle`.

### Content
`g` is memory — the exact cost of the roads already driven, no estimate involved. `h` is prophecy — a guess at the cost remaining. A\* sorts its frontier by their sum, so it balances the two: greedy uses only `h`, UCS uses only `g`, A\* uses both and that is the entire trick. Then the constraint that makes it work: `h` must never overestimate. Underestimate and A\* still returns the optimum, just slower. Overestimate by one kilometre and it can walk past the best route and never come back. Land on the open question: the dashed orange line is a straight line, and straight lines are banned. So what goes in that box?

### Voiceover
- **Text**: "A-star is one line. f of n equals g of n plus h of n. g is memory: exactly how far I have already driven, no guessing. h is prophecy: my estimate of what is left. A-star always expands the node with the smallest sum. Greedy used only h. Uniform-cost used only g. A-star uses both, and that is the whole idea. One rule makes it work. h must never overestimate. Guess too low and A-star still finds the optimum, it just does more work. Guess too high — even by one kilometre — and it can walk straight past the best route and never come back. So here is my problem. That orange line is a straight line, and straight lines are exactly what I am not allowed to use. What goes in that box?"
- **Sync Points**: "g is memory" → GOLD edge and `g = 140` appear on the map. "h is prophecy" → dashed ORANGE line and `h = ?`. "must never overestimate" → admissibility card slides up. "What goes in that box?" → the `?` pulses via `Indicate(color=GOLD)`, hold 1.5 s of silence into the cut.

### Technical Notes
- Use one `MathTex` split into substrings so terms can be coloured and braced individually: `MathTex("f(n)", "=", "g(n)", "+", "h(n)")`, then `eq[0].set_color(WHITE)`, `eq[2].set_color(GOLD)`, `eq[4].set_color(ORANGE)`.
- `DashedLine(start, end, dash_length=0.12, color=ORANGE)`.
- The formula must survive to Scenes 6, 7, 8 in the same top-edge position — fix it at `.to_edge(UP).shift(RIGHT*0.0)` and reuse verbatim so the concat looks like one continuous overlay.

---

## Scene 6: `Scene6_LP`
**Duration**: ~120 s
**Purpose**: Derive the first heuristic — a linear program that decomposes the chord into road vectors. This is a graded-creativity centrepiece.

### Visual Elements
- Two-panel layout: map on the left at `scale(0.62)`, math on the right.
- The chord: `Arrow(arad_pos, buch_pos, color=GOLD, buff=0, stroke_width=5)` labelled `chord_AB`.
- Road vectors as small ORANGE `Arrow`s, drawn tip-to-tail, reassembling into the chord — a vector-addition animation.
- The LP, built in stages:
  `MathTex(r"h_{LP}(a,b) = \min \sum_i \alpha_i \cdot km_i")`
  `MathTex(r"\text{s.t.} \quad \sum_i \alpha_i \cdot \vec{v}_i = \vec{chord}_{ab}")`
  `MathTex(r"0 \leq \alpha_i \leq 1")`
- Result card: `MathTex(r"h_{LP}(\text{Arad},\text{Bucharest}) = 388.21", color=GOLD)`.
- A ratio bar: `Rectangle` of width proportional to 0.7293, against a WHITE outline at 1.0, labelled "mean h / true distance = 0.729".

### Content
Reframe the ban. The pixel coordinates are not geography — they are a drawing. The assignment says so. But a drawing still has *directions* in it, and each road in that drawing is a 2-D vector with a real kilometre number attached. So ask a different question: if I had to reproduce the straight arrow from Arad to Bucharest by laying road-shaped vectors tip to tail, what is the cheapest bag of roads that does it?

Animate exactly that, with **the real solver output** — verified by re-running `scripts/gen_heuristic_table.py`'s LP for this pair. Only four vectors have nonzero α:

| Vector | α | km | contribution |
|---|---|---|---|
| Rimnicu Vilcea → Pitesti | 1.0000 | 97 | 97.00 |
| Pitesti → Bucharest | 1.0000 | 101 | 101.00 |
| Sibiu → Fagaras | 0.9263 | 99 | 91.70 |
| Oradea → Sibiu | 0.6524 | 151 | 98.51 |
| | | | **388.21** |

Four vectors is a gift for animation, and the *shape* of the answer is the lesson. Two of them are whole roads that really are on the optimal route. The other two are **fractions of roads that are not connected to anything** — 93% of the Sibiu–Fagaras road, 65% of the Oradea–Sibiu road, floating free. This is not a path. It was never going to be a path. The LP is a **relaxation**: it drops the requirement that the pieces join up, and keeps only the requirement that they add up. That is exactly why it is a lower bound — a relaxed problem can never cost more than the real one.

State the admissibility argument precisely, because this is where an examiner will push. The solver builds **46 directed vectors — both orientations of all 23 roads** (`gen_heuristic_table.py:66-69`), each bounded `0 ≤ α ≤ 1`. So the true shortest route, which traverses each directed edge at most once, *is* a feasible point of the LP. A minimum cannot exceed a feasible point. Admissible by construction. The repo still ships an empirical 190/190 check, and the reason is worth one sentence: values are **rounded to 2 decimals before storage**, and a value rounded *up* could in principle creep above the true distance. The check guards the rounding, not the proof.

Solved offline once over all 190 unordered pairs and cached in `heuristic_table.ts`. Arad→Bucharest: **388.2053**, stored as **388.21** — against a true 418, that is 93% of the way there. Then the honest aggregate: mean **0.729** across 380 directed pairs, **0 violations**. Good, verified, and not good enough alone — which is why Scene 7 exists.

### Voiceover
- **Text**: "Start with what I am actually allowed to touch. The x and y coordinates in the source file are not geography — they are where I chose to draw the dots. But a drawing still has directions in it. Every road is a two-dimensional vector, and every road has a real kilometre number written on it. So a different question. Take the straight arrow from Arad to Bucharest. If I had to rebuild that arrow out of road-shaped pieces, laid tip to tail, what is the cheapest set of pieces that does it? That is a linear program. Minimise the sum of alpha-i times kilometres-i, subject to the alphas reproducing the chord, with each alpha between zero and one. Here is what the solver actually returns. Four pieces. All of Rimnicu Vilcea to Pitesti. All of Pitesti to Bucharest. Ninety-three percent of Sibiu to Fagaras. And sixty-five percent of Oradea to Sibiu. Look at that answer — it is not a route. Two of those pieces are fractions of roads, floating, not joined to anything. That is the point. This is a relaxation: I dropped the requirement that the pieces connect and kept only the requirement that they add up. And a relaxed problem can never cost more than the real one. That is why it cannot overestimate. More carefully, since this is the part worth getting right: the solver uses all forty-six directed vectors — both orientations of every road — each capped at one. So the true shortest route is itself a feasible point of my program, and a minimum never exceeds a feasible point. Admissible by construction. Arad to Bucharest: three eighty-eight point two one, against a true four eighteen. Across all three hundred eighty directed pairs it averages seventy-three percent of the true distance, and it never once overestimates. That is a real heuristic. It is also leaving a quarter of the distance on the table."
- **Sync Points**: "Every road is a two-dimensional vector" → all 23 edges briefly become ORANGE arrows. "laid tip to tail" → the assembly animation. "it is not a route" → the two fractional vectors detach and hover apart from the map, isolated. "Admissible by construction" → a green ✓ stamps beside the LP block. "seventy-three percent" → ratio bar fills to 0.729. "leaving a quarter on the table" → the empty remainder of the bar flashes RED.

### Technical Notes
- Do **not** solve an LP in Manim. The four-vector α set above is the verified solver output — hard-code it.
- Reproduce it with: `scipy.optimize.linprog(edge_costs, A_eq=[[v[0] for v in edge_vecs],[v[1] for v in edge_vecs]], b_eq=[bx-ax, by-ay], bounds=[(0,1)]*46, method="highs")` over the 46 directed vectors. Objective returns `388.2053`.
- Assembly order for the animation: lead with the two whole roads (Rimnicu→Pitesti, Pitesti→Bucharest) so the viewer first sees something route-shaped, then add the two fractional strays — the reveal that it is *not* a path is the beat.
- Assembly: for each contributing road, `arrow.copy()`, then `.animate.put_start_and_end_on(running_tip, running_tip + alpha*vec)` in sequence with `run_time=0.5` each. Render the two fractional vectors with `stroke_opacity=0.75` and a dashed tail so they read visually as partial.
- Use `Succession` for the chain, not `AnimationGroup` — the visual point is sequential accumulation.
- Ratio bar: `Rectangle(width=6*0.7293, height=0.4, fill_color=ORANGE, fill_opacity=0.85)` inside `Rectangle(width=6, height=0.4, color=WHITE)`. Reuse this exact widget in Scene 7 so the two ratios compare visually.
- 120 s is long for one idea. Hold the map visible throughout so the eye has somewhere to rest between math beats.

---

## Scene 7: `Scene7_ALT`
**Duration**: ~120 s
**Purpose**: Derive the second heuristic and deliver the video's key insight. Highest-value scene for the creativity criterion.

### Visual Elements
- Map with 8 landmark cities marked by GOLD `Star(n=5, outer_radius=0.14)` replacing their dots, appearing one at a time.
- Triangle-inequality diagram: three nodes `L`, `n`, `goal` as a `VGroup` off to the side, with the two known legs solid and the unknown leg dashed.
- `MathTex(r"h_{ALT}(n,g) = \max_L \left| d(L,n) - d(L,g) \right|", font_size=44)`.
- The Eforie demonstration: Eforie's shortest path to Arad drawn as a GOLD polyline through the whole country, with Bucharest ringed in GREEN **on that path**.
- Preset bar chart: three ratio bars (reusing the Scene 6 widget) at 0.9045 / 0.9676 / 0.9849, labelled lm2 / lm4 / lm8, with LP's 0.729 bar greyed behind for contrast.
- Final stat: `Text("exact on 360 of 380 pairs", color=GOLD, font_size=38)`.

### Content
Second idea, completely different data. Pick a few cities and call them landmarks. Run Dijkstra from each — that is a one-off precomputation over 8 × 20 nodes, done at module load. Now for any node `n` and goal `g`, the triangle inequality gives `d(n,g) ≥ |d(L,n) − d(L,g)|` for *every* landmark, so take the max over all of them. Admissible by construction: no verification pass needed, unlike the LP.

Then the insight, and it is better than the "backdoor" framing in the brief. Look at Arad→Bucharest with lm8. **Six of the eight landmarks return exactly 418** — the true distance, not a bound:

| Landmark | d(L, Arad) | d(L, Bucharest) | \|diff\| |
|---|---|---|---|
| Eforie | 687 | 269 | **418** |
| Giurgiu | 508 | 90 | **418** |
| Neamt | 824 | 406 | **418** |
| Vaslui | 645 | 227 | **418** |
| Hirsova | 601 | 183 | **418** |
| Timisoara | 118 | 536 | **418** |
| Oradea | 146 | 429 | 283 |
| Drobeta | 374 | 359 | 15 |

Why: Eforie's shortest path to Arad **runs through Bucharest** (`Eforie → Hirsova → Urziceni → Bucharest → Pitesti → Rimnicu → Sibiu → Arad`). When the goal sits on the landmark's own shortest path to the start, the triangle inequality is not an inequality — it is an equality. The subtraction cancels the shared segment perfectly. Timisoara is the mirror case: it sits behind *Arad* instead, and works identically.

That is why landmarks are placed at geographic extremes: an extreme landmark's shortest paths funnel through the middle of the map, so most pairs end up with some landmark behind one endpoint. Hence **360 of 380 pairs exact**, and a mean ratio of 0.985 at lm8. The three degree-1 backdoors (Giurgiu→Bucharest, Eforie→Hirsova, Neamt→Iasi) are the extreme special case of the same rule — a degree-1 landmark's only road *forces* every path through its single neighbour.

Close by combining: `h = max(hLP, hALT)`. The max of two admissible heuristics is admissible and at least as tight as either. Combined mean 0.9855 versus ALT's 0.9849 — LP buys +0.0006, and that is worth stating plainly rather than overselling. Keep it because it is an *independent* bound from different data by a different method: admissibility never rests on landmark choice alone.

### Voiceover
- **Text**: "Second idea, and it uses completely different data. Pick some cities and call them landmarks. Run Dijkstra from each one — eight landmarks, twenty nodes, precomputed once at start-up. Now the triangle inequality. For any landmark L, the distance from n to the goal is at least the distance from L to n minus the distance from L to the goal, in absolute value. Take the largest such bound over every landmark. It is admissible by construction — I do not have to check it, the geometry guarantees it. Now watch what happens on our pair. Six of the eight landmarks do not just bound four hundred eighteen. They return exactly four hundred eighteen. Take Eforie, on the Black Sea coast. Its shortest path to Arad runs through Bucharest — through the very city I am searching for. Six eighty-seven minus two sixty-nine. The shared segment cancels exactly, and the inequality stops being an inequality. That is the general rule, and it is worth more than any single trick: whenever a landmark sits behind one of the endpoints, the estimate is not a bound, it is the answer. Which is exactly why landmarks belong at the edges of the map. Their shortest paths funnel through the middle, so almost every pair has a landmark behind it. Two landmarks: ninety percent of true distance. Four: ninety-seven. Eight: ninety-eight point five, and exact on three hundred sixty of three hundred eighty pairs. Finally, take the max of the LP bound and the landmark bound. The max of two admissible heuristics is admissible and at least as tight as either. The gain over landmarks alone is small — six ten-thousandths — and I am keeping it anyway, because it is an independent bound from different data by a different method. My admissibility never rests on my choice of landmarks alone."
- **Sync Points**: "Pick some cities" → 8 gold stars land, `LaggedStart`. "the triangle inequality" → the L/n/goal diagram assembles. "exactly four hundred eighteen" → the table's six 418 rows highlight GOLD in one `LaggedStart`. "runs through Bucharest" → the Eforie polyline draws across the map, Bucharest ring flashes GREEN. "Two landmarks... four... eight" → the three bars grow in sequence. "three hundred sixty of three hundred eighty" → hold 2 s.
- Preset presentation caveat: **do not** compare lm2/lm4/lm8 on Arad→Bucharest — all three return 418 and the comparison would look broken. Compare on the aggregate mean ratio only. This is why the bar chart exists.

### Technical Notes
- Landmark sets, from `src/alt.ts:21-24`: `lm2 = [Eforie, Oradea]`; `lm4 = lm2 + [Neamt, Giurgiu]`; `lm8 = lm4 + [Timisoara, Vaslui, Drobeta, Hirsova]`. Grow the star set in that order so the bar chart animation and the map stay in sync.
- Eforie polyline: `VMobject().set_points_as_corners([to_manim(*COORDS[c]) for c in path])` with `Create(run_time=2.2)`.
- The 8-row table: use a `VGroup` of `Text` rows, not `Table` — `Table` is slow to render and hard to recolour per-cell.
- The two loose rows (Oradea 283, Drobeta 15) must stay visible. Showing only the six that work would be the dishonest edit, and the contrast is what proves the rule is about *position*, not luck.

---

## Scene 8: `Scene8_AStarTrace`
**Duration**: ~150 s
**Purpose**: The payoff. Run A\* twice on the same problem and let the f-column tell the story.

### Visual Elements
- Full-size map at the standard placement (`shift(LEFT*1.0 + DOWN*0.3)`), leaving the 3.79-unit right gutter free.
- Stats panel **docked right** in that gutter: a 5-column `VGroup` grid — Node / g / h / f / Status — with rows added by `LaggedStart(FadeIn(shift=UP*0.2))` and values updated via `Transform`.
- Node states: frontier YELLOW ring, expanded BLUE fill, final path GREEN with `stroke_width=6` edges.
- The `f(n) = g(n) + h(n)` formula from Scene 5, same top-edge position, persistent.
- Pass label top-right: `Text("Pass 1: A* with LP only")` → `Text("Pass 2: A* with LP + ALT")`.
- Closing: `Text("418 km", font_size=64, color=GREEN)` over the green path.

### Content

**Pass 1 — LP only (~70 s).** The brief's trace, correctly labelled.

| Step | Node | g | h (LP) | f |
|---|---|---|---|---|
| 1 | Arad | 0 | 388.21 | 388.21 |
| 2 | Sibiu | 140 | 255.06 | 395.06 |
| 3 | Rimnicu Vilcea | 220 | 198.00 | 418.00 |
| 4 | Pitesti | 317 | 101.00 | 418.00 |
| 5 | Bucharest | 418 | 0 | 418.00 |

Watch the f column *climb*: 388 → 395 → 418. Each rise is the search discovering its estimate was optimistic — the heuristic was 30 km short at Arad, and reality catches up one expansion at a time. That climb is the whole content of pass 1. Verified order: `Arad → Sibiu → Rimnicu Vilcea → Pitesti → Bucharest`. 5 expanded, 10 generated, 418 km. Do not resolve the Fagaras fork here — mention that Fagaras is sitting on the frontier, leave it yellow, and move on. It gets paid off in pass 2.

**Pass 2 — LP + ALT (~50 s).** Same problem, same map, swap the heuristic. **This is where the fork freeze lives** — the hero heuristic must be the one seen rejecting something.

| Step | Node | g | h (max) | f |
|---|---|---|---|---|
| 1 | Arad | 0 | 418 | **418** |
| 2 | Sibiu | 140 | 278 | **418** |
| 3 | Rimnicu Vilcea | 220 | 198 | **418** |
| 4 | Pitesti | 317 | 101 | **418** |
| 5 | Bucharest | 418 | 0 | **418** |

The f column does not move. It is 418 before A\* has taken a single step, and it is still 418 when it arrives. The search was never surprised. It knew the answer standing in Arad and spent five expansions confirming it — which is what a heuristic at 98.5% of true distance looks like from the inside.

**The fork freeze, at step 2.** After Sibiu is expanded, two cities sit on the frontier:

| Frontier node | g | h (max) | f |
|---|---|---|---|
| Rimnicu Vilcea | 220 | 198 | **418** |
| Fagaras | 239 | 211 | **450** |

Freeze here for 2.5 s. Both yellow, no motion. Those are the video's two headline numbers, side by side, and they are the *exact* costs of the two routes Scene 2 planted at the fork — 418 through Pitesti, 450 through Fagaras. The heuristic is not estimating the difference; it has computed it. A\* takes 418. Fagaras stays yellow permanently — generated, never expanded. That single unexpanded yellow dot is the whole difference between A\* and greedy: greedy, running this map backwards in Scene 4, drove to Fagaras and lost exactly those 32 km.

Be honest in the same breath: both passes expand 5 nodes and generate 10. On a 20-node graph with LP already at 93% on this pair, there was no room left to save. The flat f column and the clean 418-vs-450 rejection are the demonstration — not the node count.

**Closing (~30 s).** Green path traced end to end, edge weights re-shown — 140 + 80 + 97 + 101 — summing to 418 with a `MathTex` accumulation.

### Voiceover
- **Text**: "Run it. Pass one, the LP heuristic on its own. Arad: g is zero, h is three eighty-eight, f is three eighty-eight. Expand. Sibiu: a hundred forty driven, two fifty-five estimated — f, three ninety-five. The f value went up. That is the search finding out its estimate was optimistic. Rimnicu Vilcea — four eighteen. Pitesti — four eighteen. Bucharest — four eighteen. It climbed thirty kilometres over five expansions, and it got the right answer. Now the same problem, same map, with the landmarks switched on. Arad: f, four hundred eighteen. Sibiu: four hundred eighteen. Rimnicu: four eighteen. Pitesti: four eighteen. Bucharest: four eighteen. It never moves. A-star knew the exact answer standing in Arad and spent five expansions confirming it. And watch the one decision it had to make. After Sibiu, two cities are waiting. Rimnicu Vilcea: two twenty driven, a hundred ninety-eight to go. Four hundred eighteen. Fagaras: two thirty-nine driven, two eleven to go. Four hundred fifty. Those are not estimates that happen to differ. Those are the two real routes, priced exactly, before A-star has driven either of them. It takes four eighteen. Fagaras sits there and is never expanded. That one yellow dot is the whole difference between this and greedy search — greedy drove to Fagaras and lost thirty-two kilometres. One caveat, because it would be easy to oversell. Both passes expand the same five nodes and generate the same ten. On twenty cities there was nothing left to save. The flat column is the result, not a smaller pile of dots. One forty, plus eighty, plus ninety-seven, plus a hundred and one. Four hundred eighteen kilometres. Optimal — and proven optimal."
- **Sync Points**: "The f value went up" → the f cell transforms 388.21 → 395.06 with `Indicate(color=ORANGE)`. "It never moves." → all five f cells flash GOLD simultaneously via `AnimationGroup`. "two cities are waiting" → **freeze 2.5 s**, Rimnicu and Fagaras both yellow, both f values large in the panel, no motion, silent. "It takes four eighteen." → Rimnicu turns BLUE. "never expanded" → Fagaras pulses YELLOW once and stays yellow for the rest of the video. "Four hundred eighteen kilometres" → green path + big number.

### Technical Notes
- Hard-code both traces as a list of dicts. Never run search logic inside `construct()`. Both expansion orders are verified identical: `Arad → Sibiu → Rimnicu Vilcea → Pitesti → Bucharest`.
- Table update pattern: keep a `dict[str, list[Text]]` of row mobjects; `self.play(Transform(cell, new_cell))` per change. Rebuilding the whole `VGroup` each step causes visible jitter.
- The pass-2 flat column only reads if pass 1's climb was visible. Do **not** shorten pass 1 to save time — cut Scene 9 instead.
- **The fork freeze belongs in pass 2, not pass 1.** In pass 1 the fork is 450 vs 413, which is a fine decision but a forgettable pair of numbers. In pass 2 it is 450 vs 418 — the video's two headline figures, and the exact costs of the two real routes. Putting it in pass 2 also fixes the structural problem that a flat f column shows nothing being rejected: the hero heuristic needs to be seen beating a candidate, not just being calm.
- Give the freeze real silence in the VO. It is the single most important beat in the video.
- Panel sizing: 5 columns × 6 rows at `font_size=20` with `buff=0.28` is roughly 3.4 units wide and 2.1 tall — comfortably inside the 3.79-unit right gutter. Dock with `.to_edge(RIGHT, buff=0.25)`. No map scaling needed.

---

## Scene 9: `Scene9_Performance`
**Duration**: ~90 s
**Purpose**: Put every algorithm side by side on identical input. Establish that A\* is the only one both cheap and guaranteed.

### Visual Elements
- A 5-column table: Algorithm / Expanded / Generated / Cost / Optimal? Build as a `VGroup` of `Text` rows.
- Rows fade in one at a time; the A\* (LP+ALT) row gets a GOLD `SurroundingRectangle` and `Indicate`.
- Cost cells coloured: 450 in RED, 418 in GREEN. Optimal column: ✓ GREEN / ✗ RED.
- A companion bar chart of the mean-ratio numbers (LP 0.729, lm2 0.905, lm4 0.968, lm8 0.985, combined 0.986) — this is where ALT's real win lives.

### Content
**Default table — four rows.** Measured on Arad→Bucharest with the shipped code:

| Algorithm | Expanded | Generated | Cost | Optimal |
|---|---|---|---|---|
| BFS | 6 | 9 | 450 | ✗ |
| Greedy | 5 | 10 | 418 | ✓ (not guaranteed) |
| UCS | 13 | 14 | 418 | ✓ |
| **A\* (LP+ALT)** | **5** | **10** | **418** | **✓** |

Read it as trade-offs, not a leaderboard. BFS is cheap and wrong. UCS is right and pays 13 expansions. Greedy is cheap and *happens* to be right here — on 61 of 380 pairs it is not. A\* matches the cheapest correct method at 5 expansions while being the only row where optimality is a theorem rather than an outcome.

Keep DFS (4/8, 450, ✗) and Bidirectional A\* (6/16, 418, ✓) as **optional extra rows only if the Q&A demands them**. Both weaken the frame: DFS says nothing BFS has not already said, and bidirectional A\* generating 16 nodes actively undercuts the row being crowned. If a row for A\*(LP) alone is added, it reads 5/10/418/✓ — identical to the hero row, which is the honesty point Scene 8 already made and the bar chart is about to make better.

Then the pivot to where ALT actually pays: the bar chart. On this one pair, LP and LP+ALT tie. Across 380 pairs, the heuristic goes from 73% of true distance to 98.5%, and from exact on a handful of pairs to exact on 360 of 380. Twenty cities is too small a stage for the node counts to show it.

### Voiceover
- **Text**: "Every algorithm, same problem, measured on the shipped code. Breadth-first: six expansions, four hundred fifty kilometres — wrong. Uniform-cost: four eighteen, and thirteen expansions to get it. Greedy: four eighteen in five — but that is luck, not a guarantee. On sixty-one of three hundred eighty pairs it is not optimal. A-star with the combined heuristic: five expansions, four hundred eighteen, and here optimality is a theorem, not an outcome. One honest note before I move on. On this pair, the LP alone and the LP plus landmarks tie exactly — five expansions, ten generated, both. So where does the landmark work actually show up? Here. Across all three hundred eighty pairs, the estimate goes from seventy-three percent of the true distance to ninety-eight point five. And from rarely exact, to exact on three hundred sixty pairs out of three hundred eighty. Twenty cities is too small a map for that to show up in the node counts. It shows up in the quality of the estimate."
- **Sync Points**: "wrong" → the RED ✗ stamps on the BFS row. "that is luck" → the greedy ✓ dims to grey and gains a small "(not guaranteed)" tag. "optimality is a theorem" → gold box draws around the A\* row. "Here." → table slides left, bar chart grows in from the right.

### Technical Notes
- Numbers are measured, not estimated — do not round or re-derive them in the script.
- If runtime needs trimming to ~60 s: shorten the row reveals, not the bar chart. Never cut the bar chart — it carries the only honest claim about ALT's value, and Scene 8 already conceded the node-count tie.

---

## Scene 10: `Scene10_Conclusion`
**Duration**: ~60 s
**Purpose**: Recap the three ideas, point at the live app and the repo.

### Visual Elements
- Three summary cards, `LaggedStart` in from below: **"Chord → roads (LP): 0.729"**, **"Landmarks → triangle inequality: 0.985"**, **"max of both: 0.986, admissible"**.
- The full map returning at low opacity with the green 418 path still lit.
- `Square(side_length=2.2, color=WHITE)` placeholder with `Text("QR", font_size=48)` centred — **replace before render** with the real deployed-app QR as an `ImageMobject`.
- `Text("github.com/NukerDucker/rome-pathfinding", font_size=26, color=LIGHT_GRAY)` — verified against `git remote -v`. The **deployed-app URL is not recorded in the repo** (no URL in README); get it from the user before rendering.
- Final title card matching Scene 1's typography.

### Content
Three sentences, one per idea. The heuristic came from a linear program over road vectors and a set of landmark distances, neither of which is a straight-line distance, and their max is admissible and reaches 98.6% of the truth. A\* on top of it returns 418 km in five expansions, optimally. Then the call to action: the app is live, every algorithm in that table is in the dropdown, and landmarks are clickable — pick your own and watch the heuristic change.

### Voiceover
- **Text**: "So: no GPS, no straight lines, no outside data. A linear program that rebuilds the straight chord out of road vectors, giving seventy-three percent of the true distance and never overestimating. Landmarks at the edges of the map, where the triangle inequality collapses into an exact answer — ninety-eight and a half percent. Take the max of the two and you get ninety-eight point six, still admissible, admissible for two independent reasons. Put A-star on top and Arad to Bucharest costs five expansions and four hundred eighteen kilometres, provably optimal. The app is live — every algorithm in that table is in the dropdown, and you can click any city to make it a landmark and watch the estimate change. Code is on GitHub. Thanks for watching."
- **Sync Points**: card 1 / card 2 / card 3 land on their respective ratio numbers. "The app is live" → QR scales in from 0. "Thanks for watching" → everything fades but the title.

### Technical Notes
- The QR placeholder **must** be swapped for a real image before the 1080p render. Generate at ≥512 px and load with `ImageMobject(...).scale_to_fit_width(2.2)`. Add a white `Rectangle` behind it — QR codes do not scan against `#1a1a2e`.
- GitHub URL is confirmed (`https://github.com/NukerDucker/rome-pathfinding`). The deployed-app URL must come from the user — do not guess it, and do not generate a QR until it is known.

---

## Runtime budget

| Scene | Spec | 12-min trim |
|---|---|---|
| 1 Intro | 60 | 50 |
| 2 MapReveal | 90 | 75 |
| 3 BlindSearch | 90 | 75 |
| 4 GreedyFail | 60 | 55 |
| 5 AStarIntro | 60 | 50 |
| 6 LP | 120 | 100 |
| 7 ALT | 120 | 120 (do not cut) |
| 8 AStarTrace | 150 | 150 (do not cut) |
| 9 Performance | 90 | 60 |
| 10 Conclusion | 60 | 45 |
| **Total** | **900 s (15:00)** | **780 s (13:00)** |

Scenes 7 and 8 are the graded core — creativity of the heuristic, and completeness of the algorithm trace. Trim everything else first. To reach a hard 12:00, take the additional 60 s from Scenes 2 and 3, which are the most compressible.

---

## Transitions & Flow

- **Persistent map.** The graph is built once by a shared helper and every scene from 2 to 10 opens on it. Scene transitions are colour resets, not rebuilds — this makes the concatenated video feel continuous instead of like ten separate clips.
- **Formula handoff.** `MathTex("g(n)")` appears at the end of Scene 4 and is transformed into the `g(n)` term of `f = g + h` at the start of Scene 5. The full formula then holds the same top-edge position through Scenes 6, 7, and 8.
- **Ratio-bar motif.** The same bar widget appears in Scene 6 (0.729), Scene 7 (0.905 / 0.968 / 0.985), and Scene 9 (all five). Identical geometry each time, so the growth reads as one continuous argument across the video.
- **The unexpanded yellow dot.** Fagaras is deliberately left yellow at the end of Scene 8 and referenced in Scene 9. It is the video's single visual thesis: the node A\* was smart enough not to visit.
- Every scene ends on a 1.0 s `self.wait()` so ffmpeg `concat` does not clip the final frame.

## Shared Elements

- `build_map(with_labels=True, with_km=True)` — module-level helper returning `(VGroup, dict[str, Dot], dict[tuple[str,str], Line])`. Called by Scenes 1–10.
- `to_manim(px, py)` — the coordinate transform from Scene 2's technical notes. Single definition, module level.
- `ratio_bar(value, label)` — the Scene 6 / 7 / 9 widget.
- `stats_row(node, g, h, f, status)` — the Scene 8 table row builder, also reused for Scene 9's comparison table.
- `ROMANIA_EDGES` — the 23-edge list with km, transcribed verbatim from `src/romania.ts:10-33`.

## Color Palette

| Role | Color | Used for |
|---|---|---|
| Background | `#1a1a2e` | every scene; set once via `config.background_color` |
| Nodes | `WHITE` | unvisited city dots and their labels |
| Edges | `GRAY` | roads |
| Edge weights | `LIGHT_GRAY` | km labels, on a background rectangle |
| Frontier | `YELLOW` | discovered, not yet expanded — rings, not fills |
| Expanded | `BLUE` | popped from the queue |
| Optimal path | `GREEN` | final route, `stroke_width=6`, and the goal ring |
| Heuristic | `ORANGE` | h values, LP vectors, dashed estimate lines |
| Key insight | `GOLD` | landmarks, the 418 payoff, callouts, titles |
| Failure | `RED` | suboptimal paths, ✗ marks, the struck-through SLD formula |

## Pre-render checklist

Every number, expansion order, and α coefficient in this plan is verified against the shipped code. Two items remain open, both external:

1. **Deployed-app URL** — not in the repo. Ask the user, then generate the Scene 10 QR at ≥512 px on a white backing rectangle.
2. **Coordinate transform sanity render** — render Scene 2 alone at `-ql` and eyeball: Oradea top, Eforie bottom-right, Arad far left, clear right gutter, and no label collisions in the Sibiu / Fagaras / Rimnicu / Pitesti cluster. This is the one thing arithmetic cannot confirm.

Then:

3. `add_subcaption()` on every narration beat; check the generated `.srt` for overlapping timings.
4. Confirm the Scene 8 stats panel fits the right gutter without overlapping Bucharest at (+0.35, −2.02) — it is the easternmost node near the panel edge.
5. Render `-ql` end to end and watch it once before touching `-qh`.

### Verification provenance

| Claim | Source |
|---|---|
| Coords, edges, km | `src/romania.ts:10-33, 36-57` |
| hLP values, 388.2053 → 388.21 | `src/heuristic_table.ts`, re-solved via `scripts/gen_heuristic_table.py` |
| LP α decomposition (4 vectors) | scipy/HiGHS re-run over the 46 directed vectors |
| LP admissibility proof | `scripts/gen_heuristic_table.py:66-69` (both orientations), `:103` (bounds 0–1) |
| 2-dp rounding as reason for the 190/190 check | `scripts/gen_heuristic_table.py:155-166` |
| hALT / landmark presets / backdoors | `src/alt.ts:21-24`, `HEURISTIC_GUIDE.md` |
| Six-landmark 418 table | Dijkstra distances via `src/ucs.ts` per landmark |
| Mean ratios 0.7293 / 0.9045 / 0.9676 / 0.9849 / 0.9855 | computed over all 380 directed pairs |
| 360/380 exact, 0/380 LP violations | same sweep |
| All expansion orders and node counts | `ALGORITHMS[k].run('Arad','Bucharest')` on shipped code |
| Greedy 61/380 suboptimal; Bucharest→Arad = 450 | full 380-pair greedy-vs-UCS sweep |
| GitHub URL | `git remote -v` |
