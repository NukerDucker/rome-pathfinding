/** Session caches for the numbers that are expensive to recompute on every
 *  mount: the 400-run benchmarks (2 lanes × 401 runs), the landmark-effect
 *  sweeps (3 runs ×2) and the heatmap. A cached `ms` is still an x̄ of 400
 *  runs — the cache changes WHEN it was measured, not what it means, so both
 *  "Time = x̄ of 400 runs" footnotes stay literally true.
 *
 *  ponytail: one bounded Map per result shape, evict-oldest past 64 entries
 *  (a long randomize session can mint many keys; 64 is far more than any
 *  single review needs). Never shrink BENCH_ITERS to win speed. */

const MAX_ENTRIES = 64

export function cached<T>(cache: Map<string, unknown>, key: string, compute: () => T): T {
  const hit = cache.get(key)
  if (hit !== undefined) return hit as T
  const value = compute()
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
  return value
}

/** game UI: `${algo}|${start}|${goal}|${cfg}|${custom}` → Bench */
export const gameBenchCache = new Map<string, unknown>()
/** modern UI: same key shape → CompareRow */
export const modernBenchCache = new Map<string, unknown>()
/** `${algo}|${start}|${goal}` → per-preset generated counts (cfg-independent) */
export const lmEffectCache = new Map<string, unknown>()
/** `${goal}|${cfg}|${custom}` → normalised ALT values */
export const heatCache = new Map<string, unknown>()

/** For a future re-measure affordance and benchmark-integrity tests. */
export function clearBenchCache(): void {
  for (const m of [gameBenchCache, modernBenchCache, lmEffectCache, heatCache]) m.clear()
}
