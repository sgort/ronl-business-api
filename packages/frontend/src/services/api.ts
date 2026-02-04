import axios from 'axios';
import keycloak from './keycloak';
import type { ApiResponse, OperatonVariable, HealthResponse } from '@ronl/shared';

// Check if we're in production based on hostname
const isProduction =
  typeof window !== 'undefined' && window.location.hostname === 'mijn.open-regels.nl';
const API_BASE_URL = isProduction ? 'https://api.open-regels.nl/v1' : 'http://localhost:3002/v1';

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
    const response = await api.post<ApiResponse>(`/decision/${decisionKey}/evaluate`, {
      variables,
    });
    return response.data;
  },

  getBaseUrl: () => API_BASE_URL,
};
