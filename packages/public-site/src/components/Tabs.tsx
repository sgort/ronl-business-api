// packages/public-site/src/components/Tabs.tsx
export interface TabItem {
  id: string;
  label: string;
  count: number;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export default function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className="pub-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          <span className="pub-tc">{tab.count}</span>
        </button>
      ))}
    </div>
  );
}
