// packages/public-site/src/pages/herkomst/HerkomstTrace.tsx
import { Fragment } from 'react';
import type { Lang } from '../../i18n';
import { KT_CONCEPTS, htx } from './herkomstConcepts';
import type { HerkomstStrings } from './herkomstData';
import HerkomstChip from './HerkomstChip';

export default function HerkomstTrace({
  id,
  t,
  lang,
  onOpen,
}: {
  id: string;
  t: HerkomstStrings;
  lang: Lang;
  onOpen: (id: string) => void;
}) {
  const c = KT_CONCEPTS[id];
  const st = t.steps;
  // Improves on the reference prototype's one documented a11y gap: there,
  // track headers are associated with their cells by visual alignment
  // only. Here every cell is programmatically tied to its track header
  // via aria-labelledby so screen reader users get the same "which track
  // am I in" context sighted users get from the sticky header.
  const wetTrackId = `herkomst-track-wet-${id}`;
  const gebruikersTrackId = `herkomst-track-gebruikers-${id}`;

  return (
    <Fragment>
      <div className="pub-herkomst-phead">
        <h3>
          {htx(c.naam, lang)}
          <span className="pub-herkomst-en">
            {lang === 'nl' ? htx(c.naam, 'en') : htx(c.naam, 'nl')}
          </span>
        </h3>
        <p>{htx(c.kort, lang)}</p>
        <div className="pub-herkomst-meta">
          {c.meta.map(([k, v]) => (
            <span className="pub-herkomst-pill" key={k}>
              {k}: <b>{v}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="pub-herkomst-tracks">
        <div className="pub-herkomst-track-h" id={wetTrackId}>
          {t.trackL}
          <span>{t.trackLen}</span>
        </div>
        <div className="pub-herkomst-track-h pub-herkomst-right" id={gebruikersTrackId}>
          {t.trackR}
          <span>{t.trackRen}</span>
        </div>

        <div className="pub-herkomst-row">
          <div className="pub-herkomst-cell" aria-labelledby={wetTrackId}>
            <div className="pub-herkomst-step">
              <i>1</i>
              <div>
                <b>{st[0].l}</b> <em>{st[0].len}</em>
              </div>
            </div>
            <div className="pub-herkomst-quote">
              {htx(c.wet.tekst, lang)}
              <div className="pub-herkomst-src">
                {t.bron}: {c.wet.bron}
              </div>
            </div>
            <div className="pub-herkomst-anno">
              <b>{t.annotatie}</b>
              {htx(c.wet.annotatie, lang)}
            </div>
          </div>
          <div className="pub-herkomst-cell pub-herkomst-r" aria-labelledby={gebruikersTrackId}>
            <div className="pub-herkomst-step">
              <i>1</i>
              <div>
                <b>{st[0].r}</b> <em>{st[0].ren}</em>
              </div>
            </div>
            {c.uitleg.length ? (
              c.uitleg.map((u, i) => (
                <div className="pub-herkomst-anno" key={i}>
                  <b>{htx(u.term, lang)}</b>
                  <span className="pub-herkomst-body">{htx(u.tekst, lang)}</span>
                </div>
              ))
            ) : (
              <div className="pub-herkomst-none">—</div>
            )}
          </div>
        </div>

        <div className="pub-herkomst-row">
          <div className="pub-herkomst-cell" aria-labelledby={wetTrackId}>
            <div className="pub-herkomst-step">
              <i>2</i>
              <div>
                <b>{st[1].l}</b> <em>{st[1].len}</em>
              </div>
            </div>
            <p className="pub-herkomst-body">{htx(c.regel, lang)}</p>
          </div>
          <div className="pub-herkomst-cell pub-herkomst-r" aria-labelledby={gebruikersTrackId}>
            <div className="pub-herkomst-step">
              <i>2</i>
              <div>
                <b>{st[1].r}</b> <em>{st[1].ren}</em>
              </div>
            </div>
            {c.uitvraag.length ? (
              <div className="pub-herkomst-qa">
                {c.uitvraag.map((q, i) => (
                  <div key={i}>
                    <span className="pub-herkomst-q">{htx(q.vraag, lang)}</span>
                    <span className="pub-herkomst-f">{q.veld}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pub-herkomst-none">
                {lang === 'nl'
                  ? 'Niets uit te vragen — dit gegeven ontstaat in het proces zelf.'
                  : 'Nothing to ask — this value arises in the process itself.'}
              </div>
            )}
          </div>
        </div>

        <div className="pub-herkomst-row">
          <div className="pub-herkomst-cell" aria-labelledby={wetTrackId}>
            <div className="pub-herkomst-step">
              <i>3</i>
              <div>
                <b>{st[2].l}</b> <em>{st[2].len}</em>
              </div>
            </div>
            {c.dmn ? (
              <Fragment>
                <div className="pub-herkomst-code">{c.dmn.expr}</div>
                <div className="pub-herkomst-io">
                  <div>
                    <b>{t.input}</b>
                    <ul>
                      {c.dmn.input.map(([k, d, ref]) => (
                        <li key={k}>
                          <code>{k}</code> — {htx(d, lang)}
                          {ref ? (
                            <Fragment>
                              {' '}
                              ·{' '}
                              <a
                                href="#herkomst"
                                onClick={(e) => {
                                  e.preventDefault();
                                  onOpen(ref);
                                }}
                              >
                                {lang === 'nl' ? 'herkomst' : 'provenance'}
                              </a>
                            </Fragment>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <b>{t.output}</b>
                    <ul>
                      {c.dmn.output.map(([k, d]) => (
                        <li key={k}>
                          <code>{k}</code> — {htx(d, lang)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Fragment>
            ) : (
              <div className="pub-herkomst-none">{t.geenDmn}</div>
            )}
          </div>
          <div className="pub-herkomst-cell pub-herkomst-r" aria-labelledby={gebruikersTrackId}>
            <div className="pub-herkomst-step">
              <i>3</i>
              <div>
                <b>{st[2].r}</b> <em>{st[2].ren}</em>
              </div>
            </div>
            <ul className="pub-herkomst-check">
              {c.controle.map((x, i) => (
                <li key={i}>{htx(x, lang)}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pub-herkomst-row">
          <div className="pub-herkomst-cell" aria-labelledby={wetTrackId}>
            <div className="pub-herkomst-step">
              <i>4</i>
              <div>
                <b>{st[3].l}</b> <em>{st[3].len}</em>
              </div>
            </div>
            {c.begrippen.length ? (
              <Fragment>
                <p className="pub-herkomst-body">{t.afgeleid}:</p>
                <div className="pub-herkomst-chips">
                  {c.begrippen.map((b, i) => (
                    <HerkomstChip key={i} c={b} lang={lang} onOpen={onOpen} />
                  ))}
                </div>
                {c.begrippen
                  .filter((b) => b.def)
                  .map((b, i) => (
                    <div className="pub-herkomst-anno" key={'d' + i}>
                      <b>{htx(b.naam, lang)}</b>
                      <span className="pub-herkomst-body">{htx(b.def!, lang)}</span>
                    </div>
                  ))}
              </Fragment>
            ) : (
              <div className="pub-herkomst-none">{t.leaf}</div>
            )}
          </div>
          <div className="pub-herkomst-cell pub-herkomst-r" aria-labelledby={gebruikersTrackId}>
            <div className="pub-herkomst-step">
              <i>4</i>
              <div>
                <b>{st[3].r}</b> <em>{st[3].ren}</em>
              </div>
            </div>
            <div className="pub-herkomst-concl">
              <b>{t.conclJa} — </b>
              {htx(c.conclusie.ja, lang)}
            </div>
            <div className="pub-herkomst-concl pub-herkomst-neg">
              <b>{t.conclNee} — </b>
              {htx(c.conclusie.nee, lang)}
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
