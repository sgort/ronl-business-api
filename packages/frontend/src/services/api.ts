import axios from 'axios';
import keycloak from './keycloak';
import type { ApiResponse, OperatonVariable, HealthResponse } from '@ronl/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth interceptor
api.interceptors.request.use(async (config) => {
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

export const businessApi = {
  health: async (): Promise<HealthResponse> => {
    const response = await api.get<ApiResponse<HealthResponse>>('/health');
    return response.data.data as HealthResponse;
  },

  evaluateDecision: async (decisionKey: string, variables: Record<string, OperatonVariable>) => {
    try {
      const response = await api.post<ApiResponse>(`/decision/${decisionKey}/evaluate`, {
        variables,
      });
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data) {
        // Return the structured error body from the backend instead of the generic axios message
        return error.response.data as ApiResponse;
      }
      throw error;
    }
  },

  getBaseUrl: () => API_BASE_URL,
};
