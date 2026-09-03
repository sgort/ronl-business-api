import { StrictMode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DemoRoleProvider } from './DemoRoleContext';
import { useDemoRole, DEMO_ROLE_OPTIONS, type DemoRoleId } from './demo-role';
import { getUser } from './shims/keycloak';

let setRole: (id: DemoRoleId) => void;

function Probe() {
  const { roleId, role, setRoleId } = useDemoRole();
  setRole = setRoleId;
  return (
    <div>
      <span data-testid="id">{roleId}</span>
      <span data-testid="label">{role.label}</span>
      <span data-testid="kc">{role.keycloak}</span>
      <span data-testid="publish">{String(role.can.publish)}</span>
      <span data-testid="del">{String(role.can.del)}</span>
      <span data-testid="roles">{getUser().roles.join(',')}</span>
    </div>
  );
}

function renderProbe() {
  render(
    <DemoRoleProvider>
      <Probe />
    </DemoRoleProvider>
  );
}

describe('DemoRoleContext', () => {
  it('starts as Beheerder so a visitor sees the full product first', () => {
    renderProbe();
    expect(screen.getByTestId('id')).toHaveTextContent('beheerder');
    expect(screen.getByTestId('label')).toHaveTextContent('Beheerder');
  });

  it('writes the selected role into the synthetic token', () => {
    renderProbe();
    act(() => setRole('redacteur'));
    expect(screen.getByTestId('roles')).toHaveTextContent('public-affairs,pa-editor');
  });

  it('derives Redacteur caps: publishes but cannot delete', () => {
    renderProbe();
    act(() => setRole('redacteur'));
    expect(screen.getByTestId('publish')).toHaveTextContent('true');
    expect(screen.getByTestId('del')).toHaveTextContent('false');
  });

  it('derives Auteur caps: cannot publish', () => {
    renderProbe();
    act(() => setRole('auteur'));
    expect(screen.getByTestId('kc')).toHaveTextContent('pa-author');
    expect(screen.getByTestId('publish')).toHaveTextContent('false');
  });

  it('supports the read-only pseudo-role', () => {
    renderProbe();
    act(() => setRole('geen'));
    expect(screen.getByTestId('label')).toHaveTextContent('Geen dossierrol');
    expect(screen.getByTestId('roles')).toHaveTextContent('public-affairs');
    expect(screen.getByTestId('publish')).toHaveTextContent('false');
  });

  it('offers four positions', () => {
    // Three real roles plus the read-only state, which is part of the
    // governance story rather than an error case.
    expect(DEMO_ROLE_OPTIONS.map((o) => o.id)).toEqual([
      'auteur',
      'redacteur',
      'beheerder',
      'geen',
    ]);
  });

  it('keeps the shim in sync under StrictMode double-invocation', () => {
    // The provider syncs the shim with a plain call in its render body
    // rather than an effect, specifically so a render-time double-invoke
    // (StrictMode today; a memoized/skipped re-render tomorrow) can't leave
    // the shim one step behind roleId. Render under StrictMode and assert
    // the shim still reflects the latest selection after a role change.
    render(
      <StrictMode>
        <DemoRoleProvider>
          <Probe />
        </DemoRoleProvider>
      </StrictMode>
    );
    act(() => setRole('redacteur'));
    expect(screen.getByTestId('roles')).toHaveTextContent('public-affairs,pa-editor');
  });
});

describe('useDemoRole outside a provider', () => {
  it('names the missing provider instead of returning null', () => {
    // Without the guard this returns null and the first property read on it
    // fails somewhere far away from the actual mistake.
    const Bare = () => {
      useDemoRole();
      return null;
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<Bare />)).toThrow('useDemoRole must be used inside DemoRoleProvider');
    } finally {
      spy.mockRestore();
    }
  });
});
