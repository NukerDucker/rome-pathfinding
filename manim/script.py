"""
Romania Pathfinding — A* with a Custom LP + ALT Heuristic
Manim Community Edition animation for the AI assignment YouTube demo.

Run individual scenes:
    manim -ql script.py Scene1_Intro
Run all:
    manim -ql script.py Scene1_Intro Scene2_MapReveal Scene3_BlindSearch \
        Scene4_GreedyFail Scene5_AStarIntro Scene6_LP Scene7_ALT \
        Scene8_AStarTrace Scene9_Performance Scene10_Conclusion
"""

from manim import *
import numpy as np

# ── Global config ─────────────────────────────────────────────────────────────
config.background_color = "#1a1a2e"

# ── Color palette ──────────────────────────────────────────────────────────────
C_FRONTIER  = YELLOW
C_EXPANDED  = BLUE
C_PATH      = GREEN
C_HEURISTIC = ORANGE
C_INSIGHT   = GOLD
C_FAIL      = RED
C_EDGE      = GRAY
C_KM        = LIGHT_GRAY

# ── Romania graph data (verbatim from src/romania.ts) ─────────────────────────
RAW_EDGES = [
    ("Oradea", "Zerind", 71),
    ("Oradea", "Sibiu", 151),
    ("Zerind", "Arad", 75),
    ("Arad", "Sibiu", 140),
    ("Arad", "Timisoara", 118),
    ("Timisoara", "Lugoj", 111),
    ("Lugoj", "Mehadia", 70),
    ("Mehadia", "Drobeta", 75),
    ("Drobeta", "Craiova", 120),
    ("Craiova", "Rimnicu Vilcea", 146),
    ("Craiova", "Pitesti", 138),
    ("Sibiu", "Fagaras", 99),
    ("Sibiu", "Rimnicu Vilcea", 80),
    ("Rimnicu Vilcea", "Pitesti", 97),
    ("Fagaras", "Bucharest", 211),
    ("Pitesti", "Bucharest", 101),
    ("Bucharest", "Giurgiu", 90),
    ("Bucharest", "Urziceni", 85),
    ("Urziceni", "Hirsova", 98),
    ("Hirsova", "Eforie", 86),
    ("Urziceni", "Vaslui", 142),
    ("Vaslui", "Iasi", 92),
    ("Iasi", "Neamt", 87),
]

# Pixel coords — top-left origin, y-down (from src/romania.ts:36-57)
PIXEL_COORDS = {
    "Oradea":          (985,  446),
    "Neamt":          (2471,  630),
    "Zerind":          (865,  658),
    "Iasi":           (2837,  796),
    "Arad":            (773,  874),
    "Sibiu":          (1401, 1058),
    "Fagaras":        (1935, 1102),
    "Vaslui":         (3029, 1128),
    "Timisoara":       (789, 1314),
    "Rimnicu Vilcea": (1539, 1314),
    "Lugoj":          (1171, 1486),
    "Pitesti":        (2011, 1546),
    "Urziceni":       (2745, 1636),
    "Hirsova":        (3159, 1636),
    "Mehadia":        (1187, 1696),
    "Bucharest":      (2441, 1760),
    "Drobeta":        (1171, 1910),
    "Eforie":         (3313, 1942),
    "Craiova":        (1643, 1974),
    "Giurgiu":        (2301, 2062),
}

# Centre + scale (plan.md Scene 2 technical notes)
_CX, _CY = 2043.0, 1254.0
_SCALE    = 0.0034
_MAP_SHIFT = LEFT * 1.0 + DOWN * 0.3

# Label placement per city (plan.md: avoid cluster collisions)
LABEL_DIR = {
    "Arad":           LEFT,
    "Sibiu":          UP,
    "Fagaras":        UP,
    "Rimnicu Vilcea": LEFT,
    "Pitesti":        DOWN,
    "Bucharest":      RIGHT,
    "Craiova":        DOWN,
    "Timisoara":      DOWN,
    "Lugoj":          DOWN,
    "Mehadia":        DOWN,
    "Drobeta":        DOWN,
    "Giurgiu":        DOWN,
    "Oradea":         UP,
    "Zerind":         LEFT,
    "Neamt":          UP,
    "Iasi":           RIGHT,
    "Vaslui":         RIGHT,
    "Urziceni":       UP,
    "Hirsova":        UP,
    "Eforie":         RIGHT,
}

# LP alpha decomposition — verified via scipy/HiGHS re-run (plan.md Scene 6)
LP_VECTORS = [
    ("Rimnicu Vilcea", "Pitesti",   1.0000,  97),
    ("Pitesti",        "Bucharest", 1.0000, 101),
    ("Sibiu",          "Fagaras",   0.9263,  99),
    ("Oradea",         "Sibiu",     0.6524, 151),
]
# hLP(Arad, Bucharest) = 388.21  (heuristic_table.ts:13)

# hLP values on the A*-LP pass (heuristic_table.ts verified values)
H_LP = {
    "Arad":            388.21,
    "Sibiu":           255.06,
    "Rimnicu Vilcea":  198.00,
    "Pitesti":         101.00,
    "Bucharest":         0.00,
    "Fagaras":         211.00,
}

# hALT (lm8) values for goal=Bucharest (plan.md Scene 8 table)
H_ALT = {
    "Arad":            418,
    "Sibiu":           278,
    "Rimnicu Vilcea":  198,
    "Pitesti":         101,
    "Bucharest":         0,
    "Fagaras":         211,
}

# Combined h = max(hLP, hALT) for goal=Bucharest
H_COMBINED = {k: max(H_LP.get(k, 0), H_ALT.get(k, 0)) for k in H_ALT}

# Landmark presets (src/alt.ts)
LM2 = ["Eforie", "Oradea"]
LM4 = LM2 + ["Neamt", "Giurgiu"]
LM8 = LM4 + ["Timisoara", "Vaslui", "Drobeta", "Hirsova"]

# Expansion orders — verified against shipped code (plan.md data corrections)
BFS_ORDER  = ["Arad", "Sibiu", "Timisoara", "Zerind", "Fagaras", "Bucharest"]
UCS_ORDER  = ["Arad", "Zerind", "Timisoara", "Sibiu", "Oradea",
               "Rimnicu Vilcea", "Lugoj", "Fagaras", "Mehadia",
               "Pitesti", "Craiova", "Drobeta", "Bucharest"]
GREEDY_REV = ["Bucharest", "Fagaras", "Sibiu", "Arad"]  # Bucharest→Arad, cost 450
ASTAR_ORDER = ["Arad", "Sibiu", "Rimnicu Vilcea", "Pitesti", "Bucharest"]

# ALT six-landmark table for Arad→Bucharest (plan.md Scene 7)
ALT_TABLE = [
    ("Eforie",    687, 269, 418),
    ("Giurgiu",   508,  90, 418),
    ("Neamt",     824, 406, 418),
    ("Vaslui",    645, 227, 418),
    ("Hirsova",   601, 183, 418),
    ("Timisoara", 118, 536, 418),
    ("Oradea",    146, 429, 283),
    ("Drobeta",   374, 359,  15),
]

# ── Coordinate transform ───────────────────────────────────────────────────────
def to_manim(px: float, py: float) -> np.ndarray:
    """Convert pixel coords (top-left origin, y-down) to Manim frame."""
    return np.array([(px - _CX) * _SCALE, -(py - _CY) * _SCALE, 0.0])


def city_pos(name: str) -> np.ndarray:
    px, py = PIXEL_COORDS[name]
    return to_manim(px, py) + _MAP_SHIFT


# ── Shared map builder ─────────────────────────────────────────────────────────
def build_map(
    with_labels: bool = True,
    with_km: bool = True,
    dot_radius: float = 0.09,
    label_size: int = 14,
    km_size: int = 12,
    edge_width: float = 2.5,
):
    """
    Returns (map_group, dot_lookup, edge_lookup).
    dot_lookup:  dict[str, Dot]
    edge_lookup: dict[tuple[str,str], Line]  — both orientations stored.
    """
    dot_lookup  = {}
    edge_lookup = {}
    edge_group  = VGroup()
    km_group    = VGroup()
    dot_group   = VGroup()
    label_group = VGroup()

    # Edges first (drawn under nodes)
    for a, b, km in RAW_EDGES:
        pa, pb = city_pos(a), city_pos(b)
        line = Line(pa, pb, stroke_width=edge_width, color=C_EDGE)
        edge_group.add(line)
        edge_lookup[(a, b)] = line
        edge_lookup[(b, a)] = line

        if with_km:
            mid = (pa + pb) / 2
            label = Text(str(km), font_size=km_size, color=C_KM)
            label.move_to(mid)
            bg = BackgroundRectangle(label, color=config.background_color, fill_opacity=0.85, buff=0.02)
            km_group.add(VGroup(bg, label))

    # Nodes
    for name, (px, py) in PIXEL_COORDS.items():
        pos = to_manim(px, py) + _MAP_SHIFT
        dot = Dot(pos, radius=dot_radius, color=WHITE)
        dot_lookup[name] = dot
        dot_group.add(dot)

        if with_labels:
            direction = LABEL_DIR.get(name, UP)
            lbl = Text(name, font_size=label_size, color=WHITE)
            lbl.next_to(dot, direction, buff=0.07)
            label_group.add(lbl)

    map_group = VGroup(edge_group, km_group, dot_group, label_group)
    return map_group, dot_lookup, edge_lookup


# ── Ratio bar widget (reused in Scenes 6, 7, 9) ───────────────────────────────
def ratio_bar(value: float, label: str, width: float = 5.0) -> VGroup:
    outline = Rectangle(width=width, height=0.35, color=WHITE, fill_opacity=0)
    fill    = Rectangle(
        width=width * value, height=0.35,
        fill_color=C_HEURISTIC, fill_opacity=0.85,
        stroke_width=0,
    )
    fill.align_to(outline, LEFT)
    lbl = Text(f"{label}  {value:.3f}", font_size=18, color=WHITE)
    lbl.next_to(outline, RIGHT, buff=0.18)
    return VGroup(outline, fill, lbl)


# ── Scene 1: Intro ─────────────────────────────────────────────────────────────
class Scene1_Intro(Scene):
    def construct(self):
        ## Scene1_Intro.ghost_map
        ghost_map, _, _ = build_map(with_labels=False, with_km=False)
        ghost_map.set_opacity(0.15)
        self.add(ghost_map)

        ## Scene1_Intro.title
        title = Text("Romania Pathfinding", font_size=60, color=C_INSIGHT)
        subtitle = Text(
            "A* and a heuristic that never saw a map",
            font_size=28, color=LIGHT_GRAY,
        )
        subtitle.next_to(title, DOWN, buff=0.3)
        title_group = VGroup(title, subtitle).center()

        self.add_subcaption("Romania Pathfinding — a custom A* heuristic without GPS", duration=3)
        self.play(Write(title), run_time=1.5)
        self.play(FadeIn(subtitle, shift=DOWN * 0.2))
        self.wait(1)

        ## Scene1_Intro.sld_ban
        self.play(FadeOut(title_group), run_time=0.6)

        sld_formula = MathTex(
            r"h(n) = \sqrt{(x_n - x_g)^2 + (y_n - y_g)^2}",
            font_size=42,
        ).center()
        strike = Line(
            sld_formula.get_left() + LEFT * 0.1,
            sld_formula.get_right() + RIGHT * 0.1,
            color=C_FAIL, stroke_width=6,
        )

        self.add_subcaption("Straight-line distance — the obvious heuristic — is banned", duration=2.5)
        self.play(Write(sld_formula))
        self.play(Create(strike), run_time=0.5)
        self.wait(0.5)
        self.play(FadeOut(VGroup(sld_formula, strike), scale=0.8))

        ## Scene1_Intro.constraints
        bullets = VGroup(
            Text("• Present ONE algorithm only", font_size=26, color=WHITE),
            Text("• SLD banned in every form", font_size=26, color=WHITE),
            Text("• The heuristic must be custom", font_size=26, color=WHITE),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.35).center()

        self.add_subcaption("Three constraints from the professor", duration=2)
        self.play(LaggedStart(*[FadeIn(b, shift=RIGHT * 0.3) for b in bullets], lag_ratio=0.35))
        self.wait(0.8)

        ## Scene1_Intro.promise
        admissible = Text("admissible", font_size=32, color=C_HEURISTIC)
        admissible.next_to(bullets, DOWN, buff=0.5)
        self.add_subcaption("One rule makes A* work: h must never overestimate — admissible", duration=2.5)
        self.play(FadeIn(admissible, shift=UP * 0.2))
        self.wait(1.5)
        self.play(FadeOut(VGroup(bullets, admissible)))
        self.wait(1)


# ── Scene 2: Map Reveal ────────────────────────────────────────────────────────
class Scene2_MapReveal(Scene):
    def construct(self):
        ## Scene2_MapReveal.build
        map_group, dots, edges = build_map(with_labels=True, with_km=True)
        # Cities sorted west→east for reveal
        cities_we = sorted(PIXEL_COORDS.keys(), key=lambda c: PIXEL_COORDS[c][0])

        # Start invisible
        for child in map_group:
            child.set_opacity(0)

        self.add(map_group)

        ## Scene2_MapReveal.city_wave
        self.add_subcaption("Twenty cities, twenty-three roads", duration=2)
        # Reveal edges first (all at once, faint)
        edge_group = map_group[0]
        self.play(edge_group.animate.set_opacity(1), run_time=1.2, rate_func=smooth)

        # City dots: west→east lag
        dot_anims = [dots[c].animate.set_opacity(1) for c in cities_we]
        self.play(LaggedStart(*dot_anims, lag_ratio=0.12, run_time=2.5))

        # KM labels pop in
        km_group = map_group[1]
        self.play(km_group.animate.set_opacity(1), run_time=0.8)

        # City name labels
        label_group = map_group[3]
        self.play(label_group.animate.set_opacity(1), run_time=0.8)

        ## Scene2_MapReveal.endpoints
        arad_dot = dots["Arad"]
        buch_dot = dots["Bucharest"]
        arad_ring = Circle(radius=0.22, color=C_PATH, stroke_width=3)
        arad_ring.move_to(arad_dot)
        buch_ring = Circle(radius=0.22, color=C_INSIGHT, stroke_width=3)
        buch_ring.move_to(buch_dot)

        header = Text("Arad → Bucharest", font_size=30, color=WHITE)
        header.to_edge(UP, buff=0.25)

        self.add_subcaption("Start: Arad (west).  Goal: Bucharest (south-east)", duration=2.5)
        self.play(
            Create(arad_ring),
            Create(buch_ring),
            Write(header),
        )
        self.play(Flash(arad_dot, color=C_PATH, flash_radius=0.25))
        self.play(Flash(buch_dot, color=C_INSIGHT, flash_radius=0.25))
        self.wait(0.5)

        ## Scene2_MapReveal.fork
        # Highlight the two routes through Sibiu
        fagaras_route  = ["Arad", "Sibiu", "Fagaras", "Bucharest"]
        pitesti_route  = ["Arad", "Sibiu", "Rimnicu Vilcea", "Pitesti", "Bucharest"]

        def highlight_route(route, color):
            anims = []
            for i in range(len(route) - 1):
                key = (route[i], route[i + 1])
                if key in edges:
                    anims.append(edges[key].animate.set_color(color).set_stroke_width(4))
            return anims

        self.add_subcaption("Two routes from Sibiu — the fork that defines the whole video", duration=3)
        self.play(*highlight_route(fagaras_route, C_FAIL), run_time=0.8)
        self.play(*highlight_route(pitesti_route, C_PATH), run_time=0.8)

        cost_label = MathTex(r"450 - 418 = 32 \text{ km}", font_size=30, color=C_INSIGHT)
        cost_label.to_corner(DR, buff=0.35)
        self.add_subcaption("Fagaras route: 450 km.  Pitesti route: 418 km.  Difference: 32 km", duration=3)
        self.play(Write(cost_label))
        self.wait(1.5)

        # Reset edge colors
        all_edges = list(edges.values())
        seen = set()
        unique_edges = []
        for e in all_edges:
            if id(e) not in seen:
                seen.add(id(e))
                unique_edges.append(e)
        self.play(
            *[e.animate.set_color(C_EDGE).set_stroke_width(2.5) for e in unique_edges],
            FadeOut(cost_label),
            run_time=0.6,
        )
        self.wait(0.5)


# ── Scene 3: Blind Search ──────────────────────────────────────────────────────
class Scene3_BlindSearch(Scene):
    def construct(self):
        map_group, dots, edges = build_map(with_labels=True, with_km=True)
        self.add(map_group)

        header = Text("Uninformed Search", font_size=32, color=WHITE).to_edge(UP, buff=0.25)
        self.play(FadeIn(header))

        def reset_nodes():
            return [dots[c].animate.set_color(WHITE) for c in dots]

        def expand_node(name, color=C_EXPANDED, run_time=0.35):
            ring = Circle(radius=0.16, color=C_FRONTIER, stroke_width=2.5)
            ring.move_to(dots[name])
            self.add(ring)
            self.play(dots[name].animate.set_color(color), run_time=run_time)
            self.remove(ring)

        ## Scene3.BFS
        bfs_label = Text("Breadth-First Search", font_size=26, color=C_FRONTIER).to_corner(UL, buff=0.5)
        depth_label = Text("Depth: 0", font_size=20, color=LIGHT_GRAY).next_to(bfs_label, DOWN, buff=0.15)
        self.play(FadeIn(bfs_label), FadeIn(depth_label))

        depths = {"Arad": 0, "Sibiu": 1, "Timisoara": 1, "Zerind": 1,
                  "Fagaras": 2, "Bucharest": 3}
        self.add_subcaption("BFS expands by layers — fewest hops, not shortest distance", duration=3)
        for i, city in enumerate(BFS_ORDER):
            new_depth = Text(f"Depth: {depths[city]}", font_size=20, color=LIGHT_GRAY)
            new_depth.next_to(bfs_label, DOWN, buff=0.15)
            self.play(
                Transform(depth_label, new_depth),
                run_time=0.2,
            )
            expand_node(city, run_time=0.35)

        # BFS result
        bfs_path = ["Arad", "Sibiu", "Fagaras", "Bucharest"]
        self.add_subcaption("BFS reports Arad→Sibiu→Fagaras→Bucharest: 450 km — WRONG", duration=3)
        for i in range(len(bfs_path) - 1):
            key = (bfs_path[i], bfs_path[i + 1])
            if key in edges:
                self.play(edges[key].animate.set_color(C_FAIL), run_time=0.3)

        bfs_card = VGroup(
            RoundedRectangle(corner_radius=0.1, width=3.2, height=1.1, color=C_FAIL, fill_opacity=0.15),
            Text("BFS: 450 km  ✗", font_size=22, color=C_FAIL),
        )
        bfs_card[1].move_to(bfs_card[0])
        bfs_card.to_corner(DR, buff=0.35)
        self.play(FadeIn(bfs_card))
        self.wait(1)

        # Reset
        self.play(*reset_nodes(), run_time=0.5)
        seen_edges = set()
        for a, b, _ in RAW_EDGES:
            key = (a, b)
            if id(edges.get(key)) not in seen_edges:
                seen_edges.add(id(edges.get(key)))
                if key in edges:
                    edges[key].set_color(C_EDGE)

        ## Scene3.UCS
        ucs_label = Text("Uniform-Cost Search", font_size=26, color=C_PATH)
        ucs_label.move_to(bfs_label)
        self.play(Transform(bfs_label, ucs_label))

        g_values = {
            "Arad": 0, "Zerind": 75, "Timisoara": 118, "Sibiu": 140,
            "Oradea": 146, "Rimnicu Vilcea": 220, "Lugoj": 229,
            "Fagaras": 239, "Mehadia": 299, "Pitesti": 317,
            "Craiova": 366, "Drobeta": 374, "Bucharest": 418,
        }

        self.add_subcaption("UCS expands cheapest-g first — correct, but explores in all directions", duration=3)
        g_label = VGroup()
        for city in UCS_ORDER:
            expand_node(city, run_time=0.22)
            g_text = Text(f"g={g_values[city]}", font_size=13, color=LIGHT_GRAY)
            g_text.next_to(dots[city], DOWN, buff=0.12)
            g_label.add(g_text)
            self.add(g_text)

        # Highlight west-expanding note
        west_note = Text("← expands west before reaching Bucharest", font_size=18, color=C_FAIL)
        west_note.to_edge(DOWN, buff=0.3)
        self.add_subcaption("13 of 20 cities expanded — Zerind and Timisoara visited before the goal", duration=3)
        self.play(FadeIn(west_note))

        ucs_card = VGroup(
            RoundedRectangle(corner_radius=0.1, width=3.2, height=1.1, color=C_PATH, fill_opacity=0.15),
            Text("UCS: 418 km  ✓ (13 expanded)", font_size=20, color=C_PATH),
        )
        ucs_card[1].move_to(ucs_card[0])
        ucs_card.next_to(bfs_card, LEFT, buff=0.2)
        self.play(FadeIn(ucs_card))
        self.wait(1.5)
        self.play(FadeOut(VGroup(bfs_card, ucs_card, west_note, g_label, depth_label, bfs_label)))
        self.wait(1)


# ── Scene 4: Greedy Fail ───────────────────────────────────────────────────────
class Scene4_GreedyFail(Scene):
    def construct(self):
        map_group, dots, edges = build_map(with_labels=True, with_km=True)
        self.add(map_group)

        ## Scene4.setup — reverse endpoints
        header = Text("Greedy Search: Bucharest → Arad", font_size=28, color=WHITE)
        header.to_edge(UP, buff=0.25)
        buch_ring = Circle(radius=0.22, color=C_INSIGHT, stroke_width=3).move_to(dots["Bucharest"])
        arad_ring  = Circle(radius=0.22, color=C_PATH,    stroke_width=3).move_to(dots["Arad"])

        self.add_subcaption("On Arad→Bucharest greedy gets lucky — run it backwards to see the flaw", duration=3)
        self.play(FadeIn(header), Create(buch_ring), Create(arad_ring))
        self.wait(0.5)

        ## Scene4.greedy_trace
        # Bucharest → Fagaras → Sibiu → Arad (greedy, cost 450)
        h_labels = {}
        greedy_h = {
            "Bucharest": 388, "Fagaras": 236, "Sibiu": 140, "Arad": 0,
        }  # hLP toward Arad (heuristic_table.ts: Fagaras|Arad=235.98)

        self.add_subcaption("Greedy commits to Fagaras — it looks closer — and returns 450 km", duration=3)
        for city in GREEDY_REV:
            dots[city].set_color(C_EXPANDED)
            h_lbl = Text(f"h≈{greedy_h[city]}", font_size=16, color=C_HEURISTIC)
            h_lbl.next_to(dots[city], RIGHT, buff=0.12)
            h_labels[city] = h_lbl
            self.play(FadeIn(h_lbl), dots[city].animate.set_color(C_EXPANDED), run_time=0.4)

        # Trace the greedy path in red
        greedy_path = ["Bucharest", "Fagaras", "Sibiu", "Arad"]
        for i in range(len(greedy_path) - 1):
            key = (greedy_path[i], greedy_path[i + 1])
            if key in edges:
                self.play(edges[key].animate.set_color(C_FAIL).set_stroke_width(4), run_time=0.3)

        fail_label = MathTex(r"450 > 418", font_size=48, color=C_FAIL)
        fail_label.to_corner(DR, buff=0.5)
        commit_note = Text("Greedy committed — no looking back", font_size=20, color=C_FAIL)
        commit_note.next_to(fail_label, UP, buff=0.2)

        self.add_subcaption("450 > 418: greedy drove to Fagaras and lost 32 km", duration=2.5)
        self.play(Write(fail_label))
        self.play(FadeIn(commit_note))
        self.wait(0.8)

        ## Scene4.stat
        stat = Text("61 of 380 pairs: greedy is suboptimal", font_size=22, color=C_FAIL)
        stat.next_to(commit_note, UP, buff=0.2)
        g_callout = MathTex(r"g(n)", font_size=40, color=C_INSIGHT)
        g_callout.next_to(stat, UP, buff=0.3)

        self.add_subcaption("Greedy ignores g — the cost already driven. That is the flaw.", duration=3)
        self.play(FadeIn(stat))
        self.play(Write(g_callout))
        self.wait(1.5)
        self.play(FadeOut(VGroup(fail_label, commit_note, stat, header, buch_ring, arad_ring,
                                  *h_labels.values())))
        self.wait(1)
        # g(n) persists — used as handoff into Scene 5


# ── Scene 5: A* Intro ──────────────────────────────────────────────────────────
class Scene5_AStarIntro(Scene):
    def construct(self):
        map_group, dots, edges = build_map(with_labels=True, with_km=True)
        self.add(map_group)

        ## Scene5.formula
        eq = MathTex(
            "f(n)", "=", "g(n)", "+", "h(n)",
            font_size=56,
        )
        eq[0].set_color(WHITE)
        eq[2].set_color(C_INSIGHT)
        eq[4].set_color(C_HEURISTIC)
        eq.to_edge(UP, buff=0.35)

        self.add_subcaption("A* combines g (cost driven) and h (estimated remainder)", duration=2.5)
        self.play(Write(eq))

        # Braces under terms
        brace_g = Brace(eq[2], DOWN, buff=0.05, color=C_INSIGHT)
        label_g = Text("cost so far", font_size=18, color=C_INSIGHT)
        brace_g.put_at_tip(label_g)
        brace_h = Brace(eq[4], DOWN, buff=0.05, color=C_HEURISTIC)
        label_h = Text("estimate to goal", font_size=18, color=C_HEURISTIC)
        brace_h.put_at_tip(label_h)
        self.play(
            GrowFromCenter(brace_g), FadeIn(label_g),
            GrowFromCenter(brace_h), FadeIn(label_h),
        )
        self.wait(0.5)

        ## Scene5.map_illustration
        # Show g=140 on Arad→Sibiu, h=? from Sibiu toward Bucharest
        arad_pos = city_pos("Arad")
        sibiu_pos = city_pos("Sibiu")
        buch_pos  = city_pos("Bucharest")

        arad_sibiu = edges.get(("Arad", "Sibiu"))
        if arad_sibiu:
            g_edge = arad_sibiu.copy().set_color(C_INSIGHT).set_stroke_width(4)
            self.add(g_edge)

        g_edge_label = Text("g = 140", font_size=18, color=C_INSIGHT)
        g_edge_label.move_to((arad_pos + sibiu_pos) / 2 + UP * 0.2)
        self.play(FadeIn(g_edge_label), run_time=0.5)

        h_dash = DashedLine(sibiu_pos, buch_pos, dash_length=0.14, color=C_HEURISTIC, stroke_width=3)
        h_q = Text("h = ?", font_size=18, color=C_HEURISTIC)
        h_q.move_to((sibiu_pos + buch_pos) / 2 + UP * 0.2)
        self.add_subcaption("h must never overestimate — admissible. What replaces the straight line?", duration=3)
        self.play(Create(h_dash), FadeIn(h_q))
        self.wait(0.4)

        ## Scene5.admissibility_card
        card_rect = RoundedRectangle(corner_radius=0.12, width=5.5, height=1.0, color=C_INSIGHT, fill_opacity=0.12)
        card_text = MathTex(r"h(n) \leq h^*(n) \quad \forall n", font_size=38, color=C_INSIGHT)
        card_text.move_to(card_rect)
        card = VGroup(card_rect, card_text)
        card.to_corner(DR, buff=0.4)

        self.play(FadeIn(card))
        self.play(Indicate(h_q, color=C_INSIGHT, scale_factor=1.4))
        self.wait(2)
        self.play(FadeOut(VGroup(card, h_dash, h_q, g_edge_label, brace_g, label_g, brace_h, label_h)))
        self.wait(1)


# ── Scene 6: LP Heuristic ──────────────────────────────────────────────────────
class Scene6_LP(Scene):
    def construct(self):
        ## Scene6.layout — map left, math right
        map_group, dots, edges = build_map(with_labels=True, with_km=True)
        map_group.scale(0.62).to_edge(LEFT, buff=0.3)
        self.add(map_group)

        title = Text("Heuristic 1: LP Vector Decomposition", font_size=26, color=C_INSIGHT)
        title.to_edge(UP, buff=0.25)
        self.play(FadeIn(title))

        # Formula (right panel)
        lp_obj = MathTex(
            r"h_{LP}(a,b) = \min \sum_i \alpha_i \cdot km_i",
            font_size=30, color=WHITE,
        )
        lp_con = MathTex(
            r"\text{s.t.} \quad \sum_i \alpha_i \cdot \vec{v}_i = \vec{\text{chord}}_{ab}",
            font_size=28, color=WHITE,
        )
        lp_bnd = MathTex(r"0 \leq \alpha_i \leq 1", font_size=28, color=WHITE)

        lp_block = VGroup(lp_obj, lp_con, lp_bnd).arrange(DOWN, aligned_edge=LEFT, buff=0.25)
        lp_block.to_corner(UR, buff=0.5)

        self.add_subcaption("LP: decompose the Arad→Bucharest chord into road vectors — minimum cost", duration=3)
        self.play(Write(lp_obj))
        self.play(Write(lp_con))
        self.play(Write(lp_bnd))
        self.wait(0.5)

        ## Scene6.chord_and_vectors
        # Map is scaled 0.62, recompute positions
        scale_factor = 0.62
        def map_pos(name):
            px, py = PIXEL_COORDS[name]
            raw = to_manim(px, py) + _MAP_SHIFT
            return raw * scale_factor + LEFT * (1 - scale_factor) * 0  # handled by group transform

        # Approximate positions after scaling (use dot positions from built map)
        # Find Arad and Bucharest dots in scaled map
        arad_pos_s  = dots["Arad"].get_center()
        buch_pos_s  = dots["Bucharest"].get_center()

        chord = Arrow(
            arad_pos_s, buch_pos_s,
            color=C_INSIGHT, buff=0, stroke_width=4,
            tip_length=0.18,
        )
        chord_lbl = Text("chord_AB", font_size=16, color=C_INSIGHT)
        chord_lbl.move_to((arad_pos_s + buch_pos_s) / 2 + UP * 0.18)

        self.add_subcaption("The chord from Arad to Bucharest — rebuilt from road pieces", duration=2.5)
        self.play(GrowArrow(chord), FadeIn(chord_lbl))
        self.wait(0.5)

        ## Scene6.assembly
        # Show the 4 LP vectors assembling (plan.md Scene 6 order)
        # Render assembly off to the right of the map, schematic
        assembly_start = RIGHT * 1.0 + DOWN * 0.5  # right panel, below formula

        vec_colors = [C_PATH, C_PATH, C_HEURISTIC, C_HEURISTIC]
        vec_labels_text = [
            ("Rimnicu Vilcea→Pitesti", "α=1.00", 97),
            ("Pitesti→Bucharest",      "α=1.00", 101),
            ("Sibiu→Fagaras",         "α=0.93",  99),
            ("Oradea→Sibiu",          "α=0.65", 151),
        ]

        self.add_subcaption("Solver output: 4 nonzero alpha vectors — two fractions not on any route", duration=4)
        tip = assembly_start.copy()
        arrows = []
        for i, (name, alpha_str, km) in enumerate(vec_labels_text):
            color = vec_colors[i]
            alpha_val = LP_VECTORS[i][2]
            # Schematic: horizontal arrows stacked
            length = (km * alpha_val / 200) * 2.5  # scale for display
            stroke_w = 3.5 if alpha_val == 1.0 else 2.5
            opacity = 1.0 if alpha_val == 1.0 else 0.75
            arr = Arrow(
                tip, tip + RIGHT * length,
                color=color, stroke_width=stroke_w, tip_length=0.15,
                buff=0,
            )
            arr.set_opacity(opacity)
            lbl = Text(f"{name}  {alpha_str}  ×{km}km", font_size=13, color=color)
            lbl.next_to(arr, UP, buff=0.06)
            self.play(GrowArrow(arr), FadeIn(lbl), run_time=0.5)
            tip = arr.get_end()
            arrows.append(VGroup(arr, lbl))
            if i >= 1:  # fractional ones highlighted
                if alpha_val < 1.0:
                    self.play(arr.animate.shift(UP * 0.15), run_time=0.25)

        # Not-a-route callout
        not_route = Text("← not a connected route — a relaxation", font_size=16, color=C_FAIL)
        not_route.next_to(VGroup(*arrows), DOWN, buff=0.2)
        self.add_subcaption("The fractional vectors float free — this is a relaxation, not a path", duration=3)
        self.play(FadeIn(not_route))
        self.wait(0.5)

        ## Scene6.result
        result = MathTex(
            r"h_{LP}(\text{Arad},\text{Bucharest}) = 388.21",
            font_size=28, color=C_INSIGHT,
        )
        result.next_to(lp_block, DOWN, buff=0.35)
        self.add_subcaption("hLP(Arad, Bucharest) = 388.21 — verified against shipped heuristic_table.ts", duration=2.5)
        self.play(Write(result))

        bar = ratio_bar(0.7293, "mean h/true distance (LP)")
        bar.next_to(result, DOWN, buff=0.3)
        self.add_subcaption("Mean ratio across 380 pairs: 0.729 — admissible, 0 violations", duration=3)
        self.play(FadeIn(bar))
        self.wait(0.8)

        # Leaving 27% note
        remainder = bar[1].copy().set_fill_color(C_FAIL)
        remainder.align_to(bar[1], RIGHT)
        # flash the empty portion
        empty_note = Text("27% of true distance still unaccounted — need a second heuristic", font_size=16, color=C_FAIL)
        empty_note.next_to(bar, DOWN, buff=0.15)
        self.play(FadeIn(empty_note), run_time=0.5)
        self.wait(1.5)
        self.play(FadeOut(VGroup(*arrows, not_route, result, bar, empty_note)))
        self.wait(1)


# ── Scene 7: ALT Heuristic ─────────────────────────────────────────────────────
class Scene7_ALT(Scene):
    def construct(self):
        map_group, dots, edges = build_map(with_labels=True, with_km=False)
        map_group.scale(0.62).to_edge(LEFT, buff=0.3)
        self.add(map_group)

        title = Text("Heuristic 2: Landmarks + Triangle Inequality (ALT)", font_size=24, color=C_INSIGHT)
        title.to_edge(UP, buff=0.25)
        self.play(FadeIn(title))

        ## Scene7.triangle_diagram
        # Off-map schematic: L, n, goal triangle
        L_dot = Dot(RIGHT * 2.5 + UP * 1.0, color=C_INSIGHT)
        n_dot = Dot(RIGHT * 1.2 + DOWN * 0.2, color=WHITE)
        g_dot = Dot(RIGHT * 3.8 + DOWN * 0.2, color=C_PATH)
        L_lbl = Text("L", font_size=18, color=C_INSIGHT).next_to(L_dot, UP, buff=0.07)
        n_lbl = Text("n", font_size=18, color=WHITE).next_to(n_dot, DOWN, buff=0.07)
        g_lbl = Text("goal", font_size=16, color=C_PATH).next_to(g_dot, DOWN, buff=0.07)

        edge_Ln   = Line(L_dot.get_center(), n_dot.get_center(), color=C_EDGE)
        edge_Lg   = Line(L_dot.get_center(), g_dot.get_center(), color=C_EDGE)
        edge_ng   = DashedLine(n_dot.get_center(), g_dot.get_center(), color=C_HEURISTIC, dash_length=0.12)
        label_Ln  = Text("d(L,n)", font_size=14, color=C_EDGE).move_to((L_dot.get_center() + n_dot.get_center()) / 2 + LEFT * 0.3)
        label_Lg  = Text("d(L,g)", font_size=14, color=C_EDGE).move_to((L_dot.get_center() + g_dot.get_center()) / 2 + RIGHT * 0.3)
        label_ng  = Text("d(n,g)≥|d(L,n)−d(L,g)|", font_size=13, color=C_HEURISTIC)
        label_ng.next_to(edge_ng, DOWN, buff=0.08)

        tri_group = VGroup(edge_Ln, edge_Lg, edge_ng, L_dot, n_dot, g_dot,
                           L_lbl, n_lbl, g_lbl, label_Ln, label_Lg, label_ng)
        tri_group.to_corner(UR, buff=0.5)

        self.add_subcaption("Triangle inequality: d(n,goal) ≥ |d(L,n) − d(L,goal)| for any landmark L", duration=3)
        self.play(
            Create(edge_Ln), Create(edge_Lg), Create(edge_ng),
            FadeIn(VGroup(L_dot, n_dot, g_dot, L_lbl, n_lbl, g_lbl, label_Ln, label_Lg, label_ng)),
        )
        self.wait(0.5)

        # Formula
        alt_formula = MathTex(
            r"h_{ALT}(n,g) = \max_L \left| d(L,n) - d(L,g) \right|",
            font_size=26, color=WHITE,
        )
        alt_formula.next_to(tri_group, DOWN, buff=0.3)
        self.play(Write(alt_formula))
        self.wait(0.5)

        ## Scene7.landmarks
        # Place 8 landmark stars, growing from lm2→lm4→lm8
        star_lookup = {}
        for lm in LM8:
            pos = dots[lm].get_center()
            star = Star(n=5, outer_radius=0.14, color=C_INSIGHT, fill_opacity=0.9)
            star.move_to(pos)
            star_lookup[lm] = star

        self.add_subcaption("lm2: 2 landmarks at geographic extremes", duration=1.5)
        self.play(LaggedStart(*[FadeIn(star_lookup[lm]) for lm in LM2], lag_ratio=0.4))
        self.wait(0.3)
        self.add_subcaption("lm4: add Neamt and Giurgiu", duration=1.5)
        self.play(LaggedStart(*[FadeIn(star_lookup[lm]) for lm in LM4 if lm not in LM2], lag_ratio=0.4))
        self.wait(0.3)
        self.add_subcaption("lm8: full set — 8 landmarks at map boundaries", duration=1.5)
        self.play(LaggedStart(*[FadeIn(star_lookup[lm]) for lm in LM8 if lm not in LM4], lag_ratio=0.25))
        self.wait(0.5)

        ## Scene7.eforie_path
        # Eforie's shortest path to Arad runs through Bucharest
        eforie_to_arad = [
            "Eforie", "Hirsova", "Urziceni", "Bucharest",
            "Pitesti", "Rimnicu Vilcea", "Sibiu", "Arad",
        ]
        self.add_subcaption("Eforie's path to Arad runs THROUGH Bucharest — the goal sits on the path", duration=4)
        eforie_path_lines = []
        for i in range(len(eforie_to_arad) - 1):
            a, b = eforie_to_arad[i], eforie_to_arad[i + 1]
            pa = dots[a].get_center()
            pb = dots[b].get_center()
            seg = Line(pa, pb, color=C_INSIGHT, stroke_width=3)
            eforie_path_lines.append(seg)
        self.play(
            *[Create(seg, run_time=0.35) for seg in eforie_path_lines],
        )
        # Flash Bucharest on that path
        self.play(Flash(dots["Bucharest"].get_center(), color=C_PATH, flash_radius=0.25))
        self.wait(0.5)

        exact_note = Text("687 − 269 = 418  (exact!)", font_size=18, color=C_INSIGHT)
        exact_note.next_to(alt_formula, DOWN, buff=0.25)
        self.play(FadeIn(exact_note))
        self.wait(0.5)

        ## Scene7.table (6-exact rows + 2 non-exact)
        table_rows = []
        header_row = VGroup(
            Text("Landmark",  font_size=14, color=LIGHT_GRAY),
            Text("d(L,A)",    font_size=14, color=LIGHT_GRAY),
            Text("d(L,B)",    font_size=14, color=LIGHT_GRAY),
            Text("|diff|",    font_size=14, color=LIGHT_GRAY),
        ).arrange(RIGHT, buff=0.5)
        table_rows.append(header_row)

        for lm, dA, dB, diff in ALT_TABLE:
            color = C_INSIGHT if diff == 418 else LIGHT_GRAY
            row = VGroup(
                Text(lm,      font_size=13, color=color),
                Text(str(dA), font_size=13, color=color),
                Text(str(dB), font_size=13, color=color),
                Text(str(diff), font_size=13, color=color),
            ).arrange(RIGHT, buff=0.5)
            table_rows.append(row)

        table = VGroup(*table_rows).arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        table.to_corner(DR, buff=0.4)

        self.add_subcaption("6 of 8 landmarks return exactly 418 — the goal is on their path to start", duration=4)
        self.play(
            LaggedStart(*[FadeIn(r, shift=UP * 0.1) for r in table_rows], lag_ratio=0.18),
            FadeOut(VGroup(tri_group, alt_formula, exact_note)),
        )
        self.wait(0.5)

        ## Scene7.ratio_bars
        bars = VGroup(
            ratio_bar(0.9045, "lm2"),
            ratio_bar(0.9676, "lm4"),
            ratio_bar(0.9849, "lm8"),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        # Place left of table
        bars.next_to(table, LEFT, buff=0.4)

        lp_ref = ratio_bar(0.7293, "LP (ref)").set_opacity(0.4)
        lp_ref.next_to(bars, DOWN, aligned_edge=LEFT, buff=0.15)

        self.add_subcaption("lm2: 0.905 — lm4: 0.968 — lm8: 0.985 — exact on 360 of 380 pairs", duration=4)
        self.play(LaggedStart(*[FadeIn(b) for b in bars], lag_ratio=0.4))
        self.play(FadeIn(lp_ref))
        self.wait(0.5)

        ## Scene7.combined
        combined_eq = MathTex(r"h = \max(h_{LP},\, h_{ALT})", font_size=28, color=WHITE)
        combined_eq.next_to(bars, UP, buff=0.3)
        combined_ratio = Text("combined: 0.9855  |  0 violations  |  admissible", font_size=16, color=C_INSIGHT)
        combined_ratio.next_to(combined_eq, UP, buff=0.15)
        self.add_subcaption("Combined h = max(hLP, hALT): 0.986, independently admissible", duration=3)
        self.play(Write(combined_eq))
        self.play(FadeIn(combined_ratio))
        self.wait(1.5)
        self.play(FadeOut(VGroup(table, bars, lp_ref, combined_eq, combined_ratio,
                                  *eforie_path_lines, *star_lookup.values())))
        self.wait(1)


# ── Scene 8: A* Trace ──────────────────────────────────────────────────────────
class Scene8_AStarTrace(Scene):
    def construct(self):
        map_group, dots, edges = build_map(with_labels=True, with_km=True)
        # _MAP_SHIFT already baked into city_pos() — do NOT shift again here
        self.add(map_group)

        # Persistent formula top-edge
        eq = MathTex("f(n)", "=", "g(n)", "+", "h(n)", font_size=38)
        eq[0].set_color(WHITE)
        eq[2].set_color(C_INSIGHT)
        eq[4].set_color(C_HEURISTIC)
        eq.to_edge(UP, buff=0.28)
        self.add(eq)

        # Endpoint rings
        arad_ring = Circle(radius=0.22, color=C_PATH,    stroke_width=3).move_to(dots["Arad"])
        buch_ring = Circle(radius=0.22, color=C_INSIGHT, stroke_width=3).move_to(dots["Bucharest"])
        self.add(arad_ring, buch_ring)

        ## Scene8.stats_panel
        # 5 columns: Node | g | h | f | Status
        def make_stats_panel(title_str: str):
            title_t = Text(title_str, font_size=18, color=WHITE)
            header = VGroup(
                Text("Node",   font_size=16, color=LIGHT_GRAY),
                Text("g",      font_size=16, color=C_INSIGHT),
                Text("h",      font_size=16, color=C_HEURISTIC),
                Text("f",      font_size=16, color=WHITE),
                Text("Status", font_size=16, color=LIGHT_GRAY),
            ).arrange(RIGHT, buff=0.28)
            panel = VGroup(title_t, header).arrange(DOWN, aligned_edge=LEFT, buff=0.15)
            panel.to_edge(RIGHT, buff=0.22).shift(DOWN * 0.3)
            return panel, header

        def make_row(node, g, h, f_val, status, status_color=WHITE):
            return VGroup(
                Text(node[:10],  font_size=15, color=WHITE),
                Text(str(g),     font_size=15, color=C_INSIGHT),
                Text(f"{h:.2f}", font_size=15, color=C_HEURISTIC),
                Text(f"{f_val:.2f}", font_size=15, color=WHITE),
                Text(status, font_size=15, color=status_color),
            ).arrange(RIGHT, buff=0.28)

        # ── Pass 1: LP only ────────────────────────────────────────────────────
        pass_label = Text("Pass 1: A* with LP only", font_size=20, color=C_HEURISTIC)
        pass_label.to_corner(UL, buff=0.5)
        self.play(FadeIn(pass_label))

        panel_title = Text("Node / g / h(LP) / f / Status", font_size=16, color=LIGHT_GRAY)
        panel_title.to_edge(RIGHT, buff=0.22).shift(UP * 0.8)
        self.play(FadeIn(panel_title))

        # Pass 1 trace: g, h(LP), f
        pass1_data = [
            ("Arad",            0,   388.21, 388.21),
            ("Sibiu",         140,   255.06, 395.06),
            ("Rimnicu Vilcea", 220,  198.00, 418.00),
            ("Pitesti",        317,  101.00, 418.00),
            ("Bucharest",      418,    0.00, 418.00),
        ]

        rows_p1 = VGroup()
        row_start = panel_title.get_bottom() + DOWN * 0.15

        self.add_subcaption("Pass 1 — A* with LP: f climbs from 388 to 418 across 5 expansions", duration=4)
        frontier_rings = {}
        for city in ["Sibiu", "Timisoara", "Zerind"]:  # initial frontier from Arad
            ring = Circle(radius=0.15, color=C_FRONTIER, stroke_width=2)
            ring.move_to(dots[city])
            frontier_rings[city] = ring
        self.add(*frontier_rings.values())

        for i, (node, g, h, f_val) in enumerate(pass1_data):
            dots[node].set_color(C_EXPANDED)
            row = make_row(node, g, h, f_val, "expanded", C_EXPANDED)
            row.move_to(row_start + DOWN * i * 0.38)
            self.play(
                FadeIn(row, shift=UP * 0.1),
                dots[node].animate.set_color(C_EXPANDED),
                run_time=0.5,
            )
            rows_p1.add(row)
            # Remove frontier ring if present
            if node in frontier_rings:
                self.remove(frontier_rings[node])

            # Show f-value rising
            if i < 2:
                self.play(Indicate(row[-2], color=C_HEURISTIC, scale_factor=1.3), run_time=0.3)

        self.add_subcaption("The f column climbs: 388 → 395 → 418. Each rise = estimate was optimistic.", duration=3)
        self.wait(1)

        # Reset for pass 2
        self.play(FadeOut(VGroup(rows_p1, pass_label, panel_title, *frontier_rings.values())), run_time=0.4)
        self.play(*[dots[c].animate.set_color(WHITE) for c in dots], run_time=0.4)

        # ── Pass 2: LP + ALT ───────────────────────────────────────────────────
        pass_label2 = Text("Pass 2: A* with LP + ALT", font_size=20, color=C_INSIGHT)
        pass_label2.to_corner(UL, buff=0.5)
        self.play(FadeIn(pass_label2))

        panel_title2 = Text("Node / g / h(max) / f / Status", font_size=16, color=LIGHT_GRAY)
        panel_title2.to_edge(RIGHT, buff=0.22).shift(UP * 0.8)
        self.play(FadeIn(panel_title2))

        pass2_data = [
            ("Arad",            0,   418, 418),
            ("Sibiu",         140,   278, 418),
            ("Rimnicu Vilcea", 220,  198, 418),
            ("Pitesti",        317,  101, 418),
            ("Bucharest",      418,    0, 418),
        ]

        self.add_subcaption("Pass 2 — A* LP+ALT: f is 418 before the first step — never moves", duration=4)
        rows_p2 = VGroup()

        # Show initial frontier
        f2_rings = {}
        for city in ["Sibiu", "Timisoara", "Zerind"]:
            ring = Circle(radius=0.15, color=C_FRONTIER, stroke_width=2)
            ring.move_to(dots[city])
            f2_rings[city] = ring
        self.add(*f2_rings.values())

        for i, (node, g, h, f_val) in enumerate(pass2_data):
            dots[node].set_color(C_EXPANDED)
            row = make_row(node, g, h, f_val, "expanded", C_EXPANDED)
            row.move_to(row_start + DOWN * i * 0.38)
            self.play(
                FadeIn(row, shift=UP * 0.1),
                dots[node].animate.set_color(C_EXPANDED),
                run_time=0.5,
            )
            rows_p2.add(row)
            if node in f2_rings:
                self.remove(f2_rings[node])

            # After Sibiu: fork freeze
            if node == "Sibiu":
                # Fagaras on frontier with f=450
                fagaras_ring = Circle(radius=0.15, color=C_FRONTIER, stroke_width=2)
                fagaras_ring.move_to(dots["Fagaras"])
                rimnicu_ring = Circle(radius=0.15, color=C_FRONTIER, stroke_width=2)
                rimnicu_ring.move_to(dots["Rimnicu Vilcea"])
                self.add(fagaras_ring, rimnicu_ring)
                # rimnicu_ring removed after freeze (Fagaras stays)

                # Fork panel
                fork_rimnicu = make_row("Rimnicu V", 220, 198, 418, "f=418", C_PATH)
                fork_fagaras = make_row("Fagaras",   239, 211, 450, "f=450", C_FAIL)
                fork_group = VGroup(fork_rimnicu, fork_fagaras).arrange(DOWN, buff=0.2)
                fork_group.to_corner(DR, buff=0.4)
                fork_header = Text("The fork — 2.5 s freeze", font_size=16, color=WHITE)
                fork_header.next_to(fork_group, UP, buff=0.1)

                self.add_subcaption("FREEZE — Rimnicu f=418 vs Fagaras f=450. The heuristic already knows.", duration=3)
                self.play(FadeIn(VGroup(fork_header, fork_group)))
                self.wait(2.5)  # THE FREEZE
                self.play(FadeOut(VGroup(fork_header, fork_group)))
                self.remove(fagaras_ring)
                self.remove(rimnicu_ring)  # rimnicu will be turned BLUE on next expansion

                # Fagaras stays yellow permanently
                fagaras_yellow = Circle(radius=0.15, color=C_FRONTIER, stroke_width=2)
                fagaras_yellow.move_to(dots["Fagaras"])
                self.add(fagaras_yellow)

        self.add_subcaption("f never moved. The search knew the answer from Arad.", duration=2.5)
        # Flash all f cells gold
        f_cells = [rows_p2[i][-2] for i in range(len(pass2_data))]
        self.play(AnimationGroup(*[Indicate(cell, color=C_INSIGHT) for cell in f_cells]))
        self.wait(0.5)

        ## Scene8.optimal_path
        opt_path = ["Arad", "Sibiu", "Rimnicu Vilcea", "Pitesti", "Bucharest"]
        for i in range(len(opt_path) - 1):
            key = (opt_path[i], opt_path[i + 1])
            if key in edges:
                edges[key].set_color(C_PATH).set_stroke_width(5)
        for city in opt_path:
            dots[city].set_color(C_PATH)

        # Sum animation
        cost_sum = MathTex(
            r"140 + 80 + 97 + 101 = 418",
            font_size=32, color=C_PATH,
        )
        cost_sum.to_corner(DL, buff=0.4)
        big_418 = Text("418 km — optimal", font_size=44, color=C_PATH)
        big_418.next_to(cost_sum, UP, buff=0.25)

        self.add_subcaption("Optimal path: 140 + 80 + 97 + 101 = 418 km", duration=3)
        self.play(Write(cost_sum))
        self.play(FadeIn(big_418))
        self.wait(1.5)
        self.play(FadeOut(VGroup(rows_p2, pass_label2, panel_title2, cost_sum, big_418)))
        self.wait(1)


# ── Scene 9: Performance table ─────────────────────────────────────────────────
class Scene9_Performance(Scene):
    def construct(self):
        map_group, dots, edges = build_map(with_labels=False, with_km=False)
        map_group.set_opacity(0.2)
        # Keep optimal path lit
        opt_path = ["Arad", "Sibiu", "Rimnicu Vilcea", "Pitesti", "Bucharest"]
        for i in range(len(opt_path) - 1):
            key = (opt_path[i], opt_path[i + 1])
            if key in edges:
                edges[key].set_opacity(0.6).set_color(C_PATH)
        self.add(map_group)

        title = Text("Algorithm Comparison — Arad → Bucharest", font_size=28, color=WHITE)
        title.to_edge(UP, buff=0.25)
        self.play(FadeIn(title))

        ## Scene9.table
        headers = ["Algorithm", "Expanded", "Generated", "Cost", "Optimal"]
        rows_data = [
            ("BFS",            "6",  "9",  "450", "✗"),
            ("Greedy",         "5",  "10", "418", "✓*"),
            ("UCS",            "13", "14", "418", "✓"),
            ("A* (LP+ALT)",    "5",  "10", "418", "✓"),
        ]

        col_widths = [2.8, 1.5, 1.8, 1.2, 1.5]
        col_positions = []
        x = -4.2
        for w in col_widths:
            col_positions.append(x + w / 2)
            x += w

        def make_table_row(cells, colors, size=20, bold_last=False):
            row = VGroup()
            for i, (cell, color) in enumerate(zip(cells, colors)):
                t = Text(cell, font_size=size, color=color)
                t.move_to([col_positions[i], 0, 0])
                row.add(t)
            return row

        header_colors = [LIGHT_GRAY] * 5
        header_row = make_table_row(headers, header_colors, size=18)
        header_row.shift(UP * 0.5)
        self.play(FadeIn(header_row))

        row_y = [0.0, -0.55, -1.1, -1.65]
        row_mobjects = []
        for i, (algo, exp, gen, cost, opt) in enumerate(rows_data):
            cost_col = C_FAIL if cost == "450" else C_PATH
            opt_col  = C_FAIL if opt  == "✗"  else (YELLOW if opt == "✓*" else C_PATH)
            algo_col = C_INSIGHT if algo == "A* (LP+ALT)" else WHITE
            colors = [algo_col, WHITE, WHITE, cost_col, opt_col]
            row = make_table_row([algo, exp, gen, cost, opt], colors, size=18)
            row.shift(UP * row_y[i])

            self.add_subcaption(f"{algo}: {exp} expanded, cost {cost}, optimal {opt}", duration=1.2)
            self.play(FadeIn(row, shift=RIGHT * 0.15), run_time=0.45)
            row_mobjects.append(row)

        # Gold box around A* row
        astar_row = row_mobjects[3]
        gold_box = SurroundingRectangle(astar_row, color=C_INSIGHT, buff=0.08)
        self.play(Create(gold_box))
        self.add_subcaption("A* LP+ALT: cheapest correct algorithm — optimality is a theorem, not luck", duration=3)
        self.play(Indicate(astar_row, color=C_INSIGHT))
        self.wait(0.5)

        # Greedy asterisk note
        greedy_note = Text("* not guaranteed optimal — 61/380 pairs fail", font_size=14, color=YELLOW)
        greedy_note.next_to(row_mobjects[1], RIGHT, buff=0.25)
        self.play(FadeIn(greedy_note))

        ## Scene9.bar_chart
        # greedy_note excluded from shift — already placed relative to its row
        table_group = VGroup(header_row, *row_mobjects, gold_box)
        self.add_subcaption("Where ALT really wins: mean h across all 380 pairs", duration=2.5)
        self.play(table_group.animate.shift(LEFT * 2.5), greedy_note.animate.shift(LEFT * 2.5))

        bars = VGroup(
            ratio_bar(0.7293, "LP",           width=3.5),
            ratio_bar(0.9045, "lm2",          width=3.5),
            ratio_bar(0.9676, "lm4",          width=3.5),
            ratio_bar(0.9849, "lm8",          width=3.5),
            ratio_bar(0.9855, "LP+ALT",       width=3.5),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        bars.to_corner(UR, buff=0.5)

        self.play(LaggedStart(*[FadeIn(b) for b in bars], lag_ratio=0.3))
        exact_note = Text("exact on 360 / 380 pairs (lm8)", font_size=16, color=C_INSIGHT)
        exact_note.next_to(bars, DOWN, buff=0.2)
        self.play(FadeIn(exact_note))
        self.wait(2)
        self.play(FadeOut(VGroup(table_group, bars, exact_note, title)))
        self.wait(1)


# ── Scene 10: Conclusion ───────────────────────────────────────────────────────
class Scene10_Conclusion(Scene):
    def construct(self):
        ## Scene10.ghosted_map
        map_group, dots, edges = build_map(with_labels=False, with_km=False)
        map_group.set_opacity(0.15)
        opt_path = ["Arad", "Sibiu", "Rimnicu Vilcea", "Pitesti", "Bucharest"]
        for i in range(len(opt_path) - 1):
            key = (opt_path[i], opt_path[i + 1])
            if key in edges:
                edges[key].set_opacity(0.6).set_color(C_PATH)
        self.add(map_group)

        ## Scene10.summary_cards
        card_texts = [
            ("Chord → road vectors (LP)", "0.729 — admissible, 0 violations"),
            ("Landmarks + triangle ineq. (ALT)", "0.985 — exact on 360/380 pairs"),
            ("max(hLP, hALT)", "0.986 — independent admissibility"),
        ]
        card_colors = [C_HEURISTIC, C_INSIGHT, WHITE]

        cards = []
        for (title_str, body_str), color in zip(card_texts, card_colors):
            rect = RoundedRectangle(corner_radius=0.12, width=5.5, height=1.0, color=color, fill_opacity=0.12)
            t    = Text(title_str, font_size=20, color=color).move_to(rect).shift(UP * 0.15)
            b    = Text(body_str,  font_size=16, color=LIGHT_GRAY).next_to(t, DOWN, buff=0.05)
            cards.append(VGroup(rect, t, b))

        card_group = VGroup(*cards).arrange(DOWN, buff=0.25).center()

        self.add_subcaption("Three ideas — no GPS, no SLD — that give 98.6% of the true distance", duration=3)
        self.play(LaggedStart(*[FadeIn(c, shift=UP * 0.2) for c in cards], lag_ratio=0.4))
        self.wait(0.5)

        ## Scene10.result_and_links
        result_line = Text("A*: Arad→Bucharest = 418 km, 5 expansions, provably optimal", font_size=20, color=C_PATH)
        result_line.next_to(card_group, DOWN, buff=0.4)
        self.play(FadeIn(result_line))
        self.wait(0.5)

        ## Scene10.qr_code
        import os
        qr_path = os.path.join(os.path.dirname(__file__), "qr.png")
        qr_img = ImageMobject(qr_path).scale_to_fit_width(2.0)
        qr_bg  = Rectangle(
            width=qr_img.width + 0.15, height=qr_img.height + 0.15,
            fill_color=WHITE, fill_opacity=1, stroke_width=0,
        )
        qr_bg.move_to(qr_img)
        qr_group = Group(qr_bg, qr_img)  # Group (not VGroup) — ImageMobject is not VMobject
        qr_group.to_corner(DR, buff=0.4)
        url_lbl = Text("ro-pathfinding.netlify.app", font_size=16, color=LIGHT_GRAY)
        url_lbl.next_to(qr_group, UP, buff=0.12)

        github_lbl = Text(
            "github.com/NukerDucker/rome-pathfinding",
            font_size=18, color=LIGHT_GRAY,
        )
        github_lbl.next_to(qr_group, LEFT, buff=0.4)

        self.add_subcaption("The app is live — every algorithm in the dropdown, landmarks clickable", duration=3)
        self.play(FadeIn(qr_group, scale=0.8), FadeIn(url_lbl), FadeIn(github_lbl))
        self.wait(1)

        ## Scene10.final_title
        self.play(
            FadeOut(card_group), FadeOut(result_line),
            FadeOut(qr_group), FadeOut(url_lbl), FadeOut(github_lbl),
            run_time=0.8,
        )
        final = VGroup(
            Text("Romania Pathfinding", font_size=56, color=C_INSIGHT),
            Text("A* · LP + ALT Heuristic · 0.986 mean ratio", font_size=24, color=LIGHT_GRAY),
        ).arrange(DOWN, buff=0.3).center()
        self.play(Write(final[0]))
        self.play(FadeIn(final[1]))
        self.wait(2)
        self.play(FadeOut(final))
        self.wait(1)
