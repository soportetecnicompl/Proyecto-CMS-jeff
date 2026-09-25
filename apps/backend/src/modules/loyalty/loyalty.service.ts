import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedemptionStatus } from '@prisma/client';

/** Aplica reglas de lealtad y gestiona premios configurables (RF-06 a RF-10). */
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveRule() {
    const rule = await this.prisma.loyaltyRule.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!rule) {
      throw new NotFoundException('No hay una regla de lealtad activa configurada');
    }
    return rule;
  }

  /** Calcula sellos y puntos ganados en una visita según la regla activa. */
  async calculateEarnings(amountSpent = 0) {
    const rule = await this.getActiveRule();
    const currencyUnit = Number(rule.currencyUnit) || 1;
    const pointsEarned = Math.floor((amountSpent / currencyUnit) * Number(rule.pointsPerCurrency));

    return { stampsEarned: rule.stampsPerVisit, pointsEarned };
  }

  listRewards() {
    return this.prisma.reward.findMany({ where: { isActive: true } });
  }

  listRules() {
    return this.prisma.loyaltyRule.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** RF-10: canje de un premio; valida que el cliente tenga sellos/puntos suficientes. */
  async redeemReward(clientId: string, rewardId: string, complexId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const [client, reward] = await Promise.all([
        tx.client.findUniqueOrThrow({ where: { id: clientId } }),
        tx.reward.findUniqueOrThrow({ where: { id: rewardId } }),
      ]);

      if (reward.stampsCost && client.stamps < reward.stampsCost) {
        throw new BadRequestException('Sellos insuficientes para este premio');
      }
      if (reward.pointsCost && client.points < reward.pointsCost) {
        throw new BadRequestException('Puntos insuficientes para este premio');
      }

      await tx.client.update({
        where: { id: clientId },
        data: {
          stamps: { decrement: reward.stampsCost ?? 0 },
          points: { decrement: reward.pointsCost ?? 0 },
        },
      });

      return tx.redemption.create({
        data: {
          clientId,
          rewardId,
          complexId,
          status: RedemptionStatus.REDEEMED,
          redeemedAt: new Date(),
        },
      });
    });
  }
}
