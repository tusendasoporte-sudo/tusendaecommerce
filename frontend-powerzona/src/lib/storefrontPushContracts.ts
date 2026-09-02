export const STOREFRONT_MAX_BODY_BYTES = Object.freeze({
  register: 4096,
  register_core: 4096,
  firebase_enrichment: 1024,
  diagnostics: 16_384,
  notifications_sync: 256,
  notifications_ack: 8192,
  realtime_ticket: 256,
  heartbeat: 3072,
  permission: 512,
  disable: 256,
  session_bootstrap: 256,
  resolve_target: 512,
  event: 1024,
  update_policy: 512,
  update_ticket: 256,
  update_verified: 384,
});

export const STOREFRONT_INSTALLATION_CREDENTIAL_PATTERN = /^pzs_v1_[a-f0-9]{64}$/;
export const STOREFRONT_BOOTSTRAP_CODE_PATTERN = /^pzb_v1_[A-Za-z0-9]{48}$/;
export const STOREFRONT_SESSION_TOKEN_PATTERN = /^pzws_v1_[A-Za-z0-9]{64}$/;

const FID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const INSTALLATION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;
const APP_SET_ID_PATTERN = /^[0-9A-Za-z+.=/_$,{}-]{22,150}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+()-]{0,39}$/;
const ANDROID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._+()-]{0,39}$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,3}$/;
const TIMEZONE_PATTERN = /^(?:UTC|GMT|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,3})$/;
const PERMISSION_STATES = Object.freeze(['unknown', 'granted', 'denied'] as const);
const DIAGNOSTIC_EVENT_TYPES = Object.freeze([
  'APP_STARTED',
  'INTERNET_AVAILABLE',
  'BACKEND_REACHABLE',
  'INSTALLATION_UUID_CREATED',
  'FIREBASE_INITIALIZED',
  'FID_CREATED',
  'FCM_TOKEN_CREATED',
  'INSTALLATION_REGISTER_REQUEST_SENT',
  'INSTALLATION_REGISTER_RESPONSE',
  'NOTIFICATION_PERMISSION_STATUS',
  'LAST_PUSH_RECEIVED',
  'LAST_ERROR',
] as const);
const DIAGNOSTIC_RESULTS = Object.freeze(['started', 'success', 'failure', 'skipped'] as const);
const DIAGNOSTIC_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const SAFE_ERROR_PATTERN = /^[a-z0-9_:-]{1,80}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const APK_FILE_PATTERN = /^[A-Za-z0-9._-]+\.apk$/;
const ORDER_TARGET_PATH_PATTERN = /^\/orden\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{6,80}$/;
const STOREFRONT_PATH_PATTERN = /^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;
const NOTIFICATION_RECEIPT_STATES = Object.freeze([
  'fcm_received', 'native_delivered', 'read',
] as const);

export type NotificationPermission = typeof PERMISSION_STATES[number];

export type StorefrontRegisterPayload = Readonly<{
  fid: string;
  app_set_id?: string;
  app_version: string;
  app_version_code: number;
  android_version: string;
  device_model: string;
  locale: string;
  timezone: string;
  notification_permission: NotificationPermission;
}>;

export type StorefrontCoreRegisterPayload = Readonly<{
  installation_id: string;
  app_key: string;
  app_version: string;
  app_version_code: number;
  android_version: string;
  device_model: string;
  locale: string;
  timezone: string;
  notification_permission: NotificationPermission;
}>;

export type StorefrontFirebaseEnrichmentPayload = Readonly<{
  fid: string;
  app_set_id?: string;
}>;

export type StorefrontHeartbeatPayload = Readonly<{
  app_version: string;
  app_version_code: number;
  android_version: string;
  device_model: string;
  locale: string;
  timezone: string;
}>;

export type StorefrontDiagnosticEvent = Readonly<{
  idempotency_key: string;
  event_type: typeof DIAGNOSTIC_EVENT_TYPES[number];
  result: typeof DIAGNOSTIC_RESULTS[number];
  error_code: string;
  http_status: number;
  latency_ms: number;
  occurred_at: string;
}>;

type ParsedJson = Readonly<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: 'invalid_payload' | 'payload_too_large' }
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: unknown, keys: readonly string[]) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function boundedText(value: unknown, max: number, pattern?: RegExp) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > max) return '';
  if (/\p{Cc}/u.test(value)) return '';
  return !pattern || pattern.test(value) ? value : '';
}

function permissionState(value: unknown): NotificationPermission | '' {
  return typeof value === 'string' && PERMISSION_STATES.includes(value as NotificationPermission)
    ? value as NotificationPermission
    : '';
}

function appVersionCode(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
    ? value
    : 0;
}

export function normalizeStorefrontRegisterPayload(value: unknown): StorefrontRegisterPayload | null {
  const baseKeys = [
    'fid',
    'app_version',
    'app_version_code',
    'android_version',
    'device_model',
    'locale',
    'timezone',
    'notification_permission',
  ] as const;
  const source = value as Record<string, unknown>;
  const hasAppSetId = isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, 'app_set_id');
  const keys = hasAppSetId ? [...baseKeys, 'app_set_id'] : baseKeys;
  if (!exactKeys(value, keys)) return null;

  const fid = boundedText(source.fid, 255, FID_PATTERN);
  const appSetId = hasAppSetId ? boundedText(source.app_set_id, 150, APP_SET_ID_PATTERN) : '';
  const appVersion = boundedText(source.app_version, 40, VERSION_PATTERN);
  const versionCode = appVersionCode(source.app_version_code);
  const androidVersion = boundedText(source.android_version, 40, ANDROID_PATTERN);
  const deviceModel = boundedText(source.device_model, 120);
  const locale = boundedText(source.locale, 35, LOCALE_PATTERN);
  const timezone = boundedText(source.timezone, 80, TIMEZONE_PATTERN);
  const notificationPermission = permissionState(source.notification_permission);
  if (!fid || (hasAppSetId && !appSetId) || !appVersion || !versionCode || !androidVersion || !deviceModel
    || !locale || !timezone || !notificationPermission) return null;

  return Object.freeze({
    fid,
    ...(appSetId ? { app_set_id: appSetId } : {}),
    app_version: appVersion,
    app_version_code: versionCode,
    android_version: androidVersion,
    device_model: deviceModel,
    locale,
    timezone,
    notification_permission: notificationPermission,
  });
}

export function normalizeStorefrontCoreRegisterPayload(value: unknown): StorefrontCoreRegisterPayload | null {
  const keys = [
    'installation_id',
    'app_key',
    'app_version',
    'app_version_code',
    'android_version',
    'device_model',
    'locale',
    'timezone',
    'notification_permission',
  ] as const;
  if (!exactKeys(value, keys)) return null;

  const source = value as Record<string, unknown>;
  const installationId = boundedText(source.installation_id, 36, INSTALLATION_UUID_PATTERN).toLowerCase();
  const appKey = boundedText(source.app_key, 64, APP_KEY_PATTERN);
  const appVersion = boundedText(source.app_version, 40, VERSION_PATTERN);
  const versionCode = appVersionCode(source.app_version_code);
  const androidVersion = boundedText(source.android_version, 40, ANDROID_PATTERN);
  const deviceModel = boundedText(source.device_model, 120);
  const locale = boundedText(source.locale, 35, LOCALE_PATTERN);
  const timezone = boundedText(source.timezone, 80, TIMEZONE_PATTERN);
  const notificationPermission = permissionState(source.notification_permission);
  if (!installationId || !appKey || !appVersion || !versionCode || !androidVersion || !deviceModel
    || !locale || !timezone || !notificationPermission) return null;

  return Object.freeze({
    installation_id: installationId,
    app_key: appKey,
    app_version: appVersion,
    app_version_code: versionCode,
    android_version: androidVersion,
    device_model: deviceModel,
    locale,
    timezone,
    notification_permission: notificationPermission,
  });
}

export function mapStorefrontCoreRegisterResponse(value: unknown) {
  if (!exactKeys(value, [
    'ok', 'created', 'installation', 'credential', 'firebase_enrichment_required',
  ])) return null;
  const source = value as Record<string, unknown>;
  const installation = source.installation;
  if (!exactKeys(installation, [
    'id', 'status', 'notification_permission', 'first_seen_at', 'last_seen_at',
  ])) return null;
  const record = installation as Record<string, unknown>;
  const firstSeen = typeof record.first_seen_at === 'string' ? new Date(record.first_seen_at) : null;
  const lastSeen = typeof record.last_seen_at === 'string' ? new Date(record.last_seen_at) : null;
  if (source.ok !== true || typeof source.created !== 'boolean'
    || typeof source.firebase_enrichment_required !== 'boolean'
    || !STOREFRONT_INSTALLATION_CREDENTIAL_PATTERN.test(String(source.credential || ''))
    || !RECORD_ID_PATTERN.test(String(record.id || ''))
    || record.status !== 'active' || !PERMISSION_STATES.includes(record.notification_permission as NotificationPermission)
    || !firstSeen || !lastSeen || !Number.isFinite(firstSeen.getTime()) || !Number.isFinite(lastSeen.getTime())) {
    return null;
  }
  return Object.freeze({
    ok: true,
    created: source.created,
    credential: String(source.credential),
    firebase_enrichment_required: source.firebase_enrichment_required,
  });
}

export function normalizeStorefrontFirebaseEnrichmentPayload(
  value: unknown,
): StorefrontFirebaseEnrichmentPayload | null {
  const hasAppSetId = isPlainObject(value) && Object.hasOwn(value, 'app_set_id');
  const keys = hasAppSetId ? ['fid', 'app_set_id'] as const : ['fid'] as const;
  if (!exactKeys(value, keys)) return null;
  const source = value as Record<string, unknown>;
  const fid = boundedText(source.fid, 255, FID_PATTERN);
  const appSetId = hasAppSetId ? boundedText(source.app_set_id, 150, APP_SET_ID_PATTERN) : '';
  if (!fid || (hasAppSetId && !appSetId)) return null;
  return Object.freeze({ fid, ...(appSetId ? { app_set_id: appSetId } : {}) });
}

export function mapStorefrontFirebaseEnrichmentResponse(value: unknown) {
  if (!exactKeys(value, ['ok', 'firebase_registered', 'fid_rotated', 'credential'])) return null;
  const source = value as Record<string, unknown>;
  if (source.ok !== true || source.firebase_registered !== true || typeof source.fid_rotated !== 'boolean'
    || !STOREFRONT_INSTALLATION_CREDENTIAL_PATTERN.test(String(source.credential || ''))) return null;
  return Object.freeze({
    ok: true,
    firebase_registered: true,
    fid_rotated: source.fid_rotated,
    credential: String(source.credential),
  });
}

export function normalizeStorefrontDiagnosticsPayload(value: unknown) {
  if (!exactKeys(value, ['events'])) return null;
  const events = (value as Record<string, unknown>).events;
  if (!Array.isArray(events) || events.length < 1 || events.length > 32) return null;
  const normalized: StorefrontDiagnosticEvent[] = [];
  for (const event of events) {
    if (!exactKeys(event, [
      'idempotency_key', 'event_type', 'result', 'error_code',
      'http_status', 'latency_ms', 'occurred_at',
    ])) return null;
    const source = event as Record<string, unknown>;
    const idempotencyKey = boundedText(source.idempotency_key, 128, DIAGNOSTIC_KEY_PATTERN);
    const eventType = typeof source.event_type === 'string'
      && DIAGNOSTIC_EVENT_TYPES.includes(source.event_type as typeof DIAGNOSTIC_EVENT_TYPES[number])
      ? source.event_type as typeof DIAGNOSTIC_EVENT_TYPES[number] : '';
    const result = typeof source.result === 'string'
      && DIAGNOSTIC_RESULTS.includes(source.result as typeof DIAGNOSTIC_RESULTS[number])
      ? source.result as typeof DIAGNOSTIC_RESULTS[number] : '';
    const errorCode = source.error_code === '' ? '' : boundedText(source.error_code, 80, SAFE_ERROR_PATTERN);
    const httpStatus = Number(source.http_status);
    const latencyMs = Number(source.latency_ms);
    const occurredAt = typeof source.occurred_at === 'string' ? new Date(source.occurred_at) : null;
    if (!idempotencyKey || !eventType || !result
      || (source.error_code !== '' && !errorCode)
      || !Number.isSafeInteger(httpStatus) || httpStatus < 0 || httpStatus > 599
      || !Number.isSafeInteger(latencyMs) || latencyMs < 0 || latencyMs > 600_000
      || !occurredAt || !Number.isFinite(occurredAt.getTime())) return null;
    normalized.push(Object.freeze({
      idempotency_key: idempotencyKey,
      event_type: eventType,
      result,
      error_code: errorCode,
      http_status: httpStatus,
      latency_ms: latencyMs,
      occurred_at: occurredAt.toISOString(),
    }));
  }
  return Object.freeze({ events: Object.freeze(normalized) });
}

export function normalizeStorefrontNotificationReceiptsPayload(value: unknown) {
  if (!exactKeys(value, ['receipts'])) return null;
  const receipts = (value as Record<string, unknown>).receipts;
  if (!Array.isArray(receipts) || receipts.length < 1 || receipts.length > 50) return null;
  const normalized: Array<Readonly<{ notification_id: string; state: string; occurred_at: string }>> = [];
  for (const receipt of receipts) {
    if (!exactKeys(receipt, ['notification_id', 'state', 'occurred_at'])) return null;
    const source = receipt as Record<string, unknown>;
    const notificationId = boundedText(source.notification_id, 15, RECORD_ID_PATTERN);
    const state = typeof source.state === 'string'
      && NOTIFICATION_RECEIPT_STATES.includes(source.state as typeof NOTIFICATION_RECEIPT_STATES[number])
      ? source.state : '';
    const occurredAt = typeof source.occurred_at === 'string' ? new Date(source.occurred_at) : null;
    if (!notificationId || !state || !occurredAt || !Number.isFinite(occurredAt.getTime())) return null;
    normalized.push(Object.freeze({
      notification_id: notificationId,
      state,
      occurred_at: occurredAt.toISOString(),
    }));
  }
  return Object.freeze({ receipts: Object.freeze(normalized) });
}

function normalizedNativeNotification(value: unknown) {
  if (!exactKeys(value, [
    'notification_id', 'schema_version', 'store_key', 'campaign_id', 'delivery_id',
    'title', 'body', 'target_type', 'target_path', 'image_url', 'created_at', 'expires_at',
  ])) return null;
  const source = value as Record<string, unknown>;
  const notificationId = boundedText(source.notification_id, 15, RECORD_ID_PATTERN);
  const deliveryId = boundedText(source.delivery_id, 15, RECORD_ID_PATTERN);
  const campaignId = boundedText(source.campaign_id, 15, RECORD_ID_PATTERN);
  const storeKey = boundedText(source.store_key, 64, APP_KEY_PATTERN);
  const title = typeof source.title === 'string' && source.title.length <= 120 ? source.title : null;
  const body = typeof source.body === 'string' && source.body.length <= 1000 ? source.body : null;
  const targetType = ['home', 'product', 'category', 'section', 'order', 'raffle', 'coupon']
    .includes(String(source.target_type || '')) ? String(source.target_type) : '';
  const targetPath = typeof source.target_path === 'string' && source.target_path.length <= 500
    && !/\p{Cc}/u.test(source.target_path) ? source.target_path : null;
  let imageUrl = '';
  if (source.image_url === '') imageUrl = '';
  else {
    try {
      const parsed = new URL(String(source.image_url || ''));
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) imageUrl = parsed.toString();
    } catch (_) {}
  }
  const createdAt = typeof source.created_at === 'string' ? new Date(source.created_at) : null;
  const expiresAt = typeof source.expires_at === 'string' ? new Date(source.expires_at) : null;
  if (!notificationId || notificationId !== deliveryId || !campaignId || !storeKey
    || source.schema_version !== '1' || title === null || body === null || !targetType || targetPath === null
    || (source.image_url !== '' && !imageUrl)
    || (targetType !== 'order' && !STOREFRONT_PATH_PATTERN.test(targetPath))
    || !createdAt || !expiresAt || !Number.isFinite(createdAt.getTime())
    || !Number.isFinite(expiresAt.getTime()) || expiresAt <= createdAt) return null;
  return Object.freeze({
    notification_id: notificationId,
    schema_version: '1',
    store_key: storeKey,
    campaign_id: campaignId,
    delivery_id: deliveryId,
    title,
    body,
    target_type: targetType,
    target_path: targetPath,
    image_url: imageUrl,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
}

export function mapStorefrontNotificationsSyncResponse(value: unknown) {
  if (!exactKeys(value, ['ok', 'notifications', 'server_time']) || (value as Record<string, unknown>).ok !== true) {
    return null;
  }
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.notifications) || source.notifications.length > 50) return null;
  const notifications = source.notifications.map(normalizedNativeNotification);
  const serverTime = typeof source.server_time === 'string' ? new Date(source.server_time) : null;
  if (notifications.some((item) => !item) || !serverTime || !Number.isFinite(serverTime.getTime())) return null;
  return Object.freeze({
    ok: true,
    notifications: Object.freeze(notifications),
    server_time: serverTime.toISOString(),
  });
}

export function mapStorefrontNotificationAckResponse(value: unknown) {
  if (!exactKeys(value, ['accepted', 'duplicates', 'ok'])) return null;
  const source = value as Record<string, unknown>;
  const accepted = Number(source.accepted);
  const duplicates = Number(source.duplicates);
  return source.ok === true && Number.isSafeInteger(accepted) && accepted >= 0 && accepted <= 50
    && Number.isSafeInteger(duplicates) && duplicates >= 0 && duplicates <= 50
    ? Object.freeze({ ok: true, accepted, duplicates }) : null;
}

export function mapStorefrontRealtimeTicketResponse(value: unknown) {
  if (!exactKeys(value, ['expires_at', 'ok', 'ticket', 'websocket_url'])) return null;
  const source = value as Record<string, unknown>;
  const ticket = boundedText(
    source.ticket,
    256,
    /^pzrt_v1\.[a-f0-9]{64}\.\d{10}\.\d{10}\.[A-Za-z0-9]{32}\.[a-f0-9]{64}$/,
  );
  const expiresAt = typeof source.expires_at === 'string' ? new Date(source.expires_at) : null;
  let websocketUrl = '';
  try {
    const parsed = new URL(String(source.websocket_url || ''));
    if (parsed.protocol === 'wss:' && parsed.hostname && !parsed.username && !parsed.password
      && (parsed.port === '' || parsed.port === '443') && parsed.pathname === '/v1/connect'
      && !parsed.search && !parsed.hash) websocketUrl = parsed.toString();
  } catch (_) {}
  return source.ok === true && ticket && expiresAt && Number.isFinite(expiresAt.getTime()) && websocketUrl
    ? Object.freeze({
      ok: true,
      ticket,
      expires_at: expiresAt.toISOString(),
      websocket_url: websocketUrl,
    })
    : null;
}

export function normalizeStorefrontHeartbeatPayload(value: unknown): StorefrontHeartbeatPayload | null {
  const keys = [
    'app_version',
    'app_version_code',
    'android_version',
    'device_model',
    'locale',
    'timezone',
  ] as const;
  if (!exactKeys(value, keys)) return null;

  const source = value as Record<string, unknown>;
  const appVersion = boundedText(source.app_version, 40, VERSION_PATTERN);
  const versionCode = appVersionCode(source.app_version_code);
  const androidVersion = boundedText(source.android_version, 40, ANDROID_PATTERN);
  const deviceModel = boundedText(source.device_model, 120);
  const locale = boundedText(source.locale, 35, LOCALE_PATTERN);
  const timezone = boundedText(source.timezone, 80, TIMEZONE_PATTERN);
  if (!appVersion || !versionCode || !androidVersion || !deviceModel || !locale || !timezone) return null;

  return Object.freeze({
    app_version: appVersion,
    app_version_code: versionCode,
    android_version: androidVersion,
    device_model: deviceModel,
    locale,
    timezone,
  });
}

export function normalizeStorefrontPermissionPayload(value: unknown) {
  if (!exactKeys(value, ['notification_permission'])) return null;
  const notificationPermission = permissionState((value as Record<string, unknown>).notification_permission);
  return notificationPermission
    ? Object.freeze({ notification_permission: notificationPermission })
    : null;
}

export function normalizeStorefrontEmptyPayload(value: unknown) {
  return exactKeys(value, []) ? Object.freeze({}) : null;
}

export function normalizeStorefrontCampaignTargetPayload(value: unknown) {
  if (!exactKeys(value, ['campaign_id'])) return null;
  const campaignId = boundedText((value as Record<string, unknown>).campaign_id, 15, RECORD_ID_PATTERN);
  return campaignId ? Object.freeze({ campaign_id: campaignId }) : null;
}

export function normalizeStorefrontEventPayload(value: unknown) {
  const keys = ['delivery_id', 'event_type', 'idempotency_key', 'occurred_at', 'target_path'] as const;
  if (!exactKeys(value, keys)) return null;
  const source = value as Record<string, unknown>;
  const deliveryId = boundedText(source.delivery_id, 15, RECORD_ID_PATTERN);
  const eventType = source.event_type === 'opened' || source.event_type === 'destination_viewed'
    ? source.event_type
    : '';
  const idempotencyKey = boundedText(source.idempotency_key, 128);
  const occurredAt = typeof source.occurred_at === 'string' && source.occurred_at === source.occurred_at.trim()
    ? new Date(source.occurred_at)
    : null;
  const targetPath = typeof source.target_path === 'string' ? source.target_path : '';
  if (!deliveryId || !eventType || idempotencyKey !== `${eventType}:${deliveryId}`
    || !occurredAt || !Number.isFinite(occurredAt.getTime())
    || targetPath !== targetPath.trim() || targetPath.length > 500
    || (eventType === 'opened' && targetPath !== '')
    || (eventType === 'destination_viewed'
      && !(STOREFRONT_PATH_PATTERN.test(targetPath) || targetPath === '__order_verified__'))) return null;
  return Object.freeze({
    delivery_id: deliveryId,
    event_type: eventType,
    idempotency_key: idempotencyKey,
    occurred_at: occurredAt.toISOString(),
    target_path: targetPath,
  });
}

export function normalizeStorefrontUpdatePolicyPayload(value: unknown) {
  if (!exactKeys(value, ['install_source', 'package_name', 'version_code', 'version_name'])) return null;
  const source = value as Record<string, unknown>;
  const packageName = boundedText(source.package_name, 190, PACKAGE_PATTERN);
  const versionCode = appVersionCode(source.version_code);
  const versionName = boundedText(source.version_name, 40, VERSION_PATTERN);
  const installSource = ['direct', 'play', 'unknown'].includes(String(source.install_source || ''))
    ? String(source.install_source) as 'direct' | 'play' | 'unknown'
    : '';
  return packageName && versionCode && versionName && installSource
    ? Object.freeze({ package_name: packageName, version_code: versionCode, version_name: versionName, install_source: installSource })
    : null;
}

export function normalizeStorefrontUpdateTicketPayload(value: unknown) {
  if (!exactKeys(value, ['artifact_id'])) return null;
  const artifactId = boundedText((value as Record<string, unknown>).artifact_id, 15, RECORD_ID_PATTERN);
  return artifactId ? Object.freeze({ artifact_id: artifactId }) : null;
}

export function normalizeStorefrontUpdateVerifiedPayload(value: unknown) {
  if (!exactKeys(value, ['artifact_id', 'bytes', 'sha256', 'version_code'])) return null;
  const source = value as Record<string, unknown>;
  const artifactId = boundedText(source.artifact_id, 15, RECORD_ID_PATTERN);
  const sha256 = boundedText(source.sha256, 64, SHA256_PATTERN);
  const bytes = Number(source.bytes);
  const versionCode = appVersionCode(source.version_code);
  return artifactId && sha256 && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 100 * 1024 * 1024
    && versionCode
    ? Object.freeze({ artifact_id: artifactId, sha256, bytes, version_code: versionCode })
    : null;
}

function normalizeUpdateArtifact(value: unknown) {
  if (!isPlainObject(value)) return null;
  const id = boundedText(value.id, 15, RECORD_ID_PATTERN);
  const fileName = boundedText(value.file_name, 220, APK_FILE_PATTERN);
  const sha256 = boundedText(value.sha256, 64, SHA256_PATTERN);
  const bytes = Number(value.bytes);
  const versionCode = appVersionCode(value.version_code);
  const versionName = boundedText(value.version_name, 40, VERSION_PATTERN);
  const packageName = boundedText(value.package_name, 190, PACKAGE_PATTERN);
  return id && fileName && sha256 && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 100 * 1024 * 1024
    && versionCode && versionName && packageName
    ? Object.freeze({ id, file_name: fileName, sha256, bytes, version_code: versionCode, version_name: versionName, package_name: packageName })
    : null;
}

export function mapStorefrontUpdatePolicyResponse(value: unknown) {
  if (!isPlainObject(value) || value.ok !== true || !isPlainObject(value.policy)) return null;
  const policy = value.policy;
  const packageName = boundedText(policy.package_name, 190, PACKAGE_PATTERN);
  const currentVersionCode = appVersionCode(policy.current_version_code);
  const currentVersionName = boundedText(policy.current_version_name, 40, VERSION_PATTERN);
  const latestVersionCode = appVersionCode(policy.latest_version_code);
  const latestVersionName = boundedText(policy.latest_version_name, 40, VERSION_PATTERN);
  const minimumVersionCode = Number(policy.minimum_supported_version_code);
  const deliveryMode = policy.delivery_mode === 'play_store' || policy.delivery_mode === 'private_apk'
    ? policy.delivery_mode : '';
  const updateAvailable = typeof policy.update_available === 'boolean' ? policy.update_available : null;
  const updateRequired = typeof policy.update_required === 'boolean' ? policy.update_required : null;
  const artifact = policy.artifact === null ? null : normalizeUpdateArtifact(policy.artifact);
  let playStoreUrl = '';
  try {
    const parsed = new URL(String(policy.play_store_url || ''));
    if (parsed.protocol === 'https:' && parsed.hostname === 'play.google.com'
      && parsed.pathname === '/store/apps/details' && parsed.searchParams.get('id') === packageName) playStoreUrl = parsed.toString();
  } catch (_) {}
  if (!packageName || !currentVersionCode || !currentVersionName || !latestVersionCode || !latestVersionName
    || !Number.isSafeInteger(minimumVersionCode) || minimumVersionCode < 0 || !deliveryMode
    || updateAvailable === null || updateRequired === null
    || (updateAvailable && !artifact) || (!updateAvailable && artifact)
    || (deliveryMode === 'play_store' && !playStoreUrl)) return null;
  return Object.freeze({
    ok: true,
    policy: Object.freeze({
      package_name: packageName,
      current_version_code: currentVersionCode,
      current_version_name: currentVersionName,
      latest_version_code: latestVersionCode,
      latest_version_name: latestVersionName,
      minimum_supported_version_code: minimumVersionCode,
      update_available: updateAvailable,
      update_required: updateRequired,
      delivery_mode: deliveryMode,
      play_store_url: playStoreUrl,
      artifact,
    }),
  });
}

export function mapStorefrontUpdateTicketResponse(value: unknown) {
  if (!isPlainObject(value) || value.ok !== true) return null;
  const artifact = normalizeUpdateArtifact(value.artifact);
  const ticket = boundedText(value.ticket, 43, /^[A-Za-z0-9_-]{43}$/);
  const expiresAt = typeof value.expires_at === 'string' ? new Date(value.expires_at) : null;
  let downloadUrl = '';
  try {
    const parsed = new URL(String(value.download_url || ''));
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash
      && parsed.pathname.startsWith('/api/pz/storefront-app-updates/')) downloadUrl = parsed.toString();
  } catch (_) {}
  return artifact && ticket && expiresAt && Number.isFinite(expiresAt.getTime()) && downloadUrl
    ? Object.freeze({ ok: true, ticket, expires_at: expiresAt.toISOString(), artifact, download_url: downloadUrl })
    : null;
}

export function mapStorefrontUpdateVerifiedResponse(value: unknown) {
  if (!exactKeys(value, ['artifact_id', 'ok', 'verified_at'])) return null;
  const source = value as Record<string, unknown>;
  const artifactId = boundedText(source.artifact_id, 15, RECORD_ID_PATTERN);
  const verifiedAt = typeof source.verified_at === 'string' ? new Date(source.verified_at) : null;
  return source.ok === true && artifactId && verifiedAt && Number.isFinite(verifiedAt.getTime())
    ? Object.freeze({ ok: true, artifact_id: artifactId, verified_at: verifiedAt.toISOString() })
    : null;
}

export function mapStorefrontEventResponse(value: unknown) {
  if (!exactKeys(value, ['duplicate', 'event_type', 'ok', 'recorded_at'])) return null;
  const source = value as Record<string, unknown>;
  const recordedAt = typeof source.recorded_at === 'string' ? new Date(source.recorded_at) : null;
  if (source.ok !== true
    || (source.event_type !== 'opened' && source.event_type !== 'destination_viewed')
    || typeof source.duplicate !== 'boolean'
    || !recordedAt || !Number.isFinite(recordedAt.getTime())) return null;
  return Object.freeze({
    ok: true,
    event_type: source.event_type,
    duplicate: source.duplicate,
    recorded_at: recordedAt.toISOString(),
  });
}

export function mapStorefrontResolvedTarget(value: unknown) {
  if (!exactKeys(value, ['ok', 'target_path', 'target_type'])) return null;
  const source = value as Record<string, unknown>;
  if (source.ok !== true || source.target_type !== 'order'
    || typeof source.target_path !== 'string'
    || !ORDER_TARGET_PATH_PATTERN.test(source.target_path)) return null;
  return Object.freeze({ ok: true, target_type: 'order', target_path: source.target_path });
}

export function storefrontInstallationCredential(request: Request) {
  const authorization = String(request.headers.get('authorization') || '');
  if (!authorization || authorization.length > 128) return '';
  const match = authorization.match(/^Bearer (pzs_v1_[a-f0-9]{64})$/);
  return match && STOREFRONT_INSTALLATION_CREDENTIAL_PATTERN.test(match[1]) ? match[1] : '';
}

export async function readStorefrontJson(
  request: Request,
  maxBytes: number,
  allowEmpty = false,
): Promise<ParsedJson> {
  const declaredHeader = request.headers.get('content-length');
  if (declaredHeader) {
    const declared = Number(declaredHeader);
    if (!Number.isSafeInteger(declared) || declared < 0) return { ok: false, error: 'invalid_payload' };
    if (declared > maxBytes) return { ok: false, error: 'payload_too_large' };
  }

  let text = '';
  try { text = await request.text(); } catch { return { ok: false, error: 'invalid_payload' }; }
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) return { ok: false, error: 'payload_too_large' };
  if (!text.trim()) return allowEmpty ? { ok: true, value: {} } : { ok: false, error: 'invalid_payload' };

  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed)
      ? { ok: true, value: parsed }
      : { ok: false, error: 'invalid_payload' };
  } catch {
    return { ok: false, error: 'invalid_payload' };
  }
}

export function canonicalStorefrontJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non_finite_number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStorefrontJson).join(',')}]`;
  if (!isPlainObject(value)) throw new TypeError('unsupported_value');
  const pairs = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStorefrontJson(value[key])}`);
  return `{${pairs.join(',')}}`;
}
