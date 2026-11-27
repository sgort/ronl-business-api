// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InstanceDocument, KredietCheck } from '../../services/rip-documents.types';

const mockUseInstanceDocuments = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', () => ({ useInstanceDocuments: mockUseInstanceDocuments }));
vi.mock('../../services/api', () => ({ businessApi: {} }));

import DocumentsPanel from './DocumentsPanel';

const doc = (over: Partial<InstanceDocument> = {}): InstanceDocument => ({
  slug: 'rip-projectraming',
  label: 'Projectraming VO',
  kind: 'BP',
  format: '2591295',
  taskKey: 'Task_OpstellenVoRaming',
  taskName: 'Opstellen VO-raming',
  candidateGroups: ['rip-kosten-contractdeskundige'],
  optional: false,
  map: false,
  status: 'missing',
  edocs: null,
  figures: { totaal: null, onvoorzien: null, prijspeil: null },
  checklist: null,
  ...over,
});

const check = (over: Partial<KredietCheck> = {}): KredietCheck => ({
  variable: 'projectkredietDekking',
  slug: 'rip-projectraming',
  taskKey: 'Task_ControlerenProjectramingVO',
  taskName: 'Controleren Projectraming VO',
  raming: null,
  krediet: null,
  voorstel: null,
  answer: null,
  afwijking: null,
  values: { binnen: 'binnen', buiten: 'buiten' },
  ...over,
});

const serve = (documents: InstanceDocument[], kredietChecks: KredietCheck[] = []) =>
  mockUseInstanceDocuments.mockReturnValue({
    data: {
      variables: {},
      intakeReport: null,
      psuReport: null,
      pdp: null,
      documents,
      kredietChecks,
    },
    loading: false,
    error: false,
    reload: vi.fn(),
  });

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

beforeEach(() => vi.clearAllMocks());

describe('DocumentsPanel', () => {
  it('lists each document with werkwijze, task and role, eDOCS and status', () => {
    serve([
      doc(),
      doc({
        slug: 'rip-ssk-rekenmodel',
        label: 'SSK-rekenmodel Provincie Flevoland UAV',
        status: 'linked',
        edocs: {
          documentId: '1',
          documentNumber: '3536162',
          version: '4',
          modified: '2026-06-11 10:00:00 UTC',
        },
        figures: { bouwkosten: 700000, totaal: 930000 },
      }),
      doc({
        slug: 'rip-inkoopplan',
        label: 'Inkoopplan reguliere projecten',
        kind: 'A',
        status: 'later',
        format: null,
        figures: null,
      }),
      doc({
        slug: 'rip-inkoopplan-vol',
        label: 'Inkoopplan (format 2640968)',
        kind: 'B',
        status: 'not-needed',
        optional: true,
        figures: null,
      }),
    ]);
    render(<DocumentsPanel instanceId="pi" phaseCode="R2.3" />);

    expect(screen.getByText('Documenten R2.3')).toBeInTheDocument();
    const missing = rowOf('Projectraming VO');
    expect(missing).toHaveClass('is-miss');
    expect(within(missing).getByText('B+')).toBeInTheDocument();
    expect(within(missing).getByText('Kosten contractdeskundige')).toBeInTheDocument();
    expect(within(missing).getByText('Ontbreekt — taak wacht')).toBeInTheDocument();

    const linked = rowOf('SSK-rekenmodel Provincie Flevoland UAV');
    expect(within(linked).getByText('3536162')).toBeInTheDocument();
    expect(within(linked).getByText(/versie 4 · 11 jun\.? 2026/)).toBeInTheDocument();
    expect(within(linked).getByText('€ 930.000')).toBeInTheDocument();
    expect(within(linked).getByText('Totaal SSK-raming (excl. btw)')).toBeInTheDocument();

    expect(
      within(rowOf('Inkoopplan reguliere projecten')).getByText('Nog niet aan de beurt')
    ).toBeInTheDocument();
    const optional = rowOf('Inkoopplan (format 2640968)');
    expect(within(optional).getByText('Niet nodig — criteria voldaan')).toBeInTheDocument();
    expect(
      within(optional).getByText(/Alleen als er een inkoopplan wordt geschreven/)
    ).toBeInTheDocument();
  });

  it('offers "Taak openen" only for a missing document whose task is open for this user', async () => {
    serve([doc()]);
    const onOpenTask = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <DocumentsPanel
        instanceId="pi"
        phaseCode="R2.3"
        onOpenTask={onOpenTask}
        openTaskKeys={new Set()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Taak openen' })).not.toBeInTheDocument();
    rerender(
      <DocumentsPanel
        instanceId="pi"
        phaseCode="R2.3"
        onOpenTask={onOpenTask}
        openTaskKeys={new Set(['Task_OpstellenVoRaming'])}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Taak openen' }));
    expect(onOpenTask).toHaveBeenCalledWith('Task_OpstellenVoRaming');
  });

  it('notes an upload outside the projectmap, and only that one', () => {
    const uploaded = (inWorkspace: boolean) =>
      doc({
        status: 'linked',
        figures: null,
        edocs: {
          documentId: '1',
          documentNumber: '3350336',
          version: null,
          modified: null,
          uploadedVia: 'ronl',
          inWorkspace,
        },
      });
    serve([uploaded(false)]);
    const { rerender } = render(<DocumentsPanel instanceId="pi" phaseCode="R2.1" />);
    expect(screen.getByText('geüpload naar eDOCS, niet in de projectmap')).toBeInTheDocument();
    serve([uploaded(true)]);
    rerender(<DocumentsPanel instanceId="pi" phaseCode="R2.1" refreshKey={1} />);
    expect(screen.queryByText(/geüpload naar eDOCS/)).not.toBeInTheDocument();
  });

  it('a linked map shows how many required documents are present', () => {
    serve([
      doc({
        slug: 'rip-verzamelmap-vg',
        label: 'Verzamelmap documenten V&G',
        kind: 'B',
        map: true,
        status: 'linked',
        figures: null,
        edocs: { documentId: 'f1', documentNumber: '3600100', version: null, modified: null },
        checklist: [
          { item: 'a', present: true },
          { item: 'b', present: true },
          { item: 'c', present: false },
        ],
      }),
    ]);
    render(<DocumentsPanel instanceId="pi" phaseCode="R2.4" />);
    expect(screen.getByText('Map · 2/3 verplichte documenten aanwezig')).toBeInTheDocument();
  });

  describe('Beslispunt', () => {
    it('waits for the raming figures', () => {
      serve([doc()], [check()]);
      render(<DocumentsPanel instanceId="pi" phaseCode="R2.3" />);
      expect(screen.getByText('Beslispunt')).toBeInTheDocument();
      expect(screen.getByText('Wacht op de kerngetallen van de raming.')).toBeInTheDocument();
    });

    it('shows raming, krediet, difference and the suggestion, with a way to the task', async () => {
      serve([doc({ status: 'linked' })], [check({ raming: 1100000, krediet: 1000000 })]);
      const onOpenTask = vi.fn();
      const user = userEvent.setup();
      render(
        <DocumentsPanel
          instanceId="pi"
          phaseCode="R2.3"
          onOpenTask={onOpenTask}
          openTaskKeys={new Set(['Task_ControlerenProjectramingVO'])}
        />
      );
      expect(screen.getByText('€ 1.100.000')).toBeInTheDocument();
      expect(screen.getByText('+ € 100.000')).toHaveClass('over');
      expect(screen.getByText(/Voorstel IOU:/)).toHaveTextContent('buiten projectkrediet');
      await user.click(screen.getByRole('button', { name: 'Taak openen' }));
      expect(onOpenTask).toHaveBeenCalledWith('Task_ControlerenProjectramingVO');
    });

    it('shows a confirmed answer against the suggestion, with its reason', () => {
      serve(
        [doc({ status: 'linked' })],
        [
          check({
            variable: 'ramingBinnenKrediet',
            values: { binnen: 'ja', buiten: 'nee' },
            raming: 1100000,
            krediet: 1000000,
            answer: 'ja',
            afwijking: 'Krediet verhoogd',
          }),
        ]
      );
      render(<DocumentsPanel instanceId="pi" phaseCode="R2.4" />);
      expect(screen.getByText(/Bevestigd:/)).toHaveTextContent('binnen projectkrediet');
      expect(screen.getByText(/afwijkend van voorstel/)).toBeInTheDocument();
      expect(screen.getByText('Reden: Krediet verhoogd')).toBeInTheDocument();
    });

    it('without a krediet yet, says where it is filled in', () => {
      serve([doc({ status: 'linked' })], [check({ raming: 900 })]);
      render(<DocumentsPanel instanceId="pi" phaseCode="R2.3" />);
      expect(
        screen.getByText('Het projectkrediet wordt bij de taak ingevuld.')
      ).toBeInTheDocument();
    });
  });

  it('reads the documents again when the refresh key changes', () => {
    serve([doc()]);
    const { rerender } = render(<DocumentsPanel instanceId="pi" phaseCode="R2.3" />);
    expect(mockUseInstanceDocuments).toHaveBeenLastCalledWith('pi', 0);
    rerender(<DocumentsPanel instanceId="pi" phaseCode="R2.3" refreshKey={1} />);
    expect(mockUseInstanceDocuments).toHaveBeenLastCalledWith('pi', 1);
  });

  it('renders nothing without an instance, while failing, or for a phase without documents', () => {
    serve([]);
    const { container, rerender } = render(<DocumentsPanel instanceId={null} phaseCode="R2.1" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DocumentsPanel instanceId="pi" phaseCode="R2.1" />);
    expect(container).toBeEmptyDOMElement();
    mockUseInstanceDocuments.mockReturnValue({
      data: null,
      loading: false,
      error: true,
      reload: vi.fn(),
    });
    rerender(<DocumentsPanel instanceId="pi" phaseCode="R2.1" />);
    expect(container).toBeEmptyDOMElement();
    mockUseInstanceDocuments.mockReturnValue({
      data: null,
      loading: true,
      error: false,
      reload: vi.fn(),
    });
    rerender(<DocumentsPanel instanceId="pi" phaseCode="R2.1" />);
    expect(screen.getByText('Documenten laden…')).toBeInTheDocument();
  });
});
