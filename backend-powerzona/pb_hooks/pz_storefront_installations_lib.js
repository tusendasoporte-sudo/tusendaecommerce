/// <reference path="../pb_data/types.d.ts" />

"use strict";

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const schema = typeof __hooks === "undefined"
  ? require("./pz_storefront_push_schema_lib.js")
  : require(`${__hooks}/pz_storefront_push_schema_lib.js`);
const secretContract = typeof __hooks === "undefined"
  ? require("./pz_security_secret_contract.js")
  : require(`${__hooks}/pz_security_secret_contract.js`);

const APP_CONFIGS_COLLECTION = "storefront_app_configs";
const INSTALLATIONS_COLLECTION = "storefront_installations";
const WEB_SESSIONS_COLLECTION = "storefront_web_sessions";
const CAMPAIGNS_COLLECTION = "push_campaigns";
const DELIVERIES_COLLECTION = "push_campaign_deliveries";
const ORDER_LINKS_COLLECTION = "storefront_order_links";
const INTERNAL_SECRET_ENV = "PZ_STOREFRONT_INTERNAL_SECRET";
const CREDENTIAL_SECRET_ENV = "PZ_STOREFRONT_CREDENTIAL_SECRET";
const INTERNAL_HEADERS = Object.freeze({
  secret: "X-PZ-Storefront-Internal",
  timestamp: "X-PZ-Storefront-Timestamp",
  nonce: "X-PZ-Storefront-Nonce",
  signature: "X-PZ-Storefront-Signature",
});
const INTERNAL_CLOCK_SKEW_SECONDS = 90;
const INTERNAL_NONCE_TTL_MS = 120000;
const RATE_WINDOW_MS = 60000;
const RATE_BUCKET_LIMIT = 20000;
const APP_ID_PATTERN = /^[^\s\u0000-\u001f\u007f]{1,255}$/;
const FID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const CREDENTIAL_PATTERN = /^pzs_v1_[a-f0-9]{64}$/;
const BOOTSTRAP_CODE_PATTERN = /^pzb_v1_[A-Za-z0-9]{48}$/;
const SESSION_TOKEN_PATTERN = /^pzws_v1_[A-Za-z0-9]{64}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const RECEIPT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;
const STOREFRONT_EVENT_PATH_PATTERN = /^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*)?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%\/?-]*)?$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+()-]{0,39}$/;
const ANDROID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._+()-]{0,39}$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,3}$/;
const TIMEZONE_PATTERN = /^(?:UTC|GMT|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,3})$/;
const PERMISSION_STATES = Object.freeze(["unknown", "granted", "denied"]);
const SESSION_BOOTSTRAP_SECONDS = 60;
const SESSION_ACTIVE_SECONDS = 86400;
const IP_RETENTION_DAYS = schema.RETENTION_POLICY.installation_full_ip_days;
const SESSION_RETENTION_DAYS = schema.RETENTION_POLICY.web_session_days_after_expiration;
const ACTION_LIMITS = Object.freeze({
  installations_register: 12,
  installations_heartbeat: 60,
  installations_permission: 30,
  installations_disable: 12,
  session_bootstrap: 12,
  session_consume: 24,
  campaigns_resolve_target: 30,
  events_record: 120,
});
const SAFE_ERRORS = new Set([
  "unauthorized",
  "invalid_payload",
  "invalid_credential",
  "credential_required",
  "app_not_available",
  "store_not_available",
  "plan_not_available",
  "installation_disabled",
  "installation_not_available",
  "client_ip_unavailable",
  "rate_limited",
  "bootstrap_not_found",
  "target_not_available",
  "delivery_not_eligible",
  "event_window_expired",
  "destination_not_verified",
  "storefront_secrets_unavailable",
  "registration_unavailable",
  "request_unavailable",
]);

const internalNonces = new Map();
const rateBuckets = new Map();
let maintenanceOperations = 0;

class StorefrontInstallationError extends Error {
  constructor(code) {
    const safe = SAFE_ERRORS.has(code) ? code : "request_unavailable";
    super(safe);
    this.name = "StorefrontInstallationError";
    this.code = safe;
  }
}

function safeText(value) {
  try { return String(value === null || value === undefined ? "" : value).trim(); } catch (_) { return ""; }
}

function recordValue(record, key) {
  if (!record) return undefined;
  try { if (typeof record.get === "function") return record.get(key); } catch (_) {}
  try { if (typeof record.getString === "function") return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key) {
  return safeText(recordValue(record, key));
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return safeText(value[0]);
  if (value && typeof value === "object") return safeText(value.id);
  return safeText(value);
}

function bodyValue(body, key) {
  if (!body) return undefined;
  try {
    if (typeof body.get === "function") {
      const value = body.get(key);
      if (value !== undefined) return value;
    }
  } catch (_) {}
  return body[key];
}

function exactPayload(body, allowedKeys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = allowedKeys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedText(value, max, pattern) {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > max) return "";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "";
  return !pattern || pattern.test(value) ? value : "";
}

function validVersionCode(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2147483647;
}

function normalizedDigest(value) {
  const digest = safeText(value).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new StorefrontInstallationError("storefront_secrets_unavailable");
  return digest;
}

function environmentValue(name) {
  try { return safeText($os.getenv(name)); } catch (_) { return ""; }
}

function defaultSecurity() {
  if (typeof $security === "undefined") throw new StorefrontInstallationError("storefront_secrets_unavailable");
  return $security;
}

function secretEqual(left, right, security) {
  if (!left || !right) return false;
  const api = security || defaultSecurity();
  try {
    return api.equal(api.sha256(String(left)), api.sha256(String(right)));
  } catch (_) {
    return false;
  }
}

function validSecret(secret, compared, security) {
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 512) return false;
  return (compared || []).filter(Boolean).every((candidate) => !secretEqual(secret, candidate, security));
}

function getInternalSecret(security) {
  const secret = environmentValue(INTERNAL_SECRET_ENV);
  return validSecret(secret, [
    environmentValue("PZ_PUSH_RELAY_SECRET"),
    environmentValue("PZ_SECURITY_HMAC_SECRET"),
  ], security) ? secret : "";
}

function getCredentialSecret(security) {
  const internal = environmentValue(INTERNAL_SECRET_ENV);
  const secret = environmentValue(CREDENTIAL_SECRET_ENV);
  return validSecret(secret, [
    internal,
    environmentValue("PZ_PUSH_RELAY_SECRET"),
    environmentValue("PZ_SECURITY_HMAC_SECRET"),
    environmentValue("PZ_SECURITY_AES_KEY"),
  ], security) ? secret : "";
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new StorefrontInstallationError("invalid_payload");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new StorefrontInstallationError("invalid_payload");
  const pairs = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${pairs.join(",")}}`;
}

function requestHeader(e, info, name) {
  try {
    if (e && e.request && e.request.header && typeof e.request.header.get === "function") {
      const direct = safeText(e.request.header.get(name));
      if (direct) return direct;
    }
  } catch (_) {}
  const headers = info && info.headers;
  if (!headers || typeof headers !== "object") return "";
  const expected = name.toLowerCase().replace(/-/g, "_");
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase().replace(/-/g, "_") === expected);
  return key ? safeText(headers[key]) : "";
}

function normalizeIpv4(value) {
  const parts = safeText(value).split(".");
  if (parts.length !== 4) return "";
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return "";
    const number = Number(part);
    if (!Number.isInteger(number) || number < 0 || number > 255) return "";
    octets.push(String(number));
  }
  return octets.join(".");
}

function normalizeIp(value) {
  const candidate = safeText(value);
  if (!candidate || candidate.length > 64) return "";
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate)) return normalizeIpv4(candidate);
  if (!candidate.includes(":") || !/^[0-9a-fA-F:]+$/.test(candidate)) return "";
  if ((candidate.match(/::/g) || []).length > 1) return "";
  const sides = candidate.toLowerCase().split("::");
  const left = sides[0] ? sides[0].split(":") : [];
  const right = sides.length === 2 && sides[1] ? sides[1].split(":") : [];
  if (left.concat(right).some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return "";
  const missing = 8 - left.length - right.length;
  if ((sides.length === 1 && missing !== 0) || (sides.length === 2 && missing < 1)) return "";
  const groups = left.concat(Array(Math.max(0, missing)).fill("0"), right);
  return groups.length === 8 ? groups.map((group) => (`0000${group}`).slice(-4)).join(":") : "";
}

function parseClient(value) {
  if (!exactPayload(value, ["ip", "country_code", "region_code"])) return null;
  const rawIp = bodyValue(value, "ip");
  const country = bodyValue(value, "country_code");
  const region = bodyValue(value, "region_code");
  if (typeof rawIp !== "string" || typeof country !== "string" || typeof region !== "string") return null;
  const ip = rawIp ? normalizeIp(rawIp) : "";
  if (rawIp && !ip) return null;
  if (country && !/^[A-Z]{2}$/.test(country)) return null;
  if (region && !/^[A-Za-z0-9._ -]{1,80}$/.test(region)) return null;
  return Object.freeze({ ip, countryCode: country, regionCode: region });
}

function parseRegisterPayload(value) {
  const fields = [
    "fid", "app_version", "app_version_code", "android_version", "device_model",
    "locale", "timezone", "notification_permission",
  ];
  if (!exactPayload(value, fields)) return null;
  const fid = boundedText(bodyValue(value, "fid"), 255, FID_PATTERN);
  const appVersion = boundedText(bodyValue(value, "app_version"), 40, VERSION_PATTERN);
  const versionCode = bodyValue(value, "app_version_code");
  const androidVersion = boundedText(bodyValue(value, "android_version"), 40, ANDROID_PATTERN);
  const deviceModel = boundedText(bodyValue(value, "device_model"), 120);
  const locale = boundedText(bodyValue(value, "locale"), 35, LOCALE_PATTERN);
  const timezone = boundedText(bodyValue(value, "timezone"), 80, TIMEZONE_PATTERN);
  const notificationPermission = safeText(bodyValue(value, "notification_permission"));
  if (!fid || !appVersion || !validVersionCode(versionCode) || !androidVersion || !deviceModel
    || !locale || !timezone || !PERMISSION_STATES.includes(notificationPermission)) return null;
  return Object.freeze({
    fid, appVersion, versionCode, androidVersion, deviceModel, locale, timezone, notificationPermission,
  });
}

function parseHeartbeatPayload(value) {
  const fields = ["app_version", "app_version_code", "android_version", "device_model", "locale", "timezone"];
  if (!exactPayload(value, fields)) return null;
  const parsed = parseRegisterPayload({
    fid: "abcdefghijklmnop",
    app_version: bodyValue(value, "app_version"),
    app_version_code: bodyValue(value, "app_version_code"),
    android_version: bodyValue(value, "android_version"),
    device_model: bodyValue(value, "device_model"),
    locale: bodyValue(value, "locale"),
    timezone: bodyValue(value, "timezone"),
    notification_permission: "unknown",
  });
  if (!parsed) return null;
  return Object.freeze({
    appVersion: parsed.appVersion,
    versionCode: parsed.versionCode,
    androidVersion: parsed.androidVersion,
    deviceModel: parsed.deviceModel,
    locale: parsed.locale,
    timezone: parsed.timezone,
  });
}

function parsePermissionPayload(value) {
  if (!exactPayload(value, ["notification_permission"])) return null;
  const notificationPermission = safeText(bodyValue(value, "notification_permission"));
  return PERMISSION_STATES.includes(notificationPermission)
    ? Object.freeze({ notificationPermission })
    : null;
}

function parseEmptyPayload(value) {
  return exactPayload(value, []) ? Object.freeze({}) : null;
}

function parseBootstrapConsumePayload(value) {
  if (!exactPayload(value, ["code"])) return null;
  const code = safeText(bodyValue(value, "code"));
  return BOOTSTRAP_CODE_PATTERN.test(code) ? Object.freeze({ code }) : null;
}

function parseCampaignResolvePayload(value) {
  if (!exactPayload(value, ["campaign_id"])) return null;
  const campaignId = safeText(bodyValue(value, "campaign_id"));
  return RECORD_ID_PATTERN.test(campaignId) ? Object.freeze({ campaignId }) : null;
}

function parseEventPayload(value) {
  const fields = ["delivery_id", "event_type", "idempotency_key", "occurred_at", "target_path"];
  if (!exactPayload(value, fields)) return null;
  const deliveryId = safeText(bodyValue(value, "delivery_id"));
  const eventType = safeText(bodyValue(value, "event_type"));
  const idempotencyKey = safeText(bodyValue(value, "idempotency_key"));
  const occurredAtRaw = safeText(bodyValue(value, "occurred_at"));
  const occurredAt = new Date(occurredAtRaw);
  const rawTargetPath = bodyValue(value, "target_path");
  const targetPath = typeof rawTargetPath === "string" ? rawTargetPath : null;
  if (!RECORD_ID_PATTERN.test(deliveryId)
    || !["opened", "destination_viewed"].includes(eventType)
    || idempotencyKey !== `${eventType}:${deliveryId}`
    || !Number.isFinite(occurredAt.getTime())
    || targetPath === null || targetPath !== targetPath.trim() || targetPath.length > 500
    || (eventType === "opened" && targetPath !== "")
    || (eventType === "destination_viewed"
      && !(STOREFRONT_EVENT_PATH_PATTERN.test(targetPath)
        || targetPath === "__order_verified__"))) return null;
  return Object.freeze({
    deliveryId,
    eventType,
    idempotencyKey,
    clientOccurredAt: occurredAt.toISOString(),
    targetPath,
  });
}

function parseEnvelope(body, action) {
  if (!exactPayload(body, ["app_id", "credential", "client", "payload"])) return null;
  const appId = bodyValue(body, "app_id");
  const credential = bodyValue(body, "credential");
  if (typeof appId !== "string" || typeof credential !== "string") return null;
  if (action === "session_consume") {
    if (appId || credential) return null;
  } else {
    if (!APP_ID_PATTERN.test(appId)) return null;
    if (credential && !CREDENTIAL_PATTERN.test(credential)) return null;
  }
  const client = parseClient(bodyValue(body, "client"));
  if (!client) return null;
  let payload = null;
  if (action === "installations_register") payload = parseRegisterPayload(bodyValue(body, "payload"));
  else if (action === "installations_heartbeat") payload = parseHeartbeatPayload(bodyValue(body, "payload"));
  else if (action === "installations_permission") payload = parsePermissionPayload(bodyValue(body, "payload"));
  else if (action === "installations_disable" || action === "session_bootstrap") payload = parseEmptyPayload(bodyValue(body, "payload"));
  else if (action === "session_consume") payload = parseBootstrapConsumePayload(bodyValue(body, "payload"));
  else if (action === "campaigns_resolve_target") payload = parseCampaignResolvePayload(bodyValue(body, "payload"));
  else if (action === "events_record") payload = parseEventPayload(bodyValue(body, "payload"));
  if (!payload) return null;
  return Object.freeze({ appId, credential, client, payload });
}

function pruneMemory(nowMs) {
  maintenanceOperations += 1;
  if (maintenanceOperations % 128 !== 0 && internalNonces.size < RATE_BUCKET_LIMIT && rateBuckets.size < RATE_BUCKET_LIMIT) return;
  for (const [nonce, expiresAt] of internalNonces) if (expiresAt <= nowMs) internalNonces.delete(nonce);
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= nowMs) rateBuckets.delete(key);
  for (const collection of [internalNonces, rateBuckets]) {
    if (collection.size <= RATE_BUCKET_LIMIT) continue;
    let excess = collection.size - RATE_BUCKET_LIMIT;
    for (const key of collection.keys()) {
      collection.delete(key);
      excess -= 1;
      if (excess <= 0) break;
    }
  }
}

function authorizeInternalRequest(e, action, options) {
  const now = options && options.now instanceof Date ? options.now : new Date();
  const security = options && options.security ? options.security : defaultSecurity();
  const info = e.requestInfo();
  const parsed = parseEnvelope((info && info.body) || {}, action);
  if (!parsed) throw new StorefrontInstallationError("invalid_payload");

  const expectedSecret = options && options.internalSecret !== undefined
    ? options.internalSecret
    : getInternalSecret(security);
  const receivedSecret = requestHeader(e, info, INTERNAL_HEADERS.secret);
  if (!validSecret(expectedSecret, [], security) || !secretEqual(receivedSecret, expectedSecret, security)) {
    throw new StorefrontInstallationError("unauthorized");
  }
  const timestamp = requestHeader(e, info, INTERNAL_HEADERS.timestamp);
  const nonce = requestHeader(e, info, INTERNAL_HEADERS.nonce);
  const signature = requestHeader(e, info, INTERNAL_HEADERS.signature).toLowerCase();
  if (!/^\d{10}$/.test(timestamp)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)
    || !/^[a-f0-9]{64}$/.test(signature)) throw new StorefrontInstallationError("unauthorized");
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > INTERNAL_CLOCK_SKEW_SECONDS) {
    throw new StorefrontInstallationError("unauthorized");
  }
  const material = `${timestamp}\n${nonce}\n${action}\n${canonicalJson((info && info.body) || {})}`;
  const expectedSignature = normalizedDigest(security.hs256(material, expectedSecret));
  if (!secretEqual(signature, expectedSignature, security)) throw new StorefrontInstallationError("unauthorized");

  const nowMs = now.getTime();
  pruneMemory(nowMs);
  if (internalNonces.has(nonce)) throw new StorefrontInstallationError("unauthorized");
  internalNonces.set(nonce, nowMs + INTERNAL_NONCE_TTL_MS);
  return Object.freeze({ ...parsed, now, security });
}

function consumeRateLimit(action, context, credentialSecret) {
  const limit = ACTION_LIMITS[action];
  if (!limit) return false;
  const identityMaterial = action === "session_consume"
    ? context.payload.code
    : `${context.appId}|${context.client.ip}|${context.credential || context.payload.fid || "anonymous"}`;
  const key = normalizedDigest(context.security.hs256(`pz_storefront_rate:v1|${identityMaterial}`, credentialSecret));
  const nowMs = context.now.getTime();
  pruneMemory(nowMs);
  const current = rateBuckets.get(`${action}:${key}`);
  if (!current || current.resetAt <= nowMs) {
    rateBuckets.set(`${action}:${key}`, { count: 1, resetAt: nowMs + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function findById(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function resolveAppContext(app, appId, allowInactive) {
  const appConfig = findFirst(app, APP_CONFIGS_COLLECTION, "firebase_app_id = {:appId}", { appId });
  if (!appConfig || (!allowInactive && recordString(appConfig, "status") !== "active")) {
    throw new StorefrontInstallationError("app_not_available");
  }
  const storeId = relationId(appConfig, "store");
  const store = findById(app, "stores", storeId);
  if (!store || (!allowInactive && recordString(store, "status") !== "active")) {
    throw new StorefrontInstallationError("store_not_available");
  }
  return Object.freeze({ appConfig, store, storeId });
}

function requireRegistrationPlan(store, now) {
  const access = capabilities.resolveStoreCapabilityAccess(store, "push_campaigns_enabled", {
    enforceExpiration: true,
    now,
  });
  if (!access || !access.allowed) throw new StorefrontInstallationError("plan_not_available");
}

function fidDigest(appConfigId, fid, credentialSecret, security) {
  if (!FID_PATTERN.test(fid)) throw new StorefrontInstallationError("invalid_payload");
  return normalizedDigest(security.hs256(`pz_storefront_fid:v1|${appConfigId}|${fid}`, credentialSecret));
}

function credentialFor(appConfigId, fid, credentialSecret, security) {
  const material = `pz_storefront_credential:v1|${appConfigId}|${fid}`;
  return `pzs_v1_${normalizedDigest(security.hs256(material, credentialSecret))}`;
}

function credentialDigest(credential, credentialSecret, security) {
  if (!CREDENTIAL_PATTERN.test(credential)) throw new StorefrontInstallationError("invalid_credential");
  return normalizedDigest(security.hs256(`pz_storefront_credential_digest:v1|${credential}`, credentialSecret));
}

function sessionDigest(value, credentialSecret, security) {
  return normalizedDigest(security.hs256(`pz_storefront_session:v1|${value}`, credentialSecret));
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function setInstallationMetadata(record, parsed) {
  record.set("app_version", parsed.appVersion);
  record.set("app_version_code", parsed.versionCode);
  record.set("android_version", parsed.androidVersion);
  record.set("device_model", parsed.deviceModel);
  record.set("locale", parsed.locale);
  record.set("timezone", parsed.timezone);
}

function setInstallationIp(record, client, now, security, aesKeyOverride) {
  if (!client.ip) throw new StorefrontInstallationError("client_ip_unavailable");
  const aesKey = aesKeyOverride !== undefined ? aesKeyOverride : secretContract.getValidAesKey();
  if (!aesKey) throw new StorefrontInstallationError("storefront_secrets_unavailable");
  let encrypted = "";
  try { encrypted = safeText(security.encrypt(client.ip, aesKey)); } catch (_) {}
  if (!encrypted) throw new StorefrontInstallationError("storefront_secrets_unavailable");
  record.set("last_ip_encrypted", encrypted);
  record.set("ip_delete_after", addDays(now, IP_RETENTION_DAYS).toISOString());
  if (client.countryCode) record.set("country_code", client.countryCode);
  if (client.regionCode) record.set("region_code", client.regionCode);
}

function mapInstallation(record) {
  return Object.freeze({
    id: safeText(record.id || recordString(record, "id")).slice(0, 15),
    status: recordString(record, "status"),
    notification_permission: recordString(record, "notification_permission"),
    first_seen_at: recordString(record, "first_seen_at").slice(0, 40),
    last_seen_at: recordString(record, "last_seen_at").slice(0, 40),
  });
}

function registerInstallation(app, context, credentialSecret, aesKeyOverride) {
  const resolved = resolveAppContext(app, context.appId, false);
  requireRegistrationPlan(resolved.store, context.now);
  const appConfigId = safeText(resolved.appConfig.id || recordString(resolved.appConfig, "id"));
  const digest = fidDigest(appConfigId, context.payload.fid, credentialSecret, context.security);
  const nextCredential = credentialFor(appConfigId, context.payload.fid, credentialSecret, context.security);
  const nextCredentialDigest = credentialDigest(nextCredential, credentialSecret, context.security);
  const providedDigest = context.credential
    ? credentialDigest(context.credential, credentialSecret, context.security)
    : "";
  const existingByFid = findFirst(
    app,
    INSTALLATIONS_COLLECTION,
    "app_config = {:appConfig} && fid_digest = {:fidDigest}",
    { appConfig: appConfigId, fidDigest: digest },
  );
  const existingByCredential = providedDigest
    ? findFirst(app, INSTALLATIONS_COLLECTION, "credential_digest = {:credentialDigest}", { credentialDigest: providedDigest })
    : null;

  if (existingByCredential && relationId(existingByCredential, "app_config") !== appConfigId) {
    throw new StorefrontInstallationError("invalid_credential");
  }
  if (existingByFid && existingByCredential && safeText(existingByFid.id) !== safeText(existingByCredential.id)) {
    throw new StorefrontInstallationError("invalid_credential");
  }
  if (context.credential && !existingByCredential) throw new StorefrontInstallationError("invalid_credential");

  let installation = existingByFid || existingByCredential;
  const created = !installation;
  const rotated = Boolean(existingByCredential && recordString(existingByCredential, "fid_digest") !== digest);
  if (installation && ["disabled", "revoked"].includes(recordString(installation, "status"))) {
    throw new StorefrontInstallationError("installation_disabled");
  }
  if (!installation) installation = new Record(app.findCollectionByNameOrId(INSTALLATIONS_COLLECTION), {});

  const nowIso = context.now.toISOString();
  installation.set("store", resolved.storeId);
  installation.set("app_config", appConfigId);
  installation.set("fid", context.payload.fid);
  installation.set("fid_digest", digest);
  installation.set("credential_digest", nextCredentialDigest);
  installation.set("status", "active");
  installation.set("notification_permission", context.payload.notificationPermission);
  setInstallationMetadata(installation, context.payload);
  if (created || !recordString(installation, "first_seen_at")) installation.set("first_seen_at", nowIso);
  installation.set("last_seen_at", nowIso);
  installation.set("disabled_at", "");
  setInstallationIp(installation, context.client, context.now, context.security, aesKeyOverride);
  schema.assertTenantIsolation(app, INSTALLATIONS_COLLECTION, installation);
  app.save(installation);

  return Object.freeze({
    ok: true,
    created,
    fid_rotated: rotated,
    installation: mapInstallation(installation),
    credential: nextCredential,
  });
}

function resolveCredentialContext(app, context, credentialSecret, allowDisabled, allowInactiveApp) {
  if (!context.credential) throw new StorefrontInstallationError("credential_required");
  const resolved = resolveAppContext(app, context.appId, allowInactiveApp === true);
  const digest = credentialDigest(context.credential, credentialSecret, context.security);
  const installation = findFirst(
    app,
    INSTALLATIONS_COLLECTION,
    "credential_digest = {:credentialDigest}",
    { credentialDigest: digest },
  );
  const appConfigId = safeText(resolved.appConfig.id || recordString(resolved.appConfig, "id"));
  if (!installation
    || relationId(installation, "app_config") !== appConfigId
    || relationId(installation, "store") !== resolved.storeId) {
    throw new StorefrontInstallationError("invalid_credential");
  }
  const status = recordString(installation, "status");
  if (status !== "active" && !(allowDisabled && status === "disabled")) {
    throw new StorefrontInstallationError("installation_not_available");
  }
  return Object.freeze({ ...resolved, installation });
}

function heartbeatInstallation(app, context, credentialSecret, aesKeyOverride) {
  const resolved = resolveCredentialContext(app, context, credentialSecret, false, false);
  setInstallationMetadata(resolved.installation, context.payload);
  resolved.installation.set("last_seen_at", context.now.toISOString());
  setInstallationIp(resolved.installation, context.client, context.now, context.security, aesKeyOverride);
  app.save(resolved.installation);
  return Object.freeze({ ok: true, installation: mapInstallation(resolved.installation) });
}

function updateInstallationPermission(app, context, credentialSecret) {
  const resolved = resolveCredentialContext(app, context, credentialSecret, false, false);
  resolved.installation.set("notification_permission", context.payload.notificationPermission);
  resolved.installation.set("last_seen_at", context.now.toISOString());
  app.save(resolved.installation);
  return Object.freeze({ ok: true, installation: mapInstallation(resolved.installation) });
}

function disableInstallation(app, context, credentialSecret) {
  const resolved = resolveCredentialContext(app, context, credentialSecret, true, true);
  const alreadyDisabled = recordString(resolved.installation, "status") === "disabled";
  if (!alreadyDisabled) {
    resolved.installation.set("status", "disabled");
    resolved.installation.set("disabled_at", context.now.toISOString());
    resolved.installation.set("last_seen_at", context.now.toISOString());
    app.save(resolved.installation);
  }
  return Object.freeze({ ok: true, disabled: true, already_disabled: alreadyDisabled });
}

function resolveCampaignTarget(app, context, credentialSecret) {
  const resolved = resolveCredentialContext(app, context, credentialSecret, false, false);
  const campaignId = context.payload.campaignId;
  const installationId = safeText(resolved.installation.id || recordString(resolved.installation, "id"));
  const campaign = findById(app, CAMPAIGNS_COLLECTION, campaignId);
  if (!campaign
    || relationId(campaign, "store") !== resolved.storeId
    || recordString(campaign, "target_type") !== "order"
    || !["processing", "sent", "partially_sent"].includes(recordString(campaign, "status"))) {
    throw new StorefrontInstallationError("target_not_available");
  }

  const delivery = findFirst(
    app,
    DELIVERIES_COLLECTION,
    'store = {:store} && campaign = {:campaign} && installation = {:installation} && (status = "accepted" || status = "unknown")',
    { store: resolved.storeId, campaign: campaignId, installation: installationId },
  );
  const orderId = relationId(campaign, "target_order");
  const link = orderId ? findFirst(
    app,
    ORDER_LINKS_COLLECTION,
    'store = {:store} && installation = {:installation} && order = {:order} && status = "active"',
    { store: resolved.storeId, installation: installationId, order: orderId },
  ) : null;
  const order = orderId ? findById(app, "orders", orderId) : null;
  if (!delivery
    || !link
    || relationId(link, "store") !== resolved.storeId
    || relationId(link, "installation") !== installationId
    || relationId(link, "order") !== orderId
    || !order
    || relationId(order, "store") !== resolved.storeId) {
    throw new StorefrontInstallationError("target_not_available");
  }

  const orderNumber = recordString(order, "order_number");
  const receiptToken = recordString(order, "receipt_token");
  if (!ORDER_NUMBER_PATTERN.test(orderNumber) || !RECEIPT_TOKEN_PATTERN.test(receiptToken)) {
    throw new StorefrontInstallationError("target_not_available");
  }
  return Object.freeze({
    ok: true,
    target_type: "order",
    target_path: `/orden/${orderNumber}/${receiptToken}`,
  });
}

function randomAlphaNumeric(length, security) {
  const value = safeText(security.randomStringWithAlphabet(length, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"));
  if (value.length !== length || !/^[A-Za-z0-9]+$/.test(value)) {
    throw new StorefrontInstallationError("request_unavailable");
  }
  return value;
}

function revokePendingSessions(app, installationId, now) {
  let sessions = [];
  try {
    sessions = app.findRecordsByFilter(
      WEB_SESSIONS_COLLECTION,
      'installation = {:installation} && status = "pending"',
      "created",
      20,
      0,
      { installation: installationId },
    ) || [];
  } catch (_) {}
  for (const session of sessions) {
    session.set("status", "revoked");
    session.set("consumed_at", now.toISOString());
    app.save(session);
  }
}

function createBootstrapSession(app, context, credentialSecret) {
  const resolved = resolveCredentialContext(app, context, credentialSecret, false, false);
  const installationId = safeText(resolved.installation.id || recordString(resolved.installation, "id"));
  revokePendingSessions(app, installationId, context.now);
  const expiresAt = addSeconds(context.now, SESSION_BOOTSTRAP_SECONDS);
  let code = "";
  let session = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    code = `pzb_v1_${randomAlphaNumeric(48, context.security)}`;
    const digest = sessionDigest(code, credentialSecret, context.security);
    if (findFirst(app, WEB_SESSIONS_COLLECTION, "session_digest = {:digest}", { digest })) continue;
    session = new Record(app.findCollectionByNameOrId(WEB_SESSIONS_COLLECTION), {});
    session.set("store", resolved.storeId);
    session.set("installation", installationId);
    session.set("session_digest", digest);
    session.set("status", "pending");
    session.set("expires_at", expiresAt.toISOString());
    session.set("last_seen_at", "");
    session.set("consumed_at", "");
    session.set("delete_after", addDays(expiresAt, SESSION_RETENTION_DAYS).toISOString());
    schema.assertTenantIsolation(app, WEB_SESSIONS_COLLECTION, session);
    app.save(session);
    break;
  }
  if (!session) throw new StorefrontInstallationError("request_unavailable");
  return Object.freeze({ ok: true, bootstrap_code: code, expires_in_seconds: SESSION_BOOTSTRAP_SECONDS });
}

function consumeBootstrapSession(app, context, credentialSecret) {
  const codeDigest = sessionDigest(context.payload.code, credentialSecret, context.security);
  const session = findFirst(
    app,
    WEB_SESSIONS_COLLECTION,
    'session_digest = {:digest} && status = "pending"',
    { digest: codeDigest },
  );
  if (!session) throw new StorefrontInstallationError("bootstrap_not_found");
  const expiresAt = new Date(recordString(session, "expires_at"));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < context.now.getTime()) {
    session.set("status", "expired");
    session.set("consumed_at", context.now.toISOString());
    app.save(session);
    throw new StorefrontInstallationError("bootstrap_not_found");
  }
  const installation = findById(app, INSTALLATIONS_COLLECTION, relationId(session, "installation"));
  if (!installation || recordString(installation, "status") !== "active") {
    session.set("status", "revoked");
    session.set("consumed_at", context.now.toISOString());
    app.save(session);
    throw new StorefrontInstallationError("bootstrap_not_found");
  }
  const appConfig = findById(app, APP_CONFIGS_COLLECTION, relationId(installation, "app_config"));
  if (!appConfig || recordString(appConfig, "status") !== "active"
    || relationId(appConfig, "store") !== relationId(session, "store")) {
    session.set("status", "revoked");
    session.set("consumed_at", context.now.toISOString());
    app.save(session);
    throw new StorefrontInstallationError("bootstrap_not_found");
  }
  const redirectPath = recordString(appConfig, "store_path_prefix");
  if (!/^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(redirectPath)) {
    throw new StorefrontInstallationError("bootstrap_not_found");
  }

  const token = `pzws_v1_${randomAlphaNumeric(64, context.security)}`;
  const activeExpiresAt = addSeconds(context.now, SESSION_ACTIVE_SECONDS);
  session.set("session_digest", sessionDigest(token, credentialSecret, context.security));
  session.set("status", "active");
  session.set("expires_at", activeExpiresAt.toISOString());
  session.set("last_seen_at", context.now.toISOString());
  session.set("consumed_at", context.now.toISOString());
  session.set("delete_after", addDays(activeExpiresAt, SESSION_RETENTION_DAYS).toISOString());
  app.save(session);
  return Object.freeze({
    ok: true,
    session_token: token,
    redirect_path: redirectPath,
    max_age_seconds: SESSION_ACTIVE_SECONDS,
  });
}

function resolveActiveWebSession(app, tokenValue, nowValue, options) {
  const token = safeText(tokenValue);
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  if (!Number.isFinite(now.getTime())) return null;
  const config = options && typeof options === "object" ? options : {};
  let security = config.security;
  try { if (!security) security = defaultSecurity(); } catch (_) { return null; }
  const credentialSecret = safeText(config.credentialSecret || getCredentialSecret(security));
  if (!credentialSecret) return null;
  let digest = "";
  try { digest = sessionDigest(token, credentialSecret, security); } catch (_) { return null; }
  const session = findFirst(
    app,
    WEB_SESSIONS_COLLECTION,
    'session_digest = {:digest} && status = "active"',
    { digest },
  );
  if (!session) return null;
  const expiresAt = new Date(recordString(session, "expires_at"));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return null;
  const installation = findById(app, INSTALLATIONS_COLLECTION, relationId(session, "installation"));
  if (!installation || recordString(installation, "status") !== "active") return null;
  const appConfig = findById(app, APP_CONFIGS_COLLECTION, relationId(installation, "app_config"));
  const storeId = relationId(session, "store");
  if (!appConfig || recordString(appConfig, "status") !== "active"
    || relationId(installation, "store") !== storeId
    || relationId(appConfig, "store") !== storeId) return null;
  return Object.freeze({ session, installation, appConfig, storeId, expiresAt });
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  } catch (_) {}
}

function statusForError(code) {
  if (["unauthorized", "invalid_credential", "credential_required"].includes(code)) return 401;
  if (["app_not_available", "bootstrap_not_found", "target_not_available", "delivery_not_eligible"].includes(code)) return 404;
  if (["store_not_available", "plan_not_available"].includes(code)) return 403;
  if (["installation_disabled", "installation_not_available", "event_window_expired", "destination_not_verified"].includes(code)) return 409;
  if (code === "invalid_payload") return 400;
  if (code === "rate_limited") return 429;
  return 503;
}

function errorCode(error) {
  const code = safeText(error && (error.code || error.message));
  return SAFE_ERRORS.has(code) ? code : "request_unavailable";
}

function logSafeFailure(action, code) {
  if (["invalid_payload", "unauthorized", "invalid_credential", "credential_required", "rate_limited", "bootstrap_not_found", "target_not_available"].includes(code)) return;
  try {
    $app.logger().error(
      "Storefront installation request failed safely.",
      "code", "PZ_STOREFRONT_INSTALLATION_REQUEST_FAILED",
      "operation", action,
      "reason", code,
    );
  } catch (_) {}
}

function executeAction(app, action, context, credentialSecret, aesKeyOverride) {
  if (action === "installations_register") return registerInstallation(app, context, credentialSecret, aesKeyOverride);
  if (action === "installations_heartbeat") return heartbeatInstallation(app, context, credentialSecret, aesKeyOverride);
  if (action === "installations_permission") return updateInstallationPermission(app, context, credentialSecret);
  if (action === "installations_disable") return disableInstallation(app, context, credentialSecret);
  if (action === "session_bootstrap") return createBootstrapSession(app, context, credentialSecret);
  if (action === "session_consume") return consumeBootstrapSession(app, context, credentialSecret);
  if (action === "campaigns_resolve_target") return resolveCampaignTarget(app, context, credentialSecret);
  if (action === "events_record") {
    const resolved = resolveCredentialContext(app, context, credentialSecret, false, false);
    const analytics = typeof __hooks === "undefined"
      ? require("./pz_storefront_analytics_lib.js")
      : require(`${__hooks}/pz_storefront_analytics_lib.js`);
    return analytics.recordNativeEvent(app, resolved, context.payload, context.now);
  }
  throw new StorefrontInstallationError("invalid_payload");
}

function handleAction(e, action) {
  setPrivateHeaders(e);
  try {
    const context = authorizeInternalRequest(e, action);
    const credentialSecret = getCredentialSecret(context.security);
    if (!credentialSecret) throw new StorefrontInstallationError("storefront_secrets_unavailable");
    if (!consumeRateLimit(action, context, credentialSecret)) {
      try { e.response.header().set("Retry-After", "60"); } catch (_) {}
      throw new StorefrontInstallationError("rate_limited");
    }
    let result = null;
    $app.runInTransaction((txApp) => {
      result = executeAction(txApp, action, context, credentialSecret);
    });
    return e.json(200, result);
  } catch (error) {
    const code = errorCode(error);
    logSafeFailure(action, code);
    return e.json(statusForError(code), { ok: false, error: code });
  }
}

function resetMemoryForTests() {
  internalNonces.clear();
  rateBuckets.clear();
  maintenanceOperations = 0;
}

module.exports = {
  APP_CONFIGS_COLLECTION,
  BOOTSTRAP_CODE_PATTERN,
  CREDENTIAL_PATTERN,
  INSTALLATIONS_COLLECTION,
  INTERNAL_HEADERS,
  WEB_SESSIONS_COLLECTION,
  authorizeInternalRequest,
  canonicalJson,
  consumeBootstrapSession,
  consumeRateLimit,
  createBootstrapSession,
  credentialDigest,
  credentialFor,
  disableInstallation,
  fidDigest,
  handleAction,
  heartbeatInstallation,
  mapInstallation,
  normalizeIp,
  parseBootstrapConsumePayload,
  parseCampaignResolvePayload,
  parseEventPayload,
  parseClient,
  parseEmptyPayload,
  parseEnvelope,
  parseHeartbeatPayload,
  parsePermissionPayload,
  parseRegisterPayload,
  registerInstallation,
  resolveCredentialContext,
  resolveActiveWebSession,
  resolveCampaignTarget,
  resetMemoryForTests,
  sessionDigest,
  updateInstallationPermission,
};
