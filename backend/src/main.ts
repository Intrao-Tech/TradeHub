import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { BigIntSerializationInterceptor } from './common/interceptors/bigint-serialization.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { RedisIoAdapter } from './conversation/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.setGlobalPrefix('api');

  // Serve uploaded files at /uploads/* (avatars, document files, portfolio media).
  // The api prefix above only applies to controllers, not static assets.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // CORS allowlist: marketplace + staff origins. Empty values are dropped.
  // Per AUTH-016-005: wildcard origin is rejected when NODE_ENV=production.
  const marketplaceOrigin = process.env.FRONTEND_URL;
  const staffOrigin = process.env.STAFF_FRONTEND_URL;
  const allowedOrigins = [marketplaceOrigin, staffOrigin].filter(
    Boolean,
  ) as string[];
  if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    throw new Error(
      'CORS misconfigured: FRONTEND_URL and/or STAFF_FRONTEND_URL must be set in production',
    );
  }
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true, // dev fallback: reflect origin
    credentials: true,
  });

  const redisUrl = process.env.REDIS_URL;
  const redisAdapter = new RedisIoAdapter(app);
  if (redisUrl) {
    await redisAdapter.connectToRedis(redisUrl);
  }
  app.useWebSocketAdapter(redisAdapter);

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TradeHub UK API')
    .setDescription('B2B platform for UK construction tradespeople')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`TradeHub API running on http://localhost:${port}/api`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
  console.log(`WebSocket chat: ws://localhost:${port}/chat`);
}

bootstrap();
