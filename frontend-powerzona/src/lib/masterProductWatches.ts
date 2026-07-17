export const MASTER_WATCH_STATUSES = ['none', 'active', 'paused', 'deleted'] as const;

export type MasterWatchStatus = (typeof MASTER_WATCH_STATUSES)[number];
export type MasterProductWatch = {
  id: string;
  status: MasterWatchStatus;
  started_at: string;
  paused_at: string;
  deleted_at: string;
  target_alert_enabled: boolean;
  target_price_usd: number;
  target_updated_at: string;
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
  effective_price_before_usd: number;
  effective_price_after_usd: number;
  target_alert_enabled: boolean;
  target_price_usd: number;
  target_met: boolean;
  notification_tone: 'normal' | 'critical';
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

export type MasterPriceWatchDetail = {
  watch: MasterProductWatch;
  store: { id: string; name: string; slug: string };
  product: { id: string; name: string; slug: string; exists: boolean; has_variations: boolean };
  pricing: {
    current_effective_price_usd: number;
    initial_effective_price_usd: number;
    difference_from_start_usd: number;
    target_met: boolean;
    amount_to_target_usd: number;
  };
  last_change: { summary: string; created: string };
  history: MasterPriceHistory['page'];
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
    id: isRecordId(value?.id) ? boundedString(value.id, 15) : '',
    status: normalizeWatchStatus(value?.status),
    started_at: safeIsoDate(value?.started_at),
    paused_at: safeIsoDate(value?.paused_at),
    deleted_at: safeIsoDate(value?.deleted_at),
    target_alert_enabled: value?.target_alert_enabled === true,
    target_price_usd: finiteNumber(value?.target_price_usd),
    target_updated_at: safeIsoDate(value?.target_updated_at),
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
    effective_price_before_usd: finiteNumber(value?.effective_price_before_usd),
    effective_price_after_usd: finiteNumber(value?.effective_price_after_usd),
    target_alert_enabled: value?.target_alert_enabled === true,
    target_price_usd: finiteNumber(value?.target_price_usd),
    target_met: value?.target_met === true,
    notification_tone: value?.notification_tone === 'critical' ? 'critical' : 'normal',
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

export async function getMasterProductWatchDetail(
  pocketbaseUrl: string,
  token: string,
  watchId: string,
  requestedPage: unknown,
): Promise<MasterWatchEndpointResult<MasterPriceWatchDetail>> {
  const safeWatchId = boundedString(watchId, 15);
  if (!isRecordId(safeWatchId)) {
    return { available: false, status: 400, error: 'invalid_payload', data: null };
  }
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/product-watch-detail', {
    watch_id: safeWatchId,
    page: normalizeHistoryPage(requestedPage),
  });
  if (result.status !== 200 || result.payload?.ok !== true) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const storeId = boundedString(result.payload?.store?.id, 15);
  const normalizedWatch = normalizeWatch(result.payload?.watch);
  if (!isRecordId(normalizedWatch.id) || !isRecordId(storeId)) {
    return { available: false, status: 500, error: 'watch_detail_failed', data: null };
  }
  const totalItems = nonNegativeInteger(result.payload?.history?.total_items);
  const totalPages = Math.max(1, nonNegativeInteger(result.payload?.history?.total_pages));
  const page = Math.min(normalizeHistoryPage(result.payload?.history?.page), totalPages);
  const productId = boundedString(result.payload?.product?.id, 15);
  const productExists = result.payload?.product?.exists === true && isRecordId(productId);
  return {
    available: true,
    status: 200,
    error: '',
    data: {
      watch: normalizedWatch,
      store: {
        id: storeId,
        name: boundedString(result.payload?.store?.name, 160) || 'Tienda',
        slug: boundedString(result.payload?.store?.slug, 120),
      },
      product: {
        id: productExists ? productId : '',
        name: boundedString(result.payload?.product?.name, 180) || 'Producto eliminado',
        slug: boundedString(result.payload?.product?.slug, 180),
        exists: productExists,
        has_variations: result.payload?.product?.has_variations === true,
      },
      pricing: {
        current_effective_price_usd: finiteNumber(result.payload?.pricing?.current_effective_price_usd),
        initial_effective_price_usd: finiteNumber(result.payload?.pricing?.initial_effective_price_usd),
        difference_from_start_usd: finiteNumber(result.payload?.pricing?.difference_from_start_usd),
        target_met: result.payload?.pricing?.target_met === true,
        amount_to_target_usd: finiteNumber(result.payload?.pricing?.amount_to_target_usd),
      },
      last_change: {
        summary: boundedString(result.payload?.last_change?.summary, 500),
        created: safeIsoDate(result.payload?.last_change?.created),
      },
      history: {
        page,
        per_page: 10,
        total_items: totalItems,
        total_pages: totalPages,
        items: Array.isArray(result.payload?.history?.items)
          ? result.payload.history.items.slice(0, 10).map(normalizeHistoryItem).filter(Boolean) as MasterPriceHistoryItem[]
          : [],
      },
    },
  };
}

export async function runMasterProductWatchTarget(
  pocketbaseUrl: string,
  token: string,
  watchId: string,
  targetAlertEnabled: boolean,
  targetPriceUsd: number,
) {
  const safeWatchId = boundedString(watchId, 15);
  const target = Number(targetPriceUsd);
  const validTarget = Number.isFinite(target)
    && target >= 0
    && target <= 999999999.99
    && Math.abs((target * 100) - Math.round(target * 100)) < 0.0000001
    && (!targetAlertEnabled || target > 0);
  if (!isRecordId(safeWatchId) || typeof targetAlertEnabled !== 'boolean' || !validTarget) {
    return { available: false, status: 400, error: 'invalid_target_price', data: null };
  }
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/product-watch-target', {
    watch_id: safeWatchId,
    target_alert_enabled: targetAlertEnabled,
    target_price_usd: Math.round(target * 100) / 100,
  });
  if (result.status !== 200 || result.payload?.ok !== true) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  return {
    available: true,
    status: 200,
    error: '',
    data: {
      watch: normalizeWatch(result.payload?.watch),
      pricing: {
        current_effective_price_usd: finiteNumber(result.payload?.pricing?.current_effective_price_usd),
        target_met: result.payload?.pricing?.target_met === true,
        amount_to_target_usd: finiteNumber(result.payload?.pricing?.amount_to_target_usd),
      },
    },
  };
}
