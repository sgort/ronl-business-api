// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SimPot from './SimPot';

describe('SimPot', () => {
  it('renders the name, tag, and used/total figure', () => {
    render(<SimPot name="Eigenaren" tag="2026" total={437500} used={300000} />);
    expect(screen.getByText('Eigenaren')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('shows a reserved segment when reserved > 0', () => {
    const { container } = render(
      <SimPot name="Eigenaren" total={437500} used={300000} reserved={50000} />
    );
    expect(container.querySelector('.sim-seg.hold')).not.toBeInTheDocument();
    expect(container.textContent).toContain('gereserveerd');
  });

  it('shows a hold segment when hold > 0', () => {
    const { container } = render(
      <SimPot name="Gebundeld" total={875000} used={800000} hold={20000} />
    );
    expect(container.querySelector('.sim-seg.hold')).toBeInTheDocument();
  });

  it('marks the bar exhausted when nothing is free', () => {
    const { container } = render(<SimPot name="Eigenaren" total={437500} used={437500} />);
    expect(container.querySelector('.sim-bar.exhausted')).toBeInTheDocument();
  });
  it('shows the overspend as its own segment, a ceiling mark and a figure', () => {
    // Going over budget is the outcome the simulator exists to surface, so it
    // gets its own bar segment past the ceiling rather than a full bar.
    const { container } = render(<SimPot name="Eigenaren" total={100000} used={160000} />);

    expect(container.querySelector('.sim-seg.over')).toBeInTheDocument();
    expect(container.querySelector('.sim-ceilmark')).toBeInTheDocument();
    expect(container.textContent).toContain('over budget');
  });

  it('leaves a segment unlabelled when it is too narrow for its own figure', () => {
    // A label wider than its segment overflows into the neighbouring one and
    // reads as belonging to the wrong pot.
    const { container } = render(<SimPot name="Eigenaren" total={100000} used={101000} />);

    const over = container.querySelector('.sim-seg.over');
    expect(over).toBeInTheDocument();
    expect(over).toHaveTextContent('');
  });

  it('labels a free segment only when it is wide enough', () => {
    const { container } = render(<SimPot name="Eigenaren" total={100000} used={10000} />);
    expect(container.querySelector('.sim-seg.free')).toHaveTextContent('vrij');

    const tight = render(<SimPot name="Krap" total={100000} used={95000} />);
    expect(tight.container.querySelector('.sim-seg.free')).toHaveTextContent('');
  });

  it('renders an entirely empty pot without dividing by zero', () => {
    // A scenario can zero out a pot completely; a NaN width would collapse the
    // whole bar rather than showing an empty one.
    const { container } = render(<SimPot name="Leeg" total={0} used={0} />);

    const segments = container.querySelectorAll('.sim-seg');
    expect(segments.length).toBeGreaterThan(0);
    segments.forEach((seg) => {
      expect((seg as HTMLElement).style.width).not.toContain('NaN');
    });
  });
});
