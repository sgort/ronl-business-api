import axios from 'axios';
import keycloak from './keycloak';
import type {
  ApiResponse,
  OperatonVariable,
  HealthResponse,
  ProcessStatusResponse,
  Task,
  HistoricTask,
  ActivityHistoryItem,
} from '@ronl/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(120);
    } catch {
      keycloak.login();
      return Promise.reject(new Error('Session expired'));
    }
  }
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

export const businessApi = {
  // ── Health ────────────────────────────────────────────────────────────────

  health: async (): Promise<HealthResponse> => {
    try {
      const response = await api.get<ApiResponse<HealthResponse>>('/health');
      return response.data.data as HealthResponse;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.data) {
        return err.response.data.data as HealthResponse;
      }
      throw err;
    }
  },

  // ── DMN decisions ─────────────────────────────────────────────────────────

  evaluateDecision: async (decisionKey: string, variables: Record<string, OperatonVariable>) => {
    try {
      const response = await api.post<ApiResponse>(`/decision/${decisionKey}/evaluate`, {
        variables,
      });
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data) {
        return error.response.data as ApiResponse;
      }
      throw error;
    }
  },

  // ── Process instances ─────────────────────────────────────────────────────

  process: {
    start: async (
      processKey: string,
      variables: Record<string, unknown>,
      businessKey?: string
    ): Promise<ApiResponse<ProcessStatusResponse>> => {
      try {
        const response = await api.post<ApiResponse<ProcessStatusResponse>>(
          `/process/${processKey}/start`,
          { variables, businessKey }
        );
        return response.data;
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.data) {
          return error.response.data as ApiResponse<ProcessStatusResponse>;
        }
        throw error;
      }
    },

    startForm: async (processKey: string): Promise<ApiResponse<unknown>> => {
      const response = await api.get<ApiResponse<unknown>>(`/process/${processKey}/start-form`);
      return response.data;
    },

    status: async (processInstanceId: string): Promise<ApiResponse<ProcessStatusResponse>> => {
      const response = await api.get<ApiResponse<ProcessStatusResponse>>(
        `/process/${processInstanceId}/status`
      );
      return response.data;
    },

    variables: async (processInstanceId: string): Promise<ApiResponse<Record<string, unknown>>> => {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        `/process/${processInstanceId}/variables`
      );
      return response.data;
    },

    cancel: async (processInstanceId: string, reason?: string): Promise<ApiResponse> => {
      const response = await api.delete<ApiResponse>(`/process/${processInstanceId}`, {
        data: { reason },
      });
      return response.data;
    },

    history: async (applicantId: string): Promise<ApiResponse<unknown[]>> => {
      const response = await api.get<ApiResponse<unknown[]>>(
        `/process/history?applicantId=${encodeURIComponent(applicantId)}`
      );
      return response.data;
    },

    historicVariables: async (
      processInstanceId: string
    ): Promise<ApiResponse<Record<string, unknown>>> => {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        `/process/${processInstanceId}/historic-variables`
      );
      return response.data;
    },

    activityHistory: async (
      processInstanceId: string
    ): Promise<ApiResponse<ActivityHistoryItem[]>> => {
      const response = await api.get<ApiResponse<ActivityHistoryItem[]>>(
        `/process/${processInstanceId}/activity-history`
      );
      return response.data;
    },

    decisionDocument: async (
      processInstanceId: string
    ): Promise<{ success: boolean; template?: Record<string, unknown> }> => {
      const response = await api.get<{ success: boolean; template?: Record<string, unknown> }>(
        `/process/${processInstanceId}/decision-document`
      );
      return response.data;
    },
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────

  task: {
    list: async (): Promise<ApiResponse<Task[]>> => {
      const response = await api.get<ApiResponse<Task[]>>('/task');
      return response.data;
    },

    get: async (taskId: string): Promise<ApiResponse<Task>> => {
      const response = await api.get<ApiResponse<Task>>(`/task/${taskId}`);
      return response.data;
    },

    formSchema: async (taskId: string): Promise<ApiResponse<unknown>> => {
      const response = await api.get<ApiResponse<unknown>>(`/task/${taskId}/form-schema`);
      return response.data;
    },

    variables: async (taskId: string): Promise<ApiResponse<Record<string, unknown>>> => {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        `/task/${taskId}/variables`
      );
      return response.data;
    },

    claim: async (taskId: string): Promise<ApiResponse> => {
      const response = await api.post<ApiResponse>(`/task/${taskId}/claim`);
      return response.data;
    },

    complete: async (taskId: string, variables: Record<string, unknown>): Promise<ApiResponse> => {
      const response = await api.post<ApiResponse>(`/task/${taskId}/complete`, { variables });
      return response.data;
    },

    history: async (): Promise<ApiResponse<HistoricTask[]>> => {
      const response = await api.get<ApiResponse<HistoricTask[]>>('/task/history');
      return response.data;
    },
  },

  // ── Public content (no auth required) ────────────────────────────────────

  portal: {
    /**
     * GET /v1/public/nieuws
     * National news from Rijksoverheid — publicly accessible.
     */
    nieuws: async (limit = 10, offset = 0) => {
      type R = ApiResponse<{
        items: NieuwsItem[];
        pagination: { limit: number; offset: number; total: number; hasMore: boolean };
      }>;
      const response = await api.get<R>(`/public/nieuws?limit=${limit}&offset=${offset}`);
      return response.data;
    },

    berichten: async (limit = 10, offset = 0) => {
      type R = ApiResponse<{
        items: BerichtItem[];
        pagination: { limit: number; offset: number; total: number; hasMore: boolean };
      }>;
      const response = await api.get<R>(`/public/berichten?limit=${limit}&offset=${offset}`);
      return response.data;
    },

    productenDiensten: async (
      limit: number = 50
    ): Promise<
      ApiResponse<{
        items: ProductDienstItem[];
        pagination: { limit: number; offset: number; total: number; hasMore: boolean };
      }>
    > => {
      const response = await api.get(`/public/producten-diensten?limit=${limit}`);
      return response.data;
    },

    regelcatalogus: async (): Promise<ApiResponse<RegelcatalogusData>> => {
      const response = await api.get<ApiResponse<RegelcatalogusData>>('/public/regelcatalogus');
      return response.data;
    },
  },

  hr: {
    profile: async (employeeId: string): Promise<ApiResponse<Record<string, unknown>>> => {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        `/hr/onboarding/profile?employeeId=${encodeURIComponent(employeeId)}`
      );
      return response.data;
    },
    completed: async (): Promise<
      ApiResponse<
        Array<{
          id: string;
          startTime: string;
          endTime: string;
          employeeId: string;
          firstName: string;
          lastName: string;
        }>
      >
    > => {
      const response = await api.get('/hr/onboarding/completed');
      return response.data;
    },
  },

  rip: {
    phase1Active: async (): Promise<
      ApiResponse<
        Array<{
          id: string;
          startTime: string;
          projectNumber: string;
          projectName: string;
          edocsWorkspaceId: string;
          leadRole: string;
        }>
      >
    > => {
      const response = await api.get('/rip/phase1/active');
      return response.data;
    },

    phase1Documents: async (
      instanceId: string
    ): Promise<
      ApiResponse<{
        variables: Record<string, unknown>;
        intakeReport: Record<string, unknown> | null;
        psuReport: Record<string, unknown> | null;
        pdp: Record<string, unknown> | null;
      }>
    > => {
      const response = await api.get(`/rip/phase1/${instanceId}/documents`);
      return response.data;
    },

    phase1Completed: async (): Promise<
      ApiResponse<
        Array<{
          id: string;
          startTime: string;
          endTime: string;
          projectNumber: string;
          projectName: string;
          edocsWorkspaceId: string;
        }>
      >
    > => {
      const response = await api.get('/rip/phase1/completed');
      return response.data;
    },
  },

  admin: {
    auditLogs: async (
      limit = 50,
      offset = 0
    ): Promise<
      ApiResponse<{
        items: AuditLogRecord[];
        pagination: { limit: number; offset: number; total: number; hasMore: boolean };
      }>
    > => {
      const response = await api.get(`/admin/audit?limit=${limit}&offset=${offset}`);
      return response.data;
    },
  },

  capacityClaim: {
    active: async (): Promise<
      ApiResponse<
        Array<{
          id: string;
          startTime: string;
          jobTitle: string;
          requestType: string;
          boardDecision: string;
          advisoryGroup: string;
        }>
      >
    > => {
      const response = await api.get('/hr-capacity/active');
      return response.data;
    },

    completed: async (): Promise<
      ApiResponse<
        Array<{
          id: string;
          startTime: string;
          endTime: string;
          jobTitle: string;
          requestType: string;
          boardDecision: string;
          advisoryGroup: string;
        }>
      >
    > => {
      const response = await api.get('/hr-capacity/completed');
      return response.data;
    },

    documents: async (
      instanceId: string
    ): Promise<
      ApiResponse<{
        variables: Record<string, unknown>;
        boardDecisionNotification: Record<string, unknown> | null;
        capacityClaimHandover: Record<string, unknown> | null;
      }>
    > => {
      const response = await api.get(`/hr-capacity/${instanceId}/documents`);
      return response.data;
    },
  },

  edocs: {
    status: async (): Promise<
      ApiResponse<{
        status: 'up' | 'down' | 'stub';
        library?: string;
        stubMode?: boolean;
        latencyMs?: number;
      }>
    > => {
      const response = await api.get('/edocs/status');
      return response.data;
    },
  },

  mcp: {
    async getSources(): Promise<ApiResponse<McpSourceMeta[]>> {
      const response = await api.get('/mcp/sources');
      return response.data;
    },

    getModels: async (): Promise<ApiResponse<LlmModelEntry[]>> => {
      const response = await api.get('/mcp/models');
      return response.data;
    },

    async *chatStream(
      message: string,
      history: Array<{ role: 'user' | 'assistant'; content: string }>,
      sources: string[],
      modelId: string,
      signal?: AbortSignal
    ): AsyncGenerator<McpChatStreamEvent> {
      if (keycloak.authenticated) {
        try {
          await keycloak.updateToken(120);
        } catch {
          keycloak.login();
          return;
        }
      }

      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}/mcp/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {}),
          },
          body: JSON.stringify({ message, history, sources, modelId }),
          signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        yield { type: 'error', message: (err as Error).message ?? 'Network error' };
        return;
      }

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errData = (await response.json()) as { error?: { message?: string } };
          errorMsg = errData?.error?.message ?? errorMsg;
        } catch {
          // ignore
        }
        yield { type: 'error', message: errorMsg };
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr) {
                try {
                  yield JSON.parse(jsonStr) as McpChatStreamEvent;
                } catch {
                  // ignore malformed SSE line
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  },

  externalStatus: async (): Promise<
    ApiResponse<Record<string, { status: 'up' | 'down'; latency: number }>>
  > => {
    const response = await api.get('/health/external');
    return response.data;
  },

  getBaseUrl: () => API_BASE_URL,
};

// ── LDE public API (no auth required, CORS open) ─────────────────────────

const LDE_API_URL = import.meta.env.VITE_LDE_API_URL as string;

const ldePublic = axios.create({
  baseURL: LDE_API_URL,
});

export const ldeApi = {
  bundles: {
    public: async (): Promise<ApiResponse<ProcessBundle[]>> => {
      const response = await ldePublic.get<ApiResponse<ProcessBundle[]>>('/bundles/public');
      return response.data;
    },
  },
};

// ── Shared public content types (used by portal methods and the dashboard) ──

export interface NieuwsItem {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  publishedAt: string;
  url: string | null;
  source: { id: string; name: string };
}

export interface BerichtItem {
  id: string;
  subject: string;
  preview: string;
  content: string | null;
  type: 'announcement' | 'maintenance' | 'update';
  status: 'published';
  audience: 'all';
  sender: { id: string; name: string };
  publishedAt: string;
  expiresAt: string | null;
  priority: 'low' | 'normal' | 'high';
  isRead: boolean;
  action: { label: string; url: string } | null;
}

export interface CatalogService {
  uri: string;
  title: string;
  description: string;
}

export interface CatalogOrganization {
  uri: string;
  identifier: string;
  name: string;
  homepage: string | null;
  logo: string | null;
  services: Array<{ uri: string; title: string }>;
}

export interface CatalogConcept {
  uri: string;
  prefLabel: string;
  exactMatch: string | null;
  serviceUri: string;
  serviceTitle: string;
}

export interface CatalogRule {
  serviceTitle: string;
  ruleTitle: string;
  validFrom: string | null;
  confidence: string | null;
  description: string | null;
}

export interface RegelcatalogusData {
  services: CatalogService[];
  organizations: CatalogOrganization[];
  concepts: CatalogConcept[];
  rules: CatalogRule[];
}

export interface AuditLogRecord {
  id: number;
  timestamp: string;
  tenant_id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  result: 'success' | 'failure' | 'error';
  error_message: string | null;
  request_id: string | null;
}

export type McpChatStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface McpSourceMeta {
  id: string;
  displayName: string;
  description: string;
  connected: boolean;
}

export interface LlmModelEntry {
  id: string;
  displayName: string;
  providerId: string;
  providerDisplayName: string;
}

export type ProductSoort = 'subsidie' | 'vergunning' | 'bezwaar';

export interface ProductDienstItem {
  id: string;
  title: string;
  description: string;
  url: string;
  audience: ('ondernemer' | 'particulier')[];
  onlineAanvragen: boolean;
  modified: string | null;
  soort: ProductSoort;
}

export interface BundleDeployedForm {
  id: string;
  name: string;
}

export interface BundleDeployedDocument {
  id: string;
  name: string;
}

export interface BundleSubprocess {
  id: string;
  name: string;
  bpmnProcessId: string;
  status: string;
}

export interface ProcessBundle {
  id: string;
  bpmnProcessId: string;
  name: string;
  description?: string;
  processRole: string;
  status: string;
  /** Owning board, tagged at deploy time in LDE (e.g. 'infra-board', 'caseworker'). */
  boardOwner?: string;
  deployedAt: string;
  operatonUrl: string;
  operatonDeploymentId: string;
  linkedDmnTemplates: string[];
  deployedForms: BundleDeployedForm[];
  deployedDocuments: BundleDeployedDocument[];
  subprocesses: BundleSubprocess[];
}
