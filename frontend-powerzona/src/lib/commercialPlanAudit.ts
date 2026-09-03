export type CommercialPlanAuditTerms = {
  contract: 'tusenda84.commercial-plan-catalog.v1';
  version: 1;
  store_type: 'promotional' | 'ecommerce';
  plan_code: 'free' | 'basic' | 'premium';
  plan_name: string;
  currency: 'CUP';
  pricing_kind: 'trial' | 'period' | 'permanent_compatibility';
  trial_days: number | null;
  period_months: number | null;
  monthly_equivalent_cup: number | null;
  total_cup: number | null;
  savings_cup: number | null;
  savings_percent: number | null;
  capabilities: Record<string, boolean | number | string[]>;
};

const PERIODS = [1, 6, 12];
const PLAN_CODES = ['free', 'basic', 'premium'];
const STORE_TYPES = ['promotional', 'ecommerce'];
const PRICING_KINDS = ['trial', 'period', 'permanent_compatibility'];

function nullableNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function capabilities(value: unknown): CommercialPlanAuditTerms['capabilities'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const keys = Object.keys(source);
  if (keys.length > 64) return null;
  const result: CommercialPlanAuditTerms['capabilities'] = {};
  for (const key of keys) {
    if (!/^[a-z0-9_]{1,80}$/.test(key)) return null;
    const entry = source[key];
    if (typeof entry === 'boolean') result[key] = entry;
    else if (typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) result[key] = entry;
    else if (Array.isArray(entry) && entry.length <= 32
      && entry.every((item) => typeof item === 'string' && item.length <= 80)) result[key] = [...entry];
    else return null;
  }
  return result;
}

export function normalizeCommercialPlanAuditTerms(value: unknown): CommercialPlanAuditTerms | null {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (_) { return null; }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const item = source as Record<string, unknown>;
  const storeType = String(item.store_type || '');
  const planCode = String(item.plan_code || '');
  const pricingKind = String(item.pricing_kind || '');
  const snapshotCapabilities = capabilities(item.capabilities);
  if (item.contract !== 'tusenda84.commercial-plan-catalog.v1'
    || Number(item.version) !== 1
    || item.currency !== 'CUP'
    || !STORE_TYPES.includes(storeType)
    || !PLAN_CODES.includes(planCode)
    || !PRICING_KINDS.includes(pricingKind)
    || !snapshotCapabilities) return null;

  const periodMonths = nullableNonNegativeNumber(item.period_months);
  if (pricingKind === 'period' && !PERIODS.includes(Number(periodMonths))) return null;
  const planName = String(item.plan_name || '').trim().slice(0, 80);
  if (!planName) return null;
  return {
    contract: 'tusenda84.commercial-plan-catalog.v1',
    version: 1,
    store_type: storeType as CommercialPlanAuditTerms['store_type'],
    plan_code: planCode as CommercialPlanAuditTerms['plan_code'],
    plan_name: planName,
    currency: 'CUP',
    pricing_kind: pricingKind as CommercialPlanAuditTerms['pricing_kind'],
    trial_days: nullableNonNegativeNumber(item.trial_days),
    period_months: periodMonths,
    monthly_equivalent_cup: nullableNonNegativeNumber(item.monthly_equivalent_cup),
    total_cup: nullableNonNegativeNumber(item.total_cup),
    savings_cup: nullableNonNegativeNumber(item.savings_cup),
    savings_percent: nullableNonNegativeNumber(item.savings_percent),
    capabilities: snapshotCapabilities,
  };
}
