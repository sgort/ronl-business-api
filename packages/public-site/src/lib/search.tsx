// packages/public-site/src/lib/search.tsx
import { Fragment, type ReactNode } from 'react';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits text into React nodes, wrapping query-term matches in <mark>.
 * Never uses dangerouslySetInnerHTML — matches only terms of 3+ characters,
 * same as the prototype, so short/common words don't light up the whole page.
 */
export function highlight(text: string, q: string): ReactNode {
  if (!text) return '';
  const terms = q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map(escapeRegExp);
  if (!terms.length) return text;

  const re = new RegExp(`(${terms.join('|')})`, 'ig');
  return text
    .split(re)
    .map((chunk, i) =>
      re.test(chunk) && i % 2 === 1 ? (
        <mark key={i}>{chunk}</mark>
      ) : (
        <Fragment key={i}>{chunk}</Fragment>
      )
    );
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
