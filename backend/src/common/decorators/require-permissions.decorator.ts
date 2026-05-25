import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Mark a controller/handler with permissions the caller must have.
 *
 * Semantics:
 *   - Multiple keys passed → user must have ALL of them (AND).
 *   - ADMIN role implicitly satisfies every permission (guard short-circuits).
 *   - To require ANY of N, use multiple handlers or wrap manually in service.
 *
 * Format: '<module>.<action>' — must match a row in the `permission` table.
 */
export const RequirePermissions = (...keys: string[]) =>
  SetMetadata(PERMISSIONS_KEY, keys);
