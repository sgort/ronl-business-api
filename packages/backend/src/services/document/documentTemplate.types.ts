/**
 * Mirrors linked-data-explorer's packages/frontend/src/types/document.types.ts.
 * Duplicated deliberately: the two repos ship separately and share no package.
 */
export type BlockType = 'text' | 'image' | 'variable' | 'separator' | 'spacer';
export type BindingSource = 'process' | 'dmn_output';

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string }>;
  text?: string;
}
export interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}
export interface DocumentBlock {
  id: string;
  type: BlockType;
  content?: TipTapDoc;
  label?: string;
}
export interface DocumentZone {
  blocks: DocumentBlock[];
}
export interface VariableBinding {
  id: string;
  placeholder: string;
  variableKey: string;
  source: BindingSource;
  label?: string;
}
export interface DocumentTemplate {
  id: string;
  name: string;
  schemaVersion: number;
  zones: Record<string, DocumentZone | null | undefined>;
  bindings: VariableBinding[];
  assets: string[];
  createdAt: string;
  updatedAt: string;
  processKey?: string;
}

export type ZoneId =
  | 'letterhead'
  | 'contactInformation'
  | 'reference'
  | 'body'
  | 'closing'
  | 'signOff'
  | 'annex';

/** Canonical render order (annex last). */
export const ZONE_ORDER: ZoneId[] = [
  'letterhead',
  'contactInformation',
  'reference',
  'body',
  'closing',
  'signOff',
  'annex',
];

/**
 * Deployed fixtures predating linked-data-explorer 39a49bb use lowercase keys.
 * Accept both: dropping signOff would drop the signature block, which is the
 * zone the ValidSign field anchors into.
 */
export const ZONE_ALIASES: Record<string, ZoneId> = {
  signoff: 'signOff',
  contactinfo: 'contactInformation',
};
