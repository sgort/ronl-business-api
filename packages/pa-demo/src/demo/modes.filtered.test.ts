import { describe, it, expect } from 'vitest';
import { PA_MODES, allStaticSections, findPaModeForSection } from './modes.filtered';
import { ALLOWED_SECTION_IDS, DROPPED_SECTION_IDS } from './sections.allow';

describe('filtered modes', () => {
  it('keeps exactly the nine Beheer sections', () => {
    const beheer = PA_MODES.find((m) => m.id === 'beheer');
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
    const beheer = PA_MODES.find((m) => m.id === 'beheer');
    const groups = beheer!.groups.map((g) => g.label);
    expect(groups).not.toContain('IOU');
    expect(groups).not.toContain('Hulpmiddelen');
  });

  it('removes any group left with no items', () => {
    for (const mode of PA_MODES) {
      for (const group of mode.groups) {
        expect(group.items.length).toBeGreaterThan(0);
      }
    }
  });

  it('hides dropped sections from the command palette', () => {
    // PACommandPalette calls allStaticSections() directly and takes no
    // sections prop, so filtering in DemoSectionRouter alone would leave ⌘K
    // able to jump straight to iou-feedback or gereedschap-overzicht.
    const ids = allStaticSections().map((s) => s.id);
    for (const dropped of DROPPED_SECTION_IDS) {
      expect(ids).not.toContain(dropped);
    }
  });

  it('resolves an allowed section to its mode', () => {
    expect(findPaModeForSection('db-overzicht')).toBe('beheer');
    expect(findPaModeForSection('vandaag')).toBe('vandaag');
  });

  it('resolves a dropped section to null rather than its old mode', () => {
    expect(findPaModeForSection('iou-feedback')).toBeNull();
    expect(findPaModeForSection('gereedschap-overzicht')).toBeNull();
  });

  it('keeps the four non-Beheer modes', () => {
    expect(PA_MODES.map((m) => m.id)).toEqual([
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
    const real = new Set(allStaticSections().map((s) => s.id));
    for (const id of ALLOWED_SECTION_IDS) {
      if (id === 'dossiers') continue; // data-driven, not a static section
      expect(real.has(id)).toBe(true);
    }
  });
});
