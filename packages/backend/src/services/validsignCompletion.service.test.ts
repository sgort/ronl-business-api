/**
 * Unit tests for completeSignature() — the single completion path shared by
 * the ValidSign webhook and the polling sweep. Both callers race in
 * production (the poller exists precisely because ValidSign's cloud cannot
 * reach a developer's localhost, so the webhook never fires locally); the
 * concurrency test below proves the in-flight mutex is load-bearing, not
 * decorative.
 */

jest.mock('@services/operaton.service', () => ({
  operatonService: {
    findInstanceByValidsignPackage: jest.fn(),
    completeTask: jest.fn(),
    setProcessVariables: jest.fn(),
  },
}));
jest.mock('@services/validsign.service', () => ({
  validsignService: {
    getPackageStatus: jest.fn(),
    getSignedDocumentId: jest.fn(),
    downloadSignedDocument: jest.fn(),
    downloadEvidenceSummary: jest.fn(),
  },
}));
jest.mock('@services/edocs.service', () => ({
  edocsService: {
    uploadDocument: jest.fn(),
  },
}));
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@utils/logger', () => ({
  createLogger: () => mockLogger,
}));
// The archival department now comes from configuration, not from the
// instance -- this must be mutable per-test (and reset in beforeEach) so the
// guard's fail path (an unconfigured department) can be exercised alongside
// the normal 'IVR' default.
jest.mock('@utils/config', () => ({
  config: { edocs: { department: 'IVR' } },
}));

import { completeSignature } from './validsignCompletion.service';
import { operatonService } from '@services/operaton.service';
import { validsignService } from '@services/validsign.service';
import { edocsService } from '@services/edocs.service';
import { config } from '@utils/config';

const mockFindInstance = operatonService.findInstanceByValidsignPackage as jest.Mock;
const mockCompleteTask = operatonService.completeTask as jest.Mock;
const mockSetVariables = operatonService.setProcessVariables as jest.Mock;
const mockGetPackageStatus = validsignService.getPackageStatus as jest.Mock;
const mockGetSignedDocumentId = validsignService.getSignedDocumentId as jest.Mock;
const mockDownloadSignedDocument = validsignService.downloadSignedDocument as jest.Mock;
const mockDownloadEvidenceSummary = validsignService.downloadEvidenceSummary as jest.Mock;
const mockUploadDocument = edocsService.uploadDocument as jest.Mock;

// Sane defaults for the archive path. jest.clearAllMocks() (below) resets
// call history but not these implementations, so individual tests only need
// to override what they actually vary.
mockGetSignedDocumentId.mockResolvedValue('doc-live-1');
mockDownloadSignedDocument.mockResolvedValue(Buffer.from('signed-pdf'));
mockDownloadEvidenceSummary.mockResolvedValue(Buffer.from('evidence-pdf'));
mockUploadDocument.mockResolvedValue({
  documentId: 'edocs-doc-1',
  documentNumber: 'DOC-1',
  workspaceId: 'ws-1',
});
mockCompleteTask.mockResolvedValue(undefined);
mockSetVariables.mockResolvedValue(undefined);

describe('completeSignature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.edocs.department = 'IVR';
  });

  it('archives the signed document and completes the task as approved', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      edocsWorkspaceId: 'ws-1',
      department: 'Infra',
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');

    expect(await completeSignature('pkg-1')).toBe('completed');
    expect(mockUploadDocument).toHaveBeenCalledTimes(2); // signed PDF + evidence
    // Both uploads are standalone: the workspace-ref path is broken on the DM
    // server, and RipR21Process never creates a workspace anyway, so every
    // call must pass a null workspace id -- not found.edocsWorkspaceId.
    // The department is the CONFIGURED value (config.edocs.department), not
    // the instance's `department` process variable -- that variable is no
    // longer read by this service at all.
    expect(mockUploadDocument).toHaveBeenNthCalledWith(
      1,
      null,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ department: 'IVR' })
    );
    expect(mockUploadDocument).toHaveBeenNthCalledWith(
      2,
      null,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ department: 'IVR' })
    );
    // The signed document and the evidence summary must be distinguishable
    // from each other in InfoCenter.
    const [firstCall, secondCall] = mockUploadDocument.mock.calls;
    expect(firstCall[3].docName).not.toEqual(secondCall[3].docName);
    // Resolves the signed document's id from ValidSign rather than guessing
    // one -- a wrong/hardcoded id would 404 against a live account.
    expect(mockDownloadSignedDocument).toHaveBeenCalledWith('pkg-1', 'doc-live-1');
    // A single atomic write: completeTask carries every variable, including
    // validsignStatus and the archive status, and setProcessVariables is
    // never called from this path (see the module's comment on why calling
    // both would be redundant on success and unrecoverable on failure).
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        variables: expect.objectContaining({
          validsignStatus: { value: 'completed', type: 'String' },
          validsignArchiveStatus: { value: 'ok', type: 'String' },
          approvalStatus: { value: 'approved', type: 'String' },
          validsignSignedDocNumber: { value: 'DOC-1', type: 'String' },
          validsignSignedDocId: { value: 'edocs-doc-1', type: 'String' },
        }),
      })
    );
    expect(mockSetVariables).not.toHaveBeenCalled();
  });

  it('archives with the configured department even when the instance department variable disagrees -- regression for the eDOCS UV_AFD_NAAM validation defect', async () => {
    // R2.1 instances carry department='infrastructuur', a value the DM
    // server's UV_AFD_NAAM profile field rejects (proven against the live
    // test server). On the old code this was passed straight through and
    // every archival attempt failed; it must now be ignored in favour of
    // config.edocs.department.
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      department: 'infrastructuur',
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');

    expect(await completeSignature('pkg-1')).toBe('completed');
    expect(mockUploadDocument).toHaveBeenCalledTimes(2);
    for (const call of mockUploadDocument.mock.calls) {
      expect(call[3]).toEqual(expect.objectContaining({ department: 'IVR' }));
      expect(call[3].department).not.toBe('infrastructuur');
    }
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        variables: expect.objectContaining({
          validsignArchiveStatus: { value: 'ok', type: 'String' },
        }),
      })
    );
  });

  it('completes the task as rejected when the signer declines', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
    });
    mockGetPackageStatus.mockResolvedValue('DECLINED');

    expect(await completeSignature('pkg-1')).toBe('declined');
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        variables: expect.objectContaining({
          approvalStatus: { value: 'rejected', type: 'String' },
        }),
      })
    );
  });

  it('is idempotent: a second call does nothing', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'completed',
    });
    expect(await completeSignature('pkg-1')).toBe('noop');
    expect(mockCompleteTask).not.toHaveBeenCalled();
  });

  it('does not complete the task twice when callback and poller race', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');
    const [a, b] = await Promise.all([completeSignature('pkg-1'), completeSignature('pkg-1')]);
    expect([a, b].filter((r) => r === 'completed')).toHaveLength(1);
    expect(mockCompleteTask).toHaveBeenCalledTimes(1);
  });

  it('still completes the task when archiving to eDOCS fails', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      // Present and valid, so this exercises the upload-failure catch path,
      // not the missing-instance-data guard covered separately below.
      edocsWorkspaceId: 'ws-1',
      department: 'Infra',
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');
    mockUploadDocument.mockRejectedValue(new Error('eDOCS down'));

    expect(await completeSignature('pkg-1')).toBe('completed');
    // Still one write, not two: the failed archive status rides along in the
    // same completeTask call that would otherwise have carried 'ok'.
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        variables: expect.objectContaining({
          validsignArchiveStatus: { value: 'failed', type: 'String' },
        }),
      })
    );
    expect(mockSetVariables).not.toHaveBeenCalled();
  });

  it('archives successfully when edocsWorkspaceId is missing -- RipR21Process never creates one, so this is the normal case, not an error', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      department: 'Infra',
      // edocsWorkspaceId intentionally absent -- every R2.1 instance looks
      // like this. This is the regression test for the actual defect: on the
      // old code this guard treated the missing field as an archival
      // failure and skipped the upload entirely.
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');
    // A prior test in this suite overrides mockUploadDocument to reject;
    // clearAllMocks() resets call history but not mock implementations, so
    // this must be restored explicitly rather than relying on suite order.
    mockUploadDocument.mockResolvedValue({
      documentId: 'edocs-doc-1',
      documentNumber: 'DOC-1',
      workspaceId: null,
    });

    expect(await completeSignature('pkg-1')).toBe('completed');
    expect(mockGetSignedDocumentId).toHaveBeenCalled();
    expect(mockUploadDocument).toHaveBeenCalledTimes(2);
    expect(mockUploadDocument).toHaveBeenCalledWith(
      null,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ department: 'IVR' })
    );
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        variables: expect.objectContaining({
          validsignArchiveStatus: { value: 'ok', type: 'String' },
          approvalStatus: { value: 'approved', type: 'String' },
        }),
      })
    );
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      'Archiving the signed document to eDOCS skipped: EDOCS_DEPARTMENT is not configured',
      expect.anything()
    );
  });

  // The guard used to check the instance's `department` process variable; it
  // now checks config.edocs.department instead, since that's where the
  // upload's department value actually comes from. These two tests cover its
  // pass and fail paths.
  it('archives normally when the configured department is present (guard pass path)', async () => {
    config.edocs.department = 'IVR';
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      edocsWorkspaceId: 'ws-1',
      // department instance variable intentionally absent -- the guard no
      // longer looks at it at all.
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');

    expect(await completeSignature('pkg-1')).toBe('completed');
    expect(mockUploadDocument).toHaveBeenCalledTimes(2);
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        variables: expect.objectContaining({
          validsignArchiveStatus: { value: 'ok', type: 'String' },
          approvalStatus: { value: 'approved', type: 'String' },
        }),
      })
    );
  });

  it('skips the upload and fails archiving when the configured department is empty, but still completes the task (guard fail path)', async () => {
    config.edocs.department = '';
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      edocsWorkspaceId: 'ws-1',
      department: 'Infra', // present on the instance, but no longer consulted
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');

    expect(await completeSignature('pkg-1')).toBe('completed');
    expect(mockUploadDocument).not.toHaveBeenCalled();
    expect(mockGetSignedDocumentId).not.toHaveBeenCalled();
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        variables: expect.objectContaining({
          validsignArchiveStatus: { value: 'failed', type: 'String' },
          approvalStatus: { value: 'approved', type: 'String' },
        }),
      })
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Archiving the signed document to eDOCS skipped: EDOCS_DEPARTMENT is not configured',
      expect.objectContaining({ processInstanceId: 'pi-1' })
    );
  });
});
