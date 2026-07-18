import { toRssXml } from './rss';
import type { Signal } from '@ronl/shared';

function baseSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-1',
    tab: 'politiek',
    dossierId: null,
    title: 'Titel',
    src: 'TK · Motie',
    bron: 'tk',
    ref: null,
    rel: 8,
    impact: null,
    impactLabel: null,
    duiding: null,
    status: 'confirmed',
    ...overrides,
  };
}

describe('toRssXml', () => {
  it('renders a valid RSS 2.0 envelope with the given feed title and self link', () => {
    const xml = toRssXml([], 'PA-Cockpit — gecureerde signalen', 'https://example.test/rss');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<title>PA-Cockpit — gecureerde signalen</title>');
    expect(xml).toContain('<link>https://example.test/rss</link>');
  });

  it('renders one item per signal with guid, pubDate, and description', () => {
    const signals = [
      baseSignal({ id: 'sig-1', title: 'Eerste', duiding: 'Duidingstekst' }),
      baseSignal({ id: 'sig-2', title: 'Tweede', confirmedAt: '2026-07-01T10:00:00Z' }),
    ];
    const xml = toRssXml(signals, 'Feed', 'https://example.test/rss');

    expect((xml.match(/<item>/g) ?? []).length).toBe(2);
    expect(xml).toContain('<guid isPermaLink="false">sig-1</guid>');
    expect(xml).toContain('<guid isPermaLink="false">sig-2</guid>');
    expect(xml).toContain('<description>Duidingstekst</description>');
    // No duiding → falls back to the title.
    expect(xml).toContain('<description>Tweede</description>');
  });

  it("uses the signal's ref url as the item link when present, else the feed's self url", () => {
    const withRef = baseSignal({
      id: 'sig-1',
      ref: { type: 'Motie', nr: '2026D1', url: 'https://tweedekamer.nl/2026D1' },
    });
    const withoutRef = baseSignal({ id: 'sig-2', ref: null });
    const xml = toRssXml([withRef, withoutRef], 'Feed', 'https://example.test/rss');

    expect(xml).toContain('<link>https://tweedekamer.nl/2026D1</link>');
    // Falls back to selfUrl for the item with no ref.
    const itemBlocks = xml.split('<item>').slice(1);
    expect(itemBlocks[1]).toContain('<link>https://example.test/rss</link>');
  });

  it('escapes XML-significant characters in title and description', () => {
    const signal = baseSignal({
      id: 'sig-1',
      title: 'Kamer & Kabinet <overleg>',
      duiding: 'Risico "hoog" & urgent',
    });
    const xml = toRssXml([signal], 'Feed', 'https://example.test/rss');

    expect(xml).toContain('Kamer &amp; Kabinet &lt;overleg&gt;');
    expect(xml).toContain('Risico &quot;hoog&quot; &amp; urgent');
    expect(xml).not.toContain('<overleg>');
  });
});
