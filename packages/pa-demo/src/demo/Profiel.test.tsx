import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Profiel from './Profiel';
import { DemoRoleProvider } from './DemoRoleContext';
import { getTenantConfig } from './shims/tenant';

// Wraps the real getTenantConfig in a vi.fn so most tests exercise the
// actual shim (province Flevoland) while one test below can override it
// for a single render to prove the tenant-row label actually tracks
// organisationType, rather than happening to say "Provincie" for any
// reason.
vi.mock('./shims/tenant', async () => {
  const actual = await vi.importActual<typeof import('./shims/tenant')>('./shims/tenant');
  return { ...actual, getTenantConfig: vi.fn(actual.getTenantConfig) };
});

function renderPage() {
  return render(
    <DemoRoleProvider>
      <Profiel />
    </DemoRoleProvider>
  );
}

describe('Profiel', () => {
  it('shows the synthetic user from the shim', () => {
    renderPage();
    expect(screen.getByText('Marieke de Vries')).toBeInTheDocument();
    expect(screen.getByText('m.devries')).toBeInTheDocument();
    expect(screen.getByText('FL-2291')).toBeInTheDocument();
  });

  it('shows the tenant display name rather than the raw id', () => {
    renderPage();
    expect(screen.getByText('Provincie Flevoland')).toBeInTheDocument();
  });

  it('reflects the selected role in the roles list', () => {
    renderPage();
    expect(screen.getByText(/pa-admin/)).toBeInTheDocument();
  });

  it('marks the page as demonstration data', () => {
    // A profile page is the most likely thing on the site to be mistaken for
    // a real person's record.
    renderPage();
    expect(screen.getByText(/fictief|demonstratie/i)).toBeInTheDocument();
  });

  it('labels the tenant row "Provincie" for the shim\'s province tenant', () => {
    // Guards against a hardcoded "Gemeente" label next to a provincial
    // display name — a mismatch a Dutch government audience would notice
    // immediately.
    renderPage();
    expect(screen.getByText('Provincie')).toBeInTheDocument();
    expect(screen.queryByText('Gemeente')).toBeNull();
  });

  it('follows organisationType when the tenant is a municipality', () => {
    // Proves the label is actually conditional, not just correct by
    // coincidence for the one tenant the shim ships: override the shim for
    // this render only and confirm the row's label flips with it.
    vi.mocked(getTenantConfig).mockReturnValueOnce({
      id: 'test-gemeente',
      displayName: 'Gemeente Teststad',
      organisationType: 'municipality',
    });
    renderPage();
    expect(screen.getByText('Gemeente')).toBeInTheDocument();
    expect(screen.getByText('Gemeente Teststad')).toBeInTheDocument();
    expect(screen.queryByText('Provincie')).toBeNull();
  });
});
