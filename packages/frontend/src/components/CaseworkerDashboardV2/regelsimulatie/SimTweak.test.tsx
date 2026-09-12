// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SimTweak from './SimTweak';

function renderTweak(overrides: Partial<Parameters<typeof SimTweak>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <SimTweak
      label="Drempel"
      value={5}
      display="5 punten"
      min={0}
      max={10}
      step={1}
      onChange={onChange}
      {...overrides}
    />
  );
  return { onChange, slider: screen.getByRole('slider') as HTMLInputElement };
}

describe('SimTweak', () => {
  it('shows the committed value and its parent-computed display text', () => {
    const { slider } = renderTweak();
    expect(slider.value).toBe('5');
    expect(screen.getByText('5 punten')).toBeInTheDocument();
  });

  it('moves the thumb during a drag without committing', () => {
    // A commit per drag step would fire a full engine run() per step, and at
    // extreme settings one run() takes seconds -- the tab freezes mid-drag.
    const { onChange, slider } = renderTweak();

    fireEvent.change(slider, { target: { value: '8' } });

    expect(slider.value).toBe('8');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits once when the pointer is released', () => {
    const { onChange, slider } = renderTweak();

    fireEvent.change(slider, { target: { value: '8' } });
    fireEvent.change(slider, { target: { value: '9' } });
    fireEvent.pointerUp(slider);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it('does not commit a release that followed no movement', () => {
    // Clicking the thumb without dragging must not queue an engine run for a
    // value that did not change.
    const { onChange, slider } = renderTweak();

    fireEvent.pointerUp(slider);

    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])(
    'commits a completed keyboard step with %s',
    (key) => {
      const { onChange, slider } = renderTweak();

      fireEvent.change(slider, { target: { value: '7' } });
      fireEvent.keyUp(slider, { key });

      expect(onChange).toHaveBeenCalledWith(7);
    }
  );

  it('ignores a key that does not move the slider', () => {
    // Tabbing away mid-drag is not a change of intent; the pointer release or
    // an actual arrow step is.
    const { onChange, slider } = renderTweak();

    fireEvent.change(slider, { target: { value: '7' } });
    fireEvent.keyUp(slider, { key: 'Tab' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns to the parent value after a commit', () => {
    const { onChange, slider } = renderTweak();

    fireEvent.change(slider, { target: { value: '2' } });
    fireEvent.pointerUp(slider);
    expect(onChange).toHaveBeenCalledWith(2);

    // The parent owns the committed value; with the same `value` prop still
    // supplied, the local drag state must have been cleared rather than
    // pinning the thumb at 2 forever.
    expect(slider.value).toBe('5');
  });

  it('labels the slider so it is reachable by its name', () => {
    renderTweak({ label: 'Maximale looptijd' });
    expect(screen.getByLabelText(/Maximale looptijd/)).toBeInTheDocument();
  });
});
