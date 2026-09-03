// packages/pa-cockpit/src/pages/public-affairs-v2/dossierbeheer.data.test.ts
import { describe, it, expect } from 'vitest';
import {
  DB_BEWAARTERMIJNEN,
  DB_CLASSIFICATIES,
  DB_ROLES,
  bewaartermijnLabel,
  buildSeedAdminDossiers,
  classificatieLabel,
  deriveDossierRole,
  expandVars,
  todayLabel,
  toMarkdown,
  wordCount,
} from './dossierbeheer.data';
import type { Dossier } from '@ronl/shared';

describe('deriveDossierRole', () => {
  // The three roles are cumulative in practice (an admin's token carries the
  // lower ones too), so the order of the checks is what decides which
  // capability set the UI enables. A reversed order would silently demote
  // every admin to author.
  it('picks the highest role the token carries', () => {
    expect(deriveDossierRole(['pa-author', 'pa-editor', 'pa-admin']).id).toBe(DB_ROLES[2].id);
    expect(deriveDossierRole(['pa-author', 'pa-editor']).id).toBe(DB_ROLES[1].id);
    expect(deriveDossierRole(['pa-author']).id).toBe(DB_ROLES[0].id);
  });

  it('falls back to a read-only pseudo-role for a token with none of them', () => {
    const role = deriveDossierRole(['public-affairs']);
    expect(role.can.create).toBe(false);
    expect(role.can.edit).toBe(false);
    expect(role.note).toMatch(/pa-author, pa-editor of pa-admin/);
  });

  it('ignores roles from other surfaces entirely', () => {
    expect(deriveDossierRole([]).can.edit).toBe(false);
    expect(deriveDossierRole(['realm-admin', 'caseworker']).can.edit).toBe(false);
  });
});

describe('archival label lookups', () => {
  it('resolves a known id to its label', () => {
    expect(classificatieLabel(DB_CLASSIFICATIES[0].id)).toBe(DB_CLASSIFICATIES[0].label);
    expect(bewaartermijnLabel(DB_BEWAARTERMIJNEN[0].id)).toBe(DB_BEWAARTERMIJNEN[0].label);
  });

  it('shows an em dash for an unset or unknown id, never the raw id', () => {
    // These render straight into the dossier's archival panel; an unrecognised
    // id leaking through would read as a classification that does not exist.
    expect(classificatieLabel(undefined)).toBe('—');
    expect(classificatieLabel('geen-idee')).toBe('—');
    expect(bewaartermijnLabel(undefined)).toBe('—');
    expect(bewaartermijnLabel('geen-idee')).toBe('—');
  });
});

describe('expandVars', () => {
  it('substitutes every supplied variable, everywhere it occurs', () => {
    const out = expandVars('{{today}} — {{currentUser}} ({{department}}) · {{projectName}}', {
      today: '8 jul 2026',
      currentUser: 'Sanne Bakker',
      department: 'Bestuur',
      projectName: 'Stikstof',
    });
    expect(out).toBe('8 jul 2026 — Sanne Bakker (Bestuur) · Stikstof');
  });

  it('falls back to sensible defaults for an empty context', () => {
    // A template inserted before the author has typed anything must not leave
    // literal {{currentUser}} braces in the document.
    const out = expandVars('[{{today}}][{{currentUser}}][{{department}}][{{projectName}}]', {});
    expect(out).toBe(`[${todayLabel()}][][Public Affairs][]`);
    expect(out).not.toContain('{{');
  });

  it('returns an empty document untouched', () => {
    expect(expandVars('', { currentUser: 'x' })).toBe('');
  });
});

describe('wordCount', () => {
  it('counts across every field it is given', () => {
    expect(wordCount('een twee', 'drie')).toBe(3);
  });

  it('is zero for empty fields', () => {
    expect(wordCount('', '   ')).toBe(0);
  });
});

describe('buildSeedAdminDossiers', () => {
  it('gives every seeded dossier an owner, a last-edited label and three versions', () => {
    const items = buildSeedAdminDossiers();
    expect(items.length).toBeGreaterThan(0);
    for (const d of items) {
      expect(d.eigenaar).toBeTruthy();
      expect(d.bewerkt).toBeTruthy();
      expect(d.kompas).toBeDefined();
    }
  });

  it('deep-copies each kompas so editing one dossier cannot mutate the seed', () => {
    // The seed is a module-level constant shared by every consumer; a shallow
    // copy here would make an edit in Dossierbeheer show up in Vandaag's
    // scoring for the rest of the session.
    const a = buildSeedAdminDossiers();
    const b = buildSeedAdminDossiers();
    expect(a[0].kompas).not.toBe(b[0].kompas);
    expect(a[0].kompas).toEqual(b[0].kompas);
  });
});

describe('toMarkdown', () => {
  const dossier = (over: Partial<Dossier> = {}): Dossier =>
    ({
      id: 'd1',
      naam: 'Test',
      onderwerp: 'Test',
      status: 'actief',
      momentum: 'flat',
      waaromNu: 'Omdat het nu speelt.',
      waarover: 'Over de provinciale inzet.',
      narratief: { onsVerhaal: 'Ons verhaal.', frames: [], tegenframes: [] },
      kompas: {},
      ...over,
    }) as unknown as Dossier;

  it('gives each filled-in field its own heading', () => {
    const md = toMarkdown(dossier());
    expect(md.waaromNu).toBe('## Waarom nu\n\nOmdat het nu speelt.\n');
    expect(md.waarover).toBe('## Waarover\n\nOver de provinciale inzet.\n');
    expect(md.onsVerhaal).toBe('## Ons verhaal\n\nOns verhaal.\n');
  });

  it('emits nothing at all for a field the author has not written yet', () => {
    // A bare "## Waarom nu" with no body under it looks like content that was
    // deleted rather than a section that was never started.
    const md = toMarkdown(
      dossier({
        waaromNu: '',
        waarover: '',
        narratief: { onsVerhaal: '', frames: [], tegenframes: [] },
      } as Partial<Dossier>)
    );
    expect(md).toEqual({ waaromNu: '', waarover: '', onsVerhaal: '' });
  });

  it('appends the frame and counter-frame lists under their own subheadings', () => {
    const md = toMarkdown(
      dossier({
        narratief: {
          onsVerhaal: 'Ons verhaal.',
          frames: [{ text: 'Boeren betalen', meta: 'LTO, mei 2026', kind: 'frame' as const }],
          tegenframes: [{ text: 'Natuur eerst', meta: 'NM, jun 2026', kind: 'tegen' as const }],
        },
      } as Partial<Dossier>)
    );
    expect(md.onsVerhaal).toContain('### Dominante frames');
    expect(md.onsVerhaal).toContain('- Boeren betalen *(LTO, mei 2026)*');
    expect(md.onsVerhaal).toContain('### Tegenframes');
    expect(md.onsVerhaal).toContain('- Natuur eerst *(NM, jun 2026)*');
  });

  it('carries the frame lists even when there is no ons-verhaal text above them', () => {
    const md = toMarkdown(
      dossier({
        narratief: {
          onsVerhaal: '',
          frames: [{ text: 'Boeren betalen', meta: 'LTO', kind: 'frame' as const }],
          tegenframes: [],
        },
      } as Partial<Dossier>)
    );
    expect(md.onsVerhaal).toContain('### Dominante frames');
    expect(md.onsVerhaal).not.toContain('## Ons verhaal');
    expect(md.onsVerhaal).not.toContain('### Tegenframes');
  });
});
