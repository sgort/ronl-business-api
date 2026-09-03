// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimMissedPanel from './SimMissedPanel';
import { run } from './simEngine';
import type { SimApp, SimConfig, SimResult } from './types';

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

// Computed once and shared across all tests in this file — each run() call
// simulates the full 3,150-application population, and 5 fresh calls (one
// per test) was adding real, avoidable CPU load to the suite (a contributing
// factor to simEngine.test.ts's <250ms performance-test flakiness). All 5
// tests below only read `result`, never mutate it, so sharing is safe.
const result = run(DEFAULT_CFG);

describe('SimMissedPanel', () => {
  it('renders the three filter buttons with their counts', () => {
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    expect(screen.getByRole('button', { name: /Door RFI-verschuiving/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Door succesvol beroep/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alle onbetaalde/ })).toBeInTheDocument();
  });

  it('defaults to the RFI filter and shows a matching application', () => {
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    expect(screen.getByText(/aanvraag 1 \//)).toBeInTheDocument();
  });

  it('switching to "Alle onbetaalde" changes the displayed count', () => {
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
    render(<SimMissedPanel result={result} day={result.days.length - 1} />);
    const next = screen.getByRole('button', { name: '▶' });
    await user.click(next);
    expect(screen.getByText(/aanvraag 2 \//)).toBeInTheDocument();
  });

  it('shows the empty state when a filter has zero matches at an early day', () => {
    render(<SimMissedPanel result={result} day={0} />);
    // At day 0 nothing has been decided yet, so nothing has "missed out".
    expect(screen.getByText(/Nog niets misgelopen|In dit scenario/)).toBeInTheDocument();
  });
});

describe('SimMissedPanel, why an application went unpaid', () => {
  // The engine's own output happens not to produce every combination of the
  // two "why" flags in one run, and the panel's whole job is to name the
  // reason. Synthesising the applications from a real one keeps every other
  // field consistent with what the engine actually emits.
  const template = result.apps.find((a) => a.missedDueToRFI || a.missedDueToBeroep)!;
  const app = (over: Partial<SimApp>): SimApp => ({ ...template, ...over });
  const withApps = (apps: SimApp[]): SimResult => ({ ...result, apps });
  const lastDay = result.days.length - 1;

  it('names both causes when an application lost out to a shift and an appeal', () => {
    render(
      <SimMissedPanel
        result={withApps([
          app({ id: 9001, missedDueToRFI: true, missedDueToBeroep: true, beroepDisplacerId: 42 }),
        ])}
        day={lastDay}
      />
    );

    // The cause tag is part of the "Alle onbetaalde" view, where the reason
    // is what distinguishes one row from the next.
    fireEvent.click(screen.getByRole('button', { name: /Alle onbetaalde/ }));
    expect(screen.getAllByText(/RFI \+ beroep/).length).toBeGreaterThan(0);
  });

  it('names the appeal alone when that is the only cause', () => {
    render(
      <SimMissedPanel
        result={withApps([
          app({ id: 9002, missedDueToRFI: false, missedDueToBeroep: true, beroepDisplacerId: 43 }),
        ])}
        day={lastDay}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Alle onbetaalde/ }));
    expect(screen.getAllByText(/door beroep/).length).toBeGreaterThan(0);
  });

  it('falls back to "budget op" when neither cause applies', () => {
    // A valid application can simply arrive after the pot is empty; that is
    // not a displacement and must not be reported as one.
    render(
      <SimMissedPanel
        result={withApps([
          app({
            id: 9003,
            missedDueToRFI: false,
            missedDueToBeroep: false,
            beroepDisplacerId: null,
            blockedById: null,
          }),
        ])}
        day={lastDay}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Alle onbetaalde/ }));
    expect(screen.getAllByText(/budget op/).length).toBeGreaterThan(0);
  });

  it('says so plainly when a filter matches nothing in the whole scenario', () => {
    render(
      <SimMissedPanel
        result={withApps([app({ id: 9004, missedDueToRFI: false, missedDueToBeroep: false })])}
        day={lastDay}
      />
    );

    // The default RFI filter has no members at all here -- a different message
    // from "not yet, keep playing".
    expect(screen.getByText(/verliest geen enkele geldige aanvraag/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Door succesvol beroep/ }));
    expect(screen.getByText(/verdringt geen enkel succesvol beroep/)).toBeInTheDocument();
  });

  it('omits an application that has not been decided yet at the current day', () => {
    render(
      <SimMissedPanel
        result={withApps([app({ id: 9005, missedDueToRFI: true, decisionDay: lastDay + 50 })])}
        day={0}
      />
    );

    expect(screen.getByText(/Nog niets misgelopen/)).toBeInTheDocument();
  });

  it('names the appeal that took the budget', () => {
    render(
      <SimMissedPanel
        result={withApps([
          app({ id: 9006, missedDueToRFI: false, missedDueToBeroep: true, beroepDisplacerId: 77 }),
        ])}
        day={lastDay}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Door succesvol beroep/ }));
    expect(screen.getAllByText(/#77/).length).toBeGreaterThan(0);
  });
});
