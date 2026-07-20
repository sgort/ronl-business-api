// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Register from './Register';
import { wooDefaultFilters } from '../../pages/woo/woo.data';
import type { WooRegisterRow } from '../../pages/woo/woo.data';

function makeRow(overrides: Partial<WooRegisterRow> = {}): WooRegisterRow {
  return {
    id: 'WOO-2026-00001',
    ontvangen: '01-01',
    termijn: '29-01',
    afdeling: 'Bestuur & Directie',
    onderwerp: 'Aanbesteding',
    bron: 'Journalist',
    status: 'Gesloten',
    dagen: 20,
    besluit: 'Volledig',
    bezwaar: false,
    verdaagd: false,
    ...overrides,
  };
}

describe('Register', () => {
  it('shows the row count out of 218 and one table row per entry', () => {
    render(<Register rows={[makeRow()]} filters={wooDefaultFilters()} onReset={vi.fn()} />);
    expect(screen.getByText('1 van 218')).toBeInTheDocument();
    expect(screen.getByText('WOO-2026-00001')).toBeInTheDocument();
  });

  it('shows no filter chips under default filters', () => {
    render(<Register rows={[makeRow()]} filters={wooDefaultFilters()} onReset={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Wis filters' })).not.toBeInTheDocument();
  });

  it('shows a chip and reset button when a filter is non-default', async () => {
    const onReset = vi.fn();
    const filters = { ...wooDefaultFilters(), status: 'Gesloten' };
    const user = userEvent.setup();

    const { container } = render(
      <Register rows={[makeRow({ status: 'Over termijn' })]} filters={filters} onReset={onReset} />
    );
    expect(container.querySelector('.w-chip')).toHaveTextContent('Gesloten');

    await user.click(screen.getByRole('button', { name: 'Wis filters' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('shows an empty state with its own reset button when there are no rows', async () => {
    const onReset = vi.fn();
    const filters = { ...wooDefaultFilters(), status: 'Gesloten' };
    const user = userEvent.setup();

    render(<Register rows={[]} filters={filters} onReset={onReset} />);
    expect(screen.getByText(/Geen verzoeken voldoen aan de huidige filters/)).toBeInTheDocument();

    const resetButtons = screen.getAllByRole('button', { name: 'Wis filters' });
    await user.click(resetButtons[resetButtons.length - 1]);
    expect(onReset).toHaveBeenCalled();
  });
});
