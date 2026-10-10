// Marks the section the reader is currently on in the contents list — the one
// crossing the upper part of the screen.
//
// The broken-GIF fallback that used to live here is gone: Figure.tsx owns that
// now, for both guides, so an unloaded animation cannot be handled two
// different ways depending on which guide you are reading.
//
// `root` defaults to the game guide's tab panel; the modern guide passes its
// own .guide-page-wrap element.
export function attachGuideExtras(
  root: ParentNode | null = document.getElementById('tabGuide'),
): () => void {
  const tabGuide = root
  if (!tabGuide) return () => {}

  const navLinks = new Map<string, HTMLAnchorElement>(
    [...tabGuide.querySelectorAll<HTMLAnchorElement>('.guide-nav a')].map((a) => [
      (a.getAttribute('href') ?? '').slice(1),
      a,
    ]),
  )
  const markActive = (id: string) =>
    navLinks.forEach((a, key) => {
      a.classList.toggle('active', key === id)
      if (key === id) a.setAttribute('aria-current', 'true')
      else a.removeAttribute('aria-current')
    })

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) markActive((e.target as HTMLElement).id)
    },
    { rootMargin: '0px 0px -70% 0px' },
  )
  tabGuide.querySelectorAll('.guide-section').forEach((sec) => observer.observe(sec))

  return () => observer.disconnect()
}
