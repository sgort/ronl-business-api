// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaModesProvider, usePaModes } from './PaModesContext';
import { PA_MODES } from '../pages/public-affairs-v2/modes.config';
import type { PaModeConfig } from '../pages/public-affairs-v2/modes.config';

function Probe() {
  const { allStaticSections, findPaModeForSection } = usePaModes();
  return (
    <>
      <span data-testid="ids">
        {allStaticSections()
          .map((s) => s.id)
          .join(',')}
      </span>
      <span data-testid="mode">{String(findPaModeForSection('vandaag'))}</span>
    </>
  );
}

const narrowed: PaModeConfig[] = PA_MODES.map((m) => ({
  ...m,
  groups: m.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.id === 'vandaag') }))
    .filter((g) => g.items.length > 0),
}));

describe('PaModesProvider', () => {
  it('derives the searchable sections from the modes it was given, not from PA_MODES', () => {
    // The whole point: a host that narrows the mode set narrows ⌘K with it.
    render(
      <PaModesProvider modes={narrowed}>
        <Probe />
      </PaModesProvider>
    );
    expect(screen.getByTestId('ids')).toHaveTextContent('vandaag');
    expect(screen.getByTestId('ids')).not.toHaveTextContent('iou-feedback');
  });

  it('excludes the sort sentinels from the searchable sections', () => {
    // sort-kompas / sort-momentum are rail affordances, not destinations.
    // They leaked into the palette once already during the demo build.
    render(
      <PaModesProvider modes={PA_MODES}>
        <Probe />
      </PaModesProvider>
    );
    const ids = screen.getByTestId('ids').textContent!.split(',');
    expect(ids).not.toContain('sort-kompas');
    expect(ids).not.toContain('sort-momentum');
    expect(ids).toContain('vandaag');
  });

  it('resolves a section back to its mode', () => {
    render(
      <PaModesProvider modes={PA_MODES}>
        <Probe />
      </PaModesProvider>
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('vandaag');
  });

  it('throws outside a provider rather than silently offering the full set', () => {
    expect(() => render(<Probe />)).toThrow(/PaModesProvider/);
  });

  it('rejects an empty mode set, which consumers index into', () => {
    // PADashboardV2 seeds its initial mode from modes[0] and falls back to it
    // for an out-of-set mode. Both are safe only because this throws — an empty
    // set would otherwise reach the shell and fail as "reading 'id' of
    // undefined", pointing at the shell instead of at the host's wiring.
    expect(() =>
      render(
        <PaModesProvider modes={[]}>
          <Probe />
        </PaModesProvider>
      )
    ).toThrow(/empty `modes` array/);
  });
});
