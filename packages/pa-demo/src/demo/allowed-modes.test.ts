import { describe, it, expect } from 'vitest';
import { PA_MODES, SORT_SECTION_IDS, type PaModeConfig } from '@ronl/pa-cockpit';
import { buildAllowedModes } from './allowed-modes';
import { ALLOWED_SECTION_IDS, DROPPED_SECTION_IDS } from './sections.allow';

const allowed = buildAllowedModes(PA_MODES);

/**
 * The narrowed set's section ids, minus the sort sentinels.
 *
 * This used to be `allStaticSections()` imported from modes.filtered.ts, back
 * when the demo owned a whole stand-in for modes.config. It doesn't any more:
 * the package derives the palette's hit list from `PaCockpitHost.modes` via
 * PaModesProvider (see PaModesContext.tsx), so what reaches ⌘K is exactly what
 * `buildAllowedModes` returned, minus SORT_SECTION_IDS — that exclusion is the
 * package's, applied to whatever set the host supplies. Mirroring it here lets
 * these cases keep asserting what a visitor can reach, without the demo
 * re-implementing a walker the package already owns.
 */
function reachableSectionIds(modes: PaModeConfig[]): string[] {
  return modes
    .flatMap((m) => m.groups.flatMap((g) => g.items.map((i) => i.id)))
    .filter((id) => !SORT_SECTION_IDS.has(id));
}

function modeForSection(modes: PaModeConfig[], sectionId: string): string | null {
  for (const mode of modes) {
    for (const group of mode.groups) {
      if (group.items.some((i) => i.id === sectionId)) return mode.id;
    }
  }
  return null;
}

describe('buildAllowedModes', () => {
  it('keeps exactly the nine Beheer sections', () => {
    const beheer = allowed.find((m) => m.id === 'beheer');
    const ids = beheer!.groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toEqual([
      'db-overzicht',
      'db-nieuw',
      'kompas-spec',
      'bronnen',
      'zoekcriteria',
      'curatie-spec',
      'notificaties',
      'profiel',
      'rollen',
    ]);
  });

  it('drops the IOU group and Gereedschap entirely', () => {
    const beheer = allowed.find((m) => m.id === 'beheer');
    const groups = beheer!.groups.map((g) => g.label);
    expect(groups).not.toContain('IOU');
    expect(groups).not.toContain('Hulpmiddelen');
  });

  it('removes any group left with no items', () => {
    for (const mode of allowed) {
      for (const group of mode.groups) {
        expect(group.items.length).toBeGreaterThan(0);
      }
    }
  });

  it('drops every section on the deny list', () => {
    const ids = allowed.flatMap((m) => m.groups.flatMap((g) => g.items.map((i) => i.id)));
    for (const dropped of DROPPED_SECTION_IDS) expect(ids).not.toContain(dropped);
  });

  it('leaves no cockpit section undecided', () => {
    // sections.allow.ts is deny-by-default only for as long as both of its
    // lists stay exhaustive. A section added to the cockpit later and named in
    // neither one is filtered out of the rail and out of ⌘K by the code
    // above — which looks like the policy working — while remaining
    // *renderable*: DemoSectionRouter's DROPPED_SECTION_IDS guard would not
    // match it, so an in-app onNavigate would send it straight to
    // PaSectionsRouter and it would draw. That is deny-by-default quietly
    // becoming allow-by-omission, and every test here would still be green.
    // This is the case that fails instead, naming the id that needs a
    // decision.
    const all = PA_MODES.flatMap((m) => m.groups.flatMap((g) => g.items.map((i) => i.id)));
    const undecided = all.filter(
      (id) => !ALLOWED_SECTION_IDS.includes(id) && !DROPPED_SECTION_IDS.includes(id)
    );
    expect(undecided).toEqual([]);
  });

  it('hides dropped sections from the command palette', () => {
    // The palette takes no sections prop — it reads the host's modes through
    // usePaModes(), so filtering in DemoSectionRouter alone would leave ⌘K
    // able to jump straight to iou-feedback or gereedschap-overzicht. What
    // this narrows is the one set the palette and the rail both read.
    const ids = reachableSectionIds(allowed);
    for (const dropped of DROPPED_SECTION_IDS) {
      expect(ids).not.toContain(dropped);
    }
  });

  it('hides sort sentinels from the command palette', () => {
    // sort-kompas/sort-momentum are allow-listed so they stay in the
    // Vandaag rail's sort-order group, but they set a sort, not a section —
    // no router has a case for them, so a ⌘K hit on either would fall
    // through to the "not available" panel. The package's allStaticSections()
    // excludes SORT_SECTION_IDS for exactly this reason; this guards that the
    // allow-list does not smuggle one back in under a different id.
    const ids = reachableSectionIds(allowed);
    expect(ids).not.toContain('sort-kompas');
    expect(ids).not.toContain('sort-momentum');
  });

  it('resolves an allowed section to its mode', () => {
    expect(modeForSection(allowed, 'db-overzicht')).toBe('beheer');
    expect(modeForSection(allowed, 'vandaag')).toBe('vandaag');
  });

  it('resolves a dropped section to null rather than its old mode', () => {
    expect(modeForSection(allowed, 'iou-feedback')).toBeNull();
    expect(modeForSection(allowed, 'gereedschap-overzicht')).toBeNull();
  });

  it('keeps the four non-Beheer modes', () => {
    expect(allowed.map((m) => m.id)).toEqual([
      'vandaag',
      'dossiers',
      'monitoring',
      'voortgang',
      'beheer',
    ]);
  });

  it('allows every id it lists', () => {
    // Guards against an allow-list entry that no longer matches a real
    // section — a typo would silently drop a page rather than fail.
    const real = new Set(reachableSectionIds(allowed));
    for (const id of ALLOWED_SECTION_IDS) {
      // sort-kompas/sort-momentum are legitimately allow-listed for the
      // rail's sort-order group but are deliberately excluded above — they
      // set a sort, not a navigable section. See the sentinel test above.
      if (SORT_SECTION_IDS.has(id)) continue;
      expect(real.has(id)).toBe(true);
    }
  });
});
