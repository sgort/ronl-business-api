// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BesluitStartSection from './BesluitStartSection';

const mockBusinessApi = vi.hoisted(() => ({ process: { start: vi.fn() } }));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const indiener = { sub: '1', roles: ['besluit-indiener'] } as never;

beforeEach(() => mockBusinessApi.process.start.mockResolvedValue({ success: true }));
afterEach(() => vi.clearAllMocks());

describe('BesluitStartSection', () => {
  it('refuses a user without the besluit-indiener role', () => {
    render(<BesluitStartSection user={{ sub: '1', roles: ['caseworker'] } as never} />);
    expect(screen.getByText('Geen toegang')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Besluit voorbereiden' })).toBeNull();
  });

  it('starts the process and confirms it', async () => {
    const user = userEvent.setup();
    render(<BesluitStartSection user={indiener} />);
    await user.click(screen.getByRole('button', { name: 'Besluit voorbereiden' }));
    expect(await screen.findByText('Besluit in voorbereiding')).toBeInTheDocument();
    expect(mockBusinessApi.process.start).toHaveBeenCalledWith('GedelegeerdBesluitProcess', {});
  });

  it('says so when the start fails', async () => {
    mockBusinessApi.process.start.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<BesluitStartSection user={indiener} />);
    await user.click(screen.getByRole('button', { name: 'Besluit voorbereiden' }));
    expect(await screen.findByText('Het besluit kon niet worden gestart.')).toBeInTheDocument();
  });
});
