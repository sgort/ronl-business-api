import { sectionForType, type PubType } from './sections';

/** Builds the permanent detail URL for any federated search item. */
export function hrefFor(item: { type: PubType; slug: string }): string {
  const section = sectionForType(item.type);
  return `${section.path}/${item.slug}`;
}
