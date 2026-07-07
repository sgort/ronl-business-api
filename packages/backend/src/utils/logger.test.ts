/**
 * Unit tests for the logger factory. winston is fully mocked so no real Console
 * transport runs (keeping the test run output clean); config is mocked because it
 * self-validates on import. Verifies createLogger delegates each level to winston
 * with the module tag merged into the metadata.
 */

const mockWinstonLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('winston', () => {
  const passthrough = jest.fn(() => ({}));
  const format = Object.assign(passthrough, {
    combine: passthrough,
    colorize: passthrough,
    timestamp: passthrough,
    printf: passthrough,
    errors: passthrough,
    json: passthrough,
  });
  const api = {
    format,
    transports: { Console: jest.fn() },
    createLogger: jest.fn(() => mockWinstonLogger),
  };
  return { __esModule: true, default: api, ...api };
});
jest.mock('winston-daily-rotate-file', () => jest.fn());
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

beforeEach(() => jest.clearAllMocks());

describe('createLogger', () => {
  it('returns a module-scoped logger with the standard methods', () => {
    const log = createLogger('test-module');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('delegates each level to winston, merging the module tag into the metadata', () => {
    const log = createLogger('test-module');

    log.info('hello', { detail: 1 });
    log.warn('careful');
    log.error('boom');
    log.debug('trace');

    expect(mockWinstonLogger.info).toHaveBeenCalledWith('hello', {
      module: 'test-module',
      detail: 1,
    });
    expect(mockWinstonLogger.warn).toHaveBeenCalledWith('careful', { module: 'test-module' });
    expect(mockWinstonLogger.error).toHaveBeenCalledWith('boom', { module: 'test-module' });
    expect(mockWinstonLogger.debug).toHaveBeenCalledWith('trace', { module: 'test-module' });
  });
});
