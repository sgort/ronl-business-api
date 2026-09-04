import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';
import {
  OperatonVariable,
  ProcessStartRequest,
  ProcessInstance,
  Task,
  ActivityHistoryItem,
} from '@ronl/shared';
import type { DocumentTemplate } from '@services/document/documentTemplate.types';

const logger = createLogger('operaton-service');

export interface TaskCompleteRequest {
  variables?: Record<string, OperatonVariable>;
}

/**
 * Service for interacting with Operaton BPMN Engine
 */
export class OperatonService {
  private client: AxiosInstance;

  /**
   * Cache of processDefinitionKey → boardOwner. Process-definition XML is
   * immutable per key/version, so a deployment-lifetime cache is safe and avoids
   * re-fetching BPMN on every archive load. `null` (no tag) is cached too.
   */
  private boardOwnerCache = new Map<string, string | null>();

  /**
   * Cache of processDefinitionId → BPMN XML. The XML for a given definition
   * id is immutable in Operaton, so this never needs invalidating. Without it,
   * every opened task refetches the whole document from the engine.
   */
  private bpmnXmlCache = new Map<string, string>();

  /**
   * Cache of `${tenantId}:${processKey}` → BPMN XML for phase swimlane
   * models, fetched by process-definition key (see getPhaseBpmnXml). Keyed
   * separately from bpmnXmlCache, which is keyed by definition id.
   */
  private phaseBpmnCache = new Map<string, string>();

  constructor(baseUrl?: string, username?: string, password?: string) {
    const resolvedBaseUrl = baseUrl ?? config.operaton.baseUrl;
    const resolvedUsername = username ?? config.operaton.username;
    const resolvedPassword = password ?? config.operaton.password;

    this.client = axios.create({
      baseURL: resolvedBaseUrl,
      timeout: config.operaton.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
      ...(resolvedUsername &&
        resolvedPassword && {
          auth: {
            username: resolvedUsername,
            password: resolvedPassword,
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
   * List active process instances. Optional params are passed through directly
   * to the Operaton /process-instance query string (e.g. businessKey, processDefinitionKey).
   * No tenant filter is applied — intended for M2M callers.
   */
  async listProcessInstances(params?: Record<string, unknown>): Promise<unknown[]> {
    const response = await this.client.get('/process-instance', { params });
    return response.data;
  }

  /**
   * Query process instance history. The body is passed through directly to
   * Operaton POST /history/process-instance — callers control all filters
   * (variables, processDefinitionKey, finished, sorting, etc.).
   * No tenant filter is applied — intended for M2M callers.
   */
  async queryProcessHistory(body: Record<string, unknown>): Promise<unknown[]> {
    const response = await this.client.post('/history/process-instance', body);
    return response.data;
  }

  /**
   * Fetch decision definition metadata by key from Operaton.
   * Returns the raw Operaton response object.
   */
  async getDecisionDefinition(key: string): Promise<unknown> {
    const response = await this.client.get(`/decision-definition/key/${key}`);
    return response.data;
  }

  /**
   * Given a list of process-definition keys, return the subset that is
   * actually deployed on this environment's Operaton instance. One query
   * regardless of how many keys are asked about.
   */
  async getDeployedProcessKeys(keys: string[], tenantId?: string): Promise<string[]> {
    try {
      const response = await this.client.get('/process-definition', {
        params: {
          keysIn: keys.join(','),
          latestVersion: true,
          ...(tenantId ? { tenantIdIn: tenantId } : {}),
        },
      });
      const found = new Set((response.data as Array<{ key: string }>).map((d) => d.key));
      return keys.filter((k) => found.has(k));
    } catch (error) {
      logger.error('Failed to query deployed process keys', {
        keys,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * For each given process-definition key, the count of active (WIP) and
   * completed (Gereed) instances on this environment's Operaton instance.
   * Count-only queries — no instance payloads.
   */
  async getPhaseInstanceCounts(
    keys: string[],
    tenantId?: string
  ): Promise<Record<string, { wip: number; gereed: number }>> {
    const entries = await Promise.all(
      keys.map(async (key) => {
        const [wipRes, gereedRes] = await Promise.all([
          this.client.get('/process-instance/count', {
            params: { processDefinitionKey: key, ...(tenantId ? { tenantIdIn: tenantId } : {}) },
          }),
          this.client.get('/history/process-instance/count', {
            params: {
              processDefinitionKey: key,
              finished: true,
              ...(tenantId ? { tenantIdIn: tenantId } : {}),
            },
          }),
        ]);
        return [key, { wip: wipRes.data.count, gereed: gereedRes.data.count }] as const;
      })
    );
    return Object.fromEntries(entries);
  }

  /**
   * Discover the Operaton-native tenant-id a process-definition key is
   * actually deployed under, via the untenanted list endpoint — unlike the
   * /process-definition/key/{key}/... shorthand, this resolves regardless of
   * tenant-id and returns each matching definition's own tenantId. Used to
   * correctly scope processes that are deployed under a fixed tenant
   * different from the calling citizen's own (e.g. AwbZorgtoeslagProcess,
   * always handled under toeslagen regardless of which tenant's citizen is
   * calling) instead of assuming the citizen's tenant is the process's
   * tenant. If the same key has coexisting rows under multiple tenants (a
   * legacy untenanted deployment alongside a newer tenant-scoped one), the
   * tenant-scoped row wins. Returns null if the key isn't deployed, is
   * deployed untenanted, or the lookup itself fails — callers should fall
   * back to their own best guess.
   */
  private async resolveDeployedTenant(processKey: string): Promise<string | null> {
    try {
      const response = await this.client.get('/process-definition', {
        params: { key: processKey, latestVersion: true },
      });
      const defs = response.data as Array<{ tenantId: string | null }>;
      const tenantScoped = defs.find((d) => d.tenantId !== null);
      return tenantScoped?.tenantId ?? defs[0]?.tenantId ?? null;
    } catch (error) {
      logger.warn('Failed to resolve deployed tenant; falling back to caller-provided tenant', {
        processKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
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

      // Try the tenant-scoped start first, scoped to the process's own
      // *actual* deployed tenant (not necessarily the calling citizen's own
      // tenant — e.g. AwbZorgtoeslagProcess is always handled under
      // toeslagen regardless of which tenant's citizen is calling).
      // Deployments made via LDE's mandatory-organization deploy flow carry
      // Operaton's own native tenant-id and are invisible to the untenanted
      // /start shorthand below — Operaton only resolves
      // /process-definition/key/{key}/start against definitions deployed
      // with *no* tenant-id. Not every process is tenant-scoped yet, so
      // fall back to the untenanted lookup when the scoped one reports no
      // matching definition.
      const deployedTenant = await this.resolveDeployedTenant(processKey);
      const scopeTenant = deployedTenant ?? tenantId;
      let response;
      try {
        response = await this.client.post(
          `/process-definition/key/${processKey}/tenant-id/${scopeTenant}/start`,
          request
        );
      } catch (scopedError) {
        const scopedBody = axios.isAxiosError(scopedError) ? scopedError.response?.data : null;
        const scopedMessage: string = scopedBody?.message ?? '';
        if (!scopedMessage.includes('No matching process definition with key')) {
          throw scopedError;
        }
        response = await this.client.post(`/process-definition/key/${processKey}/start`, request);
      }

      logger.info('Process started successfully', {
        processKey,
        processInstanceId: response.data.id,
        tenantId,
      });

      return response.data;
    } catch (error) {
      const operatonBody = axios.isAxiosError(error) ? error.response?.data : null;
      const operatonMessage: string = operatonBody?.message ?? '';

      logger.error('Failed to start process', {
        processKey,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Detect a missing deployment and throw a descriptive message instead
      // of leaking Operaton's raw engine wording.
      if (operatonMessage.includes('No matching process definition with key')) {
        throw new Error(
          `Proces '${processKey}' is niet gevonden op deze Operaton-omgeving. Controleer of de BPMN-bundel voor dit proces is gedeployed en probeer het opnieuw.`
        );
      }

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
   * Get the activity history (executed steps) of a process instance, oldest
   * first. Surfaces the automated steps (service/external tasks, decisions,
   * gateways, events) that never appear in the task inbox, so callers can show
   * "what the engine did" between user tasks. Works for running and completed
   * instances (subject to historyTimeToLive).
   */
  async getActivityHistory(processInstanceId: string): Promise<ActivityHistoryItem[]> {
    try {
      const response = await this.client.get('/history/activity-instance', {
        params: {
          processInstanceId,
          sortBy: 'startTime',
          sortOrder: 'asc',
          maxResults: 500,
        },
      });

      const items = response.data as Array<{
        id: string;
        activityId: string;
        activityName: string | null;
        activityType: string;
        assignee: string | null;
        startTime: string;
        endTime: string | null;
        durationInMillis: number | null;
        canceled: boolean;
      }>;

      return items.map((a) => ({
        id: a.id,
        activityId: a.activityId,
        activityName: a.activityName,
        activityType: a.activityType,
        assignee: a.assignee,
        startTime: a.startTime,
        endTime: a.endTime,
        durationInMillis: a.durationInMillis,
        canceled: a.canceled,
      }));
    } catch (error) {
      logger.error('Failed to get activity history', {
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
  async getProcessHistory(
    applicantId: string,
    tenantId: string,
    orgType?: string,
    isCaseworker?: boolean
  ): Promise<unknown[]> {
    try {
      const filters: { name: string; operator: string; value: string }[] = [
        { name: 'applicantId', operator: 'eq', value: applicantId },
      ];
      // Caseworkers see all processes for their municipality — apply the municipality
      // filter to scope their queue. Citizens query only their own history via
      // applicantId, which already provides full isolation regardless of which
      // processing authority handled the process (e.g. toeslagen for zorgtoeslag).
      if (isCaseworker) {
        filters.push({ name: 'municipality', operator: 'eq', value: tenantId });
      }
      const response = await this.client.post('/history/process-instance', {
        variables: filters,
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
   * Resolve a task's process variables from HISTORY rather than the runtime
   * task API -- for exactly the situation getDecisionDocument's own comment
   * already describes: Operaton's active /task/{id} 404s the moment a task
   * completes, because completing it is what removes it from the runtime.
   *
   * Unlike /history/process-instance (which DOES have a single-resource
   * /{id} form -- see getDecisionDocument's histRes call above), Operaton has
   * NO path-parameter form for a single historic task: /history/task/{id}
   * 404s unconditionally, regardless of whether the task exists. The only
   * real lookup is the QUERY endpoint, GET /history/task?taskId=..., which
   * returns an ARRAY (verified directly against a running engine: the path
   * form 404s, the query form returns exactly one match). This looks the
   * task up that way to recover its processInstanceId, then reads that
   * instance's final historic variables.
   *
   * Returns null ONLY when the query genuinely returns zero results -- that
   * is "no such task", not "Operaton is unreachable". Any other failure
   * (network error, timeout, 5xx) is logged and rethrown, so a transport
   * failure can never be mistaken for "there is no such task" by a caller
   * that only checks for null.
   */
  async getHistoricTaskVariables(taskId: string): Promise<Record<string, unknown> | null> {
    let processInstanceId: string;
    try {
      const response = await this.client.get('/history/task', { params: { taskId } });
      const tasks: Array<{ processInstanceId: string }> = response.data;
      if (tasks.length === 0) {
        return null;
      }
      processInstanceId = tasks[0].processInstanceId;
    } catch (error) {
      logger.error('Failed to get historic task', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
    return this.getHistoricVariables(processInstanceId);
  }

  /**
   * Find the most recent completed HrOnboardingProcess for a given employeeId.
   * Returns flattened historic variables, or null if no completed instance found.
   */
  async getHrOnboardingProfile(
    employeeId: string,
    tenantId: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.client.post('/history/process-instance', {
        processDefinitionKey: 'HrOnboardingProcess',
        finished: true,
        variables: [
          { name: 'employeeId', operator: 'eq', value: employeeId },
          { name: 'municipality', operator: 'eq', value: tenantId },
        ],
        sorting: [{ sortBy: 'endTime', sortOrder: 'desc' }],
      });

      const instances = response.data as { id: string }[];
      if (!instances.length) return null;

      return this.getHistoricVariables(instances[0].id);
    } catch (error) {
      logger.error('Failed to get HR onboarding profile', {
        employeeId,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * List all completed HrOnboardingProcess instances for a municipality,
   * enriched with key display variables (employeeId, firstName, lastName).
   */
  async getHrOnboardingCompletedList(tenantId: string): Promise<
    Array<{
      id: string;
      startTime: string;
      endTime: string;
      employeeId: string;
      firstName: string;
      lastName: string;
    }>
  > {
    // 1. Fetch completed instances filtered by municipality variable
    const instancesRes = await this.client.post('/history/process-instance', {
      processDefinitionKey: 'HrOnboardingProcess',
      finished: true,
      variables: [{ name: 'municipality', operator: 'eq', value: tenantId }],
      sorting: [{ sortBy: 'endTime', sortOrder: 'desc' }],
    });

    const instances: Array<{ id: string; startTime: string; endTime: string }> = instancesRes.data;
    if (instances.length === 0) return [];

    // 2. Bulk-fetch all variables for all instance IDs in one request
    const ids = instances.map((i) => i.id).join(',');
    const varsRes = await this.client.get('/history/variable-instance', {
      params: {
        processInstanceIdIn: ids,
        deserializeValues: true,
      },
    });

    // 3. Index variables by processInstanceId, keep only display fields
    const varMap: Record<string, Record<string, string>> = {};
    for (const v of varsRes.data as { processInstanceId: string; name: string; value: unknown }[]) {
      if (!['employeeId', 'firstName', 'lastName'].includes(v.name)) continue;
      if (!varMap[v.processInstanceId]) varMap[v.processInstanceId] = {};
      varMap[v.processInstanceId][v.name] = String(v.value ?? '');
    }

    return instances.map((i) => ({
      id: i.id,
      startTime: i.startTime,
      endTime: i.endTime,
      employeeId: varMap[i.id]?.employeeId ?? '—',
      firstName: varMap[i.id]?.firstName ?? '—',
      lastName: varMap[i.id]?.lastName ?? '—',
    }));
  }

  /**
   * Fetch BPMN XML for a process definition, caching by processDefinitionId.
   * Operaton's BPMN XML is immutable for a given definition id, so the cache
   * never needs invalidating.
   */
  private async getCachedBpmnXml(processDefinitionId: string): Promise<string> {
    const cached = this.bpmnXmlCache.get(processDefinitionId);
    if (cached) return cached;
    const res = await this.client.get(`/process-definition/${processDefinitionId}/xml`);
    const xml: string = res.data.bpmn20Xml;
    this.bpmnXmlCache.set(processDefinitionId, xml);
    return xml;
  }

  /**
   * Reads a ronl:* attribute from ONE user task rather than from the first
   * match anywhere in the document. Scoping matters: a process can tag several
   * tasks, and which one carries the attribute is the whole point.
   */
  private readTaskRonlAttribute(
    bpmnXml: string,
    taskDefinitionKey: string,
    attribute: string
  ): string | null {
    const escaped = taskDefinitionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const element = new RegExp(`<bpmn:userTask\\b[^>]*\\bid="${escaped}"[^>]*>`).exec(bpmnXml);
    if (!element) return null;
    const attr = new RegExp(`\\b${attribute}="([^"]+)"`).exec(element[0]);
    return attr ? attr[1] : null;
  }

  /**
   * Resolves ronl:signatureRef on a single user task to its deployed
   * DocumentTemplate. Returns null when the task is not signature-bearing,
   * which is the common case for every ordinary task in the app.
   */
  async getTaskSignatureSpec(
    processInstanceId: string,
    taskDefinitionKey: string
  ): Promise<{ templateId: string; template: DocumentTemplate } | null> {
    const histRes = await this.client.get(`/history/process-instance/${processInstanceId}`);
    const processDefinitionId: string = histRes.data.processDefinitionId;

    const bpmnXml = await this.getCachedBpmnXml(processDefinitionId);
    const templateId = this.readTaskRonlAttribute(bpmnXml, taskDefinitionKey, 'ronl:signatureRef');
    if (!templateId) return null;

    const template = await this.fetchDeployedTemplate(
      processInstanceId,
      taskDefinitionKey,
      templateId
    );
    return { templateId, template };
  }

  /**
   * Fetch a named template's deployed `.document` resource for a process
   * instance. Used by the document-render path once the template id is
   * already known (e.g. rip-pdp's `documentTemplateId` process variable),
   * unlike getTaskSignatureSpec which first has to resolve the template id
   * from the tagged task's ronl:signatureRef attribute.
   */
  async getDeployedTemplate(
    processInstanceId: string,
    templateId: string
  ): Promise<DocumentTemplate> {
    return this.fetchDeployedTemplate(processInstanceId, undefined, templateId);
  }

  /**
   * Shared deployment-resource lookup behind getTaskSignatureSpec and
   * getDeployedTemplate: process instance -> process definition -> deployment
   * -> named `.document` resource -> parsed template. taskDefinitionKey is
   * only used for the not-found log line and is undefined when called from
   * getDeployedTemplate, which has no task in play.
   */
  private async fetchDeployedTemplate(
    processInstanceId: string,
    taskDefinitionKey: string | undefined,
    templateId: string
  ): Promise<DocumentTemplate> {
    const histRes = await this.client.get(`/history/process-instance/${processInstanceId}`);
    const processDefinitionId: string = histRes.data.processDefinitionId;

    const procDefRes = await this.client.get(`/process-definition/${processDefinitionId}`);
    const deploymentId: string = procDefRes.data.deploymentId;

    const resourcesRes = await this.client.get(`/deployment/${deploymentId}/resources`);
    const resources: Array<{ id: string; name: string; deploymentId: string }> = resourcesRes.data;
    const resource = resources.find((r) => r.name === `${templateId}.document`);
    if (!resource) {
      logger.error('named template has no deployment resource', {
        processInstanceId,
        taskDefinitionKey,
        templateId,
      });
      throw new Error('SIGNATURE_TEMPLATE_NOT_FOUND');
    }

    const dataRes = await this.client.get(
      `/deployment/${deploymentId}/resources/${resource.id}/data`,
      {
        responseType: 'text',
      }
    );
    return JSON.parse(dataRes.data) as DocumentTemplate;
  }

  /**
   * Find the running process instance tracking a given ValidSign package, along
   * with its process variables and its single open user task. Used by the
   * ValidSign webhook and poller to locate what to complete once a signature
   * finishes; both look the instance up fresh on every call, since neither can
   * assume the other hasn't already acted on it.
   *
   * Returns null when no running instance carries that validsignPackageId, or
   * when it has no open task left to complete (the process has already moved
   * on).
   */
  async findInstanceByValidsignPackage(packageId: string): Promise<{
    processInstanceId: string;
    taskId: string;
    status: string;
    edocsWorkspaceId?: string;
    department?: string;
    documentId?: string;
    projectNumber?: string;
  } | null> {
    try {
      const instancesRes = await this.client.get('/process-instance', {
        params: { variables: `validsignPackageId_eq_${packageId}` },
      });
      const instances: Array<{ id: string }> = instancesRes.data;
      if (instances.length === 0) return null;

      const processInstanceId = instances[0].id;
      const [variables, tasksRes] = await Promise.all([
        this.getProcessVariables(processInstanceId),
        this.client.get('/task', { params: { processInstanceId } }),
      ]);
      const tasks: Array<{ id: string }> = tasksRes.data;
      if (tasks.length === 0) return null;

      const value = (name: string): unknown => variables[name]?.value;
      return {
        processInstanceId,
        taskId: tasks[0].id,
        status: String(value('validsignStatus') ?? ''),
        edocsWorkspaceId: value('edocsWorkspaceId') as string | undefined,
        department: value('department') as string | undefined,
        documentId: value('validsignDocumentId') as string | undefined,
        projectNumber: value('projectNumber') as string | undefined,
      };
    } catch (error) {
      logger.error('Failed to find process instance by ValidSign package', {
        packageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * List every running instance whose validsignStatus variable is 'sent' —
   * a package handed to ValidSign but not yet resolved. Used by the poller
   * (validsignPoller.service.ts) to sweep for signatures whose completion
   * webhook never arrived: it drives `completeSignature` for each package id
   * this returns, which is itself a no-op if nothing has actually changed.
   */
  async findInstancesAwaitingSignature(): Promise<
    Array<{ processInstanceId: string; validsignPackageId: string }>
  > {
    try {
      const instancesRes = await this.client.get('/process-instance', {
        params: { variables: 'validsignStatus_eq_sent' },
      });
      const instances: Array<{ id: string }> = instancesRes.data;
      if (instances.length === 0) return [];

      // allSettled, not all: one instance with a corrupt/unreadable variable
      // set (or referencing something since deleted) must not take down the
      // whole sweep. Promise.all would reject on that single row and discard
      // every other instance's result, and because this poller is the only
      // completion path in local development, that one poisoned instance
      // would silently stop every signature -- for every project -- from
      // ever completing again, with nothing but a generic "sweep failed"
      // line to show for it. Log the offending instance by id and move on.
      const settled = await Promise.allSettled(
        instances.map(async (instance) => {
          const variables = await this.getProcessVariables(instance.id);
          const packageId = variables.validsignPackageId?.value;
          return packageId
            ? { processInstanceId: instance.id, validsignPackageId: String(packageId) }
            : null;
        })
      );

      const results: Array<{ processInstanceId: string; validsignPackageId: string }> = [];
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') {
          if (outcome.value) results.push(outcome.value);
          return;
        }
        logger.warn('Skipping one instance while sweeping for awaited signatures', {
          processInstanceId: instances[index].id,
          error: getErrorMessage(outcome.reason),
        });
      });

      return results;
    } catch (error) {
      logger.error('Failed to find process instances awaiting signature', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Set (merge) process variables on a running instance.
   */
  async setProcessVariables(
    processInstanceId: string,
    variables: Record<string, OperatonVariable>
  ): Promise<void> {
    try {
      await this.client.post(`/process-instance/${processInstanceId}/variables`, {
        modifications: variables,
      });
    } catch (error) {
      logger.error('Failed to set process variables', {
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
   *
   * NOTE: unlike getTaskSignatureSpec(), this is intentionally NOT scoped to a
   * single <bpmn:userTask>. It has no task key to scope to (see class docs /
   * task-5 report for why scoping it would change its return-first-match
   * contract and break its existing callers/tests).
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
   * Get tasks for a user, filtered by tenant (via process variable) and, if
   * provided, by candidate groups. When candidateGroups is a non-empty array,
   * Operaton returns only tasks assigned to at least one of those groups.
   * Passing an empty array returns no tasks — callers should omit the argument
   * (or pass undefined) if they want no group filter applied.
   */
  async getUserTasks(
    userId?: string,
    tenantId?: string,
    candidateGroups?: string[]
  ): Promise<Task[]> {
    try {
      const params: Record<string, string> = {};
      if (tenantId) {
        params['processVariables'] = `municipality_eq_${tenantId}`;
      }
      if (candidateGroups && candidateGroups.length > 0) {
        // Operaton's candidateGroups parameter does an OR match across the list
        params['candidateGroups'] = candidateGroups.join(',');
        // By default a candidateGroups query only returns *unassigned* tasks, so a
        // task vanishes from the list the moment a caseworker claims it. Opt in to
        // assigned tasks too, so claimed work stays visible (and shows up under the
        // "Mijn claim" filter for the assignee).
        params['includeAssignedTasks'] = 'true';
      }

      const response = await this.client.get('/task', { params });

      const tasks: Task[] = response.data;
      if (tasks.length === 0) return tasks;

      const uniqueDefIds = [...new Set(tasks.map((t) => t.processDefinitionId))];
      const defKeyMap: Record<string, string> = {};
      await Promise.all(
        uniqueDefIds.map(async (defId) => {
          if (defId.includes(':')) {
            defKeyMap[defId] = defId.split(':')[0];
            return;
          }
          try {
            const defRes = await this.client.get(`/process-definition/${defId}`);
            defKeyMap[defId] = defRes.data.key ?? defId;
          } catch {
            defKeyMap[defId] = defId;
          }
        })
      );

      return tasks.map((t) => ({
        ...t,
        processDefinitionKey: defKeyMap[t.processDefinitionId] ?? t.processDefinitionId,
      }));
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
   * Get completed (historic) tasks for a tenant, most recent first.
   * Joins the historic task list with historic process instances to surface
   * each task's process businessKey (used as the dossier identifier in the UI).
   */
  async getCompletedTasks(tenantId: string): Promise<
    Array<{
      id: string;
      name: string;
      assignee: string | null;
      taskDefinitionKey: string;
      processDefinitionKey: string | null;
      processInstanceId: string;
      businessKey: string | null;
      startTime: string;
      endTime: string;
      duration: number;
      boardOwner: string | null;
    }>
  > {
    try {
      // 1. Historic tasks for this tenant.
      const taskResponse = await this.client.get('/history/task', {
        params: {
          finished: true,
          processVariables: `municipality_eq_${tenantId}`,
          sortBy: 'endTime',
          sortOrder: 'desc',
          maxResults: 200,
        },
      });
      const tasks = taskResponse.data as Array<{
        id: string;
        name: string;
        assignee: string | null;
        taskDefinitionKey: string;
        processDefinitionKey: string | null;
        processInstanceId: string;
        startTime: string;
        endTime: string;
        duration: number;
      }>;

      if (tasks.length === 0) {
        return [];
      }

      // 2. Look up businessKey per process instance. Distinct ids only — multiple
      //    completed tasks frequently share one process instance.
      const distinctIds = Array.from(new Set(tasks.map((t) => t.processInstanceId)));
      const instancesRes = await this.client.post('/history/process-instance', {
        processInstanceIds: distinctIds,
      });
      const businessKeyById = new Map<string, string | null>();
      for (const inst of instancesRes.data as Array<{
        id: string;
        businessKey: string | null;
      }>) {
        businessKeyById.set(inst.id, inst.businessKey ?? null);
      }

      // 3. Resolve the owning board per distinct process-definition key (cached),
      //    so the archive can be split by board without a hardcoded allowlist.
      const distinctKeys = Array.from(
        new Set(tasks.map((t) => t.processDefinitionKey).filter((k): k is string => !!k))
      );
      const boardOwnerByKey = new Map<string, string | null>();
      await Promise.all(
        distinctKeys.map(async (key) => {
          boardOwnerByKey.set(key, await this.getBoardOwner(key, tenantId));
        })
      );

      // 4. Merge businessKey + boardOwner into each task.
      return tasks.map((t) => ({
        ...t,
        businessKey: businessKeyById.get(t.processInstanceId) ?? null,
        boardOwner: t.processDefinitionKey
          ? (boardOwnerByKey.get(t.processDefinitionKey) ?? null)
          : null,
      }));
    } catch (error) {
      logger.error('Failed to get completed tasks', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Try a tenant-scoped Operaton lookup by process-definition key, falling
   * back to the untenanted shorthand when Operaton reports no matching
   * definition — the same pattern startProcess already uses. `suffix` is the
   * URL path segment following `/process-definition/key/{key}` (and, when
   * tenant-scoped, `/tenant-id/{tenantId}`), e.g. '/xml' or
   * '/deployed-start-form'.
   */
  private async getByKeyWithTenantFallback<T>(
    processKey: string,
    tenantId: string | undefined,
    suffix: string,
    options?: { responseType?: 'text' }
  ): Promise<{ data: T; headers: Record<string, string> }> {
    if (tenantId) {
      try {
        const url = `/process-definition/key/${encodeURIComponent(processKey)}/tenant-id/${encodeURIComponent(tenantId)}${suffix}`;
        const result = options
          ? await this.client.get<T>(url, options)
          : await this.client.get<T>(url);
        return result as { data: T; headers: Record<string, string> };
      } catch (scopedError) {
        const scopedBody = axios.isAxiosError(scopedError) ? scopedError.response?.data : null;
        // `responseType: 'text'` switches axios's JSON parsing off for the
        // *error* body too, so callers that ask for text (the deployed start
        // form) get Operaton's 404 as an unparsed string with no `.message`.
        // Match the raw body in that case, or the fallback never fires and
        // every untenanted process 404s for any caller carrying a tenant.
        const scopedMessage: string =
          typeof scopedBody === 'string' ? scopedBody : (scopedBody?.message ?? '');
        if (!scopedMessage.includes('No matching process definition with key')) {
          throw scopedError;
        }
      }
    }
    const url = `/process-definition/key/${encodeURIComponent(processKey)}${suffix}`;
    const result = options ? await this.client.get<T>(url, options) : await this.client.get<T>(url);
    return result as { data: T; headers: Record<string, string> };
  }

  /**
   * Resolve the owning board of a process by reading the `boardOwner` extension
   * property from its deployed BPMN (tagged at deploy time by LDE). Cached per key.
   * Returns null for untagged/legacy processes or on any lookup failure, so callers
   * can fall back to their static split without the archive ever breaking.
   */
  async getBoardOwner(processDefinitionKey: string, tenantId?: string): Promise<string | null> {
    if (!processDefinitionKey) return null;
    const cacheKey = `${tenantId ?? ''}::${processDefinitionKey}`;
    const cached = this.boardOwnerCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let owner: string | null = null;
    try {
      const res = await this.getByKeyWithTenantFallback<{ bpmn20Xml?: string }>(
        processDefinitionKey,
        tenantId,
        '/xml'
      );
      const xml: string = res.data?.bpmn20Xml ?? '';
      // Match the property regardless of name/value attribute order.
      const m =
        xml.match(/<camunda:property\b[^>]*\bname="boardOwner"[^>]*\bvalue="([^"]*)"/) ??
        xml.match(/<camunda:property\b[^>]*\bvalue="([^"]*)"[^>]*\bname="boardOwner"/);
      owner = m ? m[1] : null;
    } catch (error) {
      logger.warn('Failed to resolve boardOwner; treating as untagged', {
        processDefinitionKey,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      owner = null;
    }

    this.boardOwnerCache.set(cacheKey, owner);
    return owner;
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
   * Get all process variables for a task, resolved via the task's processInstanceId.
   */
  async getTaskVariables(taskId: string): Promise<Record<string, unknown>> {
    const task = await this.getTask(taskId);
    const variables = await this.getProcessVariables(task.processInstanceId);
    const plain: Record<string, unknown> = {};
    for (const [key, variable] of Object.entries(variables)) {
      plain[key] = variable.value;
    }
    return plain;
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
  async getDeployedStartForm(
    processKey: string,
    tenantId?: string
  ): Promise<{ data: string; contentType: string }> {
    try {
      const deployedTenant = await this.resolveDeployedTenant(processKey);
      const response = await this.getByKeyWithTenantFallback<string>(
        processKey,
        deployedTenant ?? tenantId,
        '/deployed-start-form',
        { responseType: 'text' }
      );
      const contentType: string = response.headers['content-type'] ?? 'application/octet-stream';
      return { data: response.data, contentType };
    } catch (error) {
      logger.error('Failed to fetch deployed start form', {
        processKey,
        tenantId,
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

  /**
   * List active (unfinished) instances of one RIP phase process for a
   * municipality, enriched with projectNumber, projectName, edocsWorkspaceId.
   *
   * businessKey identifies the project's whole journey rather than one
   * instance: R2.1 mints it and every later phase started for that project
   * inherits it. It is what lets the board tell whether a project has already
   * started the next phase.
   * The caller resolves the phase code to its process-definition key via
   * RIP_PHASE_KEYS -- this method takes the key, not the code.
   */
  async getRipPhaseActiveList(
    processDefinitionKey: string,
    tenantId: string
  ): Promise<
    {
      id: string;
      businessKey: string | null;
      startTime: string;
      projectNumber: string;
      projectName: string;
      edocsWorkspaceId: string;
      leadRole: string;
    }[]
  > {
    const instancesRes = await this.client.post('/history/process-instance', {
      processDefinitionKey,
      unfinished: true,
      variables: [{ name: 'municipality', operator: 'eq', value: tenantId }],
      sorting: [{ sortBy: 'startTime', sortOrder: 'desc' }],
    });

    const instances: Array<{ id: string; businessKey: string | null; startTime: string }> =
      instancesRes.data;
    if (instances.length === 0) return [];

    const ids = instances.map((i) => i.id).join(',');
    const varsRes = await this.client.get('/history/variable-instance', {
      params: { processInstanceIdIn: ids, deserializeValues: true },
    });

    const varMap: Record<string, Record<string, string>> = {};
    for (const v of varsRes.data as { processInstanceId: string; name: string; value: unknown }[]) {
      if (!['projectNumber', 'projectName', 'edocsWorkspaceId', 'leadRole'].includes(v.name))
        continue;
      if (!varMap[v.processInstanceId]) varMap[v.processInstanceId] = {};
      varMap[v.processInstanceId][v.name] = String(v.value ?? '');
    }

    return instances.map((i) => ({
      id: i.id,
      businessKey: i.businessKey ?? null,
      startTime: i.startTime,
      projectNumber: varMap[i.id]?.projectNumber ?? '—',
      projectName: varMap[i.id]?.projectName ?? '—',
      edocsWorkspaceId: varMap[i.id]?.edocsWorkspaceId ?? '—',
      // Ownership signal (B): the process's declared lead role. Empty when the
      // instance predates the leadRole contract — the frontend defaults it.
      leadRole: varMap[i.id]?.leadRole ?? '',
    }));
  }

  /**
   * Fetch an instance's document templates from its own deployment bundle,
   * together with the current process variables (via history API — works for
   * active instances). Documents not present in the deployment return null.
   *
   * Instance-keyed rather than phase-keyed on purpose: the deployment is
   * resolved from the instance itself, so this works for any RIP process.
   * The three resource names below (intakeReport, psuReport, pdp) are R2.1's
   * document set, not a general RIP convention — when a later phase ships
   * documents of its own, this returns null for all three rather than
   * guessing. Generalising the set is a design question for that moment.
   */
  async getRipInstanceDocuments(processInstanceId: string): Promise<{
    variables: Record<string, unknown>;
    intakeReport: Record<string, unknown> | null;
    psuReport: Record<string, unknown> | null;
    pdp: Record<string, unknown> | null;
  }> {
    // 1. Variables (history API works for active instances)
    const varsRes = await this.client.get('/history/variable-instance', {
      params: { processInstanceId, deserializeValues: true },
    });
    const variables: Record<string, unknown> = {};
    for (const v of varsRes.data as { name: string; value: unknown }[]) {
      variables[v.name] = v.value;
    }

    // 2. Resolve deployment
    const histRes = await this.client.get(`/history/process-instance/${processInstanceId}`);
    const processDefinitionId: string = histRes.data.processDefinitionId;
    const procDefRes = await this.client.get(`/process-definition/${processDefinitionId}`);
    const deploymentId: string = procDefRes.data.deploymentId;

    // 3. List resources
    const resourcesRes = await this.client.get(`/deployment/${deploymentId}/resources`);
    const resources: Array<{ id: string; name: string }> = resourcesRes.data;

    // 4. Fetch each named .document resource, null if absent
    const fetchDoc = async (name: string): Promise<Record<string, unknown> | null> => {
      const resource = resources.find((r) => r.name === `${name}.document`);
      if (!resource) return null;
      const dataRes = await this.client.get(
        `/deployment/${deploymentId}/resources/${resource.id}/data`,
        { responseType: 'text' }
      );
      return JSON.parse(dataRes.data) as Record<string, unknown>;
    };

    const [intakeReport, psuReport, pdp] = await Promise.all([
      fetchDoc('rip-intake-report'),
      fetchDoc('rip-psu-report'),
      fetchDoc('rip-pdp'),
    ]);

    return { variables, intakeReport, psuReport, pdp };
  }

  /**
   * List completed (finished) instances of one RIP phase process for a
   * municipality. Takes the process-definition key, not the phase code.
   */
  async getRipPhaseCompletedList(
    processDefinitionKey: string,
    tenantId: string
  ): Promise<
    {
      id: string;
      businessKey: string | null;
      startTime: string;
      endTime: string;
      projectNumber: string;
      projectName: string;
      edocsWorkspaceId: string;
    }[]
  > {
    const instancesRes = await this.client.post('/history/process-instance', {
      processDefinitionKey,
      finished: true,
      variables: [{ name: 'municipality', operator: 'eq', value: tenantId }],
      sorting: [{ sortBy: 'endTime', sortOrder: 'desc' }],
    });

    const instances: Array<{
      id: string;
      businessKey: string | null;
      startTime: string;
      endTime: string;
    }> = instancesRes.data;
    if (instances.length === 0) return [];

    const ids = instances.map((i) => i.id).join(',');
    const varsRes = await this.client.get('/history/variable-instance', {
      params: { processInstanceIdIn: ids, deserializeValues: true },
    });

    const varMap: Record<string, Record<string, string>> = {};
    for (const v of varsRes.data as { processInstanceId: string; name: string; value: unknown }[]) {
      if (!['projectNumber', 'projectName', 'edocsWorkspaceId'].includes(v.name)) continue;
      if (!varMap[v.processInstanceId]) varMap[v.processInstanceId] = {};
      varMap[v.processInstanceId][v.name] = String(v.value ?? '');
    }

    return instances.map((i) => ({
      id: i.id,
      businessKey: i.businessKey ?? null,
      startTime: i.startTime,
      endTime: i.endTime,
      projectNumber: varMap[i.id]?.projectNumber ?? '—',
      projectName: varMap[i.id]?.projectName ?? '—',
      edocsWorkspaceId: varMap[i.id]?.edocsWorkspaceId ?? '—',
    }));
  }

  /**
   * BPMN XML for a phase's process definition, fetched BY KEY so a phase with
   * no running instance still resolves — mock portfolio rows need a diagram
   * too. Cached per key+tenant: Operaton's XML is immutable for a definition,
   * and a redeploy produces a new definition id under the same key, so the
   * cache is refreshed by restart rather than invalidated.
   */
  async getPhaseBpmnXml(processKey: string, tenantId?: string): Promise<string> {
    const cacheKey = `${tenantId ?? ''}::${processKey}`;
    const cached = this.phaseBpmnCache.get(cacheKey);
    if (cached) return cached;
    const res = await this.getByKeyWithTenantFallback<{ bpmn20Xml: string }>(
      processKey,
      tenantId,
      '/xml'
    );
    const xml = res.data.bpmn20Xml;
    this.phaseBpmnCache.set(cacheKey, xml);
    return xml;
  }

  /**
   * List active (unfinished) ManagementCapacityClaimProcess instances for a tenant,
   * enriched with jobTitle, requestType, boardDecision, advisoryGroup.
   */
  async getCapacityClaimActiveList(tenantId: string): Promise<
    {
      id: string;
      startTime: string;
      jobTitle: string;
      requestType: string;
      boardDecision: string;
      advisoryGroup: string;
    }[]
  > {
    const instancesRes = await this.client.post('/history/process-instance', {
      processDefinitionKey: 'ManagementCapacityClaimProcess',
      unfinished: true,
      variables: [{ name: 'municipality', operator: 'eq', value: tenantId }],
      sorting: [{ sortBy: 'startTime', sortOrder: 'desc' }],
    });

    const instances: Array<{ id: string; startTime: string }> = instancesRes.data;
    if (instances.length === 0) return [];

    const ids = instances.map((i) => i.id).join(',');
    const varsRes = await this.client.get('/history/variable-instance', {
      params: { processInstanceIdIn: ids, deserializeValues: true },
    });

    const wanted = ['jobTitle', 'requestType', 'boardDecision', 'advisoryGroup'];
    const varMap: Record<string, Record<string, string>> = {};
    for (const v of varsRes.data as { processInstanceId: string; name: string; value: unknown }[]) {
      if (!wanted.includes(v.name)) continue;
      if (!varMap[v.processInstanceId]) varMap[v.processInstanceId] = {};
      varMap[v.processInstanceId][v.name] = String(v.value ?? '');
    }

    return instances.map((i) => ({
      id: i.id,
      startTime: i.startTime,
      jobTitle: varMap[i.id]?.jobTitle ?? '—',
      requestType: varMap[i.id]?.requestType ?? '—',
      boardDecision: varMap[i.id]?.boardDecision ?? '—',
      advisoryGroup: varMap[i.id]?.advisoryGroup ?? '—',
    }));
  }

  /**
   * List completed ManagementCapacityClaimProcess instances for a tenant,
   * enriched with jobTitle, requestType, boardDecision, advisoryGroup.
   */
  async getCapacityClaimCompletedList(tenantId: string): Promise<
    {
      id: string;
      startTime: string;
      endTime: string;
      jobTitle: string;
      requestType: string;
      boardDecision: string;
      advisoryGroup: string;
    }[]
  > {
    const instancesRes = await this.client.post('/history/process-instance', {
      processDefinitionKey: 'ManagementCapacityClaimProcess',
      finished: true,
      variables: [{ name: 'municipality', operator: 'eq', value: tenantId }],
      sorting: [{ sortBy: 'endTime', sortOrder: 'desc' }],
    });

    const instances: Array<{ id: string; startTime: string; endTime: string }> = instancesRes.data;
    if (instances.length === 0) return [];

    const ids = instances.map((i) => i.id).join(',');
    const varsRes = await this.client.get('/history/variable-instance', {
      params: { processInstanceIdIn: ids, deserializeValues: true },
    });

    const wanted = ['jobTitle', 'requestType', 'boardDecision', 'advisoryGroup'];
    const varMap: Record<string, Record<string, string>> = {};
    for (const v of varsRes.data as { processInstanceId: string; name: string; value: unknown }[]) {
      if (!wanted.includes(v.name)) continue;
      if (!varMap[v.processInstanceId]) varMap[v.processInstanceId] = {};
      varMap[v.processInstanceId][v.name] = String(v.value ?? '');
    }

    return instances.map((i) => ({
      id: i.id,
      startTime: i.startTime,
      endTime: i.endTime,
      jobTitle: varMap[i.id]?.jobTitle ?? '—',
      requestType: varMap[i.id]?.requestType ?? '—',
      boardDecision: varMap[i.id]?.boardDecision ?? '—',
      advisoryGroup: varMap[i.id]?.advisoryGroup ?? '—',
    }));
  }

  /**
   * Fetch both document templates (board-decision-notification, capacity-claim-handover)
   * for a ManagementCapacityClaimProcess instance, together with current process variables.
   * Either template may be null if not present in the deployment bundle.
   * Variables come from the history API, so active and completed instances both work.
   */
  async getCapacityClaimDocuments(processInstanceId: string): Promise<{
    variables: Record<string, unknown>;
    boardDecisionNotification: Record<string, unknown> | null;
    capacityClaimHandover: Record<string, unknown> | null;
  }> {
    // 1. Variables
    const varsRes = await this.client.get('/history/variable-instance', {
      params: { processInstanceId, deserializeValues: true },
    });
    const variables: Record<string, unknown> = {};
    for (const v of varsRes.data as { name: string; value: unknown }[]) {
      variables[v.name] = v.value;
    }

    // 2. Resolve deployment
    const histRes = await this.client.get(`/history/process-instance/${processInstanceId}`);
    const processDefinitionId: string = histRes.data.processDefinitionId;
    const procDefRes = await this.client.get(`/process-definition/${processDefinitionId}`);
    const deploymentId: string = procDefRes.data.deploymentId;

    // 3. List resources
    const resourcesRes = await this.client.get(`/deployment/${deploymentId}/resources`);
    const resources: Array<{ id: string; name: string }> = resourcesRes.data;

    // 4. Fetch each named .document resource, null if absent
    const fetchDoc = async (name: string): Promise<Record<string, unknown> | null> => {
      const resource = resources.find((r) => r.name === `${name}.document`);
      if (!resource) return null;
      const dataRes = await this.client.get(
        `/deployment/${deploymentId}/resources/${resource.id}/data`,
        { responseType: 'text' }
      );
      return JSON.parse(dataRes.data) as Record<string, unknown>;
    };

    const [boardDecisionNotification, capacityClaimHandover] = await Promise.all([
      fetchDoc('board-decision-notification-nl'),
      fetchDoc('capacity-claim-handover-nl'),
    ]);

    return { variables, boardDecisionNotification, capacityClaimHandover };
  }
}

export const operatonService = new OperatonService();
export default operatonService;
