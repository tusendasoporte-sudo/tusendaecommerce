export const COMMERCIAL_PLAN_CATALOG_CONTRACT = 'tusenda84.commercial-plan-catalog.v1' as const;

export type CommercialStoreTypeCode = 'promotional' | 'ecommerce';
export type CommercialStorageCode = 'promo' | 'commerce';
export type CommercialPlanCode = 'free' | 'basic' | 'premium';

export type CommercialPlanPeriod = Readonly<{
  months: number;
  monthly_equivalent_cup: number;
  total_cup: number;
  savings_cup: number;
  savings_percent: number;
}>;

export type CommercialPlanPricing = Readonly<{
  currency: 'CUP';
  trial: Readonly<{ days: number; total_cup: number; one_time_per_store: boolean }> | null;
  periods: readonly CommercialPlanPeriod[];
}>;

export type CommercialPlanCapabilities = Readonly<Record<string, boolean | number | readonly string[]>>;

export type CommercialPlanDefinition = Readonly<{
  code: CommercialPlanCode;
  name: string;
  store_type: CommercialStoreTypeCode;
  duration: Readonly<{
    kind: 'fixed_days' | 'calendar_months';
    days: number | null;
    min_months: number;
    max_months: number;
    allowed_months: readonly number[];
  }>;
  pricing: CommercialPlanPricing;
  supports_permanent: boolean;
  capabilities: CommercialPlanCapabilities;
}>;

export type CommercialStoreTypeDefinition = Readonly<{
  code: CommercialStoreTypeCode;
  storage_code: CommercialStorageCode;
  name: string;
  plans: readonly CommercialPlanDefinition[];
}>;

export type CommercialOptionalCapability = Readonly<{
  key: string;
  name: string;
  allocation: string;
  controlled_by: string;
  enabled_by_default: boolean;
  setting_collection: string;
  eligible_store_types: readonly CommercialStoreTypeCode[];
  eligible_plans: readonly CommercialPlanCode[];
}>;

export type CommercialPlanCatalog = Readonly<{
  contract: typeof COMMERCIAL_PLAN_CATALOG_CONTRACT;
  version: 1;
  currency: Readonly<{ code: 'CUP'; decimals: number }>;
  commercial_period_months: readonly number[];
  store_types: readonly CommercialStoreTypeDefinition[];
  optional_capabilities: readonly CommercialOptionalCapability[];
}>;

export type CommercialPlanCatalogRequest = Readonly<{
  available: boolean;
  status: number;
  error: string;
  data: CommercialPlanCatalog | null;
}>;

const REQUEST_TIMEOUT_MS = 12000;
const CONTRACT_PERIODS = Object.freeze([1, 6, 12]);
const STORE_TYPE_SCHEMA = Object.freeze({
  promotional: Object.freeze({ storageCode: 'promo', planCodes: Object.freeze(['free', 'basic']) }),
  ecommerce: Object.freeze({ storageCode: 'commerce', planCodes: Object.freeze(['free', 'basic', 'premium']) }),
});

const PROMOTIONAL_BOOLEAN_CAPABILITIES = Object.freeze([
  'admin_panel_enabled', 'promotional_catalog_enabled', 'reviews_management_enabled',
  'contacts_management_enabled', 'promo_site_enabled', 'publish_enabled', 'custom_domain_enabled',
  'theme_customization_enabled', 'multilanguage_enabled', 'language_selector_enabled',
  'video_enabled', 'analytics_enabled', 'landing_qr_bridge_enabled',
]);
const PROMOTIONAL_NUMERIC_CAPABILITIES = Object.freeze([
  'max_services', 'max_locales', 'max_videos', 'max_storage_bytes', 'max_total_images',
]);
const ECOMMERCE_BOOLEAN_CAPABILITIES = Object.freeze([
  'categories_enabled', 'subcategories_enabled', 'admin_android_app_enabled',
  'customer_android_app_enabled', 'raffles_enabled', 'security_enabled', 'landing_qr_enabled',
  'product_expiration_tools_enabled', 'push_campaigns_enabled',
]);
const ECOMMERCE_NUMERIC_CAPABILITIES = Object.freeze([
  'max_products', 'max_active_users', 'max_devices_per_user', 'max_store_devices', 'max_product_images',
]);

function text(value: unknown, maximum = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function nonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sameNumbers(value: unknown, expected: readonly number[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => Number.isSafeInteger(item) && item === expected[index]);
}

function exactKeys(value: unknown, expected: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as object).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function normalizeCapabilities(value: unknown, storeType: CommercialStoreTypeCode): CommercialPlanCapabilities | null {
  const booleanKeys = storeType === 'promotional' ? PROMOTIONAL_BOOLEAN_CAPABILITIES : ECOMMERCE_BOOLEAN_CAPABILITIES;
  const numericKeys = storeType === 'promotional' ? PROMOTIONAL_NUMERIC_CAPABILITIES : ECOMMERCE_NUMERIC_CAPABILITIES;
  const extraKeys = storeType === 'promotional' ? ['image_limit_includes'] : [];
  if (!exactKeys(value, [...booleanKeys, ...numericKeys, ...extraKeys])) return null;
  const input = value as Record<string, unknown>;
  if (booleanKeys.some((key) => typeof input[key] !== 'boolean')) return null;
  if (numericKeys.some((key) => nonNegativeInteger(input[key]) === null)) return null;
  if (storeType === 'promotional' && (!Array.isArray(input.image_limit_includes)
    || input.image_limit_includes.some((item) => !text(item, 60)))) return null;
  return Object.freeze(Object.fromEntries(Object.entries(input).map(([key, item]) => [
    key,
    Array.isArray(item) ? Object.freeze(item.map((entry) => text(entry, 60))) : item,
  ])));
}

function normalizePricing(value: unknown, allowedMonths: readonly number[]): CommercialPlanPricing | null {
  if (!exactKeys(value, ['currency', 'trial', 'periods'])) return null;
  const input = value as Record<string, unknown>;
  if (input.currency !== 'CUP' || !Array.isArray(input.periods)) return null;

  if (input.trial !== null) {
    if (!exactKeys(input.trial, ['days', 'total_cup', 'one_time_per_store']) || input.periods.length !== 0) return null;
    const trial = input.trial as Record<string, unknown>;
    const days = nonNegativeInteger(trial.days);
    const total = nonNegativeInteger(trial.total_cup);
    if (!days || total === null || typeof trial.one_time_per_store !== 'boolean') return null;
    return Object.freeze({
      currency: 'CUP',
      trial: Object.freeze({ days, total_cup: total, one_time_per_store: trial.one_time_per_store }),
      periods: Object.freeze([]),
    });
  }

  if (!sameNumbers(input.periods.map((period: any) => period?.months), allowedMonths)) return null;
  const periods: CommercialPlanPeriod[] = [];
  for (const raw of input.periods) {
    if (!exactKeys(raw, ['months', 'monthly_equivalent_cup', 'total_cup', 'savings_cup', 'savings_percent'])) return null;
    const period = raw as Record<string, unknown>;
    const months = nonNegativeInteger(period.months);
    const monthly = nonNegativeInteger(period.monthly_equivalent_cup);
    const total = nonNegativeInteger(period.total_cup);
    const savings = nonNegativeInteger(period.savings_cup);
    const savingsPercent = nonNegativeNumber(period.savings_percent);
    if (!months || monthly === null || total === null || savings === null || savingsPercent === null
      || total !== monthly * months) return null;
    periods.push(Object.freeze({
      months,
      monthly_equivalent_cup: monthly,
      total_cup: total,
      savings_cup: savings,
      savings_percent: savingsPercent,
    }));
  }
  return Object.freeze({ currency: 'CUP', trial: null, periods: Object.freeze(periods) });
}

function normalizePlan(
  value: unknown,
  storeType: CommercialStoreTypeCode,
  allowedCodes: readonly string[],
  commercialPeriods: readonly number[],
): CommercialPlanDefinition | null {
  if (!exactKeys(value, ['code', 'name', 'store_type', 'duration', 'pricing', 'supports_permanent', 'capabilities'])) return null;
  const input = value as Record<string, any>;
  const code = text(input.code, 40) as CommercialPlanCode;
  if (!allowedCodes.includes(code) || input.store_type !== storeType || !text(input.name)) return null;
  if (!exactKeys(input.duration, ['kind', 'days', 'min_months', 'max_months', 'allowed_months'])) return null;
  const durationKind = input.duration.kind;
  if (!['fixed_days', 'calendar_months'].includes(durationKind)) return null;
  const expectedMonths = durationKind === 'calendar_months' ? commercialPeriods : [];
  if (!sameNumbers(input.duration.allowed_months, expectedMonths)) return null;
  const days = input.duration.days === null ? null : nonNegativeInteger(input.duration.days);
  const minMonths = nonNegativeInteger(input.duration.min_months);
  const maxMonths = nonNegativeInteger(input.duration.max_months);
  if (days === null && input.duration.days !== null || minMonths === null || maxMonths === null) return null;
  if (durationKind === 'fixed_days' && (!days || minMonths !== 0 || maxMonths !== 0)) return null;
  if (durationKind === 'calendar_months' && (days !== null || minMonths !== commercialPeriods[0]
    || maxMonths !== commercialPeriods.at(-1))) return null;
  const pricing = normalizePricing(input.pricing, expectedMonths);
  const capabilities = normalizeCapabilities(input.capabilities, storeType);
  if (!pricing || !capabilities || typeof input.supports_permanent !== 'boolean') return null;
  if ((durationKind === 'fixed_days') !== (pricing.trial !== null)) return null;
  return Object.freeze({
    code,
    name: text(input.name),
    store_type: storeType,
    duration: Object.freeze({
      kind: durationKind,
      days,
      min_months: minMonths,
      max_months: maxMonths,
      allowed_months: Object.freeze([...expectedMonths]),
    }),
    pricing,
    supports_permanent: input.supports_permanent,
    capabilities,
  });
}

function normalizeStoreType(value: unknown, commercialPeriods: readonly number[]): CommercialStoreTypeDefinition | null {
  if (!exactKeys(value, ['code', 'storage_code', 'name', 'plans'])) return null;
  const input = value as Record<string, any>;
  const code = text(input.code, 40) as CommercialStoreTypeCode;
  if (!(code in STORE_TYPE_SCHEMA) || !text(input.name) || !Array.isArray(input.plans)) return null;
  const schema = STORE_TYPE_SCHEMA[code];
  if (input.storage_code !== schema.storageCode || input.plans.length !== schema.planCodes.length) return null;
  const plans = input.plans.map((plan: unknown) => normalizePlan(plan, code, schema.planCodes, commercialPeriods));
  if (plans.some((plan: CommercialPlanDefinition | null) => !plan)
    || schema.planCodes.some((planCode) => !plans.some((plan: CommercialPlanDefinition | null) => plan?.code === planCode))) return null;
  return Object.freeze({
    code,
    storage_code: schema.storageCode as CommercialStorageCode,
    name: text(input.name),
    plans: Object.freeze(plans as CommercialPlanDefinition[]),
  });
}

function normalizeOptionalCapability(value: unknown): CommercialOptionalCapability | null {
  if (!exactKeys(value, [
    'key', 'name', 'allocation', 'controlled_by', 'enabled_by_default', 'setting_collection',
    'eligible_store_types', 'eligible_plans',
  ])) return null;
  const input = value as Record<string, any>;
  if (!text(input.key, 80) || !text(input.name) || !text(input.allocation, 80)
    || !text(input.controlled_by, 80) || !text(input.setting_collection, 100)
    || typeof input.enabled_by_default !== 'boolean'
    || !Array.isArray(input.eligible_store_types) || !Array.isArray(input.eligible_plans)
    || input.eligible_store_types.some((item: unknown) => !['promotional', 'ecommerce'].includes(String(item)))
    || input.eligible_plans.some((item: unknown) => !['free', 'basic', 'premium'].includes(String(item)))) return null;
  return Object.freeze({
    key: text(input.key, 80),
    name: text(input.name),
    allocation: text(input.allocation, 80),
    controlled_by: text(input.controlled_by, 80),
    enabled_by_default: input.enabled_by_default,
    setting_collection: text(input.setting_collection, 100),
    eligible_store_types: Object.freeze([...input.eligible_store_types]),
    eligible_plans: Object.freeze([...input.eligible_plans]),
  });
}

export function normalizeCommercialPlanCatalog(value: unknown): CommercialPlanCatalog | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, any>;
  if (input.ok !== true || input.contract !== COMMERCIAL_PLAN_CATALOG_CONTRACT || input.version !== 1
    || !exactKeys(input.currency, ['code', 'decimals']) || input.currency.code !== 'CUP'
    || nonNegativeInteger(input.currency.decimals) === null
    || !sameNumbers(input.commercial_period_months, CONTRACT_PERIODS)
    || !Array.isArray(input.store_types) || input.store_types.length !== 2
    || !Array.isArray(input.optional_capabilities)) return null;
  const periods = Object.freeze([...input.commercial_period_months]);
  const storeTypes = input.store_types.map((item: unknown) => normalizeStoreType(item, periods));
  if (storeTypes.some((item: CommercialStoreTypeDefinition | null) => !item)
    || !(['promotional', 'ecommerce'] as const).every((code) => storeTypes.some((item: CommercialStoreTypeDefinition | null) => item?.code === code))) return null;
  const optionalCapabilities = input.optional_capabilities.map(normalizeOptionalCapability);
  if (optionalCapabilities.some((item: CommercialOptionalCapability | null) => !item)) return null;
  const security = optionalCapabilities.find((item: CommercialOptionalCapability | null) => item?.key === 'security_enabled');
  if (!security || security.allocation !== 'optional_per_store' || security.controlled_by !== 'master_admin'
    || security.enabled_by_default !== false) return null;
  return Object.freeze({
    contract: COMMERCIAL_PLAN_CATALOG_CONTRACT,
    version: 1,
    currency: Object.freeze({ code: 'CUP', decimals: input.currency.decimals }),
    commercial_period_months: periods,
    store_types: Object.freeze(storeTypes as CommercialStoreTypeDefinition[]),
    optional_capabilities: Object.freeze(optionalCapabilities as CommercialOptionalCapability[]),
  });
}

export async function getMasterCommercialPlanCatalog(
  pocketbaseUrl: string,
  token: string,
): Promise<CommercialPlanCatalogRequest> {
  const baseUrl = text(pocketbaseUrl, 500).replace(/\/$/, '');
  const authToken = text(token, 5000);
  if (!baseUrl || !authToken) return { available: false, status: 0, error: 'unavailable', data: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/pz/master/plan-catalog`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const data = response.status === 200 ? normalizeCommercialPlanCatalog(payload) : null;
    return Object.freeze({
      available: response.status === 200 && data !== null,
      status: response.status,
      error: data ? '' : text(payload?.error, 80) || (response.status === 200 ? 'invalid_response' : 'unavailable'),
      data,
    });
  } catch (_) {
    return { available: false, status: 0, error: 'unavailable', data: null };
  } finally {
    clearTimeout(timeout);
  }
}

export function commercialStoreType(
  catalog: CommercialPlanCatalog,
  storeType: CommercialStoreTypeCode | CommercialStorageCode,
) {
  return catalog.store_types.find((item) => item.code === storeType || item.storage_code === storeType) || null;
}

export function commercialPlan(
  storeType: CommercialStoreTypeDefinition,
  planCode: string,
) {
  return storeType.plans.find((item) => item.code === planCode) || null;
}

export function formatCommercialCup(value: unknown, decimals = 0) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  return `${new Intl.NumberFormat('es-CU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeAmount)} CUP`;
}

export function commercialMonthsLabel(months: number) {
  return `${months} ${months === 1 ? 'mes' : 'meses'}`;
}

export function commercialPlanDurationLabel(plan: CommercialPlanDefinition) {
  if (plan.pricing.trial) return `${plan.pricing.trial.days} días`;
  return plan.duration.allowed_months.map((months) => commercialMonthsLabel(months)).join(', ');
}
