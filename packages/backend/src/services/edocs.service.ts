import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
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
  workspaceId: string | null;
}

export interface EdocsDocumentMetadata {
  docName: string;
  /**
   * eDOCS UV_AFD_NAAM ("Behandelgroep" in InfoCenter) — a mandatory profile
   * field on this DM server; document creation is rejected without it.
   */
  department: string;
  appId?: string;
  formName?: string;
  extra?: Record<string, string>;
}

export interface EdocsDocumentVersion {
  /** VERSION_ID — the real identifier `downloadDocumentVersion()` needs. */
  id: string;
  /** VERSION — the human-facing label ("1", "2", ...), not usable for download. */
  version: string;
}

export interface EdocsDownloadResult {
  contentBase64: string;
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

      // List items are flat (DOCNAME/id directly on the item), not nested under
      // a `.data` property — confirmed live; the previous `existing.data.DOCNAME`
      // read threw "Cannot read properties of undefined" on every real match.
      const list: Array<{ id: string; DOCNAME: string }> = searchResponse.data?.data?.list ?? [];

      if (list.length > 0) {
        const existing = list[0];
        logger.info('Found existing eDOCS workspace', {
          projectNumber,
          workspaceId: existing.id,
        });
        return { workspaceId: existing.id, workspaceName: existing.DOCNAME, created: false };
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

      // Unverified: POST /workspaces still 500s server-side (see EDOCS-GO-LIVE.md
      // Known issues), so the success shape has never been observed live. The
      // `data.list[0].id` fallback matches the confirmed flat-list pattern used
      // by both the search above and document creation; kept alongside the
      // original guesses in case the real shape differs once that 500 is fixed.
      const newWorkspaceId: string =
        createResponse.data?.data?.list?.[0]?.id ??
        createResponse.data?.data?.id ??
        createResponse.data?.id;

      logger.info('eDOCS workspace created', { workspaceName, newWorkspaceId });
      return { workspaceId: newWorkspaceId, workspaceName, created: true };
    });
  }

  // ─── Documents ───────────────────────────────────────────────────────────────

  /**
   * Uploads a document. `workspaceId: null` uploads standalone (no workspace
   * reference) — this is the only path confirmed working live (see
   * EDOCS-GO-LIVE.md § Known issues). Passing a `workspaceId` uses the
   * workspace-ref path, which is still broken on the DM server; kept for when
   * that's resolved rather than removed.
   */
  async uploadDocument(
    workspaceId: string | null,
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

      // Standalone (no workspace ref) uploads need an explicit form to select a
      // profile, or the DM server can't determine an object type. "D_INTERN_NIEUW"
      // is the confirmed-working default on this server; override via formName.
      const formName = metadata.formName ?? (workspaceId ? undefined : 'D_INTERN_NIEUW');

      // The DM server rejects this endpoint's JSON-with-base64-file shape (it
      // 400s expecting a "copy" source); it only accepts a true multipart body,
      // matching the OpenAPI spec's declared content-type.
      const profileData = {
        DOCNAME: metadata.docName,
        AUTHOR_ID: config.edocs.userId,
        TYPIST_ID: config.edocs.userId,
        APP_ID: metadata.appId ?? 'DEFAULT',
        UV_AFD_NAAM: metadata.department,
        _restapi: {
          ...(formName ? { form_name: formName } : {}),
          ...(workspaceId
            ? {
                ref: {
                  type: 'workspace',
                  id: parseInt(workspaceId, 10),
                  lib: config.edocs.library,
                },
              }
            : {}),
        },
        ...(metadata.extra ?? {}),
      };

      const form = new FormData();
      form.append('data', JSON.stringify(profileData), { contentType: 'application/json' });
      form.append('file', Buffer.from(contentBase64, 'base64'), {
        filename,
        contentType: 'application/octet-stream',
      });

      const response = await this.client.post('documents', form, {
        params: { library: config.edocs.library },
        headers: form.getHeaders(),
      });

      // The DM server answers per-part validation with HTTP 206 (a "success"
      // status to axios) and an error_list body instead of an HTTP error —
      // it must be checked explicitly or a rejected upload looks like success.
      const errorList: Array<{ object?: string; message?: string; code?: string }> =
        response.data?.data?.error_list ?? [];
      if (errorList.length > 0) {
        const detail = errorList
          .map((e) => e.message)
          .filter(Boolean)
          .join('; ');
        throw new Error(
          `eDOCS rejected the document upload: ${detail || 'unknown validation error'}`
        );
      }

      const created: { id?: string; DOCNUM?: string } = response.data?.data?.list?.[0] ?? {};
      const documentId: string = created.id ?? response.data?.data?.id ?? response.data?.id;
      const documentNumber: string = created.DOCNUM ?? response.data?.data?.DOCNUMBER ?? documentId;

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
      // There is no `.../documents` sub-resource on this API — the OpenAPI spec
      // (and a live GET confirmed 200) shows workspace content is retrieved from
      // the workspace resource itself. It returns all content (documents and any
      // sub-items), not documents only — this API has no documents-only filter.
      const response = await this.client.get(`workspaces/${workspaceId}`, {
        params: { library: config.edocs.library },
      });

      // Flat list item shape (DOCNAME/DOCNUM directly on the item), same as the
      // workspace-search list confirmed live — not nested under `.data`.
      const list: Array<{ id: string; DOCNAME: string; DOCNUM: string }> =
        response.data?.data?.list ?? [];

      return list.map((item) => ({
        id: item.id,
        name: item.DOCNAME,
        documentNumber: item.DOCNUM,
      }));
    });
  }

  async getDocumentProfile(documentId: string): Promise<Record<string, unknown>> {
    if (this.stubMode) {
      logger.info('[stub] getDocumentProfile()', { documentId });
      return { DOCNAME: 'Stub document', DOCNUMBER: `STUB-${documentId}`, APP_ID: 'INFRA' };
    }

    return this.withAuth(async () => {
      const response = await this.client.get(`documents/${documentId}/profile`, {
        params: { library: config.edocs.library },
      });
      return response.data?.data ?? response.data ?? {};
    });
  }

  async getDocumentVersions(documentId: string): Promise<EdocsDocumentVersion[]> {
    if (this.stubMode) {
      logger.info('[stub] getDocumentVersions()', { documentId });
      return [{ id: `${documentId}-v1`, version: '1' }];
    }

    return this.withAuth(async () => {
      const response = await this.client.get(`documents/${documentId}/versions`, {
        params: { library: config.edocs.library },
      });
      // Flat list item shape, confirmed live — no nested `.data`, and no `id`
      // field at all. VERSION_ID is the real identifier the download endpoint
      // needs; VERSION is just the human-facing label ("1", "2", ...).
      const list: Array<{ VERSION_ID: string; VERSION: string }> = response.data?.data?.list ?? [];
      return list.map((item) => ({ id: item.VERSION_ID, version: item.VERSION }));
    });
  }

  async downloadDocumentVersion(documentId: string, version: string): Promise<EdocsDownloadResult> {
    if (this.stubMode) {
      logger.info('[stub] downloadDocumentVersion()', { documentId, version });
      return {
        contentBase64: Buffer.from(`stub content for ${documentId} v${version}`).toString('base64'),
      };
    }

    return this.withAuth(async () => {
      // Confirmed live: this endpoint returns the raw file bytes directly (not
      // JSON with a base64 field, despite the sibling endpoints' convention) —
      // arraybuffer avoids axios's default JSON/string decoding, which would
      // corrupt real binary content. "0" is a confirmed-working version
      // sentinel; the versions list's VERSION/VERSION_ID both 400 here
      // ("Kan documentversie niet vinden met opgegeven versie-id").
      const response = await this.client.get(`documents/${documentId}/versions/${version}`, {
        params: { library: config.edocs.library },
        responseType: 'arraybuffer',
      });
      const contentBase64 = Buffer.from(response.data as ArrayBuffer).toString('base64');
      return { contentBase64 };
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    if (this.stubMode) {
      logger.info('[stub] deleteDocument()', { documentId });
      return;
    }

    await this.withAuth(async () => {
      await this.client.delete(`documents/${documentId}`, {
        params: { library: config.edocs.library },
      });
    });
    logger.info('Document deleted from eDOCS', { documentId });
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    if (this.stubMode) {
      logger.info('[stub] deleteWorkspace()', { workspaceId });
      return;
    }

    await this.withAuth(async () => {
      await this.client.delete(`workspaces/${workspaceId}`, {
        params: { library: config.edocs.library },
      });
    });
    logger.info('Workspace deleted from eDOCS', { workspaceId });
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

  /** eDOCS returns `{ ERROR: { message, rapi_code, rapi_details } }`; prefer that over the axios message. */
  private upstreamMessage(err: unknown): string {
    const edocsError = (
      err as {
        response?: { data?: { ERROR?: { message?: string; rapi_details?: string[] } } };
      }
    ).response?.data?.ERROR;
    // `message` is sometimes an empty string while the useful text sits in
    // rapi_details (e.g. "Logon failure: unknown user name or bad password").
    const message = edocsError?.message?.trim();
    if (message) return message;
    const details = edocsError?.rapi_details?.filter(Boolean).join('; ').trim();
    if (details) return details;
    return getErrorMessage(err);
  }
}

export const edocsService = new EdocsService();
export default edocsService;
