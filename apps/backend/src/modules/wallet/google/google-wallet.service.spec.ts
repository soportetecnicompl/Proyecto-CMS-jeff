import { GoogleWalletService } from './google-wallet.service';

describe('GoogleWalletService', () => {
  const buildConfig = (values: Record<string, string | undefined>) => ({
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (!value) throw new Error(`Falta la variable ${key}`);
      return value;
    }),
  });

  const client = { id: 'client-1', name: 'Ana', stamps: 3, points: 40 };

  it('isConfigured() es false sin GOOGLE_WALLET_ISSUER_ID / _SERVICE_ACCOUNT_JSON', () => {
    const service = new GoogleWalletService(buildConfig({}) as never);
    expect(service.isConfigured()).toBe(false);
  });

  it('isConfigured() es true con ambas variables presentes', () => {
    const service = new GoogleWalletService(
      buildConfig({ GOOGLE_WALLET_ISSUER_ID: '3388000000022', GOOGLE_WALLET_SERVICE_ACCOUNT_JSON: '{}' }) as never,
    );
    expect(service.isConfigured()).toBe(true);
  });

  it('upsertLoyaltyObject() no falla y devuelve null si Google Wallet no está configurado', async () => {
    const service = new GoogleWalletService(buildConfig({}) as never);

    const result = await service.upsertLoyaltyObject(client);

    expect(result).toBeNull();
  });

  it('buildSaveLink() devuelve null si Google Wallet no está configurado', () => {
    const service = new GoogleWalletService(buildConfig({}) as never);

    expect(service.buildSaveLink('object-1')).toBeNull();
  });
});
