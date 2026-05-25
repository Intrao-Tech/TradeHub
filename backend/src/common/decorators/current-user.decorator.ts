import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AccountStatus =
  | 'PENDING_EMAIL_VERIFICATION'
  | 'ACTIVE'
  | 'DEACTIVATED';

export interface CurrentUserPayload {
  accountId: bigint;
  email: string;
  clientProfileId: bigint | null;
  isWorker: boolean;
  isEmployer: boolean;
  isStaff: boolean;
  staffRole: string | null;
  /**
   * All permission keys this user has across all assigned staff roles.
   * Empty for non-staff. ADMIN role implicitly grants every permission,
   * but we also resolve the explicit grants for read access in admin UI.
   */
  permissions: string[];
  verificationState: AccountStatus;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: CurrentUserPayload }>();
    const user = request.user as CurrentUserPayload;
    return data ? user?.[data] : user;
  },
);
