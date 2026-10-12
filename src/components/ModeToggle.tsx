/** Shell-level switch between the modern UI and the ported game UI.
 *  An inline icon button (no text): it sits in the modern masthead's control
 *  cluster and in the game's top-right corner row, next to the theme button.
 *  `pixel` swaps the compass for a 16x16 pixel-art one in the game UI. */
import { Compass, Gamepad2 } from 'lucide-react'

type Props = {
  mode: 'modern' | 'game'
  onToggle: () => void
  pixel?: boolean
}

// lucide's Compass on a 16x16 grid: ring plus the NE-pointing needle.
const PIXEL_COMPASS =
  'M5 0h6v1h-6zM3 1h2v1h-2zM11 1h2v1h-2zM2 2h1v1h-1zM13 2h1v1h-1zM1 3h1v1h-1zM14 3h1v1h-1zM1 4h1v1h-1zM10 4h2v1h-2zM14 4h1v1h-1zM0 5h1v1h-1zM8 5h4v1h-4zM15 5h1v1h-1zM0 6h1v1h-1zM6 6h5v1h-5zM15 6h1v1h-1zM0 7h1v1h-1zM6 7h5v1h-5zM15 7h1v1h-1zM0 8h1v1h-1zM5 8h5v1h-5zM15 8h1v1h-1zM0 9h1v1h-1zM5 9h5v1h-5zM15 9h1v1h-1zM0 10h1v1h-1zM4 10h4v1h-4zM15 10h1v1h-1zM1 11h1v1h-1zM4 11h2v1h-2zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM2 13h1v1h-1zM13 13h1v1h-1zM3 14h2v1h-2zM11 14h2v1h-2zM5 15h6v1h-6z'

export default function ModeToggle({ mode, onToggle, pixel = false }: Props) {
  const toGame = mode === 'modern'
  return (
    <button
      type="button"
      className="mode-toggle"
      onClick={onToggle}
      aria-pressed={!toGame}
      aria-label={toGame ? 'Switch to the game-style UI' : 'Switch to the modern UI'}
      title={toGame ? 'Switch to the game-style UI' : 'Switch to the modern UI'}
    >
      {toGame ? (
        <Gamepad2 aria-hidden="true" />
      ) : pixel ? (
        <svg viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
          <path d={PIXEL_COMPASS} />
        </svg>
      ) : (
        <Compass aria-hidden="true" />
      )}
    </button>
  )
}
