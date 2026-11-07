/**
 * operatonBasicAuth (#415): the credentials every direct axios call to
 * Operaton sends, now that engine-rest requires a login.
 */

const mockOperaton: { username?: string; password?: string } = {};
jest.mock('@utils/config', () => ({ config: { operaton: mockOperaton } }));

import { operatonBasicAuth } from './operaton-auth';

describe('operatonBasicAuth', () => {
  afterEach(() => {
    delete mockOperaton.username;
    delete mockOperaton.password;
  });

  it('returns the given username and password', () => {
    expect(operatonBasicAuth('u', 'p')).toEqual({ username: 'u', password: 'p' });
  });

  it('returns undefined without a password', () => {
    expect(operatonBasicAuth('u', '')).toBeUndefined();
  });

  it('returns undefined without a username', () => {
    expect(operatonBasicAuth('', 'p')).toBeUndefined();
  });

  it('defaults to the configured Operaton credentials', () => {
    mockOperaton.username = 'svc';
    mockOperaton.password = 'pw';
    expect(operatonBasicAuth()).toEqual({ username: 'svc', password: 'pw' });
  });

  it('returns undefined when nothing is configured', () => {
    expect(operatonBasicAuth()).toBeUndefined();
  });
});
