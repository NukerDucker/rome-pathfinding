import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// Typeset a LaTeX expression inline (span element). The time/space complexity
// strings in search.ts are already LaTeX, so they are passed straight through.
export function Tex({ children, className }: { children: string; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(children, { throwOnError: false, displayMode: false }),
    [children],
  )
  return <span className={`tex${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}
