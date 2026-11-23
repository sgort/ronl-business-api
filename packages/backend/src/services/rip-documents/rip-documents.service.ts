/**
 * RIP documents of an instance (Infra-board, werkwijze A / B / B+): the read
 * side (every declared document and its status), linking and uploading, and
 * the completion check. Engine and eDOCS calls live here; the rules live in
 * ./logic.ts.
 */
import type { Task } from '@ronl/shared';
import { operatonService } from '@services/operaton.service';
import type { EdocsContainerItem, EdocsService } from '@services/edocs.service';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { docLabel } from '../../rip-swimlane/doc-label';
import {
  readDocumentSpecs,
  readTaskDocumentSpec,
  type TaskDocumentSpec,
} from '../../rip-swimlane/document-spec';
import { linkedDocVariable } from '../../rip-swimlane/linked-docs';
import {
  buildInstanceDocuments,
  buildKredietChecks,
  checkCompletion,
  linkVariables,
  parseLinkRecord,
  type ChecklistEntry,
  type CompletionCheck,
  type InstanceDocument,
  type KredietCheckState,
  type LinkRecord,
  type LiveEdocsInfo,
} from './logic';

const logger = createLogger('rip-documents');

/** A refusal the route turns into a problem detail. */
export class RipDocumentError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RipDocumentError';
  }
}

export interface InstanceDocumentsResult {
  municipality: unknown;
  edocsWorkspaceId: string | null;
  /** Where an upload through the IOU lands: the projectmap, or eDOCS standalone. */
  uploadTarget: 'workspace' | 'edocs';
  documents: InstanceDocument[];
  kredietChecks: KredietCheckState[];
}

const workspaceIdOf = (vars: Record<string, unknown>): string | null => {
  const v = vars.edocsWorkspaceId;
  return typeof v === 'string' && v !== '' && v !== '—' ? v : null;
};

/** Highest version label of a document; null when eDOCS cannot say. */
async function latestVersion(
  edocs: EdocsService,
  documentId: string
): Promise<LiveEdocsInfo | null> {
  try {
    const versions = await edocs.getDocumentVersions(documentId);
    if (versions.length === 0) return null;
    const best = versions.reduce((a, b) =>
      (Number(b.version) || 0) > (Number(a.version) || 0) ? b : a
    );
    return { version: best.version, modified: best.modified ?? null };
  } catch (error) {
    logger.warn('Could not read document versions', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Checklist presence for a linked map: an item counts as present when a
 * document in the folder has the item's text in its name (case-insensitive).
 */
export function checklistPresence(
  items: string[],
  contents: EdocsContainerItem[]
): ChecklistEntry[] {
  const names = contents.filter((c) => !c.isFolder).map((c) => c.name.toLowerCase());
  return items.map((item) => ({
    item,
    present: names.some((n) => n.includes(item.toLowerCase())),
  }));
}

async function mapChecklists(
  specs: TaskDocumentSpec[],
  vars: Record<string, unknown>,
  edocs: EdocsService | null
): Promise<Map<string, ChecklistEntry[]>> {
  const out = new Map<string, ChecklistEntry[]>();
  if (!edocs) return out;
  const maps = specs.flatMap((s) => s.linked.filter((l) => l.map && l.checklist.length > 0));
  await Promise.all(
    maps.map(async (ref) => {
      const link = parseLinkRecord(vars[linkedDocVariable(ref.slug)]);
      if (!link) return;
      try {
        const contents = await edocs.listContents('folder', link.documentId);
        out.set(ref.slug, checklistPresence(ref.checklist, contents));
      } catch (error) {
        logger.warn('Could not list a linked map', {
          slug: ref.slug,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );
  return out;
}

/** Every document the instance's model declares, with live eDOCS state where it can be read. */
export async function listInstanceDocuments(
  instanceId: string,
  edocs: EdocsService | null
): Promise<InstanceDocumentsResult> {
  const ctx = await operatonService.getRipDocumentContext(instanceId);
  const specs = readDocumentSpecs(ctx.bpmnXml);

  // Live versions, read once per linked document for this request only: a
  // later edit in eDOCS shows up on the next request without relinking.
  const live = new Map<string, LiveEdocsInfo | null>();
  if (edocs) {
    const linked = specs.flatMap((s) => s.linked.filter((l) => !l.map));
    await Promise.all(
      [...new Set(linked.map((l) => l.slug))].map(async (slug) => {
        const link = parseLinkRecord(ctx.variables[linkedDocVariable(slug)]);
        if (link) live.set(slug, await latestVersion(edocs, link.documentId));
      })
    );
  }
  const checklists = await mapChecklists(specs, ctx.variables, edocs);

  return {
    municipality: ctx.variables.municipality,
    edocsWorkspaceId: workspaceIdOf(ctx.variables),
    uploadTarget: config.edocs.workspaceUploadEnabled ? 'workspace' : 'edocs',
    documents: buildInstanceDocuments({
      specs,
      vars: ctx.variables,
      activities: ctx.activities,
      live,
      checklists,
    }),
    kredietChecks: buildKredietChecks(specs, ctx.variables),
  };
}

/** Content of the instance's eDOCS projectmap, or of one folder in it. */
export async function listInstanceWorkspace(
  instanceId: string,
  edocs: EdocsService,
  folderId?: string
): Promise<{ municipality: unknown; workspaceId: string; items: EdocsContainerItem[] }> {
  const ctx = await operatonService.getRipDocumentContext(instanceId);
  const workspaceId = workspaceIdOf(ctx.variables);
  if (!workspaceId) {
    throw new RipDocumentError(
      409,
      'NO_PROJECT_WORKSPACE',
      'Dit project heeft nog geen eDOCS-projectmap.'
    );
  }
  const items = await edocs.listContents(
    folderId ? 'folder' : 'workspace',
    folderId ?? workspaceId
  );
  return { municipality: ctx.variables.municipality, workspaceId, items };
}

interface Caller {
  userId: string;
  roles: string[];
}

/**
 * The open task of this instance that declares `slug` as a linked document,
 * and the caller may work on. Throws the matching refusal otherwise.
 */
async function openTaskFor(
  instanceId: string,
  slug: string,
  caller: Caller,
  authorize: (municipality: unknown) => boolean
): Promise<{
  ctx: Awaited<ReturnType<typeof operatonService.getRipDocumentContext>>;
  spec: TaskDocumentSpec;
  ref: TaskDocumentSpec['linked'][number];
} | null> {
  const ctx = await operatonService.getRipDocumentContext(instanceId);
  // Tenant first: nothing about another tenant's instance -- not even which
  // of its tasks are open -- may leak through the refusals below.
  if (!authorize(ctx.variables.municipality)) return null;
  const specs = readDocumentSpecs(ctx.bpmnXml).filter((s) => s.linked.some((l) => l.slug === slug));
  if (specs.length === 0) {
    throw new RipDocumentError(
      404,
      'UNKNOWN_DOCUMENT',
      `Dit proces kent geen gekoppeld document '${slug}'.`
    );
  }
  const open = new Set(
    (await operatonService.getOpenTasksOfInstance(instanceId)).map((t) => t.taskDefinitionKey)
  );
  const spec = specs.find((s) => open.has(s.taskKey));
  if (!spec) {
    throw new RipDocumentError(
      409,
      'DOCUMENT_TASK_NOT_OPEN',
      'De taak die dit document oplevert staat nu niet open.'
    );
  }
  if (!spec.candidateGroups.some((g) => caller.roles.includes(g))) {
    throw new RipDocumentError(403, 'NOT_CANDIDATE', 'U mag deze taak niet uitvoeren.');
  }
  const ref = spec.linked.find((l) => l.slug === slug);
  // Unreachable: `spec` was chosen because it declares `slug`.
  if (!ref) throw new RipDocumentError(404, 'UNKNOWN_DOCUMENT', `Onbekend document '${slug}'.`);
  return { ctx, spec, ref };
}

export interface LinkResult {
  municipality: unknown;
  slug: string;
  link: LinkRecord;
}

/**
 * Link a document (or, for a map, a folder) from the projectmap to `slug`.
 * Tenant isolation is decided by the route through `authorize`, called
 * before anything else is checked or written; a refusal returns null.
 */
export async function linkDocument(
  instanceId: string,
  slug: string,
  documentId: string,
  caller: Caller,
  edocs: EdocsService,
  authorize: (municipality: unknown) => boolean
): Promise<LinkResult | null> {
  const found = await openTaskFor(instanceId, slug, caller, authorize);
  if (!found) return null;
  const { ctx, ref } = found;

  const workspaceId = workspaceIdOf(ctx.variables);
  if (!workspaceId) {
    throw new RipDocumentError(
      409,
      'NO_PROJECT_WORKSPACE',
      'Dit project heeft nog geen eDOCS-projectmap.'
    );
  }
  const items = await edocs.listContents('workspace', workspaceId);
  const item = items.find((i) => i.id === documentId || i.documentNumber === documentId);
  if (!item) {
    throw new RipDocumentError(
      422,
      'DOCUMENT_NOT_IN_WORKSPACE',
      'Dit document staat niet in de eDOCS-projectmap van dit project.'
    );
  }
  if (item.isFolder !== ref.map) {
    throw new RipDocumentError(
      422,
      ref.map ? 'MAP_EXPECTED' : 'DOCUMENT_EXPECTED',
      ref.map ? 'Kies een map, geen document.' : 'Kies een document, geen map.'
    );
  }
  const link: LinkRecord = {
    documentId: item.id,
    documentNumber: item.documentNumber,
    name: item.name,
    linkedAt: new Date().toISOString(),
    linkedBy: caller.userId,
    ...(ref.map ? { map: true } : {}),
  };
  await operatonService.setProcessVariables(instanceId, linkVariables(slug, link));
  return { municipality: ctx.variables.municipality, slug, link };
}

/**
 * Upload a file for `slug` and link the result. Workspace uploads are broken
 * on the DM server, so unless EDOCS_WORKSPACE_UPLOAD_ENABLED is on the file
 * goes to eDOCS standalone; the link then says so (inWorkspace: false), and no
 * workspace check applies to it.
 */
export async function uploadDocument(
  instanceId: string,
  slug: string,
  file: { filename: string; contentBase64: string },
  caller: Caller,
  edocs: EdocsService,
  authorize: (municipality: unknown) => boolean
): Promise<LinkResult | null> {
  const found = await openTaskFor(instanceId, slug, caller, authorize);
  if (!found) return null;
  const { ctx, ref } = found;
  if (ref.map) {
    throw new RipDocumentError(
      409,
      'MAP_UPLOAD_UNSUPPORTED',
      'Een map kan niet worden geüpload; maak de map in eDOCS aan en koppel hem.'
    );
  }

  const bytes = Buffer.from(file.contentBase64, 'base64');
  if (bytes.length === 0) {
    throw new RipDocumentError(400, 'EMPTY_FILE', 'Het bestand is leeg.');
  }
  if (bytes.length > config.edocs.linkedUploadMaxBytes) {
    throw new RipDocumentError(413, 'FILE_TOO_LARGE', 'Het bestand is te groot.');
  }

  const inWorkspace = config.edocs.workspaceUploadEnabled;
  const workspaceId = workspaceIdOf(ctx.variables);
  if (inWorkspace && !workspaceId) {
    throw new RipDocumentError(
      409,
      'NO_PROJECT_WORKSPACE',
      'Dit project heeft nog geen eDOCS-projectmap.'
    );
  }
  const projectNumber = String(ctx.variables.projectNumber ?? '');
  const projectName = String(ctx.variables.projectName ?? '');
  const result = await edocs.uploadDocument(
    inWorkspace ? workspaceId : null,
    file.filename,
    file.contentBase64,
    {
      docName: [projectNumber, docLabel(slug), projectName].filter(Boolean).join(' — '),
      department: config.edocs.department,
      ...(config.edocs.linkedUploadForm ? { formName: config.edocs.linkedUploadForm } : {}),
    }
  );

  const link: LinkRecord = {
    documentId: result.documentId,
    documentNumber: result.documentNumber,
    name: file.filename,
    linkedAt: new Date().toISOString(),
    linkedBy: caller.userId,
    uploadedVia: 'ronl',
    inWorkspace,
  };
  await operatonService.setProcessVariables(instanceId, linkVariables(slug, link));
  return { municipality: ctx.variables.municipality, slug, link };
}

/**
 * What a task still needs before it may complete, plus the variables the
 * server sets with the completion. A task whose model declares no documents
 * and no kredietcheck passes without further reads.
 */
export async function checkTaskCompletion(
  task: Pick<Task, 'processDefinitionId' | 'processInstanceId' | 'taskDefinitionKey'>,
  submitted: Record<string, unknown>,
  edocs: EdocsService | null
): Promise<CompletionCheck> {
  const xml = await operatonService.getProcessDefinitionXml(task.processDefinitionId);
  const spec = readTaskDocumentSpec(xml, task.taskDefinitionKey);
  if (!spec || (spec.linked.length === 0 && !spec.kredietCheck)) {
    return { missing: [], variables: {} };
  }
  const ctx = await operatonService.getRipDocumentContext(task.processInstanceId);
  const checklists = await mapChecklists([spec], ctx.variables, edocs);
  return checkCompletion({ spec, submitted, instanceVars: ctx.variables, checklists });
}
