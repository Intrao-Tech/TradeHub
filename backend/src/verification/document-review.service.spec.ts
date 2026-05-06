// TEST-VER-110..117 — DocumentReviewService unit specs.
//
// State-machine + assignee-gating coverage. Each test cites the VER-NNN
// clause it guards. Prisma deep-mocked; PromotionEngine and AuditService
// stubbed so we can assert the orchestration contract without booting Nest.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { DocumentReviewService } from './document-review.service';
import { PromotionEngine } from './promotion-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type Mocks = {
  prisma: DeepMockProxy<PrismaService>;
  audit: { log: jest.Mock };
  engine: { runPromotion: jest.Mock };
};

function build(): { service: DocumentReviewService; mocks: Mocks } {
  const prisma = mockDeep<PrismaService>();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const engine = { runPromotion: jest.fn().mockResolvedValue(null) };
  const service = new DocumentReviewService(
    prisma,
    audit as unknown as AuditService,
    engine as unknown as PromotionEngine,
  );
  return { service, mocks: { prisma, audit, engine } };
}

const DOC_ID = 200n;
const OWNER_ID = 42n;
const STAFF_ID = 7n;
const OTHER_STAFF = 9n;

function makeDoc(
  overrides: {
    status?: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
    assignedTo?: bigint | null;
    docType?: string;
  } = {},
) {
  return {
    id: DOC_ID,
    client_profile_id: OWNER_ID,
    doc_type: overrides.docType ?? 'CSCS_CARD',
    file_url: '/uploads/x.pdf',
    status: overrides.status ?? 'PENDING',
    rejection_reason: null as string | null,
    metadata: null,
    assigned_to: overrides.assignedTo === undefined ? STAFF_ID : overrides.assignedTo,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date(),
  };
}

function actor(
  overrides: { isAdmin?: boolean; staffId?: bigint } = {},
): {
  accountId: bigint;
  staffMemberId: bigint;
  isAdmin: boolean;
  ip?: string;
} {
  return {
    accountId: STAFF_ID,
    staffMemberId: overrides.staffId ?? STAFF_ID,
    isAdmin: overrides.isAdmin ?? false,
  };
}

describe('TEST-VER-110 DocumentReviewService.review() REJECT happy path — VER-032', () => {
  test('updates document, writes audit row, returns nulled level_changed', async () => {
    const { service, mocks } = build();
    const doc = makeDoc();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(doc as never);
    mocks.prisma.document.update.mockResolvedValueOnce({
      ...doc,
      status: 'REJECTED',
      rejection_reason: 'Card photo is too blurry to verify',
      reviewed_by: STAFF_ID,
      reviewed_at: new Date(),
    } as never);

    const result = await service.review(
      DOC_ID,
      'REJECT',
      'Card photo is too blurry to verify',
      actor(),
    );

    expect(result.document.status).toBe('REJECTED');
    expect(result.document.rejection_reason).toBe(
      'Card photo is too blurry to verify',
    );
    expect(result.level_changed).toBeNull();
    expect(result.milestones_written).toEqual([]);
    expect(mocks.prisma.document.update).toHaveBeenCalledWith({
      where: { id: DOC_ID },
      data: expect.objectContaining({
        status: 'REJECTED',
        rejection_reason: 'Card photo is too blurry to verify',
        reviewed_by: STAFF_ID,
      }),
    });
    expect(mocks.audit.log).toHaveBeenCalledWith(
      OWNER_ID,
      'verification.document.reviewed',
      'document',
      DOC_ID,
      expect.objectContaining({ decision: 'REJECT' }),
      undefined,
    );
    expect(mocks.engine.runPromotion).not.toHaveBeenCalled();
  });

  test('reason is trimmed before persistence', async () => {
    const { service, mocks } = build();
    const doc = makeDoc();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(doc as never);
    mocks.prisma.document.update.mockResolvedValueOnce({
      ...doc,
      status: 'REJECTED',
      rejection_reason: 'looks blurry',
    } as never);

    await service.review(DOC_ID, 'REJECT', '   looks blurry   ', actor());

    expect(mocks.prisma.document.update).toHaveBeenCalledWith({
      where: { id: DOC_ID },
      data: expect.objectContaining({ rejection_reason: 'looks blurry' }),
    });
  });
});

describe('TEST-VER-111 DocumentReviewService.review() REJECT validation — VER-032', () => {
  test('missing reason → 400 REJECTION_REASON_REQUIRED', async () => {
    const { service, mocks } = build();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(makeDoc() as never);

    const err = await service
      .review(DOC_ID, 'REJECT', undefined, actor())
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { code: string };
    expect(body.code).toBe('REJECTION_REASON_REQUIRED');
  });

  test('reason <10 chars after trim → 400 REJECTION_REASON_REQUIRED', async () => {
    const { service, mocks } = build();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(makeDoc() as never);

    const err = await service
      .review(DOC_ID, 'REJECT', '   short  ', actor())
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { code: string };
    expect(body.code).toBe('REJECTION_REASON_REQUIRED');
  });
});

describe('TEST-VER-112 DocumentReviewService.review() APPROVE happy path — VER-033', () => {
  test('CSCS approval writes milestone + runs promotion engine', async () => {
    const { service, mocks } = build();
    const doc = makeDoc({ docType: 'CSCS_CARD' });
    mocks.prisma.document.findUnique.mockResolvedValueOnce(doc as never);
    mocks.prisma.document.update.mockResolvedValueOnce({
      ...doc,
      status: 'APPROVED',
    } as never);
    mocks.prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 999n,
      milestone_type: 'CERTIFICATION_APPROVED',
    } as never);
    mocks.engine.runPromotion.mockResolvedValueOnce({
      from: 'BASIC',
      to: 'CERTIFIED',
    });

    const result = await service.review(DOC_ID, 'APPROVE', undefined, actor());

    expect(result.document.status).toBe('APPROVED');
    expect(result.milestones_written).toEqual([
      { type: 'CERTIFICATION_APPROVED', id: '999' },
    ]);
    expect(result.level_changed).toEqual({ from: 'BASIC', to: 'CERTIFIED' });
    expect(mocks.prisma.verificationMilestone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_profile_id: OWNER_ID,
        milestone_type: 'CERTIFICATION_APPROVED',
        staff_member_id: STAFF_ID,
        evidence_ref: DOC_ID.toString(),
      }),
    });
    expect(mocks.engine.runPromotion).toHaveBeenCalledWith(OWNER_ID, {
      milestoneIds: [999n],
      staffMemberId: STAFF_ID,
      ip: undefined,
    });
  });
});

describe('TEST-VER-113 DocumentReviewService.review() APPROVE non-milestone doc — VER-033', () => {
  test('OTHER doc approval writes audit but no milestone, no promotion', async () => {
    const { service, mocks } = build();
    const doc = makeDoc({ docType: 'OTHER' });
    mocks.prisma.document.findUnique.mockResolvedValueOnce(doc as never);
    mocks.prisma.document.update.mockResolvedValueOnce({
      ...doc,
      status: 'APPROVED',
    } as never);

    const result = await service.review(DOC_ID, 'APPROVE', undefined, actor());

    expect(result.level_changed).toBeNull();
    expect(result.milestones_written).toEqual([]);
    expect(mocks.prisma.verificationMilestone.create).not.toHaveBeenCalled();
    expect(mocks.engine.runPromotion).not.toHaveBeenCalled();
    expect(mocks.audit.log).toHaveBeenCalledTimes(1);
  });
});

describe('TEST-VER-114 DocumentReviewService.review() APPROVE rejects reason — VER-033', () => {
  test('approve + reason → 400 VALIDATION', async () => {
    const { service, mocks } = build();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(makeDoc() as never);

    const err = await service
      .review(DOC_ID, 'APPROVE', 'whatever', actor())
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { code: string };
    expect(body.code).toBe('VALIDATION');
  });
});

describe('TEST-VER-115 DocumentReviewService.review() terminal-status guard — VER-037', () => {
  test.each([['APPROVED' as const], ['REJECTED' as const]])(
    '%s document → 409 INVALID_TRANSITION',
    async (terminalStatus) => {
      const { service, mocks } = build();
      mocks.prisma.document.findUnique.mockResolvedValueOnce(
        makeDoc({ status: terminalStatus }) as never,
      );

      const err = await service
        .review(DOC_ID, 'APPROVE', undefined, actor())
        .catch((e: ConflictException) => e);
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as { code: string };
      expect(body.code).toBe('INVALID_TRANSITION');
    },
  );

  test('document not found → 404 DOCUMENT_NOT_FOUND', async () => {
    const { service, mocks } = build();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(null as never);

    const err = await service
      .review(DOC_ID, 'APPROVE', undefined, actor())
      .catch((e: NotFoundException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    const body = (err as NotFoundException).getResponse() as { code: string };
    expect(body.code).toBe('DOCUMENT_NOT_FOUND');
  });
});

describe('TEST-VER-116 DocumentReviewService.review() assignee gating — VER-132', () => {
  test('non-admin reviewing self-assigned doc → succeeds', async () => {
    const { service, mocks } = build();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(
      makeDoc({ assignedTo: STAFF_ID }) as never,
    );
    mocks.prisma.document.update.mockResolvedValueOnce({
      ...makeDoc({ assignedTo: STAFF_ID }),
      status: 'APPROVED',
    } as never);
    mocks.prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 1n,
    } as never);

    await expect(
      service.review(DOC_ID, 'APPROVE', undefined, actor()),
    ).resolves.toBeDefined();
  });

  test('non-admin reviewing unassigned doc → 403 NOT_ASSIGNEE with claim copy', async () => {
    const { service, mocks } = build();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(
      makeDoc({ assignedTo: null }) as never,
    );

    const err = await service
      .review(DOC_ID, 'APPROVE', undefined, actor())
      .catch((e: ForbiddenException) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    const body = (err as ForbiddenException).getResponse() as {
      code: string;
      message: string;
    };
    expect(body.code).toBe('NOT_ASSIGNEE');
    expect(body.message).toMatch(/Claim it/);
  });

  test('non-admin reviewing other staffs doc → 403 NOT_ASSIGNEE with assigned-elsewhere copy', async () => {
    const { service, mocks } = build();
    mocks.prisma.document.findUnique.mockResolvedValueOnce(
      makeDoc({ assignedTo: OTHER_STAFF }) as never,
    );

    const err = await service
      .review(DOC_ID, 'APPROVE', undefined, actor())
      .catch((e: ForbiddenException) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    const body = (err as ForbiddenException).getResponse() as {
      code: string;
      message: string;
    };
    expect(body.code).toBe('NOT_ASSIGNEE');
    expect(body.message).toMatch(/another staff/);
  });

  test('admin reviewing other staffs doc → succeeds, audit row carries admin_override:true', async () => {
    const { service, mocks } = build();
    const doc = makeDoc({ assignedTo: OTHER_STAFF });
    mocks.prisma.document.findUnique.mockResolvedValueOnce(doc as never);
    mocks.prisma.document.update.mockResolvedValueOnce({
      ...doc,
      status: 'APPROVED',
    } as never);
    mocks.prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 1n,
    } as never);

    await service.review(
      DOC_ID,
      'APPROVE',
      undefined,
      actor({ isAdmin: true }),
    );

    expect(mocks.audit.log).toHaveBeenCalledWith(
      OWNER_ID,
      'verification.document.reviewed',
      'document',
      DOC_ID,
      expect.objectContaining({ admin_override: true }),
      undefined,
    );
  });

  test('admin reviewing self-assigned doc → audit does not carry admin_override', async () => {
    const { service, mocks } = build();
    const doc = makeDoc({ assignedTo: STAFF_ID });
    mocks.prisma.document.findUnique.mockResolvedValueOnce(doc as never);
    mocks.prisma.document.update.mockResolvedValueOnce({
      ...doc,
      status: 'APPROVED',
    } as never);
    mocks.prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 1n,
    } as never);

    await service.review(
      DOC_ID,
      'APPROVE',
      undefined,
      actor({ isAdmin: true }),
    );

    const call = mocks.audit.log.mock.calls[0];
    expect(call[4]).not.toHaveProperty('admin_override', true);
  });
});

describe('TEST-VER-117 DocumentReviewService milestone mapping — VER-051', () => {
  const cases: Array<[string, string | null]> = [
    ['CSCS_CARD', 'CERTIFICATION_APPROVED'],
    ['GAS_SAFE_CERT', 'CERTIFICATION_APPROVED'],
    ['NICEIC_CERT', 'CERTIFICATION_APPROVED'],
    ['FIRAS_CERT', 'CERTIFICATION_APPROVED'],
    ['INSURANCE', 'INSURANCE_APPROVED'],
    ['COMPANY_LETTERHEAD', 'COMPANY_LETTERHEAD_APPROVED'],
    ['RIGHT_TO_WORK_SHARE_CODE', 'RIGHT_TO_WORK_VERIFIED'],
    ['RIGHT_TO_WORK_DOCUMENT', 'RIGHT_TO_WORK_VERIFIED'],
    ['HMRC_CIS_DOCUMENT', 'HMRC_CIS_VERIFIED'],
    ['OTHER', null],
    ['ID_PHOTO', null],
    ['SELFIE', null],
  ];

  test.each(cases)(
    '%s approval → milestone=%s',
    async (docType, expectedMilestoneType) => {
      const { service, mocks } = build();
      const doc = makeDoc({ docType });
      mocks.prisma.document.findUnique.mockResolvedValueOnce(doc as never);
      mocks.prisma.document.update.mockResolvedValueOnce({
        ...doc,
        status: 'APPROVED',
      } as never);
      if (expectedMilestoneType) {
        mocks.prisma.verificationMilestone.create.mockResolvedValueOnce({
          id: 5n,
        } as never);
      }

      const result = await service.review(
        DOC_ID,
        'APPROVE',
        undefined,
        actor(),
      );

      if (expectedMilestoneType === null) {
        expect(mocks.prisma.verificationMilestone.create).not.toHaveBeenCalled();
        expect(result.milestones_written).toEqual([]);
      } else {
        expect(mocks.prisma.verificationMilestone.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            milestone_type: expectedMilestoneType,
          }),
        });
      }
    },
  );
});
