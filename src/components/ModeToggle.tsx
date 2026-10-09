/** Shell-level switch between the modern UI and the ported game UI.
 *  An inline icon button (no text): it sits in the modern masthead's control
 *  cluster and in the game's top-right corner row, next to the theme button. */
import { Compass, Gamepad2 } from 'lucide-react'

type Props = {
  mode: 'modern' | 'game'
  onToggle: () => void
}

export default function ModeToggle({ mode, onToggle }: Props) {
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
      {toGame ? <Gamepad2 aria-hidden="true" /> : <Compass aria-hidden="true" />}
    </button>
  )
}
