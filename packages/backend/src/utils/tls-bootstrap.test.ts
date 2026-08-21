/**
 * Unit tests for applyExtraCaCerts — the runtime replacement for Node's
 * startup-only NODE_EXTRA_CA_CERTS handling. fs and tls are mocked so no real
 * certificate is read or parsed; the module is re-required per test because it
 * carries a module-level `applied` latch.
 */
export {};

const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({ __esModule: true, default: { readFileSync: mockReadFileSync } }));

const mockAddCACert = jest.fn();
type CreateSecureContext = (options?: Record<string, unknown>) => {
  context: { addCACert: jest.Mock };
};
const mockOrigCreateSecureContext = jest.fn<
  ReturnType<CreateSecureContext>,
  [Record<string, unknown>?]
>(() => ({ context: { addCACert: mockAddCACert } }));
const mockTls: { createSecureContext: CreateSecureContext } = {
  createSecureContext: mockOrigCreateSecureContext,
};
jest.mock('tls', () => ({ __esModule: true, default: mockTls }));

type Mod = typeof import('./tls-bootstrap');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./tls-bootstrap');
  });
  return mod;
}

const PEM_A = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----';
const PEM_B = '-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----';

let warnSpy: jest.SpyInstance;
const ORIGINAL_CA = process.env.NODE_EXTRA_CA_CERTS;

beforeEach(() => {
  jest.clearAllMocks();
  mockTls.createSecureContext = mockOrigCreateSecureContext;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  if (ORIGINAL_CA === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
  else process.env.NODE_EXTRA_CA_CERTS = ORIGINAL_CA;
});

describe('applyExtraCaCerts', () => {
  it('does nothing when NODE_EXTRA_CA_CERTS is unset', () => {
    delete process.env.NODE_EXTRA_CA_CERTS;
    freshModule().applyExtraCaCerts();
    expect(mockReadFileSync).not.toHaveBeenCalled();
    expect(mockTls.createSecureContext).toBe(mockOrigCreateSecureContext);
  });

  it('warns and leaves tls untouched when the CA file is unreadable', () => {
    process.env.NODE_EXTRA_CA_CERTS = '/no/such/ca.pem';
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    freshModule().applyExtraCaCerts();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unreadable'));
    expect(mockTls.createSecureContext).toBe(mockOrigCreateSecureContext);
  });

  it('warns and leaves tls untouched when the file holds no PEM certificates', () => {
    process.env.NODE_EXTRA_CA_CERTS = '/etc/ca.pem';
    mockReadFileSync.mockReturnValue('not a certificate at all');
    freshModule().applyExtraCaCerts();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no PEM certificates'));
    expect(mockTls.createSecureContext).toBe(mockOrigCreateSecureContext);
  });

  it('appends every certificate in the bundle to each new secure context', () => {
    process.env.NODE_EXTRA_CA_CERTS = '/etc/ca.pem';
    // CRLF line endings are what a Windows-provisioned corporate bundle actually
    // has; the implementation normalises them before matching.
    mockReadFileSync.mockReturnValue(`${PEM_A}\r\n${PEM_B}\r\n`.replace(/\n/g, '\r\n'));

    freshModule().applyExtraCaCerts();
    expect(mockTls.createSecureContext).not.toBe(mockOrigCreateSecureContext);

    const context = mockTls.createSecureContext({ minVersion: 'TLSv1.2' });
    expect(mockOrigCreateSecureContext).toHaveBeenCalledWith({ minVersion: 'TLSv1.2' });
    expect(mockAddCACert).toHaveBeenCalledTimes(2);
    expect(mockAddCACert).toHaveBeenNthCalledWith(1, PEM_A);
    expect(mockAddCACert).toHaveBeenNthCalledWith(2, PEM_B);
    expect(context).toEqual({ context: { addCACert: mockAddCACert } });
  });

  it('patches tls only once, however often it is called', () => {
    process.env.NODE_EXTRA_CA_CERTS = '/etc/ca.pem';
    mockReadFileSync.mockReturnValue(PEM_A);

    const mod = freshModule();
    mod.applyExtraCaCerts();
    const patched = mockTls.createSecureContext;
    mod.applyExtraCaCerts();

    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    expect(mockTls.createSecureContext).toBe(patched);
  });
});
