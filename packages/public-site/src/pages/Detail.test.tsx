// packages/public-site/src/pages/Detail.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Detail from './Detail';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getRegelBySlug: vi.fn() };
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
