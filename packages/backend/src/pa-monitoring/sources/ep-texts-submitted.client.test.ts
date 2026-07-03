/**
 * Unit tests for ep-texts-submitted.client — normaliseEpRef and parsePageHtml.
 * Both functions are pure/deterministic; no network calls are made.
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
import { normaliseEpRef, parsePageHtml } from './ep-texts-submitted.client';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__', 'ep-texts-submitted.html'), 'utf-8');

// ── normaliseEpRef ────────────────────────────────────────────────────────────

describe('normaliseEpRef', () => {
  it('converts A-ref display format to canonical dashed form', () => {
    expect(normaliseEpRef('A10-0151/2026')).toBe('A-10-2026-0151');
  });

  it('converts B-ref display format to canonical dashed form', () => {
    expect(normaliseEpRef('B10-0333/2026')).toBe('B-10-2026-0333');
  });

  it('pads the document number to 4 digits', () => {
    expect(normaliseEpRef('A10-0042/2026')).toBe('A-10-2026-0042');
  });

  it('passes through a ref already in canonical form', () => {
    expect(normaliseEpRef('A-10-2026-0151')).toBe('A-10-2026-0151');
  });

  it('passes through a canonical B-ref unchanged', () => {
    expect(normaliseEpRef('B-10-2026-0333')).toBe('B-10-2026-0333');
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(normaliseEpRef('  A10-0151/2026  ')).toBe('A-10-2026-0151');
  });

  it('returns null for a completely invalid string', () => {
    expect(normaliseEpRef('INVALID-REF')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(normaliseEpRef('')).toBeNull();
  });
});

// ── parsePageHtml ─────────────────────────────────────────────────────────────

describe('parsePageHtml (fixture: ep-texts-submitted.html)', () => {
  let docs: ReturnType<typeof parsePageHtml>;

  beforeAll(() => {
    docs = parsePageHtml(FIXTURE);
  });

  it('returns the four valid cards and skips the two malformed ones', () => {
    // Fixture has 6 div.notice cards: 4 valid, 1 invalid ref, 1 missing title
    expect(docs).toHaveLength(4);
  });

  it('every parsed doc has a non-empty canonical id', () => {
    docs.forEach((d) => {
      expect(d.id).toMatch(/^[A-Z]+-10-\d{4}-\d{4,}$/);
    });
  });

  // ── Verslag (A-ref with committee) ──────────────────────────────────────────

  it('parses the ITRE Verslag correctly', () => {
    const doc = docs.find((d) => d.id === 'A-10-2026-0151');
    expect(doc).toBeDefined();
    expect(doc!.title).toBe(
      'VERSLAG over de aanbeveling van de Raad inzake energie-infrastructuur'
    );
    expect(doc!.docType).toBe('Verslag');
    expect(doc!.committee).toBe('ITRE');
    expect(doc!.date).toBe('2026-06-05');
    expect(doc!.doceoUrl).toContain('A-10-2026-0151_NL.html');
  });

  // ── Aanbeveling ─────────────────────────────────────────────────────────────

  it('classifies AANBEVELING-titled A-refs as Aanbeveling, not Verslag', () => {
    const doc = docs.find((d) => d.id === 'A-10-2026-0156');
    expect(doc).toBeDefined();
    expect(doc!.docType).toBe('Aanbeveling');
    expect(doc!.committee).toBe('JURI');
  });

  // ── B-ref Ontwerpresolutie ───────────────────────────────────────────────────

  it('classifies B-refs as Ontwerpresolutie with null committee', () => {
    const doc = docs.find((d) => d.id === 'B-10-2026-0333');
    expect(doc).toBeDefined();
    expect(doc!.docType).toBe('Ontwerpresolutie');
    expect(doc!.committee).toBeNull();
    expect(doc!.date).toBe('2026-07-01');
  });

  // ── English title (Dutch translation not yet available) ──────────────────────

  it('parses an English-titled card without modification — title is preserved as-is', () => {
    const doc = docs.find((d) => d.id === 'A-10-2026-0168');
    expect(doc).toBeDefined();
    expect(doc!.title).toMatch(/^REPORT on/);
    expect(doc!.committee).toBe('SANT');
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it('returns an empty array for a page with no div.notice cards', () => {
    expect(parsePageHtml('<html><body><p>geen documenten</p></body></html>')).toEqual([]);
  });

  it('returns an empty array for completely empty input', () => {
    expect(parsePageHtml('')).toEqual([]);
  });
});
