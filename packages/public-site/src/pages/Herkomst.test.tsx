// packages/public-site/src/pages/Herkomst.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Herkomst from './Herkomst';
import { translations } from '../i18n';

function renderAt(lang: 'nl' | 'en') {
  return render(
    <MemoryRouter>
      <Herkomst t={translations[lang]} lang={lang} />
    </MemoryRouter>
  );
}

describe('Herkomst', () => {
  it('renders the breadcrumb, page head, explorer and background band', () => {
    renderAt('nl');
    expect(screen.getByText('Herkomst van Leeftijd')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Waar komt dit begrip vandaan?' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Leeftijd/ })).toBeInTheDocument();
    expect(screen.getByText('De pijplijn')).toBeInTheDocument();
  });

  it('breadcrumb links to /regels', () => {
    renderAt('nl');
    const links = screen.getAllByRole('link', { name: 'Regelcatalogus' });
    expect(links[0]).toHaveAttribute('href', '/regels');
  });

  it('follows the language switch', () => {
    renderAt('en');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Where does this concept come from?' })
    ).toBeInTheDocument();
  });

  it('jump buttons target the background sections', () => {
    renderAt('nl');
    expect(screen.getByRole('button', { name: 'De pijplijn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conceptketen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standaarden' })).toBeInTheDocument();
  });
});
