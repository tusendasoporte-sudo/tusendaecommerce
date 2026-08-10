import { getStoreAdminPath } from './adminRoutes.ts';

export const STORE_ACTIVITY_API_PATHS = Object.freeze({
  summary: '/api/pz/store/activity/summary',
  list: '/api/pz/store/activity/list',
  detail: '/api/pz/store/activity/detail',
  review: '/api/pz/store/activity/review',
  userReport: '/api/pz/store/activity/user-report',
  self: '/api/pz/store/activity/self',
  lastModified: '/api/pz/store/activity/last-modified',
});

export const STORE_ACTIVITY_PAGE_SIZE = 20;
export const STORE_ACTIVITY_LAST_MODIFIED_BATCH_LIMIT = 100;

export type StoreActivitySeverity = 'normal' | 'important' | 'critical';
export type StoreActivityReviewStatus = 'pending' | 'reviewed' | 'requires_correction';
export type StoreActivityActorState = 'active' | 'deleted' | 'system' | string;

export type StoreActivityClientOptions = Readonly<{
  baseUrl?: string;
  token: string;
  supportStoreId?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}>;

export type StoreActivityFilters = Readonly<{
  user_id?: string;
  module?: string;
  action?: string;
  severity?: string;
  review_status?: string;
  resource_type?: string;
  resource_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  per_page?: number;
}>;

export type StoreActivityActor = {
  name: string;
  role: string;
  template_code: string;
  state: StoreActivityActorState;
  is_deleted: boolean;
  is_system: boolean;
};

export type StoreActivityResource = {
  type: string;
  label: string;
  state: string;
  exists: boolean;
  route_key: string;
  id_snapshot: string;
  path: string;
  history_path: string;
};

export type StoreActivityChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type StoreActivityReview = {
  status: StoreActivityReviewStatus;
  note: string;
  reviewed_at: string;
  reviewed_by_name: string;
};

export type StoreActivityEvent = {
  id: string;
  created: string;
  actor: StoreActivityActor;
  module: string;
  action: string;
  severity: StoreActivitySeverity;
  summary: string;
  changes: StoreActivityChange[];
  resource: StoreActivityResource;
  review: StoreActivityReview;
  can_review: boolean;
};

const SHORT_ACTIVITY_SUMMARIES: Readonly<Record<string, string>> = Object.freeze({
  product_expiration_corrected: 'Corrigió el vencimiento',
  variation_expiration_corrected: 'Corrigió el vencimiento',
  product_manual_shown: 'Mostró manualmente',
  variation_manual_shown: 'Mostró manualmente',
  product_manual_hidden: 'Ocultó manualmente',
  variation_manual_hidden: 'Ocultó manualmente',
  product_variation_updated: 'Actualizó la variación',
});

export function getStoreActivityListSummary(
  event: Pick<StoreActivityEvent, 'action' | 'summary' | 'changes' | 'resource'>,
) {
  const action = text(event?.action).toLowerCase();
  if (SHORT_ACTIVITY_SUMMARIES[action]) return SHORT_ACTIVITY_SUMMARIES[action];
  const changedFields = new Set((event?.changes || []).map((change) => text(change?.field).toLowerCase()));
  if (changedFields.size === 1 && changedFields.has('expiration_date')) return 'Cambió el vencimiento';
  if (changedFields.size > 0 && [...changedFields].every((field) => ['price', 'price_usd', 'base_price_usd', 'regular_price_usd', 'offer_price_usd'].includes(field))) {
    return 'Cambió el precio';
  }
  if (changedFields.size === 1 && changedFields.has('stock')) return 'Cambió el stock';

  const summary = text(event?.summary).slice(0, 500);
  const resourceLabel = text(event?.resource?.label);
  if (!summary || !resourceLabel) return summary || 'Cambio administrativo registrado';
  const withPreposition = ` de ${resourceLabel}`;
  if (summary.endsWith(withPreposition)) return summary.slice(0, -withPreposition.length).trim();
  const directSuffix = ` ${resourceLabel}`;
  if (summary.endsWith(directSuffix)) return summary.slice(0, -directSuffix.length).trim();
  return summary;
}

export type StoreActivityPagination = {
  page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
};

export type StoreActivitySummary = {
  changes_today: number;
  pending_review: number;
  critical_changes: number;
  active_users: number;
};

export type StoreActivityUserMetrics = {
  total_changes: number;
  products: number;
  orders: number;
  price_stock: number;
  expirations: number;
  last_activity: string;
  critical_changes: number;
  pending_review: number;
};

export type StoreActivityActorOption = {
  value: string;
  label: string;
  state: string;
};

export type StoreActivityListResponse = {
  ok: true;
  items: StoreActivityEvent[];
  pagination: StoreActivityPagination;
  actors: StoreActivityActorOption[];
};

export type StoreActivitySummaryResponse = {
  ok: true;
  summary: StoreActivitySummary;
};

export type StoreActivityDetailResponse = {
  ok: true;
  item: StoreActivityEvent;
};

export type StoreActivityReviewResponse = {
  ok: true;
  review: StoreActivityReview;
  item?: StoreActivityEvent;
};

export type StoreActivityUserReportResponse = StoreActivityListResponse & {
  user: { display_name: string; state: string };
  summary: StoreActivityUserMetrics;
};

export type StoreLastModifiedResource = Readonly<{ type: string; id: string }>;

export type StoreLastModifiedItem = {
  type: string;
  id: string;
  last_modified_at: string;
  actor_name: string;
  actor_state: string;
  summary: string;
  severity: StoreActivitySeverity;
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: 'Tu sesión venció. Inicia sesión nuevamente.',
  unauthorized: 'No tienes permiso para consultar esta actividad.',
  permission_denied: 'No tienes permiso para realizar esta acción.',
  primary_admin_required: 'Solo el Administrador principal puede consultar la actividad del equipo.',
  activity_not_found: 'No se encontró el cambio solicitado.',
  invalid_payload: 'La solicitud de actividad no es válida.',
  invalid_activity_id: 'El cambio seleccionado no es válido.',
  invalid_filters: 'Revisa los filtros e inténtalo nuevamente.',
  invalid_date_range: 'El rango de fechas no es válido.',
  date_range_too_large: 'Selecciona un rango de fechas más corto.',
  invalid_review_status: 'Selecciona un estado de revisión válido.',
  correction_note_required: 'Escribe la corrección necesaria antes de continuar.',
  review_note_required: 'Escribe la corrección necesaria antes de continuar.',
  review_failed: 'No se pudo actualizar la revisión.',
  resource_not_found: 'El elemento ya no está disponible.',
  invalid_resource_type: 'El tipo de elemento no es válido.',
  unknown_resource_type: 'El tipo de elemento no es válido.',
  too_many_resources: 'Hay demasiados elementos para consultar en un solo lote.',
  activity_unavailable: 'La actividad no está disponible temporalmente.',
  activity_request_failed: 'No se pudo comunicar con la plataforma. Inténtalo nuevamente.',
};

const SAFE_RESOURCE_TYPES = new Set([
  'product',
  'product_variation',
  'category',
  'subcategory',
  'order',
  'order_item',
  'shipping_method',
  'shipping_zone',
  'promotion',
  'coupon',
  'gift',
  'raffle',
  'raffle_entry',
  'review',
  'visual_item',
  'settings',
  'currency',
  'security_settings',
  'security_block',
  'team_user',
  'activity',
  'store_plan',
]);

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  title: 'Título',
  status: 'Estado',
  visibility: 'Visibilidad',
  price: 'Precio',
  sale_price: 'Precio de oferta',
  stock: 'Stock',
  quantity: 'Cantidad',
  category: 'Categoría',
  subcategory: 'Subcategoría',
  expiration_date: 'Vencimiento',
  template_code: 'Plantilla',
  permissions: 'Permisos',
  reason_code: 'Código del motivo',
  reason_label_snapshot: 'Motivo',
  reason_detail: 'Detalle',
  order_status: 'Estado del pedido',
  shipping_price: 'Importe de envío',
  enabled: 'Estado',
};

function text(value: unknown) {
  try {
    return String(value === null || value === undefined ? '' : value).trim();
  } catch (_) {
    return '';
  }
}

function integer(value: unknown, fallback = 0) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? Math.max(0, Math.floor(candidate)) : fallback;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = text(value).toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return fallback;
}

function normalizedBaseUrl(value: unknown) {
  const explicit = text(value);
  const environment = text((import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.PUBLIC_POCKETBASE_URL);
  return (explicit || environment).replace(/\/+$/, '');
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function safeDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value.slice(0, 500).trim();
  if (Array.isArray(value)) {
    return value
      .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
      .slice(0, 12)
      .map((item) => safeDisplayValue(item))
      .filter(Boolean)
      .join(', ')
      .slice(0, 500);
  }
  return value && typeof value === 'object' ? 'Actualizado' : '';
}

function normalizedSeverity(value: unknown): StoreActivitySeverity {
  const normalized = text(value).toLowerCase();
  return normalized === 'critical' || normalized === 'important' ? normalized : 'normal';
}

function normalizedReviewStatus(value: unknown): StoreActivityReviewStatus {
  const normalized = text(value).toLowerCase();
  if (normalized === 'reviewed' || normalized === 'requires_correction') return normalized;
  return 'pending';
}

function normalizedFieldName(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function fieldLabel(field: string, explicit?: unknown) {
  const supplied = text(explicit);
  if (supplied) return supplied.slice(0, 100);
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const words = field.replace(/_/g, ' ').trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : 'Campo';
}

function normalizeChanges(value: any): StoreActivityChange[] {
  const direct = Array.isArray(value?.changes)
    ? value.changes
    : (Array.isArray(value?.change_list) ? value.change_list : []);
  if (direct.length) {
    return direct.slice(0, 40).map((entry: any) => {
      const field = normalizedFieldName(entry?.field || entry?.key || entry?.name);
      return {
        field,
        label: fieldLabel(field, entry?.label),
        before: safeDisplayValue(entry?.before ?? entry?.previous ?? entry?.old_value),
        after: safeDisplayValue(entry?.after ?? entry?.next ?? entry?.new_value),
      };
    }).filter((entry: StoreActivityChange) => entry.field || entry.before || entry.after);
  }

  const previous = safeRecord(value?.previous_values ?? value?.previous_values_json ?? value?.before);
  const next = safeRecord(value?.new_values ?? value?.new_values_json ?? value?.after);
  const changedFields = Array.isArray(value?.changed_fields ?? value?.changed_fields_json)
    ? (value.changed_fields ?? value.changed_fields_json)
    : [];
  const keys = new Set<string>();
  changedFields.forEach((item: unknown) => {
    const field = normalizedFieldName(typeof item === 'object' ? (item as any)?.field : item);
    if (field) keys.add(field);
  });
  Object.keys(previous).forEach((key) => {
    const field = normalizedFieldName(key);
    if (field) keys.add(field);
  });
  Object.keys(next).forEach((key) => {
    const field = normalizedFieldName(key);
    if (field) keys.add(field);
  });
  return [...keys].slice(0, 40).map((field) => ({
    field,
    label: fieldLabel(field),
    before: safeDisplayValue(previous[field]),
    after: safeDisplayValue(next[field]),
  }));
}

export function normalizeStoreActivityEvent(value: any): StoreActivityEvent {
  const actorValue = safeRecord(value?.actor);
  const resourceValue = safeRecord(value?.resource);
  const reviewValue = safeRecord(value?.review);
  const actorName = text(actorValue.name || value?.actor_name || value?.actor_name_snapshot || 'Sistema');
  const actorState = text(actorValue.state || value?.actor_state || (value?.actor_deleted ? 'deleted' : 'active')).toLowerCase();
  const resourceState = text(resourceValue.state || value?.resource_state || (value?.resource_exists === false ? 'deleted' : 'active')).toLowerCase();
  const resourceId = text(resourceValue.id_snapshot || resourceValue.id || value?.resource_id_snapshot || value?.resource_id);
  const resourceType = text(resourceValue.type || value?.resource_type).toLowerCase();
  return {
    id: text(value?.id || value?.activity_id),
    created: text(value?.created || value?.created_at),
    actor: {
      name: actorName || 'Sistema',
      role: text(actorValue.role || value?.actor_role || value?.actor_role_snapshot),
      template_code: text(actorValue.template_code || value?.actor_template_code || value?.actor_template_snapshot),
      state: actorState || 'active',
      is_deleted: actorState === 'deleted' || bool(value?.actor_deleted),
      is_system: ['system', 'migration'].includes(actorState) || ['system', 'migration'].includes(text(value?.origin).toLowerCase()),
    },
    module: text(value?.module || value?.section || 'activity').toLowerCase(),
    action: text(value?.action || value?.event_type || 'change'),
    severity: normalizedSeverity(value?.severity),
    summary: text(value?.summary || value?.description || 'Cambio administrativo registrado').slice(0, 500),
    changes: normalizeChanges(value),
    resource: {
      type: resourceType,
      label: text(resourceValue.label || value?.resource_label || value?.resource_label_snapshot),
      state: resourceState || 'active',
      exists: resourceState !== 'deleted' && value?.resource_exists !== false,
      route_key: text(resourceValue.route_key || value?.route_key || resourceType).toLowerCase(),
      id_snapshot: resourceId,
      path: text(resourceValue.path || value?.resource_path),
      history_path: text(resourceValue.history_path || value?.product_history_path),
    },
    review: {
      status: normalizedReviewStatus(reviewValue.status || value?.review_status),
      note: text(reviewValue.note || value?.review_note).slice(0, 1000),
      reviewed_at: text(reviewValue.reviewed_at || value?.reviewed_at),
      reviewed_by_name: text(reviewValue.reviewed_by_name || value?.reviewed_by_name),
    },
    can_review: value?.can_review !== false,
  };
}

function normalizePagination(value: any, itemCount = 0): StoreActivityPagination {
  const perPage = Math.min(50, Math.max(1, integer(value?.per_page ?? value?.perPage, STORE_ACTIVITY_PAGE_SIZE)));
  const totalItems = integer(value?.total_items ?? value?.totalItems, itemCount);
  const totalPages = Math.max(1, integer(value?.total_pages ?? value?.totalPages, Math.ceil(totalItems / perPage) || 1));
  return {
    page: Math.min(totalPages, Math.max(1, integer(value?.page, 1))),
    per_page: perPage,
    total_items: totalItems,
    total_pages: totalPages,
  };
}

function normalizeActors(value: any): StoreActivityActorOption[] {
  const source = Array.isArray(value) ? value : [];
  return source.slice(0, 100).map((actor: any) => {
    const state = text(actor?.state || (actor?.deleted ? 'deleted' : 'active')).toLowerCase();
    const label = text(actor?.label || actor?.display_name || actor?.name || 'Usuario');
    return {
      value: text(actor?.value || actor?.ref || actor?.id || actor?.id_snapshot || actor?.user_id),
      label: `${label}${state === 'deleted' ? ' — usuario eliminado' : ''}`,
      state,
    };
  }).filter((actor: StoreActivityActorOption) => actor.value && actor.label);
}

function normalizeList(value: any): StoreActivityListResponse {
  const rawItems = Array.isArray(value?.items)
    ? value.items
    : (Array.isArray(value?.events) ? value.events : (Array.isArray(value?.activity) ? value.activity : []));
  const items = rawItems.map(normalizeStoreActivityEvent);
  return {
    ok: true,
    items,
    pagination: normalizePagination(value?.pagination || value, items.length),
    actors: normalizeActors(value?.actors || value?.users || value?.filters?.actors),
  };
}

function normalizeSummary(value: any): StoreActivitySummary {
  const source = value?.summary || value || {};
  return {
    changes_today: integer(source?.changes_today ?? source?.today ?? source?.today_changes),
    pending_review: integer(source?.pending_review ?? source?.pending ?? source?.pending_reviews),
    critical_changes: integer(source?.critical_changes ?? source?.critical),
    active_users: integer(source?.active_users ?? source?.users_with_activity ?? source?.users),
  };
}

function normalizeUserMetrics(value: any): StoreActivityUserMetrics {
  const source = value?.summary || value || {};
  return {
    total_changes: integer(source?.total_changes ?? source?.total),
    products: integer(source?.products ?? source?.catalog),
    orders: integer(source?.orders),
    price_stock: integer(source?.price_stock ?? source?.price_or_stock ?? source?.prices_stock),
    expirations: integer(source?.expirations),
    last_activity: text(source?.last_activity ?? source?.last_activity_at),
    critical_changes: integer(source?.critical_changes ?? source?.critical),
    pending_review: integer(source?.pending_review ?? source?.pending ?? source?.pending_reviews),
  };
}

function cleanFilterValue(value: unknown, max = 100) {
  const normalized = text(value);
  if (!normalized || normalized.toLowerCase() === 'all') return '';
  return normalized.slice(0, max);
}

function activityPayload(filters: StoreActivityFilters = {}, allowUser = true, allowReview = true) {
  const payload: Record<string, unknown> = {
    module: cleanFilterValue(filters.module, 60),
    action: cleanFilterValue(filters.action, 80),
    severity: cleanFilterValue(filters.severity, 30),
    resource_type: cleanFilterValue(filters.resource_type, 80),
    resource_id: cleanFilterValue(filters.resource_id, 80),
    date_from: cleanFilterValue(filters.date_from, 32),
    date_to: cleanFilterValue(filters.date_to, 32),
    search: cleanFilterValue(filters.search, 120),
  };
  if (allowUser) payload.actor_id = cleanFilterValue(filters.user_id, 80);
  if (allowReview) payload.review_status = cleanFilterValue(filters.review_status, 40);
  return payload;
}

export class StoreActivityApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly response: unknown;

  constructor(code: unknown, status: number, response: unknown) {
    const safeCode = text(code) || 'activity_request_failed';
    super(ERROR_MESSAGES[safeCode] || 'No se pudo completar la solicitud. Inténtalo nuevamente.');
    this.name = 'StoreActivityApiError';
    this.code = safeCode;
    this.status = status;
    this.response = response;
  }
}

async function postStoreActivity<T>(
  options: StoreActivityClientOptions,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = text(options?.token);
  const baseUrl = normalizedBaseUrl(options?.baseUrl);
  if (!token) throw new StoreActivityApiError('unauthenticated', 401, null);
  if (!baseUrl) throw new StoreActivityApiError('activity_request_failed', 503, null);
  const fetcher = options.fetcher || fetch;
  const browserSupportStoreId = typeof window === 'undefined'
    ? ''
    : text((window as any).PZ_MASTER_SUPPORT_CONTEXT?.storeId);
  const supportStoreId = text(options?.supportStoreId) || browserSupportStoreId;
  const requestBody = supportStoreId ? { ...body, store_id: supportStoreId } : body;
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    throw new StoreActivityApiError('activity_request_failed', 0, null);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new StoreActivityApiError(result?.error || result?.code, response.status, result);
  }
  return result as T;
}

export function readPocketBaseAuthToken(cookieValue?: string) {
  const source = cookieValue === undefined && typeof document !== 'undefined'
    ? String(document.cookie || '')
    : String(cookieValue || '');
  const cookie = source
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('pb_auth='));
  if (!cookie) return '';
  try {
    const parsed = JSON.parse(decodeURIComponent(cookie.slice('pb_auth='.length)));
    return typeof parsed?.token === 'string' ? parsed.token : '';
  } catch (_) {
    return '';
  }
}

export async function getStoreActivitySummary(
  _filters: StoreActivityFilters,
  options: StoreActivityClientOptions,
): Promise<StoreActivitySummaryResponse> {
  const result = await postStoreActivity<any>(options, STORE_ACTIVITY_API_PATHS.summary, {});
  return { ok: true, summary: normalizeSummary(result) };
}

export async function listStoreActivity(
  filters: StoreActivityFilters,
  options: StoreActivityClientOptions,
): Promise<StoreActivityListResponse> {
  const result = await postStoreActivity<any>(options, STORE_ACTIVITY_API_PATHS.list, {
    ...activityPayload(filters),
    page: Math.max(1, integer(filters.page, 1)),
    per_page: Math.min(50, Math.max(1, integer(filters.per_page, STORE_ACTIVITY_PAGE_SIZE))),
  });
  return normalizeList(result);
}

export async function getStoreActivityDetail(
  activityId: string,
  options: StoreActivityClientOptions,
): Promise<StoreActivityDetailResponse> {
  const id = text(activityId);
  if (!id) throw new StoreActivityApiError('invalid_activity_id', 400, null);
  const result = await postStoreActivity<any>(options, STORE_ACTIVITY_API_PATHS.detail, { activity_id: id });
  return { ok: true, item: normalizeStoreActivityEvent(result?.item || result?.event || result?.activity || result) };
}

export async function reviewStoreActivity(
  activityId: string,
  status: StoreActivityReviewStatus,
  note: string,
  options: StoreActivityClientOptions,
): Promise<StoreActivityReviewResponse> {
  const id = text(activityId);
  const normalizedStatus = normalizedReviewStatus(status);
  const normalizedNote = text(note).slice(0, 1000);
  if (!id) throw new StoreActivityApiError('invalid_activity_id', 400, null);
  if (!['reviewed', 'requires_correction'].includes(normalizedStatus)) {
    throw new StoreActivityApiError('invalid_review_status', 400, null);
  }
  if (normalizedStatus === 'requires_correction' && normalizedNote.length < 8) {
    throw new StoreActivityApiError('correction_note_required', 400, null);
  }
  const result = await postStoreActivity<any>(options, STORE_ACTIVITY_API_PATHS.review, {
    activity_id: id,
    status: normalizedStatus,
    note: normalizedNote,
  });
  const rawItem = result?.item || result?.event || result?.activity;
  const review = result?.review || {};
  return {
    ok: true,
    review: {
      status: normalizedReviewStatus(review?.status || normalizedStatus),
      note: text(review?.note || normalizedNote).slice(0, 1000),
      reviewed_at: text(review?.reviewed_at),
      reviewed_by_name: text(review?.reviewed_by_name),
    },
    item: rawItem ? normalizeStoreActivityEvent(rawItem) : undefined,
  };
}

export async function getStoreActivityUserReport(
  userId: string,
  filters: StoreActivityFilters,
  options: StoreActivityClientOptions,
): Promise<StoreActivityUserReportResponse> {
  const normalizedUserId = text(userId);
  if (!normalizedUserId) throw new StoreActivityApiError('invalid_filters', 400, null);
  const result = await postStoreActivity<any>(options, STORE_ACTIVITY_API_PATHS.userReport, {
    ...activityPayload({ ...filters, user_id: normalizedUserId }),
    actor_id: normalizedUserId,
    page: Math.max(1, integer(filters.page, 1)),
    per_page: Math.min(50, Math.max(1, integer(filters.per_page, STORE_ACTIVITY_PAGE_SIZE))),
  });
  const list = normalizeList(result);
  return {
    ...list,
    user: {
      display_name: text(result?.user?.display_name || result?.user?.name || result?.actor?.name || 'Usuario'),
      state: text(result?.user?.state || result?.actor?.state || (result?.user?.deleted ? 'deleted' : 'active')),
    },
    summary: normalizeUserMetrics(result),
  };
}

export async function getStoreSelfActivity(
  filters: StoreActivityFilters,
  options: StoreActivityClientOptions,
): Promise<StoreActivityListResponse> {
  const result = await postStoreActivity<any>(options, STORE_ACTIVITY_API_PATHS.self, {
    ...activityPayload(filters, false, false),
    page: Math.max(1, integer(filters.page, 1)),
    per_page: Math.min(50, Math.max(1, integer(filters.per_page, STORE_ACTIVITY_PAGE_SIZE))),
  });
  const list = normalizeList(result);
  return {
    ...list,
    items: list.items.map((item) => ({
      ...item,
      review: { status: 'pending', note: '', reviewed_at: '', reviewed_by_name: '' },
      can_review: false,
    })),
    actors: [],
  };
}

const lastModifiedCache = new Map<string, { expires: number; item: StoreLastModifiedItem | null }>();
const LAST_MODIFIED_CACHE_TTL_MS = 15_000;

function cacheScope(options: StoreActivityClientOptions) {
  const source = `${normalizedBaseUrl(options?.baseUrl)}|${text(options?.token)}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeResourceRequest(value: StoreLastModifiedResource) {
  const type = text(value?.type).toLowerCase();
  const id = text(value?.id);
  if (!SAFE_RESOURCE_TYPES.has(type) || !id || id.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return { type, id };
}

function normalizeLastModified(value: any, fallback?: StoreLastModifiedResource): StoreLastModifiedItem | null {
  const type = text(value?.type || fallback?.type).toLowerCase();
  const id = text(value?.id || fallback?.id);
  const lastModifiedAt = text(value?.last_modified_at || value?.created || value?.created_at);
  if (!type || !id || !lastModifiedAt) return null;
  return {
    type,
    id,
    last_modified_at: lastModifiedAt,
    actor_name: text(value?.actor_name || value?.actor?.name),
    actor_state: text(value?.actor_state || value?.actor?.state || 'active').toLowerCase(),
    summary: text(value?.summary).slice(0, 500),
    severity: normalizedSeverity(value?.severity),
  };
}

export async function getStoreLastModifiedBatch(
  resources: readonly StoreLastModifiedResource[],
  options: StoreActivityClientOptions,
): Promise<Record<string, StoreLastModifiedItem | null>> {
  const unique = new Map<string, StoreLastModifiedResource>();
  resources.forEach((resource) => {
    const normalized = normalizeResourceRequest(resource);
    if (normalized) unique.set(`${normalized.type}:${normalized.id}`, normalized);
  });
  const requested = [...unique.entries()].slice(0, STORE_ACTIVITY_LAST_MODIFIED_BATCH_LIMIT);
  const now = Date.now();
  const scope = cacheScope(options);
  const output: Record<string, StoreLastModifiedItem | null> = {};
  const missing: StoreLastModifiedResource[] = [];
  requested.forEach(([key, resource]) => {
    const cached = lastModifiedCache.get(`${scope}:${key}`);
    if (cached && cached.expires > now) output[key] = cached.item;
    else missing.push(resource);
  });
  if (!missing.length) return output;

  const result = await postStoreActivity<any>(options, STORE_ACTIVITY_API_PATHS.lastModified, { resources: missing });
  const source = result?.items;
  const returned = new Map<string, StoreLastModifiedItem>();
  if (Array.isArray(source)) {
    source.forEach((raw: any) => {
      const item = normalizeLastModified(raw);
      if (item) returned.set(`${item.type}:${item.id}`, item);
    });
  } else if (source && typeof source === 'object') {
    Object.entries(source).forEach(([key, raw]) => {
      const [type, ...idParts] = key.split(':');
      const item = normalizeLastModified(raw, { type, id: idParts.join(':') });
      if (item) returned.set(`${item.type}:${item.id}`, item);
    });
  }
  missing.forEach((resource) => {
    const key = `${resource.type}:${resource.id}`;
    const item = returned.get(key) || null;
    output[key] = item;
    lastModifiedCache.set(`${scope}:${key}`, { expires: now + LAST_MODIFIED_CACHE_TTL_MS, item });
  });
  return output;
}

export function clearStoreLastModifiedCache() {
  lastModifiedCache.clear();
}

function cleanResourceId(value: unknown) {
  const id = text(value);
  return id && id.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
}

export function getStoreActivityResourcePath(
  storeSlug: string,
  resource: Pick<StoreActivityResource, 'type' | 'route_key' | 'id_snapshot' | 'exists' | 'path'>,
) {
  if (!resource?.exists) return '';
  const routeKey = text(resource.route_key || resource.type).toLowerCase();
  const id = cleanResourceId(resource.id_snapshot);
  const encodedId = id ? encodeURIComponent(id) : '';
  const suppliedPath = text(resource.path);
  if (suppliedPath && !/[\\\r\n]/.test(suppliedPath) && !suppliedPath.includes('://') && !suppliedPath.startsWith('//')) {
    const adminBase = getStoreAdminPath(storeSlug);
    const patterns: Record<string, RegExp> = {
      product: new RegExp(`^${adminBase}/products(?:\\?product=[a-z0-9]{15})?$`),
      product_variation: new RegExp(`^${adminBase}/products$`),
      variation: new RegExp(`^${adminBase}/products$`),
      category: new RegExp(`^${adminBase}/catalog/category/[a-z0-9]{15}$`),
      subcategory: new RegExp(`^${adminBase}/catalog$`),
      order: new RegExp(`^${adminBase}/orders(?:/[a-z0-9]{15})?$`),
      order_item: new RegExp(`^${adminBase}/orders$`),
      shipping_method: new RegExp(`^${adminBase}/shipping$`),
      shipping_zone: new RegExp(`^${adminBase}/shipping$`),
      promotion: new RegExp(`^${adminBase}/promos$`),
      coupon: new RegExp(`^${adminBase}/promos$`),
      gift: new RegExp(`^${adminBase}/gifts$`),
      raffle: new RegExp(`^${adminBase}/promos/raffles$`),
      raffle_entry: new RegExp(`^${adminBase}/promos/raffles$`),
      review: new RegExp(`^${adminBase}/store-settings(?:#rating-pending)?$`),
      visual_item: new RegExp(`^${adminBase}/store-settings$`),
      settings: new RegExp(`^${adminBase}/store-settings$`),
      currency: new RegExp(`^${adminBase}/store-settings$`),
      security_settings: new RegExp(`^${adminBase}/security$`),
      security_block: new RegExp(`^${adminBase}/security$`),
      team_user: new RegExp(`^${adminBase}/team$`),
      activity: new RegExp(`^${adminBase}/team\\?tab=activity$`),
      store_plan: new RegExp(`^${adminBase}/account#plan$`),
    };
    if (patterns[routeKey]?.test(suppliedPath)) return suppliedPath;
  }
  if (routeKey === 'product') {
    return id ? `${getStoreAdminPath(storeSlug, 'products')}?product=${encodedId}` : getStoreAdminPath(storeSlug, 'products');
  }
  if (['product_variation', 'variation'].includes(routeKey)) return getStoreAdminPath(storeSlug, 'products');
  if (routeKey === 'order') return id ? `${getStoreAdminPath(storeSlug, 'orders')}/${encodedId}` : getStoreAdminPath(storeSlug, 'orders');
  if (routeKey === 'category') return id ? `${getStoreAdminPath(storeSlug, 'catalog/category')}/${encodedId}` : getStoreAdminPath(storeSlug, 'catalog');
  if (['subcategory'].includes(routeKey)) return getStoreAdminPath(storeSlug, 'catalog');
  if (['expiration', 'product_expiration'].includes(routeKey)) {
    return id ? `${getStoreAdminPath(storeSlug, 'expirations')}?product=${encodedId}` : getStoreAdminPath(storeSlug, 'expirations');
  }
  if (['shipping', 'shipping_method', 'shipping_zone'].includes(routeKey)) return getStoreAdminPath(storeSlug, 'shipping');
  if (['promotion', 'promo', 'coupon'].includes(routeKey)) return getStoreAdminPath(storeSlug, 'promos');
  if (routeKey === 'gift') return getStoreAdminPath(storeSlug, 'gifts');
  if (['raffle', 'raffle_entry'].includes(routeKey)) return getStoreAdminPath(storeSlug, 'promos/raffles');
  if (['review', 'visual_item', 'settings', 'store_settings', 'landing_qr', 'currency', 'hours', 'notification_settings'].includes(routeKey)) {
    return getStoreAdminPath(storeSlug, 'store-settings');
  }
  if (['security', 'security_settings', 'security_block'].includes(routeKey)) return getStoreAdminPath(storeSlug, 'security');
  if (['store_user', 'team_user', 'user'].includes(routeKey)) {
    return id ? `${getStoreAdminPath(storeSlug, 'team')}/${encodedId}/activity` : getStoreAdminPath(storeSlug, 'team');
  }
  if (routeKey === 'activity') return `${getStoreAdminPath(storeSlug, 'team')}?tab=activity`;
  if (['plan', 'store_plan'].includes(routeKey)) return `${getStoreAdminPath(storeSlug, 'account')}#plan`;
  return '';
}

export function getStoreActivityErrorCode(error: unknown) {
  return text((error as any)?.code || (error as any)?.data?.error || (error as any)?.response?.error);
}

export function getStoreActivityErrorMessage(error: unknown) {
  const code = getStoreActivityErrorCode(error);
  return ERROR_MESSAGES[code] || text((error as any)?.message) || 'No se pudo completar la solicitud. Inténtalo nuevamente.';
}
