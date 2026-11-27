import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@services/operaton.service', () => ({
  operatonService: {
    getRipDocumentContext: jest.fn(),
    getOpenTasksOfInstance: jest.fn(),
    getProjectWorkspaceId: jest.fn(),
    getProjectVariables: jest.fn().mockResolvedValue({}),
    getProcessDefinitionXml: jest.fn(),
    setProcessVariables: jest.fn(),
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@utils/config', () => ({
  config: {
    edocs: {
      department: 'IVR',
      workspaceUploadEnabled: false,
      linkedUploadForm: '',
      linkedUploadMaxBytes: 1024,
    },
  },
}));

import { operatonService } from '@services/operaton.service';
import type { EdocsService } from '@services/edocs.service';
import { config } from '@utils/config';
import {
  checklistPresence,
  checkTaskCompletion,
  linkDocument,
  listInstanceDocuments,
  listInstanceWorkspace,
  resolveWorkspaceId,
  RipDocumentError,
  uploadDocument,
} from './rip-documents.service';

const svc = operatonService as unknown as Record<string, jest.Mock>;
const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../rip-swimlane/__fixtures__', name), 'utf8');
const R21 = fixture('RipR21Process.bpmn');
const R24 = fixture('RipR24Process.bpmn');

type Faked =
  'addReference' | 'getDocumentVersions' | 'listContents' | 'uploadDocument' | 'findWorkspace';
/** An EdocsService whose used methods are jest mocks. */
type FakeEdocs = EdocsService & Record<Faked, jest.Mock>;

const edocs = () =>
  ({
    getDocumentVersions: jest.fn().mockResolvedValue([
      { id: 'v1', version: '1' },
      { id: 'v3', version: '3' },
      { id: 'v2', version: '2' },
    ]),
    listContents: jest.fn(),
    uploadDocument: jest.fn(),
    findWorkspace: jest.fn().mockResolvedValue(null),
    addReference: jest.fn().mockResolvedValue(undefined),
  }) as unknown as FakeEdocs;

const context = (
  bpmnXml: string,
  variables: Record<string, unknown> = {},
  activities: unknown[] = []
) => ({
  processDefinitionId: 'def',
  bpmnXml,
  variables: { municipality: 'flevoland', edocsWorkspaceId: '77', ...variables },
  activities,
});
const item = (over: Record<string, unknown> = {}) => ({
  id: '501',
  name: 'PSU-presentatie 25008',
  documentNumber: '3500501',
  isFolder: false,
  version: '1',
  modified: null,
  author: null,
  ...over,
});
const PL = { userId: 'u-pl', roles: ['caseworker', 'rip-projectleider'] };
const allow = () => true;

beforeEach(() => {
  jest.clearAllMocks();
  (config.edocs as { workspaceUploadEnabled: boolean }).workspaceUploadEnabled = false;
});

describe('checklistPresence', () => {
  it('matches item text inside document names, case-insensitively, ignoring folders', () => {
    expect(
      checklistPresence(
        ['V&G-plan ontwerpfase', 'Risico-inventarisatie V&G'],
        [
          item({ name: '25008 — v&g-PLAN ontwerpfase v2' }),
          item({ name: 'Risico-inventarisatie V&G', isFolder: true }),
        ]
      )
    ).toEqual([
      { item: 'V&G-plan ontwerpfase', present: true },
      { item: 'Risico-inventarisatie V&G', present: false },
    ]);
  });
});

describe('listInstanceDocuments', () => {
  it('reads the latest version of each linked document, once', async () => {
    svc.getRipDocumentContext.mockResolvedValue(
      context(R21, {
        'linkedDoc_rip-psu-presentatie': JSON.stringify({
          documentId: '501',
          documentNumber: '3500501',
        }),
      })
    );
    const e = edocs();
    const result = await listInstanceDocuments('pi', e);
    expect(e.getDocumentVersions).toHaveBeenCalledTimes(1);
    expect(result.documents.find((d) => d.slug === 'rip-psu-presentatie')?.edocs).toMatchObject({
      documentNumber: '3500501',
      version: '3',
    });
    expect(result).toMatchObject({ edocsWorkspaceId: '77', uploadTarget: 'workspace' });
  });

  it('answers without versions when eDOCS fails or there is no identity', async () => {
    svc.getRipDocumentContext.mockResolvedValue(
      context(R21, { 'linkedDoc_rip-psu-presentatie': JSON.stringify({ documentId: '501' }) })
    );
    const e = edocs();
    e.getDocumentVersions.mockRejectedValue(new Error('down'));
    const failed = await listInstanceDocuments('pi', e);
    expect(
      failed.documents.find((d) => d.slug === 'rip-psu-presentatie')?.edocs?.version
    ).toBeNull();
    const none = await listInstanceDocuments('pi', null);
    expect(none.documents.find((d) => d.slug === 'rip-psu-presentatie')?.status).toBe('linked');
  });

  it('checks a linked map against its checklist', async () => {
    svc.getRipDocumentContext.mockResolvedValue(
      context(R24, {
        'linkedDoc_rip-verzamelmap-vg': JSON.stringify({ documentId: 'f1', map: true }),
      })
    );
    const e = edocs();
    e.listContents.mockResolvedValue([item({ name: 'V&G-plan ontwerpfase' })]);
    const result = await listInstanceDocuments('pi', e);
    expect(e.listContents).toHaveBeenCalledWith('folder', 'f1');
    expect(result.documents.find((d) => d.slug === 'rip-verzamelmap-vg')?.checklist).toEqual([
      { item: 'V&G-plan ontwerpfase', present: true },
      { item: 'Risico-inventarisatie V&G', present: false },
      { item: 'Aanstelling V&G-coördinator ontwerpfase', present: false },
    ]);
  });
});

describe('listInstanceWorkspace', () => {
  it('lists the workspace, or a folder in it', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21));
    const e = edocs();
    e.listContents.mockResolvedValue([]);
    await listInstanceWorkspace('pi', e);
    expect(e.listContents).toHaveBeenLastCalledWith('workspace', '77');
    await listInstanceWorkspace('pi', e, 'f9');
    expect(e.listContents).toHaveBeenLastCalledWith('folder', 'f9');
  });

  it('409 without a workspace', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21, { edocsWorkspaceId: '—' }));
    await expect(listInstanceWorkspace('pi', edocs())).rejects.toMatchObject({
      status: 409,
      code: 'NO_PROJECT_WORKSPACE',
    });
  });
});

describe('linkDocument', () => {
  const open = (...keys: string[]) =>
    svc.getOpenTasksOfInstance.mockResolvedValue(
      keys.map((k) => ({ id: `t-${k}`, taskDefinitionKey: k, name: k }))
    );

  beforeEach(() => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21));
    open('Task_UitvoerenPSU');
  });

  it('links an item of the workspace and writes both variables', async () => {
    const e = edocs();
    e.listContents.mockResolvedValue([item()]);
    const result = await linkDocument('pi', 'rip-psu-presentatie', '3500501', PL, e, allow);
    expect(result?.link).toMatchObject({
      documentId: '501',
      documentNumber: '3500501',
      name: 'PSU-presentatie 25008',
      linkedBy: 'u-pl',
    });
    const written = svc.setProcessVariables.mock.calls[0][1];
    expect(Object.keys(written)).toEqual([
      'linkedDoc_rip-psu-presentatie',
      'linkedDocNumber_rip-psu-presentatie',
    ]);
    expect(written['linkedDocNumber_rip-psu-presentatie']).toEqual({
      value: '3500501',
      type: 'String',
    });
  });

  it('decides the tenant before anything else, and writes nothing when refused', async () => {
    const authorize = jest.fn().mockReturnValue(false);
    const e = edocs();
    const result = await linkDocument('pi', 'rip-unknown', '1', PL, e, authorize);
    expect(result).toBeNull();
    expect(authorize).toHaveBeenCalledWith('flevoland');
    expect(svc.getOpenTasksOfInstance).not.toHaveBeenCalled();
    expect(e.listContents).not.toHaveBeenCalled();
    expect(svc.setProcessVariables).not.toHaveBeenCalled();
  });

  it.each([
    ['an undeclared slug', 'rip-onbekend', PL, 404, 'UNKNOWN_DOCUMENT'],
    [
      'a caller outside the candidate groups',
      'rip-psu-presentatie',
      { userId: 'x', roles: ['rip-ao'] },
      403,
      'NOT_CANDIDATE',
    ],
  ])('refuses %s', async (_what, slug, caller, status, code) => {
    await expect(linkDocument('pi', slug, '1', caller, edocs(), allow)).rejects.toMatchObject({
      status,
      code,
    });
    expect(svc.setProcessVariables).not.toHaveBeenCalled();
  });

  it('refuses when the producing task is not open', async () => {
    open('Task_HoudenOverlegVO');
    await expect(
      linkDocument('pi', 'rip-psu-presentatie', '1', PL, edocs(), allow)
    ).rejects.toMatchObject({ status: 409, code: 'DOCUMENT_TASK_NOT_OPEN' });
  });

  it('refuses a document that is not in the workspace', async () => {
    const e = edocs();
    e.listContents.mockResolvedValue([item({ id: '999', documentNumber: '999' })]);
    await expect(
      linkDocument('pi', 'rip-psu-presentatie', '501', PL, e, allow)
    ).rejects.toMatchObject({
      status: 422,
      code: 'DOCUMENT_NOT_IN_WORKSPACE',
    });
  });

  it('wants a folder for a map and a document otherwise', async () => {
    const e = edocs();
    e.listContents.mockResolvedValue([item({ isFolder: true })]);
    await expect(
      linkDocument('pi', 'rip-psu-presentatie', '501', PL, e, allow)
    ).rejects.toMatchObject({
      code: 'DOCUMENT_EXPECTED',
    });

    svc.getRipDocumentContext.mockResolvedValue(context(R24));
    open('Task_SamenstellenVerzamelmapVG');
    e.listContents.mockResolvedValue([item({ isFolder: false })]);
    await expect(
      linkDocument('pi', 'rip-verzamelmap-vg', '501', PL, e, allow)
    ).rejects.toMatchObject({
      code: 'MAP_EXPECTED',
    });
    e.listContents.mockResolvedValue([item({ isFolder: true })]);
    const ok = await linkDocument('pi', 'rip-verzamelmap-vg', '501', PL, e, allow);
    expect(ok?.link.map).toBe(true);
  });
});

describe('uploadDocument', () => {
  const file = { filename: 'PSU.pptx', contentBase64: Buffer.from('pptx').toString('base64') };

  beforeEach(() => {
    svc.getRipDocumentContext.mockResolvedValue(
      context(R21, { projectNumber: '25008', projectName: 'N23 Fietspad' })
    );
    svc.getOpenTasksOfInstance.mockResolvedValue([
      { id: 't', taskDefinitionKey: 'Task_UitvoerenPSU', name: 'x' },
    ]);
  });

  it('uploads standalone without a projectmap, and says so on the link', async () => {
    svc.getRipDocumentContext.mockResolvedValue(
      context(R21, { projectNumber: '25008', projectName: 'N23 Fietspad', edocsWorkspaceId: '' })
    );
    const e = edocs();
    e.uploadDocument.mockResolvedValue({
      documentId: 'd1',
      documentNumber: '3500777',
      workspaceId: null,
    });
    const result = await uploadDocument('pi', 'rip-psu-presentatie', file, PL, e, allow);
    expect(e.uploadDocument).toHaveBeenCalledWith(null, 'PSU.pptx', file.contentBase64, {
      docName: '25008 — PSU-presentatie — N23 Fietspad',
      department: 'IVR',
    });
    expect(result?.link).toMatchObject({
      documentNumber: '3500777',
      // The name eDOCS gives it, not the file name on the person's disk.
      name: '25008 — PSU-presentatie — N23 Fietspad',
      uploadedVia: 'ronl',
      inWorkspace: false,
    });
  });

  it('uploads into the workspace once the flag is on', async () => {
    (config.edocs as { workspaceUploadEnabled: boolean }).workspaceUploadEnabled = true;
    const e = edocs();
    e.uploadDocument.mockResolvedValue({
      documentId: 'd1',
      documentNumber: '1',
      workspaceId: '77',
    });
    const result = await uploadDocument('pi', 'rip-psu-presentatie', file, PL, e, allow);
    expect(e.uploadDocument.mock.calls[0][0]).toBe('77');
    expect(result?.link.inWorkspace).toBe(true);
  });

  it.each([
    ['an empty file', { filename: 'a', contentBase64: '' }, 400, 'EMPTY_FILE'],
    [
      'a file over the limit',
      { filename: 'a', contentBase64: Buffer.alloc(2048).toString('base64') },
      413,
      'FILE_TOO_LARGE',
    ],
  ])('refuses %s', async (_what, f, status, code) => {
    await expect(
      uploadDocument('pi', 'rip-psu-presentatie', f, PL, edocs(), allow)
    ).rejects.toMatchObject({
      status,
      code,
    });
  });

  it('refuses to upload a map', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R24));
    svc.getOpenTasksOfInstance.mockResolvedValue([
      { id: 't', taskDefinitionKey: 'Task_SamenstellenVerzamelmapVG', name: 'x' },
    ]);
    await expect(
      uploadDocument('pi', 'rip-verzamelmap-vg', file, PL, edocs(), allow)
    ).rejects.toMatchObject({
      code: 'MAP_UPLOAD_UNSUPPORTED',
    });
  });

  it('is a RipDocumentError the route can map', async () => {
    await expect(
      uploadDocument(
        'pi',
        'rip-psu-presentatie',
        { filename: 'a', contentBase64: '' },
        PL,
        edocs(),
        allow
      )
    ).rejects.toBeInstanceOf(RipDocumentError);
  });
});

describe('checkTaskCompletion', () => {
  it('reads nothing more for a task without documents', async () => {
    svc.getProcessDefinitionXml.mockResolvedValue(R24);
    const result = await checkTaskCompletion(
      {
        processDefinitionId: 'd',
        processInstanceId: 'pi',
        taskDefinitionKey: 'Task_OpdrachtExternIB',
      },
      {},
      null
    );
    expect(result).toEqual({ missing: [], variables: {} });
    expect(svc.getRipDocumentContext).not.toHaveBeenCalled();
  });

  it('reads nothing more for a task with only generated documents', async () => {
    svc.getProcessDefinitionXml.mockResolvedValue(R21);
    await checkTaskCompletion(
      {
        processDefinitionId: 'd',
        processInstanceId: 'pi',
        taskDefinitionKey: 'Task_AanvullenProjectplan2',
      },
      {},
      null
    );
    expect(svc.getRipDocumentContext).not.toHaveBeenCalled();
  });

  it('checks a map task against the folder content', async () => {
    svc.getProcessDefinitionXml.mockResolvedValue(R24);
    svc.getRipDocumentContext.mockResolvedValue(
      context(R24, {
        'linkedDoc_rip-verzamelmap-vg': JSON.stringify({ documentId: 'f1', map: true }),
      })
    );
    const e = edocs();
    e.listContents.mockResolvedValue([
      item({ name: 'V&G-plan ontwerpfase' }),
      item({ name: 'Risico-inventarisatie V&G' }),
    ]);
    const result = await checkTaskCompletion(
      {
        processDefinitionId: 'd',
        processInstanceId: 'pi',
        taskDefinitionKey: 'Task_SamenstellenVerzamelmapVG',
      },
      {},
      e
    );
    expect(result.missing).toEqual([
      {
        slug: 'rip-verzamelmap-vg',
        what: 'checklist',
        label: 'Verzamelmap documenten V&G: Aanstelling V&G-coördinator ontwerpfase',
      },
    ]);
  });
});

describe('failure paths', () => {
  const PSU_LINK = { 'linkedDoc_rip-psu-presentatie': JSON.stringify({ documentId: '501' }) };

  it('reports no version for a document without versions, and passes the edit date on', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21, PSU_LINK));
    const e = edocs();
    e.getDocumentVersions.mockResolvedValueOnce([]);
    const none = await listInstanceDocuments('pi', e);
    expect(none.documents.find((d) => d.slug === 'rip-psu-presentatie')?.edocs?.version).toBeNull();

    e.getDocumentVersions.mockResolvedValueOnce([
      { id: 'v1', version: '1', modified: '2026-11-20 10:00:00 UTC' },
    ]);
    const one = await listInstanceDocuments('pi', e);
    expect(one.documents.find((d) => d.slug === 'rip-psu-presentatie')?.edocs).toMatchObject({
      version: '1',
      modified: '2026-11-20 10:00:00 UTC',
    });
  });

  it('survives a non-Error rejection from eDOCS', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21, PSU_LINK));
    const e = edocs();
    e.getDocumentVersions.mockRejectedValue('socket hang up');
    const result = await listInstanceDocuments('pi', e);
    expect(
      result.documents.find((d) => d.slug === 'rip-psu-presentatie')?.edocs?.version
    ).toBeNull();
  });

  it('leaves the checklist unchecked when the linked map cannot be listed', async () => {
    svc.getRipDocumentContext.mockResolvedValue(
      context(R24, {
        'linkedDoc_rip-verzamelmap-vg': JSON.stringify({ documentId: 'f1', map: true }),
      })
    );
    const e = edocs();
    e.listContents.mockRejectedValueOnce(new Error('403'));
    const viaError = await listInstanceDocuments('pi', e);
    expect(
      viaError.documents
        .find((d) => d.slug === 'rip-verzamelmap-vg')
        ?.checklist?.every((c) => !c.present)
    ).toBe(true);
    e.listContents.mockRejectedValueOnce('timeout');
    await expect(listInstanceDocuments('pi', e)).resolves.toBeDefined();
  });

  it('a map not linked yet is not listed', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R24));
    const e = edocs();
    await listInstanceDocuments('pi', e);
    expect(e.listContents).not.toHaveBeenCalled();
  });

  it('linking without a projectmap answers 409', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21, { edocsWorkspaceId: '' }));
    svc.getOpenTasksOfInstance.mockResolvedValue([
      { id: 't', taskDefinitionKey: 'Task_UitvoerenPSU', name: 'x' },
    ]);
    await expect(
      linkDocument('pi', 'rip-psu-presentatie', '1', PL, edocs(), allow)
    ).rejects.toMatchObject({ status: 409, code: 'NO_PROJECT_WORKSPACE' });
  });

  it('uploading into the projectmap needs one', async () => {
    (config.edocs as { workspaceUploadEnabled: boolean }).workspaceUploadEnabled = true;
    svc.getRipDocumentContext.mockResolvedValue(context(R21, { edocsWorkspaceId: undefined }));
    svc.getOpenTasksOfInstance.mockResolvedValue([
      { id: 't', taskDefinitionKey: 'Task_UitvoerenPSU', name: 'x' },
    ]);
    await expect(
      uploadDocument(
        'pi',
        'rip-psu-presentatie',
        { filename: 'a.pptx', contentBase64: Buffer.from('x').toString('base64') },
        PL,
        edocs(),
        allow
      )
    ).rejects.toMatchObject({ status: 409, code: 'NO_PROJECT_WORKSPACE' });
  });

  it('upload refuses another tenant before checking anything', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21));
    const e = edocs();
    const result = await uploadDocument(
      'pi',
      'rip-psu-presentatie',
      { filename: 'a', contentBase64: 'eA==' },
      PL,
      e,
      () => false
    );
    expect(result).toBeNull();
    expect(e.uploadDocument).not.toHaveBeenCalled();
  });

  it('names an upload after the slug alone when the project has no number or name', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21));
    svc.getOpenTasksOfInstance.mockResolvedValue([
      { id: 't', taskDefinitionKey: 'Task_UitvoerenPSU', name: 'x' },
    ]);
    (config.edocs as { linkedUploadForm: string }).linkedUploadForm = 'D_RIP';
    const e = edocs();
    e.uploadDocument.mockResolvedValue({ documentId: 'd', documentNumber: '1', workspaceId: null });
    await uploadDocument(
      'pi',
      'rip-psu-presentatie',
      { filename: 'a.pptx', contentBase64: 'eA==' },
      PL,
      e,
      allow
    );
    expect(e.uploadDocument.mock.calls[0][3]).toEqual({
      docName: 'PSU-presentatie',
      department: 'IVR',
      formName: 'D_RIP',
    });
    (config.edocs as { linkedUploadForm: string }).linkedUploadForm = '';
  });
});

describe('resolveWorkspaceId — the projectmap across phases', () => {
  const ctx = (variables: Record<string, unknown>, businessKey: string | null = 'flevoland-1') => ({
    businessKey,
    variables,
  });

  it('takes the workspace on the instance first, looking nothing up', async () => {
    const e = edocs();
    await expect(resolveWorkspaceId(ctx({ edocsWorkspaceId: '77' }), e)).resolves.toEqual({
      workspaceId: '77',
      recorded: true,
    });
    expect(svc.getProjectWorkspaceId).not.toHaveBeenCalled();
    expect(e.findWorkspace).not.toHaveBeenCalled();
  });

  it('then the one an earlier phase of the project recorded', async () => {
    svc.getProjectWorkspaceId.mockResolvedValue('88');
    const e = edocs();
    await expect(resolveWorkspaceId(ctx({ projectNumber: 'P-1' }), e)).resolves.toEqual({
      workspaceId: '88',
      recorded: false,
    });
    expect(svc.getProjectWorkspaceId).toHaveBeenCalledWith('flevoland-1');
    expect(e.findWorkspace).not.toHaveBeenCalled();
  });

  it('then an eDOCS search by project number', async () => {
    svc.getProjectWorkspaceId.mockResolvedValue(null);
    const e = edocs();
    e.findWorkspace.mockResolvedValue({ workspaceId: '99', workspaceName: 'P-1' });
    await expect(resolveWorkspaceId(ctx({ projectNumber: 'P-1' }), e)).resolves.toEqual({
      workspaceId: '99',
      recorded: false,
    });
    expect(e.findWorkspace).toHaveBeenCalledWith('P-1');
  });

  it('finds nothing without a businessKey, an eDOCS client or a project number', async () => {
    await expect(resolveWorkspaceId(ctx({ projectNumber: 'P-1' }, null), null)).resolves.toEqual({
      workspaceId: null,
      recorded: false,
    });
    expect(svc.getProjectWorkspaceId).not.toHaveBeenCalled();
    const e = edocs();
    svc.getProjectWorkspaceId.mockResolvedValue(null);
    await resolveWorkspaceId(ctx({}), e);
    expect(e.findWorkspace).not.toHaveBeenCalled();
  });

  it('counts a failing lookup as no workspace', async () => {
    svc.getProjectWorkspaceId.mockRejectedValue(new Error('engine down'));
    await expect(resolveWorkspaceId(ctx({ projectNumber: 'P-1' }), edocs())).resolves.toEqual({
      workspaceId: null,
      recorded: false,
    });
    svc.getProjectWorkspaceId.mockRejectedValue('socket hang up');
    await expect(resolveWorkspaceId(ctx({}), null)).resolves.toMatchObject({ workspaceId: null });
  });

  it('linking in a later phase finds the map and records it on the instance', async () => {
    svc.getRipDocumentContext.mockResolvedValue({
      ...context(R21, { edocsWorkspaceId: '' }),
      businessKey: 'flevoland-1',
    });
    svc.getOpenTasksOfInstance.mockResolvedValue([
      { id: 't', taskDefinitionKey: 'Task_UitvoerenPSU', name: 'x' },
    ]);
    svc.getProjectWorkspaceId.mockResolvedValue('88');
    const e = edocs();
    e.listContents.mockResolvedValue([item()]);
    await linkDocument('pi', 'rip-psu-presentatie', '501', PL, e, allow);
    expect(e.listContents).toHaveBeenCalledWith('workspace', '88');
    expect(svc.setProcessVariables.mock.calls[0][1].edocsWorkspaceId).toEqual({
      value: '88',
      type: 'String',
    });
  });

  it('the documents list reports the workspace it found', async () => {
    svc.getRipDocumentContext.mockResolvedValue({
      ...context(R21, { edocsWorkspaceId: '' }),
      businessKey: 'flevoland-1',
    });
    svc.getProjectWorkspaceId.mockResolvedValue('88');
    await expect(listInstanceDocuments('pi', null)).resolves.toMatchObject({
      edocsWorkspaceId: '88',
    });
  });

  it('uploading into the projectmap uses the map an earlier phase recorded', async () => {
    (config.edocs as { workspaceUploadEnabled: boolean }).workspaceUploadEnabled = true;
    svc.getRipDocumentContext.mockResolvedValue({
      ...context(R21, { edocsWorkspaceId: '' }),
      businessKey: 'flevoland-1',
    });
    svc.getOpenTasksOfInstance.mockResolvedValue([
      { id: 't', taskDefinitionKey: 'Task_UitvoerenPSU', name: 'x' },
    ]);
    svc.getProjectWorkspaceId.mockResolvedValue('88');
    const e = edocs();
    e.uploadDocument.mockResolvedValue({ documentId: 'd', documentNumber: '1', workspaceId: '88' });
    await uploadDocument(
      'pi',
      'rip-psu-presentatie',
      { filename: 'a', contentBase64: 'eA==' },
      PL,
      e,
      allow
    );
    expect(e.uploadDocument.mock.calls[0][0]).toBe('88');
    expect(svc.setProcessVariables.mock.calls[0][1].edocsWorkspaceId).toEqual({
      value: '88',
      type: 'String',
    });
  });
});

describe('uploadDocument — filing into the projectmap by reference', () => {
  const file = { filename: 'PSU.pptx', contentBase64: Buffer.from('pptx').toString('base64') };
  const open = () =>
    svc.getOpenTasksOfInstance.mockResolvedValue([
      { id: 't', taskDefinitionKey: 'Task_UitvoerenPSU', name: 'x' },
    ]);

  it('uploads standalone, then files the document into the projectmap', async () => {
    svc.getRipDocumentContext.mockResolvedValue(
      context(R21, { edocsWorkspaceName: 'RIP21-TEST001' })
    );
    open();
    const e = edocs();
    e.uploadDocument.mockResolvedValue({
      documentId: '3350335',
      documentNumber: '3350335',
      workspaceId: null,
    });
    const result = await uploadDocument('pi', 'rip-psu-presentatie', file, PL, e, allow);
    expect(e.uploadDocument.mock.calls[0][0]).toBeNull();
    expect(e.addReference).toHaveBeenCalledWith('3350335', '77', 'RIP21-TEST001');
    expect(result?.link.inWorkspace).toBe(true);
  });

  it('keeps the upload when filing fails, saying it is not in the map', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21));
    open();
    const e = edocs();
    e.uploadDocument.mockResolvedValue({ documentId: 'd', documentNumber: '1', workspaceId: null });
    e.addReference.mockRejectedValue(new Error('500'));
    const result = await uploadDocument('pi', 'rip-psu-presentatie', file, PL, e, allow);
    expect(e.addReference).toHaveBeenCalledWith('d', '77', '77');
    expect(result?.link).toMatchObject({ documentNumber: '1', inWorkspace: false });
    expect(svc.setProcessVariables).toHaveBeenCalled();
  });

  it('survives a non-Error failure of the filing call too', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21));
    open();
    const e = edocs();
    e.uploadDocument.mockResolvedValue({ documentId: 'd', documentNumber: '1', workspaceId: null });
    e.addReference.mockRejectedValue('socket hang up');
    await expect(
      uploadDocument('pi', 'rip-psu-presentatie', file, PL, e, allow)
    ).resolves.toMatchObject({ link: { inWorkspace: false } });
  });

  it('files nothing when the project has no map', async () => {
    svc.getRipDocumentContext.mockResolvedValue(context(R21, { edocsWorkspaceId: '' }));
    open();
    svc.getProjectWorkspaceId.mockResolvedValue(null);
    const e = edocs();
    e.uploadDocument.mockResolvedValue({ documentId: 'd', documentNumber: '1', workspaceId: null });
    const result = await uploadDocument('pi', 'rip-psu-presentatie', file, PL, e, allow);
    expect(e.addReference).not.toHaveBeenCalled();
    expect(result?.link.inWorkspace).toBe(false);
  });

  it('reports uploads as reaching the map only when the project has one', async () => {
    svc.getRipDocumentContext.mockResolvedValue({
      ...context(R21, { edocsWorkspaceId: '' }),
      businessKey: null,
    });
    await expect(listInstanceDocuments('pi', null)).resolves.toMatchObject({
      uploadTarget: 'edocs',
    });
  });
});

describe('listInstanceDocuments — prefill from earlier phases', () => {
  it('reads the values R2.4 prefills from, from the project, leaving itself out', async () => {
    svc.getRipDocumentContext.mockResolvedValue({ ...context(R24), businessKey: 'flevoland-1' });
    svc.getProjectVariables.mockResolvedValue({
      raming_totaal: 40000,
      beschikbaarProjectkrediet: 60000,
    });
    const result = await listInstanceDocuments('pi-24', null);
    expect(svc.getProjectVariables).toHaveBeenCalledWith(
      'flevoland-1',
      expect.arrayContaining(['raming_totaal', 'beschikbaarProjectkrediet']),
      'pi-24'
    );
    expect(result.documents.find((d) => d.slug === 'rip-projectraming-do')?.prefill).toMatchObject({
      totaal: 40000,
    });
    expect(result.kredietChecks[0].kredietPrefill).toBe(60000);
  });

  it('asks nothing without a businessKey, and prefills nothing when the lookup fails', async () => {
    svc.getRipDocumentContext.mockResolvedValue({ ...context(R24), businessKey: null });
    await listInstanceDocuments('pi-24', null);
    expect(svc.getProjectVariables).not.toHaveBeenCalled();

    svc.getRipDocumentContext.mockResolvedValue({ ...context(R24), businessKey: 'flevoland-1' });
    svc.getProjectVariables.mockRejectedValue(new Error('engine down'));
    const failed = await listInstanceDocuments('pi-24', null);
    expect(failed.documents.find((d) => d.slug === 'rip-projectraming-do')?.prefill).toBeNull();
    svc.getProjectVariables.mockRejectedValue('socket hang up');
    await expect(listInstanceDocuments('pi-24', null)).resolves.toBeDefined();
  });
});
