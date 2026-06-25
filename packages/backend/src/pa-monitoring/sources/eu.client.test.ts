/**
 * Unit tests for eu.client — parseRssFeed (pure function, no network).
 * Covers: title extraction, Dutch type labels, ref extraction, date parsing,
 * Dutch term expansion via EU_TO_NL_TERMS, and agenda-item filtering.
 */

jest.mock('@utils/config', () => ({
  config: { pa: { euApiBase: '', cacheTtlTk: 900 }, redis: { url: '' } },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../pa-cache', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRssFeed } from './eu.client';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__', 'ep-plenary.rss.xml'), 'utf-8');

describe('parseRssFeed (fixture: ep-plenary.rss.xml)', () => {
  let items: ReturnType<typeof parseRssFeed>;

  beforeAll(() => {
    items = parseRssFeed(FIXTURE);
  });

  it('returns at least one FeedItem', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  it('every item has a non-empty title', () => {
    items.forEach((item) => {
      expect(item.title).toBeTruthy();
      expect(item.title.length).toBeGreaterThan(0);
    });
  });

  it('source is always "eu"', () => {
    items.forEach((item) => expect(item.source).toBe('eu'));
  });

  it('extracts the normalised EP ref as id (e.g. A-10-2026-0099)', () => {
    const natRestItem = items.find((i) => i.id === 'A-10-2026-0099');
    expect(natRestItem).toBeDefined();
  });

  it('derives the doceo NL URL from the ref', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0099');
    expect(item?.url).toBe('https://www.europarl.europa.eu/doceo/document/A-10-2026-0099_NL.html');
  });

  it('parses pubDate to ISO date string', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0099');
    expect(item?.date).toBe('2026-06-20');
  });

  it('preserves Dutch document-type labels from RSS category', () => {
    const verslag = items.find((i) => i.id === 'A-10-2026-0099');
    expect(verslag?.type).toBe('Verslag');

    const motie = items.find((i) => i.id === 'B-10-2026-0042');
    expect(motie?.type).toBe('Motie');
  });

  it('adds Dutch terms stikstof + natuurherstelverordening to nature-restoration item description', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0099');
    expect(item?.description).toContain('stikstof');
    expect(item?.description).toContain('natuurherstelverordening');
  });

  it('adds Dutch terms netcapaciteit + netbeheerder to electricity-grid item description', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0100');
    expect(item?.description).toContain('netcapaciteit');
    expect(item?.description).toContain('netbeheerder');
  });

  it('does not add Dutch terms to an unrelated item (Morocco aviation)', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0177');
    // Description should just be the stripped English text, no Dutch expansion bracket
    expect(item?.description).not.toContain('stikstof');
    expect(item?.description).not.toContain('netcapaciteit');
  });

  it('filters out agenda items that have no valid EP document ref', () => {
    // Fixture contains "Ontwerpagenda" with guid OJPL_OJQ-... which has no A-/B-/TA- ref
    const agendaItem = items.find((i) => i.title?.startsWith('Ontwerpagenda'));
    expect(agendaItem).toBeUndefined();
  });

  it('returns an empty array for invalid XML', () => {
    expect(parseRssFeed('not xml at all')).toEqual([]);
    expect(parseRssFeed('')).toEqual([]);
  });
});
