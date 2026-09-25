import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ComplexesModule } from './modules/complexes/complexes.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ComplexesModule,
    LoyaltyModule,
    WalletModule,
    WhatsappModule,
    CampaignsModule,
    ReportsModule,
    AuditModule,
  ],
})
export class AppModule {}
