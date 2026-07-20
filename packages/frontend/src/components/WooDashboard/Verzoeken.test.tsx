// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Verzoeken from './Verzoeken';
import { WOO_AFDELING, WOO_BRON } from '../../pages/woo/woo.data';

describe('Verzoeken', () => {
  it('renders the werklast heading and a bar row for every afdeling', () => {
    render(<Verzoeken />);

    expect(screen.getByRole('heading', { name: 'Werklast & instroom' })).toBeInTheDocument();
    for (const a of WOO_AFDELING) {
      expect(screen.getByText(a.naam)).toBeInTheDocument();
    }
  });

  it('renders a legend row for every bron', () => {
    render(<Verzoeken />);
    for (const b of WOO_BRON) {
      expect(screen.getByText(b.naam)).toBeInTheDocument();
    }
  });
});
