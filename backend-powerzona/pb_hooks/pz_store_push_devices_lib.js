/// <reference path="../pb_data/types.d.ts" />

const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);

const COLLECTION = "store_push_devices";
const INSTALLATION_DOMAIN = "pz_admin_push_fid:v1|";
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const APP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const STORE_ROLES = Object.freeze(["store_admin", "store_staff"]);
const SAFE_ERRORS = new Set([
  "unauthorized",
  "permission_denied",
  "invalid_payload",
  "store_not_found",
  "registration_unavailable",
]);

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") {
    try {
      const value = body.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
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

function valid(value) {
  return { ok: true, value };
}

function invalid(error) {
  return { ok: false, error };
}

function isValidInstallationId(value) {
  return typeof value === "string" && INSTALLATION_ID_PATTERN.test(value);
}

function isValidAppId(value) {
  return typeof value === "string" && value.length <= 190 && APP_ID_PATTERN.test(value);
}

function parseRegisterPayload(body) {
  const fields = ["installation_id", "app_id", "device_label", "os_version", "app_version"];
  if (!exactPayload(body, fields)) return invalid("invalid_payload");
  const installationId = bodyValue(body, "installation_id");
  const appId = bodyValue(body, "app_id");
  const deviceLabel = bodyValue(body, "device_label");
  const osVersion = bodyValue(body, "os_version");
  const appVersion = bodyValue(body, "app_version");
  if (!isValidInstallationId(installationId) || !isValidAppId(appId)) return invalid("invalid_payload");
  if ([deviceLabel, osVersion, appVersion].some((value) => typeof value !== "string")) return invalid("invalid_payload");
  if (deviceLabel.length > 120 || osVersion.length > 40 || appVersion.length > 40) return invalid("invalid_payload");
  return valid({
    installationId,
    appId,
    deviceLabel: deviceLabel.trim(),
    osVersion: osVersion.trim(),
    appVersion: appVersion.trim(),
  });
}

function parseDisablePayload(body) {
  if (!exactPayload(body, ["installation_id", "app_id"])) return invalid("invalid_payload");
  const installationId = bodyValue(body, "installation_id");
  const appId = bodyValue(body, "app_id");
  if (!isValidInstallationId(installationId) || !isValidAppId(appId)) return invalid("invalid_payload");
  return valid({ installationId, appId });
}

function hashInstallationId(value, sha256) {
  if (!isValidInstallationId(value)) throw codedError("invalid_payload");
  const digest = typeof sha256 === "function"
    ? sha256(INSTALLATION_DOMAIN + value)
    : (typeof $security !== "undefined" ? $security.sha256(INSTALLATION_DOMAIN + value) : "");
  const normalized = String(digest || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw codedError("registration_unavailable");
  return normalized;
}

function isActiveStoreUser(record) {
  return !!record
    && STORE_ROLES.includes(recordString(record, "role"))
    && recordString(record, "status") === "active"
    && !!relationId(record, "store");
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function codedError(code) {
  const safe = SAFE_ERRORS.has(code) ? code : "registration_unavailable";
  const error = new Error(safe);
  error.code = safe;
  return error;
}

function errorCode(error) {
  const value = String(error && (error.code || error.message) || "");
  return SAFE_ERRORS.has(value) ? value : "registration_unavailable";
}

function statusForError(code) {
  if (["unauthorized", "permission_denied"].includes(code)) return 403;
  if (code === "store_not_found") return 404;
  if (code === "invalid_payload") return 400;
  return 503;
}

function sendError(e, code) {
  return e.json(statusForError(code), { ok: false, error: code });
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function requestContext(e, parser) {
  setPrivateHeaders(e);
  const info = e.requestInfo();
  const auth = (info && info.auth) || e.auth;
  if (!isActiveStoreUser(auth)) return { error: "unauthorized" };
  const parsed = parser((info && info.body) || {});
  if (!parsed.ok) return { error: parsed.error };
  const store = findRecord($app, "stores", relationId(auth, "store"));
  if (!store) return { error: "store_not_found" };
  if (!permissions.hasStorePermission($app, auth, store, "notifications.view")) {
    return { error: "permission_denied" };
  }
  return { auth, store, parsed: parsed.value };
}

function findDevice(app, digest) {
  try {
    return app.findFirstRecordByFilter(COLLECTION, "installation_digest = {:digest}", { digest });
  } catch (_) {
    return null;
  }
}

function mapDevice(record) {
  return {
    id: String(record.id || recordString(record, "id")).slice(0, 15),
    status: recordString(record, "status"),
    app_id: bounded(recordString(record, "app_id"), 190),
    last_seen_at: bounded(recordString(record, "last_seen_at"), 40),
  };
}

function handleRegister(e) {
  const context = requestContext(e, parseRegisterPayload);
  if (context.error) return sendError(e, context.error);
  try {
    const digest = hashInstallationId(context.parsed.installationId);
    let device = findDevice($app, digest);
    if (!device) device = new Record($app.findCollectionByNameOrId(COLLECTION), {});
    const now = new Date().toISOString();
    device.set("store", context.store.id);
    device.set("user", context.auth.id || recordString(context.auth, "id"));
    device.set("installation_id", context.parsed.installationId);
    device.set("installation_digest", digest);
    device.set("app_id", context.parsed.appId);
    device.set("platform", "android");
    device.set("status", "active");
    device.set("device_label", context.parsed.deviceLabel);
    device.set("os_version", context.parsed.osVersion);
    device.set("app_version", context.parsed.appVersion);
    device.set("last_seen_at", now);
    device.set("disabled_at", "");
    $app.save(device);
    return e.json(200, { ok: true, device: mapDevice(device) });
  } catch (error) {
    return sendError(e, errorCode(error));
  }
}

function handleDisable(e) {
  const context = requestContext(e, parseDisablePayload);
  if (context.error) return sendError(e, context.error);
  try {
    const digest = hashInstallationId(context.parsed.installationId);
    const device = findDevice($app, digest);
    if (!device
      || relationId(device, "user") !== String(context.auth.id || recordString(context.auth, "id"))
      || recordString(device, "app_id") !== context.parsed.appId) {
      return e.json(200, { ok: true, disabled: false });
    }
    device.set("status", "disabled");
    device.set("disabled_at", new Date().toISOString());
    $app.save(device);
    return e.json(200, { ok: true, disabled: true });
  } catch (error) {
    return sendError(e, errorCode(error));
  }
}

module.exports = {
  APP_ID_PATTERN,
  COLLECTION,
  INSTALLATION_DOMAIN,
  INSTALLATION_ID_PATTERN,
  handleDisable,
  handleRegister,
  hashInstallationId,
  isActiveStoreUser,
  isValidAppId,
  isValidInstallationId,
  parseDisablePayload,
  parseRegisterPayload,
  requireAuthenticatedUser,
};
