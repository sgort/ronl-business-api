/**
 * The signed-in person's BSN, from the token's `bsn` claim only (#319).
 *
 * The claim is a user attribute on the test realms and the DigiD subject where
 * DigiD is real. The backend checks a citizen's BRP lookup against that same
 * claim, so the username-to-BSN table this file used to hold is gone: a BSN
 * taken from anywhere else would only be refused.
 */
export function getUserBSN(user: {
  sub: string;
  preferred_username?: string;
  bsn?: string;
}): string | null {
  if (user.bsn) {
    return user.bsn;
  }

  // Logs the username only, not the whole claims object: this branch cannot
  // carry a BSN (it is the one where there isn't one), but `user` also holds
  // `sub` and whatever else the token brought, and none of that is needed to
  // explain the warning.
  console.warn('No BSN found for user', user.preferred_username ?? '(no username)');
  return null;
}
