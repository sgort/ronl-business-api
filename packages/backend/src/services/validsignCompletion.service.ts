import type { OperatonVariable } from '@ronl/shared';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';
import { edocsService } from '@services/edocs.service';
import { operatonService } from '@services/operaton.service';
import { validsignService } from '@services/validsign.service';

const logger = createLogger('validsign-completion');

/**
 * One in-flight completion per package. The status variable alone is not
 * enough: the read and the write are not atomic, so a simultaneous callback
 * and poll can both pass the gate and complete the Operaton task twice.
 */
const inFlight = new Map<string, Promise<'completed' | 'declined' | 'noop'>>();

export async function completeSignature(
  packageId: string
): Promise<'completed' | 'declined' | 'noop'> {
  if (inFlight.has(packageId)) {
    // Another call for this package (the webhook or the poller) is already
    // running doComplete(). Deliberately do NOT await and adopt its result:
    // this call did nothing, so it reports 'noop' and returns immediately.
    // The in-flight run itself is untouched and still completes normally.
    return 'noop';
  }

  const run = doComplete(packageId).finally(() => inFlight.delete(packageId));
  inFlight.set(packageId, run);
  return run;
}

async function doComplete(packageId: string): Promise<'completed' | 'declined' | 'noop'> {
  const found = await operatonService.findInstanceByValidsignPackage(packageId);
  if (!found) {
    // A stale retry for a package we no longer track. Not an error.
    logger.info('Completion for an unknown package ignored', { packageId });
    return 'noop';
  }
  if (found.status === 'completed' || found.status === 'declined') return 'noop';

  const status = await validsignService.getPackageStatus(packageId);
  if (status !== 'COMPLETED' && status !== 'DECLINED') return 'noop';

  const approved = status === 'COMPLETED';
  const variables: Record<string, OperatonVariable> = {
    validsignStatus: { value: approved ? 'completed' : 'declined', type: 'String' },
    validsignSignedAt: { value: new Date().toISOString(), type: 'String' },
  };

  if (approved) {
    // The eDOCS upload needs a department -- it maps to the DM server's
    // UV_AFD_NAAM profile field, which is validated against a real
    // department list, and the DM server rejects document creation without
    // it. This is a property of the eDOCS environment, not of the process
    // instance: a provincial-department value like R2.1's
    // department='infrastructuur' process variable has no reason to appear
    // in a DM server's profile list (it doesn't -- that was the original bug
    // here), so the department is sourced from configuration instead. The
    // guard below now checks that configured value rather than the instance
    // variable: it still exists to avoid sending a malformed upload with an
    // empty-string department, just guarding a config problem instead of a
    // per-instance data problem.
    //
    // No workspace id is required. RipR21Process has no eDOCS-workspace task
    // (its only service task is rip-relatics-workspace), so edocsWorkspaceId
    // is absent on every R2.1 instance -- that's the normal case, not an
    // error. The workspace-ref upload path is also independently broken on
    // this DM server; a standalone upload (workspaceId=null) is the only
    // confirmed-working path, so that's what's used below regardless of
    // whether edocsWorkspaceId happens to be set.
    const { processInstanceId, projectNumber } = found;
    const department = config.edocs.department;

    // The direct condition below (not a derived boolean/array) is what lets
    // TypeScript narrow department to a plain string in the else branch, all
    // the way through to the upload calls -- no assertions needed.
    if (!department) {
      logger.error(
        'Archiving the signed document to eDOCS skipped: EDOCS_DEPARTMENT is not configured',
        { packageId, processInstanceId }
      );
      variables.validsignArchiveStatus = { value: 'failed', type: 'String' };
    } else {
      try {
        // Ask ValidSign for the signed document's id rather than guessing one:
        // nothing upstream of this hands us it, and a wrong id 404s the
        // download, silently dropping the archival step even though the task
        // still completes.
        const documentId = await validsignService.getSignedDocumentId(packageId);
        const [signed, evidence] = await Promise.all([
          validsignService.downloadSignedDocument(packageId, documentId),
          validsignService.downloadEvidenceSummary(packageId),
        ]);
        const base = `${projectNumber ?? 'RIP'} — Uitgangspunten VO-fase (ondertekend)`;
        const doc = await edocsService.uploadDocument(
          null,
          `rip-pdp-${projectNumber ?? packageId}-signed.pdf`,
          signed.toString('base64'),
          { docName: `${base} — getekend document`, department }
        );
        await edocsService.uploadDocument(
          null,
          `rip-pdp-${projectNumber ?? packageId}-evidence.pdf`,
          evidence.toString('base64'),
          { docName: `${base} — bewijsoverzicht`, department }
        );
        variables.validsignSignedDocNumber = { value: doc.documentNumber, type: 'String' };
        variables.validsignSignedDocId = { value: doc.documentId, type: 'String' };
        variables.validsignArchiveStatus = { value: 'ok', type: 'String' };
      } catch (error) {
        // The signature is legally complete and retrievable from ValidSign the
        // moment the signer finishes. Blocking the process on an archival
        // failure would strand a valid approval behind an unrelated outage, with
        // no recovery, since the task cannot be re-signed.
        logger.error('Archiving the signed document to eDOCS failed; completing the task anyway', {
          packageId,
          processInstanceId: found.processInstanceId,
          error: getErrorMessage(error),
        });
        variables.validsignArchiveStatus = { value: 'failed', type: 'String' };
      }
    }
  }

  // A single write, not two. completeTask's variables become process
  // variables anyway (Operaton folds task-completion variables into the
  // instance), so a separate setProcessVariables call before it would be
  // redundant on success and actively harmful on failure: the two writes are
  // not atomic, and if setProcessVariables lands but completeTask then fails
  // (network blip, engine restart), validsignStatus is already persisted as
  // 'completed'/'declined'. The status gate above would then short-circuit
  // every future call from both the webhook and the poller, leaving the
  // Operaton task open forever with no automatic recovery -- a module built
  // to prevent double-completion would instead guarantee zero-completion.
  await operatonService.completeTask(found.taskId, {
    variables: {
      ...variables,
      approvalStatus: { value: approved ? 'approved' : 'rejected', type: 'String' },
    },
  });

  logger.info('Signature completed', {
    packageId,
    processInstanceId: found.processInstanceId,
    approved,
    archive: variables.validsignArchiveStatus?.value,
  });
  return approved ? 'completed' : 'declined';
}
