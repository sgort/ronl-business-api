import axios from 'axios';
import keycloak from './keycloak';
import type {
  ApiResponse,
  OperatonVariable,
  HealthResponse,
  ProcessStatusResponse,
  Task,
} from '@ronl/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

export const businessApi = {
  // ── Health ────────────────────────────────────────────────────────────────

  health: async (): Promise<HealthResponse> => {
    const response = await api.get<ApiResponse<HealthResponse>>('/health');
    return response.data.data as HealthResponse;
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
      const response = await api.post<ApiResponse<ProcessStatusResponse>>(
        `/process/${processKey}/start`,
        { variables, businessKey }
      );
      return response.data;
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

  // ── Utilities ─────────────────────────────────────────────────────────────

  getBaseUrl: () => API_BASE_URL,
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

export interface RegelcatalogusData {
  services: CatalogService[];
  organizations: CatalogOrganization[];
  concepts: CatalogConcept[];
}
