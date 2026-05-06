import { useState, type FormEvent } from 'react';

/**
 * Gegevenswoordenboek (V2 wrapper)
 * ---------------------------------------------------------------
 * Wraps the Skosmos iframe in a V2-native chrome:
 *   - V2-styled toolbar above the iframe with section title,
 *     in-V2 search input, language toggle and "open in new tab"
 *   - The search submits a deep-link URL into Skosmos
 *     (`/{lang}/search?clang={lang}&q={term}`) which is the
 *     stable Skosmos URL pattern.
 *
 * The iframe URL appends `?embed=1` so a custom Skosmos theme
 * (see skosmos-theme/ in v2-handoff) can hide its own header,
 * footer and language switcher when this query flag is present.
 */

const SKOSMOS_BASE = 'https://skosmos.open-regels.nl';
const VOCAB = 'ronl'; // default vocabulary (RONL Concepts)
type Lang = 'nl' | 'en';

export default function GegevenswoordenboekV2() {
  const [lang, setLang] = useState<Lang>('nl');
  const [q, setQ] = useState('');
  // Bumping `nonce` forces the iframe to remount when the user submits
  // a new search — without this, setting `src` to the same URL twice
  // does nothing.
  const [nonce, setNonce] = useState(0);
  const [iframeSrc, setIframeSrc] = useState(`${SKOSMOS_BASE}/${VOCAB}/${lang}/?embed=1`);

  function navigate(nextSrc: string) {
    setIframeSrc(nextSrc);
    setNonce((n) => n + 1);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      navigate(`${SKOSMOS_BASE}/${VOCAB}/${lang}/?embed=1`);
      return;
    }
    const url = `${SKOSMOS_BASE}/${VOCAB}/${lang}/search?clang=${lang}&q=${encodeURIComponent(term)}&embed=1`;
    navigate(url);
  }

  function onLangChange(next: Lang) {
    setLang(next);
    // Preserve search term across language switch when present
    if (q.trim()) {
      const url = `${SKOSMOS_BASE}/${VOCAB}/${next}/search?clang=${next}&q=${encodeURIComponent(q.trim())}&embed=1`;
      navigate(url);
    } else {
      navigate(`${SKOSMOS_BASE}/${VOCAB}/${next}/?embed=1`);
    }
  }

  // The "open in new tab" link strips ?embed=1 so the user gets
  // full Skosmos chrome when they leave the dashboard.
  const externalHref = iframeSrc.replace(/[?&]embed=1/, '').replace(/\?$/, '');

  return (
    <div className="v2-gw">
      <div className="v2-gw-toolbar">
        <div className="v2-gw-title">
          <div className="v2-crumb">GEGEVENSWOORDENBOEK</div>
          <div className="v2-gw-source">
            Bron:{' '}
            <a href={SKOSMOS_BASE} target="_blank" rel="noreferrer">
              Skosmos
            </a>
            <span className="v2-gw-source-dot" aria-hidden="true">
              ·
            </span>
            <span>RONL Concepts</span>
          </div>
        </div>

        <form className="v2-gw-search" onSubmit={onSearch} role="search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'nl' ? 'Zoek begrip…' : 'Search term…'}
            aria-label={lang === 'nl' ? 'Zoek in woordenboek' : 'Search dictionary'}
          />
          <button type="submit" className="v2-btn v2-btn-sm">
            {lang === 'nl' ? 'Zoeken' : 'Search'}
          </button>
        </form>

        <div className="v2-gw-toolbar-right">
          <div className="v2-gw-lang" role="group" aria-label="Taal">
            <button
              type="button"
              className={lang === 'nl' ? 'active' : ''}
              onClick={() => onLangChange('nl')}
            >
              NL
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              onClick={() => onLangChange('en')}
            >
              EN
            </button>
          </div>
          <a
            className="v2-gw-external"
            href={externalHref}
            target="_blank"
            rel="noreferrer"
            title={lang === 'nl' ? 'Open in nieuw tabblad' : 'Open in new tab'}
          >
            ↗
          </a>
        </div>
      </div>

      <div className="v2-gw-frame">
        <iframe
          key={nonce}
          src={iframeSrc}
          title="Gegevenswoordenboek — RONL"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
