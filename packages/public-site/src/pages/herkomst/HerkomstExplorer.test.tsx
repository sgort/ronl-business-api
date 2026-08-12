// packages/public-site/src/pages/herkomst/HerkomstExplorer.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HerkomstExplorer from './HerkomstExplorer';
import { HERKOMST_STRINGS } from './herkomstData';

describe('HerkomstExplorer', () => {
  it('starts on Leeftijd, and the trail shows just that one concept', () => {
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(screen.getByRole('heading', { name: /Leeftijd/ })).toBeInTheDocument();
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });

  it('lists concepts grouped, with Leeftijd marked current', () => {
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    const nav = screen.getByRole('navigation', { name: 'Herkomst' });
    expect(within(nav).getByRole('button', { name: /Leeftijd/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  it('selecting a different concept in the list resets the trail to just that concept', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    const nav = screen.getByRole('navigation', { name: 'Herkomst' });
    await user.click(within(nav).getByRole('button', { name: /Geboortedatum/ }));
    expect(screen.getByText('Herkomst:')).toBeInTheDocument();
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });

  it('drilling into a chip grows the trail and shows Begin opnieuw', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    // "Geboortedatum" matches both the nav list button and the trace's own
    // drill-down chip; scope to the trace root (via its stable "Dit begrip
    // is afgeleid van:" label) to hit the chip specifically.
    const trace = screen.getByText('Dit begrip is afgeleid van:').parentElement!;
    await user.click(within(trace).getByRole('button', { name: /Geboortedatum/ }));
    expect(screen.getByText('Begin opnieuw')).toBeInTheDocument();
  });

  it('clicking a trail segment truncates the trail to that depth', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    // Drill Leeftijd -> Geboortedatum -> BSN.
    const trace1 = screen.getByText('Dit begrip is afgeleid van:').parentElement!;
    await user.click(within(trace1).getByRole('button', { name: /Geboortedatum/ }));
    const trace2 = screen.getByText('Dit begrip is afgeleid van:').parentElement!;
    await user.click(within(trace2).getByRole('button', { name: /Burgerservicenummer/ }));
    expect(screen.getByRole('heading', { name: /Burgerservicenummer/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Leeftijd' }));
    expect(screen.getByRole('heading', { name: /^Leeftijd/ })).toBeInTheDocument();
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });

  it('Begin opnieuw returns to the first concept in the trail', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    // Same nav-vs-chip collision as above; scope to the trace root.
    const trace = screen.getByText('Dit begrip is afgeleid van:').parentElement!;
    await user.click(within(trace).getByRole('button', { name: /Geboortedatum/ }));
    await user.click(screen.getByRole('button', { name: 'Begin opnieuw' }));
    expect(screen.getByRole('heading', { name: /^Leeftijd/ })).toBeInTheDocument();
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });
});
