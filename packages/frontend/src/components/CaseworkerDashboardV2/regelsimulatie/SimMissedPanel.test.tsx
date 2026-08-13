// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimMissedPanel from './SimMissedPanel';
import { run } from './simEngine';
import type { SimConfig } from './types';

const DEFAULT_CFG: SimConfig = {
  seed: 20260112,
  populatie: 3150,
  eigenaarRatio: 0.68,
  kostenGem: 4200,
  kostenSd: 1800,
  pFailliet: 0.02,
  pBuitenprovincie: 0.07,
  pGeenRelatie: 0.03,
  pGeenToestemming: 0.14,
  pNaamMismatch: 0.05,
  budgetScale: 1,
  aandeel2026: 0.46,
  arrivalPow: 1.3,
  doorlooptijdGem: 8,
  pAanvullendeInfo: 0.32,
  infoWachtGem: 60,
  bezwaarKans: 0.22,
  bezwaarToewijzing: 0.25,
};

describe('SimMissedPanel', () => {
  it('renders the three filter buttons with their counts', () => {
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    expect(screen.getByRole('button', { name: /Door RFI-verschuiving/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Door succesvol beroep/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alle onbetaalde/ })).toBeInTheDocument();
  });

  it('defaults to the RFI filter and shows a matching application', () => {
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    expect(screen.getByText(/aanvraag 1 \//)).toBeInTheDocument();
  });

  it('switching to "Alle onbetaalde" changes the displayed count', () => {
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    const before = screen.getByText(/aanvraag 1 \//).textContent;
    // Deviation from the brief: its listing called `.click()` directly on
    // the button element. That bypasses Testing Library's act() wrapping,
    // so under React 18 the resulting setState is only scheduled, not
    // flushed, before the very next line reads the DOM — this fails
    // deterministically (both "before" and "after" read "aanvraag 1 /
    // 100"), confirmed by awaiting a macrotask afterwards (text does
    // update to "1 / 233" after the tick). `fireEvent.click` fires the
    // same synchronous DOM click but wraps it in act(), flushing the
    // re-render before this line returns — see task-5-report.md for the
    // isolated repro.
    fireEvent.click(screen.getByRole('button', { name: /Alle onbetaalde/ }));
    const after = screen.getByText(/aanvraag 1 \//).textContent;
    // "Alle onbetaalde" is a superset of RFI-only, so unless RFI count equals
    // the total unpaid count, the "n" in "aanvraag 1 / n" must change.
    expect(result.agg.missedDueToRFI).not.toBe(result.agg.nietUitbetaald);
    expect(after).not.toBe(before);
  });

  it('◀ / ▶ navigate between applications in the current filter', async () => {
    const user = userEvent.setup();
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    const next = screen.getByRole('button', { name: '▶' });
    await user.click(next);
    expect(screen.getByText(/aanvraag 2 \//)).toBeInTheDocument();
  });

  it('shows the empty state when a filter has zero matches at an early day', () => {
    const result = run(DEFAULT_CFG);
    render(<SimMissedPanel result={result} day={0} />);
    // At day 0 nothing has been decided yet, so nothing has "missed out".
    expect(screen.getByText(/Nog niets misgelopen|In dit scenario/)).toBeInTheDocument();
  });
});
