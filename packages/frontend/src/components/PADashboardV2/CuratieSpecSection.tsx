/**
 * CuratieSpecSection — Beheer › Monitoring › "Curatiepijplijn".
 *
 * Read-only explainer of the signal-curation pipeline, sibling of
 * KompasSpecSection: header + the shared CuratiePijplijnFlow diagram + footnotes.
 * The router (PASectionRouter) already wraps Beheer content in
 * <div className="v2-main-pad">, so this returns a bare fragment.
 *
 * Static by design. The same <CuratiePijplijnFlow /> is embedded in Monitoring's
 * inline "Hoe werkt de curatiepijplijn?" explainer — one diagram, two homes.
 */

import CuratiePijplijnFlow from './CuratiePijplijnFlow';

export default function CuratieSpecSection() {
  return (
    <div className="pac-cspec">
      <div className="pac-spec-eyebrow">Monitoring · werkwijze</div>
      <h1 className="pac-page-title" style={{ marginBottom: 8 }}>
        De curatiepijplijn
      </h1>
      <p className="pac-spec-intro" style={{ marginBottom: 4 }}>
        Van rauwe bron tot gecureerd signaal in de cockpit. De cron doet het zware werk — ophalen,
        filteren, scoren — maar een mens beslist altijd. Twee handmatige acties geven de curator
        directe grip: de <b>blanco zoekbalk</b> en <b>Naar inbox</b> (beide op{' '}
        <b>Monitoring → een signaalbron</b>).
      </p>

      <CuratiePijplijnFlow />

      <div className="pac-cspec-notes">
        <div className="note">
          <div className="num">1</div>
          <p>
            <b>De cron leest alléén teambron-zoekvragen.</b> Een persoonlijke zoekopdracht telt pas
            mee ná <code>↗ team</code> (scope wordt <code>tenant</code>).
          </p>
        </div>
        <div className="note man">
          <div className="num">2</div>
          <p>
            <b>Naar inbox slaat de drempel over.</b> <code>promoteToInbox</code> vloert de
            relevantie op ≥ 5 — een mens vond het immers al de moeite waard — en zet 'm als
            kandidaat in dezelfde inbox.
          </p>
        </div>
        <div className="note">
          <div className="num">3</div>
          <p>
            <b>Elke bevestiging is een interventie.</b> De beslissing wordt vastgelegd als{' '}
            <code>AI adviseerde · mens besloot</code> in het interventie-log.
          </p>
        </div>
      </div>
    </div>
  );
}
