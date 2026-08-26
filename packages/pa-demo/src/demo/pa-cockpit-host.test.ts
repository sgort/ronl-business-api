import { describe, expect, it } from 'vitest';
import { PA_MODES } from '@ronl/pa-cockpit';
import { buildAllowedModes } from './allowed-modes';
import { DROPPED_SECTION_IDS } from './sections.allow';
// Side-effecting import: registers the host with @ronl/pa-cockpit via
// configurePaCockpit() at module scope, exactly once for this test file.
// See packages/frontend/src/pages/pa-cockpit-host.test.ts, which handles the
// same shape.
import { demoCockpitHost } from './pa-cockpit-host';

describe('pa-cockpit-host', () => {
  it('narrows modes through buildAllowedModes, not the raw PA_MODES', () => {
    // This is plato's headline safety guarantee: IOU and Hulpmiddelen reach
    // into the authenticated caseworker app and must never reach a public,
    // unauthenticated site. `modes: PA_MODES` (skipping the narrowing) type-
    // checks, lints and passes every other test in this package — this is
    // the one assertion that would catch it.
    expect(demoCockpitHost.modes).toEqual(buildAllowedModes(PA_MODES));
  });

  it('never exposes a dropped section id through the host modes', () => {
    // States the guarantee in the terms it matters in: stated this way, the
    // test would still catch a regression even if buildAllowedModes' own
    // mechanism changed shape.
    const ids = demoCockpitHost.modes.flatMap((mode) =>
      mode.groups.flatMap((group) => group.items.map((item) => item.id))
    );
    for (const dropped of DROPPED_SECTION_IDS) {
      expect(ids).not.toContain(dropped);
    }
  });
});
