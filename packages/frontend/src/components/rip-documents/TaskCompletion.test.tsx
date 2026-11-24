// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InstanceDocument, KredietCheck } from '../../services/rip-documents.types';

const mockUseInstanceDocuments = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', () => ({ useInstanceDocuments: mockUseInstanceDocuments }));

const api = vi.hoisted(() => ({
  task: { complete: vi.fn() },
  rip: { workspace: vi.fn(), linkDocument: vi.fn(), uploadDocument: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: api }));

/**
 * The form, reduced to what TaskCompletion hands it: a submit that refuses
 * while blocked and otherwise completes with the extra variables, a field for
 * the inkoopplan choice, and the server's 422 list.
 */
vi.mock('../CaseworkerDashboard/TaskFormViewer', () => ({
  default: (p: {
    taskId: string;
    extraVariables?: Record<string, unknown>;
    blockedText?: string | null;
    onFormData?: (d: Record<string, unknown>) => void;
    onMissing?: (m: unknown[]) => void;
    onCompleted: () => void;
  }) => (
    <div>
      <span data-testid="blocked">{p.blockedText ?? ''}</span>
      <button type="button" onClick={() => p.onFormData?.({ inkoopplanNodig: 'ja' })}>
        form: inkoopplan ja
      </button>
      <button
        type="button"
        disabled={!!p.blockedText}
        onClick={async () => {
          try {
            await api.task.complete(p.taskId, { ...(p.extraVariables ?? {}) });
            p.onCompleted();
          } catch (e) {
            p.onMissing?.((e as { missing: unknown[] }).missing);
          }
        }}
      >
        Taak voltooien
      </button>
    </div>
  ),
}));

import TaskCompletion from './TaskCompletion';

const TASK = { id: 't1', processInstanceId: 'pi-1', taskDefinitionKey: 'Task_UitvoerenPSU' };

const doc = (over: Partial<InstanceDocument> = {}): InstanceDocument => ({
  slug: 'rip-psu-presentatie',
  label: 'PSU-presentatie',
  kind: 'B',
  format: '3325975',
  taskKey: 'Task_UitvoerenPSU',
  taskName: 'Uitvoeren PSU',
  candidateGroups: ['rip-projectleider'],
  optional: false,
  map: false,
  status: 'missing',
  edocs: null,
  figures: null,
  checklist: null,
  ...over,
});

const ITEM = {
  id: '501',
  name: '25008 — PSU-presentatie',
  documentNumber: '3500501',
  isFolder: false,
  version: '2',
  modified: '2026-06-11 12:38:29 UTC',
  author: 'TESTUSER001',
};

let reload: ReturnType<typeof vi.fn>;
const serve = (documents: InstanceDocument[], extra: Record<string, unknown> = {}) =>
  mockUseInstanceDocuments.mockReturnValue({
    data: {
      variables: {},
      intakeReport: null,
      psuReport: null,
      pdp: null,
      documents,
      kredietChecks: [],
      uploadTarget: 'edocs',
      ...extra,
    },
    loading: false,
    error: false,
    reload,
  });

const renderTask = (task = TASK) =>
  render(<TaskCompletion task={task} variables={{}} onCompleted={vi.fn()} onError={vi.fn()} />);

beforeEach(() => {
  vi.clearAllMocks();
  reload = vi.fn();
  api.rip.workspace.mockResolvedValue({
    success: true,
    data: { workspaceId: '77', folderId: null, items: [ITEM] },
  });
  api.rip.linkDocument.mockResolvedValue({ success: true, data: {} });
  api.rip.uploadDocument.mockResolvedValue({ success: true, data: {} });
  api.task.complete.mockResolvedValue({ success: true });
});

describe('TaskCompletion — a B document', () => {
  it('cannot be completed until the document is linked, and can once it is', async () => {
    serve([doc()]);
    const user = userEvent.setup();
    const { rerender } = renderTask();

    expect(screen.getByRole('heading', { name: 'Documenten bij deze taak' })).toBeInTheDocument();
    expect(screen.getByTestId('blocked')).toHaveTextContent('PSU-presentatie koppelen');
    expect(screen.getByRole('button', { name: 'Taak voltooien' })).toBeDisabled();

    // Pick it from the projectmap: the IOU links it and re-reads the documents.
    await user.click(await screen.findByRole('radio', { name: /25008 — PSU-presentatie/ }));
    expect(api.rip.linkDocument).toHaveBeenCalledWith('pi-1', 'rip-psu-presentatie', '501');
    expect(reload).toHaveBeenCalled();

    serve([
      doc({
        status: 'linked',
        edocs: { documentId: '501', documentNumber: '3500501', version: '2', modified: null },
      }),
    ]);
    rerender(<TaskCompletion task={TASK} variables={{}} onCompleted={vi.fn()} onError={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Taak voltooien' })).toBeEnabled()
    );
    expect(screen.getByRole('radio', { name: /25008 — PSU-presentatie/ })).toBeChecked();
    expect(screen.getByText('Alles compleet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Taak voltooien' }));
    expect(api.task.complete).toHaveBeenCalledWith('t1', {});
  });

  it('lists version, date and who stored it for each item in the projectmap', async () => {
    serve([doc()]);
    renderTask();
    const row = (await screen.findByRole('radio', { name: /25008/ })).closest('label');
    expect(within(row!).getByText('3500501')).toBeInTheDocument();
    expect(within(row!).getByText(/v2 · 11 jun\.? 2026 · TESTUSER001/)).toBeInTheDocument();
  });

  it('uploads to eDOCS standalone while workspace uploads are off, and says so', async () => {
    serve([doc()]);
    const user = userEvent.setup();
    renderTask();
    const input = screen.getByLabelText('Bestand uploaden naar eDOCS…');
    expect(screen.getByText(/nog niet in de projectmap/)).toBeInTheDocument();
    await user.upload(input, new File(['pptx'], 'PSU.pptx'));
    await waitFor(() =>
      expect(api.rip.uploadDocument).toHaveBeenCalledWith(
        'pi-1',
        'rip-psu-presentatie',
        'PSU.pptx',
        btoa('pptx')
      )
    );
    expect(reload).toHaveBeenCalled();
  });

  it('reads the projectmap again after an upload, so the uploaded file lists by its name', async () => {
    serve([doc()]);
    const user = userEvent.setup();
    renderTask();
    await waitFor(() => expect(api.rip.workspace).toHaveBeenCalledTimes(1));
    await user.upload(
      screen.getByLabelText(/Bestand uploaden naar/),
      new File(['pdf'], 'bevindingen.pdf')
    );
    await waitFor(() => expect(api.rip.workspace).toHaveBeenCalledTimes(2));
  });

  it('reads the projectmap again after a link', async () => {
    serve([doc()]);
    const user = userEvent.setup();
    renderTask();
    await user.click(await screen.findByRole('radio', { name: /25008 — PSU-presentatie/ }));
    await waitFor(() => expect(api.rip.workspace).toHaveBeenCalledTimes(2));
  });

  it('shows the eDOCS name of a linked document the list does not hold', async () => {
    serve([
      doc({
        status: 'linked',
        edocs: {
          documentId: 'd9',
          documentNumber: '3350339',
          name: 'RIP21-TEST001 — Bevindingenformulier — RIP21-TEST001 - Test project',
          version: '1',
          modified: null,
          uploadedVia: 'ronl',
          inWorkspace: true,
        },
      }),
    ]);
    renderTask();
    const radio = await screen.findByRole('radio', {
      name: /RIP21-TEST001 — Bevindingenformulier/,
    });
    expect(radio).toBeChecked();
    expect(
      screen.queryByText('Geüpload naar eDOCS, niet in de projectmap')
    ).not.toBeInTheDocument();
  });

  it('offers the projectmap upload once workspace uploads work', () => {
    serve([doc()], { uploadTarget: 'workspace' });
    renderTask();
    expect(screen.getByLabelText('Bestand uploaden naar projectmap…')).toBeInTheDocument();
  });

  it('shows a standalone upload as linked even though it is not in the projectmap', async () => {
    serve([
      doc({
        status: 'linked',
        edocs: {
          documentId: 'd9',
          documentNumber: '3500999',
          version: '1',
          modified: null,
          uploadedVia: 'ronl',
          inWorkspace: false,
        },
      }),
    ]);
    renderTask();
    expect(await screen.findByRole('radio', { name: /Geüpload naar eDOCS/ })).toBeChecked();
  });

  it('refuses a file over 20 MB without sending it', async () => {
    serve([doc()]);
    const user = userEvent.setup();
    renderTask();
    const big = new File(['x'], 'big.xlsx');
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    await user.upload(screen.getByLabelText('Bestand uploaden naar eDOCS…'), big);
    expect(await screen.findByText('Het bestand is groter dan 20 MB.')).toBeInTheDocument();
    expect(api.rip.uploadDocument).not.toHaveBeenCalled();
  });

  it('shows the problem detail when linking is refused', async () => {
    serve([doc()]);
    api.rip.linkDocument.mockRejectedValue({
      response: {
        data: { status: 403, title: 'Forbidden', detail: 'U mag deze taak niet uitvoeren.' },
      },
    });
    const user = userEvent.setup();
    renderTask();
    await user.click(await screen.findByRole('radio', { name: /25008/ }));
    expect(await screen.findByText('U mag deze taak niet uitvoeren.')).toBeInTheDocument();
  });

  it('explains in Dutch when eDOCS is not available for this account', async () => {
    serve([doc()]);
    api.rip.workspace.mockRejectedValue({
      response: {
        data: {
          status: 403,
          title: 'Forbidden',
          code: 'EDOCS_USER_TOKEN_UNAVAILABLE',
          detail: 'eDOCS is available after signing in with your Flevoland account.',
        },
      },
    });
    renderTask();
    expect(
      await screen.findByText(
        'eDOCS is alleen beschikbaar als u bent ingelogd met uw Flevoland-account.'
      )
    ).toBeInTheDocument();
  });

  it('shows the problem detail for any other refusal', async () => {
    serve([doc()]);
    api.rip.workspace.mockRejectedValue({
      response: {
        data: {
          status: 409,
          title: 'Conflict',
          code: 'NO_PROJECT_WORKSPACE',
          detail: 'Dit project heeft nog geen eDOCS-projectmap.',
        },
      },
    });
    renderTask();
    expect(
      await screen.findByText('Dit project heeft nog geen eDOCS-projectmap.')
    ).toBeInTheDocument();
  });

  it('shows the server’s list after a 422', async () => {
    serve([
      doc({
        status: 'linked',
        edocs: { documentId: '501', documentNumber: '1', version: null, modified: null },
      }),
    ]);
    api.task.complete.mockRejectedValue({
      missing: [{ slug: 'x', what: 'figure', label: 'Totaal invullen' }],
    });
    const user = userEvent.setup();
    renderTask();
    await user.click(await screen.findByRole('button', { name: 'Taak voltooien' }));
    expect(
      await screen.findByText(/De taak is niet afgerond. Nog nodig: Totaal invullen/)
    ).toBeInTheDocument();
  });
});

describe('TaskCompletion — B+ and the kredietcheck', () => {
  const ramingDo = doc({
    slug: 'rip-projectraming-do',
    label: 'Projectraming DO',
    kind: 'BP',
    taskKey: 'Task_OpstellenProjectramingDO',
    status: 'linked',
    edocs: { documentId: '501', documentNumber: '3500501', version: '1', modified: null },
    figures: { totaal: null, onvoorzien: null, prijspeil: null },
  });
  const check: KredietCheck = {
    variable: 'ramingBinnenKrediet',
    slug: 'rip-projectraming-do',
    taskKey: 'Task_OpstellenProjectramingDO',
    taskName: 'Opstellen Projectraming DO',
    raming: null,
    krediet: null,
    voorstel: null,
    answer: null,
    afwijking: null,
    values: { binnen: 'ja', buiten: 'nee' },
  };
  const task = {
    id: 't2',
    processInstanceId: 'pi-2',
    taskDefinitionKey: 'Task_OpstellenProjectramingDO',
  };

  it('needs the figures, suggests from them, and asks a reason to deviate', async () => {
    serve([ramingDo], { kredietChecks: [check] });
    const user = userEvent.setup();
    renderTask(task);

    expect(screen.getByTestId('blocked')).toHaveTextContent(
      'Totaal projectraming (excl. btw) invullen'
    );
    await user.type(screen.getByLabelText('Totaal projectraming (excl. btw)'), '1100000');
    expect(screen.getByLabelText('Totaal projectraming (excl. btw)')).toHaveValue('1.100.000');
    await user.type(screen.getByLabelText('Waarvan onvoorzien'), '100000');
    await user.type(screen.getByLabelText('Prijspeil'), '2026');
    await user.type(screen.getByLabelText('Beschikbaar projectkrediet'), '1000000');

    // 1.1 mln over 1 mln: the IOU suggests "buiten", pre-selected.
    const buiten = screen.getByRole('radio', { name: /Buiten projectkrediet/ });
    expect(buiten).toBeChecked();
    expect(within(buiten.closest('label')!).getByText('voorstel')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Taak voltooien' })).toBeEnabled()
    );

    // Going against it needs a reason of four characters or more.
    await user.click(screen.getByRole('radio', { name: /Binnen projectkrediet/ }));
    expect(screen.getByTestId('blocked')).toHaveTextContent('reden voor afwijken van het voorstel');
    await user.type(
      screen.getByLabelText('Reden voor afwijken van het voorstel'),
      'Krediet verhoogd'
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Taak voltooien' })).toBeEnabled()
    );

    await user.click(screen.getByRole('button', { name: 'Taak voltooien' }));
    expect(api.task.complete).toHaveBeenCalledWith('t2', {
      raming_do_totaal: 1100000,
      raming_do_onvoorzien: 100000,
      raming_do_prijspeil: 2026,
      beschikbaarProjectkrediet: 1000000,
      ramingBinnenKrediet: 'ja',
      ramingBinnenKrediet_afwijking: 'Krediet verhoogd',
    });
  });

  it('R2.4 starts from the VO figures and projectkrediet, which can be confirmed or changed', async () => {
    serve([{ ...ramingDo, prefill: { totaal: 40000, onvoorzien: 4500, prijspeil: 2026 } }], {
      kredietChecks: [{ ...check, kredietPrefill: 60000 }],
    });
    const user = userEvent.setup();
    renderTask(task);

    expect(screen.getByLabelText('Totaal projectraming (excl. btw)')).toHaveValue('40.000');
    expect(screen.getByLabelText('Waarvan onvoorzien')).toHaveValue('4.500');
    expect(screen.getByLabelText('Prijspeil')).toHaveValue('2026');
    expect(screen.getByLabelText('Beschikbaar projectkrediet')).toHaveValue('60.000');
    expect(
      screen.getByText(
        /Vooraf ingevuld met de getallen uit een eerdere fase \(Projectraming VO, R2\.3\)/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Vooraf ingevuld met het projectkrediet uit een eerdere fase/)
    ).toBeInTheDocument();
    // Prefilled and within the krediet: the suggestion is there, nothing is missing.
    expect(screen.getByRole('radio', { name: /Binnen projectkrediet/ })).toBeChecked();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Taak voltooien' })).toBeEnabled()
    );

    const totaal = screen.getByLabelText('Totaal projectraming (excl. btw)');
    await user.clear(totaal);
    await user.type(totaal, '52000');
    await user.click(screen.getByRole('button', { name: 'Taak voltooien' }));
    expect(api.task.complete).toHaveBeenCalledWith(
      't2',
      expect.objectContaining({
        raming_do_totaal: 52000,
        raming_do_onvoorzien: 4500,
        raming_do_prijspeil: 2026,
        beschikbaarProjectkrediet: 60000,
      })
    );
  });

  it('leaves fields empty and says nothing when there is nothing to prefill', () => {
    serve([{ ...ramingDo, prefill: null }], { kredietChecks: [check] });
    renderTask(task);
    expect(screen.getByLabelText('Totaal projectraming (excl. btw)')).toHaveValue('');
    expect(screen.queryByText(/Vooraf ingevuld/)).not.toBeInTheDocument();
  });

  it('R2.3: a kredietcheck on its own task reads the raming from the instance', async () => {
    serve([], {
      kredietChecks: [
        {
          ...check,
          variable: 'projectkredietDekking',
          slug: 'rip-projectraming',
          taskKey: 'Task_ControlerenProjectramingVO',
          raming: 900000,
          krediet: 1000000,
          values: { binnen: 'binnen', buiten: 'buiten' },
        },
      ],
    });
    renderTask({
      id: 't3',
      processInstanceId: 'pi-3',
      taskDefinitionKey: 'Task_ControlerenProjectramingVO',
    });
    expect(screen.getByLabelText('Beschikbaar projectkrediet')).toHaveValue('1.000.000');
    expect(screen.getByRole('radio', { name: /Binnen projectkrediet/ })).toBeChecked();
    expect(screen.getByText('€ 900.000')).toBeInTheDocument();
    expect(screen.getByText(/projectkredietDekking = "binnen"/)).toBeInTheDocument();
  });
});

describe('TaskCompletion — optional and map documents', () => {
  it('asks for the full inkoopplan only once the form says one is written', async () => {
    serve([
      doc({
        slug: 'rip-inkoopplan-vol',
        label: 'Inkoopplan (format 2640968)',
        optional: true,
        taskKey: 'Task_BepalenInkoopstrategie',
      }),
    ]);
    const user = userEvent.setup();
    renderTask({
      id: 't4',
      processInstanceId: 'pi-4',
      taskDefinitionKey: 'Task_BepalenInkoopstrategie',
    });
    expect(screen.getByTestId('blocked')).toHaveTextContent('');
    expect(screen.getByText(/Volgens het formulier nu niet nodig/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'form: inkoopplan ja' }));
    expect(screen.getByTestId('blocked')).toHaveTextContent('Inkoopplan (format 2640968) koppelen');
  });

  it('a map: links a folder, then lists the checklist; missing items block', async () => {
    const vg = doc({
      slug: 'rip-verzamelmap-vg',
      label: 'Verzamelmap documenten V&G',
      map: true,
      taskKey: 'Task_SamenstellenVerzamelmapVG',
      status: 'linked',
      edocs: { documentId: 'f1', documentNumber: '3600100', version: null, modified: null },
      checklist: [
        { item: 'V&G-plan ontwerpfase', present: true },
        { item: 'Risico-inventarisatie V&G', present: false },
      ],
    });
    api.rip.workspace.mockResolvedValue({
      success: true,
      data: {
        workspaceId: '77',
        folderId: null,
        items: [ITEM, { ...ITEM, id: 'f1', name: 'Aanbestedingsstukken / V&G', isFolder: true }],
      },
    });
    serve([vg]);
    const user = userEvent.setup();
    renderTask({
      id: 't5',
      processInstanceId: 'pi-5',
      taskDefinitionKey: 'Task_SamenstellenVerzamelmapVG',
    });

    // Only folders are offered for a map.
    expect(await screen.findByRole('radio', { name: /Aanbestedingsstukken \/ V&G/ })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /PSU-presentatie/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Bestand uploaden/)).not.toBeInTheDocument();

    expect(screen.getByText('Ontbreekt in de map')).toBeInTheDocument();
    expect(screen.getByTestId('blocked')).toHaveTextContent('Risico-inventarisatie V&G in de map');
    await user.click(screen.getByRole('button', { name: 'Map opnieuw controleren' }));
    expect(reload).toHaveBeenCalled();
  });
  it('a map with no folders yet: says what to do and reads the projectmap again on request', async () => {
    const vg = doc({
      slug: 'rip-verzamelmap-vg',
      label: 'Verzamelmap documenten V&G',
      map: true,
      taskKey: 'Task_SamenstellenVerzamelmapVG',
      status: 'missing',
      edocs: null,
      checklist: [{ item: 'V&G-plan ontwerpfase', present: false }],
    });
    api.rip.workspace.mockResolvedValueOnce({
      success: true,
      data: { workspaceId: '77', folderId: null, items: [ITEM] },
    });
    api.rip.workspace.mockResolvedValueOnce({
      success: true,
      data: {
        workspaceId: '77',
        folderId: null,
        items: [ITEM, { ...ITEM, id: 'f2', name: 'Verzamelmap V&G', isFolder: true }],
      },
    });
    serve([vg]);
    const user = userEvent.setup();
    renderTask({
      id: 't6',
      processInstanceId: 'pi-6',
      taskDefinitionKey: 'Task_SamenstellenVerzamelmapVG',
    });

    expect(
      await screen.findByText(/Maak in eDOCS een map aan in de projectmap en laad de lijst opnieuw/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Opnieuw laden' }));
    expect(await screen.findByRole('radio', { name: /Verzamelmap V&G/ })).toBeInTheDocument();
    expect(api.rip.workspace).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Opnieuw laden' })).not.toBeInTheDocument();
  });

  it('a document with an empty projectmap points to the upload', async () => {
    api.rip.workspace.mockResolvedValue({
      success: true,
      data: { workspaceId: '77', folderId: null, items: [] },
    });
    serve([doc({ status: 'missing', edocs: null })]);
    renderTask();
    expect(
      await screen.findByText(/Geen documenten in de projectmap. Upload hieronder een bestand/)
    ).toBeInTheDocument();
  });
});

describe('TaskCompletion — tasks without linked documents', () => {
  it('renders no block and does not hold the form back', () => {
    serve([doc({ kind: 'A', slug: 'rip-psu-report' })]);
    renderTask();
    expect(
      screen.queryByRole('heading', { name: 'Documenten bij deze taak' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Taak voltooien' })).toBeEnabled();
  });

  it('holds the form back while the documents load, and says when they fail', () => {
    mockUseInstanceDocuments.mockReturnValue({ data: null, loading: true, error: false, reload });
    const { rerender } = renderTask();
    expect(screen.getByText('Documenten laden…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Taak voltooien' })).toBeDisabled();

    mockUseInstanceDocuments.mockReturnValue({ data: null, loading: false, error: true, reload });
    rerender(<TaskCompletion task={TASK} variables={{}} onCompleted={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('konden niet worden geladen');
  });
});
