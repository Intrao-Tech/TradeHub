import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

const REQUIRES_VERIFIED_KEY = 'requires_verified_email';

/**
 * Apply to controllers or methods that require an account in `ACTIVE` state.
 * Routes annotated with this decorator return `403 EMAIL_NOT_VERIFIED` for
 * `PENDING_EMAIL_VERIFICATION` accounts and `403 ACCOUNT_DEACTIVATED` for
 * `DEACTIVATED` accounts (the latter never even reaches the guard because
 * `JwtStrategy.validate` throws first; included for defence in depth).
 *
 * Use ALONGSIDE `JwtAuthGuard`, never instead of it.
 */
export const RequiresVerifiedEmail = () =>
  SetMetadata(REQUIRES_VERIFIED_KEY, true);

@Injectable()
export class AccountStateGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_VERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: CurrentUserPayload }>();
    const user = request.user;
    if (!user) {
      // Should be impossible if JwtAuthGuard ran first, but fail safe.
      throw new ForbiddenException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }

    if (user.verificationState === 'DEACTIVATED') {
      throw new ForbiddenException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated.',
      });
    }

    if (user.verificationState !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Please verify your email address before performing this action.',
      });
    }

    return true;
  }
}
