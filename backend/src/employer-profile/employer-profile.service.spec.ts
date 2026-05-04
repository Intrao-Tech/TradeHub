// TEST-PROF-013 — EmployerProfileService unit specs.
//
// Pure-logic tests with deep-mocked Prisma. Each test cites the PROF-NNN
// clause it guards.

import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { EmployerProfileService } from './employer-profile.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: EmployerProfileService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new EmployerProfileService(prisma);
  return { service, prisma };
}

describe('TEST-PROF-013 EmployerProfileService.update (PROF-013)', () => {
  test('PROF-013 — persists company_name / company_number / team_size', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.update.mockResolvedValue({} as never);
    await service.update(1n, {
      company_name: 'Acme Build Ltd',
      company_number: '12345678',
      team_size: 12,
    });
    const call = prisma.employerProfile.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).toEqual({
      company_name: 'Acme Build Ltd',
      company_number: '12345678',
      team_size: 12,
    });
  });

  test('PROF-013 — only fields provided in the DTO end up in the Prisma payload', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.update.mockResolvedValue({} as never);
    await service.update(1n, { team_size: 5 });
    const call = prisma.employerProfile.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(call.data)).toEqual(['team_size']);
  });

  test('PROF-013 — Prisma update failure surfaces as 404', async () => {
    const { service, prisma } = build();
    prisma.employerProfile.update.mockRejectedValue(new Error('boom'));
    await expect(
      service.update(1n, { company_name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
