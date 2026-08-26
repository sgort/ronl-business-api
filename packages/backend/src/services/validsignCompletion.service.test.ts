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

import { completeSignature } from './validsignCompletion.service';
import { operatonService } from '@services/operaton.service';
import { validsignService } from '@services/validsign.service';
import { edocsService } from '@services/edocs.service';

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
  beforeEach(() => jest.clearAllMocks());

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
        }),
      })
    );
    expect(mockSetVariables).not.toHaveBeenCalled();
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

  it('skips the upload and fails archiving when edocsWorkspaceId is missing, but still completes the task', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      department: 'Infra',
      // edocsWorkspaceId intentionally absent.
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
    const [, meta] = mockLogger.error.mock.calls.find(
      (call) =>
        call[0] ===
        'Archiving the signed document to eDOCS skipped: required instance data is missing'
    )!;
    expect(meta).toMatchObject({ processInstanceId: 'pi-1', missingFields: ['edocsWorkspaceId'] });
  });

  it('skips the upload and fails archiving when department is missing, but still completes the task', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      edocsWorkspaceId: 'ws-1',
      // department intentionally absent.
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
    const [, meta] = mockLogger.error.mock.calls.find(
      (call) =>
        call[0] ===
        'Archiving the signed document to eDOCS skipped: required instance data is missing'
    )!;
    expect(meta).toMatchObject({ processInstanceId: 'pi-1', missingFields: ['department'] });
  });
});
