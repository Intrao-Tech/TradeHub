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
  verificationState: AccountStatus;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;
    return data ? user?.[data] : user;
  },
);
