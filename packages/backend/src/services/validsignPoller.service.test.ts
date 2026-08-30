/**
 * Unit tests for ValidsignPoller — the safety-net sweep that drives
 * completion for signatures whose ValidSign webhook never arrived. This is
 * the primary path locally (ValidSign's cloud cannot reach localhost) and the
 * safety net in production, so failure isolation is the point: one bad
 * package must not stop the sweep, and one failed sweep must not kill the
 * timer.
 */

const mockFindAwaiting = jest.fn();
const mockCompleteSignature = jest.fn();
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

jest.mock('@utils/config', () => ({
  config: { validsign: { pollIntervalMs: 15000 } },
}));
jest.mock('@utils/logger', () => ({ createLogger: () => mockLogger }));
jest.mock('@services/operaton.service', () => ({
  operatonService: { findInstancesAwaitingSignature: mockFindAwaiting },
}));
jest.mock('@services/validsignCompletion.service', () => ({
  completeSignature: mockCompleteSignature,
}));

import { ValidsignPoller } from './validsignPoller.service';

describe('ValidsignPoller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('drives completion for each instance awaiting a signature', async () => {
    mockFindAwaiting.mockResolvedValue([
      { processInstanceId: 'pi-1', validsignPackageId: 'pkg-1' },
      { processInstanceId: 'pi-2', validsignPackageId: 'pkg-2' },
    ]);
    const poller = new ValidsignPoller();
    await poller.tick();
    expect(mockCompleteSignature).toHaveBeenCalledWith('pkg-1');
    expect(mockCompleteSignature).toHaveBeenCalledWith('pkg-2');
  });

  it('keeps polling after one package throws', async () => {
    mockFindAwaiting.mockResolvedValue([
      { processInstanceId: 'pi-bad', validsignPackageId: 'bad' },
      { processInstanceId: 'pi-good', validsignPackageId: 'good' },
    ]);
    mockCompleteSignature.mockRejectedValueOnce(new Error('boom'));
    const poller = new ValidsignPoller();
    await expect(poller.tick()).resolves.toBeUndefined();
    expect(mockCompleteSignature).toHaveBeenCalledWith('good');
  });

  it('does not throw and logs when the sweep itself fails', async () => {
    mockFindAwaiting.mockRejectedValue(new Error('operaton unreachable'));
    const poller = new ValidsignPoller();
    await expect(poller.tick()).resolves.toBeUndefined();
    expect(mockCompleteSignature).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Poller sweep failed',
      expect.objectContaining({ error: 'operaton unreachable' })
    );
  });

  it('start() schedules a recurring tick at the configured interval', () => {
    mockFindAwaiting.mockResolvedValue([]);
    const poller = new ValidsignPoller();
    poller.start();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(15000);
    expect(mockFindAwaiting).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('start() is a no-op when already running', () => {
    const poller = new ValidsignPoller();
    poller.start();
    poller.start();
    expect(jest.getTimerCount()).toBe(1);
    poller.stop();
  });

  it('stop() clears the timer', () => {
    const poller = new ValidsignPoller();
    poller.start();
    poller.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stop() before start() is a no-op', () => {
    const poller = new ValidsignPoller();
    expect(() => poller.stop()).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });
});
