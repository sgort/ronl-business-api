import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import type { SignatureField } from '@services/document/toPdf';

const logger = createLogger('validsign-service');

export type PackageStatus = 'DRAFT' | 'SENT' | 'COMPLETED' | 'DECLINED' | 'EXPIRED' | 'ARCHIVED';

export interface CreatePackageInput {
  name: string;
  senderEmail: string;
  signer: { email: string; firstName: string; lastName: string };
  pdf: Buffer;
  fileName: string;
  signatureFields: SignatureField[];
}

interface StubPackage {
  status: PackageStatus;
  roleId: string;
  signerName: string;
}

/**
 * ValidsignService — thin REST client for ValidSign (the EU-branded OneSpan
 * Sign platform). There is no Node SDK; Java and .NET only.
 *
 * Stub mode (VALIDSIGN_STUB_MODE, default true) is not a convenience but a
 * safety rail: the licence is production-only, with no sandbox tenant, and the
 * API key is ACCOUNT-WIDE — a live call acts against every sender in the
 * Provincie Flevoland account.
 */
export class ValidsignService {
  private client: AxiosInstance;
  private stubPackages = new Map<string, StubPackage>();
  private stubCounterSeed = 0;

  constructor() {
    this.client = axios.create({
      baseURL: config.validsign.baseUrl,
      timeout: 30_000,
      headers: {
        // The key is used verbatim: it is already the encoded credential, not
        // a user:pass pair to base64-encode again.
        Authorization: `Basic ${config.validsign.apiKey}`,
        Accept: 'application/json',
      },
    });
    logger.info('ValidSign service initialised', {
      stubMode: this.isStub,
      baseUrl: config.validsign.baseUrl,
      liveTiers: config.validsign.liveTiers,
      deploymentEnv: config.deploymentEnv,
    });
  }

  get isStub(): boolean {
    return config.validsign.stubMode;
  }

  /** All three locks, checked before anything can reach the network. */
  private assertLiveAllowed(): void {
    if (this.isStub) return;
    if (!config.validsign.apiKey) {
      throw new Error('VALIDSIGN_LIVE_MISCONFIGURED: live mode with no API key');
    }
    if (!config.validsign.liveTiers.includes(config.deploymentEnv)) {
      throw new Error(
        `VALIDSIGN_LIVE_BLOCKED: DEPLOYMENT_ENV="${config.deploymentEnv}" may not create real packages`
      );
    }
  }

  private nextStubId(prefix: string): string {
    this.stubCounterSeed += 1;
    return `${prefix}-${this.stubCounterSeed}`;
  }

  async createPackage(input: CreatePackageInput): Promise<{ packageId: string; roleId: string }> {
    this.assertLiveAllowed();
    if (this.isStub) {
      const packageId = this.nextStubId('stub');
      const roleId = this.nextStubId('stub-role');
      this.stubPackages.set(packageId, {
        status: 'DRAFT',
        roleId,
        signerName: `${input.signer.firstName} ${input.signer.lastName}`,
      });
      return { packageId, roleId };
    }
    return this.createPackageLive(input); // Task 7
  }

  async sendPackage(packageId: string): Promise<void> {
    this.assertLiveAllowed();
    if (this.isStub) {
      const pkg = this.requireStub(packageId);
      this.assertLegalTransition(packageId, pkg.status, 'SENT');
      pkg.status = 'SENT';
      return;
    }
    await this.client.put(`/packages/${packageId}`, { status: 'SENT' });
  }

  async getSigningUrl(packageId: string, roleId: string): Promise<string> {
    this.assertLiveAllowed();
    if (this.isStub) {
      // Same-origin on purpose: the frontend needs no stub branch, and
      // Playwright can reach into the iframe with frameLocator().
      return `/v1/validsign/stub/ceremony/${packageId}`;
    }
    const res = await this.client.get(`/packages/${packageId}/roles/${roleId}/signingUrl`);
    return res.data.url as string;
  }

  async getPackageStatus(packageId: string): Promise<PackageStatus> {
    this.assertLiveAllowed();
    if (this.isStub) return this.requireStub(packageId).status;
    const res = await this.client.get(`/packages/${packageId}`);
    return res.data.status as PackageStatus;
  }

  async downloadSignedDocument(packageId: string, documentId: string): Promise<Buffer> {
    this.assertLiveAllowed();
    if (this.isStub) return Buffer.from(`%PDF-1.4 stub signed ${packageId}`);
    const res = await this.client.get(`/packages/${packageId}/documents/${documentId}/pdf`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(res.data as ArrayBuffer);
  }

  async downloadEvidenceSummary(packageId: string): Promise<Buffer> {
    this.assertLiveAllowed();
    if (this.isStub) return Buffer.from(`%PDF-1.4 stub evidence ${packageId}`);
    const res = await this.client.get(`/packages/${packageId}/evidence/summary`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(res.data as ArrayBuffer);
  }

  /** Stub-mode only: drive the ceremony from the local stand-in page. */
  stubSign(packageId: string, outcome: 'COMPLETED' | 'DECLINED'): void {
    if (!this.isStub) throw new Error('stubSign called outside stub mode');
    const pkg = this.requireStub(packageId);
    this.assertLegalTransition(packageId, pkg.status, outcome);
    pkg.status = outcome;
  }

  /**
   * Enforces the real ValidSign lifecycle in the stub: DRAFT -> SENT ->
   * COMPLETED | DECLINED. A stub that allowed any jump (e.g. DRAFT straight
   * to COMPLETED) would let an end-to-end test pass against a call sequence
   * the live service would reject, which defeats the point of the stub.
   */
  private assertLegalTransition(
    packageId: string,
    current: PackageStatus,
    next: PackageStatus
  ): void {
    const legal: Record<PackageStatus, PackageStatus[]> = {
      DRAFT: ['SENT'],
      SENT: ['COMPLETED', 'DECLINED'],
      COMPLETED: [],
      DECLINED: [],
      EXPIRED: [],
      ARCHIVED: [],
    };
    if (!legal[current].includes(next)) {
      throw new Error(
        `VALIDSIGN_ILLEGAL_TRANSITION: package ${packageId} is ${current}, cannot become ${next}`
      );
    }
  }

  stubSignerName(packageId: string): string {
    return this.requireStub(packageId).signerName;
  }

  private requireStub(packageId: string): StubPackage {
    const pkg = this.stubPackages.get(packageId);
    if (!pkg) throw new Error(`VALIDSIGN_UNKNOWN_PACKAGE: ${packageId}`);
    return pkg;
  }

  /**
   * Logs only fields safe to write to disk: HTTP status/statusText, the
   * upstream response body (ValidSign's own error code/message), and the
   * request path/method. NEVER pass the raw error or its `config` here —
   * `error.config.headers.Authorization` carries the ValidSign API key,
   * which is an ACCOUNT-WIDE credential for Provincie Flevoland (read/write
   * across every sender's packages, not just this one). A prior review
   * flagged this as the specific risk to guard against for the live path.
   */
  private logUpstreamError(operation: string, err: unknown): void {
    const e = err as {
      message?: string;
      response?: { status?: number; statusText?: string; data?: unknown };
      config?: { url?: string; method?: string };
    };
    if (e.response) {
      logger.error(`ValidSign ${operation} returned an error response`, {
        status: e.response.status,
        statusText: e.response.statusText,
        upstream: e.response.data,
        url: e.config?.url,
        method: e.config?.method,
      });
    } else {
      // No response reached us (network/timeout) — nothing on the error
      // besides .message is safe to log; the .config carries the auth header.
      logger.error(`ValidSign ${operation} failed`, {
        message: e.message,
        url: e.config?.url,
        method: e.config?.method,
      });
    }
  }

  /**
   * Real REST call: creates a ValidSign package (multipart: a `file` part
   * plus a `payload` part carrying the package JSON), then reads back the
   * created package to find the signer role id.
   *
   * Verified against the live account (read-only `GET /api/packages?from=1&to=1`,
   * HTTP 200): envelope `{ count, results }`; package `{ id, name, status,
   * sender, roles[], documents[] }`; role `{ id, name, type, index, signers[] }`;
   * document `{ id, name, index, extract, approvals[], fields[] }`.
   *
   * UNVERIFIED: the sampled package had empty `approvals`/`fields`, so the
   * field-placement keys below (`top`/`left`, zero-based `page`) are per the
   * plan, not confirmed against a live response — see the inline note.
   */
  private async createPackageLive(
    input: CreatePackageInput
  ): Promise<{ packageId: string; roleId: string }> {
    const payload = {
      name: input.name,
      type: 'PACKAGE',
      status: 'DRAFT',
      language: 'nl',
      // Explicit sender: the API key is the ACCOUNT key, and the account holds
      // packages from several senders. Relying on a default owner would
      // attribute province approvals to whoever the key resolves to.
      sender: { email: input.senderEmail },
      roles: [
        {
          id: 'signer1',
          name: 'signer1',
          type: 'SIGNER',
          index: 1,
          signers: [
            {
              email: input.signer.email,
              firstName: input.signer.firstName,
              lastName: input.signer.lastName,
            },
          ],
        },
      ],
      documents: [
        {
          name: input.fileName,
          index: 0,
          // extract:false — we author this PDF and know the coordinates, so
          // text-anchor extraction would only add a failure mode.
          extract: false,
          approvals: [
            {
              role: 'signer1',
              fields: input.signatureFields.map((f) => ({
                type: 'SIGNATURE',
                subtype: 'FULLNAME',
                name: f.name,
                // UNVERIFIED AGAINST LIVE: the sampled package had empty
                // approvals/fields, so `top`/`left` naming and the
                // zero-based `page` conversion below are per the ValidSign
                // docs/plan, not confirmed against a real response. If a
                // live signature ceremony misplaces a field, check these
                // three lines first.
                page: f.page - 1, // ValidSign pages are zero-based; ours are one-based.
                top: f.y,
                left: f.x,
                width: f.width,
                height: f.height,
              })),
            },
          ],
        },
      ],
    };

    const form = new FormData();
    form.append('file', input.pdf, { filename: input.fileName, contentType: 'application/pdf' });
    form.append('payload', JSON.stringify(payload));

    let created;
    try {
      created = await this.client.post('/packages', form, { headers: form.getHeaders() });
    } catch (err) {
      this.logUpstreamError('createPackage', err);
      throw err;
    }
    const packageId = created.data.id as string;

    let pkg;
    try {
      pkg = await this.client.get(`/packages/${packageId}`);
    } catch (err) {
      this.logUpstreamError('getPackage (post-create readback)', err);
      throw err;
    }
    const role = (pkg.data.roles as Array<{ id: string; type: string }>).find(
      (r) => r.type === 'SIGNER'
    );
    if (!role) throw new Error(`VALIDSIGN_NO_SIGNER_ROLE: ${packageId}`);

    logger.info('ValidSign package created', { packageId, roleId: role.id });
    return { packageId, roleId: role.id };
  }
}

export const validsignService = new ValidsignService();
export default validsignService;
