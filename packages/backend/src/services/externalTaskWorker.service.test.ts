/**
 * Unit tests for ExternalTaskWorker — the Operaton external-task worker that
 * drives eDOCS from BPMN. The rip-edocs-workspace / rip-edocs-document topics
 * call edocsService, so this is a core part of the stub->live path.
 *
 * axios and edocsService are mocked. Private handlers are exercised via a typed
 * internals view so mapping/validation/rendering can be asserted precisely.
 */

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('@services/edocs.service', () => ({
  edocsService: { ensureWorkspace: jest.fn(), uploadDocument: jest.fn() },
}));
jest.mock('@utils/config', () => ({
  config: { operaton: { baseUrl: 'http://operaton/engine-rest' } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import axios from 'axios';
import { ExternalTaskWorker } from './externalTaskWorker.service';
import { edocsService } from '@services/edocs.service';

const mockPost = (axios as unknown as { post: jest.Mock }).post;
const mockEnsure = (edocsService as unknown as { ensureWorkspace: jest.Mock }).ensureWorkspace;
const mockUpload = (edocsService as unknown as { uploadDocument: jest.Mock }).uploadDocument;

type Var = { value: unknown; type: string };
type Vars = Record<string, Var>;
type Task = { id: string; topicName: string; processInstanceId: string; variables: Vars };

type WorkerInternals = {
  running: boolean;
  poll(): Promise<void>;
  fetchAndLock(): Promise<Task[]>;
  handleTask(task: Task): Promise<void>;
  handleEnsureWorkspace(task: Task): Promise<Vars>;
  handleCreateRelaticsWorkspace(task: Task): Vars;
  handleUploadDocument(task: Task): Promise<Vars>;
  completeTask(id: string, vars: Vars): Promise<void>;
  failTask(id: string, msg: string): Promise<void>;
  renderDocumentContent(templateId: string, variables: Vars): string;
  templateIdToLabel(id: string): string;
};

const internals = (w: ExternalTaskWorker) => w as unknown as WorkerInternals;

/** Wrap plain values into Operaton's { value, type } variable envelope. */
const vars = (obj: Record<string, unknown>): Vars =>
  Object.fromEntries(Object.entries(obj).map(([k, value]) => [k, { value, type: 'String' }]));

const task = (topicName: string, variables: Record<string, unknown>): Task => ({
  id: 't-1',
  topicName,
  processInstanceId: 'pi-1',
  variables: vars(variables),
});

beforeEach(() => jest.clearAllMocks());

describe('handleEnsureWorkspace', () => {
  it('calls edocsService and maps the result into Operaton variables', async () => {
    mockEnsure.mockResolvedValue({
      workspaceId: 'ws-1',
      workspaceName: 'P-1 — Proj',
      created: true,
    });
    const out = await internals(new ExternalTaskWorker()).handleEnsureWorkspace(
      task('rip-edocs-workspace', { projectNumber: 'P-1', projectName: 'Proj' })
    );
    expect(mockEnsure).toHaveBeenCalledWith('P-1', 'Proj');
    expect(out).toEqual({
      edocsWorkspaceId: { value: 'ws-1', type: 'String' },
      edocsWorkspaceName: { value: 'P-1 — Proj', type: 'String' },
      edocsWorkspaceCreated: { value: true, type: 'Boolean' },
    });
  });

  it('throws when projectNumber/projectName are missing', async () => {
    await expect(
      internals(new ExternalTaskWorker()).handleEnsureWorkspace(task('rip-edocs-workspace', {}))
    ).rejects.toThrow(/missing required variables/);
    expect(mockEnsure).not.toHaveBeenCalled();
  });
});

describe('handleCreateRelaticsWorkspace (simulated)', () => {
  it('returns a deterministic simulated workspace flagged as simulated', () => {
    const out = internals(new ExternalTaskWorker()).handleCreateRelaticsWorkspace(
      task('rip-relatics-workspace', { projectNumber: 'RIP 2024/07', projectName: 'Gebied' })
    );
    expect(out.relaticsWorkspaceId.value).toBe('sim-relatics-RIP-2024-07');
    expect(out.relaticsWorkspaceSimulated).toEqual({ value: true, type: 'Boolean' });
  });

  it('falls back to "unknown" when projectNumber is empty', () => {
    const out = internals(new ExternalTaskWorker()).handleCreateRelaticsWorkspace(
      task('rip-relatics-workspace', {})
    );
    expect(out.relaticsWorkspaceId.value).toBe('sim-relatics-unknown');
  });
});

describe('handleUploadDocument', () => {
  const validVars = {
    edocsWorkspaceId: 'ws-1',
    projectNumber: 'P-1',
    projectName: 'Proj',
    documentTemplateId: 'rip-intake-report',
    edocsDocumentVariableName: 'intakeDoc',
  };

  it('renders content, uploads, and maps output under the configured variable name', async () => {
    mockUpload.mockResolvedValue({ documentId: 'd1', documentNumber: '555', workspaceId: 'ws-1' });

    const out = await internals(new ExternalTaskWorker()).handleUploadDocument(
      task('rip-edocs-document', validVars)
    );

    expect(out).toEqual({
      intakeDoc: { value: '555', type: 'String' },
      intakeDoc_docId: { value: 'd1', type: 'String' },
    });

    const [wsId, filename, contentB64, metadata] = mockUpload.mock.calls[0];
    expect(wsId).toBe('ws-1');
    expect(filename).toBe('rip-intake-report-P-1.txt');
    expect(metadata.docName).toContain('Intake Report');
    const decoded = Buffer.from(contentB64, 'base64').toString('utf-8');
    expect(decoded).toContain('INTAKE REPORT (Column 2)');
  });

  it('defaults the output variable name to edocsDocumentId', async () => {
    mockUpload.mockResolvedValue({ documentId: 'd1', documentNumber: '555', workspaceId: 'ws-1' });
    const out = await internals(new ExternalTaskWorker()).handleUploadDocument(
      task('rip-edocs-document', { ...validVars, edocsDocumentVariableName: undefined })
    );
    expect(out.edocsDocumentId.value).toBe('555');
    expect(out.edocsDocumentId_docId.value).toBe('d1');
  });

  it('throws when workspaceId or templateId is missing', async () => {
    await expect(
      internals(new ExternalTaskWorker()).handleUploadDocument(
        task('rip-edocs-document', { edocsWorkspaceId: 'ws-1' })
      )
    ).rejects.toThrow(/missing required variables/);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('renderDocumentContent', () => {
  const w = () => internals(new ExternalTaskWorker());
  const v = vars({ projectName: 'Proj', projectNumber: 'P-1', intakeDecisions: 'go' });

  it('renders the intake template', () => {
    expect(w().renderDocumentContent('rip-intake-report', v)).toContain('INTAKE REPORT (Column 2)');
  });
  it('renders the psu template', () => {
    expect(w().renderDocumentContent('rip-psu-report', v)).toContain('PSU REPORT (Column 3)');
  });
  it('renders the pdp template', () => {
    expect(w().renderDocumentContent('rip-pdp', v)).toContain('PRELIMINARY DESIGN PRINCIPLES');
  });
  it('falls back for an unknown template', () => {
    expect(w().renderDocumentContent('mystery', v)).toContain('No template renderer registered');
  });
});

describe('templateIdToLabel', () => {
  it('maps known ids and passes unknown ids through', () => {
    const w = internals(new ExternalTaskWorker());
    expect(w.templateIdToLabel('rip-psu-report')).toBe('PSU Report');
    expect(w.templateIdToLabel('custom-x')).toBe('custom-x');
  });
});

describe('fetchAndLock', () => {
  it('posts the fetchAndLock request and returns the tasks', async () => {
    const t = task('rip-edocs-workspace', { projectNumber: 'P-1', projectName: 'Proj' });
    mockPost.mockResolvedValue({ data: [t] });

    const result = await internals(new ExternalTaskWorker()).fetchAndLock();

    expect(result).toEqual([t]);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('http://operaton/engine-rest/external-task/fetchAndLock');
    expect(body.topics.map((x: { topicName: string }) => x.topicName)).toEqual([
      'rip-edocs-workspace',
      'rip-relatics-workspace',
      'rip-edocs-document',
    ]);
  });

  it('returns [] when the response has no data', async () => {
    mockPost.mockResolvedValue({ data: undefined });
    await expect(internals(new ExternalTaskWorker()).fetchAndLock()).resolves.toEqual([]);
  });
});

describe('handleTask dispatch', () => {
  it('completes the task on success', async () => {
    mockEnsure.mockResolvedValue({ workspaceId: 'ws-1', workspaceName: 'n', created: false });
    mockPost.mockResolvedValue({}); // completeTask
    await internals(new ExternalTaskWorker()).handleTask(
      task('rip-edocs-workspace', { projectNumber: 'P-1', projectName: 'Proj' })
    );
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('http://operaton/engine-rest/external-task/t-1/complete');
    expect(body.variables.edocsWorkspaceId.value).toBe('ws-1');
  });

  it('completes the simulated relatics topic', async () => {
    mockPost.mockResolvedValue({}); // completeTask
    await internals(new ExternalTaskWorker()).handleTask(
      task('rip-relatics-workspace', { projectNumber: 'P-1', projectName: 'Proj' })
    );
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('http://operaton/engine-rest/external-task/t-1/complete');
    expect(body.variables.relaticsWorkspaceSimulated.value).toBe(true);
  });

  it('reports failure to Operaton on an unknown topic', async () => {
    mockPost.mockResolvedValue({}); // failTask
    await internals(new ExternalTaskWorker()).handleTask(task('nope', {}));
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('http://operaton/engine-rest/external-task/t-1/failure');
    expect(body.errorMessage).toMatch(/Unknown topic/);
  });

  it('reports failure when a handler throws (missing variables)', async () => {
    mockPost.mockResolvedValue({});
    await internals(new ExternalTaskWorker()).handleTask(task('rip-edocs-workspace', {}));
    const [url] = mockPost.mock.calls[0];
    expect(url).toBe('http://operaton/engine-rest/external-task/t-1/failure');
  });
});

describe('failTask resilience', () => {
  it('swallows an error when reporting failure itself fails', async () => {
    mockPost.mockRejectedValue(new Error('operaton down'));
    await expect(
      internals(new ExternalTaskWorker()).failTask('t-1', 'original error')
    ).resolves.toBeUndefined();
  });
});

describe('lifecycle', () => {
  it('start() begins polling once and is idempotent; stop() halts', () => {
    const w = new ExternalTaskWorker();
    const pollSpy = jest.spyOn(internals(w), 'poll').mockResolvedValue(undefined);

    w.start();
    expect(internals(w).running).toBe(true);
    expect(pollSpy).toHaveBeenCalledTimes(1);

    w.start(); // already running
    expect(pollSpy).toHaveBeenCalledTimes(1);

    w.stop();
    expect(internals(w).running).toBe(false);
  });
});
