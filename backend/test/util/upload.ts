// TEST-PROF-002 — deterministic multipart fixtures for image / PDF upload
// tests. All buffers are generated in-memory (sharp for PNGs, a hand-rolled
// minimal PDF) so no binary fixtures are checked into the repo.
//
// Used by:
//   - backend unit specs that hand a buffer to a controller / service
//   - backend e2e specs that POST multipart bodies via Supertest
//
// Sizes are chosen to land on each side of the BE-PROF-8 caps:
//   avatar: 5 MiB cap, 256×256 dimension floor   (PROF-018)
//   document / portfolio media: 10 MiB cap        (BE-PROF-8)
//   document MIME: application/pdf | image/*      (PROF-029)
//   portfolio media MIME: image/jpeg|png|webp     (PROF-024)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import sharp from 'sharp';

export type UploadFixture = {
  /** in-memory buffer */
  buffer: Buffer;
  /** what Multer / Supertest will see as the filename */
  filename: string;
  /** MIME type to attach in the multipart part */
  mimetype: string;
  /** byte length convenience */
  size: number;
};

export type DiskUploadFixture = UploadFixture & {
  /** absolute path to a temp file holding the buffer (for `sharp(file.path)` services) */
  path: string;
  /** call this in afterEach to clean up the temp file */
  cleanup: () => void;
};

async function pngBuffer(width: number, height: number, padBytes = 0): Promise<Buffer> {
  // sharp creates a deterministic PNG from a raw RGBA buffer. `padBytes` lets
  // us push the encoded result above a target byte-count for size-cap
  // failure cases without asking sharp for a 5MiB image.
  const channels = 4;
  const raw = Buffer.alloc(width * height * channels, 0);
  for (let i = 0; i < raw.length; i += channels) {
    raw[i] = 220; // R
    raw[i + 1] = 130; // G
    raw[i + 2] = 60; // B (TradeHub-ish amber, deterministic)
    raw[i + 3] = 255; // A
  }
  const png = await sharp(raw, { raw: { width, height, channels } })
    .png({ compressionLevel: 0 })
    .toBuffer();
  if (padBytes <= 0) return png;
  return Buffer.concat([png, crypto.randomBytes(padBytes)]);
}

/** 512×512 PNG, well under 5 MiB — avatar happy path (PROF-017 / PROF-018). */
export async function avatarPngOk(): Promise<UploadFixture> {
  const buffer = await pngBuffer(512, 512);
  return {
    buffer,
    filename: 'avatar-512.png',
    mimetype: 'image/png',
    size: buffer.length,
  };
}

/** 100×100 PNG — fails the 256-px dimension floor (PROF-018). */
export async function avatarPngTooSmall(): Promise<UploadFixture> {
  const buffer = await pngBuffer(100, 100);
  return {
    buffer,
    filename: 'avatar-100.png',
    mimetype: 'image/png',
    size: buffer.length,
  };
}

/** > 5 MiB PNG — fails the avatar size cap (PROF-018 / BE-PROF-8). */
export async function avatarPngTooLarge(): Promise<UploadFixture> {
  // 5 MiB + 1 KiB padding to be safely over the cap.
  const buffer = await pngBuffer(512, 512, 5 * 1024 * 1024 + 1024);
  return {
    buffer,
    filename: 'avatar-toobig.png',
    mimetype: 'image/png',
    size: buffer.length,
  };
}

/** > 10 MiB PNG — fails the portfolio-media / document cap (BE-PROF-8). */
export async function mediaPngTooLarge(): Promise<UploadFixture> {
  const buffer = await pngBuffer(512, 512, 10 * 1024 * 1024 + 1024);
  return {
    buffer,
    filename: 'media-toobig.png',
    mimetype: 'image/png',
    size: buffer.length,
  };
}

/** Non-whitelisted MIME (zip) for avatar / portfolio-media negative tests. */
export function nonImageZip(): UploadFixture {
  // PK header bytes + random body → looks zip-ish to anything not parsing it
  const body = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...crypto.randomBytes(64)]);
  return {
    buffer: body,
    filename: 'evil.zip',
    mimetype: 'application/zip',
    size: body.length,
  };
}

/**
 * Minimal valid 1-page PDF (handful of bytes, parseable by lenient consumers).
 * Used for document happy-path tests (PROF-029). We do NOT need a fully spec-
 * conformant PDF — Multer / our service only check MIME + size.
 */
export function minimalPdf(): UploadFixture {
  const body = Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj',
      'xref',
      '0 4',
      '0000000000 65535 f',
      'trailer << /Root 1 0 R /Size 4 >>',
      '%%EOF',
    ].join('\n'),
    'utf8',
  );
  return {
    buffer: body,
    filename: 'document.pdf',
    mimetype: 'application/pdf',
    size: body.length,
  };
}

/**
 * Wrap any in-memory fixture as an on-disk file the way Multer's diskStorage
 * leaves it for downstream services to read with `sharp(file.path)`.
 *
 * Caller is responsible for invoking `.cleanup()` (e.g. in `afterEach`).
 */
export function asDiskFile(
  fixture: UploadFixture,
  ext = path.extname(fixture.filename).slice(1) || 'bin',
): DiskUploadFixture {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tradehub-test-upload-'));
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filepath = path.join(tmpDir, filename);
  fs.writeFileSync(filepath, fixture.buffer);
  return {
    ...fixture,
    filename,
    path: filepath,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // swallow — temp cleanup is best-effort
      }
    },
  };
}

/**
 * Build an `Express.Multer.File`-compatible object for unit tests that hand
 * a fixture straight to `service.upload(...)` without going through HTTP.
 */
export function asMulterFile(disk: DiskUploadFixture): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: path.basename(disk.path),
    encoding: '7bit',
    mimetype: disk.mimetype,
    destination: path.dirname(disk.path),
    filename: disk.filename,
    path: disk.path,
    size: disk.size,
    buffer: disk.buffer,
    stream: undefined as never,
  };
}
