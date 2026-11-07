import type { AxiosBasicCredentials } from 'axios';
import { config } from '@utils/config';

/**
 * Basic-auth credentials for a direct axios call to Operaton (#415: the
 * engine's REST API requires a login). Defaults to OPERATON_USERNAME and
 * OPERATON_PASSWORD; undefined unless both are set, so a caller can spread
 * `auth` in only when there is something to send.
 */
export function operatonBasicAuth(
  username: string | undefined = config.operaton.username,
  password: string | undefined = config.operaton.password
): AxiosBasicCredentials | undefined {
  return username && password ? { username, password } : undefined;
}
