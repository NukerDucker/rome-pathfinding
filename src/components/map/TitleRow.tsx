// Masthead: title, then one control cluster (theme menu · mute · mode switch).
import { Volume2, VolumeX } from 'lucide-react'
import { ThemeMenu, type Theme } from '@/theme'
import ModeToggle from '@/components/ModeToggle'

type TitleRowProps = {
  theme: Theme
  onSelect: (t: Theme) => void
  busy: boolean
  muted: boolean
  onToggleMute: () => void
  mode: 'modern' | 'game'
  onToggleMode: () => void
}

export function TitleRow({ theme, onSelect, busy, muted, onToggleMute, mode, onToggleMode }: TitleRowProps) {
  return (
    <h1 className="app-title">
      <span>Uninformed &amp; Informed search</span>
      <span className="app-title-sep" aria-hidden="true">·</span>
      <span className="app-title-sub">Romania map</span>
      {/* Order matches the game corner: [mode] … [theme] — theme always hugs
          the outer corner. */}
      <span className="title-controls">
        <ModeToggle mode={mode} onToggle={onToggleMode} />
        <button
          type="button"
          className="mute-toggle"
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          aria-pressed={muted}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
          onClick={onToggleMute}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
        <ThemeMenu theme={theme} onSelect={onSelect} busy={busy} />
      </span>
    </h1>
  )
}
