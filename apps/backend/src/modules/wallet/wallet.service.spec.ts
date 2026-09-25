import { WalletService } from './wallet.service';
import { WalletPlatform } from '@prisma/client';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: {
    walletPass: { findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      walletPass: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new WalletService(prisma as never);
  });

  describe('issuePasses', () => {
    it('emite un pass de Apple y uno de Google para un cliente nuevo (RF-03)', async () => {
      prisma.walletPass.findMany.mockResolvedValue([]);
      prisma.walletPass.create
        .mockResolvedValueOnce({ id: 'pass-apple', platform: WalletPlatform.APPLE })
        .mockResolvedValueOnce({ id: 'pass-google', platform: WalletPlatform.GOOGLE });

      const result = await service.issuePasses('client-1');

      expect(prisma.walletPass.create).toHaveBeenCalledTimes(2);
      expect(prisma.walletPass.create).toHaveBeenCalledWith({
        data: { clientId: 'client-1', platform: WalletPlatform.APPLE, serialNumber: 'apple-client-1' },
      });
      expect(prisma.walletPass.create).toHaveBeenCalledWith({
        data: { clientId: 'client-1', platform: WalletPlatform.GOOGLE, serialNumber: 'google-client-1' },
      });
      expect(result).toEqual([
        { id: 'pass-apple', platform: WalletPlatform.APPLE },
        { id: 'pass-google', platform: WalletPlatform.GOOGLE },
      ]);
    });

    it('no duplica los passes si el cliente ya los tiene', async () => {
      const existing = [{ id: 'pass-apple' }, { id: 'pass-google' }];
      prisma.walletPass.findMany.mockResolvedValue(existing);

      const result = await service.issuePasses('client-1');

      expect(prisma.walletPass.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });
  });

  describe('pushUpdate', () => {
    it('refresca lastPushedAt de los passes del cliente (RF-05)', async () => {
      prisma.walletPass.updateMany.mockResolvedValue({ count: 2 });

      await service.pushUpdate('client-1');

      expect(prisma.walletPass.updateMany).toHaveBeenCalledWith({
        where: { clientId: 'client-1' },
        data: { lastPushedAt: expect.any(Date) },
      });
    });
  });
});
