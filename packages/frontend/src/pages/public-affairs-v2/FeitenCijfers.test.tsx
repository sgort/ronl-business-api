// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DossierFeitenStrip, FeitenView } from './FeitenCijfers';
import { FEITEN_MONITOREN } from './feiten.data';

const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./PaDataProvider', () => ({ usePaData: mockUsePaData }));

beforeEach(() => {
  mockUsePaData.mockReturnValue({ dossiers: { data: [], status: 'ok' } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FeitenView', () => {
  it('shows the total monitor count', () => {
    render(<FeitenView onOpenDossier={vi.fn()} />);
    expect(
      screen.getByText(`${FEITEN_MONITOREN.length} van ${FEITEN_MONITOREN.length} monitoren`)
    ).toBeInTheDocument();
  });

  it('filters monitors by free-text search', async () => {
    const user = userEvent.setup();
    render(<FeitenView onOpenDossier={vi.fn()} />);

    await user.type(screen.getByLabelText('Zoek in de provinciale monitoren'), 'Monitor Wonen');

    expect(screen.getByText('Monitor Wonen')).toBeInTheDocument();
    expect(screen.queryByText('Monitor Brede Welvaart')).not.toBeInTheDocument();
    expect(screen.getByText('1 van', { exact: false })).toBeInTheDocument();
  });

  it('shows a "not found" message when the search matches nothing', async () => {
    const user = userEvent.setup();
    render(<FeitenView onOpenDossier={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Zoek in de provinciale monitoren'),
      'geen-enkele-monitor-heet-zo'
    );

    expect(screen.getByText(/Geen monitor gevonden/)).toBeInTheDocument();
  });

  it('filters by thema chip', async () => {
    const user = userEvent.setup();
    render(<FeitenView onOpenDossier={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Klimaat & energie/ }));

    expect(screen.queryByText('Monitor Wonen')).not.toBeInTheDocument();
    const energieCount = FEITEN_MONITOREN.filter((m) => m.thema === 'energie').length;
    expect(
      screen.getByText(`${energieCount} van ${FEITEN_MONITOREN.length} monitoren`)
    ).toBeInTheDocument();
  });

  it('clicking a linked dossier chip calls onOpenDossier', async () => {
    const onOpenDossier = vi.fn();
    const user = userEvent.setup();
    render(<FeitenView onOpenDossier={onOpenDossier} />);

    await user.type(
      screen.getByLabelText('Zoek in de provinciale monitoren'),
      'Positieve Gezondheid'
    );
    await user.click(screen.getByTitle('Naar dossier · jeugdzorg'));

    expect(onOpenDossier).toHaveBeenCalledWith('jeugdzorg');
  });
});

describe('DossierFeitenStrip', () => {
  it('renders nothing for a dossier with no related monitors', () => {
    const { container } = render(<DossierFeitenStrip dossierId="does-not-exist" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists related monitors for a dossier that has them', () => {
    render(<DossierFeitenStrip dossierId="jeugdzorg" />);
    expect(screen.getByText('Monitor Positieve Gezondheid')).toBeInTheDocument();
  });

  it('"Alle feiten & cijfers" calls onNavigate with the monitoring/feiten target', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<DossierFeitenStrip dossierId="jeugdzorg" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /Alle feiten/ }));

    expect(onNavigate).toHaveBeenCalledWith('monitoring', 'feiten');
  });
});
