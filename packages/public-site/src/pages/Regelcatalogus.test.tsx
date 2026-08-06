import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Regelcatalogus from './Regelcatalogus';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getRegelcatalogus: vi.fn() };
});

const t = translations.nl;
const DATA: Awaited<ReturnType<typeof api.getRegelcatalogus>> = {
  services: [
    { uri: 's1', title: 'Zorgtoeslag', description: 'Toeslag' },
    { uri: 's2', title: 'Geen regels dienst', description: 'Leeg' },
  ],
  organizations: [
    {
      uri: 'o1',
      identifier: '1',
      name: 'Belastingdienst',
      homepage: null,
      logo: null,
      services: [{ uri: 's1', title: 'Zorgtoeslag' }],
    },
  ],
  concepts: [
    {
      uri: 'c1',
      prefLabel: 'Toetsingsinkomen',
      exactMatch: null,
      serviceUri: 's1',
      serviceTitle: 'Zorgtoeslag',
    },
  ],
  rules: [
    {
      serviceTitle: 'Zorgtoeslag',
      ruleTitle: 'Recht op zorgtoeslag',
      validFrom: '2026-01-01',
      confidence: 'high',
      description: null,
    },
    {
      serviceTitle: 'Zorgtoeslag',
      ruleTitle: 'Leeftijdseis 18 jaar',
      validFrom: '2026-01-01',
      confidence: 'high',
      description: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getRegelcatalogus).mockResolvedValue(DATA);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Regelcatalogus t={t} lang="nl" />
    </MemoryRouter>
  );
}

describe('Regelcatalogus', () => {
  it('tab counts match the fetched data', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Organisaties/ })).toBeInTheDocument()
    );
    expect(screen.getByRole('tab', { name: /Organisaties/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Diensten/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Regels/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Begrippen/ })).toHaveTextContent('1');
  });

  it('Rules tab: a service with count > 0 renders exactly that many rows, and 0-rule services are absent', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));

    // Zorgtoeslag has 2 rules — both rendered
    expect(await screen.findByText('Recht op zorgtoeslag')).toBeInTheDocument();
    expect(screen.getByText('Leeftijdseis 18 jaar')).toBeInTheDocument();
    expect(screen.getByText('Zorgtoeslag').closest('details')).toHaveTextContent('2 / 2');

    // "Geen regels dienst" has 0 rules — no accordion for it at all
    expect(screen.queryByText('Geen regels dienst')).not.toBeInTheDocument();
  });

  it('Concepts tab: every row links out to Skosmos', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Begrippen/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Begrippen/ }));
    const link = await screen.findByRole('link', { name: 'Toetsingsinkomen' });
    expect(link).toHaveAttribute('href', expect.stringContaining('skosmos.open-regels.nl'));
  });
});
