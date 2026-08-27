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
    expect(payload.documents[0].approvals[0].fields[0]).toMatchObject({
      page: 0,
      width: 200,
      height: 50,
      type: 'SIGNATURE',
    });
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
