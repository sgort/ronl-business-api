import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Regelcatalogus from './Regelcatalogus';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getRegelcatalogus: vi.fn() };
});

const t = translations.nl;
const DATA: Awaited<ReturnType<typeof api.getRegelcatalogus>> = {
  services: [
    { uri: 's1', title: 'Zorgtoeslag', description: 'Toeslag' },
    { uri: 's2', title: 'Geen regels dienst', description: 'Leeg' },
  ],
  organizations: [
    {
      uri: 'o1',
      identifier: '1',
      name: 'Belastingdienst',
      homepage: null,
      logo: null,
      services: [{ uri: 's1', title: 'Zorgtoeslag' }],
    },
  ],
  concepts: [
    {
      uri: 'c1',
      prefLabel: 'Toetsingsinkomen',
      exactMatch: null,
      serviceUri: 's1',
      serviceTitle: 'Zorgtoeslag',
    },
  ],
  rules: [
    {
      serviceTitle: 'Zorgtoeslag',
      ruleTitle: 'Recht op zorgtoeslag',
      validFrom: '2026-01-01',
      confidence: 'high',
      description: null,
    },
    {
      serviceTitle: 'Zorgtoeslag',
      ruleTitle: 'Leeftijdseis 18 jaar',
      validFrom: '2026-01-01',
      confidence: 'high',
      description: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getRegelcatalogus).mockResolvedValue(DATA);
});

function renderPage(lang: 'nl' | 'en' = 'nl') {
  return render(
    <MemoryRouter>
      <Regelcatalogus t={translations[lang]} lang={lang} />
    </MemoryRouter>
  );
}

function setBlob(content: string | null) {
  document.getElementById('__PUB_DATA__')?.remove();
  if (content === null) return;
  const el = document.createElement('script');
  el.id = '__PUB_DATA__';
  el.type = 'application/json';
  el.textContent = content;
  document.body.appendChild(el);
}

describe('Regelcatalogus', () => {
  it('tab counts match the fetched data', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Organisaties/ })).toBeInTheDocument()
    );
    expect(screen.getByRole('tab', { name: /Organisaties/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Diensten/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Regels/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Begrippen/ })).toHaveTextContent('1');
  });

  it('Organisaties tab: renders a logo image when present, and initials when not', async () => {
    const dataWithLogo = {
      ...DATA,
      organizations: [
        ...DATA.organizations,
        {
          uri: 'o2',
          identifier: '2',
          name: 'Rijksdienst voor Ondernemend Nederland',
          homepage: 'https://rvo.nl',
          logo: 'https://assets.example/rvo-logo.png',
          services: [],
        },
      ],
    };
    vi.mocked(api.getRegelcatalogus).mockResolvedValue(dataWithLogo);

    renderPage();
    await waitFor(() => screen.getByText('Rijksdienst voor Ondernemend Nederland'));

    // Has a logo → real <img>, correct src and alt
    const logo = screen.getByRole('img', { name: 'Rijksdienst voor Ondernemend Nederland' });
    expect(logo).toHaveAttribute('src', 'https://assets.example/rvo-logo.png');

    // No logo (Belastingdienst, logo: null in the base fixture) → initials fallback, no <img>.
    // "Belastingdienst" is a single word, so the two-initials algorithm yields just "B".
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('Rules tab: no service accordion is open by default', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));

    // The `open` attribute is the actual source of truth for native <details>
    // disclosure state — jsdom (unlike real browsers) doesn't hide a closed
    // <details>'s children from the DOM, so a text-presence assertion here
    // wouldn't test anything real.
    const zorgtoeslagDetails = (await screen.findByText('Zorgtoeslag')).closest('details')!;
    expect(zorgtoeslagDetails).not.toHaveAttribute('open');
  });

  it('Rules tab: a service with count > 0 renders exactly that many rows once opened, and 0-rule services are absent', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));

    fireEvent.click(await screen.findByText('Zorgtoeslag'));

    // Zorgtoeslag has 2 rules — both rendered
    expect(await screen.findByText('Recht op zorgtoeslag')).toBeInTheDocument();
    expect(screen.getByText('Leeftijdseis 18 jaar')).toBeInTheDocument();
    const zorgtoeslagDetails = screen.getByText('Zorgtoeslag').closest('details')!;
    expect(zorgtoeslagDetails).toHaveTextContent('2 / 2');
    // Direct DOM row count — not just "these 2 titles are present somewhere" —
    // guards against a stray/duplicate row leaking in from another service.
    const bodyRows = zorgtoeslagDetails.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);

    // "Geen regels dienst" has 0 rules — no accordion for it at all
    expect(screen.queryByText('Geen regels dienst')).not.toBeInTheDocument();
  });

  it('Rules tab: a rule with a description is collapsed by default and expands on click; a rule without one has no toggle', async () => {
    const dataWithDescription = {
      ...DATA,
      rules: [
        {
          serviceTitle: 'Zorgtoeslag',
          ruleTitle: 'Recht op zorgtoeslag',
          validFrom: '2026-01-01',
          confidence: 'high',
          description: 'De aanvrager heeft recht op zorgtoeslag als...',
        },
        DATA.rules[1], // Leeftijdseis 18 jaar — description: null
      ],
    };
    vi.mocked(api.getRegelcatalogus).mockResolvedValue(dataWithDescription);

    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(await screen.findByText('Zorgtoeslag'));
    await screen.findByText('Recht op zorgtoeslag');

    // Description hidden until expanded
    expect(screen.queryByText('De aanvrager heeft recht op zorgtoeslag als...')).toBeNull();

    const toggle = screen.getByRole('button', { name: /Recht op zorgtoeslag/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('De aanvrager heeft recht op zorgtoeslag als...')).toBeInTheDocument();

    // A rule with no description is plain text, not a toggle button
    expect(screen.queryByRole('button', { name: /Leeftijdseis 18 jaar/ })).toBeNull();
    expect(screen.getByText('Leeftijdseis 18 jaar')).toBeInTheDocument();
  });

  it('Rules tab: opening a different service accordion opens it and closes the previous one in a single click', async () => {
    const twoServicesData = {
      ...DATA,
      services: [
        ...DATA.services,
        { uri: 's3', title: 'Kapvergunning', description: 'Bomen kappen' },
      ],
      rules: [
        ...DATA.rules,
        {
          serviceTitle: 'Kapvergunning',
          ruleTitle: 'Vervangingsplicht houtopstand',
          validFrom: '2026-01-01',
          confidence: 'high',
          description: null,
        },
      ],
    };
    vi.mocked(api.getRegelcatalogus).mockResolvedValue(twoServicesData);

    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));

    const zorgtoeslagDetails = (await screen.findByText('Zorgtoeslag')).closest('details')!;
    const kapvergunningDetails = screen.getByText('Kapvergunning').closest('details')!;
    expect(zorgtoeslagDetails).not.toHaveAttribute('open');
    expect(kapvergunningDetails).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText('Zorgtoeslag'));
    expect(zorgtoeslagDetails).toHaveAttribute('open');
    expect(kapvergunningDetails).not.toHaveAttribute('open');

    // One click on Kapvergunning's summary: it opens AND Zorgtoeslag closes —
    // no second click required.
    fireEvent.click(screen.getByText('Kapvergunning'));
    expect(kapvergunningDetails).toHaveAttribute('open');
    expect(zorgtoeslagDetails).not.toHaveAttribute('open');
  });

  it('Rules tab: an opened service stays open after navigating to another tab and back', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(await screen.findByText('Zorgtoeslag'));
    expect(screen.getByText('Zorgtoeslag').closest('details')).toHaveAttribute('open');

    // Navigate away to Begrippen, then back to Regels
    fireEvent.click(screen.getByRole('tab', { name: /Begrippen/ }));
    await waitFor(() => expect(screen.queryByText('Recht op zorgtoeslag')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));

    // Zorgtoeslag is still the open one — the user's choice survives the round
    // trip, it doesn't reset back to nothing (or to the first service) open.
    expect(await screen.findByText('Zorgtoeslag')).toBeInTheDocument();
    expect(screen.getByText('Zorgtoeslag').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('Recht op zorgtoeslag')).toBeInTheDocument();
  });

  it('Concepts tab: every row links out to Skosmos', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Begrippen/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Begrippen/ }));
    const link = await screen.findByRole('link', { name: 'Toetsingsinkomen' });
    expect(link).toHaveAttribute('href', expect.stringContaining('skosmos.open-regels.nl'));
  });

  it('Concepts tab: the selected dienst filter survives navigating to another tab and back', async () => {
    const twoConceptsData = {
      ...DATA,
      concepts: [
        ...DATA.concepts,
        {
          uri: 'c2',
          prefLabel: 'Vervangingsplicht',
          exactMatch: null,
          serviceUri: 's3',
          serviceTitle: 'Kapvergunning',
        },
      ],
    };
    vi.mocked(api.getRegelcatalogus).mockResolvedValue(twoConceptsData);

    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Begrippen/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Begrippen/ }));

    const dienstSelect = await screen.findByLabelText(t.filterDienst);
    fireEvent.change(dienstSelect, { target: { value: 'Kapvergunning' } });
    expect(dienstSelect).toHaveValue('Kapvergunning');
    expect(screen.queryByText('Toetsingsinkomen')).not.toBeInTheDocument();

    // Navigate away to Regels, then back to Begrippen
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));
    await waitFor(() => screen.queryByText('Toetsingsinkomen') === null);
    fireEvent.click(screen.getByRole('tab', { name: /Begrippen/ }));

    // The filter is still applied — it doesn't reset to "Alle diensten"
    const dienstSelectAgain = await screen.findByLabelText(t.filterDienst);
    expect(dienstSelectAgain).toHaveValue('Kapvergunning');
    expect(screen.queryByText('Toetsingsinkomen')).not.toBeInTheDocument();
    expect(screen.getByText('Vervangingsplicht')).toBeInTheDocument();
  });
  it('renders straight from the prerendered blob, without fetching', async () => {
    // The whole point of the blob is that /regels paints its full catalogue on
    // the first frame. A fetch here would mean the placeholder is still shown
    // first, which is the layout shift this page was measured on.
    setBlob(JSON.stringify({ route: '/regels', data: DATA }));
    try {
      renderPage();
      expect(screen.getByRole('tab', { name: /Organisaties/ })).toBeInTheDocument();
      expect(screen.queryByText('Laden…')).not.toBeInTheDocument();
      await waitFor(() => expect(api.getRegelcatalogus).not.toHaveBeenCalled());
    } finally {
      setBlob(null);
    }
  });

  it('translates the loading placeholder on a cold load', () => {
    vi.mocked(api.getRegelcatalogus).mockReturnValue(new Promise(() => {}));
    renderPage('en');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('Diensten tab lists every service, including one with no rules', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Diensten/ }));
    expect(screen.getByText('Geen regels dienst')).toBeInTheDocument();
    expect(screen.getAllByText('Zorgtoeslag').length).toBeGreaterThan(0);
  });

  it('Rules tab: clicking an open service summary closes it again', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Regels/ }));
    const summary = screen.getByText('Zorgtoeslag').closest('summary')!;

    fireEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');

    fireEvent.click(summary);
    expect(summary.closest('details')).not.toHaveAttribute('open');
  });

  it('Rules tab: an expanded rule description collapses again on a second click', async () => {
    vi.mocked(api.getRegelcatalogus).mockResolvedValue({
      ...DATA,
      rules: [
        {
          serviceTitle: 'Zorgtoeslag',
          ruleTitle: 'Recht op zorgtoeslag',
          validFrom: '2026-01-01',
          confidence: 'high',
          description: 'De verzekerde heeft recht op zorgtoeslag.',
        },
      ],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByText('Zorgtoeslag').closest('summary')!);

    const toggle = screen.getByRole('button', { name: /Recht op zorgtoeslag/ });
    fireEvent.click(toggle);
    expect(screen.getByText(/De verzekerde heeft recht/)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText(/De verzekerde heeft recht/)).not.toBeInTheDocument();
  });

  it('Rules tab: the filter opens every matching service and hides the rest', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Regels/ }));

    fireEvent.change(screen.getByLabelText(t.filterRule), { target: { value: 'leeftijd' } });

    // A filtered accordion opens itself -- a hit the reader has to click to see
    // would defeat the filter.
    const details = screen.getByText('Zorgtoeslag').closest('details')!;
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Leeftijdseis 18 jaar')).toBeInTheDocument();
    expect(screen.queryByText('Recht op zorgtoeslag')).not.toBeInTheDocument();
  });

  it('Rules tab: a service with no matching rule disappears entirely while filtering', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Regels/ }));

    fireEvent.change(screen.getByLabelText(t.filterRule), { target: { value: 'zzzz' } });

    expect(screen.queryByText('Zorgtoeslag')).not.toBeInTheDocument();
  });

  it('Rules tab: a rule with no start date shows an em dash, not an empty cell', async () => {
    vi.mocked(api.getRegelcatalogus).mockResolvedValue({
      ...DATA,
      rules: [
        {
          serviceTitle: 'Zorgtoeslag',
          ruleTitle: 'Ongedateerde regel',
          validFrom: null,
          confidence: null,
          description: null,
        },
      ],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByText('Zorgtoeslag').closest('summary')!);

    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument();
  });

  it('Rules tab: links on to the service page, in English', async () => {
    renderPage('en');
    fireEvent.click(await screen.findByRole('tab', { name: /Rules/ }));
    fireEvent.click(screen.getByText('Zorgtoeslag').closest('summary')!);

    expect(screen.getByRole('link', { name: /Go to the service/ })).toBeInTheDocument();
  });

  it('Concepts tab: the text filter narrows the rows, and reports the count in English', async () => {
    renderPage('en');
    fireEvent.click(await screen.findByRole('tab', { name: /Concepts/ }));

    expect(screen.getByText(/of 1 concepts/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Data dictionary' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(translations.en.filterConcept), {
      target: { value: 'zzzz' },
    });
    expect(screen.queryByText('Toetsingsinkomen')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(translations.en.filterConcept), {
      target: { value: 'toetsing' },
    });
    expect(screen.getByText('Toetsingsinkomen')).toBeInTheDocument();
  });
});
