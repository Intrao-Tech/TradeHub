import {
  Injectable,
  Logger,
  type NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

/**
 * Gates the staff login endpoint at the host level (AUTH-016-002).
 *
 * Two acceptance paths (either is enough to pass):
 *   1. The browser-set `Origin` header matches `STAFF_FRONTEND_URL`.
 *      This is what the SPA POST always provides — it's the right
 *      identity for "request comes from the staff surface."
 *   2. The `Host` header matches `STAFF_LOGIN_HOST`. Useful for non-browser
 *      clients (curl with `--resolve`) and for hosting setups where the
 *      backend is reverse-proxied per subdomain.
 *
 * Implemented as middleware (not a guard) so the rejection happens before
 * route matching — guards only run after the handler is resolved.
 */
@Injectable()
export class StaffHostMiddleware implements NestMiddleware {
  private readonly logger = new Logger(StaffHostMiddleware.name);
  private readonly expectedHost: string;
  private readonly expectedOrigin: string;

  constructor(config: ConfigService) {
    this.expectedHost = (
      config.get<string>('STAFF_LOGIN_HOST') || ''
    ).toLowerCase();
    const staffFrontend = config.get<string>('STAFF_FRONTEND_URL') || '';
    this.expectedOrigin = (() => {
      if (!staffFrontend) return '';
      try {
        return new URL(staffFrontend).origin.toLowerCase();
      } catch {
        return '';
      }
    })();
  }

  use(req: Request, _res: Response, next: NextFunction) {
    if (!this.expectedHost && !this.expectedOrigin) {
      // No gating configured — debug only, behaves as before.
      return next();
    }

    const headerOrigin = (req.headers.origin || '').toLowerCase();
    if (this.expectedOrigin && headerOrigin === this.expectedOrigin) {
      return next();
    }

    const headerHost = (req.headers.host || '').toLowerCase();
    const bareHost = headerHost.split(':')[0];
    if (this.expectedHost && bareHost === this.expectedHost) {
      return next();
    }

    this.logger.warn(
      `Staff endpoint rejected: origin=${headerOrigin || '∅'} host=${headerHost || '∅'} expectedOrigin=${this.expectedOrigin || '∅'} expectedHost=${this.expectedHost || '∅'}`,
    );
    throw new NotFoundException();
  }
}
