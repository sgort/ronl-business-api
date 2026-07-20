import { describe, expect, it, vi } from 'vitest';
import { getUserBSN, testUserBSNMapping } from './bsn.mapping';

describe('getUserBSN', () => {
  it('prefers the BSN from the JWT when present', () => {
    const result = getUserBSN({
      sub: '1',
      bsn: '123456789',
      preferred_username: 'test-citizen-utrecht',
    });
    expect(result).toBe('123456789');
  });

  it('falls back to the test-user mapping when no BSN is on the JWT', () => {
    const result = getUserBSN({ sub: '1', preferred_username: 'test-citizen-amsterdam' });
    expect(result).toBe(testUserBSNMapping['test-citizen-amsterdam']);
  });

  it('returns null and warns when the username is not in the mapping', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = getUserBSN({ sub: '1', preferred_username: 'unknown-user' });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('No BSN found for user', expect.anything());
    warnSpy.mockRestore();
  });

  it('returns null when there is neither a BSN nor a username', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = getUserBSN({ sub: '1' });

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});
