// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Publicatie from './Publicatie';
import { WOO_CATEGORIEEN, WOO_PUBLICATIE } from '../../pages/woo/woo.data';

describe('Publicatie', () => {
  it('renders the actieve-openbaarmaking heading and the implemented/total category count', () => {
    render(<Publicatie />);

    expect(
      screen.getByRole('heading', { name: 'Uit eigen beweging openbaar' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${WOO_PUBLICATIE.geimplementeerd} / ${WOO_PUBLICATIE.totaalCategorieen}`)
    ).toBeInTheDocument();
  });

  it('renders a row for every category, marking active ones with a checkmark', () => {
    const { container } = render(<Publicatie />);
    const rows = Array.from(container.querySelectorAll('.w-catrow'));
    for (const c of WOO_CATEGORIEEN) {
      const row = rows.find((r) => r.querySelector('.nm')?.textContent === c.naam);
      expect(row).toBeTruthy();
      expect(row!.className.includes('off')).toBe(!c.actief);
    }
  });
});
