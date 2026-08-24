/**
 * Split out of main.tsx so it can be tested — main.tsx itself calls
 * createRoot and is excluded from coverage.
 */
const PA_MOCK_KEY = 'paV2.mock';

/**
 * Writes the mock flag before the app mounts.
 *
 * The env defaults already make PA_MOCK_DEFAULT true, so an absent key means
 * mock. This covers the other case: a '0' inherited from another Open Regels
 * app on the same origin, which would otherwise win over the default.
 * isPaMock() reads localStorage per call rather than at import, so writing
 * before mount covers every later call.
 */
export function forceMockMode(): void {
  try {
    localStorage.setItem(PA_MOCK_KEY, '1');
  } catch {
    // Storage unavailable (private browsing). PA_MOCK_DEFAULT still applies.
  }
}
