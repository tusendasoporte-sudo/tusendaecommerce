import type { AdminStoreContext } from './storeContext';

export const STORE_CAPABILITY_KEYS = [
  'max_active_users',
  'max_devices_per_user',
  'max_store_devices',
  'max_product_images',
  'raffles_enabled',
  'security_enabled',
  'landing_qr_enabled',
  'product_expiration_tools_enabled',
] as const;

const NUMERIC_CAPABILITY_KEYS = STORE_CAPABILITY_KEYS.slice(0, 4) as readonly StoreCapabilityKey[];
const STORE_PLAN_CODES = ['free', 'basic', 'premium'] as const;

export type StoreCapabilityKey = (typeof STORE_CAPABILITY_KEYS)[number];
export type StoreCapabilityPlan = (typeof STORE_PLAN_CODES)[number];
export type StoreCapabilityReason =
  | 'allowed'
  | 'capability_not_in_plan'
  | 'limit_exceeded'
  | 'plan_expired'
  | 'invalid_capability'
  | 'invalid_plan_data';
export type StoreCapabilityPlanState =
  | 'unconfigured'
  | 'active'
  | 'expiring'
  | 'critical'
  | 'expired'
  | 'invalid';

export type StoreCapabilityAccess = Readonly<{
  capability: StoreCapabilityKey | '';
  kind: 'boolean' | 'limit';
  plan: StoreCapabilityPlan | null;
  plan_state: StoreCapabilityPlanState;
  is_permanent: boolean;
  is_configured: boolean;
  is_expired: boolean;
  entitled: boolean;
  allowed: boolean;
  limit: number | null;
  required_amount: number | null;
  reason: StoreCapabilityReason;
}>;

export type StoreCapabilityOptions = {
  requiredAmount?: number;
  enforceExpiration?: boolean;
  now?: Date | string | number;
};

export type StoreCapabilityValues = {
  plan?: unknown;
  plan_started_at?: unknown;
  plan_expires_at?: unknown;
  plan_is_permanent?: unknown;
  get?: (key: string) => unknown;
  getString?: (key: string) => unknown;
  [key: string]: unknown;
};

type CapabilityMatrix = Record<StoreCapabilityPlan, Record<StoreCapabilityKey, number | boolean>>;

const BASIC_CAPABILITIES = Object.freeze({
  max_active_users: 1,
  max_devices_per_user: 5,
  max_store_devices: 5,
  max_product_images: 2,
  raffles_enabled: false,
  security_enabled: false,
  landing_qr_enabled: false,
  product_expiration_tools_enabled: false,
});

const STORE_PLAN_CAPABILITIES: CapabilityMatrix = Object.freeze({
  free: BASIC_CAPABILITIES,
  basic: BASIC_CAPABILITIES,
  premium: Object.freeze({
    max_active_users: 4,
    max_devices_per_user: 5,
    max_store_devices: 20,
    max_product_images: 4,
    raffles_enabled: true,
    security_enabled: true,
    landing_qr_enabled: true,
    product_expiration_tools_enabled: true,
  }),
});

const SAFE_ERROR_DEFINITIONS = Object.freeze({
  invalid_capability: Object.freeze({
    status: 500,
    message: 'Esta función no está disponible temporalmente.',
  }),
  invalid_plan_data: Object.freeze({
    status: 503,
    message: 'Esta función no está disponible temporalmente.',
  }),
  capability_not_in_plan: Object.freeze({
    status: 403,
    message: 'Esta función no está incluida en el plan actual.',
  }),
  limit_exceeded: Object.freeze({
    status: 403,
    message: 'Alcanzaste el límite permitido por tu plan.',
  }),
  plan_expired: Object.freeze({
    status: 403,
    message: 'Esta función no está disponible temporalmente.',
  }),
});

function recordValue(record: StoreCapabilityValues | null | undefined, key: string) {
  if (!record) return undefined;
  if (typeof record.get === 'function') {
    try {
      return record.get(key);
    } catch (_) {}
  }
  if (typeof record.getString === 'function') {
    try {
      return record.getString(key);
    } catch (_) {}
  }
  return record[key];
}

function safeText(value: unknown) {
  try {
    return String(value === null || value === undefined ? '' : value).trim();
  } catch (_) {
    return '';
  }
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function isStoreCapabilityKey(value: unknown): value is StoreCapabilityKey {
  return typeof value === 'string' && STORE_CAPABILITY_KEYS.includes(value as StoreCapabilityKey);
}

function isStoreCapabilityPlan(value: unknown): value is StoreCapabilityPlan {
  return typeof value === 'string' && STORE_PLAN_CODES.includes(value as StoreCapabilityPlan);
}

function capabilityKind(capabilityKey: StoreCapabilityKey): 'boolean' | 'limit' {
  return NUMERIC_CAPABILITY_KEYS.includes(capabilityKey) ? 'limit' : 'boolean';
}

function knownPlanFromStore(storeValues: StoreCapabilityValues | null | undefined) {
  const plan = safeText(recordValue(storeValues, 'plan'));
  return isStoreCapabilityPlan(plan) ? plan : null;
}

function invalidAccess(
  capabilityKey: unknown,
  reason: 'invalid_capability' | 'invalid_plan_data',
  plan: StoreCapabilityPlan | null,
): StoreCapabilityAccess {
  const validCapability = isStoreCapabilityKey(capabilityKey);
  return Object.freeze({
    capability: validCapability ? capabilityKey : '',
    kind: validCapability ? capabilityKind(capabilityKey) : 'boolean',
    plan,
    plan_state: 'invalid',
    is_permanent: false,
    is_configured: false,
    is_expired: false,
    entitled: false,
    allowed: false,
    limit: null,
    required_amount: null,
    reason,
  });
}

function parseDate(value: unknown, allowEmpty: boolean) {
  if (value === null || value === undefined || value === '') {
    if (allowEmpty) return null;
    throw new TypeError('invalid_date');
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new TypeError('invalid_date');
    return new Date(value.getTime());
  }

  let raw = value;
  if (typeof value === 'object' && value && 'string' in value && typeof value.string === 'function') {
    try {
      raw = value.string();
    } catch (_) {
      throw new TypeError('invalid_date');
    }
  }
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
    if (allowEmpty) return null;
    throw new TypeError('invalid_date');
  }

  const date = new Date(typeof raw === 'string' ? raw.trim() : raw as string | number);
  if (!Number.isFinite(date.getTime())) throw new TypeError('invalid_date');
  return date;
}

function resolvePlanState(
  storeValues: StoreCapabilityValues,
  plan: StoreCapabilityPlan,
  now: Date | string | number | undefined,
) {
  parseDate(recordValue(storeValues, 'plan_started_at'), true);
  const expiration = parseDate(recordValue(storeValues, 'plan_expires_at'), true);
  const isPermanent = booleanValue(recordValue(storeValues, 'plan_is_permanent'));
  const current = !isPermanent && expiration
    ? (now === undefined ? new Date() : parseDate(now, false))
    : null;

  let state: StoreCapabilityPlanState = 'unconfigured';
  if (isPermanent) {
    state = 'active';
  } else if (expiration && current) {
    const difference = expiration.getTime() - current.getTime();
    const daysRemaining = difference <= 0 ? 0 : Math.ceil(difference / 86_400_000);
    if (daysRemaining === 0) state = 'expired';
    else if (daysRemaining <= 3) state = 'critical';
    else if (daysRemaining <= 7) state = 'expiring';
    else state = 'active';
  }

  return {
    plan,
    state,
    isPermanent,
    isConfigured: isPermanent || !!expiration,
    isExpired: state === 'expired',
    capabilities: STORE_PLAN_CAPABILITIES[plan],
  };
}

function normalizeRequiredAmount(options: StoreCapabilityOptions | undefined) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, 'requiredAmount')) return null;
  const amount = options.requiredAmount;
  if (!Number.isInteger(amount) || (amount as number) < 0) {
    throw new TypeError('invalid_required_amount');
  }
  return amount as number;
}

export function resolveStoreCapabilityAccess(
  storeValues: StoreCapabilityValues | null | undefined,
  capabilityKey: StoreCapabilityKey | string,
  options?: StoreCapabilityOptions,
): StoreCapabilityAccess {
  if (!isStoreCapabilityKey(capabilityKey)) {
    return invalidAccess(capabilityKey, 'invalid_capability', knownPlanFromStore(storeValues));
  }

  const knownPlan = knownPlanFromStore(storeValues);
  try {
    if (!storeValues || typeof storeValues !== 'object') throw new TypeError('invalid_store_values');
    if (!knownPlan) throw new RangeError('invalid_plan_code');
    if (knownPlan === 'free' && booleanValue(recordValue(storeValues, 'plan_is_permanent'))) {
      throw new TypeError('invalid_plan_permanence');
    }

    const planState = resolvePlanState(storeValues, knownPlan, options?.now);
    const kind = capabilityKind(capabilityKey);
    const capabilityValue = planState.capabilities[capabilityKey];
    let entitled = false;
    let limit: number | null = null;
    let requiredAmount: number | null = null;

    if (kind === 'boolean') {
      if (typeof capabilityValue !== 'boolean') throw new TypeError('invalid_capability_value');
      entitled = capabilityValue;
    } else {
      if (!Number.isInteger(capabilityValue) || (capabilityValue as number) < 0) {
        throw new TypeError('invalid_capability_limit');
      }
      limit = capabilityValue as number;
      requiredAmount = normalizeRequiredAmount(options);
      entitled = true;
    }

    let allowed = entitled;
    let reason: StoreCapabilityReason = entitled ? 'allowed' : 'capability_not_in_plan';
    if (planState.isExpired && options?.enforceExpiration === true) {
      allowed = false;
      reason = 'plan_expired';
    } else if (kind === 'limit' && requiredAmount !== null && requiredAmount > (limit as number)) {
      allowed = false;
      reason = 'limit_exceeded';
    }

    return Object.freeze({
      capability: capabilityKey,
      kind,
      plan: planState.plan,
      plan_state: planState.state,
      is_permanent: planState.isPermanent,
      is_configured: planState.isConfigured,
      is_expired: planState.isExpired,
      entitled,
      allowed,
      limit,
      required_amount: requiredAmount,
      reason,
    });
  } catch (_) {
    return invalidAccess(capabilityKey, 'invalid_plan_data', knownPlan);
  }
}

export function hasStoreCapability(
  storeValues: StoreCapabilityValues | null | undefined,
  capabilityKey: StoreCapabilityKey | string,
  options?: StoreCapabilityOptions,
) {
  return resolveStoreCapabilityAccess(storeValues, capabilityKey, options).allowed;
}

export class StoreCapabilityAccessError extends Error {
  code: Exclude<StoreCapabilityReason, 'allowed'>;
  access: StoreCapabilityAccess;

  constructor(code: Exclude<StoreCapabilityReason, 'allowed'>, access: StoreCapabilityAccess) {
    const definition = SAFE_ERROR_DEFINITIONS[code] || SAFE_ERROR_DEFINITIONS.invalid_plan_data;
    super(definition.message);
    this.name = 'StoreCapabilityAccessError';
    this.code = code in SAFE_ERROR_DEFINITIONS ? code : 'invalid_plan_data';
    this.access = access;
  }
}

export function requireStoreCapability(
  storeValues: StoreCapabilityValues | null | undefined,
  capabilityKey: StoreCapabilityKey | string,
  options?: StoreCapabilityOptions,
) {
  const access = resolveStoreCapabilityAccess(storeValues, capabilityKey, options);
  if (!access.allowed) {
    throw new StoreCapabilityAccessError(access.reason as Exclude<StoreCapabilityReason, 'allowed'>, access);
  }
  return access;
}

export function getStoreCapabilityHttpError(error: unknown) {
  const requestedCode = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';
  const code = requestedCode in SAFE_ERROR_DEFINITIONS
    ? requestedCode as keyof typeof SAFE_ERROR_DEFINITIONS
    : 'internal_error';
  const definition = code === 'internal_error'
    ? SAFE_ERROR_DEFINITIONS.invalid_capability
    : SAFE_ERROR_DEFINITIONS[code];
  return Object.freeze({
    status: definition.status,
    code,
    message: definition.message,
  });
}

export function resolveAdminStoreCapability(
  adminContext: Pick<AdminStoreContext, 'store'>,
  capabilityKey: StoreCapabilityKey | string,
  options?: StoreCapabilityOptions,
) {
  return resolveStoreCapabilityAccess(adminContext?.store, capabilityKey, options);
}

export function requireAdminStoreCapability(
  adminContext: Pick<AdminStoreContext, 'store'>,
  capabilityKey: StoreCapabilityKey | string,
  options?: StoreCapabilityOptions,
) {
  return requireStoreCapability(adminContext?.store, capabilityKey, options);
}
