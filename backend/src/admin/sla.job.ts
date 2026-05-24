import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SlaService } from './sla.service';

@Injectable()
export class SlaJob {
  private readonly logger = new Logger(SlaJob.name);

  constructor(private readonly sla: SlaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handle() {
    try {
      await this.sla.runSweep();
    } catch (err) {
      this.logger.error(`SLA sweep failed: ${(err as Error).message}`);
    }
  }
}
