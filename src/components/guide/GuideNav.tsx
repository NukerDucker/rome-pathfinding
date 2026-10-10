import { GUIDE_SECTIONS } from './sections'

// Contents list. Rendered from the shared section list rather than hand-written,
// so it cannot drift from the headings. The game guide passes "section" for its
// wooden frame and gets the scroll-spy's .active styling from game.css.
export function GuideNav({ className }: { className?: string }) {
  return (
    <nav className={className ? `guide-nav ${className}` : 'guide-nav'} aria-label="Contents">
      {GUIDE_SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`}>{s.title}</a>
      ))}
    </nav>
  )
}
