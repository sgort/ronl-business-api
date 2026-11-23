import {
  decodeXmlEntities,
  figureVariable,
  linkedDocNumberVariable,
  linkedDocVariable,
  parseDocumentChecklist,
  parseDocumentFigures,
  parseKredietCheck,
  parseLinkedDocumentRef,
} from './linked-docs';

describe('parseLinkedDocumentRef', () => {
  it('reads slug and format', () => {
    expect(parseLinkedDocumentRef('rip-projectraming:2591295')).toEqual([
      { slug: 'rip-projectraming', format: '2591295', optional: false, map: false },
    ]);
  });

  it('reads the optional and map flags in any order', () => {
    expect(parseLinkedDocumentRef('rip-inkoopplan-vol:2640968:optional')[0]).toMatchObject({
      optional: true,
      map: false,
    });
    expect(parseLinkedDocumentRef('rip-verzamelmap-vg:3423634:map:optional')[0]).toMatchObject({
      optional: true,
      map: true,
    });
  });

  it('splits a comma-separated list and trims', () => {
    expect(parseLinkedDocumentRef(' a:1 , b:2:map ').map((r) => r.slug)).toEqual(['a', 'b']);
  });

  it('drops malformed entries instead of throwing', () => {
    expect(parseLinkedDocumentRef('no-format,:123,Bad Slug:1,ok:9')).toEqual([
      { slug: 'ok', format: '9', optional: false, map: false },
    ]);
  });

  it('is empty for an absent attribute', () => {
    expect(parseLinkedDocumentRef(undefined)).toEqual([]);
    expect(parseLinkedDocumentRef(null)).toEqual([]);
    expect(parseLinkedDocumentRef('')).toEqual([]);
  });
});

describe('parseDocumentFigures / parseDocumentChecklist', () => {
  it('reads figures per slug', () => {
    expect(parseDocumentFigures('rip-projectraming=totaal,onvoorzien,prijspeil')).toEqual({
      'rip-projectraming': ['totaal', 'onvoorzien', 'prijspeil'],
    });
  });

  it('reads several slugs separated by semicolons', () => {
    expect(parseDocumentFigures('a=x;b=y,z')).toEqual({ a: ['x'], b: ['y', 'z'] });
  });

  it('reads checklist items separated by pipes, keeping commas and spaces inside an item', () => {
    expect(parseDocumentChecklist('rip-vg=V&G-plan ontwerpfase|Risico, inventarisatie')).toEqual({
      'rip-vg': ['V&G-plan ontwerpfase', 'Risico, inventarisatie'],
    });
  });

  it('drops entries without a slug or items', () => {
    expect(parseDocumentFigures('=x;a=;b=y')).toEqual({ b: ['y'] });
    expect(parseDocumentChecklist(undefined)).toEqual({});
  });
});

describe('parseKredietCheck', () => {
  it('reads variable and slug', () => {
    expect(parseKredietCheck('projectkredietDekking:rip-projectraming')).toEqual({
      variable: 'projectkredietDekking',
      slug: 'rip-projectraming',
    });
  });

  it('rejects malformed values', () => {
    expect(parseKredietCheck('')).toBeNull();
    expect(parseKredietCheck('noslug')).toBeNull();
    expect(parseKredietCheck('bad-var:rip-x')).toBeNull();
    expect(parseKredietCheck(undefined)).toBeNull();
  });
});

describe('variable names', () => {
  it('uses the agreed figure names', () => {
    expect(figureVariable('rip-projectraming', 'totaal')).toBe('raming_totaal');
    expect(figureVariable('rip-projectraming-do', 'prijspeil')).toBe('raming_do_prijspeil');
    expect(figureVariable('rip-ssk-rekenmodel', 'bouwkosten')).toBe('ssk_bouwkosten');
  });

  it('derives a name for a slug without an agreed base', () => {
    expect(figureVariable('rip-iets-anders', 'totaal')).toBe('iets_anders_totaal');
  });

  it('names the link variables after the slug', () => {
    expect(linkedDocVariable('rip-ils-flevoland')).toBe('linkedDoc_rip-ils-flevoland');
    expect(linkedDocNumberVariable('rip-ils-flevoland')).toBe('linkedDocNumber_rip-ils-flevoland');
  });
});

describe('decodeXmlEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeXmlEntities('V&amp;G-co&#246;rdinator&#10;&#x41;&lt;&gt;&quot;&apos;')).toBe(
      'V&G-coördinator\nA<>"\''
    );
  });

  it('decodes &amp; last so an encoded entity stays literal', () => {
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;');
  });
});
