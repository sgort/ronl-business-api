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
