// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BesluitOverzichtSection from './BesluitOverzichtSection';

const mockBusinessApi = vi.hoisted(() => ({
  besluitvorming: { active: vi.fn(), completed: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const jurist = { sub: '1', roles: ['caseworker', 'besluit-jurist'] } as never;

function makeBesluit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pi-1',
    businessKey: 'flevoland-1',
    startTime: '2026-10-01T09:00:00.000+0200',
    endTime: null,
    onderwerp: 'Opdracht schoonmaak',
    besluitType: 'standaard',
    financieleGevolgen: 12000,
    uitkomst: null,
    huidigeStap: 'Advies en toetsing',
    kenmerk: null,
    zaaknummer: null,
    motivering: null,
    voorgesteldBesluit: null,
    escalatieReden: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockBusinessApi.besluitvorming.active.mockResolvedValue({ success: true, data: [] });
  mockBusinessApi.besluitvorming.completed.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('BesluitOverzichtSection', () => {
  it('denies a user without a besluit role, and loads nothing', () => {
    render(
      <BesluitOverzichtSection user={{ sub: '1', roles: ['caseworker'] } as never} state="lopend" />
    );
    expect(screen.getByText('Geen toegang')).toBeInTheDocument();
    expect(mockBusinessApi.besluitvorming.active).not.toHaveBeenCalled();
  });

  it('lists running besluiten with their current step', async () => {
    mockBusinessApi.besluitvorming.active.mockResolvedValue({
      success: true,
      data: [makeBesluit()],
    });
    render(<BesluitOverzichtSection user={jurist} state="lopend" />);

    expect(await screen.findByText('Opdracht schoonmaak')).toBeInTheDocument();
    expect(screen.getByText('Advies en toetsing')).toBeInTheDocument();
    expect(screen.getByText(/flevoland-1/)).toBeInTheDocument();
    expect(mockBusinessApi.besluitvorming.completed).not.toHaveBeenCalled();
  });

  it('lists completed besluiten with their outcome', async () => {
    mockBusinessApi.besluitvorming.completed.mockResolvedValue({
      success: true,
      data: [
        makeBesluit({
          endTime: '2026-10-02T10:00:00.000+0200',
          huidigeStap: null,
          uitkomst: 'geëscaleerd — genomen',
        }),
      ],
    });
    render(<BesluitOverzichtSection user={jurist} state="afgerond" />);

    expect(await screen.findByText('geëscaleerd — genomen')).toBeInTheDocument();
    expect(screen.getByText(/Afgerond/)).toBeInTheDocument();
    expect(mockBusinessApi.besluitvorming.active).not.toHaveBeenCalled();
  });

  it('opens a besluit to show its details, leaving out the empty ones', async () => {
    mockBusinessApi.besluitvorming.active.mockResolvedValue({
      success: true,
      data: [
        makeBesluit({
          kenmerk: 'BGB-2026-001',
          voorgesteldBesluit: 'Opdracht verlenen aan Schoon BV',
        }),
      ],
    });
    render(<BesluitOverzichtSection user={jurist} state="lopend" />);

    await userEvent.click(await screen.findByText('Opdracht schoonmaak'));

    expect(screen.getByText('BGB-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Opdracht verlenen aan Schoon BV')).toBeInTheDocument();
    expect(screen.queryByText('Reden escalatie')).not.toBeInTheDocument();
  });

  it.each([
    ['lopend', 'Geen lopende besluiten.'],
    ['afgerond', 'Geen afgeronde besluiten.'],
  ] as const)('says so when there are no %s besluiten', async (state, text) => {
    render(<BesluitOverzichtSection user={jurist} state={state} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    mockBusinessApi.besluitvorming.active
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true, data: [makeBesluit()] });
    render(<BesluitOverzichtSection user={jurist} state="lopend" />);

    await userEvent.click(await screen.findByText('Opnieuw proberen'));

    expect(await screen.findByText('Opdracht schoonmaak')).toBeInTheDocument();
  });
});
