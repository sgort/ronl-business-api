/**
 * Unit tests for eu.client — the EP Open Data API v2 (Atom) client.
 *
 * The fixture is a trimmed live response from
 * https://data.europarl.europa.eu/api/v2/plenary-documents/feed, so the parser is
 * tested against the shapes the EP actually emits — including the ones that cost
 * the RSS client silently dropped items: older parliamentary terms and amendment
 * refs. Entries below the marker comment in the fixture are synthetic and are
 * labelled as such there.
 */

jest.mock('@utils/config', () => ({
  config: {
    // deploymentEnv feeds the documented {user-id}-{environment}-{version}
    // User-Agent, so it has to be a real value here or the header under test
    // reads "ronl-business-api-undefined-1.0.0".
    deploymentEnv: 'test',
    pa: { euApiBase: '', cacheTtlTk: 900 },
    redis: { url: '' },
  },
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
import {
  parseAtomFeed,
  parseAtomFile,
  fetchEuFeed,
  inferType,
  workTypeLabel,
  doceoUrl,
  addDutchContext,
  refFromEntryId,
  EU_DOCUMENT_TYPES,
} from './eu.client';
import { cacheGet, cacheSet } from '../pa-cache';

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'ep-plenary.atom.xml');
const FIXTURE = readFileSync(FIXTURE_PATH, 'utf-8');

const mockFetch = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

/** Wrap entry XML in the minimum valid Atom envelope. */
const atom = (entries: string) =>
  `<?xml version='1.0' encoding='UTF-8'?>` +
  `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">${entries}</feed>`;

const entry = (id: string, title = 'A title', extra = '') =>
  `<entry><title type="text" xml:lang="en">${title}</title>` +
  `<id>https://data.europarl.europa.eu/eli/dl/doc/${id}</id>` +
  `<updated>2026-08-20T10:00:00.000Z</updated>${extra}</entry>`;

describe('parseAtomFeed (fixture: ep-plenary.atom.xml)', () => {
  let items: ReturnType<typeof parseAtomFeed>;

  beforeAll(() => {
    items = parseAtomFeed(FIXTURE);
  });

  it('returns a FeedItem for every entry with a title and a document ref', () => {
    // 16 entries; three are dropped by design — the amendment list, the agenda
    // entry with no doc ref, and the entry with no title.
    expect(items).toHaveLength(13);
  });

  it('every item has a non-empty title', () => {
    items.forEach((item) => expect(item.title.length).toBeGreaterThan(0));
  });

  it('source is always "eu"', () => {
    items.forEach((item) => expect(item.source).toBe('eu'));
  });

  it('keeps the persisted ep-rss sub-source key', () => {
    // The transport changed, the stream did not. Renaming this would split
    // existing signals from new ones across two labels for one source.
    items.forEach((item) => expect(item.subbron).toBe('ep-rss'));
  });

  it('takes the id from the ELI URI in <id>, not from the title', () => {
    const ids = items.map((i) => i.id);
    expect(ids).toContain('A-10-2026-0204');
    expect(ids).toContain('RC-10-2026-0217');
  });

  it('sets number to the same document ref as id', () => {
    items.forEach((item) => expect(item.number).toBe(item.id));
  });

  it('derives the doceo NL URL from the ref', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0204');
    expect(item?.url).toBe('https://www.europarl.europa.eu/doceo/document/A-10-2026-0204_NL.html');
  });

  it('parses the Atom <updated> timestamp to an ISO date string', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0204');
    expect(item?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('maps the work-type concept to a Dutch type label', () => {
    expect(items.find((i) => i.id === 'A-10-2026-0204')?.type).toBe('Verslag');
    expect(items.find((i) => i.id === 'B-10-2026-0380')?.type).toBe('Motie');
    expect(items.find((i) => i.id === 'RC-10-2026-0217')?.type).toBe('Gezamenlijke motie');
    expect(items.find((i) => i.id === 'QOB-10-2026-0012')?.type).toBe('Mondelinge vraag');
  });

  it('only emits type labels the blanco type filter offers', () => {
    const allowed = new Set<string>(EU_DOCUMENT_TYPES);
    items.forEach((item) => {
      if (item.type !== null) expect(allowed.has(item.type)).toBe(true);
    });
  });

  it('keeps documents from earlier parliamentary terms', () => {
    // The RSS-era ref pattern hardcoded -10-, so these were dropped outright:
    // the feed covers documents *updated* in the last month, not only new ones.
    const ids = items.map((i) => i.id);
    expect(ids).toContain('A-9-2022-0147');
    expect(ids).toContain('A-6-2008-0049');
  });

  it('drops an amendment list, whose ref carries extra segments', () => {
    // A-10-2025-0226-AM-001-002 is a fragment of a document, not one: it has no
    // doceo page, so doceoUrl() would produce a dead link.
    expect(items.map((i) => i.id)).not.toContain('A-10-2025-0226-AM-001-002');
    expect(items.some((i) => i.id.includes('-AM-'))).toBe(false);
  });

  it('drops an entry whose id is not a document ref at all', () => {
    expect(items.map((i) => i.id)).not.toContain('PV-10-2026-09-01');
  });

  it('drops an entry with no title', () => {
    expect(items.map((i) => i.id)).not.toContain('A-10-2026-0307');
  });

  it('reports no committee — the API feed carries none', () => {
    // Under RSS this came from <category domain="body">. Recorded as a test so
    // the regression is deliberate rather than discovered later in the UI.
    items.forEach((item) => expect(item.commissie).toBeNull());
  });

  it('adds Dutch terms to a nature-restoration item description', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0301');
    expect(item?.description).toContain('stikstof');
    expect(item?.description).toContain('natuurherstelverordening');
  });

  it('adds Dutch terms to an electricity-grid item description', () => {
    const item = items.find((i) => i.id === 'B-10-2026-0302');
    expect(item?.description).toContain('netcapaciteit');
    expect(item?.description).toContain('netbeheerder');
  });

  it('does not add Dutch terms to an unrelated item', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0303');
    expect(item?.description).not.toContain('[');
  });

  it('builds the description from the title, there being no summary in Atom', () => {
    const item = items.find((i) => i.id === 'A-10-2026-0303');
    expect(item?.description).toBe(item?.title);
  });

  it('returns an empty array for invalid XML', () => {
    expect(parseAtomFeed('this is not xml at all <<<')).toEqual([]);
  });

  it('returns an empty array for well-formed XML that is not an Atom feed', () => {
    expect(parseAtomFeed('<?xml version="1.0"?><rss><channel/></rss>')).toEqual([]);
  });

  it('returns an empty array for an Atom feed with no entries', () => {
    expect(parseAtomFeed(atom(''))).toEqual([]);
  });
});

describe('parseAtomFeed — entry shapes the fixture does not contain', () => {
  it('falls back to the ref prefix when the work-type concept is unmapped', () => {
    // TA-10-2026-0306 in the fixture carries SOMETHING_NEW. A vocabulary the EP
    // extends must not blank the type of a document we can still classify.
    const items = parseAtomFeed(FIXTURE);
    expect(items.find((i) => i.id === 'TA-10-2026-0306')?.type).toBe('Aangenomen tekst');
  });

  it('falls back to the ref prefix when there is no category at all', () => {
    const items = parseAtomFeed(FIXTURE);
    expect(items.find((i) => i.id === 'E-10-2026-0304')?.type).toBe('Schriftelijke vraag');
  });

  it('leaves type null when neither the concept nor the prefix is known', () => {
    const items = parseAtomFeed(atom(entry('ZZ-10-2026-0001', 'Unknown document class')));
    expect(items).toHaveLength(1);
    expect(items[0].type).toBeNull();
  });

  it('leaves date null when <updated> cannot be parsed', () => {
    const items = parseAtomFeed(FIXTURE);
    expect(items.find((i) => i.id === 'A-10-2026-0305')?.date).toBeNull();
  });

  it('leaves date null when <updated> is absent entirely', () => {
    const items = parseAtomFeed(
      atom(
        `<entry><title type="text">No updated element</title>` +
          `<id>https://data.europarl.europa.eu/eli/dl/doc/A-10-2026-0400</id></entry>`
      )
    );
    expect(items[0].date).toBeNull();
  });

  it('reads a title that carries no attributes, so arrives as a bare string', () => {
    const items = parseAtomFeed(
      atom(
        `<entry><title>Plain title</title>` +
          `<id>https://data.europarl.europa.eu/eli/dl/doc/A-10-2026-0401</id></entry>`
      )
    );
    expect(items[0].title).toBe('Plain title');
  });

  it('drops an entry whose title is present but empty', () => {
    expect(
      parseAtomFeed(
        atom(
          `<entry><title type="text"></title>` +
            `<id>https://data.europarl.europa.eu/eli/dl/doc/A-10-2026-0402</id></entry>`
        )
      )
    ).toEqual([]);
  });

  it('drops an entry with no <id> element', () => {
    expect(parseAtomFeed(atom(`<entry><title>Titled but unidentified</title></entry>`))).toEqual(
      []
    );
  });

  it('reads a single non-repeated entry, which the parser would not array-wrap', () => {
    const items = parseAtomFeed(atom(entry('A-10-2026-0403', 'Only entry')));
    expect(items).toHaveLength(1);
  });

  it('picks the work-type category when the entry carries several categories', () => {
    const items = parseAtomFeed(
      atom(
        entry(
          'A-10-2026-0404',
          'Multi-category',
          `<category term="other" label="no scheme here"/>` +
            `<category term="work-type" scheme="https://data.europarl.europa.eu/def/ep-document-types/RESOLUTION_MOTION" label="Motion"/>`
        )
      )
    );
    expect(items[0].type).toBe('Motie');
  });
});

describe('refFromEntryId', () => {
  it('takes the last path segment of the ELI URI', () => {
    expect(refFromEntryId('https://data.europarl.europa.eu/eli/dl/doc/A-10-2026-0204')).toBe(
      'A-10-2026-0204'
    );
  });

  it('accepts a single-digit parliamentary term', () => {
    expect(refFromEntryId('https://data.europarl.europa.eu/eli/dl/doc/A-6-2008-0049')).toBe(
      'A-6-2008-0049'
    );
  });

  it('accepts a three-letter prefix', () => {
    expect(refFromEntryId('https://data.europarl.europa.eu/eli/dl/doc/QOB-10-2026-0012')).toBe(
      'QOB-10-2026-0012'
    );
  });

  it('tolerates a trailing slash', () => {
    expect(refFromEntryId('https://data.europarl.europa.eu/eli/dl/doc/B-10-2026-0380/')).toBe(
      'B-10-2026-0380'
    );
  });

  it('rejects an amendment ref, which carries extra segments', () => {
    expect(refFromEntryId('https://data.europarl.europa.eu/eli/dl/doc/A-10-2025-0226-AM-001-002')) //
      .toBeNull();
  });

  it('rejects a non-document id', () => {
    expect(refFromEntryId('https://data.europarl.europa.eu/eli/dl/agenda/PV-10-2026-09-01')).toBe(
      null
    );
  });

  it('rejects an empty string', () => {
    expect(refFromEntryId('')).toBeNull();
  });

  it('accepts a bare ref with no URI around it', () => {
    expect(refFromEntryId('A-10-2026-0204')).toBe('A-10-2026-0204');
  });
});

describe('workTypeLabel', () => {
  it('maps a known concept to its Dutch label', () => {
    expect(workTypeLabel('https://data.europarl.europa.eu/def/ep-document-types/REPORT_PLENARY')) //
      .toBe('Verslag');
  });

  it('maps the joint-resolution concept, which shares a prefix with the plain one', () => {
    expect(
      workTypeLabel('https://data.europarl.europa.eu/def/ep-document-types/RESOLUTION_MOTION_JOINT')
    ).toBe('Gezamenlijke motie');
  });

  it('returns null for a concept the EP has added since', () => {
    expect(workTypeLabel('https://data.europarl.europa.eu/def/ep-document-types/BRAND_NEW')) //
      .toBeNull();
  });

  it('returns null for an empty scheme', () => {
    expect(workTypeLabel('')).toBeNull();
  });
});

describe('inferType', () => {
  it.each([
    ['A-10-2026-0099', 'Verslag'],
    ['B-10-2026-0380', 'Motie'],
    ['RC-10-2026-0217', 'Gezamenlijke motie'],
    ['TA-10-2026-0306', 'Aangenomen tekst'],
    ['E-10-2026-0304', 'Schriftelijke vraag'],
    ['O-10-2026-0001', 'Mondelinge vraag'],
    ['QOB-10-2026-0012', 'Mondelinge vraag'],
  ])('maps %s to %s', (ref, expected) => {
    expect(inferType(ref)).toBe(expected);
  });

  it('returns null for an unknown prefix', () => {
    expect(inferType('ZZ-10-2026-0001')).toBeNull();
  });
});

describe('doceoUrl', () => {
  it('builds the Dutch document URL from the ref', () => {
    // Kept Dutch although the API metadata is English: the document itself is
    // translated, and a Dutch reader is better served by the Dutch text.
    expect(doceoUrl('A-10-2026-0204')).toBe(
      'https://www.europarl.europa.eu/doceo/document/A-10-2026-0204_NL.html'
    );
  });
});

describe('addDutchContext', () => {
  it('appends Dutch equivalents in brackets', () => {
    expect(addDutchContext('a report on hydrogen')).toContain('waterstof');
  });

  it('deduplicates terms contributed by more than one pattern', () => {
    const out = addDutchContext('electricity grid capacity');
    expect(out.match(/netcapaciteit/g)).toHaveLength(1);
  });

  it('returns the text unchanged when nothing matches', () => {
    expect(addDutchContext('civil aviation agreement')).toBe('civil aviation agreement');
  });
});

describe('parseAtomFile', () => {
  it('parses a local Atom file into FeedItems', () => {
    expect(parseAtomFile(FIXTURE_PATH).length).toBe(13);
  });

  it('returns [] when the file cannot be read', () => {
    expect(parseAtomFile(join(__dirname, '__fixtures__', 'does-not-exist.xml'))).toEqual([]);
  });
});

describe('fetchEuFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  const okResponse = (xml: string) => ({
    ok: true,
    status: 200,
    text: async () => xml,
  });

  it('fetches the single plenary feed and returns a page plus a total', async () => {
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    const expected = parseAtomFeed(FIXTURE).length;

    const res = await fetchEuFeed(null, [], 0, 20);

    // One request now, where the RSS client made two: the press-release feed is
    // gone with no API equivalent (#55).
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(expected);
    expect(res.items.length).toBe(Math.min(expected, 20));
    expect(new Set(res.items.map((i) => i.id)).size).toBe(res.items.length);
  });

  it('requests the EP Open Data API, not the CDN-fronted RSS host', async () => {
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    await fetchEuFeed();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://data.europarl.europa.eu/api/v2/plenary-documents/feed');
    expect(String(url)).not.toContain('www.europarl.europa.eu');
  });

  it('identifies itself in the format the API documents', async () => {
    // {user-id}-{environment}-{version}. The API documents User-Agent as an
    // optional header; sending a well-formed one is much of why this endpoint
    // was chosen over a CDN that gates on an undocumented UA family.
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    await fetchEuFeed();
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['User-Agent']).toBe('ronl-business-api-test-1.0.0');
  });

  it('asks for Atom in the Accept header', async () => {
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    await fetchEuFeed();
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Accept).toContain('application/atom+xml');
  });

  it('applies skip/top paging over the date-sorted set', async () => {
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    const all = await fetchEuFeed(null, [], 0, 100);
    const page = await fetchEuFeed(null, [], 1, 2);

    expect(page.skip).toBe(1);
    expect(page.top).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items.map((i) => i.id)).toEqual(all.items.slice(1, 3).map((i) => i.id));
  });

  it('sorts newest first', async () => {
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    const res = await fetchEuFeed(null, [], 0, 100);
    const dates = res.items.map((i) => i.date).filter((d): d is string => !!d);
    expect([...dates]).toEqual([...dates].sort().reverse());
  });

  it('caches a successful fetch', async () => {
    mockFetch.mockResolvedValue(okResponse(FIXTURE));
    await fetchEuFeed();
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    expect(mockCacheSet.mock.calls[0][2]).toBe(900);
  });

  it('serves a cached feed without hitting the network', async () => {
    mockCacheGet.mockResolvedValue([{ id: 'A-10-2026-0099' }]);
    const res = await fetchEuFeed();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.total).toBe(1);
  });

  it('falls through to [] for a feed that returns a non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    const res = await fetchEuFeed();
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('falls through to [] for a feed that throws', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    expect((await fetchEuFeed()).items).toEqual([]);
  });

  it('returns an empty feed when the fetch rejects with a non-Error', async () => {
    mockFetch.mockRejectedValue('a bare string');
    expect((await fetchEuFeed()).items).toEqual([]);
  });

  it('sorts date-less items without crashing on the comparison', async () => {
    mockFetch.mockResolvedValue(
      okResponse(
        atom(
          `<entry><title>No date</title>` +
            `<id>https://data.europarl.europa.eu/eli/dl/doc/A-10-2026-0500</id></entry>` +
            entry('A-10-2026-0501', 'Dated')
        )
      )
    );
    const res = await fetchEuFeed();
    expect(res.items).toHaveLength(2);
  });
});

describe('fetchEuFeed — the guard that made the CDN block visible', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it('treats a 2xx that is not XML as a failure rather than an empty feed', async () => {
    // Exactly the shape www.europarl.europa.eu returns to ACC's egress range:
    // HTTP 202, zero bytes, text/html. res.ok passes, so without this guard it
    // parses to zero items and the source reports success while contributing
    // nothing. Moving to the API does not make the guard unnecessary.
    mockFetch.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
    const res = await fetchEuFeed();
    expect(res.items).toEqual([]);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('treats an HTML error page served with 200 as a failure', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '   Access denied, please enable JavaScript',
    });
    expect((await fetchEuFeed()).items).toEqual([]);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('does not serve an empty cache hit for the rest of the TTL', async () => {
    // An empty array is what a failed fetch used to leave behind. Re-fetch.
    mockCacheGet.mockResolvedValue([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => FIXTURE });
    const res = await fetchEuFeed();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.items.length).toBeGreaterThan(0);
  });
});
