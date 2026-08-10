const FID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const APP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const RECORD_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PRIORITIES = new Set(['normal', 'important', 'critical']);
const MAX_DEVICES = 500;

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeTargetUrl(value) {
  const target = clean(value, 500);
  return target.startsWith('/') && !target.startsWith('//') ? target : '/admin';
}

export function normalizeRelayPayload(value) {
  if (!exactObject(value, ['notification', 'devices'])) return null;
  if (!exactObject(value.notification, [
    'id',
    'store_id',
    'type',
    'title',
    'body',
    'target_url',
    'priority',
  ])) return null;
  if (!Array.isArray(value.devices) || value.devices.length < 1 || value.devices.length > MAX_DEVICES) return null;

  const id = clean(value.notification.id, 80);
  const storeId = clean(value.notification.store_id, 80);
  const type = clean(value.notification.type, 80);
  const title = clean(value.notification.title, 160);
  const body = clean(value.notification.body, 600);
  const priority = clean(value.notification.priority, 20);
  if (!RECORD_ID_PATTERN.test(id) || !RECORD_ID_PATTERN.test(storeId) || !type || !title || !body) return null;
  if (!PRIORITIES.has(priority)) return null;

  const seenIds = new Set();
  const seenFids = new Set();
  const devices = [];
  for (const item of value.devices) {
    if (!exactObject(item, ['id', 'fid', 'app_id'])) return null;
    const deviceId = clean(item.id, 80);
    const fid = clean(item.fid, 255);
    const appId = clean(item.app_id, 190);
    if (!RECORD_ID_PATTERN.test(deviceId) || !FID_PATTERN.test(fid) || !APP_ID_PATTERN.test(appId)) return null;
    if (seenIds.has(deviceId) || seenFids.has(fid)) continue;
    seenIds.add(deviceId);
    seenFids.add(fid);
    devices.push({ id: deviceId, fid, app_id: appId });
  }
  if (!devices.length) return null;

  return {
    notification: {
      id,
      store_id: storeId,
      type,
      title,
      body,
      target_url: normalizeTargetUrl(value.notification.target_url),
      priority,
    },
    devices,
  };
}

export function groupDevicesByAppId(devices) {
  const groups = new Map();
  for (const device of devices || []) {
    const group = groups.get(device.app_id) || [];
    group.push(device);
    groups.set(device.app_id, group);
  }
  return groups;
}

export function androidMessagePriority(notification) {
  const type = clean(notification?.type, 80).toLowerCase();
  return notification?.priority === 'critical'
    || notification?.priority === 'important'
    || type.includes('order')
    || type.includes('security')
    || type.includes('blocked')
    ? 'high'
    : 'normal';
}

export function isInvalidInstallationError(error) {
  const code = clean(error?.code, 160).toLowerCase();
  return code.includes('installation-id-not-registered')
    || code.includes('registration-token-not-registered')
    || code.includes('invalid-registration');
}

export const PUSH_RELAY_MAX_DEVICES = MAX_DEVICES;
