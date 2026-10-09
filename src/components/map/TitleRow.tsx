// Masthead: title, theme cycler and mute toggle.
import { Volume2, VolumeX } from 'lucide-react'
import { ThemeControl, type Theme } from '@/theme'

type TitleRowProps = {
  theme: Theme
  onCycle: () => void
  busy: boolean
  muted: boolean
  onToggleMute: () => void
}

export function TitleRow({ theme, onCycle, busy, muted, onToggleMute }: TitleRowProps) {
  return (
    <h1 className="app-title">
      <span>Uninformed &amp; Informed search</span>
      <span className="app-title-sep" aria-hidden="true">·</span>
      <span className="app-title-sub">Romania map</span>
      <ThemeControl theme={theme} onCycle={onCycle} busy={busy} />
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
    </h1>
  )
}
