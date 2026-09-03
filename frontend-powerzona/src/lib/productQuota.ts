export const PRODUCT_QUOTA_CATALOG_CONTRACT = 'tusenda84.commercial-plan-catalog.v1' as const;

export const PRODUCT_QUOTA_STATES = [
  'available',
  'near_limit',
  'limit_reached',
  'over_limit',
  'unavailable',
] as const;

export type ProductQuotaState = (typeof PRODUCT_QUOTA_STATES)[number];
export type ProductQuotaPlan = 'free' | 'basic' | 'premium';

export type ProductQuota = Readonly<{
  catalog_contract: typeof PRODUCT_QUOTA_CATALOG_CONTRACT;
  store_type: 'ecommerce';
  plan: ProductQuotaPlan | null;
  used: number;
  limit: number | null;
  remaining: number | null;
  over_by: number | null;
  percentage: number | null;
  state: ProductQuotaState;
  can_create: boolean;
}>;

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function finiteNonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function plan(value: unknown): ProductQuotaPlan | null {
  return value === 'free' || value === 'basic' || value === 'premium' ? value : null;
}

export function normalizeProductQuota(value: unknown): ProductQuota | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.catalog_contract !== PRODUCT_QUOTA_CATALOG_CONTRACT
    || input.store_type !== 'ecommerce'
    || !PRODUCT_QUOTA_STATES.includes(input.state as ProductQuotaState)) return null;

  const used = nonNegativeInteger(input.used);
  if (used === null) return null;
  const normalizedPlan = plan(input.plan);
  if (input.state === 'unavailable') {
    if (input.limit !== null || input.remaining !== null || input.over_by !== null || input.percentage !== null
      || input.can_create !== false) return null;
    return Object.freeze({
      catalog_contract: PRODUCT_QUOTA_CATALOG_CONTRACT,
      store_type: 'ecommerce',
      plan: normalizedPlan,
      used,
      limit: null,
      remaining: null,
      over_by: null,
      percentage: null,
      state: 'unavailable',
      can_create: false,
    });
  }

  const limit = nonNegativeInteger(input.limit);
  const remaining = nonNegativeInteger(input.remaining);
  const overBy = nonNegativeInteger(input.over_by);
  const percentage = finiteNonNegative(input.percentage);
  if (!normalizedPlan || limit === null || limit <= 0 || remaining === null || overBy === null || percentage === null) return null;
  const expectedState: ProductQuotaState = used > limit
    ? 'over_limit'
    : used === limit
      ? 'limit_reached'
      : used >= Math.ceil(limit * 0.8)
        ? 'near_limit'
        : 'available';
  const expectedPercentage = Math.round((used / limit) * 10000) / 100;
  if (input.state !== expectedState
    || input.can_create !== (used < limit)
    || remaining !== Math.max(0, limit - used)
    || overBy !== Math.max(0, used - limit)
    || percentage !== expectedPercentage) return null;
  return Object.freeze({
    catalog_contract: PRODUCT_QUOTA_CATALOG_CONTRACT,
    store_type: 'ecommerce',
    plan: normalizedPlan,
    used,
    limit,
    remaining,
    over_by: overBy,
    percentage,
    state: expectedState,
    can_create: used < limit,
  });
}

export function productQuotaLabel(quota: ProductQuota | null) {
  if (!quota || quota.limit === null) return 'Cupo de productos no disponible';
  return `${quota.used} de ${quota.limit} productos`;
}

export function productQuotaMessage(quota: ProductQuota | null) {
  if (!quota || quota.state === 'unavailable') {
    return 'No se pudo verificar el límite del plan. Las nuevas creaciones permanecen bloqueadas; los productos existentes se pueden editar.';
  }
  if (quota.state === 'over_limit') {
    return `La tienda está ${quota.over_by} ${quota.over_by === 1 ? 'producto' : 'productos'} por encima del límite. No se modificó el catálogo existente; elimina productos o cambia de plan para volver a crear.`;
  }
  if (quota.state === 'limit_reached') {
    return 'Límite alcanzado. Elimina un producto o cambia de plan para crear otro; las ediciones existentes siguen disponibles.';
  }
  if (quota.state === 'near_limit') {
    return `Quedan ${quota.remaining} ${quota.remaining === 1 ? 'producto disponible' : 'productos disponibles'} antes de alcanzar el límite.`;
  }
  return `Quedan ${quota.remaining} ${quota.remaining === 1 ? 'producto disponible' : 'productos disponibles'} en el plan actual.`;
}
