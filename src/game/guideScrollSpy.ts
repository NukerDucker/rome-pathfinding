// Port of script.js 1246–1276 (minus the KaTeX pass — the <Tex> component
// typesets the formulas — done at render time now):
//   1. a GIF that fails to load becomes a "pending" box naming its spec
//   2. the contents list highlights the section crossing the upper screen
// `root` defaults to the game guide's tab panel, so the existing call site is
// unchanged; the modern guide passes its own .guide-page-wrap element to get
// the same two behaviours.
export function attachGuideExtras(
  root: ParentNode | null = document.getElementById('tabGuide'),
): () => void {
  const tabGuide = root
  if (!tabGuide) return () => {}
  const cleanups: Array<() => void> = []

  // A GIF that fails to load becomes a "pending" box naming its spec
  for (const fig of tabGuide.querySelectorAll<HTMLElement>('.guide-figure')) {
    const img = fig.querySelector('img')
    if (!img) continue
    const showMissing = () => {
      const box = document.createElement('div')
      box.className = 'guide-figure-missing'
      box.textContent = img.alt + ' — GIF pending (' + fig.dataset.spec + ')'
      img.replaceWith(box)
    }
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) {
      showMissing()
    } else {
      img.addEventListener('error', showMissing, { once: true })
      cleanups.push(() => img.removeEventListener('error', showMissing))
    }
  }

  // Contents list: highlight the section currently being read (the one crossing
  // the upper part of the screen)
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
  cleanups.push(() => observer.disconnect())

  return () => cleanups.forEach((fn) => fn())
}
