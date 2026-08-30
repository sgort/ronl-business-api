// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PANoAccessPanel from './PANoAccessPanel';

describe('PANoAccessPanel', () => {
  it('shows the base message with no required-role/org-type lines by default', () => {
    render(<PANoAccessPanel />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Geen toegang')).toBeInTheDocument();
    expect(screen.queryByText(/Vereiste rol/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vereiste organisatietype/)).not.toBeInTheDocument();
  });

  it('pluralizes "Vereiste rol" for a single role and shows it', () => {
    render(<PANoAccessPanel requiredRoles={['public-affairs']} />);
    expect(screen.getByText('Vereiste rol:')).toBeInTheDocument();
    expect(screen.getByText('public-affairs')).toBeInTheDocument();
  });

  it('pluralizes "Vereiste rollen" for multiple roles, joined by comma', () => {
    render(<PANoAccessPanel requiredRoles={['public-affairs', 'admin']} />);
    expect(screen.getByText('Vereiste rollen:')).toBeInTheDocument();
    expect(screen.getByText('public-affairs, admin')).toBeInTheDocument();
  });

  it('shows the required org type(s) when provided', () => {
    render(<PANoAccessPanel requiredOrgTypes={['province']} />);
    expect(screen.getByText('Vereiste organisatietype:')).toBeInTheDocument();
    expect(screen.getByText('province')).toBeInTheDocument();
  });
});
