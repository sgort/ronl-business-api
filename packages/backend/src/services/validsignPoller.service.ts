import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';
import { operatonService } from '@services/operaton.service';
import { completeSignature } from '@services/validsignCompletion.service';

const logger = createLogger('validsign-poller');

/**
 * Safety net, not the primary path. When every callback arrives this only ever
 * observes already-completed work and no-ops. It earns its place when the
 * callback cannot reach us at all — which is always the case locally, since
 * ValidSign's cloud cannot reach localhost.
 */
export class ValidsignPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, config.validsign.pollIntervalMs);
    logger.info('ValidSign poller started', { intervalMs: config.validsign.pollIntervalMs });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('ValidSign poller stopped');
  }

  async tick(): Promise<void> {
    try {
      const awaiting = await operatonService.findInstancesAwaitingSignature();
      for (const instance of awaiting) {
        try {
          await completeSignature(instance.validsignPackageId);
        } catch (error) {
          // One bad package must not stop the sweep.
          logger.error('Poller completion failed', {
            packageId: instance.validsignPackageId,
            error: getErrorMessage(error),
          });
        }
      }
    } catch (error) {
      logger.error('Poller sweep failed', { error: getErrorMessage(error) });
    }
  }
}

export const validsignPoller = new ValidsignPoller();
export default validsignPoller;
