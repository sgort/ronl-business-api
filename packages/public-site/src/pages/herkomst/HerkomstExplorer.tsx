// packages/public-site/src/pages/herkomst/HerkomstExplorer.tsx
import { Fragment, useEffect, useRef, useState } from 'react';
import type { Lang } from '../../i18n';
import { KT_CONCEPTS, KT_GROUPS, htx } from './herkomstConcepts';
import type { HerkomstStrings } from './herkomstData';
import HerkomstTrace from './HerkomstTrace';
import { nextTrail } from './herkomstTrail';
import { scrollToId } from './herkomstScroll';

const TRAIL_ID = 'herkomst-trail';

export default function HerkomstExplorer({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  const [trail, setTrail] = useState<string[]>(['leeftijd']);
  const cur = trail[trail.length - 1];
  const open = (id: string) => setTrail((tr) => nextTrail(tr, id));
  const ids = Object.keys(KT_CONCEPTS);
  const otherLang: Lang = lang === 'nl' ? 'en' : 'nl';

  // Whichever concept is displayed can change without the page scrolling
  // (list select, chip drill-down, trail-segment click, Begin opnieuw) — if
  // the user was scrolled down into a long trace, the new concept's own
  // trail/header can land off-screen with nothing visible telling them
  // what changed. Bring the trail bar back into view whenever the
  // displayed concept changes, but not on first mount (no navigation has
  // happened yet, so nothing to scroll to).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    scrollToId(TRAIL_ID);
  }, [cur]);

  return (
    <div className="pub-herkomst-exp" id="herkomst">
      <nav className="pub-herkomst-list" aria-label={t.navHerkomst}>
        <div className="pub-herkomst-list-h">{lang === 'nl' ? 'Begrippen' : 'Concepts'}</div>
        {KT_GROUPS.map((g) => (
          <Fragment key={g.id}>
            <div className="pub-herkomst-list-group">{g[lang]}</div>
            {ids
              .filter((id) => KT_CONCEPTS[id].groep === g.id)
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-current={id === cur}
                  onClick={() => setTrail([id])}
                >
                  {htx(KT_CONCEPTS[id].naam, lang)}
                  <small>{htx(KT_CONCEPTS[id].naam, otherLang)}</small>
                </button>
              ))}
          </Fragment>
        ))}
        <div className="pub-herkomst-list-note">
          {lang === 'nl'
            ? 'Alleen het begrip Leeftijd is hier volledig uitgewerkt; de overige drie zijn de gegevens waar Leeftijd op steunt. Andere begrippen volgen dezelfde acht stappen.'
            : 'Only the concept Age is fully worked out here; the other three are the data Age rests on. Other concepts follow the same eight steps.'}
        </div>
      </nav>
      <div className="pub-herkomst-panel">
        <nav
          id={TRAIL_ID}
          className="pub-herkomst-trail"
          aria-label={lang === 'nl' ? 'Kruimelpad herkomst' : 'Herkomst breadcrumb'}
        >
          <span>{t.crumbHome}:</span>
          {trail.map((id, i) => (
            <Fragment key={id + i}>
              {i > 0 ? <span>›</span> : null}
              {i === trail.length - 1 ? (
                <span className="pub-herkomst-here">{htx(KT_CONCEPTS[id].naam, lang)}</span>
              ) : (
                <button type="button" onClick={() => setTrail(trail.slice(0, i + 1))}>
                  {htx(KT_CONCEPTS[id].naam, lang)}
                </button>
              )}
            </Fragment>
          ))}
          {trail.length > 1 ? (
            <button
              type="button"
              style={{ marginLeft: 'auto' }}
              onClick={() => setTrail([trail[0]])}
            >
              {t.reset}
            </button>
          ) : null}
        </nav>
        <HerkomstTrace id={cur} t={t} lang={lang} onOpen={open} />
      </div>
    </div>
  );
}
