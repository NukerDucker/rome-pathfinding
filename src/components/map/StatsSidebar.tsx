// Algorithm-comparison panel: one column per lane, one row per metric, grouped
// into Live / Result / Performance / Complexity / Landmarks cards.
//
// The 17-metric `cols` array below is the graded contract for the modern UI —
// it is moved verbatim from ModernApp.tsx and must not be edited in place.
import type { ReactNode } from 'react'
import { cityCode, type NodeId } from '@/romania'
import { pathCost, type Step, type AlgoMeta, type SearchResult } from '@/search'
import { Tex } from '@/components/Tex'
import { BENCH_ITERS, type CompareRow } from './bench'
import { laneLmSuffix, type LandmarkCount } from './landmarks'
import type { Theme } from '@/theme'

export type LmEffect = { lm2: number; lm4: number; lm8: number } | null

// Everything one lane contributes to the panel.
type LaneInputs = {
  meta: AlgoMeta
  result: SearchResult
  bench: CompareRow
  lmEffect: LmEffect
  lastIdx: number
  landmark: LandmarkCount
  custom: NodeId[]
}

type StatsSidebarProps = {
  theme: Theme
  start: NodeId
  goal: NodeId
  algo: string
  algo2: string
  stepIdx: number
  laneA: LaneInputs
  laneB: LaneInputs
}

const ALGO_FOOTNOTES: Record<string, string> = {
  bfs: 'Yes* = only when step costs are equal.',
  dfs: 'No* = only if the branching factor b is finite (visited set stops cycles).',
  greedy: 'Not optimal; complete only if b is finite.',
  astar: 'Optimal while the LP heuristic is admissible; complete if b is finite.',
  astaraltonly: 'Optimal (admissible ALT heuristic); complete if b is finite.',
  ucs: 'Optimal & complete for non-negative costs.',
  biucs: 'Optimal & complete for non-negative costs — bidirectional.',
}
export function StatsSidebar({ theme, start, goal, algo, algo2, stepIdx, laneA, laneB }: StatsSidebarProps) {
  const { meta, result, bench: benchA, lmEffect: lmEffectA, lastIdx, landmark: landmarkA, custom: customA } = laneA
  const { meta: meta2, result: result2, bench: benchB, lmEffect: lmEffectB, lastIdx: lastIdx2, landmark: landmarkB, custom: customB } = laneB

  const pathLabel = result.found
    ? `${result.path.map(cityCode).join(' → ')}`
    : '—'
  const pathLabel2 = result2.found
    ? `${result2.path.map(cityCode).join(' → ')}`
    : '—'

  const stepA: Step | undefined = result.steps[Math.min(stepIdx, lastIdx)]
  const stepB: Step | undefined = result2.steps[Math.min(stepIdx, lastIdx2)]
  const finalA: boolean = stepIdx >= lastIdx
  const finalB: boolean = stepIdx >= lastIdx2

  // Combined table — one row per selected algorithm (A and B), one column per
  // metric. Live step-dependent metrics are rated only once both runs are done.
  const atEnd = finalA && finalB
  const finalVisitedA = atEnd ? (result.steps[lastIdx]?.visited.length ?? 0) : NaN
  const finalVisitedB = atEnd ? (result2.steps[lastIdx2]?.visited.length ?? 0) : NaN
  const finalFrontierA = atEnd ? (result.steps[lastIdx]?.frontier.length ?? 0) : NaN
  const finalFrontierB = atEnd ? (result2.steps[lastIdx2]?.frontier.length ?? 0) : NaN
  const costA = result.found ? pathCost(result.path) : NaN
  const costB = result2.found ? pathCost(result2.path) : NaN

  // Which value is objectively better?
  const betterLower = (va: number, vb: number): 'a' | 'b' | undefined =>
    Number.isNaN(va) || Number.isNaN(vb) ? undefined : va < vb ? 'a' : vb < va ? 'b' : undefined
  const betterYes = (sa: string, sb: string): 'a' | 'b' | undefined => {
    const aYes = sa.startsWith('Yes'), bYes = sb.startsWith('Yes')
    if (aYes && !bYes) return 'a'
    if (bYes && !aYes) return 'b'
    return undefined
  }
  const betterPath = (): 'a' | 'b' | undefined => {
    if (result.found && !result2.found) return 'a'
    if (!result.found && result2.found) return 'b'
    if (result.found && result2.found && !Number.isNaN(costA) && !Number.isNaN(costB)) {
      if (costA < costB) return 'a'
      if (costB < costA) return 'b'
    }
    return undefined
  }

  type Col = { label: string; a: ReactNode; b: ReactNode; better?: 'a' | 'b'; wrap?: boolean; section?: string }
  // Mean time over BENCH_ITERS runs, shown in microseconds.
  const fmtUs = (ms: number) => `${(ms * 1000).toFixed(1)}`
  // Right-aligned mono cells: pad single-digit step totals so “/ 5” lines up
  // under “/ 12” in the other lane instead of shifting the slash per row.
  const stepText = (len: number, idx: number) => {
    if (len === 0) return '0 / 0'
    const cur = Math.min(stepIdx, idx) + 1
    const total = len < 10 ? ` ${len}` : String(len)
    return `${cur} / ${total}`
  }
  const benchCost = (r: CompareRow) => (r.found ? String(r.cost) : '—')
  const lmValue = (e: { lm2: number; lm4: number; lm8: number } | null, key: 'lm2' | 'lm4' | 'lm8') =>
    e ? String(e[key]) : '—'

  const cols: Col[] = [
    {
      label: 'Step',
      section: 'Live',
      a: stepText(result.steps.length, lastIdx),
      b: stepText(result2.steps.length, lastIdx2),
    },
    { label: 'Current', a: stepA?.current ?? '—', b: stepB?.current ?? '—' },
    {
      label: 'Visited',
      a: String(stepA?.visited.length ?? 0),
      b: String(stepB?.visited.length ?? 0),
      better: atEnd ? betterLower(finalVisitedA, finalVisitedB) : undefined,
    },
    {
      label: 'Frontier',
      a: String(stepA?.frontier.length ?? 0),
      b: String(stepB?.frontier.length ?? 0),
      better: atEnd ? betterLower(finalFrontierA, finalFrontierB) : undefined,
    },
    {
      label: 'Generated',
      section: 'Result',
      a: String(result.generated),
      b: String(result2.generated),
      better: betterLower(result.generated, result2.generated),
    },
    {
      label: 'Peak memory',
      a: String(benchA.peakFrontier),
      b: String(benchB.peakFrontier),
      better: betterLower(benchA.peakFrontier, benchB.peakFrontier),
    },
    {
      label: 'Path',
      a: finalA ? pathLabel : '—',
      b: finalB ? pathLabel2 : '—',
      better: atEnd ? betterPath() : undefined,
      wrap: true,
    },
    { label: 'Time (µs)', section: 'Performance', a: fmtUs(benchA.ms), b: fmtUs(benchB.ms), better: betterLower(benchA.ms, benchB.ms) },
    {
      label: 'Cost (km)',
      a: benchCost(benchA),
      b: benchCost(benchB),
      better: betterLower(benchA.found ? benchA.cost : NaN, benchB.found ? benchB.cost : NaN),
    },
    {
      label: 'Hops',
      a: benchA.found ? String(benchA.hops) : '—',
      b: benchB.found ? String(benchB.hops) : '—',
      better: betterLower(benchA.found ? benchA.hops : NaN, benchB.found ? benchB.hops : NaN),
    },
    { label: 'T(n)', section: 'Complexity', a: <Tex>{meta.time}</Tex>, b: <Tex>{meta2.time}</Tex> },
    { label: 'S(n)', a: <Tex>{meta.space}</Tex>, b: <Tex>{meta2.space}</Tex> },
    { label: 'Optimal', a: meta.optimal, b: meta2.optimal, better: betterYes(meta.optimal, meta2.optimal) },
    { label: 'Complete', a: meta.complete, b: meta2.complete, better: betterYes(meta.complete, meta2.complete) },
    {
      label: 'landmarks 2',
      section: 'Landmarks',
      a: lmValue(lmEffectA, 'lm2'),
      b: lmValue(lmEffectB, 'lm2'),
      better: lmEffectA && lmEffectB ? betterLower(lmEffectA.lm2, lmEffectB.lm2) : undefined,
    },
    {
      label: '4',
      a: lmValue(lmEffectA, 'lm4'),
      b: lmValue(lmEffectB, 'lm4'),
      better: lmEffectA && lmEffectB ? betterLower(lmEffectA.lm4, lmEffectB.lm4) : undefined,
    },
    {
      label: '8',
      a: lmValue(lmEffectA, 'lm8'),
      b: lmValue(lmEffectB, 'lm8'),
      better: lmEffectA && lmEffectB ? betterLower(lmEffectA.lm8, lmEffectB.lm8) : undefined,
    },
  ]

  // Full row labels (badge name + landmark suffix) reused by both table orientations.
  const rowLabelA = `${meta.label}${laneLmSuffix(meta.usesLandmarks, landmarkA, customA)}`
  const rowLabelB = `${meta2.label}${laneLmSuffix(meta2.usesLandmarks, landmarkB, customB)}`

  // Cell classes for the comparison tables. Numeric-ish Step cells stay on one
  // line (they can reach two digits, e.g. “10 / 12”) instead of wrapping.
  const bentoSections = cols.reduce<{ title: string; rows: Col[] }[]>((acc, c) => {
    if (c.section) acc.push({ title: c.section, rows: [] })
    acc[acc.length - 1].rows.push(c)
    return acc
  }, [])

  const chipBase = 'font-mono text-[11px] px-2 py-[2px] rounded-full whitespace-nowrap'

  const renderKanbanCol = (side: 'a' | 'b', label: string, badgeCls: string, accentCls: string, winnerCls: string, winnerBg: string) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)]">
        <span className={`lane-badge ${badgeCls}`} aria-hidden="true">{side.toUpperCase()}</span>
        <span className={`text-xs font-semibold ${accentCls} truncate`}>{label}</span>
      </div>
      {bentoSections.map(({ title, rows }) => (
        <div key={title} className="ck-card flex flex-col gap-0 rounded-xl bg-[var(--surface-2)] px-3 pt-2 pb-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-ink mb-2">{title}</div>
          {rows.map((c) => {
            const val = c[side], isBetter = c.better === side
            const isYes = val === 'Yes', isNo = val === 'No'
            const rowCls = c.wrap
              ? 'flex flex-col items-start gap-1 py-[3px] border-b border-[rgba(255,255,255,0.04)] last:border-0'
              : 'flex items-center justify-between gap-2 py-[3px] border-b border-[rgba(255,255,255,0.04)] last:border-0'
            return (
              <div key={c.label} className={rowCls}>
                <span className="text-[11px] text-ink truncate">{c.label}</span>
                {isYes ? <span className={`${chipBase} bg-state-path/20 text-state-path-ink font-semibold`}>{val}</span>
                 : isNo ? <span className={`${chipBase} text-ink opacity-40`}>{val}</span>
                 : isBetter ? <span className={`${chipBase} ${winnerBg} ${winnerCls} font-semibold`}>{val}</span>
                 : <span className={`${chipBase} text-ink-bold`}>{val}</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )

  // Algorithm-comparison stats. Rendered once, slotted either into the right
  // sidebar or below the map depending on STATS_IN_SIDEBAR.
  const statsPanel = (
    <section className="compare-panel" aria-labelledby="compare-title">
      <h2 id="compare-title" className="compare-title">
        <span>{theme === 'dnd' ? 'Alchemy comparison' : 'Algorithm comparison'}</span>
        <span className="ct-route">{start} → {goal}</span>
      </h2>
      <div className="grid grid-cols-2 gap-3 p-3">
        {renderKanbanCol('a', rowLabelA, 'lane-badge-a', 'text-map-accent-ink', 'text-map-accent-ink', 'bg-map-accent/15')}
        {renderKanbanCol('b', rowLabelB, 'lane-badge-b', 'text-lane-b-ink', 'text-lane-b-ink', 'bg-lane-b/15')}
      </div>
      <ul className="footnotes">
        {[
          `Time = x̄ of ${BENCH_ITERS} runs (µs)`,
          'live step metrics (Visited/Frontier/Path) compared only at the final frame',
          ALGO_FOOTNOTES[algo] ? `A: ${ALGO_FOOTNOTES[algo]}` : '',
          ALGO_FOOTNOTES[algo2] ? `B: ${ALGO_FOOTNOTES[algo2]}` : '',
        ].filter(Boolean).map((t) => <li key={t}>{t}</li>)}
      </ul>
    </section>
  )

  return statsPanel
}
