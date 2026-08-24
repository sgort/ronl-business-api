import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  DemoRoleProvider,
  useDemoRole,
  DEMO_ROLE_OPTIONS,
  type DemoRoleId,
} from './DemoRoleContext';
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
});
