import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { ApplePassService } from './apple/apple-pass.service';
import { ApplePushService } from './apple/apple-push.service';
import { AppleWebServiceController } from './apple/apple-web-service.controller';
import { GoogleWalletService } from './google/google-wallet.service';

@Module({
  controllers: [WalletController, AppleWebServiceController],
  providers: [WalletService, ApplePassService, ApplePushService, GoogleWalletService],
  exports: [WalletService],
})
export class WalletModule {}
