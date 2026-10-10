// The guide's sections, in order — the single source both guides render from.
//
// One string serves as both the section heading and the contents-list label.
// They used to be maintained separately and had drifted apart in three places,
// so the sidebar promised "Our heuristic: ALT" and the page delivered
// "Our second bound: ALT". Deriving the nav from this list makes that
// impossible rather than merely fixed.
export type GuideSectionMeta = {
  /** Anchor id — also the scroll-spy target and the NAV href. */
  id: string
  /** Section heading, used verbatim as the contents-list label. */
  title: string
}

export const GUIDE_SECTIONS: GuideSectionMeta[] = [
  { id: 'g-ucs', title: '1 · Uniform-Cost Search (UCS)' },
  { id: 'g-astar', title: '2 · A★: adding a guess' },
  { id: 'g-heuristic', title: '3 · What a heuristic actually is' },
  { id: 'g-lp', title: '4 · Our first bound: LP vector-decomposition' },
  { id: 'g-alt', title: '5 · Our second bound: ALT (landmarks)' },
  { id: 'g-ensemble', title: '6 · The ensemble: take the maximum' },
  { id: 'g-perf', title: '7 · Does it perform better? (measured)' },
  { id: 'g-map', title: '8 · Reading the maps' },
  { id: 'g-complexity', title: '9 · Time and space complexity' },
]

/** Section by id. Throws rather than rendering a section with a blank heading. */
export function guideSection(id: string): GuideSectionMeta {
  const found = GUIDE_SECTIONS.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown guide section: ${id}`)
  return found
}
