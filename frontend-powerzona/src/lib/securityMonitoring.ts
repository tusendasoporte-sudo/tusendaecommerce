import type PocketBase from 'pocketbase';
import type { StoreSecuritySettings } from './security';

export const SECURITY_MONITORING_SECTIONS = ['summary', 'activity', 'customers', 'visitors', 'blocked', 'rules'] as const;
export const CUSTOMER_STATUS_FILTERS = ['all', 'normal', 'watch', 'blocked', 'archived'] as const;
export const EVENT_TYPE_FILTERS = ['all', 'order_created', 'order_rejected', 'review_submitted', 'raffle_entry', 'blocked_attempt', 'blocked_address_match', 'network_suspected', 'vpn_detected', 'vpn_blocked', 'vpn_check_unavailable', 'admin_action'] as const;
export const EVENT_RISK_FILTERS = ['all', 'normal', 'suspicious', 'blocked'] as const;
export const SECURITY_BLOCK_STATUS_FILTERS = ['all', 'active', 'expired', 'revoked'] as const;
export const SECURITY_BLOCK_SCOPE_FILTERS = ['all', 'orders', 'reviews', 'raffles', 'all_interactions', 'full_access'] as const;
export const SECURITY_BLOCK_SCOPES = ['orders', 'reviews', 'raffles', 'all_interactions', 'full_access'] as const;
export const SECURITY_BLOCK_DURATIONS = ['hours_24', 'days_7', 'days_30', 'permanent'] as const;
export const SECURITY_BLOCK_MATCH_MODES = ['any', 'all'] as const;
export const VISITOR_RANGE_FILTERS = ['today', 'days_7', 'days_30'] as const;

export const CUSTOMERS_PER_PAGE = 20;
export const ACTIVITY_PER_PAGE = 10;
export const CUSTOMER_ORDERS_PER_PAGE = 10;
export const CUSTOMER_EVENTS_PER_PAGE = 10;
export const VISITORS_PER_PAGE = 10;
export const VISITOR_PAGEVIEWS_PER_PAGE = 10;
export const VISITOR_CUSTOMER_ORDERS_PER_PAGE = 5;
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
export type EventRiskFilter = (typeof EVENT_RISK_FILTERS)[number];
export type SecurityBlockStatusFilter = (typeof SECURITY_BLOCK_STATUS_FILTERS)[number];
export type SecurityBlockScopeFilter = (typeof SECURITY_BLOCK_SCOPE_FILTERS)[number];
export type SecurityBlockScope = (typeof SECURITY_BLOCK_SCOPES)[number];
export type SecurityBlockDuration = (typeof SECURITY_BLOCK_DURATIONS)[number];
export type SecurityBlockMatchMode = (typeof SECURITY_BLOCK_MATCH_MODES)[number];
export type VisitorRangeFilter = (typeof VISITOR_RANGE_FILTERS)[number];

export type SecurityMonitoringParams = {
  section: SecurityMonitoringSection;
  customerId: string;
  customersPage: number;
  activityPage: number;
  visitorsPage: number;
  visitorRange: VisitorRangeFilter;
  blockedPage: number;
  customerOrdersPage: number;
  customerEventsPage: number;
  customerStatus: CustomerStatusFilter;
  customerSearch: string;
  blockedStatus: SecurityBlockStatusFilter;
  blockedScope: SecurityBlockScopeFilter;
  blockedSearch: string;
  blockedFocusId: string;
  mergeSearch: string;
  eventType: EventTypeFilter;
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

export type RelatedCustomer = Pick<SecurityCustomer, 'id' | 'store' | 'display_name' | 'phone_normalized' | 'status' | 'orders_count'>;
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
  navigation: {
    kind: 'block' | 'visitor' | 'none';
    targetId: string;
  };
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

export type SecurityBlockDeviceCandidate = {
  id: string;
  label: string;
  first_seen_at: string;
  last_seen_at: string;
  attempts_count: number;
};

export type SecurityBlockDeviceReview = {
  pending_count: number;
  confirmed_count: number;
  dismissed_count: number;
  pending: SecurityBlockDeviceCandidate[];
};

export type SecurityBlockRelatedIp = {
  ip_display: string;
  ip_resolution_status: IpResolutionStatus;
  state: 'blocked' | 'observed' | 'expired' | 'revoked';
  link_source: 'selected_ip' | 'device' | 'customer' | 'event';
  included_in_block: boolean;
  first_seen_at: string;
  last_seen_at: string;
  blocked_attempts: number;
  sightings_count: number;
  vpn_status: 'none' | 'detected' | 'blocked';
  visitor_session_id: string;
};

export type SecurityBlockHistoryEntry = {
  id: string;
  kind: 'administrative' | 'security_event';
  action: string;
  occurred_at: string;
  actor_name: string;
  reason: string;
  decision: string;
  risk_level: string;
  ip_display: string;
  ip_resolution_status: IpResolutionStatus;
  navigation: {
    kind: 'block' | 'visitor' | 'none';
    targetId: string;
  };
};

export type SecurityBlockDetail = {
  related_ips: SecurityBlockRelatedIp[];
  related_ip_count: number;
  related_device_count: number;
  related_address_count: number;
  history: SecurityBlockHistoryEntry[];
  history_count: number;
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
  revoked_by_name: string;
  reason: string;
  revoke_reason: string;
  manual_ip: boolean;
  manual_ip_display: string;
  manual_ip_resolution_status: IpResolutionStatus;
  review_device_candidates: boolean;
  device_review: SecurityBlockDeviceReview;
  detail: SecurityBlockDetail | null;
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

export type SecurityAddressCandidate = {
  order_id: string;
  address_display: string;
  municipality_display: string;
  last_used_at: string;
  uses_count: number;
  preselected: boolean;
};

export type SecurityBlocksMetrics = {
  active_blocks: number;
  affected_customers: number;
  manual_ip_blocks: number;
  expires_today: number;
  permanent_blocks: number;
};

export type ManualIpDeviceCandidate = {
  session_id: string;
  label: string;
  last_seen_at: string;
  preselected: boolean;
};

export type ManualIpCandidate = {
  source_id: string;
  ip_display: string;
  ip_resolution_status: IpResolutionStatus;
  last_seen_at: string;
  preselected: boolean;
};

export type ManualIpDeviceLookupResult = {
  ip_display: string;
  ip_resolution_status: IpResolutionStatus;
  ip_candidates: ManualIpCandidate[];
  candidates: ManualIpDeviceCandidate[];
};

export type ManualIpBlockDraft = {
  ip: string;
  visitorSessionId: string;
  scope: SecurityBlockScope;
  duration: SecurityBlockDuration;
  reason: string;
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
  addressCandidates: SecurityAddressCandidate[];
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

export type SecurityVisitorVpnInfo = {
  status: 'none' | 'suspected' | 'detected' | 'blocked' | 'unavailable';
  event_type: string;
  decision: string;
  risk_level: string;
  observed_at: string;
};

export type SecurityVisitorStatus = 'normal' | 'watch' | 'blocked';

export type SecurityVisitorIpNetworkStatus = 'normal' | 'suspected' | 'detected' | 'blocked' | 'unavailable';

export type SecurityVisitorNetworkSummary = {
  ip_count: number;
  vpn_ip_count: number;
  suspected_ip_count: number;
  unavailable_ip_count: number;
  current_ip_status: SecurityVisitorIpNetworkStatus;
  current_ip_observed_at: string;
};

export type SecurityVisitorNetworkHistoryRow = {
  ip_masked: string;
  resolved_ip: string;
  ip_resolution_status: IpResolutionStatus;
  networkStatus: SecurityVisitorIpNetworkStatus;
  networkObservedAt: string;
  first_seen_at: string;
  last_seen_at: string;
  sightings_count: number;
};

export type SecurityVisitorSessionRow = SecurityVisitorSession & {
  relatedCustomer: RelatedCustomer | null;
  vpn: SecurityVisitorVpnInfo;
  security_status: SecurityVisitorStatus;
  network_summary: SecurityVisitorNetworkSummary;
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
  canOpen: boolean;
  openPath: string;
  networkStatus: SecurityVisitorIpNetworkStatus;
  networkObservedAt: string;
};

export type SecurityVisitorDetailResult = {
  visitor: SecurityVisitorSessionRow | null;
  orders: PaginatedResult<SecurityOrder>;
  ordersError: boolean;
  networkHistory: PaginatedResult<SecurityVisitorNetworkHistoryRow>;
  pageviews: PaginatedResult<SecurityVisitorPageviewRow>;
};

export type SecuritySettingsView = Pick<
  StoreSecuritySettings,
  | 'id'
  | 'mode'
  | 'retention_days'
  | 'ip_visibility'
  | 'manual_blocking_enabled'
  | 'full_access_blocking_enabled'
  | 'permanent_blocks_enabled'
  | 'notify_blocked_attempts'
  | 'vpn_policy'
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

export function normalizeEventRiskFilter(value: unknown): EventRiskFilter {
  return hasAllowedValue(EVENT_RISK_FILTERS, value, 'all');
}

export function normalizeBlockStatusFilter(value: unknown): SecurityBlockStatusFilter {
  return hasAllowedValue(SECURITY_BLOCK_STATUS_FILTERS, value, 'active');
}

export function normalizeBlockScopeFilter(value: unknown): SecurityBlockScopeFilter {
  return hasAllowedValue(SECURITY_BLOCK_SCOPE_FILTERS, value, 'all');
}

export function normalizeVisitorRangeFilter(value: unknown): VisitorRangeFilter {
  return hasAllowedValue(VISITOR_RANGE_FILTERS, value, 'today');
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
  const blockedFocusId = String(getFormValue(formData, 'block') || url.searchParams.get('block') || '').trim();

  return {
    section,
    customerId: isValidRecordId(customerId) ? customerId : '',
    customersPage: normalizePage(getFormValue(formData, 'customers_page') || url.searchParams.get('customers_page')),
    activityPage: normalizePage(url.searchParams.get('activity_page')),
    visitorsPage: normalizePage(url.searchParams.get('visitors_page')),
    visitorRange: normalizeVisitorRangeFilter(url.searchParams.get('visitor_range')),
    blockedPage: normalizePage(getFormValue(formData, 'blocked_page') || url.searchParams.get('blocked_page')),
    customerOrdersPage: normalizePage(url.searchParams.get('orders_page')),
    customerEventsPage: normalizePage(url.searchParams.get('events_page')),
    customerStatus: normalizeCustomerStatusFilter(getFormValue(formData, 'customer_status') || url.searchParams.get('customer_status')),
    customerSearch: normalizeSearchTerm(getFormValue(formData, 'customer_search')),
    blockedStatus: blockedFocusId ? 'all' : normalizeBlockStatusFilter(getFormValue(formData, 'blocked_status') || url.searchParams.get('blocked_status')),
    blockedScope: normalizeBlockScopeFilter(getFormValue(formData, 'blocked_scope') || url.searchParams.get('blocked_scope')),
    blockedSearch: normalizeSearchTerm(getFormValue(formData, 'blocked_search')),
    blockedFocusId: isValidRecordId(blockedFocusId) ? blockedFocusId : '',
    mergeSearch: normalizeSearchTerm(getFormValue(formData, 'merge_search') || url.searchParams.get('merge_search')),
    eventType: normalizeEventTypeFilter(url.searchParams.get('event_type')),
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
    changed: response.changed === true,
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
    addressOrderIds: string[];
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
      address_order_ids: Array.from(new Set(options.addressOrderIds || [])).filter(isValidRecordId).slice(0, 50),
      reason: normalizeSearchTerm(options.reason).slice(0, 500),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'block_create_failed'));
  return normalizeSecurityBlock(response.block);
}

export async function runSecurityManualIpBlockCreate(
  client: PocketBase,
  storeId: string,
  options: {
    ip: string;
    scope: SecurityBlockScope;
    duration: SecurityBlockDuration;
    visitorSessionId?: string;
    ipSourceIds: string[];
    deviceSessionIds: string[];
    reason: string;
  }
) {
  const response = await (client as any).send('/api/pz/security/block-action', {
    method: 'POST',
    body: {
      store_id: storeId,
      action: 'create_manual_ip',
      scope: options.scope,
      duration: options.duration,
      ip: String(options.ip || '').trim().slice(0, 64),
      visitor_session_id: String(options.visitorSessionId || '').trim(),
      ip_source_ids: Array.from(new Set(options.ipSourceIds || [])).filter(isValidRecordId).slice(0, 50),
      device_session_ids: Array.from(new Set(options.deviceSessionIds || [])).slice(0, 50),
      reason: normalizeSearchTerm(options.reason).slice(0, 500),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'manual_ip_block_create_failed'));
  return normalizeSecurityBlock(response.block);
}

export async function getSecurityManualIpDeviceCandidates(
  client: PocketBase,
  storeId: string,
  options: { ip?: string; visitorSessionId?: string }
): Promise<ManualIpDeviceLookupResult> {
  const response = await (client as any).send('/api/pz/security/manual-ip-devices', {
    method: 'POST',
    body: {
      store_id: storeId,
      ip: String(options.ip || '').trim().slice(0, 64),
      visitor_session_id: String(options.visitorSessionId || '').trim(),
    },
  });
  if (!response?.ok) throw new Error(String(response?.error || 'manual_ip_device_lookup_failed'));
  const status = String(response.ip_resolution_status || 'hidden') as IpResolutionStatus;
  return {
    ip_display: String(response.ip_display || ''),
    ip_resolution_status: ['hidden', 'masked', 'full', 'full_unavailable', 'unavailable'].includes(status)
      ? status
      : 'hidden',
    ip_candidates: Array.isArray(response.ip_candidates)
      ? response.ip_candidates
        .filter((candidate: any) => isValidRecordId(candidate?.source_id))
        .slice(0, 50)
        .map((candidate: any) => {
          const candidateStatus = String(candidate.ip_resolution_status || 'hidden') as IpResolutionStatus;
          return {
            source_id: String(candidate.source_id),
            ip_display: String(candidate.ip_display || ''),
            ip_resolution_status: ['hidden', 'masked', 'full', 'full_unavailable', 'unavailable'].includes(candidateStatus)
              ? candidateStatus
              : 'hidden',
            last_seen_at: String(candidate.last_seen_at || ''),
            preselected: candidate.preselected === true,
          };
        })
      : [],
    candidates: Array.isArray(response.candidates)
      ? response.candidates
        .filter((candidate: any) => isValidRecordId(candidate?.session_id))
        .slice(0, 50)
        .map((candidate: any) => ({
          session_id: String(candidate.session_id),
          label: String(candidate.label || 'Dispositivo observado'),
          last_seen_at: String(candidate.last_seen_at || ''),
          preselected: candidate.preselected === true,
        }))
      : [],
  };
}

export async function updateSecurityVpnPolicy(
  client: PocketBase,
  storeId: string,
  vpnPolicy: 'off' | 'monitor' | 'block'
) {
  const response = await (client as any).send('/api/pz/security/vpn-policy', {
    method: 'POST',
    body: { store_id: storeId, vpn_policy: vpnPolicy },
  });
  if (!response?.ok) throw new Error(String(response?.error || 'vpn_policy_update_failed'));
  return { policy: String(response.vpn_policy || 'off'), changed: response.changed === true };
}

export async function runSecurityBlockDeviceCandidateAction(
  client: PocketBase,
  storeId: string,
  blockId: string,
  candidateId: string,
  action: 'confirm' | 'dismiss',
  reason: string
) {
  const response = await (client as any).send('/api/pz/security/block-action', {
    method: 'POST',
    body: {
      store_id: storeId,
      action: action === 'confirm' ? 'confirm_device_candidate' : 'dismiss_device_candidate',
      block_id: blockId,
      candidate_id: candidateId,
      reason: normalizeSearchTerm(reason).slice(0, 500),
    },
  });

  if (!response?.ok) throw new Error(String(response?.error || 'device_candidate_review_failed'));
  return {
    block: normalizeSecurityBlock(response.block),
    candidateStatus: String(response.candidate_status || ''),
  };
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
  search: string,
  focusId = ''
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
      focus_id: isValidRecordId(focusId) ? focusId : '',
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

function normalizeEndpointIp(record: any) {
  const status = String(record?.ip_resolution_status || 'unavailable') as IpResolutionStatus;
  const ipDisplay = String(record?.ip_display || '').trim();
  return {
    ip_masked: status === 'full' ? '' : ipDisplay,
    resolved_ip: status === 'full' ? ipDisplay : '',
    ip_resolution_status: status,
  };
}

function normalizeEndpointCustomer(record: any): RelatedCustomer | null {
  if (!record || !isValidRecordId(record.id)) return null;
  return {
    id: String(record.id),
    store: '',
    display_name: String(record.display_name || ''),
    phone_normalized: String(record.primary_phone || ''),
    status: String(record.status || 'normal'),
    orders_count: normalizeNumber(record.orders_count),
  };
}

function normalizeEndpointOrder(record: any): RelatedOrder | null {
  if (!record || !isValidRecordId(record.id)) return null;
  return {
    id: String(record.id),
    store: '',
    order_number: String(record.order_number || ''),
    status: '',
    total: 0,
    usd_total: 0,
    delivery_method: '',
    created: '',
  };
}

function normalizeActivityEndpointEvent(record: any): SecurityEventRow {
  const relatedCustomer = normalizeEndpointCustomer(record?.customer);
  const relatedOrder = normalizeEndpointOrder(record?.order);
  const ip = normalizeEndpointIp(record);
  const rawNavigationKind = String(record?.navigation?.kind || 'none');
  const navigationKind = ['block', 'visitor'].includes(rawNavigationKind) ? rawNavigationKind as 'block' | 'visitor' : 'none';
  const navigationTargetId = String(record?.navigation?.target_id || '');
  return {
    id: String(record?.id || ''),
    store: '',
    customer: relatedCustomer?.id || '',
    order: relatedOrder?.id || '',
    event_type: String(record?.event_type || ''),
    source_type: String(record?.source_type || ''),
    risk_level: String(record?.risk_level || ''),
    decision: String(record?.decision || ''),
    mode_at_event: String(record?.mode_at_event || ''),
    ip_masked: ip.ip_masked,
    ip_family: '',
    capture_status: String(record?.capture_status || ''),
    occurred_at: String(record?.occurred_at || ''),
    created: String(record?.created || ''),
    resolved_ip: ip.resolved_ip,
    ip_resolution_status: ip.ip_resolution_status,
    relatedCustomer,
    relatedOrder,
    navigation: {
      kind: isValidRecordId(navigationTargetId) ? navigationKind : 'none',
      targetId: isValidRecordId(navigationTargetId) ? navigationTargetId : '',
    },
  };
}

export async function getSecurityActivityPage(
  client: PocketBase,
  storeId: string,
  page: number,
  eventType: EventTypeFilter,
  risk: EventRiskFilter
): Promise<PaginatedResult<SecurityEventRow>> {
  const safePage = normalizePage(page);
  const response = await (client as any).send('/api/pz/security/activity-page', {
    method: 'POST',
    body: {
      store_id: storeId,
      page: safePage,
      event_type: eventType,
      risk_level: risk,
    },
  });
  if (!response?.ok) throw new Error(String(response?.error || 'activity_page_failed'));
  const items = Array.isArray(response.items) ? response.items.map(normalizeActivityEndpointEvent) : [];
  return normalizeEndpointPage(response, items, safePage, ACTIVITY_PER_PAGE);
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
    navigation: { kind: 'none', targetId: '' },
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

function normalizeBlockDeviceReview(record: any): SecurityBlockDeviceReview {
  const pending = Array.isArray(record?.pending)
    ? record.pending
      .filter((candidate: any) => isValidRecordId(candidate?.id))
      .map((candidate: any) => ({
        id: String(candidate.id),
        label: String(candidate.label || 'Dispositivo pendiente'),
        first_seen_at: String(candidate.first_seen_at || ''),
        last_seen_at: String(candidate.last_seen_at || ''),
        attempts_count: normalizeNumber(candidate.attempts_count),
      }))
    : [];
  return {
    pending_count: normalizeNumber(record?.pending_count),
    confirmed_count: normalizeNumber(record?.confirmed_count),
    dismissed_count: normalizeNumber(record?.dismissed_count),
    pending,
  };
}

function normalizeIpResolutionStatus(value: unknown): IpResolutionStatus {
  const status = String(value || 'unavailable') as IpResolutionStatus;
  return ['hidden', 'masked', 'full', 'full_unavailable', 'unavailable'].includes(status)
    ? status
    : 'unavailable';
}

function normalizeBlockRelatedIp(record: any): SecurityBlockRelatedIp {
  const state = String(record?.state || 'revoked');
  const source = String(record?.link_source || 'event');
  const vpnStatus = String(record?.vpn_status || 'none');
  const visitorSessionId = String(record?.visitor_session_id || '');
  return {
    ip_display: String(record?.ip_display || ''),
    ip_resolution_status: normalizeIpResolutionStatus(record?.ip_resolution_status),
    state: ['blocked', 'observed', 'expired', 'revoked'].includes(state) ? state as SecurityBlockRelatedIp['state'] : 'observed',
    link_source: ['selected_ip', 'device', 'customer', 'event'].includes(source)
      ? source as SecurityBlockRelatedIp['link_source']
      : 'event',
    included_in_block: record?.included_in_block === true,
    first_seen_at: String(record?.first_seen_at || ''),
    last_seen_at: String(record?.last_seen_at || ''),
    blocked_attempts: Math.max(0, normalizeNumber(record?.blocked_attempts)),
    sightings_count: Math.max(0, normalizeNumber(record?.sightings_count)),
    vpn_status: ['none', 'detected', 'blocked'].includes(vpnStatus)
      ? vpnStatus as SecurityBlockRelatedIp['vpn_status']
      : 'none',
    visitor_session_id: isValidRecordId(visitorSessionId) ? visitorSessionId : '',
  };
}

function normalizeBlockHistoryEntry(record: any): SecurityBlockHistoryEntry | null {
  const id = String(record?.id || '');
  const kind = String(record?.kind || '');
  if (!isValidRecordId(id) || !['administrative', 'security_event'].includes(kind)) return null;
  const navigationKind = String(record?.navigation?.kind || 'none');
  const navigationTargetId = String(record?.navigation?.target_id || '');
  return {
    id,
    kind: kind as SecurityBlockHistoryEntry['kind'],
    action: String(record?.action || '').slice(0, 80),
    occurred_at: String(record?.occurred_at || ''),
    actor_name: String(record?.actor_name || 'Sistema').slice(0, 160),
    reason: String(record?.reason || '').slice(0, 500),
    decision: String(record?.decision || '').slice(0, 40),
    risk_level: String(record?.risk_level || '').slice(0, 40),
    ip_display: String(record?.ip_display || ''),
    ip_resolution_status: normalizeIpResolutionStatus(record?.ip_resolution_status),
    navigation: {
      kind: ['block', 'visitor'].includes(navigationKind) && isValidRecordId(navigationTargetId)
        ? navigationKind as 'block' | 'visitor'
        : 'none',
      targetId: isValidRecordId(navigationTargetId) ? navigationTargetId : '',
    },
  };
}

function normalizeSecurityBlockDetail(record: any): SecurityBlockDetail | null {
  if (!record || typeof record !== 'object') return null;
  const relatedIps = Array.isArray(record.related_ips)
    ? record.related_ips.slice(0, 50).map(normalizeBlockRelatedIp)
    : [];
  const history = Array.isArray(record.history)
    ? record.history.slice(0, 100).map(normalizeBlockHistoryEntry).filter(Boolean) as SecurityBlockHistoryEntry[]
    : [];
  return {
    related_ips: relatedIps,
    related_ip_count: Math.max(relatedIps.length, normalizeNumber(record.related_ip_count)),
    related_device_count: Math.max(0, normalizeNumber(record.related_device_count)),
    related_address_count: Math.max(0, normalizeNumber(record.related_address_count)),
    history,
    history_count: Math.max(history.length, normalizeNumber(record.history_count)),
  };
}

function normalizeSecurityBlock(record: any): SecurityBlock {
  const scope = String(record?.scope || 'orders');
  const status = String(record?.status || 'active');
  const duration = String(record?.duration || 'days_7');
  const ipResolutionStatus = String(record?.manual_ip_resolution_status || 'hidden') as IpResolutionStatus;
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
    revoked_by_name: String(record?.revoked_by_name || ''),
    reason: String(record?.reason || '').slice(0, 500),
    revoke_reason: String(record?.revoke_reason || '').slice(0, 500),
    manual_ip: record?.manual_ip === true,
    manual_ip_display: String(record?.manual_ip_display || ''),
    manual_ip_resolution_status: ['hidden', 'masked', 'full', 'full_unavailable', 'unavailable'].includes(ipResolutionStatus)
      ? ipResolutionStatus
      : 'hidden',
    review_device_candidates: record?.review_device_candidates === true,
    device_review: normalizeBlockDeviceReview(record?.device_review),
    detail: normalizeSecurityBlockDetail(record?.detail),
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

function normalizeAddressCandidate(record: any): SecurityAddressCandidate | null {
  const orderId = String(record?.order_id || '').trim();
  const addressDisplay = String(record?.address_display || '').trim();
  const municipalityDisplay = String(record?.municipality_display || '').trim();
  if (!isValidRecordId(orderId) || !addressDisplay || !municipalityDisplay) return null;
  return {
    order_id: orderId,
    address_display: addressDisplay.slice(0, 300),
    municipality_display: municipalityDisplay.slice(0, 160),
    last_used_at: String(record?.last_used_at || ''),
    uses_count: Math.max(1, normalizeNumber(record?.uses_count)),
    preselected: record?.preselected === true,
  };
}

function normalizeBlocksMetrics(record: any): SecurityBlocksMetrics {
  return {
    active_blocks: normalizeNumber(record?.active_blocks),
    affected_customers: normalizeNumber(record?.affected_customers),
    manual_ip_blocks: normalizeNumber(record?.manual_ip_blocks),
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
    addressCandidates: [],
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
    addressCandidates: Array.isArray(response?.address_candidates)
      ? response.address_candidates.map(normalizeAddressCandidate).filter(Boolean) as SecurityAddressCandidate[]
      : [],
    identityWarnings: Array.isArray(response?.identity_warnings)
      ? response.identity_warnings.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [],
    ordersError: Boolean(response.orders_error),
    eventsError: Boolean(response.events_error),
  };
}

export async function getSecurityVisitorsPage(
  client: PocketBase,
  storeId: string,
  page: number,
  range: VisitorRangeFilter = 'today'
): Promise<PaginatedResult<SecurityVisitorSessionRow>> {
  const safePage = normalizePage(page);
  const safeRange = normalizeVisitorRangeFilter(range);
  const response = await (client as any).send('/api/pz/security/visitors-page', {
    method: 'POST',
    body: {
      store_id: storeId,
      page: safePage,
      range: safeRange,
    },
  });
  if (!response?.ok) throw new Error(String(response?.error || 'visitors_page_failed'));
  const items = Array.isArray(response.items) ? response.items.map(normalizeVisitorEndpointSession) : [];
  return normalizeEndpointPage(response, items, safePage, VISITORS_PER_PAGE);
}

export async function getSecurityVisitorsTodayPage(
  client: PocketBase,
  storeId: string,
  page: number
) {
  return getSecurityVisitorsPage(client, storeId, page, 'today');
}

function normalizeVisitorVpnInfo(record: any): SecurityVisitorVpnInfo {
  const rawStatus = String(record?.status || 'none');
  const status = ['none', 'suspected', 'detected', 'blocked', 'unavailable'].includes(rawStatus)
    ? rawStatus as SecurityVisitorVpnInfo['status']
    : 'none';
  return {
    status,
    event_type: String(record?.event_type || ''),
    decision: String(record?.decision || ''),
    risk_level: String(record?.risk_level || ''),
    observed_at: String(record?.observed_at || ''),
  };
}

function normalizeVisitorIpNetworkStatus(value: unknown): SecurityVisitorIpNetworkStatus {
  const status = String(value || 'normal');
  return ['normal', 'suspected', 'detected', 'blocked', 'unavailable'].includes(status)
    ? status as SecurityVisitorIpNetworkStatus
    : 'normal';
}

function normalizeVisitorNetworkSummary(record: any): SecurityVisitorNetworkSummary {
  return {
    ip_count: normalizeNumber(record?.ip_count),
    vpn_ip_count: normalizeNumber(record?.vpn_ip_count),
    suspected_ip_count: normalizeNumber(record?.suspected_ip_count),
    unavailable_ip_count: normalizeNumber(record?.unavailable_ip_count),
    current_ip_status: normalizeVisitorIpNetworkStatus(record?.current_ip_status),
    current_ip_observed_at: String(record?.current_ip_observed_at || ''),
  };
}

function normalizeVisitorEndpointSession(record: any): SecurityVisitorSessionRow {
  const relatedCustomer = normalizeEndpointCustomer(record?.customer);
  const ip = normalizeEndpointIp(record);
  const rawSecurityStatus = String(record?.security_status || 'normal');
  const securityStatus = ['normal', 'watch', 'blocked'].includes(rawSecurityStatus)
    ? rawSecurityStatus as SecurityVisitorStatus
    : 'normal';
  return {
    id: String(record?.id || ''),
    store: '',
    day: String(record?.day || ''),
    customer: relatedCustomer?.id || '',
    first_seen_at: String(record?.first_seen_at || ''),
    last_seen_at: String(record?.last_seen_at || ''),
    pageviews_count: normalizeNumber(record?.pageviews_count),
    entry_path: String(record?.entry_path || ''),
    last_path: String(record?.last_path || ''),
    latest_ip_masked: ip.ip_masked,
    latest_ip_family: '',
    latest_capture_status: '',
    created: '',
    updated: '',
    resolved_ip: ip.resolved_ip,
    ip_resolution_status: ip.ip_resolution_status,
    relatedCustomer,
    vpn: normalizeVisitorVpnInfo(record?.vpn),
    security_status: securityStatus,
    network_summary: normalizeVisitorNetworkSummary(record?.network_summary),
  };
}

function normalizeVisitorEndpointPageview(record: any): SecurityVisitorPageviewRow {
  const ip = normalizeEndpointIp(record);
  return {
    id: String(record?.id || ''),
    store: '',
    visitor_session: '',
    customer: '',
    day: '',
    page_type: String(record?.page_type || ''),
    entity_type: String(record?.entity_type || ''),
    entity_id: String(record?.entity_id || ''),
    path: String(record?.path || ''),
    ip_masked: ip.ip_masked,
    ip_family: '',
    capture_status: '',
    occurred_at: String(record?.occurred_at || ''),
    created: '',
    resolved_ip: ip.resolved_ip,
    ip_resolution_status: ip.ip_resolution_status,
    readableName: String(record?.resolved_label || 'Otra pagina publica'),
    canOpen: record?.can_open === true,
    openPath: String(record?.open_path || ''),
    networkStatus: normalizeVisitorIpNetworkStatus(record?.network_status),
    networkObservedAt: String(record?.network_observed_at || ''),
  };
}

function normalizeVisitorNetworkHistoryRow(record: any): SecurityVisitorNetworkHistoryRow {
  const ip = normalizeEndpointIp(record);
  return {
    ip_masked: ip.ip_masked,
    resolved_ip: ip.resolved_ip,
    ip_resolution_status: ip.ip_resolution_status,
    networkStatus: normalizeVisitorIpNetworkStatus(record?.network_status),
    networkObservedAt: String(record?.network_observed_at || ''),
    first_seen_at: String(record?.first_seen_at || ''),
    last_seen_at: String(record?.last_seen_at || ''),
    sightings_count: Math.max(0, normalizeNumber(record?.sightings_count)),
  };
}

function emptyVisitorDetail(page: number, ordersPage: number): SecurityVisitorDetailResult {
  return {
    visitor: null,
    orders: {
      page: normalizePage(ordersPage),
      perPage: VISITOR_CUSTOMER_ORDERS_PER_PAGE,
      totalItems: 0,
      totalPages: 1,
      items: [],
    },
    ordersError: false,
    networkHistory: {
      page: 1,
      perPage: VISITORS_PER_PAGE,
      totalItems: 0,
      totalPages: 1,
      items: [],
    },
    pageviews: {
      page: normalizePage(page),
      perPage: VISITOR_PAGEVIEWS_PER_PAGE,
      totalItems: 0,
      totalPages: 1,
      items: [],
    },
  };
}

export async function getSecurityVisitorDetail(
  client: PocketBase,
  storeId: string,
  visitorSessionId: string,
  page: number,
  ordersPage = 1,
  range: VisitorRangeFilter = 'today',
  fullHistory = false,
  networkPage = 1
): Promise<SecurityVisitorDetailResult> {
  const safePage = normalizePage(page);
  const safeOrdersPage = normalizePage(ordersPage);
  const safeNetworkPage = normalizePage(networkPage);
  const safeRange = normalizeVisitorRangeFilter(range);
  if (!isValidRecordId(visitorSessionId)) return emptyVisitorDetail(safePage, safeOrdersPage);

  try {
    const response = await (client as any).send('/api/pz/security/visitor-detail', {
      method: 'POST',
      body: {
        store_id: storeId,
        visitor_session_id: visitorSessionId,
        page: safePage,
        orders_page: safeOrdersPage,
        range: safeRange,
        full_history: fullHistory === true,
        network_page: safeNetworkPage,
      },
    });
    if (!response?.ok) throw new Error(String(response?.error || 'visitor_detail_failed'));
    const pageviewItems = Array.isArray(response?.pageviews?.items)
      ? response.pageviews.items.map(normalizeVisitorEndpointPageview)
      : [];
    const orderItems = Array.isArray(response?.orders?.items)
      ? response.orders.items.map(normalizeCustomerDetailOrder)
      : [];
    const networkHistoryItems = Array.isArray(response?.network_history?.items)
      ? response.network_history.items.map(normalizeVisitorNetworkHistoryRow)
      : [];
    return {
      visitor: response.visitor ? normalizeVisitorEndpointSession(response.visitor) : null,
      orders: normalizeEndpointPage(response.orders, orderItems, safeOrdersPage, VISITOR_CUSTOMER_ORDERS_PER_PAGE),
      ordersError: response?.orders_error === true,
      networkHistory: normalizeEndpointPage(response.network_history, networkHistoryItems, safeNetworkPage, VISITORS_PER_PAGE),
      pageviews: normalizeEndpointPage(response.pageviews, pageviewItems, safePage, VISITOR_PAGEVIEWS_PER_PAGE),
    };
  } catch (error: any) {
    if (error?.status === 404) return emptyVisitorDetail(safePage, safeOrdersPage);
    throw error;
  }
}

export async function getSecurityVisitorSessionById(
  client: PocketBase,
  storeId: string,
  visitorSessionId: string
) {
  const detail = await getSecurityVisitorDetail(client, storeId, visitorSessionId, 1);
  return detail.visitor;
}

export async function getSecurityVisitorPageviewsPage(
  client: PocketBase,
  storeId: string,
  visitorSessionId: string,
  page: number
): Promise<PaginatedResult<SecurityVisitorPageviewRow>> {
  const detail = await getSecurityVisitorDetail(client, storeId, visitorSessionId, page);
  return detail.pageviews;
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
  blocked_address_match: 'Dirección vinculada a bloqueo',
  network_suspected: 'Red sospechosa sin confirmar VPN',
  vpn_detected: 'VPN o proxy detectado',
  vpn_blocked: 'VPN o proxy bloqueado',
  vpn_check_unavailable: 'Verificacion VPN no disponible',
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
