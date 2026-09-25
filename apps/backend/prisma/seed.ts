import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.loyaltyRule.upsert({
    where: { id: 'default-rule' },
    update: {},
    create: {
      id: 'default-rule',
      name: 'Regla estándar MetroClub',
      stampsPerVisit: 1,
      pointsPerCurrency: 1,
      currencyUnit: 10,
    },
  });

  const rewards = [
    { id: 'reward-5-stamps', name: 'Entrada 2D gratis', stampsCost: 5 },
    { id: 'reward-8-stamps', name: 'Combo personal gratis', stampsCost: 8 },
    { id: 'reward-12-stamps', name: 'Entrada VIP o upgrade', stampsCost: 12 },
  ];

  for (const reward of rewards) {
    await prisma.reward.upsert({ where: { id: reward.id }, update: {}, create: reward });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
