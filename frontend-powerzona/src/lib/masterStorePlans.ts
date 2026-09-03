import { normalizeProductQuota, type ProductQuota } from './productQuota';

export type MasterPlanCode = 'free' | 'basic' | 'premium';

export type MasterPlanAudit = {
  id: string;
  action: string;
  action_label: string;
  actor_name: string;
  actor_role: string;
  previous_plan: MasterPlanCode | '';
  new_plan: MasterPlanCode | '';
  previous_started_at: string;
  new_started_at: string;
  previous_expires_at: string;
  new_expires_at: string;
  previous_is_permanent: boolean;
  new_is_permanent: boolean;
  duration_months: number;
  reason: string;
  created: string;
};

export type MasterStorePlan = {
  generated_at: string;
  catalog_contract: 'tusenda84.commercial-plan-catalog.v1';
  store: { id: string; name: string; slug: string; status: 'active' | 'suspended' };
  plan: {
    plan: MasterPlanCode;
    plan_name: string;
    plan_started_at: string;
    plan_expires_at: string;
    plan_duration_months: number;
    plan_is_permanent: boolean;
    days_remaining: number | null;
    state: 'unconfigured' | 'active' | 'expiring' | 'critical' | 'expired';
    isConfigured: boolean;
    isExpired: boolean;
    can_renew: boolean;
  };
  usage: { active_users: number; store_devices: number; max_devices_per_user: number; products: number };
  product_quota: ProductQuota;
  expiration_cleanup: { products: number; variations: number; notifications: number; cycles: number };
  last_change: MasterPlanAudit | null;
  history: MasterPlanAudit[];
};

export type MasterPlanRequest = {
  available: boolean;
  status: number;
  error: string;
  data: MasterStorePlan | null;
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PLAN_CODES: MasterPlanCode[] = ['free', 'basic', 'premium'];
const REQUEST_TIMEOUT_MS = 12000;

function text(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
}

function isPlanCode(value: unknown): value is MasterPlanCode {
  return typeof value === 'string' && PLAN_CODES.includes(value as MasterPlanCode);
}

function integer(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isoDate(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function audit(value: any): MasterPlanAudit | null {
  if (!value || typeof value !== 'object') return null;
  const id = text(value.id, 15);
  const previousPlan = value.previous_plan === '' ? '' : value.previous_plan;
  const newPlan = value.new_plan === '' ? '' : value.new_plan;
  if (!RECORD_ID_PATTERN.test(id) || (previousPlan && !isPlanCode(previousPlan)) || (newPlan && !isPlanCode(newPlan))) return null;
  return {
    id,
    action: text(value.action, 50),
    action_label: text(value.action_label, 100) || 'Actualización de plan',
    actor_name: text(value.actor_name, 160) || 'Sistema',
    actor_role: text(value.actor_role, 40),
    previous_plan: previousPlan,
    new_plan: newPlan,
    previous_started_at: isoDate(value.previous_started_at),
    new_started_at: isoDate(value.new_started_at),
    previous_expires_at: isoDate(value.previous_expires_at),
    new_expires_at: isoDate(value.new_expires_at),
    previous_is_permanent: value.previous_is_permanent === true,
    new_is_permanent: value.new_is_permanent === true,
    duration_months: integer(value.duration_months),
    reason: text(value.reason, 500),
    created: isoDate(value.created),
  };
}

function normalizeResponse(value: any): MasterStorePlan | null {
  const id = text(value?.store?.id, 15);
  const planCode = value?.plan?.plan;
  if (value?.ok !== true
    || value?.catalog_contract !== 'tusenda84.commercial-plan-catalog.v1'
    || !RECORD_ID_PATTERN.test(id)
    || !isPlanCode(planCode)) return null;
  const history = Array.isArray(value.history) ? value.history.map(audit).filter(Boolean) as MasterPlanAudit[] : [];
  const lastChange = value.last_change ? audit(value.last_change) : null;
  const productQuota = normalizeProductQuota(value.product_quota);
  if (!productQuota) return null;
  const states = ['unconfigured', 'active', 'expiring', 'critical', 'expired'] as const;
  const state = states.includes(value.plan.state) ? value.plan.state : 'unconfigured';
  const daysRemaining = value.plan.days_remaining === null ? null : integer(value.plan.days_remaining);
  return {
    generated_at: isoDate(value.generated_at),
    catalog_contract: 'tusenda84.commercial-plan-catalog.v1',
    store: {
      id,
      name: text(value.store.name, 160) || 'Tienda',
      slug: text(value.store.slug, 120),
      status: value.store.status === 'active' ? 'active' : 'suspended',
    },
    plan: {
      plan: planCode,
      plan_name: text(value.plan.plan_name, 80),
      plan_started_at: isoDate(value.plan.plan_started_at),
      plan_expires_at: isoDate(value.plan.plan_expires_at),
      plan_duration_months: integer(value.plan.plan_duration_months),
      plan_is_permanent: value.plan.plan_is_permanent === true,
      days_remaining: daysRemaining,
      state,
      isConfigured: value.plan.isConfigured === true,
      isExpired: value.plan.isExpired === true,
      can_renew: value.plan.can_renew === true,
    },
    usage: {
      active_users: integer(value.usage?.active_users),
      store_devices: integer(value.usage?.store_devices),
      max_devices_per_user: integer(value.usage?.max_devices_per_user),
      products: integer(value.usage?.products),
    },
    product_quota: productQuota,
    expiration_cleanup: {
      products: integer(value.expiration_cleanup?.products),
      variations: integer(value.expiration_cleanup?.variations),
      notifications: integer(value.expiration_cleanup?.notifications),
      cycles: integer(value.expiration_cleanup?.cycles),
    },
    last_change: lastChange,
    history,
  };
}

async function postEndpoint(
  pocketbaseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<MasterPlanRequest> {
  const baseUrl = text(pocketbaseUrl, 500).replace(/\/$/, '');
  const authToken = text(token, 5000);
  if (!baseUrl || !authToken) return { available: false, status: 0, error: 'unavailable', data: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const data = response.status === 200 ? normalizeResponse(payload) : null;
    return {
      available: response.status === 200 && data !== null,
      status: response.status,
      error: data ? '' : text(payload?.error, 80) || (response.status === 200 ? 'invalid_response' : 'unavailable'),
      data,
    };
  } catch (_) {
    return { available: false, status: 0, error: 'unavailable', data: null };
  } finally {
    clearTimeout(timeout);
  }
}

export function getMasterPlanErrorMessage(error: string) {
  const messages: Record<string, string> = {
    invalid_payload: 'Revisa los datos seleccionados antes de continuar.',
    invalid_plan_duration_months: 'Selecciona uno de los periodos comerciales disponibles.',
    invalid_plan_permanence: 'La prueba gratuita solo puede usar su vigencia temporal.',
    permanent_plan_not_renewable: 'Los planes permanentes no se renuevan por meses.',
    free_plan_not_renewable: 'La prueba Free no admite renovaciones por meses.',
    expiration_cleanup_confirmation_required: 'Confirma la eliminación irreversible de fechas y alertas de vencimiento.',
    store_not_found: 'La tienda ya no está disponible.',
    unauthorized: 'Tu sesión Master ya no está autorizada.',
  };
  return messages[error] || 'No se pudo completar la acción. Inténtalo nuevamente.';
}

export function getMasterStorePlan(pocketbaseUrl: string, token: string, storeId: string) {
  if (!RECORD_ID_PATTERN.test(storeId)) return Promise.resolve({ available: false, status: 400, error: 'invalid_payload', data: null });
  return postEndpoint(pocketbaseUrl, token, '/api/pz/master/store-plan', { store_id: storeId });
}

export function changeMasterStorePlan(
  pocketbaseUrl: string,
  token: string,
  input: { store_id: string; plan: MasterPlanCode; is_permanent: boolean; duration_months: number; reason: string; confirm_expiration_cleanup: boolean },
) {
  return postEndpoint(pocketbaseUrl, token, '/api/pz/master/store-plan/change', input);
}

export function renewMasterStorePlan(
  pocketbaseUrl: string,
  token: string,
  input: { store_id: string; months: number; reason: string },
) {
  return postEndpoint(pocketbaseUrl, token, '/api/pz/master/store-plan/renew', input);
}
