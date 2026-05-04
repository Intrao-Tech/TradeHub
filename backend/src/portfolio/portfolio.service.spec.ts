// TEST-PROF-020 / 021 / 022 / 023 — PortfolioService unit specs.
//
// Pure-logic tests with deep-mocked Prisma. Each test cites the PROF-NNN
// clause from tasks/in-progress/profiles/spec.md it guards.

import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: PortfolioService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new PortfolioService(prisma);
  return { service, prisma };
}

describe('TEST-PROF-020 PortfolioService discriminated edits (PROF-021)', () => {
  test('PROF-021 — `update()` writes only common fields (title / description / sort_order)', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'PROJECT',
    } as never);
    prisma.portfolioItem.update.mockResolvedValue({} as never);
    prisma.portfolioItem.findUnique.mockResolvedValueOnce({
      id: 1n,
      worker_id: 7n,
      item_type: 'PROJECT',
    } as never);

    await service.update(1n, 7n, {
      title: 'Updated title',
      description: 'Updated desc',
      sort_order: 3,
    });

    const call = prisma.portfolioItem.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).toEqual({
      title: 'Updated title',
      description: 'Updated desc',
      sort_order: 3,
    });
  });

  test('PROF-021 — `updateExperienceDetail()` rejects if the item is not EXPERIENCE', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'PROJECT',
    } as never);
    await expect(
      service.updateExperienceDetail(1n, 7n, { role: 'Lead' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.experienceDetail.update).not.toHaveBeenCalled();
  });

  test('PROF-021 — `updateProjectDetail()` rejects if the item is not PROJECT', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'CERTIFICATION',
    } as never);
    await expect(
      service.updateProjectDetail(1n, 7n, { project_type: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.projectDetail.update).not.toHaveBeenCalled();
  });

  test('PROF-021 — `updateCertificationDetail()` rejects if the item is not CERTIFICATION', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'EXPERIENCE',
    } as never);
    await expect(
      service.updateCertificationDetail(1n, 7n, { cert_type: 'CSCS' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.certificationDetail.update).not.toHaveBeenCalled();
  });

  test('PROF-021 — wrong-worker edit rejected with ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 99n,
      item_type: 'PROJECT',
    } as never);
    await expect(
      service.update(1n, 7n, { title: 'evil' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('PROF-021 — missing item → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue(null);
    await expect(
      service.update(1n, 7n, { title: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TEST-PROF-021 PortfolioService sort_order behaviour (PROF-022)', () => {
  test('PROF-022 — editing item B to item A\'s sort_order shifts A by one', async () => {
    const { service, prisma } = build();
    // Sequence of findUnique reads: assertWorkerOwns (B) → getById final read.
    prisma.portfolioItem.findUnique.mockResolvedValueOnce({
      id: 2n,
      worker_id: 7n,
      item_type: 'PROJECT',
      sort_order: 5,
    } as never);
    prisma.portfolioItem.findUnique.mockResolvedValueOnce({
      id: 2n,
      worker_id: 7n,
      item_type: 'PROJECT',
      sort_order: 3,
    } as never);
    prisma.portfolioItem.findFirst.mockResolvedValueOnce({
      id: 1n,
      worker_id: 7n,
      sort_order: 3,
    } as never);
    prisma.portfolioItem.update.mockResolvedValue({} as never);

    await service.update(2n, 7n, { sort_order: 3 });

    const updateCalls = prisma.portfolioItem.update.mock.calls.map(
      (c) => c[0],
    ) as Array<{ where: { id: bigint }; data: Record<string, unknown> }>;
    // First write: shift the colliding sibling A from 3 → 4.
    expect(updateCalls[0]).toEqual({
      where: { id: 1n },
      data: { sort_order: 4 },
    });
    // Second write: assign B to sort_order 3 (alongside title/description carry-through).
    expect(updateCalls[1].where).toEqual({ id: 2n });
    expect(updateCalls[1].data).toMatchObject({ sort_order: 3 });
  });

  test('PROF-022 — no collision: only the edited item is updated', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 2n,
      worker_id: 7n,
      item_type: 'PROJECT',
      sort_order: 5,
    } as never);
    prisma.portfolioItem.findFirst.mockResolvedValue(null);
    prisma.portfolioItem.update.mockResolvedValue({} as never);

    await service.update(2n, 7n, { sort_order: 9 });

    expect(prisma.portfolioItem.update).toHaveBeenCalledTimes(1);
    const call = prisma.portfolioItem.update.mock.calls[0][0] as {
      where: { id: bigint };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: 2n });
    expect(call.data).toMatchObject({ sort_order: 9 });
  });
});

describe('TEST-PROF-022 PortfolioService.uploadMedia (PROF-024, BE-PROF-2)', () => {
  function fakeFile(overrides: Partial<Express.Multer.File> = {}) {
    return {
      fieldname: 'file',
      originalname: 'pic.png',
      encoding: '7bit',
      mimetype: 'image/png',
      destination: '/tmp',
      filename: 'abc-123.png',
      path: '/tmp/abc-123.png',
      size: 1024,
      buffer: Buffer.alloc(0),
      stream: undefined as never,
      ...overrides,
    } as Express.Multer.File;
  }

  test('PROF-024 — happy path: persists `/uploads/{filename}` + caption + sort_order', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'PROJECT',
    } as never);
    prisma.portfolioMedia.create.mockResolvedValue({
      id: 30n,
      portfolio_item_id: 1n,
      media_url: '/uploads/abc-123.png',
      caption: 'Wide shot',
      sort_order: 2,
    } as never);

    const out = await service.uploadMedia(1n, 7n, fakeFile(), {
      caption: 'Wide shot',
      sort_order: 2,
    });

    expect(out).toMatchObject({ media_url: '/uploads/abc-123.png' });
    const call = prisma.portfolioMedia.create.mock.calls[0][0] as {
      data: { portfolio_item_id: bigint; caption: string; sort_order: number };
    };
    expect(call.data.portfolio_item_id).toBe(1n);
    expect(call.data.caption).toBe('Wide shot');
    expect(call.data.sort_order).toBe(2);
  });

  test('PROF-024 — wrong owner → unlink fixture, throw Forbidden', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 99n,
      item_type: 'PROJECT',
    } as never);
    await expect(
      service.uploadMedia(1n, 7n, fakeFile(), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.portfolioMedia.create).not.toHaveBeenCalled();
  });

  test('PROF-023 — 21st media item is rejected with BadRequestException("MEDIA_LIMIT")', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'PROJECT',
    } as never);
    prisma.portfolioMedia.count.mockResolvedValue(20 as never);
    await expect(
      service.uploadMedia(1n, 7n, fakeFile(), {}),
    ).rejects.toMatchObject({ response: { code: 'MEDIA_LIMIT' } });
    expect(prisma.portfolioMedia.create).not.toHaveBeenCalled();
  });

  test('PROF-023 — addMedia also enforces the 20-item cap', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'PROJECT',
    } as never);
    prisma.portfolioMedia.count.mockResolvedValue(20 as never);
    await expect(
      service.addMedia(1n, 7n, { media_url: '/uploads/x.png' }),
    ).rejects.toMatchObject({ response: { code: 'MEDIA_LIMIT' } });
    expect(prisma.portfolioMedia.create).not.toHaveBeenCalled();
  });

  // MIME / size enforcement is done by the Multer fileFilter on the
  // controller, not the service.  See TEST-PROF-050 for the Multer
  // contract test.
});

describe('TEST-PROF-022 PortfolioService.removeMedia (PROF-025)', () => {
  test('PROF-025 — wrong owner cannot delete', async () => {
    const { service, prisma } = build();
    prisma.portfolioMedia.findUnique.mockResolvedValue({
      id: 30n,
      portfolio_item_id: 1n,
      portfolio_item: { id: 1n, worker_id: 99n, item_type: 'PROJECT' },
    } as never);
    await expect(service.removeMedia(30n, 7n)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.portfolioMedia.delete).not.toHaveBeenCalled();
  });

  test('PROF-025 — owner deletes media row by id', async () => {
    const { service, prisma } = build();
    prisma.portfolioMedia.findUnique.mockResolvedValue({
      id: 30n,
      portfolio_item_id: 1n,
      portfolio_item: { id: 1n, worker_id: 7n, item_type: 'PROJECT' },
    } as never);
    prisma.portfolioMedia.delete.mockResolvedValue({} as never);
    await service.removeMedia(30n, 7n);
    expect(prisma.portfolioMedia.delete).toHaveBeenCalledWith({ where: { id: 30n } });
  });
});

describe('TEST-PROF-023 PortfolioService document linkage (PROF-026)', () => {
  test('PROF-026 — link rejects another worker\'s document with ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'CERTIFICATION',
    } as never);
    prisma.document.findUnique.mockResolvedValue({
      id: 50n,
      client_profile_id: 999n, // someone else's doc
      status: 'APPROVED',
    } as never);
    await expect(
      service.linkDocument(1n, 50n, 7n),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.portfolioItemDocument.upsert).not.toHaveBeenCalled();
  });

  test('PROF-026 — link 404 when document does not exist', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'CERTIFICATION',
    } as never);
    prisma.document.findUnique.mockResolvedValue(null);
    await expect(
      service.linkDocument(1n, 50n, 7n),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('PROF-026 — link upserts when owner + ownership checks pass', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'CERTIFICATION',
    } as never);
    prisma.document.findUnique.mockResolvedValue({
      id: 50n,
      client_profile_id: 7n,
      status: 'APPROVED',
    } as never);
    prisma.portfolioItemDocument.upsert.mockResolvedValue({} as never);
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'CERTIFICATION',
    } as never);

    await service.linkDocument(1n, 50n, 7n);
    expect(prisma.portfolioItemDocument.upsert).toHaveBeenCalledTimes(1);
  });

  test('PROF-026 — unlink 404 when no link exists', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'CERTIFICATION',
    } as never);
    prisma.portfolioItemDocument.findUnique.mockResolvedValue(null);
    await expect(
      service.unlinkDocument(1n, 50n, 7n),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('PROF-026 — link rejects PENDING document with BadRequestException("DOCUMENT_NOT_APPROVED")', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'CERTIFICATION',
    } as never);
    prisma.document.findUnique.mockResolvedValue({
      id: 50n,
      client_profile_id: 7n,
      status: 'PENDING',
    } as never);
    await expect(service.linkDocument(1n, 50n, 7n)).rejects.toMatchObject({
      response: { code: 'DOCUMENT_NOT_APPROVED' },
    });
    expect(prisma.portfolioItemDocument.upsert).not.toHaveBeenCalled();
  });

  test('PROF-026 — link rejects REJECTED document with BadRequestException("DOCUMENT_NOT_APPROVED")', async () => {
    const { service, prisma } = build();
    prisma.portfolioItem.findUnique.mockResolvedValue({
      id: 1n,
      worker_id: 7n,
      item_type: 'CERTIFICATION',
    } as never);
    prisma.document.findUnique.mockResolvedValue({
      id: 50n,
      client_profile_id: 7n,
      status: 'REJECTED',
    } as never);
    await expect(service.linkDocument(1n, 50n, 7n)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.portfolioItemDocument.upsert).not.toHaveBeenCalled();
  });
});
