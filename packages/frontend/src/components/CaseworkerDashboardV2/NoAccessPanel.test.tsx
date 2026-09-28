// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import NoAccessPanel from './NoAccessPanel';

describe('NoAccessPanel', () => {
  it('shows the base message with no required-role/org-type lines by default', () => {
    render(<NoAccessPanel />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Geen toegang')).toBeInTheDocument();
    expect(screen.queryByText(/Vereiste rol/)).not.toBeInTheDocument();
  });

  it('pluralizes "Vereiste rollen" for multiple roles, joined by comma', () => {
    render(<NoAccessPanel requiredRoles={['caseworker', 'admin']} />);
    expect(screen.getByText('Vereiste rollen:')).toBeInTheDocument();
    expect(screen.getByText('caseworker, admin')).toBeInTheDocument();
  });

  it('shows a single required org type without pluralizing', () => {
    render(<NoAccessPanel requiredOrgTypes={['municipality']} />);
    expect(screen.getByText('Vereiste organisatietype:')).toBeInTheDocument();
    expect(screen.getByText('municipality')).toBeInTheDocument();
  });

  it('shows a single required role without pluralizing', () => {
    render(<NoAccessPanel requiredRoles={['caseworker']} />);
    expect(screen.getByText('Vereiste rol:')).toBeInTheDocument();
    expect(screen.getByText('caseworker')).toBeInTheDocument();
  });

  it('pluralizes "Vereiste organisatietypen" for multiple org types', () => {
    render(<NoAccessPanel requiredOrgTypes={['municipality', 'province']} />);
    expect(screen.getByText('Vereiste organisatietypen:')).toBeInTheDocument();
    expect(screen.getByText('municipality, province')).toBeInTheDocument();
  });

  it('omits both meta lines when the required lists are empty', () => {
    render(<NoAccessPanel requiredRoles={[]} requiredOrgTypes={[]} />);
    expect(screen.queryByText(/Vereiste/)).not.toBeInTheDocument();
  });
});
