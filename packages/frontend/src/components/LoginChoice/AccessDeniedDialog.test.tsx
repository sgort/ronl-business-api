// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccessDeniedDialog from './AccessDeniedDialog';
import { BOARDS } from '../../pages/login-choice/boards.config';

const pa = BOARDS.find((b) => b.id === 'public-affairs')!;
const woo = BOARDS.find((b) => b.id === 'woo')!;

function setup(overrides: Partial<Parameters<typeof AccessDeniedDialog>[0]> = {}) {
  const props = {
    board: pa,
    name: 'Steven Gort',
    home: '/dashboard/caseworker',
    onHome: vi.fn(),
    onLogout: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AccessDeniedDialog {...props} />);
  return props;
}

describe('AccessDeniedDialog', () => {
  it('is a modal dialog named after the refused board', () => {
    setup();

    const dialog = screen.getByRole('dialog', { name: 'Geen toegang tot PA-Cockpit' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('says who is signed in, which role is missing and which Entra role to ask for', () => {
    setup();

    expect(
      screen.getByText(/U bent ingelogd als Steven Gort, maar uw account heeft de rol/)
    ).toHaveTextContent('Public Affairs');
    expect(screen.getByText('IOU_PA')).toBeInTheDocument();
  });

  it('without a name, only names the missing role', () => {
    setup({ name: undefined });

    expect(screen.getByText(/^Uw account heeft de rol/)).toHaveTextContent('Public Affairs');
  });

  it('for a board without an Entra role, asks for access without naming one', () => {
    setup({ board: woo });

    expect(screen.getByText('Vraag uw functioneel beheerder om toegang.')).toBeInTheDocument();
    expect(screen.queryByText(/Entra ID/)).not.toBeInTheDocument();
  });

  it('offers the own dashboard and logging out', async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole('button', { name: 'Naar mijn dashboard' }));
    await user.click(screen.getByRole('button', { name: 'Uitloggen' }));

    expect(props.onHome).toHaveBeenCalled();
    expect(props.onLogout).toHaveBeenCalled();
  });

  it('offers no dashboard to someone without one', () => {
    setup({ home: null });

    expect(screen.queryByRole('button', { name: 'Naar mijn dashboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uitloggen' })).toBeInTheDocument();
  });

  it('moves focus into the dialog and keeps Tab inside it', async () => {
    const user = userEvent.setup();
    setup();

    const home = screen.getByRole('button', { name: 'Naar mijn dashboard' });
    const close = screen.getByRole('button', { name: 'Sluiten' });
    expect(home).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(close).toHaveFocus();
    await user.tab();
    expect(home).toHaveFocus();
  });

  it.each([
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    [
      'the close button',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: 'Sluiten' })),
    ],
    [
      'a click beside the panel',
      async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('dialog')),
    ],
  ])('closes on %s', async (_label, act) => {
    const user = userEvent.setup();
    const props = setup();

    await act(user);

    expect(props.onClose).toHaveBeenCalled();
  });

  it('does not close on a click inside the panel', async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByText('IOU_PA'));

    expect(props.onClose).not.toHaveBeenCalled();
  });
});
