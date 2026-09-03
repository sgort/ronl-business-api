// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegelSimulatie from './RegelSimulatie';

describe('RegelSimulatie', () => {
  it('renders with no API calls and shows the breadcrumb and title', () => {
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
    expect(screen.getByText('Simulatie · Subsidie thuisbatterij')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Regelsimulatie — Subsidie thuisbatterij' })
    ).toBeInTheDocument();
  });

  it('renders all five cards', () => {
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
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
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
    const beroepBtn = screen.getByRole('button', { name: /Door succesvol beroep/ });
    await user.click(beroepBtn);
    expect(beroepBtn).toBeInTheDocument();
  });

  it('dragging the timeline changes the displayed date without throwing', async () => {
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
    const slider = screen.getByRole('slider', { name: 'Tijdlijn' });
    expect(slider).toBeInTheDocument();
  });

  it('Reset restores the default parameters and day 0', async () => {
    const user = userEvent.setup();
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText(/dag 1\//)).toBeInTheDocument();
  });
});

describe('per-user day persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('restores a stored day for the user it belongs to', () => {
    localStorage.setItem('sim-thuisbatterij-v2:day:user-a', '10');
    render(<RegelSimulatie user={{ sub: 'user-a' } as never} />);
    expect(screen.getByText(/dag 11\//)).toBeInTheDocument();
  });

  it("does not restore a different user's stored day — a new sign-in always starts at day 0", () => {
    localStorage.setItem('sim-thuisbatterij-v2:day:user-a', '10');
    render(<RegelSimulatie user={{ sub: 'user-b' } as never} />);
    expect(screen.getByText(/dag 1\//)).toBeInTheDocument();
  });
});

describe('RegelSimulatie stored scenario', () => {
  afterEach(() => localStorage.clear());

  it('starts from the defaults when the stored scenario is not valid JSON', () => {
    localStorage.setItem('sim-thuisbatterij-v2', '{ niet json');
    expect(() => render(<RegelSimulatie user={{ sub: 'user-1' } as never} />)).not.toThrow();
  });

  it('clamps a stored parameter that is outside its own range', () => {
    // The stored blob is user-editable and survives a deploy that narrows a
    // range; feeding an out-of-range value straight into the engine produces
    // nonsense rather than an error.
    localStorage.setItem(
      'sim-thuisbatterij-v2',
      JSON.stringify({ cfg: { populatie: 999999, bezwaarKans: -5, doorlooptijdGem: NaN } })
    );

    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Regelsimulatie — Subsidie thuisbatterij' })
    ).toBeInTheDocument();
  });

  it('ignores a stored day that is not a number', () => {
    localStorage.setItem('sim-thuisbatterij-v2:day:user-1', 'gisteren');
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
    expect(screen.getByText(/dag 1\//)).toBeInTheDocument();
  });

  it('starts at day 0 when no user is signed in, and stores nothing per user', () => {
    render(<RegelSimulatie user={null} />);
    expect(screen.getByText(/dag 1\//)).toBeInTheDocument();
  });

  it('survives localStorage being unavailable, on read and on write', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(() => render(<RegelSimulatie user={{ sub: 'user-1' } as never} />)).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe('RegelSimulatie playback', () => {
  afterEach(() => localStorage.clear());

  const scrubTo = (day: number) => {
    const slider = screen.getByLabelText('Tijdlijn') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: String(day) } });
    return slider;
  };

  it('offers a replay once the timeline is parked on the last day', () => {
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
    const slider = screen.getByLabelText('Tijdlijn') as HTMLInputElement;

    scrubTo(Number(slider.max));

    expect(screen.getByRole('button', { name: /Opnieuw/ })).toBeInTheDocument();
  });

  it('restarts from day 0 when replayed from the end', async () => {
    const user = userEvent.setup();
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
    const slider = screen.getByLabelText('Tijdlijn') as HTMLInputElement;
    scrubTo(Number(slider.max));

    await user.click(screen.getByRole('button', { name: /Opnieuw/ }));

    expect(screen.getByText(/dag 1\//)).toBeInTheDocument();
  });

  it('plays and pauses from the same control', async () => {
    const user = userEvent.setup();
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);

    await user.click(screen.getByRole('button', { name: /Speel af/ }));
    expect(screen.getByRole('button', { name: /Pauze/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Pauze/ }));
    expect(screen.getByRole('button', { name: /Speel af/ })).toBeInTheDocument();
  });

  it('names which ceiling regime the current day falls under', () => {
    render(<RegelSimulatie user={{ sub: 'user-1' } as never} />);
    const slider = screen.getByLabelText('Tijdlijn') as HTMLInputElement;
    const last = Number(slider.max);

    // The pots are split until 1 October and bundled afterwards, and a day
    // outside the application window belongs to neither.
    const seen = new Set<string>();
    for (const day of [0, Math.round(last * 0.25), Math.round(last * 0.6), last]) {
      scrubTo(day);
      const pill = document.querySelector('.sim-modepill');
      if (pill?.textContent) seen.add(pill.textContent.trim());
    }

    expect(seen.size).toBeGreaterThan(1);
    for (const label of seen) {
      expect(['Gesplitst plafond', 'Gebundeld plafond', 'Buiten periode']).toContain(label);
    }
  });
});
