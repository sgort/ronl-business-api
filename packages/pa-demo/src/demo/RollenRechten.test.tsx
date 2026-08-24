import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RollenRechten from './RollenRechten';
import { DemoRoleProvider } from './DemoRoleContext';

function renderPage() {
  return render(
    <DemoRoleProvider>
      <RollenRechten />
    </DemoRoleProvider>
  );
}

describe('RollenRechten', () => {
  it('lists the three PA governance roles with their Keycloak names', () => {
    renderPage();
    expect(screen.getByText('pa-author')).toBeInTheDocument();
    expect(screen.getByText('pa-editor')).toBeInTheDocument();
    expect(screen.getByText('pa-admin')).toBeInTheDocument();
  });

  it('names no caseworker or RIP role', () => {
    // The caseworker RollenSection describes caseworker/hr-medewerker/rip-*
    // and no pa-* role; shipping it here would describe the wrong product.
    renderPage();
    expect(screen.queryByText(/rip-/)).toBeNull();
    expect(screen.queryByText(/hr-medewerker/)).toBeNull();
  });

  it('shows all six capabilities for Beheerder', () => {
    renderPage();
    for (const label of [
      'Aanmaken',
      'Bewerken',
      'Sjablonen',
      'Publiceren',
      'Archiveren',
      'Verwijderen',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('switching to Auteur turns Publiceren off', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Auteur' }));
    expect(screen.getByTestId('cap-publish')).toHaveAttribute('data-on', 'false');
    expect(screen.getByTestId('cap-create')).toHaveAttribute('data-on', 'true');
  });

  it('switching to Beheerder turns Verwijderen on', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Auteur' }));
    expect(screen.getByTestId('cap-del')).toHaveAttribute('data-on', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Beheerder' }));
    expect(screen.getByTestId('cap-del')).toHaveAttribute('data-on', 'true');
  });
});
