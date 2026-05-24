import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * Permission-based guard. Reads keys from @RequirePermissions(...) and checks
 * the JWT-resolved permission set on the request user.
 *
 * Short-circuit: ADMIN role implicitly satisfies every permission. This keeps
 * the admin from accidentally locking themselves out by editing role perms.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: CurrentUserPayload }>();
    if (!user) {
      throw new ForbiddenException({ code: 'NOT_AUTHENTICATED' });
    }
    if (user.staffRole === 'ADMIN') return true;

    const have = new Set(user.permissions ?? []);
    const missing = required.filter((p) => !have.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'MISSING_PERMISSION',
        message: `Missing permission(s): ${missing.join(', ')}`,
        missing,
      });
    }
    return true;
  }
}
