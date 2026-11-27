import { readFileSync } from 'fs';
import { join } from 'path';
import { readDocumentSpecs, readTaskDocumentSpec } from './document-spec';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('readDocumentSpecs against the real R2.x models', () => {
  it('R2.1: PSU-presentatie is linked on Uitvoeren PSU, next to the generated PSU-verslag', () => {
    const spec = readTaskDocumentSpec(fixture('RipR21Process.bpmn'), 'Task_UitvoerenPSU');
    expect(spec).toMatchObject({
      candidateGroups: ['rip-projectleider'],
      generated: ['rip-psu-report'],
      linked: [{ slug: 'rip-psu-presentatie', format: '3325975', optional: false, map: false }],
    });
  });

  it('R2.2: the three B documents are linked, the objectenboom stays generated', () => {
    const specs = readDocumentSpecs(fixture('RipR22Process.bpmn'));
    const byTask = Object.fromEntries(specs.map((s) => [s.taskKey, s]));
    expect(byTask.Task_OpstellenConceptVO.generated).toEqual(['rip-objectenboom']);
    expect(byTask.Task_OpstellenConceptVO.linked.map((l) => l.slug)).toEqual([
      'rip-ontwerptoelichting',
    ]);
    expect(byTask.Task_BesprekenConceptVO.generated).toEqual([]);
    expect(byTask.Task_BesprekenConceptVO.linked[0].slug).toBe('rip-bevindingenformulier');
    expect(byTask.Task_OpstellenDefinitiefVO.linked[0]).toMatchObject({
      slug: 'rip-hoeveelheidsbepaling',
      format: '3103686',
      figures: [],
    });
  });

  it('R2.3: raming on both routes with figures, SSK task, optional inkoopplan, kredietcheck', () => {
    const xml = fixture('RipR23Process.bpmn');
    for (const task of ['Task_OpstellenVoRaming', 'Task_LatenOpstellenVoRaming']) {
      expect(readTaskDocumentSpec(xml, task)?.linked).toEqual([
        {
          slug: 'rip-projectraming',
          format: '2591295',
          optional: false,
          map: false,
          figures: ['totaal', 'onvoorzien', 'prijspeil'],
          checklist: [],
        },
      ]);
    }
    expect(readTaskDocumentSpec(xml, 'Task_OpstellenSskRaming')).toMatchObject({
      taskName: 'Opstellen SSK-raming',
      candidateGroups: ['rip-kosten-contractdeskundige'],
      linked: [{ slug: 'rip-ssk-rekenmodel', figures: ['bouwkosten', 'totaal'] }],
    });
    expect(readTaskDocumentSpec(xml, 'Task_BepalenInkoopstrategie')).toMatchObject({
      generated: ['rip-inkoopplan'],
      linked: [{ slug: 'rip-inkoopplan-vol', format: '2640968', optional: true }],
    });
    expect(readTaskDocumentSpec(xml, 'Task_ControlerenProjectramingVO')?.kredietCheck).toEqual({
      variable: 'projectkredietDekking',
      slug: 'rip-projectraming',
    });
  });

  it('R2.4: raming DO with kredietcheck in the same task, ILS linked, V&G map with checklist', () => {
    const xml = fixture('RipR24Process.bpmn');
    expect(readTaskDocumentSpec(xml, 'Task_OpstellenProjectramingDO')).toMatchObject({
      linked: [{ slug: 'rip-projectraming-do', figures: ['totaal', 'onvoorzien', 'prijspeil'] }],
      kredietCheck: { variable: 'ramingBinnenKrediet', slug: 'rip-projectraming-do' },
    });
    expect(readTaskDocumentSpec(xml, 'Task_InvullenILS')?.linked[0].slug).toBe('rip-ils-flevoland');
    expect(readTaskDocumentSpec(xml, 'Task_SamenstellenVerzamelmapVG')).toMatchObject({
      taskName: 'Samenstellen Verzamelmap V&G',
      linked: [
        {
          slug: 'rip-verzamelmap-vg',
          map: true,
          checklist: [
            'V&G-plan ontwerpfase',
            'Risico-inventarisatie V&G',
            'Aanstelling V&G-coördinator ontwerpfase',
          ],
        },
      ],
    });
  });

  it('returns null for a task without documents and skips such tasks in the list', () => {
    const xml = fixture('RipR24Process.bpmn');
    expect(readTaskDocumentSpec(xml, 'Task_OpdrachtExternIB')).toBeNull();
    expect(readDocumentSpecs(xml).some((s) => s.taskKey === 'Task_OpdrachtExternIB')).toBe(false);
  });
});

describe('readDocumentSpecs on synthetic input', () => {
  it('attaches a checklist only to a map entry', () => {
    const xml =
      '<bpmn:userTask id="T" name="t" ronl:linkedDocumentRef="a:1,b:2:map" ronl:documentChecklist="a=x;b=y|z">';
    expect(readDocumentSpecs(xml)[0].linked.map((l) => l.checklist)).toEqual([[], ['y', 'z']]);
  });

  it('collapses the line break in a task name', () => {
    const xml = '<bpmn:userTask id="T" name="Opstellen&#10;VO-raming" ronl:documentRef="x">';
    expect(readDocumentSpecs(xml)[0].taskName).toBe('Opstellen VO-raming');
  });
});
