// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import SimTweak from './SimTweak';

describe('SimTweak', () => {
  it('renders the label and current display value', () => {
    render(
      <SimTweak
        label="Omvang doelgroep"
        value={3150}
        display="3.150 aanvragen"
        min={400}
        max={5000}
        step={100}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Omvang doelgroep')).toBeInTheDocument();
    expect(screen.getByText('3.150 aanvragen')).toBeInTheDocument();
    expect(screen.getByLabelText(/Omvang doelgroep/)).toBeInTheDocument();
  });

  it('calls onChange with a parsed number when the slider is released after moving', async () => {
    const onChange = vi.fn();
    render(
      <SimTweak label="X" value={5} display="5" min={0} max={10} step={1} onChange={onChange} />
    );
    const slider = screen.getByRole('slider');
    fireEventChange(slider, '7');
    expect(onChange).not.toHaveBeenCalled(); // not committed yet — still dragging
    fireEvent.pointerUp(slider);
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

// fireEvent.change avoids userEvent's per-keystroke typing on a range input,
// which doesn't reflect how a real drag interaction fires a single change.
function fireEventChange(el: Element, value: string) {
  fireEvent.change(el, { target: { value } });
}
