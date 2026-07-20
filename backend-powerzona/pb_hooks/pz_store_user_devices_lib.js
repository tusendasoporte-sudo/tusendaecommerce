/// <reference path="../pb_data/types.d.ts" />

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const activityAudit = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);

const DEVICE_COLLECTION = "store_user_devices";
const AUDIT_COLLECTION = "store_user_device_audit";
const DEVICE_HEADER = "X-PZ-Admin-Device";
const DIGEST_DOMAIN = "pz_admin_device:v1|";
const DIGEST_VERSION = "sha256-v1";
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const STORE_ROLES = Object.freeze(["store_admin", "store_staff"]);
const DEVICE_STATUSES = Object.freeze(["authorized", "revoked"]);
const DEVICE_TYPES = Object.freeze(["desktop", "mobile", "tablet", "unknown"]);
const AUDIT_ACTIONS = Object.freeze(["device_authorized", "device_revoked"]);
const LAST_SEEN_THROTTLE_MS = 15 * 60 * 1000;
const ORIGINAL_USER_AGENT_STORE_KEY = "pz_admin_original_user_agent";
const SAFE_CODES = new Set([
  "unauthorized",
  "invalid_payload",
  "store_not_found",
  "user_not_found",
  "device_not_found",
  "device_required",
  "device_revoked",
  "device_not_authorized",
  "user_device_limit_reached",
  "store_device_limit_reached",
  "device_authorization_unavailable",
  "device_revocation_failed",
  "device_list_failed",
  "audit_load_failed",
]);

const AUTH_MESSAGES = Object.freeze({
  device_required: "Este dispositivo no estÃ¡ autorizado para acceder. Contacta al Master Admin.",
  device_revoked: "Este dispositivo no estÃ¡ autorizado para acceder. Contacta al Master Admin.",
  device_not_authorized: "Este dispositivo no estÃ¡ autorizado para acceder. Contacta al Master Admin.",
  user_device_limit_reached: "Se alcanzÃ³ el lÃ­mite de dispositivos autorizados. Pide al Master Admin que revoque uno antes de continuar.",
  store_device_limit_reached: "Se alcanzÃ³ el lÃ­mite de dispositivos autorizados. Pide al Master Admin que revoque uno antes de continuar.",
  device_authorization_unavailable: "No se pudo validar este dispositivo. Intenta nuevamente mÃ¡s tarde.",
});

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function exactPayload(body, allowedKeys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = allowedKeys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try {
      return record.get(key);
    } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try {
      return record.getString(key);
    } catch (_) {}
  }
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  if (value && typeof value.string === "function") {
    try {
      return String(value.string() || "").trim();
    } catch (_) {}
  }
  return String(value === null || value === undefined ? "" : value).trim();
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function bounded(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function isValidRecordId(value) {
  return typeof value === "string" && RECORD_ID_PATTERN.test(value);
}

function isValidDeviceToken(value) {
  return typeof value === "string" && DEVICE_TOKEN_PATTERN.test(value);
}

function isStoreRole(value) {
  return STORE_ROLES.includes(String(value || ""));
}

function isActiveMaster(record) {
  return recordString(record, "role") === "master_admin" && recordString(record, "status") === "active";
}

function isActiveStoreUser(record) {
  return isStoreRole(recordString(record, "role"))
    && recordString(record, "status") === "active"
    && isValidRecordId(relationId(record, "store"));
}

function safeIsoDate(value) {
  const raw = String(value === null || value === undefined ? "" : value).trim();
  if (!raw) return "";
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function headerValue(info, name, request) {
  try {
    if (request && request.header && typeof request.header.get === "function") {
      const direct = String(request.header.get(name) || "").trim();
      if (direct) return direct;
    }
  } catch (_) {}
  const headers = info && info.headers;
  if (!headers || typeof headers !== "object") return "";
  try {
    if (typeof headers.get === "function") {
      const direct = String(headers.get(name) || headers.get(name.toLowerCase()) || "").trim();
      if (direct) return direct;
    }
  } catch (_) {}
  const expected = name.toLowerCase();
  const normalizedExpected = expected.replace(/-/g, "_");
  const key = Object.keys(headers).find((candidate) => {
    const normalizedCandidate = candidate.toLowerCase().replace(/-/g, "_");
    return normalizedCandidate === normalizedExpected;
  });
  return key ? String(headers[key] || "").trim() : "";
}

function scrubRequestUserAgent(e, info) {
  const replacement = "PowerZona administrative device";
  try {
    if (e && e.request && e.request.header && typeof e.request.header.set === "function") {
      e.request.header.set("User-Agent", replacement);
    }
  } catch (_) {}
  try {
    const headers = info && info.headers;
    if (!headers || typeof headers !== "object") return;
    Object.keys(headers).forEach((key) => {
      if (key.toLowerCase().replace(/-/g, "_") === "user_agent") headers[key] = replacement;
    });
  } catch (_) {}
}

function captureAndScrubAuthUserAgent(e) {
  try {
    const request = e && e.request;
    const path = String(request && request.url && request.url.path || "");
    if ([
      "/api/collections/users/auth-with-password",
      "/api/collections/users/auth-refresh",
    ].includes(path)) {
      const raw = request && request.header && typeof request.header.get === "function"
        ? String(request.header.get("User-Agent") || "").slice(0, 512)
        : "";
      if (raw && typeof e.set === "function") e.set(ORIGINAL_USER_AGENT_STORE_KEY, raw);
      if (request && request.header && typeof request.header.set === "function") {
        request.header.set("User-Agent", "PowerZona administrative device");
      }
    }
  } catch (_) {}
}

function originalUserAgent(e, info) {
  try {
    if (e && typeof e.get === "function") {
      const stored = String(e.get(ORIGINAL_USER_AGENT_STORE_KEY) || "").trim();
      if (stored) return stored;
    }
  } catch (_) {}
  return headerValue(info, "User-Agent", e && e.request);
}

function hashDeviceToken(rawToken, sha256) {
  if (!isValidDeviceToken(rawToken)) throw codedError("device_required");
  let digest = "";
  if (typeof sha256 === "function") {
    digest = String(sha256(DIGEST_DOMAIN + rawToken) || "").trim().toLowerCase();
  } else if (typeof $security !== "undefined" && $security && typeof $security.sha256 === "function") {
    digest = String($security.sha256(DIGEST_DOMAIN + rawToken) || "").trim().toLowerCase();
  }
  if (!/^[a-f0-9]{64}$/.test(digest)) throw codedError("device_authorization_unavailable");
  return digest;
}

function normalizeUserAgent(userAgent) {
  const value = String(userAgent || "").slice(0, 512);
  let browserName = "Otro";
  if (/(Edg|EdgiOS|EdgA)\//i.test(value)) browserName = "Edge";
  else if (/(OPR|Opera)\//i.test(value)) browserName = "Opera";
  else if (/(CriOS|Chrome)\//i.test(value)) browserName = "Chrome";
  else if (/(FxiOS|Firefox)\//i.test(value)) browserName = "Firefox";
  else if (/Safari\//i.test(value)) browserName = "Safari";

  let osName = "Otro";
  let labelOs = "Otro dispositivo";
  if (/Windows/i.test(value)) {
    osName = "Windows";
    labelOs = "Windows";
  } else if (/Android/i.test(value)) {
    osName = "Android";
    labelOs = "Android";
  } else if (/(iPhone|iPad|iPod)/i.test(value)) {
    osName = "iOS";
    labelOs = /iPad/i.test(value) ? "iPad" : "iPhone";
  } else if (/(Macintosh|Mac OS X)/i.test(value)) {
    osName = "macOS";
    labelOs = "macOS";
  } else if (/Linux/i.test(value)) {
    osName = "Linux";
    labelOs = "Linux";
  }

  let deviceType = "unknown";
  if (/(iPad|Tablet|Silk)|(Android(?!.*Mobile))/i.test(value)) deviceType = "tablet";
  else if (/(Mobile|iPhone|iPod|Android)/i.test(value)) deviceType = "mobile";
  else if (/(Windows|Macintosh|Mac OS X|Linux|CrOS)/i.test(value)) deviceType = "desktop";

  return Object.freeze({
    browser_name: browserName,
    os_name: osName,
    device_type: deviceType,
    label: bounded(`${browserName} en ${labelOs}`, 120),
  });
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows;
}

function queryOne(app, sql, bindings, model) {
  const rows = queryRows(app, sql, bindings, model);
  return rows.length ? rows[0] : null;
}

function findRecord(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function findUserDevice(app, userId, digest) {
  const records = app.findRecordsByFilter(
    DEVICE_COLLECTION,
    "user = {:userId} && device_digest = {:digest}",
    "id",
    1,
    0,
    { userId, digest }
  ) || [];
  return records.length ? records[0] : null;
}

function authorizedUserDeviceCount(app, userId) {
  const row = queryOne(app, `
    SELECT COUNT(*) AS deviceCount
    FROM store_user_devices
    WHERE user = {:userId} AND status = 'authorized'
  `, { userId }, { deviceCount: 0 }) || {};
  return nonNegativeInteger(row.deviceCount);
}

function distinctAuthorizedStoreDeviceCount(app, storeId) {
  const row = queryOne(app, `
    SELECT COUNT(DISTINCT device_digest) AS deviceCount
    FROM store_user_devices
    WHERE store = {:storeId} AND status = 'authorized'
  `, { storeId }, { deviceCount: 0 }) || {};
  return nonNegativeInteger(row.deviceCount);
}

function isDigestAuthorizedForStore(app, storeId, digest) {
  const row = queryOne(app, `
    SELECT COUNT(*) AS matches
    FROM store_user_devices
    WHERE store = {:storeId} AND status = 'authorized' AND device_digest = {:digest}
  `, { storeId, digest }, { matches: 0 }) || {};
  return nonNegativeInteger(row.matches) > 0;
}

function lockStore(app, storeId) {
  app.db().newQuery("UPDATE stores SET id = id WHERE id = {:storeId}").bind({ storeId }).execute();
}

function capabilityAccess(store, key, requiredAmount) {
  const options = { enforceExpiration: false };
  if (Number.isInteger(requiredAmount)) options.requiredAmount = requiredAmount;
  const access = capabilities.resolveStoreCapabilityAccess(store, key, options);
  if (!access || ["invalid_plan_data", "invalid_capability"].includes(access.reason)) {
    throw codedError("device_authorization_unavailable");
  }
  return access;
}

function evaluateNewDeviceCapacity(store, userCount, storeCount, digestAlreadyAuthorizedForStore) {
  if (![userCount, storeCount].every((value) => Number.isInteger(value) && value >= 0)) {
    throw codedError("device_authorization_unavailable");
  }
  const userAccess = capabilityAccess(store, "max_devices_per_user", userCount + 1);
  if (!userAccess.allowed) throw codedError("user_device_limit_reached");
  const projectedStoreCount = storeCount + (digestAlreadyAuthorizedForStore ? 0 : 1);
  const storeAccess = capabilityAccess(store, "max_store_devices", projectedStoreCount);
  if (!storeAccess.allowed) throw codedError("store_device_limit_reached");
  return Object.freeze({
    user_count: userCount,
    projected_user_count: userCount + 1,
    user_limit: userAccess.limit,
    store_count: storeCount,
    projected_store_count: projectedStoreCount,
    store_limit: storeAccess.limit,
  });
}

function shouldTouchLastSeen(record, now, throttleMs) {
  const current = safeIsoDate(recordString(record, "last_seen_at"));
  if (!current) return true;
  const nowMs = new Date(now).getTime();
  const currentMs = new Date(current).getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(currentMs)) return true;
  return nowMs - currentMs >= (Number.isFinite(throttleMs) ? throttleMs : LAST_SEEN_THROTTLE_MS);
}

function touchLastSeen(app, device, now, throttleMs) {
  if (!shouldTouchLastSeen(device, now, throttleMs)) return false;
  device.set("last_seen_at", now);
  app.save(device);
  return true;
}

function actorSnapshot(record) {
  const role = recordString(record, "role");
  if (!["master_admin", ...STORE_ROLES].includes(role)) throw codedError("device_authorization_unavailable");
  return {
    id: String(record.id || recordString(record, "id")).slice(0, 15),
    name: bounded(
      recordString(record, "display_name")
        || recordString(record, "name")
        || recordString(record, "email")
        || (role === "master_admin" ? "Master Admin" : "Usuario de tienda"),
      160
    ),
    role,
  };
}

function buildAuditValues(store, targetUser, device, actor, action, sessionsRevoked, reason) {
  if (!AUDIT_ACTIONS.includes(action)) throw codedError("device_authorization_unavailable");
  const actorData = actorSnapshot(actor);
  const deviceType = recordString(device, "device_type");
  return {
    store: String(store.id || "").slice(0, 15),
    store_id_snapshot: String(store.id || "").slice(0, 15),
    store_name_snapshot: bounded(recordString(store, "name"), 140),
    target_user: String(targetUser.id || "").slice(0, 15),
    target_user_id_snapshot: String(targetUser.id || "").slice(0, 15),
    target_user_email_snapshot: bounded(recordString(targetUser, "email").toLowerCase(), 254),
    device: String(device.id || "").slice(0, 15),
    device_id_snapshot: String(device.id || "").slice(0, 15),
    device_label_snapshot: bounded(recordString(device, "label"), 120),
    browser_snapshot: bounded(recordString(device, "browser_name"), 40),
    os_snapshot: bounded(recordString(device, "os_name"), 40),
    device_type_snapshot: DEVICE_TYPES.includes(deviceType) ? deviceType : "unknown",
    actor: actorData.id,
    actor_name_snapshot: actorData.name,
    actor_role_snapshot: actorData.role,
    action,
    sessions_revoked: sessionsRevoked === true,
    reason: bounded(reason, 500),
  };
}

function createAudit(app, store, targetUser, device, actor, action, sessionsRevoked, reason) {
  const audit = new Record(app.findCollectionByNameOrId(AUDIT_COLLECTION), {});
  const values = buildAuditValues(store, targetUser, device, actor, action, sessionsRevoked, reason);
  Object.keys(values).forEach((key) => audit.set(key, values[key]));
  app.save(audit);
  const targetName = bounded(recordString(targetUser, "display_name") || "Usuario del equipo", 140);
  activityAudit.createActivity(app, {
    storeId: store.id,
    actor,
    module: "team",
    action,
    severity: action === "device_revoked" ? "important" : "normal",
    resourceType: "team_user",
    resourceId: targetUser.id,
    resourceLabel: targetName,
    changedFields: ["devices", ...(sessionsRevoked ? ["sessions_revoked"] : [])],
    previousValues: { device_status: action === "device_revoked" ? "authorized" : "not_authorized" },
    newValues: { device_status: action === "device_revoked" ? "revoked" : "authorized", sessions_revoked: sessionsRevoked === true },
    summary: action === "device_revoked" ? `Revocó un dispositivo de ${targetName}` : `Autorizó un dispositivo para ${targetName}`,
    sourceEventKey: `team:${action}:${audit.id}`,
  });
  return audit;
}

function createAuthorizedDevice(app, store, user, digest, metadata, now) {
  const device = new Record(app.findCollectionByNameOrId(DEVICE_COLLECTION), {});
  device.set("store", store.id);
  device.set("user", user.id);
  device.set("device_digest", digest);
  device.set("digest_version", DIGEST_VERSION);
  device.set("status", "authorized");
  device.set("label", metadata.label);
  device.set("browser_name", metadata.browser_name);
  device.set("os_name", metadata.os_name);
  device.set("device_type", metadata.device_type);
  device.set("first_seen_at", now);
  device.set("last_seen_at", now);
  device.set("revoked_at", "");
  device.set("revoke_reason", "");
  app.save(device);
  return device;
}

function codedError(code) {
  const safeCode = SAFE_CODES.has(code) ? code : "device_authorization_unavailable";
  const error = new Error(safeCode);
  error.code = safeCode;
  return error;
}

function errorCode(error) {
  const code = String(error && (error.code || error.message) || "");
  return SAFE_CODES.has(code) ? code : "";
}

function authorizeDeviceForLogin(app, userId, rawToken, userAgent, options) {
  const digest = hashDeviceToken(rawToken, options && options.sha256);
  const metadata = normalizeUserAgent(userAgent);
  const now = options && options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const throttleMs = options && Number.isFinite(options.throttleMs) ? options.throttleMs : LAST_SEEN_THROTTLE_MS;
  let result = null;
  app.runInTransaction((txApp) => {
    let user = findRecord(txApp, "users", userId);
    if (!user || !isActiveStoreUser(user)) throw codedError("device_authorization_unavailable");
    const storeId = relationId(user, "store");
    lockStore(txApp, storeId);
    user = findRecord(txApp, "users", userId);
    if (!user || !isActiveStoreUser(user) || relationId(user, "store") !== storeId) {
      throw codedError("device_authorization_unavailable");
    }
    const store = findRecord(txApp, "stores", storeId);
    if (!store) throw codedError("device_authorization_unavailable");

    const existing = findUserDevice(txApp, user.id, digest);
    if (existing) {
      if (relationId(existing, "store") !== store.id) throw codedError("device_authorization_unavailable");
      if (recordString(existing, "status") === "revoked") throw codedError("device_revoked");
      if (recordString(existing, "status") !== "authorized") throw codedError("device_authorization_unavailable");
      touchLastSeen(txApp, existing, now, throttleMs);
      result = { created: false, device_id: existing.id };
      return;
    }

    const userCount = authorizedUserDeviceCount(txApp, user.id);
    const storeCount = distinctAuthorizedStoreDeviceCount(txApp, store.id);
    evaluateNewDeviceCapacity(
      store,
      userCount,
      storeCount,
      isDigestAuthorizedForStore(txApp, store.id, digest)
    );

    const device = createAuthorizedDevice(txApp, store, user, digest, metadata, now);
    createAudit(txApp, store, user, device, user, "device_authorized", false, "");
    result = { created: true, device_id: device.id };
  });
  return result;
}

function verifyDeviceForRefresh(app, user, rawToken, options) {
  if (!isActiveStoreUser(user)) throw codedError("device_authorization_unavailable");
  const digest = hashDeviceToken(rawToken, options && options.sha256);
  const device = findUserDevice(app, user.id, digest);
  if (!device) throw codedError("device_not_authorized");
  if (relationId(device, "store") !== relationId(user, "store")) {
    throw codedError("device_not_authorized");
  }
  if (recordString(device, "status") === "revoked") throw codedError("device_revoked");
  if (recordString(device, "status") !== "authorized") throw codedError("device_not_authorized");
  const now = options && options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const throttleMs = options && Number.isFinite(options.throttleMs) ? options.throttleMs : LAST_SEEN_THROTTLE_MS;
  touchLastSeen(app, device, now, throttleMs);
  return { device_id: device.id };
}

function deviceManagementReady(app) {
  try {
    const devices = app.findCollectionByNameOrId(DEVICE_COLLECTION);
    const audit = app.findCollectionByNameOrId(AUDIT_COLLECTION);
    return devices.listRule === null
      && devices.viewRule === null
      && devices.createRule === null
      && devices.updateRule === null
      && devices.deleteRule === null
      && audit.listRule === null
      && audit.viewRule === null
      && audit.createRule === null
      && audit.updateRule === null
      && audit.deleteRule === null
      && devices.fields.getByName("device_digest").hidden === true
      && !!audit.fields.getByName("target_user_email_snapshot");
  } catch (_) {
    return false;
  }
}

function logFailure(operation) {
  try {
    $app.logger().error("PowerZona store user device operation failed safely.", "operation", operation);
  } catch (_) {}
}

function throwAuthError(code) {
  const safeCode = AUTH_MESSAGES[code] ? code : "device_authorization_unavailable";
  throw new BadRequestError(AUTH_MESSAGES[safeCode], {
    [safeCode]: new ValidationError(safeCode, AUTH_MESSAGES[safeCode]),
  });
}

function enforceLoginDevice(e) {
  const user = e && e.record;
  if (!user) throwAuthError("device_authorization_unavailable");
  if (recordString(user, "status") === "suspended") throw new BadRequestError("Failed to authenticate.");
  const role = recordString(user, "role");
  if (role === "master_admin") return;
  if (!STORE_ROLES.includes(role)) throwAuthError("device_authorization_unavailable");
  const info = e.requestInfo();
  const rawToken = headerValue(info, DEVICE_HEADER, e.request);
  const userAgent = originalUserAgent(e, info);
  scrubRequestUserAgent(e, info);
  if (!isValidDeviceToken(rawToken)) throwAuthError("device_required");
  if (!deviceManagementReady($app)) throwAuthError("device_authorization_unavailable");
  try {
    authorizeDeviceForLogin($app, user.id, rawToken, userAgent);
  } catch (error) {
    const code = errorCode(error);
    if (AUTH_MESSAGES[code]) throwAuthError(code);
    logFailure("login_authorize");
    throwAuthError("device_authorization_unavailable");
  }
}

function enforceRefreshDevice(e) {
  const user = e && e.record;
  if (!user) throwAuthError("device_authorization_unavailable");
  if (recordString(user, "status") === "suspended") throw new BadRequestError("Failed to authenticate.");
  const role = recordString(user, "role");
  if (role === "master_admin") return;
  if (!STORE_ROLES.includes(role)) throwAuthError("device_authorization_unavailable");
  const info = e.requestInfo();
  const rawToken = headerValue(info, DEVICE_HEADER, e.request);
  scrubRequestUserAgent(e, info);
  if (!isValidDeviceToken(rawToken)) throwAuthError("device_required");
  if (!deviceManagementReady($app)) throwAuthError("device_authorization_unavailable");
  try {
    verifyDeviceForRefresh($app, user, rawToken);
  } catch (error) {
    const code = errorCode(error);
    if (AUTH_MESSAGES[code]) throwAuthError(code);
    logFailure("refresh_verify");
    throwAuthError("device_authorization_unavailable");
  }
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function valid(value) {
  return { ok: true, value };
}

function invalid(error) {
  return { ok: false, error };
}

function parseListPayload(body) {
  if (!exactPayload(body, ["store_id", "user_id", "page", "per_page", "status"])) {
    return invalid("invalid_payload");
  }
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const page = bodyValue(body, "page");
  const perPage = bodyValue(body, "per_page");
  const status = bodyValue(body, "status");
  if (!isValidRecordId(storeId) || !isValidRecordId(userId)) return invalid("invalid_payload");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 50) {
    return invalid("invalid_payload");
  }
  if (!["all", ...DEVICE_STATUSES].includes(status)) return invalid("invalid_payload");
  return valid({ storeId, userId, page, perPage, status });
}

function parseRevokePayload(body) {
  if (!exactPayload(body, ["store_id", "user_id", "device_id", "reason"])) {
    return invalid("invalid_payload");
  }
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const deviceId = bodyValue(body, "device_id");
  const reason = bodyValue(body, "reason");
  if (![storeId, userId, deviceId].every(isValidRecordId)) return invalid("invalid_payload");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500) return invalid("invalid_payload");
  return valid({ storeId, userId, deviceId, reason: reason.trim() });
}

function parseAuditPayload(body) {
  if (!exactPayload(body, ["store_id", "user_id", "page", "per_page"])) {
    return invalid("invalid_payload");
  }
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const page = bodyValue(body, "page");
  const perPage = bodyValue(body, "per_page");
  if (!isValidRecordId(storeId) || !isValidRecordId(userId)) return invalid("invalid_payload");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 50) {
    return invalid("invalid_payload");
  }
  return valid({ storeId, userId, page, perPage });
}

function targetBelongsToStore(record, storeId) {
  return !!record && relationId(record, "store") === storeId && isStoreRole(recordString(record, "role"));
}

function requestContext(e, parser) {
  setPrivateHeaders(e);
  const info = e.requestInfo();
  if (!isActiveMaster(info && info.auth)) return { error: "unauthorized" };
  const parsed = parser(info.body || {});
  if (!parsed.ok) return { error: parsed.error };
  if (!deviceManagementReady($app)) return { error: "device_authorization_unavailable" };
  const actorId = String(info.auth.id || recordString(info.auth, "id"));
  return isValidRecordId(actorId) ? { actorId, parsed: parsed.value } : { error: "unauthorized" };
}

function loadMasterTarget(app, actorId, storeId, userId) {
  lockStore(app, storeId);
  const actor = findRecord(app, "users", actorId);
  if (!actor || !isActiveMaster(actor)) throw codedError("unauthorized");
  const store = findRecord(app, "stores", storeId);
  if (!store) throw codedError("store_not_found");
  const user = findRecord(app, "users", userId);
  if (!targetBelongsToStore(user, store.id)) throw codedError("user_not_found");
  return { actor, store, user };
}

function storeResponse(store) {
  return {
    id: String(store.id || recordString(store, "id")).slice(0, 15),
    name: bounded(recordString(store, "name"), 140),
    slug: bounded(recordString(store, "slug"), 80),
  };
}

function userResponse(user) {
  return {
    id: String(user.id || recordString(user, "id")).slice(0, 15),
    email: bounded(recordString(user, "email").toLowerCase(), 254),
    display_name: bounded(recordString(user, "display_name"), 140),
    role: isStoreRole(recordString(user, "role")) ? recordString(user, "role") : "",
    status: ["active", "suspended"].includes(recordString(user, "status")) ? recordString(user, "status") : "",
  };
}

function mapDevice(record) {
  const type = recordString(record, "device_type");
  const status = recordString(record, "status");
  return {
    id: String(record.id || recordString(record, "id")).slice(0, 15),
    label: bounded(recordString(record, "label"), 120),
    browser_name: bounded(recordString(record, "browser_name"), 40),
    os_name: bounded(recordString(record, "os_name"), 40),
    device_type: DEVICE_TYPES.includes(type) ? type : "unknown",
    status: DEVICE_STATUSES.includes(status) ? status : "revoked",
    first_seen_at: safeIsoDate(recordString(record, "first_seen_at")),
    last_seen_at: safeIsoDate(recordString(record, "last_seen_at")),
    revoked_at: safeIsoDate(recordString(record, "revoked_at")),
  };
}

function mapAudit(record) {
  const type = recordString(record, "device_type_snapshot");
  const action = recordString(record, "action");
  return {
    id: String(record.id || recordString(record, "id")).slice(0, 15),
    action: AUDIT_ACTIONS.includes(action) ? action : "",
    device_id: bounded(recordString(record, "device_id_snapshot"), 15),
    device_label: bounded(recordString(record, "device_label_snapshot"), 120),
    browser_name: bounded(recordString(record, "browser_snapshot"), 40),
    os_name: bounded(recordString(record, "os_snapshot"), 40),
    device_type: DEVICE_TYPES.includes(type) ? type : "unknown",
    actor_name: bounded(recordString(record, "actor_name_snapshot"), 160),
    actor_role: bounded(recordString(record, "actor_role_snapshot"), 40),
    sessions_revoked: recordValue(record, "sessions_revoked") === true,
    reason: bounded(recordString(record, "reason"), 500),
    created: safeIsoDate(recordString(record, "created")),
  };
}

function limitsResponse(app, store, user) {
  const authorizedForUser = authorizedUserDeviceCount(app, user.id);
  const distinctForStore = distinctAuthorizedStoreDeviceCount(app, store.id);
  const userAccess = capabilityAccess(store, "max_devices_per_user");
  const storeAccess = capabilityAccess(store, "max_store_devices");
  return {
    authorized_for_user: authorizedForUser,
    user_limit: userAccess.limit,
    distinct_authorized_for_store: distinctForStore,
    store_limit: storeAccess.limit,
  };
}

function statusForCode(code) {
  if (code === "unauthorized") return 403;
  if (["store_not_found", "user_not_found", "device_not_found"].includes(code)) return 404;
  if (["user_device_limit_reached", "store_device_limit_reached", "device_revoked"].includes(code)) return 409;
  if (code === "invalid_payload" || code === "device_required") return 400;
  if (code === "device_authorization_unavailable") return 503;
  return 500;
}

function sendError(e, code, fallback) {
  const safeCode = SAFE_CODES.has(code) ? code : fallback;
  return e.json(statusForCode(safeCode), { ok: false, error: safeCode });
}

function handleList(e) {
  const context = requestContext(e, parseListPayload);
  if (context.error) return sendError(e, context.error, "device_list_failed");
  try {
    const store = findRecord($app, "stores", context.parsed.storeId);
    if (!store) return sendError(e, "store_not_found", "device_list_failed");
    const user = findRecord($app, "users", context.parsed.userId);
    if (!targetBelongsToStore(user, store.id)) return sendError(e, "user_not_found", "device_list_failed");
    const sqlStatusFilter = context.parsed.status === "all" ? "" : " AND status = {:status}";
    const recordStatusFilter = context.parsed.status === "all" ? "" : " && status = {:status}";
    const params = { storeId: store.id, userId: user.id, status: context.parsed.status };
    const totalRow = queryOne($app, `
      SELECT COUNT(*) AS totalItems FROM store_user_devices
      WHERE store = {:storeId} AND user = {:userId}${sqlStatusFilter}
    `, params, { totalItems: 0 }) || {};
    const offset = (context.parsed.page - 1) * context.parsed.perPage;
    const records = $app.findRecordsByFilter(
      DEVICE_COLLECTION,
      `store = {:storeId} && user = {:userId}${recordStatusFilter}`,
      "-last_seen_at,-created,-id",
      context.parsed.perPage,
      offset,
      params
    ) || [];
    const totalItems = nonNegativeInteger(totalRow.totalItems);
    return e.json(200, {
      ok: true,
      store: storeResponse(store),
      user: userResponse(user),
      devices: records.map(mapDevice),
      ...limitsResponse($app, store, user),
      pagination: {
        page: context.parsed.page,
        per_page: context.parsed.perPage,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / context.parsed.perPage)),
      },
    });
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "device_list_failed");
    logFailure("master_list");
    return sendError(e, "", "device_list_failed");
  }
}

function handleRevoke(e) {
  const context = requestContext(e, parseRevokePayload);
  if (context.error) return sendError(e, context.error, "device_revocation_failed");
  let response = null;
  try {
    $app.runInTransaction((txApp) => {
      const loaded = loadMasterTarget(
        txApp,
        context.actorId,
        context.parsed.storeId,
        context.parsed.userId
      );
      const device = findRecord(txApp, DEVICE_COLLECTION, context.parsed.deviceId);
      if (!device
        || relationId(device, "store") !== loaded.store.id
        || relationId(device, "user") !== loaded.user.id) {
        throw codedError("device_not_found");
      }
      if (recordString(device, "status") === "revoked") {
        response = {
          ok: true,
          device: mapDevice(device),
          already_revoked: true,
          sessions_revoked_for_user: false,
        };
        return;
      }
      if (recordString(device, "status") !== "authorized") throw codedError("device_revocation_failed");
      const now = new Date().toISOString();
      device.set("status", "revoked");
      device.set("revoked_at", now);
      device.set("revoked_by", loaded.actor.id);
      device.set("revoke_reason", context.parsed.reason);
      loaded.user.refreshTokenKey();
      try {
        txApp.save(loaded.user);
        txApp.save(device);
        createAudit(
          txApp,
          loaded.store,
          loaded.user,
          device,
          loaded.actor,
          "device_revoked",
          true,
          context.parsed.reason
        );
      } catch (_) {
        throw codedError("device_revocation_failed");
      }
      response = {
        ok: true,
        device: mapDevice(device),
        already_revoked: false,
        sessions_revoked_for_user: true,
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "device_revocation_failed");
    logFailure("master_revoke");
    return sendError(e, "", "device_revocation_failed");
  }
}

function handleAudit(e) {
  const context = requestContext(e, parseAuditPayload);
  if (context.error) return sendError(e, context.error, "audit_load_failed");
  try {
    const store = findRecord($app, "stores", context.parsed.storeId);
    if (!store) return sendError(e, "store_not_found", "audit_load_failed");
    const user = findRecord($app, "users", context.parsed.userId);
    if (!targetBelongsToStore(user, store.id)) return sendError(e, "user_not_found", "audit_load_failed");
    const totalRow = queryOne($app, `
      SELECT COUNT(*) AS totalItems FROM store_user_device_audit
      WHERE store = {:storeId} AND target_user = {:userId}
    `, { storeId: store.id, userId: user.id }, { totalItems: 0 }) || {};
    const offset = (context.parsed.page - 1) * context.parsed.perPage;
    const records = $app.findRecordsByFilter(
      AUDIT_COLLECTION,
      "store = {:storeId} && target_user = {:userId}",
      "-created,-id",
      context.parsed.perPage,
      offset,
      { storeId: store.id, userId: user.id }
    ) || [];
    const totalItems = nonNegativeInteger(totalRow.totalItems);
    return e.json(200, {
      ok: true,
      store: storeResponse(store),
      user: userResponse(user),
      audit: records.map(mapAudit),
      pagination: {
        page: context.parsed.page,
        per_page: context.parsed.perPage,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / context.parsed.perPage)),
      },
    });
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "audit_load_failed");
    logFailure("master_audit");
    return sendError(e, "", "audit_load_failed");
  }
}

module.exports = {
  AUDIT_ACTIONS,
  AUTH_MESSAGES,
  DEVICE_COLLECTION,
  DEVICE_HEADER,
  DEVICE_STATUSES,
  DEVICE_TOKEN_PATTERN,
  DEVICE_TYPES,
  DIGEST_DOMAIN,
  DIGEST_VERSION,
  LAST_SEEN_THROTTLE_MS,
  STORE_ROLES,
  actorSnapshot,
  authorizeDeviceForLogin,
  buildAuditValues,
  capabilityAccess,
  captureAndScrubAuthUserAgent,
  distinctAuthorizedStoreDeviceCount,
  enforceLoginDevice,
  enforceRefreshDevice,
  evaluateNewDeviceCapacity,
  exactPayload,
  handleAudit,
  handleList,
  handleRevoke,
  hashDeviceToken,
  isActiveMaster,
  isActiveStoreUser,
  isDigestAuthorizedForStore,
  isStoreRole,
  isValidDeviceToken,
  isValidRecordId,
  mapAudit,
  mapDevice,
  normalizeUserAgent,
  originalUserAgent,
  parseAuditPayload,
  parseListPayload,
  parseRevokePayload,
  requireAuthenticatedUser,
  shouldTouchLastSeen,
  scrubRequestUserAgent,
  targetBelongsToStore,
  verifyDeviceForRefresh,
};
