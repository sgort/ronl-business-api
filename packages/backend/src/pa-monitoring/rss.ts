/**
 * Minimal RSS 2.0 renderer for GET /v1/pa/signals.rss — the "one query, two
 * renderers" companion to GET /v1/pa/signals: same rows, same rowToSignal
 * mapper, just XML instead of JSON.
 */

import type { Signal } from '@ronl/shared';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRssDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

export function toRssXml(signals: Signal[], feedTitle: string, selfUrl: string): string {
  const items = signals
    .map((s) => {
      const link = s.ref?.url ?? selfUrl;
      const description = s.duiding ?? s.title;
      return `    <item>
      <title>${escapeXml(s.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(s.id)}</guid>
      <pubDate>${toRssDate(s.confirmedAt ?? null)}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(selfUrl)}</link>
    <description>PA-Cockpit — gecureerde signalen</description>
${items}
  </channel>
</rss>
`;
}
