export const MESSAGE_ATTACHMENT_UPLOAD_SUBDIR = 'uploads/message-attachments';

// Size caps per CHAT-040.
export const MESSAGE_ATTACHMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const MESSAGE_ATTACHMENT_PDF_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
// Multer needs one global cap; PDF cap is the larger of the two and MIME-
// specific limits are enforced after upload.
export const MESSAGE_ATTACHMENT_MAX_BYTES = MESSAGE_ATTACHMENT_PDF_MAX_BYTES;

export const MESSAGE_ATTACHMENT_IMAGE_MIMES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];
export const MESSAGE_ATTACHMENT_PDF_MIMES: readonly string[] = [
  'application/pdf',
];
export const MESSAGE_ATTACHMENT_ALLOWED_MIMES: readonly string[] = [
  ...MESSAGE_ATTACHMENT_IMAGE_MIMES,
  ...MESSAGE_ATTACHMENT_PDF_MIMES,
];

// Orphan housekeeping (cron — out of scope of this feature, see followups).
export const MESSAGE_ATTACHMENT_ORPHAN_CEILING = 20;
export const MESSAGE_ATTACHMENT_ORPHAN_TTL_HOURS = 24;
export const MESSAGE_ATTACHMENT_SWEEP_BATCH = 500;
