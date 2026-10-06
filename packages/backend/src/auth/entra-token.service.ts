import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';

const logger = createLogger('entra-token');

/** The person has no Entra ID token stored in Keycloak (e.g. a Keycloak-native test account). */
export class UserTokenUnavailableError extends Error {
  readonly code = 'EDOCS_USER_TOKEN_UNAVAILABLE';
  constructor(message = 'No Entra ID token is stored for this user') {
    super(message);
    this.name = 'UserTokenUnavailableError';
  }
}

/** The stored Entra session can no longer be refreshed; the person must sign in again. */
export class ReauthRequiredError extends Error {
  readonly code = 'EDOCS_REAUTH_REQUIRED';
  constructor(message = 'The Entra ID session can no longer be refreshed') {
    super(message);
    this.name = 'ReauthRequiredError';
  }
}

interface EntraTokens {
  idToken: string;
  /** `exp` of the ID token, seconds since epoch. */
  idTokenExp: number;
  refreshToken?: string;
}

/** `exp` of a JWT in seconds since epoch; 0 when absent or unreadable. Not a verification. */
export function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
    );
    return typeof payload?.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

function toTokens(body: unknown): EntraTokens | null {
  let data: unknown = body;
  if (typeof body === 'string') {
    try {
      data = JSON.parse(body);
    } catch {
      return null;
    }
  }
  const record = (data ?? {}) as { id_token?: unknown; refresh_token?: unknown };
  if (typeof record.id_token !== 'string' || !record.id_token) return null;
  const refreshToken =
    typeof record.refresh_token === 'string' && record.refresh_token
      ? record.refresh_token
      : undefined;
  return { idToken: record.id_token, idTokenExp: jwtExp(record.id_token), refreshToken };
}

const status = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

/** Seconds of remaining validity below which a cached ID token is refreshed first. */
const MIN_VALIDITY_MS = 60_000;

/**
 * Gives a person's Entra ID token for eDOCS (X-DM-AUTH).
 *
 * Keycloak stores the token response it received when it brokered the person's
 * Entra login (provider `config.entra.idpAlias`, storeToken). The broker token
 * endpoint returns it only to that person — it is called with their own Keycloak
 * token — so this service can never read someone else's. Keycloak does not refresh
 * stored tokens; an expired ID token is refreshed here, at Entra, with the stored
 * refresh token and the same app registration Keycloak uses. Refreshed tokens are
 * kept in memory only (Keycloak's stored copy is not updated).
 *
 * Tokens never reach a log line.
 */
export class EntraTokenService {
  private readonly cache = new Map<string, EntraTokens>();

  constructor(
    private readonly http: AxiosInstance = axios.create({ timeout: 10_000 }),
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 500
  ) {}

  async getIdToken(
    userSub: string,
    keycloakAccessToken: string,
    opts: { forceRefresh?: boolean } = {}
  ): Promise<string> {
    let tokens = this.cache.get(userSub);
    if (!tokens) {
      tokens = await this.readStored(keycloakAccessToken);
      this.remember(userSub, tokens);
    }
    if (!opts.forceRefresh && tokens.idTokenExp * 1000 - this.now() > MIN_VALIDITY_MS) {
      return tokens.idToken;
    }
    if (!tokens.refreshToken) {
      this.cache.delete(userSub);
      throw new ReauthRequiredError('No refresh token is stored for this user');
    }
    const refreshed = await this.refresh(tokens.refreshToken).catch((err: unknown) => {
      this.cache.delete(userSub);
      throw err;
    });
    this.remember(userSub, {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    });
    return refreshed.idToken;
  }

  forget(userSub: string): void {
    this.cache.delete(userSub);
  }

  private remember(userSub: string, tokens: EntraTokens): void {
    this.cache.delete(userSub);
    this.cache.set(userSub, tokens);
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  private async readStored(keycloakAccessToken: string): Promise<EntraTokens> {
    const url = `${config.keycloak.url}/realms/${config.keycloak.realm}/broker/${config.entra.idpAlias}/token`;
    let response;
    try {
      response = await this.http.get(url, {
        headers: { Authorization: `Bearer ${keycloakAccessToken}` },
      });
    } catch (err) {
      const code = status(err);
      if (code !== undefined && code >= 400 && code < 500) {
        logger.info('No stored Entra token for this user', { status: code });
        throw new UserTokenUnavailableError();
      }
      throw err;
    }
    const tokens = toTokens(response.data);
    if (!tokens) {
      throw new UserTokenUnavailableError('The stored Entra token response carries no id_token');
    }
    return tokens;
  }

  private async refresh(refreshToken: string): Promise<EntraTokens> {
    const url = `https://login.microsoftonline.com/${config.entra.tenantId}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.entra.clientId,
      client_secret: config.entra.clientSecret,
      scope: 'openid profile email offline_access',
    });
    let response;
    try {
      response = await this.http.post(url, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      const code = status(err);
      if (code === 400 || code === 401) {
        const error = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        logger.warn('Entra refused to refresh the ID token', { status: code, error });
        throw new ReauthRequiredError();
      }
      throw err;
    }
    const tokens = toTokens(response.data);
    if (!tokens) throw new ReauthRequiredError('Entra refreshed without an id_token');
    return tokens;
  }
}

export const entraTokenService = new EntraTokenService();
