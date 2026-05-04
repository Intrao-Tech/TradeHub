// TEST-PROF-012 / 014 / 015 — WorkerProfileService unit specs.
//
// Pure-logic tests with deep-mocked Prisma. Each test cites the PROF-NNN
// clause from tasks/in-progress/profiles/spec.md it guards.

import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { WorkerProfileService } from './worker-profile.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: WorkerProfileService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new WorkerProfileService(prisma);
  return { service, prisma };
}

describe('TEST-PROF-012 WorkerProfileService.update (PROF-012)', () => {
  test('PROF-012 — persists years_experience / day_rate_min / day_rate_max / available_from / is_available', async () => {
    const { service, prisma } = build();
    prisma.workerProfile.update.mockResolvedValue({} as never);

    const availableFrom = new Date('2026-06-01T00:00:00.000Z');
    await service.update(1n, {
      years_experience: 7,
      day_rate_min: 200,
      day_rate_max: 350,
      available_from: availableFrom,
      is_available: true,
    });

    const call = prisma.workerProfile.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.years_experience).toBe(7);
    expect((call.data.day_rate_min as Prisma.Decimal).toString()).toBe('200');
    expect((call.data.day_rate_max as Prisma.Decimal).toString()).toBe('350');
    expect(call.data.available_from).toBe(availableFrom);
    expect(call.data.is_available).toBe(true);
  });

  test('PROF-012 — only fields present in the DTO are persisted', async () => {
    const { service, prisma } = build();
    prisma.workerProfile.update.mockResolvedValue({} as never);
    await service.update(1n, { is_available: false });
    const call = prisma.workerProfile.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(call.data)).toEqual(['is_available']);
    expect(call.data.is_available).toBe(false);
  });

  test('PROF-012 — Prisma update failure surfaces as 404', async () => {
    const { service, prisma } = build();
    prisma.workerProfile.update.mockRejectedValue(new Error('boom'));
    await expect(service.update(1n, { years_experience: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test.skip(
    'PROF-014 — TODO: service-side cross-field validation `day_rate_max >= day_rate_min`. ' +
      'Currently the service writes both rates straight through; the DTO has no ' +
      '@ValidateBy decorator and the service skips the cross-check. PROF-014 is "Should". ' +
      'See tasks/in-progress/profiles/followups.md.',
    async () => {
      const { service } = build();
      await expect(
        service.update(1n, { day_rate_min: 400, day_rate_max: 100 }),
      ).rejects.toBeDefined();
    },
  );
});

describe('TEST-PROF-014 WorkerProfileService specialisation linkage (PROF-036, BE-PROF-3)', () => {
  test('BE-PROF-3 — linkSpecialisation upserts a worker_specialisation row', async () => {
    const { service, prisma } = build();
    prisma.workerSpecialisation.upsert.mockResolvedValue({
      worker_id: 1n,
      specialisation_id: 5,
      is_primary: true,
    } as never);
    const out = await service.linkSpecialisation(1n, 5, true);
    expect(out).toMatchObject({ specialisation_id: 5, is_primary: true });
    const call = prisma.workerSpecialisation.upsert.mock.calls[0][0] as {
      where: { worker_id_specialisation_id: { worker_id: bigint; specialisation_id: number } };
      create: { is_primary: boolean };
      update: { is_primary: boolean };
    };
    expect(call.where.worker_id_specialisation_id).toEqual({
      worker_id: 1n,
      specialisation_id: 5,
    });
    expect(call.create.is_primary).toBe(true);
    expect(call.update.is_primary).toBe(true);
  });

  test('BE-PROF-3 — unlinkSpecialisation deletes the join row', async () => {
    const { service, prisma } = build();
    prisma.workerSpecialisation.deleteMany.mockResolvedValue({ count: 1 } as never);
    await service.unlinkSpecialisation(1n, 5);
    const call = prisma.workerSpecialisation.deleteMany.mock.calls[0][0] as {
      where: { worker_id: bigint; specialisation_id: number };
    };
    expect(call.where).toEqual({ worker_id: 1n, specialisation_id: 5 });
  });

  // The dedicated POST /worker-profiles/me/specialisations/:id endpoint
  // (BE-PROF-3) lives at the controller layer; the service helper above
  // is the contract shape for whatever wiring lands.  The catalog 404
  // case is owned by the controller — see TEST-PROF-201.
  test.skip(
    'BE-PROF-3 — TODO: service-level 404 when specialisation_id does not exist in the catalog. ' +
      'Service today blindly upserts; the FK violation surfaces only at DB time. ' +
      'Live the moment BE-PROF-3 ships its own 404 path.',
    async () => {
      // intentionally empty
    },
  );
});

describe('TEST-PROF-015 WorkerProfileService languages (PROF-055, BE-PROF-6)', () => {
  test('PROF-055 — persists ISO 639-1 array via Prisma `set`', async () => {
    const { service, prisma } = build();
    prisma.workerProfile.update.mockResolvedValue({} as never);
    await service.update(1n, { languages: ['en', 'pl', 'ro'] });
    const call = prisma.workerProfile.update.mock.calls[0][0] as {
      data: { languages: { set: string[] } };
    };
    expect(call.data.languages).toEqual({ set: ['en', 'pl', 'ro'] });
  });

  // DTO regex `/^[a-z]{2}$/` rejects mixed-case + 3-letter codes;
  // class-validator runs before the service is ever called, so a
  // service-level test for invalid codes can't be exercised here
  // without the validation pipe.  TEST-PROF-072 (e2e) covers the
  // pipe path.
  test.skip(
    'PROF-055 — invalid code rejection is enforced at the DTO/pipe layer, not in the service. ' +
      'Coverage owned by TEST-PROF-072 (worker-profile e2e).',
    () => {
      // intentionally empty
    },
  );
});
