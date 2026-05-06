// TEST-VER-170..174 — document-metadata.validator unit specs.
//
// Pure-function tests against the metadata validator that backs every
// document upload. No Prisma, no Nest module, no DI — just call the
// function and assert the BadRequestException shape.

import { BadRequestException } from '@nestjs/common';
import { validateDocumentMetadata } from './document-metadata.validator';

function expectBadRequest(
  fn: () => unknown,
  expectedCode: string,
): BadRequestException {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(BadRequestException);
  const body = (caught as BadRequestException).getResponse() as {
    code?: string;
    message?: string;
  };
  expect(body.code).toBe(expectedCode);
  return caught as BadRequestException;
}

describe('TEST-VER-170 RIGHT_TO_WORK_SHARE_CODE — VER-040 / VER-092', () => {
  test('VER-092 — happy share code passes through', () => {
    const result = validateDocumentMetadata('RIGHT_TO_WORK_SHARE_CODE', {
      share_code: 'W12 ABC 345',
    });
    expect(result).toEqual({ share_code: 'W12 ABC 345' });
  });

  test('VER-092 — lowercase share code uppercased', () => {
    const result = validateDocumentMetadata('RIGHT_TO_WORK_SHARE_CODE', {
      share_code: 'w12 abc 345',
    });
    expect(result).toEqual({ share_code: 'W12 ABC 345' });
  });

  test('VER-092 — hyphenated form rejected as INVALID_SHARE_CODE', () => {
    expectBadRequest(
      () =>
        validateDocumentMetadata('RIGHT_TO_WORK_SHARE_CODE', {
          share_code: 'W12-ABC-345',
        }),
      'INVALID_SHARE_CODE',
    );
  });

  test('VER-092 — no-space form rejected', () => {
    expectBadRequest(
      () =>
        validateDocumentMetadata('RIGHT_TO_WORK_SHARE_CODE', {
          share_code: 'W12ABC345',
        }),
      'INVALID_SHARE_CODE',
    );
  });

  test('VER-092 — short groups rejected', () => {
    expectBadRequest(
      () =>
        validateDocumentMetadata('RIGHT_TO_WORK_SHARE_CODE', {
          share_code: 'W1 ABC 345',
        }),
      'INVALID_SHARE_CODE',
    );
  });

  test('VER-092 — missing share_code field surfaces INVALID_SHARE_CODE', () => {
    expectBadRequest(
      () => validateDocumentMetadata('RIGHT_TO_WORK_SHARE_CODE', {}),
      'INVALID_SHARE_CODE',
    );
  });

  test('VER-092 — missing metadata altogether surfaces METADATA_REQUIRED', () => {
    expectBadRequest(
      () => validateDocumentMetadata('RIGHT_TO_WORK_SHARE_CODE', null),
      'METADATA_REQUIRED',
    );
  });
});

describe('TEST-VER-171 HMRC_CIS_DOCUMENT — VER-146 / VER-149', () => {
  test('VER-146 — happy UTR + NI returns normalised pair', () => {
    const result = validateDocumentMetadata('HMRC_CIS_DOCUMENT', {
      utr: '1234567890',
      ni_number: 'AB123456C',
    });
    expect(result).toEqual({ utr: '1234567890', ni_number: 'AB123456C' });
  });

  test('VER-146 — NI lowercased + spaced is normalised', () => {
    const result = validateDocumentMetadata('HMRC_CIS_DOCUMENT', {
      utr: '1234567890',
      ni_number: 'ab 123 456 c',
    });
    expect(result).toEqual({ utr: '1234567890', ni_number: 'AB123456C' });
  });

  test('VER-146 — UTR with only 9 digits rejected as INVALID_UTR', () => {
    expectBadRequest(
      () =>
        validateDocumentMetadata('HMRC_CIS_DOCUMENT', {
          utr: '123456789',
          ni_number: 'AB123456C',
        }),
      'INVALID_UTR',
    );
  });

  test('VER-146 — UTR with 11 digits rejected as INVALID_UTR', () => {
    expectBadRequest(
      () =>
        validateDocumentMetadata('HMRC_CIS_DOCUMENT', {
          utr: '12345678901',
          ni_number: 'AB123456C',
        }),
      'INVALID_UTR',
    );
  });

  test('VER-146 — NI without trailing letter rejected as INVALID_NI', () => {
    expectBadRequest(
      () =>
        validateDocumentMetadata('HMRC_CIS_DOCUMENT', {
          utr: '1234567890',
          ni_number: 'AB1234567',
        }),
      'INVALID_NI',
    );
  });

  test('VER-146 — missing UTR field rejected as INVALID_UTR', () => {
    expectBadRequest(
      () =>
        validateDocumentMetadata('HMRC_CIS_DOCUMENT', {
          ni_number: 'AB123456C',
        }),
      'INVALID_UTR',
    );
  });

  test('VER-146 — missing NI field rejected as INVALID_NI', () => {
    expectBadRequest(
      () =>
        validateDocumentMetadata('HMRC_CIS_DOCUMENT', { utr: '1234567890' }),
      'INVALID_NI',
    );
  });

  test('VER-146 — missing metadata altogether surfaces METADATA_REQUIRED', () => {
    expectBadRequest(
      () => validateDocumentMetadata('HMRC_CIS_DOCUMENT', undefined),
      'METADATA_REQUIRED',
    );
  });
});

describe('TEST-VER-172 OTHER — VER-041', () => {
  test('VER-041 — happy title returned as-is', () => {
    const result = validateDocumentMetadata('OTHER', {
      title: 'Plumbing license',
    });
    expect(result).toEqual({ title: 'Plumbing license' });
  });

  test('VER-041 — 2-char title rejected as INVALID_TITLE', () => {
    expectBadRequest(
      () => validateDocumentMetadata('OTHER', { title: 'AB' }),
      'INVALID_TITLE',
    );
  });

  test('VER-041 — 101-char title rejected as INVALID_TITLE', () => {
    expectBadRequest(
      () => validateDocumentMetadata('OTHER', { title: 'A'.repeat(101) }),
      'INVALID_TITLE',
    );
  });

  test('VER-041 — whitespace-only title rejected as INVALID_TITLE', () => {
    expectBadRequest(
      () => validateDocumentMetadata('OTHER', { title: '   ' }),
      'INVALID_TITLE',
    );
  });

  test('VER-041 — missing title rejected as INVALID_TITLE', () => {
    expectBadRequest(
      () => validateDocumentMetadata('OTHER', {}),
      'INVALID_TITLE',
    );
  });

  test('VER-041 — missing metadata surfaces METADATA_REQUIRED', () => {
    expectBadRequest(
      () => validateDocumentMetadata('OTHER', null),
      'METADATA_REQUIRED',
    );
  });

  test('VER-041 — title with surrounding whitespace is trimmed before length check', () => {
    const result = validateDocumentMetadata('OTHER', {
      title: '  Plumbing license  ',
    });
    expect(result).toEqual({ title: 'Plumbing license' });
  });
});

describe('TEST-VER-173 optional structured capture — VER-040', () => {
  test.each([
    ['CSCS_CARD'],
    ['GAS_SAFE_CERT'],
    ['NICEIC_CERT'],
    ['FIRAS_CERT'],
    ['INSURANCE'],
  ])('%s — object metadata passed through unchanged', (docType) => {
    const result = validateDocumentMetadata(docType, {
      certificate_number: 'X12345',
    });
    expect(result).toEqual({ certificate_number: 'X12345' });
  });

  test.each([
    ['CSCS_CARD'],
    ['GAS_SAFE_CERT'],
    ['NICEIC_CERT'],
    ['FIRAS_CERT'],
    ['INSURANCE'],
  ])('%s — null metadata becomes null (no enforcement)', (docType) => {
    expect(validateDocumentMetadata(docType, null)).toBeNull();
  });

  test.each([
    ['CSCS_CARD'],
    ['GAS_SAFE_CERT'],
    ['NICEIC_CERT'],
    ['FIRAS_CERT'],
    ['INSURANCE'],
  ])('%s — non-object metadata returns null', (docType) => {
    expect(validateDocumentMetadata(docType, 'string')).toBeNull();
    expect(validateDocumentMetadata(docType, 42)).toBeNull();
  });
});

describe('TEST-VER-174 unknown doc type — default branch', () => {
  test('unknown doc type returns null (no enforcement)', () => {
    expect(
      validateDocumentMetadata('SOMETHING_NEW', { foo: 'bar' }),
    ).toBeNull();
    expect(validateDocumentMetadata('SOMETHING_NEW', null)).toBeNull();
    expect(validateDocumentMetadata('SOMETHING_NEW', 'literal')).toBeNull();
  });

  test('ID_PHOTO / SELFIE — no enforcement', () => {
    expect(validateDocumentMetadata('ID_PHOTO', null)).toBeNull();
    expect(validateDocumentMetadata('SELFIE', null)).toBeNull();
  });
});
