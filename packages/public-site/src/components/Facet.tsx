// packages/public-site/src/components/Facet.tsx
export interface FacetOption {
  value: string;
  count: number;
  label?: string;
}

interface Props {
  legend: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

export default function Facet({ legend, options, selected, onToggle }: Props) {
  return (
    <fieldset className="pub-facet">
      <legend>{legend}</legend>
      {options.map((opt) => (
        <label key={opt.value}>
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => onToggle(opt.value)}
          />
          <span>{opt.label ?? opt.value}</span>
          <span className="pub-fc">{opt.count}</span>
        </label>
      ))}
    </fieldset>
  );
}
