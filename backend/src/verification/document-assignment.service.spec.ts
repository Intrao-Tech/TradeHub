// TEST-VER-120..125 — DocumentAssignmentService unit specs.
//
// Workload algorithm + race-free claim coverage. Prisma deep-mocked.

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { DocumentAssignmentService } from './document-assignment.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function build(): {
  service: DocumentAssignmentService;
  prisma: DeepMockProxy<PrismaService>;
  audit: { log: jest.Mock };
} {
  const prisma = mockDeep<PrismaService>();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new DocumentAssignmentService(
    prisma,
    audit as unknown as AuditService,
  );
  return { service, prisma, audit };
}

const DOC_ID = 200n;
const ACTOR = 1000n;

const STAFF_A = {
  id: 11n,
  created_at: new Date('2026-01-01'),
  _count: { assigned_documents: 0 },
};
const STAFF_B = {
  id: 22n,
  created_at: new Date('2026-02-01'),
  _count: { assigned_documents: 0 },
};

describe('TEST-VER-120 DocumentAssignmentService.pickNextAssignee() — VER-125', () => {
  test('no on-duty staff → null', async () => {
    const { service, prisma } = build();
    prisma.staffMember.findMany.mockResolvedValueOnce([] as never);
    expect(await service.pickNextAssignee()).toBeNull();
  });

  test('single on-duty staff → that staff id', async () => {
    const { service, prisma } = build();
    prisma.staffMember.findMany.mockResolvedValueOnce([
      { ...STAFF_A },
    ] as never);
    expect(await service.pickNextAssignee()).toBe(11n);
  });

  test('two on-duty: one with 2 / one with 5 → returns lower-load (2)', async () => {
    const { service, prisma } = build();
    prisma.staffMember.findMany.mockResolvedValueOnce([
      { ...STAFF_A, _count: { assigned_documents: 5 } },
      { ...STAFF_B, _count: { assigned_documents: 2 } },
    ] as never);
    expect(await service.pickNextAssignee()).toBe(22n);
  });

  test('two on-duty tied at 3 each → returns earliest created_at', async () => {
    const { service, prisma } = build();
    prisma.staffMember.findMany.mockResolvedValueOnce([
      { ...STAFF_B, _count: { assigned_documents: 3 } },
      { ...STAFF_A, _count: { assigned_documents: 3 } },
    ] as never);
    expect(await service.pickNextAssignee()).toBe(11n);
  });

  test('where-clause excludes deactivated and off-duty staff', async () => {
    const { service, prisma } = build();
    prisma.staffMember.findMany.mockResolvedValueOnce([] as never);
    await service.pickNextAssignee();
    const call = prisma.staffMember.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({
      is_on_duty: true,
      account: { status: 'ACTIVE' },
    });
  });
});

describe('TEST-VER-121 DocumentAssignmentService.assignNext() — VER-126', () => {
  test('no on-duty staff → assignment stays null and is a no-op (current null === next null)', async () => {
    const { service, prisma, audit } = build();
    prisma.staffMember.findMany.mockResolvedValueOnce([] as never);
    prisma.document.findUnique.mockResolvedValueOnce({
      assigned_to: null,
      status: 'PENDING',
    } as never);

    const result = await service.assignNext(DOC_ID);
    // null → null is a no-op via setAssignment's short-circuit (TEST-VER-122).
    expect(result.changed).toBe(false);
    expect(result.to).toBeNull();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('previously-assigned doc, no on-duty staff → clears to null, audit fires with to:null', async () => {
    const { service, prisma, audit } = build();
    prisma.staffMember.findMany.mockResolvedValueOnce([] as never);
    prisma.document.findUnique.mockResolvedValueOnce({
      assigned_to: 11n,
      status: 'PENDING',
    } as never);
    prisma.document.update.mockResolvedValueOnce({} as never);

    const result = await service.assignNext(DOC_ID);
    expect(result.changed).toBe(true);
    expect(result.to).toBeNull();
    expect(audit.log).toHaveBeenCalledWith(
      null,
      'verification.document.assigned',
      'document',
      DOC_ID,
      expect.objectContaining({ to: null, reason: 'auto' }),
      undefined,
    );
  });

  test('on-duty available → assigns to picked staff, reason auto', async () => {
    const { service, prisma, audit } = build();
    prisma.staffMember.findMany.mockResolvedValueOnce([
      { ...STAFF_A },
    ] as never);
    prisma.document.findUnique.mockResolvedValueOnce({
      assigned_to: null,
      status: 'PENDING',
    } as never);
    prisma.document.update.mockResolvedValueOnce({} as never);

    const result = await service.assignNext(DOC_ID);
    expect(result.changed).toBe(true);
    expect(result.to).toBe(11n);
    expect(audit.log).toHaveBeenCalledWith(
      null,
      'verification.document.assigned',
      'document',
      DOC_ID,
      expect.objectContaining({ to: '11', reason: 'auto' }),
      undefined,
    );
  });
});

describe('TEST-VER-122 DocumentAssignmentService.setAssignment() no-op', () => {
  test('current === next → no update, no audit, changed=false', async () => {
    const { service, prisma, audit } = build();
    prisma.document.findUnique.mockResolvedValueOnce({
      assigned_to: 11n,
      status: 'PENDING',
    } as never);

    const result = await service.setAssignment(DOC_ID, 11n, 'auto', null);
    expect(result.changed).toBe(false);
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('document not found → returns changed:false, no writes', async () => {
    const { service, prisma } = build();
    prisma.document.findUnique.mockResolvedValueOnce(null as never);
    const result = await service.setAssignment(DOC_ID, 11n, 'auto', null);
    expect(result.changed).toBe(false);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });
});

describe('TEST-VER-123 DocumentAssignmentService.assignToStaff() validation — VER-128', () => {
  test('target not found → 400 STAFF_NOT_FOUND', async () => {
    const { service, prisma } = build();
    prisma.staffMember.findUnique.mockResolvedValueOnce(null as never);
    const err = await service
      .assignToStaff(DOC_ID, 999n, ACTOR)
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      ((err as BadRequestException).getResponse() as { code: string }).code,
    ).toBe('STAFF_NOT_FOUND');
  });

  test('target deactivated → 400 STAFF_DEACTIVATED', async () => {
    const { service, prisma } = build();
    prisma.staffMember.findUnique.mockResolvedValueOnce({
      id: 999n,
      is_on_duty: true,
      account: { status: 'DEACTIVATED' },
    } as never);
    const err = await service
      .assignToStaff(DOC_ID, 999n, ACTOR)
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      ((err as BadRequestException).getResponse() as { code: string }).code,
    ).toBe('STAFF_DEACTIVATED');
  });

  test('target off-duty → 400 STAFF_OFF_DUTY', async () => {
    const { service, prisma } = build();
    prisma.staffMember.findUnique.mockResolvedValueOnce({
      id: 999n,
      is_on_duty: false,
      account: { status: 'ACTIVE' },
    } as never);
    const err = await service
      .assignToStaff(DOC_ID, 999n, ACTOR)
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      ((err as BadRequestException).getResponse() as { code: string }).code,
    ).toBe('STAFF_OFF_DUTY');
  });

  test('target null → clears assignment, audit reason admin_reassign', async () => {
    const { service, prisma, audit } = build();
    prisma.document.findUnique.mockResolvedValueOnce({
      assigned_to: 11n,
      status: 'PENDING',
    } as never);
    prisma.document.update.mockResolvedValueOnce({} as never);
    const result = await service.assignToStaff(DOC_ID, null, ACTOR);
    expect(result.to).toBeNull();
    expect(audit.log).toHaveBeenCalledWith(
      ACTOR,
      'verification.document.assigned',
      'document',
      DOC_ID,
      expect.objectContaining({ to: null, reason: 'admin_reassign' }),
      undefined,
    );
  });

  test('happy assign to on-duty active staff → writes audit with reason admin_reassign', async () => {
    const { service, prisma, audit } = build();
    prisma.staffMember.findUnique.mockResolvedValueOnce({
      id: 22n,
      is_on_duty: true,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.document.findUnique.mockResolvedValueOnce({
      assigned_to: null,
      status: 'PENDING',
    } as never);
    prisma.document.update.mockResolvedValueOnce({} as never);
    const result = await service.assignToStaff(DOC_ID, 22n, ACTOR);
    expect(result.to).toBe(22n);
    expect(audit.log).toHaveBeenCalledWith(
      ACTOR,
      'verification.document.assigned',
      'document',
      DOC_ID,
      expect.objectContaining({ to: '22', reason: 'admin_reassign' }),
      undefined,
    );
  });
});

describe('TEST-VER-124 DocumentAssignmentService.claim() race-safety — VER-137', () => {
  test('unassigned doc → succeeds, audit reason claim', async () => {
    const { service, prisma, audit } = build();
    prisma.document.updateMany.mockResolvedValueOnce({ count: 1 } as never);

    await service.claim(DOC_ID, 11n);
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: DOC_ID, assigned_to: null },
      data: { assigned_to: 11n },
    });
    expect(audit.log).toHaveBeenCalledWith(
      11n,
      'verification.document.assigned',
      'document',
      DOC_ID,
      expect.objectContaining({ from: null, to: '11', reason: 'claim' }),
      undefined,
    );
  });

  test('already-assigned doc → throws ConflictException ALREADY_ASSIGNED (VER-137; FU-VER-1 resolved 2026-05-06)', async () => {
    const { service, prisma } = build();
    prisma.document.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prisma.document.findUnique.mockResolvedValueOnce({
      id: DOC_ID,
      assigned_to: 22n,
    } as never);

    const err = await service
      .claim(DOC_ID, 11n)
      .catch((e: ConflictException | NotFoundException) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(
      ((err as ConflictException).getResponse() as { code: string }).code,
    ).toBe('ALREADY_ASSIGNED');
  });

  test('doc not found → 404 DOCUMENT_NOT_FOUND', async () => {
    const { service, prisma } = build();
    prisma.document.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prisma.document.findUnique.mockResolvedValueOnce(null as never);

    const err = await service
      .claim(DOC_ID, 11n)
      .catch((e: NotFoundException | BadRequestException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(
      ((err as NotFoundException).getResponse() as { code: string }).code,
    ).toBe('DOCUMENT_NOT_FOUND');
  });
});

describe('TEST-VER-125 DocumentAssignmentService.reassignFromStaff() — VER-127', () => {
  test('with another on-duty staff: reassigns open docs, returns count', async () => {
    const { service, prisma, audit } = build();
    const staffA = 11n;
    const staffB = 22n;

    prisma.document.findMany.mockResolvedValueOnce([
      { id: 100n },
      { id: 101n },
    ] as never);
    // Each pickNextAssignee call returns staffB (the other on-duty member).
    prisma.staffMember.findMany.mockResolvedValue([
      {
        id: staffB,
        created_at: new Date('2026-01-01'),
        _count: { assigned_documents: 0 },
      },
    ] as never);

    // For each setAssignment call:
    prisma.document.findUnique
      .mockResolvedValueOnce({
        assigned_to: staffA,
        status: 'PENDING',
      } as never)
      .mockResolvedValueOnce({
        assigned_to: staffA,
        status: 'PENDING',
      } as never);
    prisma.document.update.mockResolvedValue({} as never);

    const count = await service.reassignFromStaff(staffA, 'duty_off', null);
    expect(count).toBe(2);
    // Audit fires with reason duty_off twice.
    const reasonsSeen = audit.log.mock.calls.map(
      (c) => (c[4] as { reason: string }).reason,
    );
    expect(reasonsSeen.every((r) => r === 'duty_off')).toBe(true);
  });

  test('only on-duty staff is the one going off: reassigns to null bucket, not back to self', async () => {
    const { service, prisma } = build();
    const staffA = 11n;

    prisma.document.findMany.mockResolvedValueOnce([{ id: 100n }] as never);
    prisma.staffMember.findMany.mockResolvedValue([
      {
        id: staffA,
        created_at: new Date('2026-01-01'),
        _count: { assigned_documents: 0 },
      },
    ] as never);
    prisma.document.findUnique.mockResolvedValueOnce({
      assigned_to: staffA,
      status: 'PENDING',
    } as never);
    prisma.document.update.mockResolvedValue({} as never);

    const count = await service.reassignFromStaff(staffA, 'duty_off', null);
    expect(count).toBe(1);
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 100n },
      data: { assigned_to: null },
    });
  });

  test('queries only PENDING + IN_REVIEW docs (terminals untouched)', async () => {
    const { service, prisma } = build();
    prisma.document.findMany.mockResolvedValueOnce([] as never);
    await service.reassignFromStaff(11n, 'duty_off', null);
    const args = prisma.document.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toMatchObject({
      assigned_to: 11n,
      status: { in: ['PENDING', 'IN_REVIEW'] },
    });
  });

  test('admin_reassign caller propagates reason', async () => {
    const { service, prisma, audit } = build();
    prisma.document.findMany.mockResolvedValueOnce([{ id: 100n }] as never);
    prisma.staffMember.findMany.mockResolvedValue([] as never);
    prisma.document.findUnique.mockResolvedValueOnce({
      assigned_to: 11n,
      status: 'PENDING',
    } as never);
    prisma.document.update.mockResolvedValue({} as never);

    await service.reassignFromStaff(11n, 'admin_reassign', ACTOR);
    expect(audit.log).toHaveBeenCalledWith(
      ACTOR,
      'verification.document.assigned',
      'document',
      100n,
      expect.objectContaining({ reason: 'admin_reassign' }),
      undefined,
    );
  });
});
