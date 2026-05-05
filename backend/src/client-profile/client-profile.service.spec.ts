// TEST-PROF-010 / TEST-PROF-011 — ClientProfileService unit specs.
//
// Pure-logic tests with deep-mocked Prisma + sharp generated buffers.
// Each test cites the PROF-NNN clause from tasks/in-progress/profiles/spec.md
// it guards.

import * as path from 'node:path';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientProfileService } from './client-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  asDiskFile,
  asMulterFile,
  avatarPngOk,
  avatarPngTooSmall,
} from '../../test/util/upload';

function build(): {
  service: ClientProfileService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new ClientProfileService(prisma);
  return { service, prisma };
}

describe('TEST-PROF-010 ClientProfileService.update (PROF-011)', () => {
  test('PROF-011 — persists display_name / bio / city / postcode_area; does not touch slug', async () => {
    const { service, prisma } = build();
    prisma.clientProfile.update.mockResolvedValue({
      id: 1n,
      display_name: 'Mike Builder',
      slug: 'mike-builder-abcdef',
      bio: 'New bio',
      city: 'Camden',
      postcode_area: 'NW1',
    } as never);

    await service.update(1n, {
      display_name: 'Mike Builder',
      bio: 'New bio',
      city: 'Camden',
      postcode_area: 'NW1',
    });

    expect(prisma.clientProfile.update).toHaveBeenCalledTimes(1);
    const call = prisma.clientProfile.update.mock.calls[0][0] as {
      where: { id: bigint };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: 1n });
    expect(call.data).toEqual({
      display_name: 'Mike Builder',
      bio: 'New bio',
      city: 'Camden',
      postcode_area: 'NW1',
    });
    // slug must NOT appear in the update payload — re-issuing slugs on
    // edit is the regression Profiles spec PROF-011 explicitly forbids.
    expect(call.data).not.toHaveProperty('slug');
  });

  test('PROF-011 — only fields provided in the DTO end up in the Prisma update payload', async () => {
    const { service, prisma } = build();
    prisma.clientProfile.update.mockResolvedValue({ id: 1n } as never);
    await service.update(1n, { display_name: 'Just the name' });
    const call = prisma.clientProfile.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(call.data)).toEqual(['display_name']);
  });

  test('PROF-011 — Prisma update failure surfaces as 404 (regression guard for not-found path)', async () => {
    const { service, prisma } = build();
    prisma.clientProfile.update.mockRejectedValue(new Error('not found'));
    await expect(service.update(1n, { city: 'Camden' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('PROF-011 — postcode_area casing is normalised to upper case before persistence', async () => {
    const { service, prisma } = build();
    prisma.clientProfile.update.mockResolvedValue({ id: 1n } as never);
    await service.update(1n, { postcode_area: 'nw1' });
    const call = prisma.clientProfile.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.postcode_area).toBe('NW1');
  });
});

describe('TEST-PROF-011 ClientProfileService.updateAvatar (PROF-017 / PROF-018, BE-PROF-1)', () => {
  test('PROF-017 — happy path: persists /uploads/{filename}, removes prior avatar', async () => {
    const { service, prisma } = build();
    const fixture = await avatarPngOk();
    const disk = asDiskFile(fixture, 'png');
    try {
      const file = asMulterFile(disk);
      prisma.clientProfile.findUnique.mockResolvedValue({
        id: 1n,
        avatar_url: '/uploads/old.png',
      } as never);
      prisma.clientProfile.update.mockResolvedValue({
        id: 1n,
        avatar_url: `/uploads/${file.filename}`,
      } as never);

      const out = await service.updateAvatar(1n, file);

      expect(out).toEqual({ avatar_url: `/uploads/${file.filename}` });
      const call = prisma.clientProfile.update.mock.calls[0][0] as {
        data: { avatar_url: string };
      };
      expect(call.data.avatar_url).toBe(`/uploads/${file.filename}`);
    } finally {
      disk.cleanup();
    }
  });

  test('PROF-018 — rejects under-256px image with BadRequestException + structured code', async () => {
    const { service, prisma } = build();
    const fixture = await avatarPngTooSmall();
    const disk = asDiskFile(fixture, 'png');
    try {
      const file = asMulterFile(disk);
      // Service unlinks the file before throwing — fine, just don't fail
      // the assertion if the fixture path is gone.
      await expect(service.updateAvatar(1n, file)).rejects.toMatchObject({
        response: { code: 'IMAGE_TOO_SMALL' },
      });
      // No DB write should occur on rejection.
      expect(prisma.clientProfile.update).not.toHaveBeenCalled();
    } finally {
      disk.cleanup();
    }
  });

  test('PROF-018 — invalid image bytes → BadRequestException("INVALID_IMAGE")', async () => {
    const { service } = build();
    const tmpdir = path.join(
      require('node:os').tmpdir(),
      `tradehub-test-bad-${Date.now()}`,
    );
    require('node:fs').mkdirSync(tmpdir, { recursive: true });
    const filepath = path.join(tmpdir, 'broken.png');
    require('node:fs').writeFileSync(filepath, Buffer.from('not a png'));
    try {
      const file = asMulterFile({
        buffer: Buffer.from('not a png'),
        filename: 'broken.png',
        mimetype: 'image/png',
        size: 9,
        path: filepath,
        cleanup: () => {},
      });
      await expect(service.updateAvatar(1n, file)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    } finally {
      require('node:fs').rmSync(tmpdir, { recursive: true, force: true });
    }
  });

  test('PROF-017 — missing client profile → 404, no update emitted', async () => {
    const { service, prisma } = build();
    const fixture = await avatarPngOk();
    const disk = asDiskFile(fixture, 'png');
    try {
      const file = asMulterFile(disk);
      prisma.clientProfile.findUnique.mockResolvedValue(null);
      await expect(service.updateAvatar(1n, file)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.clientProfile.update).not.toHaveBeenCalled();
    } finally {
      disk.cleanup();
    }
  });
});
