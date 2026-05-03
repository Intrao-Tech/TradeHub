import { Global, Module } from '@nestjs/common';
import { AccountStateGuard } from './guards/account-state.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Global module for cross-cutting providers used by many feature modules
 * (`AccountStateGuard`, `RolesGuard`). Marked `@Global` so feature modules
 * don't have to import this explicitly to use the guards via decorators.
 */
@Global()
@Module({
  providers: [AccountStateGuard, RolesGuard],
  exports: [AccountStateGuard, RolesGuard],
})
export class CommonModule {}
