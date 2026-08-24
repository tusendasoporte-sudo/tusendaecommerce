import { normalizePromoCmsDocument } from './promoCms.ts';

type JsonRecord = Record<string, any>;

export class PromoLandingQrError extends Error {
  readonly code: string;

  constructor(code = 'promo_landing_qr_unavailable') {
    super('No se pudo actualizar el puente Landing QR.');
    this.name = 'PromoLandingQrError';
    this.code = code;
  }
}

function fail(code = 'invalid_payload'): never {
  throw new PromoLandingQrError(code);
}

export function buildPromoLandingQrDocument(value: unknown, enabled: boolean): JsonRecord {
  if (typeof enabled !== 'boolean') fail();
  const document = normalizePromoCmsDocument(value);
  document.adapters.landing_qr_link.enabled = enabled;
  return document;
}

export function promoLandingQrErrorMessage(code: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    session_revoked: 'Tu sesión ya no está vigente. Vuelve a iniciar sesión.',
    blocked_by_plan: 'El plan actual bloquea la gestión de este sitio.',
    promo_capability_denied: 'El puente Landing QR no está disponible en el plan actual.',
    promo_permission_denied: 'Tu sesión no tiene permiso para gestionar el puente Landing QR.',
    invalid_origin: 'La solicitud no proviene del panel administrativo.',
    promo_draft_conflict: 'El borrador cambió en otra sesión. Recárgalo antes de guardar.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
