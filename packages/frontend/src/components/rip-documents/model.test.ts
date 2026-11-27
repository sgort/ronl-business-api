import { describe, expect, it } from 'vitest';
import type { InstanceDocument, KredietCheck } from '../../services/rip-documents.types';
import {
  documentErrorText,
  euro,
  figureDef,
  figureVariable,
  formatAmountInput,
  kredietSuggestion,
  linkedDocsOfTask,
  parseWhole,
  shortDate,
  taskCompletionState,
  wipSummary,
  type TaskInputs,
} from './model';

const doc = (over: Partial<InstanceDocument> = {}): InstanceDocument => ({
  slug: 'rip-psu-presentatie',
  label: 'PSU-presentatie',
  kind: 'B',
  format: '3325975',
  taskKey: 'Task_UitvoerenPSU',
  taskName: 'Uitvoeren PSU',
  candidateGroups: ['rip-projectleider'],
  optional: false,
  map: false,
  status: 'missing',
  edocs: null,
  figures: null,
  checklist: null,
  ...over,
});

const raming = doc({
  slug: 'rip-projectraming',
  label: 'Projectraming VO',
  kind: 'BP',
  taskKey: 'Task_OpstellenVoRaming',
  figures: { totaal: null, onvoorzien: null, prijspeil: null },
});

const check = (over: Partial<KredietCheck> = {}): KredietCheck => ({
  variable: 'ramingBinnenKrediet',
  slug: 'rip-projectraming-do',
  taskKey: 'Task_OpstellenProjectramingDO',
  taskName: 'Opstellen Projectraming DO',
  raming: null,
  krediet: null,
  voorstel: null,
  answer: null,
  afwijking: null,
  values: { binnen: 'ja', buiten: 'nee' },
  ...over,
});

const inputs = (over: Partial<TaskInputs> = {}): TaskInputs => ({
  linked: new Set(),
  figures: {},
  checklists: {},
  formData: {},
  ...over,
});

describe('amounts', () => {
  it('parses whole numbers with Dutch separators and rejects the rest', () => {
    expect(parseWhole('1.234.567')).toBe(1234567);
    expect(parseWhole(' 2026 ')).toBe(2026);
    expect(parseWhole('1,5')).toBeNull();
    expect(parseWhole('')).toBeNull();
    expect(parseWhole(undefined)).toBeNull();
  });

  it('formats while typing, and leaves what it cannot read', () => {
    expect(formatAmountInput('1234567')).toBe('1.234.567');
    expect(formatAmountInput('12,5')).toBe('12,5');
    expect(euro(1234567)).toBe('€ 1.234.567');
  });

  it('suggests binnen at equal or below, buiten above, nothing without numbers', () => {
    expect(kredietSuggestion(100, 100)).toBe('binnen');
    expect(kredietSuggestion(101, 100)).toBe('buiten');
    expect(kredietSuggestion(null, 100)).toBeNull();
  });
});

describe('figures', () => {
  it('names variables as the backend does', () => {
    expect(figureVariable('rip-projectraming', 'totaal')).toBe('raming_totaal');
    expect(figureVariable('rip-projectraming-do', 'onvoorzien')).toBe('raming_do_onvoorzien');
    expect(figureVariable('rip-ssk-rekenmodel', 'bouwkosten')).toBe('ssk_bouwkosten');
    expect(figureVariable('rip-iets', 'x')).toBe('iets_x');
  });

  it('labels the SSK total apart from the raming total', () => {
    expect(figureDef('rip-ssk-rekenmodel', 'totaal').label).toBe('Totaal SSK-raming (excl. btw)');
    expect(figureDef('rip-projectraming', 'totaal').label).toBe('Totaal projectraming (excl. btw)');
    expect(figureDef('rip-projectraming', 'prijspeil').unit).toBe('jaar');
    expect(figureDef('rip-x', 'onbekend')).toEqual({ label: 'onbekend', unit: 'eur' });
  });
});

describe('linkedDocsOfTask', () => {
  it('keeps only the task’s B and B+ documents that are still due', () => {
    const docs = [
      doc(),
      doc({ slug: 'rip-psu-report', kind: 'A' }),
      doc({ slug: 'x', status: 'not-needed' }),
      doc({ slug: 'y', taskKey: 'Other' }),
    ];
    expect(linkedDocsOfTask(docs, 'Task_UitvoerenPSU').map((d) => d.slug)).toEqual([
      'rip-psu-presentatie',
    ]);
  });
});

describe('taskCompletionState', () => {
  it('B: needs the link', () => {
    expect(taskCompletionState([doc()], inputs()).missing).toEqual(['PSU-presentatie koppelen']);
    expect(
      taskCompletionState([doc()], inputs({ linked: new Set(['rip-psu-presentatie']) })).missing
    ).toEqual([]);
  });

  it('B+: needs every figure and sends them as numbers', () => {
    const partial = taskCompletionState(
      [raming],
      inputs({
        linked: new Set(['rip-projectraming']),
        figures: { 'rip-projectraming': { totaal: '1.200.000' } },
      })
    );
    expect(partial.missing).toEqual(['Waarvan onvoorzien invullen', 'Prijspeil invullen']);
    const full = taskCompletionState(
      [raming],
      inputs({
        linked: new Set(['rip-projectraming']),
        figures: {
          'rip-projectraming': { totaal: '1.200.000', onvoorzien: '120.000', prijspeil: '2026' },
        },
      })
    );
    expect(full.missing).toEqual([]);
    expect(full.variables).toEqual({
      raming_totaal: 1200000,
      raming_onvoorzien: 120000,
      raming_prijspeil: 2026,
    });
  });

  it('optional inkoopplan: required only when the form says one is written', () => {
    const optional = doc({
      slug: 'rip-inkoopplan-vol',
      label: 'Inkoopplan (format 2640968)',
      optional: true,
    });
    expect(
      taskCompletionState([optional], inputs({ formData: { inkoopplanNodig: 'nee' } })).missing
    ).toEqual([]);
    expect(
      taskCompletionState([optional], inputs({ formData: { inkoopplanNodig: 'ja' } })).missing
    ).toEqual(['Inkoopplan (format 2640968) koppelen']);
  });

  it('map: link the map, then every checklist item', () => {
    const vg = doc({
      slug: 'rip-verzamelmap-vg',
      label: 'Verzamelmap documenten V&G',
      map: true,
      checklist: [
        { item: 'V&G-plan ontwerpfase', present: false },
        { item: 'Risico-inventarisatie V&G', present: false },
      ],
    });
    expect(taskCompletionState([vg], inputs()).missing).toEqual([
      'Verzamelmap documenten V&G: map koppelen',
    ]);
    expect(
      taskCompletionState(
        [vg],
        inputs({
          linked: new Set(['rip-verzamelmap-vg']),
          checklists: {
            'rip-verzamelmap-vg': [
              { item: 'V&G-plan ontwerpfase', present: true },
              { item: 'Risico-inventarisatie V&G', present: false },
            ],
          },
        })
      ).missing
    ).toEqual(['Risico-inventarisatie V&G in de map']);
  });

  describe('kredietcheck', () => {
    it('suggests from the typed total and krediet, and sends the answer in the variable’s values', () => {
      const state = taskCompletionState(
        [],
        inputs({
          figures: { 'rip-projectraming-do': { totaal: '900' } },
          kredietcheck: { check: check(), krediet: '1.000', choice: null, reason: '' },
        })
      );
      expect(state.krediet).toEqual({
        raming: 900,
        krediet: 1000,
        voorstel: 'binnen',
        keuze: 'binnen',
        deviates: false,
      });
      expect(state.missing).toEqual([]);
      expect(state.variables).toEqual({
        beschikbaarProjectkrediet: 1000,
        ramingBinnenKrediet: 'ja',
      });
    });

    it('falls back to the raming already on the instance (R2.3)', () => {
      const state = taskCompletionState(
        [],
        inputs({
          kredietcheck: {
            check: check({
              variable: 'projectkredietDekking',
              values: { binnen: 'binnen', buiten: 'buiten' },
              raming: 1100,
            }),
            krediet: '1000',
            choice: null,
            reason: '',
          },
        })
      );
      expect(state.krediet?.voorstel).toBe('buiten');
      expect(state.variables.projectkredietDekking).toBe('buiten');
    });

    it('deviating needs a reason, which is then sent', () => {
      const base = { check: check(), krediet: '1000', choice: 'buiten' as const };
      const figures = { 'rip-projectraming-do': { totaal: '900' } };
      expect(
        taskCompletionState([], inputs({ figures, kredietcheck: { ...base, reason: 'ok' } }))
          .missing
      ).toEqual(['reden voor afwijken van het voorstel']);
      const ok = taskCompletionState(
        [],
        inputs({ figures, kredietcheck: { ...base, reason: ' Krediet verhoogd ' } })
      );
      expect(ok.missing).toEqual([]);
      expect(ok.variables).toMatchObject({
        ramingBinnenKrediet: 'nee',
        ramingBinnenKrediet_afwijking: 'Krediet verhoogd',
      });
    });

    it('without numbers there is no suggestion: the person must choose', () => {
      const none = taskCompletionState(
        [],
        inputs({ kredietcheck: { check: check(), krediet: '', choice: null, reason: '' } })
      );
      expect(none.missing).toEqual(['antwoord op de kredietvraag']);
      const chosen = taskCompletionState(
        [],
        inputs({ kredietcheck: { check: check(), krediet: '', choice: 'buiten', reason: '' } })
      );
      expect(chosen.missing).toEqual([]);
      expect(chosen.variables).toEqual({ ramingBinnenKrediet: 'nee' });
    });
  });
});

describe('wipSummary', () => {
  it('counts what is missing and names the first as the blockade', () => {
    const s = wipSummary([doc(), doc({ slug: 'b', label: 'Tweede' })], [], new Set());
    expect(s.edocs).toEqual({ cls: 'miss', text: '2 ontbreekt', title: 'PSU-presentatie, Tweede' });
    expect(s.blockade).toBe('Wacht op koppeling PSU-presentatie');
  });

  it('reports n/m gekoppeld, and the kredietcheck suggestion when that task is open', () => {
    const docs = [
      doc({ status: 'linked' }),
      doc({ slug: 'b', status: 'later' }),
      doc({ slug: 'a', kind: 'A' }),
    ];
    const checks = [check({ raming: 900, krediet: 1000, taskKey: 'T' })];
    expect(wipSummary(docs, checks, new Set(['T']))).toEqual({
      edocs: { cls: 'ok', text: '1/2 gekoppeld' },
      blockade: 'Kredietcheck: voorstel binnen projectkrediet',
    });
    expect(wipSummary(docs, checks, new Set()).blockade).toBeNull();
    expect(wipSummary(docs, [{ ...checks[0], answer: 'ja' }], new Set(['T'])).blockade).toBeNull();
  });

  it('shows nothing for a phase without linked documents; optional ones do not block', () => {
    expect(wipSummary([doc({ kind: 'A' })], [], new Set()).edocs).toBeNull();
    expect(wipSummary([doc({ optional: true })], [], new Set()).blockade).toBeNull();
  });
});

describe('shortDate', () => {
  it('shortens an eDOCS timestamp and keeps what it cannot read', () => {
    expect(shortDate('2026-06-03 12:38:29 UTC')).toMatch(/3 jun\.? 2026/);
    expect(shortDate('gisteren')).toBe('gisteren');
    expect(shortDate(null)).toBeNull();
  });
});

describe('documentErrorText', () => {
  const detail = (body: unknown, fallback: string) =>
    (body as { detail?: string } | null)?.detail ?? fallback;

  it.each([
    ['EDOCS_USER_TOKEN_UNAVAILABLE', /alleen beschikbaar als u bent ingelogd/],
    ['EDOCS_REAUTH_REQUIRED', /Log opnieuw in/],
    ['EDOCS_ACCESS_DENIED', /geen toegang/],
    ['EDOCS_ERROR', /niet bereikbaar/],
  ])('words %s in Dutch', (code, text) => {
    expect(documentErrorText({ code, detail: 'English' }, 'x', detail)).toMatch(text);
  });

  it('keeps the detail of any other code, and the fallback without a body', () => {
    expect(
      documentErrorText({ code: 'NOT_CANDIDATE', detail: 'U mag dit niet.' }, 'x', detail)
    ).toBe('U mag dit niet.');
    expect(documentErrorText(undefined, 'Koppelen mislukt.', detail)).toBe('Koppelen mislukt.');
  });
});
