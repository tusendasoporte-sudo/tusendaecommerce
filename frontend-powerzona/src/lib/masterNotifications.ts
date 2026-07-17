export type MasterNotificationStatus = 'unread' | 'read' | 'archived';
export type MasterNotificationCategory = 'products' | 'security' | 'stores' | 'system';
export type MasterNotificationTone = 'normal' | 'critical';

export type MasterNotification = {
  id: string;
  type: string;
  category: MasterNotificationCategory;
  store_name: string;
  title: string;
  message: string;
  action_url: string;
  tone: MasterNotificationTone;
  status: MasterNotificationStatus;
  event_count: number;
  created: string;
  last_event_at: string;
};

export type MasterNotificationPage = {
  page: number;
  per_page: 10;
  total_items: number;
  total_pages: number;
  items: MasterNotification[];
};

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const REQUEST_TIMEOUT_MS = 9000;
const STATUSES = ['all', 'unread', 'read', 'archived'] as const;
const CATEGORIES = ['all', 'products', 'security', 'stores', 'system'] as const;

function boundedString(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
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

function safeActionUrl(value: unknown) {
  const url = boundedString(value, 500);
  if (!url || url.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(url)) return '/master/notifications';
  return url === '/master' || url.startsWith('/master/') ? url : '/master/notifications';
}

export function normalizeNotificationsPage(value: unknown) {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function normalizeNotificationStatus(value: unknown): (typeof STATUSES)[number] {
  const status = boundedString(value, 20) as (typeof STATUSES)[number];
  return STATUSES.includes(status) ? status : 'all';
}

export function normalizeNotificationCategory(value: unknown): (typeof CATEGORIES)[number] {
  const category = boundedString(value, 40) as (typeof CATEGORIES)[number];
  return CATEGORIES.includes(category) ? category : 'all';
}

function normalizeNotification(value: any): MasterNotification | null {
  const id = boundedString(value?.id, 15);
  if (!RECORD_ID_PATTERN.test(id)) return null;
  const category = normalizeNotificationCategory(value?.category);
  const status = normalizeNotificationStatus(value?.status);
  return {
    id,
    type: boundedString(value?.type, 60),
    category: category === 'all' ? 'system' : category,
    store_name: boundedString(value?.store_name, 160),
    title: boundedString(value?.title, 180),
    message: boundedString(value?.message, 500),
    action_url: safeActionUrl(value?.action_url),
    tone: value?.tone === 'critical' ? 'critical' : 'normal',
    status: status === 'all' ? 'unread' : status,
    event_count: Math.max(1, nonNegativeInteger(value?.event_count)),
    created: safeIsoDate(value?.created),
    last_event_at: safeIsoDate(value?.last_event_at),
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

export async function getMasterNotificationsFeed(pocketbaseUrl: string, token: string, limit = 10) {
  const safeLimit = Math.min(10, Math.max(1, Math.floor(Number(limit) || 10)));
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/notifications-feed', { limit: safeLimit });
  if (result.status !== 200 || result.payload?.ok !== true) {
    return { available: false, status: result.status, error: result.error, unread_count: 0, items: [] as MasterNotification[] };
  }
  return {
    available: true,
    status: 200,
    error: '',
    unread_count: nonNegativeInteger(result.payload?.unread_count),
    items: Array.isArray(result.payload?.items)
      ? result.payload.items.slice(0, safeLimit).map(normalizeNotification).filter(Boolean) as MasterNotification[]
      : [],
  };
}

export async function getMasterNotificationsPage(
  pocketbaseUrl: string,
  token: string,
  requestedPage: unknown,
  requestedStatus: unknown,
  requestedCategory: unknown,
) {
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/notifications-page', {
    page: normalizeNotificationsPage(requestedPage),
    status: normalizeNotificationStatus(requestedStatus),
    category: normalizeNotificationCategory(requestedCategory),
  });
  if (result.status !== 200 || result.payload?.ok !== true) {
    return { available: false, status: result.status, error: result.error, data: null as MasterNotificationPage | null };
  }
  const totalItems = nonNegativeInteger(result.payload?.page?.total_items);
  const totalPages = Math.max(1, nonNegativeInteger(result.payload?.page?.total_pages));
  return {
    available: true,
    status: 200,
    error: '',
    data: {
      page: Math.min(normalizeNotificationsPage(result.payload?.page?.page), totalPages),
      per_page: 10 as const,
      total_items: totalItems,
      total_pages: totalPages,
      items: Array.isArray(result.payload?.page?.items)
        ? result.payload.page.items.slice(0, 10).map(normalizeNotification).filter(Boolean) as MasterNotification[]
        : [],
    },
  };
}

export async function runMasterNotificationAction(
  pocketbaseUrl: string,
  token: string,
  action: 'mark_read' | 'archive' | 'delete' | 'mark_all_read' | 'delete_all',
  notificationId = '',
) {
  const body = action === 'mark_all_read' || action === 'delete_all'
    ? { action }
    : { action, notification_id: boundedString(notificationId, 15) };
  if (action !== 'mark_all_read' && action !== 'delete_all' && !RECORD_ID_PATTERN.test(body.notification_id || '')) {
    return { available: false, status: 400, error: 'invalid_payload', updated: 0 };
  }
  const result = await postPrivateEndpoint(pocketbaseUrl, token, '/api/pz/master/notification-action', body);
  return {
    available: result.status === 200 && result.payload?.ok === true,
    status: result.status,
    error: result.error,
    updated: nonNegativeInteger(result.payload?.updated),
  };
}
