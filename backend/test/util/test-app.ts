// TEST-AUTH-040: end-to-end Nest app harness used by every *.e2e-spec.ts.
//
// Boots a Postgres Testcontainer once per Jest worker, applies migrations,
// instantiates AppModule with these overrides:
//   - MailService → in-memory TestMailService (mailbox accessible via harness)
//   - GoogleAuthGuard → StubGoogleAuthGuard (deterministic OAuth callback)
// The resulting harness exposes `{ app, prisma, mail, request, close }`.

import type { CanActivate, INestApplication } from '@nestjs/common';
import { Injectable, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/mail/mail.service';
import { GoogleAuthGuard } from '../../src/auth/guards/google-auth.guard';
import { GlobalExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { BigIntSerializationInterceptor } from '../../src/common/interceptors/bigint-serialization.interceptor';
import { StaffHostMiddleware } from '../../src/common/middleware/staff-host.middleware';
import { startPostgres, truncateAll } from './postgres-container';
import { TestMailService } from './test-mail.service';
import { StubGoogleAuthGuard, resetGoogleQueue } from './stub-google.strategy';

// Always-pass throttler — used by every e2e suite EXCEPT TEST-AUTH-050
// (auth.rate-limit.e2e-spec.ts) which boots its own app with the real guard.
@Injectable()
class NoopThrottlerGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

export type TestHarness = {
  app: INestApplication;
  prisma: PrismaService;
  mail: TestMailService;
  request: () => supertest.SuperTest<supertest.Test>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
};

export type TestAppOptions = {
  /**
   * Configure staff-host middleware. Defaults match the dev defaults from
   * AUTH-016-002 so tests can hit /auth/staff/login by default.
   */
  staffOrigin?: string;
  staffHost?: string;
  /** Marketplace origin used for non-staff requests. */
  marketplaceOrigin?: string;
  /**
   * If true, mounts a no-op AccountStateGuard override that always passes —
   * used by suites that test the guard in isolation. Default: real guard.
   */
  bypassAccountState?: boolean;
  /**
   * If true, the real ThrottlerGuard runs — used only by TEST-AUTH-050
   * (auth.rate-limit.e2e-spec.ts). Default: NoopThrottlerGuard so unrelated
   * specs don't trip per-IP limits.
   */
  enableThrottler?: boolean;
};

export const DEFAULT_STAFF_ORIGIN = 'http://internal.localhost:3000';
export const DEFAULT_STAFF_HOST = 'internal.localhost';
export const DEFAULT_MARKETPLACE_ORIGIN = 'http://localhost:3000';

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestHarness> {
  const { uri } = await startPostgres();
  process.env.DATABASE_URL = uri;
  process.env.NODE_ENV = 'test';
  // JWT secrets must exist for AuthService.issueTokens to sign. Seed
  // deterministic values so tests can verify HMAC behaviour reproducibly.
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
  process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
  process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '7d';
  process.env.FRONTEND_URL =
    options.marketplaceOrigin ?? DEFAULT_MARKETPLACE_ORIGIN;
  process.env.STAFF_FRONTEND_URL = options.staffOrigin ?? DEFAULT_STAFF_ORIGIN;
  process.env.STAFF_LOGIN_HOST = options.staffHost ?? DEFAULT_STAFF_HOST;
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
  process.env.GOOGLE_CALLBACK_URL =
    process.env.GOOGLE_CALLBACK_URL ??
    'http://localhost:8081/api/auth/google/callback';

  // AppModule reads this at import time to decide whether to register
  // ThrottlerGuard as APP_GUARD. Must be set BEFORE the dynamic import.
  if (options.enableThrottler) {
    delete process.env.DISABLE_APP_THROTTLER;
  } else {
    process.env.DISABLE_APP_THROTTLER = 'true';
  }

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useClass(TestMailService)
    .overrideGuard(GoogleAuthGuard)
    .useClass(StubGoogleAuthGuard);

  if (!options.enableThrottler) {
    // Belt-and-braces: also override the @UseGuards-style references so any
    // route that pulls ThrottlerGuard via decorator (none today, but defensive)
    // also short-circuits.
    builder = builder
      .overrideGuard(ThrottlerGuard)
      .useClass(NoopThrottlerGuard);
  }

  // The StaffHostMiddleware reads ConfigService at construction. Re-construct
  // it manually so the env vars set above take effect for this test instance.
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new BigIntSerializationInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.init();

  // Sanity-check the middleware is mounted; surface a clear error if not.
  void app.get(StaffHostMiddleware);

  const prisma = moduleRef.get(PrismaService);
  // We override MailService → TestMailService above; force the runtime type
  // through (`overrideProvider` swaps the impl but the typed `.get()` still
  // returns the original token type).
  const mail: TestMailService = moduleRef.get<TestMailService>(
    MailService as unknown as new (...args: never[]) => TestMailService,
  );

  const harness: TestHarness = {
    app,
    prisma,
    mail,
    request: () =>
      supertest(app.getHttpServer()) as unknown as ReturnType<
        TestHarness['request']
      >,
    async reset() {
      mail.reset();
      resetGoogleQueue();
      await truncateAll(prisma as unknown as Parameters<typeof truncateAll>[0]);
    },
    async close() {
      await app.close();
    },
  };

  return harness;
}
