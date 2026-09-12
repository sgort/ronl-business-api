import type { Lang } from '../../i18n';
import { htx } from './herkomstConcepts';
import type { HerkomstStrings } from './herkomstData';
import { KT_STAGES, KT_ABC, KT_STANDARDS } from './herkomstData';

function HerkomstSectionHead({ h, en, lede }: { h: string; en: string; lede: string }) {
  return (
    <>
      <h2 className="pub-herkomst-sec-h pub-herkomst-sm">{h}</h2>
      <div className="pub-herkomst-sec-en">{en}</div>
      <p className="pub-herkomst-sec-lede">{lede}</p>
    </>
  );
}

function HerkomstPipeline({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  return (
    <section className="pub-herkomst-block" id="pijplijn">
      <HerkomstSectionHead h={t.pijplijnH} en={t.pijplijnEn} lede={t.pijplijnLede} />
      <div className="pub-herkomst-pipe">
        {KT_STAGES.map((s) => (
          <article className="pub-herkomst-stage" key={s.no}>
            <div className="pub-herkomst-stage-top">
              <div className="pub-herkomst-stage-no">{s.no}</div>
              <div>
                <b>{htx(s.naam, lang)}</b>
                <span>{lang === 'nl' ? s.en : htx(s.naam, 'nl')}</span>
              </div>
            </div>
            <div className="pub-herkomst-stage-body">
              <div className="pub-herkomst-tool">
                <b>{s.tool}</b>
                <span>{htx(s.toolSub, lang)}</span>
                {s.nieuw ? (
                  <span className="pub-herkomst-badge">
                    {lang === 'nl' ? 'Nieuw in stack' : 'New in stack'}
                  </span>
                ) : null}
              </div>
              <p className="pub-herkomst-stage-note">{htx(s.note, lang)}</p>
              <div className="pub-herkomst-out">
                <b>{lang === 'nl' ? 'Levert op' : 'Produces'}</b>
                {htx(s.out, lang)}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HerkomstConceptChain({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  return (
    <section className="pub-herkomst-block" id="conceptketen">
      <HerkomstSectionHead h={t.conceptH} en={t.conceptEn} lede={t.conceptLede} />
      <div className="pub-herkomst-abc">
        {KT_ABC.map((c, i) => (
          <div className="pub-herkomst-abc-cell" key={c.tag}>
            <div className="pub-herkomst-abc-tag">
              {c.tag} · {lang === 'nl' ? 'stadium' : 'stage'} {i + 1}
            </div>
            <h4>
              {htx(c.naam, lang)}
              <span className="pub-herkomst-en">{lang === 'nl' ? c.en : htx(c.naam, 'nl')}</span>
            </h4>
            <p>{htx(c.tekst, lang)}</p>
          </div>
        ))}
      </div>
      <div className="pub-herkomst-catband">
        <div className="pub-herkomst-cat">
          <b>{lang === 'nl' ? 'Regelcatalogus' : 'Rule catalogue'}</b>
          <span>
            {lang === 'nl'
              ? 'bevat (a) + (b) — de wettekst én de interpretatie ervan'
              : 'holds (a) + (b) — the legal text and its interpretation'}
          </span>
        </div>
        <div className="pub-herkomst-cat">
          <b>{lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}</b>
          <span>{lang === 'nl' ? 'bevat (c)' : 'holds (c)'}</span>
        </div>
        <div className="pub-herkomst-connector">
          <b>{lang === 'nl' ? 'Procesbibliotheek' : 'Process library'}</b> —{' '}
          {lang === 'nl'
            ? 'de connector: verbindt regels (a + b) en data (c) via processen. Zonder deze schakel zijn het twee losse catalogi.'
            : 'the connector: it links rules (a + b) and data (c) through processes. Without it they are two unconnected catalogues.'}
        </div>
      </div>
    </section>
  );
}

function HerkomstStandards({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  return (
    <section className="pub-herkomst-block" id="standaarden">
      <HerkomstSectionHead h={t.stdH} en={t.stdEn} lede={t.stdLede} />
      <div className="pub-herkomst-std">
        <div className="pub-herkomst-std-lab">
          {t.stdOpen}
          <span>{t.stdOpenSub}</span>
        </div>
        <div className="pub-herkomst-std-body">
          {KT_STANDARDS.open.map((s) => (
            <span className="pub-herkomst-std-item" key={s}>
              {s}
            </span>
          ))}
        </div>
        <div className="pub-herkomst-std-lab pub-herkomst-closed">
          {t.stdClosed}
          <span>{t.stdClosedSub}</span>
        </div>
        <div className="pub-herkomst-std-body pub-herkomst-muted">
          {KT_STANDARDS.closed[lang].map((s) => (
            <span className="pub-herkomst-std-item" key={s}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HerkomstBackground({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  return (
    <div className="pub-herkomst-ctx" id="achtergrond">
      <div className="pub-herkomst-wrap">
        <div className="pub-herkomst-ctx-h">
          <h2>{t.ctxH}</h2>
          <p>{t.ctxLede}</p>
        </div>
        <HerkomstPipeline t={t} lang={lang} />
        <HerkomstConceptChain t={t} lang={lang} />
        <HerkomstStandards t={t} lang={lang} />
      </div>
    </div>
  );
}
