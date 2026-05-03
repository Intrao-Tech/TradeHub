import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Preserves structured error bodies so the SPA can read `code`, `email`,
 * `reasons`, etc. — not just `message`.
 *
 * Behaviour:
 *  - String body  → `{ statusCode, message: <body>, timestamp }`
 *  - Object body  → `{ ...body, statusCode, timestamp }` (keeps `code`, `email`, …)
 *  - Non-Http err → `{ statusCode: 500, message: 'Internal server error', timestamp }`
 *    + log the original.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const timestamp = new Date().toISOString();

      if (typeof body === 'string') {
        response.status(status).json({
          statusCode: status,
          message: body,
          timestamp,
        });
        return;
      }

      // Object body — class-validator returns `{ statusCode, message: string[], error }`
      // Our typed throws return `{ code, message, email?, ... }`. Both shapes are kept.
      const obj = body as Record<string, unknown>;
      const merged: Record<string, unknown> = {
        ...obj,
        statusCode: status,
        timestamp,
      };
      // Flatten array messages from class-validator for SPA convenience
      if (Array.isArray(merged.message)) {
        merged.message = (merged.message as string[]).join(', ');
      }
      response.status(status).json(merged);
      return;
    }

    this.logger.error('Unhandled exception', exception as Error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
