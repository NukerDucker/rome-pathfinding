// Wired in stage 3: transport + pixel slider, all state from useGameState.
import type { CSSProperties } from 'react'
import { MAX_DELAY } from '@/game/useGameState'

type Props = {
  playing: boolean
  delay: number
  onPlay: () => void
  onNext: () => void
  onPrev: () => void
  onRestart: () => void
  onDelay: (v: number) => void
}

export default function GamePlayback({ playing, delay, onPlay, onNext, onPrev, onRestart, onDelay }: Props) {
  const stepMs = MAX_DELAY - delay // stepDelay(): speed slider -> milliseconds per step
  return (
    <div className="playback-bar" role="group" aria-label="Playback">
      <div className="playback-row">
        <button id="restartBtn" title="Restart" type="button" onClick={onRestart}></button>
        <button id="prevBtn" title="Previous" type="button" onClick={onPrev}>&#9664;&#9664;</button>
        {/* play/pause; while playing the CSS darkens it via .playing */}
        <button id="playBtn" title="Start" type="button" className={playing ? 'playing' : undefined} onClick={onPlay}>
          {playing ? 'PAUSE' : 'START'}
        </button>
        <button id="nextBtn" title="Next" type="button" onClick={onNext}>&#9654;&#9654;</button>
      </div>
      <div className="speed-row">
        <span className="speed-end">Slow<br /><small>1500ms</small></span>
        <div className="speed-track">
          {/* value = speed (right = faster); step delay = 1500 - value */}
          {/* pixel-art slider: Unfill.png track, Fill.png up to the handle (--frac), Handle.png thumb */}
          <div className="pixel-slider" id="speedSliderWrap" style={{ '--frac': delay / MAX_DELAY } as CSSProperties}>
            <div className="ps-fill" aria-hidden="true"></div>
            <input
              type="range"
              id="speedSlider"
              min="0"
              max="1500"
              value={delay}
              aria-label="Step delay"
              aria-valuetext={`${stepMs} milliseconds per step`}
              onChange={(e) => onDelay(Number(e.target.value))}
            />
          </div>
          <span className="speed-value" id="speedValue" aria-hidden="true">{stepMs}ms</span>
        </div>
        <span className="speed-end">Fast<br /><small>0ms</small></span>
      </div>
    </div>
  )
}
