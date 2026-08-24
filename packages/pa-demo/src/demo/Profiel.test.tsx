import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Profiel from './Profiel';
import { DemoRoleProvider } from './DemoRoleContext';

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
});
