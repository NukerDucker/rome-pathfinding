/** Link to the source repo, pinned top-left in both UIs. Same markup in each;
 *  the modern masthead and the game corner style it like their mode switch.
 *  lucide dropped brand icons, so the GitHub mark is inlined. The repo path
 *  text hides on narrow screens, where it would run into the centred title.
 *  `pixel` swaps in a 16x16 pixel-art mark for the game UI. */
const REPO_URL = 'https://github.com/NukerDucker/rome-pathfinding'

// GitHub mark on a 16x16 grid: the disc in ink, the cat cut out of it.
const PIXEL_MARK =
  'M5 0h6v1h-6zM3 1h10v1h-10zM2 2h12v1h-12zM1 3h3v1h-3zM5 3h6v1h-6zM12 3h3v1h-3zM1 4h3v1h-3zM6 4h4v1h-4zM12 4h3v1h-3zM0 5h3v1h-3zM13 5h3v1h-3zM0 6h3v1h-3zM13 6h3v1h-3zM0 7h3v1h-3zM13 7h3v1h-3zM0 8h3v1h-3zM13 8h3v1h-3zM0 9h3v1h-3zM13 9h3v1h-3zM0 10h4v1h-4zM12 10h4v1h-4zM1 11h2v1h-2zM4 11h2v1h-2zM10 11h5v1h-5zM1 12h2v1h-2zM5 12h1v1h-1zM10 12h5v1h-5zM2 13h3v1h-3zM10 13h4v1h-4zM3 14h3v1h-3zM10 14h3v1h-3zM5 15h1v1h-1zM10 15h1v1h-1z'

export default function RepoLink({ pixel = false }: { pixel?: boolean }) {
  return (
    <a
      className="repo-link"
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Source code on GitHub (opens in a new tab)"
      title="Source code on GitHub"
    >
      {pixel ? (
        <svg viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
          <path d={PIXEL_MARK} />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      )}
      <span className="repo-link-text">NukerDucker/rome-pathfinding</span>
    </a>
  )
}
