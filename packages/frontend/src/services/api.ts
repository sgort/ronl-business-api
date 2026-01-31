import axios from 'axios';
import { getToken } from './keycloak';
import type { OperatonVariable, DecisionRequest, ApiResponse, HealthResponse } from '@ronl/shared';

const API_BASE_URL = 'http://localhost:3002/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export { OperatonVariable, DecisionRequest, ApiResponse, HealthResponse };

export const businessApi = {
  // Health check
  async health(): Promise<HealthResponse> {
    const response = await apiClient.get('/health');
    return response.data.data;
  },

  // Evaluate DMN decision
  async evaluateDecision(
    decisionKey: string,
    variables: Record<string, OperatonVariable>
  ): Promise<ApiResponse> {
    const response = await apiClient.post(`/decision/${decisionKey}/evaluate`, {
      variables,
    });
    return response.data;
  },

  // Start BPMN process
  async startProcess(
    processKey: string,
    variables: Record<string, OperatonVariable>
  ): Promise<ApiResponse> {
    const response = await apiClient.post(`/process/${processKey}/start`, {
      variables,
    });
    return response.data;
  },
};
