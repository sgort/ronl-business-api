/**
 * Smoke test for the logger factory. config is mocked (it self-validates on
 * import) with file logging off so no rotating-file transports/timers spawn.
 */

jest.mock('./config', () => ({
  config: {
    nodeEnv: 'development',
    logging: {
      level: 'info',
      format: 'json',
      fileEnabled: false,
      filePath: './logs',
      fileMaxSize: '10m',
      fileMaxFiles: 7,
    },
  },
}));

import { createLogger } from './logger';

describe('createLogger', () => {
  it('returns a module-scoped logger with the standard methods', () => {
    const log = createLogger('test-module');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('logs at every level without throwing (exercises the dev format)', () => {
    const log = createLogger('test-module');
    expect(() => {
      log.info('hello', { detail: 1 }); // with meta → printf meta branch
      log.warn('careful');
      log.error('boom');
      log.debug('trace');
    }).not.toThrow();
  });
});
