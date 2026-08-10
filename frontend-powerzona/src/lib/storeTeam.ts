import {
  isStorePermissionTemplateCode,
  normalizeStorePermissions,
  type StorePermission,
  type StorePermissionTemplateCode,
} from './storeTeamPermissions.ts';
import {
  validateStoreTeamDeleteReason,
  type StoreTeamDeleteReasonCode,
} from './storeTeamDeleteReasons.ts';

export const STORE_TEAM_API_PATHS = Object.freeze({
  accessContext: '/api/pz/store/access/context',
  summary: '/api/pz/store/team/summary',
  list: '/api/pz/store/team/list',
  detail: '/api/pz/store/team/detail',
  create: '/api/pz/store/team/create',
  update: '/api/pz/store/team/update',
  suspend: '/api/pz/store/team/suspend',
  reactivate: '/api/pz/store/team/reactivate',
  issueTemporaryAccess: '/api/pz/store/team/issue-temporary-access',
  revokeSessions: '/api/pz/store/team/revoke-sessions',
  revokeDevices: '/api/pz/store/team/revoke-devices',
  delete: '/api/pz/store/team/delete',
  audit: '/api/pz/store/team/audit',
});

export type StoreTeamClientOptions = Readonly<{
  baseUrl?: string;
  token: string;
  supportStoreId?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}>;

export type StoreAccessContext = {
  ok: true;
  user: { display_name: string; role: string };
  store: { name: string; slug: string };
  access: {
    is_primary_admin: boolean;
    blocked_by_plan: boolean;
    permissions: StorePermission[];
    template_code: StorePermissionTemplateCode | 'primary_admin';
  };
  plan: {
    code: string;
    max_active_users: number;
    product_expiration_tools_enabled: boolean;
    [key: string]: unknown;
  };
};

export type StoreTeamPlan = {
  code: string;
  label: string;
  max_active_users: number;
  [key: string]: unknown;
};

export type StoreTeamCounts = {
  active: number;
  total: number;
  available: number;
};

export type StoreTeamSummary = {
  ok: true;
  store: { id?: string; name?: string; slug?: string; [key: string]: unknown };
  primary_admin?: StoreTeamUser | null;
  user_counts: StoreTeamCounts;
  plan: StoreTeamPlan;
  can_create: boolean;
  principal_pending: boolean;
};

export type StoreTeamUserState =
  | 'active'
  | 'suspended'
  | 'blocked_by_plan'
  | 'temporary_password_pending'
  | 'temporary_password_expired'
  | string;

export type StoreTeamUser = {
  id: string;
  email: string;
  display_name: string;
  phone: string;
  role: string;
  status: string;
  template_code: StorePermissionTemplateCode;
  permissions: StorePermission[];
  state: StoreTeamUserState;
  is_primary_admin: boolean;
  blocked_by_plan?: boolean;
  temporary_password_state: 'none' | 'pending' | 'expired' | string;
  temporary_password_expires_at: string;
  last_activity_at: string;
  authorized_device_count: number;
  [key: string]: unknown;
};

export type StoreTeamListResponse = StoreTeamSummary & { users: StoreTeamUser[] };
export type StoreTeamDetailResponse = { ok: true; user: StoreTeamUser; plan?: StoreTeamPlan; [key: string]: unknown };
export type StoreTeamAuditEntry = {
  id: string;
  action: string;
  actor_name: string;
  reason: string;
  reason_code?: StoreTeamDeleteReasonCode | '';
  reason_label_snapshot?: string;
  reason_detail?: string;
  created: string;
  previous_template_code?: string;
  new_template_code?: string;
  previous_permissions?: StorePermission[];
  new_permissions?: StorePermission[];
  [key: string]: unknown;
};

export type StoreTeamAuditResponse = {
  ok: true;
  audit: StoreTeamAuditEntry[];
  pagination?: { page: number; per_page: number; total_items: number; total_pages: number };
};

export type StoreTeamUserInput = {
  email: string;
  display_name: string;
  phone?: string;
  template_code: StorePermissionTemplateCode;
  permissions?: readonly StorePermission[] | string[];
  reason?: string;
};

export type StoreTeamTemporaryAccessResponse = {
  ok: true;
  user?: StoreTeamUser;
  user_id?: string;
  temporary_password: string;
  temporary_password_expires_at: string;
  plan?: StoreTeamPlan;
  [key: string]: unknown;
};

export type StoreTeamDeleteResponse = {
  ok: true;
  user_deleted: true;
  user_id: string;
  sessions_revoked: true;
  [key: string]: unknown;
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: 'Tu sesión venció. Inicia sesión nuevamente.',
  unauthorized: 'No tienes permiso para administrar este equipo.',
  permission_denied: 'No tienes permiso para realizar esta acción.',
  primary_admin_required: 'Solo el Administrador principal puede administrar el equipo.',
  primary_admin_pending: 'El Administrador principal de esta tienda aún no está definido.',
  principal_not_configured: 'El Administrador principal de esta tienda aún no está definido.',
  user_not_found: 'No se encontró el usuario en esta tienda.',
  email_exists: 'Este correo ya está registrado.',
  invalid_email: 'Escribe un correo válido.',
  invalid_permissions: 'La selección de permisos no es válida.',
  invalid_template: 'Selecciona una plantilla válida.',
  reserved_permission: 'Ese permiso está reservado y no se puede asignar.',
  self_management_forbidden: 'Administra tu propia cuenta desde Mi cuenta.',
  primary_admin_protected: 'El Administrador principal está protegido.',
  active_user_limit_reached: 'La tienda alcanzó el límite de usuarios activos de su plan.',
  blocked_by_plan: 'El plan actual no permite activar este acceso.',
  temporary_access_failed: 'No se pudo emitir el acceso temporal.',
  team_unavailable: 'La gestión del equipo no está disponible temporalmente.',
  team_request_failed: 'No se pudo comunicar con la plataforma. Inténtalo nuevamente.',
  team_create_failed: 'No se pudo crear el usuario.',
  team_update_failed: 'No se pudo actualizar el usuario.',
  session_revocation_failed: 'No se pudieron cerrar las sesiones.',
  device_revocation_failed: 'No se pudieron revocar los dispositivos.',
  delete_confirmation_mismatch: 'El correo de confirmación no coincide con el usuario.',
  delete_reason_required: 'Selecciona un motivo de eliminación.',
  delete_reason_invalid: 'Selecciona un motivo válido.',
  delete_reason_detail_required: 'Explica brevemente el motivo.',
  delete_reason_detail_too_short: 'La explicación debe tener al menos 8 caracteres.',
  delete_reason_detail_too_long: 'La explicación no puede superar 300 caracteres.',
  delete_reason_detail_invalid: 'La explicación contiene caracteres no permitidos.',
  last_active_admin_required: 'La tienda debe conservar al menos un administrador activo.',
  primary_admin_replacement_required: 'El Administrador principal está protegido y debe reemplazarse desde Master Admin.',
  user_delete_failed: 'No se pudo eliminar el usuario. No se aplicó ningún cambio.',
  audit_load_failed: 'No se pudo cargar la auditoría.',
};

function text(value: unknown) {
  try {
    return String(value === null || value === undefined ? '' : value).trim();
  } catch (_) {
    return '';
  }
}

function nonNegativeInteger(value: unknown, fallback = 0) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate >= 0 ? Math.floor(candidate) : fallback;
}

function normalizedBaseUrl(value: unknown) {
  const explicit = text(value);
  const environment = text((import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.PUBLIC_POCKETBASE_URL);
  return (explicit || environment).replace(/\/+$/, '');
}

function normalizeTemplateCode(value: unknown): StorePermissionTemplateCode {
  return isStorePermissionTemplateCode(value) ? value : 'custom';
}

function normalizeUser(value: any): StoreTeamUser {
  return {
    ...(value || {}),
    id: text(value?.id),
    email: text(value?.email),
    display_name: text(value?.display_name || value?.name),
    phone: text(value?.phone),
    role: text(value?.role),
    status: text(value?.status || 'active'),
    template_code: normalizeTemplateCode(value?.template_code),
    permissions: normalizeStorePermissions(value?.permissions ?? value?.permissions_json),
    state: text(value?.state || (value?.blocked_by_plan ? 'blocked_by_plan' : value?.status || 'active')),
    is_primary_admin: value?.is_primary_admin === true,
    blocked_by_plan: value?.blocked_by_plan === true,
    temporary_password_state: text(value?.temporary_password_state || 'none'),
    temporary_password_expires_at: text(value?.temporary_password_expires_at),
    last_activity_at: text(value?.last_activity_at || value?.last_admin_activity_at),
    authorized_device_count: nonNegativeInteger(value?.authorized_device_count),
  };
}

function normalizeCounts(value: any): StoreTeamCounts {
  return {
    active: nonNegativeInteger(value?.active),
    total: nonNegativeInteger(value?.total),
    available: nonNegativeInteger(value?.available),
  };
}

function normalizePlan(value: any): StoreTeamPlan {
  return {
    ...(value || {}),
    code: text(value?.code),
    label: text(value?.label || value?.name),
    max_active_users: nonNegativeInteger(value?.max_active_users),
  };
}

function normalizeSummary<T extends Record<string, any>>(value: T): T & StoreTeamSummary {
  return {
    ...value,
    ok: true,
    store: value?.store || {},
    primary_admin: value?.primary_admin ? normalizeUser(value.primary_admin) : null,
    user_counts: normalizeCounts(value?.user_counts),
    plan: normalizePlan(value?.plan),
    can_create: value?.can_create === true,
    principal_pending: value?.principal_pending === true,
  };
}

export class StoreTeamApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly response: unknown;

  constructor(code: string, status: number, response: unknown) {
    const safeCode = text(code) || 'team_request_failed';
    const serverMessage = text((response as any)?.message);
    super(ERROR_MESSAGES[safeCode] || serverMessage || 'No se pudo completar la acción. Inténtalo nuevamente.');
    this.name = 'StoreTeamApiError';
    this.code = safeCode;
    this.status = status;
    this.response = response;
  }
}

async function postStoreTeam<T>(
  options: StoreTeamClientOptions,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = text(options?.token);
  const baseUrl = normalizedBaseUrl(options?.baseUrl);
  if (!token) throw new StoreTeamApiError('unauthenticated', 401, null);
  if (!baseUrl) throw new StoreTeamApiError('team_request_failed', 503, null);
  const fetcher = options.fetcher || fetch;
  const browserSupportStoreId = typeof window === 'undefined'
    ? ''
    : text((window as any).PZ_MASTER_SUPPORT_CONTEXT?.storeId);
  const supportStoreId = text(options?.supportStoreId) || browserSupportStoreId;
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(supportStoreId ? { 'X-PZ-Support-Store': supportStoreId } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    throw new StoreTeamApiError('team_request_failed', 0, null);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new StoreTeamApiError(result?.error || result?.code, response.status, result);
  }
  return result as T;
}

function requiredUserId(value: unknown) {
  const userId = text(value);
  if (!userId) throw new StoreTeamApiError('user_not_found', 400, null);
  return userId;
}

function userPayload(input: StoreTeamUserInput) {
  const email = text(input?.email).toLowerCase();
  const displayName = text(input?.display_name);
  const templateCode = normalizeTemplateCode(input?.template_code);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StoreTeamApiError('invalid_email', 400, null);
  }
  if (!displayName) throw new StoreTeamApiError('invalid_display_name', 400, null);
  return {
    email,
    display_name: displayName,
    phone: text(input?.phone),
    template_code: templateCode,
    permissions: normalizeStorePermissions(input?.permissions),
    reason: text(input?.reason),
  };
}

export async function getStoreAccessContext(options: StoreTeamClientOptions): Promise<StoreAccessContext> {
  const result = await postStoreTeam<any>(options, STORE_TEAM_API_PATHS.accessContext, {});
  return {
    ...result,
    user: {
      display_name: text(result?.user?.display_name),
      role: text(result?.user?.role),
    },
    store: {
      name: text(result?.store?.name),
      slug: text(result?.store?.slug),
    },
    access: {
      is_primary_admin: result?.access?.is_primary_admin === true,
      blocked_by_plan: result?.access?.blocked_by_plan === true,
      permissions: normalizeStorePermissions(result?.access?.permissions),
      template_code: result?.access?.template_code === 'primary_admin'
        ? 'primary_admin'
        : normalizeTemplateCode(result?.access?.template_code),
    },
    plan: {
      ...(result?.plan || {}),
      code: text(result?.plan?.code),
      max_active_users: nonNegativeInteger(result?.plan?.max_active_users),
      product_expiration_tools_enabled: result?.plan?.product_expiration_tools_enabled === true,
    },
  };
}

export async function getStoreTeamSummary(options: StoreTeamClientOptions): Promise<StoreTeamSummary> {
  return normalizeSummary(await postStoreTeam<any>(options, STORE_TEAM_API_PATHS.summary, {}));
}

export async function listStoreTeamUsers(options: StoreTeamClientOptions): Promise<StoreTeamListResponse> {
  const result = normalizeSummary(await postStoreTeam<any>(options, STORE_TEAM_API_PATHS.list, {}));
  return { ...result, users: Array.isArray(result.users) ? result.users.map(normalizeUser) : [] };
}

export async function getStoreTeamUserDetail(userId: string, options: StoreTeamClientOptions): Promise<StoreTeamDetailResponse> {
  const result = await postStoreTeam<any>(options, STORE_TEAM_API_PATHS.detail, { user_id: requiredUserId(userId) });
  return { ...result, user: normalizeUser(result.user), plan: result.plan ? normalizePlan(result.plan) : undefined };
}

export async function createStoreTeamUser(input: StoreTeamUserInput, options: StoreTeamClientOptions) {
  const result = await postStoreTeam<any>(options, STORE_TEAM_API_PATHS.create, userPayload(input));
  return {
    ...result,
    user: normalizeUser(result.user),
    temporary_password: text(result.temporary_password),
    temporary_password_expires_at: text(result.temporary_password_expires_at),
    plan: result.plan ? normalizePlan(result.plan) : undefined,
  } as StoreTeamTemporaryAccessResponse & { user: StoreTeamUser };
}

export async function updateStoreTeamUser(userId: string, input: StoreTeamUserInput, options: StoreTeamClientOptions) {
  const result = await postStoreTeam<any>(options, STORE_TEAM_API_PATHS.update, {
    user_id: requiredUserId(userId),
    ...userPayload(input),
  });
  return { ...result, user: normalizeUser(result.user), plan: result.plan ? normalizePlan(result.plan) : undefined };
}

async function userAction(
  path: string,
  userId: string,
  reason: string,
  options: StoreTeamClientOptions,
) {
  return postStoreTeam<any>(options, path, { user_id: requiredUserId(userId), reason: text(reason) });
}

export function suspendStoreTeamUser(userId: string, reason: string, options: StoreTeamClientOptions) {
  return userAction(STORE_TEAM_API_PATHS.suspend, userId, reason, options);
}

export function reactivateStoreTeamUser(userId: string, reason: string, options: StoreTeamClientOptions) {
  return userAction(STORE_TEAM_API_PATHS.reactivate, userId, reason, options);
}

export async function issueStoreTeamTemporaryAccess(
  userId: string,
  reason: string,
  options: StoreTeamClientOptions,
): Promise<StoreTeamTemporaryAccessResponse> {
  const result = await userAction(STORE_TEAM_API_PATHS.issueTemporaryAccess, userId, reason, options);
  return {
    ...result,
    user: result.user ? normalizeUser(result.user) : undefined,
    user_id: text(result.user_id || userId),
    temporary_password: text(result.temporary_password),
    temporary_password_expires_at: text(result.temporary_password_expires_at),
    plan: result.plan ? normalizePlan(result.plan) : undefined,
  };
}

export function revokeStoreTeamUserSessions(userId: string, reason: string, options: StoreTeamClientOptions) {
  return userAction(STORE_TEAM_API_PATHS.revokeSessions, userId, reason, options);
}

export function revokeStoreTeamUserDevices(userId: string, reason: string, options: StoreTeamClientOptions) {
  return userAction(STORE_TEAM_API_PATHS.revokeDevices, userId, reason, options);
}

export async function deleteStoreTeamUser(
  userId: string,
  confirmationEmail: string,
  reasonCode: StoreTeamDeleteReasonCode,
  reasonDetail: string,
  options: StoreTeamClientOptions,
): Promise<StoreTeamDeleteResponse> {
  const email = text(confirmationEmail).toLowerCase();
  if (!email) throw new StoreTeamApiError('delete_confirmation_mismatch', 400, null);
  const validatedReason = validateStoreTeamDeleteReason(reasonCode, reasonDetail);
  if (!validatedReason.ok) throw new StoreTeamApiError(validatedReason.error, 400, null);
  const result = await postStoreTeam<any>(options, STORE_TEAM_API_PATHS.delete, {
    user_id: requiredUserId(userId),
    confirmation_email: email,
    reason_code: validatedReason.value.reason_code,
    reason_detail: validatedReason.value.reason_detail,
  });
  return {
    ...result,
    ok: true,
    user_deleted: result?.user_deleted === true,
    user_id: text(result?.user_id || userId),
    sessions_revoked: result?.sessions_revoked === true,
  } as StoreTeamDeleteResponse;
}

export async function getStoreTeamUserAudit(
  userId: string,
  page = 1,
  perPage = 20,
  options: StoreTeamClientOptions,
): Promise<StoreTeamAuditResponse> {
  const result = await postStoreTeam<any>(options, STORE_TEAM_API_PATHS.audit, {
    user_id: requiredUserId(userId),
    page: Math.max(1, nonNegativeInteger(page, 1)),
    per_page: Math.min(50, Math.max(1, nonNegativeInteger(perPage, 20))),
  });
  return {
    ...result,
    audit: Array.isArray(result.audit) ? result.audit : [],
  };
}

export function getStoreTeamErrorCode(error: unknown) {
  return text((error as any)?.code || (error as any)?.data?.error || (error as any)?.response?.error);
}

export function getStoreTeamErrorMessage(error: unknown) {
  const code = getStoreTeamErrorCode(error);
  return ERROR_MESSAGES[code] || text((error as any)?.message) || 'No se pudo completar la acción. Inténtalo nuevamente.';
}

export function formatStoreTeamActiveCount(active: unknown, limit: unknown) {
  return `${nonNegativeInteger(active)} de ${nonNegativeInteger(limit)}`;
}

export function canCreateStoreTeamUser(summary: Pick<StoreTeamSummary, 'can_create' | 'user_counts' | 'plan'> | null | undefined) {
  return summary?.can_create === true &&
    nonNegativeInteger(summary.user_counts?.available) > 0 &&
    nonNegativeInteger(summary.plan?.max_active_users) > 1;
}
