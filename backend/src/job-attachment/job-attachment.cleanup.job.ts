import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobAttachmentService } from './job-attachment.service';

/**
 * Daily orphan sweep — deletes JobAttachment rows that were uploaded but
 * never wired to a parent (job post or application) within 48 hours, plus
 * their on-disk file. Rails ActiveStorage 2-day default; see the feature
 * spec ATT-050..ATT-053 and the surf-MCP research in `notes.md`.
 */
@Injectable()
export class JobAttachmentCleanupJob {
  private readonly logger = new Logger(JobAttachmentCleanupJob.name);

  constructor(private readonly attachments: JobAttachmentService) {}

  @Cron('30 2 * * *')
  async sweep() {
    try {
      const removed = await this.attachments.runSweep();
      if (removed > 0) {
        this.logger.log(`Orphan sweep removed ${removed} job attachment(s).`);
      }
    } catch (err) {
      this.logger.error(
        `Orphan sweep failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
