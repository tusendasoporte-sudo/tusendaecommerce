export type MasterPromoPlanCode = 'free' | 'basic';
export type MasterPromoPlanState = 'unconfigured' | 'active' | 'expiring' | 'critical' | 'grace' | 'expired';

export type MasterPromoPlanAudit = {
  id: string;
  action: string;
  actor_name: string;
  previous_plan: MasterPromoPlanCode | '';
  new_plan: MasterPromoPlanCode | '';
  previous_expires_at: string;
  new_expires_at: string;
  duration_months: number;
  reason: string;
  created: string;
};

export type MasterPromoStorePlan = {
  generated_at: string;
  store: {
    id: string;
    name: string;
    slug: string;
    status: 'active' | 'suspended';
    type: 'promo';
    free_trial_used: boolean;
  };
  plan: {
    plan: MasterPromoPlanCode;
    plan_name: string;
    plan_started_at: string;
    plan_expires_at: string;
    plan_duration_months: number;
    plan_is_permanent: boolean;
    days_remaining: number | null;
    state: MasterPromoPlanState;
    isConfigured: boolean;
    isExpired: boolean;
    can_renew: boolean;
    in_grace: boolean;
    grace_days: number;
    grace_expires_at: string;
    can_mutate: boolean;
    public_allowed: boolean;
    max_gallery_assets: number;
    legacy_contract: boolean;
  };
  definitions: Array<{
    code: MasterPromoPlanCode;
    name: string;
    duration: { kind: 'fixed_days' | 'calendar_months'; days: number | null; min_months: number; max_months: number };
    supports_permanent: false;
    capabilities: { max_gallery_assets: number };
  }>;
  last_change: MasterPromoPlanAudit | null;
  history: MasterPromoPlanAudit[];
};

export type MasterPromoPlanRequest = {
  available: boolean;
  status: number;
  error: string;
  data: MasterPromoStorePlan | null;
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PLAN_CODES: MasterPromoPlanCode[] = ['free', 'basic'];
const PLAN_STATES: MasterPromoPlanState[] = ['unconfigured', 'active', 'expiring', 'critical', 'grace', 'expired'];
const REQUEST_TIMEOUT_MS = 12000;

function text(value: unknown, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum ? number : 0;
}

function isoDate(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function isPlanCode(value: unknown): value is MasterPromoPlanCode {
  return typeof value === 'string' && PLAN_CODES.includes(value as MasterPromoPlanCode);
}

function normalizeAudit(value: any): MasterPromoPlanAudit | null {
  const id = text(value?.id, 15);
  const previous = value?.previous_plan === '' ? '' : value?.previous_plan;
  const next = value?.new_plan === '' ? '' : value?.new_plan;
  if (!RECORD_ID_PATTERN.test(id) || (previous && !isPlanCode(previous)) || (next && !isPlanCode(next))) return null;
  return {
    id,
    action: text(value.action, 50),
    actor_name: text(value.actor_name, 160) || 'Sistema',
    previous_plan: previous,
    new_plan: next,
    previous_expires_at: isoDate(value.previous_expires_at),
    new_expires_at: isoDate(value.new_expires_at),
    duration_months: integer(value.duration_months, 12),
    reason: text(value.reason, 500),
    created: isoDate(value.created),
  };
}

function normalizeResponse(value: any): MasterPromoStorePlan | null {
  const storeId = text(value?.store?.id, 15);
  const planCode = value?.plan?.plan;
  if (value?.ok !== true || !RECORD_ID_PATTERN.test(storeId) || value?.store?.type !== 'promo' || !isPlanCode(planCode)) return null;
  const definitions = Array.isArray(value.definitions) ? value.definitions.filter((item: any) => (
    isPlanCode(item?.code)
    && item?.supports_permanent === false
    && Number.isInteger(item?.capabilities?.max_gallery_assets)
    && [150, 300].includes(item.capabilities.max_gallery_assets)
  )) : [];
  if (definitions.length !== 2 || PLAN_CODES.some((code) => !definitions.some((item: any) => item.code === code))) return null;
  const state = PLAN_STATES.includes(value.plan.state) ? value.plan.state : 'unconfigured';
  const history = Array.isArray(value.history) ? value.history.map(normalizeAudit).filter(Boolean) as MasterPromoPlanAudit[] : [];
  return {
    generated_at: isoDate(value.generated_at),
    store: {
      id: storeId,
      name: text(value.store.name, 160) || 'Tienda Promo',
      slug: text(value.store.slug, 120),
      status: value.store.status === 'active' ? 'active' : 'suspended',
      type: 'promo',
      free_trial_used: value.store.free_trial_used === true,
    },
    plan: {
      plan: planCode,
      plan_name: text(value.plan.plan_name, 100),
      plan_started_at: isoDate(value.plan.plan_started_at),
      plan_expires_at: isoDate(value.plan.plan_expires_at),
      plan_duration_months: integer(value.plan.plan_duration_months, 12),
      plan_is_permanent: value.plan.plan_is_permanent === true,
      days_remaining: value.plan.days_remaining === null ? null : integer(value.plan.days_remaining, 10000),
      state,
      isConfigured: value.plan.isConfigured === true,
      isExpired: value.plan.isExpired === true,
      can_renew: value.plan.can_renew === true,
      in_grace: value.plan.in_grace === true,
      grace_days: integer(value.plan.grace_days, 30),
      grace_expires_at: isoDate(value.plan.grace_expires_at),
      can_mutate: value.plan.can_mutate === true,
      public_allowed: value.plan.public_allowed === true,
      max_gallery_assets: integer(value.plan.max_gallery_assets, 300),
      legacy_contract: value.plan.legacy_contract === true,
    },
    definitions: definitions.map((item: any) => ({
      code: item.code,
      name: text(item.name, 100),
      duration: {
        kind: item.duration?.kind === 'fixed_days' ? 'fixed_days' : 'calendar_months',
        days: item.duration?.days === null ? null : integer(item.duration?.days, 365),
        min_months: integer(item.duration?.min_months, 12),
        max_months: integer(item.duration?.max_months, 12),
      },
      supports_permanent: false,
      capabilities: { max_gallery_assets: integer(item.capabilities.max_gallery_assets, 300) },
    })),
    last_change: value.last_change ? normalizeAudit(value.last_change) : null,
    history,
  };
}

async function postEndpoint(
  pocketbaseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<MasterPromoPlanRequest> {
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

export function getMasterPromoPlanErrorMessage(error: string) {
  const messages: Record<string, string> = {
    invalid_payload: 'Revisa los datos seleccionados antes de continuar.',
    invalid_plan_duration_months: 'Selecciona una duración entre 1 y 12 meses.',
    invalid_promo_plan_code: 'Ese plan no pertenece a Tiendas Promo.',
    invalid_promo_plan_permanence: 'Los planes Promo siempre requieren una vigencia.',
    promo_free_trial_already_used: 'El plan Gratis solo puede utilizarse una vez por tienda.',
    free_plan_not_renewable: 'El plan Gratis no admite renovaciones.',
    permanent_plan_not_renewable: 'Asigna primero una vigencia real al contrato Promo legado.',
    store_not_promo: 'La tienda ya no está disponible como Tienda Promo.',
    unauthorized: 'Tu sesión Master ya no está autorizada.',
  };
  return messages[error] || 'No se pudo completar la acción. Inténtalo nuevamente.';
}

export function getMasterPromoPlan(pocketbaseUrl: string, token: string, storeId: string) {
  if (!RECORD_ID_PATTERN.test(storeId)) return Promise.resolve({ available: false, status: 400, error: 'invalid_payload', data: null });
  return postEndpoint(pocketbaseUrl, token, '/api/pz/promo/master/v1/plan', { store_id: storeId });
}

export function changeMasterPromoPlan(
  pocketbaseUrl: string,
  token: string,
  input: { store_id: string; plan: MasterPromoPlanCode; duration_months: number; reason: string },
) {
  return postEndpoint(pocketbaseUrl, token, '/api/pz/promo/master/v1/plan/change', input);
}

export function renewMasterPromoPlan(
  pocketbaseUrl: string,
  token: string,
  input: { store_id: string; months: number; reason: string },
) {
  return postEndpoint(pocketbaseUrl, token, '/api/pz/promo/master/v1/plan/renew', input);
}
