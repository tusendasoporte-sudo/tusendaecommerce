export const MASTER_WATCH_STATUSES = ['none', 'active', 'paused', 'deleted'] as const;

export type MasterWatchStatus = (typeof MASTER_WATCH_STATUSES)[number];
export type MasterProductWatch = {
  status: MasterWatchStatus;
  started_at: string;
  paused_at: string;
  deleted_at: string;
};

export type MasterPriceHistoryItem = {
  id: string;
  change_type: string;
  summary: string;
  variation_label: string;
  before_regular_price_usd: number;
  after_regular_price_usd: number;
  before_effective_price_usd: number;
  after_effective_price_usd: number;
  before_range_min_usd: number;
  before_range_max_usd: number;
  after_range_min_usd: number;
  after_range_max_usd: number;
  actor_name: string;
  actor_role: string;
  source: 'request' | 'system';
  created: string;
};

export type MasterPriceHistory = {
  watch: MasterProductWatch;
  page: {
    page: number;
    per_page: 10;
    total_items: number;
    total_pages: number;
    items: MasterPriceHistoryItem[];
  };
};

export type MasterWatchEndpointResult<T> = {
  available: boolean;
  status: number;
  error: string;
  data: T | null;
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const REQUEST_TIMEOUT_MS = 9000;

function boundedString(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
}

function isRecordId(value: unknown) {
  return RECORD_ID_PATTERN.test(boundedString(value, 15));
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function safeIsoDate(value: unknown) {
  const raw = boundedString(value, 80);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function normalizeWatchStatus(value: unknown): MasterWatchStatus {
  const status = boundedString(value, 20).toLowerCase() as MasterWatchStatus;
  return MASTER_WATCH_STATUSES.includes(status) ? status : 'none';
}

export function normalizeHistoryPage(value: unknown) {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

function normalizeWatch(value: any): MasterProductWatch {
  return {
    status: normalizeWatchStatus(value?.status),
    started_at: safeIsoDate(value?.started_at),
    paused_at: safeIsoDate(value?.paused_at),
    deleted_at: safeIsoDate(value?.deleted_at),
  };
}

function normalizeHistoryItem(value: any): MasterPriceHistoryItem | null {
  const id = boundedString(value?.id, 15);
  if (!isRecordId(id)) return null;
  return {
    id,
    change_type: boundedString(value?.change_type, 60),
    summary: boundedString(value?.summary, 500),
    variation_label: boundedString(value?.variation_label, 220),
    before_regular_price_usd: finiteNumber(value?.before_regular_price_usd),
    after_regular_price_usd: finiteNumber(value?.after_regular_price_usd),
    before_effective_price_usd: finiteNumber(value?.before_effective_price_usd),
    after_effective_price_usd: finiteNumber(value?.after_effective_price_usd),
    before_range_min_usd: finiteNumber(value?.before_range_min_usd),
    before_range_max_usd: finiteNumber(value?.before_range_max_usd),
    after_range_min_usd: finiteNumber(value?.after_range_min_usd),
    after_range_max_usd: finiteNumber(value?.after_range_max_usd),
    actor_name: boundedString(value?.actor_name, 160) || 'Sistema',
    actor_role: boundedString(value?.actor_role, 40) || 'system',
    source: value?.source === 'request' ? 'request' : 'system',
    created: safeIsoDate(value?.created),
  };
}

async function postPrivateEndpoint(
  pocketbaseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
) {
  const baseUrl = boundedString(pocketbaseUrl, 500).replace(/\/$/, '');
  const authToken = boundedString(token, 5000);
  if (!baseUrl || !authToken) return { status: 0, error: 'unavailable', payload: null };
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
    return { status: response.status, error: boundedString(payload?.error, 80), payload };
  } catch (_) {
    return { status: 0, error: 'unavailable', payload: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runMasterProductWatchAction(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
  productId: string,
  action: 'enable' | 'pause' | 'resume',
): Promise<MasterWatchEndpointResult<MasterProductWatch>> {
  const safeStoreId = boundedString(storeId, 15);
  const safeProductId = boundedString(productId, 15);
  if (!isRecordId(safeStoreId) || !isRecordId(safeProductId) || !['enable', 'pause', 'resume'].includes(action)) {
    return { available: false, status: 400, error: 'invalid_payload', data: null };
  }
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/product-watch-action', {
    store_id: safeStoreId,
    product_id: safeProductId,
    action,
  });
  if (result.status !== 200 || result.payload?.ok !== true) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  return { available: true, status: 200, error: '', data: normalizeWatch(result.payload.watch) };
}

export async function getMasterProductPriceHistory(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
  productId: string,
  requestedPage: unknown,
): Promise<MasterWatchEndpointResult<MasterPriceHistory>> {
  const safeStoreId = boundedString(storeId, 15);
  const safeProductId = boundedString(productId, 15);
  if (!isRecordId(safeStoreId) || !isRecordId(safeProductId)) {
    return { available: false, status: 400, error: 'invalid_payload', data: null };
  }
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/product-price-history', {
    store_id: safeStoreId,
    product_id: safeProductId,
    page: normalizeHistoryPage(requestedPage),
  });
  if (result.status !== 200 || result.payload?.ok !== true) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const totalItems = nonNegativeInteger(result.payload?.page?.total_items);
  const totalPages = Math.max(1, nonNegativeInteger(result.payload?.page?.total_pages));
  const page = Math.min(normalizeHistoryPage(result.payload?.page?.page), totalPages);
  return {
    available: true,
    status: 200,
    error: '',
    data: {
      watch: normalizeWatch(result.payload?.watch),
      page: {
        page,
        per_page: 10,
        total_items: totalItems,
        total_pages: totalPages,
        items: Array.isArray(result.payload?.page?.items)
          ? result.payload.page.items.slice(0, 10).map(normalizeHistoryItem).filter(Boolean) as MasterPriceHistoryItem[]
          : [],
      },
    },
  };
}
