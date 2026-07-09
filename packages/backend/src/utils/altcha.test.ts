/**
 * Unit tests for the altcha CJS wrapper — confirms createChallenge / verifySolution
 * delegate to altcha-lib/v1 with the given arguments.
 */

const mockLib = { createChallenge: jest.fn(), verifySolution: jest.fn() };
jest.mock('altcha-lib/v1', () => mockLib);

import { createChallenge, verifySolution } from './altcha';

beforeEach(() => jest.clearAllMocks());

describe('altcha wrapper', () => {
  it('delegates createChallenge to the library', async () => {
    mockLib.createChallenge.mockResolvedValue({ challenge: 'c', salt: 's' });
    await expect(createChallenge({ hmacKey: 'key', algorithm: 'SHA-256' })).resolves.toEqual({
      challenge: 'c',
      salt: 's',
    });
    expect(mockLib.createChallenge).toHaveBeenCalledWith({ hmacKey: 'key', algorithm: 'SHA-256' });
  });

  it('delegates verifySolution to the library', async () => {
    mockLib.verifySolution.mockResolvedValue(true);
    await expect(verifySolution('payload', 'key', true)).resolves.toBe(true);
    expect(mockLib.verifySolution).toHaveBeenCalledWith('payload', 'key', true);
  });
});
