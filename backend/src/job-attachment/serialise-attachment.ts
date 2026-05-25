import type { JobAttachment } from '@prisma/client';

export type SerialisedJobAttachment = {
  id: string;
  job_post_id: string | null;
  job_application_id: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: Date;
  download_url: string;
};

export function serialiseJobAttachment(
  row: JobAttachment,
): SerialisedJobAttachment {
  return {
    id: row.id.toString(),
    job_post_id: row.job_post_id != null ? row.job_post_id.toString() : null,
    job_application_id:
      row.job_application_id != null ? row.job_application_id.toString() : null,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    download_url: `/api/job-attachments/${row.id.toString()}/download`,
  };
}
