import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import * as fs from 'node:fs';
import { Client } from '@prisma/client';
import { LoyaltyService } from '../../loyalty/loyalty.service';

const FILLED_STAMP = '●';
const EMPTY_STAMP = '○';

const WALLET_API_BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPES = ['https://www.googleapis.com/auth/wallet_object.issuer'];

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * Integra con la Google Wallet API real: crea/actualiza la loyaltyClass y el
 * loyaltyObject del cliente, y genera el link firmado de "Guardar en Google
 * Wallet". Requiere un issuer account de Google Wallet Console y un service
 * account con el rol de Wallet Object Issuer — ver docs/wallet-integration.md.
 */
@Injectable()
export class GoogleWalletService {
  private readonly logger = new Logger(GoogleWalletService.name);
  private auth: GoogleAuth | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('GOOGLE_WALLET_ISSUER_ID') && this.config.get<string>('GOOGLE_WALLET_SERVICE_ACCOUNT_JSON'),
    );
  }

  private getServiceAccount(): ServiceAccount {
    const raw = this.config.getOrThrow<string>('GOOGLE_WALLET_SERVICE_ACCOUNT_JSON');
    // Acepta tanto la ruta a un archivo .json como el JSON inline (útil en variables de entorno de CI/CD).
    const json = raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8');
    return JSON.parse(json);
  }

  private getAuthClient(): GoogleAuth {
    if (!this.auth) {
      this.auth = new GoogleAuth({ credentials: this.getServiceAccount(), scopes: SCOPES });
    }
    return this.auth;
  }

  private async request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) {
    const client = await this.getAuthClient().getClient();
    const { token } = await client.getAccessToken();
    const res = await fetch(`${WALLET_API_BASE}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 409) {
      throw new Error(`Google Wallet API ${method} ${path} → ${res.status}: ${await res.text()}`);
    }
    return res.status === 204 ? null : res.json();
  }

  private classId(): string {
    return `${this.config.getOrThrow<string>('GOOGLE_WALLET_ISSUER_ID')}.metroclub_loyalty`;
  }

  private objectId(clientId: string): string {
    return `${this.config.getOrThrow<string>('GOOGLE_WALLET_ISSUER_ID')}.client_${clientId}`;
  }

  /** Crea la clase de lealtad "MetroClub" si todavía no existe (idempotente). */
  async ensureLoyaltyClass(): Promise<void> {
    if (!this.isConfigured()) return;

    // Google exige un logo público HTTPS para crear la clase. Placeholder hasta tener
    // el logo real de Metrocinemas hosteado (ver docs/wallet-integration.md).
    const logoUrl = this.config.get<string>(
      'GOOGLE_WALLET_LOGO_URL',
      'https://placehold.co/660x660/09142e/ffffff.png?text=MetroClub',
    );

    await this.request('POST', 'loyaltyClass', {
      id: this.classId(),
      issuerName: 'Metrocinemas',
      programName: 'MetroClub',
      programLogo: { sourceUri: { uri: logoUrl }, contentDescription: { defaultValue: { language: 'es', value: 'MetroClub' } } },
      reviewStatus: 'UNDER_REVIEW',
      hexBackgroundColor: '#09142e',
    }).catch((error) => this.logger.warn(`No se pudo crear la loyaltyClass: ${(error as Error).message}`));
  }

  /** Progreso de sellos hacia el próximo premio, para la vista principal y el detalle. */
  private async buildStampProgress(stamps: number): Promise<{ shortLabel: string; detailText: string }> {
    const { nextReward } = await this.loyaltyService.getStampProgress(stamps);

    if (!nextReward || !nextReward.stampsCost) {
      const dots = FILLED_STAMP.repeat(Math.max(stamps, 1));
      return { shortLabel: `${stamps}`, detailText: `${dots}  ¡Tienes premios listos para canjear! 🎉` };
    }

    const total = nextReward.stampsCost;
    const filled = Math.min(stamps, total);
    const dots = FILLED_STAMP.repeat(filled) + EMPTY_STAMP.repeat(Math.max(total - filled, 0));

    return {
      shortLabel: `${stamps}/${total}`,
      detailText: `${dots}  ${stamps}/${total} → ${nextReward.name}`,
    };
  }

  /** Código corto y amigable para mostrar debajo del QR (en vez del id completo del cliente). */
  private memberCode(clientId: string): string {
    return `MC-${clientId.slice(-6).toUpperCase()}`;
  }

  /** Crea/actualiza el loyaltyObject del cliente. Un PATCH aquí refleja el cambio en el pass ya guardado (RF-05). */
  async upsertLoyaltyObject(client: Pick<Client, 'id' | 'name' | 'stamps' | 'points'>): Promise<string | null> {
    if (!this.isConfigured()) {
      this.logger.warn('Google Wallet no está configurado (GOOGLE_WALLET_ISSUER_ID / _SERVICE_ACCOUNT_JSON) — se omite.');
      return null;
    }

    await this.ensureLoyaltyClass();

    const objectId = this.objectId(client.id);
    const progress = await this.buildStampProgress(client.stamps);
    const payload = {
      id: objectId,
      classId: this.classId(),
      state: 'ACTIVE',
      accountId: client.id,
      accountName: client.name,
      loyaltyPoints: { label: 'Sellos', balance: { string: progress.shortLabel } },
      secondaryLoyaltyPoints: { label: 'Puntos', balance: { int: client.points } },
      barcode: { type: 'QR_CODE', value: client.id, alternateText: this.memberCode(client.id) },
      textModulesData: [
        {
          id: 'stamp_progress',
          header: 'Progreso hacia tu próximo premio',
          body: progress.detailText,
        },
      ],
    };

    try {
      await this.request('PATCH', `loyaltyObject/${objectId}`, payload);
    } catch {
      // El objeto no existía todavía: lo creamos.
      await this.request('POST', 'loyaltyObject', payload).catch((error) =>
        this.logger.warn(`No se pudo crear/actualizar el loyaltyObject: ${(error as Error).message}`),
      );
    }

    return objectId;
  }

  /** Construye el link firmado "Guardar en Google Wallet" (JWT RS256, spec de Google). */
  buildSaveLink(objectId: string): string | null {
    if (!this.isConfigured()) return null;

    const serviceAccount = this.getServiceAccount();
    const token = jwt.sign(
      {
        iss: serviceAccount.client_email,
        aud: 'google',
        typ: 'savetowallet',
        payload: { loyaltyObjects: [{ id: objectId }] },
      },
      serviceAccount.private_key,
      { algorithm: 'RS256' },
    );

    return `https://pay.google.com/gp/v/save/${token}`;
  }
}
