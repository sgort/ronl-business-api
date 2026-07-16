/**
 * Unit tests for DoccleService — both stub mode and the live v1 (mci-rest-app) paths.
 *
 * axios is mocked at the module boundary: axios.create() returns a controllable
 * client whose get/put/post we drive per test.
 */

// --- mocks (hoisted above imports; names must start with "mock") ---
const mockClient = {
  get: jest.fn(),
  put: jest.fn(),
  post: jest.fn(),
};

const mockConfig = {
  doccle: {
    apiBaseUrl: 'https://doccle.test/mci-rest-app/rest/mci/external',
    username: 'svc-user',
    password: 'secret',
    stubMode: true,
  },
};

const mockAxiosCreate: jest.Mock = jest.fn(() => mockClient);

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: (config: unknown) => mockAxiosCreate(config) as typeof mockClient },
}));
jest.mock('@utils/config', () => ({ config: mockConfig }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { DoccleService, DoccleDocumentPayload, DoccleReceiverPayload } from './doccle.service';

const minimalDocument: DoccleDocumentPayload = {
  documentFile: {
    reference: 'invoice.pdf',
    contentBase64: 'YmFzZTY0',
    mimeType: 'application/pdf',
  },
};

const minimalReceiver: DoccleReceiverPayload = { id: 'receiver-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.doccle.stubMode = true;
});

describe('DoccleService — stub mode', () => {
  let svc: DoccleService;
  beforeEach(() => {
    mockConfig.doccle.stubMode = true;
    svc = new DoccleService();
  });

  it('never touches the network', async () => {
    await svc.createOrUpdateReceiver('sender', 'ref-1', minimalReceiver);
    await svc.putDocument('sender', 'ref-1', 'doc-1', minimalDocument);
    await svc.markDocumentPaid('sender', 'ref-1', 'doc-1');
    expect(mockClient.get).not.toHaveBeenCalled();
    expect(mockClient.put).not.toHaveBeenCalled();
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it('createOrUpdateReceiver reports created', async () => {
    await expect(svc.createOrUpdateReceiver('sender', 'ref-1', minimalReceiver)).resolves.toEqual({
      created: true,
    });
  });

  it('putDocument returns a stub uri scoped to the sender/receiver/document', async () => {
    const res = await svc.putDocument('sender', 'ref-1', 'doc-1', minimalDocument);
    expect(res.documentUri).toBe('stub://doccle/sender/ref-1/doc-1');
    expect(res.remPickupUrl).toMatch(/doc-1$/);
  });

  it('markDocumentPaid resolves without error', async () => {
    await expect(svc.markDocumentPaid('sender', 'ref-1', 'doc-1')).resolves.toBeUndefined();
  });

  it('healthCheck reports stub + reachable', async () => {
    await expect(svc.healthCheck()).resolves.toEqual({ status: 'stub', reachable: true });
  });
});

describe('DoccleService — live mode', () => {
  let svc: DoccleService;
  beforeEach(() => {
    mockConfig.doccle.stubMode = false;
    svc = new DoccleService();
  });

  it('configures axios with Basic Auth and the configured base URL', () => {
    expect(mockAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://doccle.test/mci-rest-app/rest/mci/external',
        auth: { username: 'svc-user', password: 'secret' },
      })
    );
  });

  describe('createOrUpdateReceiver()', () => {
    it('PUTs kebab-cased XML to the receiver path and reports created:true on 201', async () => {
      mockClient.put.mockResolvedValueOnce({ status: 201 });

      const res = await svc.createOrUpdateReceiver('acme', 'ref-1', {
        id: 'ref-1',
        personalInformation: { firstName: 'Jane', lastName: 'Doe' },
        contactDetails: { email: 'jane@example.com' },
      });

      expect(res).toEqual({ created: true });
      const [path, body] = mockClient.put.mock.calls[0];
      expect(path).toBe('senders/acme/receivers/ref-1');
      expect(body).toContain(
        '<createUpdateReceiver xmlns="http://www.atosworldline.com/archivingPortal/rest" xmlns:ns1="http://www.atosworldline.com/archivingPortal/receiver">'
      );
      expect(body).toContain('<ns1:personal-information>');
      expect(body).toContain('<ns1:firstName>Jane</ns1:firstName>');
      expect(body).toContain('<ns1:contact-details>');
      expect(body).toContain('<ns1:email>jane@example.com</ns1:email>');
    });

    it('reports created:false on 200 (update, not create)', async () => {
      mockClient.put.mockResolvedValueOnce({ status: 200 });
      const res = await svc.createOrUpdateReceiver('acme', 'ref-1', minimalReceiver);
      expect(res).toEqual({ created: false });
    });

    it('propagates upstream errors', async () => {
      mockClient.put.mockRejectedValueOnce({
        response: { status: 500, data: { code: 'REC0013', message: 'does not exist' } },
      });
      await expect(
        svc.createOrUpdateReceiver('acme', 'ref-1', minimalReceiver)
      ).rejects.toMatchObject({ response: { status: 500 } });
    });
  });

  describe('putDocument()', () => {
    it('POSTs XML with the receiver-id and documentFile, requesting the v2 accept type', async () => {
      mockClient.post.mockResolvedValueOnce({
        data: '<putDocumentResponse><documentUri>uri-123</documentUri><remPickupUrl>http://pickup</remPickupUrl></putDocumentResponse>',
      });

      const res = await svc.putDocument('acme', 'ref-1', 'doc-1', {
        senderDocumentType: 'INFO',
        classificationLevel: 'Public',
        documentFile: {
          reference: 'f.pdf',
          contentBase64: 'YmFzZTY0',
          mimeType: 'application/pdf',
        },
      });

      expect(res).toEqual({ documentUri: 'uri-123', remPickupUrl: 'http://pickup' });

      const [path, body, requestConfig] = mockClient.post.mock.calls[0];
      expect(path).toBe('senders/acme/receivers/ref-1/documents/doc-1');
      expect(body).toContain(
        '<putDocument xmlns="http://www.atosworldline.com/archivingPortal/rest" xmlns:ns1="http://www.atosworldline.com/archivingPortal/documents">'
      );
      expect(body).toContain(
        '<ns1:receiver><ns1:receiver-id>ref-1</ns1:receiver-id></ns1:receiver>'
      );
      expect(body).toContain('<ns1:sender-document-type>INFO</ns1:sender-document-type>');
      expect(body).toContain('<ns1:classification-level>Public</ns1:classification-level>');
      expect(body).toContain('<ns1:format mime-type="application/pdf"');
      // The base64 payload is a sibling of <document>, not nested in document-file/format.
      expect(body).toContain('<newDocumentVersion>YmFzZTY0</newDocumentVersion>');
      expect(requestConfig.headers.Accept).toBe('application/vnd.doccle.sapi.v2+xml');
    });

    it('serializes documentDisplay name/subject as wrapped language entries', async () => {
      mockClient.post.mockResolvedValueOnce({
        data: '<putDocumentResponse></putDocumentResponse>',
      });

      await svc.putDocument('acme', 'ref-1', 'doc-1', {
        documentDisplay: {
          name: [{ value: 'Factuur', lang: 'nl', defaultLang: true }],
        },
        documentFile: minimalDocument.documentFile,
      });

      const body = mockClient.post.mock.calls[0][1];
      expect(body).toContain(
        '<ns1:name><ns1:entry lang="nl" defaultLang="true">Factuur</ns1:entry></ns1:name>'
      );
    });

    it('propagates upstream XML error responses', async () => {
      mockClient.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: '<error><code>E1</code><message>bad request</message></error>',
        },
      });
      await expect(
        svc.putDocument('acme', 'ref-1', 'doc-1', minimalDocument)
      ).rejects.toMatchObject({ response: { status: 500 } });
    });
  });

  describe('markDocumentPaid()', () => {
    it('POSTs to the /paid sub-path with no body', async () => {
      mockClient.post.mockResolvedValueOnce({ status: 200 });
      await svc.markDocumentPaid('acme', 'ref-1', 'doc-1');
      expect(mockClient.post).toHaveBeenCalledWith(
        'senders/acme/receivers/ref-1/documents/doc-1/paid'
      );
    });

    it('propagates upstream errors', async () => {
      mockClient.post.mockRejectedValueOnce({
        response: { status: 500, data: { message: 'boom' } },
      });
      await expect(svc.markDocumentPaid('acme', 'ref-1', 'doc-1')).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe('healthCheck()', () => {
    it('reports up + reachable + latency when the host responds', async () => {
      mockClient.get.mockResolvedValueOnce({ status: 404 });
      const res = await svc.healthCheck();
      expect(res).toMatchObject({ status: 'up', reachable: true });
      expect(typeof res.latency).toBe('number');
      expect(res.note).toMatch(/Reachability only/);
    });

    it('reports down + unreachable on a network-level failure', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const res = await svc.healthCheck();
      expect(res).toMatchObject({ status: 'down', reachable: false, error: 'ECONNREFUSED' });
    });
  });
});
