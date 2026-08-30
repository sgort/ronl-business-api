import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import PDFDocument from 'pdfkit';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { formatDutchDateTime } from '@utils/dutch-datetime';
import type { SignatureField } from '@services/document/toPdf';

const logger = createLogger('validsign-service');

/**
 * PDF points (72/inch) -> the 96-DPI pixels ValidSign places fields in.
 * See the field mapping in createPackageLive for how this was established.
 */
const PT_TO_PX96 = 96 / 72;

/**
 * Builds a minimal, well-formed, single-page PDF for stub-mode downloads.
 * These stand in for real ValidSign output, and the completion path
 * archives them into the province's real eDOCS document store alongside
 * genuine documents — a bare string with a "%PDF-" prefix uploads fine but
 * is not a real PDF and fails to open there. Uses pdfkit the same way
 * services/document/toPdf.ts does, rather than a second ad-hoc approach.
 */
function buildStubPdf(title: string, lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Uncompressed: these are dev-only artefacts, and leaving the content
    // stream in plain text lets a test assert that a line -- the signing
    // timestamp especially -- actually reached the PDF, rather than only
    // that the bytes start with '%PDF-'.
    const pdf = new PDFDocument({ size: 'A4', margin: 56, compress: false });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));

    pdf.font('Helvetica-Bold').fontSize(16).text(title);
    pdf.moveDown(1);
    pdf.font('Helvetica').fontSize(11);
    for (const line of lines) {
      if (line === '') {
        pdf.moveDown(0.5);
        continue;
      }
      pdf.text(line);
      pdf.moveDown(0.3);
    }
    pdf.end();
  });
}

export type PackageStatus = 'DRAFT' | 'SENT' | 'COMPLETED' | 'DECLINED' | 'EXPIRED' | 'ARCHIVED';

export interface CreatePackageInput {
  name: string;
  senderEmail: string;
  signer: { email: string; firstName: string; lastName: string };
  pdf: Buffer;
  fileName: string;
  signatureFields: SignatureField[];
  /**
   * Absolute, PUBLICLY reachable URL of the infra board (see
   * validsign.routes.ts's deriveBoardHandOverUrl), derived by the caller
   * from config.corsOrigin -- NEVER from this backend's own host. When
   * present, createPackageLive points ValidSign's settings.ceremony.handOver
   * at it so the signer's browser returns to their work instead of the
   * account-level default (confirmed live: a redirect to the province's
   * public website).
   *
   * Omit when the caller could not derive a PUBLIC origin -- most notably on
   * localhost, where the board itself is not publicly reachable. This is
   * not merely a cosmetic fallback: a signer's browser on a real ValidSign
   * ceremony (my.validsign.eu) is blocked outright by Private Network Access
   * (a browser security policy, confirmed live) from navigating to ANY
   * private-network address, so sending one here would land the signer on a
   * browser-level error page immediately after a legal signature was
   * recorded. Omitting handOver and letting ValidSign's own account default
   * apply is a far better failure mode.
   */
  handOverUrl?: string;
}

interface StubPackage {
  status: PackageStatus;
  roleId: string;
  signerName: string;
  /** Set when the package reaches COMPLETED; see stubSign. */
  signedAt?: Date;
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

  /**
   * Resolves the id of the (single) document inside a package, to pass to
   * downloadSignedDocument(). Nothing upstream of this hands us a document
   * id directly, so we ask ValidSign rather than guess one -- a wrong or
   * stale id 404s the signed-PDF download and silently drops the archival
   * step, even though the task still completes.
   *
   * Verified response shape (read-only GET against the live account):
   * `{ id, name, status, sender, roles[], documents[] }`, each document
   * carrying `{ id, name, index, ... }`.
   */
  async getSignedDocumentId(packageId: string): Promise<string> {
    this.assertLiveAllowed();
    if (this.isStub) return `stub-doc-${packageId}`;
    let res;
    try {
      res = await this.client.get(`/packages/${packageId}`);
    } catch (err) {
      this.logUpstreamError('getSignedDocumentId', err);
      throw err;
    }
    const documents = res.data.documents as Array<{ id: string }> | undefined;
    if (!documents || documents.length === 0) {
      throw new Error(`VALIDSIGN_NO_DOCUMENTS: package ${packageId} has no documents`);
    }
    return documents[0].id;
  }

  async downloadSignedDocument(packageId: string, documentId: string): Promise<Buffer> {
    this.assertLiveAllowed();
    if (this.isStub) {
      const pkg = this.stubPackages.get(packageId);
      return buildStubPdf('Stub-ondertekening (ontwikkelomgeving)', [
        `Pakket: ${packageId}`,
        `Document: ${documentId}`,
        ...(pkg?.signerName ? [`Ondertekenaar: ${pkg.signerName}`] : []),
        ...(pkg?.signedAt ? [`Ondertekend op: ${formatDutchDateTime(pkg.signedAt)}`] : []),
        '',
        'Dit is een stub-handtekening, gegenereerd in de ontwikkelomgeving.',
        'Dit document heeft geen juridische waarde en is geen echte ValidSign-ondertekening.',
      ]);
    }
    const res = await this.client.get(`/packages/${packageId}/documents/${documentId}/pdf`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(res.data as ArrayBuffer);
  }

  async downloadEvidenceSummary(packageId: string): Promise<Buffer> {
    this.assertLiveAllowed();
    if (this.isStub) {
      const pkg = this.stubPackages.get(packageId);
      return buildStubPdf('Stub-bewijssamenvatting (ontwikkelomgeving)', [
        `Pakket: ${packageId}`,
        ...(pkg?.signerName ? [`Ondertekenaar: ${pkg.signerName}`] : []),
        ...(pkg?.signedAt ? [`Ondertekend op: ${formatDutchDateTime(pkg.signedAt)}`] : []),
        // The moment the summary itself was produced, which is a different
        // fact from the signing moment above and is what a real evidence
        // summary carries. They differ whenever this is re-downloaded.
        `Samenvatting gegenereerd op: ${formatDutchDateTime()}`,
        '',
        'Dit is een stub-vervanging voor de evidence summary van ValidSign,',
        'gegenereerd in de ontwikkelomgeving. Dit document heeft geen juridische waarde.',
      ]);
    }
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
    // Recorded once, here, rather than stamped at download time: the signed
    // document and the evidence summary are fetched separately and can be
    // re-fetched, and a download-time stamp would report a different signing
    // moment on every call for what is one signature.
    if (outcome === 'COMPLETED') pkg.signedAt = new Date();
  }

  /** The moment a stub package was signed, for pages and documents that state it. */
  stubSignedAt(packageId: string): Date | undefined {
    return this.stubPackages.get(packageId)?.signedAt;
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
      // Overrides the account-level ceremony finish button, which (confirmed
      // live) defaults to settings.ceremony.handOver = { href:
      // "https://www.flevoland.nl/", text: "Beeindigen", ... } -- the
      // province's own public site, rendered inside the board's task-panel
      // iframe after a real signature completes. Sent only when the caller
      // (validsign.routes.ts's deriveBoardHandOverUrl) could derive a
      // PUBLICLY reachable board URL; omitted otherwise so package creation
      // still succeeds and the (confusing, but harmless) account default
      // applies rather than a link the signer's browser refuses to follow.
      //
      // autoRedirect: false -- matching the account default (the signer
      // must click through). ValidSign's own ceremony-complete page is
      // informative and correct on its own, and the board's task panel is
      // already polling the task's status and removes itself the moment a
      // signature is detected, so nothing depends on an auto-redirect.
      // autoRedirect:true was tried and found live to be actively harmful:
      // combined with a handOver target the signer's browser refuses (see
      // handOverUrl's comment on CreatePackageInput), it rushed the signer
      // straight into a browser-level block screen instead of letting them
      // see ValidSign's own confirmation first.
      ...(input.handOverUrl
        ? {
            settings: {
              ceremony: {
                handOver: {
                  autoRedirect: false,
                  href: input.handOverUrl,
                  text: 'Terug naar het infrabord',
                  title: 'Keer terug naar uw takenoverzicht op het infrabord',
                  parameters: ['transaction_id', 'signer_id', 'status'],
                },
              },
            },
          }
        : {}),
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
                // `page` is zero-based here and one-based in SignatureField.
                page: f.page - 1,
                // ValidSign places fields in 96-DPI PIXELS; the PDF we author
                // is in 72-DPI points, so every coordinate and size is scaled
                // by 96/72. `top` is measured from the TOP of the page, same
                // origin as pdfkit's y -- only the unit differs.
                //
                // Derived from two live signatures on 30 Aug 2026 rather than
                // from the docs. Sending the raw point values put the seal at
                // 0.75x the intended offset; changing `top` by 120pt between
                // the two runs moved the rendered seal by only ~92pt, and
                // 92/120 = 0.766 ~= 72/96. Under the pixel reading the two
                // runs predict seal centres of 360.8 and 270.7 against ~362
                // and ~271 measured -- both within 1.5pt, which a wrong
                // origin or a constant offset does not reproduce.
                //
                // Size is scaled too: a 200x50pt box sent unscaled renders as
                // 150x37.5pt, which is why the seal looked small.
                top: f.y * PT_TO_PX96,
                left: f.x * PT_TO_PX96,
                width: f.width * PT_TO_PX96,
                height: f.height * PT_TO_PX96,
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
