import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletPlatform } from '@prisma/client';

/**
 * Integra con Apple PassKit y Google Wallet API.
 * La emisión/actualización real de passes se implementa en la Fase 1
 * (RF-03, RF-05); aquí se deja el contrato de servicio y la persistencia
 * de metadatos del pass.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  async issuePasses(clientId: string) {
    const existing = await this.prisma.walletPass.findMany({ where: { clientId } });
    if (existing.length > 0) {
      return existing;
    }

    return this.prisma.$transaction([
      this.prisma.walletPass.create({
        data: {
          clientId,
          platform: WalletPlatform.APPLE,
          serialNumber: `apple-${clientId}`,
        },
      }),
      this.prisma.walletPass.create({
        data: {
          clientId,
          platform: WalletPlatform.GOOGLE,
          serialNumber: `google-${clientId}`,
        },
      }),
    ]);
  }

  async pushUpdate(clientId: string) {
    // TODO: enviar push de actualización (APNs / Google Wallet callback) al cambiar sellos/puntos.
    this.logger.debug(`Wallet passes actualizados para el cliente ${clientId}`);
    await this.prisma.walletPass.updateMany({
      where: { clientId },
      data: { lastPushedAt: new Date() },
    });
  }
}
