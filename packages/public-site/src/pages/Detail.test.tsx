// packages/public-site/src/pages/Detail.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Detail from './Detail';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getRegelBySlug: vi.fn(),
    getBerichtBySlug: vi.fn(),
    getNieuwsBySlug: vi.fn(),
    getProductBySlug: vi.fn(),
    getProcesByKey: vi.fn(),
  };
});

const t = translations.nl;

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/regels/${slug}`]}>
      <Routes>
        <Route path="/regels/:slug" element={<Detail t={t} lang="nl" type="regel" />} />
      </Routes>
    </MemoryRouter>
  );
}

// Same as renderAt, for the four other section types and either language --
// loadDetail has a separate arm per type and each one shapes its own facts,
// tech rows and API path.
function renderTyped(
  type: 'bericht' | 'nieuws' | 'product' | 'proces' | 'regel',
  slug: string,
  lang: 'nl' | 'en' = 'nl'
) {
  return render(
    <MemoryRouter initialEntries={[`/x/${slug}`]}>
      <Routes>
        <Route
          path="/x/:slug"
          element={<Detail t={translations[lang]} lang={lang} type={type} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

const hit = (over: Record<string, unknown> = {}) =>
  ({
    id: 'x',
    slug: 'x',
    type: 'regel',
    title: 'Titel',
    summary: 'Samenvatting',
    org: 'Provincie Flevoland',
    date: '2026-07-01',
    external: null,
    audience: [],
    facts: [],
    tech: [['api', '/v1/public/regelcatalogus/x']],
    ...over,
  }) as unknown as Awaited<ReturnType<typeof api.getRegelBySlug>>;

beforeEach(() => vi.clearAllMocks());

describe('Detail (regel)', () => {
  it('technical details are collapsed by default and expand on click', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue({
      id: 'regel-zorgtoeslag',
      slug: 'zorgtoeslag',
      type: 'regel',
      title: 'Zorgtoeslag',
      summary: 'Toeslag',
      org: 'Belastingdienst',
      date: null,
      audience: [],
      external: null,
      facts: [['Uitvoeringsorganisatie', 'Belastingdienst']],
      tech: [
        ['service.uri', 'svc:1'],
        ['api', '/v1/public/regels/zorgtoeslag'],
      ],
      rules: [{ naam: 'Recht op zorgtoeslag', geldig: '2026-01-01' }],
      ruleCount: 1,
      begrippen: [],
    });
    renderAt('zorgtoeslag');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Zorgtoeslag', level: 1 })).toBeInTheDocument()
    );

    const details = screen.getByText(t.tech).closest('details')!;
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText(t.tech));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('svc:1')).toBeInTheDocument();
  });

  it('renders the open-data callout with the GET path', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue({
      id: 'regel-zorgtoeslag',
      slug: 'zorgtoeslag',
      type: 'regel',
      title: 'Zorgtoeslag',
      summary: 'Toeslag',
      org: 'Belastingdienst',
      date: null,
      audience: [],
      external: null,
      facts: [],
      tech: [['api', '/v1/public/regels/zorgtoeslag']],
      rules: [],
      ruleCount: 0,
    });
    renderAt('zorgtoeslag');
    await waitFor(() =>
      expect(screen.getByText('GET /v1/public/regels/zorgtoeslag')).toBeInTheDocument()
    );
  });

  it('offers the DMN source as a download inside technical details', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue({
      id: 'regel-digital-twin-inkomensregelingen',
      slug: 'digital-twin-inkomensregelingen',
      type: 'regel',
      title: 'Digital Twin Inkomensregelingen',
      summary: 'iKnow export',
      org: 'Gemeente Amsterdam',
      date: null,
      audience: [],
      external: null,
      facts: [],
      tech: [['api', '/v1/public/regels/digital-twin-inkomensregelingen']],
      rules: [],
      ruleCount: 0,
      dmns: [
        {
          title: 'HvA_full_dmn_export-patched.dmn',
          xmlUrl: 'https://lde.test/v1/dmns/_bad36e9e/xml',
        },
      ],
    });
    renderAt('digital-twin-inkomensregelingen');

    const link = await screen.findByRole('link', { name: /HvA_full_dmn_export-patched\.dmn/ });
    expect(link).toHaveAttribute('href', 'https://lde.test/v1/dmns/_bad36e9e/xml');
    expect(link.closest('details')).toBe(screen.getByText(t.tech).closest('details'));
  });

  it('shows a not-found message instead of crashing when the slug does not resolve', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(null);
    renderAt('nope');
    await waitFor(() => expect(screen.getByText(/niet gevonden/i)).toBeInTheDocument());
  });
});

describe('Detail (bericht)', () => {
  it('renders the announcement, its sender fact and its external link', async () => {
    vi.mocked(api.getBerichtBySlug).mockResolvedValue({
      id: 'b1',
      subject: 'Wegwerkzaamheden N23',
      preview: 'De N23 is dicht.',
      content: null,
      publishedAt: '2026-07-01',
      sender: { id: 'pf', name: 'Provincie Flevoland' },
    } as unknown as Awaited<ReturnType<typeof api.getBerichtBySlug>>);

    renderTyped('bericht', 'b1');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Wegwerkzaamheden N23'
    );
    expect(screen.getByText('GET /v1/public/berichten/b1')).toBeInTheDocument();
    // The sender is already the publisher line in the aside, so repeating it as
    // a fact row would print the same name twice.
    expect(screen.queryByText('Afzender')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /flevoland\.nl/ }).length).toBeGreaterThan(0);
  });

  it('shows the not-found page for a bericht slug that does not resolve', async () => {
    vi.mocked(api.getBerichtBySlug).mockResolvedValue(null);
    renderTyped('bericht', 'gone');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Item niet gevonden'
    );
  });
});

describe('Detail (proces)', () => {
  const proces = (over: Record<string, unknown> = {}) =>
    ({
      key: 'aanvraag',
      naam: 'Aanvraag behandelen',
      beschrijving: 'Beschrijving van het proces.',
      gepubliceerd: '2026-07-01',
      status: 'active',
      forms: [{ id: 'f1', name: 'Aanvraagformulier' }],
      documents: [{ id: 'd1', name: 'Beschikking' }],
      subprocesses: [{ id: 's1', name: 'Sub', bpmnProcessId: 'sub', status: 'active' }],
      ...over,
    }) as unknown as Awaited<ReturnType<typeof api.getProcesByKey>>;

  it('counts the parts of the process', async () => {
    vi.mocked(api.getProcesByKey).mockResolvedValue(proces());

    renderTyped('proces', 'aanvraag');

    expect(await screen.findByText('Onderdelen van dit proces')).toBeInTheDocument();
    expect(screen.getByText(/1\s*formulieren/)).toBeInTheDocument();
    expect(screen.getByText(/1\s*documentsjablonen/)).toBeInTheDocument();
    expect(screen.getByText(/1\s*subprocessen/)).toBeInTheDocument();
    expect(screen.getByText('Proceskey')).toBeInTheDocument();
  });

  it('counts zero parts, in English, when the engine returned none of them', async () => {
    // An older deployment index omits these arrays entirely rather than
    // sending empty ones; the page must say "0", not crash on undefined.
    vi.mocked(api.getProcesByKey).mockResolvedValue(
      proces({
        beschrijving: null,
        forms: undefined,
        documents: undefined,
        subprocesses: undefined,
      })
    );

    renderTyped('proces', 'aanvraag', 'en');

    expect(await screen.findByText('Parts of this process')).toBeInTheDocument();
    expect(screen.getByText(/0\s*forms/)).toBeInTheDocument();
    expect(screen.getByText(/0\s*document templates/)).toBeInTheDocument();
    expect(screen.getByText(/0\s*subprocesses/)).toBeInTheDocument();
  });

  it('shows the not-found page for a process key that does not resolve', async () => {
    vi.mocked(api.getProcesByKey).mockResolvedValue(null);
    renderTyped('proces', 'gone', 'en');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Item not found');
  });
});

describe('Detail (nieuws and product)', () => {
  it('fetches nieuws through getNieuwsBySlug and links out to the source', async () => {
    vi.mocked(api.getNieuwsBySlug).mockResolvedValue(
      hit({ type: 'nieuws', title: 'Nieuw beleid', external: 'rijksoverheid.nl' })
    );

    renderTyped('nieuws', 'n1');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Nieuw beleid');
    expect(screen.getAllByRole('link', { name: /rijksoverheid\.nl/ }).length).toBeGreaterThan(0);
    expect(api.getNieuwsBySlug).toHaveBeenCalledWith('n1');
  });

  it('fetches product through getProductBySlug and explains the procedure', async () => {
    vi.mocked(api.getProductBySlug).mockResolvedValue(
      hit({ type: 'product', title: 'Vergunning' })
    );

    renderTyped('product', 'p1');

    expect(await screen.findByText('Wat u moet weten')).toBeInTheDocument();
    expect(screen.getByText(/valt onder de Omgevingswet/)).toBeInTheDocument();
    expect(screen.getByText(/via het Omgevingsloket/)).toBeInTheDocument();
    expect(screen.getByText(/Algemene wet bestuursrecht/)).toBeInTheDocument();
    expect(api.getProductBySlug).toHaveBeenCalledWith('p1');
  });

  it('translates the whole procedure block', async () => {
    vi.mocked(api.getProductBySlug).mockResolvedValue(hit({ type: 'product', title: 'Permit' }));

    renderTyped('product', 'p1', 'en');

    expect(await screen.findByText('What you need to know')).toBeInTheDocument();
    expect(screen.getByText(/falls under the Environment Act/)).toBeInTheDocument();
    expect(screen.getByText(/through the Omgevingsloket/)).toBeInTheDocument();
    expect(screen.getByText(/General Administrative Law Act/)).toBeInTheDocument();
  });
});

describe('Detail, shared chrome', () => {
  it('shows the loading placeholder in English before anything resolves', () => {
    vi.mocked(api.getRegelBySlug).mockReturnValue(new Promise(() => {}));
    renderTyped('regel', 'x', 'en');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('truncates an over-long title in the breadcrumb but not in the heading', async () => {
    const long = 'Regeling met een uitzonderlijk lange titel die de kruimelpad-limiet passeert';
    vi.mocked(api.getRegelBySlug).mockResolvedValue(hit({ title: long }));

    renderAt('x');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(long);
    expect(screen.getByText(`${long.slice(0, 46)}…`)).toBeInTheDocument();
  });

  it('omits the date lines entirely when the item carries no date', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(hit({ date: null }));

    renderAt('x');

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(t.updated)).not.toBeInTheDocument();
  });

  it('falls back to an empty API path when the item carries no api tech row', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(hit({ tech: [['engine', 'DMN 1.3']] }));

    renderAt('x');

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('GET')).toBeInTheDocument();
  });
});

describe('Detail (regel), rules and concepts', () => {
  it('states the rule count in prose when the catalogue returned no rule rows', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(hit({ ruleCount: 7, rules: [] }));

    renderAt('x');

    expect(
      await screen.findByText(/Deze dienst bevat 7 gepubliceerde regels\./)
    ).toBeInTheDocument();
  });

  it('translates the rule-count prose', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(hit({ ruleCount: 7, rules: [] }));

    renderTyped('regel', 'x', 'en');

    expect(await screen.findByText(/This service holds 7 published rules\./)).toBeInTheDocument();
  });

  it('renders an undated rule with an em dash', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(
      hit({ ruleCount: 1, rules: [{ naam: 'Ongedateerde regel', geldig: null }] })
    );

    renderAt('x');

    expect(await screen.findByText('Ongedateerde regel')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument();
  });

  it('links each concept out to Skosmos in the current language', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(
      hit({
        ruleCount: 1,
        rules: [{ naam: 'R', geldig: '2026-01-01' }],
        begrippen: ['Toetsingsinkomen'],
      })
    );

    renderTyped('regel', 'x', 'en');

    const link = await screen.findByRole('link', { name: 'Toetsingsinkomen' });
    expect(link).toHaveAttribute(
      'href',
      'https://skosmos.open-regels.nl/ronl/en/search?q=Toetsingsinkomen'
    );
  });

  it('omits the concepts block when the service has none', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(
      hit({ ruleCount: 1, rules: [{ naam: 'R', geldig: '2026-01-01' }], begrippen: [] })
    );

    renderAt('x');

    await screen.findByText('R');
    expect(screen.queryByText(new RegExp(t.conceptsIn))).not.toBeInTheDocument();
  });
});
