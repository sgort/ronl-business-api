// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteDialog from './DeleteDialog';
import type { AdminDossier } from '@ronl/shared';

const dossier = { naam: 'Jeugdzorg' } as AdminDossier;

describe('DeleteDialog', () => {
  it('the confirm button is disabled until the exact dossier name is typed', async () => {
    const user = userEvent.setup();
    render(<DeleteDialog dossier={dossier} onConfirm={vi.fn()} onClose={vi.fn()} />);

    const confirmButton = screen.getByRole('button', { name: 'Definitief verwijderen' });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Jeugdzorg'), 'Jeugd');
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Jeugdzorg'), 'zorg');
    expect(confirmButton).toBeEnabled();
  });

  it('clicking the enabled confirm button calls onConfirm', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DeleteDialog dossier={dossier} onConfirm={onConfirm} onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Jeugdzorg'), 'Jeugdzorg');
    await user.click(screen.getByRole('button', { name: 'Definitief verwijderen' }));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('stays disabled while busy even with the correct name typed', async () => {
    const user = userEvent.setup();
    render(<DeleteDialog dossier={dossier} onConfirm={vi.fn()} onClose={vi.fn()} busy />);

    await user.type(screen.getByPlaceholderText('Jeugdzorg'), 'Jeugdzorg');

    expect(screen.getByRole('button', { name: 'Bezig…' })).toBeDisabled();
  });

  it('"Annuleren" calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DeleteDialog dossier={dossier} onConfirm={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Annuleren' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the overlay background closes the dialog', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <DeleteDialog dossier={dossier} onConfirm={vi.fn()} onClose={onClose} />
    );

    await user.click(container.querySelector('.pac-db-overlay')!);

    expect(onClose).toHaveBeenCalled();
  });
});
