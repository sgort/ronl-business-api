// RONL Business API Changelog Data
// Format matches CPSV Editor and Linked Data Explorer

export interface ChangelogItem {
  title: string;
  icon: string;
  iconColor: string;
  items: string[];
}

export interface ChangelogSection {
  title: string;
  icon: string;
  iconColor: string;
  items: string[];
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
      version: '2.9.3',
      status: 'Feature Release',
      statusColor: 'purple',
      borderColor: 'purple',
      date: 'March 25, 2026',
      sections: [
        {
          title: 'AI Assistant — MCP Client Integration',
          icon: '🤖',
          iconColor: 'purple',
          items: [
            'New McpClientService in packages/backend/src/services/mcpClient.service.ts: spawns operaton-mcp as a stdio child process via StdioClientTransport, exposes connect(), disconnect(), listTools(), callTool(), and getToolDefinitions()',
            'McpClientService wired into server startup alongside ExternalTaskWorker — connects when MCP_ENABLED=true, disconnects cleanly on SIGTERM/SIGINT',
            'New McpChatService in packages/backend/src/services/mcpChat.service.ts: agentic loop using Anthropic claude-sonnet-4 with up to 10 tool-call rounds, ALLOWED_TOOLS curation gate prevents context overflow, sanitizeResponse strips leaked tool narration tags',
            'New POST /v1/mcp/chat route: JWT + caseworker/admin role required, 120s timeout with structured timeout error response, MCP_ENABLED guard returns 503 when disabled',
            'New AI Assistant section under Gereedschap tab — role-gated to authenticated caseworkers',
            'McpChatSection component: chat bubble UI with typing indicator, Enter-to-send, clear chat button, error display with backend error message propagation',
            'Chat history lifted to CaseworkerDashboard state — conversation survives navigating away and returning to the section',
            'System prompt tuned with latestVersion=true convention, maxResults=20 for listing vs count tools for counting, no tool narration instruction',
            'ALLOWED_TOOLS reduced to 15 read-only tools using correct operaton-mcp naming convention (group_verb format) — prevents context window overflow on tool schema injection',
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
            'Session expiry warning appearing during active use: Axios interceptor updateToken threshold raised from 30s to 120s to match the warning threshold — token now silently refreshes on any API call while fewer than 2 minutes remain',
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
            'Modal offers "Sessie verlengen" (forces updateToken) and "Uitloggen" — unsaved form data is preserved when extending',
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
