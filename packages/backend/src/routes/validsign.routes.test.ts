import { formatDutchDateTime } from '@utils/dutch-datetime';
/**
 * Route tests for /v1/validsign — the callback (secret-verified, no JWT), the
 * stub signing ceremony (unauthenticated, stub-mode-only), and the
 * authenticated infra-board endpoints (jwt + tenant). operatonService,
 * validsignService and completeSignature are all mocked; no test reaches the
 * ValidSign network.
 */

import type { Request, Response, NextFunction } from 'express';

jest.mock('@utils/config', () => ({
  config: {
    validsign: {
      callbackSecret: 'secret',
      senderEmail: 'sender@flevoland.nl',
    },
    // Mutated directly by individual tests below (same pattern as
    // mockValidsign.isStub) to exercise the configured-origins,
    // empty-origins and wildcard-origin cases for the stub ceremony's
    // frame-ancestors header.
    corsOrigin: ['http://localhost:5173', 'http://localhost:3000'],
  },
}));

jest.mock('@auth/jwt.middleware', () => ({
  jwtMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-test-no-user']) return next();
    if (!req.headers['x-test-auth'])
      return res.status(401).json({ success: false, error: { code: 'MISSING_TOKEN' } });
    req.user = {
      userId: 'u1',
      tenantId: 'flevoland',
      email: (req.headers['x-test-email'] as string | undefined) ?? 'signer@flevoland.nl',
      givenName: 'Jan',
      familyName: 'van der Berg',
      preferredUsername: 'jvdberg',
    } as Request['user'];
    next();
  },
}));

jest.mock('@middleware/tenant.middleware', () => ({
  tenantMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('@services/operaton.service', () => ({
  operatonService: {
    getTask: jest.fn(),
    getTaskSignatureSpec: jest.fn(),
    getTaskVariables: jest.fn(),
    getHistoricTaskVariables: jest.fn(),
    setProcessVariables: jest.fn(),
  },
}));

jest.mock('@services/validsign.service', () => ({
  validsignService: {
    isStub: true,
    createPackage: jest.fn(),
    sendPackage: jest.fn(),
    getSigningUrl: jest.fn(),
    stubSign: jest.fn(),
    stubSignerName: jest.fn(),
    stubSignedAt: jest.fn(),
  },
}));

jest.mock('@services/validsignCompletion.service', () => ({
  completeSignature: jest.fn(),
}));

jest.mock('@services/document/renderTemplate', () => ({ renderTemplate: jest.fn() }));
jest.mock('@services/document/toPdf', () => ({ toPdf: jest.fn() }));

jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import validsignRouter, {
  callbackRouter,
  isCallbackPath,
  resetCallbackLimiterForTests,
} from './validsign.routes';
import { operatonService } from '@services/operaton.service';
import { validsignService } from '@services/validsign.service';
import { completeSignature } from '@services/validsignCompletion.service';
import { renderTemplate } from '@services/document/renderTemplate';
import { toPdf } from '@services/document/toPdf';
import { config } from '@utils/config';

const mockGetTask = operatonService.getTask as jest.Mock;
const mockGetTaskSignatureSpec = operatonService.getTaskSignatureSpec as jest.Mock;
const mockGetTaskVariables = operatonService.getTaskVariables as jest.Mock;
const mockGetHistoricTaskVariables = operatonService.getHistoricTaskVariables as jest.Mock;
const mockSetProcessVariables = operatonService.setProcessVariables as jest.Mock;

const mockValidsign = validsignService as unknown as {
  isStub: boolean;
  createPackage: jest.Mock;
  sendPackage: jest.Mock;
  getSigningUrl: jest.Mock;
  stubSign: jest.Mock;
  stubSignerName: jest.Mock;
  stubSignedAt: jest.Mock;
};

const mockCompleteSignature = completeSignature as jest.Mock;
const mockRenderTemplate = renderTemplate as jest.Mock;
const mockToPdf = toPdf as jest.Mock;

// The real app mounts the callback router BEFORE any body-parsing/auth
// concerns of its own, and relies on the app-wide body parsers -- mirror that
// here rather than mounting an isolated parser per router (see index.ts).
const app = express();
// Mirror index.ts's helmet() call exactly (same directives config) so the
// framing-header tests below observe the SAME headers a real request would
// carry: without this, there would be no X-Frame-Options / CSP on any
// response to prove the stub ceremony route removes/replaces, and every
// other route keeps them.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);
// Mirror index.ts exactly, including using the SAME isCallbackPath
// predicate (not a re-typed literal) -- the callback parses its own body
// and is exempted from this global JSON parser, so a malformed/oversized
// body can only be caught by the callback router's own error handler (see
// validsign.routes.ts).
app.use((req, res, next) => {
  if (isCallbackPath(req.path)) return next();
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use('/v1/validsign', callbackRouter);
app.use('/v1/validsign', validsignRouter);

const authHeader = { 'x-test-auth': '1' };

const mockConfig = config as unknown as { corsOrigin: string[] };

beforeEach(async () => {
  jest.clearAllMocks();
  mockValidsign.isStub = true;
  mockConfig.corsOrigin = ['http://localhost:5173', 'http://localhost:3000'];
  mockGetTask.mockResolvedValue({
    id: 'task-1',
    processInstanceId: 'pi-1',
    taskDefinitionKey: 'signTask',
  });
  // Every test starts with a fresh callback-limiter budget: without this,
  // the test below that deliberately exhausts it would leave every later
  // test in this file that hits /callback observing a stale 429, making
  // the suite's pass/fail depend on execution order.
  await resetCallbackLimiterForTests();
});

describe('POST /v1/validsign/callback', () => {
  it('rejects a request with no shared secret', async () => {
    const res = await request(app).post('/v1/validsign/callback').send({ packageId: 'pkg-1' });
    expect(res.status).toBe(401);
    expect(mockCompleteSignature).not.toHaveBeenCalled();
  });

  it('rejects a wrong shared secret without leaking timing', async () => {
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'wrong')
      .send({ packageId: 'pkg-1' });
    expect(res.status).toBe(401);
  });

  it('accepts a valid callback and drives completion', async () => {
    mockCompleteSignature.mockResolvedValue('completed');
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'secret')
      .send({ packageId: 'pkg-1', name: 'PACKAGE_COMPLETE' });
    expect(res.status).toBe(200);
    expect(mockCompleteSignature).toHaveBeenCalledWith('pkg-1');
  });

  it('answers 200 for an unknown package rather than 404', async () => {
    // A stale retry must generate no noise, and the response must not reveal
    // which package ids exist.
    mockCompleteSignature.mockResolvedValue('noop');
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'secret')
      .send({ packageId: 'never-heard-of-it' });
    expect(res.status).toBe(200);
  });

  it('answers 200 even when completeSignature throws (the poller will retry)', async () => {
    mockCompleteSignature.mockRejectedValue(new Error('operaton unreachable'));
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'secret')
      .send({ packageId: 'pkg-1' });
    expect(res.status).toBe(200);
  });

  it('malformed JSON body: 400, not 500, so ValidSign does not retry forever', async () => {
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'secret')
      .set('Content-Type', 'application/json')
      .send('{"broken"');
    expect(res.status).toBe(400);
    expect(mockCompleteSignature).not.toHaveBeenCalled();
  });

  it('oversized body (over the callback-specific 16kb cap): 400, not 500', async () => {
    const oversized = JSON.stringify({ packageId: 'x'.repeat(20_000) });
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'secret')
      .set('Content-Type', 'application/json')
      .send(oversized);
    expect(res.status).toBe(400);
    expect(mockCompleteSignature).not.toHaveBeenCalled();
  });

  // Each test gets a fresh callback-limiter budget via the beforeEach
  // above, so this deliberately budget-exhausting test carries no ordering
  // constraint on the rest of the file -- it can run anywhere, including
  // here, its original position.
  it('rate-limits by CLIENT IP, not by the attacker-supplied secret header', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 70; i++) {
      // A real attacker would vary this on every request specifically to
      // dodge a secret-keyed limiter (the bug this test guards against).
      const res = await request(app)
        .post('/v1/validsign/callback')
        .set('x-validsign-secret', `secret-${i}`)
        .send({ packageId: 'pkg-1' });
      statuses.push(res.status);
    }
    // If the limiter were still keyed on the header, every request above
    // would get its own fresh budget and none would ever 429.
    expect(statuses).toContain(429);
  });

  // Express routes case-insensitively and tolerates a trailing slash by
  // default, so the router dispatches these two variants to the exact same
  // handler as '/v1/validsign/callback'. The parser exemption and the
  // limiter skip in index.ts (and this test app's mirror of it, above) must
  // match on the SAME predicate the router itself uses, or a malformed body
  // on one of these variants would 500 again instead of 400.
  it('a trailing slash still gets the parser exemption: malformed body is 400, not 500', async () => {
    const res = await request(app)
      .post('/v1/validsign/callback/')
      .set('x-validsign-secret', 'secret')
      .set('Content-Type', 'application/json')
      .send('{"broken"');
    expect(res.status).toBe(400);
  });

  it('a different-case path still gets the parser exemption: malformed body is 400, not 500', async () => {
    const res = await request(app)
      .post('/V1/ValidSign/Callback')
      .set('x-validsign-secret', 'secret')
      .set('Content-Type', 'application/json')
      .send('{"broken"');
    expect(res.status).toBe(400);
  });
});

describe('isCallbackPath', () => {
  it('matches the exact callback path', () => {
    expect(isCallbackPath('/v1/validsign/callback')).toBe(true);
  });

  it('matches one or more trailing slashes', () => {
    expect(isCallbackPath('/v1/validsign/callback/')).toBe(true);
    expect(isCallbackPath('/v1/validsign/callback//')).toBe(true);
  });

  it('matches regardless of case', () => {
    expect(isCallbackPath('/V1/ValidSign/Callback')).toBe(true);
    expect(isCallbackPath('/V1/VALIDSIGN/CALLBACK/')).toBe(true);
  });

  it('does not match a bare slash', () => {
    expect(isCallbackPath('/')).toBe(false);
  });

  it('does not match the empty string', () => {
    expect(isCallbackPath('')).toBe(false);
  });

  it('does not match a percent-encoded trailing slash (not decoded, by design)', () => {
    expect(isCallbackPath('/v1/validsign/callback%2F')).toBe(false);
  });

  it('does not match a path carrying a query string', () => {
    // Express's req.path never includes one, but the predicate must not be
    // fooled into a false positive if it ever were handed one.
    expect(isCallbackPath('/v1/validsign/callback?foo=bar')).toBe(false);
  });

  it('does not match a near-miss suffix', () => {
    expect(isCallbackPath('/v1/validsign/callbackx')).toBe(false);
  });

  it('does not match a sub-path (an internal, not trailing, slash)', () => {
    expect(isCallbackPath('/v1/validsign/callback/extra')).toBe(false);
  });

  it('does not match an unrelated path', () => {
    expect(isCallbackPath('/v1/validsign/task/task-1/spec')).toBe(false);
  });
});

describe('GET /v1/validsign/task/:taskId/spec', () => {
  it('reports required:false for an untagged task', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue(null);
    const res = await request(app).get('/v1/validsign/task/task-1/spec').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ required: false });
  });

  it('reports required:true with status/packageId/signingUrl from process variables', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({ templateId: 'tpl-1', template: {} });
    mockGetTaskVariables.mockResolvedValue({
      validsignStatus: 'sent',
      validsignPackageId: 'pkg-1',
      validsignSigningUrl: '/v1/validsign/stub/ceremony/pkg-1',
    });
    const res = await request(app).get('/v1/validsign/task/task-1/spec').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      required: true,
      templateId: 'tpl-1',
      status: 'sent',
      packageId: 'pkg-1',
      signingUrl: '/v1/validsign/stub/ceremony/pkg-1',
      stubMode: true,
    });
  });

  it('defaults status to none and omits packageId/signingUrl when unset', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({ templateId: 'tpl-1', template: {} });
    mockGetTaskVariables.mockResolvedValue({});
    const res = await request(app).get('/v1/validsign/task/task-1/spec').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      required: true,
      templateId: 'tpl-1',
      status: 'none',
      stubMode: true,
    });
  });

  it('reports stubMode false when the backend is live, so a caller can refuse up front', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({ templateId: 'tpl-1', template: {} });
    mockGetTaskVariables.mockResolvedValue({});
    mockValidsign.isStub = false;
    try {
      const res = await request(app).get('/v1/validsign/task/task-1/spec').set(authHeader);
      expect(res.body.data.stubMode).toBe(false);
    } finally {
      mockValidsign.isStub = true;
    }
  });

  it('401 without a token', async () => {
    const res = await request(app).get('/v1/validsign/task/task-1/spec');
    expect(res.status).toBe(401);
  });

  it('500 when the spec lookup fails', async () => {
    mockGetTaskSignatureSpec.mockRejectedValue(new Error('SIGNATURE_TEMPLATE_NOT_FOUND'));
    const res = await request(app).get('/v1/validsign/task/task-1/spec').set(authHeader);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SIGNATURE_SPEC_FAILED');
  });
});

describe('POST /v1/validsign/task/:taskId/package', () => {
  it('422s when the token carries no email, naming the missing claim', async () => {
    const res = await request(app)
      .post('/v1/validsign/task/task-1/package')
      .set(authHeader)
      .set('x-test-email', '');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MISSING_SIGNER_EMAIL');
    expect(mockValidsign.createPackage).not.toHaveBeenCalled();
  });

  it('creates and sends the package, returning packageId + signingUrl', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Uitgangspunten VO-fase' },
    });
    mockGetTaskVariables.mockResolvedValue({ projectNumber: 'RIP-1' });
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-1', roleId: 'role-1' });
    mockValidsign.getSigningUrl.mockResolvedValue('/v1/validsign/stub/ceremony/pkg-1');

    const res = await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      packageId: 'pkg-1',
      signingUrl: '/v1/validsign/stub/ceremony/pkg-1',
    });
    expect(mockValidsign.createPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderEmail: 'sender@flevoland.nl',
        signer: { email: 'signer@flevoland.nl', firstName: 'Jan', lastName: 'van der Berg' },
      })
    );
    // beforeEach configures corsOrigin as localhost -- the everyday local-dev
    // shape -- so handOverUrl must be omitted (see deriveBoardHandOverUrl):
    // a real ValidSign ceremony's handOver link is followed by the signer's
    // OWN browser on the public internet, which Private Network Access
    // blocks outright from reaching any localhost/private address.
    expect(mockValidsign.createPackage.mock.calls[0][0].handOverUrl).toBeUndefined();
    expect(mockValidsign.sendPackage).toHaveBeenCalledWith('pkg-1');
    expect(mockSetProcessVariables).toHaveBeenCalledWith(
      'pi-1',
      expect.objectContaining({
        validsignPackageId: { value: 'pkg-1', type: 'String' },
        validsignStatus: { value: 'sent', type: 'String' },
      })
    );
  });

  it('falls back to sentTo when the embedded signing URL fetch fails (delivery: embedded)', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Uitgangspunten VO-fase' },
    });
    mockGetTaskVariables.mockResolvedValue({});
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-2', roleId: 'role-1' });
    mockValidsign.getSigningUrl.mockRejectedValue(new Error('no embedded signing configured'));

    const res = await request(app)
      .post('/v1/validsign/task/task-1/package')
      .set(authHeader)
      .send({ delivery: 'embedded' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ packageId: 'pkg-2', sentTo: 'signer@flevoland.nl' });
  });

  it('with no delivery field, defaults to embedded', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Uitgangspunten VO-fase' },
    });
    mockGetTaskVariables.mockResolvedValue({});
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-3', roleId: 'role-1' });
    mockValidsign.getSigningUrl.mockResolvedValue('/v1/validsign/stub/ceremony/pkg-3');

    // No body at all: an older caller that predates the delivery field.
    const res = await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      packageId: 'pkg-3',
      signingUrl: '/v1/validsign/stub/ceremony/pkg-3',
    });
    expect(mockValidsign.getSigningUrl).toHaveBeenCalled();
  });

  it('delivery: email sends without ever calling getSigningUrl, and returns sentTo', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Uitgangspunten VO-fase' },
    });
    mockGetTaskVariables.mockResolvedValue({});
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-4', roleId: 'role-1' });

    const res = await request(app)
      .post('/v1/validsign/task/task-1/package')
      .set(authHeader)
      .send({ delivery: 'email' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ packageId: 'pkg-4', sentTo: 'signer@flevoland.nl' });
    expect(mockValidsign.getSigningUrl).not.toHaveBeenCalled();
    expect(mockValidsign.sendPackage).toHaveBeenCalledWith('pkg-4');
    expect(mockSetProcessVariables).toHaveBeenCalledWith(
      'pi-1',
      expect.objectContaining({
        validsignPackageId: { value: 'pkg-4', type: 'String' },
        validsignStatus: { value: 'sent', type: 'String' },
      })
    );
  });

  it('400s on a bogus delivery value, without creating a package', async () => {
    const res = await request(app)
      .post('/v1/validsign/task/task-1/package')
      .set(authHeader)
      .send({ delivery: 'carrier-pigeon' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DELIVERY');
    expect(mockValidsign.createPackage).not.toHaveBeenCalled();
  });

  it.each([
    ['sent', 'pkg-existing-sent'],
    ['completed', 'pkg-existing-completed'],
    ['declined', 'pkg-existing-declined'],
  ])(
    '409s with VALIDSIGN_PACKAGE_EXISTS when validsignStatus is already %s, without creating a package',
    async (status, existingPackageId) => {
      mockGetTaskSignatureSpec.mockResolvedValue({
        templateId: 'tpl-1',
        template: { name: 'Uitgangspunten VO-fase' },
      });
      mockGetTaskVariables.mockResolvedValue({
        validsignStatus: status,
        validsignPackageId: existingPackageId,
      });

      const res = await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VALIDSIGN_PACKAGE_EXISTS');
      expect(res.body.data).toEqual({ packageId: existingPackageId });
      expect(mockValidsign.createPackage).not.toHaveBeenCalled();
      expect(mockRenderTemplate).not.toHaveBeenCalled();
      expect(mockToPdf).not.toHaveBeenCalled();
    }
  );

  it('validsignStatus: failed is treated as retriable and creates a fresh package', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Uitgangspunten VO-fase' },
    });
    mockGetTaskVariables.mockResolvedValue({
      validsignStatus: 'failed',
      validsignPackageId: 'pkg-old-failed',
    });
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-retry', roleId: 'role-1' });
    mockValidsign.getSigningUrl.mockResolvedValue('/v1/validsign/stub/ceremony/pkg-retry');

    const res = await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

    expect(res.status).toBe(200);
    expect(mockValidsign.createPackage).toHaveBeenCalledTimes(1);
    expect(res.body.data).toEqual({
      packageId: 'pkg-retry',
      signingUrl: '/v1/validsign/stub/ceremony/pkg-retry',
    });
  });

  it('no validsignStatus variable at all still creates a package exactly as before', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Uitgangspunten VO-fase' },
    });
    mockGetTaskVariables.mockResolvedValue({ projectNumber: 'RIP-1' });
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-none', roleId: 'role-1' });
    mockValidsign.getSigningUrl.mockResolvedValue('/v1/validsign/stub/ceremony/pkg-none');

    const res = await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

    expect(res.status).toBe(200);
    expect(mockValidsign.createPackage).toHaveBeenCalledTimes(1);
    expect(res.body.data).toEqual({
      packageId: 'pkg-none',
      signingUrl: '/v1/validsign/stub/ceremony/pkg-none',
    });
  });

  it('404s when the task carries no signature template', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue(null);
    const res = await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_SIGNATURE_TASK');
  });

  it('401 without a token', async () => {
    const res = await request(app).post('/v1/validsign/task/task-1/package');
    expect(res.status).toBe(401);
  });

  it('derives an absolute handOverUrl at the infra board when corsOrigin is a public origin', async () => {
    mockConfig.corsOrigin = ['https://ronl.flevoland.nl'];
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Uitgangspunten VO-fase' },
    });
    mockGetTaskVariables.mockResolvedValue({});
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-fwd', roleId: 'role-1' });
    mockValidsign.getSigningUrl.mockResolvedValue('/v1/validsign/stub/ceremony/pkg-fwd');

    await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

    // Deliberately NOT derived from the request's own host/forwarded
    // headers -- see deriveBoardHandOverUrl's comment -- so this asserts
    // against the configured corsOrigin, not anything supertest sent.
    expect(mockValidsign.createPackage.mock.calls[0][0].handOverUrl).toBe(
      'https://ronl.flevoland.nl/dashboard/infra-board'
    );
  });

  it('omits handOverUrl when corsOrigin is empty/unconfigured', async () => {
    mockConfig.corsOrigin = [];
    mockGetTaskSignatureSpec.mockResolvedValue({
      templateId: 'tpl-1',
      template: { name: 'Uitgangspunten VO-fase' },
    });
    mockGetTaskVariables.mockResolvedValue({});
    mockRenderTemplate.mockReturnValue({ templateId: 'tpl-1', zones: [] });
    mockToPdf.mockResolvedValue({ bytes: Buffer.from('pdf'), signatureFields: [] });
    mockValidsign.createPackage.mockResolvedValue({ packageId: 'pkg-empty', roleId: 'role-1' });
    mockValidsign.getSigningUrl.mockResolvedValue('/v1/validsign/stub/ceremony/pkg-empty');

    await request(app).post('/v1/validsign/task/task-1/package').set(authHeader);

    expect(mockValidsign.createPackage.mock.calls[0][0].handOverUrl).toBeUndefined();
  });
});

describe('GET /v1/validsign/task/:taskId/status', () => {
  it('returns the status from process variables', async () => {
    mockGetTaskVariables.mockResolvedValue({ validsignStatus: 'completed' });
    const res = await request(app).get('/v1/validsign/task/task-1/status').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'completed' });
    expect(mockGetHistoricTaskVariables).not.toHaveBeenCalled();
  });

  it('defaults to none when unset', async () => {
    mockGetTaskVariables.mockResolvedValue({});
    const res = await request(app).get('/v1/validsign/task/task-1/status').set(authHeader);
    expect(res.body.data).toEqual({ status: 'none' });
  });

  // The regression test: this is the actual bug. Completing the task removes
  // it from the RUNTIME task API, which 404s -- that must fall back to
  // history and report the completed status, not fail. Must fail against the
  // pre-fix code (which had no history fallback at all).
  it('falls back to history and reports completed status when the runtime task is gone', async () => {
    mockGetTaskVariables.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    mockGetHistoricTaskVariables.mockResolvedValue({
      validsignStatus: 'completed',
      approvalStatus: 'approved',
    });
    const res = await request(app).get('/v1/validsign/task/task-1/status').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'completed' });
    expect(mockGetHistoricTaskVariables).toHaveBeenCalledWith('task-1');
  });

  it('answers 404 SIGNATURE_STATUS_NOT_FOUND when neither runtime nor history knows the task', async () => {
    mockGetTaskVariables.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    mockGetHistoricTaskVariables.mockResolvedValue(null);
    const res = await request(app).get('/v1/validsign/task/task-1/status').set(authHeader);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SIGNATURE_STATUS_NOT_FOUND');
  });

  // The dangerous confusion this fix must not introduce: a transport failure
  // (Operaton unreachable, timeout, 5xx) must never be treated as "the task
  // is merely historic" -- that would let the panel see 'completed' for a
  // signature that never happened. Only a genuine runtime 404 may fall back
  // to history at all.
  it('does NOT fall back to history, and does NOT report completed, on a transport failure', async () => {
    mockGetTaskVariables.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).get('/v1/validsign/task/task-1/status').set(authHeader);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SIGNATURE_STATUS_FAILED');
    expect(res.body.data?.status).not.toBe('completed');
    expect(mockGetHistoricTaskVariables).not.toHaveBeenCalled();
  });

  it('does NOT fall back to history on a non-404 axios error (e.g. a 500 from Operaton)', async () => {
    mockGetTaskVariables.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });
    const res = await request(app).get('/v1/validsign/task/task-1/status').set(authHeader);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SIGNATURE_STATUS_FAILED');
    expect(mockGetHistoricTaskVariables).not.toHaveBeenCalled();
  });

  it('500s when the runtime is gone AND the history lookup itself blows up (transport failure, not "not found")', async () => {
    mockGetTaskVariables.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    mockGetHistoricTaskVariables.mockRejectedValue(new Error('history unreachable'));
    const res = await request(app).get('/v1/validsign/task/task-1/status').set(authHeader);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SIGNATURE_STATUS_FAILED');
  });
});

describe('the stub ceremony', () => {
  it('GET is 404 when stub mode is off', async () => {
    mockValidsign.isStub = false;
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    expect(res.status).toBe(404);
  });

  it('POST sign is 404 when stub mode is off', async () => {
    mockValidsign.isStub = false;
    const res = await request(app).post('/v1/validsign/stub/ceremony/pkg-1/sign');
    expect(res.status).toBe(404);
    expect(mockValidsign.stubSign).not.toHaveBeenCalled();
  });

  it('GET serves the ceremony page with no auth required, in stub mode', async () => {
    mockValidsign.stubSignerName.mockReturnValue('Jan van der Berg');
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('Onderteken');
    expect(res.text).toContain('Weigeren');
  });

  it('POST sign completes the signature and drives completeSignature', async () => {
    mockCompleteSignature.mockResolvedValue('completed');
    const res = await request(app)
      .post('/v1/validsign/stub/ceremony/pkg-1/sign')
      .send({ outcome: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(mockValidsign.stubSign).toHaveBeenCalledWith('pkg-1', 'COMPLETED');
    expect(mockCompleteSignature).toHaveBeenCalledWith('pkg-1');
  });

  it('POST sign records a decline', async () => {
    mockCompleteSignature.mockResolvedValue('declined');
    const res = await request(app)
      .post('/v1/validsign/stub/ceremony/pkg-1/sign')
      .send({ outcome: 'DECLINED' });
    expect(res.status).toBe(200);
    expect(mockValidsign.stubSign).toHaveBeenCalledWith('pkg-1', 'DECLINED');
  });

  it('states on the ceremony page when the document was offered for signing', async () => {
    mockValidsign.stubSignerName.mockReturnValue('Jan van der Berg');
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    expect(res.text).toContain('Aangeboden op:');
    // The year is enough to prove a formatted date rather than an empty
    // label; the exact clock value would be a race.
    expect(res.text).toMatch(/Aangeboden op: .*\d{4}/);
  });

  it('states the recorded signing moment on the result page', async () => {
    mockCompleteSignature.mockResolvedValue('completed');
    const signedAt = new Date('2026-08-30T12:23:11Z');
    mockValidsign.stubSignedAt.mockReturnValue(signedAt);
    const res = await request(app)
      .post('/v1/validsign/stub/ceremony/pkg-1/sign')
      .send({ outcome: 'COMPLETED' });
    expect(res.text).toContain(`Ondertekend op: ${formatDutchDateTime(signedAt)}`);
  });

  it('omits the stamp when no signing moment is known, rather than inventing one', async () => {
    mockCompleteSignature.mockResolvedValue('declined');
    mockValidsign.stubSignedAt.mockReturnValue(undefined);
    const res = await request(app)
      .post('/v1/validsign/stub/ceremony/pkg-1/sign')
      .send({ outcome: 'DECLINED' });
    expect(res.text).not.toContain('Ondertekend op:');
  });
});

describe('GET /v1/validsign/ceremony/complete', () => {
  // This is the case the fix exists for: ValidSign's own handOver link is
  // only ever followed in LIVE mode, so the route must not 404 there --
  // that would reproduce the exact "confusing, looks broken" symptom this
  // work fixes.
  it('answers 200 with the framing headers even when stub mode is OFF', async () => {
    mockValidsign.isStub = false;
    const res = await request(app).get('/v1/validsign/ceremony/complete');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain(
      'frame-ancestors http://localhost:5173 http://localhost:3000'
    );
  });

  it('also answers 200 in stub mode', async () => {
    mockValidsign.isStub = true;
    const res = await request(app).get('/v1/validsign/ceremony/complete');
    expect(res.status).toBe(200);
  });

  it('tells the signer the signature is recorded and the window can be closed', async () => {
    const res = await request(app).get('/v1/validsign/ceremony/complete');
    expect(res.text).toContain('Ondertekend');
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/v1/validsign/ceremony/complete');
    expect(res.status).not.toBe(401);
  });
});

// Real supertest requests through a real helmet() mount (see the app setup
// above) -- not an assertion on a mocked res.setHeader call, which would
// prove nothing about whether an actual browser renders the frame.
describe('stub ceremony framing headers (iframe embed from a different origin)', () => {
  it('removes X-Frame-Options entirely, so it cannot override the CSP allowance', async () => {
    mockValidsign.stubSignerName.mockReturnValue('Jan van der Berg');
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    expect(res.status).toBe(200);
    expect(res.headers['x-frame-options']).toBeUndefined();
  });

  it('sets CSP frame-ancestors to the configured CORS origins', async () => {
    mockValidsign.stubSignerName.mockReturnValue('Jan van der Berg');
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain('frame-ancestors http://localhost:5173 http://localhost:3000');
  });

  it('never emits a wildcard frame-ancestors, even if corsOrigin somehow carried one', async () => {
    mockConfig.corsOrigin = ['*'];
    mockValidsign.stubSignerName.mockReturnValue('Jan van der Berg');
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).not.toContain('frame-ancestors *');
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("falls back to frame-ancestors 'self' when no origins are configured", async () => {
    mockConfig.corsOrigin = [];
    mockValidsign.stubSignerName.mockReturnValue('Jan van der Berg');
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain('frame-ancestors *');
  });

  it('preserves the rest of the CSP (default-src etc.) on the same response', async () => {
    mockValidsign.stubSignerName.mockReturnValue('Jan van der Berg');
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
  });

  it('leaves every OTHER route with its restrictive headers intact -- proving the relaxation is narrow', async () => {
    mockGetTaskVariables.mockResolvedValue({ validsignStatus: 'completed' });
    const res = await request(app).get('/v1/validsign/task/task-1/status').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
  });
});
