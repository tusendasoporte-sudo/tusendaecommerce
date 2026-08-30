export const PROMO_CAPABILITY_KEYS = [
  'promo_site_enabled',
  'publish_enabled',
  'custom_domain_enabled',
  'theme_customization_enabled',
  'multilanguage_enabled',
  'language_selector_enabled',
  'video_enabled',
  'analytics_enabled',
  'landing_qr_bridge_enabled',
  'max_services',
  'max_gallery_assets',
  'max_locales',
  'max_videos',
  'max_storage_bytes',
] as const;

export const PROMO_PERMISSION_KEYS = [
  'promo.site.view',
  'promo.content.manage',
  'promo.media.manage',
  'promo.theme.select',
  'promo.appearance.manage',
  'promo.translations.manage',
  'promo.contact.manage',
  'promo.reviews.manage',
  'promo.analytics.view',
  'promo.publish',
] as const;

export const PROMO_RESERVED_PERMISSION_KEYS = [
  'promo.site.lifecycle.manage',
  'promo.entitlements.manage',
  'promo.theme_releases.manage',
  'promo.publication.rollback',
  'promo.support.access',
] as const;

export const PROMO_ACTION_KEYS = [
  'promo.site.view',
  'promo.content.manage',
  'promo.media.manage',
  'promo.media.video.manage',
  'promo.theme.select',
  'promo.appearance.manage',
  'promo.translations.manage',
  'promo.contact.manage',
  'promo.reviews.manage',
  'promo.analytics.view',
  'promo.publication.publish',
  'promo.landing_qr.bridge.manage',
  'promo.master.site.lifecycle',
  'promo.master.entitlements.manage',
  'promo.master.theme_releases.manage',
  'promo.master.publication.rollback',
  'promo.master.support',
] as const;

export const PROMO_ACCESS_API_PATHS = Object.freeze({
  context: '/api/pz/promo/access/context',
  teamDetail: '/api/pz/promo/team/detail',
  updatePermissions: '/api/pz/promo/team/update-permissions',
  updateEntitlements: '/api/pz/promo/master/entitlements/update',
});

export type PromoCapabilityKey = (typeof PROMO_CAPABILITY_KEYS)[number];
export type PromoPermissionKey = (typeof PROMO_PERMISSION_KEYS)[number];
export type PromoReservedPermissionKey = (typeof PROMO_RESERVED_PERMISSION_KEYS)[number];
export type PromoActionKey = (typeof PROMO_ACTION_KEYS)[number];

export type PromoCapabilityValues = Readonly<Record<PromoCapabilityKey, boolean | number>>;

export type PromoAccessPlan = Readonly<{
  code: 'free' | 'basic';
  name: string;
  state: 'unconfigured' | 'active' | 'expiring' | 'critical' | 'grace' | 'expired';
  days_remaining: number | null;
  expires_at: string;
  grace_expires_at: string;
  grace_days: number;
  in_grace: boolean;
  can_mutate: boolean;
  public_allowed: boolean;
  max_gallery_assets: number;
}>;

export type PromoAccessContext = Readonly<{
  ok: true;
  user: { display_name: string; role: string };
  store: { name: string; slug: string; status: string };
  site: { public_slug: string; status: string };
  access: {
    is_master: boolean;
    is_primary_admin: boolean;
    blocked_by_plan: boolean;
    permissions: PromoPermissionKey[];
    reserved_permissions: PromoReservedPermissionKey[];
    allowed_actions: PromoActionKey[];
  };
  capabilities: PromoCapabilityValues;
  plan: PromoAccessPlan;
  entitlement?: {
    source: 'unassigned' | 'contract' | 'addon' | 'master_override' | string;
    updated: string;
    capabilities: PromoCapabilityValues;
  };
}>;

export type PromoAccessClientOptions = Readonly<{
  baseUrl?: string;
  token: string;
  supportStoreId?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}>;

export type PromoTeamPermissionDetail = Readonly<{
  display_name: string;
  role: string;
  status: string;
  is_primary_admin: boolean;
  editable: boolean;
  assigned_permissions: PromoPermissionKey[];
  effective_permissions: PromoPermissionKey[];
  version: number;
}>;

const BOOLEAN_CAPABILITIES = new Set<PromoCapabilityKey>([
  'promo_site_enabled',
  'publish_enabled',
  'custom_domain_enabled',
  'theme_customization_enabled',
  'multilanguage_enabled',
  'language_selector_enabled',
  'video_enabled',
  'analytics_enabled',
  'landing_qr_bridge_enabled',
]);
const KNOWN_CAPABILITIES = new Set<string>(PROMO_CAPABILITY_KEYS);
const KNOWN_PERMISSIONS = new Set<string>(PROMO_PERMISSION_KEYS);
const KNOWN_RESERVED_PERMISSIONS = new Set<string>(PROMO_RESERVED_PERMISSION_KEYS);
const KNOWN_ACTIONS = new Set<string>(PROMO_ACTION_KEYS);
const PERMISSION_ORDER = new Map<string, number>(PROMO_PERMISSION_KEYS.map((key, index) => [key, index]));

function text(value: unknown) {
  try {
    return String(value === null || value === undefined ? '' : value).trim();
  } catch (_) {
    return '';
  }
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function normalizedBaseUrl(value: unknown) {
  const explicit = text(value);
  const environment = text((import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.PUBLIC_POCKETBASE_URL);
  return (explicit || environment).replace(/\/+$/, '');
}

function knownList<T extends string>(value: unknown, known: Set<string>, order: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set<T>();
  value.forEach((entry) => {
    const key = text(entry);
    if (known.has(key)) selected.add(key as T);
  });
  return order.filter((key) => selected.has(key));
}

export function isPromoCapabilityKey(value: unknown): value is PromoCapabilityKey {
  return typeof value === 'string' && KNOWN_CAPABILITIES.has(value);
}

export function isPromoPermissionKey(value: unknown): value is PromoPermissionKey {
  return typeof value === 'string' && KNOWN_PERMISSIONS.has(value);
}

export function isPromoActionKey(value: unknown): value is PromoActionKey {
  return typeof value === 'string' && KNOWN_ACTIONS.has(value);
}

export function normalizePromoPermissions(value: unknown): PromoPermissionKey[] {
  return knownList(value, KNOWN_PERMISSIONS, PROMO_PERMISSION_KEYS)
    .sort((left, right) => (PERMISSION_ORDER.get(left) ?? 0) - (PERMISSION_ORDER.get(right) ?? 0));
}

export function normalizePromoCapabilities(value: unknown): PromoCapabilityValues {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.freeze(Object.fromEntries(PROMO_CAPABILITY_KEYS.map((key) => [
    key,
    BOOLEAN_CAPABILITIES.has(key) ? input[key] === true : nonNegativeInteger(input[key]),
  ])) as Record<PromoCapabilityKey, boolean | number>);
}

export function hasPromoCapability(context: PromoAccessContext | null | undefined, key: PromoCapabilityKey | string) {
  if (!isPromoCapabilityKey(key) || !context) return false;
  const value = context.capabilities?.[key];
  return BOOLEAN_CAPABILITIES.has(key) ? value === true : nonNegativeInteger(value) > 0;
}

export function resolveEffectivePromoPermissions(context: PromoAccessContext | null | undefined) {
  if (!context
    || context.access?.blocked_by_plan === true
    || context.user?.role === ''
    || context.store?.status !== 'active'
    || !['draft', 'active', 'paused'].includes(context.site?.status)
    || !hasPromoCapability(context, 'promo_site_enabled')) return [];
  return normalizePromoPermissions(context.access?.permissions);
}

export function hasPromoPermission(
  context: PromoAccessContext | null | undefined,
  key: PromoPermissionKey | string,
) {
  return isPromoPermissionKey(key) && resolveEffectivePromoPermissions(context).includes(key);
}

export function hasPromoAction(
  context: PromoAccessContext | null | undefined,
  action: PromoActionKey | string,
) {
  if (!context || !isPromoActionKey(action)) return false;
  // The backend-projected action set is authoritative. Local checks are only
  // a defensive visual filter and never expand an absent backend decision.
  return Array.isArray(context.access?.allowed_actions)
    && context.access.allowed_actions.includes(action);
}

export class PromoAccessApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly response: unknown;

  constructor(code: unknown, status: number, response: unknown) {
    const safeCode = text(code) || 'promo_permissions_unavailable';
    super('No se pudo completar la acción de Tienda Promo.');
    this.name = 'PromoAccessApiError';
    this.code = safeCode;
    this.status = status;
    this.response = response;
  }
}

function strictPermissionUpdate(value: unknown): PromoPermissionKey[] {
  if (!Array.isArray(value) || value.some((permission) => !isPromoPermissionKey(permission))) {
    throw new PromoAccessApiError('invalid_promo_permissions', 400, null);
  }
  return normalizePromoPermissions(value);
}

function strictExpectedVersion(value: unknown) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new PromoAccessApiError('invalid_payload', 400, null);
  }
  return version;
}

async function postPromo<T>(
  options: PromoAccessClientOptions,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = text(options?.token);
  const baseUrl = normalizedBaseUrl(options?.baseUrl);
  if (!token) throw new PromoAccessApiError('unauthorized', 401, null);
  if (!baseUrl) throw new PromoAccessApiError('promo_permissions_unavailable', 503, null);
  const fetcher = options.fetcher || fetch;
  const supportStoreId = text(options.supportStoreId);
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(supportStoreId ? { 'X-PZ-Promo-Store': supportStoreId } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error;
    throw new PromoAccessApiError('promo_permissions_unavailable', 0, null);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new PromoAccessApiError(result?.error || result?.code, response.status, result);
  }
  return result as T;
}

function normalizeContext(value: any): PromoAccessContext {
  const planStates: PromoAccessPlan['state'][] = ['unconfigured', 'active', 'expiring', 'critical', 'grace', 'expired'];
  const planState = planStates.includes(value?.plan?.state) ? value.plan.state : 'unconfigured';
  const planCode = value?.plan?.code === 'basic' ? 'basic' : 'free';
  return {
    ok: true,
    user: {
      display_name: text(value?.user?.display_name),
      role: text(value?.user?.role),
    },
    store: {
      name: text(value?.store?.name),
      slug: text(value?.store?.slug),
      status: text(value?.store?.status),
    },
    site: {
      public_slug: text(value?.site?.public_slug),
      status: text(value?.site?.status),
    },
    access: {
      is_master: value?.access?.is_master === true,
      is_primary_admin: value?.access?.is_primary_admin === true,
      blocked_by_plan: value?.access?.blocked_by_plan === true,
      permissions: normalizePromoPermissions(value?.access?.permissions),
      reserved_permissions: knownList(
        value?.access?.reserved_permissions,
        KNOWN_RESERVED_PERMISSIONS,
        PROMO_RESERVED_PERMISSION_KEYS,
      ),
      allowed_actions: knownList(value?.access?.allowed_actions, KNOWN_ACTIONS, PROMO_ACTION_KEYS),
    },
    capabilities: normalizePromoCapabilities(value?.capabilities),
    plan: {
      code: planCode,
      name: text(value?.plan?.name),
      state: planState,
      days_remaining: value?.plan?.days_remaining === null ? null : nonNegativeInteger(value?.plan?.days_remaining),
      expires_at: text(value?.plan?.expires_at, 80),
      grace_expires_at: text(value?.plan?.grace_expires_at, 80),
      grace_days: nonNegativeInteger(value?.plan?.grace_days),
      in_grace: value?.plan?.in_grace === true,
      can_mutate: value?.plan?.can_mutate === true,
      public_allowed: value?.plan?.public_allowed === true,
      max_gallery_assets: nonNegativeInteger(value?.plan?.max_gallery_assets),
    },
    ...(value?.entitlement ? {
      entitlement: {
        source: text(value.entitlement.source),
        updated: text(value.entitlement.updated),
        capabilities: normalizePromoCapabilities(value.entitlement.capabilities),
      },
    } : {}),
  };
}

function normalizeTeamDetail(value: any): PromoTeamPermissionDetail {
  return {
    display_name: text(value?.display_name),
    role: text(value?.role),
    status: text(value?.status),
    is_primary_admin: value?.is_primary_admin === true,
    editable: value?.editable === true,
    assigned_permissions: normalizePromoPermissions(value?.assigned_permissions),
    effective_permissions: normalizePromoPermissions(value?.effective_permissions),
    version: nonNegativeInteger(value?.version),
  };
}

export async function getPromoAccessContext(options: PromoAccessClientOptions) {
  return normalizeContext(await postPromo<any>(options, PROMO_ACCESS_API_PATHS.context, {}));
}

export async function getPromoTeamPermissionDetail(userId: string, options: PromoAccessClientOptions) {
  const result = await postPromo<any>(options, PROMO_ACCESS_API_PATHS.teamDetail, {
    user_id: text(userId),
  });
  return { ...result, user: normalizeTeamDetail(result.user) };
}

export async function updatePromoTeamPermissions(
  userId: string,
  expectedVersion: number,
  permissions: readonly PromoPermissionKey[],
  reason: string,
  options: PromoAccessClientOptions,
) {
  const result = await postPromo<any>(options, PROMO_ACCESS_API_PATHS.updatePermissions, {
    user_id: text(userId),
    expected_version: strictExpectedVersion(expectedVersion),
    permissions: strictPermissionUpdate(permissions),
    reason: text(reason),
  });
  return { ...result, user: normalizeTeamDetail(result.user) };
}

export function updatePromoEntitlements(
  expectedUpdated: string,
  source: 'unassigned' | 'contract' | 'addon' | 'master_override',
  capabilities: Partial<Record<PromoCapabilityKey, boolean | number>>,
  reason: string,
  options: PromoAccessClientOptions,
) {
  return postPromo<any>(options, PROMO_ACCESS_API_PATHS.updateEntitlements, {
    expected_updated: text(expectedUpdated),
    source,
    capabilities,
    reason: text(reason),
  });
}
