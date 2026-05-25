import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JwtAuthGuard variant that does NOT throw when the bearer token is missing
 * or invalid — req.user is left undefined instead. Used by routes that are
 * publicly accessible but want to use the caller's identity when present
 * (e.g. attachment download where job-post attachments are public but
 * application attachments need the caller to authenticate).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<T>(_err: unknown, user: T): T | null {
    return user ?? null;
  }
}
