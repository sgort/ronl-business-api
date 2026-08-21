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
  completeKompas,
  rowToDossier,
  dossierDateLabel,
  rowToAdminDossier,
  DOSSIER_TEMPLATES,
  DOSSIER_SNIPPETS,
} from './pa-dossiers.db';
import { SEED_DOSSIER_IDS } from '@ronl/shared';
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

describe('completeKompas', () => {
  it('fills every axis with a zero score when nothing is stored yet', () => {
    // A dossier authored before the Kompas existed has no scores at all.
    for (const partial of [undefined, null]) {
      const full = completeKompas(partial);
      expect(Object.values(full).every((v) => v.score === 0 && v.duiding === '')).toBe(true);
    }
  });

  it('keeps the axes that are stored and fills in only the rest', () => {
    const full = completeKompas({ risico: { score: 2, duiding: 'hoog' } });
    expect(full.risico).toEqual({ score: 2, duiding: 'hoog' });
    expect(Object.values(full).filter((v) => v.score === 0).length).toBeGreaterThan(0);
  });
});

describe('rowToDossier', () => {
  it('rebuilds the dossier from the stored body plus the indexed columns', () => {
    const d = rowToDossier({
      id: 'd-1',
      naam: 'Naam',
      onderwerp: 'Onderwerp',
      status: 'actief',
      momentum: 'hoog',
      kompas: { risico: { score: 2, duiding: 'x' } },
      body: { waaromNu: 'nu', waarover: 'wat' },
    });
    expect(d).toMatchObject({ id: 'd-1', naam: 'Naam', waaromNu: 'nu', waarover: 'wat' });
    expect(d.kompas.risico).toEqual({ score: 2, duiding: 'x' });
  });

  it('tolerates a row with neither a body nor a kompas column', () => {
    // Rows written by an older schema version have no body blob at all.
    const d = rowToDossier({ id: 'd-2', naam: 'Naam', onderwerp: 'O', status: 'actief' });
    expect(d.id).toBe('d-2');
    expect(Object.values(d.kompas).every((v) => v.score === 0)).toBe(true);
  });
});

describe('dossierDateLabel', () => {
  it('formats a timestamp as a short Dutch date', () => {
    expect(dossierDateLabel('2026-05-12T10:00:00Z')).toBe('12 mei 2026');
  });

  it('echoes an unparseable string back rather than inventing a date', () => {
    expect(dossierDateLabel('12 mei 2026')).toBe('12 mei 2026');
  });

  it('falls back to a dash when there is no timestamp at all', () => {
    expect(dossierDateLabel(null)).toBe('—');
    expect(dossierDateLabel(undefined)).toBe('—');
    // A number is a parseable timestamp; an object is neither parseable nor a string.
    expect(dossierDateLabel({})).toBe('—');
  });
});

describe('rowToAdminDossier', () => {
  it('maps a fully populated governance row', () => {
    const admin = rowToAdminDossier(
      {
        id: 'd-1',
        naam: 'Naam',
        onderwerp: 'O',
        status: 'concept',
        momentum: 'hoog',
        eigenaar: 'Kernteam PA',
        kompas: { risico: { score: 1, duiding: '' } },
        md: { waaromNu: '# nu', waarover: '# wat', onsVerhaal: '# verhaal' },
        versie: 4,
        gepubliceerd: true,
        sjabloon: 'standaard',
        archief: { reden: 'afgerond' },
        updated_at: new Date().toISOString(),
      },
      [{ v: 1, at: '1 jan 2026', by: 'PA', note: 'aangemaakt' }]
    );
    expect(admin).toMatchObject({
      versie: 4,
      gepubliceerd: true,
      sjabloon: 'standaard',
      bewerkt: 'nu',
    });
    expect(admin.versies).toHaveLength(1);
  });

  it('defaults every optional governance column on a freshly created row', () => {
    const admin = rowToAdminDossier(
      { id: 'd-2', naam: 'Naam', onderwerp: 'O', status: 'concept', momentum: 'laag' },
      []
    );
    expect(admin).toMatchObject({
      kompas: {},
      md: { waaromNu: '', waarover: '', onsVerhaal: '' },
      versie: 1,
      gepubliceerd: false,
      sjabloon: 'blanco',
      archief: null,
      bewerkt: '—',
    });
  });
});

describe('initDossiersDb — failures that are not Error instances', () => {
  // node-postgres can reject with a bare string on a connection-level failure;
  // both catches have a String(err) fallback so the log line still says something.
  it('is fail-soft when table creation rejects with a string', async () => {
    mockNone.mockRejectedValue('connection terminated');
    await expect(initDossiersDb()).resolves.toBeUndefined();
    expect(mockNone).toHaveBeenCalledTimes(1);
  });

  it('continues seeding when one dossier insert rejects with a string', async () => {
    mockNone.mockResolvedValueOnce(undefined); // CREATE tables
    mockNone.mockRejectedValueOnce('connection terminated'); // first dossier INSERT
    mockNone.mockResolvedValue(undefined);

    await expect(initDossiersDb()).resolves.toBeUndefined();

    expect(dossierSeedCalls().length).toBeGreaterThan(1);
  });
});

describe('seed dossier ownership', () => {
  it('seeds every dossier with a real owner, and attributes its history to the same person', async () => {
    // SEED_OWNERS is keyed by SeedDossierId, so a dossier added without an owner
    // fails to compile rather than seeding as a plausible-looking 'Kernteam PA'.
    // This pins the behaviour that typing protects.
    mockNone.mockResolvedValue(undefined);
    await initDossiersDb();

    const seeded = dossierSeedCalls().filter((c) =>
      SEED_DOSSIER_IDS.includes(c[1][0] as (typeof SEED_DOSSIER_IDS)[number])
    );
    expect(seeded).toHaveLength(SEED_DOSSIER_IDS.length);

    for (const call of seeded) {
      const id = call[1][0] as string;
      // pa_dossiers params are [id, tenant_id, naam, onderwerp, status, momentum, eigenaar, ...].
      const eigenaar = call[1][6] as string;
      expect(eigenaar).toBeTruthy();
      expect(eigenaar).not.toBe('Kernteam PA');

      // Every version row for that dossier is credited to its owner.
      // pa_dossier_versions params are [dossier_id, v, by, note].
      const versions = versionSeedCalls().filter((v) => v[1][0] === id);
      expect(versions.length).toBeGreaterThan(0);
      for (const v of versions) expect(v[1][2]).toBe(eigenaar);
    }
  });
});
