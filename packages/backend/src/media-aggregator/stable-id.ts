// stable-id.ts — deterministic article + duplicate-group identity.
//
// Problem this fixes: the MVP derived `id` and `duplicate_group_id` from a
// title signature, so ids churned every 15-min cache refresh and the cockpit
// re-surfaced the same story as "new". Venus's lesson is to anchor identity on
// the most durable field available (the canonical link), and only synthesise
// from content when no link exists.
//
// No new dependency — Node's stdlib `crypto`.

import { createHash } from 'node:crypto';

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}

/**
 * Normalise a URL for identity: lowercase host, drop the fragment, strip common
 * tracking params and a trailing slash. Two syndicated copies that differ only
 * by utm_* still collapse to the same canonical string.
 */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    const drop = [/^utm_/, /^fbclid$/, /^gclid$/, /^mc_/, /^ref$/, /^ref_src$/];
    for (const key of [...u.searchParams.keys()]) {
      if (drop.some((re) => re.test(key))) u.searchParams.delete(key);
    }
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

/**
 * Stable per-article id. Precedence mirrors Venus's synthesis order:
 *   feed-provided guid → canonical link → title+publishedAt.
 * The result is deterministic across refreshes for the same article.
 */
export function stableArticleId(a: {
  guid?: string | null;
  canonical_url?: string | null;
  title: string;
  published_at: string;
}): string {
  if (a.guid && a.guid.trim()) return `g:${sha1(a.guid.trim())}`;
  if (a.canonical_url && a.canonical_url.trim())
    return `u:${sha1(canonicalizeUrl(a.canonical_url))}`;
  return `t:${sha1(`${a.title.trim().toLowerCase()}|${a.published_at}`)}`;
}

/**
 * Title signature for near-duplicate (syndicated) clustering. Lowercase,
 * strip punctuation, collapse whitespace, drop a handful of Dutch stopwords so
 * "Stikstof: kabinet valt" and "Kabinet valt om stikstof" cluster together.
 * This stays a heuristic — swap the signature for embedding kNN in phase-2
 * without changing the return shape.
 */
const NL_STOP = new Set([
  'de',
  'het',
  'een',
  'en',
  'van',
  'op',
  'in',
  'te',
  'om',
  'met',
  'voor',
  'naar',
  'over',
]);

export function titleSignature(title: string): string {
  const tokens = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NL_STOP.has(w))
    .sort(); // order-independent
  return sha1([...new Set(tokens)].join(' '));
}

/**
 * Assign duplicate_group_id: articles sharing a title signature get one shared,
 * deterministic group id; a singleton keeps its own article id as the group so
 * the field is never null-ambiguous within a cluster. Returns a new array;
 * does not mutate input.
 */
export function assignDuplicateGroups<
  T extends { id: string; title: string; duplicate_group_id: string | null },
>(articles: T[]): T[] {
  const bySig = new Map<string, string[]>();
  for (const a of articles) {
    const sig = titleSignature(a.title);
    (bySig.get(sig) ?? bySig.set(sig, []).get(sig)!).push(a.id);
  }
  return articles.map((a) => {
    const sig = titleSignature(a.title);
    const members = bySig.get(sig)!;
    const groupId = members.length > 1 ? `dup:${sig}` : null;
    return { ...a, duplicate_group_id: groupId };
  });
}
