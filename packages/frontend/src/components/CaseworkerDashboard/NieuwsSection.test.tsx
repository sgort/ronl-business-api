// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NieuwsSection from './NieuwsSection';
import type { NieuwsItem } from '../../services/api';

const mockBusinessApi = vi.hoisted(() => ({
  portal: { nieuws: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

function makeItem(overrides: Partial<NieuwsItem> = {}): NieuwsItem {
  return {
    id: 'n1',
    title: 'Nieuwe regeling van kracht',
    summary: 'Een korte samenvatting van het nieuwsbericht.',
    category: null,
    publishedAt: '2026-07-01T00:00:00Z',
    url: null,
    source: { id: 's1', name: 'Gemeente' },
    ...overrides,
  };
}

beforeEach(() => {
  mockBusinessApi.portal.nieuws.mockResolvedValue({ success: true, data: { items: [] } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NieuwsSection', () => {
  it('shows a loading skeleton while nieuws loads', () => {
    mockBusinessApi.portal.nieuws.mockReturnValue(new Promise(() => {}));
    const { container } = render(<NieuwsSection />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no nieuwsberichten', async () => {
    render(<NieuwsSection />);
    expect(await screen.findByText('Geen nieuwsberichten beschikbaar.')).toBeInTheDocument();
  });

  it('shows an error state and "Opnieuw proberen" retries the load', async () => {
    mockBusinessApi.portal.nieuws.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<NieuwsSection />);

    expect(await screen.findByText('Nieuws kon niet worden geladen.')).toBeInTheDocument();

    mockBusinessApi.portal.nieuws.mockResolvedValue({
      success: true,
      data: { items: [makeItem()] },
    });
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText('Nieuwe regeling van kracht')).toBeInTheDocument();
  });

  it('renders a nieuwsitem with a url as a link, plus its category, source, and "Lees meer"', async () => {
    mockBusinessApi.portal.nieuws.mockResolvedValue({
      success: true,
      data: {
        items: [
          makeItem({
            title: 'Wegwerkzaamheden centrum',
            category: 'Verkeer',
            url: 'https://example.test/nieuws/1',
          }),
        ],
      },
    });
    render(<NieuwsSection />);

    const link = await screen.findByRole('link', { name: 'Wegwerkzaamheden centrum' });
    expect(link).toHaveAttribute('href', 'https://example.test/nieuws/1');
    expect(screen.getByText('Verkeer')).toBeInTheDocument();
    expect(screen.getByText('Gemeente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lees meer →' })).toHaveAttribute(
      'href',
      'https://example.test/nieuws/1'
    );
  });

  it('renders a nieuwsitem without a url as plain text and without a category badge', async () => {
    mockBusinessApi.portal.nieuws.mockResolvedValue({
      success: true,
      data: { items: [makeItem({ title: 'Alleen tekst', category: null, url: null })] },
    });
    render(<NieuwsSection />);

    await screen.findByText('Alleen tekst');
    expect(screen.queryByRole('link', { name: 'Alleen tekst' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lees meer →' })).not.toBeInTheDocument();
  });
});
