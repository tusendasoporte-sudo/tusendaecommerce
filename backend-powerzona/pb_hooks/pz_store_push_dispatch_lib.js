/// <reference path="../pb_data/types.d.ts" />

const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);

const DEVICE_COLLECTION = "store_push_devices";
const MAX_BATCH_SIZE = 500;
const MAX_STORE_DEVICES = 2000;
const APP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const FID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const RECORD_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const EXPIRATION_TYPES = Object.freeze([
  "product_expiring_soon",
  "product_expiring_critical",
  "product_expired",
  "variation_expiring_soon",
  "variation_expiring_critical",
  "variation_expired",
]);

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try { return record.get(key); } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try { return record.getString(key); } catch (_) {}
  }
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  return String(value === null || value === undefined ? "" : value).trim();
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function bounded(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function normalizePriority(value) {
  const priority = bounded(value, 20);
  return ["normal", "important", "critical"].includes(priority) ? priority : "normal";
}

function normalizeTargetUrl(value) {
  const target = bounded(value, 500);
  return target.startsWith("/") && !target.startsWith("//") ? target : "/admin";
}

function normalizeNotificationPayload(notification) {
  const id = bounded(notification && (notification.id || recordString(notification, "id")), 80);
  const storeId = bounded(relationId(notification, "store"), 80);
  const type = bounded(recordString(notification, "type"), 80);
  const title = bounded(recordString(notification, "title"), 160);
  const body = bounded(recordString(notification, "message"), 600);
  if (!RECORD_ID_PATTERN.test(id) || !RECORD_ID_PATTERN.test(storeId) || !type || !title || !body) return null;
  return {
    id,
    store_id: storeId,
    type,
    title,
    body,
    target_url: normalizeTargetUrl(recordString(notification, "target_url")),
    priority: normalizePriority(recordString(notification, "priority")),
  };
}

function isExpirationType(value) {
  return EXPIRATION_TYPES.includes(String(value || ""));
}

function safeGetenv(name) {
  try { return String($os.getenv(name) || "").trim(); } catch (_) { return ""; }
}

function validRelayUrl(value, allowHttp) {
  const url = String(value || "").trim();
  if (/^https:\/\/[^\s]+$/i.test(url)) return url;
  if (allowHttp && /^http:\/\/[^\s]+$/i.test(url)) return url;
  return "";
}

function relayConfig(getenv) {
  const read = typeof getenv === "function" ? getenv : safeGetenv;
  const allowHttp = String(read("PZ_PUSH_RELAY_ALLOW_HTTP") || "").trim() === "1";
  const url = validRelayUrl(read("PZ_PUSH_RELAY_URL"), allowHttp);
  const secret = String(read("PZ_PUSH_RELAY_SECRET") || "").trim();
  return url && secret.length >= 32 ? { url, secret } : null;
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findActiveDevices(app, storeId) {
  const devices = [];
  for (let offset = 0; offset < MAX_STORE_DEVICES; offset += 200) {
    let page = [];
    try {
      page = app.findRecordsByFilter(
        DEVICE_COLLECTION,
        'store = {:store} && status = "active"',
        "id",
        200,
        offset,
        { store: storeId },
      ) || [];
    } catch (_) {
      break;
    }
    page.forEach((device) => devices.push(device));
    if (page.length < 200) break;
  }
  return devices;
}

function canReceive(app, device, store, notificationType) {
  if (recordValue(device, "notifications_enabled") === false) return false;
  const user = findRecord(app, "users", relationId(device, "user"));
  if (!user || recordString(user, "status") !== "active") return false;
  if (relationId(user, "store") !== String(store.id || recordString(store, "id"))) return false;
  if (!permissions.hasStorePermission(app, user, store, "notifications.view")) return false;
  return !isExpirationType(notificationType)
    || permissions.hasStorePermission(app, user, store, "catalog.expirations.manage");
}

function normalizeDevice(device) {
  const id = bounded(device && (device.id || recordString(device, "id")), 80);
  const fid = bounded(recordString(device, "installation_id"), 255);
  const appId = bounded(recordString(device, "app_id"), 190);
  if (!RECORD_ID_PATTERN.test(id) || !FID_PATTERN.test(fid) || !APP_ID_PATTERN.test(appId)) return null;
  return { id, fid, app_id: appId };
}

function eligibleDevices(app, store, notificationType) {
  const seen = new Set();
  const result = [];
  findActiveDevices(app, String(store.id || recordString(store, "id"))).forEach((device) => {
    if (!canReceive(app, device, store, notificationType)) return;
    const normalized = normalizeDevice(device);
    if (!normalized || seen.has(normalized.fid)) return;
    seen.add(normalized.fid);
    result.push(normalized);
  });
  return result;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function validInvalidDeviceIds(response, sentDevices) {
  if (!response || Number(response.statusCode) !== 200 || !response.json || response.json.ok !== true) return [];
  const allowed = new Set(sentDevices.map((device) => device.id));
  const values = Array.isArray(response.json.invalid_device_ids) ? response.json.invalid_device_ids : [];
  return Array.from(new Set(values.map((value) => bounded(value, 80)).filter((id) => allowed.has(id))));
}

function invalidateDevices(app, deviceIds) {
  const now = new Date().toISOString();
  deviceIds.forEach((id) => {
    const device = findRecord(app, DEVICE_COLLECTION, id);
    if (!device) return;
    try {
      device.set("status", "invalid");
      device.set("disabled_at", now);
      app.save(device);
    } catch (_) {}
  });
}

function dispatchNotification(app, notification, options) {
  const config = options && options.config ? options.config : relayConfig();
  const send = options && typeof options.send === "function"
    ? options.send
    : (typeof $http !== "undefined" && $http && typeof $http.send === "function" ? $http.send.bind($http) : null);
  const normalized = normalizeNotificationPayload(notification);
  if (!config || !send || !normalized) return { ok: false, skipped: true };

  const store = findRecord(app, "stores", normalized.store_id);
  if (!store) return { ok: false, skipped: true };
  const devices = eligibleDevices(app, store, normalized.type);
  if (!devices.length) return { ok: true, sent: 0, failed: 0, invalidated: 0 };

  let sent = 0;
  let failed = 0;
  const invalidIds = new Set();
  chunks(devices, MAX_BATCH_SIZE).forEach((batch) => {
    let response = null;
    try {
      response = send({
        url: config.url,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pz-push-secret": config.secret,
        },
        body: JSON.stringify({ notification: normalized, devices: batch }),
        timeout: 10,
      });
    } catch (_) {
      failed += batch.length;
      return;
    }
    if (!response || Number(response.statusCode) !== 200 || !response.json || response.json.ok !== true) {
      failed += batch.length;
      return;
    }
    sent += Math.max(0, Number(response.json.success_count) || 0);
    failed += Math.max(0, Number(response.json.failure_count) || 0);
    validInvalidDeviceIds(response, batch).forEach((id) => invalidIds.add(id));
  });

  invalidateDevices(app, Array.from(invalidIds));
  return { ok: failed === 0, sent, failed, invalidated: invalidIds.size };
}

function continueNotificationCreated(e) {
  const nextResult = e.next();
  try { dispatchNotification(e.app || $app, e.record); } catch (_) {}
  return nextResult;
}

module.exports = {
  APP_ID_PATTERN,
  EXPIRATION_TYPES,
  FID_PATTERN,
  MAX_BATCH_SIZE,
  continueNotificationCreated,
  dispatchNotification,
  isExpirationType,
  normalizeDevice,
  normalizeNotificationPayload,
  relayConfig,
  validInvalidDeviceIds,
  validRelayUrl,
};
