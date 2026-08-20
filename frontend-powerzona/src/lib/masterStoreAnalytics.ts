import type PocketBase from 'pocketbase';

export const MASTER_ANALYTICS_RANGES = ['today', '7', '15', '30', '90'] as const;
export type MasterAnalyticsRange = (typeof MASTER_ANALYTICS_RANGES)[number];

export type MasterAnalyticsStore = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
};

export type MasterAnalyticsDailyRow = {
  day: string;
  label: string;
  visitors: number;
  recurrent_visitors: number;
  pageviews: number;
  orders: number;
};

export type MasterAnalyticsProduct = {
  product_id: string;
  name: string;
  slug: string;
  active: boolean;
  views: number;
};

export type MasterSellingProduct = {
  product_id: string;
  name: string;
  slug: string;
  active: boolean;
  state: 'available' | 'hidden' | 'sold_out' | 'deleted';
  units_sold: number;
  orders_count: number;
  revenue_usd: number;
  top_variation: string;
  top_variation_units: number;
};

export type MasterLandingQrButton = {
  link_id: string;
  link_type: string;
  link_label: string;
  clicks: number;
};

export type MasterRecentOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'delivered' | 'cancelled';
  usd_total: number;
  delivery_method: 'delivery' | 'pickup' | 'coordinate';
  created: string;
};

export type MasterVisitedPage = {
  page_type: string;
  entity_id: string;
  name: string;
  detail: string;
  visits: number;
  last_visited_at: string;
  public_path: string;
};

export type MasterStoreAnalytics = {
  range: MasterAnalyticsRange;
  period_days: number;
  generated_at: string;
  time_zone: string;
  store: MasterAnalyticsStore;
  metrics: {
    visitors: number;
    recurrent_visitors: number;
    pageviews: number;
    orders_period: number;
    sold_units: number;
    product_revenue_usd: number;
  };
  order_statuses: Record<'pending' | 'confirmed' | 'preparing' | 'delivered' | 'cancelled', number>;
  daily: MasterAnalyticsDailyRow[];
  top_viewed_products: MasterAnalyticsProduct[];
  top_selling_products_by_units: MasterSellingProduct[];
  top_selling_products_by_revenue: MasterSellingProduct[];
  landing_qr: {
    views: number;
    clicks: number;
    top_buttons: MasterLandingQrButton[];
  };
  recent_orders: MasterRecentOrder[];
  top_pages: MasterVisitedPage[];
  pages: {
    page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
    items: MasterVisitedPage[];
  };
};

export type MasterReadonlyOrderItem = {
  product_name: string;
  variation_name: string;
  variation_label: string;
  quantity: number;
  unit_price_usd: number;
  line_total_usd: number;
  is_gift: boolean;
  item_image_url: string;
};

export type MasterReadonlyOrderDetail = {
  generated_at: string;
  store: MasterAnalyticsStore;
  order: {
    id: string;
    order_number: string;
    customer_name: string;
    status: MasterRecentOrder['status'];
    delivery_method: MasterRecentOrder['delivery_method'];
    created: string;
    usd_total: number;
    mixed_payment: boolean;
    items: MasterReadonlyOrderItem[];
  };
};

export type MasterPrivateEndpointResult<T> = {
  available: boolean;
  status: number;
  error: string;
  data: T | null;
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_TIMEOUT_MS = 9000;
const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'delivered', 'cancelled'] as const;
const DELIVERY_METHODS = ['delivery', 'pickup', 'coordinate'] as const;
const PRODUCT_STATES = ['available', 'hidden', 'sold_out', 'deleted'] as const;

export function isValidRecordId(value: unknown) {
  return RECORD_ID_PATTERN.test(String(value || '').trim());
}

export function normalizeMasterAnalyticsRange(value: unknown): MasterAnalyticsRange {
  const range = String(value || '').trim().toLowerCase();
  if (range === 'today' || range === '1') return 'today';
  if (range === '15' || range === '15d') return '15';
  if (range === '30' || range === '30d' || range === '1m') return '30';
  if (range === '90' || range === '90d' || range === '3m') return '90';
  return '7';
}

export function normalizeMasterAnalyticsPage(value: unknown) {
  const page = Number(value);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function boundedString(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeIsoDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function safeSlug(value: unknown) {
  const slug = boundedString(value, 120).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

function safePublicPath(value: unknown) {
  const path = boundedString(value, 240);
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('://')) return '';
  if (/^\/(?:master|admin)(?:\/|$)/i.test(path) || /^\/t\/[^/]+\/admin(?:\/|$)/i.test(path)) return '';
  return path;
}

function safeImageUrl(value: unknown) {
  const url = boundedString(value, 800);
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('://')) return url;
  return /^https:\/\/[^\s]+$/i.test(url) ? url : '';
}

function normalizeStatus(value: unknown): MasterRecentOrder['status'] {
  const status = boundedString(value, 20).toLowerCase();
  return ORDER_STATUSES.includes(status as MasterRecentOrder['status'])
    ? status as MasterRecentOrder['status']
    : 'pending';
}

function normalizeDelivery(value: unknown): MasterRecentOrder['delivery_method'] {
  const method = boundedString(value, 20).toLowerCase();
  return DELIVERY_METHODS.includes(method as MasterRecentOrder['delivery_method'])
    ? method as MasterRecentOrder['delivery_method']
    : 'coordinate';
}

function normalizeStore(input: any): MasterAnalyticsStore | null {
  const id = boundedString(input?.id, 15);
  if (!isValidRecordId(id)) return null;
  return {
    id,
    name: boundedString(input?.name, 160) || 'Tienda',
    slug: safeSlug(input?.slug),
    status: String(input?.status || '').toLowerCase() === 'active' ? 'active' : 'suspended',
  };
}

function normalizeDaily(input: any): MasterAnalyticsDailyRow | null {
  const day = boundedString(input?.day, 10);
  if (!DATE_KEY_PATTERN.test(day)) return null;
  return {
    day,
    label: boundedString(input?.label, 24) || day,
    visitors: nonNegativeInteger(input?.visitors),
    recurrent_visitors: nonNegativeInteger(input?.recurrent_visitors),
    pageviews: nonNegativeInteger(input?.pageviews),
    orders: nonNegativeInteger(input?.orders),
  };
}

function normalizeViewedProduct(input: any): MasterAnalyticsProduct | null {
  const productId = boundedString(input?.product_id, 15);
  if (productId && !isValidRecordId(productId)) return null;
  return {
    product_id: productId,
    name: boundedString(input?.name, 180) || 'Producto no disponible',
    slug: safeSlug(input?.slug),
    active: input?.active === true && Boolean(productId),
    views: nonNegativeInteger(input?.views),
  };
}

function normalizeSellingProduct(input: any): MasterSellingProduct | null {
  const productId = boundedString(input?.product_id, 15);
  if (productId && !isValidRecordId(productId)) return null;
  const state = boundedString(input?.state, 20);
  return {
    product_id: productId,
    name: boundedString(input?.name, 180) || 'Producto no disponible',
    slug: safeSlug(input?.slug),
    active: input?.active === true && Boolean(productId),
    state: PRODUCT_STATES.includes(state as MasterSellingProduct['state'])
      ? state as MasterSellingProduct['state']
      : productId ? 'hidden' : 'deleted',
    units_sold: nonNegativeInteger(input?.units_sold),
    orders_count: nonNegativeInteger(input?.orders_count),
    revenue_usd: finiteNumber(input?.revenue_usd),
    top_variation: boundedString(input?.top_variation, 160),
    top_variation_units: nonNegativeInteger(input?.top_variation_units),
  };
}

function normalizeRecentOrder(input: any): MasterRecentOrder | null {
  const id = boundedString(input?.id, 15);
  if (!isValidRecordId(id)) return null;
  return {
    id,
    order_number: boundedString(input?.order_number, 80),
    customer_name: boundedString(input?.customer_name, 160) || 'Cliente',
    status: normalizeStatus(input?.status),
    usd_total: finiteNumber(input?.usd_total),
    delivery_method: normalizeDelivery(input?.delivery_method),
    created: safeIsoDate(input?.created),
  };
}

function normalizeVisitedPage(input: any): MasterVisitedPage | null {
  const entityId = boundedString(input?.entity_id, 15);
  if (entityId && !isValidRecordId(entityId)) return null;
  return {
    page_type: boundedString(input?.page_type, 40) || 'other',
    entity_id: entityId,
    name: boundedString(input?.name, 180) || 'Página pública',
    detail: boundedString(input?.detail, 100) || 'Página pública',
    visits: nonNegativeInteger(input?.visits),
    last_visited_at: safeIsoDate(input?.last_visited_at),
    public_path: safePublicPath(input?.public_path),
  };
}

function normalizeAnalytics(input: any, expectedRange: MasterAnalyticsRange): MasterStoreAnalytics | null {
  if (input?.ok !== true || normalizeMasterAnalyticsRange(input?.range) !== expectedRange) return null;
  const store = normalizeStore(input?.store);
  if (!store) return null;
  const periodDays = expectedRange === 'today' ? 1 : Number(expectedRange);
  if (Number(input?.period_days) !== periodDays) return null;

  const daily = Array.isArray(input?.daily)
    ? input.daily.slice(0, 30).map(normalizeDaily).filter(Boolean) as MasterAnalyticsDailyRow[]
    : [];
  if (daily.length !== periodDays) return null;

  const page = normalizeMasterAnalyticsPage(input?.pages?.page);
  const totalItems = nonNegativeInteger(input?.pages?.total_items);
  const totalPages = Math.max(1, nonNegativeInteger(input?.pages?.total_pages));
  const pagesItems = Array.isArray(input?.pages?.items)
    ? input.pages.items.slice(0, 10).map(normalizeVisitedPage).filter(Boolean) as MasterVisitedPage[]
    : [];

  return {
    range: expectedRange,
    period_days: periodDays,
    generated_at: safeIsoDate(input?.generated_at),
    time_zone: boundedString(input?.time_zone, 80) || 'America/Havana',
    store,
    metrics: {
      visitors: nonNegativeInteger(input?.metrics?.visitors),
      recurrent_visitors: nonNegativeInteger(input?.metrics?.recurrent_visitors),
      pageviews: nonNegativeInteger(input?.metrics?.pageviews),
      orders_period: nonNegativeInteger(input?.metrics?.orders_period),
      sold_units: nonNegativeInteger(input?.metrics?.sold_units),
      product_revenue_usd: finiteNumber(input?.metrics?.product_revenue_usd),
    },
    order_statuses: {
      pending: nonNegativeInteger(input?.order_statuses?.pending),
      confirmed: nonNegativeInteger(input?.order_statuses?.confirmed),
      preparing: nonNegativeInteger(input?.order_statuses?.preparing),
      delivered: nonNegativeInteger(input?.order_statuses?.delivered),
      cancelled: nonNegativeInteger(input?.order_statuses?.cancelled),
    },
    daily,
    top_viewed_products: Array.isArray(input?.top_viewed_products)
      ? input.top_viewed_products.slice(0, 5).map(normalizeViewedProduct).filter(Boolean) as MasterAnalyticsProduct[]
      : [],
    top_selling_products_by_units: Array.isArray(input?.top_selling_products_by_units)
      ? input.top_selling_products_by_units.slice(0, 10).map(normalizeSellingProduct).filter(Boolean) as MasterSellingProduct[]
      : [],
    top_selling_products_by_revenue: Array.isArray(input?.top_selling_products_by_revenue)
      ? input.top_selling_products_by_revenue.slice(0, 10).map(normalizeSellingProduct).filter(Boolean) as MasterSellingProduct[]
      : [],
    landing_qr: {
      views: nonNegativeInteger(input?.landing_qr?.views),
      clicks: nonNegativeInteger(input?.landing_qr?.clicks),
      top_buttons: Array.isArray(input?.landing_qr?.top_buttons)
        ? input.landing_qr.top_buttons.slice(0, 10).map((button: any) => ({
          link_id: boundedString(button?.link_id, 80),
          link_type: boundedString(button?.link_type, 40),
          link_label: boundedString(button?.link_label, 100) || 'Botón',
          clicks: nonNegativeInteger(button?.clicks),
        }))
        : [],
    },
    recent_orders: Array.isArray(input?.recent_orders)
      ? input.recent_orders.slice(0, 10).map(normalizeRecentOrder).filter(Boolean) as MasterRecentOrder[]
      : [],
    top_pages: Array.isArray(input?.top_pages)
      ? input.top_pages.slice(0, 5).map(normalizeVisitedPage).filter(Boolean) as MasterVisitedPage[]
      : [],
    pages: {
      page: Math.min(page, totalPages),
      per_page: 10,
      total_items: totalItems,
      total_pages: totalPages,
      items: pagesItems,
    },
  };
}

function normalizeOrderDetail(input: any): MasterReadonlyOrderDetail | null {
  if (input?.ok !== true) return null;
  const store = normalizeStore(input?.store);
  const orderId = boundedString(input?.order?.id, 15);
  if (!store || !isValidRecordId(orderId)) return null;
  const items = Array.isArray(input?.order?.items)
    ? input.order.items.slice(0, 100).map((item: any) => ({
      product_name: boundedString(item?.product_name, 180) || (item?.is_gift === true ? 'Regalo' : 'Producto'),
      variation_name: boundedString(item?.variation_name, 160),
      variation_label: boundedString(item?.variation_label, 160),
      quantity: nonNegativeInteger(item?.quantity),
      unit_price_usd: finiteNumber(item?.unit_price_usd),
      line_total_usd: finiteNumber(item?.line_total_usd),
      is_gift: item?.is_gift === true,
      item_image_url: safeImageUrl(item?.item_image_url),
    }))
    : [];

  return {
    generated_at: safeIsoDate(input?.generated_at),
    store,
    order: {
      id: orderId,
      order_number: boundedString(input?.order?.order_number, 80),
      customer_name: boundedString(input?.order?.customer_name, 160) || 'Cliente',
      status: normalizeStatus(input?.order?.status),
      delivery_method: normalizeDelivery(input?.order?.delivery_method),
      created: safeIsoDate(input?.order?.created),
      usd_total: finiteNumber(input?.order?.usd_total),
      mixed_payment: input?.order?.mixed_payment === true,
      items,
    },
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
      headers: {
        Authorization: authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return {
      status: response.status,
      error: boundedString(payload?.error, 80),
      payload,
    };
  } catch (_) {
    return { status: 0, error: 'unavailable', payload: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMasterStoreAnalytics(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
  range: unknown = '7',
  pagesPage: unknown = 1,
): Promise<MasterPrivateEndpointResult<MasterStoreAnalytics>> {
  const safeStoreId = boundedString(storeId, 15);
  const safeRange = normalizeMasterAnalyticsRange(range);
  const safePage = normalizeMasterAnalyticsPage(pagesPage);
  if (!isValidRecordId(safeStoreId)) {
    return { available: false, status: 400, error: 'invalid_payload', data: null };
  }
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/store-analytics-detail', {
    store_id: safeStoreId,
    range: safeRange,
    pages_page: safePage,
  });
  if (result.status !== 200) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const data = normalizeAnalytics(result.payload, safeRange);
  return data
    ? { available: true, status: 200, error: '', data }
    : { available: false, status: 502, error: 'invalid_response', data: null };
}

export async function getMasterOrderReadonlyDetail(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
  orderId: string,
): Promise<MasterPrivateEndpointResult<MasterReadonlyOrderDetail>> {
  const safeStoreId = boundedString(storeId, 15);
  const safeOrderId = boundedString(orderId, 15);
  if (!isValidRecordId(safeStoreId) || !isValidRecordId(safeOrderId)) {
    return { available: false, status: 400, error: 'invalid_payload', data: null };
  }
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/order-readonly-detail', {
    store_id: safeStoreId,
    order_id: safeOrderId,
  });
  if (result.status !== 200) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const data = normalizeOrderDetail(result.payload);
  return data
    ? { available: true, status: 200, error: '', data }
    : { available: false, status: 502, error: 'invalid_response', data: null };
}

export function getMasterAnalyticsToken(client: PocketBase) {
  return boundedString(client?.authStore?.token, 5000);
}
