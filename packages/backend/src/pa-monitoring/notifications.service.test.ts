/**
 * Unit tests for computeNotifications — cross-watch grouping and delivery dedup.
 * matchesQueryTerms is the real implementation (pure function, no need to mock).
 */

const mockDb = { any: jest.fn(), result: jest.fn() };
jest.mock('@services/audit.service', () => ({ db: mockDb }));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));

import { computeNotifications } from './notifications.service';

interface WatchRow {
  id: string;
  user_id: string;
  dossier_id: string | null;
  query: { q?: string } | null;
}

interface SignalRow {
  id: string;
  dossier_id: string | null;
  title: string;
  duiding: string | null;
}

function watch(overrides: Partial<WatchRow> & { id: string; user_id: string }): WatchRow {
  return { dossier_id: null, query: { q: '' }, ...overrides };
}

function signal(overrides: Partial<SignalRow> & { id: string }): SignalRow {
  return { dossier_id: null, title: '', duiding: null, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.result.mockResolvedValue({ rowCount: 1 });
});

describe('computeNotifications', () => {
  it('does nothing when there are no active watches', async () => {
    mockDb.any.mockResolvedValueOnce([]).mockResolvedValueOnce([signal({ id: 'sig-1' })]);
    await computeNotifications('flevoland');
    expect(mockDb.result).not.toHaveBeenCalled();
  });

  it('does nothing when there are no confirmed signals', async () => {
    mockDb.any
      .mockResolvedValueOnce([watch({ id: 'w1', user_id: 'u1' })])
      .mockResolvedValueOnce([]);
    await computeNotifications('flevoland');
    expect(mockDb.result).not.toHaveBeenCalled();
  });

  it('a dossier-only watch (empty query) matches every confirmed signal for that dossier', async () => {
    mockDb.any
      .mockResolvedValueOnce([
        watch({ id: 'w1', user_id: 'u1', dossier_id: 'lelystad', query: { q: '' } }),
      ])
      .mockResolvedValueOnce([
        signal({ id: 'sig-1', dossier_id: 'lelystad', title: 'Nieuw stuk over Lelystad Airport' }),
        signal({ id: 'sig-2', dossier_id: 'stikstof', title: 'Onverwant signaal' }),
      ]);

    await computeNotifications('flevoland');

    expect(mockDb.result).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.result.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(user_id, signal_id\) DO NOTHING/);
    expect(params).toEqual(
      expect.arrayContaining([
        'flevoland',
        'u1',
        'sig-1',
        expect.stringContaining('dossier:lelystad'),
      ])
    );
  });

  it('a topic watch matches confirmed signals by term, regardless of dossier', async () => {
    mockDb.any
      .mockResolvedValueOnce([
        watch({ id: 'w1', user_id: 'u1', dossier_id: null, query: { q: 'Lelystad Airport' } }),
      ])
      .mockResolvedValueOnce([
        signal({ id: 'sig-1', title: 'Update over Lelystad Airport route' }),
      ]);

    await computeNotifications('flevoland');

    expect(mockDb.result).toHaveBeenCalledTimes(1);
    const [, params] = mockDb.result.mock.calls[0];
    expect(params).toEqual(expect.arrayContaining(['flevoland', 'u1', 'sig-1']));
  });

  it('a dossier-scoped topic watch requires both the dossier match and the term match', async () => {
    mockDb.any
      .mockResolvedValueOnce([
        watch({ id: 'w1', user_id: 'u1', dossier_id: 'lelystad', query: { q: 'laagvliegroutes' } }),
      ])
      .mockResolvedValueOnce([
        // Right dossier, wrong term — no match.
        signal({ id: 'sig-1', dossier_id: 'lelystad', title: 'Onverwant bericht' }),
        // Right term, wrong dossier — no match.
        signal({ id: 'sig-2', dossier_id: 'stikstof', title: 'laagvliegroutes elders' }),
      ]);

    await computeNotifications('flevoland');

    expect(mockDb.result).not.toHaveBeenCalled();
  });

  it('collapses matches from two overlapping watches into one notification per (user, signal)', async () => {
    mockDb.any
      .mockResolvedValueOnce([
        watch({ id: 'w1', user_id: 'u1', dossier_id: null, query: { q: 'stikstof' } }),
        watch({ id: 'w2', user_id: 'u1', dossier_id: 'stikstof', query: { q: '' } }),
      ])
      .mockResolvedValueOnce([
        signal({ id: 'sig-1', dossier_id: 'stikstof', title: 'stikstof nieuws' }),
      ]);

    await computeNotifications('flevoland');

    // Same (user, signal) pair matched twice — one insert, not two.
    expect(mockDb.result).toHaveBeenCalledTimes(1);
    const [, params] = mockDb.result.mock.calls[0];
    const matchedSearchesJson = params[4] as string;
    const matched = JSON.parse(matchedSearchesJson) as { id: string }[];
    expect(matched.map((m) => m.id).sort()).toEqual(['w1', 'w2']);
  });

  it('keeps notifying other matches when one insert fails', async () => {
    mockDb.any
      .mockResolvedValueOnce([
        watch({ id: 'w1', user_id: 'u1', dossier_id: null, query: { q: 'stikstof' } }),
      ])
      .mockResolvedValueOnce([
        signal({ id: 'sig-1', title: 'stikstof A' }),
        signal({ id: 'sig-2', title: 'stikstof B' }),
      ]);
    mockDb.result
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ rowCount: 1 });

    await computeNotifications('flevoland');

    expect(mockDb.result).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Notification insert failed',
      expect.objectContaining({ userId: 'u1' })
    );
  });

  it('does not match a watch with neither a dossier nor a query', async () => {
    mockDb.any
      .mockResolvedValueOnce([
        watch({ id: 'w1', user_id: 'u1', dossier_id: null, query: { q: '' } }),
      ])
      .mockResolvedValueOnce([signal({ id: 'sig-1', title: 'anything' })]);

    await computeNotifications('flevoland');

    expect(mockDb.result).not.toHaveBeenCalled();
  });
});
