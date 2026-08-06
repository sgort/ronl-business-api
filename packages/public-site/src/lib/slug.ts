import { sectionForType, type PubType } from './sections';

/** Builds the permanent detail URL for any federated search item. */
export function hrefFor(item: { type: PubType; slug: string }): string {
  const section = sectionForType(item.type);
  return `${section.path}/${item.slug}`;
}

/** Kept byte-for-byte identical to packages/backend/src/utils/slug.ts's
 * slugify — a link built here and a lookup resolved there must agree. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}
