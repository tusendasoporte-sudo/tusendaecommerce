import type { AdminStoreContext } from './storeContext.ts';
import {
  resolveStoreCapabilityAccess,
  type StoreCapabilityAccess,
} from './storeCapabilities.ts';
import { getStoreAccessContext, type StoreAccessContext } from './storeTeam.ts';
import { hasStorePermission } from './storeTeamPermissions.ts';

export const STOREFRONT_PUSH_CAMPAIGN_STATUSES = Object.freeze([
  'draft',
  'scheduled',
  'processing',
  'sent',
  'partially_sent',
  'failed',
  'canceled',
  'paused_plan',
] as const);

export const STOREFRONT_PUSH_TARGET_TYPES = Object.freeze([
  'home', 'product', 'category', 'section', 'order', 'raffle', 'coupon',
] as const);

export const STOREFRONT_PUSH_TARGET_SECTIONS = Object.freeze([
  'search', 'links', 'gifts', 'raffles', 'checkout',
] as const);

export const STOREFRONT_PUSH_AUDIENCE_TYPES = Object.freeze([
  'all_active', 'active_7d', 'active_30d', 'app_version',
  'notification_permission', 'country_region',
] as const);

export const STOREFRONT_PUSH_DAILY_LIMIT = 10;
export const STOREFRONT_PUSH_MONTHLY_LIMIT = 310;
export const STOREFRONT_PUSH_TITLE_MAX = 120;
export const STOREFRONT_PUSH_BODY_MAX = 1000;
export const STOREFRONT_PUSH_PAGE_SIZE = 50;

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const REGION_PATTERN = /^[A-Za-z0-9._ -]{1,80}$/;
const ADMIN_DEVICE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type StorefrontPushCampaignStatus = typeof STOREFRONT_PUSH_CAMPAIGN_STATUSES[number];
export type StorefrontPushTargetType = typeof STOREFRONT_PUSH_TARGET_TYPES[number];
export type StorefrontPushAudienceType = typeof STOREFRONT_PUSH_AUDIENCE_TYPES[number];

export type StorefrontPushCampaign = Readonly<{
  id: string;
  status: StorefrontPushCampaignStatus;
  title: string;
  body: string;
  media_id: string;
  audience_type: StorefrontPushAudienceType | '';
  audience_config: Readonly<Record<string, unknown>>;
  target_type: StorefrontPushTargetType | '';
  target_section: string;
  target_ref: string;
  target_path: string;
  timezone: string;
  scheduled_at: string;
  selected_count: number;
  accepted_count: number;
  failed_count: number;
  invalid_count: number;
  started_at: string;
  completed_at: string;
  canceled_at: string;
  failure_code: string;
  created: string;
  updated: string;
}>;

export type StorefrontPushAdminAccess = Readonly<{
  capability: StoreCapabilityAccess;
  storeAccess: StoreAccessContext | null;
  isPrimaryAdmin: boolean;
  hasPermission: boolean;
  allowed: boolean;
}>;

export type StorefrontPushAdminClient = Readonly<{
  baseUrl: string;
  token: string;
  supportStoreId?: string;
  adminDeviceToken?: string;
}>;

export type StorefrontPushCampaignForm = Readonly<{
  campaign_id?: unknown;
  title?: unknown;
  body?: unknown;
  media_id?: unknown;
  timezone?: unknown;
  audience_type?: unknown;
  app_version_code?: unknown;
  country_code?: unknown;
  region_code?: unknown;
  installation_id?: unknown;
  target_type?: unknown;
  target_ref?: unknown;
  target_section?: unknown;
}>;

export class StorefrontPushAdminError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400) {
    super(storefrontPushAdminErrorMessage(code));
    this.name = 'StorefrontPushAdminError';
    this.code = code;
    this.status = status;
  }
}

function text(value: unknown, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function recordObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function exactRecordId(value: unknown, optional = false) {
  const id = text(value, 15);
  if (!id && optional) return '';
  if (!RECORD_ID_PATTERN.test(id)) throw new StorefrontPushAdminError('invalid_record_id');
  return id;
}

function validateTimezone(value: unknown) {
  const timezone = text(value, 80);
  if (!TIMEZONE_PATTERN.test(timezone)) throw new StorefrontPushAdminError('invalid_timezone');
  try {
    new Intl.DateTimeFormat('es', { timeZone: timezone }).format(new Date());
  } catch (_) {
    throw new StorefrontPushAdminError('invalid_timezone');
  }
  return timezone;
}

function normalizedStatus(value: unknown): StorefrontPushCampaignStatus {
  const status = text(value, 30) as StorefrontPushCampaignStatus;
  return STOREFRONT_PUSH_CAMPAIGN_STATUSES.includes(status) ? status : 'draft';
}

export function normalizeStorefrontPushCampaign(value: unknown): StorefrontPushCampaign | null {
  const source = recordObject(value);
  const id = text(source.id, 15);
  if (!RECORD_ID_PATTERN.test(id)) return null;
  const audienceType = text(source.audience_type, 40) as StorefrontPushAudienceType;
  const targetType = text(source.target_type, 20) as StorefrontPushTargetType;
  return Object.freeze({
    id,
    status: normalizedStatus(source.status),
    title: text(source.title, STOREFRONT_PUSH_TITLE_MAX),
    body: text(source.body, STOREFRONT_PUSH_BODY_MAX),
    media_id: RECORD_ID_PATTERN.test(text(source.media_id, 15)) ? text(source.media_id, 15) : '',
    audience_type: STOREFRONT_PUSH_AUDIENCE_TYPES.includes(audienceType) ? audienceType : '',
    audience_config: Object.freeze({ ...recordObject(source.audience_config) }),
    target_type: STOREFRONT_PUSH_TARGET_TYPES.includes(targetType) ? targetType : '',
    target_section: text(source.target_section, 30),
    target_ref: RECORD_ID_PATTERN.test(text(source.target_ref, 15)) ? text(source.target_ref, 15) : '',
    target_path: text(source.target_path, 240),
    timezone: text(source.timezone, 80),
    scheduled_at: text(source.scheduled_at, 40),
    selected_count: integer(source.selected_count),
    accepted_count: integer(source.accepted_count),
    failed_count: integer(source.failed_count),
    invalid_count: integer(source.invalid_count),
    started_at: text(source.started_at, 40),
    completed_at: text(source.completed_at, 40),
    canceled_at: text(source.canceled_at, 40),
    failure_code: text(source.failure_code, 80),
    created: text(source.created, 40),
    updated: text(source.updated, 40),
  });
}

export function normalizeStorefrontPushCampaigns(value: unknown) {
  if (!Array.isArray(value)) return [] as StorefrontPushCampaign[];
  return value
    .map(normalizeStorefrontPushCampaign)
    .filter((campaign): campaign is StorefrontPushCampaign => campaign !== null);
}

export function resolveStorefrontPushQuotaTimezone(
  campaigns: readonly StorefrontPushCampaign[],
  fallback: unknown = 'America/Havana',
) {
  let fallbackTimezone = 'America/Havana';
  try {
    fallbackTimezone = validateTimezone(fallback);
  } catch (_) {}
  for (const campaign of campaigns) {
    if (!campaign.started_at || !campaign.timezone) continue;
    try {
      return validateTimezone(campaign.timezone);
    } catch (_) {}
  }
  return fallbackTimezone;
}

export async function resolveStorefrontPushAdminAccess(
  adminContext: Pick<AdminStoreContext, 'store' | 'storeId' | 'isMasterSupport'>,
  options: { baseUrl?: string; token: string; storeAccess?: StoreAccessContext | null },
): Promise<StorefrontPushAdminAccess> {
  const capability = resolveStoreCapabilityAccess(
    adminContext?.store && typeof adminContext.store === 'object'
      ? adminContext.store as Record<string, unknown>
      : null,
    'push_campaigns_enabled',
    { enforceExpiration: true },
  );
  const storeAccess = options.storeAccess === undefined
    ? await getStoreAccessContext({
        baseUrl: options.baseUrl,
        token: options.token,
        supportStoreId: adminContext.isMasterSupport ? adminContext.storeId : undefined,
      }).catch(() => null)
    : options.storeAccess;
  const isPrimaryAdmin = adminContext.isMasterSupport || storeAccess?.access.is_primary_admin === true;
  const hasPermission = adminContext.isMasterSupport || Boolean(storeAccess && hasStorePermission({
    permissions: storeAccess.access.permissions,
    is_primary_admin: storeAccess.access.is_primary_admin,
    blocked_by_plan: storeAccess.access.blocked_by_plan,
  }, 'marketing.push.manage'));
  return Object.freeze({
    capability,
    storeAccess,
    isPrimaryAdmin,
    hasPermission,
    allowed: capability.allowed && hasPermission,
  });
}

export function buildStorefrontPushAudienceConfig(
  audienceTypeValue: unknown,
  form: StorefrontPushCampaignForm,
  targetTypeValue: unknown,
) {
  const audienceType = text(audienceTypeValue, 40) as StorefrontPushAudienceType;
  const targetType = text(targetTypeValue, 20) as StorefrontPushTargetType;
  if (!STOREFRONT_PUSH_AUDIENCE_TYPES.includes(audienceType)) {
    throw new StorefrontPushAdminError('invalid_audience');
  }
  if (targetType === 'order') {
    if (audienceType !== 'all_active') throw new StorefrontPushAdminError('order_audience_required');
    return { installation_id: exactRecordId(form.installation_id) };
  }
  if (['all_active', 'active_7d', 'active_30d'].includes(audienceType)) return {};
  if (audienceType === 'app_version') {
    const appVersionCode = Number(form.app_version_code);
    if (!Number.isInteger(appVersionCode) || appVersionCode < 1) {
      throw new StorefrontPushAdminError('invalid_audience');
    }
    return { app_version_code: appVersionCode };
  }
  if (audienceType === 'notification_permission') return { permission: 'granted' };
  const countryCode = text(form.country_code, 2).toUpperCase();
  const regionCode = text(form.region_code, 80);
  if (!COUNTRY_PATTERN.test(countryCode) || (regionCode && !REGION_PATTERN.test(regionCode))) {
    throw new StorefrontPushAdminError('invalid_audience');
  }
  return { country_code: countryCode, ...(regionCode ? { region_code: regionCode } : {}) };
}

export function buildStorefrontPushCampaignPayload(formValue: StorefrontPushCampaignForm) {
  const form = recordObject(formValue) as StorefrontPushCampaignForm;
  const title = text(form.title, STOREFRONT_PUSH_TITLE_MAX + 1);
  const body = text(form.body, STOREFRONT_PUSH_BODY_MAX + 1);
  if (!title || title.length > STOREFRONT_PUSH_TITLE_MAX || /[\u0000-\u001f\u007f]/.test(title)) {
    throw new StorefrontPushAdminError('invalid_title');
  }
  if (!body || body.length > STOREFRONT_PUSH_BODY_MAX
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) {
    throw new StorefrontPushAdminError('invalid_body');
  }
  const targetType = text(form.target_type, 20) as StorefrontPushTargetType;
  if (!STOREFRONT_PUSH_TARGET_TYPES.includes(targetType)) {
    throw new StorefrontPushAdminError('invalid_target');
  }
  const targetSection = text(form.target_section, 30);
  const targetRef = text(form.target_ref, 15);
  if (targetType === 'home' && (targetSection || targetRef)) {
    throw new StorefrontPushAdminError('invalid_target');
  }
  if (targetType === 'section') {
    if (targetRef || !STOREFRONT_PUSH_TARGET_SECTIONS.includes(targetSection as any)) {
      throw new StorefrontPushAdminError('invalid_target');
    }
  } else if (targetType !== 'home') {
    exactRecordId(targetRef);
    if (targetSection) throw new StorefrontPushAdminError('invalid_target');
  }
  const audienceType = text(form.audience_type, 40) as StorefrontPushAudienceType;
  const audienceConfig = buildStorefrontPushAudienceConfig(audienceType, form, targetType);
  return {
    campaign_id: exactRecordId(form.campaign_id, true),
    title,
    body,
    media_id: exactRecordId(form.media_id, true),
    timezone: validateTimezone(form.timezone),
    audience_type: audienceType,
    audience_config: audienceConfig,
    target_type: targetType,
    target_ref: targetType === 'section' || targetType === 'home' ? '' : targetRef,
    target_section: targetType === 'section' ? targetSection : '',
  };
}

export function buildStorefrontPushSchedulePayload(
  campaignIdValue: unknown,
  modeValue: unknown,
  scheduledAtValue?: unknown,
  nowValue: Date = new Date(),
) {
  const campaignId = exactRecordId(campaignIdValue);
  const mode = text(modeValue, 20);
  if (mode === 'now') return { campaign_id: campaignId, mode: 'now' };
  if (mode !== 'scheduled') throw new StorefrontPushAdminError('invalid_schedule');
  const scheduledAt = new Date(String(scheduledAtValue || ''));
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < nowValue.getTime() + 30_000) {
    throw new StorefrontPushAdminError('invalid_schedule');
  }
  return { campaign_id: campaignId, mode: 'scheduled', scheduled_at: scheduledAt.toISOString() };
}

function normalizedBaseUrl(value: unknown) {
  const raw = text(value, 500).replace(/\/+$/, '');
  let parsed: URL;
  try { parsed = new URL(raw); } catch (_) { throw new StorefrontPushAdminError('campaign_backend_unavailable', 503); }
  const localHttp = parsed.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password) {
    throw new StorefrontPushAdminError('campaign_backend_unavailable', 503);
  }
  return parsed.toString().replace(/\/+$/, '');
}

export async function storefrontPushAdminRequest(
  client: StorefrontPushAdminClient,
  pathValue: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    query?: Record<string, string | number | undefined>;
    fetchImpl?: typeof fetch;
  } = {},
) {
  const path = String(pathValue || '');
  if (!/^\/api\/pz\/storefront\/v1\/campaigns(?:\/|$)/.test(path) || /[?#]/.test(path)) {
    throw new StorefrontPushAdminError('invalid_request_path');
  }
  const token = text(client?.token, 8192);
  if (!token) throw new StorefrontPushAdminError('unauthorized', 403);
  const url = new URL(`${normalizedBaseUrl(client.baseUrl)}${path}`);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const supportStoreId = text(client.supportStoreId, 15);
  if (supportStoreId) headers['X-PZ-Support-Store'] = exactRecordId(supportStoreId);
  const adminDeviceToken = text(client.adminDeviceToken, 43);
  if (ADMIN_DEVICE_PATTERN.test(adminDeviceToken)) headers['X-PZ-Admin-Device'] = adminDeviceToken;
  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body ?? {});
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    method,
    headers,
    body,
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => null) as any;
  if (!response.ok || result?.ok !== true) {
    throw new StorefrontPushAdminError(text(result?.error, 80) || 'campaign_request_failed', response.status);
  }
  return result;
}

export async function saveStorefrontPushCampaign(
  client: StorefrontPushAdminClient,
  form: StorefrontPushCampaignForm,
  fetchImpl?: typeof fetch,
) {
  const result = await storefrontPushAdminRequest(client, '/api/pz/storefront/v1/campaigns/save', {
    method: 'POST', body: buildStorefrontPushCampaignPayload(form), fetchImpl,
  });
  const campaign = normalizeStorefrontPushCampaign(result.campaign);
  if (!campaign) throw new StorefrontPushAdminError('campaign_invalid_response', 502);
  return campaign;
}

export async function previewStorefrontPushAudience(
  client: StorefrontPushAdminClient,
  campaignId: string,
  fetchImpl?: typeof fetch,
) {
  const result = await storefrontPushAdminRequest(client, '/api/pz/storefront/v1/campaigns/audience-preview', {
    method: 'POST', body: { campaign_id: exactRecordId(campaignId) }, fetchImpl,
  });
  return Object.freeze({
    count: integer(result?.audience?.count),
    snapshot: result?.audience?.snapshot === true,
  });
}

export async function scheduleStorefrontPushCampaign(
  client: StorefrontPushAdminClient,
  campaignId: string,
  mode: 'now' | 'scheduled',
  scheduledAt: unknown,
  fetchImpl?: typeof fetch,
) {
  const result = await storefrontPushAdminRequest(client, '/api/pz/storefront/v1/campaigns/schedule', {
    method: 'POST',
    body: buildStorefrontPushSchedulePayload(campaignId, mode, scheduledAt),
    fetchImpl,
  });
  const campaign = normalizeStorefrontPushCampaign(result.campaign);
  if (!campaign) throw new StorefrontPushAdminError('campaign_invalid_response', 502);
  return campaign;
}

export async function mutateStorefrontPushCampaign(
  client: StorefrontPushAdminClient,
  action: 'cancel' | 'duplicate',
  campaignId: string,
  fetchImpl?: typeof fetch,
) {
  const result = await storefrontPushAdminRequest(
    client,
    `/api/pz/storefront/v1/campaigns/${action}`,
    { method: 'POST', body: { campaign_id: exactRecordId(campaignId) }, fetchImpl },
  );
  const campaign = normalizeStorefrontPushCampaign(result.campaign);
  if (!campaign) throw new StorefrontPushAdminError('campaign_invalid_response', 502);
  return campaign;
}

export function storefrontPushCampaignActions(statusValue: unknown) {
  const status = normalizedStatus(statusValue);
  return Object.freeze({
    edit: status === 'draft',
    schedule: status === 'draft' || status === 'paused_plan',
    cancel: ['draft', 'scheduled', 'paused_plan'].includes(status),
    duplicate: true,
    detail: true,
  });
}

export function filterStorefrontPushCampaigns(
  campaigns: readonly StorefrontPushCampaign[],
  queryValue: unknown,
) {
  const query = text(queryValue, 120).toLocaleLowerCase('es');
  if (!query) return [...campaigns];
  return campaigns.filter((campaign) => [
    campaign.title,
    campaign.body,
    campaign.target_path,
    campaignStatusLabel(campaign.status),
  ].some((value) => value.toLocaleLowerCase('es').includes(query)));
}

export function campaignStatusLabel(statusValue: unknown) {
  const labels: Record<StorefrontPushCampaignStatus, string> = {
    draft: 'Borrador',
    scheduled: 'Programada',
    processing: 'Procesando',
    sent: 'Enviada',
    partially_sent: 'Envío parcial',
    failed: 'Fallida',
    canceled: 'Cancelada',
    paused_plan: 'Pausada por plan',
  };
  return labels[normalizedStatus(statusValue)];
}

export function storefrontPushAdminErrorMessage(codeValue: unknown) {
  const code = text(codeValue, 100);
  const messages: Record<string, string> = {
    unauthorized: 'Tu sesión venció. Inicia sesión nuevamente.',
    permission_denied: 'No tienes el permiso marketing.push.manage.',
    plan_not_available: 'Campañas push requiere un plan Premium activo.',
    invalid_payload: 'Revisa los campos del formulario.',
    invalid_record_id: 'El destino debe usar un identificador válido de 15 caracteres.',
    invalid_title: `El título es obligatorio y admite hasta ${STOREFRONT_PUSH_TITLE_MAX} caracteres.`,
    invalid_body: `El mensaje es obligatorio y admite hasta ${STOREFRONT_PUSH_BODY_MAX} caracteres.`,
    invalid_timezone: 'La zona horaria no es válida.',
    invalid_schedule: 'Elige una fecha futura para programar la campaña.',
    invalid_audience: 'La configuración de audiencia no es válida.',
    invalid_target: 'Selecciona un destino válido. No se permiten URLs libres.',
    target_not_found: 'El destino no existe en esta tienda.',
    target_unavailable: 'El destino ya no está disponible o vigente.',
    order_audience_required: 'Los pedidos requieren una instalación vinculada de la misma tienda.',
    order_link_required: 'No existe un vínculo seguro entre ese pedido y la instalación.',
    media_not_found: 'La imagen WebP no existe en esta tienda.',
    media_unavailable: 'La imagen WebP ya no está disponible.',
    media_expires_before_send: 'La imagen vencerá antes del envío. Carga una nueva.',
    media_input_too_large: 'La imagen supera el máximo de entrada de 8 MiB.',
    media_invalid_type: 'Usa una imagen JPG, PNG o WebP real.',
    media_invalid_dimensions: 'La imagen supera 6000 px por lado o 36 megapíxeles.',
    media_invalid_file: 'No se pudo decodificar la imagen seleccionada.',
    media_output_too_large: 'La imagen no pudo optimizarse por debajo de 100 KiB.',
    media_queue_full: 'El procesador de imágenes está ocupado. Intenta nuevamente.',
    media_quota_exceeded: 'La tienda alcanzó su cuota de medios push.',
    media_storage_full: 'El almacenamiento no admite nuevas imágenes en este momento.',
    media_upload_failed: 'No se pudo convertir o cargar la imagen.',
    media_list_failed: 'No se pudo cargar la biblioteca de imágenes.',
    app_config_unavailable: 'La app pública de esta tienda no está activa.',
    campaign_not_found: 'La campaña no existe en esta tienda.',
    campaign_not_editable: 'Solo los borradores se pueden editar.',
    campaign_not_schedulable: 'La campaña ya comenzó o no se puede programar.',
    campaign_not_cancelable: 'La campaña ya comenzó y no se puede cancelar.',
    partial_delivery_failure: 'Firebase aceptó solo una parte de los mensajes.',
    invalid_fid: 'Una o más instalaciones dejaron de ser válidas para Firebase.',
    daily_quota_exceeded: `Se alcanzó el límite permanente de ${STOREFRONT_PUSH_DAILY_LIMIT} campañas diarias.`,
    monthly_quota_exceeded: `Se alcanzó el límite permanente de ${STOREFRONT_PUSH_MONTHLY_LIMIT} campañas mensuales.`,
    timezone_mismatch: 'Usa la misma zona horaria de las campañas iniciadas de esta tienda.',
    relay_not_configured: 'El canal de envío no está disponible. Intenta más tarde.',
    campaign_backend_unavailable: 'No se pudo conectar con el servicio de campañas.',
    campaign_invalid_response: 'El servicio devolvió una respuesta inesperada.',
    campaign_request_failed: 'No se pudo completar la operación.',
  };
  return messages[code] || 'No se pudo completar la operación. Intenta nuevamente.';
}

export function readStorefrontPushAdminCookie(cookieHeader: unknown, name: string) {
  const prefix = `${name}=`;
  const entry = String(cookieHeader || '').split(';').map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

export function readStorefrontPushAdminAuthToken(cookieHeader: unknown) {
  const raw = readStorefrontPushAdminCookie(cookieHeader, 'pb_auth');
  if (!raw) return '';
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return typeof parsed?.token === 'string' ? parsed.token : '';
  } catch (_) {
    return '';
  }
}
