// packages/public-site/src/pages/herkomst/HerkomstExplorer.tsx
import { Fragment, useState } from 'react';
import type { Lang } from '../../i18n';
import { KT_CONCEPTS, KT_GROUPS, htx } from './herkomstConcepts';
import type { HerkomstStrings } from './herkomstData';
import HerkomstTrace from './HerkomstTrace';

export function nextTrail(trail: string[], id: string): string[] {
  return trail[trail.length - 1] === id ? trail : [...trail, id];
}

export default function HerkomstExplorer({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  const [trail, setTrail] = useState<string[]>(['leeftijd']);
  const cur = trail[trail.length - 1];
  const open = (id: string) => setTrail((tr) => nextTrail(tr, id));
  const ids = Object.keys(KT_CONCEPTS);
  const otherLang: Lang = lang === 'nl' ? 'en' : 'nl';

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
