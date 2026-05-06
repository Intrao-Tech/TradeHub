export const JOB_ATTACHMENT_UPLOAD_SUBDIR = 'uploads/job-attachments';
export const JOB_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const JOB_ATTACHMENT_MAX_PER_PARENT = 10;
export const JOB_ATTACHMENT_ORPHAN_CEILING = 20;
export const JOB_ATTACHMENT_ORPHAN_TTL_HOURS = 48;
export const JOB_ATTACHMENT_SWEEP_BATCH = 500;

export const JOB_ATTACHMENT_ALLOWED_MIMES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
