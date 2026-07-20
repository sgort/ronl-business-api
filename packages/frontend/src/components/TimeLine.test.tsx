// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Timeline } from './TimeLine';
import type { BRPEvent } from '../types/brp.types';

const minDate = new Date(2000, 0, 1);
const maxDate = new Date(2020, 0, 1);
const totalRange = maxDate.getTime() - minDate.getTime();
const midpoint = new Date(minDate.getTime() + totalRange * 0.5);

const events: BRPEvent[] = [
  {
    id: 'e1',
    type: 'birth',
    date: new Date(2005, 0, 1),
    label: 'Geboren',
    description: 'Geboorte Wessel',
  },
];

function mockRect(el: Element, rect: Partial<DOMRect>) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

describe('Timeline', () => {
  it('renders the selected date in Dutch long format', () => {
    render(
      <Timeline
        events={[]}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={new Date(2010, 0, 1)}
        onDateChange={vi.fn()}
      />
    );

    expect(screen.getByText('1 januari 2010')).toBeInTheDocument();
  });

  it('shows a loading overlay only when isLoading is true', () => {
    const { rerender } = render(
      <Timeline
        events={[]}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={minDate}
        onDateChange={vi.fn()}
      />
    );
    expect(screen.queryByText('Gegevens laden...')).not.toBeInTheDocument();

    rerender(
      <Timeline
        events={[]}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={minDate}
        onDateChange={vi.fn()}
        isLoading
      />
    );
    expect(screen.getByText('Gegevens laden...')).toBeInTheDocument();
  });

  it('renders a 5-yearly marker for every year within range, inclusive of the boundary', () => {
    render(
      <Timeline
        events={[]}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={minDate}
        onDateChange={vi.fn()}
      />
    );

    for (const year of [2000, 2005, 2010, 2015, 2020]) {
      expect(screen.getByText(String(year))).toBeInTheDocument();
    }
  });

  it('clicking an event marker calls onDateChange with the event date and does not also trigger the track click', () => {
    const onDateChange = vi.fn();
    render(
      <Timeline
        events={events}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={minDate}
        onDateChange={onDateChange}
      />
    );

    fireEvent.click(screen.getByTitle('Geboorte Wessel'));

    expect(onDateChange).toHaveBeenCalledTimes(1);
    expect(onDateChange).toHaveBeenCalledWith(events[0].date);
  });

  it('clicking the timeline track computes the date from click position', () => {
    const onDateChange = vi.fn();
    const { container } = render(
      <Timeline
        events={[]}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={minDate}
        onDateChange={onDateChange}
      />
    );

    const track = container.querySelector('.cursor-pointer') as HTMLElement;
    mockRect(track, { left: 0, width: 1000 });

    fireEvent.click(track, { clientX: 500 });

    expect(onDateChange).toHaveBeenCalledWith(midpoint);
  });

  it('dragging the current-position marker updates the date on mousemove and stops on mouseup', () => {
    const onDateChange = vi.fn();
    const { container } = render(
      <Timeline
        events={[]}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={minDate}
        onDateChange={onDateChange}
      />
    );

    const track = container.querySelector('.cursor-pointer') as HTMLElement;
    mockRect(track, { left: 0, width: 1000 });
    const marker = container.querySelector('.cursor-grab') as HTMLElement;

    fireEvent.mouseDown(marker);
    fireEvent.mouseMove(window, { clientX: 500 });
    expect(onDateChange).toHaveBeenCalledWith(midpoint);

    fireEvent.mouseUp(window);
    onDateChange.mockClear();
    fireEvent.mouseMove(window, { clientX: 900 });
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('the "Vandaag" jump button calls onDateChange with the current date', () => {
    const onDateChange = vi.fn();
    render(
      <Timeline
        events={[]}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={minDate}
        onDateChange={onDateChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vandaag' }));

    expect(onDateChange).toHaveBeenCalledTimes(1);
    const arg = onDateChange.mock.calls[0][0] as Date;
    expect(Math.abs(arg.getTime() - Date.now())).toBeLessThan(1000);
  });

  it("renders a jump button per event and calls onDateChange with that event's date", () => {
    const onDateChange = vi.fn();
    render(
      <Timeline
        events={events}
        minDate={minDate}
        maxDate={maxDate}
        selectedDate={minDate}
        onDateChange={onDateChange}
      />
    );

    // Two "Geboren"-labeled buttons exist: the marker-on-track button (has a
    // `title` attribute) and the jump button below the track (does not).
    const jumpButton = screen
      .getAllByRole('button', { name: 'Geboren' })
      .find((btn) => !btn.hasAttribute('title'));
    fireEvent.click(jumpButton!);

    expect(onDateChange).toHaveBeenCalledWith(events[0].date);
  });
});
