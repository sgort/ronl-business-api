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

  // Cache the last login probe so /health polling cannot hammer the login
  // endpoint (and risk locking the account) when credentials are wrong.
  private authProbe: { at: number; authenticated: boolean; error?: string } | null = null;
  private readonly authProbeTtlMs = 30_000;

  constructor() {
    this.stubMode = config.edocs.stubMode;

    this.client = axios.create({
      baseURL: config.edocs.baseUrl,
      timeout: 15_000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((cfg) => {
      if (this.sessionToken) {
        // Send all cookies back as Cookie header
        cfg.headers['Cookie'] = this.sessionToken;
        // Also send X-DM-DST value alone as a header (some endpoints require this)
        const dstValue = this.sessionToken
          .split('; ')
          .find((c) => c.startsWith('X-DM-DST='))
          ?.split('=')[1];
        if (dstValue) {
          cfg.headers['X-DM-DST'] = dstValue;
        }
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

    let response;
    try {
      response = await this.client.post('connect', {
        data: {
          userid: config.edocs.userId,
          password: config.edocs.password,
          library: config.edocs.library,
        },
      });
    } catch (err) {
      this.logUpstreamError('connect', err);
      throw err;
    }

    const setCookies = response.headers['set-cookie'] ?? [];
    const cookieArray = Array.isArray(setCookies) ? setCookies : [setCookies];

    // Extract each cookie value by name
    const findCookie = (name: string): string | undefined => {
      const match = cookieArray.find((c) => c.startsWith(`${name}=`));
      return match?.split(';')[0]; // returns "NAME=VALUE"
    };

    const dmDst = findCookie('X-DM-DST');
    const dmCsrf = findCookie('X-DM-CSRF-TOKEN');

    if (!dmDst) {
      throw new Error('eDOCS connect() succeeded but X-DM-DST cookie was absent from response');
    }

    // Store both cookies to send on subsequent requests
    this.sessionToken = [dmDst, dmCsrf].filter(Boolean).join('; ');
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
      this.logUpstreamError('request', err);
      throw err;
    }
  }

  /**
   * Surface the upstream eDOCS response body (e.g. account-lockout, permission,
   * or validation errors) in the log. eDOCS returns `{ ERROR: { message, rapi_code } }`,
   * which axios buries on `error.response.data` — without this it would never
   * reach the log, leaving only "Request failed with status code 400".
   */
  private logUpstreamError(operation: string, err: unknown): void {
    const response = (err as { response?: { status?: number; data?: unknown } }).response;
    if (response) {
      logger.error(`eDOCS ${operation} returned an error response`, {
        status: response.status,
        upstream: response.data,
      });
    }
  }

  // ─── Workspaces ──────────────────────────────────────────────────────────────

  async listWorkspaces(): Promise<unknown[]> {
    if (this.stubMode) {
      logger.info('[stub] listWorkspaces()');
      return [{ id: 'stub-ws-1', name: 'Stub Workspace' }];
    }

    return this.withAuth(async () => {
      const response = await this.client.get('workspaces', {
        params: { library: config.edocs.library, max: 10 },
      });
      return response.data?.data?.list ?? [];
    });
  }

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

      const searchResponse = await this.client.get('workspaces', {
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
        'workspaces',
        {
          data: {
            DOCNAME: workspaceName,
            AUTHOR_ID: config.edocs.userId,
            TYPIST_ID: config.edocs.userId,
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
        'documents',
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
      const response = await this.client.get(`workspaces/${workspaceId}/documents`, {
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
    reachable: boolean;
    authenticated: boolean;
    latency?: number;
    error?: string;
  }> {
    if (this.stubMode) {
      return { status: 'stub', reachable: true, authenticated: true };
    }

    // 1. Reachability — an unauthenticated GET, always safe to call.
    let latency: number | undefined;
    try {
      const start = Date.now();
      await this.client.get('libraries');
      latency = Date.now() - start;
    } catch (err) {
      return {
        status: 'down',
        reachable: false,
        authenticated: false,
        error: this.upstreamMessage(err),
      };
    }

    // 2. True login — can we actually authenticate? (throttled; see probeAuth)
    const auth = await this.probeAuth();

    return {
      status: auth.authenticated ? 'up' : 'down',
      reachable: true,
      authenticated: auth.authenticated,
      latency,
      ...(auth.error ? { error: auth.error } : {}),
    };
  }

  /**
   * Validates that the configured credentials can log in. Reuses a live session
   * when one exists (so it never re-logs-in during normal operation), and caches
   * a failed result for authProbeTtlMs so repeated /health polls with bad
   * credentials cannot lock the account out.
   */
  private async probeAuth(): Promise<{ authenticated: boolean; error?: string }> {
    if (this.sessionToken) return { authenticated: true };

    const now = Date.now();
    if (
      this.authProbe &&
      !this.authProbe.authenticated &&
      now - this.authProbe.at < this.authProbeTtlMs
    ) {
      return { authenticated: false, error: this.authProbe.error };
    }

    try {
      await this.connect();
      this.authProbe = { at: now, authenticated: true };
      return { authenticated: true };
    } catch (err) {
      const error = this.upstreamMessage(err);
      this.authProbe = { at: now, authenticated: false, error };
      return { authenticated: false, error };
    }
  }

  /** eDOCS returns `{ ERROR: { message, rapi_code } }`; prefer that over the axios message. */
  private upstreamMessage(err: unknown): string {
    const data = (err as { response?: { data?: { ERROR?: { message?: string } } } }).response?.data;
    return data?.ERROR?.message ?? getErrorMessage(err);
  }
}

export const edocsService = new EdocsService();
export default edocsService;
