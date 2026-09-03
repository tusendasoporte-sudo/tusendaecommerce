/// <reference path="../pb_data/types.d.ts" />

const secretContract = typeof __hooks === "undefined"
  ? require("./pz_security_secret_contract.js")
  : require(`${__hooks}/pz_security_secret_contract.js`);
const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const monitoring = typeof __hooks === "undefined"
  ? require("./pz_security_monitoring_lib.js")
  : require(`${__hooks}/pz_security_monitoring_lib.js`);
const ipReputation = typeof __hooks === "undefined"
  ? require("./pz_security_ip_reputation_lib.js")
  : require(`${__hooks}/pz_security_ip_reputation_lib.js`);
const storeActivity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);

const DEVICE_COOKIE = "pz_client_device";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACTION_SCOPES = Object.freeze({
  orders: Object.freeze(["orders", "all_interactions", "full_access"]),
  reviews: Object.freeze(["reviews", "all_interactions", "full_access"]),
  raffles: Object.freeze(["raffles", "all_interactions", "full_access"]),
  interactions: Object.freeze(["all_interactions", "full_access"]),
  full_access: Object.freeze(["full_access"]),
});
const PUBLIC_READ_COLLECTIONS = Object.freeze([
  "stores", "products", "product_variations", "categories", "subcategories",
  "orders", "order_items", "shipping_methods", "shipping_zones",
  "automatic_promotions", "manual_coupons", "gifts", "raffles", "raffle_entries",
  "reviews", "store_visual_items", "settings", "currencies",
]);
const PUBLIC_FILE_COLLECTIONS = Object.freeze([
  "stores", "products", "product_variations", "categories", "subcategories",
  "gifts", "raffles", "store_visual_items", "settings",
]);

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function text(value) {
  if (Array.isArray(value)) return value.length ? text(value[0]) : "";
  if (value && typeof value === "object" && value.id) return String(value.id || "").trim();
  return String(value === null || value === undefined ? "" : value).trim();
}

function recordString(record, key) {
  return text(recordValue(record, key));
}

function relationId(record, key) {
  return recordString(record, key);
}

function recordBoolean(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordArray(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
      try {
        const encoded = value.map((item) => `%${item.toString(16).padStart(2, "0")}`).join("");
        const parsed = JSON.parse(decodeURIComponent(encoded));
        return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [];
      } catch (_) {
        return [];
      }
    }
    return value.map(text).filter(Boolean);
  }
  if (value && typeof value.string === "function") {
    try {
      const parsed = JSON.parse(String(value.string() || ""));
      return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [];
  } catch (_) {}
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [];
  } catch (_) { return []; }
}

function findCollection(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function findRecord(app, collection, id) {
  if (!RECORD_ID_PATTERN.test(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function findMany(app, collection, filter, sort, limit, params) {
  try {
    return app.findRecordsByFilter(collection, filter, sort || "id", Math.max(1, Math.min(Number(limit) || 200, 500)), 0, params || {}) || [];
  } catch (_) {
    return [];
  }
}

function requestInfo(e) {
  try { return e.requestInfo() || {}; } catch (_) { return {}; }
}

function headerValue(e, name) {
  const info = requestInfo(e);
  try {
    if (e && e.request && e.request.header && typeof e.request.header.get === "function") {
      const direct = text(e.request.header.get(name));
      if (direct) return direct;
    }
  } catch (_) {}
  const headers = info && info.headers;
  if (!headers || typeof headers !== "object") return "";
  try {
    if (typeof headers.get === "function") {
      const direct = text(headers.get(name) || headers.get(name.toLowerCase()));
      if (direct) return direct;
    }
  } catch (_) {}
  const wanted = String(name || "").toLowerCase().replace(/-/g, "_");
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase().replace(/-/g, "_") === wanted);
  return key ? text(headers[key]) : "";
}

function cookieValue(e, name) {
  const raw = headerValue(e, "Cookie");
  if (!raw || raw.length > 8192) return "";
  const prefix = `${name}=`;
  const part = raw.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!part) return "";
  try { return decodeURIComponent(part.slice(prefix.length)); } catch (_) { return ""; }
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("011")) digits = digits.slice(3);
  if (digits.startsWith("00")) digits = digits.slice(2);
  return /^\d{8,15}$/.test(digits) ? digits : "";
}

function normalizedIpFromRequest(e) {
  let raw = "";
  try { raw = text(e.realIP()); } catch (_) { raw = ""; }
  const normalizer = monitoring && monitoring._test && monitoring._test.normalizeIpAddress;
  return typeof normalizer === "function" ? normalizer(raw) : { valid: false, canonical: "", family: "unknown" };
}

function hmac(domain, storeId, value, secret) {
  if (!value) return "";
  return String($security.hs256(`${domain}|${storeId}|${value}`, secret) || "");
}

function requestSignals(e, storeId, phone, settings) {
  let secret = "";
  try { secret = secretContract.getValidHmacSecret(); } catch (_) { secret = ""; }
  if (!secret) return {
    signals: { ready: false, phone: "", device: "", ip: "", ipFamily: "unknown" },
    normalizedIp: { valid: false, canonical: "", family: "unknown" },
    ipCapture: null,
  };

  const normalizedPhone = normalizePhone(phone);
  const rawDeviceToken = cookieValue(e, DEVICE_COOKIE);
  const deviceDigest = DEVICE_TOKEN_PATTERN.test(rawDeviceToken)
    ? String($security.sha256(rawDeviceToken) || "").trim().toLowerCase()
    : "";
  const normalizedIp = normalizedIpFromRequest(e);
  const captureBuilder = monitoring && monitoring.buildIpCapture;
  const ipCapture = typeof captureBuilder === "function"
    ? captureBuilder(normalizedIp, storeId, settings, secret)
    : null;
  const ipHmac = ipCapture && ipCapture.ip_hmac
    ? String(ipCapture.ip_hmac)
    : (normalizedIp && normalizedIp.valid ? hmac("ip", storeId, normalizedIp.canonical, secret) : "");
  return {
    signals: {
      ready: true,
      phone: normalizedPhone ? hmac("phone", storeId, normalizedPhone, secret) : "",
      device: /^[a-f0-9]{64}$/.test(deviceDigest) ? hmac("browser", storeId, deviceDigest, secret) : "",
      ip: ipHmac,
      ipFamily: normalizedIp && normalizedIp.valid ? normalizedIp.family : "unknown",
    },
    normalizedIp,
    ipCapture,
  };
}

function scopeApplies(scope, action) {
  return !!ACTION_SCOPES[action] && ACTION_SCOPES[action].includes(String(scope || ""));
}

function signalMatches(block, signals) {
  const checks = [];
  if (recordBoolean(block, "match_phone")) {
    checks.push(Boolean(signals.phone) && recordArray(block, "phone_hmac_values").includes(signals.phone));
  }
  if (recordBoolean(block, "match_device")) {
    checks.push(Boolean(signals.device) && recordArray(block, "device_hmac_values").includes(signals.device));
  }
  if (recordBoolean(block, "match_ip")) {
    checks.push(Boolean(signals.ip) && recordArray(block, "ip_hmac_values").includes(signals.ip));
  }
  if (!checks.length) return false;
  return recordString(block, "match_mode") === "all" ? checks.every(Boolean) : checks.some(Boolean);
}

function dateTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function blockIsActive(block, now) {
  if (recordString(block, "status") !== "active") return false;
  if (recordString(block, "revoked_at")) return false;
  const nowTime = now.getTime();
  const start = dateTime(recordString(block, "starts_at"));
  if (Number.isFinite(start) && start > nowTime) return false;
  const expires = dateTime(recordString(block, "expires_at"));
  return !Number.isFinite(expires) || expires > nowTime;
}

function activeSecuritySettings(app, storeId) {
  const settings = findFirst(app, "store_security_settings", "store = {:store}", { store: storeId });
  const mode = recordString(settings, "mode");
  return settings && recordBoolean(settings, "enabled") && (mode === "monitoring" || mode === "protection")
    ? settings
    : null;
}

function protectionSettings(app, storeId, action, existingSettings) {
  const settings = existingSettings || activeSecuritySettings(app, storeId);
  if (!settings
    || recordString(settings, "mode") !== "protection"
    || !recordBoolean(settings, "manual_blocking_enabled")) return null;
  if (action === "full_access" && !recordBoolean(settings, "full_access_blocking_enabled")) return null;
  return settings;
}

function activeStoreWithSecurity(app, storeOrId) {
  const store = typeof storeOrId === "string" ? findRecord(app, "stores", storeOrId) : storeOrId;
  if (!store || recordString(store, "status") !== "active") return null;
  return capabilities.hasStoreCapability(store, "security_enabled", { app, enforceExpiration: true }) ? store : null;
}

function sourceType(action) {
  if (action === "orders") return "order";
  if (action === "reviews") return "review";
  if (action === "raffles") return "raffle";
  return "system";
}

function requestFingerprint(e, storeId, blockId, action, signals, now) {
  const explicit = headerValue(e, "X-Request-Id").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 100);
  const bucket = Math.floor(now.getTime() / 10000);
  const material = [storeId, blockId, action, signals.phone, signals.device, signals.ip, explicit, bucket].join("|");
  return String($security.sha256(material) || "").slice(0, 128);
}

function logEnforcement(code) {
  try { $app.logger().warn("PowerZona public security enforcement write skipped safely.", "code", code); } catch (_) {}
}

function findEventByKey(app, eventKey) {
  return findFirst(app, "store_security_events", "event_key = {:eventKey}", { eventKey });
}

function createBlockedAttemptEvent(app, e, store, settings, block, action, signals, ipCapture, now) {
  if (!findCollection(app, "store_security_events")) return null;
  const storeId = recordString(store, "id");
  const eventKey = `blocked_attempt:${requestFingerprint(e, storeId, recordString(block, "id"), action, signals, now)}`;
  let event = findEventByKey(app, eventKey);
  if (!event) {
    event = new Record(app.findCollectionByNameOrId("store_security_events"), {});
    event.set("store", storeId);
    const customerId = relationId(block, "customer");
    if (customerId) event.set("customer", customerId);
    event.set("event_key", eventKey);
    event.set("event_type", "blocked_attempt");
    event.set("source_type", sourceType(action));
    event.set("risk_level", "blocked");
    event.set("decision", "blocked");
    event.set("mode_at_event", "protection");
    event.set("phone_hmac", signals.phone);
    event.set("ip_hmac", signals.ip);
    event.set("ip_masked", text(ipCapture && ipCapture.ip_masked));
    event.set("ip_encrypted", text(ipCapture && ipCapture.ip_encrypted));
    event.set("ip_family", text(ipCapture && ipCapture.ip_family) || signals.ipFamily || "unknown");
    event.set("browser_token_hmac", signals.device);
    event.set(
      "capture_status",
      text(ipCapture && ipCapture.capture_status)
        || (signals.ip || signals.device || signals.phone ? "partial" : "unavailable")
    );
    event.set("crypto_version", "v1");
    event.set("metadata_json", {
      action,
      block_record_id: recordString(block, "id"),
      block_scope: recordString(block, "scope"),
    });
    event.set("occurred_at", now.toISOString());
    try { app.save(event); }
    catch (error) {
      event = findEventByKey(app, eventKey);
      if (!event) throw error;
    }
  }

  storeActivity.createActivity(app, {
    storeId,
    origin: "system",
    module: "security",
    action: "blocked_attempt",
    severity: "critical",
    resourceType: "security",
    resourceId: "",
    resourceLabel: "Seguridad de la tienda",
    changedFields: ["public_access"],
    previousValues: { public_access: "requested" },
    newValues: { public_access: "blocked" },
    summary: "Intento público bloqueado por Seguridad",
    sourceEventKey: `security:blocked_attempt:${event.id}`,
  });

  if (recordBoolean(settings, "notify_blocked_attempts") && findCollection(app, "store_notifications")) {
    const exists = findFirst(
      app,
      "store_notifications",
      'store = {:store} && type = "security_blocked_attempt" && entity_collection = "store_security_events" && entity_id = {:event} && status = "unread"',
      { store: storeId, event: event.id },
    );
    if (!exists) {
      const notification = new Record(app.findCollectionByNameOrId("store_notifications"), {});
      notification.set("store", storeId);
      notification.set("type", "security_blocked_attempt");
      notification.set("title", "Seguridad bloqueó un intento");
      notification.set("message", "Revisa la actividad reciente de Seguridad de tu tienda.");
      notification.set("status", "unread");
      notification.set("priority", "critical");
      notification.set("target_url", `/t/${recordString(store, "slug")}/admin/security?tab=activity`);
      notification.set("entity_collection", "store_security_events");
      notification.set("entity_id", event.id);
      notification.set("metadata_json", {});
      app.save(notification);
    }
  }
  return event;
}

function recordBlockedAttempt(app, e, store, settings, block, action, signals, ipCapture, now) {
  try {
    return createBlockedAttemptEvent(app, e, store, settings, block, action, signals, ipCapture, now);
  } catch (_) {
    logEnforcement("PZ_SEC_BLOCKED_ATTEMPT_WRITE_SKIPPED");
    return null;
  }
}

function evaluatePublicAccess(app, e, storeOrId, action, options) {
  if (!ACTION_SCOPES[action]) return { blocked: false, reason: "invalid_action" };
  const store = activeStoreWithSecurity(app, storeOrId);
  if (!store) return { blocked: false, reason: "capability_inactive" };
  const storeId = recordString(store, "id");
  const activeSettings = activeSecuritySettings(app, storeId);
  if (!activeSettings) return { blocked: false, reason: "security_inactive" };
  const requestIdentity = requestSignals(e, storeId, options && options.phone, activeSettings);
  const signals = requestIdentity.signals;
  if (!signals.ready) {
    logEnforcement("PZ_SEC_HMAC_SECRET_INVALID");
    return { blocked: false, reason: "identity_unavailable" };
  }

  const now = options && options.now instanceof Date ? options.now : new Date();
  const network = ipReputation.evaluate(
    app,
    store,
    activeSettings,
    signals,
    requestIdentity.normalizedIp,
    { now, send: options && options.ipReputationSend, ipCapture: requestIdentity.ipCapture },
  );
  if (network.blocked) {
    return {
      blocked: true,
      reason: "vpn_or_proxy_detected",
      store,
      signals,
      settings: activeSettings,
      network,
    };
  }

  const settings = protectionSettings(app, storeId, action, activeSettings);
  if (!settings) return { blocked: false, reason: "protection_inactive", network };
  try { monitoring.expireDueSecurityBlocks(app, storeId); } catch (_) { logEnforcement("PZ_SEC_BLOCK_EXPIRY_SKIPPED"); }
  const blocks = findMany(
    app,
    "store_security_blocks",
    'store = {:store} && status = "active"',
    "created,id",
    500,
    { store: storeId },
  );
  const block = blocks.find((candidate) => blockIsActive(candidate, now)
    && !(recordString(candidate, "scope") === "full_access" && !recordBoolean(settings, "full_access_blocking_enabled"))
    && scopeApplies(recordString(candidate, "scope"), action)
    && signalMatches(candidate, signals));
  if (!block) return { blocked: false, reason: "no_match", network };

  recordBlockedAttempt(app, e, store, settings, block, action, signals, requestIdentity.ipCapture, now);
  try {
    if (typeof monitoring.recordManualBlockDeviceCandidate === "function") {
      monitoring.recordManualBlockDeviceCandidate(app, block, signals, now);
    }
  } catch (_) {
    logEnforcement("PZ_SEC_BLOCK_DEVICE_CANDIDATE_SKIPPED");
  }
  return { blocked: true, store, block, signals, settings };
}

function setPrivateNoStore(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function unavailable(e) {
  setPrivateNoStore(e);
  return e.json(404, { ok: false, error: "not_found" });
}

function blockedAction(e) {
  setPrivateNoStore(e);
  return e.json(403, { ok: false, error: "request_unavailable" });
}

function bodyKeys(body) {
  return body && typeof body === "object"
    ? Object.keys(body).filter((key) => typeof body[key] !== "function")
    : [];
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function safeSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80 ? slug : "";
}

function findStoreBySlug(app, slug) {
  const safe = safeSlug(slug);
  return safe ? findFirst(app, "stores", 'slug = {:slug} && status = "active"', { slug: safe }) : null;
}

function resolvePublicAccessContext(app, body) {
  const keys = bodyKeys(body).sort();
  if (keys.length === 1 && keys[0] === "store_slug") {
    const store = findStoreBySlug(app, bodyValue(body, "store_slug"));
    return store ? { store, phone: "" } : null;
  }
  if (keys.length === 2 && keys[0] === "order_number" && keys[1] === "receipt_token") {
    const orderNumber = String(bodyValue(body, "order_number") || "").trim().slice(0, 80);
    const token = String(bodyValue(body, "receipt_token") || "").trim();
    if (!orderNumber || !/^[A-Za-z0-9_-]{16,120}$/.test(token)) return null;
    const order = findFirst(app, "orders", "order_number = {:number} && receipt_token = {:token}", { number: orderNumber, token });
    const store = order ? findRecord(app, "stores", relationId(order, "store")) : null;
    return store ? { store, phone: recordString(order, "customer_phone") } : null;
  }
  if (keys.length === 1 && keys[0] === "review_token") {
    const token = String(bodyValue(body, "review_token") || "").trim();
    if (!/^[A-Za-z0-9_-]{16,120}$/.test(token)) return null;
    const order = findFirst(app, "orders", "review_token = {:token}", { token });
    const store = order ? findRecord(app, "stores", relationId(order, "store")) : null;
    return store ? { store, phone: recordString(order, "customer_phone") } : null;
  }
  return null;
}

function resolvePublicAccessStore(app, body) {
  const context = resolvePublicAccessContext(app, body);
  return context ? context.store : null;
}

function handlePublicAccess(e) {
  setPrivateNoStore(e);
  const app = e.app || $app;
  const info = requestInfo(e);
  const context = resolvePublicAccessContext(app, info.body || {});
  if (!context) return unavailable(e);
  const result = evaluatePublicAccess(app, e, context.store, "full_access", { phone: context.phone });
  if (result.blocked && result.reason === "vpn_or_proxy_detected") {
    setPrivateNoStore(e);
    return e.json(403, { ok: false, error: "vpn_or_proxy_detected" });
  }
  if (result.blocked) return unavailable(e);
  try { return e.noContent(204); } catch (_) { return e.json(200, { ok: true }); }
}

function enforceAction(e, storeOrId, action, options) {
  const app = e.app || $app;
  const result = evaluatePublicAccess(app, e, storeOrId, action, options || {});
  if (!result.blocked) return false;
  blockedAction(e);
  return true;
}

function collectionName(e) {
  try { return String(e.collection.name || ""); } catch (_) {}
  try { return String(e.record.collection().name || ""); } catch (_) {}
  return "";
}

function recordStoreId(app, collection, record) {
  if (!record) return "";
  if (collection === "stores") return recordString(record, "id");
  const direct = relationId(record, "store");
  if (direct) return direct;
  if (collection === "product_variations") {
    const product = findRecord(app, "products", relationId(record, "product"));
    return relationId(product, "store");
  }
  if (collection === "order_items") {
    const order = findRecord(app, "orders", relationId(record, "order"));
    return relationId(order, "store");
  }
  if (collection === "raffle_entries") {
    const raffle = findRecord(app, "raffles", relationId(record, "raffle"));
    return relationId(raffle, "store");
  }
  return "";
}

function recordSignalPhone(app, collection, record) {
  if (!record) return "";
  if (collection === "orders") return recordString(record, "customer_phone");
  if (collection === "order_items") {
    const order = findRecord(app, "orders", relationId(record, "order"));
    return recordString(order, "customer_phone");
  }
  if (collection === "raffle_entries") return recordString(record, "phone");
  if (collection === "reviews" && relationId(record, "order")) {
    const order = findRecord(app, "orders", relationId(record, "order"));
    return recordString(order, "customer_phone");
  }
  return "";
}

function isPublicConsumer(e) {
  const info = requestInfo(e);
  const auth = (e && e.auth) || (info && info.auth);
  if (!auth) return true;
  return recordString(auth, "role") === "customer";
}

function throwUnavailable() {
  if (typeof NotFoundError === "function") throw new NotFoundError("No disponible.");
  const error = new Error("not_found");
  error.status = 404;
  throw error;
}

function enforcePublicRead(e) {
  if (!isPublicConsumer(e)) return e.next();
  const app = e.app || $app;
  const name = collectionName(e);
  const records = e.record ? [e.record] : (Array.isArray(e.records) ? e.records : []);
  if (e.record) {
    const storeId = recordStoreId(app, name, e.record);
    const phone = recordSignalPhone(app, name, e.record);
    if (storeId && evaluatePublicAccess(app, e, storeId, "full_access", { phone }).blocked) throwUnavailable();
    return e.next();
  }
  if (!records.length) return e.next();
  const decisions = {};
  const filtered = records.filter((record) => {
    const storeId = recordStoreId(app, name, record);
    if (!storeId) return true;
    const phone = recordSignalPhone(app, name, record);
    const key = `${storeId}|${normalizePhone(phone)}`;
    if (!Object.prototype.hasOwnProperty.call(decisions, key)) {
      decisions[key] = evaluatePublicAccess(app, e, storeId, "full_access", { phone }).blocked;
    }
    return !decisions[key];
  });
  e.records = filtered;
  if (e.result && Array.isArray(e.result.items)) {
    e.result.items = filtered;
    e.result.totalItems = filtered.length;
    e.result.totalPages = filtered.length ? 1 : 0;
  }
  return e.next();
}

function enforcePublicFile(e) {
  if (!isPublicConsumer(e)) return e.next();
  const app = e.app || $app;
  const storeId = recordStoreId(app, collectionName(e), e.record);
  if (storeId && evaluatePublicAccess(app, e, storeId, "full_access", {}).blocked) throwUnavailable();
  return e.next();
}

function enforcePublicReviewCreate(e) {
  if (!isPublicConsumer(e)) return e.next();
  const app = e.app || $app;
  const review = e.record;
  let storeId = relationId(review, "store");
  let phone = "";
  const orderId = relationId(review, "order");
  if (orderId) {
    const order = findRecord(app, "orders", orderId);
    if (!order || (storeId && relationId(order, "store") !== storeId)) return e.next();
    storeId = relationId(order, "store");
    phone = recordString(order, "customer_phone");
  }
  const store = activeStoreWithSecurity(app, storeId);
  if (store && evaluatePublicAccess(app, e, store, "reviews", { phone }).blocked) {
    if (typeof ForbiddenError === "function") throw new ForbiddenError("No se pudo completar la operación.");
    const error = new Error("request_unavailable");
    error.status = 403;
    throw error;
  }
  return e.next();
}

function enforcePublicInteractionCreate(e) {
  if (!isPublicConsumer(e)) return e.next();
  const app = e.app || $app;
  const record = e.record;
  const storeId = relationId(record, "store");
  if (!storeId) return e.next();
  if (evaluatePublicAccess(app, e, storeId, "interactions", {}).blocked) {
    if (typeof ForbiddenError === "function") throw new ForbiddenError("No se pudo completar la operación.");
    const error = new Error("request_unavailable");
    error.status = 403;
    throw error;
  }
  return e.next();
}

module.exports = {
  PUBLIC_FILE_COLLECTIONS,
  PUBLIC_READ_COLLECTIONS,
  enforceAction,
  enforcePublicFile,
  enforcePublicInteractionCreate,
  enforcePublicRead,
  enforcePublicReviewCreate,
  evaluatePublicAccess,
  handlePublicAccess,
  _test: {
    ACTION_SCOPES,
    blockIsActive,
    isPublicConsumer,
    normalizePhone,
    recordStoreId,
    resolvePublicAccessContext,
    resolvePublicAccessStore,
    scopeApplies,
    signalMatches,
  },
};
