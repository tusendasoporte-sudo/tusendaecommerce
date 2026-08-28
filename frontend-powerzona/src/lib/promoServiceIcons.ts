export const PROMO_SERVICE_ICON_OPTIONS = Object.freeze([
  Object.freeze({ key: 'carpet', label: 'Alfombra' }),
  Object.freeze({ key: 'flooring', label: 'Pisos' }),
  Object.freeze({ key: 'stairs', label: 'Escaleras' }),
  Object.freeze({ key: 'finishing', label: 'Acabados' }),
  Object.freeze({ key: 'upholstery', label: 'Tapicería' }),
  Object.freeze({ key: 'cleaning', label: 'Limpieza' }),
  Object.freeze({ key: 'installation', label: 'Instalación' }),
  Object.freeze({ key: 'commercial', label: 'Comercial' }),
] as const);

export type PromoServiceIconKey = (typeof PROMO_SERVICE_ICON_OPTIONS)[number]['key'];

const PROMO_SERVICE_ICON_KEY_SET = new Set<string>(
  PROMO_SERVICE_ICON_OPTIONS.map((option) => option.key),
);

export function isPromoServiceIconKey(value: unknown): value is PromoServiceIconKey {
  return typeof value === 'string' && PROMO_SERVICE_ICON_KEY_SET.has(value);
}
