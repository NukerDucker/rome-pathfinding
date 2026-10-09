/** Shell-level switch between the modern UI and the ported game UI.
 *  Fixed top-left so it is reachable in both modes (the game's own theme
 *  toggle and bread button own the top-right). */
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
      title={toGame ? 'Switch to the game-style UI' : 'Switch to the modern UI'}
    >
      {toGame ? '🎮 Game style' : '🧭 Modern style'}
    </button>
  )
}
