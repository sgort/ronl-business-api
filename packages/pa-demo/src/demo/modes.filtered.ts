/**
 * The allow-list applied at the data source.
 *
 * Every vendored consumer of modes.config resolves here through the alias in
 * vite.config.ts, so the rail, the ⌘K palette and DemoSectionRouter all read
 * one filtered truth and cannot disagree. Filtering in the router alone would
 * not be enough: PACommandPalette builds its hit list from allStaticSections()
 * on its own.
 *
 * Re-exports every name the real modes.config exports, not just the four this
 * demo actively filters — PADashboardV2.tsx imports SORT_SECTION_IDS at
 * runtime, so a name present on the origin but missing here would become
 * `undefined` wherever a vendored file imports it, silently, with no type
 * error (see src/vendor/README.md and the CLAUDE.md note on this failure
 * mode).
 */
import {
  PA_MODES as ALL_MODES,
  SORT_SECTION_IDS,
  isPaItemVisible,
  type PaGateContext,
  type PaModeId,
  type OrgTypeGate,
  type PaRailItem,
  type PaRailGroup,
  type PaModeConfig,
} from '../vendor/pages/public-affairs-v2/modes.config';
import { isAllowedSection } from './sections.allow';

export type { PaGateContext, PaModeId, OrgTypeGate, PaRailItem, PaRailGroup, PaModeConfig };
export { isPaItemVisible, SORT_SECTION_IDS };

export const PA_MODES: PaModeConfig[] = ALL_MODES.map((mode) => ({
  ...mode,
  groups: mode.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isAllowedSection(item.id)),
    }))
    // A group whose every item was dropped would render as an empty heading.
    .filter((group) => group.items.length > 0),
}));

/** Static searchable sections (excludes sort sentinels; dossiers added separately). */
export function allStaticSections(): PaRailItem[] {
  const out: PaRailItem[] = [];
  for (const mode of PA_MODES) {
    for (const group of mode.groups) {
      for (const item of group.items) {
        if (!SORT_SECTION_IDS.has(item.id)) out.push(item);
      }
    }
  }
  return out;
}

export function findPaModeForSection(sectionId: string): PaModeId | null {
  for (const mode of PA_MODES) {
    for (const group of mode.groups) {
      if (group.items.some((i) => i.id === sectionId)) return mode.id;
    }
  }
  return null;
}
