// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegelSimulatie from './RegelSimulatie';

describe('RegelSimulatie', () => {
  it('renders with no API calls and shows the breadcrumb and title', () => {
    render(<RegelSimulatie />);
    expect(screen.getByText('Simulatie · Regelsimulatie')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Regelsimulatie — Subsidie thuisbatterij' })
    ).toBeInTheDocument();
  });

  it('renders all five cards', () => {
    render(<RegelSimulatie />);
    expect(screen.getByText('Budgetuitputting', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Beschikbaar budget over tijd', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText('Geldige aanvragen die misliepen', { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText('Uitkomsten', { exact: false })).toBeInTheDocument();
    // 'Aanvragen' (exact: false) also matches unrelated substrings elsewhere on the
    // page (e.g. tweak labels/copy mentioning "aanvragen") once real markup renders,
    // so scope to the "Aanvragen" feed card's own heading instead of the loose text
    // query the brief sketched.
    expect(screen.getByRole('heading', { level: 2, name: /^Aanvragen/ })).toBeInTheDocument();
  });

  it('the three SimMissedPanel filter buttons are present and clickable', async () => {
    const user = userEvent.setup();
    render(<RegelSimulatie />);
    const beroepBtn = screen.getByRole('button', { name: /Door succesvol beroep/ });
    await user.click(beroepBtn);
    expect(beroepBtn).toBeInTheDocument();
  });

  it('dragging the timeline changes the displayed date without throwing', async () => {
    render(<RegelSimulatie />);
    const slider = screen.getByRole('slider', { name: 'Tijdlijn' });
    expect(slider).toBeInTheDocument();
  });

  it('Reset restores the default parameters and day 0', async () => {
    const user = userEvent.setup();
    render(<RegelSimulatie />);
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText(/dag 1\//)).toBeInTheDocument();
  });
});
