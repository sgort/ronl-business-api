// sanitize.ts — HTML → bounded plain text.
//
// The AggregatorArticle contract promises `summary_short` is PLAIN TEXT
// (≤ ~50 words). The MVP "stripped the RSS description", which for a regex
// strip can leak half-tags and raw entities into the cockpit UI. This does a
// correct job with no new dependency: decode entities, drop all tags, collapse
// whitespace, then cap by words.
//
// Scope note: this is deliberately a text extractor, not a rich-HTML sanitizer.
// We keep NO markup, so there is no XSS surface to sanitize — stripping to text
// is strictly safer than allow-listing tags. If a future contract field ever
// needs to RETAIN markup, do NOT extend this file; add the maintained
// `sanitize-html` package and allow-list tags there (see HARDENING.md §3).

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  euml: 'ë',
  iuml: 'ï',
  ouml: 'ö',
  uuml: 'ü',
  auml: 'ä',
  ccedil: 'ç',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  euro: '€',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function safeCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '\ufffd';
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '\ufffd';
  }
}

/**
 * Convert feed HTML/markup to clean single-line plain text.
 * Removes <script>/<style> content wholesale, drops all remaining tags,
 * decodes entities, and collapses whitespace.
 */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input);
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' '); // kill scriptable blocks + content
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li|h[1-6])>/gi, ' '); // block breaks → space
  s = s.replace(/<[^>]+>/g, ''); // strip all remaining tags
  s = decodeEntities(s);
  s = s.replace(/\s+/g, ' ').trim(); // collapse whitespace
  return s;
}

/**
 * Plain-text summary capped at `maxWords` (default 50), with an ellipsis when
 * truncated. Word-boundary safe — never cuts mid-word.
 */
export function summarize(input: string | null | undefined, maxWords = 50): string {
  const text = htmlToText(input);
  if (!text) return '';
  const words = text.split(' ');
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + ' …';
}
