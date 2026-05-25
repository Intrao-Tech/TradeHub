import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { ApprovalEngineService } from './approval-engine.service';
import { ApprovalRulesService } from './approval-rules.service';
import { ApprovalRulesController } from './approval-rules.controller';
import { ApprovalsController } from './approvals.controller';
import { AdminActionsService } from './admin-actions.service';
import { AdminActionsController } from './admin-actions.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { SlaService } from './sla.service';
import { SlaController } from './sla.controller';
import { SlaJob } from './sla.job';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  imports: [AuditModule, NotificationModule],
  controllers: [
    ApprovalRulesController,
    ApprovalsController,
    AdminActionsController,
    AdminUsersController,
    AdminDashboardController,
    SlaController,
    RolesController,
  ],
  providers: [
    ApprovalEngineService,
    ApprovalRulesService,
    AdminActionsService,
    AdminUsersService,
    AdminDashboardService,
    SlaService,
    SlaJob,
    RolesService,
    PermissionsGuard,
  ],
  exports: [
    ApprovalEngineService,
    AdminActionsService,
    SlaService,
    RolesService,
    PermissionsGuard,
  ],
})
export class AdminModule {}
