import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateReferralDto } from './dto/create-referral.dto';
import { CreateReferralOfferDto } from './dto/create-referral-offer.dto';
import { ReferralSearchDto } from './dto/referral-search.dto';
import { RespondToOfferDto } from './dto/respond-to-offer.dto';
import { UpdateReferralDto } from './dto/update-referral.dto';
import { ReferralService } from './referral.service';

@ApiTags('Referrals')
@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a referral' })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateReferralDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.referralService.create(user.clientProfileId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Search referrals (public)' })
  search(@Query() query: ReferralSearchDto) {
    return this.referralService.search(query);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List referrals created by the current user' })
  myReferrals(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ReferralSearchDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.referralService.getByReferrer(user.clientProfileId, query);
  }

  @Get('offers/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Offers received by the current worker' })
  myOffers(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ReferralSearchDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.referralService.getOffersForWorker(
      user.clientProfileId,
      query,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referral with offers' })
  getById(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.referralService.getById(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own open referral' })
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateReferralDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.referralService.update(id, user.clientProfileId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel own referral' })
  cancel(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.referralService.cancel(id, user.clientProfileId);
  }

  @Post(':id/offers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send offer to a worker' })
  createOffer(
    @Param('id', ParseBigIntPipe) referralId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateReferralOfferDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.referralService.createOffer(
      referralId,
      user.clientProfileId,
      dto,
    );
  }

  @Patch('offers/:offerId/respond')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept or decline a referral offer' })
  respondToOffer(
    @Param('offerId', ParseBigIntPipe) offerId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RespondToOfferDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.referralService.respondToOffer(
      offerId,
      user.clientProfileId,
      dto,
    );
  }
}
