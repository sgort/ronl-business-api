/**
 * ValidSign routes.
 *
 * Two routers live in this file:
 *
 * - `callbackRouter` — mounted BEFORE any auth, for the two things that
 *   cannot carry a Keycloak token:
 *     - ValidSign's completion webhook, authenticated with a shared secret
 *       header instead of a JWT. It is exempted from the app-wide rate
 *       limiter (see index.ts) — that limiter is IP-keyed and, with
 *       TRUST_PROXY=false, every client behind one proxy shares a single
 *       bucket, so a busy infra board could exhaust it and hand ValidSign a
 *       429, silently dropping a signature. But the callback still needs a
 *       real bound of its own: it gets a SEPARATE limiter, keyed on the
 *       CLIENT IP (not the secret header, which is attacker-controlled and
 *       would let anyone mint a fresh budget by varying it) — see
 *       callbackLimiter below. It also does its own body parsing, with its
 *       own error handler, rather than relying on the app-wide
 *       express.json(): a malformed or oversized body must come back as 400
 *       so ValidSign does not retry it forever, and that can only happen if
 *       the parse error originates INSIDE this router — see the comment on
 *       the local json() call below for why.
 *     - the stub signing ceremony (GET page + POST sign). The frontend loads
 *       the ceremony's signingUrl in a plain iframe (see
 *       validsignService.getSigningUrl's comment) exactly as it would a real
 *       ValidSign ceremony URL, and an iframe navigation carries no custom
 *       Authorization header — so this cannot sit behind jwtMiddleware
 *       without breaking the very flow it exists to stand in for. Both
 *       routes 404 (not merely refuse) unless validsignService.isStub, so
 *       they do not exist at all in a live deployment.
 *
 * - the default-exported router — the infra board's own authenticated
 *   endpoints, sitting behind jwtMiddleware + tenantMiddleware like every
 *   other authenticated route (see rip.routes.ts).
 */
import crypto from 'node:crypto';
import express from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import type { OperatonVariable } from '@ronl/shared';
import { jwtMiddleware } from '@auth/jwt.middleware';
import { tenantMiddleware } from '@middleware/tenant.middleware';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';
import { rateLimitKey } from '@utils/client-ip';
import { operatonService } from '@services/operaton.service';
import { validsignService } from '@services/validsign.service';
import { completeSignature } from '@services/validsignCompletion.service';
import { renderTemplate } from '@services/document/renderTemplate';
import { toPdf } from '@services/document/toPdf';

const logger = createLogger('validsign-routes');

/* ------------------------------------------------------------------ */
/* Callback router — mounted BEFORE any auth.                         */
/* ------------------------------------------------------------------ */

export const CALLBACK_PATH = '/v1/validsign/callback';

/**
 * Express routes case-insensitively and tolerates a trailing slash by
 * default (this app sets neither `strict routing` nor `case sensitive
 * routing`), so a request to `/v1/validsign/callback/` or in a different
 * case still reaches the callback handler. index.ts uses this SAME
 * predicate for both the global JSON-parser exemption and the global
 * rate-limiter skip -- a mismatch between how the router matches the path
 * and how those two predicates match it would silently reinstate whichever
 * one drifted: missing the parser exemption puts the 1mb global parser
 * back in front of the route (malformed body -> 500 -> ValidSign retries
 * forever); missing the limiter skip subjects the callback to the global
 * IP bucket (a busy board could 429 and drop a signature). The callback
 * URL is typed by hand into ValidSign's own console, and a trailing slash
 * is the single most common variation a person introduces in a URL field.
 */
export function isCallbackPath(path: string): boolean {
  // Strip ALL trailing slashes (not just one), so '/callback//' matches
  // too -- but only ever from the END of the string, so this can never
  // turn some other path into a match (an embedded slash elsewhere, as in
  // '/v1/validsign/callback/extra', is untouched and correctly fails the
  // equality check below). A bare '/' strips to '', which is not
  // CALLBACK_PATH, so it correctly does not match.
  return path.replace(/\/+$/, '').toLowerCase() === CALLBACK_PATH;
}

export const callbackRouter = express.Router();

// The global app rate limiter is IP-keyed (see index.ts), and this route is
// exempted from it -- board traffic sharing one proxy IP must not exhaust a
// budget ValidSign's callback also depends on. That does not mean this
// public, unauthenticated route goes unbounded, though: it needs its own
// bucket, separate from the global one so the two cannot starve each other.
// It is deliberately keyed on the CLIENT IP (via the same rateLimitKey
// helper the global limiter uses, so proxy/TRUST_PROXY handling stays
// consistent) rather than the `x-validsign-secret` header: that header is
// attacker-supplied on every request that reaches this far (secretMatches()
// runs inside the handler, after the limiter), so keying on it would hand
// anyone a fresh request budget just by varying the header per request.
// 60/minute/IP is ample for ValidSign's own retry behaviour while staying
// genuinely bounded.
// A dedicated store, held onto explicitly, rather than letting rateLimit()
// create its own internal default: the middleware this version of
// express-rate-limit (7.5.1) returns exposes only resetKey()/getKey(), not
// resetAll() -- that lives on the Store, not the handler -- so a reference
// to the store is the only way to clear the whole bucket at once. That is
// exactly what resetCallbackLimiterForTests() below needs, and the only
// reason this store is held separately at all.
const callbackLimiterStore = new MemoryStore();

const callbackLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: callbackLimiterStore,
  keyGenerator: (req) => rateLimitKey(req.ip),
});

/**
 * TEST-ONLY. Clears every key in the callback limiter's bucket. Production
 * code must never call this -- there is no legitimate runtime reason to
 * reset another caller's budget. It exists solely so the test suite's cases
 * do not depend on execution order: without it, a test that deliberately
 * exhausts this bucket (to prove the limiter is genuinely bounded) would
 * leave every later test in the same file that hits /callback observing a
 * stale 429 instead of whatever it is actually testing.
 */
export async function resetCallbackLimiterForTests(): Promise<void> {
  await callbackLimiterStore.resetAll();
}

function secretMatches(provided: unknown): boolean {
  const expected = config.validsign.callbackSecret;
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length must be checked first: timingSafeEqual throws on unequal lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// A real ValidSign webhook payload is a handful of small fields (packageId,
// an event name, a few identifiers) -- 16kb is generous headroom over that,
// while still bounding what an unauthenticated POST can make this route
// buffer before the secret is even checked.
const CALLBACK_BODY_LIMIT = '16kb';

function isBodyParseError(err: unknown): err is { type?: string } {
  const e = err as { type?: string } | undefined;
  return (
    !!e &&
    (e.type === 'entity.parse.failed' ||
      e.type === 'entity.too.large' ||
      (err instanceof SyntaxError && 'body' in err))
  );
}

// This route parses its OWN body, deliberately not relying on the app-wide
// express.json() mounted in index.ts: index.ts exempts this exact path from
// that global parser (mirroring the rate-limiter `skip` above it) so that a
// malformed or oversized body throws HERE, inside this router, rather than
// in app-level middleware the request never even reaches this router's own
// error handler from. That distinction is load-bearing, not stylistic --
// Express skips a mounted sub-router entirely once an error has already
// occurred upstream of it, so an error handler attached to this router
// could never see a parse failure from the app-wide parser; it can only see
// one that originates in a parser that is itself part of this router's own
// middleware chain.
callbackRouter.post(
  '/callback',
  callbackLimiter,
  express.json({ limit: CALLBACK_BODY_LIMIT }),
  async (req, res) => {
    if (!secretMatches(req.headers['x-validsign-secret'])) {
      logger.warn('ValidSign callback rejected: bad shared secret');
      return res
        .status(401)
        .json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid secret' } });
    }
    const packageId = String((req.body as { packageId?: string }).packageId ?? '');
    const event = (req.body as { name?: string }).name;
    // Audit-relevant path: log every callback, success or not.
    logger.info('ValidSign callback received', { packageId, event });
    try {
      await completeSignature(packageId);
    } catch (error) {
      // Never log the raw error: it may be an axios error whose `.config`
      // carries the ValidSign API key. getErrorMessage() is safe.
      logger.error('Callback completion failed; the poller will retry', {
        packageId,
        error: getErrorMessage(error),
      });
    }
    // Always 200: an unknown or stale package must generate no noise, and
    // the response must not reveal which package ids exist.
    return res.status(200).json({ success: true });
  }
);

// Router-scoped error handler, mounted after the route it guards. Catches
// this router's own body-parser failures and answers 400 -- a 5xx here
// tells ValidSign to retry, turning one malformed request into an unbounded
// retry loop. No detail from the malformed input is ever echoed back.
// Anything unrecognised is a genuine server error and is handed to
// next(err) so the app's own catch-all (index.ts) still sees it.
callbackRouter.use(
  (err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (isBodyParseError(err)) {
      logger.warn('ValidSign callback rejected: malformed or oversized body');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BODY', message: 'Malformed request body' },
      });
    }
    next(err);
  }
);

/* ------------------------------------------------------------------ */
/* Stub ceremony — a local stand-in for ValidSign's own signing page. */
/* Unauthenticated (see file header) and 404 outside stub mode.       */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

function stubCeremonyHtml(packageId: string): string {
  const signerName = validsignService.stubSignerName(packageId);
  const escapedName = escapeHtml(signerName);
  const escapedPackageId = escapeHtml(packageId);
  return `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>ValidSign stub — ondertekenen</title></head>
<body>
  <h1>Documentondertekening (stub)</h1>
  <p>Getekend door: ${escapedName}</p>
  <form method="post" action="/v1/validsign/stub/ceremony/${escapedPackageId}/sign">
    <button type="submit" name="outcome" value="COMPLETED">Onderteken</button>
    <button type="submit" name="outcome" value="DECLINED">Weigeren</button>
  </form>
</body>
</html>`;
}

callbackRouter.get('/stub/ceremony/:packageId', (req, res) => {
  if (!validsignService.isStub) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  }
  const { packageId } = req.params;
  try {
    return res.status(200).type('html').send(stubCeremonyHtml(packageId));
  } catch (error) {
    logger.error('Failed to render stub ceremony page', {
      packageId,
      error: getErrorMessage(error),
    });
    return res
      .status(404)
      .json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
});

// Body parsing (the HTML form-post from the ceremony button) relies on the
// app-wide express.urlencoded() mounted in index.ts, same reasoning as the
// callback route above.
callbackRouter.post('/stub/ceremony/:packageId/sign', async (req, res) => {
  if (!validsignService.isStub) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  }
  const { packageId } = req.params;
  const outcomeRaw = (req.body as { outcome?: string }).outcome;
  const outcome = outcomeRaw === 'DECLINED' ? 'DECLINED' : 'COMPLETED';
  try {
    validsignService.stubSign(packageId, outcome);
    await completeSignature(packageId);
    return res.json({ success: true, data: { packageId, outcome } });
  } catch (error) {
    logger.error('Stub ceremony sign failed', {
      packageId,
      error: getErrorMessage(error),
    });
    return res.status(500).json({
      success: false,
      error: { code: 'STUB_SIGN_FAILED', message: 'Failed to record stub signature' },
    });
  }
});

/* ------------------------------------------------------------------ */
/* Authenticated router — the infra board's own endpoints.            */
/* ------------------------------------------------------------------ */

const router = express.Router();

router.use(jwtMiddleware);
router.use(tenantMiddleware);

type SignatureStatus = 'none' | 'sent' | 'completed' | 'declined' | 'failed';

function statusFromVariables(variables: Record<string, unknown>): SignatureStatus {
  const raw = variables['validsignStatus'];
  if (raw === 'sent' || raw === 'completed' || raw === 'declined' || raw === 'failed') return raw;
  return 'none';
}

/**
 * GET /task/:taskId/spec
 * Response shape is fixed by contract with a later frontend task — do not
 * rename or add fields:
 *   { required: false }
 *   { required: true, templateId, status, packageId?, signingUrl? }
 */
router.get('/task/:taskId/spec', async (req, res) => {
  const { taskId } = req.params;
  try {
    const task = await operatonService.getTask(taskId);
    const spec = await operatonService.getTaskSignatureSpec(
      task.processInstanceId,
      task.taskDefinitionKey
    );
    if (!spec) {
      return res.json({ success: true, data: { required: false } });
    }
    const variables = await operatonService.getTaskVariables(taskId);
    const status = statusFromVariables(variables);
    const packageId = variables['validsignPackageId'] as string | undefined;
    const signingUrl = variables['validsignSigningUrl'] as string | undefined;
    return res.json({
      success: true,
      data: {
        required: true,
        templateId: spec.templateId,
        status,
        ...(packageId ? { packageId } : {}),
        ...(signingUrl ? { signingUrl } : {}),
      },
    });
  } catch (error) {
    logger.error('Failed to resolve signature spec', {
      taskId,
      error: getErrorMessage(error),
    });
    return res.status(500).json({
      success: false,
      error: { code: 'SIGNATURE_SPEC_FAILED', message: 'Failed to resolve signature spec' },
    });
  }
});

/**
 * POST /task/:taskId/package
 * Creates and sends the ValidSign package for a signature-bearing task.
 *
 * The signer's identity comes entirely from the caller's own Keycloak
 * token (req.user), never from the request body: a package created with a
 * guessed or empty signer address would send a real signature request into
 * the void, and a sent request cannot be recalled. When the token carries
 * no email, this refuses with 422 rather than proceed.
 *
 * Body: { delivery?: 'embedded' | 'email' }. Defaults to 'embedded' when
 * absent, so an older caller keeps working. 'embedded' fetches a signing URL
 * for an in-app ceremony (falling back to email only if that fetch fails);
 * 'email' is a deliberate choice by the signer (typically on a phone) and
 * skips the signing-URL fetch entirely. Any other value is 400.
 *
 * Refuses with 409 VALIDSIGN_PACKAGE_EXISTS (existing packageId included in
 * `data`) when the task's validsignStatus is already 'sent', 'completed' or
 * 'declined' -- see the guard below for why 'failed' is treated as
 * retriable instead of blocked.
 */
router.post('/task/:taskId/package', async (req, res) => {
  const { taskId } = req.params;
  const user = req.user;
  if (!user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  if (!user.email) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'MISSING_SIGNER_EMAIL',
        message:
          'The signed-in user has no email claim on their token; cannot create a signature package',
      },
    });
  }

  // The signer chooses embedded-in-app or email delivery -- absent, default
  // to embedded so an older caller keeps working. Any other value is a
  // caller bug, not a silent fallback.
  const deliveryRaw = (req.body as { delivery?: unknown } | undefined)?.delivery;
  const delivery = deliveryRaw === undefined ? 'embedded' : deliveryRaw;
  if (delivery !== 'embedded' && delivery !== 'email') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_DELIVERY',
        message: `delivery must be 'embedded' or 'email', got: ${JSON.stringify(deliveryRaw)}`,
      },
    });
  }

  try {
    const task = await operatonService.getTask(taskId);
    const spec = await operatonService.getTaskSignatureSpec(
      task.processInstanceId,
      task.taskDefinitionKey
    );
    if (!spec) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_SIGNATURE_TASK', message: 'This task has no signature template' },
      });
    }

    const variables = await operatonService.getTaskVariables(taskId);

    // Guard against creating a second package for a task that already has
    // one. A sent ValidSign package puts a real signature request in a real
    // inbox and cannot be recalled -- creating a second one means a double
    // send, and the process's single validsignPackageId variable can only
    // ever point at one of them, orphaning whichever completes second. This
    // must run BEFORE renderTemplate/toPdf/createPackage below: refusing
    // after any of those would defeat the point.
    //
    // 'failed' deliberately passes through and is treated as retriable, not
    // blocked: nothing in this route (or elsewhere in the codebase) ever
    // writes validsignStatus = 'failed' today, so seeing it here can only
    // come from a future or external write that is, by construction, a
    // statement that no live package resulted from the prior attempt --
    // exactly the situation retrying is safe for. The states that DO risk a
    // real inbox already holding a request -- 'sent', 'completed',
    // 'declined' -- are the ones blocked below. Blocking 'failed' too, with
    // no code path anywhere that ever clears it back to retriable, would
    // strand the task behind a manual Operaton variable edit forever, which
    // defeats the purpose of an automatic guard.
    const existingStatus = statusFromVariables(variables);
    if (
      existingStatus === 'sent' ||
      existingStatus === 'completed' ||
      existingStatus === 'declined'
    ) {
      const existingPackageId = variables['validsignPackageId'] as string | undefined;
      return res.status(409).json({
        success: false,
        error: {
          code: 'VALIDSIGN_PACKAGE_EXISTS',
          message: 'A signature request has already been created for this task',
        },
        data: { packageId: existingPackageId },
      });
    }

    const rendered = renderTemplate(spec.template, variables);
    const pdf = await toPdf(rendered);

    const { packageId, roleId } = await validsignService.createPackage({
      name: spec.template.name,
      senderEmail: config.validsign.senderEmail || user.email,
      signer: {
        email: user.email,
        firstName: user.givenName ?? user.preferredUsername ?? '',
        lastName: user.familyName ?? '',
      },
      pdf: pdf.bytes,
      fileName: `${spec.templateId}.pdf`,
      signatureFields: pdf.signatureFields,
    });
    await validsignService.sendPackage(packageId);

    const processVariables: Record<string, OperatonVariable> = {
      validsignPackageId: { value: packageId, type: 'String' },
      validsignStatus: { value: 'sent', type: 'String' },
    };

    if (delivery === 'email') {
      // The signer asked to sign from their own mailbox (typically a phone)
      // -- the package is already sent, and there is no embedded URL to
      // fetch or to show.
      await operatonService.setProcessVariables(task.processInstanceId, processVariables);
      return res.json({ success: true, data: { packageId, sentTo: user.email } });
    }

    // delivery === 'embedded'. getSigningUrl works in both modes: stub hands
    // back the local ceremony URL, live asks ValidSign for an embedded
    // signing URL. Only ValidSign's own account configuration could make a
    // package unable to produce one; that shows up as getSigningUrl
    // throwing, and the package should still count as sent -- fall back to
    // sentTo rather than fail the whole request.
    let signingUrl: string | undefined;
    try {
      signingUrl = await validsignService.getSigningUrl(packageId, roleId);
      processVariables.validsignSigningUrl = { value: signingUrl, type: 'String' };
    } catch (error) {
      logger.warn('No embedded signing URL available; falling back to email delivery', {
        packageId,
        error: getErrorMessage(error),
      });
    }

    await operatonService.setProcessVariables(task.processInstanceId, processVariables);

    if (signingUrl) {
      return res.json({ success: true, data: { packageId, signingUrl } });
    }
    return res.json({ success: true, data: { packageId, sentTo: user.email } });
  } catch (error) {
    logger.error('Failed to create ValidSign package', {
      taskId,
      error: getErrorMessage(error),
    });
    return res.status(500).json({
      success: false,
      error: { code: 'SIGNATURE_PACKAGE_FAILED', message: 'Failed to create signature package' },
    });
  }
});

/**
 * GET /task/:taskId/status
 */
router.get('/task/:taskId/status', async (req, res) => {
  const { taskId } = req.params;
  try {
    const variables = await operatonService.getTaskVariables(taskId);
    return res.json({ success: true, data: { status: statusFromVariables(variables) } });
  } catch (error) {
    logger.error('Failed to resolve signature status', {
      taskId,
      error: getErrorMessage(error),
    });
    return res.status(500).json({
      success: false,
      error: { code: 'SIGNATURE_STATUS_FAILED', message: 'Failed to resolve signature status' },
    });
  }
});

export default router;
