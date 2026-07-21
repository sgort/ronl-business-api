// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegelCatalogus from './RegelCatalogus';
import type { RegelcatalogusData } from '../../services/api';

const mockBusinessApi = vi.hoisted(() => ({
  portal: { regelcatalogus: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

function makeData(overrides: Partial<RegelcatalogusData> = {}): RegelcatalogusData {
  return {
    services: [
      {
        uri: 'https://data.example.test/svc/1',
        title: 'Bouwvergunning',
        description: 'Aanvraag voor een bouwvergunning.',
      },
    ],
    organizations: [
      {
        uri: 'https://data.example.test/org/1',
        identifier: 'org-1',
        name: 'Provincie Flevoland',
        homepage: 'https://flevoland.nl',
        logo: null,
        services: [{ uri: 'https://data.example.test/svc/1', title: 'Bouwvergunning' }],
      },
    ],
    concepts: [
      {
        uri: 'https://data.example.test/concept/1',
        prefLabel: 'Aanvrager',
        exactMatch: null,
        serviceUri: 'https://data.example.test/svc/1',
        serviceTitle: 'Bouwvergunning',
      },
    ],
    rules: [
      {
        serviceTitle: 'Bouwvergunning',
        ruleTitle: 'Leeftijd minimaal 18',
        validFrom: '2024-01-01',
        confidence: 'hoog',
        description: 'De aanvrager moet 18 jaar of ouder zijn.',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockBusinessApi.portal.regelcatalogus.mockResolvedValue({
    success: true,
    data: makeData(),
    meta: { cache: null },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RegelCatalogus', () => {
  it('shows an error state when loading fails', async () => {
    mockBusinessApi.portal.regelcatalogus.mockResolvedValue({ success: false });
    render(<RegelCatalogus />);
    expect(await screen.findByText('Katalogus kon niet worden geladen.')).toBeInTheDocument();
  });

  it('defaults to the Organisaties tab, showing tab counts and initials fallback for a missing logo', async () => {
    render(<RegelCatalogus />);

    expect(await screen.findByText('Provincie Flevoland')).toBeInTheDocument();
    expect(screen.getByText('PF')).toBeInTheDocument(); // initials, no logo
    expect(screen.getByRole('button', { name: /Diensten/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Regels/ })).toHaveTextContent('1');
  });

  it('switching to Diensten and expanding a service shows its description and a "Toon concepten" link', async () => {
    const user = userEvent.setup();
    render(<RegelCatalogus />);
    await screen.findByText('Provincie Flevoland');

    await user.click(screen.getByRole('button', { name: /Diensten/ }));
    await user.click(screen.getByText('Bouwvergunning'));

    expect(screen.getByText('Aanvraag voor een bouwvergunning.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Toon concepten/ })).toBeInTheDocument();
  });

  it('clicking "Toon concepten" from Diensten jumps to Concepten pre-filtered by that service', async () => {
    const user = userEvent.setup();
    render(<RegelCatalogus />);
    await screen.findByText('Provincie Flevoland');

    await user.click(screen.getByRole('button', { name: /Diensten/ }));
    await user.click(screen.getByText('Bouwvergunning'));
    await user.click(screen.getByRole('button', { name: /Toon concepten/ }));

    expect(screen.getByRole('button', { name: /Begrippen/ })).toHaveClass('border-blue-600');
    expect(screen.getByText('Aanvrager')).toBeInTheDocument();
    expect((screen.getByDisplayValue('Bouwvergunning') as HTMLSelectElement).value).toBe(
      'https://data.example.test/svc/1'
    );
  });

  it('Concepten free-text search filters the table', async () => {
    mockBusinessApi.portal.regelcatalogus.mockResolvedValue({
      success: true,
      data: makeData({
        concepts: [
          {
            uri: 'c1',
            prefLabel: 'Aanvrager',
            exactMatch: null,
            serviceUri: '',
            serviceTitle: '',
          },
          {
            uri: 'c2',
            prefLabel: 'Bouwperceel',
            exactMatch: null,
            serviceUri: '',
            serviceTitle: '',
          },
        ],
      }),
      meta: { cache: null },
    });
    const user = userEvent.setup();
    render(<RegelCatalogus />);
    await screen.findByText('Provincie Flevoland');

    await user.click(screen.getByRole('button', { name: /Begrippen/ }));
    await user.type(screen.getByPlaceholderText('Zoek op label…'), 'bouw');

    expect(screen.getByText('Bouwperceel')).toBeInTheDocument();
    expect(screen.queryByText('Aanvrager')).not.toBeInTheDocument();
  });

  it('Regels search filters rules and auto-expands the matching group', async () => {
    mockBusinessApi.portal.regelcatalogus.mockResolvedValue({
      success: true,
      data: makeData({
        rules: [
          {
            serviceTitle: 'Bouwvergunning',
            ruleTitle: 'Leeftijd minimaal 18',
            validFrom: null,
            confidence: null,
            description: null,
          },
          {
            serviceTitle: 'Bouwvergunning',
            ruleTitle: 'Bouwhoogte maximaal 12 meter',
            validFrom: null,
            confidence: null,
            description: null,
          },
        ],
      }),
      meta: { cache: null },
    });
    const user = userEvent.setup();
    render(<RegelCatalogus />);
    await screen.findByText('Provincie Flevoland');

    await user.click(screen.getByRole('button', { name: /Regels/ }));
    await user.type(
      screen.getByPlaceholderText('Zoek op regelnaam of beschrijving…'),
      'bouwhoogte'
    );

    expect(screen.getByText('Bouwhoogte maximaal 12 meter')).toBeInTheDocument();
    expect(screen.queryByText('Leeftijd minimaal 18')).not.toBeInTheDocument();
  });

  it('expanding a rule with a description shows it, and re-collapsing hides it', async () => {
    const user = userEvent.setup();
    render(<RegelCatalogus />);
    await screen.findByText('Provincie Flevoland');

    await user.click(screen.getByRole('button', { name: /Regels/ }));
    await user.click(screen.getByText('Bouwvergunning', { selector: 'span.font-semibold' }));
    const ruleToggle = await screen.findByText('Leeftijd minimaal 18');
    await user.click(ruleToggle);

    expect(screen.getByText('De aanvrager moet 18 jaar of ouder zijn.')).toBeInTheDocument();

    await user.click(ruleToggle);
    expect(screen.queryByText('De aanvrager moet 18 jaar of ouder zijn.')).not.toBeInTheDocument();
  });

  it('"Vernieuwen" forces a refetch bypassing the cache', async () => {
    const user = userEvent.setup();
    render(<RegelCatalogus />);
    await screen.findByText('Provincie Flevoland');

    mockBusinessApi.portal.regelcatalogus.mockClear();
    await user.click(screen.getByRole('button', { name: /Vernieuwen/ }));

    expect(mockBusinessApi.portal.regelcatalogus).toHaveBeenCalledWith(true);
  });
});
