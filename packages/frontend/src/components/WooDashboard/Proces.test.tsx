// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Proces from './Proces';
import { WOO_STAPPEN, WOO_PROCES } from '../../pages/woo/woo.data';

describe('Proces', () => {
  it('renders the processtappen heading and the bottleneck step', () => {
    render(<Proces />);

    expect(screen.getByRole('heading', { name: 'Processtappen & knelpunten' })).toBeInTheDocument();
    expect(screen.getAllByText(WOO_PROCES.bottleneck).length).toBeGreaterThan(0);
  });

  it('renders a funnel row for every process step', () => {
    const { container } = render(<Proces />);
    const stepNames = Array.from(container.querySelectorAll('.w-funnel .nm')).map((el) =>
      el.textContent?.replace('knelpunt', '').trim()
    );
    for (const s of WOO_STAPPEN) {
      expect(stepNames).toContain(s.naam);
    }
  });
});
