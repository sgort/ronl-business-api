import { docLabel } from '@ronl/shared';

// Relocated from packages/shared/src/rip-swimlane.test.ts (Task 1 brief):
// @ronl/shared has no test script or runner configured (see
// packages/shared/package.json), so its unit tests live here instead,
// colocated with the backend code that will consume `docLabel`.
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
