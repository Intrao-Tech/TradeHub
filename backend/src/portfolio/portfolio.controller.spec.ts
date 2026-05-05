// TEST-PROF-050 — Multer config contract test for the portfolio media upload route.
//
// Asserts BE-PROF-8 caps from the controller source:
//   - 10 MiB size cap (PORTFOLIO_MEDIA_MAX_BYTES)
//   - MIME whitelist `image/jpeg | image/png | image/webp`

import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { GlobalExceptionFilter } from '../common/filters/http-exception.filter';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { mediaPngTooLarge, nonImageZip } from '../../test/util/upload';

describe('TEST-PROF-050 PortfolioController media upload Multer config (BE-PROF-8)', () => {
  let app: INestApplication;
  const uploadMediaStub = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PortfolioController],
      providers: [
        {
          provide: PortfolioService,
          useValue: {
            uploadMedia: uploadMediaStub.mockResolvedValue({ id: '1' }),
            getByWorker: jest.fn(),
            getById: jest.fn(),
            createExperience: jest.fn(),
            createProject: jest.fn(),
            createCertification: jest.fn(),
            update: jest.fn(),
            updateExperienceDetail: jest.fn(),
            updateProjectDetail: jest.fn(),
            updateCertificationDetail: jest.fn(),
            delete: jest.fn(),
            addMedia: jest.fn(),
            removeMedia: jest.fn(),
            linkDocument: jest.fn(),
            unlinkDocument: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user: unknown } };
        }) => {
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
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    uploadMediaStub.mockClear();
  });

  test('BE-PROF-8 — `application/zip` blocked by MIME whitelist (INVALID_MIME)', async () => {
    const fixture = nonImageZip();
    const res = await supertest(app.getHttpServer())
      .post('/api/portfolio/1/media/upload')
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.code).toBe('INVALID_MIME');
    expect(uploadMediaStub).not.toHaveBeenCalled();
  });

  test('BE-PROF-8 — > 10 MiB image blocked by Multer fileSize; service untouched', async () => {
    const fixture = await mediaPngTooLarge();
    const res = await supertest(app.getHttpServer())
      .post('/api/portfolio/1/media/upload')
      .attach('file', fixture.buffer, {
        filename: 'big.png',
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(uploadMediaStub).not.toHaveBeenCalled();
  }, 30_000);
});
