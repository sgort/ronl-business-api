// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BerichtenSection from './BerichtenSection';
import type { BerichtItem } from '../../services/api';

const mockBusinessApi = vi.hoisted(() => ({
  portal: { berichten: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

function makeItem(overrides: Partial<BerichtItem> = {}): BerichtItem {
  return {
    id: 'b1',
    subject: 'Onderhoud gepland',
    preview: 'Het systeem is niet bereikbaar op zaterdag.',
    content: null,
    type: 'maintenance',
    status: 'published',
    audience: 'all',
    sender: { id: 's1', name: 'Beheer' },
    publishedAt: '2026-07-01T00:00:00Z',
    expiresAt: null,
    priority: 'normal',
    isRead: false,
    action: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockBusinessApi.portal.berichten.mockResolvedValue({ success: true, data: { items: [] } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('BerichtenSection', () => {
  it('shows a loading skeleton while berichten load', async () => {
    let resolve!: (v: unknown) => void;
    mockBusinessApi.portal.berichten.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = render(<BerichtenSection />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);

    resolve({ success: true, data: { items: [] } });
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
  });

  it('shows an empty state when there are no berichten', async () => {
    render(<BerichtenSection />);
    expect(await screen.findByText('Er zijn momenteel geen berichten.')).toBeInTheDocument();
  });

  it('shows an error state and "Opnieuw proberen" retries the load', async () => {
    mockBusinessApi.portal.berichten.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<BerichtenSection />);

    expect(await screen.findByText('Berichten konden niet worden geladen.')).toBeInTheDocument();

    mockBusinessApi.portal.berichten.mockResolvedValue({
      success: true,
      data: { items: [makeItem()] },
    });
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText('Onderhoud gepland')).toBeInTheDocument();
  });

  it('renders a bericht with an action as a link, and the sender/date/action label', async () => {
    mockBusinessApi.portal.berichten.mockResolvedValue({
      success: true,
      data: {
        items: [
          makeItem({
            subject: 'Nieuwe functionaliteit',
            action: { label: 'Bekijk update', url: 'https://example.test/update' },
          }),
        ],
      },
    });
    render(<BerichtenSection />);

    const link = await screen.findByRole('link', { name: 'Nieuwe functionaliteit' });
    expect(link).toHaveAttribute('href', 'https://example.test/update');
    expect(screen.getByText('Beheer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bekijk update →' })).toHaveAttribute(
      'href',
      'https://example.test/update'
    );
  });

  it('renders a bericht without an action as plain text, not a link', async () => {
    mockBusinessApi.portal.berichten.mockResolvedValue({
      success: true,
      data: { items: [makeItem({ subject: 'Alleen tekst' })] },
    });
    render(<BerichtenSection />);

    await screen.findByText('Alleen tekst');
    expect(screen.queryByRole('link', { name: 'Alleen tekst' })).not.toBeInTheDocument();
  });

  it('shows the expiry date only when it is still in the future', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    mockBusinessApi.portal.berichten.mockResolvedValue({
      success: true,
      data: { items: [makeItem({ subject: 'Verloopt binnenkort', expiresAt: future })] },
    });
    render(<BerichtenSection />);

    await screen.findByText('Verloopt binnenkort');
    expect(screen.getByText(/^t\/m/)).toBeInTheDocument();
  });
});
