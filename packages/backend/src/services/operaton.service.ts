import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { OperatonVariable, ProcessStartRequest, ProcessInstance, Task } from '@ronl/shared';

const logger = createLogger('operaton-service');

export interface TaskCompleteRequest {
  variables?: Record<string, OperatonVariable>;
}

/**
 * Service for interacting with Operaton BPMN Engine
 */
export class OperatonService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.operaton.baseUrl,
      timeout: config.operaton.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
      // Add basic auth if credentials are provided
      ...(config.operaton.username &&
        config.operaton.password && {
          auth: {
            username: config.operaton.username,
            password: config.operaton.password,
          },
        }),
    });

    // Request interceptor for logging
    this.client.interceptors.request.use((config) => {
      logger.debug('Operaton request', {
        method: config.method,
        url: config.url,
        data: config.data,
      });
      return config;
    });

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Operaton response', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error('Operaton error', {
          message: error.message,
          response: error.response?.data,
        });
        throw error;
      }
    );
  }

  /**
   * Start a process instance
   */
  async startProcess(
    processKey: string,
    request: ProcessStartRequest,
    tenantId: string
  ): Promise<ProcessInstance> {
    try {
      logger.info('Starting process', {
        processKey,
        tenantId,
        businessKey: request.businessKey,
      });

      // Add tenant ID to variables if not present
      if (!request.variables.municipality) {
        request.variables.municipality = {
          value: tenantId,
          type: 'String',
        };
      }

      const response = await this.client.post(
        `/process-definition/key/${processKey}/start`,
        request
      );

      logger.info('Process started successfully', {
        processKey,
        processInstanceId: response.data.id,
        tenantId,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to start process', {
        processKey,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get process instance details
   */
  async getProcessInstance(processInstanceId: string): Promise<ProcessInstance> {
    try {
      const response = await this.client.get(`/process-instance/${processInstanceId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get process instance', {
        processInstanceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get process variables
   */
  async getProcessVariables(processInstanceId: string): Promise<Record<string, OperatonVariable>> {
    try {
      const response = await this.client.get(`/process-instance/${processInstanceId}/variables`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get process variables', {
        processInstanceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete (cancel) a process instance
   */
  async deleteProcessInstance(processInstanceId: string, reason?: string): Promise<void> {
    try {
      await this.client.delete(`/process-instance/${processInstanceId}`, {
        params: { skipCustomListeners: false, skipIoMappings: false },
        data: { reason: reason || 'Cancelled by user' },
      });

      logger.info('Process instance deleted', {
        processInstanceId,
        reason,
      });
    } catch (error) {
      logger.error('Failed to delete process instance', {
        processInstanceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get historical process instances for a citizen by applicantId,
   * scoped to the caseworker's/citizen's municipality (tenant isolation).
   */
  async getProcessHistory(applicantId: string, tenantId: string): Promise<unknown[]> {
    try {
      const response = await this.client.post('/history/process-instance', {
        variables: [
          { name: 'applicantId', operator: 'eq', value: applicantId },
          { name: 'municipality', operator: 'eq', value: tenantId },
        ],
        sorting: [{ sortBy: 'startTime', sortOrder: 'desc' }],
      });

      logger.info('Process history retrieved', {
        applicantId,
        tenantId,
        count: response.data.length,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get process history', {
        applicantId,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Fetch final historic variable values for a completed process instance.
   */
  async getHistoricVariables(processInstanceId: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get('/history/variable-instance', {
        params: { processInstanceId, deserializeValues: true },
      });

      // Flatten [{name, value}] → {name: value}
      const flat: Record<string, unknown> = {};
      for (const v of response.data as { name: string; value: unknown }[]) {
        flat[v.name] = v.value;
      }
      return flat;
    } catch (error) {
      logger.error('Failed to get historic variables', {
        processInstanceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Fetch the DocumentTemplate linked via camunda:documentRef on any UserTask in the BPMN
   * associated with the given process instance. Works for completed instances via the history API.
   * Throws Error('DOCUMENT_NOT_FOUND') when no camunda:documentRef is present or the deployment
   * resource is absent.
   */
  async getDecisionDocument(processInstanceId: string): Promise<Record<string, unknown>> {
    // 1. Resolve processDefinitionId via history API (active /process-instance/{id} returns 404 for COMPLETED)
    const histRes = await this.client.get(`/history/process-instance/${processInstanceId}`);
    const processDefinitionId: string = histRes.data.processDefinitionId;

    // 2. Fetch BPMN XML for that definition
    const xmlRes = await this.client.get(`/process-definition/${processDefinitionId}/xml`);
    const bpmnXml: string = xmlRes.data.bpmn20Xml;

    // 3. Find ronl:documentRef on any UserTask — scan all occurrences and take the first
    const docRefMatch = bpmnXml.match(/ronl:documentRef="([^"]+)"/);
    if (!docRefMatch) {
      throw new Error('DOCUMENT_NOT_FOUND');
    }
    const documentRef = docRefMatch[1];

    // 4. Get deploymentId from the process definition record
    const procDefRes = await this.client.get(`/process-definition/${processDefinitionId}`);
    const deploymentId: string = procDefRes.data.deploymentId;

    // 5. List resources in that deployment, find the .document file
    const resourcesRes = await this.client.get(`/deployment/${deploymentId}/resources`);
    const resources: Array<{ id: string; name: string; deploymentId: string }> = resourcesRes.data;
    const docResource = resources.find((r) => r.name === `${documentRef}.document`);
    if (!docResource) {
      throw new Error('DOCUMENT_NOT_FOUND');
    }

    // 6. Fetch the raw JSON of the DocumentTemplate resource
    const dataRes = await this.client.get(
      `/deployment/${deploymentId}/resources/${docResource.id}/data`,
      { responseType: 'text' }
    );
    return JSON.parse(dataRes.data) as Record<string, unknown>;
  }

  /**
   * Fetch deduplicated variable names and types from Operaton history
   * for a given process definition key.
   * Used by the Document Composer BindingPanel for variable discovery.
   */
  async getVariableHints(processKey: string): Promise<Array<{ name: string; type: string }>> {
    try {
      const response = await this.client.get('/history/variable-instance', {
        params: { processDefinitionKey: processKey, firstResult: 0, maxResults: 500 },
      });

      const seen = new Map<string, string>();
      for (const v of response.data as { name: string; type: string }[]) {
        seen.set(v.name, v.type ?? 'String');
      }

      return Array.from(seen.entries())
        .map(([name, type]) => ({ name, type }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.error('Failed to get variable hints', {
        processKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get tasks for a user
   */
  async getUserTasks(userId: string, tenantId: string): Promise<Task[]> {
    try {
      const response = await this.client.get('/task', {
        params: {
          processVariables: `municipality_eq_${tenantId}`,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get user tasks', {
        userId,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get task details
   */
  async getTask(taskId: string): Promise<Task> {
    try {
      const response = await this.client.get(`/task/${taskId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get task', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string, request: TaskCompleteRequest): Promise<void> {
    try {
      logger.info('Completing task', { taskId });

      await this.client.post(`/task/${taskId}/complete`, request);

      logger.info('Task completed successfully', { taskId });
    } catch (error) {
      logger.error('Failed to complete task', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Claim a task
   */
  async claimTask(taskId: string, userId: string): Promise<void> {
    try {
      await this.client.post(`/task/${taskId}/claim`, { userId });

      logger.info('Task claimed', { taskId, userId });
    } catch (error) {
      logger.error('Failed to claim task', {
        taskId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Evaluate a DMN decision
   */
  async evaluateDecision(
    decisionKey: string,
    variables: Record<string, OperatonVariable>,
    tenantId: string
  ): Promise<unknown> {
    try {
      logger.info('Evaluating DMN', { decisionKey, tenantId });

      // Add tenant to variables
      const evaluationVariables = {
        ...variables,
        municipality: {
          value: tenantId,
          type: 'String',
        },
      };

      const response = await this.client.post(`/decision-definition/key/${decisionKey}/evaluate`, {
        variables: evaluationVariables,
      });

      logger.info('DMN evaluation completed', { decisionKey });

      return response.data;
    } catch (error) {
      const operatonBody = axios.isAxiosError(error) ? error.response?.data : null;
      const operatonMessage: string = operatonBody?.message ?? '';

      logger.error('Failed to evaluate DMN', {
        decisionKey,
        tenantId,
        operatonError: operatonBody,
      });

      // Detect known Operaton engine errors and throw with a descriptive message
      // instead of leaking the raw axios "Request failed with status code 500".
      if (operatonMessage.includes("Exception while evaluating decision with key 'null'")) {
        throw new Error(
          `DMN configuratiefout in beslissingstabel '${decisionKey}': meerdere regels zijn tegelijk van toepassing, maar de hit policy staat slechts één treffer toe. Neem contact op met de beheerder.`
        );
      }

      if (
        operatonMessage.includes('decision-definition') &&
        operatonBody?.type === 'RestException'
      ) {
        throw new Error(
          `De beslissingstabel '${decisionKey}' kon niet worden geëvalueerd door een configuratiefout in de regelengine. Neem contact op met de beheerder.`
        );
      }

      // For any other Operaton error, surface the engine message rather than hiding it
      if (operatonMessage) {
        throw new Error(operatonMessage);
      }

      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'up' | 'down'; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();
      await this.client.get('/version');
      const latency = Date.now() - startTime;

      return { status: 'up', latency };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch the deployed start form for a process definition by key.
   * Returns the raw form content as a string; callers must detect content type.
   * Camunda Forms (.form) will be valid JSON. Embedded HTML forms will be HTML.
   */
  async getDeployedStartForm(processKey: string): Promise<{ data: string; contentType: string }> {
    try {
      const response = await this.client.get(
        `/process-definition/key/${processKey}/deployed-start-form`,
        { responseType: 'text' }
      );
      const contentType: string = response.headers['content-type'] ?? 'application/octet-stream';
      return { data: response.data as string, contentType };
    } catch (error) {
      logger.error('Failed to fetch deployed start form', {
        processKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Fetch the deployed task form for a user task by task ID.
   * Returns the raw form content as a string; callers must detect content type.
   * Camunda Forms (.form) will be valid JSON. Embedded HTML forms will be HTML.
   */
  async getDeployedTaskForm(taskId: string): Promise<{ data: string; contentType: string }> {
    try {
      const response = await this.client.get(`/task/${taskId}/deployed-form`, {
        responseType: 'text',
      });
      const contentType: string = response.headers['content-type'] ?? 'application/octet-stream';
      return { data: response.data as string, contentType };
    } catch (error) {
      logger.error('Failed to fetch deployed task form', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

export const operatonService = new OperatonService();
export default operatonService;
