import { docLabel } from './doc-label';

// `docLabel` lives in the backend, not in @ronl/shared, because shared is not
// one of the coverage-gated workspaces (no test script, no runner, no branch
// coverage floor) — see packages/shared/package.json. The BPMN parser
// resolves document labels server-side and ships the swimlane model with
// `doc` already filled in, so there is no frontend consumer for this
// function; only the swimlane *types* remain shared.
describe('docLabel', () => {
  it('uses the curated label when the slug is known', () => {
    expect(docLabel('rip-intake-report')).toBe('Intake-verslag');
    expect(docLabel('rip-psu-report')).toBe('PSU-verslag');
    expect(docLabel('rip-pdp')).toBe('Uitgangspunten VO-fase');
  });

  it('humanises an unmapped slug rather than showing the raw ref', () => {
    // 77 documentRefs exist across the twelve phases and only a few have
    // curated Dutch labels. An unmapped one must still read as a document
    // name, not as an identifier.
    expect(docLabel('rip-projectraming')).toBe('Projectraming');
    expect(docLabel('rip-nota-besluitvorming-ao')).toBe('Nota besluitvorming ao');
  });

  it('leaves a slug without the rip- prefix alone apart from casing', () => {
    expect(docLabel('weekrapport')).toBe('Weekrapport');
  });
});
