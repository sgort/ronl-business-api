import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import DemoSectionRouter from './DemoSectionRouter';
import { DROPPED_SECTION_IDS } from './sections.allow';
import { getUser } from './shims/keycloak';
import { getTenantConfig } from './shims/tenant';
import { DemoRoleProvider, useDemoRole, type DemoRoleId } from './DemoRoleContext';

// Each vendored section has its own test file in packages/frontend, so every
// child is mocked one level below what the router itself consumes.
vi.mock('./Profiel', () => ({ default: () => <div>PROFIEL</div> }));
vi.mock('./RollenRechten', () => ({ default: () => <div>ROLLEN</div> }));

// Used only by the role-propagation tests below — a probe that renders
// whatever `user` prop it was actually given, so the test can tell a fresh
// getUser() apart from a forwarded stale snapshot.
vi.mock('../vendor/components/PADashboardV2/dossierbeheer/Dossierbeheer', () => ({
  default: ({ user }: { user: { roles: string[] } | null }) => (
    <div data-testid="db-roles">{(user?.roles ?? []).join(',')}</div>
  ),
}));

// The router calls usePaData() before its switch. packages/frontend keeps a
// canonical stub with a parity test at src/test/paData.stub.ts — this mirrors
// its shape (Resource<T> = { data, status, refetch }), not a differently-
// shaped hand-rolled object, and importActual is used to keep the real
// PaDataProvider export intact. Only `dossiers` is given a value because
// that's the only member DemoSectionRouter itself reads; every section
// rendered in these tests is either demo-owned or mocked above, so nothing
// else in this tree touches usePaData().
vi.mock('../vendor/pages/public-affairs-v2/PaDataProvider', async () => {
  const actual = await vi.importActual<
    typeof import('../vendor/pages/public-affairs-v2/PaDataProvider')
  >('../vendor/pages/public-affairs-v2/PaDataProvider');
  return {
    ...actual,
    usePaData: () => ({
      dossiers: { data: [], status: 'ok' as const, refetch: vi.fn() },
    }),
  };
});

function renderSection(sectionId: string) {
  // DemoSectionRouter calls useDemoRole() (see its role-propagation
  // header comment), so it only renders inside a DemoRoleProvider — exactly
  // how the vendored shell will mount it once wired up.
  return render(
    <DemoRoleProvider>
      <DemoSectionRouter
        sectionId={sectionId}
        prioritering="kompas"
        kompasViz="radar"
        user={getUser()}
        tenantConfig={getTenantConfig()}
        onOpenDossier={() => {}}
      />
    </DemoRoleProvider>
  );
}

describe('DemoSectionRouter', () => {
  it('routes profiel to the demo-owned page, not the caseworker one', () => {
    renderSection('profiel');
    expect(screen.getByText('PROFIEL')).toBeInTheDocument();
  });

  it('routes rollen to the PA-native page', () => {
    renderSection('rollen');
    expect(screen.getByText('ROLLEN')).toBeInTheDocument();
  });

  it('renders nothing for a dropped section id', () => {
    // Belt and braces: modes.filtered already hides these from the rail and
    // the palette, but a deep link or a stale ⌘K entry must not reach one.
    for (const id of DROPPED_SECTION_IDS) {
      const { container, unmount } = renderSection(id);
      expect(container.textContent).toBe('');
      unmount();
    }
  });

  it('imports no caseworker component', async () => {
    // The six ../CaseworkerDashboard/* imports all lived in PASectionRouter.
    // This asserts the replacement carries none, which is what keeps them out
    // of the bundle entirely. Source-text assertion is deliberate here: a
    // mocked child renders identically whether or not the real one was ever
    // imported, so the absence of an import cannot be shown behaviourally —
    // reviewers who flag this as a test-hygiene issue should read this
    // comment rather than "fix" it.
    //
    // Path built via node:path/node:url rather than `new URL(..., import.meta.url)`
    // directly: under the jsdom test environment, the global `URL` constructor
    // is jsdom's DOM URL, not Node's, and node:fs rejects it with "The URL
    // must be of scheme file" even though its href is a valid file: URL.
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const src = await readFile(join(here, 'DemoSectionRouter.tsx'), 'utf-8');
    expect(src).not.toMatch(/CaseworkerDashboard/);
  });

  describe('role propagation', () => {
    // Grabbed by the RoleSwitch probe below so the test can flip the demo
    // role from outside DemoRoleProvider's subtree.
    let setRole: (id: DemoRoleId) => void;

    function RoleSwitch() {
      const { setRoleId } = useDemoRole();
      setRole = setRoleId;
      return null;
    }

    function Shell({ sectionId }: { sectionId: string }) {
      // Mirrors the vendored shell exactly (PADashboardV2.tsx L221,
      // L250-251): getUser() is captured into React state once, at mount,
      // and is never refreshed when the demo role switches. Shell itself
      // does not call useDemoRole(), so — like the real shell — its element
      // is unaffected by a role change: DemoRoleProvider re-renders (its own
      // state changed) but Shell's props/type here are unchanged, so React
      // bails out of re-rendering Shell's subtree. Any role change that
      // still reaches the rendered section can only be coming from
      // DemoSectionRouter being a context consumer itself, not from Shell
      // refreshing anything.
      const [user] = useState(() => getUser());
      const [tenantConfig] = useState(() => getTenantConfig());
      return (
        <DemoSectionRouter
          sectionId={sectionId}
          prioritering="kompas"
          kompasViz="radar"
          user={user}
          tenantConfig={tenantConfig}
          onOpenDossier={() => {}}
        />
      );
    }

    it('passes the section a fresh role after the demo role switches, not the shell’s stale mount-time snapshot', () => {
      render(
        <DemoRoleProvider>
          <RoleSwitch />
          <Shell sectionId="db-overzicht" />
        </DemoRoleProvider>
      );

      // Starts as beheerder (DemoRoleProvider's default) -> pa-admin.
      expect(screen.getByTestId('db-roles')).toHaveTextContent('public-affairs,pa-admin');

      act(() => setRole('redacteur'));

      // If DemoSectionRouter forwarded the `user` prop it received from
      // Shell, this would still read pa-admin — Shell's snapshot never
      // changes. Reading pa-editor proves the router read a fresh
      // getUser() of its own on this render instead.
      expect(screen.getByTestId('db-roles')).toHaveTextContent('public-affairs,pa-editor');
    });
  });
});
