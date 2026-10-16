type Tab = { id: string; label: string }

type Props = {
  tabs: Tab[]
  activeId: string
  onChange: (id: string) => void
}

export default function RetroTabs({ tabs, activeId, onChange }: Props) {
  return (
    <div className="retro-tabs" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className="retro-tab"
          data-active={tab.id === activeId ? 'true' : 'false'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
