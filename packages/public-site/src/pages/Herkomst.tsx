// packages/public-site/src/pages/Herkomst.tsx
import type { Translations, Lang } from '../i18n';
import Crumbs from '../components/Crumbs';
import { HERKOMST_STRINGS } from './herkomst/herkomstData';
import HerkomstExplorer from './herkomst/HerkomstExplorer';
import HerkomstBackground from './herkomst/HerkomstBackground';
import { scrollToId } from './herkomst/herkomstScroll';

export default function Herkomst({ lang }: { t: Translations; lang: Lang }) {
  const t = HERKOMST_STRINGS[lang];

  return (
    <main id="pub-main" className="pub-main pub-herkomst-k">
      <div className="pub-herkomst-wrap">
        <Crumbs
          lang={lang}
          trail={[
            { label: t.crumbs[0], to: '/regels' },
            { label: t.crumbs[1], to: '/regels' },
            { label: t.crumbs[2] },
          ]}
        />
        <div className="pub-herkomst-pagehead">
          <div>
            <div className="pub-herkomst-kicker">{t.kicker}</div>
            <h1>{t.title}</h1>
            <p className="pub-herkomst-sub">{t.sub}</p>
            <p className="pub-herkomst-lede">{t.lede}</p>
          </div>
          <aside className="pub-herkomst-jump">
            <b>{t.jump}</b>
            <button type="button" onClick={() => scrollToId('pijplijn')}>
              {t.navPijplijn}
            </button>
            <button type="button" onClick={() => scrollToId('conceptketen')}>
              {t.navConcept}
            </button>
            <button type="button" onClick={() => scrollToId('standaarden')}>
              {t.navStandaarden}
            </button>
          </aside>
        </div>
        <HerkomstExplorer t={t} lang={lang} />
      </div>
      <HerkomstBackground t={t} lang={lang} />
    </main>
  );
}
