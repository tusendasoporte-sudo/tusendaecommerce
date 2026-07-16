export type MasterStoreDeleteCounts = {
  store_users: number;
  products: number;
  product_variations: number;
  orders: number;
  order_items: number;
  gifts: number;
  promotions: number;
  coupons: number;
  coupon_usages: number;
  raffles: number;
  raffle_entries: number;
  reviews: number;
  analytics_events: number;
  store_notifications: number;
  customers: number;
  customer_phones: number;
  customer_devices: number;
  customer_links: number;
  user_devices: number;
  user_device_audit: number;
  visitor_sessions: number;
  visitor_pageviews: number;
  security_events: number;
  security_blocks: number;
  security_audit: number;
  security_settings: number;
  price_watches: number;
  price_events: number;
  master_notifications: number;
  settings: number;
  categories: number;
  subcategories: number;
  currencies: number;
  shipping_zones: number;
  visual_items: number;
  total_records: number;
};

export type MasterStoreDeletePreview = {
  store: {
    id: string;
    name: string;
    slug: string;
    status: string;
    updated: string;
    protected: false;
  };
  confirmation_phrase: string;
  counts: MasterStoreDeleteCounts;
  warnings: string[];
};

export type MasterStoreDeleteResult = {
  deleted_store: { name: string; slug: string };
  deleted_records: number;
  remaining_stores: number;
  suggested_page: number;
};

export type MasterStoreDeleteRequest<T> = {
  available: boolean;
  status: number;
  error: string;
  data: T | null;
  references: Record<string, number>;
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PREVIEW_TIMEOUT_MS = 20000;
const EXECUTE_TIMEOUT_MS = 120000;
const COUNT_KEYS: Array<Exclude<keyof MasterStoreDeleteCounts, 'total_records'>> = [
  'store_users', 'products', 'product_variations', 'orders', 'order_items', 'gifts',
  'promotions', 'coupons', 'coupon_usages', 'raffles', 'raffle_entries', 'reviews',
  'analytics_events', 'store_notifications', 'customers', 'customer_phones',
  'customer_devices', 'customer_links', 'user_devices', 'user_device_audit',
  'visitor_sessions', 'visitor_pageviews',
  'security_events', 'security_blocks', 'security_audit', 'security_settings',
  'price_watches', 'price_events', 'master_notifications', 'settings', 'categories',
  'subcategories', 'currencies', 'shipping_zones', 'visual_items',
];

function boundedString(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
}

function strictNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function safeIsoDate(value: unknown) {
  const raw = boundedString(value, 80);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function isValidRecordId(value: unknown) {
  return typeof value === 'string' && RECORD_ID_PATTERN.test(value);
}

export function normalizeDeletionCounts(value: unknown): MasterStoreDeleteCounts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const normalized: Partial<MasterStoreDeleteCounts> = {};
  let sum = 1;
  for (const key of COUNT_KEYS) {
    const count = strictNonNegativeInteger(source[key]);
    if (count === null) return null;
    normalized[key] = count;
    sum += count;
  }
  const total = strictNonNegativeInteger(source.total_records);
  if (total === null || total !== sum) return null;
  normalized.total_records = total;
  return normalized as MasterStoreDeleteCounts;
}

function normalizeReferences(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce((result, [key, rawCount]) => {
    const safeKey = boundedString(key, 60).replace(/[^a-z0-9_]/g, '');
    const count = strictNonNegativeInteger(rawCount);
    if (safeKey && count !== null && count > 0) result[safeKey] = count;
    return result;
  }, {} as Record<string, number>);
}

function normalizePreview(value: any): MasterStoreDeletePreview | null {
  if (value?.ok !== true) return null;
  const id = boundedString(value?.store?.id, 15);
  const name = boundedString(value?.store?.name, 180);
  const slug = boundedString(value?.store?.slug, 100);
  const status = boundedString(value?.store?.status, 40);
  const updated = safeIsoDate(value?.store?.updated);
  const confirmationPhrase = String(value?.confirmation_phrase || '');
  const counts = normalizeDeletionCounts(value?.counts);
  if (!isValidRecordId(id) || !name || !slug || !status || !updated || !counts) return null;
  if (value?.store?.protected !== false || confirmationPhrase !== `ELIMINAR ${slug}`) return null;
  if (!Array.isArray(value?.warnings)) return null;
  const warnings = value.warnings.map((warning: unknown) => boundedString(warning, 240)).filter(Boolean);
  if (warnings.length !== value.warnings.length) return null;
  return {
    store: { id, name, slug, status, updated, protected: false },
    confirmation_phrase: confirmationPhrase,
    counts,
    warnings,
  };
}

function normalizeResult(value: any): MasterStoreDeleteResult | null {
  if (value?.ok !== true) return null;
  const name = boundedString(value?.deleted_store?.name, 180);
  const slug = boundedString(value?.deleted_store?.slug, 100);
  const deletedRecords = strictNonNegativeInteger(value?.deleted_records);
  const remainingStores = strictNonNegativeInteger(value?.remaining_stores);
  const suggestedPage = strictNonNegativeInteger(value?.suggested_page);
  if (!name || !slug || deletedRecords === null || deletedRecords < 1 || remainingStores === null || suggestedPage === null || suggestedPage < 1) return null;
  return {
    deleted_store: { name, slug },
    deleted_records: deletedRecords,
    remaining_stores: remainingStores,
    suggested_page: suggestedPage,
  };
}

async function postPrivateEndpoint(
  pocketbaseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const baseUrl = boundedString(pocketbaseUrl, 500).replace(/\/$/, '');
  const authToken = boundedString(token, 5000);
  if (!baseUrl || !authToken) return { status: 0, error: 'unavailable', payload: null as any };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, error: boundedString(payload?.error, 80), payload };
  } catch (_) {
    return { status: 0, error: 'unavailable', payload: null as any };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getMasterStoreDeletePreview(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
): Promise<MasterStoreDeleteRequest<MasterStoreDeletePreview>> {
  if (!isValidRecordId(storeId)) {
    return { available: false, status: 400, error: 'invalid_payload', data: null, references: {} };
  }
  const response = await postPrivateEndpoint(
    pocketbaseUrl,
    token,
    '/api/pz/master/store-delete-preview',
    { store_id: storeId },
    PREVIEW_TIMEOUT_MS,
  );
  const data = response.status === 200 ? normalizePreview(response.payload) : null;
  return {
    available: response.status === 200 && data !== null,
    status: response.status,
    error: data ? '' : response.error || (response.status === 200 ? 'invalid_response' : 'unavailable'),
    data,
    references: normalizeReferences(response.payload?.references),
  };
}

export async function executeMasterStoreDeletion(
  pocketbaseUrl: string,
  token: string,
  preview: MasterStoreDeletePreview,
  confirmation: string,
): Promise<MasterStoreDeleteRequest<MasterStoreDeleteResult>> {
  if (!isValidRecordId(preview?.store?.id) || confirmation !== preview?.confirmation_phrase) {
    return { available: false, status: 400, error: 'invalid_confirmation', data: null, references: {} };
  }
  const response = await postPrivateEndpoint(
    pocketbaseUrl,
    token,
    '/api/pz/master/store-delete-execute',
    {
      store_id: preview.store.id,
      expected_slug: preview.store.slug,
      expected_updated: preview.store.updated,
      confirmation,
    },
    EXECUTE_TIMEOUT_MS,
  );
  const data = response.status === 200 ? normalizeResult(response.payload) : null;
  return {
    available: response.status === 200 && data !== null,
    status: response.status,
    error: data ? '' : response.error || (response.status === 200 ? 'invalid_response' : 'unavailable'),
    data,
    references: normalizeReferences(response.payload?.references),
  };
}
