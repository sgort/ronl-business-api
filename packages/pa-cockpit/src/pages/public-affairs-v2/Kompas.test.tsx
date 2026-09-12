// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Kompas, { Dots, Trend } from './Kompas';
import type { KompasScores } from './pa.data';

const CRITERION_KEYS = [
  'opgaven',
  'momentum',
  'coalitie',
  'uitvoering',
  'reputatie',
  'synergie',
  'opbrengst',
  'risico',
] as const;

function makeKompas(
  overrides: Partial<Record<string, { score: number; duiding?: string }>> = {}
): KompasScores {
  const scores = Object.fromEntries(
    CRITERION_KEYS.map((k) => [k, overrides[k] ?? { score: 0, duiding: '' }])
  );
  return scores as unknown as KompasScores;
}

describe('Kompas', () => {
  it('renders the total score out of the max and the matching band label', () => {
    const kompas = makeKompas({ opgaven: { score: 2 }, momentum: { score: 2 } });
    const { container } = render(<Kompas kompas={kompas} />);

    expect(container.querySelector('.pac-kompas-total')).toHaveTextContent('4 / 16');
  });

  it('renders the radar SVG by default', () => {
    render(<Kompas kompas={makeKompas()} />);
    expect(screen.getByRole('img', { name: 'Flevolands Kompas radar' })).toBeInTheDocument();
  });

  it('renders the bar chart when viz="bars"', () => {
    render(<Kompas kompas={makeKompas()} viz="bars" />);
    expect(screen.getByRole('img', { name: 'Flevolands Kompas staafdiagram' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Flevolands Kompas radar' })).not.toBeInTheDocument();
  });

  it('shows duiding text by default and hides it when showDuiding is false', () => {
    const kompas = makeKompas({ opgaven: { score: 1, duiding: 'Belangrijke toelichting' } });
    const { rerender } = render(<Kompas kompas={kompas} />);
    expect(screen.getByText('Belangrijke toelichting')).toBeInTheDocument();

    rerender(<Kompas kompas={kompas} showDuiding={false} />);
    expect(screen.queryByText('Belangrijke toelichting')).not.toBeInTheDocument();
  });

  it('defaults a missing criterion to score 0 instead of crashing', () => {
    const partialKompas = { opgaven: { score: 2, duiding: '' } } as unknown as KompasScores;
    let container!: HTMLElement;
    expect(() => {
      container = render(<Kompas kompas={partialKompas} />).container;
    }).not.toThrow();
    expect(container.querySelector('.pac-kompas-total')).toHaveTextContent('2');
  });

  it('renders extra content passed alongside the radar', () => {
    render(<Kompas kompas={makeKompas()} extra={<div>Extra content</div>} />);
    expect(screen.getByText('Extra content')).toBeInTheDocument();
  });
});

describe('Dots', () => {
  it('fills dots up to the given score', () => {
    const { container } = render(<Dots score={1} />);
    const dots = container.querySelectorAll('.pac-dot');
    expect(dots[0].className).toContain('fill-1');
    expect(dots[1].className).not.toContain('fill');
  });

  it('exposes the score via aria-label', () => {
    render(<Dots score={2} />);
    expect(screen.getByLabelText('Score 2 van 2')).toBeInTheDocument();
  });
});

describe('Trend', () => {
  it.each([
    ['up', '▲', 'stijgend'],
    ['down', '▼', 'dalend'],
    ['flat', '—', 'stabiel'],
  ] as const)('renders the %s symbol and title', (dir, symbol, label) => {
    render(<Trend dir={dir} />);
    expect(screen.getByTitle(`Momentum ${label}`)).toHaveTextContent(symbol);
  });
});
