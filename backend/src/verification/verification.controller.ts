import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { VerificationService } from './verification.service';

@ApiTags('Verification')
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start identity verification (Stripe Identity)' })
  start(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile');
    }
    return this.verificationService.createSession(user.clientProfileId);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current verification status' })
  status(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile');
    }
    return this.verificationService.getStatus(user.clientProfileId);
  }
}
