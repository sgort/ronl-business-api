// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgendaView from './AgendaView';
import type { Dossier, PlenaryItem } from '@ronl/shared';
import { makePaDataStub } from '../../test/paData.stub';

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

/** The shared stub, so a new context member cannot be missed here. */
const defaultPaData = makePaDataStub;

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
  it('labels a cancelled item and marks its row, under "Alle periodes"', async () => {
    mockUsePaData.mockReturnValue(
      defaultPaData({
        agenda: {
          data: [makeItem({ id: 'x', status: 'geannuleerd', titel: 'Afgezegd debat' })],
          status: 'ok',
        },
      })
    );
    const user = userEvent.setup();
    const { container } = render(<AgendaView onOpenDossier={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Alle periodes/ }));

    expect(screen.getByText('Geannuleerd')).toBeInTheDocument();
    expect(container.querySelector('.pac-ag-item.cancelled')).not.toBeNull();
  });

  it('marks a past item as past', async () => {
    mockUsePaData.mockReturnValue(
      defaultPaData({
        agenda: {
          data: [makeItem({ id: 'x', iso: isoOffset(-3), status: 'uitgevoerd' })],
          status: 'ok',
        },
      })
    );
    const user = userEvent.setup();
    const { container } = render(<AgendaView onOpenDossier={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Alle periodes/ }));

    expect(container.querySelector('.pac-ag-item.past')).not.toBeNull();
    expect(screen.getByText('Geweest')).toBeInTheDocument();
  });

  it('shows a dash rather than a blank slot for an item with no start time', () => {
    mockUsePaData.mockReturnValue(
      defaultPaData({ agenda: { data: [makeItem({ tijd: null })], status: 'ok' } })
    );
    render(<AgendaView onOpenDossier={vi.fn()} />);
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('shows the committee name when the activity has one', () => {
    mockUsePaData.mockReturnValue(
      defaultPaData({
        agenda: { data: [makeItem({ commissie: 'Commissie LNV' })], status: 'ok' },
      })
    );
    render(<AgendaView onOpenDossier={vi.fn()} />);
    expect(screen.getByText('Commissie LNV')).toBeInTheDocument();
  });

  it('links a live activity to its stream', () => {
    mockUsePaData.mockReturnValue(
      defaultPaData({
        agenda: {
          data: [makeItem({ live: 'live', stream: 'https://debatgemist.tweedekamer.nl/x' })],
          status: 'ok',
        },
      })
    );
    const { container } = render(<AgendaView onOpenDossier={vi.fn()} />);

    expect(screen.getByText('Nu in de zaal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nu in de zaal/ })).toHaveAttribute(
      'href',
      'https://debatgemist.tweedekamer.nl/x'
    );
    expect(container.querySelector('.pac-ag-item.live')).not.toBeNull();
  });

  it('still renders a live activity that has no stream URL yet', () => {
    // The Tweede Kamer feed flags an activity live before the stream URL is
    // published; a missing href must not produce a link to the current page.
    mockUsePaData.mockReturnValue(
      defaultPaData({ agenda: { data: [makeItem({ live: 'live', stream: null })], status: 'ok' } })
    );
    render(<AgendaView onOpenDossier={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Nu in de zaal/ })).toHaveAttribute('href', '#');
  });

  it('marks an activity that is about to start', () => {
    mockUsePaData.mockReturnValue(
      defaultPaData({ agenda: { data: [makeItem({ live: 'binnenkort' })], status: 'ok' } })
    );
    render(<AgendaView onOpenDossier={vi.fn()} />);
    expect(screen.getByText('Straks live')).toBeInTheDocument();
  });

  it('falls back to the dossier id when the dossier list does not know it', async () => {
    // The agenda match is computed server-side against dossier ids; a dossier
    // archived since that run would otherwise render as an empty label.
    mockUsePaData.mockReturnValue(
      defaultPaData({
        agenda: {
          data: [makeItem({ dossier: 'verdwenen-dossier', matchTerm: 'stikstof' })],
          status: 'ok',
        },
        dossiers: { data: [] as Dossier[], status: 'ok' },
      })
    );
    render(<AgendaView onOpenDossier={vi.fn()} />);
    expect(screen.getByText(/verdwenen-dossier/)).toBeInTheDocument();
  });

  it('groups consecutive activities on the same date under one heading', () => {
    mockUsePaData.mockReturnValue(
      defaultPaData({
        agenda: {
          data: [
            makeItem({ id: 'a', titel: 'Eerste', tijd: '10:00' }),
            makeItem({ id: 'b', titel: 'Tweede', tijd: '11:00' }),
            makeItem({ id: 'c', titel: 'Derde', iso: isoOffset(1), tijd: '09:00' }),
          ],
          status: 'ok',
        },
      })
    );
    const { container } = render(<AgendaView onOpenDossier={vi.fn()} />);

    // Three activities, two dates -- the two same-day items must share one day
    // block rather than each opening its own.
    const days = container.querySelectorAll('.pac-ag-day');
    expect(days).toHaveLength(2);
    expect(days[0].querySelectorAll('.pac-ag-item')).toHaveLength(2);
    expect(days[1].querySelectorAll('.pac-ag-item')).toHaveLength(1);
  });
});
