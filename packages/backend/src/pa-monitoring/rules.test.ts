/**
 * Unit tests for scoreItem — pure scoring function, no mocks needed.
 *
 * Scoring recap:
 *   rel starts at 3
 *   +2 for HIGH_VALUE_TK_TYPES (Motie, Kamervraag, Brief, Amendement) on TK items
 *   +2 for HIGH_VALUE_EU_TYPES (Verslag, Motie, Aangenomen tekst, Resolutie) on EU items
 *   per search: +3 title match per term, +1 desc match per term, +1 per tag match in title/desc
 *   rel += min(bestScore, 5), then capped at 10
 *   if bestScore === 0: rel capped at 3 (no-match floor)
 */

import { scoreItem } from './rules';
import {
  REL_BASE,
  ZWAARTYPE_BUMP,
  TITLE_HIT,
  MATCH_CAP,
  NOISE_FLOOR,
  REL_THRESHOLD,
} from '@ronl/shared';

// Minimal FeedItem factory — only fields scoreItem reads
function item(
  overrides: Partial<{
    id: string;
    source: 'tk' | 'ob' | 'eu' | 'media';
    title: string;
    description: string;
    type: string | null;
    regio: string | null;
    sentiment: 'positief' | 'neutraal' | 'negatief' | null;
  }>
) {
  return {
    id: 'x',
    source: 'tk' as const,
    title: '',
    description: '',
    type: null,
    number: null,
    date: null,
    url: null,
    regio: null,
    sentiment: null,
    ...overrides,
  };
}

// Minimal SavedSearch factory
function search(overrides: Partial<{ q: string; dossierId: string | null; tags: string[] }>) {
  return {
    dossierId: overrides.dossierId ?? null,
    query: { q: overrides.q ?? '', types: [], source: ['tk'] },
    tags: overrides.tags ?? [],
  };
}

describe('scoreItem — tab assignment', () => {
  it('tk → politiek', () => {
    expect(scoreItem(item({ source: 'tk' }), []).tab).toBe('politiek');
  });

  it('ob → regionaal', () => {
    expect(scoreItem(item({ source: 'ob' }), []).tab).toBe('regionaal');
  });

  it('eu → europa', () => {
    expect(scoreItem(item({ source: 'eu' }), []).tab).toBe('europa');
  });
});

describe('scoreItem — no-match floor', () => {
  it('no searches → rel 3', () => {
    expect(scoreItem(item({ title: 'stikstof' }), []).rel).toBe(3);
  });

  it('search with no matching terms → rel capped at 3', () => {
    const result = scoreItem(item({ title: 'energie' }), [search({ q: 'stikstof' })]);
    expect(result.rel).toBe(3);
  });

  it('TK high-value type alone (no match) → rel still capped at 3', () => {
    // +2 for Motie, but bestScore=0 forces cap at 3
    const result = scoreItem(item({ source: 'tk', type: 'Motie', title: 'iets' }), [
      search({ q: 'stikstof' }),
    ]);
    expect(result.rel).toBe(3);
  });

  it('EU high-value type alone (no match) → rel still capped at 3', () => {
    const result = scoreItem(item({ source: 'eu', type: 'Verslag', title: 'iets' }), [
      search({ q: 'climate' }),
    ]);
    expect(result.rel).toBe(3);
  });
});

describe('scoreItem — title match', () => {
  it('single term title match → rel 6 (3 base + 3 title)', () => {
    const result = scoreItem(item({ title: 'stikstof reductiekader' }), [
      search({ q: 'stikstof' }),
    ]);
    expect(result.rel).toBe(6);
  });

  it('two terms both match title → score 6, min(6,5)=5 → rel 8', () => {
    const result = scoreItem(item({ title: 'stikstof natuur' }), [
      search({ q: 'stikstof OR natuur' }),
    ]);
    expect(result.rel).toBe(8);
  });

  it('bestScore capped at 5 → rel 8 even when many terms match', () => {
    // 3 title matches = score 9; min(9, 5) = 5; rel = 3 + 5 = 8
    const result = scoreItem(item({ title: 'stikstof natuur gebied' }), [
      search({ q: 'stikstof OR natuur OR gebied' }),
    ]);
    expect(result.rel).toBe(8);
  });
});

describe('scoreItem — description match', () => {
  it('desc-only match → rel 4 (3 base + 1 desc)', () => {
    const result = scoreItem(item({ title: 'iets', description: 'stikstof in de lucht' }), [
      search({ q: 'stikstof' }),
    ]);
    expect(result.rel).toBe(4);
  });

  it('title match beats desc match for same term', () => {
    const titleMatch = scoreItem(item({ title: 'stikstof', description: '' }), [
      search({ q: 'stikstof' }),
    ]);
    const descMatch = scoreItem(item({ title: 'iets', description: 'stikstof' }), [
      search({ q: 'stikstof' }),
    ]);
    expect(titleMatch.rel).toBeGreaterThan(descMatch.rel);
  });
});

describe('scoreItem — high-value type bonus', () => {
  const MATCH_SEARCH = [search({ q: 'stikstof' })];

  it('TK Motie + title match → rel 8 (3+2 base + min(3,5))', () => {
    const result = scoreItem(
      item({ source: 'tk', type: 'Motie', title: 'stikstof motie' }),
      MATCH_SEARCH
    );
    expect(result.rel).toBe(8);
  });

  it('TK Kamervraag + title match → rel 8', () => {
    const result = scoreItem(
      item({ source: 'tk', type: 'Kamervraag', title: 'stikstof vraag' }),
      MATCH_SEARCH
    );
    expect(result.rel).toBe(8);
  });

  it('TK Brief + title match → rel 8', () => {
    const result = scoreItem(
      item({ source: 'tk', type: 'Brief', title: 'stikstof brief' }),
      MATCH_SEARCH
    );
    expect(result.rel).toBe(8);
  });

  it('TK Amendement + title match → rel 8', () => {
    const result = scoreItem(
      item({ source: 'tk', type: 'Amendement', title: 'stikstof amendement' }),
      MATCH_SEARCH
    );
    expect(result.rel).toBe(8);
  });

  it('TK non-high-value type + title match → rel 6 (no +2)', () => {
    const result = scoreItem(
      item({ source: 'tk', type: 'Verslag', title: 'stikstof verslag' }),
      MATCH_SEARCH
    );
    expect(result.rel).toBe(6);
  });

  it('EU Verslag + title match → rel 8', () => {
    const result = scoreItem(
      item({ source: 'eu', type: 'Verslag', title: 'stikstof report' }),
      MATCH_SEARCH
    );
    expect(result.rel).toBe(8);
  });

  it('EU Motie + title match → rel 8', () => {
    const result = scoreItem(
      item({ source: 'eu', type: 'Motie', title: 'stikstof motion' }),
      MATCH_SEARCH
    );
    expect(result.rel).toBe(8);
  });

  it('EU non-high-value type + title match → rel 6', () => {
    const result = scoreItem(
      item({ source: 'eu', type: 'Persbericht', title: 'stikstof press' }),
      MATCH_SEARCH
    );
    expect(result.rel).toBe(6);
  });

  it('rel cap at 10 — TK Motie (3+2=5) + bestScore 5 → 10', () => {
    // Need bestScore=5: 2 title matches = 6 → min(6,5) = 5
    const result = scoreItem(item({ source: 'tk', type: 'Motie', title: 'stikstof natuur' }), [
      search({ q: 'stikstof OR natuur' }),
    ]);
    expect(result.rel).toBe(10);
  });
});

describe('scoreItem — tag bonus', () => {
  it('tag present in title adds 1 to score', () => {
    const withTag = scoreItem(item({ title: 'stikstof en landbouw' }), [
      search({ q: 'stikstof', tags: ['landbouw'] }),
    ]);
    const withoutTag = scoreItem(item({ title: 'stikstof en landbouw' }), [
      search({ q: 'stikstof', tags: [] }),
    ]);
    expect(withTag.rel).toBeGreaterThan(withoutTag.rel);
  });

  it('tag present in description adds 1 to score', () => {
    const withTag = scoreItem(item({ title: 'stikstof', description: 'effecten op landbouw' }), [
      search({ q: 'stikstof', tags: ['landbouw'] }),
    ]);
    const withoutTag = scoreItem(item({ title: 'stikstof', description: 'effecten op landbouw' }), [
      search({ q: 'stikstof', tags: [] }),
    ]);
    expect(withTag.rel).toBeGreaterThan(withoutTag.rel);
  });
});

describe('scoreItem — quoted terms', () => {
  it('strips quotes from terms before matching', () => {
    const result = scoreItem(item({ title: 'green deal wetgeving' }), [
      search({ q: '"green deal"' }),
    ]);
    // 'green deal' matches title → score 3 → rel 6
    expect(result.rel).toBe(6);
  });
});

describe('scoreItem — dossierId assignment', () => {
  it('returns null dossierId when no searches match', () => {
    const result = scoreItem(item({ title: 'iets' }), [search({ q: 'stikstof', dossierId: 'd1' })]);
    expect(result.dossierId).toBeNull();
  });

  it('returns dossierId from matching search', () => {
    const result = scoreItem(item({ title: 'stikstof reductie' }), [
      search({ q: 'stikstof', dossierId: 'd1' }),
    ]);
    expect(result.dossierId).toBe('d1');
  });

  it('returns null when matching search has null dossierId', () => {
    const result = scoreItem(item({ title: 'stikstof reductie' }), [
      search({ q: 'stikstof', dossierId: null }),
    ]);
    expect(result.dossierId).toBeNull();
  });

  it('returns dossierId from the highest-scoring search', () => {
    const result = scoreItem(item({ title: 'stikstof natuur gebied' }), [
      search({ q: 'stikstof', dossierId: 'low-scorer' }),
      search({ q: 'stikstof OR natuur OR gebied', dossierId: 'high-scorer' }),
    ]);
    expect(result.dossierId).toBe('high-scorer');
  });

  it('dossierId stays null when best search has null dossierId even if lower search has one', () => {
    const result = scoreItem(item({ title: 'stikstof natuur gebied' }), [
      search({ q: 'stikstof', dossierId: 'low-scorer' }), // score 3
      search({ q: 'stikstof OR natuur OR gebied', dossierId: null }), // score 9 → wins
    ]);
    expect(result.dossierId).toBeNull();
  });
});

describe('scoreItem — media source (geographic bump)', () => {
  const mediaSearch = [search({ q: 'netcongestie', dossierId: 'energie' })];

  it('media → tab is media', () => {
    expect(
      scoreItem(item({ source: 'media', title: 'netcongestie Flevoland' }), mediaSearch).tab
    ).toBe('media');
  });

  it('Flevoland province in regio grants +2 bump', () => {
    // regio 'Flevoland' only — no municipality match, just the province bump.
    const withFlevoland = scoreItem(
      item({ source: 'media', title: 'netcongestie', regio: 'Flevoland' }),
      mediaSearch
    );
    const withoutFlevoland = scoreItem(
      item({ source: 'media', title: 'netcongestie', regio: 'Utrecht · Amersfoort' }),
      mediaSearch
    );
    expect(withFlevoland.rel).toBe(withoutFlevoland.rel + 2);
  });

  it('Flevoland in title also grants +2 province bump', () => {
    const result = scoreItem(
      item({ source: 'media', title: 'netcongestie remt Flevoland', regio: null }),
      mediaSearch
    );
    // 3 base + 2 flevoland + min(3 title match, 5) = 8
    expect(result.rel).toBe(8);
  });

  it('Flevoland municipality in haystack grants additional +1', () => {
    const withMunicipality = scoreItem(
      item({ source: 'media', title: 'netcongestie in Almere', regio: 'Flevoland · Almere' }),
      mediaSearch
    );
    const withoutMunicipality = scoreItem(
      item({ source: 'media', title: 'netcongestie', regio: 'Flevoland' }),
      mediaSearch
    );
    expect(withMunicipality.rel).toBe(withoutMunicipality.rel + 1);
  });

  it('regio and sentiment are not scoring inputs', () => {
    const base = scoreItem(
      item({ source: 'media', title: 'netcongestie', regio: 'Flevoland', sentiment: null }),
      mediaSearch
    );
    const withSentiment = scoreItem(
      item({ source: 'media', title: 'netcongestie', regio: 'Flevoland', sentiment: 'negatief' }),
      mediaSearch
    );
    expect(base.rel).toBe(withSentiment.rel);
  });

  it('no Flevoland, no matching term → rel stays at floor 3', () => {
    const result = scoreItem(
      item({
        source: 'media',
        title: 'voetbal in Utrecht',
        regio: 'Utrecht',
        sentiment: 'positief',
      }),
      [search({ q: 'stikstof', dossierId: 'stikstof' })]
    );
    expect(result.rel).toBe(3);
  });

  it('Flevoland article with no term match clears rel ≥ 4 via province bump alone is impossible — stays at 3 floor when no term match', () => {
    // Geographic bump: 3 base + 2 province = 5. BUT bestScore=0 caps rel at 3.
    // This confirms the geographic bump alone is not enough to surface noise;
    // a term match is also required to clear the floor.
    const result = scoreItem(
      item({ source: 'media', title: 'honden in Almere', regio: 'Flevoland · Almere' }),
      [search({ q: 'stikstof', dossierId: 'stikstof' })]
    );
    expect(result.rel).toBe(3);
  });
});

describe('scoreItem — shared-constant drift guard', () => {
  it('canonical TK strong case matches REL_BASE + ZWAARTYPE_BUMP + min(TITLE_HIT, MATCH_CAP)', () => {
    // This test fails if rules.ts logic ever diverges from the constants in @ronl/shared.
    const expected = REL_BASE + ZWAARTYPE_BUMP + Math.min(TITLE_HIT, MATCH_CAP); // 3+2+3 = 8
    const result = scoreItem(
      item({ source: 'tk', type: 'Motie', title: 'stikstof motie landbouw' }),
      [search({ q: 'stikstof' })]
    );
    expect(result.rel).toBe(expected);
    expect(result.rel).toBeGreaterThanOrEqual(REL_THRESHOLD);
  });

  it('no-match item is capped at NOISE_FLOOR and falls below REL_THRESHOLD', () => {
    const result = scoreItem(item({ source: 'tk', type: 'Motie', title: 'onderwijshuisvesting' }), [
      search({ q: 'stikstof' }),
    ]);
    expect(result.rel).toBe(NOISE_FLOOR);
    expect(result.rel).toBeLessThan(REL_THRESHOLD);
  });
});
