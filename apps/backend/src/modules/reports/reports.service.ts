import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** RF-17: dashboard de métricas. RF-19: exportación de base de clientes. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardSummary(complexId?: string) {
    const [activeClients, totalVisits, totalRedemptions, reviewsRequested] = await Promise.all([
      this.prisma.client.count({ where: { isDeleted: false } }),
      this.prisma.visit.count({ where: complexId ? { complexId } : undefined }),
      this.prisma.redemption.count({ where: { complexId } }),
      this.prisma.whatsAppMessage.count({ where: { type: 'REVIEW_REQUEST' } }),
    ]);

    return { activeClients, totalVisits, totalRedemptions, reviewsRequested };
  }

  async exportClientsCsv() {
    const clients = await this.prisma.client.findMany({ where: { isDeleted: false } });
    const header = 'id,name,whatsapp,stamps,points,lastVisitAt\n';
    const rows = clients
      .map((c) => [c.id, c.name, c.whatsapp, c.stamps, c.points, c.lastVisitAt?.toISOString() ?? ''].join(','))
      .join('\n');
    return header + rows;
  }
}
