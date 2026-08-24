import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoBar from './DemoBar';
import { DemoRoleProvider } from './DemoRoleContext';

const resetDemoData = vi.fn();
const resetDossiers = vi.fn();
vi.mock('../vendor/services/mock-demo.store', () => ({
  resetMockDemoData: () => resetDemoData(),
}));
vi.mock('../vendor/services/dossierbeheer.api', () => ({
  resetMockDossiers: () => resetDossiers(),
}));

function renderBar() {
  render(
    <DemoRoleProvider>
      <DemoBar />
    </DemoRoleProvider>
  );
}

describe('DemoBar', () => {
  it('states that this is a demonstration with fictional data', () => {
    renderBar();
    expect(screen.getByText(/demonstratie/i)).toBeInTheDocument();
  });

  it('offers the four roles as enabled controls', () => {
    // Unlike Dossierbeheer's role bar, which is disabled by design.
    renderBar();
    for (const label of ['Auteur', 'Redacteur', 'Beheerder', 'Geen dossierrol']) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
    }
  });

  it('marks the selected role as pressed', async () => {
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: 'Auteur' }));
    expect(screen.getByRole('button', { name: 'Auteur' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('resets both stores, since dossiers live in a separate one', async () => {
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: /demo herstellen/i }));
    expect(resetDemoData).toHaveBeenCalledTimes(1);
    expect(resetDossiers).toHaveBeenCalledTimes(1);
  });

  it('offers no live/mock toggle', async () => {
    // The whole point of plato: there is no Live to switch to.
    renderBar();
    expect(screen.queryByText(/live/i)).toBeNull();
  });
});
