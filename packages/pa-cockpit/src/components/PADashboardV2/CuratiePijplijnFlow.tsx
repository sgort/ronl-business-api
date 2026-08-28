/**
 * CuratiePijplijnFlow — the shared curator-pipeline diagram.
 *
 * Reused by:
 *   · CuratieSpecSection (Beheer › Monitoring › Curatiepijplijn) — the spec page
 *   · Monitoring's inline "Hoe werkt de curatiepijplijn?" explainer (Inbox)
 *
 * A FLUID vertical flow (CSS grid, no transform-scaling) so it reads at full
 * size at any width. The automated cron spine runs top→bottom; the two manual
 * curator actions inject from the left lane at the stage they touch:
 *   · Team-zoekvragen (promoted with ↗ team)  → Ophalen
 *   · Blanco zoekbalk → Rauwe treffers → Naar inbox → Inbox
 *
 * Styles: the `.pac-cspec*` block in dashboard-pa.css (see the handoff snippet).
 */

export default function CuratiePijplijnFlow() {
  return (
    <div className="pac-cspec pac-cspec-embed">
      <div className="pac-cspec-legend">
        <span className="cs-lg">
          <span className="sw sys" /> Automatisch · systeem/cron
        </span>
        <span className="cs-lg">
          <span className="sw man" /> Handmatig · curator
        </span>
      </div>

      <div className="pac-cspec-flow">
        {/* Bronnen */}
        <div className="fr">
          <div className="st sys">
            <div className="kn">Bron · PlatO</div>
            <div className="srcline">
              <b>Tweede Kamer</b>
              <span>OData</span>
            </div>
            <div className="srcline">
              <b>Officiële Bekendmakingen</b>
              <span>SRU</span>
            </div>
            <div className="srcline">
              <b>Europees Parlement</b>
              <span className="live">RSS ✓</span>
            </div>
            <div className="srcline">
              <b>Nieuws &amp; media</b>
              <span className="live">aggregator ✓</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line" />
        </div>

        {/* Ophalen — fed by team-zoekvragen (left lane) */}
        <div className="fr">
          <div className="side input">
            <div className="kn">pa_saved_searches · tenant</div>
            <div className="nt">Team-zoekvragen</div>
            <div className="nd">
              Sturen wát de cron ophaalt. Met <b>↗ team</b> promoveert de curator een persoonlijke
              zoekvraag hiernaartoe.
            </div>
          </div>
          <div className="arm blue" />
          <div className="st sys">
            <div className="kn">cron · runCurationCycle</div>
            <div className="nt">Ophalen</div>
            <div className="nd">
              Per zoekvraag opgehaald (EU 1×), ontdubbeld op <b>bron:id</b>.
            </div>
            <div className="row-tags">
              <span className="ntag">top 20 · EU top 50</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line" />
        </div>

        {/* Regels & score */}
        <div className="fr">
          <div className="st gate">
            <div className="kn">rules.ts · scoreItem</div>
            <div className="nt">Regels &amp; score</div>
            <div className="nd">Basis 3 · +2 zwaartype · +match op titel/tag.</div>
            <div className="row-tags">
              <span className="gate-badge">drempel · rel ≥ 4</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line" />
        </div>

        {/* AI-duiding */}
        <div className="fr">
          <div className="st sys">
            <div className="kn">optioneel</div>
            <div className="nt">AI-duiding</div>
            <div className="nd">
              Stelt duiding voor → status <b>ai_drafted</b>.
            </div>
            <div className="row-tags">
              <span className="off-badge">standaard uit · stub → null</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line" />
        </div>

        {/* Inbox — also fed by the manual search chain (left lane) */}
        <div className="fr">
          <div className="side-chain">
            <div className="st man">
              <div className="kn">handmatig · GET /pa/feed</div>
              <div className="nt">Blanco zoekbalk</div>
              <div className="nd">
                Vrij zoeken door de rauwe bronfeeds (TK + OB), los van de curatie.
              </div>
            </div>
            <div className="chain-conn" />
            <div className="st raw">
              <div className="kn">rauw · ongescoord</div>
              <div className="nt">Rauwe treffers</div>
              <div className="nd">Geen relevantie, geen duiding — direct uit de bron.</div>
            </div>
          </div>
          <div className="arm" />
          <div className="st hub">
            <div className="kn">mens · review</div>
            <div className="nt">Inbox</div>
            <div className="nd">Kandidaten + AI-concepten wachten op bevestiging.</div>
            <div className="cspec-inject">
              ◂ óók via <b>Naar inbox</b> — rel gevloerd op ≥ 5, omzeilt de ≥4-drempel.
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line green" />
        </div>

        {/* Bevestigen */}
        <div className="fr">
          <div className="st out">
            <div className="kn">POST /signals/:id/confirm</div>
            <div className="nt">Bevestigen</div>
            <div className="nd">Curator bevestigt, duidt of negeert.</div>
            <div className="row-tags">
              <span className="prov-badge">AI adviseerde · mens besloot</span>
            </div>
          </div>
        </div>
        <div className="fr conn">
          <span className="line green" />
        </div>

        {/* Gecureerd */}
        <div className="fr">
          <div className="st out">
            <div className="kn">in de cockpit</div>
            <div className="nt">Gecureerd</div>
            <div className="nd">
              Verschijnt in Monitoring, per dossier. Geen ruis — alleen wat ertoe doet.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
