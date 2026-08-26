/**
 * The mode set the cockpit renders, supplied by the host.
 *
 * PA_MODES is still exported as data — a host that wants the full cockpit
 * imports it and passes it straight through. What changed is that no component
 * reaches for it directly any more, so a host can narrow the set and have every
 * consumer follow, including ⌘K.
 *
 * That last part is the reason this exists rather than a filter in the section
 * router: PACommandPalette used to call allStaticSections() itself, so filtering
 * at the router left the palette still offering sections the rail had dropped.
 * Deriving both from one injected value makes the two incapable of diverging.
 */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  SORT_SECTION_IDS,
  type PaModeConfig,
  type PaModeId,
  type PaRailItem,
} from '../pages/public-affairs-v2/modes.config';

interface PaModesValue {
  modes: PaModeConfig[];
  allStaticSections: () => PaRailItem[];
  findPaModeForSection: (sectionId: string) => PaModeId | null;
}

const PaModesCtx = createContext<PaModesValue | null>(null);

export function PaModesProvider({
  modes,
  children,
}: {
  modes: PaModeConfig[];
  children: ReactNode;
}) {
  const value = useMemo<PaModesValue>(
    () => ({
      modes,
      allStaticSections: () => {
        const out: PaRailItem[] = [];
        for (const mode of modes) {
          for (const group of mode.groups) {
            for (const item of group.items) {
              // Sort sentinels are rail affordances, not destinations.
              if (!SORT_SECTION_IDS.has(item.id)) out.push(item);
            }
          }
        }
        return out;
      },
      findPaModeForSection: (sectionId: string) => {
        for (const mode of modes) {
          for (const group of mode.groups) {
            if (group.items.some((i) => i.id === sectionId)) return mode.id;
          }
        }
        return null;
      },
    }),
    [modes]
  );

  return <PaModesCtx.Provider value={value}>{children}</PaModesCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePaModes(): PaModesValue {
  const ctx = useContext(PaModesCtx);
  if (!ctx) {
    throw new Error(
      'usePaModes must be used inside PaModesProvider — pass `modes` on the cockpit host prop.'
    );
  }
  return ctx;
}
