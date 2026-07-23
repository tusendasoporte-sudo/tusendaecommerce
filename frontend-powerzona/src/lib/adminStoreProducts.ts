export type VariationEffectiveStatus = Readonly<{
  effective_status: 'active' | 'hidden_expired' | 'hidden_manual' | 'disabled_by_parent_mode';
  effective_status_label: string;
  effective_status_reason: string;
  can_activate: boolean;
  expired: boolean;
  effective_expiration_date: string;
}>;

export type ProductEffectiveStatus = Readonly<{
  effective_status: 'visible' | 'expired' | 'hidden';
  effective_status_label: 'VISIBLE' | 'VENCIDO' | 'OCULTO';
  effective_status_reason: string;
  manual_active: boolean;
  effective_visible: boolean;
  can_activate: boolean;
  expired: boolean;
  expiration_date: string;
}>;

type ProductRecord = Record<string, unknown>;

function bool(value: unknown) {
  return value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
}

function active(record: ProductRecord | null | undefined) {
  const value = record?.active;
  return value === undefined || value === null || value === '' ? true : bool(value);
}

export function isRecordManuallyActive(record: ProductRecord | null | undefined) {
  return active(record);
}

export function civilDate(value: unknown) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const candidate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (candidate.getUTCFullYear() !== Number(match[1])
    || candidate.getUTCMonth() !== Number(match[2]) - 1
    || candidate.getUTCDate() !== Number(match[3])) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function todayCivilDate(now: Date | string | number = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
}

export function productUsesVariations(product: ProductRecord | null | undefined) {
  return bool(product?.has_variations);
}

export function getEffectiveProductStatus(
  product: ProductRecord,
  now: Date | string | number = new Date(),
): ProductEffectiveStatus {
  const manualActive = active(product);
  const expirationDate = civilDate(product?.expiration_date);
  const expired = !productUsesVariations(product)
    && Boolean(expirationDate && expirationDate <= todayCivilDate(now));
  if (!manualActive) {
    return {
      effective_status: 'hidden',
      effective_status_label: 'OCULTO',
      effective_status_reason: expired ? 'manual_and_expired' : 'manual_hidden',
      manual_active: false,
      effective_visible: false,
      can_activate: !expired,
      expired,
      expiration_date: expirationDate,
    };
  }
  if (expired) {
    return {
      effective_status: 'expired',
      effective_status_label: 'VENCIDO',
      effective_status_reason: 'expiration_date_passed',
      manual_active: true,
      effective_visible: false,
      can_activate: false,
      expired: true,
      expiration_date: expirationDate,
    };
  }
  return {
    effective_status: 'visible',
    effective_status_label: 'VISIBLE',
    effective_status_reason: productUsesVariations(product) ? 'variation_container_active' : 'available_by_status',
    manual_active: true,
    effective_visible: true,
    can_activate: true,
    expired: false,
    expiration_date: expirationDate,
  };
}

export function getProductEditorVisibilityState(
  product: ProductRecord,
  canManageVisibility = true,
  expirationEnabled = true,
  now: Date | string | number = new Date(),
) {
  const effective = getEffectiveProductStatus(product, now);
  const blockedByExpiration = expirationEnabled === true
    && effective.expired
    && !productUsesVariations(product);
  return {
    ...effective,
    checked: blockedByExpiration ? false : effective.manual_active,
    disabled: canManageVisibility !== true || blockedByExpiration,
    blocked_by_expiration: blockedByExpiration,
  } as const;
}

export function formatCivilDate(value: unknown) {
  const normalized = civilDate(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

export function effectiveVariationExpirationDate(
  product: ProductRecord,
  variation: ProductRecord,
  variations: ProductRecord[],
) {
  const activeOwned = variations.filter((item) => String(item?.product || '') === String(product?.id || '') && active(item));
  const usesIndividualDates = activeOwned.some((item) => Boolean(civilDate(item.expiration_date)));
  return usesIndividualDates ? civilDate(variation.expiration_date) : civilDate(product.expiration_date);
}

export function getVariationEffectiveStatus(
  product: ProductRecord,
  variation: ProductRecord,
  variations: ProductRecord[] = [],
  now: Date | string | number = new Date(),
): VariationEffectiveStatus {
  const ownDate = civilDate(variation.expiration_date);
  const effectiveDate = active(variation)
    ? effectiveVariationExpirationDate(product, variation, variations)
    : (ownDate || effectiveVariationExpirationDate(product, variation, variations));
  const expired = Boolean(effectiveDate && effectiveDate <= todayCivilDate(now));
  if (!productUsesVariations(product)) {
    return {
      effective_status: 'disabled_by_parent_mode',
      effective_status_label: 'Conservada',
      effective_status_reason: 'parent_variations_disabled',
      can_activate: false,
      expired,
      effective_expiration_date: effectiveDate,
    };
  }
  if (!active(variation)) {
    return {
      effective_status: 'hidden_manual',
      effective_status_label: 'Oculta',
      effective_status_reason: expired ? 'manual_and_expired' : 'manual_hidden',
      can_activate: !expired,
      expired,
      effective_expiration_date: effectiveDate,
    };
  }
  if (expired) {
    return {
      effective_status: 'hidden_expired',
      effective_status_label: 'Vencida',
      effective_status_reason: 'expiration_date_passed',
      can_activate: false,
      expired: true,
      effective_expiration_date: effectiveDate,
    };
  }
  return {
    effective_status: 'active',
    effective_status_label: 'Activa',
    effective_status_reason: 'available_by_status',
    can_activate: true,
    expired: false,
    effective_expiration_date: effectiveDate,
  };
}

export function getVariationEditorVisibilityState(
  product: ProductRecord,
  variation: ProductRecord,
  variations: ProductRecord[] = [],
  canManageVisibility = true,
  expirationEnabled = true,
  now: Date | string | number = new Date(),
) {
  const effective = getVariationEffectiveStatus(product, variation, variations, now);
  const blockedByExpiration = expirationEnabled === true && effective.expired;
  const blockedByMode = effective.effective_status === 'disabled_by_parent_mode';
  return {
    ...effective,
    checked: blockedByExpiration || blockedByMode ? false : active(variation),
    disabled: canManageVisibility !== true || blockedByExpiration || blockedByMode,
    blocked_by_expiration: blockedByExpiration,
    blocked_by_mode: blockedByMode,
  } as const;
}

export function variationUnitPrice(variation: ProductRecord) {
  const regular = Math.max(0, Number(variation?.price_usd ?? variation?.precio_usd ?? 0));
  const offer = Math.max(0, Number(variation?.offer_price_usd ?? 0));
  return bool(variation?.is_offer) && offer > 0 && offer < regular ? offer : regular;
}

export function getSellableProductVariations(product: ProductRecord, variations: ProductRecord[], now = new Date()) {
  if (!productUsesVariations(product) || !active(product)) return [];
  return variations.filter((variation) => {
    if (String(variation?.product || '') !== String(product?.id || '')) return false;
    if (getVariationEffectiveStatus(product, variation, variations, now).effective_status !== 'active') return false;
    if (!(variationUnitPrice(variation) > 0)) return false;
    if (product?.track_stock === false) return true;
    return Math.max(0, Number(variation?.stock || 0)) > 0 || bool(variation?.allow_preorder);
  });
}
