// Map / Guide tab strip.
export type AppTab = 'map' | 'guide'

type TabBarProps = { tab: AppTab; onTab: (t: AppTab) => void }

export function TabBar({ tab, onTab }: TabBarProps) {
  return (
      <div className="tab-bar" role="tablist">
        <button
          role="tab"
          id="tab-map"
          aria-controls="tabpanel-map"
          className={`tab-btn${tab === 'map' ? ' tab-btn-active' : ''}`}
          aria-selected={tab === 'map'}
          onClick={() => onTab('map')}
        >Map</button>
        <button
          role="tab"
          id="tab-guide"
          aria-controls="tabpanel-guide"
          className={`tab-btn${tab === 'guide' ? ' tab-btn-active' : ''}`}
          aria-selected={tab === 'guide'}
          onClick={() => onTab('guide')}
        >Guide</button>
      </div>
  )
}
