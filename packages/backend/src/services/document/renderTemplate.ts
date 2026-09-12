import { createLogger } from '@utils/logger';
import {
  DocumentBlock,
  DocumentTemplate,
  TipTapNode,
  ZoneId,
  ZONE_ALIASES,
  ZONE_ORDER,
} from './documentTemplate.types';

const logger = createLogger('render-template');

export interface TextRun {
  text: string;
  bold: boolean;
}
export interface RenderedBlock {
  kind: 'heading' | 'paragraph' | 'separator' | 'spacer';
  level?: number;
  runs: TextRun[];
}
export interface RenderedZone {
  id: ZoneId;
  blocks: RenderedBlock[];
}
export interface RenderedDocument {
  templateId: string;
  zones: RenderedZone[];
}

function canonicalZoneId(key: string): ZoneId | null {
  if ((ZONE_ORDER as string[]).includes(key)) return key as ZoneId;
  return ZONE_ALIASES[key.toLowerCase()] ?? null;
}

function resolvePlaceholders(
  text: string,
  template: DocumentTemplate,
  vars: Record<string, unknown>
): string {
  let out = text;
  for (const binding of template.bindings) {
    if (!out.includes(binding.placeholder)) continue;
    const raw = vars[binding.variableKey];
    // '—' matches the existing v() helper in externalTaskWorker.service.ts, so
    // rendered output stays consistent with what is already archived.
    const value = raw === undefined || raw === null || raw === '' ? '—' : String(raw);
    out = out.split(binding.placeholder).join(value);
  }
  return out;
}

function runsOf(
  node: TipTapNode,
  template: DocumentTemplate,
  vars: Record<string, unknown>
): TextRun[] {
  const runs: TextRun[] = [];
  const walk = (n: TipTapNode, bold: boolean): void => {
    const isBold = bold || (n.marks ?? []).some((m) => m.type === 'bold');
    if (n.type === 'text' && typeof n.text === 'string') {
      runs.push({ text: resolvePlaceholders(n.text, template, vars), bold: isBold });
    }
    for (const child of n.content ?? []) walk(child, isBold);
  };
  walk(node, false);
  return runs;
}

function renderBlock(
  block: DocumentBlock,
  template: DocumentTemplate,
  vars: Record<string, unknown>
): RenderedBlock[] {
  if (block.type === 'separator') return [{ kind: 'separator', runs: [] }];
  if (block.type === 'spacer') return [{ kind: 'spacer', runs: [] }];
  if (block.type !== 'text') {
    // No RIP template uses image or variable blocks. Log rather than crash so a
    // future template cannot take the whole render down.
    logger.warn('Unsupported block type skipped', { blockId: block.id, type: block.type });
    return [];
  }
  const out: RenderedBlock[] = [];
  for (const node of block.content?.content ?? []) {
    if (node.type === 'heading') {
      out.push({
        kind: 'heading',
        level: Number(node.attrs?.level ?? 1),
        runs: runsOf(node, template, vars),
      });
    } else if (node.type === 'paragraph') {
      out.push({ kind: 'paragraph', runs: runsOf(node, template, vars) });
    }
  }
  return out;
}

export function renderTemplate(
  template: DocumentTemplate,
  variables: Record<string, unknown>
): RenderedDocument {
  const byZone = new Map<ZoneId, RenderedBlock[]>();
  for (const [key, zone] of Object.entries(template.zones ?? {})) {
    const id = canonicalZoneId(key);
    if (!id) {
      logger.warn('Unknown zone key skipped', { templateId: template.id, key });
      continue;
    }
    const blocks = (zone?.blocks ?? []).flatMap((b) => renderBlock(b, template, variables));
    if (blocks.length) byZone.set(id, [...(byZone.get(id) ?? []), ...blocks]);
  }
  const zones: RenderedZone[] = [];
  for (const id of ZONE_ORDER) {
    const blocks = byZone.get(id);
    if (blocks) zones.push({ id, blocks });
  }
  return { templateId: template.id, zones };
}
