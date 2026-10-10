// Per-lane algorithm selection: lane badge, algorithm select, landmark controls.
import { ALGORITHMS } from '@/algorithms/search'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LandmarkPicker } from './LandmarkPicker'
import type { LandmarkCount } from './landmarks'

// Algorithm options in alphabetical order (by display label) for the selects.
const ALGO_OPTIONS: [string, (typeof ALGORITHMS)[string]][] = Object.entries(ALGORITHMS)
  .sort(([, a], [, b]) => a.label.localeCompare(b.label))

type AlgorithmCardProps = {
  lane: 'A' | 'B'
  algo: string
  onAlgo: (algo: string) => void
  usesLandmarks: boolean | undefined
  overlay: boolean
  setOverlay: (v: boolean) => void
  count: LandmarkCount
  onCount: (v: LandmarkCount) => void
  customCount: number
  onClearCustom: () => void
}

export function AlgorithmCard(props: AlgorithmCardProps) {
  const { lane, algo, onAlgo, usesLandmarks, overlay, setOverlay, count, onCount, customCount, onClearCustom } = props
  const side = lane.toLowerCase() as 'a' | 'b'
  return (
    <div className={`query-algo query-algo-${side}`}>
      <span className={`lane-badge lane-badge-${side}`} aria-hidden="true">{lane}</span>
      <Select value={algo} onValueChange={(v) => v && onAlgo(v)}>
        <SelectTrigger className="w-40 algo-trigger" aria-label={`Algorithm for lane ${lane}`}>
          <SelectValue>{ALGORITHMS[algo]?.label ?? algo}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ALGO_OPTIONS.map(([key, m]) => (
            <SelectItem key={key} value={key}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <LandmarkPicker
        lane={lane}
        usesLandmarks={usesLandmarks}
        overlay={overlay}
        setOverlay={setOverlay}
        count={count}
        onCount={onCount}
        customCount={customCount}
        onClearCustom={onClearCustom}
      />
    </div>
  )
}
