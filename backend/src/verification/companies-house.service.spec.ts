// TEST-VER-130..138 — CompaniesHouseService unit specs.
//
// `globalThis.fetch` mocked at module boundary; canned fixtures from
// `backend/test/util/companies-house-fixtures.ts`. Each test cites the
// VER-NNN clause it guards.

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { CompaniesHouseService } from './companies-house.service';
import { PromotionEngine } from './promotion-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CH_FIXTURES,
  mockFetchThrows,
  mockNextFetch,
} from '../../test/util/companies-house-fixtures';

const EMPLOYER_ID = 50n;
const COMPANY_NUMBER = '12345678';

function build(opts: { apiKey?: string } = {}): {
  service: CompaniesHouseService;
  prisma: DeepMockProxy<PrismaService>;
  audit: { log: jest.Mock };
  engine: { runPromotion: jest.Mock };
} {
  const prisma = mockDeep<PrismaService>();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const engine = { runPromotion: jest.fn().mockResolvedValue(null) };
  const config = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'COMPANIES_HOUSE_API_KEY')
        return opts.apiKey ?? 'test-api-key';
      return undefined;
    }),
  } as unknown as ConfigService;
  const service = new CompaniesHouseService(
    config,
    prisma,
    audit as unknown as AuditService,
    engine as unknown as PromotionEngine,
  );
  return { service, prisma, audit, engine };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TEST-VER-130 verifyEmployer not configured — VER-140', () => {
  test('API key empty → 503 COMPANIES_HOUSE_NOT_CONFIGURED', async () => {
    const { service } = build({ apiKey: '' });
    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: ServiceUnavailableException) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(
      ((err as ServiceUnavailableException).getResponse() as { code: string })
        .code,
    ).toBe('COMPANIES_HOUSE_NOT_CONFIGURED');
  });
});

describe('TEST-VER-131 verifyEmployer details missing — VER-141', () => {
  test('empty company_number → 400 COMPANY_DETAILS_MISSING', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: null,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme' },
    } as never);

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      ((err as BadRequestException).getResponse() as { code: string }).code,
    ).toBe('COMPANY_DETAILS_MISSING');
  });

  test('empty company_name → 400 COMPANY_DETAILS_MISSING', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: null,
      client_profile: { display_name: 'Acme' },
    } as never);

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  test('employer not found → 404 EMPLOYER_NOT_FOUND', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce(null as never);

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: NotFoundException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
  });
});

describe('TEST-VER-132 verifyEmployer not found — VER-141', () => {
  test('registry 404 → 404 COMPANIES_HOUSE_NOT_FOUND', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme' },
    } as never);
    mockNextFetch(CH_FIXTURES.notFound());

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: NotFoundException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(
      ((err as NotFoundException).getResponse() as { code: string }).code,
    ).toBe('COMPANIES_HOUSE_NOT_FOUND');
  });
});

describe('TEST-VER-133 verifyEmployer inactive — VER-142 (FU-VER-2 resolved)', () => {
  test('inactive status → 400 COMPANIES_HOUSE_MISMATCH (matches spec; FU-VER-2 resolved 2026-05-06)', async () => {
    const { service, prisma, audit } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme' },
    } as never);
    mockNextFetch(CH_FIXTURES.dissolved(COMPANY_NUMBER));

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as {
      code: string;
      registry_response?: { status?: string };
    };
    expect(body.code).toBe('COMPANIES_HOUSE_MISMATCH');
    expect(body.registry_response?.status).toBe('dissolved');

    expect(audit.log).toHaveBeenCalledWith(
      EMPLOYER_ID,
      'verification.companies_house.checked',
      'employer_profile',
      EMPLOYER_ID,
      expect.objectContaining({ result: 'INACTIVE' }),
      undefined,
    );
  });
});

describe('TEST-VER-134 verifyEmployer name mismatch — VER-142', () => {
  test('mismatching name → 400 COMPANIES_HOUSE_MISMATCH; audit reason NAME_MISMATCH', async () => {
    const { service, prisma, audit } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'FooBar Builders',
      client_profile: { display_name: 'FooBar' },
    } as never);
    mockNextFetch(
      CH_FIXTURES.activeNameMismatch(COMPANY_NUMBER, 'Acme Holdings Ltd'),
    );

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      ((err as BadRequestException).getResponse() as { code: string }).code,
    ).toBe('COMPANIES_HOUSE_MISMATCH');
    expect(audit.log).toHaveBeenCalledWith(
      EMPLOYER_ID,
      'verification.companies_house.checked',
      'employer_profile',
      EMPLOYER_ID,
      expect.objectContaining({ result: 'NAME_MISMATCH' }),
      undefined,
    );
  });
});

describe('TEST-VER-135 verifyEmployer upstream errors — VER-143', () => {
  test('registry 500 → 503 COMPANIES_HOUSE_UPSTREAM', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme' },
    } as never);
    mockNextFetch(CH_FIXTURES.serverError());

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: ServiceUnavailableException) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(
      ((err as ServiceUnavailableException).getResponse() as { code: string })
        .code,
    ).toBe('COMPANIES_HOUSE_UPSTREAM');
  });

  test('fetch throws (network error) → 503 COMPANIES_HOUSE_UPSTREAM', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme' },
    } as never);
    mockFetchThrows();

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: ServiceUnavailableException) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(
      ((err as ServiceUnavailableException).getResponse() as { code: string })
        .code,
    ).toBe('COMPANIES_HOUSE_UPSTREAM');
  });

  test('registry 401 → 503 COMPANIES_HOUSE_NOT_CONFIGURED', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme' },
    } as never);
    mockNextFetch(CH_FIXTURES.authFailure());

    const err = await service
      .verifyEmployer(EMPLOYER_ID)
      .catch((e: ServiceUnavailableException) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(
      ((err as ServiceUnavailableException).getResponse() as { code: string })
        .code,
    ).toBe('COMPANIES_HOUSE_NOT_CONFIGURED');
  });
});

describe('TEST-VER-136 verifyEmployer happy path — VER-145', () => {
  test('matched name + active → writes milestone + runs promotion engine', async () => {
    const { service, prisma, audit, engine } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme' },
    } as never);
    mockNextFetch(CH_FIXTURES.activeMatch(COMPANY_NUMBER, 'Acme Limited'));
    prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 700n,
    } as never);

    const result = await service.verifyEmployer(EMPLOYER_ID);

    expect(result).toEqual({
      matched: true,
      milestone_id: '700',
      registry_company_name: 'Acme Limited',
    });
    expect(prisma.verificationMilestone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_profile_id: EMPLOYER_ID,
        milestone_type: 'COMPANY_HOUSE_VERIFIED',
        evidence_ref: COMPANY_NUMBER,
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      EMPLOYER_ID,
      'verification.companies_house.checked',
      'employer_profile',
      EMPLOYER_ID,
      expect.objectContaining({ result: 'MATCHED' }),
      undefined,
    );
    expect(engine.runPromotion).toHaveBeenCalledTimes(1);
  });

  test('milestone notes contains the registry response', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme' },
    } as never);
    mockNextFetch(CH_FIXTURES.activeMatch(COMPANY_NUMBER, 'Acme Limited'));
    prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 700n,
    } as never);

    await service.verifyEmployer(EMPLOYER_ID);
    const create = prisma.verificationMilestone.create.mock.calls[0][0] as {
      data: { notes: string };
    };
    expect(typeof create.data.notes).toBe('string');
    expect(create.data.notes).toContain('Acme Limited');
    expect(create.data.notes).toContain('active');
  });
});

describe('TEST-VER-137 normaliseCompanyName — VER-145', () => {
  // Pin the predicate via the public surface (verifyEmployer match path).
  const cases: Array<[string, string, boolean]> = [
    ['Acme Limited', 'Acme Ltd', true],
    ['acme  limited.', 'Acme Ltd', true],
    ['Acme Public Limited Company', 'Acme PLC', true], // FU-VER-3 resolved 2026-05-06
    ['Foo & Bar Ltd', 'Foo Bar Limited', true],
    ['FooBar Ltd', 'Foo Bar Ltd', false],
  ];

  test.each(cases)(
    'registry=%s vs submitted=%s → matches=%s',
    async (registryName, submittedName, expectMatch) => {
      const { service, prisma } = build();
      prisma.employerProfile.findUnique.mockResolvedValueOnce({
        id: EMPLOYER_ID,
        company_number: COMPANY_NUMBER,
        company_name: submittedName,
        client_profile: { display_name: submittedName },
      } as never);
      mockNextFetch(CH_FIXTURES.activeMatch(COMPANY_NUMBER, registryName));
      prisma.verificationMilestone.create.mockResolvedValueOnce({
        id: 700n,
      } as never);

      const result = await service
        .verifyEmployer(EMPLOYER_ID)
        .catch((e: BadRequestException) => e);

      if (expectMatch) {
        expect(result).toMatchObject({ matched: true });
      } else {
        expect(result).toBeInstanceOf(BadRequestException);
      }
    },
  );
});

describe('TEST-VER-138 normaliseCompanyName bidirectional includes — VER-145', () => {
  test('registry "Acme" + submitted "Acme Ltd" → match (registry contains submitted is OK)', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.findUnique.mockResolvedValueOnce({
      id: EMPLOYER_ID,
      company_number: COMPANY_NUMBER,
      company_name: 'Acme Ltd',
      client_profile: { display_name: 'Acme Ltd' },
    } as never);
    // The registry returns just "Acme" — submitted "Acme Ltd" contains it.
    mockNextFetch(CH_FIXTURES.activeMatch(COMPANY_NUMBER, 'Acme'));
    prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 700n,
    } as never);

    const result = await service.verifyEmployer(EMPLOYER_ID);
    expect(result).toMatchObject({ matched: true });
  });
});
