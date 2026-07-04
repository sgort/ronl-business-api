/**
 * media-aggregator — near-duplicate clustering.
 *
 * Syndicated stories (an ANP item republished by NOS, NU.nl and Omroep Flevoland)
 * should collapse to ONE candidate in the cockpit. We assign every member of a
 * cluster the same `duplicate_group_id`; the cockpit maps `duplicate_group_id ?? id`
 * onto the FeedItem id and dedups on `source:id`, so the cluster lands once.
 *
 * MVP heuristic: a normalised title signature (lowercased, punctuation removed,
 * first 8 significant words). Cheap, deterministic, no embeddings. Singletons get
 * duplicate_group_id = null. Phase-2 can upgrade to embedding kNN.
 */

import { createHash } from 'node:crypto';
import type { AggregatorArticle } from './types';

const STOPWORDS = new Set([
  'de',
  'het',
  'een',
  'en',
  'van',
  'in',
  'op',
  'te',
  'voor',
  'met',
  'aan',
  'na',
  'om',
  'door',
  'over',
  'bij',
  'uit',
  'dat',
  'die',
  'is',
  'na',
]);

export function titleSignature(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\u00e0-\u00ff\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return words.slice(0, 8).join(' ');
}

function groupId(signature: string): string {
  return 'dup-' + createHash('sha1').update(signature).digest('hex').slice(0, 10);
}

/**
 * Assign duplicate_group_id in place across the corpus.
 * Groups with 2+ members share an id; singletons stay null.
 */
export function assignDuplicateGroups(articles: AggregatorArticle[]): AggregatorArticle[] {
  const bySig = new Map<string, AggregatorArticle[]>();
  for (const a of articles) {
    const sig = titleSignature(a.title);
    if (!sig) continue;
    const bucket = bySig.get(sig);
    if (bucket) bucket.push(a);
    else bySig.set(sig, [a]);
  }

  for (const [sig, bucket] of bySig) {
    if (bucket.length < 2) continue;
    const id = groupId(sig);
    for (const a of bucket) a.duplicate_group_id = id;
  }

  return articles;
}
