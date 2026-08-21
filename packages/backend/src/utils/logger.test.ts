/**
 * Unit tests for the logger module. winston is fully mocked so no real Console
 * transport runs (keeping the test run output clean); config is mocked because it
 * self-validates on import. Covers the module-level transport wiring — which runs
 * at import time, hence the per-test isolateModules reload — the development
 * printf formatter, and the createLogger factory.
 */
export {};

const mockWinstonLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

/** The devFormat printf callback, captured so the test can exercise it directly. */
type PrintfCallback = (info: Record<string, unknown>) => string;
let capturedPrintf: PrintfCallback | undefined;

const mockConsoleTransport = jest.fn();
const mockDailyRotateFile = jest.fn();
/** winston.createLogger's options, narrowed to what these tests assert on. */
interface CreateLoggerOptions {
  level: string;
  transports: unknown[];
  defaultMeta: Record<string, unknown>;
  exitOnError: boolean;
}
const mockCreateLogger = jest.fn<typeof mockWinstonLogger, [CreateLoggerOptions]>(
  () => mockWinstonLogger
);

jest.mock('winston', () => {
  // Each formatter returns its own marker and combine returns the list of them,
  // so the assembled devFormat and prodFormat are told apart by value — which is
  // the only way to see which one the Console transport was handed.
  const marker = (name: string) => jest.fn(() => name);
  const printf = jest.fn((cb: PrintfCallback) => {
    capturedPrintf = cb;
    return 'printf';
  });
  const combine = jest.fn((...parts: unknown[]) => ({ combine: parts }));
  const format = Object.assign(combine, {
    combine,
    colorize: marker('colorize'),
    timestamp: marker('timestamp'),
    printf,
    errors: marker('errors'),
    json: marker('json'),
  });
  const api = {
    format,
    transports: { Console: mockConsoleTransport },
    createLogger: mockCreateLogger,
  };
  return { __esModule: true, default: api, ...api };
});
jest.mock('winston-daily-rotate-file', () => ({
  __esModule: true,
  default: mockDailyRotateFile,
}));

const mockConfig = {
  nodeEnv: 'development',
  deploymentEnv: 'acceptance',
  logging: {
    level: 'info',
    format: 'json',
    fileEnabled: false,
    filePath: './logs',
    fileMaxSize: '10m',
    fileMaxFiles: 7,
  },
};
jest.mock('./config', () => ({ config: mockConfig }));

type Mod = typeof import('./logger');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./logger');
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedPrintf = undefined;
  mockConfig.nodeEnv = 'development';
  mockConfig.logging.fileEnabled = false;
});

describe('transport wiring', () => {
  it('logs to the console only when file logging is disabled', () => {
    freshModule();
    expect(mockConsoleTransport).toHaveBeenCalledTimes(1);
    expect(mockDailyRotateFile).not.toHaveBeenCalled();
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        exitOnError: false,
        defaultMeta: { service: 'ronl-business-api', environment: 'acceptance' },
        transports: expect.any(Array),
      })
    );
    expect(mockCreateLogger.mock.calls[0][0].transports).toHaveLength(1);
  });

  it('adds a rotating application log and a separate error log when enabled', () => {
    mockConfig.logging.fileEnabled = true;
    freshModule();

    expect(mockDailyRotateFile).toHaveBeenCalledTimes(2);
    expect(mockDailyRotateFile.mock.calls[0][0]).toMatchObject({
      filename: expect.stringContaining('application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: 7,
      level: 'info',
    });
    expect(mockDailyRotateFile.mock.calls[1][0]).toMatchObject({
      filename: expect.stringContaining('error-%DATE%.log'),
      level: 'error',
    });
    expect(mockCreateLogger.mock.calls[0][0].transports).toHaveLength(3);
  });

  it('gives the console the colourised developer format outside production', () => {
    freshModule();
    expect(mockConsoleTransport).toHaveBeenCalledWith({
      format: { combine: ['colorize', 'timestamp', 'printf'] },
    });
  });

  it('gives the console the JSON production format in production', () => {
    mockConfig.nodeEnv = 'production';
    freshModule();
    expect(mockConsoleTransport).toHaveBeenCalledWith({
      format: { combine: ['timestamp', 'errors', 'json'] },
    });
  });
});

describe('development printf format', () => {
  it('renders timestamp, level and message', () => {
    freshModule();
    expect(capturedPrintf).toBeDefined();
    expect(
      capturedPrintf!({ timestamp: '2026-08-21 09:00:00', level: 'info', message: 'started' })
    ).toBe('2026-08-21 09:00:00 [info] started');
  });

  it('appends any remaining metadata as pretty JSON', () => {
    freshModule();
    const line = capturedPrintf!({
      timestamp: '2026-08-21 09:00:00',
      level: 'warn',
      message: 'slow',
      _service: 'dropped',
      module: 'operaton',
      ms: 1200,
    });
    expect(line).toContain('2026-08-21 09:00:00 [warn] slow');
    expect(line).toContain('"module": "operaton"');
    expect(line).toContain('"ms": 1200');
    // _service is destructured away rather than printed.
    expect(line).not.toContain('dropped');
  });
});

describe('createLogger', () => {
  it('returns a module-scoped logger with the standard methods', () => {
    const log = freshModule().createLogger('test-module');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('delegates each level to winston, merging the module tag into the metadata', () => {
    const log = freshModule().createLogger('test-module');

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
