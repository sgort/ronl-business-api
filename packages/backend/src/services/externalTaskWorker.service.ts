import axios from 'axios';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';
import { edocsService } from '@services/edocs.service';

const logger = createLogger('external-task-worker');

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExternalTask {
  id: string;
  topicName: string;
  processInstanceId: string;
  variables: Record<string, { value: unknown; type: string }>;
}

interface FetchAndLockRequest {
  workerId: string;
  maxTasks: number;
  usePriority: boolean;
  asyncResponseTimeout: number;
  topics: Array<{
    topicName: string;
    lockDuration: number;
    variables: string[];
  }>;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

/**
 * ExternalTaskWorker
 *
 * Polls Operaton's external task API and handles two topics:
 *
 *   rip-edocs-workspace
 *     Reads:  projectNumber, projectName
 *     Writes: edocsWorkspaceId, edocsWorkspaceName, edocsWorkspaceCreated
 *
 *   rip-edocs-document
 *     Reads:  edocsWorkspaceId, projectNumber, projectName,
 *             documentTemplateId, edocsDocumentVariableName
 *     Writes: <edocsDocumentVariableName> (document number),
 *             <edocsDocumentVariableName>_docId
 *
 * Start via start() during server startup. Stop via stop() on SIGTERM/SIGINT.
 */
export class ExternalTaskWorker {
  private readonly workerId = `ronl-worker-${process.pid}`;
  private readonly operatonBaseUrl: string;
  private running = false;
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly asyncResponseTimeout = 20_000;
  private readonly lockDuration = 60_000;
  private readonly idlePollInterval = 5_000;

  constructor() {
    this.operatonBaseUrl = config.operaton.baseUrl;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('ExternalTaskWorker starting', {
      workerId: this.workerId,
      topics: ['rip-edocs-workspace', 'rip-edocs-document'],
    });
    void this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    logger.info('ExternalTaskWorker stopped');
  }

  // ─── Poll loop ────────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const tasks = await this.fetchAndLock();

      if (tasks.length === 0) {
        this.pollTimeout = setTimeout(() => void this.poll(), this.idlePollInterval);
        return;
      }

      await Promise.allSettled(tasks.map((task) => this.handleTask(task)));
    } catch (err) {
      logger.error('Poll error', { error: getErrorMessage(err) });
      this.pollTimeout = setTimeout(() => void this.poll(), this.idlePollInterval);
      return;
    }

    void this.poll();
  }

  // ─── Fetch & lock ─────────────────────────────────────────────────────────────

  private async fetchAndLock(): Promise<ExternalTask[]> {
    const body: FetchAndLockRequest = {
      workerId: this.workerId,
      maxTasks: 10,
      usePriority: false,
      asyncResponseTimeout: this.asyncResponseTimeout,
      topics: [
        {
          topicName: 'rip-edocs-workspace',
          lockDuration: this.lockDuration,
          variables: ['projectNumber', 'projectName'],
        },
        {
          topicName: 'rip-edocs-document',
          lockDuration: this.lockDuration,
          variables: [
            'edocsWorkspaceId',
            'projectNumber',
            'projectName',
            'documentTemplateId',
            'edocsDocumentVariableName',
            'confirmedScope',
            'confirmedBudget',
            'confirmedTimeline',
            'intakeMeetingDate',
            'intakeDecisions',
            'intakeAgreements',
            'psDate',
            'psLocation',
            'psOutcomes',
            'psActionPoints',
            'psRisksIdentified',
            'projectManager',
            'projectSupporter',
            'environmentalManager',
            'projectControlManager',
            'psNotes',
            'riskFileReference',
            'pdpNotes',
            'assignedRoles',
            'contributorId',
            'clientId',
            'projectType',
            'department',
          ],
        },
      ],
    };

    const response = await axios.post<ExternalTask[]>(
      `${this.operatonBaseUrl}/external-task/fetchAndLock`,
      body,
      { headers: { 'Content-Type': 'application/json' } }
    );

    return response.data ?? [];
  }

  // ─── Task dispatch ────────────────────────────────────────────────────────────

  private async handleTask(task: ExternalTask): Promise<void> {
    logger.info('Handling task', {
      taskId: task.id,
      topic: task.topicName,
      processInstanceId: task.processInstanceId,
    });

    try {
      let outputVariables: Record<string, { value: unknown; type: string }> = {};

      switch (task.topicName) {
        case 'rip-edocs-workspace':
          outputVariables = await this.handleEnsureWorkspace(task);
          break;
        case 'rip-edocs-document':
          outputVariables = await this.handleUploadDocument(task);
          break;
        default:
          throw new Error(`Unknown topic: ${task.topicName}`);
      }

      await this.completeTask(task.id, outputVariables);

      logger.info('Task completed', {
        taskId: task.id,
        topic: task.topicName,
        outputKeys: Object.keys(outputVariables),
      });
    } catch (err) {
      logger.error('Task failed', {
        taskId: task.id,
        topic: task.topicName,
        error: getErrorMessage(err),
      });
      await this.failTask(task.id, getErrorMessage(err));
    }
  }

  // ─── Topic handlers ───────────────────────────────────────────────────────────

  private async handleEnsureWorkspace(
    task: ExternalTask
  ): Promise<Record<string, { value: unknown; type: string }>> {
    const projectNumber = String(task.variables['projectNumber']?.value ?? '');
    const projectName = String(task.variables['projectName']?.value ?? '');

    if (!projectNumber || !projectName) {
      throw new Error(
        `rip-edocs-workspace: missing required variables. Got projectNumber="${projectNumber}", projectName="${projectName}"`
      );
    }

    const result = await edocsService.ensureWorkspace(projectNumber, projectName);

    return {
      edocsWorkspaceId: { value: result.workspaceId, type: 'String' },
      edocsWorkspaceName: { value: result.workspaceName, type: 'String' },
      edocsWorkspaceCreated: { value: result.created, type: 'Boolean' },
    };
  }

  private async handleUploadDocument(
    task: ExternalTask
  ): Promise<Record<string, { value: unknown; type: string }>> {
    const workspaceId = String(task.variables['edocsWorkspaceId']?.value ?? '');
    const projectNumber = String(task.variables['projectNumber']?.value ?? '');
    const projectName = String(task.variables['projectName']?.value ?? '');
    const templateId = String(task.variables['documentTemplateId']?.value ?? '');
    const outputVariableName = String(
      task.variables['edocsDocumentVariableName']?.value ?? 'edocsDocumentId'
    );

    if (!workspaceId || !templateId) {
      throw new Error(
        `rip-edocs-document: missing required variables. Got workspaceId="${workspaceId}", templateId="${templateId}"`
      );
    }

    const content = this.renderDocumentContent(templateId, task.variables);
    const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');
    const filename = `${templateId}-${projectNumber}.txt`;
    const docName = `${projectNumber} — ${this.templateIdToLabel(templateId)} — ${projectName}`;

    const result = await edocsService.uploadDocument(workspaceId, filename, contentBase64, {
      docName,
      appId: 'INFRA',
    });

    return {
      [outputVariableName]: { value: result.documentNumber, type: 'String' },
      [`${outputVariableName}_docId`]: { value: result.documentId, type: 'String' },
    };
  }

  // ─── Complete / fail ─────────────────────────────────────────────────────────

  private async completeTask(
    taskId: string,
    variables: Record<string, { value: unknown; type: string }>
  ): Promise<void> {
    await axios.post(
      `${this.operatonBaseUrl}/external-task/${taskId}/complete`,
      { workerId: this.workerId, variables },
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async failTask(taskId: string, errorMessage: string): Promise<void> {
    try {
      await axios.post(
        `${this.operatonBaseUrl}/external-task/${taskId}/failure`,
        { workerId: this.workerId, errorMessage, retries: 0, retryTimeout: 0 },
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      logger.error('Failed to report task failure to Operaton', {
        taskId,
        error: getErrorMessage(err),
      });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private renderDocumentContent(
    templateId: string,
    variables: Record<string, { value: unknown; type: string }>
  ): string {
    const v = (key: string): string => String(variables[key]?.value ?? '—');

    const header = [
      'Province of Flevoland — Infrastructure',
      `Project: ${v('projectName')} (${v('projectNumber')})`,
      `Generated: ${new Date().toISOString()}`,
      '─'.repeat(60),
      '',
    ].join('\n');

    switch (templateId) {
      case 'rip-intake-report':
        return [
          header,
          'INTAKE REPORT (Column 2)',
          '',
          `Decisions: ${v('intakeDecisions')}`,
          `Agreements: ${v('intakeAgreements')}`,
          `Confirmed scope: ${v('confirmedScope')}`,
          `Confirmed budget: ${v('confirmedBudget')}`,
          `Confirmed timeline: ${v('confirmedTimeline')}`,
          `Meeting date: ${v('intakeMeetingDate')}`,
        ].join('\n');

      case 'rip-psu-report':
        return [
          header,
          'PSU REPORT (Column 3)',
          '',
          `PSU date: ${v('psDate')}`,
          `Location: ${v('psLocation')}`,
          `Project manager: ${v('projectManager')}`,
          `Outcomes: ${v('psOutcomes')}`,
          `Action points: ${v('psActionPoints')}`,
          `Risks: ${v('psRisksIdentified')}`,
        ].join('\n');

      case 'rip-pdp':
        return [
          header,
          'PRELIMINARY DESIGN PRINCIPLES (Column 4)',
          '',
          `Scope: ${v('confirmedScope')}`,
          `Budget: ${v('confirmedBudget')}`,
          `Timeline: ${v('confirmedTimeline')}`,
          `Risk dossier (Relatics): ${v('riskFileReference')}`,
          `Design principles: ${v('pdpNotes')}`,
        ].join('\n');

      default:
        return `${header}\nDocument: ${templateId}\n\n(No template renderer registered for this template ID)`;
    }
  }

  private templateIdToLabel(templateId: string): string {
    const labels: Record<string, string> = {
      'rip-intake-report': 'Intake Report',
      'rip-psu-report': 'PSU Report',
      'rip-pdp': 'Preliminary Design Principles',
    };
    return labels[templateId] ?? templateId;
  }
}

export const externalTaskWorker = new ExternalTaskWorker();
export default externalTaskWorker;
