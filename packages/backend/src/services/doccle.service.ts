import axios, { AxiosInstance } from 'axios';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';

const logger = createLogger('doccle-service');

const xmlBuilder = new XMLBuilder({
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  ignoreAttributes: false,
  suppressBooleanAttributes: false,
});

const xmlParser = new XMLParser({
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  ignoreAttributes: false,
  // Response elements may or may not carry the same ns1: prefix as requests;
  // stripping it lets callers look up plain field names either way.
  removeNSPrefix: true,
});

/**
 * XML namespaces used by the v1 mci-rest-app XSD (confirmed against Doccle's
 * "Sender Setup Tutorial" — the OpenAPI-derived YAML does not capture these).
 * The root element and its immediate child (`receiver`/`document`) sit in the
 * default REST_NS, unprefixed; every field nested deeper uses the ns1: prefix
 * bound to the domain-specific namespace (receiver vs documents).
 */
const REST_NS = 'http://www.atosworldline.com/archivingPortal/rest';
const RECEIVER_NS = 'http://www.atosworldline.com/archivingPortal/receiver';
const DOCUMENTS_NS = 'http://www.atosworldline.com/archivingPortal/documents';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DoccleLanguageText {
  value: string;
  lang: string;
  defaultLang?: boolean;
}

export interface DoccleReceiverPayload {
  id: string;
  action?: 'Store' | 'Delete';
  labels?: { labelDefault: string };
  personalInformation?: {
    title?: 'MR' | 'MRS' | 'MISS';
    firstName?: string;
    middleName?: string;
    lastName?: string;
    gender?: 'Male' | 'Female';
    birthDate?: string;
    nationality?: string;
  };
  enterpriseInformation?: {
    enterpriseName?: string;
    enterpriseNumber?: string;
    enterpriseCountryISO?: string;
  };
  contactDetails?: {
    street?: string;
    houseNumber?: string;
    boxNumber?: string;
    region?: string;
    phoneNumber?: string;
    mobileNumber?: string;
    email?: string;
    postalCode?: string;
    city?: string;
    countryISO?: string;
    languageISO?: string;
  };
}

export interface DoccleDocumentPayload {
  action?: 'Store' | 'Move' | 'Delete' | 'MarkPaid';
  senderDocumentType?: string;
  classificationLevel?: 'Public' | 'Confidential' | 'HighlyConfidential';
  publishDatetime?: string;
  unreadAfterDays?: number;
  documentDisplay?: {
    presentationType?: string;
    brand?: string;
    name?: DoccleLanguageText[];
    subject?: DoccleLanguageText[];
    description?: DoccleLanguageText[];
  };
  documentFile: {
    /** Free-form reference for the file, echoed back by Doccle. */
    reference: string;
    /** The PDF, base64-encoded. Serialized into the sibling <newDocumentVersion>
     *  element, not nested inside <document-file> — see Doccle's putDocument example. */
    contentBase64: string;
    mimeType: string;
    /** Opaque value Doccle associates with the file format; meaning undocumented
     *  beyond the example ("A-1b"). Pass through only if you have one. */
    formatAttribute?: string;
    digest?: { content: string; digestAlgorithm: string };
    size?: number;
  };
}

export interface DoccleDocumentResult {
  documentUri?: string;
  remPickupUrl?: string;
}

export interface DoccleHealth {
  status: 'up' | 'down' | 'stub';
  reachable: boolean;
  latency?: number;
  error?: string;
  /** This API has no side-effect-free endpoint, so /status can only prove
   *  the host is reachable — it cannot verify DOCCLE_USERNAME/DOCCLE_PASSWORD. */
  note?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * DoccleService — wrapper around the Doccle Sender Service v1 (mci-rest-app) API.
 *
 * Authentication: HTTP Basic, via DOCCLE_USERNAME/DOCCLE_PASSWORD on every request.
 *
 * Stub mode:
 *   When DOCCLE_STUB_MODE=true (default) all methods return realistic fake
 *   responses. The stub is transparent — callers cannot distinguish stub from live.
 */
export class DoccleService {
  private client: AxiosInstance;
  private readonly stubMode: boolean;

  constructor() {
    this.stubMode = config.doccle.stubMode;

    this.client = axios.create({
      baseURL: config.doccle.apiBaseUrl,
      timeout: 15_000,
      auth: { username: config.doccle.username, password: config.doccle.password },
      headers: { 'Content-Type': 'application/xml' },
    });

    if (this.stubMode) {
      logger.info('[DoccleService] Running in STUB MODE — no real Doccle calls will be made');
    }
  }

  // ─── Receivers ───────────────────────────────────────────────────────────────

  async createOrUpdateReceiver(
    senderName: string,
    externalReference: string,
    receiver: DoccleReceiverPayload
  ): Promise<{ created: boolean }> {
    if (this.stubMode) {
      logger.info('[stub] createOrUpdateReceiver()', { senderName, externalReference });
      return { created: true };
    }

    try {
      const response = await this.client.put(
        `senders/${senderName}/receivers/${externalReference}`,
        this.buildReceiverXml(receiver)
      );
      return { created: response.status === 201 };
    } catch (err) {
      this.logUpstreamError('createOrUpdateReceiver', err);
      throw err;
    }
  }

  // ─── Documents ───────────────────────────────────────────────────────────────

  async putDocument(
    senderName: string,
    receiverExternalReferenceId: string,
    documentId: string,
    document: DoccleDocumentPayload
  ): Promise<DoccleDocumentResult> {
    if (this.stubMode) {
      logger.info('[stub] putDocument()', { senderName, receiverExternalReferenceId, documentId });
      return {
        documentUri: `stub://doccle/${senderName}/${receiverExternalReferenceId}/${documentId}`,
        remPickupUrl: `http://localhost:8080/doccle-euui/direct/registeredDelivery/stub-${documentId}`,
      };
    }

    try {
      const response = await this.client.post(
        `senders/${senderName}/receivers/${receiverExternalReferenceId}/documents/${documentId}`,
        this.buildDocumentXml(documentId, receiverExternalReferenceId, document),
        { headers: { Accept: 'application/vnd.doccle.sapi.v2+xml' } }
      );
      return this.parseDocumentResponse(response.data);
    } catch (err) {
      this.logUpstreamError('putDocument', err);
      throw err;
    }
  }

  async markDocumentPaid(
    senderName: string,
    receiverExternalReferenceId: string,
    documentId: string
  ): Promise<void> {
    if (this.stubMode) {
      logger.info('[stub] markDocumentPaid()', {
        senderName,
        receiverExternalReferenceId,
        documentId,
      });
      return;
    }

    try {
      await this.client.post(
        `senders/${senderName}/receivers/${receiverExternalReferenceId}/documents/${documentId}/paid`
      );
    } catch (err) {
      this.logUpstreamError('markDocumentPaid', err);
      throw err;
    }
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<DoccleHealth> {
    if (this.stubMode) {
      return { status: 'stub', reachable: true };
    }

    const note =
      'Reachability only — this API has no read-only endpoint to verify DOCCLE_USERNAME/DOCCLE_PASSWORD without side effects.';

    try {
      const start = Date.now();
      // Every real endpoint on this API creates or mutates data, so we cannot
      // safely probe authentication. Any HTTP response (even 404/401) proves
      // the host is up; only a network-level failure means "down".
      await this.client.get('/', { validateStatus: () => true });
      return { status: 'up', reachable: true, latency: Date.now() - start, note };
    } catch (err) {
      return { status: 'down', reachable: false, error: getErrorMessage(err), note };
    }
  }

  // ─── XML building ────────────────────────────────────────────────────────────

  private buildReceiverXml(receiver: DoccleReceiverPayload): string {
    const { personalInformation: pi, enterpriseInformation: ei, contactDetails: cd } = receiver;

    return xmlBuilder.build({
      createUpdateReceiver: {
        '@_xmlns': REST_NS,
        '@_xmlns:ns1': RECEIVER_NS,
        receiver: {
          'ns1:id': receiver.id,
          ...(receiver.action ? { 'ns1:action': receiver.action } : {}),
          ...(receiver.labels
            ? { 'ns1:labels': { 'ns1:label-default': receiver.labels.labelDefault } }
            : {}),
          ...(pi
            ? {
                'ns1:personal-information': {
                  ...(pi.title ? { 'ns1:title': pi.title } : {}),
                  ...(pi.firstName ? { 'ns1:firstName': pi.firstName } : {}),
                  ...(pi.middleName ? { 'ns1:middleName': pi.middleName } : {}),
                  ...(pi.lastName ? { 'ns1:lastName': pi.lastName } : {}),
                  ...(pi.gender ? { 'ns1:gender': pi.gender } : {}),
                  ...(pi.birthDate ? { 'ns1:birthDate': pi.birthDate } : {}),
                  ...(pi.nationality ? { 'ns1:nationality': pi.nationality } : {}),
                },
              }
            : {}),
          ...(ei
            ? {
                'ns1:enterprise-information': {
                  ...(ei.enterpriseName ? { 'ns1:enterpriseName': ei.enterpriseName } : {}),
                  ...(ei.enterpriseNumber ? { 'ns1:enterpriseNumber': ei.enterpriseNumber } : {}),
                  ...(ei.enterpriseCountryISO
                    ? { 'ns1:enterpriseCountryISO': ei.enterpriseCountryISO }
                    : {}),
                },
              }
            : {}),
          ...(cd
            ? {
                'ns1:contact-details': {
                  ...(cd.street ? { 'ns1:street': cd.street } : {}),
                  ...(cd.houseNumber ? { 'ns1:houseNumber': cd.houseNumber } : {}),
                  ...(cd.boxNumber ? { 'ns1:boxNumber': cd.boxNumber } : {}),
                  ...(cd.region ? { 'ns1:region': cd.region } : {}),
                  ...(cd.phoneNumber ? { 'ns1:phoneNumber': cd.phoneNumber } : {}),
                  ...(cd.mobileNumber ? { 'ns1:mobileNumber': cd.mobileNumber } : {}),
                  ...(cd.email ? { 'ns1:email': cd.email } : {}),
                  ...(cd.postalCode ? { 'ns1:postalCode': cd.postalCode } : {}),
                  ...(cd.city ? { 'ns1:city': cd.city } : {}),
                  ...(cd.countryISO ? { 'ns1:countryISO': cd.countryISO } : {}),
                  ...(cd.languageISO ? { 'ns1:languageISO': cd.languageISO } : {}),
                },
              }
            : {}),
        },
      },
    });
  }

  private buildDocumentXml(
    documentId: string,
    receiverExternalReferenceId: string,
    document: DoccleDocumentPayload
  ): string {
    return xmlBuilder.build({
      putDocument: {
        '@_xmlns': REST_NS,
        '@_xmlns:ns1': DOCUMENTS_NS,
        document: {
          'ns1:id': documentId,
          'ns1:receiver': { 'ns1:receiver-id': receiverExternalReferenceId },
          ...(document.action ? { 'ns1:action': document.action } : {}),
          ...(document.senderDocumentType
            ? { 'ns1:sender-document-type': document.senderDocumentType }
            : {}),
          ...(document.classificationLevel
            ? { 'ns1:classification-level': document.classificationLevel }
            : {}),
          ...(document.publishDatetime ? { 'ns1:publish-datetime': document.publishDatetime } : {}),
          ...(document.unreadAfterDays !== undefined
            ? { 'ns1:unreadAfterDays': document.unreadAfterDays }
            : {}),
          ...(document.documentDisplay
            ? { 'ns1:document-display': this.buildDocumentDisplay(document.documentDisplay) }
            : {}),
          'ns1:document-file': {
            'ns1:reference': document.documentFile.reference,
            'ns1:format': {
              '@_mime-type': document.documentFile.mimeType,
              ...(document.documentFile.formatAttribute
                ? { '@_attribute': document.documentFile.formatAttribute }
                : {}),
            },
            ...(document.documentFile.digest
              ? {
                  'ns1:digest': {
                    '#text': document.documentFile.digest.content,
                    '@_digestAlgorithm': document.documentFile.digest.digestAlgorithm,
                  },
                }
              : {}),
            ...(document.documentFile.size !== undefined
              ? { 'ns1:size': document.documentFile.size }
              : {}),
          },
        },
        // Sibling of <document>, not nested in document-file/format — per
        // Doccle's putDocument example ("put here the base64 encoded PDF").
        newDocumentVersion: document.documentFile.contentBase64,
      },
    });
  }

  private buildDocumentDisplay(display: NonNullable<DoccleDocumentPayload['documentDisplay']>) {
    return {
      ...(display.presentationType ? { 'ns1:presentation-type': display.presentationType } : {}),
      ...(display.brand ? { 'ns1:brand': display.brand } : {}),
      ...(display.name ? { 'ns1:name': this.toEntryArray(display.name) } : {}),
      ...(display.subject ? { 'ns1:subject': this.toEntryArray(display.subject) } : {}),
      ...(display.description ? { 'ns1:description': this.toEntryArray(display.description) } : {}),
    };
  }

  private toEntryArray(items: DoccleLanguageText[]) {
    return {
      'ns1:entry': items.map((item) => ({
        '#text': item.value,
        '@_lang': item.lang,
        ...(item.defaultLang !== undefined ? { '@_defaultLang': item.defaultLang } : {}),
      })),
    };
  }

  // ─── XML/response parsing ────────────────────────────────────────────────────

  private parseDocumentResponse(xml: unknown): DoccleDocumentResult {
    if (typeof xml !== 'string') return {};
    const parsed = xmlParser.parse(xml) as {
      putDocumentResponse?: { documentUri?: string; remPickupUrl?: string };
    };
    return {
      documentUri: parsed.putDocumentResponse?.documentUri,
      remPickupUrl: parsed.putDocumentResponse?.remPickupUrl,
    };
  }

  /**
   * Doccle's error bodies vary by endpoint: the document endpoint returns XML
   * (`<error><code/><message/></error>`), receiver/paid endpoints return JSON
   * (already parsed by axios onto `error.response.data`).
   */
  private upstreamMessage(err: unknown): string {
    const response = (err as { response?: { data?: unknown } }).response;
    const data = response?.data;

    if (typeof data === 'string' && data.trim().startsWith('<')) {
      const parsed = xmlParser.parse(data) as { error?: { message?: string; code?: string } };
      if (parsed.error?.message) return parsed.error.message;
    }

    const jsonError = data as { message?: string } | undefined;
    if (jsonError?.message) return jsonError.message;

    return getErrorMessage(err);
  }

  private logUpstreamError(operation: string, err: unknown): void {
    const response = (err as { response?: { status?: number; data?: unknown } }).response;
    if (response) {
      logger.error(`Doccle ${operation} returned an error response`, {
        status: response.status,
        message: this.upstreamMessage(err),
        upstream: response.data,
      });
    } else {
      logger.error(`Doccle ${operation} failed`, { error: getErrorMessage(err) });
    }
  }
}

export const doccleService = new DoccleService();
export default doccleService;
