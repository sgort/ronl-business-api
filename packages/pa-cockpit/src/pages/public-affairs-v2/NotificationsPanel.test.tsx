// @vitest-environment jsdom
/**
 * Tests for the Meldingen slide-over.
 *
 * It had no tests at all, which mattered little while notifications could not
 * arrive in mock mode — the panel was effectively unreachable outside a live
 * backend with a matching watch. Now that mock mode derives them, this is a
 * surface people will actually demo, so its branches are worth pinning: the
 * open/closed gate, the three ways to close it, the empty state, the optional
 * per-item bits, and the footer that only appears when there is something to
 * acknowledge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsPanel from './NotificationsPanel';
import type { PaNotification } from '../../services/pa.api';
import { makePaDataStub } from '../../test/paData.stub';

const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./PaDataProvider', () => ({ usePaData: mockUsePaData }));

function makeNotification(over: Partial<PaNotification> = {}): PaNotification {
  return {
    id: 'ntf-1',
    signalId: 'sig-1',
    title: 'Motie over stikstof',
    tab: 'politiek',
    dossierId: 'stikstof',
    src: 'Tweede Kamer · Motie · 3 u geleden',
    ref: { type: 'Motie', nr: '2026D17021', url: 'https://example.test/doc' },
    matchedSearches: [{ id: 'seed-stikstof', dossierId: 'stikstof', label: 'stikstof' }],
    createdAt: '2026-08-22T08:00:00.000Z',
    seenAt: null,
    ...over,
  };
}

const ackNotifications = vi.fn();

function setData(items: PaNotification[], unseenCount = items.filter((n) => !n.seenAt).length) {
  mockUsePaData.mockReturnValue(
    makePaDataStub({
      notifications: { data: { items, unseenCount }, status: 'ok', refetch: vi.fn() },
      ackNotifications,
    })
  );
}

beforeEach(() => {
  setData([makeNotification()]);
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.style.overflow = '';
});

describe('open/closed', () => {
  it('renders nothing when closed', () => {
    render(<NotificationsPanel isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the panel when open', () => {
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Notificaties')).toBeInTheDocument();
  });

  it('locks body scroll while open and releases it on close', () => {
    const { rerender } = render(<NotificationsPanel isOpen onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<NotificationsPanel isOpen={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('releases body scroll when unmounted while still open', () => {
    const { unmount } = render(<NotificationsPanel isOpen onClose={vi.fn()} />);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('closing', () => {
  it('closes on the X button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NotificationsPanel isOpen onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Sluit meldingen' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on the overlay', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<NotificationsPanel isOpen onClose={onClose} />);

    const overlay = container.querySelector('[aria-hidden="true"]');
    await user.click(overlay!);

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NotificationsPanel isOpen onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('ignores Escape while closed', async () => {
    // The listener is bound either way; the isOpen guard inside it is the point.
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NotificationsPanel isOpen={false} onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores other keys', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NotificationsPanel isOpen onClose={onClose} />);

    await user.keyboard('{Enter}');

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('list', () => {
  it('shows the empty state when there is nothing', () => {
    setData([]);
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Geen meldingen.')).toBeInTheDocument();
  });

  it('renders title, source and the document link', () => {
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Motie over stikstof')).toBeInTheDocument();
    expect(screen.getByText(/Tweede Kamer/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /2026D17021/ });
    expect(link).toHaveAttribute('href', 'https://example.test/doc');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('omits the link when the notification has no ref', () => {
    setData([makeNotification({ ref: null })]);
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('names the watches that matched', () => {
    setData([
      makeNotification({
        matchedSearches: [
          { id: 'a', dossierId: null, label: 'stikstof' },
          { id: 'b', dossierId: 'stikstof', label: 'dossier:stikstof' },
        ],
      }),
    ]);
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByText('via stikstof, dossier:stikstof')).toBeInTheDocument();
  });

  it('omits the via-line when nothing is named', () => {
    setData([makeNotification({ matchedSearches: [] })]);
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    expect(screen.queryByText(/^via /)).not.toBeInTheDocument();
  });

  it('dims a notification that has been seen', () => {
    setData([makeNotification({ seenAt: '2026-08-22T09:00:00.000Z' })], 0);
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Motie over stikstof').closest('li')?.className).toContain(
      'pac-notif-item--seen'
    );
  });

  it('does not dim an unseen one', () => {
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Motie over stikstof').closest('li')?.className).not.toContain(
      'pac-notif-item--seen'
    );
  });
});

describe('acknowledging', () => {
  it('offers "Alles gelezen" only while something is unseen', () => {
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Alles gelezen' })).toBeInTheDocument();
  });

  it('hides the footer once everything is seen', () => {
    setData([makeNotification({ seenAt: '2026-08-22T09:00:00.000Z' })], 0);
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Alles gelezen' })).not.toBeInTheDocument();
  });

  it('acks on click', async () => {
    const user = userEvent.setup();
    render(<NotificationsPanel isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Alles gelezen' }));

    expect(ackNotifications).toHaveBeenCalled();
  });
});
