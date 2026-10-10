/**
 * One place that owns what an animal factory creates (stage E).
 *
 * Before this, every module's dispose() repeated the same six lines: flip a
 * `disposed` flag, disconnect its IntersectionObserver(s), abort its
 * AbortController, cancel the WAAPI animations still running on its elements,
 * undo its classes/styles, and hand stolen nodes back to their React-owned
 * parents. createLifecycle() takes all of that; dispose() runs everything in
 * registration order (the order the module's disposal used to read).
 */
export interface Lifecycle {
  /** True after dispose() — async callbacks bail on this. */
  readonly disposed: boolean
  /** Signal for every addEventListener the factory installs. */
  readonly signal: AbortSignal
  /** An IntersectionObserver owned by this lifecycle (disconnected on dispose).
   *  Same argument order as the constructor; the module still calls
   *  .observe()/.disconnect() itself as its state changes. */
  observer(cb: IntersectionObserverCallback, options?: IntersectionObserverInit): IntersectionObserver
  /** Cleanup to run on dispose, in registration order. */
  onDispose(fn: () => void): void
  /** Cancel every WAAPI animation still running on these elements at dispose time. */
  cancelOnDispose(...els: (Element | null | undefined)[]): void
  /** Re-append a stolen / <body>-lifted node to its React-owned parent on dispose. */
  restore(el: Element, parent: Element | null | undefined): void
  dispose(): void
}

export function createLifecycle(): Lifecycle {
  const ac = new AbortController()
  const observers: IntersectionObserver[] = []
  const cancels: Element[] = []
  const cleanups: (() => void)[] = []
  let disposed = false

  return {
    get disposed() {
      return disposed
    },
    get signal() {
      return ac.signal
    },
    observer(cb, options) {
      const obs = new IntersectionObserver(cb, options)
      observers.push(obs)
      return obs
    },
    onDispose(fn) {
      cleanups.push(fn)
    },
    cancelOnDispose(...els) {
      for (const el of els) if (el) cancels.push(el)
    },
    restore(el, parent) {
      if (parent) cleanups.push(() => parent.appendChild(el))
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const obs of observers) obs.disconnect()
      ac.abort()
      for (const el of cancels) el.getAnimations().forEach((an) => an.cancel())
      for (const fn of cleanups) fn()
    },
  }
}
