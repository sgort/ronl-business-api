/**
 * media-aggregator — near-duplicate clustering.
 *
 * Delegates to stable-id.ts which provides link-first stable article IDs and
 * title-signature-based duplicate grouping. dedup.ts remains the single place
 * where duplicate_group_id is assigned across the corpus.
 */

export { assignDuplicateGroups, titleSignature } from './stable-id';
