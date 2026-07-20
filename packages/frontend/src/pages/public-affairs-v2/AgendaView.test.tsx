// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgendaView from './AgendaView';
import type { Dossier, PlenaryItem } from '@ronl/shared';

const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./PaDataProvider', () => ({ usePaData: mockUsePaData }));

// AgendaView derives "today" from `new Date().toISOString()` (UTC), so build
// fixture dates the same way rather than freezing system time — freezing
// time via vi.useFakeTimers() stalls userEvent's internal setTimeout-based
// delays, since it has no real clock left to advance against.
function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}
const todayIso = isoOffset(0);

function makeItem(overrides: Partial<PlenaryItem> = {}): PlenaryItem {
  return {
    id: 'ag1',
    nummer: '2026A0001',
    soort: 'plenair',
    soortLabel: 'Plenair debat',
    titel: 'Test debat',
    iso: todayIso,
    tijd: '10:00',
    commissie: null,
    status: 'gepland',
    dossier: null,
    matchTerm: null,
    url: 'https://example.com',
    live: null,
    ...overrides,
  };
}

function defaultPaData(overrides: Record<string, unknown> = {}) {
  return {
    agenda: { data: [], status: 'ok', refetch: vi.fn() },
    dossiers: { data: [] as Dossier[], status: 'ok', refetch: vi.fn() },
    ...overrides,
  };
}

describe('AgendaView', () => {
  beforeEach(() => {
    mockUsePaData.mockReturnValue(defaultPaData());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading message while the agenda is loading', () => {
    mockUsePaData.mockReturnValue(defaultPaData({ agenda: { data: [], status: 'loading' } }));
    render(<AgendaView onOpenDossier={vi.fn()} />);
    expect(screen.getByText('Agenda ophalen…')).toBeInTheDocument();
  });

  it('shows an error message when the agenda failed to load', () => {
    mockUsePaData.mockReturnValue(defaultPaData({ agenda: { data: [], status: 'error' } }));
    render(<AgendaView onOpenDossier={vi.fn()} />);
    expect(
      screen.getByText('Agenda kon niet worden opgehaald. Probeer het later opnieuw.')
    ).toBeInTheDocument();
  });

  it('the default "Aankomend" scope excludes past and cancelled items', () => {
    const past = makeItem({
      id: 'past',
      titel: 'Past item',
      iso: isoOffset(-5),
      status: 'uitgevoerd',
    });
    const cancelled = makeItem({
      id: 'cancelled',
      titel: 'Cancelled item',
      iso: isoOffset(5),
      status: 'geannuleerd',
    });
    const upcoming = makeItem({ id: 'upcoming', titel: 'Upcoming item', iso: isoOffset(5) });
    mockUsePaData.mockReturnValue(
      defaultPaData({ agenda: { data: [past, cancelled, upcoming], status: 'ok' } })
    );

    render(<AgendaView onOpenDossier={vi.fn()} />);

    expect(screen.getByText('Upcoming item')).toBeInTheDocument();
    expect(screen.queryByText('Past item')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelled item')).not.toBeInTheDocument();
  });

  it('switching to "Alle periodes" includes past and cancelled items', async () => {
    const past = makeItem({
      id: 'past',
      titel: 'Past item',
      iso: isoOffset(-5),
      status: 'uitgevoerd',
    });
    mockUsePaData.mockReturnValue(defaultPaData({ agenda: { data: [past], status: 'ok' } }));
    const user = userEvent.setup();

    render(<AgendaView onOpenDossier={vi.fn()} />);
    expect(screen.queryByText('Past item')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Alle periodes/ }));

    expect(screen.getByText('Past item')).toBeInTheDocument();
  });

  it('filters by activity type via the soort chips', async () => {
    const debat = makeItem({
      id: 'd1',
      titel: 'Plenair item',
      soort: 'plenair',
      soortLabel: 'Plenair debat',
    });
    const commissie = makeItem({
      id: 'c1',
      titel: 'Commissie item',
      soort: 'commissie',
      soortLabel: 'Commissiedebat',
      iso: isoOffset(1),
    });
    mockUsePaData.mockReturnValue(
      defaultPaData({ agenda: { data: [debat, commissie], status: 'ok' } })
    );
    const user = userEvent.setup();

    render(<AgendaView onOpenDossier={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Commissiedebat/ }));

    expect(screen.getByText('Commissie item')).toBeInTheDocument();
    expect(screen.queryByText('Plenair item')).not.toBeInTheDocument();
  });

  it('marks today\'s date group with "Vandaag"', () => {
    const today = makeItem({ id: 't1', titel: 'Today item', iso: todayIso });
    mockUsePaData.mockReturnValue(defaultPaData({ agenda: { data: [today], status: 'ok' } }));

    render(<AgendaView onOpenDossier={vi.fn()} />);

    expect(screen.getByText('Vandaag')).toBeInTheDocument();
  });

  it('clicking a dossier match resolves the dossier name and calls onOpenDossier', async () => {
    const onOpenDossier = vi.fn();
    const item = makeItem({
      id: 'm1',
      titel: 'Matched item',
      dossier: 'stikstof',
      matchTerm: 'stikstof',
    });
    const dossier = { id: 'stikstof', naam: 'Stikstofdossier' } as unknown as Dossier;
    mockUsePaData.mockReturnValue(
      defaultPaData({
        agenda: { data: [item], status: 'ok' },
        dossiers: { data: [dossier], status: 'ok' },
      })
    );
    const user = userEvent.setup();

    render(<AgendaView onOpenDossier={onOpenDossier} />);

    expect(screen.getByText(/Stikstofdossier/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Raakt dossier/ }));

    expect(onOpenDossier).toHaveBeenCalledWith('stikstof');
  });
});
