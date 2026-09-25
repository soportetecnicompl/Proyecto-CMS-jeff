import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoyaltyService } from './loyalty.service';
import { RedeemRewardDto } from './dto/redeem-reward.dto';

@UseGuards(JwtAuthGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('rules')
  listRules() {
    return this.loyaltyService.listRules();
  }

  @Get('rewards')
  listRewards() {
    return this.loyaltyService.listRewards();
  }

  @Post('redemptions')
  redeem(@Body() dto: RedeemRewardDto) {
    return this.loyaltyService.redeemReward(dto.clientId, dto.rewardId, dto.complexId);
  }
}
