// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IouZakenSection from './IouZakenSection';

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(data) };
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    iid: 1,
    title: 'Snellere aanvraagverwerking',
    state: 'opened',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
    web_url: 'https://gitlab.example.test/use-cases/1',
    labels: ['Feedback'],
    assignees: [],
    description:
      '## 1. Submitter\nJan Jansen\n\n---\n\n## 2. Description\nKorte omschrijving.\n\n---\n\n## 3. Desired Outcome\nSneller resultaat.',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('IouZakenSection', () => {
  it('fetches from the correct endpoint for the given state', async () => {
    render(<IouZakenSection state="opened" />);
    await screen.findByText(/geen openstaande/);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/public/use-cases?state=opened'));
  });

  it('shows an empty state with the state-specific message', async () => {
    render(<IouZakenSection state="closed" />);
    expect(
      await screen.findByText("Er zijn geen gesloten gebruiksscenario's.")
    ).toBeInTheDocument();
  });

  it('shows an error state and "Opnieuw proberen" retries the load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, false, 500)));
    const user = userEvent.setup();
    render(<IouZakenSection state="opened" />);

    expect(await screen.findByText(/Kon de gegevens niet ophalen: HTTP 500/)).toBeInTheDocument();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [makeItem()] })));
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText(/Snellere aanvraagverwerking/)).toBeInTheDocument();
  });

  it('renders items and reports the count via onCountChange', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [makeItem()] })));
    const onCountChange = vi.fn();
    render(<IouZakenSection state="opened" onCountChange={onCountChange} />);

    expect(await screen.findByText(/Snellere aanvraagverwerking/)).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(onCountChange).toHaveBeenCalledWith(1);
  });

  it('expanding an item shows the extracted markdown sections and the work-item link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [makeItem()] })));
    const user = userEvent.setup();
    render(<IouZakenSection state="opened" />);

    await user.click(await screen.findByText(/Snellere aanvraagverwerking/));

    expect(screen.getByText('Indiener')).toBeInTheDocument();
    expect(screen.getByText('Jan Jansen')).toBeInTheDocument();
    expect(screen.getByText('Beschrijving')).toBeInTheDocument();
    expect(screen.getByText('Korte omschrijving.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bekijk werkitem #1/ })).toHaveAttribute(
      'href',
      'https://gitlab.example.test/use-cases/1'
    );
  });

  it('omits a field section entirely when its heading is absent from the description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [makeItem({ description: '## 1. Submitter\nJan Jansen' })],
        })
      )
    );
    const user = userEvent.setup();
    render(<IouZakenSection state="opened" />);

    await user.click(await screen.findByText(/Snellere aanvraagverwerking/));

    expect(screen.getByText('Indiener')).toBeInTheDocument();
    expect(screen.queryByText('Beschrijving')).not.toBeInTheDocument();
  });
});
