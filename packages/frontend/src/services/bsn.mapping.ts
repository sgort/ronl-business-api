/**
 * Maps Keycloak test usernames to BSN numbers for BRP API demo
 * In production, BSN should come from DigiD via Keycloak user attributes
 */

export const testUserBSNMapping: Record<string, string> = {
  'test-citizen-utrecht': '999992235', // Wessel Kooyman
  'test-caseworker-utrecht': '999992235', // Same person for demo
  'test-citizen-amsterdam': '999992235', // For now, same test data
  'test-citizen-rotterdam': '999992235', // For now, same test data
  'test-citizen-denhaag': '999992235', // For now, same test data
};

/**
 * Get BSN for current user
 * First tries user.bsn attribute from JWT
 * Falls back to username mapping for test users
 */
export function getUserBSN(user: {
  sub: string;
  preferred_username?: string;
  bsn?: string;
}): string | null {
  // If BSN is in the JWT (production with DigiD), use it
  if (user.bsn) {
    return user.bsn;
  }

  // For test users, map username to BSN
  if (user.preferred_username && user.preferred_username in testUserBSNMapping) {
    return testUserBSNMapping[user.preferred_username];
  }

  // No BSN available
  console.warn('No BSN found for user', user);
  return null;
}
