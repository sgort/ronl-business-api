/**
 * Unit tests for initPaDb — table creation + backfill, taxonomy seeding with the
 * dossierId fallback (entry.id vs explicit null), and the fail-soft behaviour of
 * both the init and per-seed error paths. The pg db is mocked.
 */

jest.mock('@services/audit.service', () => ({ db: { none: jest.fn() } }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { initPaDb } from './pa-monitoring.db';
import { db } from '@services/audit.service';

const mockNone = (db as unknown as { none: jest.Mock }).none;

const seedCalls = () =>
  mockNone.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO pa_saved_searches'));

beforeEach(() => jest.clearAllMocks());

describe('initPaDb', () => {
  it('creates the tables, backfills, and seeds the taxonomy', async () => {
    mockNone.mockResolvedValue(undefined);

    await initPaDb();

    // First statement creates the tables; second backfills subbron.
    expect(String(mockNone.mock.calls[0][0])).toContain(
      'CREATE TABLE IF NOT EXISTS pa_saved_searches'
    );
    expect(String(mockNone.mock.calls[1][0])).toContain("UPDATE pa_signals SET subbron = 'ep-rss'");

    // Every seed entry produces one upsert.
    const seeds = seedCalls();
    expect(seeds.length).toBeGreaterThan(15);
    expect(mockNone).toHaveBeenCalledTimes(2 + seeds.length);
  });

  it('applies the dossierId fallback (entry.id) vs explicit null', async () => {
    mockNone.mockResolvedValue(undefined);
    await initPaDb();

    const byId = (id: string) => seedCalls().find((c) => c[1][0] === id);

    // 'stikstof' has no dossierId key → falls back to its own id
    expect(byId('seed-stikstof')?.[1][1]).toBe('stikstof');
    // 'eu-klimaat' sets dossierId: null explicitly → stays null
    expect(byId('seed-eu-klimaat')?.[1][1]).toBeNull();
    // a dossier-linked media search keeps its explicit dossierId
    expect(byId('seed-media-stikstof')?.[1][1]).toBe('stikstof');

    // query is stored as the { q, types, source } JSON shape
    expect(JSON.parse(byId('seed-stikstof')![1][2])).toMatchObject({
      types: [],
      source: ['tk', 'ob', 'eu'],
    });
  });

  it('is fail-soft when the table creation fails (no seeding attempted)', async () => {
    mockNone.mockRejectedValue(new Error('db down'));
    await expect(initPaDb()).resolves.toBeUndefined();
    expect(mockNone).toHaveBeenCalledTimes(1); // only the CREATE, which threw
  });

  it('continues seeding when an individual upsert fails', async () => {
    // CREATE + backfill succeed, then every seed upsert rejects.
    mockNone
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('seed boom'));

    await expect(initPaDb()).resolves.toBeUndefined();
    // all seeds were still attempted despite each failing
    expect(seedCalls().length).toBeGreaterThan(15);
  });
});

describe('initPaDb — failures that are not Error instances', () => {
  // node-postgres can reject with a bare string on a connection-level failure;
  // both catches have a String(err) fallback so the log line still says something.
  it('is fail-soft when table creation rejects with a string', async () => {
    mockNone.mockRejectedValue('connection terminated');
    await expect(initPaDb()).resolves.toBeUndefined();
    expect(seedCalls()).toHaveLength(0);
  });

  it('continues seeding when an individual upsert rejects with a string', async () => {
    mockNone
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue('connection terminated');

    await expect(initPaDb()).resolves.toBeUndefined();
    expect(seedCalls().length).toBeGreaterThan(15);
  });
});
