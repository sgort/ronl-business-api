// packages/public-site/src/pages/Woordenboek.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Woordenboek from './Woordenboek';
import { translations } from '../i18n';

function renderAt(lang: 'nl' | 'en') {
  return render(
    <MemoryRouter>
      <Woordenboek t={translations[lang]} lang={lang} />
    </MemoryRouter>
  );
}

describe('Woordenboek', () => {
  it('embeds Skosmos with a screen-reader title and the current language in the URL', () => {
    renderAt('nl');
    const iframe = screen.getByTitle(/Gegevenswoordenboek.*Skosmos/);
    expect(iframe).toHaveAttribute('src', expect.stringContaining('/ronl/nl/'));
  });

  it('follows the language switch', () => {
    renderAt('en');
    expect(screen.getByTitle(/Data dictionary.*Skosmos/)).toHaveAttribute(
      'src',
      expect.stringContaining('/ronl/en/')
    );
  });

  it('keeps a visible "open in a new tab" fallback link outside the iframe', () => {
    renderAt('nl');
    const link = screen.getByRole('link', { name: /Openen in een nieuw tabblad/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', expect.stringContaining('skosmos.open-regels.nl'));
  });
});
