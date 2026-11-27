import { readFileSync } from 'fs';
import { join } from 'path';
import { readDocumentSpecs, readTaskDocumentSpec } from '../../rip-swimlane/document-spec';
import {
  buildInstanceDocuments,
  buildKredietChecks,
  checkCompletion,
  kredietSuggestion,
  linkVariables,
  parseLinkRecord,
  prefillVariableNames,
  taskState,
  toWholeNumber,
  type LinkRecord,
} from './logic';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../rip-swimlane/__fixtures__', name), 'utf8');
const R21 = fixture('RipR21Process.bpmn');
const R23 = fixture('RipR23Process.bpmn');
const R24 = fixture('RipR24Process.bpmn');

const link = (over: Partial<LinkRecord> = {}): string =>
  JSON.stringify({
    documentId: '3500001',
    documentNumber: '3500001',
    linkedAt: '2026-11-23T10:00:00.000Z',
    linkedBy: 'u-1',
    ...over,
  });

const act = (activityId: string, endTime: string | null = '2026-11-23T10:00:00Z') => ({
  activityId,
  endTime,
});

describe('kredietSuggestion', () => {
  it.each([
    [100, 100, 'binnen'],
    [99, 100, 'binnen'],
    [101, 100, 'buiten'],
  ])('raming %i vs krediet %i suggests %s', (raming, krediet, expected) => {
    expect(kredietSuggestion(raming, krediet)).toBe(expected);
  });

  it('makes no suggestion without a krediet or a raming', () => {
    expect(kredietSuggestion(100, null)).toBeNull();
    expect(kredietSuggestion(null, 100)).toBeNull();
  });
});

describe('parseLinkRecord / linkVariables', () => {
  it('round-trips through the variables a link writes', () => {
    const record: LinkRecord = {
      documentId: '42',
      documentNumber: '3500042',
      linkedAt: 't',
      linkedBy: 'u',
      uploadedVia: 'ronl',
      inWorkspace: false,
    };
    const vars = linkVariables('rip-ils-flevoland', record);
    expect(vars['linkedDocNumber_rip-ils-flevoland']).toEqual({ value: '3500042', type: 'String' });
    expect(parseLinkRecord(vars['linkedDoc_rip-ils-flevoland'].value)).toEqual(record);
  });

  it('reads an already-parsed object too', () => {
    expect(parseLinkRecord({ documentId: '1' })?.documentNumber).toBe('1');
  });

  it('rejects absent, malformed and id-less values', () => {
    expect(parseLinkRecord(undefined)).toBeNull();
    expect(parseLinkRecord('')).toBeNull();
    expect(parseLinkRecord('{not json')).toBeNull();
    expect(parseLinkRecord('{"documentNumber":"1"}')).toBeNull();
    expect(parseLinkRecord('42')).toBeNull();
  });
});

describe('taskState / toWholeNumber', () => {
  it('reads active, done and not reached; a rerun counts as active', () => {
    expect(taskState([act('T', null)], 'T')).toBe('active');
    expect(taskState([act('T')], 'T')).toBe('done');
    expect(taskState([act('T'), act('T', null)], 'T')).toBe('active');
    expect(taskState([{ activityId: 'T', endTime: 'x', canceled: true }], 'T')).toBe('not-reached');
    expect(taskState([], 'T')).toBe('not-reached');
  });

  it('accepts whole numbers and numeric strings only', () => {
    expect(toWholeNumber(5)).toBe(5);
    expect(toWholeNumber(' 1200000 ')).toBe(1200000);
    expect(toWholeNumber(1.5)).toBeNull();
    expect(toWholeNumber('1.5')).toBeNull();
    expect(toWholeNumber('')).toBeNull();
    expect(toWholeNumber(null)).toBeNull();
  });
});

describe('buildInstanceDocuments', () => {
  const build = (
    xml: string,
    vars: Record<string, unknown>,
    activities = [] as ReturnType<typeof act>[]
  ) =>
    buildInstanceDocuments({
      specs: readDocumentSpecs(xml),
      vars,
      activities,
      live: new Map([['rip-psu-presentatie', { version: '3', modified: '2026-11-20' }]]),
      checklists: new Map(),
    });

  it('R2.1: generated documents keep their A status, the PSU-presentatie is B', () => {
    const docs = build(R21, {}, [
      act('Task_AanvullenProjectplan2'),
      act('Task_UitvoerenPSU', null),
    ]);
    const bySlug = Object.fromEntries(docs.map((d) => [d.slug, d]));
    expect(bySlug['rip-intake-report']).toMatchObject({ kind: 'A', status: 'generated' });
    expect(bySlug['rip-psu-report']).toMatchObject({ kind: 'A', status: 'pending' });
    expect(bySlug['rip-pdp']).toMatchObject({ status: 'later' });
    expect(bySlug['rip-psu-presentatie']).toMatchObject({
      kind: 'B',
      format: '3325975',
      status: 'missing',
      edocs: null,
      candidateGroups: ['rip-projectleider'],
    });
  });

  it('a linked document shows its number and the live version', () => {
    const docs = build(
      R21,
      {
        'linkedDoc_rip-psu-presentatie': link({
          documentNumber: '3500999',
          name: '25008 — PSU-presentatie — N23',
        }),
      },
      [act('Task_UitvoerenPSU', null)]
    );
    expect(docs.find((d) => d.slug === 'rip-psu-presentatie')).toMatchObject({
      status: 'linked',
      edocs: {
        documentNumber: '3500999',
        name: '25008 — PSU-presentatie — N23',
        version: '3',
        modified: '2026-11-20',
      },
    });
  });

  it('R2.3: one raming entry, on the route taken, with figures', () => {
    const docs = build(
      R23,
      {
        raming_totaal: 1200000,
        raming_onvoorzien: '120000',
        'linkedDoc_rip-projectraming': link(),
      },
      [act('Task_BepalenRamingsroute'), act('Task_LatenOpstellenVoRaming')]
    );
    const ramingen = docs.filter((d) => d.slug === 'rip-projectraming');
    expect(ramingen).toHaveLength(1);
    expect(ramingen[0]).toMatchObject({
      kind: 'BP',
      taskKey: 'Task_LatenOpstellenVoRaming',
      status: 'linked',
      figures: { totaal: 1200000, onvoorzien: 120000, prijspeil: null },
    });
  });

  it('R2.3: the optional inkoopplan is not needed once the task closed with "nee"', () => {
    const vars = { inkoopplanNodig: 'nee' };
    const done = build(R23, vars, [act('Task_BepalenInkoopstrategie')]);
    expect(done.find((d) => d.slug === 'rip-inkoopplan-vol')?.status).toBe('not-needed');
    const open = build(R23, vars, [act('Task_BepalenInkoopstrategie', null)]);
    expect(open.find((d) => d.slug === 'rip-inkoopplan-vol')).toMatchObject({
      status: 'missing',
      optional: true,
    });
  });

  it('R2.4: the V&G map carries its checklist, defaulting to not present', () => {
    const docs = build(R24, {});
    expect(docs.find((d) => d.slug === 'rip-verzamelmap-vg')).toMatchObject({
      map: true,
      status: 'later',
      checklist: [
        { item: 'V&G-plan ontwerpfase', present: false },
        { item: 'Risico-inventarisatie V&G', present: false },
        { item: 'Aanstelling V&G-coördinator ontwerpfase', present: false },
      ],
    });
  });
});

describe('buildKredietChecks', () => {
  it('R2.3: suggestion from raming_totaal vs beschikbaarProjectkrediet', () => {
    const [kc] = buildKredietChecks(readDocumentSpecs(R23), {
      raming_totaal: 900,
      beschikbaarProjectkrediet: 1000,
    });
    expect(kc).toMatchObject({
      variable: 'projectkredietDekking',
      taskKey: 'Task_ControlerenProjectramingVO',
      raming: 900,
      krediet: 1000,
      voorstel: 'binnen',
      answer: null,
    });
  });

  it('R2.4: answers in ja/nee, with the confirmed deviation', () => {
    const [kc] = buildKredietChecks(readDocumentSpecs(R24), {
      raming_do_totaal: 1100,
      beschikbaarProjectkrediet: 1000,
      ramingBinnenKrediet: 'ja',
      ramingBinnenKrediet_afwijking: 'Meerwerk gedekt uit reserve',
    });
    expect(kc).toMatchObject({
      voorstel: 'nee',
      answer: 'ja',
      afwijking: 'Meerwerk gedekt uit reserve',
      values: { binnen: 'ja', buiten: 'nee' },
    });
  });
});

describe('checkCompletion', () => {
  const check = (
    xml: string,
    taskKey: string,
    submitted: Record<string, unknown>,
    instanceVars: Record<string, unknown> = {},
    checklists = new Map()
  ) =>
    checkCompletion({
      spec: readTaskDocumentSpec(xml, taskKey),
      submitted,
      instanceVars,
      checklists,
    });

  it('passes a task without documents', () => {
    expect(check(R24, 'Task_OpdrachtExternIB', {})).toEqual({ missing: [], variables: {} });
  });

  it('B: blocks until linked, then passes', () => {
    expect(check(R21, 'Task_UitvoerenPSU', {}).missing).toEqual([
      { slug: 'rip-psu-presentatie', what: 'document', label: 'PSU-presentatie' },
    ]);
    expect(
      check(R21, 'Task_UitvoerenPSU', {}, { 'linkedDoc_rip-psu-presentatie': link() }).missing
    ).toEqual([]);
  });

  it('a link sent in the completion body does not count', () => {
    expect(
      check(R21, 'Task_UitvoerenPSU', { 'linkedDoc_rip-psu-presentatie': link() }).missing
    ).toHaveLength(1);
  });

  it('B+: needs the link and every figure, and stores sent figures as Long', () => {
    const missing = check(R23, 'Task_OpstellenSskRaming', { ssk_bouwkosten: 700 }).missing;
    expect(missing.map((m) => m.what)).toEqual(['document', 'figure']);
    const ok = check(
      R23,
      'Task_OpstellenSskRaming',
      { ssk_bouwkosten: 700, ssk_totaal: '900' },
      { 'linkedDoc_rip-ssk-rekenmodel': link() }
    );
    expect(ok.missing).toEqual([]);
    expect(ok.variables).toEqual({
      ssk_bouwkosten: { value: 700, type: 'Long' },
      ssk_totaal: { value: 900, type: 'Long' },
    });
  });

  it('B+: a figure already on the instance counts and is not rewritten', () => {
    const ok = check(
      R23,
      'Task_OpstellenSskRaming',
      {},
      { 'linkedDoc_rip-ssk-rekenmodel': link(), ssk_bouwkosten: 1, ssk_totaal: 2 }
    );
    expect(ok).toEqual({ missing: [], variables: {} });
  });

  it('rejects a figure that is not a whole number', () => {
    const r = check(
      R23,
      'Task_OpstellenSskRaming',
      { ssk_bouwkosten: 'veel', ssk_totaal: 1.5 },
      { 'linkedDoc_rip-ssk-rekenmodel': link() }
    );
    expect(r.missing.map((m) => m.what)).toEqual(['figure', 'figure']);
  });

  it('inkoopplan: required only when the form says one is written', () => {
    expect(check(R23, 'Task_BepalenInkoopstrategie', { inkoopplanNodig: 'nee' }).missing).toEqual(
      []
    );
    expect(check(R23, 'Task_BepalenInkoopstrategie', { inkoopplanNodig: 'ja' }).missing).toEqual([
      { slug: 'rip-inkoopplan-vol', what: 'document', label: 'Inkoopplan (format 2640968)' },
    ]);
  });

  it('map: every checklist item must be present', () => {
    const vg = { 'linkedDoc_rip-verzamelmap-vg': link({ map: true }) };
    const partial = new Map([
      [
        'rip-verzamelmap-vg',
        [
          { item: 'A', present: true },
          { item: 'B', present: false },
        ],
      ],
    ]);
    expect(check(R24, 'Task_SamenstellenVerzamelmapVG', {}, vg, partial).missing).toEqual([
      { slug: 'rip-verzamelmap-vg', what: 'checklist', label: 'Verzamelmap documenten V&G: B' },
    ]);
    const full = new Map([['rip-verzamelmap-vg', [{ item: 'A', present: true }]]]);
    expect(check(R24, 'Task_SamenstellenVerzamelmapVG', {}, vg, full).missing).toEqual([]);
  });

  describe('kredietcheck', () => {
    const ramingVo = { raming_totaal: 900 };

    it('R2.3: needs an answer', () => {
      expect(check(R23, 'Task_ControlerenProjectramingVO', {}, ramingVo).missing).toEqual([
        { slug: 'rip-projectraming', what: 'answer', label: 'Kredietcheck Projectraming VO' },
      ]);
    });

    it('R2.3: following the suggestion needs no reason; the suggestion is recomputed', () => {
      const r = check(
        R23,
        'Task_ControlerenProjectramingVO',
        {
          beschikbaarProjectkrediet: 1000,
          projectkredietDekking: 'binnen',
          projectkredietDekking_voorstel: 'buiten',
        },
        ramingVo
      );
      expect(r.missing).toEqual([]);
      expect(r.variables).toEqual({
        beschikbaarProjectkrediet: { value: 1000, type: 'Long' },
        projectkredietDekking_voorstel: { value: 'binnen', type: 'String' },
      });
    });

    it('R2.3: deviating needs a reason of at least four characters', () => {
      const deviate = { beschikbaarProjectkrediet: 1000, projectkredietDekking: 'buiten' };
      expect(
        check(
          R23,
          'Task_ControlerenProjectramingVO',
          { ...deviate, projectkredietDekking_afwijking: 'abc' },
          ramingVo
        ).missing
      ).toEqual([
        { slug: 'rip-projectraming', what: 'reason', label: 'Kredietcheck Projectraming VO' },
      ]);
      expect(
        check(
          R23,
          'Task_ControlerenProjectramingVO',
          { ...deviate, projectkredietDekking_afwijking: 'Krediet wordt verhoogd' },
          ramingVo
        ).missing
      ).toEqual([]);
    });

    it('with no krediet there is no suggestion and any answer passes', () => {
      const r = check(
        R23,
        'Task_ControlerenProjectramingVO',
        { projectkredietDekking: 'buiten' },
        ramingVo
      );
      expect(r.missing).toEqual([]);
      expect(r.variables.projectkredietDekking_voorstel).toEqual({ value: '', type: 'String' });
    });

    it('rejects an answer outside the variable’s values', () => {
      expect(
        check(R24, 'Task_OpstellenProjectramingDO', { ramingBinnenKrediet: 'binnen' }).missing.map(
          (m) => m.what
        )
      ).toContain('answer');
    });

    it('R2.4: figures and the ja/nee answer in one task', () => {
      const r = check(
        R24,
        'Task_OpstellenProjectramingDO',
        {
          raming_do_totaal: 1100,
          raming_do_onvoorzien: 100,
          raming_do_prijspeil: 2026,
          beschikbaarProjectkrediet: 1000,
          ramingBinnenKrediet: 'nee',
        },
        { 'linkedDoc_rip-projectraming-do': link() }
      );
      expect(r.missing).toEqual([]);
      expect(r.variables.ramingBinnenKrediet_voorstel).toEqual({ value: 'nee', type: 'String' });
      expect(r.variables.raming_do_totaal).toEqual({ value: 1100, type: 'Long' });
    });
  });
});

describe('prefill from an earlier phase (DO raming from the VO raming)', () => {
  const r24 = () => readDocumentSpecs(R24);
  const ramingDo = (docs: ReturnType<typeof buildInstanceDocuments>) =>
    docs.find((d) => d.slug === 'rip-projectraming-do');

  it('names the VO figures and the projectkrediet as what R2.4 prefills from', () => {
    expect(prefillVariableNames(r24()).sort()).toEqual([
      'beschikbaarProjectkrediet',
      'raming_onvoorzien',
      'raming_prijspeil',
      'raming_totaal',
    ]);
  });

  it('suggests the VO figures while the DO raming has none of its own', () => {
    const docs = buildInstanceDocuments({
      specs: r24(),
      vars: {},
      activities: [],
      live: new Map(),
      checklists: new Map(),
      projectVars: { raming_totaal: 40000, raming_onvoorzien: '4500', raming_prijspeil: 2026 },
    });
    expect(ramingDo(docs)?.prefill).toEqual({ totaal: 40000, onvoorzien: 4500, prijspeil: 2026 });
  });

  it('suggests nothing once the DO raming has its own figures, or when nothing was recorded', () => {
    const own = buildInstanceDocuments({
      specs: r24(),
      vars: { raming_do_totaal: 50000 },
      activities: [],
      live: new Map(),
      checklists: new Map(),
      projectVars: { raming_totaal: 40000 },
    });
    expect(ramingDo(own)?.prefill).toBeNull();
    const none = buildInstanceDocuments({
      specs: r24(),
      vars: {},
      activities: [],
      live: new Map(),
      checklists: new Map(),
    });
    expect(ramingDo(none)?.prefill).toBeNull();
  });

  it('documents without a source prefill nothing', () => {
    const docs = buildInstanceDocuments({
      specs: readDocumentSpecs(R23),
      vars: {},
      activities: [],
      live: new Map(),
      checklists: new Map(),
      projectVars: { raming_totaal: 1 },
    });
    expect(docs.every((d) => d.prefill === null)).toBe(true);
  });

  it('suggests the projectkrediet an earlier phase recorded, only while this one has none', () => {
    const [suggested] = buildKredietChecks(r24(), {}, { beschikbaarProjectkrediet: 60000 });
    expect(suggested).toMatchObject({ krediet: null, kredietPrefill: 60000, voorstel: null });
    const [own] = buildKredietChecks(
      r24(),
      { beschikbaarProjectkrediet: 70000 },
      { beschikbaarProjectkrediet: 60000 }
    );
    expect(own).toMatchObject({ krediet: 70000, kredietPrefill: null });
  });
});
