// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SimChart from './SimChart';
import { run } from './simEngine';
import type { SimConfig } from './types';

const SMALL_CFG: SimConfig = {
  seed: 1,
  populatie: 200,
  eigenaarRatio: 0.68,
  kostenGem: 4200,
  kostenSd: 1800,
  pFailliet: 0.02,
  pBuitenprovincie: 0.07,
  pGeenRelatie: 0.03,
  pGeenToestemming: 0.14,
  pNaamMismatch: 0.05,
  budgetScale: 1,
  aandeel2026: 0.46,
  arrivalPow: 1.3,
  doorlooptijdGem: 8,
  pAanvullendeInfo: 0.32,
  infoWachtGem: 60,
  bezwaarKans: 0.22,
  bezwaarToewijzing: 0.25,
};

describe('SimChart', () => {
  it('renders an svg with the expected viewBox', () => {
    const result = run(SMALL_CFG);
    const { container } = render(<SimChart result={result} day={0} />);
    const svg = container.querySelector('svg.sim-chart');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 720 220');
  });

  it('renders the legend with all 7 entries', () => {
    const result = run(SMALL_CFG);
    const { container } = render(<SimChart result={result} day={0} />);
    const legend = container.querySelectorAll('.sim-chartlegend span');
    expect(legend).toHaveLength(7);
  });

  it('renders one exhaustion mark per exhaustion event', () => {
    const result = run(SMALL_CFG);
    const { container } = render(<SimChart result={result} day={result.days.length - 1} />);
    const marks = container.querySelectorAll('line.exhaust-mark');
    expect(marks.length).toBe(Object.keys(result.exhaustion).length);
  });

  it('does not throw when day exceeds the number of simulated days', () => {
    const result = run(SMALL_CFG);
    expect(() => render(<SimChart result={result} day={999999} />)).not.toThrow();
  });
});
