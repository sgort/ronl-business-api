// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SimOutcomeRow from './SimOutcomeRow';

describe('SimOutcomeRow', () => {
  it('renders the name and formatted count', () => {
    render(<SimOutcomeRow dot="bg-green" name="Toegekend" val={1646} total={3150} />);
    expect(screen.getByText('Toegekend')).toBeInTheDocument();
    expect(screen.getByText('1.646')).toBeInTheDocument();
  });

  it('renders the amount sub-line when amount is provided', () => {
    render(<SimOutcomeRow dot="bg-green" name="Toegekend" val={10} amount={12500} total={100} />);
    expect(screen.getByText('€12,5k')).toBeInTheDocument();
  });

  it('renders 0% width when total is 0 (no division by zero)', () => {
    const { container } = render(<SimOutcomeRow dot="bg-ink3" name="X" val={0} total={0} />);
    const fill = container.querySelector('.o-fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });
});
