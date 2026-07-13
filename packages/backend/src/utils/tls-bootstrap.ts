import fs from 'fs';
import tls from 'tls';

/**
 * Make NODE_EXTRA_CA_CERTS take effect when it was loaded from .env.
 *
 * Node reads NODE_EXTRA_CA_CERTS only once, at process startup — before dotenv
 * populates it from .env.<NODE_ENV>. So a CA path set in .env is silently ignored,
 * which is why the corporate-proxy CA problem gets papered over with
 * NODE_TLS_REJECT_UNAUTHORIZED=0 instead.
 *
 * This patches tls.createSecureContext to append the configured CA(s) to every
 * secure context created afterwards — the same effect Node's startup handling has,
 * but applied at runtime. addCACert appends to the context's existing store (which
 * already holds Node's bundled roots), so public TLS keeps working.
 *
 * Call once, immediately after dotenv.config(). No-op when the var is unset, the
 * file is unreadable, or it holds no PEM certificates.
 */
let applied = false;

export function applyExtraCaCerts(): void {
  if (applied) return;

  const caPath = process.env.NODE_EXTRA_CA_CERTS;
  if (!caPath) return;

  let pem: string;
  try {
    pem = fs.readFileSync(caPath, 'utf8').replace(/\r\n/g, '\n');
  } catch (err) {
    console.warn(
      `[tls] NODE_EXTRA_CA_CERTS set but unreadable (${caPath}): ${(err as Error).message}`
    );
    return;
  }

  const certs = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!certs || certs.length === 0) {
    console.warn(`[tls] NODE_EXTRA_CA_CERTS contained no PEM certificates (${caPath})`);
    return;
  }

  const origCreateSecureContext = tls.createSecureContext;
  tls.createSecureContext = (options?: tls.SecureContextOptions): tls.SecureContext => {
    const context = origCreateSecureContext(options);
    for (const cert of certs) {
      (context.context as { addCACert(pem: string): void }).addCACert(cert.trim());
    }
    return context;
  };

  applied = true;
}
