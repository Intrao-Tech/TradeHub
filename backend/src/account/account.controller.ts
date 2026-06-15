import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AccountService } from './account.service';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AddRoleDto } from './dto/add-role.dto';

@ApiTags('Account')
@Controller('account')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current account with profiles' })
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.accountService.getMe(user.accountId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update phone / phone_verified' })
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountService.updateAccount(user.accountId, dto);
  }

  @Post('me/roles')
  @ApiOperation({
    summary:
      'Add the second marketplace role (worker/employer) to the current account',
  })
  addRole(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AddRoleDto,
  ) {
    return this.accountService.addRole(user.accountId, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Deactivate current account' })
  deactivateMe(@CurrentUser() user: CurrentUserPayload) {
    return this.accountService.deactivateAccount(user.accountId);
  }
}
