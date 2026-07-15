// RONL Business API Changelog Data
// Format matches CPSV Editor and Linked Data Explorer

export interface FeedbackItem {
  type: 'feedback' | 'usecase';
  iid: number;
  title: string;
  url: string;
}

export type ChangelogItem = string | FeedbackItem;

export interface ChangelogSection {
  icon: string;
  iconColor: string;
  title: string;
  items: ChangelogItem[];
}

export interface ChangelogVersion {
  version: string;
  status: string;
  statusColor: string;
  borderColor: string;
  date: string;
  sections: ChangelogSection[];
}

export interface Changelog {
  versions: ChangelogVersion[];
}

export const changelog: Changelog = {
  versions: [
    {
      version: '3.8.2',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 15, 2026',
      sections: [
        {
          icon: '💬',
          iconColor: 'purple',
          title: 'Feedback / use case handled',
          items: [
            {
              type: 'feedback',
              iid: 43,
              title:
                'Melding "sessie verlengen" verschijnt tijdens actief gebruik, en ingevoerde feedback verdwijnt zodra je de sessie verlengt',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/43',
            },
          ],
        },
        {
          icon: '⏱️',
          iconColor: 'orange',
          title: 'Fix: Session-expiry warning no longer interrupts (or discards) active work',
          items: [
            'Warning appearing during active use: SessionExpiryWarning now treats real interaction (keydown / pointerdown / mousemove / scroll, throttled to once per 30s) as a reason to keep the session alive — it calls keycloak.updateToken() once the token drops below 180s, deliberately above the 120s warning threshold, so an actively-typing user is refreshed before the modal would ever appear. The earlier "refresh only on API request" mitigation never covered this, because filling in a form makes no API calls.',
            'Modal being yanked away on mouse-move: once the modal IS showing, activity is now intentionally ignored (tracked via a ref) and the dialog must be dismissed with an explicit Sessie verlengen / Uitloggen. Previously the mousemove listener refreshed the token and auto-closed the modal as the user moved toward the button, so the click appeared to fail.',
            'Feedback lost on extend: IouFeedbackSection persists its text fields to sessionStorage on every change, restores them on mount, and clears them on successful submit. Because sessionStorage survives the full-page keycloak.login() redirect — the actual path that wiped the form when the SSO session had to be re-established — an in-progress feedback draft now survives a session-expiry re-authentication. Screenshots (File objects) cannot be serialised and are not restored.',
            'Both components are shared, so the fix lands on every board at once — Infra-board, Caseworker V2, PA-Cockpit and Woo.',
          ],
        },
      ],
    },
    {
      version: '3.8.1',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 9, 2026',
      sections: [
        {
          icon: '📚',
          iconColor: '#0046ad',
          title: 'Regelcatalogus — rules and concepts now resolve for CPRMV 0.4.1 datasets',
          items: [
            "The Regelcatalogus rules query joined ?rule cpsv:implements ?service directly, but since the CPSV-AP RuleShape change a cpsv:Rule's cpsv:implements points at an eli:LegalResource (the resource the service declares via cv:hasLegalResource). Datasets published in the newer shape — e.g. the Flevoland Thuisbatterij service — therefore showed no rules. The query now matches rules via both the direct edge and the shared legal resource, and reads validFrom/confidence from cprmv041: instead of ronl:.",
            "The Begrippen (concepts) query broke at the variable→DMN hop: a concept's dct:subject points at a bare DMN variable URI (<dmnUri>/input/N or /output/N) that newer exports emit without a cpsv:isRequiredBy / cpsv:produces edge. It now derives the DMN URI from the variable URI as a fallback (OPTIONAL edges + COALESCE) and matches both cprmv:implements and cprmv041:implements — the concepts query previously only queried the 0.3.0 namespace. Thuisbatterij's 21 concepts now appear under Begrippen.",
            "Auto-generated DMN decision rules ('Decision rule <id>' placeholder titles) are filtered out of the Regels tab and SELECT DISTINCT de-duplicates, so the catalogue shows the real business rules (144 → 84 across all services). Applies to both the Regelcatalogus API and the TriplyDB MCP tools.",
          ],
        },
        {
          icon: '🔄',
          iconColor: '#b45309',
          title: 'Regelcatalogus — manual refresh button (cache bypass)',
          items: [
            'The Regelcatalogus is served from a 5-minute server-side cache, which made it hard to see freshly-published TriplyDB data while debugging. A new "Vernieuwen" button forces a rebuild: GET /v1/public/regelcatalogus?refresh=true bypasses and busts the in-memory caches (catalogue + logo assets) and re-fetches everything.',
            'The header shows a "Bijgewerkt <time> geleden" indicator (meta.cache reports cache freshness), and a failed refresh keeps the loaded catalogue visible with an inline error instead of blanking the view.',
          ],
        },
      ],
    },
    {
      version: '3.8.0',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 9, 2026',
      sections: [
        {
          icon: '📁',
          iconColor: '#0046ad',
          title:
            'Feature: PA-Cockpit Dossierbeheer — the authoring source for /pa/dossiers, closing the mock→live loop',
          items: [
            "New Beheer → Strategisch kompas → Dossierbeheer surface: the kernteam Public Affairs now creates, administers, archives (Archiefwet) and deletes dossiers here. This was the missing source that kept the cockpit's dossiers resource behind MOCK_DOSSIERS — with an authoring surface in place, the same dossiers can be served live through usePaData().dossiers with no screen changes (the seam the provider rework bought).",
            'Overview: role bar (token-derived capability matrix + Keycloak role id), mock/live flag banner, four summary stats, and dossiers grouped actief / sluimerend / gearchiveerd with role-gated row actions (Bewerken/Bekijken · Archiveren · Verwijderen).',
            'Editor: two-column layout — Kerngegevens, a Kompas 0–2 start-scorer (8 criteria; re-scoring stays in Voortgang → Kompas-log), and three Markdown narrative fields (waaromNu / waarover / onsVerhaal). Sticky aside carries save/publish, a snippet library that inserts at the caret of the focused field, per-dossier version history, and the archive/delete lifecycle — all role-gated.',
            'Markdown-first narrative: fields are authored and stored as raw Markdown, rendered on demand with react-markdown + remark-gfm and sanitised with rehype-sanitize (raw HTML disabled). A template gallery (create step 1), a snippet library, and per-dossier version history sit around the editor. Archiefwet archiving captures classificatie + bewaartermijn + grondslag and makes the dossier read-only (edits refused server-side); un-archiving is an explicit Beheerder action that restores it as a concept; hard delete is admin-only with type-to-confirm.',
            'Backend: new pa_dossiers (governance columns + kompas/md/body JSONB), pa_dossier_versions (immutable, one row appended per write), pa_templates and pa_snippets tables, seeded from the canonical @ronl/shared dossier data. Routes under the existing PA auth block: GET/POST/PATCH/DELETE /pa/dossiers, POST /pa/dossiers/:id/archive, and GET/POST /pa/templates + /pa/snippets. GET /pa/dossiers serves the cockpit its rich published, non-archived list; ?admin=1 serves the full governance list.',
            'Role-based access via real Keycloak realm roles on top of public-affairs: pa-author (create, edit) · pa-editor (+ templates, publish) · pa-admin (+ archive, delete). Publishing and archiving/deleting are gated on the route and reflected live in the role bar; a user without any sub-role is read-only. The three roles are defined in the realm config and assigned to the test-pa-flevoland user.',
            'Runtime mock/live toggle: VITE_PA_DOSSIERS_MOCK stays the build-time default, but the Dossierbeheer flag banner flips a persisted localStorage override that fetchDossiers reads — so the cockpit can switch between MOCK_DOSSIERS and the live backend without a rebuild, and the choice survives navigation and reloads. In mock mode the whole surface runs on a local in-memory store seeded from the mock dossiers, so every page can be validated before the backend is wired.',
            'Tests: 28 backend route tests cover auth/capability gating (401/403), validation, Archiefwet metadata capture, and version-append-on-write; the full PA backend suite (256 tests) stays green.',
          ],
        },
        {
          icon: '🔧',
          iconColor: '#b45309',
          title: 'Fix: Dossierbeheer — corrections from live validation',
          items: [
            'Partial-Kompas crash guard: a dossier authored with only some of the 8 Kompas criteria scored produced a partial Kompas that crashed the cockpit Issuekaart scorecard (indexing kompas[key].score on an undefined criterion → blank page, hit first because an alphabetically-early new dossier became the default selection). The scorecard now defaults missing criteria, and the backend serves a complete Kompas — completeKompas() fills all criteria in buildBodyFromAuthoring and normalises partial rows on read — so authored dossiers render safely.',
            'Archiving is now genuinely terminal: an archived dossier opens read-only (all fields locked, no save/publish) and PATCH /pa/dossiers/:id is refused with 409 ARCHIVED_READONLY — closing a loophole where flipping Status back to Actief silently un-archived it.',
            'Explicit un-archive for Beheerder (pa-admin): POST /pa/dossiers/:id/unarchive restores a dossier as a concept (status → actief, Archiefwet metadata cleared, gepubliceerd = false, version appended), surfaced as Herstellen on the row and Dearchiveren in the editor lifecycle.',
            'Rail/create-flow no longer desync: the “+ Nieuw dossier” flow navigates the real db-nieuw rail section instead of an internal-only view, and the two Dossierbeheer rail items get distinct keys — so the rail highlight always matches the content and “Dossierbeheer” reliably returns to the overview.',
            'Shell reconciles a deleted/archived active dossier: deleting or archiving the dossier you are viewing (e.g. from Beheer) now re-points the cockpit selection to a live dossier when you return to Dossiers, instead of a dangling section; the unknown-section fallback became a friendly “niet (meer) beschikbaar” message with a link to a live dossier.',
            'A failed create/edit/archive/unarchive/delete now shows a dismissible inline error and keeps the list intact, rather than blanking the whole overview with “Kon dossiers niet laden”.',
            'Acceptance now reads live dossiers by default (VITE_PA_DOSSIERS_MOCK=false), completing the flag flip. Backend PA suite grows to 864 tests (dossiers routes at 35), all green.',
          ],
        },
      ],
    },
    {
      version: '3.7.3',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 7, 2026',
      sections: [
        {
          icon: '🧪',
          iconColor: '#2d7a33',
          title:
            'Tests: backend coverage campaign — branch-gap closure across all service and route layers',
          items: [
            'Backend coverage campaign completed in two phases: a behavior + fetch-orchestration phase grew the suite from ~667 to 786 tests — closing "file-touched ≠ behavior-covered" gaps where a test file exercised only a pure helper while the real HTTP / pagination / guard logic went untested — then a branch-gap phase took it to 829. All passing on every commit; headline now 94% statements · 74% branch · 96% lines.',
            'Standalone MCP servers (mcp-servers/lde, mcp-servers/triplydb) brought under test for the first time — both modules have no exports and self-connect a stdio transport on import, so the tests mock the MCP SDK Server to capture the ListTools/CallTool handlers and drive them directly (pg mocked for lde, global fetch for triplydb). lde 98% lines, triplydb 100%.',
            'pa.routes.ts expanded from auth-gating only (7 tests) to the full route surface (60 tests): /feed source-routing + Promise.allSettled partial-failure tolerance + synchronous-throw 502, /agenda dossier enrichment, /types, /curator run + status, searches CRUD + validation, /sources/status, and the /signals query-builder branches. 50% → 100% lines, 100% functions.',
            'PA source-client fetch layers, previously untested behind their pure parsers: media.client fetchFlevolandNews (request shape, malformed-article skip, retry loop) 30% → 96% lines; eu.client fetchFeed (cache + HTTP) / fetchEuFeed (parallel + dedup + paging) / inferType / parseRssFile 64% → 99%; ep-texts-submitted.client full pagination engine (dedup, early-stop on known refs, per-tab failure tolerance, rawDocToFeedItem) 53% → 98%.',
            'net-guard SSRF guard raised to 100% lines / 100% functions: IPv4 + IPv6 classification, every DNS-resolution path (literal-IP, resolves-to-private, DNS-failure, real defaultResolver), fetchLimited response-cap re-throw, and safeFetch end-to-end.',
            'operaton.service.ts: branch coverage 61% → 70% — per-endpoint upstream-error branches across both the citizen-facing and M2M service surfaces now exercised.',
            'MCP providers (LdeMcpProvider, CprmvMcpProvider, TriplyDbMcpProvider, OperatonMcpProvider): combined branch coverage from ≈45% to ≈70% — connect / disconnect / already-connected guard / tool-call / stderr error-handler paths all covered.',
            'ob.client.ts (OB SRU): branch coverage 43% → 77% — fetch-error, paging, fallback URL, str() #text node extraction for attributed identifiers, findDeep for non-standard gzd structures, and mixed-record skipping.',
            'Route branch gaps: tenant-mismatch 403 tests in task.routes (variables, form-schema, claim, complete); failure-path 500/404 tests in m2m.routes (process/history, historic-variables); SSE chat-timeout test in mcp.routes using a queueMicrotask setTimeout spy that fires the 480 s timeout exactly when the handler suspends at await.',
            'docs/TESTS.md refreshed with current per-file percentages; documented artifacts (capacity/rip !req.user guards, mcp.routes catch-block lines 129-132) annotated with root-cause explanations. TEST-COVERAGE-NEXT-STEPS.md rewritten to mark Phase 1 complete and focus the next-session prompt on Phase 2 (live smoke suite).',
          ],
        },
      ],
    },
    {
      version: '3.7.2',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 6, 2026',
      sections: [
        {
          icon: '🔒',
          iconColor: '#b45309',
          title: 'Fix: Media-aggregator hardening — SSRF guard, stable IDs, HTML sanitization',
          items: [
            'SSRF guard (net-guard.ts): feed fetches now validate the target URL is a plain public http(s) host before opening a connection — blocks file:// and non-http schemes, embedded credentials, and hosts that resolve to loopback, link-local (including 169.254.169.254 cloud-metadata), private RFC-1918, or CGNAT ranges. Response bodies are capped at 5 MB; anything larger throws ResponseTooLargeError and the feed is skipped with a warn log.',
            'Stable article IDs (stable-id.ts): replace the URL-hash "art-…" id with a precedence chain — feed-provided guid → canonical link → title+date. Two fetches of the same article now produce the same id even when the URL carries varying tracking params (utm_*, fbclid, gclid stripped by canonicalizeUrl). Duplicate-group clustering upgraded to an order-independent, diacritic-stripped, NL-stopword-filtered sha1 title signature; assignDuplicateGroups no longer mutates its input.',
            'Sanitize-to-text (sanitize.ts): feed titles pass through htmlToText — removes <script>/<style> content wholesale, converts block-level tag closes to spaces, decodes named and numeric HTML entities (including Dutch diacritics), and collapses whitespace. summaryShort delegates to summarize(), replacing the regex stripHtml that could leak half-tags and raw entities into the cockpit UI. Raw title still used for stableArticleId to keep IDs stable across refreshes.',
          ],
        },
      ],
    },
    {
      version: '3.7.1',
      status: 'New',
      statusColor: '#1d4ed8',
      borderColor: '#bfdbfe',
      date: 'July 5, 2026',
      sections: [
        {
          icon: '🎛️',
          iconColor: '#0046ad',
          title: 'New: Zoekcriteria — cron-scoring uitleg (verdict-chip, modal, simulator)',
          items: [
            'Bug fix: zcBestCase() preview was adding +1 for a term hit; the real engine (rules.ts) adds +3 for a title hit. Every TK/EU criterion was showing "≈ rel 6" where the cron actually yields 8. Fixed — strong case now correctly reads rel 8 and criteria visibly differ from each other.',
            'Scoring constants (REL_BASE, ZWAARTYPE_BUMP, TITLE_HIT, MATCH_CAP, NOISE_FLOOR, REL_THRESHOLD) exported from @ronl/shared and imported by rules.ts and curation.service.ts. The persistence cutoff rel ≥ 4 is now the named constant REL_THRESHOLD — confirmed real value from curation.service.ts line 251.',
            'Card verdict-chip (Option C): raw "≈ rel N" replaced with a plain-language chip ("Wordt opgepikt" / "Alleen bij regio-match"), a 3-bar strength indicator (heights 5/9/13 px, bars lit = tier), and a mono subline with the representative score. TK/EU criteria show green / 3 bars (best-case rel 8+); OB+single-term green / 2 bars (rel 6), OB+multi-term can reach 3 bars (rel 8) because the match score scales with term count up to MATCH_CAP = 5; media shows amber / 2 bars (geographic match not guaranteed on every item).',
            'Explainer modal (Option B): the ? button on each card opens a 560px modal with three tabs — Sterke treffer (TK Motie + title hit → rel 8), Media-treffer (Flevoland province + municipality → rel 6), Geen treffer (TK Brief + no term match → noise floor rel 3). Each tab renders a worked receipt: one row per scoring step with amount, label, explanation, and running total; green total row; drempel note. Closes on ×, Begrepen, backdrop click, or Esc.',
            'Score simulator (Option D): static "ZO SCOORT DE CRON" panel in the editor replaced with live, source-aware toggles. TK/EU show: Zwaar documenttype (+2), Zoekwoord in de titel (+3), Tag komt ook voor (+1). OB shows only the term and tag toggles (no document-type bump). Media shows Provincie Flevoland gevonden (+2), Zoekwoord in de titel (+3), Tag (+1). Score bar animates on every toggle (respects prefers-reduced-motion). Threshold marker at 40% (drempel 4).',
            'Drift test added to rules.test.ts: asserts scoreItem produces exactly REL_BASE + ZWAARTYPE_BUMP + min(TITLE_HIT, MATCH_CAP) = 8 for the canonical TK strong case, and that the no-match floor lands at NOISE_FLOOR < REL_THRESHOLD.',
          ],
        },
        {
          icon: '🔢',
          iconColor: '#1d4ed8',
          title: 'Fix: Inbox count honest — 100+ pill and cap banner when inbox exceeds limit',
          items: [
            'GET /v1/pa/signals now runs a parallel COUNT(*) over the same WHERE conditions and returns meta: { total, cap: 100, capped } alongside the existing data array — back-compat, no change to the LIMIT, ordering, or WHERE.',
            'Inbox tab pill shows "100+" instead of "100" when the total exceeds the query cap, making the silent truncation visible at a glance.',
            'A "Top 100" banner appears above the candidate list when capped, stating the true total and how many candidates fall outside the current view: "N kandidaten in deze inbox, gesorteerd op relevantie (rel, aflopend). De weergave toont de bovenste 100; M met lagere relevantie vallen nu buiten beeld."',
            'Rail badge and per-tab seed counts in PaDataProvider now use meta.total (true count) instead of the array length (capped at 100).',
          ],
        },
        {
          icon: '📊',
          iconColor: '#2f8f4e',
          title: 'New: Feiten & cijfers — Feitelijk Flevoland monitor library',
          items: [
            'New page Monitoring → Provincie · feiten → Feiten & cijfers surfaces all 14 provincial monitors of Feitelijk Flevoland as a searchable, filterable card library — the factual underlay for PA dossiers.',
            'Cards show monitor name, theme, year, description, outbound link to the live dashboard, and which PA dossiers the monitor underpins. Outbound links open in a new tab with host announced in the aria-label (WCAG compliant).',
            'Theme filter (Brede welvaart, Economie, Wonen/ruimte, Landbouw/natuur, Klimaat & energie) with per-theme counts; free-text search across name, description, and linked dossier names.',
            'Each Issuekaart now shows an "Onderbouw met feiten" strip directly under the Kompas radar, listing only the monitors that underpin that specific dossier. Hidden when no monitor matches. "Alle feiten & cijfers →" jumps to the library.',
            "One shared data source (feiten.data.ts) drives both directions — the library and the per-dossier strip — with no duplication. The monitors are not curated or scored; they are the province's factual base.",
            '14 monitor icons copied to public/pa/feiten-icons/ and served as static assets.',
          ],
        },
        {
          icon: '🔍',
          iconColor: '#1d4ed8',
          title: 'New: Zoekcriteria — search criteria management screen in Beheer',
          items: [
            'New screen Beheer → Monitoring → Zoekcriteria gives PA officers full control over pa_saved_searches without direct database access. Search criteria determine what the curation pipeline fetches; the screen makes the configuration visible and editable.',
            'Four live stats at the top: team criteria active in the cron, dossiers covered (n/total), active sources (TK · OB · EU · Media), and watchlist criteria without a dossier.',
            'Criteria grouped by dossier (team scope), followed by "topic & watchlist" (no dossier, team), followed by personal criteria not yet in the cron. Each card shows search terms as OR-tokens, source badges, tags, scope label, and a representative rel score.',
            'Three actions per card: Edit (in-place editor), ↗ team / ↩ personal (scope toggle, bidirectional), Delete. A demoted team criterion parks in the personal group and can be re-promoted at any time.',
            'In-place editor with chip fields for search terms (Enter to add, × to remove) and tags; source toggle buttons (TK / OB / EU / Media); dossier select; scope segmented control. Validates that at least one term and one source are present before saving.',
            'Scoring preview in the editor shows how the cron would score a strong hit: base relevance 3, +2 for high-value document types (TK/EU), +2 province + +1 municipality for media (gazetteer), +3 per term hit on the title (capped at MATCH_CAP = 5 across all term hits), +1 per tag hit. Verdict: "becomes candidate" when representative score ≥ 4.',
            'Backend PATCH /pa/searches/:id extended from scope-only to full edit payload: accepts scope, query, tags, and dossierId as a partial patch with a dynamic SET clause. WHERE now guards on tenant_id only (no longer user_id), so team criteria are editable by any PA officer.',
            'New frontend API helpers createSearch() and updateSearch() alongside the existing createSavedSearch() and promoteSearchToTenant().',
          ],
        },
        {
          icon: '🔌',
          iconColor: '#1d4ed8',
          title: 'New: Signaalbronnen — connector registry screen in Beheer → Monitoring',
          items: [
            'New read-only screen Beheer → Monitoring → Signaalbronnen lists every signal connector in one place, grouped by the Monitoring tab the signals land in (Politiek NL, Regionaal, Europa EU, Media & omgeving).',
            "Connector rows (TK, OB, EU, EP Ingediende teksten) each show status (Actief / Uitgeschakeld / Verwacht), connector name and description, protocol tag, live environment flag value, and polling cadence. Media & omgeving renders differently: each RSS feed gets its own row (FeedRow) inside Regionaal / Landelijk / Sociaal sub-group headers, with the feed's URL and a right-aligned chip cluster (altijd Flevoland badge, categorie filter, RSS tag, MEDIA_SOURCE_ENABLED flag, cadence). All seven feeds mirror feeds.ts exactly — Regionaal: Provincie Flevoland, Omroep Flevoland (categorie: Nieuws); Landelijk: Rijksoverheid, NOS Nieuws, NU.nl, RTL Nieuws; Sociaal: gepland.",
            'Status is derived from live configuration: core connectors (TK, OB, Agenda) are always Actief; EU, EP Ingediende teksten, and Media connectors reflect the EU_SOURCE_ENABLED, EP_TEXTS_SUBMITTED_ENABLED, and MEDIA_SOURCE_ENABLED flags as deployed — no hardcoding. All six media feed rows share the single MEDIA_SOURCE_ENABLED flag and flip together.',
            'Planned connectors without an implementation (Sociale media & omgeving) render as Verwacht with a dashed "geen connector" tag.',
            'New backend endpoint GET /v1/pa/sources/status reads config.pa.* flags and returns { tk, ob, eu, epTeksten, media } booleans; consumed by the frontend on mount.',
            'Summary strip above the groups shows active, disabled, and planned counts plus a dot legend. Counts now include feed rows: with MEDIA_SOURCE_ENABLED=true all six live feeds count as actief; with the flag off they all flip to uitgeschakeld. The Sociaal row always counts as verwacht.',
          ],
        },
        {
          icon: '🐛',
          iconColor: '#b45309',
          title: 'Fix: demoted seed criteria remain visible after scope change',
          items: [
            "GET /pa/searches was not returning seed criteria (user_id IS NULL) after they were demoted to scope user — they disappeared from the list. The WHERE clause filtered on scope = 'tenant' OR user_id = $current_user; NULL matches neither. Fixed by adding OR user_id IS NULL so ownerless searches are always returned regardless of their scope.",
          ],
        },
      ],
    },
    {
      version: '3.7.0',
      status: 'New',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 4, 2026',
      sections: [
        {
          icon: '📋',
          iconColor: '#2d7a33',
          title: 'New: Woo-dashboard — Wet open overheid compliance & management board',
          items: [
            'Fourth board added at /dashboard/woo, gated on the woo-coordinatie Keycloak realm role. Login portal updated from three to four cards in a 2×2 grid.',
            'Six views: Overzicht (8 traffic-light KPIs, monthly intake/throughput columns, open backlog trend, ageing profile), Verzoeken (requests by department/topic/source, repeat requesters), Tijdigheid (SLA gauge vs. 90% target, lead-time distribution buckets, core metrics), Proces (9-step workflow funnel with bottleneck highlighting), Publicatie (17 mandatory disclosure categories, progress bar), Bezwaar & beroep (decision-type donut, objection-to-penalty funnel).',
            'Verzoekenregister reachable from the rail and ⌘K palette. Register upgraded to full 218 rows generated deterministically from a seeded PRNG weighted to the afdeling/onderwerp/bron distributions — all rows consistent across sessions.',
            'Rail filters (year, quarter, department, topic, source, status) are fully functional: changing any filter auto-navigates to the filtered register; the rail shows the live count and a reset button; active filters render as chips above the table with a "Wis filters" action; empty state shown when no rows match.',
            'Provenance footnote below every aggregate chart view clarifies that chart figures are fixed illustrative aggregates and that filters operate on the register.',
            'Woo assistant dock with three contextual suggestions (timeliness, bottleneck, active disclosure).',
            'New Keycloak realm role woo-coordinatie; test user test-woo-flevoland (Ravi de Wit, woo@flevoland.nl, password test123) added to ronl-realm.json.',
            'AuthCallback role routing: woo-coordinatie now redirects to /dashboard/woo before infra-projectteam in the priority chain.',
          ],
        },
        {
          icon: '📰',
          iconColor: '#2f5d3a',
          title: 'New: Media & omgeving — in-house nieuws-aggregator as seventh PA source',
          items: [
            'Media tab in PA-Cockpit Monitoring is now a live connected source (bron: media) backed by a minimal in-house aggregator (src/media-aggregator/) that ships as a module in the same backend process. The tab was previously an honest empty state; it now runs the full curation cycle alongside TK, OB, and EU. No external SaaS dependency.',
            'The aggregator (GET /v1/media-aggregator/search) fetches a curated set of Dutch RSS feeds in parallel: Provincie Flevoland and Omroep Flevoland (regional, always Flevoland-tagged), plus Rijksoverheid, NOS Nieuws, and NU.nl (national, Flevoland-scoped by the gazetteer). Near-duplicate syndicated stories receive a shared duplicate_group_id so the cockpit collapses them to one candidate. In-memory TTL cache (15 min, lazy refresh, stale-on-error). Zero new npm dependencies — axios, fast-xml-parser, and express are already present.',
            'The aggregator serves the same AggregatorArticle contract media.client.ts already expects, so the cockpit connector needed no changes — MEDIA_AGGREGATOR_BASE now points at the loopback URL. Optional M2M bearer key (MEDIA_AGGREGATOR_ACCEPT_KEY / MEDIA_AGGREGATOR_API_KEY); left unset in dev for open loopback access. GET /v1/media-aggregator/health returns { ok, cached } for ops.',
            'New media.client.ts: AggregatorArticle → FeedItem pure mapper with duplicate_group_id collapse; fetchFlevolandNews hits GET /search?region=Flevoland, 15 s timeout, 2 retries, per-article try/catch so one malformed article never drops the batch.',
            'Geographic relevance bump in rules.ts: media items get +2 when "Flevoland" appears anywhere in the haystack (title + description + regio), +1 for a matched Flevoland municipality (with town aliases: Emmeloord → Noordoostpolder, etc.). The bestScore === 0 floor is enforced — geographic context alone never surfaces noise.',
            'Two new display-only signal fields: regio (e.g. "Flevoland · Lelystad") and sentiment (positief / neutraal / negatief) stored in pa_signals via ALTER TABLE … ADD COLUMN IF NOT EXISTS. Both surface as MediaMeta badge strips on SignalCard and InboxCard; neither is a scoring input. Sentiment is phase-2 (null in v1; stub in enrich.ts ready to wire to Anthropic).',
            'Eleven media seed searches: topic-linked (media-stikstof, media-lelystad, media-energie), province catch-all (media-flevoland — now includes Zuiderzeeland), and per-bestuurseenheid watchlists for all six Flevoland municipalities (Almere, Lelystad, Dronten, Noordoostpolder with Emmeloord, Urk, Zeewolde) plus Waterschap Zuiderzeeland. Each watchlist entry has dossierId: null; curators link signals to dossiers during review. MEDIA_SOURCE_ENABLED=true in dev (loopback ready). Sociale media / omgeving noted in the UI as a planned second sub-source.',
            'Waterschap Zuiderzeeland added to the aggregator gazetteer (enrich.ts) and the scoring set (rules.ts) — articles mentioning it are region-tagged as Flevoland and receive the +1 geographic bump alongside the province +2.',
            'Tests: media-aggregator.test.ts (14 cases — RSS parse, mapping, region tagging with town aliases, dedup clustering, summary capping, malformed-skip, filter semantics), media.client.test.ts (11 cases), rules.test.ts +8 media scoring cases, curation.service.test.ts +7 media pipeline cases. All 148 backend tests pass.',
          ],
        },
      ],
    },
    {
      version: '3.6.1',
      status: 'New',
      statusColor: '#7c3aed',
      borderColor: '#ddd6fe',
      date: 'July 3, 2026',
      sections: [
        {
          icon: '🇪🇺',
          iconColor: '#0046ad',
          title: 'EP Ingediende teksten — second EU sub-source',
          items: [
            'Second sub-source alongside the existing Plenary RSS: the PA-Cockpit now also ingests "Ingediende teksten" from the EP plenary page (Reports + Draft Resolutions tabs) via a Cheerio scraper on server-rendered HTML.',
            'Each EP signal now carries a sub-source badge ("Plenaire RSS" or "Ingediende teksten") and — for reports — an orange committee badge (e.g. ITRE, JURI, ENVI) in both the Signal card and Inbox card.',
            'Scraper paginates both tabs automatically (up to 10 pages per tab, 800 ms delay between requests) and stops early once all cards are already seen. Polling interval: every 6 hours via a setInterval alongside the existing Plenary RSS poll.',
            "Sub-source and committee are display-only metadata and are not inputs to the scoring algorithm. Existing EU signals have been backfilled with subbron = 'ep-rss' via an idempotent migration.",
            'Document type is derived from the reference prefix: A-prefix → Verslag or Aanbeveling (based on title prefix), B-prefix → Ontwerpresolutie.',
          ],
        },
        {
          icon: '🐛',
          iconColor: '#dc2626',
          title: 'Fix: English-language titles refresh automatically once translated',
          items: [
            'The EP publishes documents in the original submission language; the Dutch translation appears later on the listing page. Signals with an English title (detected by the prefix REPORT, MOTION FOR, RECOMMENDATION, or OPINION) are now re-fetched on every curation cycle until the translation becomes available.',
            'ON CONFLICT clause updated: title and src are now also refreshed for candidate signals, so the Dutch title appears in the inbox card automatically once the EP listing publishes it.',
          ],
        },
        {
          icon: '🐛',
          iconColor: '#dc2626',
          title: 'Fix: curation cycle no longer hangs when Redis is unavailable',
          items: [
            'node-redis v4 queues commands while reconnecting after an ECONNRESET, causing cacheGet() to await indefinitely and blocking the entire curation cycle — no TK, OB, EU RSS, or ep-teksten fetches would run until the Redis connection recovered.',
            'Fixed by racing every cache get/set against a 2-second timeout: a dead or slow Redis now falls through to the live fetch within 2 s instead of hanging forever. The cache remains fail-soft — a Redis outage degrades performance (no caching) but never stalls the pipeline.',
          ],
        },
        {
          icon: '▶',
          iconColor: '#0046ad',
          title: 'New: manual curation trigger in Beheer',
          items: [
            'Beheer → Monitoring → Curatiepijplijn now has a "Curatie nu uitvoeren" button that fires the curation cycle on demand — useful after a deployment or for diagnosis without waiting for the 6-hour cron.',
            'Status feedback appears below the button: a green confirmation line shows the exact start time and a reminder that the cycle runs in the background (~30 s); after it clears, the last manual start time is retained for the session. Error state guides the user to check their role if the call fails.',
          ],
        },
        {
          icon: '🔧',
          iconColor: '#dc2626',
          title: 'Fix: code-review hardening (PA cache + curation pipeline)',
          items: [
            'PA cache startup race: connectAttempted is now reset to false when the initial Redis connection fails, allowing the cache to retry on the next curation cycle instead of remaining permanently disabled for the lifetime of the process.',
            'PA cache timer leak: withTimeout now clears the fallback setTimeout when Redis responds within the 2 s window, and attaches a rejection handler to the losing side so a late Redis error never surfaces as a spurious unhandledRejection log.',
            'Curation dedup ordering: ep-teksten items are now pushed to allItems before the plenary RSS items. Since the dedup Set is first-seen-wins, the richer ep-teksten entry (which carries the committee code) now takes priority over the RSS entry when the same EP document appears in both feeds.',
            'Signal re-fetch after English→Dutch translation: getSeenEpTekstenRefs now only excludes English-titled signals that are still candidates. Confirmed or archived signals are always included in sinceRefs, preventing a permanent re-crawl loop for documents that were reviewed before their Dutch translation was published.',
            'src label frozen at ingestion: src (e.g. "Tweede Kamer · Document · vandaag") is no longer updated on conflict — it records the time of first indexing and does not drift on subsequent curation cycles.',
            'Taxonomy seed propagation: the ON CONFLICT clause for PA_TAXONOMY_SEED now also updates query and tags, so changes to search terms or topic tags take effect on the next app restart without requiring a manual database update.',
          ],
        },
        {
          icon: '🧪',
          iconColor: '#6b7280',
          title: 'Tests: ep-texts-submitted unit tests + ep-teksten curation cycle coverage',
          items: [
            'New ep-texts-submitted.client.test.ts (16 tests): normaliseEpRef covers A/B ref conversion, number padding, pass-through, whitespace, and invalid inputs; parsePageHtml uses an HTML fixture with 6 cards — 4 valid, 2 skipped — verifying Verslag/Aanbeveling/Ontwerpresolutie classification, committee extraction, date parsing, and English-titled card handling.',
            'curation.service.test.ts extended with 6 ep-teksten tests: fetched when flag + EU searches active, skipped when flag off or no EU searches, items flow through scoring and persist, error resilience (cycle continues if EP listing unreachable), deduplication against ep-rss items sharing the same ref id.',
          ],
        },
        {
          icon: '⚑',
          iconColor: '#7c3aed',
          title: 'New: Watchlist — bevestigen zonder dossier',
          items: [
            'Signals confirmed without a linked dossier now enter a Watchlist state (routing = \'watchlist\' in pa_signals). The Gecureerd tab shows an "⚑ Alle" / "⚑ Watchlist" filter toggle when watchlist signals are present; clicking "⚑ Watchlist" narrows the view to only those signals.',
            'Watchlist signal cards carry an "⚑ Watchlist" chip and an inline dossier-picker (OrphanActions): select a dossier from the dropdown and click "Koppelen" to link it via PATCH /v1/pa/signals/:id — this clears the routing field and moves the signal into the normal confirmed flow.',
            'The orphan filter resets automatically when (a) the user switches to a different Monitoring tab, (b) the last watchlist signal is linked to a dossier, or (c) the search term is cleared.',
            "DB: routing TEXT column added with ALTER TABLE … ADD COLUMN IF NOT EXISTS; confirm endpoint sets routing = CASE WHEN dossier_id IS NULL THEN 'watchlist' ELSE NULL END; all four SELECT fetch paths include the routing column.",
            'Backend: new PATCH /v1/pa/signals/:id endpoint sets dossier_id and clears routing = NULL, returning the refreshed signal. Tests: 5 new cases in pa.routes.test.ts (auth gating, missing dossierId → 400, unknown signal → 404, links dossier → routing cleared); total 106 backend tests pass.',
          ],
        },
        {
          icon: '🐛',
          iconColor: '#dc2626',
          title: 'Fix: live-testing bugfixes — counter, Koppelen, search, orphan filter',
          items: [
            'Watchlist chip not shown immediately after confirm: handleConfirm was discarding the return value of confirmSignal(); the routing field on the returned signal was never applied to local state. Fixed by capturing the returned signal and using it directly in setSignals.',
            'Koppelen button did nothing: (1) OrphanActions had no loading state — added busy flag so the button shows "…" during the PATCH and is disabled to prevent double-submit; (2) errors were swallowed silently — added an error toast. (3) CORS preflight rejected PATCH: Access-Control-Allow-Methods in index.ts was missing PATCH; added it.',
            "Inbox counter not updating after Naar inbox: two compounding bugs — (a) setPromotedKeys was called before the status check, so signals already in Gecureerd (returned as status: 'confirmed' via the ON CONFLICT guard) falsely showed \"In Inbox ✓\" and never incremented the count; fixed by moving setPromotedKeys inside the status !== 'confirmed' branch. (b) The isNew flag was computed inside the setInbox functional-update callback, which React runs asynchronously — the synchronous if (added) check always saw false. Fixed by computing isNew synchronously from the closure before calling setInbox.",
            'Inbox capped at 100 after promote: refetching inbox after a promote hit the LIMIT 100 query cap, so newly promoted low-relevance items were lost from local state. Fixed by prepending the promoted signal directly to local inbox state and tracking the live count in an inboxCountRef (useRef) to avoid stale-closure reads across concurrent promotes.',
            'Orphan filter trapping empty view: after linking the last watchlist signal, orphanOnly stayed true and the shown list became empty with no way to exit. Fixed by resetting orphanOnly inside handleLinkDossier when no watchlist signals remain, and resetting it in load() on every tab switch.',
            'Search results staying visible when switching Gecureerd / Inbox tabs: segmented-tab onClick handlers now call clearSearch() alongside setView(), so the search band clears on every tab change.',
          ],
        },
      ],
    },
    {
      version: '3.6.0',
      status: 'New',
      statusColor: '#7c3aed',
      borderColor: '#ddd6fe',
      date: 'July 2, 2026',
      sections: [
        {
          icon: '🧭',
          iconColor: '#0046ad',
          title: 'Kompas v2.0 — 8 criteria, max 16, four threshold bands',
          items: [
            'Flevolands Kompas expanded from 6 to 8 criteria (max 16): Reputation & strategic positioning replaces Strategic visibility; Synergy with other dossiers and Risk management are new additions.',
            'Four threshold bands drive the recommended PA effort: Strategic core dossier · top priority (≥14), Promising (10–13), Background · monitor (5–9), Do not pursue (0–4).',
            'Band badge shown on the Kompas radar, Issuekaart and Vandaag; badge displays the threshold label in the band colour.',
            'All mock dossiers migrated to 8 criteria with revised scores: stikstof 14 (kern), lelystad 10 (kans), energie 12 (kans), jeugdzorg 5 (monitor), oostvaarders 6 (monitor).',
          ],
        },
        {
          icon: '📖',
          iconColor: '#059669',
          title: 'New: Beheer → Strategisch kompas → Afwegingskader',
          items: [
            'New read-only page under Beheer documents the full Flevolands assessment framework: criteria table (8 rows) and threshold bands table (4 bands), data-driven from KOMPAS_CRITERIA and KOMPAS_BANDS.',
          ],
        },
        {
          icon: '🔍',
          iconColor: '#0046ad',
          title: 'New: Curatiepijplijn documentation + inline explainer',
          items: [
            'Read-only Beheer → Monitoring → Curatiepijplijn page: vertical flow diagram from raw source to curated signal, documenting the full curation pipeline.',
            'Inline "Hoe werkt de curatiepijplijn?" collapsible on every connected Monitoring source tab, with a "Bekijk als pagina in Beheer →" deep-link.',
            '? help affordances next to the blanco zoekbalk and each Naar inbox button — both open the pipeline explainer at the moment of need.',
          ],
        },
        {
          icon: '🐛',
          iconColor: '#dc2626',
          title: 'Fix: top-nav switching restores last visited sub-page',
          items: [
            'Switching between top-nav modes (Vandaag, Dossiers, Monitoring, Voortgang, Beheer) now restores the last visited sub-page instead of always jumping back to the mode default.',
          ],
        },
        {
          icon: '🐛',
          iconColor: '#dc2626',
          title: 'Fix: signal count sync between Vandaag and Monitoring',
          items: [
            'Inbox count on Vandaag now sums accurate per-tab counts (politiek / europa / regionaal / media) instead of a capped all-tabs snapshot, fixing the mismatch with Monitoring inbox badges.',
            'Gecureerd count on Vandaag now reflects the full confirmed-signal total from the shared provider, not just the 3 items shown on screen.',
            'Rail inbox badges now read per-tab counts written back by Monitoring on each load, so badge and page tab count are always in sync.',
            'PaDataProvider seeds per-tab inbox counts at startup so badges are populated before Monitoring is first visited.',
          ],
        },
      ],
    },
    {
      version: '3.5.5',
      status: 'Enhancement',
      statusColor: 'orange',
      borderColor: 'orange',
      date: 'July 1, 2026',
      sections: [
        {
          icon: '🔎',
          iconColor: 'blue',
          title: 'PA cockpit — blanco zoekfunctie in Monitoring',
          items: [
            'New free-text search band under the Gecureerd/Inbox segmented control that searches all signaalbronnen at once (Tweede Kamer + Officiële Bekendmakingen) via the existing GET /pa/feed — an escape hatch separate from the curated streams, with bron-scope chips (Alle / Tweede Kamer / Off. Bekendmakingen)',
            'Results are shown as honestly raw: source badge, no relevance score, no duiding, and an amber note making clear these hits are uncurated — "geen ruis" stays the promise of the curated stream',
            'Naar inbox promotes a single raw hit into the curation inbox as a candidate via the new thin POST /pa/signals route → curation.service.promoteToInbox, reusing scoreItem + persistCandidate but bypassing the rel ≥ 4 cron threshold (human-floored to ≥ 5); it lands in the tab its source maps to (tk→Politiek, ob→Regionaal, eu→Europa), a toast names the destination, and the rail/inbox counts refresh',
            "Promoting the same item twice — or one already confirmed — does not duplicate or clobber, thanks to the existing ON CONFLICT (source_key) … WHERE status = 'candidate' guard; Bewaar als zoekopdracht persists a user-scope saved search via POST /pa/searches",
            "Saved searches now have a home: a Mijn zoekopdrachten chip strip under the band lists the user's personal (scope=user) searches — click to re-run, ✕ to delete (DELETE /pa/searches/:id), and ↗ team to flip one to a tenant bron via the new owner-only PATCH /pa/searches/:id (only a tenant-scope search feeds the curation cron; a personal save does not auto-curate)",
            'Source chips are data-derived from GET /pa/types (the sources /pa/feed actually merges) rather than hardcoded — TK + OB today, with no dead Europa/Media chip, and an Europa chip appears automatically once the backend exposes an eu feed source',
            'Tests added: promoteToInbox rel-floor/dossier-preservation cases in curation.service.test.ts, plus role-gate + validation cases for POST /pa/signals and the PATCH /pa/searches/:id scope flip in pa.routes.test.ts',
          ],
        },
        {
          icon: '🐛',
          iconColor: 'orange',
          title: 'PA cockpit — Naar inbox count now ticks the seg control too',
          items: [
            'Fixed: promoting a raw hit with Naar inbox updated the left-rail inbox badge but left the Gecureerd/Inbox segmented-control "Inbox" count stale (e.g. rail went 57→59 while the seg still showed 57)',
            "Root cause: the two counts read different state — the rail badge reads the shared usePaData() provider inbox (refreshed via providerInbox.refetch()), while the seg count reads Monitoring's local inbox state, which the promote handler never refreshed",
            "Now, on a successful promote, the local inbox is also refetched when the item lands in the currently viewed tab (sig.tab === tab.id), so both counts move together; a promote into another tab still updates that tab's rail badge only, as expected",
          ],
        },
        {
          icon: '⚙️',
          iconColor: 'gray',
          title: 'Dev tooling — dependency preflight check',
          items: [
            'npm run dev now runs a deps:check preflight before the Docker check — it fails fast with a clear "run npm install" message when the installed dependencies are out of sync, instead of crashing mid-boot with a MODULE_NOT_FOUND (e.g. fast-xml-parser) after a git pull that added dependencies',
            'scripts/check-deps.sh mirrors the existing check-docker.sh pattern: verifies node_modules exists and compares the root package-lock.json against the node_modules/.package-lock.json install marker npm writes after each install — a newer lockfile means the tree is stale',
            'Added standalone npm run deps:check script; the check is advisory and non-destructive (it never installs on its own), so the fix stays an explicit npm install',
          ],
        },
      ],
    },
    {
      version: '3.5.4',
      status: 'Security',
      statusColor: 'red',
      borderColor: 'red',
      date: 'June 30, 2026',
      sections: [
        {
          icon: '🔒',
          iconColor: 'red',
          title: 'PA cockpit — role-gate all PA data routes',
          items: [
            'All PA data endpoints (GET /signals, POST /signals/:id/confirm, GET /feed, GET /agenda, GET /searches, POST /searches, DELETE /searches/:id) now require the public-affairs Keycloak realm role in addition to a valid JWT — matching the curator routes that were already gated',
            'Previously any logged-in user (caseworker, infra board, etc.) could read and confirm Flevoland PA signals; unauthenticated requests → 401 MISSING_TOKEN, authenticated non-PA requests → 403 FORBIDDEN',
            "Role claim verified to be the same realm_access.roles path used by the frontend route gate in App.tsx — a PA officer's access is unchanged",
            'Route-level test suite added (pa.routes.test.ts, 7 cases): anonymous → 401, non-PA role → 403, public-affairs role → 200/404 on both GET /signals and POST /signals/:id/confirm',
          ],
        },
        {
          icon: '🐛',
          iconColor: 'orange',
          title: 'PA cockpit — dossierId null-carryover bug fix in scoring',
          items: [
            'Fixed a bug in scoreItem (rules.ts) where a lower-scoring saved search could leak its dossierId onto a signal when a higher-scoring search won but had dossierId: null',
            'Root cause: the guard `if (search.dossierId) dossierId = search.dossierId` never cleared the value when the winning search had no linked dossier — replaced with an unconditional assignment so the winner always sets the dossierId (including null)',
            'Discovered via the new rules.test.ts unit test suite; no user-visible signal was incorrectly linked in production because EU topic-searches (dossierId: null) currently score lower than dossier-linked searches on the same items',
          ],
        },
        {
          icon: '🧪',
          iconColor: 'green',
          title: 'PA cockpit — automated test suite (65 cases)',
          items: [
            'rules.test.ts (29 cases): full coverage of scoreItem — tab assignment, no-match floor, title/description/tag scoring, high-value type bonuses for TK and EU, bestScore cap at 5, rel ceiling at 10, and all dossierId assignment paths; pure function, no mocks needed',
            'curation.service.test.ts (17 cases): pipeline orchestration — source routing (EU-only searches never reach TK/OB APIs), EU fetched once per cycle regardless of search count, euSourceEnabled config flag, TK/OB query deduplication, rel ≥ 4 persistence threshold, item deduplication by source:id, and feed error resilience',
            'pa.routes.test.ts (7 cases): route-level auth gating — anonymous → 401, non-PA role → 403, public-affairs role → 200; covers GET /signals and POST /signals/:id/confirm including the confirm happy path',
            'eu.client.test.ts (12 cases): RSS parser for the EP plenary feed — title extraction, ref parsing, doceo URL, date handling, Dutch type labels, EU_TO_NL_TERMS expansion, agenda-item filtering; fixture-based, no network',
            'Run with: npm test --workspace=@ronl/backend; see docs/TESTS.md for per-file breakdown and watch-mode instructions',
          ],
        },
      ],
    },
    {
      version: '3.5.3',
      status: 'Feature',
      statusColor: 'blue',
      borderColor: 'blue',
      date: 'June 25, 2026',
      sections: [
        {
          icon: '🇪🇺',
          iconColor: 'blue',
          title: 'PA cockpit — Europa (EU) source: European Parliament RSS feeds',
          items: [
            'Europa tab is now a live connected source (bron: eu) via the EP plenary-documents RSS feed (CC BY 4.0, no authentication, ~1-2 s); press-release feed included but currently empty',
            'Normalises RSS items to FeedItem: ref from guid (e.g. A-10-2026-0181), English title, Dutch type label from <category domain="type">, doceo _NL.html provenance link; agenda items filtered out (no EP document ref in guid)',
            'Scoring: high-value types (Verslag, Motie, Aangenomen tekst, Resolutie) get +2; Dutch term expansion (EU_TO_NL_TERMS) appends Dutch equivalents of English EU-policy vocabulary to FeedItem.description for desc-match scoring; only rel ≥ 4 persists',
            'EU_SOURCE_ENABLED env flag (default true); EU_API_BASE retained for future fallback; bron-eu badge style added to Monitoring CSS',
            'Fixture-based unit test (eu.client.test.ts, 12 cases): non-empty titles, ref extraction, doceo URL, date parsing, Dutch type labels, term expansion, agenda filtering',
            'Seed searches broadened: four EU-specific saved searches added (eu-klimaat, eu-landbouw, eu-energie, eu-plenary) using English vocabulary that directly matches EP title patterns; these are source-routed to EU only — TK/OB are no longer queried with English terms',
            'Curation cycle is now source-aware: each saved search declares its source(s); TK and OB fetch only their own query sets; EU is fetched once per cycle regardless of search count; fetch window raised to top=50',
            'Candidates are re-scored on subsequent cycles (ON CONFLICT DO UPDATE) so search changes take effect without manual DB cleanup',
            'Rail badge sync: Monitoring component triggers a provider inbox refetch after loading tab data, keeping the rail pill count current when new EU candidates arrive after page load',
          ],
        },
        {
          icon: '📅',
          iconColor: 'blue',
          title: 'PA cockpit — Agenda rail badge and view default',
          items: [
            'Agenda rail item now shows the count of upcoming (today + future, non-cancelled) activiteiten, with a live pulse dot when a debate is currently in session',
            'AgendaView opens in Aankomend scope by default — badge count and view count now match; Alle periodes remains available to browse the full historical schedule',
            'Type filter chips (Commissiedebat, Plenair, …) derive their counts from the active time scope, so numbers stay consistent across all filters',
          ],
        },
        {
          icon: '🔔',
          iconColor: 'pink',
          title: 'PA cockpit — Monitoring rail counter badges',
          items: [
            'Unconnected tabs (Europa, Media & omgeving) now render a dimmed — instead of a misleading 0',
            'Tabs with pending inbox candidates show an accent pill with the candidate count; confirming a candidate decrements the pill immediately (provider now refetches inbox alongside signals)',
            'Inbox resource added to PaDataProvider — fetchInbox is now a first-class resource alongside signals, dossiers and agenda',
          ],
        },
      ],
    },
    {
      version: '3.5.2',
      status: 'Bug Fix',
      statusColor: 'green',
      borderColor: 'green',
      date: 'June 24, 2026',
      sections: [
        {
          icon: '🔐',
          iconColor: 'green',
          title: 'Logout now redirects to homepage',
          items: [
            'Clicking "Uitloggen" in the session-expiry modal previously returned the user to the current dashboard path instead of the homepage — fixed by passing redirectUri: window.location.origin to keycloak.logout()',
            'Applies to PA-cockpit, Infra-board, and Caseworker dashboard',
          ],
        },
        {
          icon: '🗂️',
          iconColor: 'green',
          title: 'PA cockpit — dossierId no longer seeded from mock',
          items: [
            'Shell now starts with dossierId="" and derives the initial selection via an effect once dossiers.status==="ok" — with VITE_PA_DOSSIERS_MOCK=false the opening view no longer points at a mock id absent from the live dataset',
            'Removes the last synchronous getDossiers() call from PADashboardV2',
          ],
        },
        {
          icon: '📅',
          iconColor: 'blue',
          title: 'PA cockpit — Tweede Kamer agenda (Monitoring → Agenda)',
          items: [
            'New read-only Agenda tab under Monitoring shows the plenaire and commissie schedule sourced from Gegevensmagazijn OData v5 /Activiteit (13 Soort values: Plenair debat, Stemmingen, Hamerstukken, Regeling van werkzaamheden, Tweeminutendebat, Mondelinge vragen, Commissiedebat, Wetgevingsoverleg, Notaoverleg, Rondetafelgesprek, Technische briefing, Procedurevergadering)',
            'Items are date-grouped; today is marked; past items are dimmed; each item shows time, soort badge, title, commissie, activiteit number and a tweedekamer.nl provenance link',
            'Items matching a saved-search term are badged with the matched dossier name and keyword — unmatched items still render so the complete schedule is always visible',
            'Type filter chips are derived dynamically from the soortLabel values present in the fetched window — a new session type in the OData feed appears automatically without a code change',
            'OData pagination: TK API caps at 100 results per page; the backend loops with $skip until a short page signals the end (up to 600 items across 6 pages)',
            'Backend route GET /v1/pa/agenda is JWT-gated; Redis cache TTL controlled by CACHE_TTL_AGENDA (default 1800 s); VITE_PA_AGENDA_MOCK=true serves local fixtures',
          ],
        },
      ],
    },
    {
      version: '3.5.1',
      status: 'Bug Fix',
      statusColor: 'green',
      borderColor: 'green',
      date: 'June 24, 2026',
      sections: [
        {
          icon: '🔌',
          iconColor: 'green',
          title: 'TK OData v5 migration',
          items: [
            'API base updated from /OData/v4/2.0 to /OData/v5 — old URL returns no results as of the October 2025 deadline',
            'Document.DocumentNummer renamed to Nummer in v5 — provenance URL construction updated accordingly',
            'Document.Volgnummer renamed to Ondernummer in v5 — sub-document number field updated',
            'Document.DatumRegistratie discontinued in v5 — removed from date fallback chain (GewijzigdOp → Datum)',
          ],
        },
      ],
    },
    {
      version: '3.5.0',
      status: 'Refactor',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'June 24, 2026',
      sections: [
        {
          icon: '⚙️',
          iconColor: 'purple',
          title: 'PA cockpit — async data layer (PaDataProvider)',
          items: [
            'Resource<T> pattern: dependency-free async state (data / status / refetch) via useResource hook — no external state library',
            'PaDataProvider / usePaData() context: signals and dossiers fetched once at shell mount; all screens read from the provider instead of calling APIs directly',
            'confirmSignal wired into the provider: confirm calls the API then triggers signals.refetch(), eliminating the onSignalConfirmed prop chain across PASectionRouter → Monitoring',
            'Dossier types (Dossier, Kompas*, Stakeholder, Mijlpaal, …) lifted to @ronl/shared; pa.data.ts re-exports them — import paths unchanged',
            'fetchDossiers / fetchDossier added to pa.api.ts; all getDossiers / getDossier call sites migrated to usePaData().dossiers.data',
            'VITE_PA_USE_MOCK split into VITE_PA_SIGNALS_MOCK + VITE_PA_DOSSIERS_MOCK; VITE_PA_DOSSIERS_MOCK=true in dev and ACC until /pa/dossiers endpoint ships',
          ],
        },
        {
          icon: '🔐',
          iconColor: 'red',
          title: 'Security — curator diagnostic endpoints gated',
          items: [
            'GET /v1/pa/curator/status and POST /v1/pa/curator/run now require a valid Keycloak JWT and the public-affairs realm role (previously unauthenticated for ACC diagnostics)',
          ],
        },
      ],
    },
    {
      version: '3.4.2',
      status: 'Feature Release',
      statusColor: 'blue',
      borderColor: 'blue',
      date: 'June 24, 2026',
      sections: [
        {
          icon: '📡',
          iconColor: 'blue',
          title: 'PlatO integration — live TK & OB signals (stages 1+2)',
          items: [
            'TK OData v4 client: OR-expanded contains() filter per term, DocumentNummer-based provenance URLs, negative Volgnummer hidden',
            'OB SRU client: namespace-prefix stripping (removeNSPrefix) fixed so owmskern/owmsmantel/tpmeta fields now parse correctly; w.jaargang year filter dynamic',
            'Curation pipeline: saved queries → TK + OB fetch → rules score (rel ≥ 4 threshold) → persist candidates; cycle fires on server startup; POST /v1/pa/curator/run triggers a new cycle on demand',
            'Signals route: comma-separated status filter (candidate,ai_drafted) now handled as SQL ANY() — inbox fetch was previously broken',
            'pa_saved_searches and pa_signals tables; Flevoland taxonomy (stikstof, lelystad, energie, jeugdzorg) seeded on first run',
            'Fail-soft Redis cache; VITE_PA_USE_MOCK=false baked into ACC build via .env.acceptance',
            'Diagnostic endpoints: GET /v1/pa/curator/status (unauthenticated DB row counts), POST /v1/pa/curator/run (unauthenticated cycle trigger) — added during ACC rollout',
          ],
        },
        {
          icon: '🖥️',
          iconColor: 'blue',
          title: 'PA-Cockpit — Monitoring, Vandaag & Issuekaart',
          items: [
            'Monitoring: Gecureerd/Inbox segmented control; source badges; provenance link shows DocumentNummer (not internal UUID)',
            'Inbox: rule-scored candidates and AI-drafted concepts; Bevestigen/Negeren actions; confirming a signal immediately updates the sidebar tab count',
            'Sidebar signal counts now fetch live confirmed signals from the API on login and refresh after each confirmation — no longer driven by static mock data',
            'Europa and Media tabs show an honest empty-state (no connector yet)',
            'Vandaag: "Signalen vandaag" section with top-3 confirmed signals and inbox-pending banner',
            'Issuekaart: Monitoring sub-tab with per-dossier signals, inbox, and saved-query strip',
          ],
        },
      ],
    },
    {
      version: '3.4.1',
      status: 'Bug Fix',
      statusColor: 'green',
      borderColor: 'green',
      date: 'June 22, 2026',
      sections: [
        {
          icon: '🗂️',
          iconColor: 'green',
          title: 'Beheer › Projecten › Archief — split by board ownership',
          items: [
            'The shared Archief now filters completed tasks by processDefinitionKey, mirroring the open-task split',
            'Infra-board Archief shows only RIP Phase 1 processes',
            'Caseworker Archief hides RIP Phase 1 and keeps its own processes (Thuisbatterij, AWB Shell, onboarding, …)',
            'INFRA_PROCESS_KEYS is the single source of truth shared by the task list and the Archief filter',
          ],
        },
        {
          icon: '🏷️',
          iconColor: 'blue',
          title: 'Board ownership — deploy-time tag (durable split)',
          items: [
            'Archief split is now driven by the deploy-time boardOwner tag read from each process definition, authoritative over the static INFRA_PROCESS_KEYS fallback',
            'Untagged/legacy processes keep working — they fall back to the processDefinitionKey split until redeployed with a tag',
            'Procesbibliotheek shows a board-owner badge per deployed bundle (infra-board, caseworker, public-affairs)',
            'HistoricTask carries boardOwner, resolved per process key (cached) from the deployed BPMN',
          ],
        },
        {
          icon: '👤',
          iconColor: 'blue',
          title: 'Infra-board Portfolio — ROL filter driven by process ownership',
          items: [
            'Live RIP Fase 1 projects now carry their lead role from a leadRole process variable (derived in-process) instead of a hardcoded "projectleider"',
            'The Portfolio ROL dropdown is data-driven — it lists the roles actually present instead of two fixed options',
            'Instances without leadRole (legacy/running) default to Projectleider, so nothing breaks before redeploy',
          ],
        },
        {
          icon: '🤖',
          iconColor: 'green',
          title: 'AI-assistant — retired models replaced, friendlier errors',
          items: [
            'Fixed the sudden 404 (not_found_error): Claude Sonnet 4 and Opus 4 dated snapshots were retired by Anthropic on June 15, 2026; the registry now uses the claude-sonnet-4-6 and claude-opus-4-8 aliases, which do not expire',
            'Provider errors (retired model, auth, rate limit, overload) are translated to clear Dutch messages with a code-driven badge instead of the raw API payload',
            'Assistant runs at medium effort for faster responses without a noticeable quality drop',
          ],
        },
      ],
    },
    {
      version: '3.4.0',
      status: 'Feature Release',
      statusColor: 'blue',
      borderColor: 'blue',
      date: 'June 20, 2026',
      sections: [
        {
          icon: '🏠',
          iconColor: 'blue',
          title: 'New landing page — board catalogue (Flevoland)',
          items: [
            'Landing page (/) shows the three boards: Caseworker, PA-Cockpit, Infra-board',
            'Recognisable CSS mini-preview + short description + availability per board',
            '"Log in" and "Open" start the employee login; "Open <board>" remembers the board after login',
            'Quiet "Resident? Log in with DigiD" link in the topbar for citizens',
          ],
        },
      ],
    },
    {
      version: '3.3.0',
      status: 'Feature Release',
      statusColor: 'blue',
      borderColor: 'blue',
      date: 'June 19, 2026',
      sections: [
        {
          icon: '🏗️',
          iconColor: 'blue',
          title: 'Infra-board — first cut (Flevoland)',
          items: [
            'New /dashboard/infra-board route, gated on infra-projectteam',
            'Mijn dag · Portfolio (Gantt + per fase) · Beheer; live Taken via businessApi.task.*',
            'Project detail renders the RIP Fase 1 swimlane from activity-history + the 4 Projectplan-onderdelen',
            'Reuses tenant theme, ⌘K palette, RipFase1WipViewer and the IOU assistant',
          ],
        },
      ],
    },
    {
      version: '3.2.1',
      status: 'Bug Fix',
      statusColor: 'green',
      borderColor: 'green',
      date: 'June 17, 2026',
      sections: [
        {
          icon: '🔋',
          iconColor: 'green',
          title: 'Thuisbatterij subsidie — MijnOmgeving (Flevoland)',
          items: [
            'Subsidies card now opens a ThuisbatterijSubsidieAanvraagProcess start form instead of the "in ontwikkeling" stub',
            'Success confirmation shows dossier number and routes to Mijn aanvragen',
            'Mijn aanvragen tab now labels ThuisbatterijSubsidieAanvraagProcess as "Thuisbatterij subsidie aanvragen"',
            'Caseworker TakenInbox picks up thuisbatterij tasks automatically — no additional configuration required',
          ],
        },
      ],
    },
    {
      version: '3.2.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'June 8, 2026',
      sections: [
        {
          icon: '🏛️',
          iconColor: 'purple',
          title: 'PA-Cockpit — first cut (Flevoland)',
          items: [
            'New /dashboard/public-affairs route, gated on public-affairs role + province org-type',
            'Vandaag · Dossiers · Monitoring · Voortgang; Flevolands Kompas radar + 0–2 scorecard',
            'Reuses tenant theme, ⌘K palette and the IOU assistant (McpChatSection) from the V2 shell',
          ],
        },
      ],
    },
    {
      version: '3.1.2',
      status: 'Bug Fix',
      statusColor: 'green',
      borderColor: 'green',
      date: 'June 8, 2026',
      sections: [
        {
          icon: '💬',
          iconColor: 'purple',
          title: 'Feedback / use case handled',
          items: [
            {
              type: 'feedback',
              iid: 29,
              title: 'Bij regelcatalogus kan ik de pagina van de provincie Flevoland niet openen',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/29',
            },
            {
              type: 'feedback',
              iid: 28,
              title:
                'Producten en diensten lijken groen en rijp door elkaar. Kan hiervoor een bepaalde classificatie worden gebruikt zodat het zoeken gemakkelijker wordt?',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/28',
            },
            {
              type: 'feedback',
              iid: 24,
              title:
                'Als ik niet ingelogd ben en ik kies op het tabblad Home voor "Gegevenswoordenboek", krijg ik een melding dat één of meerdere templates geïnstalleerd moeten worden',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/24',
            },
            {
              type: 'feedback',
              iid: 22,
              title: 'In het projecten archief zie ik rare bestandsnamen (?) staan',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/22',
            },
            {
              type: 'feedback',
              iid: 20,
              title:
                'In de Regelcatalogus werkt de link flevoland.nl niet. Dat is een bekend probleem op het interne netwerk. www.flevoland.nl werkt wel.',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/20',
            },
          ],
        },
        {
          title: 'Producten & Diensten — Classificatie, filters en sortering',
          icon: '🔧',
          iconColor: 'green',
          items: [
            'Replaced the flat, undifferentiated product list with a grouped view by Soort: Subsidies, Vergunningen/meldingen/activiteiten, and Bezwaar & klacht',
            'Soort is derived server-side in productenDiensten.service.ts from the title (the SC4.0 feed carries no thematic classification) and cached on ProductDienstItem alongside the other fields',
            'Added an Aanvraagwijze filter (Online aanvragen / Informatie & op afspraak) driven by the existing onlineAanvragen flag, next to the existing Doelgroep filter',
            'Added a Sorteren control (Naam A–Z, Naam Z–A, Laatst bijgewerkt) that orders the cards within each Soort group independently',
          ],
        },
        {
          title: 'Archief — Hide machine-identifiers',
          icon: '🔧',
          iconColor: 'green',
          items: [
            'Hid the assignee identifier shown on completed-task cards in the Archief section — raw UUIDs and ronl-worker-* external task worker IDs carry no meaning for caseworkers and were confusing',
            'The assignee is now suppressed entirely when it matches a UUID or worker-ID pattern; the truncated value and its hover tooltip (which exposed the full UUID) are removed',
            'Genuine human assignee usernames, when present, still render as before',
          ],
        },
        {
          title: 'Regelcatalogus — Organisatie-homepagelink',
          icon: '🔧',
          iconColor: 'green',
          items: [
            'Fixed broken organisation homepage link in the Organisaties tab of RegelCatalogus.tsx — Provincie Flevoland resolved to its apex domain (flevoland.nl), which does not serve content without the www subdomain',
            'New withWww() helper normalises the homepage URL: prepends www. to the hostname when absent, leaves URLs that already carry www. (or any other subdomain) untouched, and falls back to the original value for unparseable strings',
            'Normalisation applied to both the anchor href and the displayed link text so the visible label matches the actual destination',
          ],
        },
      ],
    },
    {
      version: '3.1.1',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '2026-06-07',
      sections: [
        {
          icon: '🤖',
          iconColor: 'purple',
          title: 'AI assistant — overlay panel, resizable, Dutch translation',
          items: [
            'The AI assistant in CaseworkerDashboardV2 now appears as a floating overlay panel on top of the page instead of a panel that pushes the content aside — opening, closing and resizing it leaves the rest of the screen untouched.',
            'The panel is now resizable: drag its left edge (or use the arrow keys when the divider has focus) to widen or narrow it between 320px and 60% of the viewport (max. 720px). The chosen width and open/closed state are remembered via sessionStorage.',
            'Added padding around the assistant avatar and the source-pill row ("Process Engine", etc.), and switched the avatar color to the V2 magenta accent (`--color-secondary`) instead of the structural chrome-blue — now consistent with the floating "Vraag de assistent" toggle button.',
            'Translated every remaining English string in the assistant panel to Dutch: titles, placeholders, buttons, status messages and aria-labels (e.g. "AI Assistant" → "AI-assistent", "Clear chat" → "Chat wissen", "Ask a question… (Enter to send)" → "Stel een vraag… (Enter om te verzenden)", "Select at least one source…" → "Selecteer minstens één bron…").',
          ],
        },
      ],
    },
    {
      version: '3.1.0',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '2026-06-07',
      sections: [
        {
          icon: '🚀',
          iconColor: 'purple',
          title: 'Caseworker Dashboard — V2 cutover',
          items: [
            '`/dashboard/caseworker` now serves CaseworkerDashboardV2 directly — the V2 shell (3-mode rail, ⌘K command palette, assistant dock, command-driven section routing) is the default and only caseworker portal. The separate `/dashboard/caseworker/v2` route has been removed; all internal redirects (login, logout, "back to dashboard") now point at the canonical `/dashboard/caseworker` path.',
            "CaseworkerDashboard (V1) and its now-orphaned section components have been deleted: `TakenSection` (superseded by V2's `TakenInbox`) and `GegevenswoordenboekSection` (superseded by `GegevenswoordenboekV2`). All other section components remain in active use, shared between the legacy code path and `SectionRouter`.",
            '`SessionExpiryWarning` — the "your session is about to expire" widget — was V1-only and would have silently disappeared for caseworkers; it is now rendered inside CaseworkerDashboardV2 so the warning and one-click token refresh keep working.',
            'Removed the "Klassieke weergave" link from the V2 top bar — there is no classic view to switch back to anymore — and dropped the associated `.v2-classic-link` style.',
          ],
        },
        {
          icon: '📰',
          iconColor: 'orange',
          title: 'Nieuws — Rijksoverheid feed migration (again)',
          items: [
            'The legacy `feeds.rijksoverheid.nl` subdomain has been decommissioned — DNS resolution now fails outright, breaking the Nieuws feed. The service has been migrated back to the `/api/rss` endpoint on rijksoverheid.nl with a JSON-encoded `query` parameter filtering on content_type `pro:newsDocument`, which is now stable and returns RSS XML in the same shape the existing parser expects. No parsing changes were required.',
          ],
        },
      ],
    },
    {
      version: '3.0.8',
      status: 'Enhancement',
      statusColor: 'orange',
      borderColor: 'orange',
      date: '2026-06-06',
      sections: [
        {
          icon: '💬',
          iconColor: 'purple',
          title: 'Feedback / use case handled',
          items: [
            {
              type: 'feedback',
              iid: 33,
              title:
                'Bij sommige publieke routes (/use-case, /upload_file en /feedback) worden verzoeken geaccepteerd zonder authenticatie, rate limiting of een CAPTCHA.',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/33',
            },
          ],
        },
        {
          icon: '🔐',
          iconColor: 'orange',
          title: 'Security hardening — public write endpoints',
          items: [
            'ALTCHA proof-of-work challenge added to POST /use-case and POST /feedback — visitors must complete a SHA-256 PoW puzzle before a GitLab work item is created; /upload-file is intentionally excluded as it is a pre-upload step, not the final submission gate.',
            'GET /altcha/challenge issues a signed challenge (max 50 000 iterations, 10-minute expiry) via altcha-lib; ALTCHA_HMAC_KEY configures the HMAC secret — when unset the check bypasses gracefully so development environments without the key are not blocked.',
            'Frontend: <altcha-widget> web component rendered above the Indienen button in both the Gebruiksscenario and Feedback forms; verified payload is included in the form submission automatically.',
            'Upload type whitelist tightened on POST /upload-file: only images, PDF, plain text, Word/ODT, Excel, and XML are accepted — both MIME type and file extension are checked independently, blocking extension spoofing.',
            'Rate limit on public write endpoints reduced from the global 100 req/min to 10 req per 15 minutes per IP, with standardised RateLimit-* response headers.',
          ],
        },
        {
          icon: '⚙️',
          iconColor: 'gray',
          title: 'Build',
          items: [
            'Backend tsconfig upgraded from CommonJS/Node10 to module: node16 / moduleResolution: node16 — enables subpath exports resolution and aligns TypeScript module semantics with the Node.js runtime.',
          ],
        },
      ],
    },
    {
      version: '3.0.7',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '2026-05-07',
      sections: [
        {
          icon: '🔐',
          iconColor: 'blue',
          title: 'Caseworker V2 — permissions & multi-tenant',
          items: [
            'Rail items and the command palette share a single gate predicate: a section appears only if the user is signed in (when required), the active tenant supports the section, the user has the right role, and the organisation type matches. What is hidden in the rail is also hidden in ⌘K.',
            'Per-section role gates wired to match V1: `hr-onboarding` / `onboarding-archief` → `hr-medewerker`, `capacity-claim` → `manager`, `capacity-claim-archief` → 9-role set, `rip-fase1*` → `infra-projectteam`, `audit-overzicht` / `audit-details` → `admin`. No more lock screens in the main pad — rail items disappear directly when the role is missing.',
            'Tenant gate: rail items only appear if their id exists in `tenants.json` for the active tenant. Shell-global items (audit, gereedschap, taken, DVTP, quick filters) bypass this gate. Result: Toeslagen, UWV and the municipalities now see exactly what V1 shows them.',
            '`audit-details` added as a second admin rail item alongside `audit-overzicht` (matches V1).',
            '`SectionRouter` has a generic `findGateFor()` lookup and renders `<NoAccessPanel>` for every gated section — no longer just audit. Defence-in-depth for deep links and URL paste.',
          ],
        },
        {
          icon: '🌐',
          iconColor: 'green',
          title: 'Public library',
          items: [
            'The six library sections (Berichten, Nieuws, Producten & Diensten, Regelcatalogus, Procesbibliotheek, Gegevenswoordenboek) are publicly accessible via "Verken openbare bibliotheek" under the login wall. No `authRequired`, no organisation-type gate. Civil-servant intent is enforced at the shell level (commercial tenants do not have a caseworker dashboard at all).',
            'IOU rail items "Actieve zaken" and "Archief" marked as `authRequired` so they no longer leak into the anonymous Beheer rail. The entire IOU group disappears for unauthenticated users.',
          ],
        },
        {
          icon: '🏢',
          iconColor: 'purple',
          title: 'Tenant scope & demo flows',
          items: [
            'Caseworker V2 explicitly scoped to civil-servant tenants: `municipality`, `province`, `national`. Commercial tenants (Unive) are out of scope — they only have the citizen MijnOmgeving (including the cross-org zorgtoeslag demo handled by Dienst Toeslagen).',
            'DVTP scoped to `municipality` caseworkers via `requiredOrgTypes`. Visible for Utrecht / Amsterdam / Rotterdam / Den Haag; hidden for Flevoland (province) and the national tenants. Demonstration flow only.',
          ],
        },
      ],
    },
    {
      version: '3.0.6',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '2026-05-06',
      sections: [
        {
          icon: '📚',
          iconColor: 'blue',
          title: 'Gegevenswoordenboek',
          items: [
            'New rail item under **Zoeken** that embeds the Skosmos thesaurus (RONL Concepten) directly inside the dashboard — no more context-switching to a separate tab.',
            'Toolbar above the iframe carries the source label, an in-context search box that submits straight into Skosmos, an NL/EN language toggle, and an "open in new tab" escape hatch.',
            'Iframe fills the full main area edge-to-edge — `:has()` selector strips the default content padding only when this section is mounted, so the rest of the dashboard is unaffected.',
          ],
        },
        {
          icon: '🎨',
          iconColor: 'purple',
          title: 'Skosmos embed theme',
          items: [
            'Custom Twig partial at `custom-templates/html-head/embed.twig` injects an embed-mode flag + inline CSS on every Skosmos page. Activated by `?embed=1` on first load and persisted in `sessionStorage`; also auto-activates when Skosmos is rendered inside an iframe (catches the `/ronl/` → `/ronl/en/` redirect that strips the query string).',
            'Skosmos chrome hidden when in embed mode: top nav, vocabulary header, language switcher, footer, feedback links — leaves only the A-Z / Hiërarchie / Groepen / Nieuw tabs and the concept content.',
            'Tokens overridden to match V2: Flevoland blue (`#0046ad`) for links and primary buttons, magenta (`#e70077`) for active tab underline and input focus rings, neutral greys for borders and labels.',
            'Concept-page typography rebalanced: row labels (Voorkeursterm, Verwante concepten, In andere talen, URI, Download dit concept, Woordenlijstinformatie) collapse to 13px small-caps grey so they read as siblings; `#concept-preflabel` (the term itself) stays at 22px bold as the page anchor.',
            'Tighter sidebar list rows, 6px border-radius on inputs and buttons, table headers in small-caps — all aligned with the V2 design tokens.',
          ],
        },
      ],
    },
    {
      version: '3.0.5',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '2026-05-06',
      sections: [
        {
          icon: '💬',
          iconColor: 'purple',
          title: 'Feedback / use case handled',
          items: [
            {
              type: 'feedback',
              iid: 22,
              title: 'In het projecten archief zie ik rare bestandsnamen (?) staan',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/22',
            },
            {
              type: 'usecase',
              iid: 25,
              title: 'Default met taken openen',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/25',
            },
            {
              type: 'usecase',
              iid: 26,
              title: 'Gereedschap naast de taken',
              url: 'https://git.open-regels.nl/showcases/iou-architectuur/-/work_items/26',
            },
          ],
        },
        {
          icon: '📦',
          iconColor: 'blue',
          title: 'Archief',
          items: [
            'Archive rows now show the process business key as the primary dossier identifier (e.g. `flevoland-1777905361680`), making completed cases recognisable at a glance.',
            'End time now includes time of day in addition to the date, so multiple completions on the same day are distinguishable in the row meta.',
            'Assignee is dimmed and rendered in monospace as trailing metadata; UUID-shaped assignees are truncated to the first 8 characters with the full value available on hover.',
            'Backend `getCompletedTasks` joins historic tasks with historic process instances to surface `businessKey` on the `HistoricTask` projection.',
          ],
        },
        {
          icon: '✨',
          iconColor: 'purple',
          title: 'Changelog',
          items: [
            'The changelog now supports linking to handled GitLab work items via a new `FeedbackItem` entry type in `changelog-data.ts`, distinguishing feedback from use cases.',
            'Each work item renders as a clickable row with a color-coded chip — amber `Feedback #N` for feedback items, indigo `Use Case #N` for use cases — opening the source work item in a new tab.',
            'String items in section `items` arrays continue to work unchanged; the `ChangelogItem` type is a string-or-object union, so existing entries needed no migration.',
          ],
        },
        {
          icon: '📰',
          iconColor: 'orange',
          title: 'Nieuws — Rijksoverheid feed migration',
          items: [
            'Rijksoverheid reverted the API migration on 2026-04-29 due to technical issues; the Nieuws service was switched back to the legacy feeds.rijksoverheid.nl/nieuws.rss feed. The cold-cache error handling improvements and source-label correction remain in place.',
          ],
        },
      ],
    },
    {
      version: '3.0.4',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '2026-04-28',
      sections: [
        {
          icon: '📰',
          iconColor: 'orange',
          title: 'Nieuws — Rijksoverheid feed migration',
          items: [
            'Rijksoverheid retired the legacy `feeds.rijksoverheid.nl` subdomain on 2026-04-28. The Nieuws section is now backed by the new RSS API at `/api/rss` on rijksoverheid.nl, which takes a JSON-encoded query parameter to filter on content_type `pro:newsDocument`.',
            'Cold-cache failure handling improved: when the upstream RSS feed is unreachable and there is no cached fallback, the route now returns 500 instead of an empty list, so the frontend shows the retry button rather than a blank "Geen nieuwsberichten beschikbaar" state.',
            'Source label corrected from "Government.nl" to "Rijksoverheid".',
          ],
        },
      ],
    },
    {
      version: '3.0.3',
      status: 'Bugfix',
      statusColor: 'orange',
      borderColor: 'orange',
      date: 'April 24, 2026',
      sections: [
        {
          title: 'AI Assistant — CPRMV Session Recovery',
          icon: '📜',
          iconColor: 'teal',
          items: [
            'CprmvMcpProvider now recovers automatically from remote session expiry — "Session not found" errors in callTool() and getToolDefinitions() trigger a disconnect/reconnect cycle and retry the call transparently',
            'isConnected() returning true on a stale client was the root cause: StreamableHTTPClientTransport session IDs are invalidated when the remote CPRMV server restarts or upgrades, independently of the local backend process',
            'One reconnect attempt per call; if the reconnect itself fails the error propagates normally and the provider shows as disconnected in GET /v1/mcp/sources',
          ],
        },
        {
          title: 'AI Assistant — OpenAI Provider Tool Result Flattening',
          icon: '🤖',
          iconColor: 'purple',
          items: [
            'flattenForOpenAI() added to OpenAILlmProvider — expands tool_results messages with multiple results into individual tool messages before passing to the OpenAI API; OpenAI requires exactly one tool message per tool_call_id',
            'toOpenAIMessage() tool_results case removed — now unreachable; replaced with an explicit default: throw to maintain TypeScript exhaustiveness and surface any future bypasses immediately',
          ],
        },
      ],
    },
    {
      version: '3.0.2',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: 'April 22, 2026',
      sections: [
        {
          icon: '🏛️',
          iconColor: 'purple',
          title: 'Management Capacity Claim process (Provincie Flevoland)',
          items: [
            'New HR-capacity BPMN bundle deployed to Operaton: line managers can submit staffing or hiring claims, consult HR Business Partner and Personnel Controller, route to the Board of Directors, and record the financial reservation after approval.',
            'DMN decision CapacityClaimRouting (FIRST hit policy, 9 rules) derives the handover route (recruitment vs procurement), candidate groups, and a human-readable advisory group label from requestType and department.',
            'Rejected claims loop back through a reconsideration meeting; a script task on the proceed path clears all stale claim-specific variables so switching from staffing to hiring on revision leaves no ghost data in the final handover document.',
            'Two document templates bound to user tasks: board-decision-notification (Board → requesting manager) and capacity-claim-handover (shared by the recruitment and procurement handover tasks), each rendered from the current process variables.',
          ],
        },
        {
          icon: '🔌',
          iconColor: 'blue',
          title: 'Backend — /v1/hr-capacity routes',
          items: [
            'New route module capacity.routes.ts mounted at /v1/hr-capacity, exposing three endpoints: /active and /completed (enriched with jobTitle, requestType, boardDecision, advisoryGroup) and /:instanceId/documents (returns both document templates plus current process variables in one call).',
            'OperatonService extended with getCapacityClaimActiveList, getCapacityClaimCompletedList, and getCapacityClaimDocuments. The documents method resolves the deployment from the process definition and fetches both .document resources concurrently; either template may be null if not present in the deployment bundle.',
            "Document endpoint enforces tenant isolation by checking the process-instance municipality variable against the caller's JWT tenant claim.",
          ],
        },
        {
          icon: '🖥️',
          iconColor: 'green',
          title: 'Frontend — MijnOmgeving caseworker views',
          items: [
            'Two new sections under Personal info for Flevoland: "Start capacity claim" (manager-only role gate) and "Completed capacity claims" (open to all participants of the capacity claim process).',
            'New CapacityClaimDocumentsViewer renders both document templates side by side from a single endpoint call, with collapsible sections for the board-decision-notification and the capacity-claim-handover.',
            'Archive cards show request type, advisory group, and a colour-coded decision badge (approved/rejected), with an expandable documents panel per claim.',
          ],
        },
        {
          icon: '🔐',
          iconColor: 'orange',
          title: 'Role-based task filtering',
          items: [
            "GET /v1/task now filters by the caller's Keycloak realm roles, not just the tenant. Users see only tasks whose candidate groups match at least one of their roles, matching Operaton's claim-time authorisation.",
            'Nine new realm roles added to ronl-realm.json: manager, board-secretary, board-director, hrm-unit, procurement-unit, planning-control-officer, financial-controller, hr-business-partner, personnel-controller.',
            'New test user test-mngr-flevoland (roles: caseworker, manager) for the Flevoland capacity claim flow; test-hr-flevoland picked up the eight non-manager process roles so it can handle board, handover, reservation, and reconsideration tasks end-to-end.',
          ],
        },
        {
          icon: '🧹',
          iconColor: 'gray',
          title: 'Cleaner process variable display',
          items: [
            'TakenSection and ArchiefSection no longer show tenant-context variables (municipality, organisationType, initiator, applicantId, assuranceLevel) or raw DMN output blobs (roleResult, routingResult) — these are noise once their hoisted top-level fields are displayed.',
          ],
        },
      ],
    },
    {
      version: '3.0.1',
      status: 'Patch',
      statusColor: 'green',
      borderColor: 'green',
      date: 'April 9, 2025',
      sections: [
        {
          icon: '🏛️',
          iconColor: 'blue',
          title: 'DvTP — Citizen consent flow',
          items: [
            'New "Mijn toestemming" tab in the citizen dashboard: citizens can complete the full DvTP Flow A (Toestemming geven) process without caseworker involvement.',
            'DvtpStartSection: starts the DvtpToestemmingGevenProcess via the deployed start form (initiator, service, scope, delegation options) with direct navigation to the task queue after submission.',
            'DvtpTakenSection: filtered task queue showing only DvTP tasks. Tasks are auto-claimed on selection — no manual claim step required.',
            'After completing the information form (consent-info) the decision form (consent-decision) appears automatically in the queue.',
            'Tab visibility is controlled by the "dvtp" feature flag in tenants.json, enabled by default for all tenants.',
          ],
        },
        {
          icon: '🔧',
          iconColor: 'gray',
          title: 'Improvements',
          items: [
            'Vernieuwen button added to "Mijn aanvragen": after completing a DvTP procedure the citizen can immediately reload the list to see the new decision.',
            'New "dvtp" feature flag added to TenantFeatures (tenant.ts and tenants.json) for tenant-level control over the consent flow.',
          ],
        },
      ],
    },
    {
      version: '3.0.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'April 4, 2026',
      sections: [
        {
          title: 'Gegevenswoordenboek — Skosmos Vocabulary Browser',
          icon: '📚',
          iconColor: 'blue',
          items: [
            'Skosmos 3 deployed as a Docker container on the VM (quay.io/natlibfi/skosmos:latest), proxied by Caddy at skosmos.open-regels.nl with automatic TLS',
            'Skosmos configured against the RONL TriplyDB Speedy SPARQL endpoint, pointing at the cp-taxonomy named graph containing the Company Passport Thesaurus for Legal Company Verifiable Credentials',
            'New public Gegevenswoordenboek section added to the caseworker dashboard home panel, embedding Skosmos as an iframe micro-frontend — accessible without login (isPublic: true)',
            'Caddy skosmos_security_headers snippet configured with CSP frame-ancestors allowing embedding from mijn.open-regels.nl, acc.mijn.open-regels.nl, and localhost:5173',
          ],
        },
      ],
    },
    {
      version: '2.9.7',
      status: 'Feature Release',
      statusColor: 'teal',
      borderColor: 'teal',
      date: 'April 3, 2026',
      sections: [
        {
          title: 'AI Assistant — CPRMV Legislation Provider',
          icon: '📜',
          iconColor: 'teal',
          items: [
            'CprmvMcpProvider added — connects to the CPRMV HTTP MCP server at acc.cprmv.open-regels.nl/mcp; enabled via CPRMV_MCP_ENABLED=true, URL overridable via CPRMV_URL',
            'Uses StreamableHTTPClientTransport (HTTP-based MCP) rather than StdioClientTransport — the CPRMV server is a remote HTTP endpoint, not a local subprocess',
            'Three tools exposed: rules_rules__rule_id_path__get (retrieve rules from BWB, CVDR, or EU CELLAR by rule ID path), ref_ref__referencemethod___reference__get (resolve rules by Juriconnect reference), celex_cellar_by_celex__celexid___language___format__get (look up EU CELLAR publications by CELEX id)',
            'config.cprmv added to Config interface and config object: enabled (CPRMV_MCP_ENABLED, default false), url (CPRMV_URL, default https://acc.cprmv.open-regels.nl/mcp)',
            'CprmvMcpProvider registered in index.ts inside the existing if (config.mcp.enabled) block, conditional on config.cprmv.enabled',
          ],
        },
        {
          title: 'AI Assistant — LDE Process Library Provider',
          icon: '📦',
          iconColor: 'teal',
          items: [
            'LdeMcpProvider added — spawns a custom lde-mcp stdio subprocess that connects directly to the LDE PostgreSQL database (lde_assets); enabled via LDE_MCP_ENABLED=true and LDE_DATABASE_URL',
            'Custom lde-mcp server in packages/backend/src/mcp-servers/lde/index.ts — exposes 6 tools: bundle_list, bundle_get (deployed BPMN bundles with forms, documents, subprocesses, DMN keys), form_list, form_get (full Camunda Form JSON schema), document_list, document_get (zones and bindings)',
            'Bundle SQL query mirrors the LDE listPublicBundles() query exactly — shell/standalone filter, subprocess join via called_element, form and document expansion via subqueries',
            'SSL handled by stripping sslmode from the connection URL and passing ssl: { rejectUnauthorized: true } directly to the pg Pool constructor — avoids the pg-connection-string sslmode=require deprecation warning',
            'config.lde added to Config interface and config object: enabled (LDE_MCP_ENABLED, default false), databaseUrl (LDE_DATABASE_URL)',
            'LdeMcpProvider registered in index.ts inside the existing if (config.mcp.enabled) block, conditional on config.lde.enabled',
          ],
        },
        {
          title: 'AI Assistant — LLM Provider Architecture',
          icon: '🤖',
          iconColor: 'purple',
          items: [
            'LlmProvider interface introduced in packages/backend/src/services/llm/LlmProvider.ts — decouples the agentic loop from any specific LLM SDK; defines AgentMessage, AgentToolUse, AgentToolResult, LlmStreamParams, and LlmTurnResult as provider-agnostic types',
            'LlmRegistry singleton maps model IDs to their owning provider; getAvailableModels() returns only models from providers where isAvailable() is true',
            'AnthropicLlmProvider registered with three models: claude-sonnet-4-20250514, claude-opus-4-20250514, claude-haiku-4-5-20251001; enabled when ANTHROPIC_API_KEY is set',
            'OpenAILlmProvider registered with gpt-4o and gpt-4o-mini; enabled when OPENAI_API_KEY is set; requires npm install openai --workspace=@ronl/backend',
            'mcpChat.service.ts refactored — runChatStream() now accepts modelId and resolves the correct LlmProvider from LlmRegistry; no direct SDK imports remain in the service',
            'GET /v1/mcp/models added — returns all available models with providerId and providerDisplayName; used by the frontend to populate the model selector',
            'POST /v1/mcp/chat body extended with modelId: string — required field; returns 400 INVALID_REQUEST when absent',
            'config.openai added to Config interface and config object: apiKey (OPENAI_API_KEY)',
          ],
        },
        {
          title: 'AI Assistant — Model Selector UI',
          icon: '🎛️',
          iconColor: 'blue',
          items: [
            'McpChatSection fetches available models from GET /v1/mcp/models on mount alongside sources; first model pre-selected by default',
            'Model selector rendered as a compact dropdown directly below the subtitle line in the header — inline with the Claude + source names, one line beneath',
            'Selector hidden when only one model is available; visible and labelled with providerDisplayName — modelDisplayName when multiple providers are registered',
            'selectedModelId sent with every POST /v1/mcp/chat request; LlmModelEntry type added to api.ts and imported in McpChatSection',
            'chatStream() signature in api.ts extended with modelId parameter; body includes modelId in the JSON payload',
          ],
        },
        {
          title: 'Caseworker Dashboard — Procesbibliotheek',
          icon: '📦',
          iconColor: 'blue',
          items: [
            'New Procesbibliotheek section added to the Home tab for all tenants with Regelcatalogus — public (no login required), isPublic: true',
            'Fetches deployed BPMN process bundles from the LDE public API (VITE_LDE_API_URL, CORS-open, no auth); separate ldeApi axios instance added to api.ts',
            'Cards show process name, bpmnProcessId, status badge (WIP/Actief/Concept), role badge (Standalone/Subprocess), and deployment date; expand to reveal forms, documents, DMN templates, and deployment ID',
            'ProcessBundle, BundleDeployedForm, BundleDeployedDocument types exported from api.ts; VITE_LDE_API_URL added to all env files and vite-env.d.ts',
          ],
        },
      ],
    },
    {
      version: '2.9.6',
      status: 'Enhancement',
      statusColor: 'green',
      borderColor: 'green',
      date: 'April 2, 2026',
      sections: [
        {
          title: 'IOU — Gebruiksscenario indienen',
          icon: '🏛️',
          iconColor: 'blue',
          items: [
            'Step 6 (Concrete Example): sub-step number badges changed from blue filled circles to slate rounded squares — eliminates visual collision with the section header badges which share the same shape and colour',
            'Step 6: remove button added per step row; only shown when more than one step is present, preventing accidental full deletion; button turns red on hover to signal destructive intent',
            'Step 9 (Existing Materials): optional file attachment upload added below the existing material checkboxes — drag-and-drop or file picker, up to 5 files of any type at 10 MB each',
            'Attachments are pre-uploaded to GitLab one by one via new POST /v1/public/upload-file before the use-case issue is created; returned markdown references are appended as a Bijlagen section in the issue body',
            'Submission reverted to JSON (Content-Type: application/json) — multipart/form-data on /use-case caused multer v2 text-field parsing to fail silently, leaving req.body empty regardless of file presence',
          ],
        },
        {
          title: 'Backend — New endpoint',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            'POST /v1/public/upload-file: accepts a single file of any type via multipart/form-data (field name: file), uploads it to the GitLab project uploads API, and returns the GitLab markdown reference — no authentication required; uses a dedicated uploadAny multer instance without the image-only fileFilter',
          ],
        },
      ],
    },
    {
      version: '2.9.5',
      status: 'Feature Release',
      statusColor: 'blue',
      borderColor: 'blue',
      date: 'April 1, 2026',
      sections: [
        {
          title: 'Caseworker Dashboard — IOU tab (Flevoland)',
          icon: '🏛️',
          iconColor: 'blue',
          items: [
            'New "IOU" top-nav tab added to the Flevoland tenant — tenant-scoped via tenants.json, visible without authentication',
            'Gebruiksscenario indienen: full use-case submission form with 10 sections (title, submitter, description, current situation, desired outcome, process steps, legislation, affected parties, existing materials, priority) — POSTs to existing POST /v1/public/use-case GitLab proxy; organisation pre-filled as "Provincie Flevoland"',
            'Feedback geven: feedback form with submitter info, description, and screenshot upload — paste (Ctrl+V), drag-and-drop, or file picker; up to 5 images at 10 MB each; backend uploads each image to GitLab via POST /api/v4/projects/:path/uploads before creating the issue with embedded markdown image references via new POST /v1/public/feedback route',
            'Actieve zaken: read-only list of open GitLab issues fetched via new GET /v1/public/use-cases?state=opened — expandable cards rendered with react-markdown + remark-gfm showing Indiener table, Beschrijving, and Gewenst resultaat sections parsed from the issue body',
            'Archief: same component as Actieve zaken with state=closed — completed and declined submissions',
            'IouZakenSection shared by both list views; WORK_ITEM_FIELDS constant controls which markdown sections are extracted and displayed per card',
            'Main content area overflow corrected from flex-col to block — scrolling now works correctly for all long-form sections',
          ],
        },
        {
          title: 'Backend — IOU public endpoints',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            'GET /v1/public/use-cases?state=opened|closed — lists GitLab issues for GITLAB_PROJECT_PATH; returns iid, title, state, created_at, updated_at, web_url, labels, assignees, description; no authentication required',
            'POST /v1/public/feedback — multipart/form-data; accepts name, org, role, contact, description and up to 5 screenshot files; uploads images to GitLab project uploads API, embeds returned markdown references in issue body; multer in-memory storage with 10 MB per-file limit and image-only filter',
          ],
        },
      ],
    },
    {
      version: '2.9.4',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 30, 2026',
      sections: [
        {
          title: 'AI Assistant — Multi-Source MCP Registry',
          icon: '🤖',
          iconColor: 'purple',
          items: [
            'McpClientService singleton replaced by McpRegistry — a provider registry that manages multiple independent MCP sources; each provider connects, exposes tools, and contributes a system prompt block independently',
            'McpProvider interface introduced: id, displayName, description, connect(), disconnect(), getToolDefinitions(), callTool(), isConnected(), systemPromptContribution()',
            'OperatonMcpProvider replaces McpClientService — identical stdio subprocess behaviour, ALLOWED_TOOLS curation gate (15 read-only tools) preserved, systemPromptContribution() carries the Operaton-specific conventions',
            'TriplyDbMcpProvider added — spawns a custom triplydb-mcp stdio subprocess; connects to the RONL TriplyDB endpoint; enabled via TRIPLYDB_MCP_ENABLED=true',
            'Custom triplydb-mcp server in packages/backend/src/mcp-servers/triplydb/index.ts — exposes 11 tools: dmn_list, dmn_get, dmn_chain_links, dmn_enhanced_chain_links, dmn_semantic_equivalences, organization_list, service_list, rule_list, concept_list, service_rules_metadata, sparql_query',
            'SPARQL queries in triplydb-mcp are purpose-built from LDE sparql.service.ts and constants.ts — correct prefixes, type-compatible variable joins, skos:exactMatch semantic matching; sparql_query retained as escape hatch',
            'Default TRIPLYDB_ENDPOINT changed to the RONL dataset (stevengort/RONL) — the canonical knowledge graph replacing the earlier DMN-discovery subset',
            'McpRegistry.connectAll() connects all registered providers independently — a provider failure does not block others',
            'McpRegistry.getToolDefinitions(providerIds?) and callTool() accept optional provider ID filter for per-request source scoping',
            'McpRegistry.buildSystemPrompt(providerIds?) assembles a composite system prompt from only the selected connected providers',
            'McpRegistry.getProviderMeta() returns id, displayName, description, and connected status for all registered providers',
            'runChatStream() signature extended with selectedProviderIds: string[] — tools and system prompt are scoped to the selected providers per request',
            'POST /v1/mcp/chat body extended with sources: string[] — provider IDs selected by the user for this session',
            'GET /v1/mcp/sources added — returns registered provider metadata and connection status; used by the frontend to populate the source selector',
          ],
        },
        {
          title: 'AI Assistant — Source Selector UI',
          icon: '🎛️',
          iconColor: 'blue',
          items: [
            'McpChatSection fetches available sources from GET /v1/mcp/sources on mount; all connected sources pre-selected by default',
            'Source toggle buttons rendered below the message history — filled primary colour when selected, outlined when not; disabled and greyed out when the provider is offline',
            'Send button and textarea disabled when no sources are selected; placeholder text updated to reflect selection state',
            'Header subtitle dynamically shows active source display names (e.g. "Claude + Process Engine, Knowledge Graph")',
            'Empty state prompt adapts to selected sources',
            'Selected sources passed as sources array on every POST /v1/mcp/chat request; session-scoped — persists until Clear chat or page navigation',
          ],
        },
        {
          title: 'AI Assistant — Markdown Rendering',
          icon: '✨',
          iconColor: 'green',
          items: [
            'Assistant message bubbles now render Markdown via react-markdown — bold, lists, headings, and paragraphs display correctly instead of showing raw asterisks',
            'User bubbles retain plain whitespace-pre-wrap rendering; assistant bubbles use prose prose-sm Tailwind typography classes',
            'In-progress streaming bubble also uses ReactMarkdown — formatting appears incrementally as tokens arrive',
          ],
        },
      ],
    },
    {
      version: '2.9.3',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 26, 2026',
      sections: [
        {
          title: 'Caseworker Dashboard — Berichten & Regelcatalogus',
          icon: '📰',
          iconColor: 'blue',
          items: [
            'Berichten endpoint switched from hardcoded seed data to the Provincie Flevoland RSS feed (flevoland.nl/Content/Pages/Loket?rss=news) — same axios/regex pattern as the Nieuws service, 10-minute cache TTL',
            'HTML entities decoded server-side (nbsp, amp, euro, lt, gt, quot); action link populated from RSS <link> element as "Lees meer"',
            'getBerichtById() now reads from the live cache instead of the removed SEED constant; /berichten and /berichten/:id routes made async',
            'BerichtenSection footer row now renders item.action as a "Lees meer →" anchor, matching the NieuwsSection pattern',
            'Berichten section moved above Nieuws in leftPanelSections.home for all tenants in tenants.json',
            'Regelcatalogus default active tab changed from "diensten" to "organisaties"',
          ],
        },
        {
          title: 'Caseworker Dashboard — Producten & Diensten Catalogus',
          icon: '🗂️',
          iconColor: 'green',
          items: [
            'New "Producten & Diensten" section added to the Flevoland tenant home panel — publicly accessible without login',
            'Backend service fetches the Provincie Flevoland SC4.0 product feed (flevoland.nl/loket/loketoverview?sc40=true) — XML parsed server-side with no additional dependency, 30-minute cache TTL',
            'New GET /v1/public/producten-diensten endpoint; returns id, title, description, url, audience, onlineAanvragen, and modified per item',
            'ProductenDienstenCatalogus component: expandable 2-column card grid styled after RegelCatalogus, with free-text search and audience filter (Alle / Ondernemer / Particulier)',
            'Cards show audience badges and an "Online aanvragen" badge where applicable; expanded card links directly to the product page on flevoland.nl',
            'Stats row shows total visible product count and number of online-aanvraagbare items',
            'Main content area overflow corrected from overflow-hidden to overflow-y-auto — all sections with long content lists are now fully scrollable',
          ],
        },
        {
          title: 'AI Assistant — MCP Client Integration',
          icon: '🤖',
          iconColor: 'purple',
          items: [
            'McpClientService: spawns operaton-mcp as a stdio child process, platform-aware launch (npx on Windows/macOS, node via require.resolve on Linux), 30s connect timeout, graceful fallback on failure',
            'operaton-mcp added as a regular backend dependency (packages/backend) — bundled with deployment zip, no global install required on Azure',
            'McpChatService: agentic loop using claude-sonnet-4 with up to 10 tool-call rounds; ALLOWED_TOOLS curation gate (15 read-only tools) prevents context window overflow',
            'POST /v1/mcp/chat replaced with SSE streaming — Content-Type: text/event-stream, headers flushed immediately, X-Accel-Buffering: no set for Caddy; three event types: status (tool call starting), delta (text token), done (loop complete)',
            'client.messages.stream() used in place of messages.create(); text deltas emitted immediately on all rounds so the user sees tokens arrive in real time',
            'Tool result payloads capped at 12,000 characters before being added to the messages array — prevents prompt-too-long errors on multi-round queries that return large Operaton JSON responses',
            'Timeout raised to 240s for SSE endpoint — multi-round agentic queries (process list → deployment details → decision definitions) require more wall-clock time than the original 120s allowed',
            'POST /v1/mcp/chat excluded from audit log middleware alongside GET /v1/admin/audit — high-frequency chat turns do not need an audit trail',
            'AbortController threaded through the streaming loop and tool execution: fires on client disconnect and on timeout, preventing orphaned Anthropic API calls',
            'businessApi.mcp.chatStream() async generator in api.ts replaces the axios POST — refreshes Keycloak token first, then consumes the SSE ReadableStream line-by-line and yields typed McpChatStreamEvent objects',
            'McpChatSection: in-progress assistant bubble updates token-by-token on delta events with a blinking cursor; status line above the typing dots shows the active tool name (e.g. "Calling deployment_list…") between rounds; Clear chat aborts any in-flight stream; AbortController cancelled on unmount',
            'AI Assistant section added under Gereedschap tab — role-gated, chat history lifted to CaseworkerDashboard state so conversation survives navigation',
            'EPIPE errors from MCP child process stdio suppressed — no longer crash the backend on disconnect',
            'Azure App Service: Node runtime upgraded to NODE|22-lts (required by operaton-mcp); OPERATON_USERNAME, OPERATON_PASSWORD, ANTHROPIC_API_KEY, MCP_ENABLED added to ACC app settings',
          ],
        },
      ],
    },
    {
      version: '2.9.2',
      status: 'Refactor',
      statusColor: 'gray',
      borderColor: 'gray',
      date: 'March 23, 2026',
      sections: [
        {
          title: 'Caseworker Dashboard — Regelcatalogus',
          icon: '🔍',
          iconColor: 'blue',
          items: ['Changing tab order: Organisaties, Diensten, Regels, Concepten'],
        },
        {
          title: 'Caseworker Dashboard — Component Extraction',
          icon: '🏗️',
          iconColor: 'gray',
          items: [
            'CaseworkerDashboard.tsx reduced from ~2,500 lines to a pure shell: auth state, tenant config, nav state, and layout only — no domain logic remains in the page file',
            'formatDate extracted to src/utils/formatDate.ts and shared across components',
            'NieuwsSection and BerichtenSection extracted — fully self-contained with own fetch lifecycle; PRIORITY_STYLES and TYPE_LABELS moved into BerichtenSection',
            'ArchiefSection extracted — owns task history fetch, grouping logic, variable cache, and expand state',
            'OnboardingArchiefSection extracted — role-gated to hr-medewerker, owns completed onboarding list fetch and DecisionViewer expand state',
            'RipFase1WipSection and RipFase1GereedSection extracted — both role-gated to infra-projectteam, each owns its own project list fetch and RipFase1WipViewer expand state',
            'GereedschapSection extracted — owns all three status API calls (eDOCS, Operaton, external); PLATFORM_TOOLS constant moved out of the page file',
            'TakenSection extracted — owns full task queue lifecycle including list fetch, select, claim, TaskFormViewer integration, and onCountChange callback for the top nav badge',
            'HrOnboardingSection and RipFase1Section extracted — each owns its started/error state, eliminating the last uses of the shared actionMessage state in the dashboard',
            'useProfielData hook introduced in src/hooks/useProfielData.ts — shared by ProfielSection and RollenSection',
            'ProfielSection extracted — consumes useProfielData, owns employeeIdInput for manual ID lookup fallback',
            'RollenSection extracted — consumes useProfielData independently, derives onboarding roles and access level display',
            'AuditSection extracted — handles both audit-overzicht and audit-details tabs via activeTab prop, owns paginated fetch and load-more state',
          ],
        },
      ],
    },
    {
      version: '2.9.1',
      status: 'Feature Release',
      statusColor: 'teal',
      borderColor: 'teal',
      date: 'March 21, 2026',
      sections: [
        {
          title: 'Archive — Completed tasks',
          icon: '📋',
          iconColor: 'blue',
          items: [
            'Archive menu option in the caseworker dashboard now displays completed tasks via the Operaton historic task API (GET /history/task?finished=true)',
            'New backend endpoint GET /v1/task/history: tenant-scoped via municipality process variable, audited, registered before the /:id route to prevent shadowing',
            'OperatonService.getCompletedTasks(tenantId) added: fetches up to 200 completed tasks sorted by endTime descending',
            'businessApi.task.history() added to the frontend API client with HistoricTask type',
            'Tasks in Archive are grouped by processDefinitionKey, identical to the Tasks view: mono uppercase group headers, groups sorted by most recent endTime',
            'Task cards show task name, completion date and assignee; expanding reveals process variables via the existing historicVariables endpoint',
            'Variables are cached per processInstanceId — multiple expand actions require no repeated API calls',
          ],
        },
      ],
    },
    {
      version: '2.9.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 20, 2026',
      sections: [
        {
          title: 'Caseworker Dashboard — Gereedschap',
          icon: '🔧',
          iconColor: 'purple',
          items: [
            'New "Gereedschap" top-nav tab added as a platform-scoped section — not tenant-configured, visible to all authenticated caseworkers',
            'Tool cards for: Linked Data Explorer, TriplyDB, CPSV Editor, CPRMV API, Operaton Cockpit, eDOCS, SAP, and KMS',
            'Each active tool opens in a new browser tab via window.open; placeholder tools (eDOCS, SAP, KMS) show an orange "Binnenkort" badge and no open button',
            'Role-based visibility: Operaton Cockpit and SAP are only shown to users with the admin role; all other tools are visible to any authenticated user',
            'Adding a new tool requires a single entry in the PLATFORM_TOOLS constant — no other code changes needed',
            'Live status widget for Operaton Cockpit: fetched from GET /v1/health via existing health endpoint; displays Online/Offline badge and latency in ms',
            'Live status widget for eDOCS: fetched from GET /v1/edocs/status; displays Stub/Online/Offline badge, library name, and latency in ms',
            'Live status widgets for CPRMV API, TriplyDB, and Linked Data Explorer: fetched server-side via new GET /v1/health/external to avoid CORS; all three targets pinged in parallel with a 5-second timeout',
            'GET /v1/health/external added to health.routes.ts — performs HEAD requests to acc.cprmv.open-regels.nl, api.open-regels.triply.cc, and acc.linkeddata.open-regels.nl; returns status and latency per service',
            'businessApi.externalStatus() added to api.ts; businessApi.health() error handling hardened to extract dependency data from axios 503 responses',
          ],
        },
      ],
    },
    {
      version: '2.8.2',
      status: 'Bug Fix',
      statusColor: 'orange',
      borderColor: 'orange',
      date: 'March 19, 2026',
      sections: [
        {
          title: 'Audit Log — Database Persistence Fixes',
          icon: '🐛',
          iconColor: 'orange',
          items: [
            'persistAuditLog() refactored to pass an explicit named-parameter object to pg-promise instead of spreading the AuditLogEntry — the spread caused pg-promise to throw "Property does not exist" for any field not referenced in the SQL template (e.g. azp), silently suppressing all audit log writes on ACC.',
            "ipAddress port stripping now applied in the explicit object: entry.ipAddress.replace(/:\\d+$/, '') — Azure App Service appends the port to req.ip, which is invalid for PostgreSQL inet type. Was masked by the spread error and is now also fixed.",
          ],
        },
        {
          title: 'Backend — Process History Fix for Cross-Tenant Processes',
          icon: '🐛',
          iconColor: 'red',
          items: [
            'Fixed: citizens of any tenant (municipality, province, commercial) no longer see an empty Mijn aanvragen after submitting AwbZorgtoeslagProcess — the municipality filter was incorrectly applied to citizen history queries, causing dossiers to be invisible because the process runs under the toeslagen processing authority rather than the originating tenant',
            'getProcessHistory now applies the municipality filter only for caseworker requests — caseworkers still see all processes scoped to their own organisation',
            'Citizens are isolated by applicantId alone, which is sufficient since the route already enforces that citizens can only request their own history',
          ],
        },
      ],
    },
    {
      version: '2.8.1',
      status: 'Bug Fix',
      statusColor: 'orange',
      borderColor: 'orange',
      date: 'March 19, 2026',
      sections: [
        {
          title: 'Audit Log — M2M Tenant Fallback',
          icon: '🐛',
          iconColor: 'orange',
          items: [
            'persistAuditLog() in audit.service.ts now falls back to the azp claim when tenantId is absent, preventing NOT NULL violation on tenant_id for service account tokens. The fallback is applied only at the point of DB persistence — req.user.tenantId is unchanged.',
            'jwt.middleware.ts reverted: tenantId is set exclusively from the municipality claim. The earlier azp fallback on req.user caused tenantMiddleware to pass M2M tokens through to tenant-scoped routes, returning empty data instead of MISSING_TENANT.',
            'persistAuditLog() refactored to pass an explicit column object to pg-promise instead of spreading the entry — prevents "Property does not exist" errors when extra fields (azp) are present on the entry object.',
            'azp?: string added to AuditLogEntry in audit.types.ts and to AuthContext in auth.types.ts — eliminates type casts in audit.middleware.ts.',
          ],
        },
      ],
    },
    {
      version: '2.8.0',
      status: 'Feature Release',
      statusColor: 'teal',
      borderColor: 'teal',
      date: 'March 19, 2026',
      sections: [
        {
          title: 'M2M API — Operaton Access',
          icon: '🤖',
          iconColor: 'blue',
          items: [
            'New /v1/m2m/* route group in m2m.routes.ts: jwtMiddleware only, no tenantMiddleware — M2M clients are system actors not scoped to a single organisation',
            'Full Operaton surface exposed: process (list, start, status, variables, historic-variables, history, decision-document, start-form, variable-hints, delete), task (list, get, variables, form-schema, claim, complete), decision (evaluate, get)',
            'Curation gate: M2M_ALLOWED_OPERATIONS constant at the top of m2m.routes.ts — comment out any entry to disable that operation with no other code changes required',
            'Dedicated Operaton instance for M2M supported via OPERATON_M2M_BASE_URL, OPERATON_M2M_USERNAME, OPERATON_M2M_PASSWORD — falls back to the shared instance when unset',
            'OperatonService constructor updated to accept optional baseUrl, username, password parameters; existing singleton instantiation unchanged',
          ],
        },
        {
          title: 'OperatonService — New Public Methods',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            'getUserTasks() parameters made optional: tenantId omitted → unfiltered task list; existing callers with tenantId unaffected',
            'getTaskVariables(taskId) added: resolves processInstanceId via getTask(), then returns flattened process variables — replaces inline two-step pattern in task.routes.ts',
            'listProcessInstances(params?) added: thin pass-through to Operaton /process-instance, no tenant filter, intended for M2M',
            'queryProcessHistory(body) added: thin pass-through to Operaton POST /history/process-instance, caller controls all filters, intended for M2M',
            'getDecisionDefinition(key) added: fetches decision definition metadata by key, intended for M2M',
          ],
        },
        {
          title: 'Keycloak — operaton-mcp-client',
          icon: '🔑',
          iconColor: 'purple',
          items: [
            'New confidential Keycloak client operaton-mcp-client: service accounts enabled, Client Credentials grant only, audience mapper targeting ronl-business-api',
            'No municipality or organisation_type hardcoded claims — M2M client carries no tenant context by design',
          ],
        },
        {
          title: 'Audit Log — M2M Tenant Fallback',
          icon: '🗄️',
          iconColor: 'green',
          items: [
            'JWT middleware extractUser() falls back to azp claim when municipality is absent — prevents NOT NULL violation on tenant_id for service account tokens',
            'M2M audit entries record tenant_id as the Keycloak client ID (e.g. operaton-mcp-client), making M2M activity queryable in the audit log',
          ],
        },
      ],
    },
    {
      version: '2.7.3',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 19, 2026',
      sections: [
        {
          title: 'Multi-Tenant Architecture — Commercial Organisations',
          icon: '🏢',
          iconColor: 'purple',
          items: [
            'OrganisationType extended with commercial — shared across packages/shared, frontend tenant service, and Keycloak',
            'Unive Verzekeringen added as the first commercial tenant with its own theme, MijnOmgeving, and zorgtoeslag feature flag enabled',
            'Dienst Toeslagen added as a national tenant (processing authority for all AWB zorgtoeslag instances)',
            'Three new Keycloak test users: test-citizen-toeslagen, test-caseworker-toeslagen, test-citizen-unive',
            'tenants.json and PostgreSQL tenants table updated with toeslagen and unive entries',
          ],
        },
        {
          title: 'Backend — Cross-Tenant Processing Authority',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            "AwbZorgtoeslagProcess start route overrides municipality to toeslagen regardless of which tenant's MijnOmgeving the citizen used — ensures the toeslagen caseworker queue picks up all zorgtoeslag tasks",
            'originTenantId process variable records the originating channel (e.g. unive) for reporting without affecting task routing',
            'GET /v1/process/history drops the municipality filter for commercial org citizens — they can see their own dossiers even when the process ran under a different processing authority',
            'GET /v1/process/:id/historic-variables and GET /v1/process/:instanceId/decision-document tenant checks extended: access granted when municipality matches OR applicantId matches the requesting user — allows commercial org citizens to read their own decision documents',
          ],
        },
      ],
    },
    {
      version: '2.7.2',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 18, 2026',
      sections: [
        {
          title: 'Citizen Dashboard — AWB Zorgtoeslag Aanvragen',
          icon: '🏥',
          iconColor: 'blue',
          items: [
            'AwbZorgtoeslagProcess wired into the zorgtoeslag service card — citizens can now submit a formal zorgtoeslag application via the Awb process',
            'Zorgtoeslag service card split into two views: calculator (Berekenen) and application form (Aanvragen), toggled by button',
            'Clicking Aanvragen transitions to the ProcessStartFormViewer for AwbZorgtoeslagProcess without clearing the calculator inputs',
            'Calculator prefills the ProcessStartFormViewer initialData with all form values including computed age fields (leeftijdOpDatumBerekening, leeftijdOpLaatsteDagVorigeMaand, leeftijdOpLaatsteDagHuidigeMaand)',
            'Success card after submission shows dossier number and 8-week statutory notice (Awb 4:13), then navigates to Mijn aanvragen',
            'Mijn aanvragen now displays human-readable labels: AwbShellProcess → Kapvergunning aanvragen, AwbZorgtoeslagProcess → Zorgtoeslag aanvragen',
          ],
        },
        {
          title: 'Citizen Dashboard — Zorgtoeslag Calculator',
          icon: '🧮',
          iconColor: 'green',
          items: [
            'Calculator switched from berekenrechtenhoogtezorg DMN to zorgtoeslag_resultaat — the same DMN used by the Awb process',
            'Input fields updated to match the new DMN contract: geboortedatum, overlijdensdatum (optional), toetsingsinkomen, woonlandfactorBuitenland, statusZorgverzekerd, woonachtigNL, rechtmatigVerblijfNL, gedetineerd',
            'Age fields (leeftijdOpDatumBerekening, leeftijdOpLaatsteDagVorigeMaand, leeftijdOpLaatsteDagHuidigeMaand) computed client-side from geboortedatum at evaluation time',
            'Result card shows eligible/not-eligible outcome with estimated annual amount and monthly breakdown',
          ],
        },
        {
          title: 'Backend — Variable Coercion for AwbZorgtoeslagProcess',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            'POST /v1/process/AwbZorgtoeslagProcess/start applies type coercions before forwarding to Operaton: toetsingsinkomen and woonlandfactorBuitenland forced to Double regardless of whether the form submits an integer',
            'overlijdensdatum omitted from the variables payload when null or empty string — DRD expects absence, not an empty value',
          ],
        },
      ],
    },
    {
      version: '2.7.1',
      status: 'Feature Release',
      statusColor: 'blue',
      borderColor: 'blue',
      date: 'March 16, 2026',
      sections: [
        {
          title: 'Audit Log — Database Persistence',
          icon: '🗄️',
          iconColor: 'blue',
          items: [
            'audit.service.ts implemented: pg-promise connection pool wired to audit_logs PostgreSQL database; previously audit entries were in-memory only',
            'AuditLogEntry extracted to src/types/audit.types.ts — re-exported from audit.middleware.ts for backward compatibility',
            'persistAuditLog() called fire-and-forget from createAuditLog(); errors logged but never propagated to the request cycle',
            'initDb() called at server startup — non-fatal if DB is unreachable; falls back to in-memory logging until connection is restored',
            '304 Not Modified responses reclassified as success — status code threshold corrected from < 300 to < 400',
          ],
        },
        {
          title: 'Caseworker Dashboard — Audit Log Tab',
          icon: '📋',
          iconColor: 'purple',
          items: [
            'New "Audit log" top-nav tab with two left panel sections: Overzicht and Details',
            'Overzicht: paginated table showing timestamp, tenant, truncated user ID, action, and colour-coded result badge',
            'Details: same records with full details JSONB rendered as key/value pairs per row',
            'Load more pagination (50 records per page); manual Vernieuwen button resets to page 0',
            'Tab visible to all authenticated users; non-admin users see Toegang beperkt screen',
            'Audit records reload on every section entry — always shows current data when returning from other pages',
            'GET /v1/admin/audit endpoint — role-gated to admin, returns paginated records with total count',
          ],
        },
        {
          title: 'Bug Fixes',
          icon: '🐛',
          iconColor: 'red',
          items: [
            'JWT role extraction fixed: backend was reading payload.roles (always empty) instead of payload.realm_access.roles — role-gated endpoints including /v1/admin/audit now work correctly; side-effect fix for all requireRoles() guards across the API',
            'Session expiry warning appearing during active use: Axios interceptor updateToken threshold raised from 30s to 120s to match the warning threshold — token now silently refreshes on any API call while fewer than 2 minutes remain. (Partial: this only covered pages that make API calls; form-filling makes none, so an actively-typing user was still interrupted. Fully addressed by activity-based refresh in v3.8.2.)',
            'Audit log auto-selection on first visit: audit-log page now wired into the section-reset useEffect alongside tenant-driven pages',
          ],
        },
      ],
    },
    {
      version: '2.7.0',
      status: 'Feature Release',
      statusColor: 'teal',
      borderColor: 'teal',
      date: 'March 14, 2026',
      sections: [
        {
          title: 'eDOCS Service — Live Mode',
          icon: '📁',
          iconColor: 'blue',
          items: [
            'EdocsService implemented in packages/backend/src/services/edocs.service.ts: session token caching via /connect, automatic re-authentication on 401/403, ensureWorkspace, uploadDocument, getWorkspaceDocuments, and healthCheck',
            'ExternalTaskWorker implemented in packages/backend/src/services/externalTaskWorker.service.ts: long-polling Operaton external task API on topics rip-edocs-workspace and rip-edocs-document; worker starts on server boot and stops cleanly on SIGTERM/SIGINT',
            'edocs.routes.ts rewritten to call EdocsService instead of returning hardcoded stub responses; all four endpoints (status, workspaces/ensure, documents, workspaces/:id/documents) now go through the service',
            'Stub mode fully preserved: EDOCS_STUB_MODE=true (default) returns realistic fake responses identical in shape to live eDOCS responses; no callers can distinguish stub from live',
            'config.ts extended with edocs block: EDOCS_BASE_URL, EDOCS_LIBRARY, EDOCS_USER_ID, EDOCS_PASSWORD, EDOCS_STUB_MODE',
            'utils/errors.ts added: getErrorMessage() helper for safe extraction of error messages from unknown caught values',
          ],
        },
        {
          title: 'Copilot Studio — eDOCS OAuth Connection',
          icon: '🤖',
          iconColor: 'purple',
          items: [
            'Keycloak client copilot-studio-edocs registered in ronl-realm: confidential, service accounts enabled, client_credentials grant only, audience mapper targeting ronl-business-api',
            'OAuth 2.0 connection verified end-to-end on ACC: token obtained from acc.keycloak.open-regels.nl, Bearer token accepted by acc.api.open-regels.nl/v1/edocs endpoints',
          ],
        },
      ],
    },
    {
      version: '2.6.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 13, 2026',
      sections: [
        {
          title: 'RIP Fase 1 — Process Bundle (Flevoland)',
          icon: '🏗️',
          iconColor: 'blue',
          items: [
            'RipPhase1Process BPMN deployed: 17-step process covering intake → eDOCS workspace → intake meeting → intake report → approval loop → PSU → PSU report → risk file → PDP → approval loop → end',
            'RipProjectTypeAssignment DMN maps department + projectType to candidateGroups (infra-projectteam) and assignedRoles (infra-medewerker)',
            'Seven task forms: rip-intake, rip-intake-meeting, rip-intake-report, rip-psu-organize, rip-psu-execution, rip-risk-file, rip-approval',
            'Three document templates bundled in deployment: rip-intake-report.document, rip-psu-report.document, rip-pdp.document',
            'eDOCS integration via external service tasks on topics rip-edocs-workspace and rip-edocs-document; output variables edocsWorkspaceId, edocsIntakeReportId, edocsPsuReportId, edocsPdpId',
            'EmployeeRoleAssignment DMN updated: all infrastructuur roles prepend infra-projectteam to candidateGroups so onboarded infra employees can claim RIP tasks',
          ],
        },
        {
          title: 'RIP Fase 1 — Caseworker Dashboard',
          icon: '🏛️',
          iconColor: 'purple',
          items: [
            'Projecten → RIP Fase 1 starten: role-gated to infra-projectteam; starts RipPhase1Process with a single button; success state directs to task queue',
            'Projecten → RIP Fase 1 WIP: lists all active RipPhase1Process instances for the municipality grouped by edocsWorkspaceId, showing projectName, projectNumber, and start date',
            'Each WIP project expands to show three collapsible document sections: Intakeverslag (Kolom 2), PSU-verslag (Kolom 3), Voorlopige Ontwerpuitgangspunten (Kolom 4)',
            'Documents not yet produced by the process show "Nog niet beschikbaar" — no error state',
            'Document rendering reuses the same TipTap/ProseMirror zone renderer as DecisionViewer with zone key normalisation (signoff/signOff, contactInfo/contactInformation)',
          ],
        },
        {
          title: 'Backend — RIP Phase 1 Endpoints',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            "GET /v1/rip/phase1/active — lists active RipPhase1Process instances for the caseworker's municipality, enriched with projectNumber, projectName, edocsWorkspaceId",
            'GET /v1/rip/phase1/:instanceId/documents — fetches all three document templates from the deployment bundle plus current process variables in a single response; absent documents return null',
            'Both endpoints apply municipality-based tenant isolation consistent with all other process routes',
          ],
        },
        {
          title: 'RIP Fase 1 — Gereed archive',
          icon: '✅',
          iconColor: 'green',
          items: [
            'Projecten → RIP Fase 1 gereed: lists all completed RipPhase1Process instances for the municipality, matching the WIP layout with projectName, projectNumber, edocsWorkspaceId, and completion date',
            'Expands to render all three document templates via the same RipFase1WipViewer — documents that were not produced before completion show "Nog niet beschikbaar"',
            'GET /v1/rip/phase1/completed added alongside the existing /active endpoint, using the Operaton history API with finished: true',
          ],
        },
        {
          title: 'Keycloak — Flevoland RIP Roles',
          icon: '🔑',
          iconColor: 'green',
          items: [
            'infra-projectteam and infra-medewerker realm roles added',
            'test-infra-flevoland test user added with roles caseworker, infra-projectteam, infra-medewerker and attributes municipality=flevoland, employeeId=EMP-FLV-001',
          ],
        },
        {
          title: 'Caseworker Dashboard — UX',
          icon: '✨',
          iconColor: 'gray',
          items: [
            'Procesgegevens panel restyled to match RIP WIP document sections — bordered card with consistent ▲/▼ Verbergen/Tonen toggle',
            'roleResult intermediate DMN variable excluded from Procesgegevens display',
            'RIP WIP document zone key normalisation: signoff/signOff and contactInfo/contactInformation variants both handled — fixes crash when opening Intakeverslag',
          ],
        },
        {
          title: 'Session expiry warning',
          icon: '⏱️',
          iconColor: 'orange',
          items: [
            'SessionExpiryWarning component mounted in the caseworker dashboard — polls token expiry every 15 seconds and shows a modal when fewer than 2 minutes remain',
            'Modal offers "Sessie verlengen" (forces updateToken) and "Uitloggen". (Correction: the "unsaved form data is preserved when extending" claim only held when the token refreshed in place; if the SSO session was gone the extend fell back to a full-page login redirect that wiped the form. Draft persistence in v3.8.2 fixes this.)',
            'Axios request interceptor upgraded to proactively call updateToken(30) before every API request; forces re-login if the SSO session is gone',
          ],
        },
      ],
    },
    {
      version: '2.5.1',
      status: 'Enhancement',
      statusColor: 'green',
      borderColor: 'green',
      date: 'March 12, 2026',
      sections: [
        {
          title: 'Caseworker Dashboard — Changelog Panel',
          icon: '📋',
          iconColor: 'blue',
          items: [
            'Changelog panel now available in the caseworker dashboard header, mirroring the button already present on the login page',
            'Button positioned to the right of the authenticated user block for consistent right-side placement',
            'Accessible without login — visible to unauthenticated visitors alongside the public sections',
          ],
        },
        {
          title: 'Nieuws — Government.nl RSS Feed',
          icon: '📰',
          iconColor: 'green',
          items: [
            'Nieuws endpoint switched from the Rijksoverheid JSON API to the Government.nl RSS feed (feeds.government.nl/news.rss)',
            'RSS parsed server-side with no additional dependency — axios responseType text with regex-based item extraction',
            'Source attribution updated to Government.nl; CDATA and plain-text description fields both handled correctly',
            '10-minute cache TTL retained; stale cache returned on feed unavailability to prevent blank UI',
          ],
        },
      ],
    },
    {
      version: '2.5.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 12, 2026',
      sections: [
        {
          title: 'Caseworker Dashboard — Regelcatalogus',
          icon: '🔍',
          iconColor: 'blue',
          items: [
            'New public section "Regelcatalogus" added to the Home tab — accessible without caseworker login',
            'Diensten tab: Public services from the RONL knowledge graph are displayed as expandable cards with a full description and URI link; clicking "Toon concepten" navigates directly to the Concepts tab, pre-filtered by that service',
            'Organisaties tab: Implementing organizations with logo (retrieved via TriplyDB assets API), homepage, and linked services per organization',
            'Concepten tab: NL-SBB concepts searchable by label, filterable by service; each concept has a direct link to the skos:exactMatch URI',
            'Regels tab: Implementation rules grouped by service (Healthcare Allowance, Student Finance, Secondary School Funding Regulations); searchable by rule name and description, groups automatically expand when searching, description expandable per rule',
          ],
        },
        {
          title: 'Backend — Regelcatalogus Endpoint',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            'GET /v1/public/regelcatalogus — no authentication required; returns services, organisations, concepts, and rules in a single response',
            'Five parallel SPARQL queries against the RONL TriplyDB endpoint: PublicService, PublicOrganisation, competent authority links, NL-SBB concept traversal, and cpsv:Rule implementations',
            'Organisation logos resolved via TriplyDB assets API to versioned CDN URLs — same mechanism as the Linked Data Explorer',
            '5-minute in-memory cache per data slice; stale cache returned on TriplyDB failure to prevent blank UI',
            'RONL_SPARQL_ENDPOINT environment variable for overriding the default endpoint per deployment',
          ],
        },
      ],
    },
    {
      version: '2.4.1',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 11, 2026',
      sections: [
        {
          title: 'Multi-Tenant Architecture — Organisation Types',
          icon: '🏛️',
          iconColor: 'purple',
          items: [
            'Platform extended beyond municipalities: provinces and national government agencies now supported as first-class tenant categories',
            'New OrganisationType union type: municipality | province | national — shared across frontend, backend, and Keycloak',
            'organisationType JWT claim added to all tokens via Keycloak protocol mapper (organisation_type user attribute)',
            'organisationType propagated through AuthenticatedUser, JWTPayload, and BPMN process variables',
            'TenantConfig gains organisationType (required) and organisationCode (optional, for CBS PV codes, OIN, etc.); municipalityCode made optional',
            'tenants.json extended with Provincie Flevoland (province) and UWV (national) as reference tenants',
            'Backend error messages generalised: "municipality mismatch" → "organisation mismatch"',
            'PostgreSQL tenants table gains organisation_type and organisation_code columns',
            'Keycloak realm: organisation_type attribute and protocol mapper added; test users for flevoland and uwv added',
          ],
        },
      ],
    },
    {
      version: '2.4.0',
      status: 'Feature Release',
      statusColor: 'blue',
      borderColor: 'blue',
      date: 'March 11, 2026',
      sections: [
        {
          title: 'HR Onboarding Process',
          icon: '👤',
          iconColor: 'blue',
          items: [
            'HrOnboardingProcess BPMN deployed: collect employee data → DMN role assignment → HR review → notify employee',
            'EmployeeRoleAssignment DMN maps department + job function to assignedRoles, candidateGroups, and accessLevel',
            'All user tasks use candidateGroups="hr-medewerker" — claim-first workflow identical to Kapvergunning',
            'Process started with empty variables; first task (Collect employee data) appears in task queue immediately',
            'hr-medewerker realm role added; test-hr-denhaag and test-onboarded-denhaag test users added for Den Haag',
            'employeeId protocol mapper added to ronl-business-api-dedicated client scope — injects employee_id user attribute as employeeId JWT claim',
          ],
        },
        {
          title: 'IT Handover Document',
          icon: '📄',
          iconColor: 'purple',
          items: [
            'hr-it-handover.document authored and bundled in HrOnboardingProcess deployment (Version 4)',
            'Document linked via ronl:documentRef on Task_NotifyEmployee in HrOnboardingProcess.bpmn',
            'Template includes medewerkergegevens, toegangsspecificaties, and step-by-step Keycloak account creation instructions for IT',
            'Bindings cover employeeId, firstName, lastName, municipality, department, jobFunction, assignedRoles, candidateGroups, accessLevel, startDate',
          ],
        },
        {
          title: 'Caseworker Dashboard — HR Sections',
          icon: '🏛️',
          iconColor: 'green',
          items: [
            'Persoonlijke info → Profiel: JWT identity card + onboarding data auto-fetched via employeeId claim; manual input fallback when claim absent',
            'Persoonlijke info → Rollen & rechten: assigned roles from completed onboarding process with access level description card',
            'Persoonlijke info → Medewerker onboarden: role-gated to hr-medewerker; starts HrOnboardingProcess with a single button; success state directs to task queue',
            'Persoonlijke info → Afgeronde onboardingen: role-gated to hr-medewerker; lists all completed HrOnboardingProcess instances for the municipality with name, employee ID, and completion date; expand to render IT handover document via DecisionViewer',
            'GET /v1/hr/onboarding/profile — returns flattened historic variables for a completed onboarding by employeeId + municipality',
            'GET /v1/hr/onboarding/completed — returns list of all completed onboarding instances enriched with employeeId, firstName, lastName',
          ],
        },
        {
          title: 'Caseworker Dashboard — UX Fixes',
          icon: '✨',
          iconColor: 'orange',
          items: [
            'Header user block shows preferred_username, LoA badge, and all role badges dynamically — supports multiple roles',
            'Unauthenticated navigation to any top-nav page now defaults to the first section in the left panel, showing the login prompt immediately without a second click',
            'Afgeronde onboardingen access restricted to hr-medewerker role — regular caseworkers see access-denied message',
          ],
        },
      ],
    },
    {
      version: '2.3.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 9, 2026',
      sections: [
        {
          title: 'Citizen Dashboard — Document Template Viewer',
          icon: '📄',
          iconColor: 'purple',
          items: [
            'DecisionViewer replaced: citizen decision now renders the DocumentTemplate authored in the LDE Document Composer instead of a hardcoded form-js schema',
            'Template fetched via new GET /v1/process/:id/decision-document endpoint; falls back to the previous form-js readonly schema for process instances deployed before document templates existed',
            'TipTap/ProseMirror JSON blocks rendered as HTML — no TipTap runtime dependency in MijnOmgeving',
            'Placeholder substitution replaces {{variableKey}} in text blocks with historic process variables',
            'Variable blocks resolved directly from historicVariables by variableKey',
            'Letterhead and Contact Information zones rendered side-by-side in a CSS grid, matching the Document Composer canvas layout',
            'Separator, spacer, and image block types supported',
          ],
        },
        {
          title: 'Backend — Decision Document Endpoint',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            'GET /v1/process/:id/decision-document resolves the DocumentTemplate bundled in the Operaton deployment for a given process instance',
            'Reads ronl:documentRef attribute from the BPMN UserTask element via the process definition XML',
            'Fetches the named .document resource from the deployment bundle and returns it as { success: true, template: DocumentTemplate }',
            'Tenant isolation via municipality variable — same pattern as historic-variables',
            'Returns 404 DOCUMENT_NOT_FOUND when no ronl:documentRef is present or the resource is absent from the deployment',
            'Route ordering in process.routes.ts corrected: literal /history route and instance-ID sub-routes registered before definition-key sub-routes',
          ],
        },
        {
          title: 'LDE — BPMN Document Linking',
          icon: '🔗',
          iconColor: 'blue',
          items: [
            'BpmnCanvas properties panel writes ronl:documentRef="<templateId>" into the BPMN XML when a document template is linked to a UserTask',
            'ronl namespace (http://ronl.nl/schema/1.0) declared on the BPMN definitions element',
            'Linked document template bundled as a .document JSON file in the one-click deployment alongside BPMN and form files',
          ],
        },
      ],
    },
    {
      version: '2.2.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 5, 2026',
      sections: [
        {
          title: 'Citizen Dashboard — Dynamic Start Form',
          icon: '🌳',
          iconColor: 'green',
          items: [
            'Kapvergunning form replaced by @bpmn-io/form-js viewer — schema fetched live from the deployed process via GET /v1/process/:key/start-form',
            'Form renders with applicantId and productType pre-populated as hidden initial data',
            'On submit, form variables are passed directly to POST /v1/process/:key/start — no hardcoded field mapping',
            'Success card shows dossier number and statutory 8-week notice (Awb 4:13)',
            'Falls back gracefully when no form is deployed (404/415)',
          ],
        },
        {
          title: 'Caseworker Dashboard — Dynamic Task Forms',
          icon: '🏛️',
          iconColor: 'blue',
          items: [
            'All task-specific form components (CaseReviewForm, NotifyApplicantForm) replaced by a single TaskFormViewer component',
            'Form schema fetched per task via GET /v1/task/:id/form-schema with tenant isolation',
            'Process variables pre-populated into the form at import time — caseworker sees current DMN decisions immediately',
            'Submit fires the form-js submit event, completing the task via POST /v1/task/:id/complete with form data',
            'Tasks without a deployed form fall back to a generic complete button',
          ],
        },
        {
          title: 'Citizen Dashboard — Decision Viewer',
          icon: '📋',
          iconColor: 'purple',
          items: [
            'Completed applications in "Mijn aanvragen" show a "Bekijk beslissing" toggle',
            'DecisionViewer component fetches final variable state via GET /v1/process/:id/historic-variables using Operaton history API',
            'Backend GET /v1/process/:id/historic-variables flattens historic variable instances and applies tenant isolation via municipality variable',
            'Readonly form renders status, vergunningsbesluit, beslissing, herplantinformatie and dossiernummer — caseworker-only fields excluded',
            'Historic variables are available immediately after process completion — no polling required',
          ],
        },
        {
          title: 'Backend — Form Schema Endpoints',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            'GET /v1/process/:key/start-form — fetches deployed start form schema; returns 415 UNSUPPORTED_FORM_TYPE for legacy HTML formKey deployments',
            'GET /v1/task/:id/form-schema — fetches deployed task form schema with tenant isolation; treats Operaton 400 (no formRef set) as 404 FORM_NOT_FOUND',
            'POST /api/dmns/process/deploy — deploys BPMN + subprocess BPMNs + Camunda Forms in one multipart request; supports custom Operaton URL and credentials',
          ],
        },
      ],
    },
    {
      version: '2.1.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 3, 2026',
      sections: [
        {
          title: 'AWB Kapvergunning Process',
          icon: '🌳',
          iconColor: 'green',
          items: [
            'Full AWB shell process (AwbShellProcess) implementing Awb procedural phases 1–6',
            'TreeFellingPermitSubProcess handles substantive decision via TreeFellingDecision and ReplacementTreeDecision DMNs',
            'Both DMNs always evaluated before caseworker review, giving full context at the Sub_CaseReview task',
            'Sub_ResolveDecision script task applies caseworker override when reviewAction is "change"',
            'AWB shell sets dossierReference, receiptDate and awbDeadlineDate (8-week statutory deadline, Awb 4:13)',
            'Task_Phase6_Notify confirms citizen notification before process ends',
            'camunda:historyTimeToLive set to 365 (shell) and 180 (subprocess) per AWB retention requirements',
          ],
        },
        {
          title: 'Caseworker Task Queue — Claim-First Workflow',
          icon: '🏛️',
          iconColor: 'blue',
          items: [
            'userTask elements no longer use camunda:assignee — tasks are unassigned on creation',
            'candidateGroups="caseworker" set on Sub_CaseReview, Task_Phase6_Notify, and Task_RequestMissingInfo',
            'Tasks appear as Openstaand in the task queue and require an explicit claim before the action form is shown',
            'Task status in CaseworkerDashboard correctly shows Openstaand (unclaimed) vs Geclaimd (assigned)',
            'Removed dead Task_ExtractCompleteness scriptTask from AwbShellProcess (disconnected, never executed)',
          ],
        },
        {
          title: 'Backend — Tenant Variable Serialisation',
          icon: '⚙️',
          iconColor: 'orange',
          items: [
            'Tenant middleware now stores plain scalar values instead of wrapped {value, type} objects',
            'Process start routes wrap variables with inferType() before forwarding to Operaton',
            'Resolves "Must provide null or String value for SerializableValue type Json" 500 error on process start',
          ],
        },
      ],
    },
    {
      version: '2.0.2',
      status: 'Enhancement',
      statusColor: 'green',
      borderColor: 'green',
      date: 'March 1, 2026',
      sections: [
        {
          title: 'CI/CD Environment Configuration',
          icon: '⚙️',
          iconColor: 'blue',
          items: [
            'Replaced brittle sed-based URL patching in CI workflows with Vite native .env mode files',
            'Three environment files added: .env.development, .env.acceptance, .env.production',
            'New build scripts: build:acc and build:prod — no manual URL replacement needed for new service files',
            'api.ts, keycloak.ts and brp.api.ts now read VITE_API_URL and VITE_KEYCLOAK_URL from env at build time',
            'vite-env.d.ts added for TypeScript support of Vite environment variables',
            'Removed unused getRedirectUris() from keycloak.ts',
          ],
        },
      ],
    },
    {
      version: '2.0.1',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'February 27, 2026',
      sections: [
        {
          title: 'Caseworker Login',
          icon: '🏢',
          iconColor: 'blue',
          items: [
            'Dedicated "Inloggen als Medewerker" button on the landing page, visually separated from citizen IdP options',
            'Caseworker flow uses Keycloak-native login — no DigiD or eHerkenning required',
            'SSO session reuse via check-sso: returning caseworkers skip the login screen entirely',
            'Keycloak login form shows indigo "Inloggen als gemeentemedewerker" context banner when accessed as caseworker',
          ],
        },
      ],
    },
    {
      version: '2.0.0',
      status: 'Major Release',
      statusColor: 'blue',
      borderColor: 'blue',
      date: 'February 21, 2026',
      sections: [
        {
          title: 'Frontend Redesign',
          icon: '🎨',
          iconColor: 'blue',
          items: [
            'New landing page with identity provider selection (DigiD/eHerkenning/eIDAS)',
            'Custom Keycloak theme matching MijnOmgeving design',
            'Blue gradient header with rounded modern inputs',
            'Multi-tenant theming with CSS custom properties for runtime theme switching',
            'Dutch language support throughout authentication flow',
            'Mobile-responsive design for all screen sizes',
          ],
        },
        {
          title: 'Authentication Flow',
          icon: '🔐',
          iconColor: 'orange',
          items: [
            'Identity Provider selection before Keycloak authentication',
            'DigiD, eHerkenning, and eIDAS support (infrastructure ready)',
            'Seamless redirect flow with idpHint parameter',
            'Session storage for IDP selection persistence',
            'Enhanced error handling and user feedback',
          ],
        },
        {
          title: 'Infrastructure',
          icon: '🏗️',
          iconColor: 'green',
          items: [
            'Azure Static Web Apps deployment with SPA fallback routing',
            'Custom Keycloak theme deployment to VM',
            'Theme volume mounting for ACC and PROD environments',
            'Version-controlled deployment configurations',
            'Manual deployment process for VM-hosted services',
          ],
        },
      ],
    },
    {
      version: '1.5.0',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'February 5, 2026',
      sections: [
        {
          title: 'Multi-Tenant Support',
          icon: '🏛️',
          iconColor: 'purple',
          items: [
            'Four municipalities supported: Utrecht, Amsterdam, Rotterdam, Den Haag',
            'Municipality-specific theming with custom colors and logos',
            'Tenant configuration via JSON for runtime theme switching',
            'Municipality claim in JWT tokens for backend tenant isolation',
            'Test users for each municipality with proper attributes',
          ],
        },
        {
          title: 'Zorgtoeslag Calculator',
          icon: '💰',
          iconColor: 'green',
          items: [
            'DMN-based zorgtoeslag (healthcare allowance) calculation',
            'Integration with Operaton BPMN/DMN engine',
            'Business rules evaluation via REST API',
            'Result display with matched rules and annotations',
            'Support for multiple requirement checks and income thresholds',
          ],
        },
        {
          title: 'Security & Compliance',
          icon: '🔒',
          iconColor: 'red',
          items: [
            'JWT audience validation for API security',
            'Role-based access control (citizen, caseworker, admin)',
            'Assurance level (LoA) claims for DigiD compliance',
            'Audit logging with 7-year retention',
            'BIO (Baseline Information Security) compliance ready',
          ],
        },
      ],
    },
    {
      version: '1.0.0',
      status: 'Initial Release',
      statusColor: 'green',
      borderColor: 'green',
      date: 'January 15, 2026',
      sections: [
        {
          title: 'Core Architecture',
          icon: '🏗️',
          iconColor: 'blue',
          items: [
            'Monorepo structure with frontend, backend, and shared packages',
            'React 18 + TypeScript frontend with Vite build',
            'Express + TypeScript backend with PostgreSQL',
            'Keycloak 23.0 for authentication and authorization',
            'Operaton integration for BPMN/DMN execution',
          ],
        },
        {
          title: 'Development Environment',
          icon: '🛠️',
          iconColor: 'gray',
          items: [
            'Docker Compose for local development',
            'Hot module replacement for instant frontend updates',
            'TypeScript watch mode for backend recompilation',
            'Git hooks for pre-commit linting and pre-push type checking',
            'Comprehensive development documentation',
          ],
        },
        {
          title: 'Deployment',
          icon: '🚀',
          iconColor: 'orange',
          items: [
            'Azure Static Web Apps for frontend (ACC + PROD)',
            'Azure App Service for backend API',
            'VM-hosted Keycloak with separate ACC/PROD instances',
            'Caddy reverse proxy for SSL termination',
            'GitHub Actions for automated deployments',
          ],
        },
      ],
    },
  ],
};
