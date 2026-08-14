import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HerkomstChip from './HerkomstChip';

describe('HerkomstChip', () => {
  it('renders a clickable chip for a begrip with a ref, showing the target concept name', () => {
    const onOpen = vi.fn();
    render(
      <HerkomstChip c={{ ref: 'geboortedatum', naam: 'geboortedatum' }} lang="nl" onOpen={onOpen} />
    );
    const btn = screen.getByRole('button', { name: /Geboortedatum/ });
    expect(btn).toBeInTheDocument();
  });

  it('calls onOpen with the ref when clicked', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<HerkomstChip c={{ ref: 'bsn', naam: 'BSN' }} lang="nl" onOpen={onOpen} />);
    await user.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('bsn');
  });

  it('renders a non-interactive leaf chip when there is no ref', () => {
    const onOpen = vi.fn();
    render(
      <HerkomstChip
        c={{ naam: { nl: 'Geboortedatum', en: 'Date of birth' }, def: { nl: 'x', en: 'y' } }}
        lang="nl"
        onOpen={onOpen}
      />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Geboortedatum')).toBeInTheDocument();
  });

  it('follows the language switch for the target concept name', () => {
    const onOpen = vi.fn();
    render(<HerkomstChip c={{ ref: 'bsn', naam: 'BSN' }} lang="en" onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: /Citizen service number/ })).toBeInTheDocument();
  });
});
