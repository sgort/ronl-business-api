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

  it('replaces an existing <meta name="description"> instead of duplicating it', () => {
    const shellWithDescription = `<!doctype html><html lang="nl"><head>
      <meta charset="UTF-8" />
      <meta
        name="description"
        content="Generic site-wide description."
      />
      <title>Old</title>
    </head><body><div id="root"></div></body></html>`;

    const html = injectIntoShell(shellWithDescription, {
      title: 'Zorgtoeslag — Open Regels Nederland',
      description: 'Toeslag voor zorgkosten.',
      canonical: 'https://publiek.open-regels.nl/regels/zorgtoeslag',
      bodyFragment: '<main><h1>Zorgtoeslag</h1></main>',
    });

    const descriptionCount = (html.match(/<meta\s+name="description"/g) ?? []).length;
    expect(descriptionCount).toBe(1);
    expect(html).toContain('content="Toeslag voor zorgkosten."');
    expect(html).not.toContain('Generic site-wide description.');
  });

  it('embeds route-scoped prerendered data as a JSON script when provided', () => {
    const html = injectIntoShell(shell, {
      title: 't',
      description: 'd',
      canonical: 'c',
      bodyFragment: '<main/>',
      embeddedData: { route: '/regels', data: { services: [{ title: 'Zorgtoeslag' }] } },
    });
    const m = html.match(
      /<script id="__PUB_DATA__" type="application\/json">(.*?)<\/script>/s
    );
    expect(m).toBeTruthy();
    const parsed = JSON.parse(m![1].replace(/\\u003c/g, '<'));
    expect(parsed).toEqual({ route: '/regels', data: { services: [{ title: 'Zorgtoeslag' }] } });
  });

  it('adds no data script when embeddedData is omitted', () => {
    const html = injectIntoShell(shell, {
      title: 't',
      description: 'd',
      canonical: 'c',
      bodyFragment: '<main/>',
    });
    expect(html).not.toContain('__PUB_DATA__');
  });

  it('escapes < in embedded data so a payload cannot break out of the script', () => {
    const html = injectIntoShell(shell, {
      title: 't',
      description: 'd',
      canonical: 'c',
      bodyFragment: '<main/>',
      embeddedData: { route: '/x', data: { evil: '</script><script>alert(1)</script>' } },
    });
    const scriptSection = html.slice(html.indexOf('__PUB_DATA__'));
    expect(scriptSection).not.toContain('</script><script>alert(1)');
  });
});
