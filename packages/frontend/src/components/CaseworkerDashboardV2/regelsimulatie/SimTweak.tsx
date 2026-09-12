import { useId, useState } from 'react';

export default function SimTweak({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  // Track an in-progress drag locally, separate from `value` (the committed
  // cfg value from the parent). Committing on every drag step would fire a
  // full engine run() per step — at extreme slider settings a single run()
  // can take 1-3s, freezing the tab mid-drag. Committing only on release
  // (or on a completed keyboard step) keeps the slider itself perfectly
  // responsive while limiting run() to once per actual change-of-intent.
  // Trade-off, accepted deliberately: the numeric `display` text (computed
  // by the parent from the committed cfg) lags the thumb position during a
  // drag, updating only on release — the same pattern common OS/app sliders
  // use for expensive live-preview values.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? value;

  const commit = () => {
    if (dragValue != null) {
      onChange(dragValue);
      setDragValue(null);
    }
  };

  return (
    <div className="sim-tweak">
      <label htmlFor={id}>
        {label} <span className="tk-val">{display}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => setDragValue(parseFloat(e.target.value))}
        onPointerUp={commit}
        onKeyUp={(e) => {
          if (
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown' ||
            e.key === 'Home' ||
            e.key === 'End' ||
            e.key === 'PageUp' ||
            e.key === 'PageDown'
          ) {
            commit();
          }
        }}
      />
    </div>
  );
}
