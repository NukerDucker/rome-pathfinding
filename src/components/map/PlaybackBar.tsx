// Playback transport + speed slider. `sep` inserts the frame separator used by
// the merged map's footer bar.
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

export const MIN_DELAY = 0
export const MAX_DELAY = 1500
export const DEFAULT_DELAY = 600

type PlaybackBarProps = {
  playing: boolean
  stepIdx: number
  largerLastIdx: number
  delay: number
  sep?: boolean
  onReset: () => void
  onBack: () => void
  onPlayPause: () => void
  onForward: () => void
  onDelay: (delay: number) => void
}

export function PlaybackBar(props: PlaybackBarProps) {
  const { playing, stepIdx, largerLastIdx, delay, sep = false, onReset, onBack, onPlayPause, onForward, onDelay } = props
  return (
    <>
              <div className="transport">
                <Button variant="outline" size="icon" aria-label="Reset" onClick={onReset} disabled={stepIdx === 0}><RotateCcw aria-hidden="true" /></Button>
                <Button variant="outline" size="icon" aria-label="Step back" onClick={onBack} disabled={stepIdx === 0}><ChevronLeft aria-hidden="true" /></Button>
                <Button variant="outline" size="icon" aria-label={playing ? 'Pause' : 'Play'} onClick={onPlayPause}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</Button>
                <Button variant="outline" size="icon" aria-label="Step forward" onClick={onForward} disabled={stepIdx >= largerLastIdx}><ChevronRight aria-hidden="true" /></Button>
              </div>
      {sep && <span className="map-frame-sep" aria-hidden="true" />}
              <div className="speed toolbar-group-speed">
                <span className="speed-labels"><span>Slow</span><span className="speed-value">{delay}ms</span><span>Fast</span></span>
                <Slider min={MIN_DELAY} max={MAX_DELAY} step={50} value={MAX_DELAY - delay} onValueChange={(v) => onDelay(MAX_DELAY - (Array.isArray(v) ? v[0] : v))} aria-label="Animation speed" />
              </div>
    </>
  )
}
