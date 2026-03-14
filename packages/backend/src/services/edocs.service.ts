import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';

const logger = createLogger('edocs-service');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EdocsWorkspaceResult {
  workspaceId: string;
  workspaceName: string;
  /** true when a new workspace was created; false when an existing one was found */
  created: boolean;
}

export interface EdocsDocumentResult {
  documentId: string;
  documentNumber: string;
  workspaceId: string;
}

export interface EdocsDocumentMetadata {
  docName: string;
  appId?: string;
  formName?: string;
  extra?: Record<string, string>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * EdocsService — wrapper around the OpenText eDOCS REST API.
 *
 * Authentication:
 *   POST /connect  →  X-DM-DST session token  →  cached in memory.
 *   Automatically re-authenticates on 401/403.
 *
 * Stub mode:
 *   When EDOCS_STUB_MODE=true (default) all methods return realistic fake
 *   responses. The stub is transparent — callers cannot distinguish stub from live.
 */
export class EdocsService {
  private client: AxiosInstance;
  private sessionToken: string | null = null;
  private readonly stubMode: boolean;

  constructor() {
    this.stubMode = config.edocs.stubMode;

    this.client = axios.create({
      baseURL: config.edocs.baseUrl,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((cfg) => {
      if (this.sessionToken) {
        cfg.headers['X-DM-DST'] = this.sessionToken;
      }
      return cfg;
    });

    if (this.stubMode) {
      logger.info('[EdocsService] Running in STUB MODE — no real eDOCS calls will be made');
    }
  }

  // ─── Authentication ──────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.stubMode) {
      this.sessionToken = 'stub-session-token';
      return;
    }

    logger.info('Connecting to eDOCS DM Server', {
      baseUrl: config.edocs.baseUrl,
      library: config.edocs.library,
      userId: config.edocs.userId,
    });

    const response = await this.client.post('/connect', {
      data: {
        userid: config.edocs.userId,
        password: config.edocs.password,
        library: config.edocs.library,
      },
    });

    // The spec returns the session token as Set-Cookie on /connect.
    // Extract the token value from the first cookie.
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const token = cookieHeader?.split(';')[0]?.split('=').slice(1).join('=') ?? undefined;

    if (!token) {
      throw new Error(
        'eDOCS connect() succeeded but no session token found in Set-Cookie response header'
      );
    }

    this.sessionToken = token;
    logger.info('Connected to eDOCS — session token cached');
  }

  private async ensureConnected(): Promise<void> {
    if (!this.sessionToken) {
      await this.connect();
    }
  }

  private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureConnected();
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        logger.warn('eDOCS session expired — re-authenticating');
        this.sessionToken = null;
        await this.connect();
        return await fn();
      }
      throw err;
    }
  }

  // ─── Workspaces ──────────────────────────────────────────────────────────────

  async ensureWorkspace(projectNumber: string, projectName: string): Promise<EdocsWorkspaceResult> {
    if (this.stubMode) {
      const stubId = `stub-ws-${projectNumber.replace(/[^a-zA-Z0-9]/g, '-')}`;
      logger.info('[stub] ensureWorkspace()', { projectNumber, projectName, stubId });
      return {
        workspaceId: stubId,
        workspaceName: `${projectNumber} — ${projectName}`,
        created: false,
      };
    }

    return this.withAuth(async () => {
      const workspaceName = `${projectNumber} — ${projectName}`;

      const searchResponse = await this.client.get('/workspaces', {
        params: {
          library: config.edocs.library,
          filter: `DOCNAME like '${projectNumber}%'`,
          max: 1,
        },
      });

      const list: Array<{ id: string; data: { DOCNAME: string } }> =
        searchResponse.data?.data?.list ?? [];

      if (list.length > 0) {
        const existing = list[0];
        logger.info('Found existing eDOCS workspace', {
          projectNumber,
          workspaceId: existing.id,
        });
        return { workspaceId: existing.id, workspaceName: existing.data.DOCNAME, created: false };
      }

      logger.info('Creating new eDOCS workspace', { workspaceName });
      const createResponse = await this.client.post(
        '/workspaces',
        {
          data: {
            DOCNAME: workspaceName,
            AUTHOR_ID: config.edocs.userId,
            APP_ID: 'INFRA',
          },
        },
        { params: { library: config.edocs.library } }
      );

      const newWorkspaceId: string = createResponse.data?.data?.id ?? createResponse.data?.id;

      logger.info('eDOCS workspace created', { workspaceName, newWorkspaceId });
      return { workspaceId: newWorkspaceId, workspaceName, created: true };
    });
  }

  // ─── Documents ───────────────────────────────────────────────────────────────

  async uploadDocument(
    workspaceId: string,
    filename: string,
    contentBase64: string,
    metadata: EdocsDocumentMetadata
  ): Promise<EdocsDocumentResult> {
    if (this.stubMode) {
      const stubDocId = `stub-doc-${Date.now()}`;
      const stubDocNumber = `STUB-${Date.now()}`;
      logger.info('[stub] uploadDocument()', {
        workspaceId,
        filename,
        docName: metadata.docName,
      });
      return { documentId: stubDocId, documentNumber: stubDocNumber, workspaceId };
    }

    return this.withAuth(async () => {
      logger.info('Uploading document to eDOCS', {
        workspaceId,
        filename,
        docName: metadata.docName,
      });

      const response = await this.client.post(
        '/documents',
        {
          file: contentBase64,
          data: {
            DOCNAME: metadata.docName,
            AUTHOR_ID: config.edocs.userId,
            TYPIST_ID: config.edocs.userId,
            APP_ID: metadata.appId ?? 'INFRA',
            ...(metadata.formName
              ? {
                  _restapi: {
                    form_name: metadata.formName,
                    ref: {
                      type: 'workspace',
                      id: parseInt(workspaceId, 10),
                      lib: config.edocs.library,
                    },
                  },
                }
              : {
                  _restapi: {
                    ref: {
                      type: 'workspace',
                      id: parseInt(workspaceId, 10),
                      lib: config.edocs.library,
                    },
                  },
                }),
            ...(metadata.extra ?? {}),
          },
        },
        { params: { library: config.edocs.library } }
      );

      const documentId: string = response.data?.data?.id ?? response.data?.id;
      const documentNumber: string = response.data?.data?.DOCNUMBER ?? documentId;

      logger.info('Document uploaded to eDOCS', { documentId, documentNumber, workspaceId });
      return { documentId, documentNumber, workspaceId };
    });
  }

  async getWorkspaceDocuments(
    workspaceId: string
  ): Promise<Array<{ id: string; name: string; documentNumber: string }>> {
    if (this.stubMode) {
      logger.info('[stub] getWorkspaceDocuments()', { workspaceId });
      return [
        {
          id: 'stub-doc-1',
          name: 'rip-intake-report.pdf',
          documentNumber: '2993898',
        },
        {
          id: 'stub-doc-2',
          name: 'rip-psu-report.pdf',
          documentNumber: '2993899',
        },
      ];
    }

    return this.withAuth(async () => {
      const response = await this.client.get(`/workspaces/${workspaceId}/documents`, {
        params: { library: config.edocs.library },
      });

      const list: Array<{ id: string; data: { DOCNAME: string; DOCNUMBER: string } }> =
        response.data?.data?.list ?? [];

      return list.map((item) => ({
        id: item.id,
        name: item.data.DOCNAME,
        documentNumber: item.data.DOCNUMBER,
      }));
    });
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{
    status: 'up' | 'down' | 'stub';
    latency?: number;
    error?: string;
  }> {
    if (this.stubMode) {
      return { status: 'stub' };
    }
    try {
      const start = Date.now();
      await this.client.get('/libraries');
      return { status: 'up', latency: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: getErrorMessage(err) };
    }
  }
}

export const edocsService = new EdocsService();
export default edocsService;
