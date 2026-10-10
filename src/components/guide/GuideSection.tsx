import type { ReactNode } from 'react'
import { guideSection } from './sections'

type Props = {
  /** Section id from GUIDE_SECTIONS; supplies the heading too. */
  id: string
  /** Skin hook — the game guide passes "section" for its wooden frame. */
  className?: string
  children: ReactNode
}

// One guide topic: a titled card. Both guides render their sections through
// this, so the heading level and the head-to-body spacing stay in step, and a
// section cannot be added without a matching contents-list entry.
export function GuideSection({ id, className, children }: Props) {
  const { title } = guideSection(id)

  return (
    <section id={id} className={className ? `guide-section ${className}` : 'guide-section'}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}
