// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductenDienstenCatalogus from './ProductenDienstenCatalogus';
import type { ProductDienstItem } from '../../services/api';

const mockBusinessApi = vi.hoisted(() => ({
  portal: { productenDiensten: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

function makeItem(overrides: Partial<ProductDienstItem> = {}): ProductDienstItem {
  return {
    id: 'p1',
    title: 'Subsidie duurzame energie',
    description: 'Subsidie voor duurzame energieprojecten.',
    url: 'https://flevoland.nl/product/1',
    audience: ['ondernemer'],
    onlineAanvragen: true,
    modified: '2026-05-01',
    soort: 'subsidie',
    ...overrides,
  };
}

beforeEach(() => {
  mockBusinessApi.portal.productenDiensten.mockResolvedValue({
    success: true,
    data: { items: [] },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProductenDienstenCatalogus', () => {
  it('shows a loading indicator then an error state on failure', async () => {
    mockBusinessApi.portal.productenDiensten.mockResolvedValue({ success: false });
    render(<ProductenDienstenCatalogus />);
    expect(await screen.findByText('Catalogus kon niet worden geladen.')).toBeInTheDocument();
  });

  it('groups items by soort with per-group counts, and shows the total/online stats', async () => {
    mockBusinessApi.portal.productenDiensten.mockResolvedValue({
      success: true,
      data: {
        items: [
          makeItem({ id: 'p1', soort: 'subsidie' }),
          makeItem({
            id: 'p2',
            title: 'Bouwvergunning',
            soort: 'vergunning',
            onlineAanvragen: false,
          }),
        ],
      },
    });
    render(<ProductenDienstenCatalogus />);

    expect(await screen.findByText('Subsidies')).toBeInTheDocument();
    expect(screen.getByText('Vergunningen, meldingen & activiteiten')).toBeInTheDocument();
    expect(screen.getByText('2 producten')).toBeInTheDocument();
    expect(screen.getByText('1 online aanvraagbaar')).toBeInTheDocument();
  });

  it('free-text search filters by title and description', async () => {
    mockBusinessApi.portal.productenDiensten.mockResolvedValue({
      success: true,
      data: {
        items: [
          makeItem({ id: 'p1', title: 'Subsidie duurzame energie' }),
          makeItem({ id: 'p2', title: 'Bouwvergunning', soort: 'vergunning' }),
        ],
      },
    });
    const user = userEvent.setup();
    render(<ProductenDienstenCatalogus />);
    await screen.findByText(/Subsidie duurzame energie/);

    await user.type(screen.getByPlaceholderText('Zoek op naam of beschrijving…'), 'bouw');

    expect(screen.getByText('Bouwvergunning')).toBeInTheDocument();
    expect(screen.queryByText(/Subsidie duurzame energie/)).not.toBeInTheDocument();
  });

  it('the audience filter narrows results to matching items', async () => {
    mockBusinessApi.portal.productenDiensten.mockResolvedValue({
      success: true,
      data: {
        items: [
          makeItem({ id: 'p1', title: 'Voor ondernemers', audience: ['ondernemer'] }),
          makeItem({ id: 'p2', title: 'Voor particulieren', audience: ['particulier'] }),
        ],
      },
    });
    const user = userEvent.setup();
    render(<ProductenDienstenCatalogus />);
    await screen.findByText(/Voor ondernemers/);

    await user.click(screen.getByRole('button', { name: 'Particulier' }));

    expect(screen.getByText('Voor particulieren')).toBeInTheDocument();
    expect(screen.queryByText(/Voor ondernemers/)).not.toBeInTheDocument();
  });

  it('the "Online aanvragen" filter narrows to only online-capable items', async () => {
    mockBusinessApi.portal.productenDiensten.mockResolvedValue({
      success: true,
      data: {
        items: [
          makeItem({ id: 'p1', title: 'Online product', onlineAanvragen: true }),
          makeItem({ id: 'p2', title: 'Informatie product', onlineAanvragen: false }),
        ],
      },
    });
    const user = userEvent.setup();
    render(<ProductenDienstenCatalogus />);
    await screen.findByText(/Online product/);

    await user.click(screen.getByRole('button', { name: 'Online aanvragen' }));

    expect(screen.getByText('Online product')).toBeInTheDocument();
    expect(screen.queryByText(/Informatie product/)).not.toBeInTheDocument();
  });

  it('shows the "no results" message when filters produce an empty set', async () => {
    mockBusinessApi.portal.productenDiensten.mockResolvedValue({
      success: true,
      data: { items: [makeItem()] },
    });
    const user = userEvent.setup();
    render(<ProductenDienstenCatalogus />);
    await screen.findByText(/Subsidie duurzame energie/);

    await user.type(screen.getByPlaceholderText('Zoek op naam of beschrijving…'), 'nonexistent');

    expect(
      await screen.findByText('Geen producten gevonden voor deze zoekopdracht.')
    ).toBeInTheDocument();
  });

  it('expanding a card shows the full description and the external link', async () => {
    mockBusinessApi.portal.productenDiensten.mockResolvedValue({
      success: true,
      data: { items: [makeItem()] },
    });
    const user = userEvent.setup();
    render(<ProductenDienstenCatalogus />);

    await user.click(await screen.findByText(/Subsidie duurzame energie/));

    const link = screen.getByRole('link', { name: /Bekijk op flevoland.nl/ });
    expect(link).toHaveAttribute('href', 'https://flevoland.nl/product/1');
    expect(screen.getByText('Bijgewerkt: 2026-05-01')).toBeInTheDocument();
  });
});
