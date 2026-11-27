/**
 * RIP documents of an instance as /v1/rip/instances/:id/documents reports them
 * (Infra-board, werkwijze A / B / B+). Mirrors the backend's
 * services/rip-documents/logic.ts and the OpenAPI schemas RipInstanceDocument
 * and RipKredietCheck.
 */
export type DocKind = 'A' | 'B' | 'BP';
export type DocStatus = 'generated' | 'pending' | 'linked' | 'missing' | 'later' | 'not-needed';

export interface InstanceDocument {
  slug: string;
  label: string;
  kind: DocKind;
  format: string | null;
  taskKey: string;
  taskName: string;
  candidateGroups: string[];
  optional: boolean;
  map: boolean;
  status: DocStatus;
  edocs: {
    documentId: string;
    documentNumber: string;
    /** The document's name in eDOCS. */
    name?: string;
    version: string | null;
    modified: string | null;
    uploadedVia?: 'ronl';
    inWorkspace?: boolean;
  } | null;
  figures: Record<string, number | null> | null;
  /** Suggested figures from an earlier phase, while the document has none of its own. */
  prefill?: Record<string, number | null> | null;
  checklist: Array<{ item: string; present: boolean }> | null;
}

export interface KredietCheck {
  variable: string;
  slug: string;
  taskKey: string;
  taskName: string;
  raming: number | null;
  krediet: number | null;
  /** The projectkrediet an earlier phase recorded, while this instance has none. */
  kredietPrefill?: number | null;
  voorstel: string | null;
  answer: string | null;
  afwijking: string | null;
  values: { binnen: string; buiten: string };
}

export interface InstanceDocumentsData {
  variables: Record<string, unknown>;
  intakeReport: Record<string, unknown> | null;
  psuReport: Record<string, unknown> | null;
  pdp: Record<string, unknown> | null;
  documents?: InstanceDocument[];
  kredietChecks?: KredietCheck[];
  edocsWorkspaceId?: string | null;
  uploadTarget?: 'workspace' | 'edocs';
}

export interface WorkspaceItem {
  id: string;
  name: string;
  documentNumber: string;
  isFolder: boolean;
  version: string | null;
  modified: string | null;
  author: string | null;
}

export interface DocumentLink {
  documentId: string;
  documentNumber: string;
  name?: string;
  linkedAt: string;
  linkedBy: string;
  uploadedVia?: 'ronl';
  inWorkspace?: boolean;
  map?: boolean;
}

/** One entry of a 422 LINKED_DOCUMENT_MISSING problem. */
export interface MissingItem {
  slug: string;
  what: 'document' | 'figure' | 'checklist' | 'reason' | 'answer';
  label: string;
}
