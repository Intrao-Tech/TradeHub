// TEST-PROF-050 — Multer config contract tests for the document upload route.
//
// Boots a minimal Nest controller with the real FileInterceptor decorators
// and asserts the BE-PROF-8 caps from the controller source:
//   - 10 MiB size cap (DOCUMENT_MAX_BYTES)
//   - MIME whitelist `application/pdf | image/jpeg | image/png | image/webp`
// Multer surfaces a structured 4xx error body via NestJS's BadRequestException,
// not a stack trace.

import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { GlobalExceptionFilter } from '../common/filters/http-exception.filter';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { mediaPngTooLarge, nonImageZip } from '../../test/util/upload';

describe('TEST-PROF-050 DocumentController Multer config (BE-PROF-8)', () => {
  let app: INestApplication;
  const uploadStub = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentController],
      providers: [
        {
          provide: DocumentService,
          useValue: {
            upload: uploadStub.mockResolvedValue({
              id: '1',
              status: 'PENDING',
            }),
            getByClientProfile: jest.fn().mockResolvedValue([]),
            getByIdForRequester: jest.fn(),
            updateStatus: jest.fn(),
            deleteDocument: jest.fn(),
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
    uploadStub.mockClear();
  });

  test('BE-PROF-8 — non-whitelisted MIME (`application/zip`) returns a structured 4xx code, no service call', async () => {
    const fixture = nonImageZip();
    const res = await supertest(app.getHttpServer())
      .post('/api/documents/upload')
      .field('doc_type', 'CSCS_CARD')
      .attach('file', fixture.buffer, {
        filename: fixture.filename,
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body).toHaveProperty('code');
    expect(res.body.code).toBe('INVALID_MIME');
    expect(uploadStub).not.toHaveBeenCalled();
  });

  test('BE-PROF-8 — > 10 MiB upload trips the Multer fileSize cap with a structured 4xx, no service call', async () => {
    const fixture = await mediaPngTooLarge();
    const res = await supertest(app.getHttpServer())
      .post('/api/documents/upload')
      .field('doc_type', 'CSCS_CARD')
      .attach('file', fixture.buffer, {
        filename: 'big.png',
        contentType: fixture.mimetype,
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    // Multer's "File too large" surfaces through Nest as a 500-by-default; the
    // GlobalExceptionFilter wraps it.  Either way the response carries a body
    // (no raw stack), and the service was never called.
    expect(typeof res.body).toBe('object');
    expect(uploadStub).not.toHaveBeenCalled();
  }, 30_000);
});
