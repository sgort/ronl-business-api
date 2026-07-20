// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Bezwaar from './Bezwaar';
import { WOO_BEZWAAR, WOO_BESLUIT } from '../../pages/woo/woo.data';

describe('Bezwaar', () => {
  it('renders the juridische uitkomsten heading and the funnel metrics from WOO_BEZWAAR', () => {
    render(<Bezwaar />);

    expect(screen.getByRole('heading', { name: 'Juridische uitkomsten' })).toBeInTheDocument();
    expect(screen.getAllByText(String(WOO_BEZWAAR.ontvangen)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(WOO_BEZWAAR.beroepen)).length).toBeGreaterThan(0);
  });

  it('renders a legend row for every besluit type', () => {
    render(<Bezwaar />);
    for (const b of WOO_BESLUIT) {
      expect(screen.getByText(b.naam)).toBeInTheDocument();
    }
  });
});
