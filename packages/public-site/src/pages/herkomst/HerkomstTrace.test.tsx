import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HerkomstTrace from './HerkomstTrace';
import { HERKOMST_STRINGS } from './herkomstData';

describe('HerkomstTrace', () => {
  it('renders the concept header and both track headers', () => {
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Leeftijd/ })).toBeInTheDocument();
    expect(screen.getByText('Wet- & Regelgeving')).toBeInTheDocument();
    expect(screen.getByText('Gebruikers')).toBeInTheDocument();
  });

  it('renders the DMN expression and input/output for leeftijd', () => {
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByText(/MEERDERJARIGHEIDSLEEFTIJD/)).toBeInTheDocument();
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
  });

  it('a DMN input with a ref renders a working herkomst link', async () => {
    // NOTE: brief deviation — leeftijd's DMN block has two inputs
    // (datumBerekening and geboortedatum), both with a `ref`, so both
    // render a "herkomst" link and a plain getByRole matches two elements.
    // Scoped to the <li> whose <code> is "geboortedatum" per the brief's
    // escape hatch — same assertion (onOpen called with 'geboortedatum'),
    // just disambiguated against the real markup.
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={onOpen} />);
    const links = screen.getAllByRole('link', { name: 'herkomst' });
    const link = links.find(
      (l) => l.closest('li')?.querySelector('code')?.textContent === 'geboortedatum'
    )!;
    await user.click(link);
    expect(onOpen).toHaveBeenCalledWith('geboortedatum');
  });

  it('renders the no-DMN fallback line for a concept with dmn: null', () => {
    render(<HerkomstTrace id="bsn" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByText(/Niet van toepassing/)).toBeInTheDocument();
  });

  it('renders "einde van de keten" for a concept with no begrippen', () => {
    // NOTE: brief deviation — bsn's own `kort` intro text ("... dit is het
    // einde van de keten.") coincidentally shares this phrase with the
    // step-4 leaf fallback under test, so a plain getByText matches two
    // elements. Scoped to .pub-herkomst-none (the actual leaf-fallback
    // element) per the brief's own escape hatch — same assertion, not
    // weakened, just disambiguated against the real markup.
    const { container } = render(
      <HerkomstTrace id="bsn" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />
    );
    const leafFallbacks = Array.from(container.querySelectorAll('.pub-herkomst-none')).map(
      (el) => el.textContent
    );
    expect(leafFallbacks.some((text) => /einde van de keten/.test(text ?? ''))).toBe(true);
  });

  it('renders both the positive and negative conclusion for a concept with begrippen', () => {
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByText(/LEEFTIJD kan worden berekend/)).toBeInTheDocument();
    expect(screen.getByText(/niet \(nog\) nodig|niet.*nodig/)).toBeInTheDocument();
  });

  it('clicking a begrippen chip opens that concept', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={onOpen} />);
    await user.click(
      within(
        screen.getByText('Dit begrip is afgeleid van:').closest('div')!.parentElement!
      ).getByRole('button', { name: /Geboortedatum/ })
    );
    expect(onOpen).toHaveBeenCalledWith('geboortedatum');
  });

  it('associates every cell with its track header for screen readers', () => {
    const { container } = render(
      <HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />
    );
    const wetHeaderId = container.querySelector(
      '.pub-herkomst-track-h:not(.pub-herkomst-right)'
    )!.id;
    const gebruikersHeaderId = container.querySelector(
      '.pub-herkomst-track-h.pub-herkomst-right'
    )!.id;
    expect(wetHeaderId).toBeTruthy();
    expect(gebruikersHeaderId).toBeTruthy();
    const leftCells = container.querySelectorAll('.pub-herkomst-cell:not(.pub-herkomst-r)');
    const rightCells = container.querySelectorAll('.pub-herkomst-cell.pub-herkomst-r');
    expect(leftCells).toHaveLength(4);
    expect(rightCells).toHaveLength(4);
    leftCells.forEach((cell) => expect(cell.getAttribute('aria-labelledby')).toBe(wetHeaderId));
    rightCells.forEach((cell) =>
      expect(cell.getAttribute('aria-labelledby')).toBe(gebruikersHeaderId)
    );
    leftCells.forEach((cell) => expect(cell.getAttribute('role')).toBe('group'));
    rightCells.forEach((cell) => expect(cell.getAttribute('role')).toBe('group'));
  });
});
