// TEST-PROF-050 — Multer config contract test for the avatar upload route.
//
// Asserts the BE-PROF-8 caps from the avatar route source:
//   - 5 MiB size cap (AVATAR_MAX_BYTES)
//   - MIME whitelist `image/jpeg | image/png | image/webp`
// (PROF-017 / PROF-018 / BE-PROF-8 / TEST-PROF-050).

import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { GlobalExceptionFilter } from '../common/filters/http-exception.filter';
import { ClientProfileController } from './client-profile.controller';
import { ClientProfileService } from './client-profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { avatarPngTooLarge, nonImageZip } from '../../test/util/upload';

describe('TEST-PROF-050 ClientProfileController avatar Multer config (BE-PROF-8 / PROF-018)', () => {
  let app: INestApplication;
  const uploadStub = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientProfileController],
      providers: [
        {
          provide: ClientProfileService,
          useValue: {
            updateAvatar: uploadStub.mockResolvedValue({ avatar_url: '/uploads/x.png' }),
            update: jest.fn(),
            getBySlug: jest.fn(),
            search: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user: unknown } } }) => {
          const req = ctx.switchToHttp().getRequest();
          (req as { user: unknown }).user = {
            accountId: 1n,
            clientProfileId: 1n,
            isWorker: true,
            isEmployer: false,
            isStaff: false,
            verification_state: 'ACTIVE',
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    uploadStub.mockClear();
  });

  test('PROF-018 / BE-PROF-8 — `application/zip` blocked by MIME whitelist with INVALID_MIME', async () => {
    const fixture = nonImageZip();
    const res = await supertest(app.getHttpServer())
      .post('/api/client-profiles/me/avatar')
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.code).toBe('INVALID_MIME');
    expect(uploadStub).not.toHaveBeenCalled();
  });

  test('PROF-018 / BE-PROF-8 — > 5 MiB PNG trips the avatar-route size cap; service untouched', async () => {
    const fixture = await avatarPngTooLarge();
    const res = await supertest(app.getHttpServer())
      .post('/api/client-profiles/me/avatar')
      .attach('file', fixture.buffer, {
        filename: 'big.png',
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(uploadStub).not.toHaveBeenCalled();
  }, 30_000);
});
