const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const REQUEST_TIMEOUT_MS = 9000;

export type MasterOverviewActivity = {
  type: string;
  label: string;
  detail: string;
  created: string;
  action_label: string;
  action_url: string;
};

export type MasterGlobalTopStore = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  orders_30d: number;
  visitors_30d: number;
  pageviews_30d: number;
  last_activity_at: string;
  action_url: string;
};

export type MasterGlobalOverview = {
  generated_at: string;
  metrics: { active_price_watches: number; unread_notifications: number };
  recent_activity: MasterOverviewActivity[];
  top_stores: MasterGlobalTopStore[];
};

export type MasterStoreOverview = {
  generated_at: string;
  store: {
    id: string;
    name: string;
    slug: string;
    status: 'active' | 'suspended';
    featured: boolean;
    security_label: string;
  };
  metrics: {
    orders_total: number;
    orders_recent: number;
    visitors_30d: number;
    pageviews_30d: number;
    products_active: number;
    products_hidden: number;
    products_out_of_stock: number;
    products_watched: number;
  };
  activity: MasterOverviewActivity[];
  recent_orders: Array<{
    id: string;
    order_number: string;
    customer_name: string;
    created: string;
    status: string;
    usd_total: number;
    action_url: string;
  }>;
  attention: {
    out_of_stock: number;
    hidden: number;
    low_stock: number;
    unread_price_notifications: number;
    unread_security_notifications: number;
  };
  security: {
    blocked_customers: number;
    blocked_visitors: number;
    active_blocks: number;
    status_label: string;
  };
  team: { active_users: number; admins: number; staff: number };
};

export type MasterPriceWatchStatus = 'active' | 'paused' | 'deleted' | 'all';
export type MasterPriceWatchPage = {
  generated_at: string;
  page: {
    page: number;
    per_page: 10;
    total_items: number;
    total_pages: number;
    items: Array<{
      id: string;
      store: { id: string; name: string; slug: string };
      product: { id: string; name: string; slug: string };
      status: Exclude<MasterPriceWatchStatus, 'all'>;
      current_price_usd: number;
      target_alert_enabled: boolean;
      target_price_usd: number;
      target_met: boolean;
      last_change: string;
      last_change_at: string;
      created: string;
      action_url: string;
    }>;
  };
  stores: Array<{ id: string; name: string }>;
};

export type MasterOverviewResult<T> = {
  available: boolean;
  status: number;
  error: string;
  data: T | null;
};

function text(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
}

function integer(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isoDate(value: unknown) {
  const raw = text(value, 80);
  const parsed = raw ? new Date(raw) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function recordId(value: unknown) {
  const id = text(value, 15);
  return RECORD_ID_PATTERN.test(id) ? id : '';
}

function internalUrl(value: unknown) {
  const url = text(value, 500);
  return url === '/master' || url.startsWith('/master/') ? url : '/master';
}

function activity(value: any): MasterOverviewActivity | null {
  const label = text(value?.label, 180);
  if (!label) return null;
  return {
    type: text(value?.type, 40),
    label,
    detail: text(value?.detail, 260),
    created: isoDate(value?.created),
    action_label: text(value?.action_label, 60),
    action_url: internalUrl(value?.action_url),
  };
}

async function postEndpoint(
  pocketbaseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
) {
  const baseUrl = text(pocketbaseUrl, 500).replace(/\/$/, '');
  const authToken = text(token, 5000);
  if (!baseUrl || !authToken) return { status: 0, error: 'unavailable', payload: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, error: text(payload?.error, 80), payload };
  } catch (_) {
    return { status: 0, error: 'unavailable', payload: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMasterGlobalOverview(
  pocketbaseUrl: string,
  token: string,
): Promise<MasterOverviewResult<MasterGlobalOverview>> {
  const result = await postEndpoint(pocketbaseUrl, token, '/api/pz/master/global-overview', { period_days: 30 });
  if (result.status !== 200 || result.payload?.ok !== true) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const topStores = Array.isArray(result.payload.top_stores)
    ? result.payload.top_stores.slice(0, 5).map((item: any) => {
        const id = recordId(item?.id);
        return id ? {
          id,
          name: text(item?.name, 160) || 'Tienda',
          slug: text(item?.slug, 120),
          status: item?.status === 'active' ? 'active' as const : 'suspended' as const,
          orders_30d: integer(item?.orders_30d),
          visitors_30d: integer(item?.visitors_30d),
          pageviews_30d: integer(item?.pageviews_30d),
          last_activity_at: isoDate(item?.last_activity_at),
          action_url: internalUrl(item?.action_url),
        } : null;
      }).filter(Boolean) as MasterGlobalTopStore[]
    : [];
  return {
    available: true,
    status: 200,
    error: '',
    data: {
      generated_at: isoDate(result.payload.generated_at),
      metrics: {
        active_price_watches: integer(result.payload?.metrics?.active_price_watches),
        unread_notifications: integer(result.payload?.metrics?.unread_notifications),
      },
      recent_activity: Array.isArray(result.payload.recent_activity)
        ? result.payload.recent_activity.slice(0, 8).map(activity).filter(Boolean) as MasterOverviewActivity[]
        : [],
      top_stores: topStores,
    },
  };
}

export async function getMasterStoreOverview(
  pocketbaseUrl: string,
  token: string,
  storeId: string,
): Promise<MasterOverviewResult<MasterStoreOverview>> {
  const safeStoreId = recordId(storeId);
  if (!safeStoreId) return { available: false, status: 400, error: 'invalid_payload', data: null };
  const result = await postEndpoint(pocketbaseUrl, token, '/api/pz/master/store-overview', { store_id: safeStoreId });
  if (result.status !== 200 || result.payload?.ok !== true || recordId(result.payload?.store?.id) !== safeStoreId) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const payload = result.payload;
  return {
    available: true,
    status: 200,
    error: '',
    data: {
      generated_at: isoDate(payload.generated_at),
      store: {
        id: safeStoreId,
        name: text(payload.store.name, 160) || 'Tienda',
        slug: text(payload.store.slug, 120),
        status: payload.store.status === 'active' ? 'active' : 'suspended',
        featured: payload.store.featured === true,
        security_label: text(payload.store.security_label, 80),
      },
      metrics: {
        orders_total: integer(payload.metrics?.orders_total),
        orders_recent: integer(payload.metrics?.orders_recent),
        visitors_30d: integer(payload.metrics?.visitors_30d),
        pageviews_30d: integer(payload.metrics?.pageviews_30d),
        products_active: integer(payload.metrics?.products_active),
        products_hidden: integer(payload.metrics?.products_hidden),
        products_out_of_stock: integer(payload.metrics?.products_out_of_stock),
        products_watched: integer(payload.metrics?.products_watched),
      },
      activity: Array.isArray(payload.activity)
        ? payload.activity.slice(0, 10).map(activity).filter(Boolean) as MasterOverviewActivity[]
        : [],
      recent_orders: Array.isArray(payload.recent_orders)
        ? payload.recent_orders.slice(0, 5).map((item: any) => ({
            id: recordId(item?.id),
            order_number: text(item?.order_number, 80),
            customer_name: text(item?.customer_name, 160) || 'Cliente',
            created: isoDate(item?.created),
            status: text(item?.status, 40),
            usd_total: numberValue(item?.usd_total),
            action_url: internalUrl(item?.action_url),
          })).filter((item: any) => item.id)
        : [],
      attention: {
        out_of_stock: integer(payload.attention?.out_of_stock),
        hidden: integer(payload.attention?.hidden),
        low_stock: integer(payload.attention?.low_stock),
        unread_price_notifications: integer(payload.attention?.unread_price_notifications),
        unread_security_notifications: integer(payload.attention?.unread_security_notifications),
      },
      security: {
        blocked_customers: integer(payload.security?.blocked_customers),
        blocked_visitors: integer(payload.security?.blocked_visitors),
        active_blocks: integer(payload.security?.active_blocks),
        status_label: text(payload.security?.status_label, 80),
      },
      team: {
        active_users: integer(payload.team?.active_users),
        admins: integer(payload.team?.admins),
        staff: integer(payload.team?.staff),
      },
    },
  };
}

export function normalizePriceWatchPage(value: unknown) {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function normalizePriceWatchStatus(value: unknown): MasterPriceWatchStatus {
  const status = text(value, 20) as MasterPriceWatchStatus;
  return ['active', 'paused', 'deleted', 'all'].includes(status) ? status : 'active';
}

export async function getMasterPriceWatchPage(
  pocketbaseUrl: string,
  token: string,
  query: { page: unknown; status: unknown; store_id: unknown; search: unknown },
): Promise<MasterOverviewResult<MasterPriceWatchPage>> {
  const page = normalizePriceWatchPage(query.page);
  const status = normalizePriceWatchStatus(query.status);
  const rawStoreId = text(query.store_id, 15);
  const storeId = rawStoreId && recordId(rawStoreId);
  if (rawStoreId && !storeId) return { available: false, status: 400, error: 'invalid_payload', data: null };
  const search = text(query.search, 100);
  const result = await postEndpoint(pocketbaseUrl, token, '/api/pz/master/price-watch-page', {
    page,
    status,
    store_id: storeId || '',
    search,
  });
  if (result.status !== 200 || result.payload?.ok !== true) {
    return { available: false, status: result.status, error: result.error, data: null };
  }
  const payload = result.payload;
  const totalItems = integer(payload.page?.total_items);
  const totalPages = Math.max(1, integer(payload.page?.total_pages));
  return {
    available: true,
    status: 200,
    error: '',
    data: {
      generated_at: isoDate(payload.generated_at),
      page: {
        page: Math.min(normalizePriceWatchPage(payload.page?.page), totalPages),
        per_page: 10,
        total_items: totalItems,
        total_pages: totalPages,
        items: Array.isArray(payload.page?.items) ? payload.page.items.slice(0, 10).map((item: any) => {
          const id = recordId(item?.id);
          const itemStoreId = recordId(item?.store?.id);
          if (!id || !itemStoreId) return null;
          const itemStatus = ['active', 'paused', 'deleted'].includes(item?.status) ? item.status : 'deleted';
          return {
            id,
            store: { id: itemStoreId, name: text(item?.store?.name, 160) || 'Tienda', slug: text(item?.store?.slug, 120) },
            product: { id: recordId(item?.product?.id), name: text(item?.product?.name, 180) || 'Producto eliminado', slug: text(item?.product?.slug, 120) },
            status: itemStatus,
            current_price_usd: numberValue(item?.current_price_usd),
            target_alert_enabled: item?.target_alert_enabled === true,
            target_price_usd: numberValue(item?.target_price_usd),
            target_met: item?.target_met === true,
            last_change: text(item?.last_change, 300),
            last_change_at: isoDate(item?.last_change_at),
            created: isoDate(item?.created),
            action_url: internalUrl(item?.action_url),
          };
        }).filter(Boolean) : [],
      },
      stores: Array.isArray(payload.stores) ? payload.stores.slice(0, 100).map((item: any) => {
        const id = recordId(item?.id);
        return id ? { id, name: text(item?.name, 160) || 'Tienda' } : null;
      }).filter(Boolean) : [],
    } as MasterPriceWatchPage,
  };
}
