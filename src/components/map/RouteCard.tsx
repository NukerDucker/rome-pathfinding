// Route selection card: start city, goal city, randomize.
import { Dices } from 'lucide-react'
import { CITIES, type NodeId } from '@/romania'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type RouteCardProps = {
  start: NodeId
  goal: NodeId
  onStart: (city: NodeId) => void
  onGoal: (city: NodeId) => void
  onHover: (city: NodeId | null) => void
  onRandomize: () => void
}

export function RouteCard({ start, goal, onStart, onGoal, onHover, onRandomize }: RouteCardProps) {
  return (
        <div className="query-bar" role="group" aria-label="Route selection">
          <Select
            value={start}
            onValueChange={(v) => v && onStart(v as NodeId)}
            onOpenChange={(open) => !open && onHover(null)}
          >
            <SelectTrigger className="w-32 city-trigger" aria-label="Start city"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITIES.map((city) => (
                <SelectItem
                  key={city} value={city}
                  onMouseEnter={() => onHover(city)}
                  onMouseLeave={() => onHover(null)}
                >{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="query-word" aria-hidden="true">→</span>
          <Select
            value={goal}
            onValueChange={(v) => v && onGoal(v as NodeId)}
            onOpenChange={(open) => !open && onHover(null)}
          >
            <SelectTrigger className="w-32 city-trigger" aria-label="Goal city"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITIES.map((city) => (
                <SelectItem
                  key={city} value={city}
                  onMouseEnter={() => onHover(city)}
                  onMouseLeave={() => onHover(null)}
                >{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="icon"
            aria-label="Randomize start and goal cities"
            title="Randomize"
            onClick={onRandomize}
          >
            <Dices aria-hidden="true" />
          </Button>
        </div>
  )
}
