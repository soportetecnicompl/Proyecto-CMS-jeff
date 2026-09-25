import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { ClientsModule } from '../clients/clients.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [ClientsModule, LoyaltyModule],
  controllers: [PublicController],
})
export class PublicModule {}
