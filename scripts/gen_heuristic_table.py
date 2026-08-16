#!/usr/bin/env python3
"""Regenerate src/heuristic_table.ts — precomputed LP vector-decomposition heuristic.

h(a, b) = min  Σ αᵢ·kmᵢ
          s.t. Σ αᵢ·vecᵢ = chord_AB,   0 ≤ αᵢ ≤ 1

over the 46 directed road-edge pixel vectors (both directions of the 23
roads).  The real road path is one feasible α assignment, so the LP optimum
is a provable lower bound on road km — admissible for A*.  Adjacent cities
short-circuit to the exact road km (stronger than the LP value).

Values are solved offline with scipy/HiGHS and baked into a TS table, so no
LP solver runs in the browser.  Uses only pixel coords + edge km — no SLD,
no GPS, no real-world coordinates.

Usage (from repo root or anywhere):

    python3 scripts/gen_heuristic_table.py

Requirements: python3, numpy, scipy.  Parses city coords + edges straight
from src/romania.ts so the table can never drift from the app's data.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import linprog

ROOT = Path(__file__).resolve().parent.parent
SRC_ROMANIA = ROOT / "src" / "romania.ts"
OUT = ROOT / "src" / "heuristic_table.ts"

# ── parse src/romania.ts (single source of truth) ──────────────────────────

text = SRC_ROMANIA.read_text()

coords: dict[str, tuple[int, int]] = {}
for line in text.splitlines():
    m = re.match(r"^\s*([^:]+):\s*\{\s*x:\s*(-?\d+),\s*y:\s*(-?\d+)\s*\},\s*$", line)
    if m:
        name = m.group(1).strip().strip("'\"")
        coords[name] = (int(m.group(2)), int(m.group(3)))

edges: list[tuple[str, str, int]] = []
for line in text.splitlines():
    m = re.match(r"^\s*\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*\],\s*$", line)
    if m:
        edges.append((m.group(1), m.group(2), int(m.group(3))))

if len(coords) != 20 or len(edges) != 23:
    sys.exit(f"parse error: {len(coords)} cities, {len(edges)} edges (expected 20/23)")

cities = sorted(coords)
idx = {c: i for i, c in enumerate(cities)}
n = len(cities)

# ── directed edge vectors ───────────────────────────────────────────────────

edge_vecs: list[tuple[int, int]] = []
edge_costs: list[int] = []
for a, b, d in edges:
    ca, cb = coords[a], coords[b]
    edge_vecs.append((cb[0] - ca[0], cb[1] - ca[1]))
    edge_costs.append(d)
    edge_vecs.append((ca[0] - cb[0], ca[1] - cb[1]))
    edge_costs.append(d)

edge_dist = {}
for a, b, d in edges:
    edge_dist[(a, b)] = edge_dist[(b, a)] = d


# ============================================================================
# Solve the vector-decomposition LP for one ordered city pair.
#
#   minimize  Σ αᵢ · kmᵢ
#   subject to  Σ αᵢ · vecᵢ = chord_AB,   0 ≤ αᵢ ≤ 1
#
# The LP finds the cheapest mix of directed road vectors whose sum exactly
# reproduces the start→goal chord.  Because the real road path is itself
# one feasible mix (α = 1 on its edges), the optimum is a lower bound on
# the true road distance — that is the admissibility guarantee A* needs.
#
# Example — Arad (773, 874) → Bucharest (2441, 1760):
#   chord = (2441 − 773, 1760 − 874) = (1668, 886)
#   the LP combines the 46 directed road vectors to reproduce (1668, 886)
#   as cheaply as possible; HiGHS returns ≈ 388.2 km, which is ≤ the true
#   418 km road (Arad → Sibiu → Rimnicu Vilcea → Pitesti → Bucharest).
#
# Returns the LP optimum in km.  Raises RuntimeError if the LP is
# infeasible — every chord is decomposable on a connected map, so a
# failure here means bad input data, not a legitimately unsolvable case.
# ============================================================================
def lp_value(a: str, b: str) -> float:
    ca, cb = coords[a], coords[b]
    res = linprog(
        edge_costs,
        A_eq=[[v[0] for v in edge_vecs], [v[1] for v in edge_vecs]],
        b_eq=[cb[0] - ca[0], cb[1] - ca[1]],
        bounds=[(0, 1)] * len(edge_costs),
        method="highs",
    )
    if not res.success:
        raise RuntimeError(f"LP infeasible for {a} -> {b}")
    return float(res.fun)


# ============================================================================
# Final heuristic value for one pair, with the adjacency shortcut applied.
#
#   h(a, b) = 0                  if a == b
#             exact road km     if a and b share a single road
#             LP optimum        otherwise (see lp_value above)
#
# Examples:
#   h_raw('Arad', 'Arad')        → 0.0      (same city — trivially zero)
#   h_raw('Arad', 'Sibiu')       → 140.0    (direct road — exact km)
#   h_raw('Arad', 'Bucharest')   → ≈388.2   (LP over all 46 vectors)
#
# Why the shortcut?  The LP for an adjacent pair can undercut the road
# km (e.g. the LP gives ≈122.9 for Arad→Sibiu).  Returning the exact
# road km instead is a strictly stronger — and still admissible —
# heuristic, because a direct road is a real path of exactly that cost.
# ============================================================================
def h_raw(a: str, b: str) -> float:
    if a == b:
        return 0.0
    d = edge_dist.get((a, b))
    if d is not None:
        return float(d)  # adjacent → exact road km
    return lp_value(a, b)


# ── ground truth (Floyd–Warshall on road km) ────────────────────────────────

gt = np.full((n, n), float("inf"))
np.fill_diagonal(gt, 0)
for a, b, d in edges:
    i, j = idx[a], idx[b]
    gt[i][j] = gt[j][i] = d
for k in range(n):
    for i in range(n):
        for j in range(n):
            if gt[i][k] + gt[k][j] < gt[i][j]:
                gt[i][j] = gt[i][k] + gt[k][j]

# ── solve all pairs, round, verify admissibility of the ROUNDED values ──────

pairs = [(cities[i], cities[j]) for i in range(n) for j in range(i + 1, n)]


# ============================================================================
# Build the final table at a given decimal precision, keyed in BOTH
# directions so the TypeScript lookup needs no direction logic.
#
# Example (dp=2):  h_raw('Arad', 'Bucharest') = 388.205326…
#                  → rounded to 388.21, stored under both
#                    ('Arad', 'Bucharest') and ('Bucharest', 'Arad')
#
# Rounding happens here, BEFORE the admissibility re-check below: a value
# rounded UP could in principle creep above the true road distance, so
# the caller regenerates at dp=4 if any violation appears (still compact,
# and the guarantee holds for the exact numbers that ship in the table).
# ============================================================================
def rounded_table(dp: int):
    out = {}
    for a, b in pairs:
        v = round(h_raw(a, b), dp)
        out[(a, b)] = out[(b, a)] = v
    return out


table = rounded_table(2)
violations = []
for (a, b), v in table.items():
    if v > gt[idx[a]][idx[b]] + 1e-6:
        violations.append((a, b, v, gt[idx[a]][idx[b]]))
if violations:  # rounding crept above road — retry with more decimals
    table = rounded_table(4)
    violations = []
    for (a, b), v in table.items():
        if v > gt[idx[a]][idx[b]] + 1e-6:
            violations.append((a, b, v, gt[idx[a]][idx[b]]))

ratios = [table[p] / gt[idx[p[0]]][idx[p[1]]] for p in pairs]
n_exact = sum(1 for p in pairs if abs(table[p] - gt[idx[p[0]]][idx[p[1]]]) < 0.5)

print("LP vector-decomposition heuristic — precompute")
print(f"  cities={n}  pairs={len(pairs)}  directed edge vars={len(edge_costs)}")
print(f"  admissible: {len(pairs) - len(violations)}/{len(pairs)}")
print(f"  mean h/road: {float(np.mean(ratios)):.3f}")
print(f"  min ratio:   {float(np.min(ratios)):.3f}")
print(f"  exact (adjacent): {n_exact}")
if violations:
    for a, b, v, road in violations:
        print(f"  VIOLATION {a}->{b}: h={v:.4f} > road={road}")
    sys.exit(1)

# ── emit src/heuristic_table.ts ─────────────────────────────────────────────

keys = sorted(table)
lines = [
    "// AUTO-GENERATED by scripts/gen_heuristic_table.py — DO NOT EDIT BY HAND.",
    "//",
    "// LP vector-decomposition heuristic:",
    "//   h(a,b) = min Σ αᵢ·kmᵢ  s.t.  Σ αᵢ·vecᵢ = chord_AB,  0 ≤ αᵢ ≤ 1",
    "// over the 46 directed road-edge pixel vectors.  The real road path is",
    "// one feasible α assignment, so h ≤ road km (admissible for A*).  Values",
    "// solved offline with scipy/HiGHS; adjacent cities hold exact road km.",
    "// Regenerate:  python3 scripts/gen_heuristic_table.py",
    f"// Verified: {len(pairs) - len(violations)}/{len(pairs)} admissible, mean h/road = {float(np.mean(ratios)):.3f}",
    "//",
    "// Uses only pixel coords + edge km — no SLD, no GPS.",
    "export const HEURISTIC_TABLE: Record<string, number> = {",
]
for a, b in keys:
    lines.append(f"  '{a}|{b}': {table[(a, b)]},")
lines.append("}")

OUT.write_text("\n".join(lines) + "\n")
print(f"\nwrote {OUT.relative_to(ROOT)} ({len(keys)} ordered pairs, {OUT.stat().st_size // 1024} KB)")
