const FID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const APP_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const FIREBASE_APP_ID_PATTERN = /^1:[0-9]{6,20}:android:[a-f0-9]{16,64}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;
const SAFE_TARGET_PATH_PATTERN = /^\/t\/[a-z0-9][a-z0-9-]*(?:[/?][A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;
const MAX_DELIVERIES = 500;
const TARGET_TYPES = new Set(['home', 'product', 'category', 'section', 'order', 'raffle', 'coupon']);
const RESULT_STATUSES = new Set([
  'accepted', 'invalid_fid', 'failed_transient', 'failed_permanent', 'unknown',
]);

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function exactObject(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validImageUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.hash === '';
  } catch {
    return false;
  }
}

function validTargetPath(type: string, value: string) {
  if (type === 'order') return value === '';
  if (!value || value.length > 500 || !SAFE_TARGET_PATH_PATTERN.test(value)) return false;
  const lowered = value.toLowerCase();
  return !lowered.includes('/admin')
    && !lowered.includes('/api/')
    && !lowered.includes('/master')
    && !lowered.includes('/login')
    && !value.startsWith('//');
}

export function normalizePushRelayV2Payload(value: any) {
  if (!exactObject(value, ['app', 'deliveries', 'message'])) return null;
  if (!exactObject(value.app, ['app_key', 'firebase_app_id', 'package_name'])) return null;
  if (!exactObject(value.message, [
    'body',
    'campaign_id',
    'channel',
    'image_url',
    'schema_version',
    'store_key',
    'target_path',
    'target_type',
    'title',
  ])) return null;
  if (!Array.isArray(value.deliveries)
    || value.deliveries.length < 1
    || value.deliveries.length > MAX_DELIVERIES) return null;

  const appKey = clean(value.app.app_key, 64);
  const packageName = clean(value.app.package_name, 190);
  const firebaseAppId = clean(value.app.firebase_app_id, 255);
  if (!APP_KEY_PATTERN.test(appKey)
    || !APP_ID_PATTERN.test(packageName)
    || !FIREBASE_APP_ID_PATTERN.test(firebaseAppId)) return null;

  const campaignId = clean(value.message.campaign_id, 15);
  const storeKey = clean(value.message.store_key, 64);
  const title = clean(value.message.title, 120);
  const body = clean(value.message.body, 1000);
  const targetType = clean(value.message.target_type, 20);
  const targetPath = clean(value.message.target_path, 500);
  const imageUrl = clean(value.message.image_url, 2048);
  if (value.message.schema_version !== '1'
    || value.message.channel !== 'storefront'
    || !RECORD_ID_PATTERN.test(campaignId)
    || storeKey !== appKey
    || !title
    || !body
    || !TARGET_TYPES.has(targetType)
    || !validTargetPath(targetType, targetPath)
    || !validImageUrl(imageUrl)) return null;

  const seenIds = new Set<string>();
  const seenFids = new Set<string>();
  const deliveries = [];
  for (const item of value.deliveries) {
    if (!exactObject(item, ['delivery_id', 'fid'])) return null;
    const deliveryId = clean(item.delivery_id, 15);
    const fid = clean(item.fid, 255);
    if (!RECORD_ID_PATTERN.test(deliveryId)
      || !FID_PATTERN.test(fid)
      || seenIds.has(deliveryId)
      || seenFids.has(fid)) return null;
    seenIds.add(deliveryId);
    seenFids.add(fid);
    deliveries.push({ delivery_id: deliveryId, fid });
  }

  const normalized = {
    app: {
      app_key: appKey,
      firebase_app_id: firebaseAppId,
      package_name: packageName,
    },
    message: {
      schema_version: '1',
      channel: 'storefront',
      store_key: storeKey,
      campaign_id: campaignId,
      title,
      body,
      image_url: imageUrl,
      target_type: targetType,
      target_path: targetPath,
    },
    deliveries,
  };

  // FCM limita data + notification a 4096 bytes. El FID y delivery_id no
  // forman parte del mensaje enviado al dispositivo.
  const messageBytes = Buffer.byteLength(JSON.stringify(normalized.message), 'utf8');
  return messageBytes <= 3500 ? normalized : null;
}

export function buildStorefrontMulticastMessage(payload: any) {
  return {
    fids: payload.deliveries.map((delivery: any) => delivery.fid),
    data: {
      schema_version: payload.message.schema_version,
      channel: payload.message.channel,
      store_key: payload.message.store_key,
      campaign_id: payload.message.campaign_id,
      title: payload.message.title,
      body: payload.message.body,
      target_type: payload.message.target_type,
      target_path: payload.message.target_path,
      image_url: payload.message.image_url,
    },
    android: {
      priority: 'high',
      ttl: 86_400_000,
      collapseKey: `pz_storefront_${payload.message.campaign_id}`,
      restrictedPackageName: payload.app.package_name,
    },
  };
}

function normalizedErrorCode(error: any) {
  const raw = clean(error?.code || error?.errorInfo?.code || 'messaging/unknown-error', 160).toLowerCase();
  const sanitized = raw.replace(/[^a-z0-9._/-]+/g, '_').slice(0, 80);
  return sanitized || 'messaging/unknown-error';
}

export function firebaseRetryAfterSeconds(error: any, now = Date.now()) {
  const candidates = [
    error?.retryAfter,
    error?.retry_after,
    error?.errorInfo?.retryAfter,
    error?.errorInfo?.retry_after,
    error?.response?.headers?.get?.('retry-after'),
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) return Math.min(3600, Math.ceil(numeric));
    const parsed = Date.parse(String(candidate));
    if (Number.isFinite(parsed) && parsed > now) {
      return Math.min(3600, Math.max(1, Math.ceil((parsed - now) / 1000)));
    }
  }
  return 0;
}

export function classifyFirebaseDeliveryError(error: any) {
  const errorCode = normalizedErrorCode(error);
  const invalid = errorCode.includes('installation-id-not-registered')
    || errorCode.includes('registration-token-not-registered')
    || errorCode.includes('invalid-registration');
  if (invalid) return { status: 'invalid_fid', error_code: errorCode, retry_after_seconds: 0 };

  const transient = errorCode.includes('server-unavailable')
    || errorCode.includes('internal-error')
    || errorCode.includes('message-rate-exceeded')
    || errorCode.includes('quota-exceeded')
    || errorCode.includes('network-error')
    || errorCode.includes('unavailable')
    || errorCode.includes('resource-exhausted');
  if (transient) {
    return {
      status: 'failed_transient',
      error_code: errorCode,
      retry_after_seconds: firebaseRetryAfterSeconds(error),
    };
  }
  return { status: 'failed_permanent', error_code: errorCode, retry_after_seconds: 0 };
}

export function normalizePushRelayV2Result(value: any, allowedDeliveryIds: Set<string>) {
  if (!exactObject(value, [
    'delivery_id', 'error_code', 'firebase_message_id', 'retry_after_seconds', 'status',
  ])) return null;
  const deliveryId = clean(value.delivery_id, 15);
  const status = clean(value.status, 30);
  const messageId = clean(value.firebase_message_id, 255);
  const errorCode = clean(value.error_code, 80);
  const retryAfter = Number(value.retry_after_seconds);
  if (!allowedDeliveryIds.has(deliveryId)
    || !RESULT_STATUSES.has(status)
    || !Number.isInteger(retryAfter)
    || retryAfter < 0
    || retryAfter > 3600) return null;
  if (status === 'accepted' && (!messageId || errorCode || retryAfter !== 0)) return null;
  if (status !== 'accepted' && messageId) return null;
  return {
    delivery_id: deliveryId,
    status,
    firebase_message_id: messageId,
    error_code: errorCode,
    retry_after_seconds: retryAfter,
  };
}

export const PUSH_RELAY_V2_MAX_DELIVERIES = MAX_DELIVERIES;
