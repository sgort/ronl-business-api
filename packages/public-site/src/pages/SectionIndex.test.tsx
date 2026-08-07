// packages/public-site/src/pages/SectionIndex.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SectionIndex from './SectionIndex';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getBerichten: vi.fn() };
});

const t = translations.nl;
beforeEach(() => vi.clearAllMocks());

describe('SectionIndex (berichten)', () => {
  it('lists fetched items and shows a live item count', async () => {
    vi.mocked(api.getBerichten).mockResolvedValue({
      items: [
        {
          id: 'b1',
          subject: 'Wegwerkzaamheden',
          preview: 'De N23 is dicht.',
          content: null,
          publishedAt: '2026-07-01',
          sender: { id: 'x', name: 'Provincie Flevoland' },
        },
        {
          id: 'b2',
          subject: 'Subsidieronde open',
          preview: 'Vraag nu aan.',
          content: null,
          publishedAt: '2026-07-02',
          sender: { id: 'x', name: 'Provincie Flevoland' },
        },
      ],
      total: 2,
    });
    render(
      <MemoryRouter initialEntries={['/berichten']}>
        <SectionIndex t={t} lang="nl" type="bericht" />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Wegwerkzaamheden/ })).toBeInTheDocument()
    );
    expect(screen.getByText('2 items')).toHaveAttribute('aria-live', 'polite');
  });

  it('a local filter narrows the visible items by title', async () => {
    vi.mocked(api.getBerichten).mockResolvedValue({
      items: [
        {
          id: 'b1',
          subject: 'Wegwerkzaamheden',
          preview: '',
          content: null,
          publishedAt: '2026-01-01',
          sender: { id: 'x', name: 'X' },
        },
        {
          id: 'b2',
          subject: 'Subsidieronde open',
          preview: '',
          content: null,
          publishedAt: '2026-01-02',
          sender: { id: 'x', name: 'X' },
        },
      ],
      total: 2,
    });
    render(
      <MemoryRouter initialEntries={['/berichten']}>
        <SectionIndex t={t} lang="nl" type="bericht" />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Wegwerkzaamheden/ })).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(t.searchLabel), { target: { value: 'subsidie' } });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Wegwerkzaamheden/ })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: /Subsidieronde/ })).toBeInTheDocument();
  });
});

describe('SectionIndex — prerendered seeding', () => {
  function setBlob(route: string, data: unknown) {
    document.getElementById('__PUB_DATA__')?.remove();
    const s = document.createElement('script');
    s.id = '__PUB_DATA__';
    s.type = 'application/json';
    s.textContent = JSON.stringify({ route, data });
    document.body.appendChild(s);
  }
  afterEach(() => document.getElementById('__PUB_DATA__')?.remove());

  it('renders items from the prerendered blob on first paint, without fetching', () => {
    vi.mocked(api.getBerichten).mockResolvedValue({ items: [], total: 0 });
    setBlob('/berichten', [
      {
        id: 'b1',
        slug: 'b1',
        type: 'bericht',
        title: 'Seeded bericht',
        summary: 'x',
        org: 'Provincie Flevoland',
        date: '2026-07-01',
        audience: [],
        external: null,
        facts: [],
        tech: [],
      },
    ]);
    render(
      <MemoryRouter initialEntries={['/berichten']}>
        <SectionIndex t={t} lang="nl" type="bericht" />
      </MemoryRouter>
    );
    // Present synchronously — seeded during render, no "Laden…" then fetch.
    expect(screen.getByRole('link', { name: /Seeded bericht/ })).toBeInTheDocument();
    expect(screen.getByText('1 items')).toBeInTheDocument();
    expect(api.getBerichten).not.toHaveBeenCalled();
  });

  it('still fetches when no blob is present (cold load)', async () => {
    vi.mocked(api.getBerichten).mockResolvedValue({
      items: [
        {
          id: 'b9',
          subject: 'Fetched bericht',
          preview: '',
          content: null,
          publishedAt: '2026-07-01',
          sender: { id: 'x', name: 'X' },
        },
      ],
      total: 1,
    });
    render(
      <MemoryRouter initialEntries={['/berichten']}>
        <SectionIndex t={t} lang="nl" type="bericht" />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Fetched bericht/ })).toBeInTheDocument()
    );
    expect(api.getBerichten).toHaveBeenCalled();
  });
});
