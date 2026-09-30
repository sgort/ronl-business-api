import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * Commands a section offers the ⌘K palette while it has something to act on,
 * e.g. "Proces van deze taak bekijken" while a task with lanes is selected.
 * The palette's own entries are the static sections of modes.config; these
 * are the dynamic ones, registered from deep inside the section tree.
 */
export interface PaletteAction {
  id: string;
  label: string;
  run: () => void;
}

export interface Registry {
  actions: PaletteAction[];
  register: (action: PaletteAction) => () => void;
}

export const PaletteActionsContext = createContext<Registry | null>(null);

/** The actions currently on offer; empty outside a provider. */
export function usePaletteActions(): PaletteAction[] {
  return useContext(PaletteActionsContext)?.actions ?? [];
}

/**
 * Offer `action` while it is non-null. The latest `run` is always the one
 * invoked, without re-registering on every render.
 */
export function usePaletteAction(action: PaletteAction | null): void {
  const registry = useContext(PaletteActionsContext);
  const register = registry?.register;
  const runRef = useRef(action?.run);
  runRef.current = action?.run;
  const id = action?.id;
  const label = action?.label;

  useEffect(() => {
    if (!register || !id || !label) return;
    return register({ id, label, run: () => runRef.current?.() });
  }, [register, id, label]);
}
