/**
 * URL-safe slug for public detail routes. Deterministic and pure — used
 * both when building the federated search index and when resolving a
 * `:slug` route param back to an item, so the two must never drift.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, ''); // slice() can leave a trailing hyphen
}
