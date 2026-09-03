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

// Individual deployable a release can touch. 'both' is kept as a distinct
// legacy literal (see ScopeValue below) rather than folded into this set —
// every existing 'both' entry predates packages/public-site and specifically
// means "frontend + backend"; reusing it for a different combination later
// would retroactively misrepresent those historical entries.
// 'ci' is not a deployable: it marks a release that changes how the pipeline
// itself works — workflow pinning, gates, release tooling — and touches no
// package. A 'ci'-scoped release bumps the root package.json only, so it
// triggers none of the path-filtered deploy workflows.
export type ScopeTag = 'frontend' | 'backend' | 'public-site' | 'pa-demo' | 'ci';

// New entries express scope as an array of ScopeTag, even for a single
// package (e.g. ['backend']) — this is what lets a release touch backend +
// public-site (or any future combination) without inventing a new flat
// literal per combination. Old entries keep their pre-existing flat string
// ('frontend' | 'backend' | 'both'); ScopeBadge renders both forms.
export type ScopeValue = 'frontend' | 'backend' | 'both' | ScopeTag[];

export interface ChangelogVersion {
  version: string;
  status: string;
  statusColor: string;
  borderColor: string;
  date: string;
  // Which deployable(s) this release actually changed. Drives the FE/BE badge
  // and tells bump-release which package.json files to version — a frontend-only
  // release must NOT bump packages/backend/package.json, or it triggers the
  // backend ACC build for nothing. Omitted on legacy (pre-3.8.2) entries.
  scope?: ScopeValue;
  sections: ChangelogSection[];
}

// ── v2 (per-commit) format ───────────────────────────────────────────
// Matches the Regeleditor/LDE/CPSV Editor changelog pattern: one bold,
// icon+color-coded header per commit (not per feature/category), with the
// commit's own SHA/author attached and its body as the details underneath.
// Forward-only — legacy ChangelogVersion entries above keep rendering as-is;
// see ChangelogEntry.

export type CommitType =
  | 'feat'
  | 'fix'
  | 'test'
  | 'docs'
  | 'chore'
  | 'refactor'
  // Pipeline and supply-chain work: workflow pinning, CI gates, release
  // tooling. Distinct from 'chore' because it is the one category whose
  // commits change how everything else is built and shipped.
  | 'ci'
  | 'other';

export interface ChangelogCommit {
  /** Short SHA, e.g. '9248982'. */
  sha: string;
  author: string;
  /** Conventional-commit type — drives the header's icon + color. */
  type: CommitType;
  /** Bold header text. A cleaned-up, readable version of the commit
   *  subject (prefix stripped, lightly reworded for release-note tone) —
   *  not required to be verbatim. */
  subject: string;
  /** Body paragraphs — the "why", same technical depth as the actual
   *  commit message. One string per paragraph, no footer/trailer lines. */
  details?: string[];
}

export interface ChangelogVersionV2 {
  /** Discriminant — presence of 'commits' format marks the new shape. */
  format: 'commits';
  version: string;
  status: string;
  date: string;
  scope: ScopeValue;
  commits: ChangelogCommit[];
  /** RONL-specific: external GitLab work items (feedback/use-case) this
   *  release resolves. Rendered as its own labeled block below the commit
   *  list — same chip-link presentation as the legacy Feedback section. */
  feedback?: FeedbackItem[];
}

export type ChangelogEntry = ChangelogVersion | ChangelogVersionV2;

export interface Changelog {
  versions: ChangelogEntry[];
}

export const changelog: Changelog = {
  versions: [
    {
      format: 'commits',
      version: '2026.09.2',
      status: 'Released',
      date: '3 sep 2026',
      scope: ['backend', 'frontend', 'pa-demo', 'public-site'],
      commits: [
        {
          sha: 'bed7699',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'bump-release no longer contradicts itself about which sites redeploy',
          details: [
            'The release runbook stated the same fact twice and disagreed with itself. Its “Why scope matters” callout lists all four ACC workflows as path-filtered — the stated justification for the entire per-scope versioning scheme — while step 0, fifty-five lines below, said frontend, pa-demo and public-site trigger on push to acc “with no paths: filter”, singling out backend as the only filtered one.',
            'The callout is right: azure-publicsite-acc watches packages/public-site/** alone, with no shared/** and no backend/**, so public-site redeployed on no backend release at all while the step promised it had. A third of that sentence has been wrong on every backend release since the filters went in, and nothing caught it because the two statements were never read together.',
            'Deleted rather than corrected. Fixing the wrong copy in place would have left the duplication that produced it, and the same drift would recur. The replacement gives the instruction and sends the reader to the callout for the paths, without enumerating sites — the honest statement is per-scope, and an enumerated one is wrong for every release.',
          ],
        },
        {
          sha: '5b53700',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Every workspace held to an 80% per-file branch floor',
          details: [
            'Extends the backend-only coverage campaign to all five workspaces that have a test runner. 53 files were below 80% branch coverage; none are now. backend 89.97 → 92.17, frontend 80.42 → 89.52, pa-cockpit 76.06 → 88.52, public-site 70.39 → 96.92, pa-demo 86.95 → 95.65. Total 3683 tests, verified serially. @ronl/shared has no test script and needs none: it is types plus two seed modules with no functions and no branches.',
            'The new tests are behavioural rather than coverage-shaped. Three themes recur: per-type render arms, where DecisionViewer, CapacityClaimDocumentsViewer and RipFase1WipViewer each carry their own copy of the same TipTap renderer and each now gets a document exercising every node type the composer can emit; upstream absence, where a source answering with no value array or a signal from a source this build has no label for each has a fallback that now has a test saying what it is for; and the difference between “we looked and found nothing” and “we could not look”, which Results, GereedschapSection and Home all render distinctly, because a zero in place of a failed fetch is a wrong statement of fact rather than a neutral default.',
          ],
        },
        {
          sha: 'f355fce',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The EU signaalbron moves to the EP Open Data API',
          details: [
            'The EU source returned nothing on ACC, and not for any reason in this repository: www.europarl.europa.eu is CDN-fronted with undocumented bot mitigation that answers ACC’s outbound range with an empty 202 text/html. That passes res.ok, so the empty body parsed to zero items and the source reported success while contributing nothing — starving both the Ongefilterd browse and the six-hourly curation cron. Measured from inside the App Service, egress 20.76.244.212, in one run: both RSS URLs 202 with zero bytes, while data.europarl.europa.eu returned 200 with 211 KB of Atom. The API is also the endpoint the EP publishes for machines, documenting User-Agent as a header with the format {user-id}-{environment}-{version}, where the CDN gates on a UA family it never describes.',
            'fetchEuFeed’s signature is unchanged, so neither call site moved. The feed endpoint takes no query parameters — a fixed “published or updated in the last month” window — so paging stays in-process exactly as it was under RSS, and one request replaces two. Three things the live feed decided that the specification would not have: the parliamentary term is not always 10, because the window covers documents updated rather than only published, so the RSS-era pattern that hardcoded -10- silently dropped every older-term document; amendment refs carry extra segments and are excluded deliberately, an amendment being a fragment of a document with no doceo page of its own; and the type now comes from the work-type vocabulary rather than the ref prefix, which had never learned QOB.',
            'Two accepted trade-offs, both recorded rather than discovered later. Entries are English only — they arrive xml:lang="en" and Accept-Language is ignored — while the doceo link stays Dutch, since the document itself is translated even when its metadata is not. Press releases are gone: the API has no equivalent endpoint, they being a communications product rather than legislative data. Committee and per-entry summary are absent from the Atom feed too, so commissie is null for this sub-source and the description is built from the title alone; both are covered by tests so they read as decisions rather than surprises.',
          ],
        },
        {
          sha: '210fce2',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'The supply-chain audit runs on every pull request',
          details: [
            'The pull_request trigger was filtered to acc and main, so a pull request opened against a feature branch — a stacked PR — matched no trigger and accumulated no audit at all. It then reported mergeStateStatus CLEAN with zero checks: ready-looking, and not ready.',
            'The failure arrives later and is worse than it sounds. When the parent merges and GitHub retargets the stacked PR to acc, the required audit is missing and the PR blocks permanently, because retargeting emits no pull_request event and nothing ever runs it. Closing and reopening is the only way out, reopened being one of the default trigger types. The audit is read-only and cheap, so running it on every pull request regardless of base removes the hole rather than working around it; push keeps its filter, there being no reason to audit a push to a feature branch.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.09.1',
      status: 'Released',
      date: '2 sep 2026',
      scope: ['backend', 'frontend', 'pa-demo', 'public-site'],
      commits: [
        {
          sha: 'c2906dd',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The RIP ladder gets the 28 roles its models address work to',
          details: [
            'The process models address tasks to 34 candidate groups; the Keycloak realm defined 6. GET /v1/task passes the caller’s realm roles to Operaton as candidateGroups, so a task whose groups all fall outside them is filtered out before it reaches the client — not “cannot claim”, not listed at all. task.routes.ts states the assumption that made this invisible: “Candidate groups in the BPMN map 1:1 to realm role names in this platform.”',
            'Measured against the roles test-infra-flevoland held, 113 of the ladder’s 201 user tasks were unreachable, and it grew down the ladder — R4.1 onward majority-invisible, R5.2 showing 9 of its 36 tasks. Nothing caught it because the surfaces used most do not take that path: the Faseladder and its WIP/Gereed lists filter on the municipality process variable and never look at candidate groups.',
            'Only the local seed realm is changed here. ACC and production run their own realms, so the roles have to be created there too.',
          ],
        },
        {
          sha: 'c614cfb',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Rollen & rechten describes roles that exist',
          details: [
            'Of seven rip-* entries in the description map, exactly one described something real, while five of the six realm rip roles had no description at all. The map is now maintained additively: an entry for something that appears in no list simply never renders, whereas a missing one degrades the page to a bare identifier.',
          ],
        },
        {
          sha: '035d393',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The RIP ladder is complete: R5.1, R5.2, R5.4 and R6.1',
          details: [
            'Eleven phases modelled. R5.3 is the only one without a process definition and stays that way — a real step, named by R5.4’s own entry criterion, with no design sheet, no BPMN and no observable exit. previousModelledPhase skips it so R5.4 follows R5.2, and that path now runs against live data rather than only a test fixture.',
            'The withoutKey test fixture is synthesised rather than taken from a real phase: every phase now either carries a processDefinitionKey or is beyond, and beyond short-circuits before the key is consulted, so no real phase can exercise that branch any more.',
          ],
        },
        {
          sha: '489bdcb',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The Ongefilterd count reads as a cap, not a total',
          details: [
            'The number on the segment was a page size wearing the clothes of an answer. Politiek showed 60 and the other signaalbronnen 30 — not because the feeds hold that many, but because the view asks for 30 per source and politiek has two. fetchFeed returns { items, total } and the total was being discarded. Ongefilterd now follows the convention the Inbox segment already had: 60+ / 30+ when capped, with a banner carrying the real total.',
            'Two judgements are pinned by tests. A full page counts as capped even when the total is unknown — TK returns total: null for multi-term queries, and a null must never be read as “nothing more”; the page being full is the signal that survives either way. And the total is shown only when every source reported one, because a partial sum across sources would look authoritative without being so.',
          ],
        },
        {
          sha: 'efd39d6',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Browse each signaalbron’s raw feed unfiltered',
          details: [
            'An Ongefilterd segment beside Gecureerd and Inbox, showing the tab’s own sources with no query applied. The data path already existed end to end — GET /pa/feed reads q as string | null, every source client defaults it to null, and that blanco path is what the curation cycle itself runs on. What was missing was any way to reach it: runSearch returned early on an empty string, so a blank search showed nothing rather than everything.',
            'Where the segment appears is derived rather than listed. paTabFeedSources returns TAB_SOURCES as FeedSource ids, and an empty array is meaningful — it marks a monitoring tab with no feed, which today is agenda. So a future source tab gets the segment for free and agenda never does, without a second list that could drift from TAB_SOURCES.',
          ],
        },
        {
          sha: 'c561d48',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'R2.3 through R4.1 adopted in the phase catalogue',
          details: [
            'Five phases deployed via LDE, verified off the engine before adopting rather than taken from the deploy pull requests. The Faseladder reads 7 / 12 deelprocessen inzetbaar, and no source change was needed beyond the catalogue itself — the endpoints, readiness rule and progression generalised in v2026.09.0 already cover any modelled phase.',
            'Three test fixtures had pinned a literal phase code as “the one without a process model” and all three broke identically. They now derive it, so the next deployment does not break tests that have nothing to do with the phase being deployed.',
          ],
        },
        {
          sha: '046a7ab',
          author: 'renovate[bot]',
          type: 'chore',
          subject: 'vite 5 → 6 (security)',
          details: [
            'Raised across frontend, pa-cockpit, pa-demo and public-site from ^5.0.8 to ^6.4.3, with the lockfile regenerated. Build-time only — nothing vite-related ships in the deployed bundle. Open since 29 August and deferred from the previous two releases.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.09.0',
      status: 'Released',
      date: '1 sep 2026',
      scope: ['backend', 'frontend'],
      commits: [
        {
          sha: 'f556444',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Finishing a phase makes its project ready to start the next one',
          details: [
            "Completing R2.1 did nothing for R2.2. getReadyProjects read only the mock portfolio, so a completed live instance never entered it — and in the mock data a project at ladder position 1 can never be wachtend, which is what R2.2's ready list requires. Both routes to a ready project were closed.",
            'The rule, taken from the phase specs: a completed instance of phase N makes its project ready to start the next modelled phase after N. Every phase’s entry criterion names the previous phase’s exit artefact, several verbatim, so the ladder is strictly linear. R5.3 is the exception and the reason previousModelledPhase exists rather than RIP_PHASES[i-1]: R5.4 enters on “Oplevering areaal na R5.3”, so R5.3 happens — but it has no overzichtsplaat, no process model, and no exit artefact at all, so nothing about its completion is observable. Skipping it is an assertion, and skippedPhasesBefore surfaces it so R5.4 can say the oplevering is handled outside the tool.',
            'businessKey identifies the project’s journey rather than one instance: the originating R2.1 run mints it and every later phase inherits it. It now flows through both RIP list builders, and useRipPhaseReadiness excludes candidates whose key already has an active or completed instance of this phase. A candidate whose predecessor carries no key is kept — offering a possibly-duplicate start is recoverable, silently dropping a project from the board is not.',
          ],
        },
        {
          sha: '107ab72',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'A caller-supplied business key survives instead of being overwritten',
          details: [
            'addTenantToProcessVariables minted a fresh businessKey on every process start, unconditionally, discarding anything the caller sent before the service saw it. Invisible, because the key it produced looked exactly like the one it threw away — and harmless while every instance stood alone.',
            'It stops being harmless once two instances need to be recognisably related: with the overwrite in place each RIP phase got its own key, nothing was related to anything, and the R2.2 Starten tab kept offering projects that were already running. Now minted only when the caller has none. Honouring a supplied key is safe — businessKey grants no access, and tenant isolation runs on the municipality variable taken from the token on the line below, which the added test asserts still holds.',
          ],
        },
        {
          sha: '262401d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'A disabled button on the infra board now looks disabled',
          details: [
            '.cwd-v2 .v2-btn set cursor: pointer unconditionally and no :disabled rule existed anywhere in the stylesheet, so a disabled button rendered in full accent pink with a hand cursor — indistinguishable from a live one, on every screen using the shared v2 chrome. Found on Beheer → R2.2 → Starten, where the start button is correctly disabled with nothing selected but read as broken.',
          ],
        },
        {
          sha: '06b5015',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'RIP phase endpoints take a phase code instead of assuming R2.1',
          details: [
            'Deploying RipR22Process exposed how much of the live data path was pinned to R2.1 by a literal. The Faseladder badge and the per-phase counts generalised for free from the catalogue, but the WIP and Gereed lists, the portfolio’s live rows and the command palette read RipR21Process or R2.1 directly, so R2.2 rendered mock data beside a Gedeployed badge. /v1/rip/phase1/active and /completed become /v1/rip/phases/:code/…, and the documents route moves to /v1/rip/instances/:instanceId/documents — instance-keyed, because it resolves the deployment from the instance itself and its three resource names are R2.1’s document set rather than a general RIP convention.',
            'resolvePhaseKey separates two failure modes an empty list would conflate: 404 UNKNOWN_PHASE for a code the catalogue does not carry, 409 PHASE_NOT_MODELLED for a known phase with no process yet. A caller must be able to tell “no process deployed” from “deployed and idle”. The engine is not consulted, so a phase modelled here but absent from the target environment still answers 200 with an empty list; only deployment-status speaks to what is deployed where.',
            'The cross-phase portfolio fetch catches per request rather than relying on Promise.all — a non-2xx rejects the axios promise instead of resolving { success: false }, so one failing phase discarded every phase’s rows. PROCESS_DISPLAY_NAMES now derives from the phase catalogue: it feeds INFRA_PROCESS_KEYS, which filters both the infra task list and the Archief split, so the hand-written map would have silently dropped every R2.2 task from Mijn dag.',
          ],
        },
        {
          sha: '87f84d7',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'R2.2 maps to RipR22Process in the RIP phase catalogue',
          details: [
            'RipR22Process was deployed on the engine but RIP_PHASE_KEYS still carried R2.2 with no processDefinitionKey. That single omission broke the chain at both ends: the deployment-status endpoint builds its keysIn query from this list, so the engine was never asked about RipR22Process; and getPhaseDeployStatus requires the field to be set before it can match a returned key. R2.2 rendered as In ontwerp and the Faseladder read 1 / 12 deelprocessen inzetbaar.',
            'Note for anyone repeating this: @ronl/shared must be rebuilt and packages/frontend/node_modules/.vite deleted before the frontend sees the change. Vite validates its pre-bundle cache against the dependency’s version, not its dist content, so a rebuilt workspace dist is invisible to it — restarting the dev server and hard-refreshing both appear to do nothing.',
          ],
        },
        {
          sha: '40449fc',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The untenanted start-form fallback sees a text-typed error body',
          details: [
            'getByKeyWithTenantFallback decides whether to retry a failed tenant-scoped lookup against the untenanted path by matching Operaton’s “No matching process definition with key” wording in error.response.data.message. getDeployedStartForm is the only caller passing responseType: ‘text’, and axios disables JSON parsing of the error body when responseType is set — so the body arrived as an unparsed string, .message was undefined, the guard rethrew, and the fallback could never fire. Every process deployed without a tenant answered 404 FORM_NOT_FOUND to any caller carrying one: on ACC, 21 of 23 latest-version definitions, including AwbShellProcess behind the citizen Kapvergunning form.',
            'The raw body is now matched when it has not been parsed. The existing fallback test mocked the error body as an already-parsed object, which is why the suite stayed green while the path was dead; the added test uses the shape axios actually delivers.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.36',
      status: 'Released',
      date: '30 aug 2026',
      scope: ['backend', 'frontend'],
      commits: [
        {
          sha: 'ddd6bdd',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'The Keycloak token-claim mapper script tracked',
          details: [
            "The signing panel takes the signer's identity entirely from the caller's Keycloak token, so the client needs three protocol mappers. The script that adds them was untracked, putting it in the position the portable deploy script was in until the day before: the thing that actually changes shared infrastructure was the one thing nobody but its author could read. A realm backs authentication for every environment, which makes it a worse file to keep private, not a better one.",
            'It talks only to the Admin REST protocol-mappers endpoint \u2014 redirect URIs, web origins and the client secret appear in no request it builds. It is idempotent, so re-running it reads state rather than changing it. A partial realm import cannot do this safely: SKIP policy skips an existing client entirely and OVERWRITE replaces the whole client definition.',
          ],
        },
        {
          sha: 'b5a9c06',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'A live signature is refused before one is requested, not after',
          details: [
            'The end-to-end guard checked the ceremony URL, which only exists once the package has been created \u2014 so running the journey against a live backend still created a real ValidSign package, which then sat unsigned against the licence. The guard stopped the signature but not the request that costs something.',
          ],
        },
        {
          sha: 'f8f2a36',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Stub package ids are unguessable, and the ceremony is throttled',
          details: [
            "The stub ceremony's GET and POST sit on the pre-auth router by necessity: the page loads in an iframe, which cannot carry a bearer token. The POST completes the Operaton task and writes the approval status.",
            'Package ids were sequential, so on any internet-reachable deployment someone could enumerate a few values and approve a phase-exit another person was in the middle of signing. They are now random UUIDs, which makes the ceremony URL a capability, and the existing rate limiter now covers both routes. Acceptance may not run stub mode from any commit before this one.',
          ],
        },
        {
          sha: '1434b9d',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            'The signature seal lands on the signature lines, and stub documents carry a date',
          details: [
            'ValidSign places fields in 96-DPI pixels while the PDF is authored in 72-DPI points, so every coordinate and size arrived at three-quarter scale and the seal covered the body text instead of the signature block.',
          ],
        },
        {
          sha: 'f188150',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The R2.1 journey signs the phase-exit approval',
          details: [
            'Because the approval task carries the signature attribute, the board renders the signing panel where a form used to be. The journey drove every task by filling a form, so it failed on the last one reporting that a form never rendered \u2014 a true statement about a task that no longer has one.',
          ],
        },
        {
          sha: '457efad',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'resolveSigningUrl moved out of the component file',
          details: [
            "The panel exported both a component and a plain helper, which breaks Fast Refresh. The lint rule's own remedy is a separate module, which is what the helper wanted anyway \u2014 it was exported solely to be unit-tested directly.",
          ],
        },
        {
          sha: '3ec29d7',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The eDOCS department asserted in the config tests',
          details: [
            'An earlier commit added the department to the config object and left the config tests untouched, so both exhaustive assertions failed on the next full-suite run.',
          ],
        },
        {
          sha: 'fca158b',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The ValidSign design corrected against what live testing found',
          details: [
            'Six claims in the design proved wrong once the feature ran against production ValidSign, live eDOCS and a real browser. Each is marked as a correction rather than quietly rewritten, so the document records what was believed as well as what proved true.',
          ],
        },
        {
          sha: 'e4f8bbd',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The panel can observe success, and the signer lands somewhere useful',
          details: [
            'Two fixes from live testing that share a route file and cannot be split without carving it into hunks. The panel polls signature status and could never observe completion, so a successful signature looked like a stalled one.',
          ],
        },
        {
          sha: '2cebb31',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The stub emits a real PDF, so archived documents open',
          details: [
            "The stub's signed document and evidence summary were 27-byte strings beginning with a PDF header. They uploaded to eDOCS perfectly and then could not be opened, with the viewer reporting only that something had gone wrong.",
          ],
        },
        {
          sha: '0bb86d2',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'A script drives R2.1 to the approval task without filling twelve forms',
          details: [
            "Testing the signature meant working an entire R2.1 instance through eleven user tasks by hand to reach the twelfth, every time. This does it in seconds, through the backend's own start endpoint rather than around it.",
          ],
        },
        {
          sha: '2e6defc',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Signed documents archive standalone, with a configured department',
          details: [
            'The first real signature completed correctly and archived nothing: the status came back failed and the signed PDF never reached eDOCS. Two separate defects, found only by running the feature against the live document server.',
          ],
        },
        {
          sha: '61b829b',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The board can frame the stub ceremony, and its POST answers in HTML',
          details: [
            "With the URL resolved the iframe reached the backend and the browser refused to render it: helmet's global defaults set X-Frame-Options and a frame-ancestors policy, and the board is a different origin from the API.",
          ],
        },
        {
          sha: '2ba39d0',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The ceremony URL resolves against the API origin',
          details: [
            "Clicking through loaded the application's own landing page inside the signing iframe. In stub mode the backend returns a relative path and the panel put it straight into the iframe source, which the browser resolved against the board's origin instead of the API's.",
          ],
        },
        {
          sha: 'dd7bef3',
          author: 'Steven Gort',
          type: 'test',
          subject: "The ValidSign client's error normalisation covered",
          details: [
            "The three signing methods in the frontend API client were entirely uncovered, including every catch block, because the panel's own tests mock the API module wholesale so the real functions never ran. That is a worse gap than the percentage suggests: those catch blocks are what turn a transport failure into something the panel can show a person.",
          ],
        },
        {
          sha: '452ab9e',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'A second package is refused for a task that already has one',
          details: [
            "Package creation had no guard, so a second call put a second signature request for the same approval into a real person's inbox \u2014 which cannot be recalled \u2014 and left the process holding one of them.",
          ],
        },
        {
          sha: 'e8787e7',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The phase-exit approval is signed from the task panel',
          details: [
            'A project leader signs the approval document without leaving the infra board. The actions section becomes three-way: unclaimed shows the claim button, a claimed signature-bearing task shows the panel, and everything else keeps the form it had.',
          ],
        },
        {
          sha: '0f6039f',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'rip-pdp renders from its deployed template as Markdown',
          details: [
            'The worker built documents from a hardcoded switch that restated, as TypeScript string literals, content the deployed templates already define \u2014 two sources of truth for one document. It now renders from the template through the same path the signable PDF uses.',
          ],
        },
        {
          sha: '32bf208',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Email and name claims mapped, and preferred over splitting a display name',
          details: [
            "The signing feature takes the signer's identity from the Keycloak token, and it was not arriving: a real token carried no email claim and no name claim at all, so package creation would have refused for every user \u2014 working exactly as designed, and useless.",
          ],
        },
        {
          sha: 'fcaaf11',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Signatures whose callback never arrived are polled for',
          details: [
            "Sweeps process instances awaiting a signature and drives completion through the same idempotent path the webhook uses. Not belt-and-braces: ValidSign's cloud cannot reach a developer's localhost, so during local work the callback never arrives at all.",
          ],
        },
        {
          sha: '068e8f2',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Signing exposed over HTTP with a secret-verified callback',
          details: [
            'Five routes: the three the board calls behind JWT, the webhook ValidSign posts to on completion, and a local stand-in ceremony used only in stub mode.',
            'Which header carries the configured callback key is still unconfirmed with ValidSign. The route expects one; OneSpan-derived platforms conventionally use another. If it is the latter every callback will 401 silently, because the poller completes the task anyway \u2014 so a completion with no matching callback log line means the webhook never landed.',
          ],
        },
        {
          sha: '50ab2c4',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Signatures complete idempotently from callback or poller',
          details: [
            "One completion path with two racing callers. It archives the signed PDF and the evidence summary into the project's eDOCS workspace, then completes the Operaton user task.",
          ],
        },
        {
          sha: 'a9fa693',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The ValidSign client, its stub, and the live guard',
          details: [
            'A thin axios client for the EU-branded OneSpan Sign platform, modelled on the eDOCS service rather than an SDK wrapper, because they ship Java and .NET only.',
            'The live guard matters more than the client. Live signing needs three locks to hold at once, so a misconfigured environment cannot quietly send a real signature request against a production-only licence.',
          ],
        },
        {
          sha: 'abe103f',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'ronl:signatureRef resolved, scoped to one named user task',
          details: [
            'Reads the attribute from a named BPMN user task and resolves it to the document template deployed alongside the process. It returns nothing for a task without the attribute, which is every ordinary task \u2014 making the whole feature opt-in from the model.',
          ],
        },
        {
          sha: '502aed5',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'A signable PDF with coordinate-placed signature fields',
          details: [
            'Emits the PDF a project leader signs and returns the exact rectangle ValidSign should place the signature box in. pdfkit was chosen over pdf-lib because this generates a document from scratch and needs real text wrapping, where pdf-lib is built for editing existing PDFs.',
          ],
        },
        {
          sha: '386cf78',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Markdown emitted from the rendered document IR',
          details: [
            'The human-readable copy archived in eDOCS and rendered in the board. The PDF emitted from the same intermediate representation is the artifact that actually gets signed, so both come from one source.',
          ],
        },
        {
          sha: '4f58d17',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'LDE document templates rendered to an intermediate representation',
          details: [
            "Turns a template deployed alongside the BPMN, plus that instance's process variables, into a small intermediate representation. Markdown and PDF are emitted from it separately, so the archived document and the signed one cannot drift apart.",
          ],
        },
        {
          sha: '9b39ae5',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'ValidSign settings with a live-tier allowlist',
          details: [
            'The config block and its conditional validation. The allowlist is what keeps every later task away from live signing until deliberately enabled.',
          ],
        },
        {
          sha: '53d335e',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Implementation plan for ValidSign phase-approval signing',
          details: [
            'Thirteen tasks and eighty-four steps. The ordering is deliberate: config comes first because the service reads it, and because the live-tier allowlist is what keeps the rest of the work away from a production-only licence.',
          ],
        },
        {
          sha: '45d894e',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The Markdown conversion scoped to rip-pdp, open questions closed',
          details: [
            'Only rip-pdp migrates off the hardcoded switch. It is the document the signature actually touches, so converting the other two in the same change would alter documents the feature does not need to alter.',
          ],
        },
        {
          sha: '84f69fe',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Live probe findings folded into the design',
          details: [
            'A read-only probe against production confirmed the endpoint shape the design was written against \u2014 the response envelope, working pagination, and the nested signer and approval-field structures.',
          ],
        },
        {
          sha: 'b9e82ca',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Design for ValidSign signing of RIP phase approval documents',
          details: [
            "The agreed design, wired initially to R2.1's phase-exit approval. Approach A of three: a single additive BPMN attribute, so a process without it behaves exactly as before.",
          ],
        },
        {
          sha: '578b89d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The retry path no longer livelocks on its own refetch',
          details: [
            'The journey stopped after six tasks and reported a count mismatch. Both facts were true and neither was the fault: the loop had given up with the instance still running, so the count was correct for a process that had not finished.',
          ],
        },
        {
          sha: '3968122',
          author: 'Steven Gort',
          type: 'test',
          subject:
            'A foreign R2.1 instance skips rather than fails, and cleanup failures are reported',
          details: [
            "'This spec cannot run' and 'this journey is broken' are different facts and were reported identically.",
          ],
        },
        {
          sha: 'c7f65c2',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The ValidSign API key documented in .env.example',
          details: [
            'Placed beside the closest sibling third-party integration. The licence is production-only \u2014 there is no sandbox tenant \u2014 which is why the live guard exists.',
          ],
        },
        {
          sha: '3ad8c7b',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The rate limiter keys on the client, not on its connection',
          details: [
            'The limiter bucketed by the request IP verbatim. With proxy trust enabled Express takes that from the forwarded header, and Azure App Service writes it as address and port \u2014 so every new connection from the same person got a fresh bucket, and the limit never applied.',
          ],
        },
        {
          sha: '8a72d51',
          author: 'Steven Gort',
          type: 'test',
          subject: 'RIP fase 1 driven end to end, from start to phase complete',
          details: [
            'Starts R2.1 from its detail page and works all twelve user tasks through the real UI, with the three gateways answered for the happy path, ending on the assertion that the phase counts moved.',
          ],
        },
        {
          sha: '158fba7',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'A completion confirmation that outlives the task panel',
          details: [
            'Completing a task acknowledged nothing. The message was set and the panel closed in the same handler, so it was created and destroyed in the same tick and never painted.',
          ],
        },
        {
          sha: '45f43f0',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The infra board driven end to end',
          details: [
            'The board had no end-to-end cover. That was a gap rather than a decision: it has the same shape as the PA cockpit, and so the same exposure to the class of defect that work turned up repeatedly.',
          ],
        },
        {
          sha: '78e1e09',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'rehype-sanitize restored to the pa-demo lock entry',
          details: [
            'An earlier hand-merge of the lockfile on this branch silently dropped it. That is why the final merge from acc was resolved by reinstalling rather than by hand.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.35',
      status: 'Released',
      date: '30 aug 2026',
      scope: ['backend'],
      commits: [
        {
          sha: '583be4a',
          author: 'renovate[bot]',
          type: 'fix',
          subject: 'uuid advisory closed',
          details: [
            'Raised through the vulnerabilityAlerts fast-lane, which clears the 14-day cooldown for known advisories. The range moves five majors, from ^9.0.1 to ^14.0.0.',
            'Verified locally before merging, because the backend workflow triggers on push only and no pull-request check runs its tests. Worth recording that uuid is declared in the backend package but imported nowhere, which is why a five-major jump carried no risk \u2014 and why removing the dependency outright would close the advisory permanently rather than tracking its versions.',
          ],
        },
        {
          sha: 'b74bd3d',
          author: 'renovate[bot]',
          type: 'fix',
          subject: '@anthropic-ai/sdk advisory closed',
          details: [
            'From ^0.80.0 to ^0.122.0 \u2014 forty-two minor releases on a pre-1.0 package, where minors routinely change API surface.',
            'Unlike uuid this one is genuinely used, by AnthropicLlmProvider, across messages.stream, Tool, MessageParam and six error classes. TypeScript compilation passing across that surface is the meaningful signal, and it did, alongside the full suite.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.34',
      status: 'Released',
      date: '30 aug 2026',
      scope: ['ci'],
      commits: [
        {
          sha: '1a1a334',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Each open CI follow-up points at its tracking issue',
          details: [
            'The follow-ups plan was the only record of that work, so learning what was outstanding meant reading a planning document. Items 1, 2, 3, 4 and 6 now link to issues; item 8 links to the draft pull request that has covered it since 28 August.',
          ],
        },
        {
          sha: '1359a92',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Both backend deploy scripts run anywhere, and fail fast on a dead session',
          details: [
            "The acceptance script that actually ran was untracked. The tracked one called Info-ZIP's zip and therefore only worked on Ubuntu, while an untracked portable variant carried a bsdtar fallback and was the script really used on a managed Windows laptop. The script performing acceptance deploys was the one nobody could review; it now replaces the original outright, preferring zip when present so Ubuntu behaviour is unchanged.",
            'The production script had the same limitation and gets the same treatment. Nobody had needed a production deploy from Windows yet, which would have been an unwelcome thing to discover during a release.',
            'Neither checked the Azure session, so an expired login surfaced only at the final deploy step, after both builds, the production install and the zip. The obvious check does not work: az account show reads cached local state and succeeded against a token that had expired days earlier. Both scripts now ask for the target App Service itself, a real authenticated call covering an expired session, the wrong subscription and a missing app in one request.',
          ],
        },
        {
          sha: 'b06c6f6',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The SCM basic auth hypothesis is disproved, and OIDC is not needed',
          details: [
            'Follow-up item 2 recorded, correctly hedged, that azure/webapps-deploy might fail because Azure disables SCM basic authentication by default, and asked for confirmation against a real failed run before anyone acted.',
            'Linked Data Explorer answers it: that repository runs the same action with a publish-profile secret against the same subscription and deploys its backend successfully. So basic auth is not disabled subscription-wide and the blocker here is per-App-Service. That also makes the fix far cheaper than the app registration and federated credential the item originally proposed.',
          ],
        },
        {
          sha: 'efe1ebd',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The supply-chain register reconciled with the workflows',
          details: [
            "The Pinned table still listed pre-upgrade v4 digests for checkout, setup-node and upload-artifact. The v7 upgrades landed in 2026.08.33; the register did not move with them, and every gate stayed green throughout \u2014 exactly the drift the document's own 'What the audit cannot see' section predicts.",
            'Three further claims were wrong rather than merely stale. Eight workflows request Node 20, not all nine: the ninth requests 24 deliberately, because the Renovate config validator declares a Node 24 engine. And the gitignore rule reads as though no deploy script is in the repository when two are tracked \u2014 better than the tidier claim implied, and worth stating accurately.',
          ],
        },
        {
          sha: 'cba3f68',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'The config validator runs on the Node version Renovate requires',
          details: [
            'renovate 44.50.3 declares a Node 24 engine and the runner defaults to 22. npm accepts the mismatch with a warning rather than refusing, so the validator ran unsupported and still reported green \u2014 the kind of mismatch that keeps working right up until a release stops tolerating it.',
            "setup-node is placed before the zizmor step rather than beside the validator it serves, because a step following a failed one is skipped and the validator's always() condition would otherwise run on whatever Node the runner defaulted to.",
          ],
        },
        {
          sha: 'c613bcf',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'renovate.json validated by the audit gate',
          details: [
            'The gate caught every floating action reference and had nothing to say about a malformed renovate.json. Pins without working updates decay into an unpatched tree, so a silently inert Renovate is a supply-chain failure the audit exists to prevent \u2014 and in Linked Data Explorer exactly that happened, five invalid keys stopping it from opening any pull request at all.',
            'The validator runs in the existing audit job, so it needs no ruleset change. It runs with no filename argument, because passing one switches it into global-config mode and applies different rules, and under always() so a zizmor failure cannot hide a broken configuration behind it.',
          ],
        },
        {
          sha: '209a746',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The concurrency group keys on the event, not just the ref',
          details: [
            'Keyed on the ref alone, the pull_request teardown and the push deploy that a merge fires simultaneously landed in one group and cancelled each other at random. Two acceptance deploys were skipped and one preview environment stranded before the pattern was recognised.',
            'The key now includes the pull-request number where there is one. Worth knowing that this is only the GitHub layer: Azure cancels overlapping deployments to a single Static Web Apps environment on its own, and reports a cancellation on a job that did nothing wrong.',
          ],
        },
        {
          sha: 'ba60702',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'pull_request triggers filtered, and Azure deployments serialised',
          details: [
            "Every pull request to acc deployed all three sites, each holding a Static Web Apps staging environment against a per-app ceiling of three. Five open pull requests exhausted it. The push filter is now mirrored onto pull_request, so a change that touches none of a site's paths no longer claims a slot it cannot use.",
            'The filter also gates the teardown job, which is correct: a pull request that never created a preview has nothing to tear down.',
          ],
        },
        {
          sha: 'd77861d',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'bump-release verifies the branch is gone from the remote too',
          details: [
            'Merging with the delete-branch flag removes both copies and the repository setting does the same through the UI, but a release merged some other way leaves the remote branch behind. One survived exactly that way and was noticed only later. Stale merged branches are harmless alone; they accumulate, and each makes it harder to see what is genuinely in flight.',
          ],
        },
        {
          sha: 'ee4a73a',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The concurrency gap recorded, item 7 closed, item 5 sharpened',
          details: [
            'Records what the cancelled-deploy incident actually was, closes the action-majors item shipped in 2026.08.33, and rewrites the staging-environment item against the evidence rather than the initial guess.',
          ],
        },
        {
          sha: '1c0ba13',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'CI follow-ups moved to where follow-ups live',
          details: [
            'They had been appended to SECURITY-PIPELINE.md, which describes what the pipeline is. A list of what it still lacks belongs in the plans directory, so the register stays a description of the current state rather than a mixture of both.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.33',
      status: 'Released',
      date: '29 aug 2026',
      scope: ['ci'],
      commits: [
        {
          sha: 'cfbc8e5',
          author: 'renovate[bot]',
          type: 'ci',
          subject: 'actions/upload-artifact pinned to v7.0.1',
          details: [
            'Raised by Renovate and merged under the 14-day cooldown. Two backend workflows move from ea165f8d (v4.6.2) to 043fb46d (v7.0.1). The digest and its version comment move together, which is what the pin-digests helper maintains — a digest without an accurate comment is a pin nobody can read.',
          ],
        },
        {
          sha: '3355e95',
          author: 'renovate[bot]',
          type: 'ci',
          subject: 'actions/setup-node pinned to v7.0.0',
          details: [
            'Eight workflows move from 49933ea5 (v4.4.0) to 820762786 (v7.0.0).',
            'Together with the checkout upgrade this closes the Node-runtime deprecation: the pinned v4 actions targeted a Node version the runner had begun force-upgrading, and v7 declares node24 natively. Pinning deliberately froze those versions in place; upgrading them was kept as separate work so a broken deploy would be attributable to one change or the other.',
          ],
        },
        {
          sha: '488d6dd',
          author: 'renovate[bot]',
          type: 'ci',
          subject: 'actions/checkout pinned to v7.0.1',
          details: [
            'Nine workflows move from 11d5960a (v4.4.0) to 3d3c42e5 (v7.0.1), including the supply-chain audit gate itself.',
            'That made this the one upgrade whose failure would have been self-obscuring: a broken checkout inside the gate breaks the thing that would otherwise report it. The gate passed on all three merges, so the upgrade is verified by the mechanism it upgrades.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.32',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '3b4a68e',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'CI work gets its own changelog type and release scope',
          details: [
            'Pipeline and supply-chain work had no home in the changelog. It landed as a chore, next to housekeeping, when it is the one category whose commits change how everything else is built and shipped.',
            "It is also a release scope now, and deliberately not a deployable: a CI-scoped release bumps the root version only. Bumping a package for it would trip that package's path-filtered workflow and deploy code that did not change.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.31',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['ci'],
      commits: [
        {
          sha: 'f8e9257',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The register is corrected, and the gate explained',
          details: [
            "The register implied CI deploys the backend. It does not: the backend workflows build, test and upload an artifact with no deploy step. The backend reaches acceptance and production through gitignored scripts run from a developer machine, so the gate never sees that path and the ruleset cannot gate it. The unpinned install that ships the backend's dependency tree runs there, not in CI.",
            'Adds a queued-improvements list and a document explaining the machinery, leaving the register as the record of current state so a digest change touches only one file.',
          ],
        },
        {
          sha: '350cd67',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Releases land through a pull request',
          details: [
            'The acceptance branch now requires a pull request and a passing audit, so the old flow — fast-forwarding locally and pushing directly — is rejected. The release command opens a PR instead, and the repo rule that pre-approved that fast-forward is removed rather than left authorising an operation GitHub would refuse.',
            "Six further corrections came with it, all found by running the equivalent command twice under the pilot repo's own gate rather than by reasoning about it — among them excluding merge commits from the changelog range, computing that range only after the branch is current, and reconciling open PRs before any version editing.",
          ],
        },
        {
          sha: 'ee9d005',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'Actions pinned to digests, GITHUB_TOKEN scoped to least privilege',
          details: [
            'All 27 action references across eight workflows are pinned to commit digests, at the current major so the change is behaviour-preserving. A tag can be moved; a digest cannot, and the deploy action referenced here published one ref as both a 2021 tag and a 2024 branch head.',
            'Credentials are no longer persisted into the workspace after checkout — a live token was previously written into the git config and mounted into a closed-source third-party container. Token scope drops to read-only by default, with write access granted only to the six jobs that comment on pull requests, and none at all to the three that only tear down a preview.',
            'A blocking audit gate now enforces all of this on every pull request, pinned to an exact tool version rather than the action default of latest.',
          ],
        },
        {
          sha: '4d74a2c',
          author: 'Steven Gort',
          type: 'fix',
          subject: "The lockfile's engines match package.json",
          details: [
            'The manifest declared a Node floor the lockfile had not caught up with. Committed as its own change rather than riding along in an unrelated one.',
          ],
        },
        {
          sha: '19899ea',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'Renovate configuration lands ahead of the pinning',
          details: [
            'Renovate reads its configuration only from the default branch, so this had to land before the app was installed — otherwise it onboards with defaults: no cooldown, no digest pinning, and no guard on the deploy action whose v1 is both a 2021 tag and a 2024 branch head. This repo references it nine times across four deploy pipelines.',
            'Updates are held for fourteen days so vendors and researchers have time to find problems, with a deliberate exception: security advisories bypass the wait entirely. Without that exception the policy would delay exactly the updates that must not wait, which is why such policies get disabled mid-incident.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.30',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['frontend', 'pa-demo'],
      commits: [
        {
          sha: '1ea6afc',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Brand-colour matching strips comments first',
          details: [
            'The brand-colour test matched raw file text with no comment strip, unlike the class-coverage test, which already strips block comments before matching — because a comment naming a thing is not a definition of it.',
            'The asymmetry between the two was mostly defensible, but the anti-vacuity half inherited the dangerous side of it: a colour mentioned only in prose would have counted as pinned.',
          ],
        },
        {
          sha: 'f75a3b7',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Stylesheet citations use anchors, not line numbers',
          details: [
            'Inserting an 11-line comment near the top of the shared stylesheet shifted every line after it. Only the citation written by that same commit was caught and fixed; five more citations into the same file went stale unnoticed — one of them now landing mid-declaration inside an unrelated rule.',
            'They now cite by anchor rather than coordinate, which is the only form that survives an edit above them.',
          ],
        },
        {
          sha: 'dfb1a4b',
          author: 'Steven Gort',
          type: 'docs',
          subject: "The plan's expected test totals are corrected",
          details: [
            'The plan predicted eight added assertions and the totals that follow. The real numbers are one higher in each case: a ninth assertion came from a review finding mid-plan, and the plan was never updated to match.',
          ],
        },
        {
          sha: '2fa4ed4',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The palette CSS citation is anchored to content',
          details: [
            "A header comment cited a line range that was correct when written — but the same commit's own second step inserted eleven lines earlier in the file, shifting the cited block down. The citation went stale inside the commit that wrote it.",
          ],
        },
        {
          sha: 'd8caa61',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Follow-up item 4 is closed',
          details: [
            'Records what the guards work actually found: three of the four listed duplications are required copies rather than decay. The demo never imports the caseworker stylesheet, so the package must carry its own rule for every class its components render, or the demo renders unstyled.',
          ],
        },
        {
          sha: 'f84f99d',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'A probe snippet that would silently no-op is fixed',
          details: [
            'A verification probe used a string replace whose search text carried the indentation of the *rendered* file listing rather than the source — two extra spaces per level, introduced by the display prefix used while writing the plan.',
            'Run verbatim it would have matched nothing, returned the text unchanged, left the file unmutated, and then reported the test as passing. A probe that cannot fail is worse than no probe.',
          ],
        },
        {
          sha: '8350041',
          author: 'Steven Gort',
          type: 'docs',
          subject: "The palette's CSS claim is corrected",
          details: [
            'The component claimed it reused a set of global palette styles plus a local skin. That was false: it renders only the local classes, and the package stylesheet defines every one of them. No class of the named global family exists anywhere in the file or the package.',
            'The claim was worse than merely wrong — it told a reader that a dependency existed which does not, inviting them to preserve it.',
          ],
        },
        {
          sha: '09b9c78',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The class-coverage guard strips CSS comments before matching',
          details: [
            'The guard matched over raw stylesheet text, so a class named only inside a comment would false-positive as defined. No such comment existed at review time — but a later task in the same plan adds prose comments that name real classes by their selector, which would have created exactly that hole.',
            'Elevated from Minor to Important once that cross-task context was noticed.',
          ],
        },
        {
          sha: '883af09',
          author: 'Steven Gort',
          type: 'test',
          subject: "The demo's auth adapter is pinned, including where it correctly differs",
          details: [
            "The demo registers an auth adapter and nothing tested it, while the frontend's equivalent was already pinned. This mirrors that file.",
            'The two adapters differ in exactly two places, and both differences are correct rather than drift — so the test pins the differences too, instead of asserting a false equivalence.',
          ],
        },
        {
          sha: 'b8c9f97',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Every rendered class must be styled in both sheets',
          details: [
            "The demo never imports the caseworker stylesheet, so the package carries its own copy of every rule its components need. That is not decay; it is what makes the package render standalone, which is the demo's whole premise.",
            'The guard makes that requirement enforceable: if a package-owned component grows a new class and only one stylesheet gets a rule for it, the guard fails rather than the demo silently rendering unstyled.',
          ],
        },
        {
          sha: '781afe4',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The five brand colours are pinned across all four files',
          details: [
            'The brand colours exist as literals in four files with nothing keeping them in step — two stylesheet root blocks and two build-config fallbacks. One fact, four hand-maintained copies, no test.',
            'The copies are deliberate: the app-shell styling stays per-app on purpose and the shared package leaves it out. So the fix is a guard that fails when they diverge, not deduplication.',
          ],
        },
        {
          sha: '19aaa79',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Implementation plan for the duplication guards',
          details: [
            'Five tasks: three guards, two comment corrections, and closing the follow-up item. Eight assertions added, no runtime code changed.',
            'Three things the plan resolves by checking rather than assuming — each of which would otherwise have produced a task that could not be implemented as written.',
          ],
        },
        {
          sha: 'b651bd8',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Design guards for the duplication the extraction did not reach',
          details: [
            "The investigation changed the framing twice. Three of the four listed duplications turn out to be required rather than accidental: the demo never imports the caseworker stylesheet, so every class a package-owned component renders must also have a rule in the package's own sheet, or the demo renders it unstyled.",
            'Both files already said so. The copies are the price of the package rendering standalone — so the answer is to make divergence detectable, not to remove the duplication.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.29',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['backend', 'frontend', 'pa-demo', 'public-site'],
      commits: [
        {
          sha: '7196730',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Two comments claiming a wrapper does something are corrected',
          details: [
            "Two sections claimed the host's router wraps their content in a padding div. Wrong twice: after de-vendoring the wrapper is emitted by the package's own router rather than the host's, and it supplies no padding at all.",
          ],
        },
        {
          sha: '2071d2f',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The package surface is narrowed and its type exports pinned',
          details: [
            'Removes three exports a consumer audit found unused. Two are live package-internal code that no host can call, because a host never sees the un-gated item they operate on; the third had no consumers at all.',
          ],
        },
        {
          sha: '5cd1ef6',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Follow-up items already closed are marked as such',
          details: [
            'Three items had landed but their entries never got a status marker, so the list read as though they were still open. Verified in the code rather than from the commit message.',
          ],
        },
        {
          sha: '217a5c1',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The modes guard residual is closed',
          details: [
            'The parked hole: a decoy function of the same name declared in an inner scope, in a file that also imports the genuine hook, disarmed the rule for the whole file — and compiled with zero type and lint errors.',
            'The mechanism was a seam between two halves of the rule, one verifying the local name and the other trusting it.',
          ],
        },
        {
          sha: '194ffaf',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The Vitest timeout is raised to 20s in all four workspaces',
          details: [
            'The parallel-run flakiness turned out to be neither a small file set nor shared state. The frontend suite is 839/839 green in five consecutive parallel runs on an idle machine, and produces 8–16 failures under concurrent load — every one of them a timeout at the 5000ms default, which none of the four Vitest workspaces had overridden.',
            'The affected file set tracks machine load rather than any property of the tests, which is what ruled out contention on shared state as the cause.',
          ],
        },
        {
          sha: '88150ba',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Three carried minors from the session-seam work',
          details: [
            "The protocol guard's two undocumented properties are now recorded rather than inferred: it deliberately skips test files, which is why dead contract fixtures can accumulate there unseen — two were found that way — and its path needle is bare and quote-agnostic by design, so it will also match superficially similar paths.",
          ],
        },
        {
          sha: '76da89e',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The login half of the session seam is pinned',
          details: [
            'The whole-branch review found half this seam undefended: deleting both of the guards on the login callback left the package fully green. The spec asked for those tests; the plan lost them between spec and brief, and nothing recorded the reduction.',
            'That mattered beyond coverage, because the spec had explicitly rejected the alternative of hiding these controls.',
          ],
        },
        {
          sha: '0cc57a4',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Every workspace gets a test:serial script',
          details: [
            'The repo runs two test runners behind one command shape — backend on Jest, the other four on Vitest — so any flag a caller reaches for is right in four places and wrong in the fifth. The serial flags differ between them, and Jest rejects the Vitest ones outright.',
            "That mismatch produced repeated unrecognised-option failures while chasing the parallel-run flakiness. A named script per workspace means the runner's identity stops being something the caller has to know.",
          ],
        },
        {
          sha: 'f450e54',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'Logout leaves the auth contract, now host-owned',
          details: [
            'Logout is removed from the auth contract since nothing in the package calls it any more — session teardown goes through the host callbacks instead. Both host adapters drop the member they no longer need to supply.',
          ],
        },
        {
          sha: 'f17682d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The auth-path guard needle is quote-agnostic',
          details: [
            'The forbidden list mixed bare substrings with one quote-wrapped needle, so it only matched a single-quoted path — a double-quoted call or a template literal walked straight past it, while the other three needles would still catch their equivalents.',
          ],
        },
        {
          sha: '96c2f86',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The cockpit takes session controls from the host',
          details: [
            "The shell no longer calls logout itself or writes the host's login protocol. The three control sites — the avatar, the header button and the login-required panel — now key off the host callbacks added in the previous commit.",
          ],
        },
        {
          sha: '682385c',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Optional session callbacks on the host contract',
          details: [
            'Adds the login and logout callbacks to the host contract and wires both hosts to supply them, without the package reading them yet — so every workspace stays green at this step.',
            'The frontend gains a route component rendered where the cockpit mounts, so it has router context, moving the existing session-storage and navigation protocol out of the package and back into the app that owns that convention.',
          ],
        },
        {
          sha: '19f4a98',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Implementation plan for the session seam',
          details: [
            'Three tasks against the approved design, ordered so every one leaves all five workspaces green — no pre-ruled broken intermediate, unlike the extraction that preceded it. Optional props are added and wired first, read second, and the old contract member dropped only once nothing calls it.',
          ],
        },
        {
          sha: 'b6363a6',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Design for session controls as a host seam',
          details: [
            'The package hardcoded five facts belonging to a host application: two session-storage key names, an identity-provider literal and two router paths.',
            'That protocol is a house convention shared by five files in the frontend — the cockpit was the sixth participant, and extraction stranded it outside the app that owns the convention rather than inventing a leak. The fix is to hand those controls back to the host.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.28',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['backend', 'frontend', 'pa-demo', 'public-site'],
      commits: [
        {
          sha: '2381f32',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Three extraction follow-ups cleared',
          details: [
            'The demo declared four dependencies with no importers anywhere in the package — they existed for the vendored tree the extraction deleted. All four were declared at identical ranges elsewhere, so removing them changes nothing that resolves.',
          ],
        },
        {
          sha: 'd82e792',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The extraction follow-ups are recorded',
          details: [
            'Eight items surfaced by the per-task and whole-branch reviews and adjudicated as deferrable. None blocks the merge. They lived only in an execution ledger under a git-ignored path, which does not travel with the branch.',
            'The first item corrects an earlier ruling: a guard residual had been parked partly on the grounds that closing it required a type checker, which turned out not to be so.',
          ],
        },
        {
          sha: '88f7906',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The bundle gate silently no-opped on Windows',
          details: [
            'Both bundle-check scripts guarded their entry point by comparing a module URL against the process argument. On Windows that argument is a drive-letter path with backslashes, so the comparison never held — the gate exited zero having checked nothing, and the build passed.',
            'Both scripts run as the last step of every build for two public unauthenticated sites, checking for auth libraries, telemetry and backend origins. On Windows, none of that was ever checked.',
          ],
        },
        {
          sha: '5847ac9',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'The demo starts alongside the other dev servers',
          details: [
            'A dev script existed but nothing called it, so the umbrella dev command brought up backend, frontend and public site while the demo stayed dark.',
            'Now that the demo renders from the shared package rather than its own vendored copy, a cockpit change affects both apps — starting one without the other makes it easy to verify the frontend and miss the demo.',
          ],
        },
        {
          sha: '120caac',
          author: 'Steven Gort',
          type: 'fix',
          subject: "The demo's mode narrowing is guarded, and dead path references fixed",
          details: [
            "The host's modes prop is what keeps the IOU and Hulpmiddelen sections off the public demo, and nothing asserted it. A new test pins that prop and asserts no dropped section id ever reaches it. Mutation-verified: reverting to the unfiltered set fails both new assertions.",
          ],
        },
        {
          sha: '6938f7d',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'pa-cockpit is wired into CI path filters and release scoping',
          details: [
            'The new package needed to appear in the path filters that decide which workflows run, and in the release tooling that decides which versions move — otherwise a change to the cockpit would trigger nothing and version nothing.',
          ],
        },
        {
          sha: '7e1e942',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'The vendored-copy drift machinery is retired',
          details: [
            'With the fork gone, the manifest, sync script, byte-level drift checker and the workflow that ran it have nothing left to police. This is what the whole extraction was for.',
          ],
        },
        {
          sha: 'cadd9fd',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Deny-by-default and the user forward are pinned',
          details: [
            'Two regression nets for properties this work exists to protect, with no production code changes.',
            'The section allow-list is deny-by-default only while both of its lists stay exhaustive. A section added to the cockpit later and named in neither is filtered out of the rail and the palette — which looks exactly like the policy working, rather than like a gap.',
          ],
        },
        {
          sha: '420cc28',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The demo renders from the package, and the fork is deleted',
          details: [
            'The demo carried a byte-identical copy of the cockpit — 44 files, 1.1 MB, kept honest by a manifest, a sync script and a byte-level drift checker. With the package extracted and the frontend already moved onto it, the demo follows and the copy goes.',
            'The demo now supplies its own host adapter rather than overlaying files, which is the seam the vendored fork existed to discover.',
          ],
        },
        {
          sha: '517ac94',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The demo gets its own changelog panel',
          details: [
            "Replaces the vendored stand-in with a small purpose-built panel owning its own release type, re-derived from the cockpit's own history. It is a plain slide-over styled with scoped classes in a colocated stylesheet — no Tailwind, matching the decision taken for the package itself.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.27',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['frontend', 'pa-demo'],
      commits: [
        {
          sha: '2f6c0dc',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'One PaSectionsRouter replaces a fourteen-export surface',
          details: [
            "The frontend's section router and the demo's carried byte-identical id groupings, an identical panel dispatch, and an identical remount branch. That is section-id grammar about the package's own ids, not host knowledge.",
            "Exporting fourteen components and asking every host to hand-maintain that grammar would have kept the vendored fork's most-duplicated behaviour, merely formalised. One router now owns it.",
          ],
        },
        {
          sha: 'f034866',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The frontend consumes the cockpit from @ronl/pa-cockpit',
          details: [
            'Rewires the frontend onto the package, restoring a green type-check, lint, test and build across the whole repo after the preceding tasks deliberately left it broken.',
            'A new host module wires the Keycloak and tenant services into the package configuration, using getter-based auth fields so a refreshed token is never captured by value and left stale.',
          ],
        },
        {
          sha: '1c2c51e',
          author: 'Steven Gort',
          type: 'fix',
          subject: "The notification overlay's fade curve is restored",
          details: [
            "The overlay lost its timing function during the Tailwind conversion, so its 300ms fade fell back to the CSS default ease rather than Tailwind's curve. Every other converted transition was re-checked; none of the rest were missing theirs.",
          ],
        },
        {
          sha: '9ec961c',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The notifications panel drops Tailwind for scoped pac-* rules',
          details: [
            "All 20 class occurrences are converted to scoped rules — 19 caught by the new guard's regex, plus one conditional class set through a template literal that the guard cannot see but which was still real Tailwind usage.",
            'Values are the literal Tailwind-computed values rather than the nearest design token, to keep the rendered result pixel-identical.',
          ],
        },
        {
          sha: 'b696757',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The modes guard verifies the hook it excuses on',
          details: [
            'The excusing rule matched a destructuring pattern without checking that the hook being called was actually the real one. A locally declared decoy of the same name registered both guarded names as bound and switched the rule off for the entire file.',
          ],
        },
        {
          sha: 'b064527',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The modes guard parses source instead of matching text',
          details: [
            'Keeping string literals in scope was safe for the three rules that accuse — extra text only adds matches. But the rule that *excuses* read the same text, so a single line of documentation-shaped string could disarm the only rule covering dynamic imports.',
            'The guard now parses the source, and its two inputs are split so an excusing rule can no longer be fed by an accusing one.',
          ],
        },
        {
          sha: '688b18d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The modes guard is restored after a coverage regression',
          details: [
            'The previous rewrite replaced the old path-and-clause rule rather than adding to it, and shipped a broken source stripper. The net effect was a guard weaker than the one it replaced: a named import planted as a probe passed the new guard, while the old one caught the same leak.',
          ],
        },
        {
          sha: '53d7f95',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The shell honours any host mode set',
          details: [
            'The shell required the host to supply a specific mode. The initial mode was hardcoded and looked up with a non-null assertion, so a host that dropped it crashed on first render. Both the mode and the active section are now seeded from the first entry of whatever set the host provides — byte-identical for the full set, whose first entry is that mode — and the lookup is total.',
          ],
        },
        {
          sha: '7369b44',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The shell moves, taking its host seams as a required prop',
          details: [
            'The shell carried all five host seams; each is now supplied rather than imported. Auth and tenant resolve through configured getters inside functions, and the four host components become members of a required prop.',
            'Making the prop required rather than optional means a host cannot silently omit a seam and discover it at runtime.',
          ],
        },
        {
          sha: '7e1ca24',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Importing the unfiltered mode helpers is guarded against',
          details: [
            'The demo depends on its filtered view of the mode config being the only one reachable. A guard now fails the build if the unfiltered helpers are imported directly, which is what would silently restore the dropped sections.',
          ],
        },
        {
          sha: '1515a1d',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The rail and palette derive from injected modes',
          details: [
            'Rather than reading a module-level config, the rail and command palette are derived from the mode set the host injects — which is what lets the demo present a curated subset without the package knowing anything about curation.',
          ],
        },
        {
          sha: '2adb4ad',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The shared PA test helpers move with their tests',
          details: [
            'Test helpers move into the package alongside the code they exercise, so the tests travel with what they test rather than being stranded in the frontend.',
          ],
        },
        {
          sha: '3292c07',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The cockpit views, components and stylesheets move',
          details: [
            'The bulk of the move: views, components and stylesheets leave the frontend for the package. The frontend does not type-check at this point in the sequence — deliberately, and stated in the plan so an implementer does not try to repair it early and fight the migration.',
          ],
        },
        {
          sha: '5e5da9f',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The package declares the environment contract it expects',
          details: [
            'The moved code read build-time environment values and compile-time defines that only existed because the frontend happened to provide them. The package now declares what it expects, so a second consumer cannot inherit them by accident.',
          ],
        },
        {
          sha: '0148d27',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The API services move onto the injected auth',
          details: [
            'The services move next in the sequence, because they carry the auth seam and nothing else — isolating the one dependency that has to become injectable before anything above them can move.',
          ],
        },
        {
          sha: '8a8f753',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The pure data and mode config move out of the frontend',
          details: [
            'First in the sequence, so later tasks have something to import. Pure data and configuration carry no host dependencies, which makes them the only safe thing to move before the seams exist.',
          ],
        },
        {
          sha: 'b1a7d8c',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The host auth contract is stated plainly',
          details: [
            'What the package actually requires of a host for authentication, written down rather than inferred from the call sites it happens to make.',
          ],
        },
        {
          sha: 'e601de5',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The host service contract',
          details: [
            'The interface a host must satisfy to mount the cockpit — auth and tenant services, and the components the shell renders but does not own.',
          ],
        },
        {
          sha: 'ffcf315',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'The pa-cockpit workspace package is scaffolded',
          details: [
            'Adds packages/pa-cockpit as the workspace both the caseworker frontend and the public demo will import, replacing the vendored copy.',
          ],
        },
        {
          sha: '4e2f4d7',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Implementation plan for de-vendoring the cockpit',
          details: [
            'Thirteen tasks against the approved design. The order is load-bearing: pure data and mode config first so later tasks have something to import, the API services next because they carry the auth seam and nothing else, then the views, then the modes context, and the shell last since it carries all five seams.',
            'The frontend does not type-check between two of those tasks. That is stated up front so an implementer does not try to repair it early and fight the migration.',
          ],
        },
        {
          sha: 'a25dece',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The build-config deletion is narrowed to the two aliases',
          details: [
            'The social card work lands ahead of this and adds a plugin to the same file. "Delete the alias entries" read closely enough to "tidy the build config" that an implementer could have taken the plugin with them, so the doc now names which two entries go and why the rest stays.',
          ],
        },
        {
          sha: '6fb03b1',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Design for de-vendoring the cockpit into a package',
          details: [
            'Records the design for deleting the vendored tree and the drift machinery policing it, by moving the 39 duplicated files into a workspace package both apps import.',
            'The measurement reframes the job: those 39 files leave their own set through exactly five relative specifiers, and those five are precisely the five files the demo already overlays. The seam was therefore already discovered empirically by building a second consumer first, rather than being designed in the abstract.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.26',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['pa-demo', 'frontend'],
      commits: [
        {
          sha: 'f9b580f',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'An Open Graph social card',
          details: [
            'Links to the demo rendered as a bare URL. The package now ships a 1200×630 card, a full OG and Twitter meta block modelled on the public site, and a description meta tag it never had.',
            'The part needing care is the origin: a static index.html cannot know its own deploy target, and the OG spec requires absolute URLs because scrapers do not resolve relative paths. So the page is authored against production and a build plugin rewrites the URL and image to whichever origin is being built — without it, an acceptance deploy would advertise production assets.',
          ],
        },
        {
          sha: '13f9c9a',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The social card design handoff',
          details: [
            'The design assets and their provenance, committed as handed over, because the go-live checklist cites that path for the production re-capture — so it has to be in the repo or the checklist points at nothing.',
            'It weighs 1.3 MB, almost all of it a self-contained HTML card with fonts inlined plus review screenshots. Those are review artifacts rather than build inputs and could be pruned later; kept whole here because discarding parts of a handover is not the recipient’s call.',
          ],
        },
        {
          sha: 'b93ff69',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The assistant toggle was a one-way trap, not a dead control',
          details: [
            'The vendored shell renders a floating assistant button whenever the dock is closed. The dock itself is deliberately not vendored — it pulls in chat machinery that would fire real MCP and LLM calls from a public page — so a shim stands in and returns null.',
            'That made clicking it unrecoverable rather than merely inert: the click sets the open flag, which both hides the button and renders the null shim, leaving nothing able to unset the flag again.',
          ],
        },
        {
          sha: 'ee97564',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'bump-release learns about packages/pa-demo',
          details: [
            'The command knew nothing about the demo package, so a demo release had no way to version the package it changed. It is now a scope tag, mapped through the scope table, the touched-directories cross-check and the version-file list.',
            'The non-obvious part is the vendored mirror: the demo vendors 39 files from the frontend, two of which are the changelog data and panel — so every release, which by definition edits the changelog, leaves the mirror stale.',
          ],
        },
        {
          sha: 'b6c6945',
          author: 'Steven Gort',
          type: 'fix',
          subject: "The backend-request guard compares against the run's own origin",
          details: [
            "The guard hardcoded localhost as the only same-host origin, which is correct only when Playwright serves the app itself. Run against a live deployment, the app's own document, bundle and stylesheet became off-host by that check, producing two false failures against the acceptance site.",
            "It now compares against the configured base URL's own origin, passed in from the fixture, and fails loudly if that is missing rather than silently reverting to the old assumption.",
          ],
        },
        {
          sha: '1edef68',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'A go-live checklist for the demo',
          details: [
            'The deployment setup existed only in a git-ignored scratch file. The resource names, the deployment-token secret names, and the requirement that the Static Web App be created with Source: Other — which otherwise writes a competing workflow into this repo — were one deletion away from being lore.',
            'It records acceptance as done and production as pending, and captures the reasoning that is not obvious from the code, such as why the drift workflow triggers on frontend source rather than on the demo package.',
          ],
        },
        {
          sha: '0eca129',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'The E2E suite runs in the acceptance deploy workflow',
          details: [
            "The E2E suite is the only proof of two of the four no-Live layers — that the live toggle is actually hidden in a real browser's cascade, and that the page issues no network request — and it had never run in CI.",
            'It now runs before the build, with a browser install step first, since no workflow in this repo previously installed Playwright. The demo needs no backend, database or Keycloak: Playwright starts its own dev server and that is the whole environment.',
          ],
        },
        {
          sha: '70e787c',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'A stale stylesheet reference and a no-op allow-list entry are dropped',
          details: [
            'The overrides header still pointed at a stylesheet deleted two tasks earlier. And the allow-list named the dossiers sentinel, but that mode carries no groups and no rail item uses the id, so the check was never consulted for it — a no-op entry the tests had to explicitly skip.',
          ],
        },
        {
          sha: '19cce30',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The mock-only environment invariant is actually guarded',
          details: [
            "The existing lock test only ever proved the test environment file, because Vitest's mode is always test. Nothing read the production or acceptance env files anywhere, so deleting a mock flag from either would have left every check green.",
            'A new test asserts across all four environment files that the three mock flags are true and the API URL is absent. Verified red then green: deleting a flag from the production file fails the test naming that file and flag.',
          ],
        },
        {
          sha: '5145239',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The tenant config is no longer shipped to the public site',
          details: [
            'Because the asset vendor root is the public directory, vendoring the tenant config deployed 18 KB of internal multi-tenant configuration to the public demo — real contact details, non-public sections, entries flagged as not public, and the very IOU sections this demo deliberately drops. Nothing in the demo ever fetched it.',
            'Its only consumer was a drift test, which now reads the frontend copy directly instead.',
          ],
        },
        {
          sha: '45a3918',
          author: 'Steven Gort',
          type: 'docs',
          subject: "The vendor README's exit condition is corrected",
          details: [
            'The exit condition claimed extraction was a plain directory deletion with nothing under the demo tree changing. Wrong on two counts: two dozen import specifiers point into the vendored tree and need rewriting, and both build aliases are keyed to relative specifier text that stops matching once those imports change — silently disabling the changelog and section allow-list filters.',
            'It is now a checklist with counts verified by grep rather than assumed, and names the missing backstop explicitly: the dropped sections would silently reappear on the public site.',
          ],
        },
        {
          sha: '2b37889',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The sanitiser dependency is declared',
          details: [
            "Two vendored files import a Markdown sanitiser that only resolved because npm workspaces hoisted it from the frontend. It is now declared at the frontend's exact pinned version, and the design doc's dependency list corrected — it repeated the same gap and was missing two more.",
          ],
        },
        {
          sha: '1921ccb',
          author: 'Steven Gort',
          type: 'docs',
          subject: "A correction's citation points at the right section",
          details: [
            'The corrections summary cited a section that contains no mention of the changelog, before or after the edit — the wrong link. The actual second location is the package-shape section. Found in review.',
          ],
        },
        {
          sha: '15a4730',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Four factual defects in the design are corrected',
          details: [
            "The design was written before the build ran and diverged from what shipped in four places. The most consequential: mock mode is not forced true ignoring storage entirely — it cannot be, since the check is called by the API layer's own internal branches, which an aliased export never reaches. What ships is a build-time default plus a boot-time write.",
            'The changelog also does not ship as-is: it trips the build-time bundle gate, because six strings would leak backend hostnames and internal detail.',
          ],
        },
        {
          sha: 'a59a0a7',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Four checkable misstatements in the changelog summary',
          details: [
            "Review found the executive summary mechanically sound but holding four checkable misstatements in customer-facing copy — including a claimed backend-origin check that the gate which actually shipped does not have (that check exists only in the demo's own, unrelated gate), and a claim of a social card and prerendering for two pages when only one has either.",
          ],
        },
        {
          sha: 'dca4fe7',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'An executive-summary changelog scoped to CalVer releases',
          details: [
            'Replaces the placeholder with a curated summary of the 25 CalVer releases, grouped into eight themed entries covering what shipped and why it matters to a prospective province — not a re-listing of every commit. The 68 pre-CalVer releases stay out of scope by design.',
            'The public-site launch entry describes the bundle-cleanliness gate and the auth-free scaffold without naming any of the auth libraries the gate forbids, since naming them would trip it.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.25',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['pa-demo'],
      commits: [
        {
          sha: '60ecb71',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The role locator now does the scoping its comment promised',
          details: [
            "The locator's doc comment claimed it was scoped so it could never match Dossierbeheer's identical, disabled role bar, but the implementation was a plain unscoped class match. Both the demo's Rollen & rechten page and the vendored Dossierbeheer render the same structure, so the claimed protection did not exist in code — it worked only because the router renders one section at a time, an invariant the test never asserted.",
          ],
        },
        {
          sha: '10ef511',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'The demo bar is gone; role and reset are single-sourced',
          details: [
            "The role selector existed in three places — the demo bar, Beheer → Rollen & rechten, and Dossierbeheer's inert vendored role bar — plus two separate resets. Role switching now lives only on Rollen & rechten, and reset only in Dossierbeheer's own mock banner.",
            'The role provider stays, since the section router still needs it as a context ancestor.',
          ],
        },
        {
          sha: '49af8ce',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The theme hand-copy tradeoff is signposted',
          details: [
            "Review flagged that the drift check comparing the shim's theme literal against the vendored tenant config detects a divergence but cannot auto-apply one — a manual maintenance trap with an alarm attached, not a solved problem. A short comment now points at the literal itself, so the next person does not have to re-derive the tradeoff: the value is hand-copied, two checks between them ensure a divergence cannot ship silently, and auto-applying from the vendored JSON remains the unimplemented alternative.",
          ],
        },
        {
          sha: 'c0ab873',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The double scrollbar is gone',
          details: [
            "The vendored dashboard stylesheet hard-codes a full-viewport height, which is sound only when the cockpit is the only thing on the page. With the demo bar rendered above it the combined height exceeded the viewport, producing a second outer scrollbar on top of the cockpit's own internal one. Removing the body margin did not touch this — that is an 8px margin, not the ~46px the bar adds.",
            'The override now makes the root a column flexbox capped to the viewport and lets the cockpit take the remaining space, measured before and after.',
          ],
        },
        {
          sha: '9c20c53',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The Flevoland theme is applied at runtime, not as a CSS fallback',
          details: [
            'The cockpit stylesheets read theme custom properties with Flevoland blue and magenta as fallbacks — values that only apply while those properties are undefined. The vendored global stylesheet sets them to generic RONL blue and orange at the root, which satisfies the fallback and silently rebrands the whole cockpit orange.',
            'The real tenant service solves this the same way for every tenant: it sets each theme variable on the document element at runtime, which wins the cascade over an inherited value.',
          ],
        },
        {
          sha: '7ca4e78',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The public asset tree is vendored as a second manifest root',
          details: [
            'A vendored component reads 14 monitor icons from a hard-coded path rather than an import, so a manifest that discovers files by following imports could never find them — the demo shipped none of them, and every icon 404ed on two sections.',
            'A second asset root now sits alongside the source manifest, covering the icons and the tenant config the tenant shim needs.',
          ],
        },
        {
          sha: 'f09b024',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'Deploys also trigger on shared-package changes',
          details: [
            "The demo's imports from the shared package are type-only and erased before the bundler sees them, so a shared-only change cannot alter compiled output. But without this filter a breaking type change in shared would never run the demo's type-check, and would instead surface later at an unrelated demo PR.",
            'It also matches the mechanical repo convention: frontend and backend both depend on shared and both include it in their path filters; the public site does not depend on it and does not.',
          ],
        },
        {
          sha: '22b038a',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Tailwind and the global stylesheet are vendored',
          details: [
            "The global stylesheet is vendored as the 39th manifest entry, with Tailwind, PostCSS and Autoprefixer at the exact versions the frontend pins, and configs adapted to the demo's tree. The typography plugin was dropped, since no vendored file uses it.",
            'This fixed three visual bugs caused by Tailwind utility classes never being processed at all.',
          ],
        },
        {
          sha: 'b2c8bcd',
          author: 'Steven Gort',
          type: 'ci',
          subject: 'The demo deploys to acc.plato and plato, and reports vendor drift',
          details: [
            "Two Static Web Apps deploy workflows mirror the public site's — lint, type-check, unit tests, build with the bundle gate, deploy — plus a shared-package build step the public site does not need, and a blocking vendor check before build, since a stale demo copy genuinely should not deploy.",
            'Drift gets its own workflow, triggered on frontend source pushes rather than demo ones: the deploy workflows are path-filtered to the demo package and would never see an edit to the origin the copy tracks. It reports via a warning annotation without failing the job.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.24',
      status: 'Released',
      date: '28 aug 2026',
      scope: ['pa-demo'],
      commits: [
        {
          sha: 'f305935',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The hidden live toggle and same-origin calls are now actually proven',
          details: [
            "Nothing checked in proved Dossierbeheer's own live/mock toggle stays hidden in a rendered browser — the existing test only asserted that the suppressing CSS rule exists as source text. A new test navigates to Dossierbeheer and checks the toggle is hidden while Reset demodata stays visible.",
            "The network-isolation guard compared hostnames only, so it could not catch a same-origin backend-shaped request — exactly what fetchAgenda() issues when VITE_API_URL is unset, since the resulting path resolves relative to the demo's own origin.",
          ],
        },
        {
          sha: 'a2228e1',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The demo journey is driven end to end without a backend',
          details: [
            'Five Playwright tests run against the live vendored shell with no mocking and no backend, database or Keycloak — Playwright starts its own dev server. Selectors were read off the running app rather than taken from the task brief, which held several wrong assumptions: rail items are buttons rather than links, the cap-del and cap-publish testids do not exist, and a created dossier survives in-app navigation but not a reload.',
            'Two assertions carry the weight: that switching role actually changes what Dossierbeheer permits, guarding the getUser() staleness bug fixed earlier; and that the page issues no request to any backend, proven load-bearing by a red probe with the agenda mock disabled.',
          ],
        },
        {
          sha: '36ba4f4',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'No-Live is enforced by a CSP and a bundle gate',
          details: [
            "staticwebapp.config.json ships a CSP with connect-src 'self' only, so the browser refuses any outbound request the demo's code might someday make. The stronger layer is scripts/check-bundle.mjs, which scans every built .js file for auth libraries, telemetry and the real backend origins, and fails the build if any appear — proving the URL is not in the bundle to be requested at all.",
            "The forbidden list is adapted from the public site's rather than copied: it targets keycloak-js the library and the two backend origins, not the bare string 'keycloak', which this bundle ships legitimately in DB_ROLES and the visible role bar. The first real build caught a genuine finding.",
          ],
        },
        {
          sha: '36487eb',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Dossierbeheer's own live-toggle button is hidden",
          details: [
            "The vendored Dossierbeheer renders its own switch-to-live button, which calls the vendored toggleMock() and writes '0' to the same storage key forceMockMode() writes '1' to — but only at boot. A visitor clicking it mid-demo would flip the cockpit to live against a backend that does not exist, in front of the audience the demo exists to persuade.",
            'It cannot be removed by editing the vendored component or its CSS, so demo-overrides.css suppresses it with a single rule, imported once from App.tsx and kept separate from the demo-bar styling.',
          ],
        },
        {
          sha: 'd0aff6a',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The cockpit mounts with a demo bar and forced mock mode',
          details: [
            "forceMockMode() writes the mock flag before mount, so an inherited '0' from another Open Regels app on the same origin cannot win over the build-time default.",
            "DemoBar carries the demo's one permission control — four role options as enabled, aria-pressed buttons — plus a reset that clears both the signals/searches and dossiers stores and reloads. It uses its own class prefix and stylesheet, deliberately kept outside the vendored scope. There is no live/mock toggle.",
            'DemoRoleProvider wraps the demo bar and the vendored shell, and must be an ancestor because the section router reads the role during its own render.',
          ],
        },
        {
          sha: '58959d5',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Profiel names the right kind of organisation',
          details: [
            'The tenant row hardcoded the label "Gemeente" next to a display name that is always Provincie Flevoland — a mismatch a Dutch government audience would notice immediately. The label now follows organisationType through a small lookup, covered by a test that overrides the shim to a municipality tenant for one render and confirms the label follows, so the coverage is not merely correct by coincidence for the single tenant the shim ships.',
            "Also sweeps two review minors, including role-switcher buttons that had reused a CSS class setting cursor: default — correct for the vendored, deliberately disabled role bar, wrong for the demo's actually clickable controls.",
          ],
        },
        {
          sha: '2166b6d',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'PA-native Profiel and Rollen & rechten pages',
          details: [
            'Both pages were stubs. Neither reuses the caseworker original: the caseworker Rollen section describes caseworker and HR roles and names no pa-* role at all, and Profiel fetches HR data by employee id. Both are caseworker components that would not have become part of the later @ronl/pa-cockpit extraction.',
            "Rollen & rechten is built on the real role and capability tables and hosts the demo's actual role selector, reusing the vendored role-bar classes so it matches the disabled bar in Dossierbeheer. Profiel mirrors the product's two-block layout: account fields from the shims, and a static stand-in for the HR fetch.",
          ],
        },
        {
          sha: '9b9dbd2',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Sections route without any caseworker component',
          details: [
            'DemoSectionRouter replaces the placeholder with a real dispatcher modelled on the vendored router — same six required props, same data call, same section-id grammar — but with the six caseworker dashboard imports dropped entirely. Profiel and Rollen render demo-owned pages, the IOU and Gereedschap cases are gone, and any dropped or unmatched id renders nothing rather than falling through to a placeholder panel.',
            'It also closes a role-propagation gap found while reviewing the previous task: the vendored shell snapshots the user into React state once at mount and never refreshes it, so forwarding that prop to sections would have made the role selector silently do nothing.',
          ],
        },
        {
          sha: '8bd0b78',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The demo role is derived from the shim, not rebuilt by hand',
          details: [
            "Role is now derived from the shim's roles after the write, rather than from a hand-rebuilt array — so the comment claiming it reads the same roles the cockpit reads is now literally true, and the derivation cannot silently diverge if the shim's base roles change.",
            'The render-body write was also re-justified: it is required because children render before any effect fires in the same commit, and the section router reads the shim fresh during its own render — not because of act() timing in one test file, which was the wrong reason previously cited. A StrictMode double-invocation regression test was added.',
          ],
        },
        {
          sha: 'a5f338b',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Roles switch by rewriting the synthetic token',
          details: [
            "Selecting a role rewrites the shim's synthetic Keycloak roles array and derives capabilities through the product's own deriveDossierRole, so capability chips, editor lock hints and every disabled action in the vendored cockpit follow, with no vendored file touched.",
            'Four positions are offered, with the broadest as the default: a visitor should see the whole product before being shown what a narrower role loses.',
          ],
        },
        {
          sha: '9268eea',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Sort sentinels no longer leak into the ⌘K palette',
          details: [
            'allStaticSections() had stopped excluding the two sort sentinels, unlike the origin it forks. Because both ids are allow-listed to keep them in the rail\'s sort-order group, they leaked into the palette\'s hit list, and selecting either fell through to the "not available" panel since the router has no case for them.',
            'The exclusion is restored verbatim from the origin, with a test asserting neither sentinel appears in the output, and the "allows every id it lists" test now skips sentinel ids for the same reason it already skipped the dossiers sentinel.',
          ],
        },
        {
          sha: '0111adf',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Sections are curated by a deny-by-default allow-list',
          details: [
            "sections.allow.ts is the source of truth for which section ids the demo may show: 21 static ids plus the data-driven dossiers sentinel, and the five dropped ids, reconciled one-to-one against the real modes config's 26 rail items.",
            'The filter is applied at the data source rather than at the router, and re-exports every name the real modes config exports, so no vendored consumer sees an undefined import. That matters because the command palette calls the section list directly with no props, so filtering anywhere else would have missed it.',
          ],
        },
        {
          sha: 'dd16ff1',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Auth, tenant and dock shims resolve behind an alias map',
          details: [
            'Shims let the vendored cockpit tree resolve its five imports outside itself without editing a single vendored file.',
            "The resolution mechanism differs by whether the target collides with a real vendored file, and was decided empirically rather than assumed: TypeScript's paths mapping was proven not to apply — adding the proposed block produced byte-identical tsc output, because every import in question is relative and paths only rewrites non-relative specifiers.",
          ],
        },
        {
          sha: 'fdea397',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The origin-gone drift branch is covered',
          details: [
            'A fifth comparison test asserts that a file renamed or deleted upstream reports as changed without throwing — the branch that fires during the weeks-long window before the cockpit is extracted, previously unverified by any test. Also drops an unused import and retitles a self-contradictory test.',
          ],
        },
        {
          sha: '58f9435',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The cockpit is vendored with a manifest-driven sync and drift check',
          details: [
            'A byte-identical vendored copy of the cockpit, kept honest by a manifest that drives the sync and a drift check that reports when the origin moves. Vendored files are never edited; external imports resolve through aliases to demo shims instead.',
          ],
        },
        {
          sha: '6a6f25f',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'The pa-demo package is scaffolded',
          details: [
            'Adds packages/pa-demo as a new workspace, the container for the public mock-only cockpit that ships to plato.open-regels.nl.',
          ],
        },
        {
          sha: 'c421cdf',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Implementation plan for the public mock-only cockpit',
          details: [
            'Twelve tasks, each ending in an independently testable deliverable.',
            'Red/green is structural rather than advisory here. Nearly every guarantee the demo makes is a negative assertion — no backend origin in the CSP, no auth library or API URL in the bundle, no dropped section reachable from ⌘K, no inherited storage key able to flip mock mode — and negative assertions are exactly the ones that pass vacuously when wrong. So five steps write no code at all: they name the thing to break, the failure message to expect, and the restore.',
          ],
        },
        {
          sha: '02391a6',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Design for a public mock-only PA Cockpit',
          details: [
            'A showcase instance of the cockpit on an unauthenticated public site, with no option to switch to Live. Mock mode was already a working demo driven by the same mutation actions live uses, so the work is packaging and severing auth rather than building demo behaviour.',
            'It ships as a vendored copy deliberately ahead of extracting @ronl/pa-cockpit rather than after it: the extraction has to commit to an interface, and nothing outside packages/frontend had ever consumed the cockpit, so building a real second consumer first makes that boundary empirical instead of imagined. It also leaves the shipping cockpit alone during a 342-commit promotion.',
          ],
        },
        {
          sha: 'a80174b',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The promotion delta is brought current',
          details: [
            'The go-live section had been written against a 136-commit delta with acc at 2026.08.3. The delta is now 342 commits across 21 releases with acc at 2026.08.23, and three of its five subsections had gone stale in ways that would have misled the promotion.',
            'The ordering claim survives, but the public-site production workflow did not exist when it was written: three path-filtered workflows now fire on push to main and two of them deploy. Since all three are gated on lint and tests, a red gate leaves main half-promoted — backend deployed by the manual script, frontends never deployed. CI-green-on-acc is now the leading check.',
          ],
        },
        {
          sha: 'da72abf',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'The production promotion delta beyond the public site',
          details: [
            'Merging acc into main promotes the full delta across backend, frontend and public site, not just the public site. Documents the extras: the app-wide backend-before-push ordering, the safe-by-default backend environment variables, the frontend mock flag, that the database self-migrates on boot with no manual step, and a caseworker-app smoke test.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.23',
      status: 'Released',
      date: '22 aug 2026',
      scope: ['frontend', 'backend'],
      commits: [
        {
          sha: '48356fb',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The shipped rate limit was below what the cockpit costs to use',
          details: [
            'One short authoring journey measures 21 requests to /v1/pa/*, so a minute of ordinary clicking exhausted a 100/min budget and every fetch came back 429. The surface renders that as “Kon dossiers niet laden”, indistinguishable from a backend that is down — which is why it was misdiagnosed twice, first as a slow stack and then as a post-login token race. Neither had evidence behind it; instrumenting the failing run with a response listener showed six consecutive 429s.',
            'Raised in config.ts, not only in .env.example. That distinction is the point: ACC and prod are configured through App Settings, and any key they do not set falls through to the code default, so editing the example file alone would have changed nothing where it matters. The existing config test asserted the old default and now pins the new one, and .env.development is set to the same 1000 so a ceiling that turns out to be too tight shows up locally first.',
            'Worth knowing and not fixed here: the limiter keys on the caller’s IP and TRUST_PROXY defaults to false. With trust proxy off, Express reads req.ip from the socket peer, which behind a front-end proxy is one internal address for everybody — so the budget is per deployment, not per user. Whether ACC runs that way is visible in the request log, which records ip on every call.',
          ],
        },
        {
          sha: '15c303d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Deleting a dossier takes its signals and zoekcriteria with it',
          details: [
            'DELETE /v1/pa/dossiers/:id removed the dossier row and its versions, and nothing else. Observed on a real database: deleting one dossier left 37 curated signals and its zoekcriterium behind, all still counted on the Monitoring rail and all still shown as cards carrying the dead dossier’s id, while Dossierbeheer correctly reported zero dossiers.',
            'None of this can happen by cascade today. dossier_id is a plain TEXT column on pa_signals, pa_saved_searches and pa_dossier_versions with no FK back to pa_dossiers, so every delete has to be spelled out in the route. The four statements run in one transaction because a partial delete is worse than none: ids are slug-derived, so recreating a dossier under the same name lands on the same id and silently inherits whatever survived.',
            'Deleting the zoekcriteria is what actually stops the bleeding. Curation selects saved searches by tenant and scope alone and never checks the dossier still exists, so a surviving criterion keeps running its query and filing fresh signals against a dossier that is gone. pa_notifications does cascade from pa_signals, so those go without being named — verified against a live database rather than assumed. The delete dialog said “inclusief alle versies”, which was true but narrower than what happens; it now names the signals and zoekcriteria and says monitoring on the topic stops.',
          ],
        },
        {
          sha: '26c0298',
          author: 'Steven Gort',
          type: 'feat',
          subject:
            'Every signaalbron carries a watchlist orphan, and the demo counts stop being identical',
          details: [
            'The cockpit models “confirmed but belonging to no dossier” as its own state: orange card, a Watchlist chip, a filter, and a dossier picker to resolve it. The fixtures carried two of those, both in Europa and Media, so from Politiek — where a demo starts — the feature was invisible. Every source now has one: an initiatiefnota straddling netcapaciteit and ruimtelijke ordening, and a geluidszone that may or may not sit under Lelystad Airport, converted from a linked signal.',
            'Every source also showed exactly 4 confirmed and 6 inbox, which reads as placeholder data and draws questions about what the numbers mean rather than what the cockpit does. Now 6/9, 5/7, 4/7 and 4/5. Still hard-coded rather than generated: Reset demodata needs an exact baseline to return to, and the end-to-end assertions need to stay deterministic. Seven fixtures added, one converted, one dropped — 19 confirmed, 28 inbox.',
            'pa-mock-journey drops its two flat constants for a per-source BASELINE table, asserted absolutely once per run with everything else relative, so extending the fixtures means editing one row. A new test asserts each source has exactly one orphan, then links one and checks the filter disappears while the confirmed tally does not move — linking routes a signal, it does not curate one.',
          ],
        },
        {
          sha: '0d78873',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Live authoring leaves quarantine, and API throttling names itself',
          details: [
            'The live authoring spec was quarantined on what looked like a race in the app. It was not: the failing runs were being rate-limited, and the backend’s 429 reaches the user as a generic load error. A new helper records the first 429 of a run and fails the test with a message that names the throttle and points at the setting. It deliberately does not retry or wait it out — a throttled run is not a valid run. In the live spec it throws only after afterEach cleanup has finished, because a throttled run is the one most likely to have left rows behind.',
            'Also removes test.slow() and corrects a helper comment; both documented the diagnoses that turned out to be wrong. With the throttle gone the two tests run in about 4s and 2.7s, well inside the default budget. Verified across six consecutive runs.',
          ],
        },
        {
          sha: '61110cf',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'A created dossier is on the overview by the time you arrive there',
          details: [
            'handleSave fired refetch() and changed section in the same tick. refetch returned void, so awaiting it was not even possible — the overview could render against a list that had not come back yet. The dossier was created, the POST succeeded, and the user did not see it.',
            'refetch now returns its promise and handleSave awaits it before navigating. syncCockpit stays fire-and-forget: the cockpit catches up on its own and nothing renders against it in this flow. Pinned by a test that resolves fetchAdminDossiers from a deferred promise and asserts onNavigate has not been called until it settles, verified to fail when the await is reverted to a bare call.',
          ],
        },
        {
          sha: 'b862a79',
          author: 'Steven Gort',
          type: 'test',
          subject: 'An end-to-end journey for live authoring',
          details: [
            'Mock and live are two implementations of the same operations, and the mock half broke twice this week without a test noticing. The live half had no end-to-end cover at all. This adds it: create a dossier through the real flow, add a zoekcriterium, assert both survive a cold reload, and assert that live shows authored work where mock shows fixtures.',
            'Limited to authoring on purpose. Curation depends on TK OData, the EU feed and the media aggregator — TK alone measured 10s and 48s for the same query minutes apart — so asserting that signals arrive would be flaky by construction. Cleanup creates uniquely-named items and removes only those, in afterEach, reporting rather than swallowing failures. It does not use pa:reset-data: that is a feature of the product, and a test has no business clearing someone’s authored work.',
            'Two things worth knowing for the next spec here. A plain page.reload() signs you out, because keycloak.authenticated lives in memory and the app does not re-init on a direct load — which makes the reload worth doing, since every module cache goes with it. And locator.count() and locator.isVisible() do not auto-wait: an earlier version of the cleanup guarded with count() straight after navigating, read 0 before the list had rendered, and silently deleted nothing, leaving ten test dossiers in the dev database.',
          ],
        },
        {
          sha: 'fb144cc',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'PA_USE_MOCK dropped — nothing read it',
          details: [
            'config.pa.useMock was parsed from PA_USE_MOCK and read nowhere. Dead config is worth removing on its own, and this one more than most: the frontend has just consolidated on a single isPaMock(), so a backend flag literally named useMock is the first thing someone reading for “how does mock/live work here” would find, and it would tell them nothing true.',
            'Removes the type member, the parseEnvBool line and the three test references. No behaviour changes. The VITE_PA_USE_MOCK mentions in the changelog stay: they are historical release text about the frontend variable, which was split long ago.',
          ],
        },
        {
          sha: 'ac49af8',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Mock mode driven end to end in Playwright',
          details: [
            'Every mock-mode defect found by hand over the last two days was invisible to the unit suites by construction. None was a logic error: a saved-search write that was a bare return, a confirm that built a new object and discarded it, notifications hardcoded to empty, a resource fetched once at mount and never again. Component tests mock the very seam that was broken, so they cannot see any of it — and every one of them passed throughout.',
            'This drives the real store with no mocking at all: confirm a signal and watch the badges move, reload and find them still moved, ignore one and find it still gone, reset and find everything back at the fixture baseline. Plus that the reset control is mock-only, since offering it in live would imply the page can rewrite the database. Verified to catch what it exists for by disabling the persist call in the demo store.',
            'Mock is enabled with addInitScript rather than a write after login, because the reload needed to pick up a post-login write is the same reload that signs you out. The demo store is cleared once per test behind a sessionStorage sentinel — otherwise the init script would wipe the very state each reload is meant to prove.',
          ],
        },
        {
          sha: 'a852e55',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Jest mocks asserted to name only real exports',
          details: [
            'Spreading jest.requireActual stops an export going missing from a mock. It quietly creates the opposite hazard: if an export is renamed, the override still declares the old name, the spread supplies the real function under the new one, and the suite calls the real implementation — a live network request from a unit test, no longer stubbed by anything, and nothing fails.',
            'expectMockNamesRealExports closes that. Every override object is now named so both the factory and the assertion can see it, and each suite drives its mocks through it.each, so a stale name fails as its own case: fourteen mocks across pa.routes, curation.service and the three source-client suites. Verified by adding a renamed export and watching it fail with the reason, not just a diff.',
            'The helper’s doc comment carries the trap hit while writing the frontend equivalent: pass jest.requireActual(path), never require(path). The path is mocked, so a plain require hands back the mock and the assertion compares the mock with itself — passing unconditionally, proving nothing, and looking entirely correct in review.',
          ],
        },
        {
          sha: '7cb90c5',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The PA jest mocks are built on the real modules',
          details: [
            'A jest.mock factory returning a hand-written object replaces the module wholesale, so an export added later is simply absent. That is where this started: EU_DOCUMENT_TYPES was added to eu.client, this suite’s mock did not have it, the spread produced undefined and GET /v1/pa/types answered 500 — while all 126 route tests passed.',
            'Fourteen mocks of internal PA modules now spread jest.requireActual before their overrides: the four source clients, curation.service, rules, and pa-cache across five suites. Verified against the original defect by deleting EU_DOCUMENT_TYPES from the mock again — every test still passes, because the real constant is inherited. That bug can no longer be written. Which also lets the hand-maintained copies of TK_DOCUMENT_TYPES, OB_PUBLICATION_TYPES and EU_DOCUMENT_TYPES go.',
            'Deliberately not converted, out of 234 mock sites: the config util, because spreading it runs validateConfig at import and throws without a full environment; the logger, a narrow stub whose omissions fail loudly rather than silently; and third-party SDK mocks, which are not ours to inherit from.',
          ],
        },
        {
          sha: 'c373c3f',
          author: 'Steven Gort',
          type: 'test',
          subject: 'pa.api mocks built on the real module instead of replacing it',
          details: [
            'A vi.mock factory returning a hand-written object replaces the module wholesale, so anything the module gains later is simply absent. A function becomes undefined at the call site; a constant spreads to nothing. All seven pa.api mocks now spread the real module before their overrides, so a member nobody thought to stub keeps its real implementation.',
            'The other direction needs its own check, since spreading cannot see a rename or a typo: expectMockNamesRealExports asserts every key the mock declares exists on the real module. It lives in an ordinary test rather than the factory because the factory is hoisted above the imports and cannot call anything imported.',
            'Worth recording, because it was nearly shipped: the first version passed a plain dynamic import rather than vi.importActual. That path is mocked, so the import returned the mock and the assertion compared the mock with itself — passing unconditionally, proving nothing. It surfaced only because injecting a deliberately bogus key failed to fail.',
          ],
        },
        {
          sha: '16e17ca',
          author: 'Steven Gort',
          type: 'test',
          subject: 'One parity-checked stub for the usePaData context',
          details: [
            'Twelve test files mocked PaDataProvider by hand, each with its own partial stub. A member added to the context and missed in a stub is undefined at the call site, which surfaces as an unhandled rejection that still lets every test in the file pass. That happened five times in three days, and one of them went green locally and then failed the ACC frontend deploy at the Unit tests step, so the frontend was never published.',
            'makePaDataStub is now the single stub, and its parity test renders the real provider and asserts the provider’s keys equal the stub’s. Equality in both directions on purpose: a missing key is the bug this exists for, and a leftover key means the stub is teaching tests to rely on something the context no longer provides. Verified by deleting dismissSignal from the stub and watching it fail — an assertion that cannot fail is worse than none.',
            'The trade, deliberately taken: a stub carrying every member also hides over-mocking, since a test can now reach something it never declared it needed. That is worth less than the silent-undefined class costs.',
          ],
        },
        {
          sha: 'd304960',
          author: 'Steven Gort',
          type: 'test',
          subject: 'The monitoring surfaces that had little or no cover',
          details: [
            'NotificationsPanel had no tests at all, which mattered little while notifications could not arrive in mock mode. Mock mode now derives them, so it is a surface people will demo — 0% to 100% on every metric. Issuekaart had nothing for the Monitoring sub-tab, the one carrying confirm, ignore and dossier-linking: 34% to 86%. Monitoring gains the raw search band, 57% to 77%.',
            'PaDataProvider’s six mutation wrappers were uncovered. Each exists solely to refetch what the backend recomputes, so an untested wrapper is a silent “the bell does not update” waiting to happen. 83% to 98% statements.',
            'Three of these files’ hand-written usePaData mocks were missing dismissSignal, found while writing the tests — the fifth time in three days a hand-written mock had diverged from the module it stands in for. No production code changed.',
          ],
        },
        {
          sha: '09d2ac5',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Mock mode is a working demo, not a read-only snapshot',
          details: [
            'Mock mode read the fixtures directly, so nothing done in it stuck. Confirming a signal built a new object and discarded it; every saved-search write was a plain return; fetchNotifications was hardcoded to empty. Most of that was invisible until the flag was unified: VITE_PA_SIGNALS_MOCK was false in every environment, so those branches were unreachable and the calls really hit the backend. Making them live exposed them all at once as stubs.',
            'A persisted demo store is the missing piece: signals and saved searches seeded from the fixtures, mutated by the same actions live uses, and kept so a demo survives navigation and reloads. Notifications are derived from those two rather than stored, mirroring the backend’s own watch matching. Persisted state is stamped with the build version, so a deployment carrying new fixtures beats a browser holding a copy of the previous ones.',
            'The Reset demodata button sits in the Dossierbeheer banner under the live toggle, in mock mode only — live has no demo state to reset and the button would imply this page can rewrite the database. syncCockpit now also re-reads signals, inbox counts and notifications: switching modes left the previous mode’s numbers standing until Monitoring was visited.',
          ],
        },
        {
          sha: 'eab623f',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Ignoring a signal now keeps it ignored',
          details: [
            '“Negeren” was client-only state in both modes — it set a local dismissedIds set and nothing else — so the signal came back on the next reload. The button did not do what it said.',
            'POST /v1/pa/signals/:id/dismiss sets status to dismissed and clears routing. Three things made this cheap: status is plain TEXT with no CHECK constraint, so no migration; the inbox query already selects only candidate and ai_drafted, so a dismissed signal drops out of both the list and the counts with no query changes; and the candidate upsert already carried a guard that leaves it alone on the next curation cycle.',
            'Clearing routing matters separately: a signal confirmed without a dossier carries routing = watchlist, and dismissing it should take it off the watchlist rather than leave it listed there.',
          ],
        },
        {
          sha: 'ab1d156',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'TK fetched one term at a time, so multi-term criteria stop aborting',
          details: [
            'TK OData slows sharply per contains() clause, and asking it for a total over the union is the larger half of that cost. Measured against the live API, a five-term OR query took 23s and 48s minutes apart — both past the 15s AbortController — and a three-term query took 28-38s. Every criterion in the seeded taxonomy uses three to five terms, so TK retrieval was aborting for all of them, silently. Politiek’s signals had been coming from OB alone.',
            'fetchTkFeed now issues one request per term, in parallel, and merges them: dedup by id so a document matching two terms is one hit, newest first, then sliced for skip/top. Measured after: three terms 10.3s, five terms 10.1s, against aborts before. The shape scales flat with term count rather than exponentially. A failing term no longer costs the whole query.',
            'The total count is omitted for multi-term queries — it is the expensive half, a full count over ~14k matches to render “N treffers”. The search band falls back to the item count, so nothing downstream changes; single-term queries keep their exact total. The fan-out gets 30s rather than 15s, because every timer starts when the request is created and a queued request spends its budget waiting.',
          ],
        },
        {
          sha: '699b84c',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'An empty cached feed is no longer served for the rest of the TTL',
          details: [
            'eu.client was fixed for this earlier; its three siblings were not, because only the client being debugged was looked at. tk, ob and agenda all short-circuited on the presence of a cache entry, and for tk and ob that value is an object — an empty result is truthy — so a fetch that came back empty was served as a real answer until the TTL expired.',
            'The guards now test the payload rather than its presence. Re-fetching a genuinely empty result costs one upstream call, which is the right trade against serving a failure as data. The tk and ob tests assert fetch IS called with an empty entry cached, so they fail against the old guard rather than passing vacuously.',
            'Worth recording that this was not the cause of the zero-result TK searches it was found while investigating. Those turn out to be timeouts, fixed separately — an abort throws before the cache is written, so nothing was ever cached and the zero was reproducible rather than sticky.',
          ],
        },
        {
          sha: '8e1972b',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The rail’s confirmed counter stops freezing at mount',
          details: [
            'The Signaalbronnen rail shows two numbers per source. Refreshing the inbox half left the other still frozen — useResource fetches once, on mount, so the confirmed number is a snapshot from whenever the page last loaded. It showed on ACC immediately after the database was emptied: the rail kept reporting confirmed signals for sources whose rows had all been deleted, while the tab beside it correctly read 0.',
            'Monitoring now calls the provider’s refetch alongside refreshInboxCounts on tab load, so arriving at Monitoring or opening any source re-reads both halves. It also refetches after a confirm, which is the only action that changes the confirmed count and does not re-run the tab-load effect.',
            'The hand-mocked context in the Monitoring tests gains the resource, and a test asserts the refetch happens. That assertion matters more than the fix: this was the third member added to that stub in a day, and the previous omission surfaced only as an unhandled rejection that still let every test pass.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.22',
      status: 'Released',
      date: '21 aug 2026',
      scope: ['frontend', 'backend'],
      commits: [
        {
          sha: 'b7756a2',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Inbox badges stay current instead of freezing at page load',
          details: [
            'The per-source counts were seeded once, in an effect with an empty dependency array, and thereafter only patched a single tab at a time from whichever inbox the user opened. Anything that changed the inbox after page load — a curation run, most obviously — stayed invisible: every badge kept its startup value until that source was opened, at which point it jumped while the other three stayed stale. Reading the badges meant clicking through all four, and a reload was the only way to make them agree.',
            'refreshInboxCounts re-reads all of them in one request and is exposed on the context. Monitoring’s tab-load effect calls it, so opening any source — or simply arriving at Monitoring — brings every badge up to date. The existing single-tab update stays for the immediate case: it is authoritative for the tab just fetched and avoids a round trip after confirm or dismiss. A failed refresh keeps the previous numbers rather than zeroing them, since a transient error is not evidence that every source emptied.',
            'Deliberately not wired to the "Curatie nu uitvoeren" button: triggerCurationCycle resolves as soon as the backend accepts the job and runs the cycle in the background, so a refresh there would re-read pre-curation numbers. Any refresh at that point would be a guessed delay.',
          ],
        },
        {
          sha: '4b4b320',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The mock/live toggle is now one switch for the whole cockpit',
          details: [
            'Mock and live were two independent flags. VITE_PA_DOSSIERS_MOCK governed dossiers through a runtime localStorage override that the Dossierbeheer banner flipped; VITE_PA_SIGNALS_MOCK governed signals, inbox and saved searches as a build-time constant, false in both development and acceptance. So "mock mode" was never one thing: flipping the banner gave fixture dossiers alongside signals and zoekcriteria read from the database, and once that database was emptied the cockpit showed four fixture dossiers next to an empty Monitoring and an empty Zoekcriteria, with no way to reach the fixtures for either.',
            'isPaMock/setPaMock replace both, on one localStorage key, driving all 24 branches. The default ORs the two legacy env vars so neither .env file changes meaning; both are false today, i.e. live unless toggled. The key changes from paV2.dossiers.mock to paV2.mock, so an existing override resets to that default once.',
            'The banner copy claimed the flag governed dossiers and described a seam that had already been bought. It now says what the switch does, and names empty-in-live as a valid outcome rather than a fault — that is what a live database with nothing authored in it looks like. VITE_PA_AGENDA_MOCK is left alone: the agenda is served from TK OData rather than the database, so "live means the database" does not apply to it.',
          ],
        },
        {
          sha: '60bea12',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The demo taxonomy is no longer seeded into the live database',
          details: [
            'Companion to the demo-dossier gating: seedTaxonomy() ran unconditionally inside initPaDb(), writing PA_TAXONOMY_SEED into pa_saved_searches on every startup. Curation retrieves against whatever criteria are there, so those fixture zoekvragen produced 825 signals and 66 notifications in a database where nobody had authored a single search. Switching the cockpit to live still showed a fully populated Monitoring built entirely from fixture configuration — the same defect as the dossiers, one table over.',
            'Both seeds now sit behind one flag, PA_SEED_DEMO_DATA, renamed from PA_SEED_DEMO_DOSSIERS now that it governs more than dossiers. Off by default: live means dossiers, criteria and signals someone actually produced, and an empty cockpit is a valid answer rather than a fault. DEMO_SEARCH_IDS mirrors DEMO_DOSSIER_IDS — derived from the seed and asserted against what the seed inserts, so a criterion added later cannot survive a --drop-demo unnoticed.',
            'reset-pa-dossiers.ts becomes reset-pa-data.ts (npm run pa:reset-data) since it now owns all six PA tables rather than the two dossier ones: --yes clears everything, --drop-demo removes only seeded rows and keeps authored work, --seed-only restores demo content additively. Signals and notifications are treated as derivations — curation regenerates them from the live sources once real criteria exist.',
          ],
        },
        {
          sha: '9b1773d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Demo dossiers are no longer seeded into the live database',
          details: [
            'Dossierbeheer seeded pa_dossiers from the same @ronl/shared SEED_DOSSIERS the frontend serves as MOCK_DOSSIERS. That was deliberate — it made the VITE_PA_DOSSIERS_MOCK flip a visual no-op while the seam was being proven — but it also meant the live store could only ever be mock plus whatever had been authored on top, so the two modes were not separable by construction. Live showed 6 dossiers where 2 had been created.',
            'Seeding is now opt-in and off by default, so live means dossiers someone actually authored. Templates and snippets still seed unconditionally: you cannot create a dossier without a sjabloon to start from, so they are part of a working empty install rather than sample content. Mock mode is unaffected — the frontend’s MOCK_DOSSIERS is its own copy and never went through this path.',
            'Dropping the seed only stops new databases picking the rows up, so a reset script is how an existing one is cleaned. DEMO_DOSSIER_IDS is derived from the seed and asserted against what the seed actually inserts, so a dossier added later cannot survive a --drop-demo unnoticed.',
          ],
        },
        {
          sha: 'e59fd7f',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Agenda soort badge no longer overlaps the item meta',
          details: [
            'The badge sat in the agenda row’s fixed 92px time column with white-space: nowrap. Labels wider than that — REGELING VAN WERKZAAMHEDEN, PROCEDUREVERGADERING, TECHNISCHE BRIEFING — overflowed the column and rendered on top of the body column’s meta line. Short labels happened to fit, so the layout looked correct on most rows while being wrong on all of them.',
            'The badge moves into the meta row, where it is a type label among the other facts and the existing flex-wrap sizes it at any length. The time column then only holds a clock, so it drops to 62px, and the badge loses align-self: flex-start, which was positioning it in the old vertical column and would push it off the text centre line in a horizontal one.',
          ],
        },
        {
          sha: '7bcf94e',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'EP motions that arrive once per political group are collapsed into one signal',
          details: [
            'EP practice is that each political group tables its own B-document for the same motion before they merge into a joint RC resolution, so one topic reaches the inbox as up to six rows. Measured on a live inbox: 12 of 54 EU candidates were such siblings — 22% of the source. Compared field by field, a group differs only in ref and in title casing; committee, score, dossier match, date and source label are identical, so the siblings carry nothing separately reviewable.',
            'The survivor is keyed on its normalised title, not on a ref. Which siblings a cycle happens to see varies, and a later cycle can turn up a lower ref than the one already stored — so a ref-derived winner would change between cycles and persist a second row instead of updating the first. A title-derived key is stable however many siblings show up. The refs are not discarded: the survivor’s number becomes "B-10-2026-0346 +2", the same "+N" shape already used for co-responsible committees.',
            'Not yet demonstrated end to end: fetchAllNewSubmittedTexts returned nothing at the time, the cycle having already ingested everything available, so no real group has been watched through a real cycle. Existing duplicate rows are left alone by design — they keep their ref-derived ids and will age out of the inbox as they are dismissed.',
          ],
        },
        {
          sha: 'cb1613f',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            'Europarl now receives a User-Agent, and an empty 202 is no longer read as a feed',
          details: [
            'The EU RSS source had been returning nothing — not for a query, but for every request, including an empty one. europarl.europa.eu gates its RSS feeds on a recognised User-Agent family. Node’s fetch sends none, and the CDN answers 202, text/html, zero bytes. 202 passes res.ok, so the client parsed an empty string, got zero items, logged "EU RSS fetched, count: 0" as a success and cached that for the TTL. Silent, and it looked healthy throughout.',
            'Three changes: an explicit User-Agent, in the conventional Mozilla/5.0 (compatible; ...) crawler form because a bare product token is refused exactly as a missing one is; a 2xx whose body is not XML now throws instead of parsing to an empty list; and an empty cache hit no longer short-circuits, since a truthy check treated the empty array as a valid answer and served it for the rest of the TTL — precisely what a failed fetch leaves behind.',
            'Consequence: the other EU fixes in this release had never run against real data in the app, only against fixtures and hand-downloaded files. With the feed arriving, fetchEuFeed returns 45 items (25 ep-rss, 20 ep-persbericht), and a curation cycle took the EU inbox from 42 to 54. A silent success costs more than a loud failure — three real bugs sat behind this one.',
          ],
        },
        {
          sha: 'd3afa64',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The raw EU feed can now be searched from the cockpit',
          details: [
            'The blanco search band advertises that it "doorzoekt de rauwe bronfeeds, los van de curatie", and GET /v1/pa/feed?source=eu is implemented — but the EU feed could never be reached. fetchFeedSources derives the bron chips straight from the keys of GET /pa/types, which returned only tk, ob and media. With no eu key there is no Europa chip, so source=eu was never requested: the capability existed and was unreachable.',
            'It is now listed, gated on config.pa.euSourceEnabled exactly as media is on mediaSourceEnabled. No frontend change was needed — FeedSource already includes eu, and both SOURCE_CHIP_LABEL and SCOPE_LABEL already map it to Europa. Unlike media’s empty-array placeholder, EU has a real taxonomy, so EU_DOCUMENT_TYPES gives the type filter something to work with.',
          ],
        },
        {
          sha: '9daf160',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Every inbox badge is populated on mount, from one counts request',
          details: [
            'The source badges in Monitoring read 0 for every tab until the tab was opened, which is indistinguishable from "this source has no signals". Mount-time seeding existed but was unguarded: four fetchInbox calls with no .catch, in an effect that runs once. When the cockpit mounts while the backend is down or still starting, all four promises reject silently and nothing retries — the badges stay at 0 for the rest of the session. That is how it was found.',
            'Adds GET /v1/pa/signals/counts — every tab’s total from one GROUP BY tab query, defaulting to the inbox statuses and accepting an explicit status. It sits above any /signals/:id-shaped GET so counts is not read as an id. The provider now makes one request instead of four capped result sets pulled solely to read four numbers off their meta, and retries with linear backoff. Counts are written over a zeroed base rather than merged, since a tab whose inbox has emptied is absent from the response.',
          ],
        },
        {
          sha: 'bdcbe15',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'EP press releases are surfaced, and commissie is populated for EU items',
          details: [
            'The press-releases feed was fetched every cycle and contributed nothing: all 20 items were discarded, because extractRef only recognises the EP document shape and normaliseRssItem returns null without a ref. They do have a stable identity — the IPR code EP puts in the public URL — present on every item and unique across the feed. The link form is used because it is what EP publishes and what a human would recognise.',
            'Three things follow from an item having no document ref: url is the item’s own link rather than doceoUrl(); subbron is ep-persbericht, kept distinct from ep-rss so the two are filterable apart; and type falls back to Persbericht from the RSS category, since there is no ref prefix for inferType to work from.',
            'Also populates commissie from the body-domain categories, which applies to plenary documents as much as press releases — neither had it before. Co-responsible committees are counted rather than dropped or run together: "ITRE +1", "AGRI +15". Verified against both live feeds through the parser: plenary 30 kept (13 with a commissie), press releases 20 kept (16 with one).',
          ],
        },
        {
          sha: '4aaca24',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'EU refs are recovered from the guid, restoring half the plenary feed',
          details: [
            'extractRef matched the guid against a word-boundary-anchored pattern. EP guids wrap the ref in underscores — RR_A-10-2026-0099_v01-00_EN — and the underscore is itself a word character, so the boundary never fires on either side of the ref. The guid branch was dead code and every ref came from the title fallback, which only matches titles ending in an "A10-0099/2026" suffix. Items whose titles are plain Dutch prose had no recoverable ref and were dropped outright.',
            'Measured against the live plenary feed through the parser itself: 15 of 50 items kept before, 30 after. Half the feed was being discarded — joint resolutions, draft decisions and adopted texts, precisely the material the cockpit’s EU signals exist to surface. Dropping the boundary assertions is enough; the pattern’s own shape already anchors it, and an added negative lookahead stops a longer digit run being truncated into a false 4-digit match.',
            'One existing test had to be corrected rather than extended: it asserted the ref was recovered "when the guid carries a word-bounded one" and used a guid with spaces instead of underscores, quietly encoding the bug as intended behaviour.',
          ],
        },
        {
          sha: '8ec82b8',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'The local client secret is read from the realm export rather than .env',
          details: [
            'The same operaton-mcp-client secret lived in three places — the seeded realm export, the running Keycloak, and packages/backend/.env.development — and they drifted apart. A partial import through the Keycloak admin UI reset the client secret to the realm value and in doing so orphaned the copy in .env.development, breaking test-smoke-live.sh’s Tier 2a instead. One source repaired, another silently invalidated, with nothing to connect the two symptoms.',
            'test-smoke-live.sh now resolves the local secret from the realm export, matching what test-m2m-routes.sh already did. The realm file is the right source because it is what Keycloak imports, so it stays true across a re-import; .env holds a derived copy that nothing keeps in sync, and remains the fallback. Also closes a gitignore gap: the env rules are exact paths, so an editor’s backup carrying the same secret was untracked but not ignored.',
          ],
        },
        {
          sha: 'a530ac2',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'M2M decision checks are environment-aware',
          details: [
            'test-m2m-routes.sh hard-coded a decision key and evaluate payload specific to the local fixture bundle, so the two decision checks failed every time the script ran against ACC. That was never a route defect: ACC’s M2M client talks to operaton-doc, a different engine, where that decision is not deployed. The 404 was the route correctly reporting a decision that does not exist.',
            'DECISION_KEY and DECISION_VARS are now per-TARGET presets alongside the URL presets the script already had, both still overridable from the environment. decision.get runs before decision.evaluate and doubles as an existence probe: on 404 both checks skip and name the missing key. Which decisions an engine has is deployment data, not route behaviour, so a key missing from one environment should not read as a regression in another. ACC now reports 27 passed / 0 failed, up from 23/2.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.21',
      status: 'Released',
      date: '21 aug 2026',
      scope: ['frontend', 'backend'],
      commits: [
        {
          sha: '4fb1b8e',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Local M2M now targets the Docker Operaton, and its route script runs locally',
          details: [
            'The tenant-adoption design parked OPERATON_M2M_BASE_URL as out of scope, on the grounds that fixing it needed Docker-networking work — "the M2M client\'s own reachability to localhost:8081 from wherever it actually runs". That did not apply: m2mOperatonService is an OperatonService instance inside the backend process, and the backend runs on the host in local dev, so it reaches localhost:8081 exactly the way OPERATON_BASE_URL already does.',
            "The same env block also declared plain OPERATON_TIMEOUT/USERNAME/PASSWORD instead of the _M2M_ names, so config.operaton.m2mUsername and m2mPassword were never set and fell through OperatonService's `username ?? config.operaton.username` default. That silent fallback is what kept the remote engine working locally, and therefore unnoticed. ACC and production are untouched — both still point at the dedicated operaton-doc engine.",
            "scripts/test-m2m-routes.sh gains TARGET=local|acc matching test-smoke-live.sh's convention, reads the client secret from the seeded realm file on local, and adds four assertions that can actually fail: AwbShellProcess and AwbZorgtoeslagProcess start-forms must resolve through the untenanted M2M surface (proving the tenant fallback and the cross-tenant design), RipR21Process's start-form must be absent, and its variable-hints must resolve. The previous check passed on 200 or 404 against whichever process happened to be first — locally that is RipR21Process, which has no start-event form, so it could not have failed even if the fallback were broken.",
          ],
        },
        {
          sha: 'ee9e9c0',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'inferType extracted from four routers into one tested helper',
          details: [
            'The process, task, decision and m2m routes each carried a private inferType tagging plain JSON values with Operaton variable types. All four were semantically identical — two byte-identical pairs differing only in brace style — so this is de-duplication with no behaviour change.',
            'Testing it as a pure function reaches what four HTTP surfaces could not: the `default` arm is unreachable through a request body, since JSON.parse only yields boolean, number, string, object or null, but bigint, symbol and function all land there for a direct caller. That branch was uncovered in all four routers and is now covered once. Decision, process and task routes reach 100% on every metric as a result.',
            "m2m's toOperatonVariables is deliberately left in place — it also passes through values already shaped as { value, type } envelopes, which the other three do not. Adopting it everywhere would change what those endpoints return, so unifying it is a behaviour decision rather than part of this extraction.",
          ],
        },
        {
          sha: '2a77717',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'A seed dossier without an owner is now a compile error',
          details: [
            "SEED_OWNERS mapped the five seed dossiers to their kernteam owner with a `?? 'Kernteam PA'` fallback repeated at four call sites. The fallback was unreachable — until someone added a sixth dossier to @ronl/shared and forgot an owner, at which point it would seed a plausible-looking value nobody would question in ACC.",
            'Now a two-link chain: SEED_DOSSIER_IDS is a literal tuple and SEED_DOSSIERS is typed (Dossier & { id: SeedDossierId })[], so an unregistered id fails to compile in shared; SEED_OWNERS is Record<SeedDossierId, string>, so a registered id with no owner fails to compile in the backend. Both verified by breaking them deliberately.',
            "Worth recording why the obvious form does not work: Dossier.id is string and SEED_DOSSIERS was annotated Dossier[], so Record<(typeof SEED_DOSSIERS)[number]['id'], string> widens to Record<string, string> and constrains nothing. `satisfies` does not help either — string-literal properties in a mutable object literal widen regardless — and `as const` would make the seed deeply readonly, breaking toMarkdown(d: Dossier). Hence the separate id registry.",
          ],
        },
        {
          sha: 'e28dc19',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            'Required-env checks now actually fire, and /v1/health reports the deployment tier',
          details: [
            "validateConfig checked `!config.database.url` and `!config.operaton.baseUrl`, but both settings fall back to a non-empty default, so the resolved value was never empty and neither guard could fire. The message 'DATABASE_URL is required' could not be printed: a production deployment with no DATABASE_URL started happily and pointed its audit log at localhost. Both now test process.env and gate on production, matching the KEYCLOAK_CLIENT_SECRET guard above them. Verified beforehand that ACC and production both already define the two settings, so neither deployment starts failing.",
            "ACC runs with NODE_ENV=production deliberately — that is what makes it an acceptance environment — so /v1/health reported 'production' for ACC. NODE_ENV cannot carry the tier: Node, Express and this codebase branch on the literal 'production'. Setting NODE_ENV=acceptance would return raw internal error messages on 500s, spawn the eDOCS/LDE/TriplyDB MCP servers via `npx tsx src/…` when the deploy bundle ships dist/ only, switch console logging to the dev format, disable the production startup guards, and quarter the external-task long-poll window.",
            "The tier moves to its own DEPLOYMENT_ENV variable, following the pattern already used in linked-data-explorer, surfaced as config.deploymentEnv on /v1/health, the root endpoint, the startup log and the logger's defaultMeta — the last of which changes what `environment` means in every log record, from runtime mode to tier. Every behavioural branch stays on config.nodeEnv.",
          ],
        },
        {
          sha: '9882a17',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Backend branch and function coverage lifted above 80% for every file',
          details: [
            'Branch coverage went 73.5% to 91.5% and function coverage 94.1% to 96.7%, with no file left below 80% on either metric. 1145 to 1480 tests.',
            "Most of the gap came from three recurring shapes rather than untested features: each handler's defensive `if (!req.user)` 401, unreachable because the mocked jwtMiddleware always attached a user; the `error instanceof Error ? … : 'Unknown error'` fallback in every catch, which is a real path since Operaton, eDOCS and pg all reject with bare strings on socket failures; and `?? ''` defaults for fields an upstream can legitimately omit. Function coverage was entirely callbacks handed to a mocked library, so nothing ever invoked them — axios validateStatus, multer's fileFilter, express-rate-limit's keyGenerator, the /zoeken facet selectors, and the ExternalTaskWorker poll loop, whose lifecycle test spied poll out so the loop had never run.",
            'New suites for the two modules that had none: utils/config.ts went 0% to 97.8% branch — every other suite mocks it, so the real defaults and the import-time validation were never executed — and utils/tls-bootstrap.ts 0% to 100%. One production change for testability: M2M_ALLOWED_OPERATIONS is now exported, since the curation gate lists every operation the router asks about and its 18 OPERATION_NOT_PERMITTED branches could otherwise only be reached by editing the file.',
          ],
        },
        {
          sha: '9d3cc29',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Backend test files made modules so their globals stop colliding',
          details: [
            "The CI test gate added in v2026.08.20 failed on its first run: three backend suites failed to compile with TS2451 'Cannot redeclare block-scoped variable' and TS2300 'Duplicate identifier'. Nine test files have no top-level import or export — they use jest.mock() and require() inside functions — so TypeScript treats each as a global script and every top-level declaration lands in the global scope. Ten names collided across them. Adding `export {};` scopes each file's declarations to itself.",
            'Not a Linux-versus-Windows difference: it reproduces locally after jest --clearCache, because ts-jest caches diagnostics per file and a warm cache skips re-checking the collision. That is why the run passed repeatedly here while failing in CI on a cold runner, and why which files fail varies with whichever the type program reaches first. All nine were latent regardless.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.20',
      status: 'Released',
      date: '20 aug 2026',
      scope: ['frontend', 'public-site'],
      commits: [
        {
          sha: '391ccba',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'bump-release now versions the lockfile, and never uses npm version',
          details: [
            'The release step said "set version in each in-scope package.json" and nothing more, so no release ever touched package-lock.json. Through v2026.08.19 it still recorded the root at 2026.08.3, packages/backend at 2026.08.1 and packages/frontend at 2026.07.0, while the package.json files had all reached 2026.08.19.',
            'The drift was never fatal — npm ci validates dependency satisfiability, and the root depends on its workspaces by path rather than by version range, so those version fields are never checked — but the lockfile is what CI installs from and what SBOM, audit and provenance tooling reads, so all of it reported the wrong versions.',
            "The step now names the exact lockfile keys to edit alongside each package.json, and warns explicitly against npm version: it coerces its argument to strict SemVer, and a zero-padded CalVer month is not a valid numeric identifier, so npm version 2026.08.20 would silently write 2026.8.20 to every file it touches. Caught by running it during the Linked Data Explorer's v2026.08.3 release and reverted there.",
          ],
        },
        {
          sha: '28ab6ca',
          author: 'Steven Gort',
          type: 'other',
          subject:
            'Backend and frontend deploys now gated on lint, tests and the performance budget',
          details: [
            'Public-site was the only package whose pipeline could block a deploy. Backend CI linted and built but never ran its 1145 Jest tests; frontend CI ran neither lint nor test, going straight from npm ci to vite build to deploy. For those two, npm test was a manual discipline enforced by review rather than an automated gate.',
            'The backend workflows gain a Jest step beside their existing linter. The frontend workflows gain a linter, the Vitest suite, and the performance budget as its own step — the budget runs separately because it asserts wall-clock time, which is meaningless while 130 test files compete for cores.',
            'Measured before wiring, all passing: backend 71 files / 1145 tests, frontend 130 files / 1064 tests plus 1 perf, public-site 28 files / 134 tests.',
          ],
        },
        {
          sha: '6be440e',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'lint-staged skipped public-site sources at pre-commit',
          details: [
            'The config had globs for packages/frontend, packages/backend and packages/shared, but none for packages/public-site — so a staged public-site .ts/.tsx file got neither ESLint nor Prettier at commit time. Only the generic *.{json,md} rule applied, and that does not match .ts or .tsx.',
            "It was never uncaught for long: pre-push's npm run lint and npm run check-format both cover public-site in full, and neither is scoped by the lint-staged globs. But a local commit alone could carry an unformatted or unlinted public-site change. No fallout — the package already passed both checks.",
          ],
        },
        {
          sha: '3aac5ee',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Frontend suite now survives a contended full run',
          details: [
            'Two tests failed inside a full npm test while passing in isolation. Both would have made the new CI test gate permanently red, and neither said anything about the code under test.',
            'simEngine asserted run(cfg) completes under a 250ms wall-clock budget, and its source comment is emphatic that the threshold must not be loosened — the intended remedy is a web worker, not a bigger number. That stands; the problem is what the assertion measures. On a contended host it was observed at 302ms, then 837ms, then 1297ms across three consecutive runs, and inside a full run — where Vitest saturates every core with 130 parallel files — even the fastest of three CPU-time samples came out at 468ms, against ~100ms in isolation.',
            'So the budget moved rather than moved up. It now lives in simEngine.perf.test.ts, still under 250ms, with a warm-up run and the fastest of three samples so a JIT pause or stray GC cannot decide it; vitest.perf.config.ts runs those specs alone with file parallelism off, via npm run test:perf. ChangelogPanel was the other casualty of the same contention — its 15s timeout sufficed in isolation but not in a full run, where it was seen taking 22s. Raised to 60s: changelog-data.ts renders 60+ real version entries, so the test is genuinely slow rather than unreliable, and a timeout catches a hang rather than asserting a speed.',
          ],
        },
        {
          sha: '70d4ff8',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Two Vitest config defects in frontend and public-site',
          details: [
            'setupFiles was resolved against the process cwd rather than the config file, so the single-file command documented on the testing page — npx vitest run --config packages/<pkg>/vite.config.ts <pattern> — failed from the repo root with "Cannot find module \'/@id/.../src/test/setup.ts\'", and worked only from inside the package. Resolving it through fileURLToPath(new URL(..., import.meta.url)) makes both invocations work.',
            "coverage.reportOnFailure is now set in both packages. Vitest's default is to skip writing the coverage report when any test fails, which loses the figures exactly when a run goes red — the frontend numbers on the testing page had to be captured with --coverage.reportOnFailure=true as a manual precaution.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.19',
      status: 'Released',
      date: '18 aug 2026',
      scope: ['frontend', 'backend', 'public-site'],
      commits: [
        {
          sha: '5445c7c',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'DMN source files are downloadable from the public rule catalogue',
          details: [
            "The public site now joins LDE's published-DMN list onto the Regelcatalogus services and offers the DMN 1.3 XML as a download row in Technical details. A new getPublicDmnsByService() in lde.service fetches /v1/dmns for the RONL graph, groups by service URI, caches for five minutes and returns an empty map on failure so the catalogue still renders when LDE is unreachable -- the relative xmlUrl is resolved against the configured API URL rather than concatenated, which is what keeps /v1 from doubling. SPARQL_ENDPOINT is exported from regelcatalogus.service so LDE is queried against the same graph instead of a second copy of the URL.",
            'Regel items carry dmns only when LDE knows the service, so unmatched services render no download row at all. TechDetails takes an optional downloads prop and renders a "download DMN (xml)" row inside the key/value table, aligning the link with the other values; several DMNs for one service stack under one key. The link points straight at LDE, so the saved filename comes from its Content-Disposition, which uses the Operaton decision key -- where that key is a generated GUID (the HvA export) the download name differs from the title shown, accepted rather than worked around since the fix belongs at the source deployment.',
          ],
        },
        {
          sha: '4685069',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'E2E test reporting and cleanup UX improvements',
          details: [
            'The Operaton-history cleanup prompt asked once per business key created during a run, with no summary of how many were pending — an E2E run creating a dozen instances meant a dozen individual [y/N] prompts. Consolidated to one prompt listing every pending key and its count; the answer applies to all of them (clean all, or leave all pending for next time), never a partial state.',
            "Playwright's HTML report now opens in the browser automatically after every run instead of needing a follow-up command — its own printed 'npx playwright show-report' hint is computed relative to the test process's internal working directory (packages/frontend, set by npm workspace machinery), not the shell the command was actually typed in, so a copy-pasted hint could resolve to the wrong path entirely. Auto-opening sidesteps that whole class of confusion; a `test:e2e:report` script remains as a fallback for re-opening a past run without re-testing.",
          ],
        },
        {
          sha: '34c8ab4',
          author: 'Steven Gort',
          type: 'refactor',
          subject: "Sync the E2E test bundle's sub-process rename from linked-data-explorer",
          details: [
            "linked-data-explorer's e2e-fixtures bundle renamed its two sub-processes (TreeFellingPermitSubProcess -> TreeFellingPermitSubProcessE2E, ZorgtoeslagProvisionalSubProcess -> ZorgtoeslagProvisionalSubProcessE2E) to give the E2E fixtures their own Operaton process-definition keys, distinct from the general-purpose seeded examples that share the same underlying BPMN process id -- LDE's own process catalog otherwise conflates the two and can silently redeploy stale content. required-processes.ts and two E2E spec comments updated to match; the shell processes and RipR21Process are unaffected.",
          ],
        },
        {
          sha: '9813dd1',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            "Scope process start and start-form lookups to the process's real deployed tenant",
          details: [
            "startProcess and getDeployedStartForm scoped their tenant-scoped Operaton lookup to the requesting citizen's own tenant, which broke any process deployed under a fixed processing-authority tenant regardless of caller (AwbZorgtoeslagProcess is always handled under toeslagen by design, callable by citizens of any tenant) -- the citizen's scoped lookup 404s, and the untenanted fallback also 404s now that Operaton deployments are tenant-mandatory.",
            "Fixed by discovering the process's actual deployed tenant first, via Operaton's unscoped list endpoint, and using that instead of assuming it matches the caller's own tenant -- falls back to the old behavior when the key can't be resolved (e.g. legacy untenanted processes), and correctly prefers a tenant-scoped deployment row over a coexisting legacy untenanted one for the same key.",
          ],
        },
        {
          sha: '7b50be7',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Verify the required tenant-scoped process bundle before running E2E tests',
          details: [
            "global-setup.ts only checked that the frontend/backend/LDE-backend dev servers were reachable, with no idea whether the right Operaton processes were actually deployed under the right tenant-ids -- a mismatch surfaced as a confusing failure deep inside an unrelated spec. Extended to query Operaton directly for the five processes this suite requires and fail fast with a clear, specific message (which key, which tenant, what to do about it) before any test runs, mirroring the existing 'start the dev stack yourself first' style. Verification only -- never deploys anything.",
          ],
        },
        {
          sha: 'c660957',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'Rename the RIP R2.1 process key from RipPhase1Process to RipR21Process',
          details: [
            "RipPhase1Process was a generic name that didn't self-describe which Faseladder stage it belongs to; RipR21Process matches the Faseladder's own R2.1 stage code directly, the same way every other RIP phase key is expected to. Renamed end to end: the shared RIP_PHASE_KEYS catalog, both backend query filters, the frontend's start action and display-name lookup, and every test asserting on the literal key -- historical changelog entries describing what actually shipped at the time are deliberately left untouched.",
          ],
        },
        {
          sha: '6837f09',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            'Fix a cross-tenant data leak in RIP phase deployment-status and instance counts',
          details: [
            "GET /v1/rip/phases/deployment-status and /v1/rip/phases/counts sit behind tenant middleware with the caseworker's tenant available, but queried Operaton with no tenant filter at all -- getPhaseInstanceCounts in particular counted every running instance of a process-definition key globally, across every tenant, which is almost certainly the exact mechanism behind an earlier-observed Portfolio/Faseladder discrepancy (a Cockpit-started instance with no attributing variable, counted in one view's total but invisible to the other's). Fixed by threading the caseworker's tenant through to Operaton's native tenantIdIn filter on both the definition-listing and the two count queries.",
          ],
        },
        {
          sha: '21fdb14',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Fix two more untenanted-key lookups: getBoardOwner and getDeployedStartForm',
          details: [
            'Two more OperatonService call sites assumed every process definition stays reachable via Operaton\'s untenanted /process-definition/key/{key}/... shorthand -- an assumption that breaks the moment a key is deployed with a tenant-id. getBoardOwner degraded silently (wrapped in a try/catch that treats any failure as "untagged"), quietly breaking the Beheer archive\'s board split; getDeployedStartForm threw outright, breaking the citizen-facing "start a new case" flow for any newly tenant-scoped process. Both now share the same tenant-scoped-then-fallback helper startProcess already established.',
          ],
        },
        {
          sha: '0d63fc7',
          author: 'Steven Gort',
          type: 'docs',
          subject:
            'Design and implementation plan: adopt tenant-mandatory deployment across the stack',
          details: [
            "Full spec and implementation plan for closing the two remaining tenant-scoping gaps in OperatonService (all 53 Operaton calls read and categorized), redeploying the five active process bundles under their correct tenants, and standing up a stable, single-source-of-truth E2E test bundle at linked-data-explorer/e2e-fixtures/<tenant>/ -- replacing two pre-existing, already-diverged 'examples' locations that carried real, proven drift. Includes a manifest-integrity test on the LDE side and a matching required-processes check in this repo's own E2E global-setup.",
            "Executed end to end against a real, live, two-tenant Operaton instance rather than unit mocks alone: two further genuine regressions were found and fixed only once real cross-tenant traffic and real tenant-scoped DMN resolution were exercised for the first time (a cross-tenant process-start lookup bug, and Operaton's DMN business-rule-task tenant resolution requiring an explicit camunda:decisionRefTenantId override for shared decision tables once the calling process itself becomes tenant-scoped) -- both confirmed via a live, throwaway empirical spike against Operaton before being applied for real, not documentation guesswork.",
          ],
        },
        {
          sha: '5042255',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Accessibility statement's focus-indicator claim corrected for form fields",
          details: [
            'The statement said every interactive element gets a 2px black + yellow focus indicator. That stopped being true for <input>/<select> the day after it was written: 2d44aee changed form-field focus to black + blue on request, but the statement was never updated -- confirmed against pub.css:82-89 (form fields, black+blue) versus pub.css:71-76 (links/buttons, still black+yellow, unaffected). Reworded to state both cases accurately rather than reverting the CSS, since the blue was a deliberate, requested change.',
          ],
        },
        {
          sha: '8176f04',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            "startProcess tries Operaton's tenant-scoped start endpoint before the untenanted one",
          details: [
            "The original fix motivating this whole release: RipPhase1Process (now RipR21Process) is deployed with Operaton's native tenant-id, which made it invisible to the untenanted /process-definition/key/{key}/start shorthand this method exclusively used before -- Operaton only resolves that endpoint against definitions deployed with no tenant-id at all. Starting the process from the app's own Beheer -> R2.1 -> Starten flow failed with \"is niet gevonden\", even though the Faseladder's separate, unaffected deploy-status check correctly showed it as deployed.",
            "Fix: try the tenant-scoped start endpoint first, and fall back to the untenanted one only on Operaton's specific 'no matching process definition' response -- every process deployed before this point (and anything outside LDE's mandatory-tenant-id deploy flow) still has no tenant-id at all, so the fallback keeps those working unchanged.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.18',
      status: 'Released',
      date: '14 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '38534c4',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Scope the persisted playback day per caseworker',
          details: [
            'The simulation restored both scenario parameters and the current playback day from one shared localStorage key on every reload — so a caseworker opening the page for what felt like the first time could land on a fully-played-through simulation (day 719/719) left behind by an earlier visit, in that browser or by someone else.',
            "Split persistence: scenario parameters stay under the existing shared key — there's no per-user meaning to a set of sliders. The playback day now lives under a key scoped by the caseworker's stable Keycloak sub. A different caseworker — or the same one signed in for the first time — always starts at day 0; each caseworker keeps their own position across their own reloads. True per-login-session reset would need a session identifier this codebase doesn't currently expose anywhere; out of scope here.",
          ],
        },
        {
          sha: '8f72497',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Rename the Regelsimulatie rail item to Subsidie thuisbatterij',
          details: [
            "The rail label 'Regelsimulatie' named the section type, not the specific scheme it shows. Since the Simulatie mode is deliberately built to hold more than one simulation later, the rail item needs the specific scheme's name so a second simulation doesn't collide with an equally generic sibling label.",
            "Renamed the rail item and the in-page breadcrumb (previously a separate hardcoded string) to 'Subsidie thuisbatterij' for consistency. The page's own h1 and the internal section id are unchanged.",
          ],
        },
        {
          sha: 'a73c14a',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            'Apply final review fixes: slider freeze, accessible labels, format/clamp corrections',
          details: [
            "The final whole-branch review found a genuine multi-second main-thread freeze while dragging a parameter slider at settings the UI itself exposes (population near its max, RFI chance near its max) — each drag step fired a full engine run synchronously. Fixed by decoupling a slider's visual position from when its value actually commits (on release, not on every step).",
            'Also added the type="button" attribute and accessible slider labels the design spec required but two tasks had each partially missed, corrected a silent trailing-zero formatting divergence from the reference, clamped a restored-from-storage scenario value to its slider\'s declared range, and corrected the SDD ledger\'s own reasoning about a performance-test flake it had wrongly called pre-existing.',
          ],
        },
        {
          sha: 'f841591',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Wire Regelsimulatie into the V2 shell',
          details: [
            'Added the Simulatie mode (between Zoeken and Beheer), a Regelsimulatie rail item gated behind two independent access-control checks (a per-item auth requirement and a separate tenant-visibility gate), the SectionRouter dispatch line, and the CSS import.',
          ],
        },
        {
          sha: '451dc7c',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the RegelSimulatie section component',
          details: [
            'The section shell tying the engine and every sub-component together: the header, the collapsible scenario-parameter panel (15 sliders), the playback control bar, and the two-column card layout. Recomputes the simulation only when a parameter actually changes, never while scrubbing the timeline.',
          ],
        },
        {
          sha: 'de8879b',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add SimMissedPanel',
          details: [
            "The 'Geldige aanvragen die misliepen' panel: three filters (RFI priority-shift, successful appeal, all unpaid) over a per-application timeline showing submission, processing, the optional information-request pause, and the decision.",
          ],
        },
        {
          sha: 'b2a6f3e',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add SimChart',
          details: [
            'The saw-tooth budget-over-time chart, hand-rolled SVG with no charting library: free vs. reserved budget, split and merged pot phases, exhaustion markers, and the current-day indicator.',
          ],
        },
        {
          sha: '4bc3402',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Move Regelsimulatie's formatters into their own module",
          details: [
            "simEur()/simEurK() lived in SimPot.tsx alongside its component export, which breaks Vite's react-refresh assumption that a component file exports only components. Extracted both into a dedicated simFormat.ts.",
          ],
        },
        {
          sha: '304be78',
          author: 'Steven Gort',
          type: 'feat',
          subject: "Add Regelsimulatie's presentational primitives",
          details: [
            'SimPot (one budget pot bar), SimOutcomeRow (one outcome bar row), and SimTweak (one parameter slider) — the small, reusable pieces the section component assembles.',
          ],
        },
        {
          sha: 'b4ce84e',
          author: 'Steven Gort',
          type: 'feat',
          subject: "Port Regelsimulatie's styling",
          details: [
            'The dedicated stylesheet ported unchanged, scoped under the existing .cwd-v2 design tokens — no new colors.',
          ],
        },
        {
          sha: 'ed13bae',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Disclose and test the beroepDisplacerId effDay deviation',
          details: [
            "Review found the port's appeal-displacement attribution logic (which appeal \"displaced\" a given application) uses a real field where the reference compares against a field that's never actually set on the object type involved, making that branch permanently dead code there. The port's version is more correct — it can pick the nearest-preceding appeal winner instead of always the pool's overall minimum — and was confirmed with the project owner as the intended behavior, not a bug to revert. It only affects which application id is shown in one caption; no totals or payment outcomes depend on it. Added a disclosure comment and a test that proves the two strategies actually diverge.",
          ],
        },
        {
          sha: '9c3d7ea',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the Regelsimulatie engine',
          details: [
            "A deterministic, pure TypeScript port of the Flevoland home-battery subsidy's budget-exhaustion simulation: entitlement rules, amount calculation, split/merged budget pools with a 1 October boundary and year-to-year carry-over, first-come-first-served allocation with no back-fill once a pool seals, and two counterfactual re-runs isolating how much of the unpaid total is attributable to an information-request delay versus a successful appeal.",
            '22 tests cover determinism, amount boundaries, entitlement precedence, resolver sealing and priority ordering, full-run bookkeeping invariants, the budget-year-is-submission-year rule, both counterfactuals, and a performance budget (under 250ms for the default 3,150-application population).',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.17',
      status: 'Released',
      date: '14 aug 2026',
      scope: ['public-site'],
      commits: [
        {
          sha: 'ad46260',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Correct the RIP pipeline stage note about rule sets per competent authority',
          details: [
            "The 'Verifiëren & live' pipeline stage's note said the citizen sees one environment behind which are always two rule sets from two competent authorities. Corrected to 'one or more rule sets from corresponding competent authorities' — not every deployment involves exactly two authorities.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.16',
      status: 'Released',
      date: '13 aug 2026',
      scope: ['public-site'],
      commits: [
        {
          sha: '4bebd24',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Scroll the trail bar into view when the displayed concept changes',
          details: [
            "Selecting a concept in the list, drilling into a chip, clicking a trail segment, or Begin opnieuw can all change which concept's trace is shown without the page scrolling — if the user was scrolled down into a long trace, the new concept's own trail bar and header could land off-screen with nothing visible telling them what changed.",
            "Extracted the jump buttons' existing scroll-to-id helper into a shared herkomstScroll.ts, and HerkomstExplorer now calls it on every concept change (skipping the initial mount, since there's nothing to scroll to yet).",
          ],
        },
        {
          sha: '53f2cdb',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Correct three legal citations in the Herkomst content',
          details: [
            'Leeftijd: the Wet op de zorgtoeslag citation was art. 1 lid 1 onder b, corrected to onder c.',
            "BSN: wet.tekst was a paraphrase; replaced with the exact statutory text of Wet algemene bepalingen burgerservicenummer art. 8 lid 1 (who assigns a BSN, and when), with the bron citation corrected from art. 1 to art. 8 lid 1 and the '— parafrase' suffix dropped since it's now an exact quote.",
            "Datum berekening: wet.tekst was likewise a paraphrase; replaced with the exact 'berekeningsjaar' definition from Algemene wet inkomensafhankelijke regelingen art. 2 Definities, lid 1 onderdeel b, with bron corrected accordingly. All three citations provided by the content owner.",
          ],
        },
        {
          sha: 'e3edffe',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Prerender /herkomst its own static HTML file',
          details: [
            "/herkomst was in the sitemap urls array but had no writeRoute() call, unlike every other route with real content (berichten, nieuws, producten, regels, processen) — so a crawler or link-preview scraper that doesn't execute JS got the homepage's title/description via Azure's SPA navigationFallback instead of Herkomst's own.",
            "Title, description and a crawlable summary are sourced directly from the page's own content module (herkomstData.ts, herkomstConcepts.ts) so the prerendered summary stays in sync with Herkomst.tsx automatically. Verified against a real build:acc output.",
          ],
        },
        {
          sha: '24b535a',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Scope the social card's og:url/og:image to the actual deploy origin",
          details: [
            "index.html hardcodes og:url and og:image to the production domain (publiek.open-regels.nl), since a static file can't know its own deploy target. On ACC that pointed the image at a domain that isn't deployed yet, so link-preview scrapers (WhatsApp confirmed) fetched a dead URL and silently dropped the image.",
            'Root-caused with direct evidence: publiek.open-regels.nl/og-open-regels.png returns nothing (domain not live), while acc.publiek.open-regels.nl/og-open-regels.png returns 200. Fixed by reusing the SITE_ORIGIN map prerender.ts already has for the canonical link, rewriting both meta tags to the correct origin once per build so every prerendered route inherits the fix.',
          ],
        },
        {
          sha: '27e34b8',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Move nextTrail to its own module, fix react-refresh warning',
          details: [
            "HerkomstExplorer.tsx exported both a component (default) and a plain function (nextTrail), which breaks Vite's react-refresh assumption that a component file only exports components — surfaced as an eslint react-refresh/only-export-components warning that npm run format doesn't catch.",
            'Moved nextTrail to its own herkomstTrail.ts module with its own test, matching the pattern herkomstConcepts.ts/herkomstData.ts already established for non-component logic in this feature.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.15',
      status: 'Released',
      date: '12 aug 2026',
      scope: ['public-site'],
      commits: [
        {
          sha: '5b86857',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the Open Graph / Twitter social card',
          details: [
            "Sitewide og:*/twitter: meta tags in index.html plus the 1200×630 og-open-regels.png asset, per the design handoff's social card addition. Resolves both deploy caveats the handoff flagged up front rather than leaving them as placeholders: og:url and og:image are absolute, using the real production domain (publiek.open-regels.nl) instead of the prototype's placeholder.",
            'Confirmed sitewide, not per-page, is correct: the prerender script only ever swaps <title>/<meta name="description">, never touches og:*/twitter: tags, so every prerendered route already carries the same card.',
          ],
        },
        {
          sha: '9d920d3',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Apply final-review fixes: ARIA roles, sitemap registration, breadcrumb nav',
          details: [
            'The final whole-branch review of the Herkomst feature found three real gaps a task-scoped review could not have caught: the deliberate accessibility improvement (associating track headers with their cells) was implemented via aria-labelledby on plain divs, which ARIA prohibits on the role=generic a bare div computes to — so it likely never reached assistive tech; fixed by adding role="group" to all eight cells. /herkomst was never registered in the sitemap/prerender pipeline, since no task had that file in scope. And the drill-down trail was a bare div where the spec required a real breadcrumb nav landmark.',
          ],
        },
        {
          sha: '17e4295',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the Herkomst page, route and nav item',
          details: [
            'Wires the six previously built components into an actual page at /herkomst: the page shell (breadcrumb, page head, jump links to the background sections), the route in App.tsx, the nav item after Gegevenswoordenboek, and a HERKOMST_PATH constant mirroring the existing WOORDENBOEK_PATH pattern.',
          ],
        },
        {
          sha: 'e15c9c0',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Test the trail's no-op guard directly, not via the UI",
          details: [
            'Test 7 clicked the nav list button as its second action (setTrail([id])), not a chip drill-down (open(id)), so it exercised the wrong code path and would still pass with the no-op guard deleted. No concept in herkomstConcepts.ts self-references, so the guard is unreachable via any real UI click sequence. Extracted the trail-update logic as an exported pure function (nextTrail) and unit-tested it directly instead.',
          ],
        },
        {
          sha: '950d00c',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add HerkomstExplorer',
          details: [
            "The concept list, drill-down trail and trace panel, tying the feature's pieces into one interactive view. Owns the trail state: selecting a concept in the list resets it, drilling into a chip pushes onto it (a no-op if you're already on that concept), trail segments truncate to that depth, and Begin opnieuw resets to the first concept.",
          ],
        },
        {
          sha: 'd965ce1',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add HerkomstBackground',
          details: [
            'The grey background band below the trace: the four-stage pipeline, the (a)/(b)/(c) concept chain with its catalogue band and connector strip, and the open/gesloten standards list.',
          ],
        },
        {
          sha: 'c3f8d7c',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add HerkomstTrace',
          details: [
            'The feature\'s core component — the eight-step, two-track provenance grid tracing a concept from quoted legal text (Wet- & Regelgeving) to the question a citizen sees on screen (Gebruikers), row-aligned step for step. Handles both chain-end cases: concepts with no DMN render an explanatory fallback line, and concepts with nothing left to derive from render "einde van de keten" instead of chips.',
          ],
        },
        {
          sha: '52bdb76',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add HerkomstChip',
          details: [
            'The clickable concept chip used throughout the trace and explorer — either a button that drills into another concept, or a plain, non-interactive leaf chip carrying its own inline definition.',
          ],
        },
        {
          sha: 'fc95b60',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Fix a CSS scoping gap in the ported Herkomst styles',
          details: [
            "The task brief covered renaming the reference stylesheet's .k- hyphenated component classes but not its .k -scoped (space, descendant-combinator) rules. Two of those slipped through unscoped: bare global h1-h4/p selectors duplicating the site's existing .pub h1/.pub p rules, and a global .pub-nav a override that collided with the real site's actual navigation styling — the source rules were the reference prototype's own internal preview-shell nav, unrelated to anything this feature builds. Fixed by scoping the heading/paragraph rules under a new .pub-herkomst-k page-root class and deleting the four unused nav rules entirely.",
          ],
        },
        {
          sha: '0348d5c',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Port the Herkomst styling into pub.css',
          details: [
            "Ported the reference design's dedicated stylesheet into the site's single shared pub.css, renaming every .k- class prefix to .pub-herkomst- to match this codebase's naming convention — no rule dropped, no value changed.",
          ],
        },
        {
          sha: 'a08b4fa',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the Herkomst content data modules',
          details: [
            "The provenance graph (four concepts — Leeftijd, Geboortedatum, Datumberekening, BSN — each with its quoted legal text, annotation, rule, DMN expression and citizen-facing copy) and the page's chrome strings, ported byte-identical from the design handoff's hand-authored reference content. Fidelity independently verified via a field-by-field deep-equal check against the source files, not just visual proofreading.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.14',
      status: 'Released',
      date: '12 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '7931ba5',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Fix Rollup's CJS interop so production builds actually process @ronl/shared",
          details: [
            "optimizeDeps.include (added earlier for the dev-server case) only affects vite dev's esbuild pre-bundler. vite build goes through Rollup directly, which by default only runs CommonJS→ESM interop on node_modules/**. @ronl/shared resolves to a relative workspace path (../shared/dist), so Rollup parsed it as plain ESM, found no literal 'export' keyword, and reported every named value import (RIP_PHASE_KEYS) as not exported — this only ever surfaced once vite build --mode acceptance actually ran in CI, since local dev used the already-fixed dev-server path.",
            'Verified: both build:acc and build:prod now succeed, and the emitted bundle actually contains the RIP phase data.',
          ],
        },
        {
          sha: 'c846d02',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Fix ChangelogPanel's version-button matcher for double-digit CalVer patches",
          details: [
            "A bare .includes() version match became ambiguous once double-digit CalVer patches existed — v2026.08.1 is a string-prefix of v2026.08.10 through v2026.08.13, so clicking one version's button could resolve to the wrong entry. Fixed with a versionButtonName() helper using a negative-lookahead regex to require an exact patch-number boundary.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.13',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '53beb82',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Gitignore the design-handoff reference folders',
          details: [
            'docs/infra-beheer-handoff/ and docs/infra-beheer-handoff-v2/ are local reference material for porting the RIP Beheer design into the app, not meant to be committed to the repo — same treatment as the existing publiek-handoff/ folder.',
          ],
        },
        {
          sha: '36121e6',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            'Gate the new rail stats behind login, close a role-gate test gap, add two missed CSS rules',
          details: [
            'The new Mijn dag/Portfolio/Beheer rail stats were rendering for anonymous visitors — an unauthenticated visit to the Infra-board showed live-looking project numbers beside a "please log in" main pane. Fixed by gating all four rail-stat blocks behind login, matching how the rest of the shell already behaves.',
            "Also added a regression test for the phase items' team-role gate (moved into hand-written rendering in this same release, with no test covering it until now), and ported two CSS rules the original design port had missed: Portfolio's smaller, column-aligned phase-code chip, and breathing room between long phase names and their count badge.",
          ],
        },
        {
          sha: 'c712deb',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Group Beheer's rail phase items by stage, matching Portfolio",
          details: [
            "Comparing the deployed app against the design screenshots showed Beheer's phase list in the rail was still one flat list, missing the R2–R6 stage headers Portfolio's rail already had. Regrouped to match the design exactly, with Faseladder and Archief as their own entries before and after the five stage groups.",
          ],
        },
        {
          sha: '63cea04',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Wire Mijn dag/Portfolio/Beheer rail stats into the app shell',
          details: [
            "The app shell's left rail previously only rendered navigable links. It now shows real numbers per mode: Mijn dag gets Taken vandaag / Urgent-te laat / Mijn projecten counts, Portfolio gets stage-grouped phase counts plus Overgangen (Wacht op start) and Gezondheid (groen/geel/rood) breakdowns, and Beheer's phase items gain WIP/geparkeerd count badges and a muted style for phases that aren't deployed yet.",
          ],
        },
        {
          sha: '83d8c70',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Drop Portfolio\'s static "Alle projecten" rail link',
          details: [
            'Portfolio\'s rail is now stats-only, matching the design — the single "Alle projecten" nav item is gone. The top-nav Portfolio tab still routes there directly.',
          ],
        },
        {
          sha: 'a3a90dc',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the rail-stats module',
          details: [
            "New pure-function module computing each mode's rail content from already-fetched mock and live data, with no fetching of its own — the same pattern every other Infra-board component already uses to source live data.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.12',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: 'b72b1be',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            'Restore the "Wat er gebeurt bij starten" card\'s numbered list and label/value styling',
          details: [
            "Tailwind's Preflight base reset strips list-style and margin/padding from every ol/ul app-wide. The Beheer phase detail's side panel never got counter-restoring CSS for its numbered steps and definition list, so it silently rendered as plain unnumbered running text instead of the design's numbered list and label/value rows.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.11',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '36f53b9',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Retire the old six-phase project model',
          details: [
            'Removed the superseded six-phase PHASES model and the phaseLabels prop that threaded it through Portfolio, Mijn dag and the project stepper, now that all three render off the real twelve-phase RIP ladder.',
          ],
        },
        {
          sha: 'a1c3867',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Move the project detail stepper onto the real RIP ladder',
          details: [
            "The project detail page's phase stepper now renders all twelve real RIP phases (R2.1–R6.1) instead of the old six mock phases.",
          ],
        },
        {
          sha: '5cd4f1f',
          author: 'Steven Gort',
          type: 'feat',
          subject: "Show the real RIP phase on Mijn dag's project cards",
          details: [
            'Mijn dag\'s "Mijn projecten" cards now show each project\'s real current RIP phase instead of the old mock phase label.',
          ],
        },
        {
          sha: 'e944f67',
          author: 'Steven Gort',
          type: 'feat',
          subject: "Move Portfolio's Gantt and Kanban onto the real RIP ladder",
          details: [
            "Portfolio's timeline and per-fase board now iterate the real twelve-phase catalogue, grouped by stage, instead of the old six-phase mock model.",
          ],
        },
        {
          sha: 'fcffd52',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Rebuild the mock Gantt and status model on the twelve-phase ladder',
          details: [
            "Portfolio's mock project data now spans all twelve real phases, with stage-grouped durations and a deterministic status model, replacing the old flags-override mechanism.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.10',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '3103d94',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Build out the R5.3 "Geparkeerde projecten" page',
          details: [
            'The R5.3 placeholder in Beheer now lists the projects currently parked at that phase, with health and a link back to each project.',
          ],
        },
        {
          sha: 'd3927e4',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the parked-projects list selector',
          details: [
            "New getMockGeparkeerdRows selector backing the R5.3 placeholder's parked-projects list.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.9',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '7df1e1b',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Fix Faseladder/PhaseDetail tests for the twelve-phase catalogue',
          details: [
            'Updated tests to match the grown catalogue — R5.2 is now a real modelled phase, R5.3 is the new unmodelled placeholder.',
          ],
        },
        {
          sha: '1bb693c',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'Drop the legacy-phase ladder indirection',
          details: [
            'Mock projects now hash directly across all twelve real phases instead of going through the old legacy-bucket lookup table.',
          ],
        },
        {
          sha: 'd2377b5',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Grow the RIP phase catalogue to twelve phases',
          details: [
            'The RIP phase ladder grew from 9 phases across 4 stages to 12 phases across 5 stages (R2.1–R6.1), matching an updated design handoff. R5.2 became a real modelled phase (Directievoering en toezicht); R5.3 is the new unmodelled placeholder.',
          ],
        },
        {
          sha: '9b9b935',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Grow the shared RIP phase key list to twelve phases',
          details: [
            'The frontend/backend-shared RIP_PHASE_KEYS list grew to match the twelve-phase catalogue.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.8',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '0c65538',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Route the WIP/Gereed tabs through proper loading, error and empty states',
          details: [
            'The Beheer phase detail\'s WIP and Gereed tabs now go through the hook layer with real loading/error/empty states and a retry option, compute live "Producten" document progress, complete the Gereed tab\'s summary line, and refetch automatically after starting a new instance.',
          ],
        },
        {
          sha: '911dceb',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'Dedupe mock WIP/Gereed row selection',
          details: [
            'Mock WIP/Gereed row selection moved into infra-board.data.ts and deduplicated against the existing phase-counts logic, so the two stay in sync.',
          ],
        },
        {
          sha: '79c9e20',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the completed-instances hook',
          details: ["New usePhase1Completed hook feeding the Gereed tab's live rows."],
        },
        {
          sha: '5d44977',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Fix a false "blocked" status on a project\'s first pass through a step',
          details: [
            'The WIP tab could flag a running instance as blocked after its very first pass through a step, even with no rework loop — fixed to only flag blocked when the running activity has genuinely executed more than once.',
          ],
        },
        {
          sha: '3c09d6c',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Retire the old WIP/Gereed sections from the caseworker dashboard',
          details: [
            'RipFase1WipSection and RipFase1GereedSection are superseded by the new Beheer phase detail tabs.',
          ],
        },
        {
          sha: '5cdda13',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Fix a missing key on the Gereed tab's live rows",
          details: [
            "The Gereed tab's live-row map used a shorthand fragment, which can't carry a key prop — switched to an explicit keyed Fragment.",
          ],
        },
        {
          sha: 'f5b0e40',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the Gereed tab',
          details: [
            'New Gereed tab on the Beheer phase detail page, showing real R2.1 instances alongside mock rows.',
          ],
        },
        {
          sha: '1d8d1bd',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the WIP tab',
          details: [
            'New WIP tab on the Beheer phase detail page, showing real R2.1 instances alongside mock rows.',
          ],
        },
        {
          sha: '878c394',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add mock WIP/Gereed row data',
          details: [
            "New getMockPhaseInstanceDetail selector backing the WIP/Gereed tabs' mock rows.",
          ],
        },
        {
          sha: 'dab0c73',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add real R2.1 WIP-step derivation',
          details: [
            "New getWipStepInfo and countReworkLoops helpers deriving a running R2.1 instance's current step and rework count from its activity history.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.7',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend'],
      commits: [
        {
          sha: '0cc1ff3',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Style the Starten tab's buttons properly",
          details: [
            'The two start buttons and the sequence-guard toggle rendered as unstyled native buttons — applied the existing v2-btn/v2-btn-ghost styles.',
          ],
        },
        {
          sha: '9ec0365',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Wire the phase detail page into the rail, router and Faseladder',
          details: [
            'Clicking a phase row in the Faseladder now opens its phase detail page; the rail and section router both know how to reach it.',
          ],
        },
        {
          sha: 'a29174e',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the phase detail header, side panel and Starten tab',
          details: [
            'New PhaseDetail page: header, side panel and a Starten tab for beginning a new instance. Retired the old RipFase1Section, including a dead import, dispatch branch and rail item that were still referencing it.',
          ],
        },
        {
          sha: 'ff7f57f',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add ready and out-of-sequence project selectors',
          details: [
            "New getReadyProjects/getOutOfSequenceProjects selectors backing the Starten tab's eligibility checks.",
          ],
        },
        {
          sha: '444f8f4',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add kredietBeslisser to the phase catalogue',
          details: ['Each phase that requires a krediet decision now names who decides it.'],
        },
        {
          sha: 'a2eeb21',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Correct the Gereed direction and Faseladder KPI semantics',
          details: [
            "Verified against the design handoff's screenshots: the gereed condition was checking for projects before a phase instead of past it, feeding wrong figures into every downstream Klaar calculation — fixed and cross-checked every phase against the reference, exact match.",
            '"Fasen in uitvoering" now shows total WIP across all phases rather than a phase-count capped at 9; "Klaar om te starten" now totals Klaar across every non-beyond phase; zero-value Klaar cells render "—" consistently; the WIP column is relabelled "WIP / Geparkeerd" and shows geparkeerd counts for beyond phases.',
          ],
        },
        {
          sha: 'b821a59',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Fix a blank white page from an unbundled @ronl/shared import',
          details: [
            "@ronl/shared compiles to CommonJS for its Node/backend consumer. Vite doesn't apply CJS→ESM interop to workspace-linked packages unless they're in its dependency optimizer, so the first genuine runtime value import from it (RIP_PHASE_KEYS) failed at runtime with no build-time error — a blank white page. Added @ronl/shared to Vite's optimizeDeps.include.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.6',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend', 'backend'],
      commits: [
        {
          sha: '3fd36f6',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Wire the Faseladder overview into the rail, router and command palette',
          details: [
            'The Beheer Faseladder overview is now reachable from the rail, the section router and the ⌘K command palette.',
          ],
        },
        {
          sha: '78ac4dc',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the Faseladder overview',
          details: [
            'New Beheer landing page: one row per RIP phase, grouped by stage, with live/mock combined counts and deploy status.',
          ],
        },
        {
          sha: 'c014862',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add live phase-counts API and hook',
          details: [
            "New businessApi.rip.phasesCounts call and useLivePhaseCounts hook feeding the Faseladder overview's live WIP/Gereed figures.",
          ],
        },
        {
          sha: '9a36e47',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Expand the mock portfolio to 42 projects',
          details: [
            'Mock portfolio data grew to 42 projects and gained the RIP ladder fields the Faseladder overview needs.',
          ],
        },
        {
          sha: '1e38f1b',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the Klaar formula and mock/live combining logic',
          details: [
            'New rip-phase-counts module: the "Klaar" (ready-to-start) formula per phase, and a combinePhaseCounts helper merging mock and live counts with the live subset kept alongside for annotation.',
          ],
        },
        {
          sha: '21f81d2',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add GET /v1/rip/phases/counts',
          details: ['New backend endpoint returning live per-phase WIP/Gereed instance counts.'],
        },
        {
          sha: 'fc7745f',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add live phase-instance counting to the Operaton service',
          details: [
            'New OperatonService.getPhaseInstanceCounts backing the phase-counts endpoint.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.5',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['frontend', 'backend'],
      commits: [
        {
          sha: '898e4c0',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add deployment-status API and hook',
          details: [
            'New businessApi.rip.deploymentStatus call and useDeployedProcessKeys hook, telling the RIP catalogue which phases are actually deployed on this environment.',
          ],
        },
        {
          sha: '04d6e42',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the RIP phase catalogue and deploy-status computation',
          details: [
            'New rip-phases.catalog module: the RIP phase/stage data plus a getPhaseDeployStatus helper (gedeployed / ontwerp / onbekend) used across the Beheer surface.',
          ],
        },
        {
          sha: 'ade3050',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add GET /v1/rip/phases/deployment-status',
          details: [
            'New backend endpoint reporting which RIP process-definition keys are currently deployed.',
          ],
        },
        {
          sha: '1ad473d',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add deployed-process-key lookup to the Operaton service',
          details: [
            'New OperatonService.getDeployedProcessKeys backing the deployment-status endpoint.',
          ],
        },
        {
          sha: '6c46327',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Add the RIP phase to process-definition-key mapping',
          details: [
            'New shared mapping from RIP phase codes to their Operaton process-definition keys, the single source of truth for which phases have a real process behind them.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.4',
      status: 'Released',
      date: '10 aug 2026',
      scope: ['backend'],
      commits: [
        {
          sha: '109b136',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Friendlier error when starting a process with no deployment',
          details: [
            "Starting a RIP Fase 1 instance against an environment where the process isn't deployed now shows a clear, specific message instead of a raw engine error.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.3',
      status: 'Released',
      date: '7 aug 2026',
      scope: ['public-site'],
      commits: [
        {
          sha: 'c86588a',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Footer shows the environment site URL and current release version',
          details: [
            "The footer's site line was hardcoded to publiek.open-regels.nl (prod) on every environment. It's now driven by a per-environment VITE_SITE_URL — dev shows localhost:5175, ACC acc.publiek.open-regels.nl, prod publiek.open-regels.nl — rendered as a link to that origin.",
            'It also shows the current release: the public-site package version, injected via a Vite `define` (__APP_VERSION__), so it always matches the latest public-site changelog entry.',
          ],
        },
        {
          sha: 'e21f086',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Remove the stray borders around the search facet groups',
          details: [
            "The Verfijn filter groups (Soort / Bron / Voor wie) are <fieldset>s, but their CSS only set a bottom separator and never reset the browser's default fieldset box border — so each rendered inside a grooved border with a notch around its legend. Reset the fieldset defaults so only the intended separator shows.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.2',
      status: 'Released',
      date: '7 aug 2026',
      scope: ['public-site'],
      commits: [
        {
          sha: '45fb9cd',
          author: 'Steven Gort',
          type: 'other',
          subject: 'Section pages seed from prerendered data, like the Regelcatalogus',
          details: [
            'The Berichten, Nieuws, Producten & Diensten and Procesbibliotheek pages now seed their list from data the prerender embeds per route, instead of rendering a "Laden…" placeholder and then fetching. Content is present on first client render — no loading flash that grows in and shifts the footer (the same CLS the /regels fix removed).',
            'The raw→PublicHit mapping is extracted from SectionIndex into a shared mapToHits() so the prerender and the page produce identical items from one source; a cold load with no embedded blob still fetches through it.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.1',
      status: 'Released',
      date: '7 aug 2026',
      scope: ['backend', 'public-site'],
      commits: [
        {
          sha: '2d44aee',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Blue focus ring on public-site form fields instead of the yellow',
          details: [
            'The search boxes and the Regelcatalogus dienst-filter dropdown showed a thick yellow focus ring (the Rijkshuisstijl --ro-focus token). Swapped it for the brand blue (--ro-link) on input/select :focus-visible, keeping the 2px dark outline plus a 4px ring so keyboard focus stays clearly visible — WCAG 2.4.7 (Focus Visible) is preserved. Scoped to form fields; link and button focus styling is unchanged.',
          ],
        },
        {
          sha: '903ad06',
          author: 'Steven Gort',
          type: 'other',
          subject: 'Regelcatalogus seeds from prerendered data to cut the loading flash',
          details: [
            "The prerender emits a crawler-only HTML fragment that createRoot discards on the client; the Regelcatalogus page then rendered a short 'Laden…' placeholder and re-fetched, so content grew in after first paint and pushed the footer down — the layout shift behind the page's live CLS.",
            "The prerender now embeds each route's data as a JSON <script> (route-scoped, <-escaped) and the page seeds its state from it via a pure reader, skipping the initial fetch. The first client render already shows the full catalogue — no placeholder, no refetch round-trip.",
          ],
        },
        {
          sha: 'f15ffba',
          author: 'Steven Gort',
          type: 'test',
          subject: 'e2e suite can target a deployed URL',
          details: [
            'The Playwright config now honours an E2E_BASE_URL env var: when set, it runs the suite against that already-deployed site and skips starting the local dev server — used to verify the public site against the live ACC URL. Also gitignores the public-site Playwright output dirs, which had been missing.',
          ],
        },
        {
          sha: '2039ec1',
          author: 'Steven Gort',
          type: 'refactor',
          subject: 'Drop non-null assertions in searchPublicIndex',
          details: [
            'Capture filters.{types,orgs,audience} into const locals so TypeScript carries the ?.length narrowing into the filter closures, removing three @typescript-eslint/no-non-null-assertion warnings. Behaviour unchanged.',
          ],
        },
        {
          sha: 'c9c4d3f',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Regelcatalogus organisation logos now load',
          details: [
            "Org-card logos are <img>s served from the RONL knowledge-graph host (api.open-regels.triply.cc), but the public site's Content-Security-Policy img-src was \"'self' data:\" — so the browser blocked every logo and each card fell back to an initials badge. Added the host to img-src; guarded by a test that parses the shipped SWA config's CSP.",
          ],
        },
        {
          sha: 'cb92458',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'staticwebapp.config.json now ships in the build output',
          details: [
            'The SWA config lived at the package root, but the deploy workflow uploads only packages/public-site/dist with skip_app_build. Moved it into public/ so Vite copies it into dist — otherwise Azure never sees it and the deployed site gets no SPA navigationFallback (deep-link refresh 404s), no CSP/security headers, and no mimeTypes overrides.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.08.0',
      status: 'Released',
      date: '6 aug 2026',
      scope: ['backend', 'public-site'],
      commits: [
        {
          sha: 'cc6481d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Regelcatalogus tab state no longer resets on tab switch',
          details: [
            "Both the Rules tab's open service accordion and the Concepts tab's dienst filter dropdown lived in local component state, which React destroys whenever the tab's component unmounts. Lifted both into the parent Regelcatalogus component so a selection survives navigating to another Regelcatalogus tab and back. Also fixed the Rules tab defaulting to the first service open — it now starts fully closed.",
          ],
        },
        {
          sha: 'c93868d',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'PUBLIC_SHOW_WIP_PROCESSES — ACC-only escape hatch for the process library',
          details: [
            "Lets ACC preview 'wip' process bundles on the public site's process library, not just 'active' ones, so in-progress processes can be checked before they go live. Defaults to false; must stay off in production. Still gated on boardOwner (caseworker/untagged only) — this only widens the status check, not the board allow-list.",
          ],
        },
        {
          sha: '2f341cd',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Skosmos now allows framing from the caseworker app and the public site',
          details: [
            "skosmos.open-regels.nl imported basic_security_headers, which sets X-Frame-Options: DENY — blocking iframe embedding from every origin, including the caseworker app's Gegevenswoordenboek and the new public site's Woordenboek page. Replaced with a dedicated skosmos_security_headers snippet: drops the blanket X-Frame-Options and adds a CSP frame-ancestors allow-list scoped to the origins that actually embed it.",
          ],
        },
        {
          sha: '74a17ee',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Fixed horizontal jitter on public-site route navigation',
          details: [
            'Different pages have different content heights, so the vertical scrollbar was appearing/disappearing between routes, shifting the whole layout horizontally each time. scrollbar-gutter: stable on html keeps that space reserved at all times.',
          ],
        },
        {
          sha: '02613cf',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Organisation logos on the Regelcatalogus Organisaties tab',
          details: [
            "Not in the original design spec, but the data (CatalogOrganization.logo) was already being fetched and unused. Mirrors the caseworker's OrgCard: a logo box with object-fit:contain, falling back to a two-letter initials badge when there's no logo or the image fails to load.",
          ],
        },
        {
          sha: '525441d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Regelcatalogus accordion needed two clicks to switch services',
          details: [
            'Driving the exclusive accordion via <details open> + onToggle let the browser natively toggle each element; closing the previously-open one through the React-driven open prop re-fired a toggle event (Chrome does this on programmatic attribute changes too), which overwrote the just-clicked state back to nothing-open before the new one visibly opened. Now fully React-controlled via onClick+preventDefault on the summary.',
          ],
        },
        {
          sha: '118f436',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Drill down into individual rules on the Regelcatalogus Rules tab',
          details: [
            "Each rule row with a decision-logic description becomes a click-to-expand toggle, matching the caseworker RegelCatalogus's per-rule drill-down. Rules with no description stay plain text. Not in the original design spec — added per request during review.",
          ],
        },
        {
          sha: '065067d',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'public-site included in the root npm run dev',
          details: [
            'npm run dev from the repo root now starts backend, frontend and public-site together via concurrently, instead of just the first two.',
          ],
        },
        {
          sha: 'ba6b196',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Azure Static Web App deploy workflows for public-site (no auth routes)',
          details: [
            'azure-publicsite-acc.yml/-prod.yml mirror the frontend\'s branch-triggered SWA deploy pattern; staticwebapp.config.json has no routes/allowedRoles block at all, matching every other "no auth" requirement in this release.',
          ],
        },
        {
          sha: '134f506',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Automated bundle-cleanliness gate — fails the build on any auth/telemetry code',
          details: [
            'scripts/check-bundle.mjs scans every built .js file for forbidden strings (keycloak, msal, oidc-client, analytics libraries) and fails the build if any are found; wired into build/build:acc/build:prod as their last step.',
          ],
        },
        {
          sha: '7e33b51',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Prerendered public-site pages no longer duplicate the <meta description> tag',
          details: [
            "The prerender script's injectIntoShell was inserting a per-page description without removing the shell's generic one, so two description tags ended up in the document and the generic one (being first) won in most crawlers — defeating the point of a per-page description.",
          ],
        },
        {
          sha: '307ad0a',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Prerendering, sitemap.xml and robots.txt for public-site',
          details: [
            'A post-build step fetches real content via the same lib/api.ts the app itself uses and writes a static, crawlable HTML fragment per section/detail route into dist/, plus sitemap.xml and robots.txt — /zoeken and /woordenboek are excluded from the sitemap by design.',
          ],
        },
        {
          sha: '08261b6',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Backend CORS now allows public-site's dev server (:5175)",
          details: [
            "Discovered by the e2e suite's live run: the backend's default CORS allow-list (and .env.example template) never included the public-site package's dev port, so a fresh checkout following .env.example would have every fetch from the public site blocked by CORS in local dev.",
          ],
        },
        {
          sha: '5bf5c17',
          author: 'Steven Gort',
          type: 'test',
          subject: 'e2e: search journey, deep links, keyboard path, axe-core scans for public-site',
          details: [
            'Playwright suite covering search → filter → detail → back, a deep link with filters pre-applied, a keyboard-only path, and three axe-core scans (home/results/detail) — ran live against real backend data during review, 6/6 passing.',
          ],
        },
        {
          sha: '5e19f27',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Toegankelijkheid and Open Data pages',
          details: [
            'Static accessibility statement (WCAG 2.1 AA target, stated in both languages) and an open-data page listing the real /v1/public/* GET endpoints.',
          ],
        },
        {
          sha: '4feb206',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Woordenboek (Skosmos embed) and Detail pages',
          details: [
            'Woordenboek is a pure Skosmos iframe embed (title attribute, visible "open in new tab" fallback, src follows the language switch). Detail is the generic per-type detail page for all five content types, with a collapsed-by-default technical-details section and the exact GET /v1/public/... path for that item.',
          ],
        },
        {
          sha: 'e294f0f',
          author: 'Steven Gort',
          type: 'test',
          subject:
            'Stronger Regelcatalogus Rules-tab test — asserts DOM row count, not just title presence',
          details: [
            'The DoD-named "every service with count > 0 renders exactly count rule rows" assertion now counts actual <tr> elements in the DOM, not just that the expected titles are present somewhere — catches a stray/duplicate row a title-only check would miss.',
          ],
        },
        {
          sha: '10f7ca1',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Regelcatalogus page — Organisations / Services / Rules / Concepts tabs',
          details: [
            'Four-tab rule catalogue matching the caseworker version: Organisations (with logos), Services, Rules (accordion per service, count and list from the same query), Concepts (every row links out to Skosmos, no local detail page).',
          ],
        },
        {
          sha: '1867cd5',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'SectionIndex test fixture uses a valid non-null publishedAt',
          details: [
            "BerichtItem.publishedAt is typed as a non-nullable string (matching the real backend contract); a test fixture using null failed type-check even though Vitest itself doesn't type-check test files.",
          ],
        },
        {
          sha: '7388c86',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'SectionIndex page for berichten / nieuws / producten / processen',
          details: [
            "Generic per-section list page for the four content types that don't get their own dedicated page (regel has Regelcatalogus instead): fetches the section's native list endpoint, normalizes into the common Hit shape, supports a local text filter.",
          ],
        },
        {
          sha: 'd85be29',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Results page — federated search with URL-backed facets',
          details: [
            "Filter state (q/soort/bron/doelgroep/sort) lives entirely in the URL via useQueryState; facet counts come from the server response, computed on the query before that facet's own filter, so checking a box never makes its own count disappear.",
          ],
        },
        {
          sha: '58b5e26',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Routing shell, Home (variant B), NotFound and page stubs',
          details: [
            'App.tsx registers all 15 routes and syncs document.documentElement.lang to the language switch. Home is the search-bar-plus-card-grid variant (the only one built — the two other prototype variants are explicitly out of scope).',
          ],
        },
        {
          sha: 'cee1c85',
          author: 'Steven Gort',
          type: 'feat',
          subject:
            'Highlight utility and chrome components (nav, search, hit, facet, tabs, footer)',
          details: [
            'Twelve presentational building blocks every page assembles, plus highlight() — wraps query-term matches in <mark> via React node splitting, never dangerouslySetInnerHTML, matching only 3+ character terms.',
          ],
        },
        {
          sha: '0647ab2',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Detail-URL builder and URL-backed query state',
          details: [
            "hrefFor() builds the permanent per-type detail path for any search result; useQueryState wraps react-router's useSearchParams so a filtered result set is always a shareable link.",
          ],
        },
        {
          sha: '1d9d7f2',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Typed client for /v1/public/*',
          details: [
            'Every response type and fetch function the frontend pages use, with dual-runtime base-URL resolution (browser via import.meta.env, the Node prerender script via process.env) and a 404-vs-throw split between list and per-item lookups.',
          ],
        },
        {
          sha: '838b21a',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'i18n (NL/EN) and section metadata for public-site',
          details: [
            'Dutch/English translation dictionaries (structurally enforced to declare the same keys) and the five searchable section definitions — the data dictionary is deliberately excluded, it has no search type or detail route of its own.',
          ],
        },
        {
          sha: '47fb67c',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'pub.css port (media-query responsive) and main.tsx',
          details: [
            "Rijkshuisstijl tokens ported from the design prototype, cleaned up for production: mobile is plain @media rules (no preview-toggle class), and the prototype-only WCAG-annotation overlay and dropped Home variants' CSS were left out.",
          ],
        },
        {
          sha: '47fbd47',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'public-site package scaffold — Vite + React + TS, no auth deps',
          details: [
            'New workspace package, dev server on :5175. No keycloak-js, no @azure/msal, no @ronl/shared, no Tailwind — the bundle-cleanliness gate later in this release enforces that for good.',
          ],
        },
        {
          sha: 'd0e3506',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Guard test: /v1/public/* stays GET-only and unauthenticated',
          details: [
            'Introspects the real Express router (not a mock) so a future change adding a write verb or auth middleware to a content route fails this test immediately, rather than shipping unnoticed.',
          ],
        },
        {
          sha: '9d346df',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'New routes: /processen, /zoeken, and per-type :slug detail lookups',
          details: [
            "/zoeken's facet counts are computed on the query without that facet's own filter applied; all three :slug detail routes resolve through the same federated index the search itself uses, so the count and the list can never drift apart.",
          ],
        },
        {
          sha: '574a6f1',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Removed the publiek-handoff/ reference folder from tracking',
          details: [
            'Design-handoff reference material (prototype CSS/JSX, architecture doc) gets ported into the app but the folder itself is never committed, per repo convention — it had been swept in accidentally by an earlier commit.',
          ],
        },
        {
          sha: 'd363f89',
          author: 'Steven Gort',
          type: 'fix',
          subject: "sort:'date' in the federated search index is now actually chronological",
          details: [
            'The sort only partitioned dated vs. undated items rather than comparing actual date values, so within the "has a date" group items kept an arbitrary order — inherited from the original design prototype, caught by review before it shipped.',
          ],
        },
        {
          sha: 'ab5cab5',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Federated public search index (search.service)',
          details: [
            "Aggregates berichten, nieuws, producten, regelcatalogus services and LDE process bundles into one cached, server-side searchable index — replacing the design prototype's browser-side search, which doesn't scale past a few hundred items.",
          ],
        },
        {
          sha: 'a47cce4',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'LDE process-bundle proxy (lde.service)',
          details: [
            'Proxies the public process-bundle list from the LDE API, filtered to status active and boardOwner caseworker/untagged only — internal boards and non-active drafts stay caseworker-only.',
          ],
        },
        {
          sha: '79d8405',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Ignore .superpowers/ scratch directory',
          details: [
            'Progress ledgers and code-review packages generated during subagent-driven development are local scratch state, never meant to be committed.',
          ],
        },
        {
          sha: 'e6690f0',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'slugify utility for public detail routes',
          details: [
            'Deterministic, pure slug generation for rule-catalogue services (which have no natural short id) — used identically on both the backend (building the federated index) and the frontend (building the matching link), so the two can never disagree on a slug.',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '2026.07.0',
      status: 'Released',
      date: '23 jul 2026',
      scope: 'frontend',
      commits: [
        {
          sha: 'e6e8f97',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'bump-release adopts CalVer (YYYY.MM.patch) versioning',
          details: [
            "Released versions now use CalVer (e.g. 2026.07.0) instead of SemVer, matching the same adoption already done for the CPSV Editor and linked-data-explorer repos. The next version is computed from the current date's YYYY.MM prefix: patch increments on a same-month follow-up release, resets to 0 on the first release of a new month. This is a version-string convention only — no git tags, no other change to the release workflow. Historical SemVer entries in this changelog (3.9.6 and earlier) are left as-is; this is the first release cut under the new scheme.",
          ],
        },
        {
          sha: '009b9ba',
          author: 'Steven Gort',
          type: 'test',
          subject:
            'Tenant isolation spot-check + second deep journey (Zorgtoeslag) — found a concurrency bug and a cleanup-tracking bug',
          details: [
            "Adds e2e/tenant-isolation.spec.ts (Phase 1 item 5): test-citizen-unive submits a Zorgtoeslag claim via AwbZorgtoeslagProcess, which always runs under the toeslagen processing authority regardless of which channel the citizen came from. Confirms test-caseworker-flevoland cannot see the resulting task while test-caseworker-toeslagen can — task listing is genuinely tenant-filtered server-side, a real security boundary, not a guess. The original plan (test-caseworker-utrecht vs amsterdam) wasn't checkable: only Flevoland has real Operaton-backed task data right now.",
            "Adds e2e/zorgtoeslag-journey.spec.ts, a second deep journey for item 4 (same finalized-roundtrip pattern as the existing Kapvergunning journey), which surfaced a real concurrency bug: two spec files creating identically-named tasks for the same caseworker raced across parallel workers, one grabbing the other's task mid-flight and causing a genuine Operaton save conflict. Fixed via workers: 1 in playwright.config.ts.",
            'Also fixed: the pending-cleanup tracking file was being deleted unconditionally after its prompt loop regardless of each answer, so a declined entry lost its tracking entirely with the underlying Operaton history never actually deleted — found via 3 real leftover history entries that had to be purged manually. Only confirmed-and-deleted entries are dropped from the file now.',
          ],
        },
        {
          sha: 'fe689d4',
          author: 'Steven Gort',
          type: 'fix',
          subject:
            'ProtectedRoute check-sso gap and caseworker route guard fixed — plus a login regression they caused',
          details: [
            'A fresh page load of a protected route (URL bar, bookmark, refresh) always redirected to / even with a live Keycloak SSO session, because keycloak.init() was only ever called inside AuthCallback.tsx and ProtectedRoute checked keycloak.authenticated synchronously with no init of its own. services/keycloak.ts now exports initializeKeycloak(), an idempotent wrapper memoizing the first keycloak.init() call; ProtectedRoute awaits it on mount before deciding anything.',
            '/dashboard/caseworker was not wrapped in ProtectedRoute at all, so a citizen who navigated there directly just stayed. Now wrapped the same as /dashboard/citizen — accepted trade-off: CaseworkerDashboardV2\'s public "zoeken" mode for unauthenticated visitors is no longer reachable, since the route now redirects before the component mounts.',
            'Manual testing after the above surfaced a real regression: the first version of initializeKeycloak() accepted caller-supplied options and memoized whichever ones its first caller passed for the life of the page, so visiting /dashboard/caseworker while logged out followed by "Login met DigiD" got back the already-resolved false from ProtectedRoute\'s earlier check-sso call instead of a real login attempt — the DigiD redirect never fired. Fixed by always using a fixed check-sso init and triggering every real login redirect via an explicit keycloak.login(...) call instead, which has no "only once" restriction unlike .init().',
          ],
        },
        {
          sha: 'c23c175',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Changelog commit lists now ordered newest-first',
          details: [
            "Reorders this entry's commits array to descending (latest commit first) — ChangelogPanel.tsx renders it in array order with no reversal, so this was previously showing oldest-first. Patches the bump-release skill to author new/extended entries in this order going forward.",
          ],
        },
        {
          sha: '45d007e',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Deep caseworker journey E2E test — full roundtrip against local Operaton',
          details: [
            'e2e/caseworker-journey.spec.ts: citizen submits a real Kapvergunning request via AwbShellProcess on the local Operaton container; DMN evaluates it; caseworker claims and completes the resulting TreeFellingPermitSubProcess review task, which advances AwbShellProcess to its own follow-up caseworker task — that gets completed too, for a genuinely finalized roundtrip (zero open tasks/instances left in Operaton).',
            "Also adds optional Operaton history cleanup (e2e/helpers/operaton-cleanup.ts + e2e/global-teardown.ts) — Playwright runs test bodies in worker child processes that don't forward the CLI's real TTY stdin, so the interactive y/n prompt has to run from globalTeardown (the main CLI process) instead of the test itself.",
          ],
        },
        {
          sha: 'b288eb0',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'TakenInbox success message now actually renders after task completion',
          details: [
            'onCompleted called setActionMessage(success) and setSelectedId(null) in the same synchronous handler. React batches both into one render, and since the message only rendered inside the {!selected ? <empty> : <article>...} branch, selected was already null before the message ever painted — the success confirmation never appeared for any caseworker, on any task completion.',
            'Fixed by moving the actionMessage banner to render as a sibling of the selected/empty branches instead of nested inside <article>, so it persists independently of whether a task is currently selected.',
          ],
        },
        {
          sha: '4942b18',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'docker:check now also verifies the Operaton container',
          details: [
            "npm run dev's docker:check step didn't know about the new Operaton container, so it would report all-clear even if Operaton wasn't up or healthy.",
          ],
        },
        {
          sha: '5da8971',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Local Operaton container added for E2E process/task testing',
          details: [
            'Adds an operaton service to docker-compose.yml (H2 file-based DB, host port 8081) so the E2E deep caseworker journey can exercise a real backend-backed flow without touching the real operaton.open-regels.nl engine.',
          ],
        },
        {
          sha: 'ae2c711',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Login/redirect matrix + ProtectedRoute checks — found 2 real gaps',
          details: [
            'e2e/login-redirect.spec.ts: one test per Flevoland role (citizen, caseworker, infra, woo, pa) confirming login lands on the correct dashboard.',
            "e2e/protected-route.spec.ts: found that a fresh page load of /dashboard/citizen always redirects to / even with a live SSO session (keycloak.init() only runs inside AuthCallback.tsx, so ProtectedRoute's synchronous check is always false on a real navigation), and that /dashboard/caseworker isn't wrapped in ProtectedRoute at all so a citizen who navigates there directly just stays. Both documented as found-not-fixed gaps.",
          ],
        },
        {
          sha: 'c8a184a',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Playwright E2E harness scaffolded — smoke test passes end-to-end',
          details: [
            'Adds @playwright/test, packages/frontend/e2e/{playwright.config.ts,global-setup.ts,smoke.spec.ts}, and test:e2e/test:e2e:ui scripts. globalSetup checks frontend, backend, and the sibling linked-data-explorer backend are all reachable before any test runs, failing fast with the exact start commands instead of a confusing mid-test connection error — no webServer auto-boot, the dev stack is expected to already be running.',
          ],
        },
        {
          sha: 'f0c6c90',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Detailed Playwright E2E Phase 1 plan drafted',
          details: [
            "Adds docs/TESTING-FRONTEND-UI.md — scope, tooling, and journey list for Phase 1 of frontend E2E testing (real Keycloak login/redirect, real router, real backend), plus environment setup including the sibling linked-data-explorer repo's backend, required for Zoeken >> Procesbibliotheek journeys.",
          ],
        },
        {
          sha: '40a7575',
          author: 'Steven Gort',
          type: 'fix',
          subject: "Dossierbeheer's actionError banner now also renders in the edit view",
          details: [
            "handleSave's catch doesn't switch the view back to 'list' on failure, so a failed save while still in the editor left actionError set but invisible. The banner JSX is now a shared actionErrorBanner variable rendered in both the edit view and the overview.",
          ],
        },
        {
          sha: 'a65e840',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'check-deps.sh compares lockfile content instead of mtimes',
          details: [
            "git checkout / merge --ff-only rewrite tracked files to disk as part of updating the working tree even when content is byte-identical, bumping package-lock.json's mtime on every branch switch regardless of whether dependencies actually changed — no .gitattributes setting can prevent that, it's fundamental to how git checkout works.",
            'Adds scripts/write-deps-marker.sh, wired as the root postinstall script, which snapshots package-lock.json into node_modules/.package-lock-installed.json after every successful npm install. check-deps.sh now does a byte-for-byte content comparison against that snapshot instead of an mtime check — immune to git touching mtimes, only trips on a real lockfile change.',
          ],
        },
        {
          sha: '82b519d',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Two UX fixes in IouFeedbackSection and IouGebruiksscenarioSection',
          details: [
            "IouFeedbackSection: the form-watching persist effect now skips writing to sessionStorage while submitState is 'success', so clearDraft()'s removal on a successful submit actually sticks instead of being immediately undone by the effect rewriting a blank draft right after. Persistence resumes once the user starts a new submission.",
            'IouGebruiksscenarioSection: the "Overig / Other" materials checkbox is now wrapped in a <label> like its sibling options, so clicking the text toggles it too, not just the checkbox itself.',
          ],
        },
        {
          sha: 'e3dec89',
          author: 'Steven Gort',
          type: 'fix',
          subject: "AuditSection's load-on-mount effect now gated behind the admin role",
          details: [
            "The effect fetched /admin/audit on every mount regardless of the user's roles — only the rendered UI was gated behind the admin check, which came after the hooks, so non-admin users still triggered the network call even though they'd never see the result.",
            'Now checks the same isAdmin flag the render guard uses and skips the fetch entirely for a non-admin user, re-firing if the user gains the role later (e.g. a role refresh mid-session).',
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '3.9.5',
      status: 'Released',
      date: '21 jul 2026',
      scope: 'frontend',
      commits: [
        {
          sha: 'd1d0dfc',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'bump-release now fast-forwards onto acc and cleans up the working branch',
          details: [
            'Adds a step to the bump-release skill: after the version-bump commit, fast-forward acc onto the working branch and delete it, by default — no confirmation needed for that part. Still stops on a non-fast-forward (diverged acc) instead of forcing, and still asks separately before pushing acc to origin.',
          ],
        },
        {
          sha: 'ad93e53',
          author: 'Steven Gort',
          type: 'test',
          subject:
            'Completed P7: small/medium file test coverage for the shared CaseworkerDashboard library',
          details: [
            'Covers the 18 small/medium files (<200 lines) in the shared CaseworkerDashboard/ section-component library reused across CaseworkerDashboardV2, InfraBoardDashboard, and PADashboardV2: ProcessVarsSection, processSteps.ts, DvtpStartSection, HrOnboardingSection, CapacityClaimSection, ProcessStepsTimeline, RollenSection, RipFase1Section, BerichtenSection, NieuwsSection, OnboardingArchiefSection, RipFase1WipSection, RipFase1GereedSection, TaskFormViewer, CapacityClaimArchiefSection, ProfielSection, DvtpTakenSection, AuditSection.',
            "466 → 581 tests, 46.59% → 54.28% statement coverage. Found and documented (not fixed) a real gap: AuditSection's load-on-mount effect has no role guard, so it fetches /admin/audit regardless of the user's role — only the rendered UI is gated.",
          ],
        },
        {
          sha: '4915ccc',
          author: 'Steven Gort',
          type: 'test',
          subject:
            'Completed P8: large file test coverage for the shared CaseworkerDashboard library',
          details: [
            'Covers the 11 larger files (200+ lines) in the shared CaseworkerDashboard/ section-component library, scoped to critical interactions only per the P5/ZoekcriteriaSection convention: ArchiefSection, IouZakenSection, CapacityClaimDocumentsViewer, GereedschapSection, RipFase1WipViewer, ProcesBibliotheek, ProductenDienstenCatalogus, McpChatSection, IouFeedbackSection, RegelCatalogus (704 lines), and IouGebruiksscenarioSection (826 lines, the largest file in the folder).',
            "This closes out components/CaseworkerDashboard/ entirely — all ~29 files now have tests. 581 → 660 tests, 54.28% → 67.92% statement coverage. Two small UX findings documented (not fixed): IouFeedbackSection's clearDraft() gets immediately undone by a persist effect, and IouGebruiksscenarioSection's \"Overig / Other\" checkbox isn't label-wrapped.",
          ],
        },
        {
          sha: '5e5778f',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Completed P9: dossierbeheer PA-authoring surface test coverage',
          details: [
            'Covers all 8 files in components/PADashboardV2/dossierbeheer/: DeleteDialog, KompasScorer, TemplateGallery, DossierRow, ArchiveDialog, MdEditor, DossierEditor (scoped to critical interactions), and the Dossierbeheer container itself (mocked one level below — DossierRow/DossierEditor/TemplateGallery/ArchiveDialog/DeleteDialog stubbed as clickable buttons, same pattern as the P5 dashboard containers).',
            "660 → 722 tests, 67.92% → 72.24% statement coverage. Found and documented (not fixed) a real gap: Dossierbeheer's actionError banner only renders in the overview branch, so a failed save while still in the editor sets the error state but never shows it to the user.",
          ],
        },
        {
          sha: '2d29e5b',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Completed P10: LoginChoice, AuthCallback, and ChangelogPanel test coverage',
          details: [
            'Covers BoardCard, BoardPreview, LoginChoice.tsx (the entry landing page), AuthCallback.tsx (OAuth redirect handling — medewerker vs. citizen IdP branches, the role-to-dashboard fallback table, and the post-login-redirect allow/deny logic including the infra-projectteam vs. caseworker precedence case), and ChangelogPanel.tsx (scoped, using the real changelog-data.ts).',
            '722 → 758 tests, 72.24% → 74.86% statement coverage. Fixed a real flakiness issue along the way: ChangelogPanel.test.tsx renders the full 60+-entry real changelog dataset, which could cross the 5s default test timeout under full-suite CPU contention — fixed with a per-file testTimeout: 15000 rather than trimming the fixture.',
          ],
        },
        {
          sha: '8038709',
          author: 'Steven Gort',
          type: 'test',
          subject:
            'Completed P11: dashboard shell component test coverage, closing the P1–P11 backlog',
          details: [
            'Covers all 17 *CommandPalette*/*Dock*/*SectionRouter*/*NoAccessPanel* shell files across the 4 dashboards (Woo, InfraBoard, PA, Caseworker-V2). The two SectionRouter files (~190 lines each) are the largest here — each dispatches a section id to a dozen+ already-tested child components plus a defence-in-depth role/org-type gate, so the tests focus on the routing table and the gate logic rather than re-testing children.',
            '758 → 888 tests, 74.86% → 83.39% statement coverage. This closes the entire P1–P11 backlog: every component and page in the frontend now has at least a test file.',
          ],
        },
        {
          sha: '1785718',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Pinned text file line endings to LF via .gitattributes',
          details: [
            "Windows checkouts with core.autocrlf=true let git silently rewrite committed LF files to CRLF on disk on every checkout/commit, even when content is unchanged. That rewrite bumps the file's mtime, which caused two separate false positives in this repo: scripts/check-deps.sh flagging package-lock.json as stale against node_modules/.package-lock.json purely from line-ending churn, and the pre-push hook's prettier --check failing on files nobody touched in the current branch.",
            'Confirmed via git add --renormalize . that every tracked file was already stored as LF internally — only .gitattributes itself needed adding, so this is a forward-looking fix with no other content changes.',
          ],
        },
        {
          sha: '83d47a4',
          author: 'Steven Gort',
          type: 'docs',
          subject: 'Documented expected console noise in frontend test output',
          details: [
            "Adds a \"Reading test output\" section covering the act() warning and the three stray Error stack traces that show up in a clean run (AuthCallback's own console.error, PaDataProvider's outside-provider negative test, SectionErrorBoundary's intentional throw) — all from tests that pass, so the guidance is to triage the pass/fail summary, not individual console lines.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '3.9.4',
      status: 'Released',
      date: '20 jul 2026',
      scope: 'frontend',
      commits: [
        {
          sha: '7c54c56',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Removed the Notificaties design-handoff docs from the repo',
          details: [
            'Reference-only handoff package for the Notificaties page (already ported into the app) — not meant to live in the repo long-term.',
          ],
        },
        {
          sha: '619b77c',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Brought the improved eDocs live-test script into this branch',
          details: [
            "Cherry-picked test-edocs-live.sh from feature/custom-connector-x-api (just this one file, not the rest of that branch's work). Adds a fail-fast liveness gate (GET /v1/health/live, checked before the pre-flight/token dance, mirroring test-smoke-live.sh), a second route via the Python MCP POC container (gated behind PYTHON_MCP_POC_ENABLED, off by default), workspace listing instead of create/delete (the live search was found not to reliably scope by project number), and non-fatal handling of document delete (this account has no delete-document right in the live DM server).",
          ],
        },
        {
          sha: '2ed4584',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Added frontend testing infrastructure and the Frontend Testing Guide',
          details: [
            "The frontend had 2 pure-logic test files and no way to render a component — no jsdom/RTL, no coverage.include. Added RTL/jsdom/msw, wired up per-file jsdom overrides, fixed Vitest coverage to report the whole src tree instead of only executed files, and aligned npm test with the backend's coverage-by-default convention. Two worked-example tests (services/api.ts, SessionExpiryWarning) prove the documented patterns actually work.",
            'docs/TESTING-FRONTEND.md covers conventions, layer-by-layer patterns, a prioritized coverage backlog, and a light Playwright/E2E section for later.',
          ],
        },
        {
          sha: '3c4dd58',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Completed P1: full test coverage for the service layer',
          details: [
            'Covers every services/*.ts file: keycloak.ts, tenant.ts, bsn.mapping.ts, brp.api.ts, brp.timeline.ts, dossierbeheer.api.ts, infra.api.ts, and pa.api.ts (the largest, ~35 exports across mock and live branches, using vi.stubEnv + vi.resetModules to flip the import.meta.env mock flags per test).',
            '135 tests total (up from 11), all passing. Overall statement coverage 1.6% → 9.72%; src/services alone at 73.41%.',
          ],
        },
        {
          sha: '087d133',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Completed P2: hook test coverage',
          details: [
            'Covers useProfielData.ts (imperative load()/loading/error state) and PaDataProvider.tsx (usePaData context + useResource instances + the write-action-then-selective-refetch pattern used across confirmSignal, watchDossier, ackNotifications, etc).',
            '149 tests total (up from 135). Overall statement coverage 9.72% → 10.92%; PaDataProvider.tsx itself at 86.44%.',
          ],
        },
        {
          sha: '47553f7',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Completed P3: small reusable component test coverage',
          details: [
            "Covers AltchaWidget (custom-element event dispatch), DecisionViewer and ProcessStartFormViewer (both wrap @bpmn-io/form-js's Form class, mocked via a plain function since arrow functions have no [[Construct]]), PersonalDataPanel (pure presentational), and TimeLine (getBoundingClientRect mocking for click/drag position math).",
            'DecisionViewer also documents a real gotcha: Promise.allSettled absorbs rejections into its own fallback branch rather than the error branch, so reaching the error state needs a synchronous throw, not mockRejectedValue.',
            '187 tests total (up from 149). Overall statement coverage 10.92% → 14.14%.',
          ],
        },
        {
          sha: '39a74ed',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Completed P4: pure logic/data module test coverage',
          details: [
            'Covers the remaining config/data modules across infra-board, caseworker-v2, woo, and login-choice: static configs, gating predicates, activity-history-to-status mapping (rip-model.ts), portfolio row builders (infra-board.data.ts), and a seeded-PRNG-generated 218-row register with its filter predicates (woo.data.ts).',
            'Two follow-ups surfaced along the way: boards.config.ts duplicated WOO_GATE_ROLE as a string literal instead of importing it (fixed in a later commit this release), and wooFilterRows\' "In behandeling" filter matches "not closed/overdue" rather than an exact status string (reviewed and confirmed as intentional, not a bug).',
            '251 tests total (up from 187). Overall statement coverage 14.14% → 18.45%; woo.data.ts alone at 96.55%.',
          ],
        },
        {
          sha: 'f955093',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Completed P5: dashboard container test coverage (critical interactions)',
          details: [
            'Covers InfraBoardDashboard, WooDashboard, CaseworkerDashboardV2, PADashboardV2, and Dashboard.tsx, scoped to auth/access gates, tab/mode switching, login/logout, command palette, and the highest-value form flow per container rather than exhaustive coverage of these 300–1,000+ line shells. Every child section/dock/palette component is mocked, and context providers (PaDataProvider) are mocked at the module level rather than run for real, since they already have dedicated test files.',
            "Two real findings along the way: PADashboardV2's switchMode restores the last section visited per mode rather than always resetting to a default, and Dashboard.tsx's permit submission is a two-step flow where the child form's own success screen fires before the container's tab switch.",
            '292 tests total (up from 251). Overall statement coverage 18.45% → 25.67%; src/pages jumped from ~15% to 54.18%.',
          ],
        },
        {
          sha: '6bcdf33',
          author: 'Steven Gort',
          type: 'test',
          subject: 'Completed P6: SSE streaming chat coverage, closing the P1–P6 backlog',
          details: [
            "Covers businessApi.mcp.chatStream by mocking the ReadableStream reader directly ({ read(), releaseLock() }) instead of fighting msw's streamed-response API. Tests event parsing, an SSE line split across two chunks (the real buffer/reassembly logic), a malformed line that doesn't drop subsequent valid events, non-data: lines being ignored, the reader lock being released, both error paths (HTTP error and fetch rejection), the AbortError-yields-nothing case, and the auth interceptor's failed-token-refresh branch.",
            '303 tests total (up from 292). Overall statement coverage 25.67% → 26.33%; api.ts itself 13.23% → 39.7%. Closes the full P1–P6 backlog from the original plan (1.6% → 26.33% statements, 11 → 303 tests).',
          ],
        },
        {
          sha: '84ad878',
          author: 'Steven Gort',
          type: 'test',
          subject: 'P1b + full dashboard section-component test coverage',
          details: [
            'Covers the remaining ~40 businessApi methods in api.ts via the msw pattern (95.58% statements), and adds dedicated tests for every Public Affairs, Woo, Caseworker-V2, and InfraBoard section component that previously had none. Also fixes the boards.config.ts role-string duplication flagged during P4 and documents the wooFilterRows "In behandeling" filter behavior as a reviewed product decision.',
            '466 tests total (up from 303). Overall statement coverage 26.33% → 46.59%.',
          ],
        },
        {
          sha: '4f68257',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Fixed invalid <div>-in-<p> nesting in BronnenSection',
          details: [
            "PersonalFeedLink renders a <div>, which browsers can't nest inside a <p> — they close the paragraph early, silently breaking the intended markup. Found via validateDOMNesting warnings while writing BronnenSection.test.tsx.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '3.9.3',
      status: 'Released',
      date: '19 jul 2026',
      scope: 'both',
      commits: [
        {
          sha: '1228ffc',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Team-scoped Zoekcriteria watches now actually deliver notifications',
          details: [
            "computeNotifications' watch query requires user_id IS NOT NULL, but the taxonomy seed rows behind Team-scoped Zoekcriteria have no user_id — they're shared, unowned filters. Toggling their WatchBell silently persisted notify=true but could never produce a Meldingen entry, with nothing in the UI indicating the bell was inert.",
            "PATCH /v1/pa/searches/:id now detects unowned rows and, instead of writing notify on the shared row, finds-or-creates a personal watch derivative (source_search_id → the team row) that computeNotifications can actually match against. GET /v1/pa/searches reflects the caller's own derivative state for the bell instead of the dead shared flag.",
          ],
        },
        {
          sha: '67f67ee',
          author: 'Steven Gort',
          type: 'feat',
          subject: 'Added Notificaties explainer page under Beheer → Monitoring',
          details: [
            'Read-only spec page documenting how the WatchBell & Meldingen notification layer works — trigger points, matchWatch, the UNIQUE(user_id, signal_id) dedup, and the team-search → personal-derivative rule — sibling of the existing Curatiepijplijn and Afwegingskader spec pages. Ported from a design handoff package; two CSS classes the reference assumed already existed (pac-beheer-card-label/-note) did not, so those were added rather than shipping unstyled.',
            'Positioned in the Beheer → Monitoring nav and automatically picked up by the ⌘K command palette. Purely additive — no change to notification runtime behaviour.',
          ],
        },
        {
          sha: '3bd69d7',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Removed the source footnote from the Notificaties page',
          details: [
            "Dropped the 'Bron: ...' line pointing at the backend service file and tables — kept the page focused on explaining the mechanism rather than citing its own implementation.",
          ],
        },
        {
          sha: '95c1d4d',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Renamed the Meldingen modal to Notificaties and moved its nav item',
          details: [
            "The slide-over notification panel's title now reads 'Notificaties' to match the new spec page's name. In the Beheer → Monitoring nav, Notificaties moved from directly under Zoekcriteria to directly under Curatiepijplijn — order is now Signaalbronnen, Zoekcriteria, Curatiepijplijn, Notificaties.",
          ],
        },
      ],
    },
    {
      format: 'commits',
      version: '3.9.2',
      status: 'Released',
      date: '19 jul 2026',
      scope: 'both',
      commits: [
        {
          sha: '2df7e3a',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Notifications now recompute the moment a watch turns on',
          details: [
            "Toggling a watch's notify flag (a Zoekcriteria bell, or a dossier's watch-everything bell) never itself recomputed notifications — any already-confirmed signal that newly matched sat silently undelivered until some unrelated later event (a confirm, a dossier link, or the next curation cycle) forced a full rescan and dumped the whole backlog at once, surfacing as a confusing batch tied to an unrelated action.",
            "Added 'watch-toggle' as its own computeNotifications trigger point in PATCH /v1/pa/searches/:id (notify → true) and POST /v1/pa/dossiers/:id/watch, so the backlog now surfaces the moment the watch actually turns on.",
          ],
        },
        {
          sha: '9248982',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'WatchBell toggles now refetch Meldingen via PaDataProvider',
          details: [
            'The backend recomputes notifications synchronously on watch-toggle, but the two frontend WatchBell call sites imported watchDossier/unwatchDossier/toggleSearchNotify straight from the API client instead of going through PaDataProvider, so the Meldingen badge never refetched — an already-confirmed backlog stayed invisible until an unrelated action or a page reload.',
            'Mirrors the existing confirmSignal/linkSignalDossier pattern: PaDataProvider now wraps all three watch mutations and refetches the notifications resource after each.',
          ],
        },
        {
          sha: '80904de',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Editing a published dossier no longer requires re-publish rights',
          details: [
            "A plain edit-only save always resent the dossier's current gepubliceerd value. For any already-published dossier, that tripped the backend's publish guard for a pa-author (who can edit but not publish), surfacing as a misleading connectivity error. Every seeded dossier ships published, so this locked pa-authors out of editing anything.",
            'gepubliceerd is now omitted from the save payload entirely unless the user is actually publishing — the backend already treats a missing field as "no change."',
          ],
        },
        {
          sha: 'e7ac9fd',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Markdown fields now render properly on the Issuekaart',
          details: [
            "Dossierbeheer's editor stores the narrative fields (waarom nu / waarover / ons verhaal) as Markdown, but the Issuekaart rendered them as plain text with no Markdown pipeline — every dossier authored from a template (or edited afterwards) showed literal '## headers', '**bold**' asterisks, and '- bullet' dashes on its primary overview.",
            "Added the same react-markdown + rehype-sanitize pipeline the editor's own preview already uses, applied to the three affected fields.",
          ],
        },
        {
          sha: '3012707',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Closed two privilege-escalation holes in dossier editing',
          details: [
            "The dossier edit endpoint only ever checked the publish flag against a user's publish rights, and never validated or gated a status change at all. A pa-author could archive any live dossier by sending a status change directly — bypassing the admin-only archive route and its required legal-retention metadata — and could unpublish any published dossier, since the publish guard only fired in one direction.",
            'Added a status whitelist, an archive-permission guard, and made the publish guard compare against the current value so both publishing and unpublishing require the same publish rights.',
          ],
        },
        {
          sha: '295b09c',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'EU source wired into the live signal feed',
          details: [
            "The live feed endpoint's source filter had no branch for 'eu' at all, even though EU is a first-class source everywhere else in PA monitoring and a selectable option when authoring a saved search. A personal search scoped to EU alone silently returned zero results with no error.",
            'Wired the existing EU feed client into the live endpoint the same way the curation cycle already uses it, scoped specifically to an EU-only request rather than folded into the default combined view.',
          ],
        },
        {
          sha: 'a191924',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'WatchBell guarded against rapid double-click races',
          details: [
            'Neither WatchBell toggle had an in-flight guard: a rapid double-click fired two overlapping requests, and since each click also flips local state, the two flips could cancel out visually while the server converged to a different state than what the bell displayed.',
            'Added a disabled state to the shared WatchBell button, backed by an in-flight busy flag (single dossier bell) or a per-item busy set (the saved-searches list, one bell per row).',
          ],
        },
        {
          sha: 'a30b0d4',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Archive route no longer hangs on malformed input',
          details: [
            'The archive metadata guard checked for a missing reason before validating its type, so a non-string value passed the missing-value check and then crashed the request — and because this backend has no async-error middleware, the crash never reached the client as an error response; the request just hung.',
            'Added an explicit type guard so malformed input now returns the intended 400 instead of hanging.',
          ],
        },
        {
          sha: 'fe364fb',
          author: 'Steven Gort',
          type: 'fix',
          subject: 'Dossier deletion made atomic to prevent orphaned history',
          details: [
            'Deleting a dossier ran two independent database statements with no link between them. A failure between the two could delete the dossier but leave its version history behind — and because dossier ids are deterministic, a later dossier recreated under the same name could silently inherit that orphaned history as its own, misattributing old audit entries to the new dossier.',
            'Both deletes now run inside a single transaction, so they always commit or roll back together.',
          ],
        },
        {
          sha: '4711f99',
          author: 'Steven Gort',
          type: 'test',
          subject: 'pa-dossiers.db.ts: 43.75% → 98.75% stmts',
          details: [
            'The database init/seed module behind Dossierbeheer (table creation, the SEED_DOSSIERS-to-Markdown conversion, and the relative-time formatter used on every dossier card) had no dedicated test file at all — its sibling module for the wider PA monitoring feature did.',
            'Added full coverage: table creation, Markdown wrapping with and without narrative frames, the seeded archived example, fail-soft behaviour when table creation fails, and per-row failure isolation during seeding.',
          ],
        },
        {
          sha: '4fc2759',
          author: 'Steven Gort',
          type: 'test',
          subject: 'curation.service.ts: notification label & reference formatting now covered',
          details: [
            'Two small formatting helpers — the relative-age label shown on every curated signal, and the document-reference lookup used to link back to the source — were only reachable through the full curation pipeline and were never actually asserted on, so most of their branches ran incidentally without verification.',
            'Added targeted tests that inspect the real database insert to cover every age-label branch (just now / hours ago / yesterday / day-before-yesterday / N days) and every reference-lookup case (matched, unmatched, and non-applicable source).',
          ],
        },
        {
          sha: '3fd1318',
          author: 'Steven Gort',
          type: 'test',
          subject: 'pa-dossiers.routes.ts: missing error and validation branches covered',
          details: [
            'Nearly every mutation route in Dossierbeheer had an untested failure path (database errors returning the wrong thing, or not being verified at all) and a few validation branches — an invalid field, a missing required name — were never exercised either.',
            'Filled in the gaps so every route now has both its error path and its validation branches under test, matching the pattern already established elsewhere in PA monitoring.',
          ],
        },
        {
          sha: 'dd026e2',
          author: 'Steven Gort',
          type: 'chore',
          subject: 'Local Claude Code settings excluded from git',
          details: [
            "A local, untracked settings file wasn't excluded by .gitignore, so the formatting check used by the pre-push hook still scanned and flagged it — breaking every push from an affected machine even though the file was never actually committed.",
          ],
        },
      ],
    },
    {
      version: '3.9.1',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 18, 2026',
      scope: 'both',
      sections: [
        {
          icon: '🔔',
          iconColor: '#0046ad',
          title:
            'Feature: WatchBell & Meldingen — per-user notifications for watched dossiers and searches',
          items: [
            "New WatchBell toggle (🔔) on Zoekcriteria rows and dossier detail pages lets a PA officer subscribe to a saved search or an entire dossier — a dossier watch is an empty-query pa_saved_searches row that matches every confirmed signal for that dossier (tkconv's 'watch this entity' pattern). Orthogonal to the existing Team/Persoonlijk scope toggle: watching never changes what the curation cron fetches, only who gets notified.",
            'New Meldingen slide-over (styled to match the existing Changelog panel — same overlay, header, ESC/click-outside-to-close) plus a live badge in the top bar. Backed by a new pa_notifications table with a UNIQUE(user_id, signal_id) dedup key and a cross-watch matcher (notifications.service.ts) that collapses a signal caught by two overlapping watches into one delivered item. Recomputed synchronously — before the response is sent — on every signal confirm and every dossier-link action, so a match appears immediately rather than waiting for the next 6-hourly curation cycle.',
            "New personal RSS feed (GET /v1/pa/signals.rss?token=..., surfaced in Beheer → Signaalbronnen) — the same query behind GET /v1/pa/signals rendered as RSS 2.0 XML instead of JSON ('one query, two renderers'), authenticated via a per-user token since RSS readers can't send a Keycloak bearer token. Documented end-to-end in docs/WATCHBELL.md: the three-level watch model, the matching algorithm, every trigger point, and the exact log lines to check when Meldingen doesn't update as expected.",
          ],
        },
        {
          icon: '🔧',
          iconColor: '#b45309',
          title:
            'Fix: Meldingen — five live-verified bugs found by testing against the real curation pipeline',
          items: [
            "The dossier-watch INSERT wrote an incomplete query JSON ({ q: '' } instead of { q: '', types: [], source: [] }), leaving SavedSearch.query.source undefined for that row — ZoekcriteriaSection's relevance preview calls sources.includes(...) unconditionally on every row, so the whole Zoekcriteria page went blank the moment a dossier watch existed. Fixed on both ends: the backend always writes the full shape now, and the frontend defaults defensively (source ?? [], q ?? '') so a legacy or malformed row degrades instead of crashing.",
            "Two components — Issuekaart.tsx's dossier-page Monitoring tab and Monitoring.tsx's 'Koppel aan dossier' action — called confirmSignal/linkSignalDossier straight from pa.api.ts instead of through PaDataProvider's context wrapper, so the shared notifications resource never refetched after either action. The backend was creating the notification correctly and immediately every time; the badge just never found out until an unrelated action's refetch happened to pick up the backlog, or a full page reload. Both now go through usePaData().",
            'PATCH /v1/pa/signals/:id (link a watchlist signal to a dossier) never triggered a notification recompute at all — only confirm did. A signal confirmed without a dossier correctly cannot match a dossier watch yet, but linking it afterward is exactly the event that could newly satisfy one. Both paths now call computeNotifications() synchronously with a reason tag (confirm / link-dossier / cycle), and every call logs its full match/insert lifecycle — makes a "Meldingen didn\'t update" report directly diagnosable from the backend terminal alone.',
            "The Meldingen card showed the internal cross-watch match label (a raw dossier:<id> sentinel) instead of the signal's actual source, and had no link to the source document at all. GET /v1/pa/notifications now resolves the sentinel to the dossier's real name and passes through the same src line and {nr} ↗ deep link shown on the signal card itself.",
            "Meldingen's own dropdown was a small anchor under the bell that toggled open/closed unpredictably and visually collided with the floating assistant button (both z-index: 50, tie broken by DOM order — the assistant button rendered on top). Replaced with a full slide-over panel matching the Changelog panel's design exactly, bumped above the assistant button's z-index, and fixed a text-wrap bug that let long signal titles push a horizontal scrollbar instead of wrapping.",
          ],
        },
        {
          icon: '🗂️',
          iconColor: 'teal',
          title: 'AI Assistant — eDOCS Document Provider',
          items: [
            "EdocsMcpProvider added as a new AI Assistant source (id edocs, displayed first — left of Process Engine) — enabled via EDOCS_MCP_ENABLED=true. Unlike the other MCP sources, its subprocess calls this backend's own /v1/edocs/* HTTP surface rather than the OpenText eDOCS DM server directly, so EdocsService stays the single place that knows eDOCS' auth and API quirks.",
            'Custom edocs-mcp stdio subprocess in packages/backend/src/mcp-servers/edocs/index.ts authenticates via a client_credentials flow against Keycloak using a new, dedicated edocs-mcp-client — kept separate from the existing copilot-studio-edocs client, which has its own unrelated, unresolved custom-connector OAuth constraints. The subprocess caches its token, refreshes it 30s early, and retries once on a 401.',
            'Four tools exposed, scoped strictly to the routes scripts/test-edocs-live.sh already proves working against a real DM server: workspace_list, workspace_documents, document_profile, document_versions. No tool was added on the basis of the OpenAPI spec alone — e.g. no document_list, since browsing documents outside a workspace has no live-tested backend route yet.',
            'config.edocsMcp added to Config: enabled (EDOCS_MCP_ENABLED, default false), clientId (EDOCS_MCP_CLIENT_ID, default edocs-mcp-client), clientSecret (EDOCS_MCP_CLIENT_SECRET). New edocs-mcp-client service-account client added to config/keycloak/ronl-realm.json, same shape as operaton-mcp-client.',
            'Live-verified end-to-end through the AI Assistant chat UI against the real eDOCS test server (infocenter-test.flevoland.nl) — workspace listing, document profile, and version history all confirmed working with real IOUTEST-owned data.',
            'GET /v1/edocs/status response now also includes baseUrl alongside the existing library/stubMode/reachable/authenticated fields.',
          ],
        },
      ],
    },
    {
      version: '3.9.0',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 17, 2026',
      scope: 'both',
      sections: [
        {
          icon: '📤',
          iconColor: '#0046ad',
          title: 'Feature: Doccle document delivery — v1 sender-service integration',
          items: [
            'New /v1/doccle routes proxy the Belgian Doccle document-delivery platform via its v1 mci-rest-app sender API: receiver upsert (PUT .../receivers/:externalReference), document upload (POST .../documents/:documentId), and marking a document paid (POST .../documents/:documentId/paid). Mirrors the existing eDOCS pattern — stub mode by default, JWT-gated routes, a reachability-only health check.',
            'The XML request/response wire format was reverse-engineered from vendor documentation (the technical PDF and HR sender-setup tutorial were image-only, so pages were rendered to PNG and read via OCR) and validated against the real Doccle staging API. fast-xml-parser XMLBuilder needed suppressBooleanAttributes: false to serialize boolean attributes correctly — the default rendered true as a valueless attribute, which the API rejected.',
            '28 tests across the service, routes, and a live-only smoke test (scripts/test-doccle-live.sh) that proves reachability, receiver upsert, and document upload against the real sender API when DOCCLE_STUB_MODE=false.',
          ],
        },
        {
          icon: '🔧',
          iconColor: '#b45309',
          title: 'Fix: eDOCS — five live-verified bugs found by testing against a real DM server',
          items: [
            'Document upload needed a true multipart/form-data body — the DM server rejected the JSON-with-base64-file shape as an (unsupported) document-copy request. APP_ID now defaults to "DEFAULT" (was "INFRA", rejected as an unrecognized linked application), and UV_AFD_NAAM ("Behandelgroep") is now a required department field — the server rejects uploads without it, with no prior default.',
            'uploadDocument() now defaults to a standalone upload (workspaceId: string | null) — the workspace-ref path was tried against a real workspace and failed two different ways, needs vendor input on what profile is valid for workspace-contained documents. Standalone is the only path confirmed working end-to-end (upload → list → profile → download) against a live server.',
            "ensureWorkspace()'s search-result parsing crashed on every real match (list items are flat, not nested under .data as previously assumed) — every real workspace lookup threw before this fix. getWorkspaceDocuments() was calling a sub-resource that does not exist on the API (workspaces/{id}/documents); fixed to the real endpoint, GET /workspaces/{id}.",
            'Document download needed two fixes: the endpoint returns raw file bytes directly (not JSON with a base64 field — now requests responseType: \'arraybuffer\' to avoid corrupting binary content), and the version identifier is the literal value "0" (a "current version" sentinel), not a value from the versions list — both VERSION and VERSION_ID from that list are rejected.',
            'Live-tested end-to-end against a real eDOCS server for the first time: full round-trip content verification (upload → download, byte-for-byte match) confirmed working. Remaining known issues (workspace creation still 500s server-side, delete blocked by test-account permissions) are tracked with per-endpoint detail on the architecture documentation site rather than in this repo, going forward.',
          ],
        },
        {
          icon: '🧹',
          iconColor: '#b45309',
          title:
            'Fix: media-aggregator / PA-cockpit — dedupe drift, dead code, and a media search gap',
          items: [
            'The AggregatorArticle wire contract was declared twice — once in media-aggregator/types.ts, once copy-pasted in pa-monitoring/sources/media.client.ts — kept in sync only by a code comment. Moved the canonical definition into @ronl/shared so both sides import the same type.',
            "BronnenSection.tsx's Signaalbronnen screen hand-mirrored media-aggregator/feeds.ts's RSS feed list for display, so every new feed needed a second manual edit. GET /v1/pa/sources/status now returns the live feed list straight from feeds.ts, and the Regionaal/Landelijk groups on that screen are built from it — the Sociaal 'gepland' placeholder (no backing connector yet) stays static.",
            "The six-municipality Flevoland gazetteer existed in two independently maintained shapes — an alias map in media-aggregator/enrich.ts and a flat term set in pa-monitoring/rules.ts used for relevance scoring — with drift risk if one was updated and not the other. Both now import a single @ronl/shared pa-geo module; kept as two literal exports rather than deriving one from the other, since rules.ts's scoring-facing set uses short forms a mechanical derivation could silently change.",
            "paTabConnected() in pa.api.ts always returned true once every Monitoring tab (including Media) got a non-empty TAB_SOURCES entry, leaving an unreachable 'Nog geen bron gekoppeld' empty-state in Monitoring.tsx with stale copy claiming the media connector 'landt in cyclus 2' — even though it had already shipped. Removed the dead branches, the dimmed rail badge they fed, and the now-unused function.",
            'The blanco zoekfunctie (raw cross-source search) only ever queried TK and OB — a PA officer could search raw Tweede Kamer and Officiële Bekendmakingen documents ad hoc, but not raw media articles, only what the 6-hourly curation cycle had already promoted. GET /v1/pa/feed and GET /v1/pa/types now include media (gated on MEDIA_SOURCE_ENABLED), and the Monitoring.tsx source-scope chips pick it up automatically.',
            'Verified with the full backend (924 tests) and frontend (9 tests) suites plus a fresh typecheck/lint/Prettier pass; no behavior change to existing scoring, ingestion, or upload paths.',
          ],
        },
      ],
    },
    {
      version: '3.8.3',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 15, 2026',
      scope: 'frontend',
      sections: [
        {
          icon: '🏷️',
          iconColor: '#0046ad',
          title: 'Feature: Changelog panel — scope badge (Frontend / Backend / Full-stack)',
          items: [
            'Each version card in the changelog panel now shows which deployable(s) the release actually touched — a Frontend, Backend, or Full-stack badge next to the version number, sourced from the new scope field on ChangelogVersion. Companion to the scope-aware bump-release workflow: a frontend-only release no longer needs to bump (or rebuild) the backend package, and vice versa.',
          ],
        },
      ],
    },
    {
      version: '3.8.2',
      status: 'Released',
      statusColor: '#2d7a33',
      borderColor: '#c3e6cd',
      date: 'July 15, 2026',
      scope: 'frontend',
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
