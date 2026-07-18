/**
 * Shared OR-term matcher for pa_saved_searches.query.q strings, e.g.
 * '"Lelystad Airport" OR laagvliegroutes OR luchthavenbesluit'. Used by both
 * the agenda route's dossier-match enrichment and the notifications matcher.
 */
export function matchesQueryTerms(text: string, query: string): string | null {
  if (!query.trim()) return null;
  const terms = query
    .split(/\s+OR\s+/i)
    .map((t) => t.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
  const lower = text.toLowerCase();
  for (const term of terms) {
    if (lower.includes(term.toLowerCase())) return term;
  }
  return null;
}
