import type PocketBase from 'pocketbase';
import type { StoreSecuritySettings } from './security';

export const SECURITY_MONITORING_SECTIONS = ['summary', 'activity', 'customers', 'visitors', 'blocked', 'rules'] as const;
export const CUSTOMER_STATUS_FILTERS = ['all', 'normal', 'watch', 'blocked', 'archived'] as const;
export const EVENT_TYPE_FILTERS = ['all', 'order_created', 'order_rejected', 'review_submitted', 'raffle_entry', 'blocked_attempt', 'admin_action'] as const;
export const EVENT_DECISION_FILTERS = ['all', 'allowed', 'monitored', 'blocked'] as const;
export const EVENT_RISK_FILTERS = ['all', 'normal', 'suspicious', 'blocked'] as const;
export const SECURITY_BLOCK_STATUS_FILTERS = ['all', 'active', 'expired', 'revoked'] as const;
export const SECURITY_BLOCK_SCOPE_FILTERS = ['all', 'orders', 'reviews', 'raffles', 'all_interactions', 'full_access'] as const;
export const SECURITY_BLOCK_SCOPES = ['orders', 'reviews', 'raffles', 'all_interactions', 'full_access'] as const;
export const SECURITY_BLOCK_DURATIONS = ['hours_24', 'days_7', 'days_30', 'permanent'] as const;
export const SECURITY_BLOCK_MATCH_MODES = ['any', 'all'] as const;

export const CUSTOMERS_PER_PAGE = 20;
export const ACTIVITY_PER_PAGE = 20;
export const CUSTOMER_ORDERS_PER_PAGE = 10;
export const CUSTOMER_EVENTS_PER_PAGE = 10;
export const VISITORS_PER_PAGE = 20;
export const VISITOR_PAGEVIEWS_PER_PAGE = 20;
export const SECURITY_BLOCKS_PER_PAGE = 10;

export const CUSTOMER_LIST_FIELDS = [
  'id',
  'store',
  'display_name',
  'phone_normalized',
  'first_order_at',
  'last_order_at',
  'last_order',
  'orders_count',
  'pending_orders_count',
  'confirmed_orders_count',
  'preparing_orders_count',
  'delivered_orders_count',
  'cancelled_orders_count',
  'confirmed_total_usd',
  'phones_count',
  'devices_count',
  'last_address',
  'last_municipality',
  'status',
  'archived',
  'archived_at',
  'created',
  'updated',
].join(',');

const EVENT_FIELDS_WITH_IP = [
  'id',
  'store',
  'customer',
  'order',
  'event_type',
  'source_type',
  'risk_level',
  'decision',
  'mode_at_event',
  'ip_masked',
  'ip_family',
  'capture_status',
  'occurred_at',
  'created',
].join(',');

const EVENT_FIELDS_NO_IP = [
  'id',
  'store',
  'customer',
  'order',
  'event_type',
  'source_type',
  'risk_level',
  'decision',
  'mode_at_event',
  'ip_family',
  'capture_status',
  'occurred_at',
  'created',
].join(',');

export const CUSTOMER_LOOKUP_FIELDS = 'id,store,display_name,phone_normalized,status';
export const ORDER_LOOKUP_FIELDS = 'id,store,order_number,status,total,usd_total,delivery_method,created';
export const CUSTOMER_ORDER_FIELDS = 'id,store,customer,order_number,status,total,usd_total,delivery_method,created';

const VISITOR_SESSION_FIELDS_WITH_IP = [
  'id',
  'store',
  'day',
  'customer',
  'first_seen_at',
  'last_seen_at',
  'pageviews_count',
  'entry_path',
  'last_path',
  'latest_ip_masked',
  'latest_ip_family',
  'latest_capture_status',
  'created',
  'updated',
].join(',');

const VISITOR_SESSION_FIELDS_NO_IP = [
  'id',
  'store',
  'day',
  'customer',
  'first_seen_at',
  'last_seen_at',
  'pageviews_count',
  'entry_path',
  'last_path',
  'latest_ip_family',
  'latest_capture_status',
  'created',
  'updated',
].join(',');

const VISITOR_PAGEVIEW_FIELDS_WITH_IP = [
  'id',
  'store',
  'visitor_session',
  'customer',
  'day',
  'page_type',
  'entity_type',
  'entity_id',
  'path',
  'ip_masked',
  'ip_family',
  'capture_status',
  'occurred_at',
  'created',
].join(',');

const VISITOR_PAGEVIEW_FIELDS_NO_IP = [
  'id',
  'store',
  'visitor_session',
  'customer',
  'day',
  'page_type',
  'entity_type',
  'entity_id',
  'path',
  'ip_family',
  'capture_status',
  'occurred_at',
  'created',
].join(',');

export type SecurityMonitoringSection = (typeof SECURITY_MONITORING_SECTIONS)[number];
export type CustomerStatusFilter = (typeof CUSTOMER_STATUS_FILTERS)[number];
export type EventTypeFilter = (typeof EVENT_TYPE_FILTERS)[number];
export type EventDecisionFilter = (typeof EVENT_DECISION_FILTERS)[number];
export type EventRiskFilter = (typeof EVENT_RISK_FILTERS)[number];
export type SecurityBlockStatusFilter = (typeof SECURITY_BLOCK_STATUS_FILTERS)[number];
export type SecurityBlockScopeFilter = (typeof SECURITY_BLOCK_SCOPE_FILTERS)[number];
export type SecurityBlockScope = (typeof SECURITY_BLOCK_SCOPES)[number];
export type SecurityBlockDuration = (typeof SECURITY_BLOCK_DURATIONS)[number];
export type SecurityBlockMatchMode = (typeof SECURITY_BLOCK_MATCH_MODES)[number];

export type SecurityMonitoringParams = {
  section: SecurityMonitoringSection;
  customerId: string;
  customersPage: number;
  activityPage: number;
  visitorsPage: number;
  blockedPage: number;
  customerOrdersPage: number;
  customerEventsPage: number;
  customerStatus: CustomerStatusFilter;
  customerSearch: string;
  blockedStatus: SecurityBlockStatusFilter;
  blockedScope: SecurityBlockScopeFilter;
  blockedSearch: string;
  mergeSearch: string;
  eventType: EventTypeFilter;
  eventDecision: EventDecisionFilter;
  eventRisk: EventRiskFilter;
  usedPostSearch: boolean;
};

export type SecurityCustomer = {
  id: string;
  store: string;
  display_name: string;
  phone_normalized: string;
  primary_phone: string;
  first_order_at: string;
  last_order_at: string;
  last_order: string;
  orders_count: number;
  pending_orders_count: number;
  confirmed_orders_count: number;
  preparing_orders_count: number;
  delivered_orders_count: number;
  cancelled_orders_count: number;
  confirmed_total_usd: number;
  phones_count: number;
  devices_count: number;
  last_address: string;
  last_municipality: string;
  status: string;
  archived: boolean;
  archived_at: string;
  lifecycle_counts: SecurityCustomerLifecycleCounts;
  created: string;
  updated: string;
};

export type SecurityEvent = {
  id: string;
  store: string;
  customer: string;
  order: string;
  event_type: string;
  source_type: string;
  risk_level: string;
  decision: string;
  mode_at_event: string;
  ip_masked: string;
  ip_family: string;
  capture_status: string;
  occurred_at: string;
  created: string;
  resolved_ip: string;
  ip_resolution_status: IpResolutionStatus;
};

export type SecurityOrder = {
  id: string;
  store: string;
  customer: string;
  order_number: string;
  status: string;
  total: number;
  usd_total: number;
  delivery_method: string;
  created: string;
};

export type RelatedCustomer = Pick<SecurityCustomer, 'id' | 'store' | 'display_name' | 'phone_normalized' | 'status'>;
export type RelatedOrder = Pick<SecurityOrder, 'id' | 'store' | 'order_number' | 'status' | 'total' | 'usd_total' | 'delivery_method' | 'created'>;

export type IpResolutionStatus = 'hidden' | 'masked' | 'full' | 'full_unavailable' | 'unavailable';

export type PaginatedResult<T> = {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
};

export type SecurityEventRow = SecurityEvent & {
  relatedCustomer: RelatedCustomer | null;
  relatedOrder: RelatedOrder | null;
};

export type SecurityCustomerPhone = {
  phone_normalized: string;
  first_seen_at: string;
  last_seen_at: string;
  orders_count: number;
  is_primary: boolean;
};

export type SecurityCustomerDevice = {
  label: string;
  first_seen_at: string;
  last_seen_at: string;
  orders_count: number;
  ip_display: string;
  ip_resolution_status: IpResolutionStatus;
};

export type SecurityCustomerLinksSummary = {
  active_links: number;
  auto_device: number;
  auto_phone: number;
  manual: number;
  backfill: number;
};

export type SecurityCustomerLifecycleCounts = {
  orders_affected: number;
  events_affected: number;
  phones_affected: number;
  devices_affected: number;
  sessions_affected: number;
  pageviews_affected: number;
};

export type SecurityBlockSignalSummary = {
  phone: boolean;
  device: boolean;
  ip: boolean;
  mode: SecurityBlockMatchMode;
};

export type SecurityBlock = {
  id: string;
  customer_id: string;
  customer_name: string;
  primary_phone: string;
  scope: SecurityBlockScope;
  status: 'active' | 'expired' | 'revoked';
  duration: SecurityBlockDuration;
  starts_at: string;
  expires_at: string;
  created: string;
  revoked_at: string;
  signal_summary: SecurityBlockSignalSummary;
  created_by_name: string;
};

export type SecurityBlockHistorySummary = {
  active: number;
  expired: number;
  revoked: number;
};

export type SecurityBlockCapabilities = {
  can_observe: boolean;
  can_block: boolean;
  can_full_access: boolean;
  can_permanent: boolean;
  mode: string;
};

export type SecurityAvailableSignals = {
  phone_count: number;
  device_count: number;
  ip_count: number;
};

export type SecurityBlocksMetrics = {
  active_blocks: number;
  affected_customers: number;
  expires_today: number;
  permanent_blocks: number;
};

export type SecurityCustomerDetailResult = {
  customer: SecurityCustomer | null;
  orders: PaginatedResult<SecurityOrder>;
  events: PaginatedResult<SecurityEventRow>;
  phones: SecurityCustomerPhone[];
  devices: SecurityCustomerDevice[];
  linksSummary: SecurityCustomerLinksSummary;
  lifecycleCounts: SecurityCustomerLifecycleCounts;
  activeBlocks: SecurityBlock[];
  blockHistorySummary: SecurityBlockHistorySummary;
  blockCapabilities: SecurityBlockCapabilities;
  availableSignals: SecurityAvailableSignals;
  identityWarnings: string[];
  ordersError: boolean;
  eventsError: boolean;
};

export type SecuritySummary = {
  customersCount: number;
  archivedCustomersCount: number;
  eventsCount: number;
  visitorsTodayCount: number;
  watchCustomersCount: number;
  blockedCustomersCount: number;
};

export type SecurityVisitorSession = {
  id: string;
  store: string;
  day: string;
  customer: string;
  first_seen_at: string;
  last_seen_at: string;
  pageviews_count: number;
  entry_path: string;
  last_path: string;
  latest_ip_masked: string;
  latest_ip_family: string;
  latest_capture_status: string;
  created: string;
  updated: string;
  resolved_ip: string;
  ip_resolution_status: IpResolutionStatus;
};

export type SecurityVisitorSessionRow = SecurityVisitorSession & {
  relatedCustomer: RelatedCustomer | null;
};

export type SecurityVisitorPageview = {
  id: string;
  store: string;
  visitor_session: string;
  customer: string;
  day: string;
  page_type: string;
  entity_type: string;
  entity_id: string;
  path: string;
  ip_masked: string;
  ip_family: string;
  capture_status: string;
  occurred_at: string;
  created: string;
  resolved_ip: string;
  ip_resolution_status: IpResolutionStatus;
};

export type SecurityVisitorPageviewRow = SecurityVisitorPageview & {
  readableName: string;
};

export type SecuritySettingsView = Pick<
  StoreSecuritySettings,
  | 'mode'
  | 'retention_days'
  | 'ip_visibility'
  | 'manual_blocking_enabled'
  | 'full_access_blocking_enabled'
  | 'permanent_blocks_enabled'
  | 'notify_blocked_attempts'
>;

function hasAllowedValue<T extends readonly string[]>(allowed: T, value: unknown, fallback: T[number]): T[number] {
  const normalized = String(value || '').trim();
  return allowed.includes(normalized as T[number]) ? normalized as T[number] : fallback;
}

export function isValidRecordId(value: unknown) {
  return /^[a-z0-9]{15}$/.test(String(value || '').trim());
}

export function normalizePage(value: unknown) {
  const page = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function normalizeSection(value: unknown): SecurityMonitoringSection {
  return hasAllowedValue(SECURITY_MONITORING_SECTIONS, value, 'summary');
}

export function normalizeCustomerStatusFilter(value: unknown): CustomerStatusFilter {
  return hasAllowedValue(CUSTOMER_STATUS_FILTERS, value, 'all');
}

export function normalizeEventTypeFilter(value: unknown): EventTypeFilter {
  return hasAllowedValue(EVENT_TYPE_FILTERS, value, 'all');
}

export function normalizeEventDecisionFilter(value: unknown): EventDecisionFilter {
  return hasAllowedValue(EVENT_DECISION_FILTERS, value, 'all');
}

export function normalizeEventRiskFilter(value: unknown): EventRiskFilter {
  return hasAllowedValue(EVENT_RISK_FILTERS, value, 'all');
}

export function normalizeBlockStatusFilter(value: unknown): SecurityBlockStatusFilter {
  return hasAllowedValue(SECURITY_BLOCK_STATUS_FILTERS, value, 'active');
}

export function normalizeBlockScopeFilter(value: unknown): SecurityBlockScopeFilter {
  return hasAllowedValue(SECURITY_BLOCK_SCOPE_FILTERS, value, 'all');
}

export function normalizeSearchTerm(value: unknown) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function normalizePhoneSearch(value: string) {
  const term = String(value || '').trim();
  if (!term || !/^[\d\s()+.-]+$/.test(term)) return '';
  return term.replace(/\D/g, '').slice(0, 15);
}

function getFormValue(formData: FormData | null | undefined, key: string) {
  const value = formData?.get(key);
  return typeof value === 'string' ? value : '';
}

export function getMonitoringParams(url: URL, formData?: FormData | null): SecurityMonitoringParams {
  const section = normalizeSection(getFormValue(formData, 'section') || url.searchParams.get('section'));
  const customerId = String(getFormValue(formData, 'customer') || url.searchParams.get('customer') || '').trim();

  return {
    section,
    customerId: isValidRecordId(customerId) ? customerId : '',
    customersPage: normalizePage(getFormValue(formData, 'customers_page') || url.searchParams.get('customers_page')),
    activityPage: normalizePage(url.searchParams.get('activity_page')),
    visitorsPage: normalizePage(url.searchParams.get('visitors_page')),
    blockedPage: normalizePage(getFormValue(formData, 'blocked_page') || url.searchParams.get('blocked_page')),
    customerOrdersPage: normalizePage(url.searchParams.get('orders_page')),
    customerEventsPage: normalizePage(url.searchParams.get('events_page')),
    customerStatus: normalizeCustomerStatusFilter(getFormValue(formData, 'customer_status') || url.searchParams.get('customer_status')),
    customerSearch: normalizeSearchTerm(getFormValue(formData, 'customer_search')),
    blockedStatus: normalizeBlockStatusFilter(getFormValue(formData, 'blocked_status') || url.searchParams.get('blocked_status')),
    blockedScope: normalizeBlockScopeFilter(getFormValue(formData, 'blocked_scope') || url.searchParams.get('blocked_scope')),
    blockedSearch: normalizeSearchTerm(getFormValue(formData, 'blocked_search')),
    mergeSearch: normalizeSearchTerm(getFormValue(formData, 'merge_search') || url.searchParams.get('merge_search')),
    eventType: normalizeEventTypeFilter(url.searchParams.get('event_type')),
    eventDecision: normalizeEventDecisionFilter(url.searchParams.get('decision')),
    eventRisk: normalizeEventRiskFilter(url.searchParams.get('risk')),
    usedPostSearch: Boolean(formData),
  };
}

export function getEventFieldsForIpVisibility(ipVisibility: unknown) {
  return String(ipVisibility || '') === 'hidden' ? EVENT_FIELDS_NO_IP : EVENT_FIELDS_WITH_IP;
}

export function getVisitorSessionFieldsForIpVisibility(ipVisibility: unknown) {
  return String(ipVisibility || '') === 'hidden' ? VISITOR_SESSION_FIELDS_NO_IP : VISITOR_SESSION_FIELDS_WITH_IP;
}

export function getVisitorPageviewFieldsForIpVisibility(ipVisibility: unknown) {
  return String(ipVisibility || '') === 'hidden' ? VISITOR_PAGEVIEW_FIELDS_NO_IP : VISITOR_PAGEVIEW_FIELDS_WITH_IP;
}

export function getCubaDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Havana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getIpMaskedValue(record: any) {
  return String(record?.ip_masked || record?.latest_ip_masked || '').trim();
}

function applyIpPolicy<T extends { id: string; resolved_ip: string; ip_resolution_status: IpResolutionStatus }>(
  records: T[],
  settings: Pick<StoreSecuritySettings, 'ip_visibility'>,
  resolvedIps: Map<string, string>
) {
  const visibility = String(settings.ip_visibility || 'hidden');

  return records.map((record) => {
    if (visibility === 'hidden') {
      record.resolved_ip = '';
      record.ip_resolution_status = 'hidden';
      return record;
    }

    const fullIp = resolvedIps.get(record.id) || '';
    const maskedIp = getIpMaskedValue(record);

    if (visibility === 'full' && fullIp) {
      record.resolved_ip = fullIp;
      record.ip_resolution_status = 'full';
      return record;
    }

    if (visibility === 'full' && maskedIp) {
      record.resolved_ip = '';
      record.ip_resolution_status = 'full_unavailable';
      return record;
    }

    if (maskedIp) {
      record.resolved_ip = '';
      record.ip_resolution_status = 'masked';
      return record;
    }

    record.resolved_ip = '';
    record.ip_resolution_status = 'unavailable';
    return record;
  });
}

type ResolveIpSource = 'security_event' | 'visitor_session' | 'visitor_pageview';

async function resolveFullIps(
  client: PocketBase,
  source: ResolveIpSource,
  records: Array<{ id: string }>,
  settings: Pick<StoreSecuritySettings, 'ip_visibility'>
) {
  const map = new Map<string, string>();
  if (String(settings.ip_visibility || '') !== 'full') return map;

  const items = Array.from(new Set(records.map((record) => record.id).filter(isValidRecordId)))
    .slice(0, 100)
    .map((id) => ({ source, id }));

  if (!items.length) return map;

  try {
    const response = await (client as any).send('/api/pz/security/resolve-ips', {
      method: 'POST',
      body: { items },
    });

    const resolvedItems = Array.isArray(response?.items) ? response.items : [];
    resolvedItems.forEach((item: any) => {
      const id = String(item?.id || '');
      const ip = String(item?.ip || '').trim();
      if (isValidRecordId(id) && ip) map.set(id, ip);
    });
  } catch (_) {
  }

  return map;
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeCustomer(record: any): SecurityCustomer {
  return {
    id: String(record?.id || ''),
    store: String(record?.store || ''),
    display_name: String(record?.display_name || ''),
    phone_normalized: String(record?.phone_normalized || ''),
    primary_phone: String(record?.primary_phone || record?.phone_normalized || ''),
    first_order_at: String(record?.first_order_at || ''),
    last_order_at: String(record?.last_order_at || ''),
    last_order: String(record?.last_order || ''),
    orders_count: normalizeNumber(record?.orders_count),
    pending_orders_count: normalizeNumber(record?.pending_orders_count),
    confirmed_orders_count: normalizeNumber(record?.confirmed_orders_count),
    preparing_orders_count: normalizeNumber(record?.preparing_orders_count),
    delivered_orders_count: normalizeNumber(record?.delivered_orders_count),
    cancelled_orders_count: normalizeNumber(record?.cancelled_orders_count),
    confirmed_total_usd: normalizeNumber(record?.confirmed_total_usd),
    phones_count: normalizeNumber(record?.phones_count),
    devices_count: normalizeNumber(record?.devices_count),
    last_address: String(record?.last_address || ''),
    last_municipality: String(record?.last_municipality || ''),
    status: String(record?.status || 'normal'),
    archived: record?.archived === true,
    archived_at: String(record?.archived_at || ''),
    lifecycle_counts: normalizeLifecycleCounts(record?.lifecycle_counts),
    created: String(record?.created || ''),
    updated: String(record?.updated || ''),
  };
}

function normalizeEvent(record: any): SecurityEvent {
  return {
    id: String(record?.id || ''),
    store: String(record?.store || ''),
    customer: String(record?.customer || ''),
    order: String(record?.order || ''),
    event_type: String(record?.event_type || ''),
    source_type: String(record?.source_type || ''),
    risk_level: String(record?.risk_level || ''),
    decision: String(record?.decision || ''),
    mode_at_event: String(record?.mode_at_event || ''),
    ip_masked: String(record?.ip_masked || ''),
    ip_family: String(record?.ip_family || ''),
    capture_status: String(record?.capture_status || ''),
    occurred_at: String(record?.occurred_at || ''),
    created: String(record?.created || ''),
    resolved_ip: '',
    ip_resolution_status: 'unavailable',
  };
}

function normalizeOrder(record: any): SecurityOrder {
  return {
    id: String(record?.id || ''),
    store: String(record?.store || ''),
    customer: String(record?.customer || ''),
    order_number: String(record?.order_number || ''),
    status: String(record?.status || ''),
    total: normalizeNumber(record?.total),
    usd_total: normalizeNumber(record?.usd_total),
    delivery_method: String(record?.delivery_method || ''),
    created: String(record?.created || ''),
  };
}

function normalizeVisitorSession(record: any): SecurityVisitorSession {
  return {
    id: String(record?.id || ''),
    store: String(record?.store || ''),
    day: String(record?.day || ''),
    customer: String(record?.customer || ''),
    first_seen_at: String(record?.first_seen_at || ''),
    last_seen_at: String(record?.last_seen_at || ''),
    pageviews_count: normalizeNumber(record?.pageviews_count),
    entry_path: String(record?.entry_path || ''),
    last_path: String(record?.last_path || ''),
    latest_ip_masked: String(record?.latest_ip_masked || ''),
    latest_ip_family: String(record?.latest_ip_family || ''),
    latest_capture_status: String(record?.latest_capture_status || ''),
    created: String(record?.created || ''),
    updated: String(record?.updated || ''),
    resolved_ip: '',
    ip_resolution_status: 'unavailable',
  };
}

function normalizeVisitorPageview(record: any): SecurityVisitorPageview {
  return {
    id: String(record?.id || ''),
    store: String(record?.store || ''),
    visitor_session: String(record?.visitor_session || ''),
    customer: String(record?.customer || ''),
    day: String(record?.day || ''),
    page_type: String(record?.page_type || ''),
    entity_type: String(record?.entity_type || ''),
    entity_id: String(record?.entity_id || ''),
    path: String(record?.path || ''),
    ip_masked: String(record?.ip_masked || ''),
    ip_family: String(record?.ip_family || ''),
    capture_status: String(record?.capture_status || ''),
    occurred_at: String(record?.occurred_at || ''),
    created: String(record?.created || ''),
    resolved_ip: '',
    ip_resolution_status: 'unavailable',
  };
}

function normalizeListResult<T>(result: any, items: T[]): PaginatedResult<T> {
  const totalPages = Math.max(1, normalizeNumber(result?.totalPages) || 1);
  const page = Math.min(Math.max(1, normalizeNumber(result?.page) || 1), totalPages);

  return {
    page,
    perPage: Math.max(1, normalizeNumber(result?.perPage) || items.length || 1),
    totalItems: Math.max(0, normalizeNumber(result?.totalItems)),
    totalPages,
    items,
  };
}

function emptyCustomerOrdersPage(page: number): PaginatedResult<SecurityOrder> {
  return {
    page: normalizePage(page),
    perPage: CUSTOMER_ORDERS_PER_PAGE,
    totalItems: 0,
    totalPages: 1,
    items: [],
  };
}

function emptyCustomerEventsPage(page: number): PaginatedResult<SecurityEventRow> {
  return {
    page: normalizePage(page),
    perPage: CUSTOMER_EVENTS_PER_PAGE,
    totalItems: 0,
    totalPages: 1,
    items: [],
  };
}

function normalizeEndpointPage<T>(result: any, items: T[], fallbackPage: number, fallbackPerPage: number): PaginatedResult<T> {
  const totalItems = Math.max(0, normalizeNumber(result?.totalItems));
  const totalPages = Math.max(1, normalizeNumber(result?.totalPages) || Math.ceil(totalItems / fallbackPerPage) || 1);
  const page = Math.min(Math.max(1, normalizeNumber(result?.page) || normalizePage(fallbackPage)), totalPages);

  return {
    page,
    perPage: Math.max(1, normalizeNumber(result?.perPage) || fallbackPerPage),
    totalItems,
    totalPages,
    items,
  };
}

function eventListFilter(
  client: PocketBase,
  storeId: string,
  eventType: EventTypeFilter,
  decision: EventDecisionFilter,
  risk: EventRiskFilter,
  customerId = ''
) {
  const parts = ['store = {:store}'];
  const params: Record<string, string> = { store: storeId };

  if (eventType !== 'all') {
    parts.push('event_type = {:eventType}');
    params.eventType = eventType;
  }

  if (decision !== 'all') {
    parts.push('decision = {:decision}');
    params.decision = decision;
  }

  if (risk !== 'all') {
    parts.push('risk_level = {:risk}');
    params.risk = risk;
  }

  if (customerId) {
    parts.push('customer = {:customer}');
    params.customer = customerId;
  }

  return client.filter(parts.join(' && '), params);
}

function idsFilter(client: PocketBase, storeId: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(isValidRecordId)));
  if (!uniqueIds.length) return '';

  const params: Record<string, string> = { store: storeId };
  const idParts = uniqueIds.map((id, index) => {
    const key = `id${index}`;
    params[key] = id;
    return `id = {:${key}}`;
  });

  return client.filter(`store = {:store} && (${idParts.join(' || ')})`, params);
}

async function getRelatedCustomers(client: PocketBase, storeId: string, ids: string[]) {
  const filter = idsFilter(client, storeId, ids);
  const map = new Map<string, RelatedCustomer>();
  if (!filter) return map;

  const result = await client.collection('store_customers').getList(1, Math.max(1, ids.length), {
    filter,
    fields: CUSTOMER_LOOKUP_FIELDS,
  });

  result.items.forEach((record: any) => {
    const customer = normalizeCustomer(record);
    if (customer.id) map.set(customer.id, customer);
  });

  return map;
}

async function getRelatedOrders(client: PocketBase, storeId: string, ids: string[]) {
  const filter = idsFilter(client, storeId, ids);
  const map = new Map<string, RelatedOrder>();
  if (!filter) return map;

  const result = await client.collection('orders').getList(1, Math.max(1, ids.length), {
    filter,
    fields: ORDER_LOOKUP_FIELDS,
  });

  result.items.forEach((record: any) => {
    const order = normalizeOrder(record);
    if (order.id) map.set(order.id, order);
  });

  return map;
}

export async function getSecurityMonitoringSummary(client: PocketBase, storeId: string): Promise<SecuritySummary> {
  const response = await (client as any).send('/api/pz/security/monitoring-summary', {
    method: 'POST',
    body: {
      store_id: storeId,
    },
  });

  if (!response?.ok) throw new Error('summary_failed');

  return {
    customersCount: normalizeNumber(response.active_customers_count),
    archivedCustomersCount: normalizeNumber(response.archived_customers_count),
    eventsCount: normalizeNumber(response.events_count),
    visitorsTodayCount: normalizeNumber(response.visitors_today_count),
    watchCustomersCount: normalizeNumber(response.watch_customers_count),
    blockedCustomersCount: normalizeNumber(response.blocked_customers_count),
  };
}

export async function getSecurityCustomersPage(
  client: PocketBase,
  storeId: string,
  page: number,
  status: CustomerStatusFilter,
  search: string
): Promise<PaginatedResult<SecurityCustomer>> {
  const safePage = normalizePage(page);
  const response = await (client as any).send('/api/pz/security/customers-page', {
    method: 'POST',
    body: {
      store_id: storeId,
      page: safePage,
      status,
      search: normalizeSearchTerm(search),
    },
  });

  if (!response?.ok) throw new Error('customers_page_failed');
  const result = response.customers || {};
  const items = Array.isArray(result?.items) ? result.items.map(normalizeCustomer) : [];
  return normalizeEndpointPage(result, items, safePage, CUSTOMERS_PER_PAGE);
}

export async function getSecurityCustomerById(client: PocketBase, storeId: string, customerId: string) {
  if (!isValidRecordId(customerId)) return null;

  try {
    const detail = await getSecurityCustomerDetail(client, storeId, customerId, 1, 1);
    return detail.customer;
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function getSecurityMergeCandidates(
  client: PocketBase,
  storeId: string,
  currentCustomerId: string,
  search: string
): Promise<SecurityCustomer[]> {
  const cleanSearch = normalizeSearchTerm(search);
  if (!cleanSearch) return [];
  const result = await getSecurityCustomersPage(client, storeId, 1, 'all', cleanSearch);
  return result.items.filter((customer) => customer.id !== currentCustomerId).slice(0, 12);
}

export async function mergeSecurityCustomers(
  client: PocketBase,
  storeId: string,
  canonicalCustomerId: string,
  sourceCustomerId: string,
  reason: string
) {
  const response = await (client as any).send('/api/pz/security/merge-customers', {
    method: 'POST',
    body: {
      store_id: storeId,
      canonical_customer_id: canonicalCustomerId,
      source_customer_id: sourceCustomerId,
      reason: normalizeSearchTerm(reason).slice(0, 500),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'merge_failed'));
  return String(response.canonical_customer_id || canonicalCustomerId);
}

export type SecurityCustomerLifecycleAction = 'archive' | 'restore' | 'delete_profile';

export async function runSecurityCustomerLifecycle(
  client: PocketBase,
  storeId: string,
  customerId: string,
  action: SecurityCustomerLifecycleAction,
  reason: string
) {
  const response = await (client as any).send('/api/pz/security/customer-lifecycle', {
    method: 'POST',
    body: {
      store_id: storeId,
      customer_id: customerId,
      action,
      reason: normalizeSearchTerm(reason).slice(0, 500),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'lifecycle_failed'));

  return {
    customerId: String(response.customer_id || customerId),
    archived: response.archived === true,
    deleted: response.deleted === true,
    counts: normalizeLifecycleCounts(response.counts),
  };
}

export async function runSecurityCustomerObservation(
  client: PocketBase,
  storeId: string,
  customerId: string,
  action: 'enable' | 'disable',
  reason: string
) {
  const response = await (client as any).send('/api/pz/security/customer-observation', {
    method: 'POST',
    body: {
      store_id: storeId,
      customer_id: customerId,
      action,
      reason: normalizeSearchTerm(reason).slice(0, 500),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'observation_failed'));
  return {
    customerId: String(response.customer_id || customerId),
    status: String(response.status || ''),
  };
}

export async function runSecurityBlockCreate(
  client: PocketBase,
  storeId: string,
  customerId: string,
  options: {
    scope: SecurityBlockScope;
    duration: SecurityBlockDuration;
    matchPhone: boolean;
    matchDevice: boolean;
    matchIp: boolean;
    matchMode: SecurityBlockMatchMode;
    reason: string;
  }
) {
  const response = await (client as any).send('/api/pz/security/block-action', {
    method: 'POST',
    body: {
      store_id: storeId,
      customer_id: customerId,
      action: 'create',
      scope: options.scope,
      duration: options.duration,
      match_phone: options.matchPhone === true,
      match_device: options.matchDevice === true,
      match_ip: options.matchIp === true,
      match_mode: options.matchMode,
      reason: normalizeSearchTerm(options.reason).slice(0, 500),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'block_create_failed'));
  return normalizeSecurityBlock(response.block);
}

export async function runSecurityBlockRevoke(
  client: PocketBase,
  storeId: string,
  blockId: string,
  reason: string
) {
  const response = await (client as any).send('/api/pz/security/block-action', {
    method: 'POST',
    body: {
      store_id: storeId,
      block_id: blockId,
      action: 'revoke',
      reason: normalizeSearchTerm(reason).slice(0, 500),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'block_revoke_failed'));
  return normalizeSecurityBlock(response.block);
}

export async function getSecurityBlocksPage(
  client: PocketBase,
  storeId: string,
  page: number,
  status: SecurityBlockStatusFilter,
  scope: SecurityBlockScopeFilter,
  search: string
): Promise<{ blocks: PaginatedResult<SecurityBlock>; metrics: SecurityBlocksMetrics }> {
  const safePage = normalizePage(page);
  const response = await (client as any).send('/api/pz/security/blocks-page', {
    method: 'POST',
    body: {
      store_id: storeId,
      page: safePage,
      status,
      scope,
      search: normalizeSearchTerm(search),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'blocks_page_failed'));
  const rawBlocks = response.blocks || {};
  const items = Array.isArray(rawBlocks.items) ? rawBlocks.items.map(normalizeSecurityBlock) : [];
  return {
    blocks: normalizeEndpointPage(rawBlocks, items, safePage, SECURITY_BLOCKS_PER_PAGE),
    metrics: normalizeBlocksMetrics(response.metrics),
  };
}

export async function getSecurityActivityPage(
  client: PocketBase,
  storeId: string,
  page: number,
  settings: Pick<StoreSecuritySettings, 'ip_visibility'>,
  eventType: EventTypeFilter,
  decision: EventDecisionFilter,
  risk: EventRiskFilter
): Promise<PaginatedResult<SecurityEventRow>> {
  const result = await client.collection('store_security_events').getList(normalizePage(page), ACTIVITY_PER_PAGE, {
    filter: eventListFilter(client, storeId, eventType, decision, risk),
    fields: getEventFieldsForIpVisibility(settings.ip_visibility),
    sort: '-occurred_at,-created',
  });

  const resolvedIps = await resolveFullIps(client, 'security_event', result.items, settings);
  const events = applyIpPolicy(result.items.map(normalizeEvent), settings, resolvedIps);
  const customerMap = await getRelatedCustomers(client, storeId, events.map((event) => event.customer));
  const orderMap = await getRelatedOrders(client, storeId, events.map((event) => event.order));
  const rows = events.map((event) => ({
    ...event,
    relatedCustomer: customerMap.get(event.customer) || null,
    relatedOrder: orderMap.get(event.order) || null,
  }));

  return normalizeListResult(result, rows);
}

export async function getSecurityCustomerOrdersPage(
  client: PocketBase,
  storeId: string,
  customerId: string,
  page: number
): Promise<PaginatedResult<SecurityOrder>> {
  if (!isValidRecordId(customerId)) {
    return { page: 1, perPage: CUSTOMER_ORDERS_PER_PAGE, totalItems: 0, totalPages: 1, items: [] };
  }

  const result = await client.collection('orders').getList(normalizePage(page), CUSTOMER_ORDERS_PER_PAGE, {
    filter: client.filter('store = {:store} && customer = {:customer}', { store: storeId, customer: customerId }),
    fields: CUSTOMER_ORDER_FIELDS,
    sort: '-created',
  });

  return normalizeListResult(result, result.items.map(normalizeOrder));
}

export async function getSecurityCustomerEventsPage(
  client: PocketBase,
  storeId: string,
  customerId: string,
  page: number,
  settings: Pick<StoreSecuritySettings, 'ip_visibility'>
): Promise<PaginatedResult<SecurityEventRow>> {
  if (!isValidRecordId(customerId)) {
    return { page: 1, perPage: CUSTOMER_EVENTS_PER_PAGE, totalItems: 0, totalPages: 1, items: [] };
  }

  const result = await client.collection('store_security_events').getList(normalizePage(page), CUSTOMER_EVENTS_PER_PAGE, {
    filter: eventListFilter(client, storeId, 'all', 'all', 'all', customerId),
    fields: getEventFieldsForIpVisibility(settings.ip_visibility),
    sort: '-occurred_at,-created',
  });

  const resolvedIps = await resolveFullIps(client, 'security_event', result.items, settings);
  const events = applyIpPolicy(result.items.map(normalizeEvent), settings, resolvedIps);
  const orderMap = await getRelatedOrders(client, storeId, events.map((event) => event.order));
  const rows = events.map((event) => ({
    ...event,
    relatedCustomer: null,
    relatedOrder: orderMap.get(event.order) || null,
  }));

  return normalizeListResult(result, rows);
}

function normalizeCustomerDetailOrder(record: any): SecurityOrder {
  const order = normalizeOrder(record);
  return {
    ...order,
    store: '',
    customer: '',
  };
}

function normalizeCustomerDetailEvent(record: any): SecurityEventRow {
  const status = String(record?.ip_resolution_status || 'unavailable') as IpResolutionStatus;
  const ipDisplay = String(record?.ip_display || '').trim();
  const relatedOrderRecord = record?.related_order || record?.relatedOrder || null;
  const relatedOrder = relatedOrderRecord ? normalizeCustomerDetailOrder(relatedOrderRecord) : null;
  const isFull = status === 'full';

  return {
    id: String(record?.id || ''),
    store: '',
    customer: '',
    order: String(record?.order_id || ''),
    event_type: String(record?.event_type || ''),
    source_type: String(record?.source_type || ''),
    risk_level: String(record?.risk_level || ''),
    decision: String(record?.decision || ''),
    mode_at_event: String(record?.mode_at_event || ''),
    ip_masked: isFull ? '' : ipDisplay,
    ip_family: '',
    capture_status: String(record?.capture_status || ''),
    occurred_at: String(record?.occurred_at || ''),
    created: '',
    resolved_ip: isFull ? ipDisplay : '',
    ip_resolution_status: ['hidden', 'masked', 'full', 'full_unavailable', 'unavailable'].includes(status) ? status : 'unavailable',
    relatedCustomer: null,
    relatedOrder,
  };
}

function normalizeCustomerPhone(record: any): SecurityCustomerPhone {
  return {
    phone_normalized: String(record?.phone_normalized || ''),
    first_seen_at: String(record?.first_seen_at || ''),
    last_seen_at: String(record?.last_seen_at || ''),
    orders_count: normalizeNumber(record?.orders_count),
    is_primary: record?.is_primary === true,
  };
}

function normalizeCustomerDevice(record: any): SecurityCustomerDevice {
  const status = String(record?.ip_resolution_status || 'unavailable') as IpResolutionStatus;
  return {
    label: String(record?.label || 'Dispositivo'),
    first_seen_at: String(record?.first_seen_at || ''),
    last_seen_at: String(record?.last_seen_at || ''),
    orders_count: normalizeNumber(record?.orders_count),
    ip_display: String(record?.ip_display || ''),
    ip_resolution_status: ['hidden', 'masked', 'full', 'full_unavailable', 'unavailable'].includes(status) ? status : 'unavailable',
  };
}

function normalizeLinksSummary(record: any): SecurityCustomerLinksSummary {
  return {
    active_links: normalizeNumber(record?.active_links),
    auto_device: normalizeNumber(record?.auto_device),
    auto_phone: normalizeNumber(record?.auto_phone),
    manual: normalizeNumber(record?.manual),
    backfill: normalizeNumber(record?.backfill),
  };
}

function normalizeLifecycleCounts(record: any): SecurityCustomerLifecycleCounts {
  return {
    orders_affected: normalizeNumber(record?.orders_affected),
    events_affected: normalizeNumber(record?.events_affected),
    phones_affected: normalizeNumber(record?.phones_affected),
    devices_affected: normalizeNumber(record?.devices_affected),
    sessions_affected: normalizeNumber(record?.sessions_affected),
    pageviews_affected: normalizeNumber(record?.pageviews_affected),
  };
}

function normalizeSignalSummary(record: any): SecurityBlockSignalSummary {
  const mode = String(record?.mode || 'any');
  return {
    phone: record?.phone === true,
    device: record?.device === true,
    ip: record?.ip === true,
    mode: SECURITY_BLOCK_MATCH_MODES.includes(mode as SecurityBlockMatchMode) ? mode as SecurityBlockMatchMode : 'any',
  };
}

function normalizeSecurityBlock(record: any): SecurityBlock {
  const scope = String(record?.scope || 'orders');
  const status = String(record?.status || 'active');
  const duration = String(record?.duration || 'days_7');
  return {
    id: String(record?.id || ''),
    customer_id: String(record?.customer_id || ''),
    customer_name: String(record?.customer_name || ''),
    primary_phone: String(record?.primary_phone || ''),
    scope: SECURITY_BLOCK_SCOPES.includes(scope as SecurityBlockScope) ? scope as SecurityBlockScope : 'orders',
    status: ['active', 'expired', 'revoked'].includes(status) ? status as SecurityBlock['status'] : 'active',
    duration: SECURITY_BLOCK_DURATIONS.includes(duration as SecurityBlockDuration) ? duration as SecurityBlockDuration : 'days_7',
    starts_at: String(record?.starts_at || ''),
    expires_at: String(record?.expires_at || ''),
    created: String(record?.created || ''),
    revoked_at: String(record?.revoked_at || ''),
    signal_summary: normalizeSignalSummary(record?.signal_summary),
    created_by_name: String(record?.created_by_name || ''),
  };
}

function normalizeBlockHistorySummary(record: any): SecurityBlockHistorySummary {
  return {
    active: normalizeNumber(record?.active),
    expired: normalizeNumber(record?.expired),
    revoked: normalizeNumber(record?.revoked),
  };
}

function normalizeBlockCapabilities(record: any): SecurityBlockCapabilities {
  return {
    can_observe: record?.can_observe === true,
    can_block: record?.can_block === true,
    can_full_access: record?.can_full_access === true,
    can_permanent: record?.can_permanent === true,
    mode: String(record?.mode || ''),
  };
}

function normalizeAvailableSignals(record: any): SecurityAvailableSignals {
  return {
    phone_count: normalizeNumber(record?.phone_count),
    device_count: normalizeNumber(record?.device_count),
    ip_count: normalizeNumber(record?.ip_count),
  };
}

function normalizeBlocksMetrics(record: any): SecurityBlocksMetrics {
  return {
    active_blocks: normalizeNumber(record?.active_blocks),
    affected_customers: normalizeNumber(record?.affected_customers),
    expires_today: normalizeNumber(record?.expires_today),
    permanent_blocks: normalizeNumber(record?.permanent_blocks),
  };
}

export async function getSecurityCustomerDetail(
  client: PocketBase,
  storeId: string,
  customerId: string,
  ordersPage: number,
  eventsPage: number
): Promise<SecurityCustomerDetailResult> {
  const safeOrdersPage = normalizePage(ordersPage);
  const safeEventsPage = normalizePage(eventsPage);
  const fallback: SecurityCustomerDetailResult = {
    customer: null,
    orders: emptyCustomerOrdersPage(safeOrdersPage),
    events: emptyCustomerEventsPage(safeEventsPage),
    phones: [],
    devices: [],
    linksSummary: normalizeLinksSummary(null),
    lifecycleCounts: normalizeLifecycleCounts(null),
    activeBlocks: [],
    blockHistorySummary: normalizeBlockHistorySummary(null),
    blockCapabilities: normalizeBlockCapabilities(null),
    availableSignals: normalizeAvailableSignals(null),
    identityWarnings: [],
    ordersError: false,
    eventsError: false,
  };

  if (!isValidRecordId(storeId) || !isValidRecordId(customerId)) return fallback;

  const response = await (client as any).send('/api/pz/security/customer-detail', {
    method: 'POST',
    body: {
      store_id: storeId,
      customer_id: customerId,
      orders_page: safeOrdersPage,
      events_page: safeEventsPage,
    },
  });

  if (!response?.ok) {
    throw new Error('customer_detail_failed');
  }

  const orders = Array.isArray(response?.orders?.items)
    ? response.orders.items.map(normalizeCustomerDetailOrder)
    : [];
  const events = Array.isArray(response?.events?.items)
    ? response.events.items.map(normalizeCustomerDetailEvent)
    : [];
  const phones = Array.isArray(response?.phones)
    ? response.phones.map(normalizeCustomerPhone)
    : [];
  const devices = Array.isArray(response?.devices)
    ? response.devices.map(normalizeCustomerDevice)
    : [];

  return {
    customer: response?.customer ? normalizeCustomer(response.customer) : null,
    orders: normalizeEndpointPage(response.orders, orders, safeOrdersPage, CUSTOMER_ORDERS_PER_PAGE),
    events: normalizeEndpointPage(response.events, events, safeEventsPage, CUSTOMER_EVENTS_PER_PAGE),
    phones,
    devices,
    linksSummary: normalizeLinksSummary(response?.links_summary),
    lifecycleCounts: normalizeLifecycleCounts(response?.lifecycle_counts),
    activeBlocks: Array.isArray(response?.active_blocks) ? response.active_blocks.map(normalizeSecurityBlock) : [],
    blockHistorySummary: normalizeBlockHistorySummary(response?.block_history_summary),
    blockCapabilities: normalizeBlockCapabilities(response?.block_capabilities),
    availableSignals: normalizeAvailableSignals(response?.available_signals),
    identityWarnings: Array.isArray(response?.identity_warnings)
      ? response.identity_warnings.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    ordersError: Boolean(response.orders_error),
    eventsError: Boolean(response.events_error),
  };
}

export async function getSecurityVisitorsTodayPage(
  client: PocketBase,
  storeId: string,
  page: number,
  settings: Pick<StoreSecuritySettings, 'ip_visibility'>
): Promise<PaginatedResult<SecurityVisitorSessionRow>> {
  const today = getCubaDay();
  const result = await client.collection('store_visitor_sessions').getList(normalizePage(page), VISITORS_PER_PAGE, {
    filter: client.filter('store = {:store} && day = {:day}', { store: storeId, day: today }),
    fields: getVisitorSessionFieldsForIpVisibility(settings.ip_visibility),
    sort: '-last_seen_at,-updated,-created',
  });

  const resolvedIps = await resolveFullIps(client, 'visitor_session', result.items, settings);
  const sessions = applyIpPolicy(result.items.map(normalizeVisitorSession), settings, resolvedIps);
  const customerMap = await getRelatedCustomers(client, storeId, sessions.map((session) => session.customer));
  const rows = sessions.map((session) => ({
    ...session,
    relatedCustomer: customerMap.get(session.customer) || null,
  }));

  return normalizeListResult(result, rows);
}

export async function getSecurityVisitorSessionById(
  client: PocketBase,
  storeId: string,
  visitorSessionId: string,
  settings: Pick<StoreSecuritySettings, 'ip_visibility'>
) {
  if (!isValidRecordId(visitorSessionId)) return null;

  const today = getCubaDay();

  try {
    const record = await client.collection('store_visitor_sessions').getFirstListItem(
      client.filter('id = {:visitorSessionId} && store = {:store} && day = {:day}', {
        visitorSessionId,
        store: storeId,
        day: today,
      }),
      { fields: getVisitorSessionFieldsForIpVisibility(settings.ip_visibility) }
    );

    const resolvedIps = await resolveFullIps(client, 'visitor_session', [record], settings);
    const [session] = applyIpPolicy([normalizeVisitorSession(record)], settings, resolvedIps);
    const customerMap = await getRelatedCustomers(client, storeId, [session.customer]);

    return {
      ...session,
      relatedCustomer: customerMap.get(session.customer) || null,
    };
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

function idsOnly(values: string[]) {
  return Array.from(new Set(values.filter(isValidRecordId)));
}

async function getEntityNameMap(client: PocketBase, collection: string, storeId: string, ids: string[]) {
  const cleanIds = idsOnly(ids);
  const map = new Map<string, string>();
  const filter = idsFilter(client, storeId, cleanIds);
  if (!filter) return map;

  try {
    const result = await client.collection(collection).getList(1, Math.max(1, cleanIds.length), {
      filter,
      fields: 'id,name,title,slug,store',
      sort: 'name,title,slug',
    });

    result.items.forEach((record: any) => {
      const id = String(record?.id || '');
      const label = String(record?.name || record?.title || record?.slug || '').trim();
      if (id && label) map.set(id, label);
    });
  } catch (_) {
  }

  return map;
}

async function getPageviewEntityLabels(client: PocketBase, storeId: string, pageviews: SecurityVisitorPageview[]) {
  const productIds: string[] = [];
  const categoryIds: string[] = [];
  const subcategoryIds: string[] = [];

  pageviews.forEach((pageview) => {
    const pageType = normalizePageType(pageview.page_type);
    if (pageType === 'product') productIds.push(pageview.entity_id);
    if (pageType === 'category') categoryIds.push(pageview.entity_id);
    if (pageType === 'subcategory') subcategoryIds.push(pageview.entity_id);
  });

  const [products, categories, subcategories] = await Promise.all([
    getEntityNameMap(client, 'products', storeId, productIds),
    getEntityNameMap(client, 'categories', storeId, categoryIds),
    getEntityNameMap(client, 'subcategories', storeId, subcategoryIds),
  ]);

  return { products, categories, subcategories };
}

export async function getSecurityVisitorPageviewsPage(
  client: PocketBase,
  storeId: string,
  visitorSessionId: string,
  page: number,
  settings: Pick<StoreSecuritySettings, 'ip_visibility'>
): Promise<PaginatedResult<SecurityVisitorPageviewRow>> {
  if (!isValidRecordId(visitorSessionId)) {
    return { page: 1, perPage: VISITOR_PAGEVIEWS_PER_PAGE, totalItems: 0, totalPages: 1, items: [] };
  }

  const today = getCubaDay();
  const result = await client.collection('store_visitor_pageviews').getList(normalizePage(page), VISITOR_PAGEVIEWS_PER_PAGE, {
    filter: client.filter('store = {:store} && visitor_session = {:visitorSessionId} && day = {:day}', {
      store: storeId,
      visitorSessionId,
      day: today,
    }),
    fields: getVisitorPageviewFieldsForIpVisibility(settings.ip_visibility),
    sort: 'occurred_at,created',
  });

  const resolvedIps = await resolveFullIps(client, 'visitor_pageview', result.items, settings);
  const pageviews = applyIpPolicy(result.items.map(normalizeVisitorPageview), settings, resolvedIps);
  const labels = await getPageviewEntityLabels(client, storeId, pageviews);
  const rows = pageviews.map((pageview) => ({
    ...pageview,
    readableName: getPageviewReadableName(pageview, labels),
  }));

  return normalizeListResult(result, rows);
}

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  normal: 'Normal',
  watch: 'Observacion',
  blocked: 'Estado bloqueado',
  archived: 'Archivado',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  preparing: 'Preparando',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

export const DELIVERY_METHOD_LABELS: Record<string, string> = {
  delivery: 'Envio',
  pickup: 'Recogida',
  coordinate: 'Coordinar',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  order_created: 'Pedido registrado',
  order_rejected: 'Pedido rechazado',
  review_submitted: 'Resena recibida',
  raffle_entry: 'Participacion registrada',
  blocked_attempt: 'Intento bloqueado',
  admin_action: 'Accion administrativa',
};

export const EVENT_DECISION_LABELS: Record<string, string> = {
  allowed: 'Permitido',
  monitored: 'Monitoreado',
  blocked: 'Bloqueado',
};

export const EVENT_RISK_LABELS: Record<string, string> = {
  normal: 'Normal',
  suspicious: 'Observacion',
  blocked: 'Bloqueado',
};

export const CAPTURE_STATUS_LABELS: Record<string, string> = {
  complete: 'Completa',
  partial: 'Parcial',
  unavailable: 'No disponible',
};

export const MODE_AT_EVENT_LABELS: Record<string, string> = {
  monitoring: 'Monitoreo',
  protection: 'Proteccion',
};

export const PAGE_TYPE_LABELS: Record<string, string> = {
  store_home: 'Inicio de tienda',
  category: 'Categoria',
  subcategory: 'Subcategoria',
  product: 'Producto',
  gifts: 'Regalos',
  search: 'Buscar',
  checkout: 'Checkout',
  landing_qr: 'Landing QR',
  other: 'Otra pagina publica',
};

export function labelFromMap(labels: Record<string, string>, value: unknown, fallback = 'No disponible') {
  const key = String(value || '').trim();
  return labels[key] || fallback;
}

export function formatDateTime(value: unknown) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return 'No disponible';

  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatMoneyUsd(value: unknown) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
  }).format(normalizeNumber(value));
}

export function formatNumber(value: unknown) {
  return new Intl.NumberFormat('es-VE').format(normalizeNumber(value));
}

export function getOrderTotal(order: Pick<SecurityOrder, 'total' | 'usd_total'> | RelatedOrder | null | undefined) {
  return normalizeNumber(order?.usd_total || order?.total);
}

export function getDisplayCustomerName(customer: Pick<SecurityCustomer, 'display_name'> | RelatedCustomer | null | undefined) {
  return String(customer?.display_name || '').trim() || 'Cliente sin nombre';
}

export function normalizePageType(value: unknown) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return 'other';
  if (key === 'home' || key === 'store' || key === 'storefront') return 'store_home';
  if (key === 'landingqr' || key === 'qr_landing') return 'landing_qr';
  return PAGE_TYPE_LABELS[key] ? key : 'other';
}

export function getPageTypeLabel(value: unknown) {
  return labelFromMap(PAGE_TYPE_LABELS, normalizePageType(value), 'Otra pagina publica');
}

function getPageviewReadableName(
  pageview: Pick<SecurityVisitorPageview, 'page_type' | 'entity_id' | 'path'>,
  labels: {
    products: Map<string, string>;
    categories: Map<string, string>;
    subcategories: Map<string, string>;
  }
) {
  const pageType = normalizePageType(pageview.page_type);
  const entityId = String(pageview.entity_id || '');

  if (pageType === 'store_home') return 'Inicio de tienda';
  if (pageType === 'product') return labels.products.get(entityId) || 'Producto';
  if (pageType === 'category') return labels.categories.get(entityId) || 'Categoria';
  if (pageType === 'subcategory') return labels.subcategories.get(entityId) || 'Subcategoria';
  if (pageType === 'gifts') return 'Regalos';
  if (pageType === 'search') return 'Buscar';
  if (pageType === 'checkout') return 'Checkout';
  if (pageType === 'landing_qr') return 'Landing QR';
  return String(pageview.path || '').trim() || 'Otra pagina publica';
}

export function getVisitorDisplayName(visitor: Pick<SecurityVisitorSessionRow, 'relatedCustomer'> | null | undefined) {
  return visitor?.relatedCustomer ? getDisplayCustomerName(visitor.relatedCustomer) : 'Visitante sin identificar';
}

export function getVisitorPhone(visitor: Pick<SecurityVisitorSessionRow, 'relatedCustomer'> | null | undefined) {
  return String(visitor?.relatedCustomer?.phone_normalized || '').trim() || 'No disponible';
}

export function getIpDisplayValue(record: {
  ip_masked?: string;
  latest_ip_masked?: string;
  resolved_ip?: string;
  ip_resolution_status?: IpResolutionStatus;
}) {
  const status = String(record.ip_resolution_status || '');
  if (status === 'hidden') return '';
  const resolved = String(record.resolved_ip || '').trim();
  if (resolved) return resolved;
  const masked = String(record.ip_masked || record.latest_ip_masked || '').trim();
  return masked || 'No disponible';
}

export function getIpUnavailableNote(record: { ip_resolution_status?: IpResolutionStatus }) {
  return record.ip_resolution_status === 'full_unavailable'
    ? 'IP completa no disponible para este registro.'
    : '';
}

export function isSafeInternalPublicPath(value: unknown) {
  const path = String(value || '').trim();
  if (!path || !path.startsWith('/') || path.startsWith('//')) return false;
  if (path.includes('?') || path.includes('#') || /[\r\n]/.test(path)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  const lower = path.toLowerCase();
  if (
    lower.startsWith('/admin') ||
    lower.startsWith('/master') ||
    lower.startsWith('/api') ||
    lower.startsWith('/login') ||
    lower.startsWith('/master-login') ||
    lower.startsWith('/assets') ||
    lower.startsWith('/_astro') ||
    lower.includes('receipt_token') ||
    lower.includes('access_code') ||
    lower.includes('review_token') ||
    /^\/orden\/[^/]+\/[^/]+/.test(lower)
  ) {
    return false;
  }
  return path.length <= 240;
}
