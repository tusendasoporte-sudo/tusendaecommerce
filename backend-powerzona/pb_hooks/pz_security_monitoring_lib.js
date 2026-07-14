/// <reference path="../pb_data/types.d.ts" />

const {
  getValidHmacSecret,
  getValidAesKey,
} = require(`${__hooks}/pz_security_secret_contract.js`);
const SECURITY_SETTINGS_COLLECTION = "store_security_settings";
const SECURITY_EVENTS_COLLECTION = "store_security_events";
const VISITOR_SESSIONS_COLLECTION = "store_visitor_sessions";
const VISITOR_PAGEVIEWS_COLLECTION = "store_visitor_pageviews";
const STORE_CUSTOMERS_COLLECTION = "store_customers";
const STORE_CUSTOMER_PHONES_COLLECTION = "store_customer_phones";
const STORE_CUSTOMER_DEVICES_COLLECTION = "store_customer_devices";
const STORE_CUSTOMER_LINKS_COLLECTION = "store_customer_links";
const STORE_SECURITY_AUDIT_COLLECTION = "store_security_audit";
const STORE_SECURITY_BLOCKS_COLLECTION = "store_security_blocks";
const STORES_COLLECTION = "stores";
const ORDERS_COLLECTION = "orders";
const CUSTOMER_DETAIL_PER_PAGE = 10;
const CUSTOMER_DETAIL_MAX_PAGE = 1000;
const SECURITY_BLOCKS_PER_PAGE = 10;
const SECURITY_MONITORING_PAGE_SIZE = 10;

const ALLOWED_PAGE_TYPES = ["store_home", "category", "subcategory", "product", "gifts", "search", "checkout", "landing_qr", "other"];
const SECURITY_ACTIVITY_EVENT_TYPES = ["all", "order_created", "order_rejected", "review_submitted", "raffle_entry", "blocked_attempt", "admin_action"];
const SECURITY_ACTIVITY_RISK_LEVELS = ["all", "normal", "suspicious", "blocked"];
const RESOLVE_SOURCES = ["security_event", "visitor_session", "visitor_pageview"];
const SECURITY_BLOCK_SCOPES = ["orders", "reviews", "raffles", "all_interactions", "full_access"];
const SECURITY_BLOCK_DURATIONS = ["hours_24", "days_7", "days_30", "permanent"];
const SECURITY_BLOCK_STATUSES = ["all", "active", "expired", "revoked"];
const SECURITY_BLOCK_MATCH_MODES = ["any", "all"];
const LOG_MESSAGES = {
  PZ_SEC_NAV_TRACK_SKIPPED: "PowerZona security navigation tracking skipped safely.",
  PZ_SEC_NAV_WRITE_SKIPPED: "PowerZona security navigation write skipped safely.",
  PZ_SEC_NAV_CLEANUP_FAILED: "PowerZona security visitor cleanup skipped safely.",
  PZ_SEC_NAV_CLEANUP_DONE: "PowerZona security visitor cleanup completed.",
  PZ_SEC_IP_RESOLVE_FAILED: "PowerZona security IP resolution skipped safely.",
  PZ_SEC_AES_KEY_MISSING: "PowerZona security full IP unavailable.",
  PZ_SEC_HMAC_SECRET_INVALID: "PowerZona security monitoring skipped identity write.",
  PZ_SEC_CUSTOMER_DETAIL_ORDERS_FAILED: "PowerZona security customer detail orders failed safely.",
  PZ_SEC_CUSTOMER_DETAIL_EVENTS_FAILED: "PowerZona security customer detail events failed safely.",
  PZ_SEC_CUSTOMER_DETAIL_FAILED: "PowerZona security customer detail failed safely.",
  PZ_SEC_SUMMARY_FAILED: "PowerZona security summary failed safely.",
  PZ_SEC_CUSTOMER_ARCHIVE_FAILED: "PowerZona security customer archive failed safely.",
  PZ_SEC_CUSTOMER_RESTORE_FAILED: "PowerZona security customer restore failed safely.",
  PZ_SEC_CUSTOMER_DELETE_FAILED: "PowerZona security customer delete failed safely.",
  PZ_SEC_BLOCK_CREATE_FAILED: "PowerZona security block create failed safely.",
  PZ_SEC_BLOCK_REVOKE_FAILED: "PowerZona security block revoke failed safely.",
  PZ_SEC_BLOCK_EXPIRE_FAILED: "PowerZona security block expiry failed safely.",
  PZ_SEC_BLOCK_LIST_FAILED: "PowerZona security block list failed safely.",
  PZ_SEC_WATCH_UPDATE_FAILED: "PowerZona security customer watch update failed safely.",
  PZ_SEC_ACTIVITY_PAGE_FAILED: "PowerZona security activity page failed safely.",
  PZ_SEC_VISITORS_PAGE_FAILED: "PowerZona security visitors page failed safely.",
  PZ_SEC_VISITOR_DETAIL_FAILED: "PowerZona security visitor detail failed safely.",
};

function logSecurity(level, code, key, value) {
  try {
    const logger = $app.logger();
    const message = LOG_MESSAGES[code] || "PowerZona security monitoring operation skipped safely.";
    if (level === "error") logger.error(message, "code", code, key || "count", value || 0);
    else logger.warn(message, "code", code, key || "count", value || 0);
  } catch (_) {}
}

function setNoStore(e, isPrivate) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", isPrivate ? "private, no-store, max-age=0" : "no-store");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
  } catch (_) {}
}

function respondOk(e) {
  setNoStore(e, false);
  return e.json(200, { ok: true });
}

function getBodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function getBodyKeys(body) {
  if (!body || typeof body !== "object") return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function hasOwn(body, key) {
  return !!body && Object.prototype.hasOwnProperty.call(body, key);
}

function isValidRecordId(value) {
  return /^[a-z0-9]{15}$/.test(String(value || ""));
}

function valueToString(value) {
  if (Array.isArray(value)) return value.length ? valueToString(value[0]) : "";
  if (value && typeof value === "object" && value.id) return String(value.id || "");
  return String(value || "");
}

function getString(record, key) {
  try {
    return valueToString(record.getString(key));
  } catch (_) {
    try {
      return valueToString(record.get(key));
    } catch (_) {
      return "";
    }
  }
}

function getRelationId(record, key) {
  try {
    return valueToString(record.get(key));
  } catch (_) {
    return getString(record, key);
  }
}

function getNumber(record, key) {
  try {
    const value = Number(record.get(key));
    return Number.isFinite(value) ? value : 0;
  } catch (_) {
    return 0;
  }
}

function getBoolean(record, key) {
  try {
    return record.getBool(key) === true;
  } catch (_) {
    try {
      return record.get(key) === true;
    } catch (_) {
      return false;
    }
  }
}

function normalizePositivePage(value) {
  if (typeof value !== "number" || !Number.isInteger(value)) return 0;
  if (value < 1 || value > CUSTOMER_DETAIL_MAX_PAGE) return 0;
  return value;
}

function limitText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeSearchTerm(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function hmacValue(domain, storeId, value, secret) {
  return $security.hs256(`${domain}|${storeId}|${value}`, secret);
}

function findFirstByFilter(app, collection, filter, params) {
  try {
    return app.findFirstRecordByFilter(collection, filter, params || {});
  } catch (_) {
    return null;
  }
}

function findRecordByIdSafe(app, collection, id) {
  if (!isValidRecordId(id)) return null;
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function collectionHasField(app, collectionName, fieldName) {
  const collection = findCollectionSafe(app, collectionName);
  if (!collection) return false;
  try {
    return !!collection.fields.getByName(fieldName);
  } catch (_) {
    return false;
  }
}

function resolveCanonicalCustomer(app, storeId, customerOrId) {
  let customer = typeof customerOrId === "string"
    ? findRecordByIdSafe(app, STORE_CUSTOMERS_COLLECTION, customerOrId)
    : customerOrId;
  const seen = {};
  let depth = 0;
  while (customer && depth < 20) {
    if (getRelationId(customer, "store") !== storeId) return null;
    if (seen[customer.id]) return null;
    seen[customer.id] = true;
    const mergedInto = getRelationId(customer, "merged_into");
    if (!mergedInto) return customer;
    customer = findRecordByIdSafe(app, STORE_CUSTOMERS_COLLECTION, mergedInto);
    depth += 1;
  }
  return null;
}

function getActiveSecuritySettings(app, storeId) {
  if (!storeId) return null;
  const settings = findFirstByFilter(
    app,
    SECURITY_SETTINGS_COLLECTION,
    'store = {:store} && enabled = true && mode != "disabled"',
    { store: storeId }
  );
  if (!settings) return null;
  const mode = getString(settings, "mode");
  if (mode !== "monitoring" && mode !== "protection") return null;
  return settings;
}

function getSecuritySettingsRecord(app, storeId) {
  if (!storeId) return null;
  return findFirstByFilter(app, SECURITY_SETTINGS_COLLECTION, "store = {:store}", { store: storeId });
}

function getReadableSecuritySettings(app, storeId, role) {
  const settings = getSecuritySettingsRecord(app, storeId);
  if (!settings) return null;
  if (role === "master_admin") return settings;
  return canObserveWithSettings(settings) ? settings : null;
}

function securityMode(settings) {
  return getString(settings, "mode") || "disabled";
}

function canObserveWithSettings(settings) {
  if (!settings || !getBoolean(settings, "enabled")) return false;
  const mode = securityMode(settings);
  return mode === "monitoring" || mode === "protection";
}

function canBlockWithSettings(settings) {
  return canObserveWithSettings(settings)
    && securityMode(settings) === "protection"
    && getBoolean(settings, "manual_blocking_enabled");
}

function blockCapabilities(settings) {
  const mode = securityMode(settings);
  const canObserve = canObserveWithSettings(settings);
  const canBlock = canBlockWithSettings(settings);
  return {
    can_observe: canObserve,
    can_block: canBlock,
    can_full_access: canBlock && getBoolean(settings, "full_access_blocking_enabled"),
    can_permanent: canBlock && getBoolean(settings, "permanent_blocks_enabled"),
    mode,
  };
}

function invalidIp() {
  return { valid: false, canonical: "", family: "unknown", masked: "" };
}

function normalizeIpv4(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 4) return invalidIp();
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return invalidIp();
    const number = Number(part);
    if (!Number.isInteger(number) || number < 0 || number > 255) return invalidIp();
    octets.push(String(number));
  }
  return { valid: true, canonical: octets.join("."), family: "ipv4", masked: `${octets[0]}.${octets[1]}.***.${octets[3]}` };
}

function isIpv6Group(value) {
  return /^[0-9a-f]{1,4}$/.test(value);
}

function padIpv6Group(group) {
  return (`0000${group}`).slice(-4);
}

function zeroIpv6Groups(count) {
  const groups = [];
  for (let index = 0; index < count; index += 1) groups.push("0000");
  return groups;
}

function parseIpv6Side(side) {
  if (!side) return [];
  const groups = side.split(":");
  if (groups.some((group) => !isIpv6Group(group))) return null;
  return groups.map((group) => padIpv6Group(group));
}

function normalizeIpv6(value) {
  const lower = String(value || "").toLowerCase();
  if (!lower || lower.includes(".") || !/^[0-9a-f:]+$/.test(lower)) return invalidIp();
  const doubleColonParts = lower.split("::");
  if (doubleColonParts.length > 2) return invalidIp();
  let groups = null;
  if (doubleColonParts.length === 1) {
    groups = parseIpv6Side(lower);
    if (!groups || groups.length !== 8) return invalidIp();
  } else {
    const left = parseIpv6Side(doubleColonParts[0]);
    const right = parseIpv6Side(doubleColonParts[1]);
    if (!left || !right) return invalidIp();
    const missingGroups = 8 - left.length - right.length;
    if (missingGroups < 1) return invalidIp();
    groups = left.concat(zeroIpv6Groups(missingGroups), right);
  }
  const compact = groups.map((group) => group.replace(/^0+/, "") || "0");
  return {
    valid: true,
    canonical: groups.join(":"),
    family: "ipv6",
    masked: `${compact[0]}:${compact[1]}:${compact[2]}:****:****:****:****:****`,
  };
}

function normalizeIpv4MappedIpv6(value) {
  const lower = String(value || "").toLowerCase();
  const match = lower.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (!match) return null;
  return normalizeIpv4(match[1]);
}

function normalizeIpAddress(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return invalidIp();
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed)) return normalizeIpv4(trimmed);
  const mappedIpv4 = normalizeIpv4MappedIpv6(trimmed);
  if (mappedIpv4) return mappedIpv4;
  if (trimmed.includes(":")) return normalizeIpv6(trimmed);
  return invalidIp();
}

function buildIpCapture(normalizedIp, storeId, settings, secret) {
  const visibility = getString(settings, "ip_visibility") || "hidden";
  const capture = {
    ip_hmac: "",
    ip_masked: "",
    ip_encrypted: "",
    ip_family: "unknown",
    capture_status: "unavailable",
  };

  if (!normalizedIp || !normalizedIp.valid) return capture;

  capture.ip_family = normalizedIp.family;
  capture.ip_hmac = hmacValue("ip", storeId, normalizedIp.canonical, secret);
  capture.capture_status = "partial";

  if (visibility === "partial" || visibility === "full") {
    capture.ip_masked = normalizedIp.masked;
  }

  if (visibility === "full") {
    const aesKey = getValidAesKey();
    if (!aesKey) {
      logSecurity("warn", "PZ_SEC_AES_KEY_MISSING");
      return capture;
    }
    try {
      capture.ip_encrypted = $security.encrypt(normalizedIp.canonical, aesKey);
      capture.capture_status = "complete";
    } catch (_) {}
  }

  return capture;
}

function decryptIp(ciphertext) {
  const aesKey = getValidAesKey();
  if (!aesKey || !ciphertext) return "";
  try {
    const decrypted = String($security.decrypt(String(ciphertext), aesKey) || "");
    const normalized = normalizeIpAddress(decrypted);
    return normalized.valid ? normalized.canonical : "";
  } catch (_) {
    return "";
  }
}

function nthSunday(year, monthIndex, nth) {
  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
    if (date.getUTCMonth() !== monthIndex) break;
    if (date.getUTCDay() === 0) {
      count += 1;
      if (count === nth) return day;
    }
  }
  return 1;
}

function getHavanaOffsetHours(date) {
  const year = date.getUTCFullYear();
  const dstStartDay = nthSunday(year, 2, 2);
  const dstEndDay = nthSunday(year, 10, 1);
  const dstStart = Date.UTC(year, 2, dstStartDay, 5, 0, 0);
  const dstEnd = Date.UTC(year, 10, dstEndDay, 5, 0, 0);
  const time = date.getTime();
  return time >= dstStart && time < dstEnd ? -4 : -5;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getHavanaDay(dateValue) {
  const date = dateValue || new Date();
  const shifted = new Date(date.getTime() + getHavanaOffsetHours(date) * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function addDaysToDay(day, amount) {
  const parts = String(day || "").split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "";
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + amount);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function isAllowedPageType(value) {
  return ALLOWED_PAGE_TYPES.includes(String(value || ""));
}

function normalizeEntityType(value) {
  const normalized = limitText(value, 120);
  return /^[A-Za-z0-9_.:-]*$/.test(normalized) ? normalized : "";
}

function normalizeEntityId(value) {
  const normalized = limitText(value, 120);
  return /^[A-Za-z0-9_.:-]*$/.test(normalized) ? normalized : "";
}

function normalizeAnalyticsId(value) {
  const normalized = limitText(value, 80);
  return /^[A-Za-z0-9_.:-]*$/.test(normalized) ? normalized : "";
}

function normalizePath(value) {
  const path = limitText(value, 240);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "";
  if (path.includes("?") || path.includes("#") || /[\r\n]/.test(path)) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return "";
  const lower = path.toLowerCase();
  if (
    lower.startsWith("/admin") ||
    lower.startsWith("/master") ||
    lower.startsWith("/api") ||
    lower.startsWith("/login") ||
    lower.startsWith("/master-login") ||
    lower.startsWith("/assets") ||
    lower.startsWith("/_astro") ||
    lower.includes("receipt_token") ||
    lower.includes("access_code") ||
    lower.includes("review_token") ||
    /^\/orden\/[^/]+\/[^/]+/.test(lower)
  ) {
    return "";
  }
  return path;
}

function parseNavigationPayload(body) {
  const allowed = ["store_id", "event_id", "visitor_id", "session_id", "browser_token_digest", "page_type", "entity_type", "entity_id", "path"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length) return null;
  if (keys.some((key) => !allowed.includes(key))) return null;

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const eventId = String(getBodyValue(body, "event_id") || "").trim();
  const visitorId = normalizeAnalyticsId(getBodyValue(body, "visitor_id"));
  const sessionId = normalizeAnalyticsId(getBodyValue(body, "session_id"));
  const browserTokenDigest = String(getBodyValue(body, "browser_token_digest") || "").trim().toLowerCase();
  const pageType = String(getBodyValue(body, "page_type") || "").trim();
  const entityType = normalizeEntityType(getBodyValue(body, "entity_type"));
  const entityId = normalizeEntityId(getBodyValue(body, "entity_id"));
  const path = normalizePath(getBodyValue(body, "path"));

  if (!isValidRecordId(storeId)) return null;
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(eventId)) return null;
  if (!isAllowedPageType(pageType)) return null;
  if (hasOwn(body, "browser_token_digest") && browserTokenDigest && !/^[a-f0-9]{64}$/.test(browserTokenDigest)) return null;
  if (!path) return null;

  return { storeId, eventId, visitorId, sessionId, browserTokenDigest, pageType, entityType, entityId, path };
}

function getVisitorIdentity(payload, storeId, secret) {
  if (payload.browserTokenDigest) {
    return {
      visitorKeyHmac: hmacValue("visitor_browser", storeId, payload.browserTokenDigest, secret),
      browserTokenHmac: hmacValue("browser", storeId, payload.browserTokenDigest, secret),
    };
  }

  if (payload.visitorId || payload.sessionId) {
    return {
      visitorKeyHmac: hmacValue("visitor_analytics", storeId, `${payload.visitorId}|${payload.sessionId}`, secret),
      browserTokenHmac: "",
    };
  }

  return {
    visitorKeyHmac: hmacValue("visitor_fallback", storeId, payload.eventId, secret),
    browserTokenHmac: "",
  };
}

function findCustomerByBrowserToken(app, storeId, browserTokenHmac) {
  if (!browserTokenHmac) return "";
  if (findCollectionSafe(app, STORE_CUSTOMER_DEVICES_COLLECTION)) {
    const device = findFirstByFilter(
      app,
      STORE_CUSTOMER_DEVICES_COLLECTION,
      "store = {:store} && browser_token_hmac = {:browserTokenHmac}",
      { store: storeId, browserTokenHmac }
    );
    const canonical = device ? resolveCanonicalCustomer(app, storeId, getRelationId(device, "customer")) : null;
    if (canonical) return canonical.id;
  }

  const events = app.findRecordsByFilter(
    SECURITY_EVENTS_COLLECTION,
    'store = {:store} && browser_token_hmac = {:browserTokenHmac} && customer != ""',
    "-occurred_at",
    1,
    0,
    { store: storeId, browserTokenHmac }
  ) || [];
  if (!events.length) return "";
  const customerId = getRelationId(events[0], "customer");
  const customer = resolveCanonicalCustomer(app, storeId, customerId);
  if (!customer) return "";
  return customer.id;
}

function findVisitorSession(app, storeId, day, visitorKeyHmac) {
  return findFirstByFilter(
    app,
    VISITOR_SESSIONS_COLLECTION,
    "store = {:store} && day = {:day} && visitor_key_hmac = {:visitorKeyHmac}",
    { store: storeId, day, visitorKeyHmac }
  );
}

function createVisitorSession(app, storeId, day, payload, identity, customerId, ipCapture, occurredAt) {
  const collection = app.findCollectionByNameOrId(VISITOR_SESSIONS_COLLECTION);
  const session = new Record(collection, {});
  session.set("store", storeId);
  session.set("day", day);
  session.set("visitor_key_hmac", identity.visitorKeyHmac);
  session.set("browser_token_hmac", identity.browserTokenHmac);
  session.set("analytics_visitor_id", payload.visitorId);
  session.set("analytics_session_id", payload.sessionId);
  session.set("customer", customerId || "");
  session.set("first_seen_at", occurredAt);
  session.set("last_seen_at", occurredAt);
  session.set("pageviews_count", 0);
  session.set("entry_path", payload.path);
  session.set("last_path", payload.path);
  session.set("latest_ip_hmac", ipCapture.ip_hmac);
  session.set("latest_ip_masked", ipCapture.ip_masked);
  session.set("latest_ip_encrypted", ipCapture.ip_encrypted);
  session.set("latest_ip_family", ipCapture.ip_family);
  session.set("latest_capture_status", ipCapture.capture_status);
  session.set("crypto_version", "v1");

  try {
    app.save(session);
    return session;
  } catch (error) {
    const raced = findVisitorSession(app, storeId, day, identity.visitorKeyHmac);
    if (raced) return raced;
    throw error;
  }
}

function upsertVisitorSession(app, storeId, day, payload, identity, customerId, ipCapture, occurredAt) {
  let session = findVisitorSession(app, storeId, day, identity.visitorKeyHmac);
  if (!session) {
    session = createVisitorSession(app, storeId, day, payload, identity, customerId, ipCapture, occurredAt);
  }

  if (customerId && !getRelationId(session, "customer")) session.set("customer", customerId);
  if (identity.browserTokenHmac && !getString(session, "browser_token_hmac")) session.set("browser_token_hmac", identity.browserTokenHmac);
  if (payload.visitorId && !getString(session, "analytics_visitor_id")) session.set("analytics_visitor_id", payload.visitorId);
  if (payload.sessionId && !getString(session, "analytics_session_id")) session.set("analytics_session_id", payload.sessionId);
  if (!getString(session, "entry_path")) session.set("entry_path", payload.path);
  session.set("last_seen_at", occurredAt);
  session.set("last_path", payload.path);
  session.set("pageviews_count", Math.max(0, getNumber(session, "pageviews_count")) + 1);
  session.set("latest_ip_hmac", ipCapture.ip_hmac);
  session.set("latest_ip_masked", ipCapture.ip_masked);
  session.set("latest_ip_encrypted", ipCapture.ip_encrypted);
  session.set("latest_ip_family", ipCapture.ip_family);
  session.set("latest_capture_status", ipCapture.capture_status);
  session.set("crypto_version", "v1");
  app.save(session);
  return session;
}

function createVisitorPageview(app, storeId, day, payload, eventKey, session, customerId, ipCapture, occurredAt) {
  const collection = app.findCollectionByNameOrId(VISITOR_PAGEVIEWS_COLLECTION);
  const pageview = new Record(collection, {});
  pageview.set("store", storeId);
  pageview.set("visitor_session", session.id);
  pageview.set("customer", customerId || getRelationId(session, "customer") || "");
  pageview.set("event_key", eventKey);
  pageview.set("day", day);
  pageview.set("page_type", payload.pageType);
  pageview.set("entity_type", payload.entityType);
  pageview.set("entity_id", payload.entityId);
  pageview.set("path", payload.path);
  pageview.set("ip_hmac", ipCapture.ip_hmac);
  pageview.set("ip_masked", ipCapture.ip_masked);
  pageview.set("ip_encrypted", ipCapture.ip_encrypted);
  pageview.set("ip_family", ipCapture.ip_family);
  pageview.set("capture_status", ipCapture.capture_status);
  pageview.set("crypto_version", "v1");
  pageview.set("occurred_at", occurredAt);
  app.save(pageview);
}

function recordNavigation(payload, requestIp) {
  const normalizedIp = normalizeIpAddress(requestIp);
  const occurredAt = new Date().toISOString();
  const day = getHavanaDay(new Date());
  const secret = getValidHmacSecret();
  if (!secret) {
    logSecurity("warn", "PZ_SEC_HMAC_SECRET_INVALID");
    return;
  }

  $app.runInTransaction((txApp) => {
    const store = findRecordByIdSafe(txApp, STORES_COLLECTION, payload.storeId);
    if (!store) return;

    const settings = getActiveSecuritySettings(txApp, payload.storeId);
    if (!settings) return;

    const identity = getVisitorIdentity(payload, payload.storeId, secret);
    if (!identity.visitorKeyHmac) return;

    const eventKey = hmacValue("visitor_event", payload.storeId, payload.eventId, secret);
    const existing = findFirstByFilter(txApp, VISITOR_PAGEVIEWS_COLLECTION, "event_key = {:eventKey}", { eventKey });
    if (existing) return;

    const ipCapture = buildIpCapture(normalizedIp, payload.storeId, settings, secret);
    const customerId = findCustomerByBrowserToken(txApp, payload.storeId, identity.browserTokenHmac);
    const session = upsertVisitorSession(txApp, payload.storeId, day, payload, identity, customerId, ipCapture, occurredAt);
    createVisitorPageview(txApp, payload.storeId, day, payload, eventKey, session, customerId, ipCapture, occurredAt);
  });
}

function handleTrackNavigation(e) {
  setNoStore(e, false);

  try {
    const info = e.requestInfo();
    const payload = parseNavigationPayload(info.body || {});
    if (!payload) return respondOk(e);

    recordNavigation(payload, e.realIP());
  } catch (_) {
    logSecurity("error", "PZ_SEC_NAV_TRACK_SKIPPED");
  }

  return respondOk(e);
}

function isAllowedResolvePayload(body) {
  const keys = getBodyKeys(body);
  if (keys.length !== 1 || keys[0] !== "items") return false;
  const items = getBodyValue(body, "items");
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) return false;

  for (const item of items) {
    const itemKeys = getBodyKeys(item);
    if (itemKeys.length !== 2 || !itemKeys.includes("source") || !itemKeys.includes("id")) return false;
    if (!RESOLVE_SOURCES.includes(String(getBodyValue(item, "source") || ""))) return false;
    if (!isValidRecordId(getBodyValue(item, "id"))) return false;
  }

  return true;
}

function authRole(auth) {
  return getString(auth, "role");
}

function authStore(auth) {
  return getRelationId(auth, "store");
}

function buildIdsFilter(ids) {
  const params = {};
  const parts = ids.map((id, index) => {
    const key = `id${index}`;
    params[key] = id;
    return `id = {:${key}}`;
  });
  return { filter: `(${parts.join(" || ")})`, params };
}

function getRecordsByIds(app, collection, ids) {
  if (!ids.length) return [];
  const built = buildIdsFilter(ids);
  return app.findRecordsByFilter(collection, built.filter, "", ids.length, 0, built.params) || [];
}

function buildStoreIdsFilter(storeId, ids) {
  const cleanIds = [];
  ids.forEach((id) => {
    if (isValidRecordId(id) && !cleanIds.includes(id)) cleanIds.push(id);
  });
  if (!cleanIds.length) return null;

  const params = { store: storeId };
  const parts = cleanIds.map((id, index) => {
    const key = `id${index}`;
    params[key] = id;
    return `id = {:${key}}`;
  });

  return {
    filter: `store = {:store} && (${parts.join(" || ")})`,
    params,
    limit: cleanIds.length,
  };
}

function getStoreRecordsByIds(app, collection, storeId, ids) {
  const built = buildStoreIdsFilter(storeId, ids);
  if (!built) return [];
  return app.findRecordsByFilter(collection, built.filter, "", built.limit, 0, built.params) || [];
}

function countRecordsByFilter(app, collection, filter, params) {
  let total = 0;
  let offset = 0;
  const limit = 200;
  while (true) {
    const batch = app.findRecordsByFilter(collection, filter, "", limit, offset, params || {}) || [];
    total += batch.length;
    if (batch.length < limit) break;
    offset += limit;
  }
  return total;
}

function listRecordsPaged(app, collection, filter, sort, params, batchSize) {
  const records = [];
  const limit = batchSize || 200;
  let offset = 0;
  while (true) {
    const batch = app.findRecordsByFilter(collection, filter || "", sort || "", limit, offset, params || {}) || [];
    if (!batch.length) return records;
    records.push(...batch);
    if (batch.length < limit) return records;
    offset += limit;
  }
}

function uniqueIds(values) {
  const ids = [];
  (values || []).forEach((value) => {
    const id = String(value || "");
    if (isValidRecordId(id) && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

function buildStoreRelationFilter(storeId, field, ids) {
  const cleanIds = uniqueIds(ids);
  if (!cleanIds.length) return null;
  const params = { store: storeId };
  const parts = cleanIds.map((id, index) => {
    const key = `${field.replace(/[^A-Za-z0-9_]/g, "")}${index}`;
    params[key] = id;
    return `${field} = {:${key}}`;
  });
  return { filter: `store = {:store} && (${parts.join(" || ")})`, params };
}

function listByStoreRelation(app, collection, storeId, field, ids, sort) {
  if (!findCollectionSafe(app, collection)) return [];
  const built = buildStoreRelationFilter(storeId, field, ids);
  if (!built) return [];
  return listRecordsPaged(app, collection, built.filter, sort || "", built.params, 200);
}

function countByStoreRelation(app, collection, storeId, field, ids) {
  const built = buildStoreRelationFilter(storeId, field, ids);
  if (!built || !findCollectionSafe(app, collection)) return 0;
  return countRecordsByFilter(app, collection, built.filter, built.params);
}

function emptyDetailPage(page) {
  return {
    page,
    perPage: CUSTOMER_DETAIL_PER_PAGE,
    totalItems: 0,
    totalPages: 1,
    items: [],
  };
}

function listDetailPage(app, collection, filter, sort, page, params) {
  const totalItems = countRecordsByFilter(app, collection, filter, params);
  const totalPages = Math.max(1, Math.ceil(totalItems / CUSTOMER_DETAIL_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * CUSTOMER_DETAIL_PER_PAGE;
  const items = totalItems > 0
    ? app.findRecordsByFilter(collection, filter, sort, CUSTOMER_DETAIL_PER_PAGE, offset, params || {}) || []
    : [];

  return {
    page: safePage,
    perPage: CUSTOMER_DETAIL_PER_PAGE,
    totalItems,
    totalPages,
    items,
  };
}

function serializeOrder(order) {
  return {
    id: order.id,
    order_number: getString(order, "order_number"),
    status: getString(order, "status"),
    total: getNumber(order, "total"),
    usd_total: getNumber(order, "usd_total"),
    delivery_method: getString(order, "delivery_method"),
    created: getString(order, "created"),
  };
}

function buildOrderMap(app, storeId, ids) {
  const map = {};
  getStoreRecordsByIds(app, ORDERS_COLLECTION, storeId, ids).forEach((order) => {
    map[order.id] = serializeOrder(order);
  });
  return map;
}

function getRecordIpDisplayFromFields(record, settings, maskedField, encryptedField) {
  const visibility = getString(settings, "ip_visibility") || "hidden";
  const masked = getString(record, maskedField);

  if (visibility === "hidden") {
    return { ip_display: "", ip_resolution_status: "hidden" };
  }

  if (visibility === "partial") {
    return {
      ip_display: masked,
      ip_resolution_status: masked ? "masked" : "unavailable",
    };
  }

  if (visibility === "full") {
    const fullIp = decryptIp(getString(record, encryptedField));
    if (fullIp) {
      return { ip_display: fullIp, ip_resolution_status: "full" };
    }

    return {
      ip_display: masked,
      ip_resolution_status: "full_unavailable",
    };
  }

  return { ip_display: "", ip_resolution_status: "hidden" };
}

function getRecordIpDisplay(record, settings) {
  return getRecordIpDisplayFromFields(record, settings, "ip_masked", "ip_encrypted");
}

function getVisitorSessionIpDisplay(record, settings) {
  return getRecordIpDisplayFromFields(record, settings, "latest_ip_masked", "latest_ip_encrypted");
}

function serializeEvent(event, settings, orderMap) {
  const orderId = getRelationId(event, "order");
  const ip = getRecordIpDisplay(event, settings);
  return {
    id: event.id,
    event_type: getString(event, "event_type"),
    source_type: getString(event, "source_type"),
    risk_level: getString(event, "risk_level"),
    decision: getString(event, "decision"),
    mode_at_event: getString(event, "mode_at_event"),
    capture_status: getString(event, "capture_status"),
    occurred_at: getString(event, "occurred_at"),
    order_id: orderId,
    related_order: orderMap[orderId] || null,
    ip_display: ip.ip_display,
    ip_resolution_status: ip.ip_resolution_status,
  };
}

function isAllowedCustomerDetailPayload(body) {
  const keys = getBodyKeys(body);
  const allowed = ["store_id", "customer_id", "orders_page", "events_page"];
  if (keys.length !== allowed.length) return false;
  if (keys.some((key) => !allowed.includes(key))) return false;
  if (!isValidRecordId(getBodyValue(body, "store_id"))) return false;
  if (!isValidRecordId(getBodyValue(body, "customer_id"))) return false;
  if (!normalizePositivePage(getBodyValue(body, "orders_page"))) return false;
  if (!normalizePositivePage(getBodyValue(body, "events_page"))) return false;
  return true;
}

function canReadStore(role, authStoreId, storeId) {
  if (role === "master_admin") return true;
  if (role === "store_admin" && authStoreId && authStoreId === storeId) return true;
  return false;
}

function getAuthorizedSecuritySettings(info, storeId) {
  const auth = info && info.auth;
  const role = authRole(auth);
  const authStoreId = authStore(auth);
  if (!canReadStore(role, authStoreId, storeId)) return null;
  const settings = getReadableSecuritySettings($app, storeId, role);
  if (!settings) return null;
  return { role, settings };
}

function hasExactKeys(body, allowed) {
  const keys = getBodyKeys(body);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function normalizeSecurityDay(value) {
  const day = String(value || "").trim();
  if (!day) return getHavanaDay(new Date());
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, date, 12, 0, 0));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== date) return "";
  return day;
}

function parseActivityPagePayload(body) {
  const allowed = ["store_id", "page", "event_type", "risk_level"];
  if (!hasExactKeys(body, allowed)) return null;
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const page = normalizePositivePage(getBodyValue(body, "page"));
  const eventType = String(getBodyValue(body, "event_type") || "").trim();
  const riskLevel = String(getBodyValue(body, "risk_level") || "").trim();
  if (!isValidRecordId(storeId) || !page) return null;
  if (!SECURITY_ACTIVITY_EVENT_TYPES.includes(eventType)) return null;
  if (!SECURITY_ACTIVITY_RISK_LEVELS.includes(riskLevel)) return null;
  return { storeId, page, eventType, riskLevel };
}

function parseVisitorsPagePayload(body) {
  const allowed = ["store_id", "page", "day"];
  if (!hasExactKeys(body, allowed)) return null;
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const page = normalizePositivePage(getBodyValue(body, "page"));
  const day = normalizeSecurityDay(getBodyValue(body, "day"));
  if (!isValidRecordId(storeId) || !page || !day) return null;
  return { storeId, page, day };
}

function parseVisitorDetailPayload(body) {
  const allowed = ["store_id", "visitor_session_id", "page"];
  if (!hasExactKeys(body, allowed)) return null;
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const visitorSessionId = String(getBodyValue(body, "visitor_session_id") || "").trim();
  const page = normalizePositivePage(getBodyValue(body, "page"));
  if (!isValidRecordId(storeId) || !isValidRecordId(visitorSessionId) || !page) return null;
  return { storeId, visitorSessionId, page };
}

function listSecurityPage(app, collection, filter, sort, page, params) {
  const totalItems = countRecordsByFilter(app, collection, filter, params);
  const totalPages = Math.max(1, Math.ceil(totalItems / SECURITY_MONITORING_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * SECURITY_MONITORING_PAGE_SIZE;
  const items = totalItems > 0
    ? app.findRecordsByFilter(collection, filter, sort, SECURITY_MONITORING_PAGE_SIZE, offset, params || {}) || []
    : [];
  return {
    page: safePage,
    perPage: SECURITY_MONITORING_PAGE_SIZE,
    totalItems,
    totalPages,
    items,
  };
}

function buildSanitizedCustomerMap(app, storeId, customerIds) {
  const customers = getStoreRecordsByIds(app, STORE_CUSTOMERS_COLLECTION, storeId, uniqueIds(customerIds));
  const customerMap = {};
  const primaryPhones = {};
  listByStoreRelation(
    app,
    STORE_CUSTOMER_PHONES_COLLECTION,
    storeId,
    "customer",
    customers.map((customer) => customer.id),
    "-is_primary,-updated"
  ).forEach((phone) => {
    const customerId = getRelationId(phone, "customer");
    if (!primaryPhones[customerId] && getBoolean(phone, "is_primary")) {
      primaryPhones[customerId] = getString(phone, "phone_normalized");
    }
  });

  customers.forEach((customer) => {
    customerMap[customer.id] = {
      id: customer.id,
      display_name: getString(customer, "display_name"),
      primary_phone: primaryPhones[customer.id] || getString(customer, "phone_normalized"),
    };
  });
  return customerMap;
}

function buildSanitizedOrderMap(app, storeId, orderIds) {
  const orderMap = {};
  getStoreRecordsByIds(app, ORDERS_COLLECTION, storeId, uniqueIds(orderIds)).forEach((order) => {
    orderMap[order.id] = {
      id: order.id,
      order_number: getString(order, "order_number"),
    };
  });
  return orderMap;
}

function serializeActivityEvent(event, settings, customerMap, orderMap) {
  const customerId = getRelationId(event, "customer");
  const orderId = getRelationId(event, "order");
  const ip = getRecordIpDisplay(event, settings);
  return {
    id: event.id,
    event_type: getString(event, "event_type"),
    source_type: getString(event, "source_type"),
    risk_level: getString(event, "risk_level"),
    decision: getString(event, "decision"),
    mode_at_event: getString(event, "mode_at_event"),
    occurred_at: getString(event, "occurred_at"),
    created: getString(event, "created"),
    customer: customerMap[customerId] || null,
    order: orderMap[orderId] || null,
    ip_display: ip.ip_display,
    ip_resolution_status: ip.ip_resolution_status,
  };
}

function serializeVisitorSession(session, settings, customerMap) {
  const customerId = getRelationId(session, "customer");
  const ip = getVisitorSessionIpDisplay(session, settings);
  return {
    id: session.id,
    day: getString(session, "day"),
    first_seen_at: getString(session, "first_seen_at"),
    last_seen_at: getString(session, "last_seen_at"),
    pageviews_count: Math.max(0, getNumber(session, "pageviews_count")),
    entry_path: getString(session, "entry_path"),
    last_path: getString(session, "last_path"),
    customer: customerMap[customerId] || null,
    ip_display: ip.ip_display,
    ip_resolution_status: ip.ip_resolution_status,
  };
}

function entityName(record) {
  return getString(record, "name") || getString(record, "title") || getString(record, "slug");
}

function buildPageviewLabelMaps(app, storeId, pageviews) {
  const requested = { product: [], category: [], subcategory: [] };
  pageviews.forEach((pageview) => {
    const pageType = getString(pageview, "page_type");
    const entityId = getString(pageview, "entity_id");
    if (requested[pageType] && isValidRecordId(entityId)) requested[pageType].push(entityId);
  });

  const labels = { product: {}, category: {}, subcategory: {} };
  [
    ["product", "products"],
    ["category", "categories"],
    ["subcategory", "subcategories"],
  ].forEach((entry) => {
    const kind = entry[0];
    const collection = entry[1];
    getStoreRecordsByIds(app, collection, storeId, uniqueIds(requested[kind])).forEach((record) => {
      const name = entityName(record);
      if (name) labels[kind][record.id] = name;
    });
  });
  return labels;
}

function pageviewResolvedLabel(pageview, labels) {
  const pageType = getString(pageview, "page_type");
  const entityId = getString(pageview, "entity_id");
  if (pageType === "store_home") return "Inicio de tienda";
  if (pageType === "product") return labels.product[entityId] || "Producto";
  if (pageType === "category") return labels.category[entityId] || "Categoria";
  if (pageType === "subcategory") return labels.subcategory[entityId] || "Subcategoria";
  if (pageType === "gifts") return "Regalos";
  if (pageType === "search") return "Buscar";
  if (pageType === "checkout") return "Checkout";
  if (pageType === "landing_qr") return "Landing QR";
  return getString(pageview, "path") || "Otra pagina publica";
}

function serializeVisitorPageview(pageview, settings, labels) {
  const ip = getRecordIpDisplay(pageview, settings);
  const path = getString(pageview, "path");
  const openPath = normalizePath(path);
  return {
    id: pageview.id,
    page_type: getString(pageview, "page_type"),
    entity_type: getString(pageview, "entity_type"),
    entity_id: getString(pageview, "entity_id"),
    path,
    occurred_at: getString(pageview, "occurred_at"),
    ip_display: ip.ip_display,
    ip_resolution_status: ip.ip_resolution_status,
    resolved_label: pageviewResolvedLabel(pageview, labels),
    can_open: Boolean(openPath),
    open_path: openPath,
  };
}

function handleSecurityActivityPage(e) {
  setNoStore(e, true);
  try {
    const info = e.requestInfo();
    const payload = parseActivityPagePayload(info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });
    const access = getAuthorizedSecuritySettings(info, payload.storeId);
    if (!access) return e.json(403, { ok: false, error: "unauthorized" });

    const filters = ["store = {:store}"];
    const params = { store: payload.storeId };
    if (payload.eventType !== "all") {
      filters.push("event_type = {:eventType}");
      params.eventType = payload.eventType;
    }
    if (payload.riskLevel !== "all") {
      filters.push("risk_level = {:riskLevel}");
      params.riskLevel = payload.riskLevel;
    }
    const result = listSecurityPage(
      $app,
      SECURITY_EVENTS_COLLECTION,
      filters.join(" && "),
      "-occurred_at,-id",
      payload.page,
      params
    );
    const customerMap = buildSanitizedCustomerMap($app, payload.storeId, result.items.map((event) => getRelationId(event, "customer")));
    const orderMap = buildSanitizedOrderMap($app, payload.storeId, result.items.map((event) => getRelationId(event, "order")));
    return e.json(200, {
      ok: true,
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      items: result.items.map((event) => serializeActivityEvent(event, access.settings, customerMap, orderMap)),
    });
  } catch (_) {
    logSecurity("error", "PZ_SEC_ACTIVITY_PAGE_FAILED");
    return e.json(500, { ok: false, error: "activity_page_failed" });
  }
}

function handleSecurityVisitorsPage(e) {
  setNoStore(e, true);
  try {
    const info = e.requestInfo();
    const payload = parseVisitorsPagePayload(info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });
    const access = getAuthorizedSecuritySettings(info, payload.storeId);
    if (!access) return e.json(403, { ok: false, error: "unauthorized" });

    const result = listSecurityPage(
      $app,
      VISITOR_SESSIONS_COLLECTION,
      "store = {:store} && day = {:day}",
      "-last_seen_at,-id",
      payload.page,
      { store: payload.storeId, day: payload.day }
    );
    const customerMap = buildSanitizedCustomerMap($app, payload.storeId, result.items.map((session) => getRelationId(session, "customer")));
    return e.json(200, {
      ok: true,
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      items: result.items.map((session) => serializeVisitorSession(session, access.settings, customerMap)),
    });
  } catch (_) {
    logSecurity("error", "PZ_SEC_VISITORS_PAGE_FAILED");
    return e.json(500, { ok: false, error: "visitors_page_failed" });
  }
}

function handleSecurityVisitorDetail(e) {
  setNoStore(e, true);
  try {
    const info = e.requestInfo();
    const payload = parseVisitorDetailPayload(info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });
    const access = getAuthorizedSecuritySettings(info, payload.storeId);
    if (!access) return e.json(403, { ok: false, error: "unauthorized" });

    const visitor = findRecordByIdSafe($app, VISITOR_SESSIONS_COLLECTION, payload.visitorSessionId);
    if (!visitor || getRelationId(visitor, "store") !== payload.storeId) {
      return e.json(404, { ok: false, error: "not_found" });
    }
    const customerMap = buildSanitizedCustomerMap($app, payload.storeId, [getRelationId(visitor, "customer")]);
    const pageviews = listSecurityPage(
      $app,
      VISITOR_PAGEVIEWS_COLLECTION,
      "store = {:store} && visitor_session = {:visitorSession}",
      "occurred_at,id",
      payload.page,
      { store: payload.storeId, visitorSession: visitor.id }
    );
    const labels = buildPageviewLabelMaps($app, payload.storeId, pageviews.items);
    return e.json(200, {
      ok: true,
      visitor: serializeVisitorSession(visitor, access.settings, customerMap),
      pageviews: {
        page: pageviews.page,
        perPage: pageviews.perPage,
        totalItems: pageviews.totalItems,
        totalPages: pageviews.totalPages,
        items: pageviews.items.map((pageview) => serializeVisitorPageview(pageview, access.settings, labels)),
      },
    });
  } catch (_) {
    logSecurity("error", "PZ_SEC_VISITOR_DETAIL_FAILED");
    return e.json(500, { ok: false, error: "visitor_detail_failed" });
  }
}

function isAllowedSummaryPayload(body) {
  const keys = getBodyKeys(body);
  if (keys.length !== 1 || keys[0] !== "store_id") return false;
  return isValidRecordId(getBodyValue(body, "store_id"));
}

function customerArchivedFilter(archived) {
  return archived
    ? "store = {:store} && merged_into = \"\" && archived = true"
    : "store = {:store} && merged_into = \"\" && archived = false";
}

function isValidHmacValue(value) {
  const text = String(value || "").trim();
  return text.length >= 32 && text.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(text);
}

function uniqueHmacValues(values) {
  const result = [];
  (values || []).forEach((value) => {
    const text = String(value || "").trim();
    if (isValidHmacValue(text) && !result.includes(text)) result.push(text);
  });
  return result;
}

function collectHmacFromRecords(records, field) {
  return uniqueHmacValues((records || []).map((record) => getString(record, field)));
}

function collectCustomerSignalSnapshot(app, storeId, canonicalCustomerId) {
  const customerIds = collectCanonicalAndAliasIds(app, storeId, canonicalCustomerId);
  const phones = listByStoreRelation(app, STORE_CUSTOMER_PHONES_COLLECTION, storeId, "customer", customerIds, "");
  const devices = listByStoreRelation(app, STORE_CUSTOMER_DEVICES_COLLECTION, storeId, "customer", customerIds, "");
  const events = listByStoreRelation(app, SECURITY_EVENTS_COLLECTION, storeId, "customer", customerIds, "");
  const sessions = listByStoreRelation(app, VISITOR_SESSIONS_COLLECTION, storeId, "customer", customerIds, "");

  return {
    phone: collectHmacFromRecords(phones, "phone_hmac"),
    device: collectHmacFromRecords(devices, "browser_token_hmac"),
    ip: uniqueHmacValues(
      collectHmacFromRecords(devices, "latest_ip_hmac")
        .concat(collectHmacFromRecords(events, "ip_hmac"))
        .concat(collectHmacFromRecords(sessions, "latest_ip_hmac"))
    ),
  };
}

function availableSignalsFromSnapshot(snapshot) {
  return {
    phone_count: (snapshot && snapshot.phone ? snapshot.phone.length : 0),
    device_count: (snapshot && snapshot.device ? snapshot.device.length : 0),
    ip_count: (snapshot && snapshot.ip ? snapshot.ip.length : 0),
  };
}

function getActiveBlocksForCustomer(app, storeId, customerId) {
  if (!findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) return [];
  return listRecordsPaged(
    app,
    STORE_SECURITY_BLOCKS_COLLECTION,
    "store = {:store} && customer = {:customer} && status = \"active\"",
    "-created",
    { store: storeId, customer: customerId },
    100
  );
}

function hasActiveBlocksForCustomer(app, storeId, customerId) {
  return getActiveBlocksForCustomer(app, storeId, customerId).length > 0;
}

function getBlockRestoreStatus(customer) {
  const status = getString(customer, "block_restore_status");
  return status === "watch" || status === "normal" ? status : "normal";
}

function setCustomerBlockedState(app, storeId, customer, activeBlocksBeforeCreate) {
  const activeBlocks = typeof activeBlocksBeforeCreate === "number"
    ? activeBlocksBeforeCreate
    : getActiveBlocksForCustomer(app, storeId, customer.id).length;
  if (activeBlocks <= 0) {
    const current = getString(customer, "status");
    customer.set("block_restore_status", current === "watch" ? "watch" : "normal");
  }
  customer.set("status", "blocked");
  app.save(customer);
}

function restoreCustomerBlockStateIfNeeded(app, storeId, customer) {
  const activeBlocks = getActiveBlocksForCustomer(app, storeId, customer.id);
  if (activeBlocks.length > 0) {
    if (getString(customer, "status") !== "blocked") {
      customer.set("status", "blocked");
      app.save(customer);
    }
    return "blocked";
  }

  const restored = getBlockRestoreStatus(customer);
  customer.set("status", restored);
  customer.set("block_restore_status", "");
  app.save(customer);
  return restored;
}

function blockScopesOverlap(left, right) {
  if (left === "full_access" || right === "full_access") return true;
  if (left === "all_interactions" && ["orders", "reviews", "raffles", "all_interactions"].includes(right)) return true;
  if (right === "all_interactions" && ["orders", "reviews", "raffles", "all_interactions"].includes(left)) return true;
  return left === right;
}

function hasOverlappingActiveBlock(app, storeId, customerId, scope) {
  return getActiveBlocksForCustomer(app, storeId, customerId)
    .some((block) => blockScopesOverlap(getString(block, "scope"), scope));
}

function durationExpiresAt(duration, now) {
  if (duration === "permanent") return "";
  const date = new Date(now.getTime());
  if (duration === "hours_24") date.setUTCHours(date.getUTCHours() + 24);
  else if (duration === "days_7") date.setUTCDate(date.getUTCDate() + 7);
  else if (duration === "days_30") date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString();
}

function signalSummaryFromBlock(block) {
  return {
    phone: getBoolean(block, "match_phone"),
    device: getBoolean(block, "match_device"),
    ip: getBoolean(block, "match_ip"),
    mode: getString(block, "match_mode") || "any",
  };
}

function serializeSecurityBlock(block) {
  return {
    id: block.id,
    customer_id: getRelationId(block, "customer"),
    scope: getString(block, "scope"),
    status: getString(block, "status"),
    duration: getString(block, "duration"),
    starts_at: getString(block, "starts_at"),
    expires_at: getString(block, "expires_at"),
    created: getString(block, "created"),
    revoked_at: getString(block, "revoked_at"),
    signal_summary: signalSummaryFromBlock(block),
  };
}

function serializeBlockForList(app, storeId, block, customerMap, actorMap) {
  const customerId = getRelationId(block, "customer");
  const customer = customerMap[customerId] || null;
  const actorId = getRelationId(block, "created_by");
  const base = serializeSecurityBlock(block);
  return {
    ...base,
    customer_name: customer ? getString(customer, "display_name") : "",
    primary_phone: customer ? primaryPhoneForCustomer(app, storeId, customer) : "",
    created_by_name: actorMap[actorId] || "",
  };
}

function isDateDue(value, now) {
  const text = String(value || "").trim();
  if (!text) return false;
  const time = Date.parse(text);
  return Number.isFinite(time) && time <= now.getTime();
}

function createSecurityBlockAudit(app, storeId, action, actorId, block, reason) {
  createSecurityAudit(app, storeId, action, actorId, getRelationId(block, "customer"), reason, {}, {
    blockRecordId: block.id,
    blockScope: getString(block, "scope"),
    blockExpiresAt: getString(block, "expires_at"),
  });
}

function expireDueSecurityBlocks(app) {
  if (!findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) return { expired: 0 };
  const now = new Date();
  let expiredCount = 0;

  const activeBlocks = listRecordsPaged(
    app,
    STORE_SECURITY_BLOCKS_COLLECTION,
    'status = "active" && expires_at != ""',
    "expires_at",
    {},
    200
  );

  activeBlocks.map((block) => block.id).forEach((blockId) => {
    let expired = false;
    app.runInTransaction((txApp) => {
      const block = findRecordByIdSafe(txApp, STORE_SECURITY_BLOCKS_COLLECTION, blockId);
      if (!block || getString(block, "status") !== "active") return;
      if (!isDateDue(getString(block, "expires_at"), now)) return;

      const storeId = getRelationId(block, "store");
      const customerId = getRelationId(block, "customer");
      const customer = findRecordByIdSafe(txApp, STORE_CUSTOMERS_COLLECTION, customerId);
      block.set("status", "expired");
      txApp.save(block);
      createSecurityBlockAudit(txApp, storeId, "block_expired", "", block, "automatic expiration");
      if (customer && getRelationId(customer, "store") === storeId) {
        restoreCustomerBlockStateIfNeeded(txApp, storeId, customer);
      }
      expired = true;
    });
    if (expired) expiredCount += 1;
  });

  return { expired: expiredCount };
}

function primaryPhoneForCustomer(app, storeId, customer) {
  const primaryPhone = findCollectionSafe(app, STORE_CUSTOMER_PHONES_COLLECTION)
    ? findFirstByFilter(
      app,
      STORE_CUSTOMER_PHONES_COLLECTION,
      "store = {:store} && customer = {:customer} && is_primary = true",
      { store: storeId, customer: customer.id }
    )
    : null;
  return primaryPhone ? getString(primaryPhone, "phone_normalized") : getString(customer, "phone_normalized");
}

function normalizePhoneSearch(value) {
  const text = String(value || "").trim();
  if (!text || !/^[\d\s()+.-]+$/.test(text)) return "";
  return text.replace(/\D/g, "").slice(0, 15);
}

function activeBlockCustomerIds(app, storeId) {
  if (!findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) return [];
  const ids = [];
  listRecordsPaged(
    app,
    STORE_SECURITY_BLOCKS_COLLECTION,
    "store = {:store} && status = \"active\"",
    "",
    { store: storeId },
    200
  ).forEach((block) => {
    const customerId = getRelationId(block, "customer");
    if (isValidRecordId(customerId) && !ids.includes(customerId)) ids.push(customerId);
  });
  return ids;
}

function countActiveBlockedCustomers(app, storeId) {
  const ids = activeBlockCustomerIds(app, storeId);
  if (!ids.length) return 0;
  return getStoreRecordsByIds(app, STORE_CUSTOMERS_COLLECTION, storeId, ids)
    .filter((customer) => !getBoolean(customer, "archived") && !getRelationId(customer, "merged_into"))
    .length;
}

function countWatchCustomersWithoutActiveBlocks(app, storeId) {
  const activeIds = activeBlockCustomerIds(app, storeId);
  return listRecordsPaged(
    app,
    STORE_CUSTOMERS_COLLECTION,
    "store = {:store} && merged_into = \"\" && archived = false && status = \"watch\"",
    "",
    { store: storeId },
    200
  ).filter((customer) => !activeIds.includes(customer.id)).length;
}

function handleMonitoringSummary(e) {
  setNoStore(e, true);

  try {
    const info = e.requestInfo();
    const auth = info.auth;
    const role = authRole(auth);
    const authStoreId = authStore(auth);
    const body = info.body || {};

    if (!isAllowedSummaryPayload(body)) {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }

    const storeId = String(getBodyValue(body, "store_id") || "");
    if (!canReadStore(role, authStoreId, storeId)) {
      return e.json(403, { ok: false, error: "unauthorized" });
    }

    const settings = getReadableSecuritySettings($app, storeId, role);
    if (!settings) {
      return e.json(403, { ok: false, error: "security_disabled" });
    }

    expireDueSecurityBlocks($app);

    const today = getHavanaDay(new Date());
    const activeFilter = customerArchivedFilter(false);

    return e.json(200, {
      ok: true,
      active_customers_count: countRecordsByFilter($app, STORE_CUSTOMERS_COLLECTION, activeFilter, { store: storeId }),
      archived_customers_count: countRecordsByFilter($app, STORE_CUSTOMERS_COLLECTION, customerArchivedFilter(true), { store: storeId }),
      events_count: countRecordsByFilter($app, SECURITY_EVENTS_COLLECTION, "store = {:store}", { store: storeId }),
      visitors_today_count: countRecordsByFilter($app, VISITOR_SESSIONS_COLLECTION, "store = {:store} && day = {:day}", { store: storeId, day: today }),
      watch_customers_count: countWatchCustomersWithoutActiveBlocks($app, storeId),
      blocked_customers_count: countActiveBlockedCustomers($app, storeId),
    });
  } catch (_) {
    logSecurity("error", "PZ_SEC_SUMMARY_FAILED");
    return e.json(500, { ok: false, error: "summary_failed" });
  }
}

function serializeCustomerSafe(app, storeId, customer) {
  const primaryPhone = findCollectionSafe(app, STORE_CUSTOMER_PHONES_COLLECTION)
    ? findFirstByFilter(
      app,
      STORE_CUSTOMER_PHONES_COLLECTION,
      "store = {:store} && customer = {:customer} && is_primary = true",
      { store: storeId, customer: customer.id }
    )
    : null;
  const primaryPhoneValue = primaryPhone ? getString(primaryPhone, "phone_normalized") : getString(customer, "phone_normalized");

  return {
    id: customer.id,
    store: storeId,
    display_name: getString(customer, "display_name"),
    primary_phone: primaryPhoneValue,
    phone_normalized: primaryPhoneValue,
    first_order_at: getString(customer, "first_order_at"),
    last_order_at: getString(customer, "last_order_at"),
    last_order: getRelationId(customer, "last_order"),
    orders_count: Math.max(0, getNumber(customer, "orders_count")),
    pending_orders_count: Math.max(0, getNumber(customer, "pending_orders_count")),
    confirmed_orders_count: Math.max(0, getNumber(customer, "confirmed_orders_count")),
    preparing_orders_count: Math.max(0, getNumber(customer, "preparing_orders_count")),
    delivered_orders_count: Math.max(0, getNumber(customer, "delivered_orders_count")),
    cancelled_orders_count: Math.max(0, getNumber(customer, "cancelled_orders_count")),
    confirmed_total_usd: Math.max(0, getNumber(customer, "confirmed_total_usd")),
    phones_count: Math.max(0, getNumber(customer, "phones_count")),
    devices_count: Math.max(0, getNumber(customer, "devices_count")),
    last_address: getString(customer, "last_address"),
    last_municipality: getString(customer, "last_municipality"),
    status: getString(customer, "status") || "normal",
    archived: getBoolean(customer, "archived"),
    archived_at: getString(customer, "archived_at"),
    created: getString(customer, "created"),
    updated: getString(customer, "updated"),
  };
}

function buildCustomerOrdersDetail(app, storeId, customerId, page) {
  const result = listDetailPage(
    app,
    ORDERS_COLLECTION,
    "store = {:store} && customer = {:customer}",
    "-created",
    page,
    { store: storeId, customer: customerId }
  );

  return {
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    items: result.items.map(serializeOrder),
  };
}

function buildCustomerEventsDetail(app, storeId, customerId, page, settings) {
  const result = listDetailPage(
    app,
    SECURITY_EVENTS_COLLECTION,
    "store = {:store} && customer = {:customer}",
    "-occurred_at,-created",
    page,
    { store: storeId, customer: customerId }
  );
  const orderMap = buildOrderMap(app, storeId, result.items.map((event) => getRelationId(event, "order")));

  return {
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    items: result.items.map((event) => serializeEvent(event, settings, orderMap)),
  };
}

function buildCustomerPhonesDetail(app, storeId, customerId) {
  if (!findCollectionSafe(app, STORE_CUSTOMER_PHONES_COLLECTION)) return [];
  const phones = app.findRecordsByFilter(
    STORE_CUSTOMER_PHONES_COLLECTION,
    "store = {:store} && customer = {:customer}",
    "-is_primary,-last_seen_at,-updated",
    100,
    0,
    { store: storeId, customer: customerId }
  ) || [];

  return phones.map((phone) => ({
    phone_normalized: getString(phone, "phone_normalized"),
    first_seen_at: getString(phone, "first_seen_at"),
    last_seen_at: getString(phone, "last_seen_at"),
    orders_count: getNumber(phone, "orders_count"),
    is_primary: getString(phone, "is_primary") === "true" || phone.get("is_primary") === true,
  }));
}

function getDeviceIpDisplay(device, settings) {
  const visibility = getString(settings, "ip_visibility") || "hidden";
  const masked = getString(device, "latest_ip_masked");

  if (visibility === "hidden") {
    return { ip_display: "", ip_resolution_status: "hidden" };
  }

  if (visibility === "partial") {
    return {
      ip_display: masked,
      ip_resolution_status: masked ? "masked" : "unavailable",
    };
  }

  if (visibility === "full") {
    const fullIp = decryptIp(getString(device, "latest_ip_encrypted"));
    if (fullIp) return { ip_display: fullIp, ip_resolution_status: "full" };
    return {
      ip_display: masked,
      ip_resolution_status: masked ? "full_unavailable" : "unavailable",
    };
  }

  return { ip_display: "", ip_resolution_status: "hidden" };
}

function buildCustomerDevicesDetail(app, storeId, customerId, settings) {
  if (!findCollectionSafe(app, STORE_CUSTOMER_DEVICES_COLLECTION)) return [];
  const devices = app.findRecordsByFilter(
    STORE_CUSTOMER_DEVICES_COLLECTION,
    "store = {:store} && customer = {:customer}",
    "first_seen_at,created",
    100,
    0,
    { store: storeId, customer: customerId }
  ) || [];

  return devices.map((device, index) => {
    const ip = getDeviceIpDisplay(device, settings);
    return {
      label: `Dispositivo ${index + 1}`,
      first_seen_at: getString(device, "first_seen_at"),
      last_seen_at: getString(device, "last_seen_at"),
      orders_count: getNumber(device, "orders_count"),
      ip_display: ip.ip_display,
      ip_resolution_status: ip.ip_resolution_status,
    };
  });
}

function buildCustomerLinksSummary(app, storeId, customerId) {
  if (!findCollectionSafe(app, STORE_CUSTOMER_LINKS_COLLECTION)) {
    return { active_links: 0, auto_device: 0, auto_phone: 0, manual: 0, backfill: 0 };
  }
  const links = app.findRecordsByFilter(
    STORE_CUSTOMER_LINKS_COLLECTION,
    "store = {:store} && canonical_customer = {:customer} && status = \"active\"",
    "-created",
    100,
    0,
    { store: storeId, customer: customerId }
  ) || [];
  const summary = { active_links: links.length, auto_device: 0, auto_phone: 0, manual: 0, backfill: 0 };
  links.forEach((link) => {
    const type = getString(link, "link_type");
    if (Object.prototype.hasOwnProperty.call(summary, type)) summary[type] += 1;
  });
  return summary;
}

function buildCustomerLifecycleCounts(app, storeId, customerId) {
  const ids = [customerId];
  const sessions = listByStoreRelation(app, VISITOR_SESSIONS_COLLECTION, storeId, "customer", ids, "");
  const sessionIds = sessions.map((session) => session.id);
  let pageviewsAffected = countByStoreRelation(app, VISITOR_PAGEVIEWS_COLLECTION, storeId, "customer", ids);
  const sessionPageviews = listByStoreRelation(app, VISITOR_PAGEVIEWS_COLLECTION, storeId, "visitor_session", sessionIds, "");
  const seenPageviews = {};
  listByStoreRelation(app, VISITOR_PAGEVIEWS_COLLECTION, storeId, "customer", ids, "").forEach((pageview) => {
    seenPageviews[pageview.id] = true;
  });
  sessionPageviews.forEach((pageview) => {
    if (!seenPageviews[pageview.id]) pageviewsAffected += 1;
  });

  return {
    orders_affected: countByStoreRelation(app, ORDERS_COLLECTION, storeId, "customer", ids),
    events_affected: countByStoreRelation(app, SECURITY_EVENTS_COLLECTION, storeId, "customer", ids),
    phones_affected: countByStoreRelation(app, STORE_CUSTOMER_PHONES_COLLECTION, storeId, "customer", ids),
    devices_affected: countByStoreRelation(app, STORE_CUSTOMER_DEVICES_COLLECTION, storeId, "customer", ids),
    sessions_affected: sessions.length,
    pageviews_affected: pageviewsAffected,
  };
}

function buildBlockHistorySummary(app, storeId, customerId) {
  const summary = { active: 0, expired: 0, revoked: 0 };
  if (!findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) return summary;
  listRecordsPaged(
    app,
    STORE_SECURITY_BLOCKS_COLLECTION,
    "store = {:store} && customer = {:customer}",
    "",
    { store: storeId, customer: customerId },
    200
  ).forEach((block) => {
    const status = getString(block, "status");
    if (Object.prototype.hasOwnProperty.call(summary, status)) summary[status] += 1;
  });
  return summary;
}

function buildActiveBlocksDetail(app, storeId, customerId) {
  return getActiveBlocksForCustomer(app, storeId, customerId).map(serializeSecurityBlock);
}

function buildIdentityWarnings(phones, devices, linksSummary) {
  const warnings = ["La IP es una señal de red y no confirma identidad."];
  if (phones.length > 1 && devices.length === 1) {
    warnings.unshift(`Este dispositivo utilizó ${phones.length} teléfonos diferentes.`);
  }
  if ((linksSummary.auto_device || 0) > 0 || (linksSummary.backfill || 0) > 0) {
    warnings.unshift("Este cliente fue consolidado automáticamente por coincidencia de dispositivo o teléfono.");
  }
  return warnings;
}

function handleCustomerDetail(e) {
  setNoStore(e, true);

  try {
    const info = e.requestInfo();
    const auth = info.auth;
    const role = authRole(auth);
    const authStoreId = authStore(auth);
    const body = info.body || {};

    if (!isAllowedCustomerDetailPayload(body)) {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }

    const storeId = String(getBodyValue(body, "store_id") || "");
    const customerId = String(getBodyValue(body, "customer_id") || "");
    const ordersPage = normalizePositivePage(getBodyValue(body, "orders_page"));
    const eventsPage = normalizePositivePage(getBodyValue(body, "events_page"));

    if (!canReadStore(role, authStoreId, storeId)) {
      return e.json(403, { ok: false, error: "unauthorized" });
    }

    const settings = getReadableSecuritySettings($app, storeId, role);
    if (!settings) {
      return e.json(403, { ok: false, error: "security_disabled" });
    }

    expireDueSecurityBlocks($app);

    const requestedCustomer = findFirstByFilter(
      $app,
      STORE_CUSTOMERS_COLLECTION,
      "id = {:customer} && store = {:store}",
      { customer: customerId, store: storeId }
    );
    const customer = requestedCustomer ? resolveCanonicalCustomer($app, storeId, requestedCustomer) : null;
    if (!customer) {
      return e.json(404, { ok: false, error: "not_found" });
    }

    const canonicalCustomerId = customer.id;
    const phones = buildCustomerPhonesDetail($app, storeId, canonicalCustomerId);
    const devices = buildCustomerDevicesDetail($app, storeId, canonicalCustomerId, settings);
    const linksSummary = buildCustomerLinksSummary($app, storeId, canonicalCustomerId);
    const signalSnapshot = collectCustomerSignalSnapshot($app, storeId, canonicalCustomerId);

    const response = {
      ok: true,
      customer: serializeCustomerSafe($app, storeId, customer),
      orders: emptyDetailPage(ordersPage),
      events: emptyDetailPage(eventsPage),
      phones,
      devices,
      links_summary: linksSummary,
      lifecycle_counts: buildCustomerLifecycleCounts($app, storeId, canonicalCustomerId),
      active_blocks: buildActiveBlocksDetail($app, storeId, canonicalCustomerId),
      block_history_summary: buildBlockHistorySummary($app, storeId, canonicalCustomerId),
      block_capabilities: blockCapabilities(settings),
      available_signals: availableSignalsFromSnapshot(signalSnapshot),
      identity_warnings: buildIdentityWarnings(phones, devices, linksSummary),
      orders_error: false,
      events_error: false,
    };

    try {
      response.orders = buildCustomerOrdersDetail($app, storeId, canonicalCustomerId, ordersPage);
    } catch (_) {
      response.orders_error = true;
      logSecurity("error", "PZ_SEC_CUSTOMER_DETAIL_ORDERS_FAILED");
    }

    try {
      response.events = buildCustomerEventsDetail($app, storeId, canonicalCustomerId, eventsPage, settings);
    } catch (_) {
      response.events_error = true;
      logSecurity("error", "PZ_SEC_CUSTOMER_DETAIL_EVENTS_FAILED");
    }

    return e.json(200, response);
  } catch (_) {
    logSecurity("error", "PZ_SEC_CUSTOMER_DETAIL_FAILED");
    return e.json(500, { ok: false, error: "customer_detail_failed" });
  }
}

function sanitizeLifecycleReason(value) {
  return limitText(String(value || "")
    .replace(/[a-f0-9]{32,}/gi, "[redactado]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[telefono]")
    .replace(/\b(token|secret|hmac|ciphertext|password|clave|secreto)\b/gi, "[redactado]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim(), 500);
}

function parseLifecyclePayload(body) {
  const allowed = ["store_id", "customer_id", "action", "reason"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length) return { error: "payload" };
  if (keys.some((key) => !allowed.includes(key))) return { error: "payload" };

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const customerId = String(getBodyValue(body, "customer_id") || "").trim();
  const action = String(getBodyValue(body, "action") || "").trim();
  const reason = sanitizeLifecycleReason(getBodyValue(body, "reason"));

  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!isValidRecordId(customerId)) return { error: "customer_id" };
  if (!["archive", "restore", "delete_profile"].includes(action)) return { error: "action" };
  if (!reason) return { error: "reason" };

  return { storeId, customerId, action, reason };
}

function createSecurityAudit(app, storeId, action, actorId, subjectRecordId, reason, counts, blockInfo) {
  const collection = app.findCollectionByNameOrId(STORE_SECURITY_AUDIT_COLLECTION);
  const audit = new Record(collection, {});
  const safeCounts = counts || {};
  const safeBlockInfo = blockInfo || {};

  audit.set("store", storeId);
  audit.set("action", action);
  if (actorId) audit.set("actor", actorId);
  audit.set("subject_record_id", String(subjectRecordId || "").slice(0, 40));
  audit.set("reason_internal", sanitizeLifecycleReason(reason));
  audit.set("orders_affected", Math.max(0, Number(safeCounts.orders_affected || 0)));
  audit.set("events_affected", Math.max(0, Number(safeCounts.events_affected || 0)));
  audit.set("phones_affected", Math.max(0, Number(safeCounts.phones_affected || 0)));
  audit.set("devices_affected", Math.max(0, Number(safeCounts.devices_affected || 0)));
  audit.set("sessions_affected", Math.max(0, Number(safeCounts.sessions_affected || 0)));
  audit.set("pageviews_affected", Math.max(0, Number(safeCounts.pageviews_affected || 0)));
  if (collectionHasField(app, STORE_SECURITY_AUDIT_COLLECTION, "block_record_id")) {
    audit.set("block_record_id", String(safeBlockInfo.blockRecordId || "").slice(0, 40));
  }
  if (collectionHasField(app, STORE_SECURITY_AUDIT_COLLECTION, "block_scope")) {
    const scope = String(safeBlockInfo.blockScope || "");
    audit.set("block_scope", SECURITY_BLOCK_SCOPES.includes(scope) ? scope : "");
  }
  if (collectionHasField(app, STORE_SECURITY_AUDIT_COLLECTION, "block_expires_at")) {
    audit.set("block_expires_at", String(safeBlockInfo.blockExpiresAt || ""));
  }
  app.save(audit);
}

function collectCanonicalAndAliasIds(app, storeId, canonicalId) {
  const ids = [canonicalId];
  let cursor = 0;

  while (cursor < ids.length) {
    const parentId = ids[cursor];
    cursor += 1;
    const aliases = listRecordsPaged(
      app,
      STORE_CUSTOMERS_COLLECTION,
      "store = {:store} && merged_into = {:parent}",
      "",
      { store: storeId, parent: parentId },
      200
    );
    aliases.forEach((alias) => {
      if (getRelationId(alias, "store") === storeId && !ids.includes(alias.id)) ids.push(alias.id);
    });
  }

  return ids;
}

function uniqueRecords(records) {
  const seen = {};
  const result = [];
  (records || []).forEach((record) => {
    if (!record || seen[record.id]) return;
    seen[record.id] = true;
    result.push(record);
  });
  return result;
}

function collectCustomerLinks(app, storeId, customerIds, canonicalId) {
  if (!findCollectionSafe(app, STORE_CUSTOMER_LINKS_COLLECTION)) return [];
  return uniqueRecords(
    listByStoreRelation(app, STORE_CUSTOMER_LINKS_COLLECTION, storeId, "linked_customer", customerIds, "")
      .concat(listByStoreRelation(app, STORE_CUSTOMER_LINKS_COLLECTION, storeId, "canonical_customer", [canonicalId], ""))
  );
}

function collectCustomerPageviews(app, storeId, customerIds, sessionIds) {
  if (!findCollectionSafe(app, VISITOR_PAGEVIEWS_COLLECTION)) return [];
  return uniqueRecords(
    listByStoreRelation(app, VISITOR_PAGEVIEWS_COLLECTION, storeId, "customer", customerIds, "")
      .concat(listByStoreRelation(app, VISITOR_PAGEVIEWS_COLLECTION, storeId, "visitor_session", sessionIds, ""))
  );
}

function countDeleteScope(scope) {
  return {
    orders_affected: scope.orders.length,
    events_affected: scope.events.length,
    phones_affected: scope.phones.length,
    devices_affected: scope.devices.length,
    sessions_affected: scope.sessions.length,
    pageviews_affected: scope.pageviews.length,
  };
}

function collectCustomerDeleteScope(app, storeId, canonicalId) {
  const customerIds = collectCanonicalAndAliasIds(app, storeId, canonicalId);
  const sessions = listByStoreRelation(app, VISITOR_SESSIONS_COLLECTION, storeId, "customer", customerIds, "");
  const sessionIds = sessions.map((session) => session.id);

  return {
    customerIds,
    orders: listByStoreRelation(app, ORDERS_COLLECTION, storeId, "customer", customerIds, ""),
    events: listByStoreRelation(app, SECURITY_EVENTS_COLLECTION, storeId, "customer", customerIds, ""),
    phones: listByStoreRelation(app, STORE_CUSTOMER_PHONES_COLLECTION, storeId, "customer", customerIds, ""),
    devices: listByStoreRelation(app, STORE_CUSTOMER_DEVICES_COLLECTION, storeId, "customer", customerIds, ""),
    links: collectCustomerLinks(app, storeId, customerIds, canonicalId),
    sessions,
    pageviews: collectCustomerPageviews(app, storeId, customerIds, sessionIds),
  };
}

function hasActiveCustomerBlocks(app, storeId, customerIds) {
  if (!findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) return false;
  if (!collectionHasField(app, STORE_SECURITY_BLOCKS_COLLECTION, "customer")) return false;

  const blocks = listByStoreRelation(app, STORE_SECURITY_BLOCKS_COLLECTION, storeId, "customer", customerIds, "");
  if (!blocks.length) return false;
  if (!collectionHasField(app, STORE_SECURITY_BLOCKS_COLLECTION, "status")) return true;
  return blocks.some((block) => ["active", "blocked"].includes(getString(block, "status")));
}

function eraseOrderSecurityIdentity(app, order, erasedAt) {
  order.set("customer", "");
  order.set("security_registered_at", "");
  if (collectionHasField(app, ORDERS_COLLECTION, "security_identity_erased_at")) {
    order.set("security_identity_erased_at", erasedAt);
  }
  app.save(order);
}

function deleteRecords(app, records) {
  (records || []).forEach((record) => app.delete(record));
}

function deleteInactiveCustomerBlocks(app, storeId, customerIds) {
  if (!findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) return;
  const blocks = listByStoreRelation(app, STORE_SECURITY_BLOCKS_COLLECTION, storeId, "customer", customerIds, "");
  deleteRecords(app, blocks.filter((block) => getString(block, "status") !== "active"));
}

function archiveCustomer(app, storeId, customer, actorId, reason) {
  if (getBoolean(customer, "archived")) return false;
  customer.set("archived", true);
  customer.set("archived_at", new Date().toISOString());
  customer.set("archived_by", actorId || "");
  customer.set("archive_reason", reason);
  app.save(customer);
  createSecurityAudit(app, storeId, "archive_customer", actorId, customer.id, reason, {});
  return true;
}

function restoreCustomer(app, storeId, customer, actorId, reason, auditAction) {
  if (!getBoolean(customer, "archived")) return false;
  customer.set("archived", false);
  customer.set("archived_at", "");
  customer.set("archived_by", "");
  customer.set("archive_reason", "");
  app.save(customer);
  createSecurityAudit(app, storeId, auditAction || "restore_customer", actorId, customer.id, reason, {});
  return true;
}

function deleteCustomerSecurityProfile(app, storeId, customer, actorId, reason) {
  const scope = collectCustomerDeleteScope(app, storeId, customer.id);
  if (hasActiveCustomerBlocks(app, storeId, scope.customerIds)) {
    return { error: "active_blocks" };
  }

  const erasedAt = new Date().toISOString();
  const counts = countDeleteScope(scope);
  deleteInactiveCustomerBlocks(app, storeId, scope.customerIds);
  scope.orders.forEach((order) => eraseOrderSecurityIdentity(app, order, erasedAt));
  deleteRecords(app, scope.pageviews);
  deleteRecords(app, scope.sessions);
  deleteRecords(app, scope.events);
  deleteRecords(app, scope.phones);
  deleteRecords(app, scope.devices);
  deleteRecords(app, scope.links);

  const aliasIds = scope.customerIds.filter((id) => id !== customer.id);
  deleteRecords(app, aliasIds.map((id) => findRecordByIdSafe(app, STORE_CUSTOMERS_COLLECTION, id)).filter(Boolean));
  app.delete(customer);
  createSecurityAudit(app, storeId, "delete_customer_profile", actorId, customer.id, reason, counts);
  return { counts };
}

function parseObservationPayload(body) {
  const allowed = ["store_id", "customer_id", "action", "reason"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const customerId = String(getBodyValue(body, "customer_id") || "").trim();
  const action = String(getBodyValue(body, "action") || "").trim();
  const reason = sanitizeLifecycleReason(getBodyValue(body, "reason"));
  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!isValidRecordId(customerId)) return { error: "customer_id" };
  if (action !== "enable" && action !== "disable") return { error: "action" };
  if (!reason) return { error: "reason" };
  return { storeId, customerId, action, reason };
}

function boolBodyValue(body, key) {
  const value = getBodyValue(body, key);
  if (value === true || value === false) return value;
  if (String(value) === "true") return true;
  if (String(value) === "false") return false;
  return null;
}

function parseBlockCreatePayload(body) {
  const allowed = ["store_id", "customer_id", "action", "scope", "duration", "match_phone", "match_device", "match_ip", "match_mode", "reason"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const customerId = String(getBodyValue(body, "customer_id") || "").trim();
  const action = String(getBodyValue(body, "action") || "").trim();
  const scope = String(getBodyValue(body, "scope") || "").trim();
  const duration = String(getBodyValue(body, "duration") || "").trim();
  const matchPhone = boolBodyValue(body, "match_phone");
  const matchDevice = boolBodyValue(body, "match_device");
  const matchIp = boolBodyValue(body, "match_ip");
  const matchMode = String(getBodyValue(body, "match_mode") || "").trim();
  const reason = sanitizeLifecycleReason(getBodyValue(body, "reason"));

  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!isValidRecordId(customerId)) return { error: "customer_id" };
  if (action !== "create") return { error: "action" };
  if (!SECURITY_BLOCK_SCOPES.includes(scope)) return { error: "scope" };
  if (!SECURITY_BLOCK_DURATIONS.includes(duration)) return { error: "duration" };
  if (matchPhone === null || matchDevice === null || matchIp === null) return { error: "signals" };
  if (!matchPhone && !matchDevice && !matchIp) return { error: "signals" };
  if (!SECURITY_BLOCK_MATCH_MODES.includes(matchMode)) return { error: "match_mode" };
  if (!reason) return { error: "reason" };
  return { storeId, customerId, action, scope, duration, matchPhone, matchDevice, matchIp, matchMode, reason };
}

function parseBlockRevokePayload(body) {
  const allowed = ["store_id", "block_id", "action", "reason"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const blockId = String(getBodyValue(body, "block_id") || "").trim();
  const action = String(getBodyValue(body, "action") || "").trim();
  const reason = sanitizeLifecycleReason(getBodyValue(body, "reason"));
  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!isValidRecordId(blockId)) return { error: "block_id" };
  if (action !== "revoke") return { error: "action" };
  if (!reason) return { error: "reason" };
  return { storeId, blockId, action, reason };
}

function parseBlockActionPayload(body) {
  const action = String(getBodyValue(body, "action") || "").trim();
  if (action === "create") return parseBlockCreatePayload(body);
  if (action === "revoke") return parseBlockRevokePayload(body);
  return { error: "action" };
}

function validateBlockCapabilities(settings, parsed) {
  if (!canBlockWithSettings(settings)) return { status: 403, error: "blocking_disabled" };
  if (parsed.scope === "full_access" && !getBoolean(settings, "full_access_blocking_enabled")) {
    return { status: 403, error: "full_access_disabled" };
  }
  if (parsed.duration === "permanent" && !getBoolean(settings, "permanent_blocks_enabled")) {
    return { status: 403, error: "permanent_disabled" };
  }
  return null;
}

function selectedSignalValues(snapshot, parsed) {
  const selected = {
    phone: parsed.matchPhone ? snapshot.phone : [],
    device: parsed.matchDevice ? snapshot.device : [],
    ip: parsed.matchIp ? snapshot.ip : [],
  };
  if (parsed.matchPhone && selected.phone.length < 1) return { error: "phone" };
  if (parsed.matchDevice && selected.device.length < 1) return { error: "device" };
  if (parsed.matchIp && selected.ip.length < 1) return { error: "ip" };
  return selected;
}

function createSecurityBlockRecord(app, storeId, customer, actorId, parsed, signals) {
  const now = new Date();
  const collection = app.findCollectionByNameOrId(STORE_SECURITY_BLOCKS_COLLECTION);
  const block = new Record(collection, {});
  block.set("store", storeId);
  block.set("customer", customer.id);
  block.set("scope", parsed.scope);
  block.set("status", "active");
  block.set("match_phone", parsed.matchPhone);
  block.set("match_device", parsed.matchDevice);
  block.set("match_ip", parsed.matchIp);
  block.set("match_mode", parsed.matchMode);
  block.set("phone_hmac_values", signals.phone || []);
  block.set("device_hmac_values", signals.device || []);
  block.set("ip_hmac_values", signals.ip || []);
  block.set("duration", parsed.duration);
  block.set("starts_at", now.toISOString());
  block.set("expires_at", durationExpiresAt(parsed.duration, now));
  block.set("reason_internal", parsed.reason);
  if (actorId) block.set("created_by", actorId);
  app.save(block);
  return block;
}

function handleCustomerObservation(e) {
  setNoStore(e, true);

  try {
    const info = e.requestInfo();
    const auth = info.auth;
    const role = authRole(auth);
    const authStoreId = authStore(auth);
    const parsed = parseObservationPayload(info.body || {});
    if (parsed.error) return e.json(400, { ok: false, error: "invalid_payload", parameter: parsed.error });
    if (!canReadStore(role, authStoreId, parsed.storeId)) return e.json(403, { ok: false, error: "unauthorized" });

    expireDueSecurityBlocks($app);
    const settings = getSecuritySettingsRecord($app, parsed.storeId);
    if (!canObserveWithSettings(settings)) return e.json(403, { ok: false, error: "security_disabled" });

    let result = null;
    $app.runInTransaction((txApp) => {
      const requested = findRecordByIdSafe(txApp, STORE_CUSTOMERS_COLLECTION, parsed.customerId);
      const customer = requested ? resolveCanonicalCustomer(txApp, parsed.storeId, requested) : null;
      if (!customer) {
        result = { status: 404 };
        return;
      }
      if (getBoolean(customer, "archived")) {
        result = { status: 409, error: "customer_archived" };
        return;
      }
      const actorId = getString(auth, "id");
      const nextStatus = parsed.action === "enable" ? "watch" : "normal";
      if (getString(customer, "status") === nextStatus) {
        result = { status: 200, customerId: customer.id, customerStatus: nextStatus, changed: false };
        return;
      }
      if (hasActiveBlocksForCustomer(txApp, parsed.storeId, customer.id)) {
        result = { status: 409, error: "active_blocks" };
        return;
      }
      customer.set("status", nextStatus);
      customer.set("block_restore_status", "");
      txApp.save(customer);
      createSecurityAudit(
        txApp,
        parsed.storeId,
        parsed.action === "enable" ? "customer_watch_enabled" : "customer_watch_disabled",
        actorId,
        customer.id,
        parsed.reason,
        {}
      );
      result = { status: 200, customerId: customer.id, customerStatus: nextStatus, changed: true };
    });

    if (!result || result.status === 404) return e.json(404, { ok: false, error: "not_found" });
    if (result.status === 409) return e.json(409, { ok: false, error: result.error || "conflict" });
    return e.json(200, { ok: true, customer_id: result.customerId, status: result.customerStatus, changed: result.changed });
  } catch (_) {
    logSecurity("error", "PZ_SEC_WATCH_UPDATE_FAILED");
    return e.json(500, { ok: false, error: "watch_update_failed" });
  }
}

function handleSecurityBlockCreate(e, auth, parsed) {
  const role = authRole(auth);
  const authStoreId = authStore(auth);
  if (!canReadStore(role, authStoreId, parsed.storeId)) return e.json(403, { ok: false, error: "unauthorized" });

  expireDueSecurityBlocks($app);
  const settings = getSecuritySettingsRecord($app, parsed.storeId);
  const capabilityError = validateBlockCapabilities(settings, parsed);
  if (capabilityError) return e.json(capabilityError.status, { ok: false, error: capabilityError.error });

  let result = null;
  $app.runInTransaction((txApp) => {
    const requested = findRecordByIdSafe(txApp, STORE_CUSTOMERS_COLLECTION, parsed.customerId);
    const customer = requested ? resolveCanonicalCustomer(txApp, parsed.storeId, requested) : null;
    if (!customer) {
      result = { status: 404 };
      return;
    }
    if (getBoolean(customer, "archived")) {
      result = { status: 409, error: "customer_archived" };
      return;
    }
    if (hasOverlappingActiveBlock(txApp, parsed.storeId, customer.id, parsed.scope)) {
      result = { status: 409, error: "overlapping_block" };
      return;
    }

    const snapshot = collectCustomerSignalSnapshot(txApp, parsed.storeId, customer.id);
    const signals = selectedSignalValues(snapshot, parsed);
    if (signals.error) {
      result = { status: 400, error: "signal_unavailable", signal: signals.error };
      return;
    }

    const activeBefore = getActiveBlocksForCustomer(txApp, parsed.storeId, customer.id).length;
    const actorId = getString(auth, "id");
    const block = createSecurityBlockRecord(txApp, parsed.storeId, customer, actorId, parsed, signals);
    setCustomerBlockedState(txApp, parsed.storeId, customer, activeBefore);
    createSecurityBlockAudit(txApp, parsed.storeId, "block_created", actorId, block, parsed.reason);
    result = { status: 200, block };
  });

  if (!result || result.status === 404) return e.json(404, { ok: false, error: "not_found" });
  if (result.status === 400) return e.json(400, { ok: false, error: result.error, signal: result.signal });
  if (result.status === 409) return e.json(409, { ok: false, error: result.error || "conflict" });
  return e.json(200, { ok: true, block: serializeSecurityBlock(result.block) });
}

function handleSecurityBlockRevoke(e, auth, parsed) {
  const role = authRole(auth);
  const authStoreId = authStore(auth);
  if (!canReadStore(role, authStoreId, parsed.storeId)) return e.json(403, { ok: false, error: "unauthorized" });

  expireDueSecurityBlocks($app);
  const settings = getSecuritySettingsRecord($app, parsed.storeId);
  if (!canBlockWithSettings(settings)) return e.json(403, { ok: false, error: "blocking_disabled" });

  let result = null;
  $app.runInTransaction((txApp) => {
    const block = findRecordByIdSafe(txApp, STORE_SECURITY_BLOCKS_COLLECTION, parsed.blockId);
    if (!block || getRelationId(block, "store") !== parsed.storeId) {
      result = { status: 404 };
      return;
    }
    if (getString(block, "status") !== "active") {
      result = { status: 409, error: "block_not_active" };
      return;
    }

    const customerId = getRelationId(block, "customer");
    const customer = findRecordByIdSafe(txApp, STORE_CUSTOMERS_COLLECTION, customerId);
    const actorId = getString(auth, "id");
    block.set("status", "revoked");
    block.set("revoked_at", new Date().toISOString());
    block.set("revoked_by", actorId || "");
    block.set("revoke_reason", parsed.reason);
    txApp.save(block);
    createSecurityBlockAudit(txApp, parsed.storeId, "block_revoked", actorId, block, parsed.reason);
    if (customer && getRelationId(customer, "store") === parsed.storeId) {
      restoreCustomerBlockStateIfNeeded(txApp, parsed.storeId, customer);
    }
    result = { status: 200, block };
  });

  if (!result || result.status === 404) return e.json(404, { ok: false, error: "not_found" });
  if (result.status === 409) return e.json(409, { ok: false, error: result.error || "conflict" });
  return e.json(200, { ok: true, block: serializeSecurityBlock(result.block) });
}

function handleSecurityBlockAction(e) {
  setNoStore(e, true);

  let action = "";
  try {
    const info = e.requestInfo();
    action = String(getBodyValue(info.body || {}, "action") || "");
    const parsed = parseBlockActionPayload(info.body || {});
    if (parsed.error) return e.json(400, { ok: false, error: "invalid_payload", parameter: parsed.error });
    if (parsed.action === "revoke") return handleSecurityBlockRevoke(e, info.auth, parsed);
    return handleSecurityBlockCreate(e, info.auth, parsed);
  } catch (_) {
    logSecurity("error", action === "revoke" ? "PZ_SEC_BLOCK_REVOKE_FAILED" : "PZ_SEC_BLOCK_CREATE_FAILED");
    return e.json(500, { ok: false, error: action === "revoke" ? "block_revoke_failed" : "block_create_failed" });
  }
}

function parseBlocksPagePayload(body) {
  const allowed = ["store_id", "page", "status", "scope", "search"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const page = normalizePositivePage(getBodyValue(body, "page"));
  const status = String(getBodyValue(body, "status") || "").trim();
  const scope = String(getBodyValue(body, "scope") || "").trim();
  const search = limitText(getBodyValue(body, "search"), 80);
  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!page) return { error: "page" };
  if (!SECURITY_BLOCK_STATUSES.includes(status)) return { error: "status" };
  if (!(scope === "all" || SECURITY_BLOCK_SCOPES.includes(scope))) return { error: "scope" };
  return { storeId, page, status, scope, search };
}

function blocksPageFilter(parsed) {
  const params = { store: parsed.storeId };
  const parts = ["store = {:store}"];
  if (parsed.status !== "all") parts.push(`status = "${parsed.status}"`);
  if (parsed.scope !== "all") parts.push(`scope = "${parsed.scope}"`);
  return { filter: parts.join(" && "), params };
}

function customerIdsMatchingBlockSearch(app, storeId, search) {
  const clean = normalizeSearchTerm(search);
  if (!clean) return null;
  const phoneSearch = normalizePhoneSearch(clean);
  const matches = {};

  if (phoneSearch && findCollectionSafe(app, STORE_CUSTOMER_PHONES_COLLECTION)) {
    listRecordsPaged(
      app,
      STORE_CUSTOMER_PHONES_COLLECTION,
      "store = {:store}",
      "",
      { store: storeId },
      200
    ).forEach((phone) => {
      if (getString(phone, "phone_normalized").includes(phoneSearch)) {
        const customerId = getRelationId(phone, "customer");
        if (customerId) matches[customerId] = true;
      }
    });
  }

  listRecordsPaged(
    app,
    STORE_CUSTOMERS_COLLECTION,
    "store = {:store} && merged_into = \"\"",
    "",
    { store: storeId },
    200
  ).forEach((customer) => {
    if (!phoneSearch && normalizeSearchTerm(getString(customer, "display_name")).includes(clean)) {
      matches[customer.id] = true;
    }
  });

  return matches;
}

function buildActorMap(app, ids) {
  const map = {};
  getRecordsByIds(app, "users", uniqueIds(ids)).forEach((user) => {
    const name = getString(user, "name") || getString(user, "display_name") || "Administrador";
    map[user.id] = name;
  });
  return map;
}

function blocksMetrics(blocks, nowValue) {
  const activeCustomerIds = [];
  const now = nowValue instanceof Date ? nowValue : new Date();
  const today = getHavanaDay(now);
  const metrics = { active_blocks: 0, affected_customers: 0, expires_today: 0, permanent_blocks: 0 };
  blocks.forEach((block) => {
    if (getString(block, "status") !== "active") return;
    metrics.active_blocks += 1;
    const customerId = getRelationId(block, "customer");
    if (customerId && !activeCustomerIds.includes(customerId)) activeCustomerIds.push(customerId);
    if (getString(block, "duration") === "permanent") metrics.permanent_blocks += 1;
    const expiresTime = Date.parse(getString(block, "expires_at"));
    if (Number.isFinite(expiresTime) && expiresTime >= now.getTime() && getHavanaDay(new Date(expiresTime)) === today) {
      metrics.expires_today += 1;
    }
  });
  metrics.affected_customers = activeCustomerIds.length;
  return metrics;
}

function handleSecurityBlocksPage(e) {
  setNoStore(e, true);

  try {
    const info = e.requestInfo();
    const auth = info.auth;
    const role = authRole(auth);
    const authStoreId = authStore(auth);
    const parsed = parseBlocksPagePayload(info.body || {});
    if (parsed.error) return e.json(400, { ok: false, error: "invalid_payload", parameter: parsed.error });
    if (!canReadStore(role, authStoreId, parsed.storeId)) return e.json(403, { ok: false, error: "unauthorized" });

    const settings = getReadableSecuritySettings($app, parsed.storeId, role);
    if (!settings) return e.json(403, { ok: false, error: "security_disabled" });

    expireDueSecurityBlocks($app);
    if (!findCollectionSafe($app, STORE_SECURITY_BLOCKS_COLLECTION)) {
      return e.json(200, {
        ok: true,
        blocks: { page: 1, perPage: SECURITY_BLOCKS_PER_PAGE, totalItems: 0, totalPages: 1, items: [] },
        metrics: { active_blocks: 0, affected_customers: 0, expires_today: 0, permanent_blocks: 0 },
      });
    }

    const built = blocksPageFilter(parsed);
    let blocks = listRecordsPaged($app, STORE_SECURITY_BLOCKS_COLLECTION, built.filter, "-created", built.params, 200);
    const searchMatches = customerIdsMatchingBlockSearch($app, parsed.storeId, parsed.search);
    if (searchMatches) blocks = blocks.filter((block) => searchMatches[getRelationId(block, "customer")] === true);

    const totalItems = blocks.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / SECURITY_BLOCKS_PER_PAGE));
    const safePage = Math.min(parsed.page, totalPages);
    const start = (safePage - 1) * SECURITY_BLOCKS_PER_PAGE;
    const pageItems = blocks.slice(start, start + SECURITY_BLOCKS_PER_PAGE);
    const customerMap = {};
    getStoreRecordsByIds($app, STORE_CUSTOMERS_COLLECTION, parsed.storeId, pageItems.map((block) => getRelationId(block, "customer"))).forEach((customer) => {
      customerMap[customer.id] = customer;
    });
    const actorMap = buildActorMap($app, pageItems.map((block) => getRelationId(block, "created_by")));

    return e.json(200, {
      ok: true,
      blocks: {
        page: safePage,
        perPage: SECURITY_BLOCKS_PER_PAGE,
        totalItems,
        totalPages,
        items: pageItems.map((block) => serializeBlockForList($app, parsed.storeId, block, customerMap, actorMap)),
      },
      metrics: blocksMetrics(blocks),
    });
  } catch (_) {
    logSecurity("error", "PZ_SEC_BLOCK_LIST_FAILED");
    return e.json(500, { ok: false, error: "blocks_page_failed" });
  }
}

function handleCustomerLifecycle(e) {
  setNoStore(e, true);

  let action = "";
  try {
    const info = e.requestInfo();
    const auth = info.auth;
    const role = authRole(auth);
    const authStoreId = authStore(auth);
    const parsed = parseLifecyclePayload(info.body || {});
    if (parsed.error) return e.json(400, { ok: false, error: "invalid_payload", parameter: parsed.error });
    action = parsed.action;

    if (!canReadStore(role, authStoreId, parsed.storeId)) {
      return e.json(403, { ok: false, error: "unauthorized" });
    }
    if (!getActiveSecuritySettings($app, parsed.storeId)) {
      return e.json(403, { ok: false, error: "security_disabled" });
    }
    expireDueSecurityBlocks($app);

    let result = null;
    $app.runInTransaction((txApp) => {
      const requested = findRecordByIdSafe(txApp, STORE_CUSTOMERS_COLLECTION, parsed.customerId);
      const customer = requested ? resolveCanonicalCustomer(txApp, parsed.storeId, requested) : null;
      if (!customer) {
        result = { status: 404 };
        return;
      }

      const actorId = getString(auth, "id");
      if (parsed.action === "archive") {
        if (hasActiveBlocksForCustomer(txApp, parsed.storeId, customer.id)) {
          result = { status: 409, error: "active_blocks" };
          return;
        }
        archiveCustomer(txApp, parsed.storeId, customer, actorId, parsed.reason);
        result = { archived: true, customerId: customer.id };
        return;
      }

      if (parsed.action === "restore") {
        restoreCustomer(txApp, parsed.storeId, customer, actorId, parsed.reason, "restore_customer");
        result = { archived: false, customerId: customer.id };
        return;
      }

      const deleted = deleteCustomerSecurityProfile(txApp, parsed.storeId, customer, actorId, parsed.reason);
      if (deleted && deleted.error === "active_blocks") {
        result = { status: 409, error: "active_blocks" };
        return;
      }
      result = { deleted: true, counts: deleted.counts || {} };
    });

    if (!result || result.status === 404) return e.json(404, { ok: false, error: "not_found" });
    if (result.status === 409) return e.json(409, { ok: false, error: result.error || "conflict" });
    if (result.deleted) return e.json(200, { ok: true, deleted: true, counts: result.counts });
    return e.json(200, { ok: true, customer_id: result.customerId, archived: result.archived });
  } catch (_) {
    if (action === "archive") logSecurity("error", "PZ_SEC_CUSTOMER_ARCHIVE_FAILED");
    else if (action === "restore") logSecurity("error", "PZ_SEC_CUSTOMER_RESTORE_FAILED");
    else logSecurity("error", "PZ_SEC_CUSTOMER_DELETE_FAILED");
    return e.json(500, { ok: false, error: "lifecycle_failed" });
  }
}

function sourceCollection(source) {
  if (source === "security_event") return SECURITY_EVENTS_COLLECTION;
  if (source === "visitor_session") return VISITOR_SESSIONS_COLLECTION;
  return VISITOR_PAGEVIEWS_COLLECTION;
}

function encryptedFieldForSource(source) {
  return source === "visitor_session" ? "latest_ip_encrypted" : "ip_encrypted";
}

function storeIdForRecord(record) {
  return getRelationId(record, "store");
}

function resolveSourceRecords(app, source, ids) {
  const records = getRecordsByIds(app, sourceCollection(source), ids);
  const map = {};
  records.forEach((record) => {
    map[record.id] = record;
  });
  return map;
}

function handleResolveIps(e) {
  setNoStore(e, true);

  try {
    const info = e.requestInfo();
    const auth = info.auth;
    const role = authRole(auth);
    const userStore = authStore(auth);

    if (role !== "master_admin" && role !== "store_admin") {
      return e.json(403, { ok: false, error: "unauthorized" });
    }

    const body = info.body || {};
    if (!isAllowedResolvePayload(body)) {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }

    const items = getBodyValue(body, "items");
    const grouped = {};
    items.forEach((item) => {
      const source = String(getBodyValue(item, "source") || "");
      const id = String(getBodyValue(item, "id") || "");
      grouped[source] = grouped[source] || [];
      if (!grouped[source].includes(id)) grouped[source].push(id);
    });

    const recordMaps = {};
    Object.keys(grouped).forEach((source) => {
      recordMaps[source] = resolveSourceRecords($app, source, grouped[source]);
    });

    const settingsByStore = {};
    for (const item of items) {
      const source = String(getBodyValue(item, "source") || "");
      const id = String(getBodyValue(item, "id") || "");
      const record = recordMaps[source] && recordMaps[source][id];
      if (!record) return e.json(404, { ok: false, error: "not_found" });
      const storeId = storeIdForRecord(record);
      if (!canReadStore(role, userStore, storeId)) {
        return e.json(403, { ok: false, error: "unauthorized" });
      }
      if (!settingsByStore[storeId]) {
        settingsByStore[storeId] = getReadableSecuritySettings($app, storeId, role);
      }
      if (!settingsByStore[storeId]) return e.json(403, { ok: false, error: "unauthorized" });
    }

    const resolved = [];
    items.forEach((item) => {
      const source = String(getBodyValue(item, "source") || "");
      const id = String(getBodyValue(item, "id") || "");
      const record = recordMaps[source][id];
      const storeId = storeIdForRecord(record);
      const settings = settingsByStore[storeId];
      if (!settings || getString(settings, "ip_visibility") !== "full") return;

      const ip = decryptIp(getString(record, encryptedFieldForSource(source)));
      if (!ip) return;

      resolved.push({ source, id, ip });
    });

    return e.json(200, { ok: true, items: resolved });
  } catch (_) {
    logSecurity("error", "PZ_SEC_IP_RESOLVE_FAILED");
    return e.json(500, { ok: false, error: "resolve_failed" });
  }
}

function retentionDays(settings) {
  const days = Number(getString(settings, "retention_days") || getNumber(settings, "retention_days") || 30);
  if (days === 60 || days === 90) return days;
  return 30;
}

function deleteBatch(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 200, 0, params || {}) || [];
  records.forEach((record) => app.delete(record));
  return records.length;
}

function cleanupVisitors(app) {
  const today = getHavanaDay(new Date());
  const settingsRecords = app.findRecordsByFilter(
    SECURITY_SETTINGS_COLLECTION,
    'enabled = true && mode != "disabled"',
    "store",
    0,
    0,
    {}
  ) || [];

  let deletedPageviews = 0;
  let deletedSessions = 0;

  settingsRecords.forEach((settings) => {
    const storeId = getRelationId(settings, "store");
    if (!storeId) return;
    const cutoffDay = addDaysToDay(today, -retentionDays(settings));
    if (!cutoffDay) return;

    let batchCount = 0;
    do {
      batchCount = deleteBatch(
        app,
        VISITOR_PAGEVIEWS_COLLECTION,
        "store = {:store} && day < {:cutoffDay}",
        { store: storeId, cutoffDay }
      );
      deletedPageviews += batchCount;
    } while (batchCount > 0);

    do {
      batchCount = deleteBatch(
        app,
        VISITOR_SESSIONS_COLLECTION,
        "store = {:store} && day < {:cutoffDay}",
        { store: storeId, cutoffDay }
      );
      deletedSessions += batchCount;
    } while (batchCount > 0);
  });

  logSecurity("warn", "PZ_SEC_NAV_CLEANUP_DONE", "deleted", deletedPageviews + deletedSessions);
}

function handleVisitorRetentionCleanup() {
  try {
    cleanupVisitors($app);
  } catch (_) {
    logSecurity("error", "PZ_SEC_NAV_CLEANUP_FAILED");
  }
}

function handleSecurityBlocksExpiry() {
  try {
    expireDueSecurityBlocks($app);
  } catch (_) {
    logSecurity("error", "PZ_SEC_BLOCK_EXPIRE_FAILED");
  }
}

function linkVisitorSessionToCustomerByBrowserToken(app, storeId, browserTokenHmac, customerId) {
  if (!storeId || !browserTokenHmac || !isValidRecordId(customerId)) return;
  try {
    const day = getHavanaDay(new Date());
    const sessions = app.findRecordsByFilter(
      VISITOR_SESSIONS_COLLECTION,
      'store = {:store} && day = {:day} && browser_token_hmac = {:browserTokenHmac} && customer = ""',
      "",
      20,
      0,
      { store: storeId, day, browserTokenHmac }
    ) || [];
    sessions.forEach((session) => {
      session.set("customer", customerId);
      app.save(session);
    });

    const pageviews = app.findRecordsByFilter(
      VISITOR_PAGEVIEWS_COLLECTION,
      'store = {:store} && day = {:day} && visitor_session.browser_token_hmac = {:browserTokenHmac} && customer = ""',
      "",
      100,
      0,
      { store: storeId, day, browserTokenHmac }
    ) || [];
    pageviews.forEach((pageview) => {
      pageview.set("customer", customerId);
      app.save(pageview);
    });
  } catch (_) {
    logSecurity("warn", "PZ_SEC_NAV_WRITE_SKIPPED");
  }
}

module.exports = {
  handleTrackNavigation,
  handleResolveIps,
  handleSecurityActivityPage,
  handleSecurityVisitorsPage,
  handleSecurityVisitorDetail,
  handleCustomerDetail,
  handleMonitoringSummary,
  handleCustomerLifecycle,
  handleCustomerObservation,
  handleSecurityBlockAction,
  handleSecurityBlocksPage,
  handleVisitorRetentionCleanup,
  handleSecurityBlocksExpiry,
  expireDueSecurityBlocks,
  linkVisitorSessionToCustomerByBrowserToken,
  _test: {
    normalizeIpAddress,
    getHavanaDay,
    blocksMetrics,
    parseNavigationPayload,
    normalizePath,
  },
};
