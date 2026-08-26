/**
 * Narrows the cockpit's mode set to what plato is allowed to show.
 *
 * This is the successor to modes.filtered.ts, and the policy is unchanged —
 * only the mechanism is. The old version worked by aliasing four relative
 * spellings of './modes.config' so Vite resolved them here while tsc resolved
 * them to the real module. That divergence needed its own parity test to catch
 * a name silently becoming undefined. Passing data to a required prop needs
 * none of it.
 *
 * The result is handed to `PaCockpitHost.modes` (see pa-cockpit-host.tsx), and
 * the package feeds it to every consumer through PaModesProvider — the rail,
 * the ⌘K palette and the section router all read the same narrowed set, so
 * they cannot disagree. That is a stronger guarantee than the alias gave:
 * filtering used to have to reach every consumer by import redirection, and
 * PACommandPalette in particular built its own hit list from the unfiltered
 * module until the package started injecting the set instead.
 */
import type { PaModeConfig } from '@ronl/pa-cockpit';
import { isAllowedSection } from './sections.allow';

export function buildAllowedModes(all: PaModeConfig[]): PaModeConfig[] {
  return all.map((mode) => ({
    ...mode,
    groups: mode.groups
      .map((group) => ({ ...group, items: group.items.filter((i) => isAllowedSection(i.id)) }))
      // A group whose every item was dropped would render as an empty heading.
      .filter((group) => group.items.length > 0),
  }));
}
