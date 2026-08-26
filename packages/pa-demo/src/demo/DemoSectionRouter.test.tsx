import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { expectMockNamesRealExports } from '@ronl/pa-cockpit/test-utils';
import DemoSectionRouter from './DemoSectionRouter';
import { DROPPED_SECTION_IDS } from './sections.allow';
import { getUser } from './shims/keycloak';
import { getTenantConfig } from './shims/tenant';
import { DemoRoleProvider } from './DemoRoleContext';
import { useDemoRole, type DemoRoleId } from './demo-role';

/**
 * One stub, not fourteen: everything this file doesn't own — Vandaag,
 * Issuekaart, Monitoring, Voortgang, Dossierbeheer, the package's own "beheer"
 * panels and the dossier-lookup-or-placeholder fallthrough — reaches the demo
 * through a single package export, whose own behaviour is covered by
 * packages/pa-cockpit/src/components/PADashboardV2/PaSectionsRouter.test.tsx.
 * This file only needs to prove it is reached, for the right ids, with the
 * right `user`.
 *
 * The probe renders the roles of whatever `user` it was handed, so the
 * role-propagation cases below can tell a fresh getUser() apart from a
 * forwarded stale snapshot.
 *
 * Spreading the real module before the override is the pattern
 * packages/pa-cockpit/src/test/mockModule.ts documents, and it is load-bearing
 * here rather than defensive: DemoRoleProvider (rendered by every case below)
 * imports deriveDossierRole from this same module, so a wholesale replacement
 * would leave it undefined and every test would fail somewhere unrelated to
 * what it is asserting.
 */
const paCockpitMock = vi.hoisted(() => {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    exports: {
      PaSectionsRouter: (props: { user?: { roles?: string[] } | null }) => {
        calls.push(props as Record<string, unknown>);
        return <div data-testid="db-roles">{(props.user?.roles ?? []).join(',')}</div>;
      },
    },
  };
});

vi.mock('@ronl/pa-cockpit', async (importActual) => ({
  ...(await importActual<typeof import('@ronl/pa-cockpit')>()),
  ...paCockpitMock.exports,
}));

vi.mock('./Profiel', () => ({ default: () => <div>PROFIEL</div> }));
vi.mock('./RollenRechten', () => ({ default: () => <div>ROLLEN</div> }));

function renderSection(sectionId: string) {
  // DemoSectionRouter calls useDemoRole() (see its role-propagation
  // header comment), so it only renders inside a DemoRoleProvider — exactly
  // how the shell mounts it, since App.tsx wraps PADashboardV2 in one.
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
  it('mocks only names @ronl/pa-cockpit really exports', async () => {
    // vi.importActual, not import(): the path is mocked, so a plain dynamic
    // import would hand back the mock and compare it with itself.
    await expectMockNamesRealExports(
      vi.importActual('@ronl/pa-cockpit'),
      paCockpitMock.exports as Record<string, unknown>
    );
  });

  it('routes profiel to the demo-owned page, not the caseworker one', () => {
    renderSection('profiel');
    expect(screen.getByText('PROFIEL')).toBeInTheDocument();
  });

  it('routes rollen to the PA-native page', () => {
    renderSection('rollen');
    expect(screen.getByText('ROLLEN')).toBeInTheDocument();
  });

  it('renders nothing for a dropped section id', () => {
    // Belt and braces: buildAllowedModes already hides these from the rail and
    // the palette, but a deep link or a stale ⌘K entry must not reach one —
    // and must not reach PaSectionsRouter either, whose terminal branch would
    // offer a "pick another dossier" panel for an id that is not a dossier.
    for (const id of DROPPED_SECTION_IDS) {
      const { container, unmount } = renderSection(id);
      expect(container.textContent).toBe('');
      unmount();
    }
  });

  it('delegates every package-owned id to PaSectionsRouter, with the same props', () => {
    renderSection('vandaag');
    expect(paCockpitMock.calls.at(-1)).toEqual(
      expect.objectContaining({
        sectionId: 'vandaag',
        prioritering: 'kompas',
        kompasViz: 'radar',
        tenantConfig: getTenantConfig(),
      })
    );
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
      // Mirrors the package shell exactly (PADashboardV2.tsx): getUser() is
      // captured into React state once, at mount, and is never refreshed when
      // the demo role switches. Shell itself does not call useDemoRole(), so
      // — like the real shell — its element is unaffected by a role change:
      // DemoRoleProvider re-renders (its own state changed) but Shell's
      // props/type here are unchanged, so React bails out of re-rendering
      // Shell's subtree. Any role change that still reaches the rendered
      // section can only be coming from DemoSectionRouter being a context
      // consumer itself, not from Shell refreshing anything.
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
      // db-overzicht specifically: it is the id PaSectionsRouter forwards
      // `user` to Dossierbeheer for, so it is the one that would silently
      // regress if the tail below were written `<PaSectionsRouter {...props} />`.
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
      // changes. Reading pa-editor proves the router overrode it with a fresh
      // getUser() of its own on this render instead.
      expect(screen.getByTestId('db-roles')).toHaveTextContent('public-affairs,pa-editor');
    });
  });
});
