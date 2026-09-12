import { describe, it, expect } from 'vitest';
import { mapToHits } from './sectionHits';

// mapToHits is the single mapping the prerender (to build each section route's
// embedded blob) and SectionIndex (cold fetch) both go through, so its per-type
// output shape is worth pinning directly.
describe('mapToHits', () => {
  it('maps berichten (subject/preview/sender → title/summary/org)', () => {
    expect(
      mapToHits('bericht', [
        {
          id: 'b1',
          subject: 'Wegwerkzaamheden',
          preview: 'De N23 is dicht.',
          sender: { id: 'x', name: 'Provincie Flevoland' },
          publishedAt: '2026-07-01',
        },
      ])
    ).toEqual([
      {
        id: 'b1',
        slug: 'b1',
        type: 'bericht',
        title: 'Wegwerkzaamheden',
        summary: 'De N23 is dicht.',
        org: 'Provincie Flevoland',
        date: '2026-07-01',
        audience: [],
        external: null,
        facts: [],
        tech: [],
      },
    ]);
  });

  it('maps nieuws (title/summary/source)', () => {
    const [hit] = mapToHits('nieuws', [
      {
        id: 'n1',
        title: 'Kabinet',
        summary: 'Beleid',
        source: { id: 's', name: 'Rijksoverheid' },
        publishedAt: '2026-07-02',
      },
    ]);
    expect(hit).toMatchObject({
      slug: 'n1',
      type: 'nieuws',
      title: 'Kabinet',
      org: 'Rijksoverheid',
    });
  });

  it('maps producten and keeps audience', () => {
    const [hit] = mapToHits('product', [
      {
        id: 'p1',
        title: 'Kapvergunning',
        description: 'Bomen kappen',
        modified: '2026-06-01',
        audience: ['ondernemer'],
      },
    ]);
    expect(hit).toMatchObject({
      type: 'product',
      org: 'Provincie Flevoland',
      audience: ['ondernemer'],
    });
  });

  it('maps processen (key→slug, null beschrijving → empty summary)', () => {
    const [hit] = mapToHits('proces', [
      {
        key: 'ZorgtoeslagProces',
        naam: 'Zorgtoeslag',
        beschrijving: null,
        gepubliceerd: '2026-06-01',
        status: 'active',
      },
    ]);
    expect(hit).toMatchObject({
      id: 'ZorgtoeslagProces',
      slug: 'ZorgtoeslagProces',
      type: 'proces',
      title: 'Zorgtoeslag',
      summary: '',
    });
  });

  it('returns [] for regel (owned by Regelcatalogus)', () => {
    expect(mapToHits('regel', [{ anything: true }])).toEqual([]);
  });
});
