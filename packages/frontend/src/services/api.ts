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
    /**
     * Start a new process instance.
     * POST /v1/process/:key/start
     */
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

    /**
     * Fetch the deployed Camunda Forms schema for a process start event.
     * Returns 404 if no form is linked, 415 if the form is embedded HTML (not supported).
     * GET /v1/process/:key/start-form
     */
    startForm: async (processKey: string): Promise<ApiResponse<unknown>> => {
      const response = await api.get<ApiResponse<unknown>>(`/process/${processKey}/start-form`);
      return response.data;
    },

    /**
     * Get process instance status.
     * GET /v1/process/:id/status
     */
    status: async (processInstanceId: string): Promise<ApiResponse<ProcessStatusResponse>> => {
      const response = await api.get<ApiResponse<ProcessStatusResponse>>(
        `/process/${processInstanceId}/status`
      );
      return response.data;
    },

    /**
     * Get all variables of a process instance.
     * GET /v1/process/:id/variables
     */
    variables: async (processInstanceId: string): Promise<ApiResponse<Record<string, unknown>>> => {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        `/process/${processInstanceId}/variables`
      );
      return response.data;
    },

    /**
     * Cancel (delete) a process instance.
     * DELETE /v1/process/:id
     */
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
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────

  task: {
    /**
     * List open tasks for the authenticated caseworker's municipality.
     * GET /v1/task
     */
    list: async (): Promise<ApiResponse<Task[]>> => {
      const response = await api.get<ApiResponse<Task[]>>('/task');
      return response.data;
    },

    /**
     * Get a single task by ID.
     * GET /v1/task/:id
     */
    get: async (taskId: string): Promise<ApiResponse<Task>> => {
      const response = await api.get<ApiResponse<Task>>(`/task/${taskId}`);
      return response.data;
    },

    /**
     * Fetch the deployed Camunda Forms schema for a user task.
     * Returns 404 if no form is linked, 415 if the form is embedded HTML (not supported).
     * GET /v1/task/:id/form-schema
     */
    formSchema: async (taskId: string): Promise<ApiResponse<unknown>> => {
      const response = await api.get<ApiResponse<unknown>>(`/task/${taskId}/form-schema`);
      return response.data;
    },

    /**
     * Get all process variables for a task.
     * GET /v1/task/:id/variables
     */
    variables: async (taskId: string): Promise<ApiResponse<Record<string, unknown>>> => {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        `/task/${taskId}/variables`
      );
      return response.data;
    },

    /**
     * Claim a task for the authenticated caseworker.
     * POST /v1/task/:id/claim
     */
    claim: async (taskId: string): Promise<ApiResponse> => {
      const response = await api.post<ApiResponse>(`/task/${taskId}/claim`);
      return response.data;
    },

    /**
     * Complete a task with submitted variables.
     * POST /v1/task/:id/complete
     */
    complete: async (taskId: string, variables: Record<string, unknown>): Promise<ApiResponse> => {
      const response = await api.post<ApiResponse>(`/task/${taskId}/complete`, { variables });
      return response.data;
    },

    /**
     * Get the deployed Camunda Form schema for a task.
     * GET /v1/task/:id/form-schema
     */
    formSchema: async (taskId: string): Promise<ApiResponse<Record<string, unknown>>> => {
      const response = await api.get<ApiResponse<Record<string, unknown>>>(
        `/task/${taskId}/form-schema`
      );
      return response.data;
    },
  },

  // ── Utilities ─────────────────────────────────────────────────────────────

  getBaseUrl: () => API_BASE_URL,
};
