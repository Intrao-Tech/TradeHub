// TEST-PROF-030 / 031 / 032 — DocumentService unit specs.

import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: DocumentService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new DocumentService(prisma);
  return { service, prisma };
}

function fakeFile(overrides: Partial<Express.Multer.File> = {}) {
  return {
    fieldname: 'file',
    originalname: 'cscs.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    destination: '/tmp',
    filename: 'doc-123.pdf',
    path: '/tmp/doc-123.pdf',
    size: 4096,
    buffer: Buffer.alloc(0),
    stream: undefined as never,
    ...overrides,
  } as Express.Multer.File;
}

describe('TEST-PROF-030 DocumentService.upload (PROF-029)', () => {
  test('PROF-029 — happy path: persists doc_type, file_url under /uploads/, status=PENDING', async () => {
    const { service, prisma } = build();
    prisma.document.create.mockResolvedValue({
      id: 11n,
      doc_type: 'CSCS_CARD',
      file_url: '/uploads/doc-123.pdf',
      status: 'PENDING',
    } as never);

    const out = await service.upload(7n, { doc_type: 'CSCS_CARD' }, fakeFile());
    expect(out).toMatchObject({ status: 'PENDING', doc_type: 'CSCS_CARD' });
    const call = prisma.document.create.mock.calls[0][0] as {
      data: { client_profile_id: bigint; doc_type: string; file_url: string; status: string };
    };
    expect(call.data.client_profile_id).toBe(7n);
    expect(call.data.doc_type).toBe('CSCS_CARD');
    expect(call.data.file_url).toBe('/uploads/doc-123.pdf');
    expect(call.data.status).toBe('PENDING');
  });

  test('PROF-029 — missing file → BadRequestException', async () => {
    const { service } = build();
    await expect(
      service.upload(7n, { doc_type: 'CSCS_CARD' }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('PROF-029 — unknown doc_type → BadRequestException("INVALID_DOC_TYPE"); no DB write', async () => {
    const { service, prisma } = build();
    await expect(
      service.upload(7n, { doc_type: 'PASSPORT_SCAN' }, fakeFile()),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_DOC_TYPE' },
    });
    expect(prisma.document.create).not.toHaveBeenCalled();
  });
});

describe('TEST-PROF-031 DocumentService.deleteDocument (PROF-030)', () => {
  test('PROF-030 — only owner may delete', async () => {
    const { service, prisma } = build();
    prisma.document.findUnique.mockResolvedValue({
      id: 11n,
      client_profile_id: 999n,
      status: 'PENDING',
    } as never);
    await expect(service.deleteDocument(11n, 7n)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });

  test('PROF-030 — only PENDING documents may be deleted', async () => {
    const { service, prisma } = build();
    prisma.document.findUnique.mockResolvedValue({
      id: 11n,
      client_profile_id: 7n,
      status: 'IN_REVIEW',
    } as never);
    await expect(service.deleteDocument(11n, 7n)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });

  test('PROF-030 — owner of a PENDING doc deletes successfully', async () => {
    const { service, prisma } = build();
    prisma.document.findUnique.mockResolvedValue({
      id: 11n,
      client_profile_id: 7n,
      status: 'PENDING',
    } as never);
    prisma.document.delete.mockResolvedValue({} as never);
    await service.deleteDocument(11n, 7n);
    expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 11n } });
  });

  test('PROF-030 — missing document → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.document.findUnique.mockResolvedValue(null);
    await expect(service.deleteDocument(11n, 7n)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('TEST-PROF-032 DocumentService Right-to-Work paths (PROF-052, PROF-053)', () => {
  test.skip(
    'PROF-052 share-code path — TODO until Verification ships RIGHT_TO_WORK_SHARE_CODE doc_type and the metadata column. ' +
      'Today the service has no metadata column; share_code regex `^W[A-Z0-9]{8}$` is enforced only on the frontend. ' +
      'Live the moment Verification merges the enum + migration (BE-PROF-4 → Verification).',
    async () => {
      // intentionally empty
    },
  );

  test.skip(
    'PROF-053 fallback — when Verification has not shipped, share-code submission falls back to doc_type=OTHER + caption (PROF-053). ' +
      'Live once the fallback wiring lands in DocumentController.',
    async () => {
      // intentionally empty
    },
  );
});
