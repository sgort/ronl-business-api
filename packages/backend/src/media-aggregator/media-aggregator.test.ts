/**
 * Unit tests for the media-aggregator — pure functions, no network.
 * Covers: RSS parse, article mapping, region tagging, dedup clustering,
 * summary capping, malformed-row skip, and the /search filter semantics.
 */

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFeedXml, toArticle } from './ingest';
import { assignDuplicateGroups, titleSignature } from './dedup';
import { detectRegion, isInRegion, summaryShort } from './enrich';
import type { FeedSource } from './types';

const XML = readFileSync(join(__dirname, '__fixtures__/sample-feed.xml'), 'utf8');

const REGIONAL: FeedSource = {
  id: 'omroep-flevoland',
  name: 'Omroep Flevoland',
  homepage: 'omroepflevoland.nl',
  type: 'regional',
  url: 'x',
  alwaysFlevoland: true,
};
const NATIONAL: FeedSource = {
  id: 'nu',
  name: 'NU.nl',
  homepage: 'nu.nl',
  type: 'national',
  url: 'x',
};

describe('parseFeedXml', () => {
  it('parses valid RSS items and skips the malformed (title-less) one', () => {
    const items = parseFeedXml(XML, NATIONAL);
    // 6 items in the fixture, 1 has an empty title → 5 valid
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.title && i.link)).toBe(true);
  });

  it('returns [] on unparseable input', () => {
    expect(parseFeedXml('not xml <<<', NATIONAL)).toEqual([]);
  });
});

describe('toArticle', () => {
  const items = parseFeedXml(XML, NATIONAL);

  it('maps the pinned contract fields', () => {
    const a = toArticle(items[0]);
    expect(a.title).toContain('luchthavenbesluit');
    expect(a.canonical_url).toBe(items[0].link);
    expect(a.source.homepage).toBe('nu.nl');
    expect(a.published_at).toMatch(/^2026-07-03T/);
    expect(a.sentiment).toBeNull(); // v1: sentiment off
    expect(a.duplicate_group_id).toBeNull(); // set later across corpus
  });

  it('derives a stable id from the feed guid', () => {
    expect(toArticle(items[0]).id).toMatch(/^[gtu]:[0-9a-f]{16}$/);
  });
});

describe('region tagging', () => {
  it('tags a regional Flevoland desk as province Flevoland', () => {
    const { province } = detectRegion('Iets lokaals', 'zonder plaatsnaam', REGIONAL);
    expect(province).toBe('Flevoland');
  });

  it('detects a municipality from a national article by name', () => {
    const { province, municipality } = detectRegion(
      'Netcongestie remt bedrijventerrein in Almere',
      'Door netcapaciteit kan Almere niet uitbreiden.',
      NATIONAL
    );
    expect(province).toBe('Flevoland');
    expect(municipality).toBe('Almere');
  });

  it('maps a town alias onto its municipality (Emmeloord → Noordoostpolder)', () => {
    const { municipality } = detectRegion('Nieuws uit Emmeloord', '', NATIONAL);
    expect(municipality).toBe('Noordoostpolder');
  });

  it('leaves a non-Flevoland national article untagged', () => {
    const { province, municipality } = detectRegion(
      'Woningbouwakkoord getekend in Groningen',
      'Alleen de stad Groningen.',
      NATIONAL
    );
    expect(province).toBeNull();
    expect(municipality).toBeNull();
  });

  it('isInRegion(Flevoland) keeps province/municipality hits, drops the rest', () => {
    expect(isInRegion({ province: 'Flevoland', municipality: null }, 'Flevoland')).toBe(true);
    expect(isInRegion({ province: null, municipality: 'Urk' }, 'Flevoland')).toBe(true);
    expect(isInRegion({ province: null, municipality: null }, 'Flevoland')).toBe(false);
  });
});

describe('dedup', () => {
  it('gives two syndicated copies the same duplicate_group_id', () => {
    const items = parseFeedXml(XML, NATIONAL);
    const grouped = assignDuplicateGroups(items.map(toArticle));
    // items[1] and items[2] share the "stikstofkader provincies" title
    const nu = grouped.find((a) => a.canonical_url.includes('nu.nl/politiek'));
    const nos = grouped.find((a) => a.canonical_url.includes('nos.nl'));
    if (!nu || !nos) throw new Error('expected duplicate articles not found');
    expect(nu.duplicate_group_id).not.toBeNull();
    expect(nu.duplicate_group_id).toBe(nos.duplicate_group_id);
  });

  it('leaves a unique story ungrouped', () => {
    const items = parseFeedXml(XML, NATIONAL);
    const grouped = assignDuplicateGroups(items.map(toArticle));
    const airport = grouped.find((a) => a.canonical_url.includes('luchthavenbesluit'));
    if (!airport) throw new Error('expected airport article not found');
    expect(airport.duplicate_group_id).toBeNull();
  });

  it('title signature is order-independent and punctuation-invariant', () => {
    expect(titleSignature('Stikstof aanpak kabinet vastgesteld')).toBe(
      titleSignature('Kabinet: stikstof-aanpak vastgesteld')
    );
  });
});

describe('summaryShort', () => {
  it('caps to ~50 words with an ellipsis', () => {
    const long = Array.from({ length: 80 }, (_, i) => `woord${i}`).join(' ');
    const out = summaryShort(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.split(' ').length).toBeLessThanOrEqual(51);
  });

  it('strips HTML', () => {
    expect(summaryShort('<p>Hallo <b>wereld</b></p>')).toBe('Hallo wereld');
  });
});
