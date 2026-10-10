import { MapPin, Sparkles, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LM_OPTIONS, LM_SHORT, type LandmarkCount } from './landmarks'

type LandmarkPickerProps = {
  lane: string
  usesLandmarks: boolean | undefined
  overlay: boolean
  setOverlay: (v: boolean) => void
  count: LandmarkCount
  onCount: (v: LandmarkCount) => void
  customCount: number
  onClearCustom: () => void
}

// Per-lane landmark controls in the query bar. Landmark algorithms always show
// their active set (preset count or a click-picked custom set). Non-landmark
// algorithms get an opt-in overlay toggle so the user can display landmarks for
// context without changing the algorithm's own behavior.
export function LandmarkPicker(props: LandmarkPickerProps) {
  const { lane, usesLandmarks, overlay, setOverlay, count, onCount, customCount, onClearCustom } = props
  const active = usesLandmarks || overlay
  if (!active) {
    return (
      <button
        className="lm-toggle"
        title={`Show landmark overlay for ${lane} (visual only — algorithm unchanged)`}
        onClick={() => setOverlay(true)}
      ><Sparkles size={12} aria-hidden="true" /> Landmarks</button>
    )
  }
  return (
    <div className="query-lm">
      {customCount > 0 ? (
        <button
          className="query-lm-custom"
          title={`Custom landmarks active (${customCount}). Click to clear and return to the preset.`}
          onClick={onClearCustom}
        ><MapPin size={12} aria-hidden="true" /> Custom ({customCount})</button>
      ) : (
        <>
          <Select value={count} onValueChange={(v) => v && onCount(v as LandmarkCount)}>
            <SelectTrigger className="w-16" aria-label={`Landmark count for ${lane}`}>
              <SelectValue>{LM_SHORT[count]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="query-word query-word-lm">LM</span>
        </>
      )}
      {!usesLandmarks && (
        <button
          className="query-lm-off"
          aria-label={`Hide landmark overlay for ${lane}`}
          title="Hide landmark overlay"
          onClick={() => setOverlay(false)}
        ><X size={12} aria-hidden="true" /></button>
      )}
    </div>
  )
}
