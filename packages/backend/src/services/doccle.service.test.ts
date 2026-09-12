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
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));

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

describe('DoccleService — optional payload fields', () => {
  let svc: DoccleService;

  beforeEach(() => {
    mockConfig.doccle.stubMode = false;
    svc = new DoccleService();
  });

  it('emits every optional receiver element when the payload carries them all', async () => {
    mockClient.put.mockResolvedValueOnce({ status: 201 });

    await svc.createOrUpdateReceiver('acme', 'ref-1', {
      id: 'ref-1',
      action: 'Store',
      labels: { labelDefault: 'Gemeente' },
      personalInformation: {
        title: 'MRS',
        firstName: 'Jane',
        middleName: 'van',
        lastName: 'Doe',
        gender: 'Female',
        birthDate: '1980-01-01',
        nationality: 'NL',
      },
      enterpriseInformation: {
        enterpriseName: 'Acme BV',
        enterpriseNumber: '12345678',
        enterpriseCountryISO: 'NL',
      },
      contactDetails: {
        street: 'Dorpsstraat',
        houseNumber: '1',
        boxNumber: 'A',
        region: 'Flevoland',
        phoneNumber: '0301234567',
        mobileNumber: '0612345678',
        email: 'jane@example.com',
        postalCode: '1234 AB',
        city: 'Almere',
        countryISO: 'NL',
        languageISO: 'nl',
      },
    });

    const body = mockClient.put.mock.calls[0][1] as string;
    for (const element of [
      '<ns1:action>Store</ns1:action>',
      '<ns1:label-default>Gemeente</ns1:label-default>',
      '<ns1:title>MRS</ns1:title>',
      '<ns1:middleName>van</ns1:middleName>',
      '<ns1:gender>Female</ns1:gender>',
      '<ns1:birthDate>1980-01-01</ns1:birthDate>',
      '<ns1:nationality>NL</ns1:nationality>',
      '<ns1:enterpriseName>Acme BV</ns1:enterpriseName>',
      '<ns1:enterpriseNumber>12345678</ns1:enterpriseNumber>',
      '<ns1:enterpriseCountryISO>NL</ns1:enterpriseCountryISO>',
      '<ns1:street>Dorpsstraat</ns1:street>',
      '<ns1:houseNumber>1</ns1:houseNumber>',
      '<ns1:boxNumber>A</ns1:boxNumber>',
      '<ns1:region>Flevoland</ns1:region>',
      '<ns1:phoneNumber>0301234567</ns1:phoneNumber>',
      '<ns1:mobileNumber>0612345678</ns1:mobileNumber>',
      '<ns1:postalCode>1234 AB</ns1:postalCode>',
      '<ns1:city>Almere</ns1:city>',
      '<ns1:countryISO>NL</ns1:countryISO>',
      '<ns1:languageISO>nl</ns1:languageISO>',
    ]) {
      expect(body).toContain(element);
    }
  });

  it('emits empty sections when the receiver sub-objects are present but blank', async () => {
    mockClient.put.mockResolvedValueOnce({ status: 201 });

    await svc.createOrUpdateReceiver('acme', 'ref-1', {
      id: 'ref-1',
      personalInformation: {},
      enterpriseInformation: {},
      contactDetails: {},
    });

    const body = mockClient.put.mock.calls[0][1] as string;
    expect(body).toContain('personal-information');
    expect(body).toContain('enterprise-information');
    expect(body).toContain('contact-details');
    expect(body).not.toContain('<ns1:firstName>');
    expect(body).not.toContain('<ns1:enterpriseName>');
    expect(body).not.toContain('<ns1:email>');
  });

  it('emits every optional document element, including the display block', async () => {
    mockClient.post.mockResolvedValueOnce({ data: '<putDocumentResponse></putDocumentResponse>' });

    await svc.putDocument('acme', 'ref-1', 'doc-1', {
      action: 'Store',
      senderDocumentType: 'INVOICE',
      classificationLevel: 'Confidential',
      publishDatetime: '2026-08-21T09:00:00Z',
      unreadAfterDays: 30,
      documentDisplay: {
        presentationType: 'DEFAULT',
        brand: 'Gemeente Almere',
        name: [{ lang: 'nl', value: 'Aanslag', defaultLang: true }],
        subject: [{ lang: 'nl', value: 'Onderwerp' }],
        description: [{ lang: 'nl', value: 'Omschrijving' }],
      },
      documentFile: {
        reference: 'invoice.pdf',
        contentBase64: 'YmFzZTY0',
        mimeType: 'application/pdf',
        formatAttribute: 'PDF/A',
        digest: { content: 'abc123', digestAlgorithm: 'SHA-256' },
        size: 2048,
      },
    });

    const body = mockClient.post.mock.calls[0][1] as string;
    for (const element of [
      '<ns1:action>Store</ns1:action>',
      '<ns1:sender-document-type>INVOICE</ns1:sender-document-type>',
      '<ns1:classification-level>Confidential</ns1:classification-level>',
      '<ns1:publish-datetime>2026-08-21T09:00:00Z</ns1:publish-datetime>',
      '<ns1:unreadAfterDays>30</ns1:unreadAfterDays>',
      '<ns1:presentation-type>DEFAULT</ns1:presentation-type>',
      '<ns1:brand>Gemeente Almere</ns1:brand>',
      'defaultLang="true"',
      'attribute="PDF/A"',
      'digestAlgorithm="SHA-256"',
      '<ns1:size>2048</ns1:size>',
    ]) {
      expect(body).toContain(element);
    }
  });

  it('omits defaultLang on a language entry that does not set it', async () => {
    mockClient.post.mockResolvedValueOnce({ data: '<putDocumentResponse></putDocumentResponse>' });

    await svc.putDocument('acme', 'ref-1', 'doc-1', {
      documentDisplay: { name: [{ lang: 'nl', value: 'Aanslag' }] },
      documentFile: {
        reference: 'invoice.pdf',
        contentBase64: 'YmFzZTY0',
        mimeType: 'application/pdf',
      },
    });

    const body = mockClient.post.mock.calls[0][1] as string;
    expect(body).toContain('lang="nl"');
    expect(body).not.toContain('defaultLang');
  });
});

describe('DoccleService — upstream error messages', () => {
  let svc: DoccleService;

  beforeEach(() => {
    mockConfig.doccle.stubMode = false;
    svc = new DoccleService();
  });

  it('prefers the message from an XML error body', async () => {
    mockClient.put.mockRejectedValueOnce({
      response: {
        status: 400,
        data: '<error><code>REC0013</code><message>receiver does not exist</message></error>',
      },
    });
    await expect(
      svc.createOrUpdateReceiver('acme', 'ref-1', minimalReceiver)
    ).rejects.toBeDefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('error response'),
      expect.objectContaining({ message: 'receiver does not exist' })
    );
  });

  it('falls back to the raw error when the body is neither XML nor a message object', async () => {
    mockClient.put.mockRejectedValueOnce(
      Object.assign(new Error('connect ETIMEDOUT'), { response: { status: 504, data: 12345 } })
    );
    await expect(
      svc.createOrUpdateReceiver('acme', 'ref-1', minimalReceiver)
    ).rejects.toBeDefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('error response'),
      expect.objectContaining({ message: 'connect ETIMEDOUT' })
    );
  });

  it('logs a plain failure when the error carries no response at all', async () => {
    mockClient.put.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(
      svc.createOrUpdateReceiver('acme', 'ref-1', minimalReceiver)
    ).rejects.toBeDefined();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('failed'), {
      error: 'socket hang up',
    });
  });
});

describe('DoccleService — putDocument response parsing', () => {
  it('returns an empty result when the response body is not a string', async () => {
    mockConfig.doccle.stubMode = false;
    const svc = new DoccleService();
    mockClient.post.mockResolvedValueOnce({ data: { unexpected: 'json' } });
    await expect(svc.putDocument('acme', 'ref-1', 'doc-1', minimalDocument)).resolves.toEqual({});
  });
});
