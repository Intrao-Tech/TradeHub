// TEST-CHAT-007 — in-memory storage stub for attachment uploads.
//
// The production `MessageAttachmentService` writes to local disk via
// multer's `diskStorage`. The e2e suite reuses that pipeline (no S3 / R2
// traffic in tests) but cleans up the upload directory between runs so
// disk doesn't accumulate. This module exposes the helpers needed to
// reset the upload root for the chat / job-attachment surfaces.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  MESSAGE_ATTACHMENT_UPLOAD_SUBDIR,
} from '../../src/message-attachment/message-attachment.constants';

const ROOT = process.cwd();

/** Ensure the upload directory exists. Idempotent. */
export async function ensureMessageAttachmentDir(): Promise<string> {
  const dir = join(ROOT, MESSAGE_ATTACHMENT_UPLOAD_SUBDIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Wipe every file under the upload subdir. Keeps the directory itself. */
export async function clearMessageAttachmentDir(): Promise<void> {
  const dir = await ensureMessageAttachmentDir();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries.map((name) => fs.unlink(join(dir, name)).catch(() => {})),
  );
}
