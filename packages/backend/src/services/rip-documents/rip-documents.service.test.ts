import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@services/operaton.service', () => ({
  operatonService: {
    getRipDocumentContext: jest.fn(),
    getOpenTasksOfInstance: jest.fn(),
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
  RipDocumentError,
  uploadDocument,
} from './rip-documents.service';

const svc = operatonService as unknown as Record<string, jest.Mock>;
const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../rip-swimlane/__fixtures__', name), 'utf8');
const R21 = fixture('RipR21Process.bpmn');
const R24 = fixture('RipR24Process.bpmn');

type Faked = 'getDocumentVersions' | 'listContents' | 'uploadDocument';
/** An EdocsService whose three used methods are jest mocks. */
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
    expect(result).toMatchObject({ edocsWorkspaceId: '77', uploadTarget: 'edocs' });
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

  it('uploads standalone while workspace uploads are off, and says so on the link', async () => {
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
