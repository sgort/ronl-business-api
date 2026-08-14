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
});
