import { describe, expect, it, vi } from 'vitest';
import { getUserBSN } from './bsn.mapping';

// #319: the BSN comes from the token's `bsn` claim only. The backend checks a
// citizen's BRP lookup against that same claim, so a BSN from anywhere else
// (the old username table) would only be refused.
describe('getUserBSN', () => {
  it('returns the BSN from the token', () => {
    expect(
      getUserBSN({ sub: '1', bsn: '999990019', preferred_username: 'test-citizen-utrecht' })
    ).toBe('999990019');
  });

  it('returns null for a test user whose token carries no BSN, without a username table', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getUserBSN({ sub: '1', preferred_username: 'test-citizen-amsterdam' })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('No BSN found for user', 'test-citizen-amsterdam');
    warnSpy.mockRestore();
  });

  it('returns null when there is neither a BSN nor a username', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getUserBSN({ sub: '1' })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('No BSN found for user', '(no username)');
    warnSpy.mockRestore();
  });
});
