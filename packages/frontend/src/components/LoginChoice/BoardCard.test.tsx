// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BoardCard from './BoardCard';
import type { BoardEntry } from '../../pages/login-choice/boards.config';

vi.mock('./BoardPreview', () => ({
  default: ({ kind }: { kind: string }) => <div>preview-{kind}</div>,
}));

const board: BoardEntry = {
  id: 'caseworker',
  role: 'caseworker',
  route: '/caseworker',
  roleLabel: 'Zaakbehandelaar',
  title: 'Caseworker Dashboard',
  preview: 'case',
  blurb: 'Persoonlijke werkvoorraad voor zaakbehandelaars.',
  testUser: 'caseworker-test',
} as BoardEntry;

describe('BoardCard', () => {
  it('renders the role label, title, blurb, and the matching preview kind', () => {
    render(<BoardCard board={board} onOpen={vi.fn()} />);

    expect(screen.getByText('Zaakbehandelaar')).toBeInTheDocument();
    expect(screen.getByText('Caseworker Dashboard')).toBeInTheDocument();
    expect(
      screen.getByText('Persoonlijke werkvoorraad voor zaakbehandelaars.')
    ).toBeInTheDocument();
    expect(screen.getByText('preview-case')).toBeInTheDocument();
    expect(screen.getByText('Beschikbaar')).toBeInTheDocument();
  });

  it('clicking "Openen" calls onOpen', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<BoardCard board={board} onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: /Openen/ }));

    expect(onOpen).toHaveBeenCalled();
  });
});
