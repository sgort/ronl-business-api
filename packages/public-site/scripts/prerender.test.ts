// packages/public-site/scripts/prerender.test.ts
import { describe, it, expect } from 'vitest';
import { escapeHtml, buildSitemap, injectIntoShell } from './prerender';

describe('escapeHtml', () => {
  it('escapes the five XML/HTML-sensitive characters', () => {
    expect(escapeHtml(`<a href="x">B & "C" 'D'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;B &amp; &quot;C&quot; &#39;D&#39;&lt;/a&gt;'
    );
  });
});

describe('buildSitemap', () => {
  it('lists every URL with the site origin, and excludes /woordenboek and /zoeken', () => {
    const xml = buildSitemap('https://publiek.open-regels.nl', [
      '/',
      '/berichten',
      '/berichten/b1',
      '/woordenboek',
      '/zoeken',
    ]);
    expect(xml).toContain('<loc>https://publiek.open-regels.nl/berichten/b1</loc>');
    expect(xml).not.toContain('/woordenboek');
    expect(xml).not.toContain('/zoeken');
  });
});

describe('injectIntoShell', () => {
  const shell = `<!doctype html><html lang="nl"><head><title>Old</title></head><body><div id="root"></div></body></html>`;

  it('replaces the title, injects description + canonical, and fills #root', () => {
    const html = injectIntoShell(shell, {
      title: 'Zorgtoeslag — Open Regels Nederland',
      description: 'Toeslag voor zorgkosten.',
      canonical: 'https://publiek.open-regels.nl/regels/zorgtoeslag',
      bodyFragment: '<main><h1>Zorgtoeslag</h1></main>',
    });
    expect(html).toContain('<title>Zorgtoeslag — Open Regels Nederland</title>');
    expect(html).toContain('name="description" content="Toeslag voor zorgkosten."');
    expect(html).toContain(
      'rel="canonical" href="https://publiek.open-regels.nl/regels/zorgtoeslag"'
    );
    expect(html).toContain('<div id="root"><main><h1>Zorgtoeslag</h1></main></div>');
  });
});
