import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EscrowService } from './escrow.service';

/**
 * Hourly sweep that auto-releases milestones in SUBMITTED state where the
 * employer has been silent past the configured window (default 7 days).
 */
@Injectable()
export class EscrowAutoReleaseJob {
  private readonly logger = new Logger(EscrowAutoReleaseJob.name);

  constructor(private readonly escrow: EscrowService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handle() {
    try {
      const result = await this.escrow.runAutoReleaseSweep();
      if (result.processed > 0) {
        this.logger.log(
          `Auto-release sweep processed ${result.processed} milestones`,
        );
      }
    } catch (err) {
      this.logger.error(`Auto-release sweep failed: ${(err as Error).message}`);
    }

    try {
      const r = await this.escrow.runEndContractSweep();
      if (r.ended > 0) {
        this.logger.log(`End-contract sweep auto-ended ${r.ended} contracts`);
      }
    } catch (err) {
      this.logger.error(`End-contract sweep failed: ${(err as Error).message}`);
    }
  }
}
