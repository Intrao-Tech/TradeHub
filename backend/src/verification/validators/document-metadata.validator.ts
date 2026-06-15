import { BadRequestException } from '@nestjs/common';

/**
 * Per-doc-type metadata shape validation for `Document.metadata` (Json column).
 *
 * Strict regex enforcement on credentials (RTW share code, HMRC UTR + NI).
 * Other fields are optional capture for staff convenience and survive
 * validation without alteration.
 */

const SHARE_CODE_REGEX = /^[A-Z0-9]{3} [A-Z0-9]{3} [A-Z0-9]{3}$/;
const UTR_REGEX = /^\d{10}$/;
const NI_REGEX = /^[A-Z]{2}\d{6}[A-Z]$/;

export type ValidatedMetadata = Record<string, unknown> | null;

/**
 * Validates and normalises `metadata` for a given `doc_type`. Throws
 * `BadRequestException` with structured `code` for SPA error mapping.
 *
 * Returns the *normalised* metadata (e.g. share code uppercased) so callers
 * persist canonical values. `null` is allowed for doc types where metadata
 * is optional.
 */
export function validateDocumentMetadata(
  docType: string,
  raw: unknown,
): ValidatedMetadata {
  switch (docType) {
    case 'RIGHT_TO_WORK_SHARE_CODE': {
      const meta = requireObject(
        raw,
        'METADATA_REQUIRED',
        'Right-to-Work share-code submission requires a share code.',
      );
      const code = requireString(meta, 'share_code', 'INVALID_SHARE_CODE');
      const normalised = code.toUpperCase().trim();
      if (!SHARE_CODE_REGEX.test(normalised)) {
        throw new BadRequestException({
          code: 'INVALID_SHARE_CODE',
          message:
            'Share code must be 9 alphanumeric characters in three groups of 3 separated by spaces, e.g. "W12 ABC 345".',
        });
      }
      return { share_code: normalised };
    }

    case 'HMRC_CIS_DOCUMENT': {
      // UTR is the primary HMRC CIS identifier and is always required. The
      // National Insurance number is optional: HMRC uses it to match
      // sole-trader / individual records, but limited-company subcontractors
      // verify with a company registration number instead and have no personal
      // NINO tied to the business. When supplied, it must be well-formed.
      const meta = requireObject(
        raw,
        'METADATA_REQUIRED',
        'HMRC CIS submission requires a UTR.',
      );
      const utr = requireString(meta, 'utr', 'INVALID_UTR').trim();
      if (!UTR_REGEX.test(utr)) {
        throw new BadRequestException({
          code: 'INVALID_UTR',
          message: 'UTR must be exactly 10 digits.',
        });
      }
      const rawNi = meta.ni_number;
      if (rawNi == null || (typeof rawNi === 'string' && rawNi.trim() === '')) {
        return { utr };
      }
      if (typeof rawNi !== 'string') {
        throw new BadRequestException({
          code: 'INVALID_NI',
          message: 'National Insurance number must be in the format AB123456C.',
        });
      }
      const ni = rawNi.toUpperCase().replace(/\s+/g, '');
      if (!NI_REGEX.test(ni)) {
        throw new BadRequestException({
          code: 'INVALID_NI',
          message: 'National Insurance number must be in the format AB123456C.',
        });
      }
      return { utr, ni_number: ni };
    }

    // Optional structured capture — accept whatever the user sends, no enforcement.
    case 'CSCS_CARD':
    case 'GAS_SAFE_CERT':
    case 'NICEIC_CERT':
    case 'FIRAS_CERT':
    case 'INSURANCE':
      return raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : null;

    case 'OTHER': {
      // Free-form documents must carry a user-supplied title so staff and
      // the user themselves can identify what was uploaded. Without it the
      // checklist / queue rows would all read "OTHER".
      const meta = requireObject(
        raw,
        'METADATA_REQUIRED',
        'Other documents require a `title` describing what the file is.',
      );
      const title = requireString(meta, 'title', 'INVALID_TITLE').trim();
      if (title.length < 3 || title.length > 100) {
        throw new BadRequestException({
          code: 'INVALID_TITLE',
          message: 'Title must be between 3 and 100 characters.',
        });
      }
      return { title };
    }

    default:
      return null;
  }
}

function requireObject(
  raw: unknown,
  code: string,
  message: string,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException({ code, message });
  }
  return raw as Record<string, unknown>;
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  code: string,
): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException({
      code,
      message: `Missing or invalid \`${key}\`.`,
    });
  }
  return value;
}
