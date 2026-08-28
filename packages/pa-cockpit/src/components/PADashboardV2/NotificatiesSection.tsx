/**
 * NotificatiesSection — Beheer › Monitoring › "Notificaties".
 *
 * Read-only explainer of the WatchBell & Meldingen notification layer, a
 * sibling of CuratieSpecSection / KompasSpecSection: header + a three-
 * properties table + the NotificatiesFlow matcher diagram + footnotes.
 *
 * PaSectionsRouter — this package's own router, not the host's
 * PASectionRouter — already wraps Beheer content in a <div>, so this returns
 * a bare .pac-cspec block. That wrapper supplies no padding; see the note
 * beside it for why its `v2-main-pad` class is inert under `.pac` and where
 * the padding actually comes from.
 *
 * Static by design — it documents the loop described in docs/WATCHBELL.md.
 * No mutations, no data fetching: it explains the machinery that WatchBell.tsx,
 * NotificationsPanel.tsx and notifications.service.ts already implement.
 *
 * Styles: the shared `.pac-cspec*` / `.pac-spec-table` blocks in dashboard-pa.css
 * (already present — used by CuratiePijplijnFlow and KompasSpecSection) plus the
 * two new rules appended for this page.
 */

/** The three orthogonal properties every saved search carries. */
const NOTIF_PROPS: {
  prop: string;
  code: string;
  q: string;
  where: string;
  tone: 'kern' | 'kans' | 'monitor';
}[] = [
  {
    prop: 'Team · Persoonlijk',
    code: 'scope',
    q: 'Leest de 6-uurs curatiecron deze zoekvraag?',
    where: '↗ team / ↩ persoonlijk — Zoekcriteria',
    tone: 'kern',
  },
  {
    prop: 'Dossier',
    code: 'dossierId',
    q: 'Onder welk dossier wordt een match gearchiveerd?',
    where: 'Zoekcriteria-editor, of de 🔔 op een dossierpagina',
    tone: 'kans',
  },
  {
    prop: '🔔 Volgen',
    code: 'notify',
    q: 'Krijg ík een melding bij een nieuw bevestigd signaal?',
    where: 'WatchBell — Zoekcriteria-rij of dossier-detailkop',
    tone: 'monitor',
  },
];

/**
 * NotificatiesFlow — the WATCHBELL matcher loop as a fluid vertical CSS-grid
 * flow, reusing the exact `.pac-cspec-flow` vocabulary as CuratiePijplijnFlow.
 * Spine runs top→bottom; the two watch-creation sources inject from the left
 * lane into the matcher.
 */
function NotificatiesFlow() {
  return (
    <div className="pac-cspec pac-cspec-embed">
      <div className="pac-cspec-legend">
        <span className="cs-lg">
          <span className="sw sys" /> Automatisch · matcher
        </span>
        <span className="cs-lg">
          <span className="sw man" /> Handmatig · curator zet 🔔
        </span>
      </div>

      <div className="pac-cspec-flow">
        {/* Trigger — a signal-confirming event fires the matcher */}
        <div className="fr">
          <div className="st sys">
            <div className="kn">gebeurtenis · vier triggerpunten</div>
            <div className="nt">Bevestigd signaal</div>
            <div className="nd">
              De matcher draait synchroon vóór het HTTP-antwoord — nooit op een timer, altijd ná een
              gebeurtenis die een watch nieuw kan raken.
            </div>
            <div className="row-tags">
              <span className="ntag">confirm</span>
              <span className="ntag">link-dossier</span>
              <span className="ntag">watch-toggle</span>
              <span className="ntag">cycle · cron 6u</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line" />
        </div>

        {/* Watches injected from the left lane → the matcher */}
        <div className="fr">
          <div className="side-chain">
            <div className="st man">
              <div className="kn">🔔 op een Zoekcriteria-rij</div>
              <div className="nt">Topic-watch</div>
              <div className="nd">
                Matcht een bevestigd signaal als een <b>OR-term</b> in titel of duiding raakt —
                optioneel verder ingeperkt op dossier.
              </div>
            </div>
            <div className="chain-conn" />
            <div className="st man">
              <div className="kn">🔔 op een dossierpagina</div>
              <div className="nt">Dossier-watch</div>
              <div className="nd">
                Een persoonlijke rij met <b>lege zoekvraag</b> + <code>dossierId</code> — matcht{' '}
                <b>élk</b> bevestigd signaal van dat dossier.
              </div>
            </div>
          </div>
          <div className="arm" />
          <div className="st sys">
            <div className="kn">notifications.service · computeNotifications</div>
            <div className="nt">Matcher</div>
            <div className="nd">
              Volledige scan: elke watch met <code>notify = true</code> × elk <b>bevestigd</b>{' '}
              signaal. Bewust simpel — geen incrementele diffing.
            </div>
            <div className="row-tags">
              <span className="ntag">watches × signalen</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line" />
        </div>

        {/* matchWatch decision */}
        <div className="fr">
          <div className="st gate">
            <div className="kn">matchWatch()</div>
            <div className="nt">Raakt het?</div>
            <div className="nd">
              Dossier-watch: <code>signal.dossier_id === watch.dossier_id</code>. Topic-watch:
              OR-term raakt titel/duiding.
            </div>
            <div className="row-tags">
              <span className="gate-badge">alleen status = confirmed</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line" />
        </div>

        {/* Dedup + cross-watch collapse */}
        <div className="fr">
          <div className="st sys">
            <div className="kn">pa_notifications · INSERT … ON CONFLICT</div>
            <div className="nt">Ontdubbelen &amp; samenvoegen</div>
            <div className="nd">
              Twee overlappende watches op één signaal → <b>één</b> melding die beide herkomsten
              toont. Eén per <code>(user, signal)</code>; al geleverd blijft geleverd.
            </div>
            <div className="row-tags">
              <span className="prov-badge">UNIQUE (user_id, signal_id)</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line green" />
        </div>

        {/* Meldingen hub */}
        <div className="fr">
          <div className="st hub">
            <div className="kn">mens · in de cockpit</div>
            <div className="nt">Meldingen</div>
            <div className="nd">
              Belletje met ongelezen-badge + slide-over paneel. Eén gedeelde bron — badge en paneel
              lopen altijd synchroon.
            </div>
            <div className="cspec-inject">
              ◂ realtime herberekend — de <b>watch-toggle</b>-trigger levert de achterstand meteen
              bij het aanzetten.
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line green" />
        </div>

        {/* Delivery */}
        <div className="fr">
          <div className="st out">
            <div className="kn">levering</div>
            <div className="nt">In-app + persoonlijke RSS</div>
            <div className="nd">
              Badge in de cockpit én een privé RSS-feed (<code>?token=</code>, kopieerbaar op
              Signaalbronnen). <b>Geen e-maildigest</b> — die infrastructuur bestaat hier niet.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificatiesSection() {
  return (
    <div className="pac-cspec">
      <div className="pac-spec-eyebrow">Monitoring · werkwijze</div>
      <h1 className="pac-page-title" style={{ marginBottom: 8 }}>
        Notificaties
      </h1>
      <p className="pac-spec-intro" style={{ marginBottom: 12 }}>
        Hoe een PA-adviseur een melding krijgt bij een nieuw bevestigd signaal — zonder het
        dashboard te hoeven verversen. Een <b>watch</b> is een opgeslagen zoekvraag met{' '}
        <code>notify = true</code>. Een cross-watch matcher herberekent bij elke gebeurtenis en
        levert via de <b>Meldingen</b>-inbox plus een persoonlijke RSS-feed. Watchen verandert nooit
        wát de cron ophaalt — alleen wíe er een melding van krijgt.
      </p>
      <p className="pac-spec-intro" style={{ marginBottom: 12 }}>
        Zet een watch aan met de 🔔 op een <b>Zoekcriteria</b>-rij (topic-watch) of in de detailkop
        van een <b>dossier</b> (dossier-watch). Wát er daarvóór gebeurt staat op{' '}
        <b>Curatiepijplijn</b>; wélke bronnen voeden staat op <b>Signaalbronnen</b>.
      </p>

      {/* Drie orthogonale eigenschappen van één opgeslagen zoekvraag — makkelijk te verwarren. */}
      <div className="pac-notif-props">
        <div className="pac-beheer-card-label">Drie eigenschappen · drie verschillende vragen</div>
        <table className="pac-spec-table">
          <thead>
            <tr>
              <th>Eigenschap</th>
              <th>De vraag die het beantwoordt</th>
              <th>Waar je het zet</th>
            </tr>
          </thead>
          <tbody>
            {NOTIF_PROPS.map((p) => (
              <tr key={p.code}>
                <td>
                  <span className={`pac-spec-dot tone-${p.tone}`} /> <b>{p.prop}</b>
                  <div className="pac-notif-code">{p.code}</div>
                </td>
                <td>{p.q}</td>
                <td>{p.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pac-beheer-note">
          <code>scope</code> en <code>notify</code> staan los van elkaar: een persoonlijke én een
          team-zoekvraag kunnen gewatcht worden, en beide kunnen bestaan zónder watch.
        </p>
      </div>

      <NotificatiesFlow />

      <div className="pac-cspec-notes">
        <div className="note">
          <div className="num">1</div>
          <p>
            <b>Watchen staat los van de cron.</b> <code>notify</code> bepaalt alleen de levering —
            het raakt nooit wát de curatiepijplijn ophaalt. Dat regelt <code>↗ team</code> op
            Zoekcriteria.
          </p>
        </div>
        <div className="note man">
          <div className="num">2</div>
          <p>
            <b>Een team-zoekvraag krijgt een persoonlijke afgeleide.</b> Seed-rijen hebben geen
            eigenaar, dus 🔔 erop maakt een eigen kopie (<code>source_search_id</code>) die de
            matcher wél kan bezorgen — jouw abonnement, niet dat van collega's.
          </p>
        </div>
        <div className="note">
          <div className="num">3</div>
          <p>
            <b>Alleen bevestigde signalen melden — kandidaten nooit.</b> Bewust: de cockpit werkt op
            'een mens beslist'. <b>Alles gelezen</b> zet de badge op 0; hetzelfde signaal keert niet
            terug (<code>alreadyExisted</code>, niet <code>inserted</code>).
          </p>
        </div>
      </div>
    </div>
  );
}
