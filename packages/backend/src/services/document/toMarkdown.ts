import type { RenderedBlock, RenderedDocument, TextRun } from './renderTemplate';

/**
 * Trailing spaces inside a bold run would produce "** " and break emphasis in
 * every CommonMark renderer, so the marker moves inside and the space back out.
 */
function runToMarkdown(run: TextRun): string {
  const escaped = run.text.replace(/([*`])/g, '\\$1');
  if (!run.bold) return escaped;
  const match = /^(\s*)(.*?)(\s*)$/.exec(escaped);
  const [, lead = '', core = '', tail = ''] = match ?? [];
  return core ? `${lead}**${core}**${tail}` : escaped;
}

function blockToMarkdown(block: RenderedBlock): string {
  if (block.kind === 'separator') return '---';
  if (block.kind === 'spacer') return '';
  const text = block.runs.map(runToMarkdown).join('');
  if (block.kind === 'heading')
    return `${'#'.repeat(Math.min(Math.max(block.level ?? 1, 1), 6))} ${text}`;
  return text;
}

export function toMarkdown(doc: RenderedDocument): string {
  const parts = doc.zones
    .flatMap((zone) => zone.blocks.map(blockToMarkdown))
    .filter((s) => s !== '');
  return `${parts.join('\n\n')}\n`;
}
