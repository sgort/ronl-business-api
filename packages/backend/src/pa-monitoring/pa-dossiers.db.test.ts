/**
 * Unit tests for initDossiersDb — table creation, dossier/template/snippet
 * seeding (incl. the Markdown wrapping of SEED_DOSSIERS' narratief into the
 * three raw-Markdown fields), and fail-soft behaviour on both the init and
 * per-row seed error paths. The pg db is mocked.
 * Also covers relativeLabel — the "bewerkt N geleden" formatter — directly.
 */

jest.mock('@services/audit.service', () => ({ db: { none: jest.fn() } }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  initDossiersDb,
  relativeLabel,
  DOSSIER_TEMPLATES,
  DOSSIER_SNIPPETS,
} from './pa-dossiers.db';
import { db } from '@services/audit.service';

const mockNone = (db as unknown as { none: jest.Mock }).none;

const dossierSeedCalls = () =>
  mockNone.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO pa_dossiers\n'));
const versionSeedCalls = () =>
  mockNone.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO pa_dossier_versions'));
const templateSeedCalls = () =>
  mockNone.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO pa_templates'));
const snippetSeedCalls = () =>
  mockNone.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO pa_snippets'));

beforeEach(() => jest.clearAllMocks());

describe('initDossiersDb', () => {
  it('creates the tables, then seeds dossiers, templates, and snippets', async () => {
    mockNone.mockResolvedValue(undefined);
    await initDossiersDb();

    const createSql = String(mockNone.mock.calls[0][0]);
    expect(createSql).toContain('CREATE TABLE IF NOT EXISTS pa_dossiers');
    expect(createSql).toContain('CREATE TABLE IF NOT EXISTS pa_dossier_versions');
    expect(createSql).toContain('CREATE TABLE IF NOT EXISTS pa_templates');
    expect(createSql).toContain('CREATE TABLE IF NOT EXISTS pa_snippets');

    // SEED_DOSSIERS entries + the one archived example, each with its versies.
    expect(dossierSeedCalls().length).toBeGreaterThan(1);
    expect(versionSeedCalls().length).toBeGreaterThan(dossierSeedCalls().length);
    expect(templateSeedCalls().length).toBe(DOSSIER_TEMPLATES.length);
    expect(snippetSeedCalls().length).toBe(DOSSIER_SNIPPETS.length);
  });

  it('wraps narratief with frames/tegenframes into Markdown headers + bullets', async () => {
    mockNone.mockResolvedValue(undefined);
    await initDossiersDb();

    const stikstof = dossierSeedCalls().find((c) => c[1][0] === 'stikstof');
    expect(stikstof).toBeTruthy();
    const md = JSON.parse(stikstof![1][8] as string) as {
      waaromNu: string;
      waarover: string;
      onsVerhaal: string;
    };
    expect(md.waaromNu).toMatch(/^## Waarom nu\n\n/);
    expect(md.waarover).toMatch(/^## Waarover\n\n/);
    expect(md.onsVerhaal).toContain('## Ons verhaal');
    expect(md.onsVerhaal).toContain('### Dominante frames');
    expect(md.onsVerhaal).toContain('### Tegenframes');
  });

  it('omits the frames/tegenframes headers when a dossier has none', async () => {
    mockNone.mockResolvedValue(undefined);
    await initDossiersDb();

    const oostvaarders = dossierSeedCalls().find((c) => c[1][0] === 'oostvaarders');
    expect(oostvaarders).toBeTruthy();
    const md = JSON.parse(oostvaarders![1][8] as string) as { onsVerhaal: string };
    expect(md.onsVerhaal).not.toContain('### Dominante frames');
    expect(md.onsVerhaal).not.toContain('### Tegenframes');
  });

  it('seeds the archived example with status gearchiveerd', async () => {
    mockNone.mockResolvedValue(undefined);
    await initDossiersDb();

    const archived = dossierSeedCalls().find((c) => c[1][0] === 'omgevingswet-2023');
    expect(archived).toBeTruthy();
    expect(archived![1][4]).toBe('gearchiveerd'); // status column
  });

  it('is fail-soft when table creation fails (no seeding attempted)', async () => {
    mockNone.mockRejectedValue(new Error('db down'));
    await expect(initDossiersDb()).resolves.toBeUndefined();
    expect(mockNone).toHaveBeenCalledTimes(1); // only the CREATE, which threw
  });

  it('continues seeding remaining dossiers when one dossier insert fails', async () => {
    const happyPathDossierCount = await (async () => {
      mockNone.mockResolvedValue(undefined);
      await initDossiersDb();
      return dossierSeedCalls().length;
    })();

    jest.clearAllMocks();
    mockNone.mockResolvedValueOnce(undefined); // CREATE tables
    mockNone.mockRejectedValueOnce(new Error('insert boom')); // stikstof's dossier INSERT fails
    mockNone.mockResolvedValue(undefined); // everything else succeeds

    await expect(initDossiersDb()).resolves.toBeUndefined();

    // Every dossier row was still attempted despite the first one's INSERT
    // rejecting — the per-row try/catch isolates the failure.
    expect(dossierSeedCalls().length).toBe(happyPathDossierCount);
    // stikstof's own INSERT was attempted (and failed), so its version rows —
    // inside the same try block — were skipped entirely.
    expect(versionSeedCalls().some((c) => c[1][0] === 'stikstof')).toBe(false);
    // A later dossier still got its version rows appended.
    expect(versionSeedCalls().some((c) => c[1][0] === 'oostvaarders')).toBe(true);
    expect(templateSeedCalls().length).toBe(DOSSIER_TEMPLATES.length);
  });
});

describe('relativeLabel', () => {
  it('returns "—" for a non-parseable timestamp', () => {
    expect(relativeLabel('not-a-date')).toBe('—');
    expect(relativeLabel(null)).toBe('—');
    expect(relativeLabel(undefined)).toBe('—');
  });

  it('formats seconds as "nu"', () => {
    expect(relativeLabel(new Date(Date.now() - 30_000).toISOString())).toBe('nu');
  });

  it('formats minutes', () => {
    expect(relativeLabel(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 min');
  });

  it('formats hours', () => {
    expect(relativeLabel(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 u');
  });

  it('formats days under two weeks', () => {
    expect(relativeLabel(new Date(Date.now() - 5 * 86_400_000).toISOString())).toBe('5 dgn');
  });

  it('formats weeks under nine', () => {
    expect(relativeLabel(new Date(Date.now() - 21 * 86_400_000).toISOString())).toBe('3 wk');
  });

  it('formats months once weeks reach nine', () => {
    expect(relativeLabel(new Date(Date.now() - 70 * 86_400_000).toISOString())).toBe('2 mnd');
  });
});
