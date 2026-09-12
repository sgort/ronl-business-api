import { formatDutchDateTime } from '@utils/dutch-datetime';
/**
 * Unit tests for ValidsignService — the stub state machine and the live guard.
 *
 * Motivation: the ValidSign licence is production-only with an account-wide
 * API key, so the guard that blocks live calls unless stub mode is off, an
 * API key is set, AND config.deploymentEnv is on the liveTiers allowlist is
 * the single most important thing this file does. These tests pin the stub
 * state machine (DRAFT -> SENT -> COMPLETED/DECLINED) and every one of the
 * guard's failure modes down before Task 7 wires in real REST calls.
 *
 * axios is mocked at the module boundary the way edocs.service.test.ts does:
 * axios.create() returns a controllable client. No test in this file may
 * reach the ValidSign network — stub-mode tests never call the client, and
 * the guard tests fail closed before any client method would be invoked.
 */

const mockClient = {
  get: jest.fn(),
  put: jest.fn(),
  post: jest.fn(),
};

const mockFormAppend = jest.fn();
const mockFormGetHeaders = jest.fn(() => ({
  'content-type': 'multipart/form-data; boundary=mock',
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn(() => mockClient) },
}));
jest.mock('form-data', () =>
  jest.fn().mockImplementation(() => ({
    append: mockFormAppend,
    getHeaders: mockFormGetHeaders,
  }))
);
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('@utils/logger', () => ({
  createLogger: () => mockLogger,
}));

const mockConfig = {
  validsign: {
    baseUrl: 'https://my.validsign.eu/api',
    apiKey: 'test-key',
    stubMode: true,
    callbackSecret: 'secret',
    liveTiers: [] as string[],
    pollIntervalMs: 15000,
  },
  deploymentEnv: 'development',
};
jest.mock('@utils/config', () => ({ config: mockConfig }));

import { ValidsignService } from './validsign.service';

const input = {
  name: 'RIP 24102 — Uitgangspunten VO',
  senderEmail: 'steven.gort@ictu.nl',
  signer: { email: 'pl@flevoland.nl', firstName: 'Test', lastName: 'Leider' },
  pdf: Buffer.from('%PDF-1.3 fake'),
  fileName: 'rip-pdp-24102.pdf',
  signatureFields: [{ name: 'Signature1', page: 1, x: 100, y: 400, width: 200, height: 50 }],
};

/**
 * Reads the visible text back out of a stub PDF.
 *
 * Needed because a plain substring search over the bytes never matches, even
 * with compression off: pdfkit writes a line as hex chunks inside a TJ array,
 * split wherever it applies kerning --
 *   [<4f6e646572> -40 <74656b> 20 <656e64206f703a> ...] TJ
 * -- so "Ondertekend op:" is never contiguous in the file. Concatenating the
 * hex chunks of each TJ array, and dropping the numeric adjustments between
 * them, reconstructs the line as the signer sees it.
 *
 * This exists so the timestamp assertions below check what actually reached
 * the document, rather than only that the bytes begin with "%PDF-" -- a check
 * a 27-byte placeholder string once passed.
 */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const lines: string[] = [];
  for (const array of raw.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    lines.push(
      [...array[1].matchAll(/<([0-9a-fA-F]+)>/g)]
        .map((chunk) => Buffer.from(chunk[1], 'hex').toString('latin1'))
        .join('')
    );
  }
  return lines.join('\n');
}

describe('ValidsignService in stub mode', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = true;
    mockConfig.validsign.liveTiers = [];
  });

  it('creates a package in DRAFT and moves it to SENT', async () => {
    const svc = new ValidsignService();
    const { packageId, roleId } = await svc.createPackage(input);
    expect(packageId).toMatch(/^stub-/);
    expect(roleId).toBeTruthy();
    expect(await svc.getPackageStatus(packageId)).toBe('DRAFT');
    await svc.sendPackage(packageId);
    expect(await svc.getPackageStatus(packageId)).toBe('SENT');
  });

  it('returns a same-origin ceremony URL so the frontend needs no stub branch', async () => {
    const svc = new ValidsignService();
    const { packageId, roleId } = await svc.createPackage(input);
    expect(await svc.getSigningUrl(packageId, roleId)).toBe(
      `/v1/validsign/stub/ceremony/${packageId}`
    );
  });

  it('advances DRAFT -> SENT -> COMPLETED, and DRAFT -> SENT -> DECLINED, only via the legal path', async () => {
    const svc = new ValidsignService();

    const a = await svc.createPackage(input);
    expect(await svc.getPackageStatus(a.packageId)).toBe('DRAFT');
    await svc.sendPackage(a.packageId);
    expect(await svc.getPackageStatus(a.packageId)).toBe('SENT');
    svc.stubSign(a.packageId, 'COMPLETED');
    expect(await svc.getPackageStatus(a.packageId)).toBe('COMPLETED');

    const b = await svc.createPackage(input);
    expect(await svc.getPackageStatus(b.packageId)).toBe('DRAFT');
    await svc.sendPackage(b.packageId);
    expect(await svc.getPackageStatus(b.packageId)).toBe('SENT');
    svc.stubSign(b.packageId, 'DECLINED');
    expect(await svc.getPackageStatus(b.packageId)).toBe('DECLINED');
  });

  it('refuses to sign a package that was never sent', async () => {
    const svc = new ValidsignService();
    const { packageId } = await svc.createPackage(input);
    expect(await svc.getPackageStatus(packageId)).toBe('DRAFT');
    expect(() => svc.stubSign(packageId, 'COMPLETED')).toThrow(/VALIDSIGN_ILLEGAL_TRANSITION/);
    expect(await svc.getPackageStatus(packageId)).toBe('DRAFT');
  });

  it('gives stub packages unguessable ids, so the ceremony URL acts as a capability', async () => {
    const svc = new ValidsignService();
    const a = await svc.createPackage(input);
    const b = await svc.createPackage(input);
    const uuidSuffix = /^stub-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(a.packageId).toMatch(uuidSuffix);
    expect(b.packageId).toMatch(uuidSuffix);
    expect(a.packageId).not.toBe(b.packageId);
    // The defect this guards. The stub ceremony's POST is unauthenticated --
    // an iframe cannot carry a bearer token -- and completes the Operaton
    // task, so a sequential id (stub-1, stub-3, ...) would let anyone on a
    // reachable deployment enumerate a few values and approve a phase-exit
    // someone else was signing. Unguessable ids are what make
    // VALIDSIGN_STUB_MODE=true safe beyond localhost.
    expect(a.packageId).not.toMatch(/^stub-\d+$/);
    expect(b.packageId).not.toMatch(/^stub-\d+$/);
  });

  it('returns a real, well-formed signed PDF without touching the network', async () => {
    const svc = new ValidsignService();
    const { packageId } = await svc.createPackage(input);
    await svc.sendPackage(packageId);
    svc.stubSign(packageId, 'COMPLETED');
    const signed = await svc.downloadSignedDocument(packageId, 'doc-1');
    expect(signed.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    // A real single-page pdfkit document is on the order of a thousand
    // bytes; the old placeholder string was 27 bytes. This is the size
    // check that would catch a regression back to the placeholder.
    expect(signed.length).toBeGreaterThan(500);
    // The placeholder string never had this trailer — only a real PDF
    // stream ends with the standard end-of-file marker.
    expect(signed.subarray(-6).toString('ascii')).toContain('%%EOF');
  });

  it('returns a real, well-formed evidence summary PDF without touching the network', async () => {
    const svc = new ValidsignService();
    const { packageId } = await svc.createPackage(input);
    await svc.sendPackage(packageId);
    svc.stubSign(packageId, 'COMPLETED');
    const evidence = await svc.downloadEvidenceSummary(packageId);
    expect(evidence.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(evidence.length).toBeGreaterThan(500);
    expect(evidence.subarray(-6).toString('ascii')).toContain('%%EOF');
  });

  it('stamps the signing moment into the signed PDF, and repeats it on re-download', async () => {
    const svc = new ValidsignService();
    const { packageId } = await svc.createPackage(input);
    await svc.sendPackage(packageId);
    svc.stubSign(packageId, 'COMPLETED');

    const signedAt = svc.stubSignedAt(packageId);
    expect(signedAt).toBeInstanceOf(Date);
    const stamp = formatDutchDateTime(signedAt!);

    // Readable because buildStubPdf writes an uncompressed content stream;
    // this is the assertion that the timestamp genuinely reached the
    // document rather than only reaching the array of lines.
    const first = pdfText(await svc.downloadSignedDocument(packageId, 'doc-1'));
    expect(first).toContain('Ondertekend op:');
    expect(first).toContain(stamp);

    // One signature is one moment. A stamp taken at download time would
    // differ here, which is the bug this guards.
    const second = pdfText(await svc.downloadSignedDocument(packageId, 'doc-1'));
    expect(second).toContain(stamp);
  });

  it('carries both the signing moment and its own generation moment in the evidence summary', async () => {
    const svc = new ValidsignService();
    const { packageId } = await svc.createPackage(input);
    await svc.sendPackage(packageId);
    svc.stubSign(packageId, 'COMPLETED');

    const evidence = pdfText(await svc.downloadEvidenceSummary(packageId));
    expect(evidence).toContain('Ondertekend op:');
    expect(evidence).toContain(formatDutchDateTime(svc.stubSignedAt(packageId)!));
    expect(evidence).toContain('Samenvatting gegenereerd op:');
  });

  it('records no signing moment when the signer declines', () => {
    const svc = new ValidsignService();
    return svc.createPackage(input).then(async ({ packageId }) => {
      await svc.sendPackage(packageId);
      svc.stubSign(packageId, 'DECLINED');
      expect(svc.stubSignedAt(packageId)).toBeUndefined();
    });
  });

  it('getSignedDocumentId returns a deterministic stub id without touching the network', async () => {
    const svc = new ValidsignService();
    const { packageId } = await svc.createPackage(input);
    await expect(svc.getSignedDocumentId(packageId)).resolves.toBe(`stub-doc-${packageId}`);
    await expect(svc.getSignedDocumentId(packageId)).resolves.toBe(`stub-doc-${packageId}`);
  });
});

describe('the live guard', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = false;
    mockConfig.validsign.apiKey = 'test-key';
  });

  it('refuses to create a package on a tier outside the allowlist', async () => {
    mockConfig.validsign.liveTiers = ['production'];
    mockConfig.deploymentEnv = 'development';
    await expect(new ValidsignService().createPackage(input)).rejects.toThrow(
      /VALIDSIGN_LIVE_BLOCKED/
    );
  });

  it('refuses to create a package with no API key', async () => {
    mockConfig.validsign.liveTiers = ['development'];
    mockConfig.deploymentEnv = 'development';
    mockConfig.validsign.apiKey = '';
    await expect(new ValidsignService().createPackage(input)).rejects.toThrow(
      /VALIDSIGN_LIVE_MISCONFIGURED/
    );
  });
});

describe('the live REST path', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = false;
    mockConfig.validsign.apiKey = 'test-key';
    mockConfig.validsign.liveTiers = ['development'];
    mockConfig.deploymentEnv = 'development';
    mockClient.post.mockReset();
    mockClient.get.mockReset();
    // Without this, mockFormAppend.mock.calls accumulates across every test
    // in this describe (form.append happens whether or not the subsequent
    // axios.post succeeds), and each test's `.find(c => c[0] === 'payload')`
    // below would silently pick up an EARLIER test's payload instead of its
    // own.
    mockFormAppend.mockClear();
  });

  it('creates a package with an explicit sender and one signer role', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pkg-1' } });
    mockClient.get.mockResolvedValue({
      data: { roles: [{ id: 'role-1', type: 'SIGNER', signers: [{ email: 'pl@flevoland.nl' }] }] },
    });

    const { packageId, roleId } = await new ValidsignService().createPackage(input);
    expect(packageId).toBe('pkg-1');
    expect(roleId).toBe('role-1');

    const payload = JSON.parse(
      mockFormAppend.mock.calls.find((c) => c[0] === 'payload')![1] as string
    );
    // The account key is account-wide and the account holds packages from
    // several senders, so nothing may rely on a default owner.
    expect(payload.sender.email).toBe('steven.gort@ictu.nl');
    expect(payload.roles).toHaveLength(1);
    expect(payload.roles[0].signers[0].email).toBe('pl@flevoland.nl');
    // extract:false -- we author this PDF and know the coordinates, so
    // text-anchor extraction would only add a failure mode.
    expect(payload.documents[0].extract).toBe(false);
    const field = payload.documents[0].approvals[0].fields[0];
    expect(field).toMatchObject({ page: 0, type: 'SIGNATURE' });
    // 96-DPI pixels, not points: every value scaled by 96/72. Established
    // from two live signatures -- see the mapping in createPackageLive.
    // toBeCloseTo because 400 * (96/72) and 1600/3 differ in the last bit.
    expect(field.left).toBeCloseTo(100 * (96 / 72), 6);
    expect(field.top).toBeCloseTo(400 * (96 / 72), 6);
    expect(field.width).toBeCloseTo(200 * (96 / 72), 6);
    expect(field.height).toBeCloseTo(50 * (96 / 72), 6);
    // The bug this guards: sending raw points renders the seal at 0.75x the
    // intended offset AND 0.75x the intended size.
    expect(field.top).not.toBe(400);
    expect(field.width).not.toBe(200);
    // intended offset, and 0.75x the intended size.
    expect(payload.documents[0].approvals[0].fields[0].top).not.toBe(400);
    expect(payload.documents[0].approvals[0].fields[0].width).not.toBe(200);
  });

  it('omits settings.ceremony.handOver when the caller derived no handOverUrl', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pkg-1' } });
    mockClient.get.mockResolvedValue({
      data: { roles: [{ id: 'role-1', type: 'SIGNER', signers: [{ email: 'pl@flevoland.nl' }] }] },
    });

    // `input` (module-level fixture) deliberately carries no handOverUrl --
    // a real caller falls back to this when it cannot derive a PUBLICLY
    // reachable board URL (e.g. localhost). ValidSign's own account default
    // must apply rather than the package failing to create or a handOver
    // link the signer's browser refuses to follow.
    await new ValidsignService().createPackage(input);

    const payload = JSON.parse(
      mockFormAppend.mock.calls.find((c) => c[0] === 'payload')![1] as string
    );
    expect(payload.settings).toBeUndefined();
  });

  it('points settings.ceremony.handOver at the board, not the ValidSign account default, with autoRedirect false', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pkg-1' } });
    mockClient.get.mockResolvedValue({
      data: { roles: [{ id: 'role-1', type: 'SIGNER', signers: [{ email: 'pl@flevoland.nl' }] }] },
    });

    await new ValidsignService().createPackage({
      ...input,
      handOverUrl: 'https://ronl.flevoland.nl/dashboard/infra-board',
    });

    const payload = JSON.parse(
      mockFormAppend.mock.calls.find((c) => c[0] === 'payload')![1] as string
    );
    expect(payload.settings.ceremony.handOver).toMatchObject({
      href: 'https://ronl.flevoland.nl/dashboard/infra-board',
      // false, matching the account default: ValidSign's own
      // "Ondertekening voltooid" confirmation is informative and correct on
      // its own, and the board's task panel already removes itself the
      // moment it detects the signature -- nothing should rush the signer
      // past a legal-signature confirmation.
      autoRedirect: false,
    });
    // Confirmed live: the account default left these as "Beeindigen" /
    // "Customer Home page", pointing at the province's public website
    // (https://www.flevoland.nl/) rather than the board.
    expect(payload.settings.ceremony.handOver.text).not.toBe('Beeindigen');
    expect(payload.settings.ceremony.handOver.title).not.toBe('Customer Home page');
    expect(payload.settings.ceremony.handOver.href).not.toBe('https://www.flevoland.nl/');
  });

  it('logs only safe fields on a failed request, never the raw error or its config/headers', async () => {
    mockLogger.error.mockClear();
    const axiosError = {
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        statusText: 'Bad Request',
        data: { code: 'INVALID_SENDER', message: 'sender not found' },
      },
      config: {
        url: '/packages',
        method: 'post',
        headers: { Authorization: 'Basic super-secret-account-key' },
      },
    };
    mockClient.post.mockRejectedValue(axiosError);

    await expect(new ValidsignService().createPackage(input)).rejects.toBe(axiosError);

    const loggedCalls = mockLogger.error.mock.calls;
    expect(loggedCalls.length).toBeGreaterThan(0);
    const serializedCalls = JSON.stringify(loggedCalls);
    expect(serializedCalls).not.toContain('super-secret-account-key');
    expect(serializedCalls).not.toContain('Authorization');
    expect(serializedCalls).not.toContain('headers');
    for (const call of loggedCalls) {
      const meta = call[1];
      expect(meta?.config).toBeUndefined();
      expect(meta?.error).toBeUndefined();
    }
  });

  it('getSignedDocumentId returns the id of the first document', async () => {
    mockClient.get.mockResolvedValue({
      data: {
        id: 'pkg-1',
        documents: [
          { id: 'doc-abc', name: 'rip-pdp.pdf', index: 0 },
          { id: 'doc-xyz', name: 'other.pdf', index: 1 },
        ],
      },
    });

    await expect(new ValidsignService().getSignedDocumentId('pkg-1')).resolves.toBe('doc-abc');
    expect(mockClient.get).toHaveBeenCalledWith('/packages/pkg-1');
  });

  it('getSignedDocumentId throws a distinguishable error when the package has no documents', async () => {
    mockClient.get.mockResolvedValue({ data: { id: 'pkg-1', documents: [] } });

    await expect(new ValidsignService().getSignedDocumentId('pkg-1')).rejects.toThrow(
      /VALIDSIGN_NO_DOCUMENTS/
    );
  });

  it('getSignedDocumentId logs only safe fields on a failed request', async () => {
    mockLogger.error.mockClear();
    const axiosError = {
      isAxiosError: true,
      message: 'Request failed with status code 404',
      response: { status: 404, statusText: 'Not Found', data: { code: 'PACKAGE_NOT_FOUND' } },
      config: {
        url: '/packages/pkg-1',
        method: 'get',
        headers: { Authorization: 'Basic super-secret-account-key' },
      },
    };
    mockClient.get.mockRejectedValue(axiosError);

    await expect(new ValidsignService().getSignedDocumentId('pkg-1')).rejects.toBe(axiosError);

    const serializedCalls = JSON.stringify(mockLogger.error.mock.calls);
    expect(serializedCalls).not.toContain('super-secret-account-key');
    expect(serializedCalls).not.toContain('Authorization');
    expect(serializedCalls).not.toContain('headers');
  });
});

describe('stub-mode edge cases', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = true;
    mockConfig.validsign.liveTiers = [];
  });

  it('omits the signer lines from a stub PDF for a package it has never seen', async () => {
    // The stub download deliberately does not requireStub: a ceremony URL is a
    // capability, and a caller holding an id for a package this process no
    // longer has (a restart clears the in-memory map) gets a valid placeholder
    // rather than a 500. It just cannot name a signer or a signing moment.
    const svc = new ValidsignService();

    const signed = pdfText(await svc.downloadSignedDocument('stub-gone', 'doc-1'));
    expect(signed).toContain('Pakket: stub-gone');
    expect(signed).not.toContain('Ondertekenaar:');
    expect(signed).not.toContain('Ondertekend op:');

    const evidence = pdfText(await svc.downloadEvidenceSummary('stub-gone'));
    expect(evidence).toContain('Pakket: stub-gone');
    expect(evidence).not.toContain('Ondertekenaar:');
    expect(evidence).not.toContain('Ondertekend op:');
    // Its own generation moment is not conditional, so it is still there.
    expect(evidence).toContain('Samenvatting gegenereerd op:');
  });

  it('reports an unknown package id distinguishably', () => {
    expect(() => new ValidsignService().stubSignerName('stub-nope')).toThrow(
      /VALIDSIGN_UNKNOWN_PACKAGE: stub-nope/
    );
  });

  it('names the signer of a package it does hold', async () => {
    const svc = new ValidsignService();
    const { packageId } = await svc.createPackage(input);
    expect(svc.stubSignerName(packageId)).toContain('Leider');
  });
});

describe('stub-only entry points in live mode', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = false;
    mockConfig.validsign.apiKey = 'test-key';
    mockConfig.validsign.liveTiers = ['development'];
    mockConfig.deploymentEnv = 'development';
  });

  it('refuses to drive the ceremony from the stub endpoint', () => {
    // The stub ceremony route is mounted unconditionally; this is the guard
    // that stops it from mutating a real ValidSign package's status.
    expect(() => new ValidsignService().stubSign('pkg-1', 'COMPLETED')).toThrow(
      'stubSign called outside stub mode'
    );
  });
});

describe('the live REST path, further cases', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = false;
    mockConfig.validsign.apiKey = 'test-key';
    mockConfig.validsign.liveTiers = ['development'];
    mockConfig.deploymentEnv = 'development';
    mockClient.post.mockReset();
    mockClient.get.mockReset();
    mockFormAppend.mockClear();
    mockLogger.error.mockClear();
  });

  it('throws a distinguishable error when the readback carries no SIGNER role', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pkg-1' } });
    mockClient.get.mockResolvedValue({ data: { roles: [{ id: 'role-1', type: 'SENDER' }] } });

    await expect(new ValidsignService().createPackage(input)).rejects.toThrow(
      /VALIDSIGN_NO_SIGNER_ROLE: pkg-1/
    );
  });

  it('rethrows and logs safely when the readback itself fails', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pkg-1' } });
    const readbackError = {
      isAxiosError: true,
      message: 'Request failed with status code 404',
      response: { status: 404, statusText: 'Not Found', data: { code: 'NOT_FOUND' } },
      config: { url: '/packages/pkg-1', method: 'get', headers: { Authorization: 'Basic key' } },
    };
    mockClient.get.mockRejectedValue(readbackError);

    await expect(new ValidsignService().createPackage(input)).rejects.toBe(readbackError);
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('Authorization');
  });

  it('logs a transport failure that never produced a response, without its config', async () => {
    // A timeout or socket reset rejects with no `.response`, so the branch that
    // reads e.response.status would throw on it. Everything but `.message` is
    // still unsafe to log: `.config.headers` carries the account-wide key.
    const transportError = {
      isAxiosError: true,
      message: 'socket hang up',
      config: { url: '/packages', method: 'post', headers: { Authorization: 'Basic secret-key' } },
    };
    mockClient.post.mockRejectedValue(transportError);

    await expect(new ValidsignService().createPackage(input)).rejects.toBe(transportError);

    const serialized = JSON.stringify(mockLogger.error.mock.calls);
    expect(serialized).toContain('socket hang up');
    expect(serialized).toContain('/packages');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('Authorization');
  });
  it('sends a package by putting SENT upstream', async () => {
    mockClient.put.mockResolvedValue({ data: {} });

    await new ValidsignService().sendPackage('pkg-1');

    expect(mockClient.put).toHaveBeenCalledWith('/packages/pkg-1', { status: 'SENT' });
  });

  it('asks ValidSign for the signing URL rather than composing one', async () => {
    // The real ceremony URL is a signed, single-use link ValidSign mints; it
    // cannot be derived from the package and role ids.
    mockClient.get.mockResolvedValue({ data: { url: 'https://my.validsign.eu/ceremony/abc' } });

    const url = await new ValidsignService().getSigningUrl('pkg-1', 'role-1');

    expect(mockClient.get).toHaveBeenCalledWith('/packages/pkg-1/roles/role-1/signingUrl');
    expect(url).toBe('https://my.validsign.eu/ceremony/abc');
  });

  it('reads the package status back from upstream', async () => {
    mockClient.get.mockResolvedValue({ data: { status: 'COMPLETED' } });

    expect(await new ValidsignService().getPackageStatus('pkg-1')).toBe('COMPLETED');
  });

  it('returns the signed document as a Buffer of the raw response bytes', async () => {
    // responseType: 'arraybuffer' means axios hands back an ArrayBuffer, not a
    // string -- Buffer.from must be given it verbatim or the PDF is corrupted.
    const bytes = Buffer.from('%PDF-1.7 signed');
    mockClient.get.mockResolvedValue({
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    const out = await new ValidsignService().downloadSignedDocument('pkg-1', 'doc-1');

    expect(mockClient.get).toHaveBeenCalledWith('/packages/pkg-1/documents/doc-1/pdf', {
      responseType: 'arraybuffer',
    });
    expect(out.toString()).toBe('%PDF-1.7 signed');
  });

  it('returns the evidence summary as a Buffer of the raw response bytes', async () => {
    const bytes = Buffer.from('%PDF-1.7 evidence');
    mockClient.get.mockResolvedValue({
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    const out = await new ValidsignService().downloadEvidenceSummary('pkg-1');

    expect(mockClient.get).toHaveBeenCalledWith('/packages/pkg-1/evidence/summary', {
      responseType: 'arraybuffer',
    });
    expect(out.toString()).toBe('%PDF-1.7 evidence');
  });
});
