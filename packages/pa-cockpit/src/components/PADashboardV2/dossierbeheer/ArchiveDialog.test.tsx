// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ArchiveDialog from './ArchiveDialog';
import type { AdminDossier } from '@ronl/shared';

const dossier = { naam: 'Jeugdzorg' } as AdminDossier;

describe('ArchiveDialog', () => {
  it('defaults to Intern classification and a 10-jaar bewaartermijn', () => {
    render(<ArchiveDialog dossier={dossier} onConfirm={vi.fn()} onClose={vi.fn()} />);

    expect((screen.getByDisplayValue('10 jaar') as HTMLSelectElement).value).toBe('V10');
    expect(screen.getByText(/dossier met bestuurlijk besluit/)).toBeInTheDocument();
  });

  it('the confirm button is disabled until a reden is entered', async () => {
    const user = userEvent.setup();
    render(<ArchiveDialog dossier={dossier} onConfirm={vi.fn()} onClose={vi.fn()} />);

    const confirmButton = screen.getByRole('button', { name: 'Archiveren' });
    expect(confirmButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText('bv. Traject afgerond na besluitvorming'),
      'Afgerond'
    );
    expect(confirmButton).toBeEnabled();
  });

  it('changing the bewaartermijn updates the category hint', async () => {
    const user = userEvent.setup();
    render(<ArchiveDialog dossier={dossier} onConfirm={vi.fn()} onClose={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox'), 'Blijvend te bewaren');

    expect(screen.getByText(/overbrenging Erfgoed/)).toBeInTheDocument();
  });

  it('confirming submits the trimmed reden with the selected classificatie/bewaartermijn', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ArchiveDialog dossier={dossier} onConfirm={onConfirm} onClose={vi.fn()} />);

    await user.click(screen.getByText('Vertrouwelijk'));
    await user.selectOptions(screen.getByRole('combobox'), '5 jaar');
    await user.type(
      screen.getByPlaceholderText('bv. Traject afgerond na besluitvorming'),
      '  Afgerond  '
    );
    await user.click(screen.getByRole('button', { name: 'Archiveren' }));

    expect(onConfirm).toHaveBeenCalledWith({
      classificatie: 'vertrouwelijk',
      bewaartermijn: 'V5',
      reden: 'Afgerond',
    });
  });

  it('"Annuleren" calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ArchiveDialog dossier={dossier} onConfirm={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Annuleren' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('while busy shows "Bezig…" and stays disabled even with a reden filled in', async () => {
    const user = userEvent.setup();
    render(<ArchiveDialog dossier={dossier} onConfirm={vi.fn()} onClose={vi.fn()} busy />);

    await user.type(
      screen.getByPlaceholderText('bv. Traject afgerond na besluitvorming'),
      'Afgerond'
    );

    expect(screen.getByRole('button', { name: 'Bezig…' })).toBeDisabled();
  });
});
