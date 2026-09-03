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
  it('gives each status its own pill class', () => {
    render(
      <Register
        rows={[
          makeRow({ id: 'A', status: 'Gesloten' }),
          makeRow({ id: 'B', status: 'Over termijn' }),
          makeRow({ id: 'C', status: 'In behandeling' }),
        ]}
        filters={wooDefaultFilters()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByText('Gesloten')).toHaveClass('klaar');
    expect(screen.getByText('Over termijn')).toHaveClass('laat');
    expect(screen.getByText('In behandeling')).toHaveClass('open');
  });

  it('marks a request that is past the statutory term in red', () => {
    // 42 days is the Woo term; past it the number is the point of the row.
    const { container } = render(
      <Register
        rows={[makeRow({ id: 'A', dagen: 43 }), makeRow({ id: 'B', dagen: 42 })]}
        filters={wooDefaultFilters()}
        onReset={vi.fn()}
      />
    );

    const nums = container.querySelectorAll('td.num');
    expect(nums[0]).toHaveStyle({ fontWeight: '700' });
    expect(nums[1].getAttribute('style')).toBeNull();
  });

  it('shows an objection and a deferral as set, and an em dash when not', () => {
    const { container } = render(
      <Register
        rows={[
          makeRow({ id: 'A', bezwaar: true, verdaagd: true }),
          makeRow({ id: 'B', bezwaar: false, verdaagd: false }),
        ]}
        filters={wooDefaultFilters()}
        onReset={vi.fn()}
      />
    );

    const flags = container.querySelectorAll('.w-flagdot');
    expect(flags[0]).toHaveTextContent('ja');
    expect(flags[0]).toHaveClass('on');
    expect(flags[1]).toHaveTextContent('ja');
    expect(flags[2]).toHaveTextContent('—');
    expect(flags[2]).not.toHaveClass('on');
  });

  it('does not treat the default year as an active filter chip', () => {
    // 2026 is the register's own default year, not something the reader
    // narrowed to; showing it as a chip would imply a filter is on.
    const { container } = render(
      <Register
        rows={[makeRow()]}
        filters={{ ...wooDefaultFilters(), jaar: '2026' }}
        onReset={vi.fn()}
      />
    );

    expect(screen.queryByText('Wis filters')).not.toBeInTheDocument();
    expect(container.querySelector('.w-peil')).toHaveTextContent('alle regels');
  });
});
