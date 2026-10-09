// Overlay/tool toggles above the map.
import { Columns2, MapPin, Thermometer } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ToolbarRowProps = {
  showLine: boolean
  onToggleLine: () => void
  showHeatmap: boolean
  onToggleHeatmap: () => void
  merged: boolean
  onToggleMerged: () => void
  pickLandmarkMode: boolean
  onTogglePickLandmark: () => void
  customCount: number
}

export function ToolbarRow(props: ToolbarRowProps) {
  const { showLine, onToggleLine, showHeatmap, onToggleHeatmap, merged, onToggleMerged, pickLandmarkMode, onTogglePickLandmark, customCount } = props
  return (
        <div className="toolbar" role="toolbar" aria-label="Visualizer controls">

          {/* Overlays */}
          <Button
            variant={showLine ? 'default' : 'outline'} size="sm"
            onClick={onToggleLine} aria-pressed={showLine}
            title="Show straight line from origin to destination"
          >
            <span className="swatch swatch-arc" aria-hidden="true" />
            Straight Line
          </Button>
          <Button
            variant={showHeatmap ? 'default' : 'outline'} size="sm"
            onClick={onToggleHeatmap} aria-pressed={showHeatmap}
            title="h-value heatmap — stronger red = nearer the goal (lower h)"
          >
            <Thermometer size={14} aria-hidden="true" /> Heatmap
          </Button>
          <Button
            variant={merged ? 'default' : 'outline'} size="sm"
            onClick={onToggleMerged}
            aria-pressed={merged}
            title="Merge the two maps into one — each road becomes two coloured strands (purple = lane A, teal = lane B) and node discs split down the middle"
          >
            <Columns2 size={14} aria-hidden="true" /> {merged ? 'Merged map' : 'Merge maps'}
          </Button>

          <span className="w-px h-5 bg-[var(--border)] self-center" aria-hidden="true" />

          {/* Tool */}
          <Button
            variant={pickLandmarkMode ? 'default' : 'outline'} size="sm"
            onClick={onTogglePickLandmark} aria-pressed={pickLandmarkMode}
            title="Pick landmarks per lane — click a city on either map to add/remove that lane's landmarks"
          >
            <MapPin size={14} aria-hidden="true" /> Landmarks ({customCount})
          </Button>

        </div>
  )
}
