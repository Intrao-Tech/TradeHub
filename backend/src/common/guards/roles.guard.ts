import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    return requiredRoles.some((role) => {
      switch (role) {
        case 'WORKER':
          return user.isWorker;
        case 'EMPLOYER':
          return user.isEmployer;
        case 'ADMIN':
          return user.staffRole === 'ADMIN';
        case 'MODERATOR':
          return user.isStaff;
        case 'STAFF':
          return user.isStaff;
        default:
          return false;
      }
    });
  }
}
