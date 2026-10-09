import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// Typeset a LaTeX expression inline (span element). The time/space complexity
// strings in search.ts are already LaTeX, so they are passed straight through.
//
// Module-level cache: KaTeX renderToString costs ~5-15ms per call and modern
// remounts on every mode switch (its useMemo dies with the unmount). The set of
// strings is tiny and finite (ALGORITHMS' time/space), so this is the same
// pattern as the game's texCache.
const htmlCache = new Map<string, string>()

export function Tex({ children, className }: { children: string; className?: string }) {
  const html = useMemo(() => {
    const hit = htmlCache.get(children)
    if (hit !== undefined) return hit
    const out = katex.renderToString(children, { throwOnError: false, displayMode: false })
    htmlCache.set(children, out)
    return out
  }, [children])
  return <span className={`tex${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}
