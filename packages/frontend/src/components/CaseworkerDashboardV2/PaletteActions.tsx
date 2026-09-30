import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { PaletteActionsContext, type PaletteAction } from './paletteActionsContext';

/** The registry the ⌘K palette reads its dynamic actions from; see paletteActionsContext. */
export function PaletteActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<PaletteAction[]>([]);
  const register = useCallback((action: PaletteAction) => {
    setActions((prev) => [...prev.filter((a) => a.id !== action.id), action]);
    return () => setActions((prev) => prev.filter((a) => a.id !== action.id));
  }, []);
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <PaletteActionsContext.Provider value={value}>{children}</PaletteActionsContext.Provider>;
}
