/// <reference path="../pb_data/types.d.ts" />

const secretContract = typeof __hooks === "undefined"
  ? require("./pz_security_secret_contract.js")
  : require(`${__hooks}/pz_security_secret_contract.js`);
const {
  getValidHmacSecret,
  getValidAesKey,
} = secretContract;
const teamPermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const storeActivity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);
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
const STORE_SECURITY_BLOCK_DEVICE_CANDIDATES_COLLECTION = "store_security_block_device_candidates";
const STORE_SECURITY_BLOCK_ADDRESSES_COLLECTION = "store_security_block_addresses";
const STORE_NOTIFICATIONS_COLLECTION = "store_notifications";
const SHIPPING_ZONES_COLLECTION = "shipping_zones";
const STORES_COLLECTION = "stores";
const ORDERS_COLLECTION = "orders";
const CUSTOMER_DETAIL_PER_PAGE = 10;
const VISITOR_CUSTOMER_ORDERS_PER_PAGE = 5;
const CUSTOMER_DETAIL_MAX_PAGE = 1000;
const SECURITY_BLOCKS_PER_PAGE = 10;
const SECURITY_MONITORING_PAGE_SIZE = 10;
const SECURITY_BLOCK_RELATED_IP_LIMIT = 50;
const SECURITY_BLOCK_HISTORY_LIMIT = 100;
const VISITOR_RANGE_DAYS = Object.freeze({ today: 1, days_7: 7, days_30: 30 });
const VISITOR_PAGEVIEW_RETENTION_DAYS = 30;
const VISITOR_SESSION_RETENTION_DAYS = 90;

const ALLOWED_PAGE_TYPES = ["store_home", "category", "subcategory", "product", "gifts", "search", "checkout", "landing_qr", "other"];
const SECURITY_ACTIVITY_EVENT_TYPES = ["all", "order_created", "order_rejected", "review_submitted", "raffle_entry", "blocked_attempt", "blocked_address_match", "vpn_detected", "vpn_blocked", "vpn_check_unavailable", "admin_action"];
const SECURITY_ACTIVITY_RISK_LEVELS = ["all", "normal", "suspicious", "blocked"];
const RESOLVE_SOURCES = ["security_event", "visitor_session", "visitor_pageview"];
const SECURITY_BLOCK_SCOPES = ["orders", "reviews", "raffles", "all_interactions", "full_access"];
const SECURITY_BLOCK_DURATIONS = ["hours_24", "days_7", "days_30", "permanent"];
const SECURITY_BLOCK_STATUSES = ["all", "active", "expired", "revoked"];
const SECURITY_BLOCK_MATCH_MODES = ["any", "all"];
const SECURITY_ACTIVITY_SUMMARIES = Object.freeze({
  archive_customer: "Perfil de Seguridad archivado",
  restore_customer: "Perfil de Seguridad restaurado",
  auto_restore_customer: "Perfil de Seguridad restaurado por el sistema",
  delete_customer_profile: "Perfil de Seguridad eliminado",
  customer_watch_enabled: "Observación de Seguridad activada",
  customer_watch_disabled: "Observación de Seguridad desactivada",
  block_created: "Bloqueo de Seguridad creado",
  block_revoked: "Bloqueo de Seguridad revocado",
  block_expired: "Bloqueo de Seguridad vencido",
  block_device_candidate_detected: "Dispositivo pendiente detectado para un bloqueo",
  block_device_candidate_confirmed: "Dispositivo agregado al bloqueo",
  block_device_candidate_dismissed: "Dispositivo pendiente descartado",
  vpn_policy_updated: "Política de VPN actualizada",
  ip_information_revealed: "Información protegida revelada de forma autorizada",
  security_customer_identity_merged: "Identidades de Seguridad consolidadas",
});
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
  PZ_SEC_CUSTOMER_DETAIL_ADDRESSES_FAILED: "PowerZona security customer detail addresses failed safely.",
  PZ_SEC_CUSTOMER_DETAIL_FAILED: "PowerZona security customer detail failed safely.",
  PZ_SEC_SUMMARY_FAILED: "PowerZona security summary failed safely.",
  PZ_SEC_CUSTOMER_ARCHIVE_FAILED: "PowerZona security customer archive failed safely.",
  PZ_SEC_CUSTOMER_RESTORE_FAILED: "PowerZona security customer restore failed safely.",
  PZ_SEC_CUSTOMER_DELETE_FAILED: "PowerZona security customer delete failed safely.",
  PZ_SEC_BLOCK_CREATE_FAILED: "PowerZona security block create failed safely.",
  PZ_SEC_BLOCK_REVOKE_FAILED: "PowerZona security block revoke failed safely.",
  PZ_SEC_BLOCK_DEVICE_REVIEW_FAILED: "PowerZona security block device review failed safely.",
  PZ_SEC_BLOCK_DEVICE_CANDIDATE_SKIPPED: "PowerZona security block device candidate write skipped safely.",
  PZ_SEC_BLOCK_EXPIRE_FAILED: "PowerZona security block expiry failed safely.",
  PZ_SEC_BLOCK_LIST_FAILED: "PowerZona security block list failed safely.",
  PZ_SEC_VPN_POLICY_UPDATE_FAILED: "PowerZona VPN policy update failed safely.",
  PZ_SEC_MANUAL_IP_DEVICE_LOOKUP_FAILED: "PowerZona manual IP device lookup failed safely.",
  PZ_SEC_WATCH_UPDATE_FAILED: "PowerZona security customer watch update failed safely.",
  PZ_SEC_ACTIVITY_PAGE_FAILED: "PowerZona security activity page failed safely.",
  PZ_SEC_VISITORS_PAGE_FAILED: "PowerZona security visitors page failed safely.",
  PZ_SEC_VISITOR_DETAIL_FAILED: "PowerZona security visitor detail failed safely.",
  PZ_SEC_ADDRESS_MATCH_WRITE_SKIPPED: "PowerZona security address match alert skipped safely.",
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

function getStringArray(record, key) {
  let value;
  try {
    value = record.get(key);
  } catch (_) {
    value = undefined;
  }
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
      try {
        const encoded = value.map((item) => `%${item.toString(16).padStart(2, "0")}`).join("");
        value = JSON.parse(decodeURIComponent(encoded));
      } catch (_) {
        return [];
      }
    }
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (value && typeof value.string === "function") {
    try {
      value = JSON.parse(String(value.string() || ""));
    } catch (_) {
      return [];
    }
    return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
  }
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function getObject(record, key) {
  let value;
  try {
    value = record.get(key);
  } catch (_) {
    value = undefined;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.string !== "function") {
    return value;
  }
  if (value && typeof value.string === "function") {
    try { value = String(value.string() || ""); } catch (_) { value = ""; }
  }
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
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

function normalizeDeliveryAddressPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[áàâäãå]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôöõ]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/#/g, " numero ")
    .replace(/\b(?:nro|num|numero|no)\.?\b/g, " numero ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function deliveryAddressFingerprint(municipality, address) {
  const normalizedMunicipality = normalizeDeliveryAddressPart(municipality);
  const normalizedAddress = normalizeDeliveryAddressPart(address);
  if (normalizedMunicipality.length < 2 || normalizedAddress.length < 5) return "";
  return `${normalizedMunicipality}|${normalizedAddress}`;
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

function ipv4Octets(canonical) {
  const parts = String(canonical || "").split(".").map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : [];
}

function isPublicIpv4(canonical) {
  const octets = ipv4Octets(canonical);
  if (!octets.length) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(canonical) {
  const groups = String(canonical || "").split(":");
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{4}$/.test(group))) return false;
  const first = Number.parseInt(groups[0], 16);
  const second = Number.parseInt(groups[1], 16);
  if (groups.every((group) => group === "0000")) return false;
  if (groups.slice(0, 7).every((group) => group === "0000") && groups[7] === "0001") return false;
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xff00) === 0xff00) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  return (first & 0xe000) === 0x2000;
}

function isPublicIpAddress(normalized) {
  if (!normalized || normalized.valid !== true) return false;
  if (normalized.family === "ipv4") return isPublicIpv4(normalized.canonical);
  if (normalized.family === "ipv6") return isPublicIpv6(normalized.canonical);
  return false;
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
    const enforcement = typeof __hooks === "undefined"
      ? require("./pz_security_enforcement_lib.js")
      : require(`${__hooks}/pz_security_enforcement_lib.js`);
    if (enforcement.enforceAction(e, payload.storeId, "interactions", {})) return;

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
  return listDetailPageWithSize(app, collection, filter, sort, page, params, CUSTOMER_DETAIL_PER_PAGE);
}

function listDetailPageWithSize(app, collection, filter, sort, page, params, perPage) {
  const totalItems = countRecordsByFilter(app, collection, filter, params);
  const safePerPage = Math.max(1, Number(perPage) || CUSTOMER_DETAIL_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePerPage));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * safePerPage;
  const items = totalItems > 0
    ? app.findRecordsByFilter(collection, filter, sort, safePerPage, offset, params || {}) || []
    : [];

  return {
    page: safePage,
    perPage: safePerPage,
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

function emptyVisitorCustomerOrdersPage(page) {
  return {
    page,
    perPage: VISITOR_CUSTOMER_ORDERS_PER_PAGE,
    totalItems: 0,
    totalPages: 1,
    items: [],
  };
}

function buildVisitorCustomerOrdersDetail(app, storeId, customerId, page) {
  if (!customerId) return emptyVisitorCustomerOrdersPage(page);
  const result = listDetailPageWithSize(
    app,
    ORDERS_COLLECTION,
    "store = {:store} && customer = {:customer}",
    "-created",
    page,
    { store: storeId, customer: customerId },
    VISITOR_CUSTOMER_ORDERS_PER_PAGE
  );
  return {
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    items: result.items.map(serializeOrder),
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

function canUseStorePermission(role, authStoreId, storeId, auth, permission, app) {
  const permissionApp = app || $app;
  const store = findRecordByIdSafe(permissionApp, STORES_COLLECTION, storeId);
  if (!store) return false;
  if (role === "master_admin") return true;
  if (!["store_admin", "store_staff"].includes(role) || !authStoreId || authStoreId !== storeId) return false;
  if (!securityCapabilityAllowed(permissionApp, storeId, store)) return false;
  return teamPermissions.hasStorePermission(permissionApp, auth, store, permission);
}

function securityCapabilityAllowed(app, storeId, storeRecord) {
  const store = storeRecord || findRecordByIdSafe(app, STORES_COLLECTION, storeId);
  return !!store && capabilities.hasStoreCapability(
    store,
    "security_enabled",
    { enforceExpiration: true }
  );
}

function canReadStore(role, authStoreId, storeId, auth) {
  return canUseStorePermission(role, authStoreId, storeId, auth, "security.view");
}

function canManageStore(role, authStoreId, storeId, auth, app) {
  return canUseStorePermission(role, authStoreId, storeId, auth, "security.manage", app);
}

function respondStorePermissionDenied(e, role, authStoreId, storeId) {
  const isStoreUser = role === "store_admin" || role === "store_staff";
  const belongsToAnotherTenant = isStoreUser && !!authStoreId && authStoreId !== storeId;
  if (belongsToAnotherTenant || !findRecordByIdSafe($app, STORES_COLLECTION, storeId)) {
    return e.json(404, { ok: false, error: "not_found" });
  }
  return e.json(403, { ok: false, error: "permission_denied" });
}

function getAuthorizedSecuritySettings(info, storeId) {
  const auth = info && info.auth;
  const role = authRole(auth);
  const authStoreId = authStore(auth);
  if (!canReadStore(role, authStoreId, storeId, auth)) return null;
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

function normalizeVisitorRange(value) {
  const normalized = String(value || "today").trim();
  return Object.prototype.hasOwnProperty.call(VISITOR_RANGE_DAYS, normalized) ? normalized : "today";
}

function visitorRangeCutoffDay(today, range) {
  const days = VISITOR_RANGE_DAYS[normalizeVisitorRange(range)];
  return addDaysToDay(today, -(days - 1));
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
  const keys = getBodyKeys(body).sort();
  const rangeKeys = ["page", "range", "store_id"];
  const legacyKeys = ["day", "page", "store_id"];
  const isRangePayload = keys.length === rangeKeys.length && keys.every((key, index) => key === rangeKeys[index]);
  const isLegacyPayload = keys.length === legacyKeys.length && keys.every((key, index) => key === legacyKeys[index]);
  if (!isRangePayload && !isLegacyPayload) return null;
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const page = normalizePositivePage(getBodyValue(body, "page"));
  const legacyDay = isLegacyPayload ? normalizeSecurityDay(getBodyValue(body, "day")) : "";
  const range = isRangePayload ? normalizeVisitorRange(getBodyValue(body, "range")) : "today";
  if (!isValidRecordId(storeId) || !page || (isLegacyPayload && !legacyDay)) return null;
  return { storeId, page, range, legacyDay };
}

function parseVisitorDetailPayload(body) {
  const keys = getBodyKeys(body).sort();
  const baseKeys = ["orders_page", "page", "store_id", "visitor_session_id"];
  const rangeKeys = ["orders_page", "page", "range", "store_id", "visitor_session_id"];
  const historyKeys = ["full_history", "network_page", "orders_page", "page", "range", "store_id", "visitor_session_id"];
  const validKeys = (keys.length === baseKeys.length && keys.every((key, index) => key === baseKeys[index]))
    || (keys.length === rangeKeys.length && keys.every((key, index) => key === rangeKeys[index]))
    || (keys.length === historyKeys.length && keys.every((key, index) => key === historyKeys[index]));
  if (!validKeys) return null;
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const visitorSessionId = String(getBodyValue(body, "visitor_session_id") || "").trim();
  const page = normalizePositivePage(getBodyValue(body, "page"));
  const ordersPage = normalizePositivePage(getBodyValue(body, "orders_page"));
  const range = normalizeVisitorRange(getBodyValue(body, "range"));
  const hasHistoryOptions = keys.length === historyKeys.length;
  const rawFullHistory = hasHistoryOptions ? getBodyValue(body, "full_history") : false;
  const networkPage = hasHistoryOptions ? normalizePositivePage(getBodyValue(body, "network_page")) : 1;
  if (hasHistoryOptions && typeof rawFullHistory !== "boolean") return null;
  if (!isValidRecordId(storeId) || !isValidRecordId(visitorSessionId) || !page || !ordersPage || !networkPage) return null;
  return { storeId, visitorSessionId, page, ordersPage, range, fullHistory: rawFullHistory === true, networkPage };
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
      status: getString(customer, "status") || "normal",
      orders_count: Math.max(0, getNumber(customer, "orders_count")),
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

function activityVisitorSessionDistance(session, eventTime) {
  const firstSeen = Date.parse(getString(session, "first_seen_at"));
  const lastSeen = Date.parse(getString(session, "last_seen_at"));
  if (!Number.isFinite(eventTime)) return 0;
  if (Number.isFinite(firstSeen) && Number.isFinite(lastSeen) && eventTime >= firstSeen && eventTime <= lastSeen) return 0;
  const distances = [];
  if (Number.isFinite(firstSeen)) distances.push(Math.abs(eventTime - firstSeen));
  if (Number.isFinite(lastSeen)) distances.push(Math.abs(eventTime - lastSeen));
  return distances.length ? Math.min(...distances) : Number.MAX_SAFE_INTEGER;
}

function buildActivityNavigation(app, storeId, event, nowValue) {
  const customerId = getRelationId(event, "customer");
  if (customerId && findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) {
    try {
      const now = nowValue instanceof Date ? nowValue : new Date();
      const blocks = app.findRecordsByFilter(
        STORE_SECURITY_BLOCKS_COLLECTION,
        'store = {:store} && customer = {:customer} && status = "active"',
        "-created,-id",
        20,
        0,
        { store: storeId, customer: customerId }
      ) || [];
      const activeBlock = blocks.find((block) => visitorStatusBlockIsActive(block, now));
      if (activeBlock && isValidRecordId(activeBlock.id)) return { kind: "block", target_id: activeBlock.id };
    } catch (_) {}
  }

  const browserTokenHmac = getString(event, "browser_token_hmac");
  const occurredAt = getString(event, "occurred_at") || getString(event, "created");
  const eventTime = Date.parse(occurredAt);
  if (!browserTokenHmac || !Number.isFinite(eventTime) || !findCollectionSafe(app, VISITOR_SESSIONS_COLLECTION)) {
    return { kind: "none", target_id: "" };
  }

  try {
    const day = getHavanaDay(new Date(eventTime));
    const sessions = app.findRecordsByFilter(
      VISITOR_SESSIONS_COLLECTION,
      "store = {:store} && day = {:day} && browser_token_hmac = {:browserTokenHmac}",
      "-last_seen_at,-id",
      50,
      0,
      { store: storeId, day, browserTokenHmac }
    ) || [];
    sessions.sort((left, right) => activityVisitorSessionDistance(left, eventTime) - activityVisitorSessionDistance(right, eventTime));
    const visitor = sessions[0];
    if (visitor && isValidRecordId(visitor.id)) return { kind: "visitor", target_id: visitor.id };
  } catch (_) {}
  return { kind: "none", target_id: "" };
}

function serializeActivityEvent(event, settings, customerMap, orderMap, navigation) {
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
    capture_status: getString(event, "capture_status"),
    occurred_at: getString(event, "occurred_at"),
    created: getString(event, "created"),
    customer: customerMap[customerId] || null,
    order: orderMap[orderId] || null,
    navigation: navigation || { kind: "none", target_id: "" },
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

function visitorSessionTime(session, field) {
  const parsed = Date.parse(getString(session, field));
  return Number.isFinite(parsed) ? parsed : 0;
}

function visitorSessionIdentity(session) {
  const browserTokenHmac = getString(session, "browser_token_hmac");
  if (browserTokenHmac) return { key: `browser:${browserTokenHmac}`, field: "browser_token_hmac", value: browserTokenHmac };
  const visitorKeyHmac = getString(session, "visitor_key_hmac");
  if (visitorKeyHmac) return { key: `visitor:${visitorKeyHmac}`, field: "visitor_key_hmac", value: visitorKeyHmac };
  const customerId = getRelationId(session, "customer");
  if (customerId) return { key: `customer:${customerId}`, field: "customer", value: customerId };
  return { key: `session:${session.id}`, field: "id", value: session.id };
}

function buildVisitorSessionGroup(sessions) {
  const ordered = (sessions || []).slice().sort((left, right) => {
    const leftTime = visitorSessionTime(left, "last_seen_at") || visitorSessionTime(left, "created");
    const rightTime = visitorSessionTime(right, "last_seen_at") || visitorSessionTime(right, "created");
    return leftTime - rightTime || String(left.id || "").localeCompare(String(right.id || ""));
  });
  const representative = ordered[ordered.length - 1] || null;
  if (!representative) return null;
  const customerSession = ordered.slice().reverse().find((session) => getRelationId(session, "customer"));
  const firstSession = ordered[0];
  return {
    representative,
    sessions: ordered,
    customerId: customerSession ? getRelationId(customerSession, "customer") : "",
    firstSeenAt: getString(firstSession, "first_seen_at") || getString(firstSession, "created"),
    lastSeenAt: getString(representative, "last_seen_at") || getString(representative, "updated"),
    pageviewsCount: ordered.reduce((total, session) => total + Math.max(0, getNumber(session, "pageviews_count")), 0),
    entryPath: getString(firstSession, "entry_path"),
    lastPath: getString(representative, "last_path"),
  };
}

function groupVisitorSessions(sessions) {
  const grouped = {};
  (sessions || []).forEach((session) => {
    const identity = visitorSessionIdentity(session);
    if (!grouped[identity.key]) grouped[identity.key] = [];
    grouped[identity.key].push(session);
  });
  return Object.keys(grouped)
    .map((key) => buildVisitorSessionGroup(grouped[key]))
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = Date.parse(left.lastSeenAt);
      const rightTime = Date.parse(right.lastSeenAt);
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
        || String(right.representative.id || "").localeCompare(String(left.representative.id || ""));
    });
}

function paginateArray(items, page, perPage) {
  const safePerPage = Math.max(1, Number(perPage) || SECURITY_MONITORING_PAGE_SIZE);
  const totalItems = (items || []).length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePerPage));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const offset = (safePage - 1) * safePerPage;
  return {
    page: safePage,
    perPage: safePerPage,
    totalItems,
    totalPages,
    items: (items || []).slice(offset, offset + safePerPage),
  };
}

function serializeVisitorSessionGroup(group, settings, customerMap) {
  const serialized = serializeVisitorSession(group.representative, settings, customerMap);
  serialized.customer = customerMap[group.customerId] || null;
  serialized.first_seen_at = group.firstSeenAt;
  serialized.last_seen_at = group.lastSeenAt;
  serialized.pageviews_count = group.pageviewsCount;
  serialized.entry_path = group.entryPath;
  serialized.last_path = group.lastPath;
  return serialized;
}

function listVisitorSessionsForRange(app, storeId, range, legacyDay) {
  if (legacyDay) {
    return listRecordsPaged(
      app,
      VISITOR_SESSIONS_COLLECTION,
      "store = {:store} && day = {:day}",
      "-last_seen_at,-id",
      { store: storeId, day: legacyDay },
      200
    );
  }
  const today = getHavanaDay(new Date());
  const cutoffDay = visitorRangeCutoffDay(today, range);
  return listRecordsPaged(
    app,
    VISITOR_SESSIONS_COLLECTION,
    "store = {:store} && day >= {:cutoffDay} && day <= {:today}",
    "-last_seen_at,-id",
    { store: storeId, cutoffDay, today },
    200
  );
}

function listRelatedVisitorSessions(app, storeId, sourceSession, range) {
  const identity = visitorSessionIdentity(sourceSession);
  if (identity.field === "id") return [sourceSession];
  const today = getHavanaDay(new Date());
  const cutoffDay = visitorRangeCutoffDay(today, range);
  const params = { store: storeId, cutoffDay, today, identity: identity.value };
  const sessions = listRecordsPaged(
    app,
    VISITOR_SESSIONS_COLLECTION,
    `store = {:store} && day >= {:cutoffDay} && day <= {:today} && ${identity.field} = {:identity}`,
    "-last_seen_at,-id",
    params,
    200
  );
  return sessions.length ? sessions : [sourceSession];
}

function listRelatedVisitorSessionsForHistory(app, storeId, sourceSession) {
  const identity = visitorSessionIdentity(sourceSession);
  if (identity.field === "id") return [sourceSession];
  const today = getHavanaDay(new Date());
  const cutoffDay = addDaysToDay(today, -(VISITOR_SESSION_RETENTION_DAYS - 1));
  const params = { store: storeId, cutoffDay, today, identity: identity.value };
  const sessions = listRecordsPaged(
    app,
    VISITOR_SESSIONS_COLLECTION,
    `store = {:store} && day >= {:cutoffDay} && day <= {:today} && ${identity.field} = {:identity}`,
    "-last_seen_at,-id",
    params,
    200
  );
  return sessions.length ? sessions : [sourceSession];
}

function emptyVisitorVpnInfo() {
  return {
    status: "none",
    event_type: "",
    decision: "",
    risk_level: "",
    observed_at: "",
  };
}

function listVisitorVpnEvents(app, storeId, session, limit) {
  const browserTokenHmac = getString(session, "browser_token_hmac");
  if (!browserTokenHmac) return [];
  try {
    return app.findRecordsByFilter(
      SECURITY_EVENTS_COLLECTION,
      "store = {:store} && browser_token_hmac = {:browserTokenHmac} && (event_type = {:detectedType} || event_type = {:blockedType} || event_type = {:unavailableType})",
      "-occurred_at,-created",
      Math.max(1, Number(limit) || 50),
      0,
      {
        store: storeId,
        browserTokenHmac,
        detectedType: "vpn_detected",
        blockedType: "vpn_blocked",
        unavailableType: "vpn_check_unavailable",
      }
    ) || [];
  } catch (_) {
    return [];
  }
}

function buildVisitorVpnInfo(app, storeId, session, suppliedEvents) {
  const events = Array.isArray(suppliedEvents) ? suppliedEvents : listVisitorVpnEvents(app, storeId, session, 50);

  const detectedEvent = events.find((event) => {
    const eventType = getString(event, "event_type");
    return eventType === "vpn_detected" || eventType === "vpn_blocked";
  });
  const event = detectedEvent || events[0];
  if (!event) return emptyVisitorVpnInfo();

  const eventType = getString(event, "event_type");
  return {
    status: eventType === "vpn_blocked"
      ? "blocked"
      : (eventType === "vpn_detected" ? "detected" : "unavailable"),
    event_type: eventType,
    decision: getString(event, "decision"),
    risk_level: getString(event, "risk_level"),
    observed_at: getString(event, "occurred_at") || getString(event, "created"),
  };
}

function visitorNetworkStatusFromEvent(event) {
  const eventType = getString(event, "event_type");
  if (eventType === "vpn_blocked") return "blocked";
  if (eventType === "vpn_detected") return "detected";
  if (eventType === "vpn_check_unavailable") return "unavailable";
  return "normal";
}

function buildVisitorNetworkState(session, ipSources, events) {
  const sources = Array.isArray(ipSources) ? ipSources : [];
  const allowedIpHmacs = {};
  sources.forEach((source) => {
    const ipHmac = String(source && source.capture && source.capture.ip_hmac || "").trim();
    if (isValidHmacValue(ipHmac)) allowedIpHmacs[ipHmac] = true;
  });

  const statusByIpHmac = {};
  const selectEvent = (event, allowUnavailable) => {
    const ipHmac = getString(event, "ip_hmac");
    const status = visitorNetworkStatusFromEvent(event);
    if (!allowedIpHmacs[ipHmac] || statusByIpHmac[ipHmac] || status === "normal") return;
    if (!allowUnavailable && status === "unavailable") return;
    statusByIpHmac[ipHmac] = {
      status,
      observed_at: getString(event, "occurred_at") || getString(event, "created"),
    };
  };

  const visitorEvents = Array.isArray(events) ? events : [];
  visitorEvents.forEach((event) => selectEvent(event, false));
  visitorEvents.forEach((event) => selectEvent(event, true));

  const statuses = Object.keys(statusByIpHmac).map((ipHmac) => statusByIpHmac[ipHmac].status);
  const currentIpHmac = getString(session, "latest_ip_hmac");
  const current = statusByIpHmac[currentIpHmac] || { status: "normal", observed_at: "" };
  return {
    statusByIpHmac,
    summary: {
      ip_count: Object.keys(allowedIpHmacs).length,
      vpn_ip_count: statuses.filter((status) => status === "detected" || status === "blocked").length,
      unavailable_ip_count: statuses.filter((status) => status === "unavailable").length,
      current_ip_status: current.status,
      current_ip_observed_at: current.observed_at,
    },
  };
}

function visitorBlockMatchesSession(block, session) {
  const checks = [];
  if (getBoolean(block, "match_phone")) checks.push(false);
  if (getBoolean(block, "match_device")) {
    const deviceHmac = getString(session, "browser_token_hmac");
    checks.push(Boolean(deviceHmac) && getStringArray(block, "device_hmac_values").includes(deviceHmac));
  }
  if (getBoolean(block, "match_ip")) {
    const ipHmac = getString(session, "latest_ip_hmac");
    checks.push(Boolean(ipHmac) && getStringArray(block, "ip_hmac_values").includes(ipHmac));
  }
  if (!checks.length) return false;
  return getString(block, "match_mode") === "all" ? checks.every(Boolean) : checks.some(Boolean);
}

function visitorStatusBlockIsActive(block, now) {
  if (!block || getString(block, "status") !== "active" || getString(block, "revoked_at")) return false;
  const startsAt = Date.parse(getString(block, "starts_at"));
  if (Number.isFinite(startsAt) && startsAt > now.getTime()) return false;
  const expiresAt = Date.parse(getString(block, "expires_at"));
  return !Number.isFinite(expiresAt) || expiresAt > now.getTime();
}

function buildVisitorSecurityStatus(session, relatedCustomer, vpnInfo, activeBlocks, nowValue) {
  const customerStatus = String(relatedCustomer && relatedCustomer.status || "").trim();
  if (customerStatus === "blocked") return "blocked";
  const now = nowValue instanceof Date ? nowValue : new Date();
  if ((activeBlocks || []).some((block) => visitorStatusBlockIsActive(block, now) && visitorBlockMatchesSession(block, session))) {
    return "blocked";
  }
  const vpnStatus = String(vpnInfo && vpnInfo.status || "none");
  if (customerStatus === "watch" || vpnStatus === "blocked" || vpnStatus === "detected" || vpnStatus === "unavailable") return "watch";
  return "normal";
}

function listVisitorStatusBlocks(app, storeId) {
  if (!findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) return [];
  const now = new Date();
  return listRecordsPaged(
    app,
    STORE_SECURITY_BLOCKS_COLLECTION,
    'store = {:store} && status = "active"',
    "-created",
    { store: storeId },
    200
  ).filter((block) => visitorStatusBlockIsActive(block, now));
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

function serializeVisitorPageview(pageview, settings, labels, networkStatusByIpHmac) {
  const ip = getRecordIpDisplay(pageview, settings);
  const path = getString(pageview, "path");
  const openPath = normalizePath(path);
  const network = networkStatusByIpHmac && networkStatusByIpHmac[getString(pageview, "ip_hmac")]
    ? networkStatusByIpHmac[getString(pageview, "ip_hmac")]
    : { status: "normal", observed_at: "" };
  return {
    id: pageview.id,
    page_type: getString(pageview, "page_type"),
    entity_type: getString(pageview, "entity_type"),
    entity_id: getString(pageview, "entity_id"),
    path,
    occurred_at: getString(pageview, "occurred_at"),
    ip_display: ip.ip_display,
    ip_resolution_status: ip.ip_resolution_status,
    network_status: network.status,
    network_observed_at: network.observed_at,
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
    if (!access) return respondStorePermissionDenied(e, authRole(info.auth), authStore(info.auth), payload.storeId);

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
      items: result.items.map((event) => serializeActivityEvent(
        event,
        access.settings,
        customerMap,
        orderMap,
        buildActivityNavigation($app, payload.storeId, event)
      )),
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
    if (!access) return respondStorePermissionDenied(e, authRole(info.auth), authStore(info.auth), payload.storeId);

    const groups = groupVisitorSessions(listVisitorSessionsForRange(
      $app,
      payload.storeId,
      payload.range,
      payload.legacyDay
    ));
    const result = paginateArray(groups, payload.page, SECURITY_MONITORING_PAGE_SIZE);
    const customerMap = buildSanitizedCustomerMap($app, payload.storeId, result.items.map((group) => group.customerId));
    const activeBlocks = listVisitorStatusBlocks($app, payload.storeId);
    return e.json(200, {
      ok: true,
      range: payload.range,
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      items: result.items.map((group) => {
        const session = group.representative;
        const relatedCustomer = customerMap[group.customerId] || null;
        const vpn = buildVisitorVpnInfo($app, payload.storeId, session);
        return Object.assign(
          serializeVisitorSessionGroup(group, access.settings, customerMap),
          {
            vpn,
            security_status: buildVisitorSecurityStatus(session, relatedCustomer, vpn, activeBlocks),
          }
        );
      }),
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
    if (!access) return respondStorePermissionDenied(e, authRole(info.auth), authStore(info.auth), payload.storeId);

    const visitor = findRecordByIdSafe($app, VISITOR_SESSIONS_COLLECTION, payload.visitorSessionId);
    if (!visitor || getRelationId(visitor, "store") !== payload.storeId) {
      return e.json(404, { ok: false, error: "not_found" });
    }
    const relatedSessions = listRelatedVisitorSessions($app, payload.storeId, visitor, payload.range);
    const historicalSessions = listRelatedVisitorSessionsForHistory($app, payload.storeId, visitor);
    const displayedSessions = payload.fullHistory ? historicalSessions : relatedSessions;
    const visitorGroup = buildVisitorSessionGroup(displayedSessions) || buildVisitorSessionGroup([visitor]);
    const representative = visitorGroup.representative;
    const customerId = visitorGroup.customerId;
    const customerMap = buildSanitizedCustomerMap($app, payload.storeId, [customerId]);
    const relatedCustomer = customerMap[customerId] || null;
    const historicalIpSources = visitorHistoricalIpSources($app, payload.storeId, historicalSessions);
    const vpnEvents = listVisitorVpnEvents($app, payload.storeId, representative, 200);
    const vpn = buildVisitorVpnInfo($app, payload.storeId, representative, vpnEvents);
    const network = buildVisitorNetworkState(representative, historicalIpSources, vpnEvents);
    const networkHistory = paginateArray(
      buildVisitorNetworkHistory(historicalIpSources, network, access.settings),
      payload.networkPage,
      SECURITY_MONITORING_PAGE_SIZE
    );
    const activeBlocks = listVisitorStatusBlocks($app, payload.storeId);
    const pageviewFilter = buildStoreRelationFilter(
      payload.storeId,
      "visitor_session",
      displayedSessions.map((session) => session.id)
    );
    const allPageviews = pageviewFilter
      ? listRecordsPaged($app, VISITOR_PAGEVIEWS_COLLECTION, pageviewFilter.filter, "occurred_at,id", pageviewFilter.params, 200)
      : [];
    const pageviews = paginateArray(allPageviews, payload.page, SECURITY_MONITORING_PAGE_SIZE);
    const labels = buildPageviewLabelMaps($app, payload.storeId, pageviews.items);
    let orders = emptyVisitorCustomerOrdersPage(payload.ordersPage);
    let ordersError = false;
    if (customerId) {
      try {
        orders = buildVisitorCustomerOrdersDetail($app, payload.storeId, customerId, payload.ordersPage);
      } catch (_) {
        ordersError = true;
        logSecurity("error", "PZ_SEC_VISITOR_CUSTOMER_ORDERS_FAILED");
      }
    }
    return e.json(200, {
      ok: true,
      range: payload.range,
      full_history: payload.fullHistory,
      history_retention_days: VISITOR_SESSION_RETENTION_DAYS,
      pageview_retention_days: VISITOR_PAGEVIEW_RETENTION_DAYS,
      visitor: Object.assign(
        serializeVisitorSessionGroup(visitorGroup, access.settings, customerMap),
        {
          vpn,
          security_status: buildVisitorSecurityStatus(representative, relatedCustomer, vpn, activeBlocks),
          network_summary: network.summary,
        }
      ),
      orders,
      orders_error: ordersError,
      network_history: networkHistory,
      pageviews: {
        page: pageviews.page,
        perPage: pageviews.perPage,
        totalItems: pageviews.totalItems,
        totalPages: pageviews.totalPages,
        items: pageviews.items.map((pageview) => serializeVisitorPageview(pageview, access.settings, labels, network.statusByIpHmac)),
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

function emptyBlockDeviceReview() {
  return { pending_count: 0, confirmed_count: 0, dismissed_count: 0, pending: [] };
}

function serializeBlockDeviceCandidate(candidate, index) {
  return {
    id: candidate.id,
    label: `Dispositivo pendiente ${index + 1}`,
    first_seen_at: getString(candidate, "first_seen_at"),
    last_seen_at: getString(candidate, "last_seen_at"),
    attempts_count: Math.max(1, getNumber(candidate, "attempts_count")),
  };
}

function buildBlockDeviceReviewMap(app, storeId, blocks) {
  const map = {};
  const blockIds = uniqueIds((blocks || []).map((block) => block.id));
  blockIds.forEach((blockId) => { map[blockId] = emptyBlockDeviceReview(); });
  if (!blockIds.length || !findCollectionSafe(app, STORE_SECURITY_BLOCK_DEVICE_CANDIDATES_COLLECTION)) return map;

  const allowed = {};
  blockIds.forEach((blockId) => { allowed[blockId] = true; });
  const groupedPending = {};
  listRecordsPaged(
    app,
    STORE_SECURITY_BLOCK_DEVICE_CANDIDATES_COLLECTION,
    "store = {:store}",
    "-last_seen_at,-created",
    { store: storeId },
    200
  ).forEach((candidate) => {
    const blockId = getRelationId(candidate, "block");
    if (!allowed[blockId]) return;
    const status = getString(candidate, "status");
    if (status === "pending") {
      map[blockId].pending_count += 1;
      groupedPending[blockId] = groupedPending[blockId] || [];
      groupedPending[blockId].push(candidate);
    } else if (status === "confirmed") {
      map[blockId].confirmed_count += 1;
    } else if (status === "dismissed") {
      map[blockId].dismissed_count += 1;
    }
  });
  Object.keys(groupedPending).forEach((blockId) => {
    map[blockId].pending = groupedPending[blockId].map(serializeBlockDeviceCandidate);
  });
  return map;
}

function serializeSecurityBlock(block, settings, deviceReview) {
  const manualIp = getBoolean(block, "manual_ip");
  const ip = manualIp && settings
    ? getRecordIpDisplayFromFields(block, settings, "manual_ip_masked", "manual_ip_encrypted")
    : { ip_display: "", ip_resolution_status: "hidden" };
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
    manual_ip: manualIp,
    manual_ip_display: ip.ip_display,
    manual_ip_resolution_status: ip.ip_resolution_status,
    review_device_candidates: getBoolean(block, "review_device_candidates"),
    device_review: deviceReview || emptyBlockDeviceReview(),
  };
}

function serializeBlockForList(app, storeId, block, customerMap, actorMap, settings, deviceReviewMap) {
  const customerId = getRelationId(block, "customer");
  const customer = customerMap[customerId] || null;
  const actorId = getRelationId(block, "created_by");
  const revokedById = getRelationId(block, "revoked_by");
  const base = serializeSecurityBlock(block, settings, deviceReviewMap[block.id]);
  return {
    ...base,
    customer_name: customer ? getString(customer, "display_name") : "",
    primary_phone: customer ? primaryPhoneForCustomer(app, storeId, customer) : "",
    created_by_name: actorMap[actorId] || "",
    revoked_by_name: actorMap[revokedById] || "",
    reason: sanitizeLifecycleReason(getString(block, "reason_internal")),
    revoke_reason: sanitizeLifecycleReason(getString(block, "revoke_reason")),
    detail: null,
  };
}

function blockHistoryEventMetadataMatches(blockId, metadata) {
  const direct = String(metadata && (metadata.block_record_id || metadata.matched_block_id) || "");
  if (direct === blockId) return true;
  const matchedIds = metadata && Array.isArray(metadata.matched_block_ids) ? metadata.matched_block_ids : [];
  return matchedIds.some((value) => String(value || "") === blockId);
}

function securityEventRelatesToBlock(block, event) {
  const metadata = getObject(event, "metadata_json");
  if (blockHistoryEventMetadataMatches(block.id, metadata)) return true;

  const blockIps = uniqueHmacValues(getStringArray(block, "ip_hmac_values"));
  const blockDevices = uniqueHmacValues(getStringArray(block, "device_hmac_values"));
  const eventIp = getString(event, "ip_hmac");
  const eventDevice = getString(event, "browser_token_hmac");
  if (isValidHmacValue(eventIp) && blockIps.includes(eventIp)) return true;
  if (isValidHmacValue(eventDevice) && blockDevices.includes(eventDevice)) return true;

  const customerId = getRelationId(block, "customer");
  if (!customerId || getRelationId(event, "customer") !== customerId) return false;
  const startsAt = Date.parse(getString(block, "starts_at") || getString(block, "created"));
  const occurredAt = Date.parse(getString(event, "occurred_at") || getString(event, "created"));
  return Number.isFinite(startsAt) && Number.isFinite(occurredAt) && occurredAt >= startsAt;
}

function securityBlockIpState(block, includedInBlock, source) {
  const status = getString(block, "status");
  if (status === "expired") return "expired";
  if (status === "revoked") return "revoked";
  if (includedInBlock || (source === "device" && getBoolean(block, "match_device"))) return "blocked";
  return "observed";
}

function buildSecurityBlockDetail(app, storeId, block, settings) {
  const blockIps = uniqueHmacValues(getStringArray(block, "ip_hmac_values"));
  const blockDevices = uniqueHmacValues(getStringArray(block, "device_hmac_values"));
  const customerId = getRelationId(block, "customer");
  const relatedIps = {};
  const relatedSessions = {};
  const sourcePriority = { event: 1, customer: 2, device: 3, selected_ip: 4 };

  const addIp = (ipHmac, display, observedAt, source, options) => {
    const hmac = String(ipHmac || "").trim();
    if (!isValidHmacValue(hmac)) return;
    const opts = options || {};
    const existing = relatedIps[hmac] || {
      ip_display: "",
      ip_resolution_status: "unavailable",
      state: securityBlockIpState(block, blockIps.includes(hmac), source || "event"),
      link_source: blockIps.includes(hmac) ? "selected_ip" : (source || "event"),
      included_in_block: blockIps.includes(hmac),
      first_seen_at: "",
      last_seen_at: "",
      blocked_attempts: 0,
      sightings_count: 0,
      vpn_status: "none",
      visitor_session_id: "",
      _source_priority: 0,
    };
    const nextSource = existing.included_in_block ? "selected_ip" : (source || "event");
    const nextPriority = sourcePriority[nextSource] || 0;
    if (nextPriority >= existing._source_priority) {
      existing.link_source = nextSource;
      existing._source_priority = nextPriority;
      existing.state = securityBlockIpState(block, existing.included_in_block, nextSource);
    }
    const nextDisplay = display || {};
    if (nextDisplay.ip_display && (!existing.ip_display || nextDisplay.ip_resolution_status === "full")) {
      existing.ip_display = String(nextDisplay.ip_display || "");
      existing.ip_resolution_status = String(nextDisplay.ip_resolution_status || "unavailable");
    } else if (!existing.ip_display && nextDisplay.ip_resolution_status === "hidden") {
      existing.ip_resolution_status = "hidden";
    }
    const occurred = String(observedAt || "");
    if (occurred && (!existing.first_seen_at || occurred < existing.first_seen_at)) existing.first_seen_at = occurred;
    if (occurred && (!existing.last_seen_at || occurred > existing.last_seen_at)) existing.last_seen_at = occurred;
    existing.sightings_count += Math.max(0, Number(opts.sightings || 1));
    if (opts.blockedAttempt === true) existing.blocked_attempts += 1;
    if (opts.vpnStatus === "blocked") existing.vpn_status = "blocked";
    else if (opts.vpnStatus === "detected" && existing.vpn_status !== "blocked") existing.vpn_status = "detected";
    if (!existing.visitor_session_id && isValidRecordId(opts.visitorSessionId)) {
      existing.visitor_session_id = String(opts.visitorSessionId);
    }
    relatedIps[hmac] = existing;
  };

  blockIps.forEach((ipHmac) => addIp(ipHmac, {}, getString(block, "created") || getString(block, "starts_at"), "selected_ip", { sightings: 0 }));
  if (getBoolean(block, "manual_ip") && blockIps.length) {
    addIp(
      blockIps[0],
      getRecordIpDisplayFromFields(block, settings, "manual_ip_masked", "manual_ip_encrypted"),
      getString(block, "created") || getString(block, "starts_at"),
      "selected_ip",
      { sightings: 0 }
    );
  }

  const customerDevices = customerId && findCollectionSafe(app, STORE_CUSTOMER_DEVICES_COLLECTION)
    ? listRecordsPaged(
      app,
      STORE_CUSTOMER_DEVICES_COLLECTION,
      "store = {:store} && customer = {:customer}",
      "-last_seen_at,-created",
      { store: storeId, customer: customerId },
      200
    )
    : [];
  customerDevices.forEach((device) => {
    const deviceHmac = getString(device, "browser_token_hmac");
    const source = blockDevices.includes(deviceHmac) ? "device" : "customer";
    addIp(
      getString(device, "latest_ip_hmac"),
      getDeviceIpDisplay(device, settings),
      getString(device, "last_seen_at") || getString(device, "updated"),
      source,
      { sightings: 1 }
    );
  });

  const sessions = [];
  const addSession = (session) => {
    if (!session || relatedSessions[session.id] || getRelationId(session, "store") !== storeId) return;
    relatedSessions[session.id] = true;
    sessions.push(session);
  };
  if (findCollectionSafe(app, VISITOR_SESSIONS_COLLECTION)) {
    if (customerId) {
      listRecordsPaged(
        app,
        VISITOR_SESSIONS_COLLECTION,
        "store = {:store} && customer = {:customer}",
        "-last_seen_at,-created",
        { store: storeId, customer: customerId },
        200
      ).forEach(addSession);
    }
    blockDevices.forEach((deviceHmac) => {
      listRecordsPaged(
        app,
        VISITOR_SESSIONS_COLLECTION,
        "store = {:store} && browser_token_hmac = {:device}",
        "-last_seen_at,-created",
        { store: storeId, device: deviceHmac },
        200
      ).forEach(addSession);
    });
  }
  sessions.forEach((session) => {
    const source = blockDevices.includes(getString(session, "browser_token_hmac")) ? "device" : "customer";
    addIp(
      getString(session, "latest_ip_hmac"),
      getVisitorSessionIpDisplay(session, settings),
      getString(session, "last_seen_at") || getString(session, "updated"),
      source,
      { sightings: 1, visitorSessionId: session.id }
    );
    if (!findCollectionSafe(app, VISITOR_PAGEVIEWS_COLLECTION)) return;
    listRecordsPaged(
      app,
      VISITOR_PAGEVIEWS_COLLECTION,
      "store = {:store} && visitor_session = {:visitorSession}",
      "-occurred_at,-created",
      { store: storeId, visitorSession: session.id },
      200
    ).forEach((pageview) => {
      addIp(
        getString(pageview, "ip_hmac"),
        getRecordIpDisplay(pageview, settings),
        getString(pageview, "occurred_at") || getString(pageview, "created"),
        source,
        { sightings: 1, visitorSessionId: session.id }
      );
    });
  });

  const events = findCollectionSafe(app, SECURITY_EVENTS_COLLECTION)
    ? listRecordsPaged(
      app,
      SECURITY_EVENTS_COLLECTION,
      "store = {:store}",
      "-occurred_at,-created",
      { store: storeId },
      200
    ).filter((event) => securityEventRelatesToBlock(block, event))
    : [];
  events.forEach((event) => {
    const eventType = getString(event, "event_type");
    const eventDevice = getString(event, "browser_token_hmac");
    const eventIp = getString(event, "ip_hmac");
    const source = blockIps.includes(eventIp)
      ? "selected_ip"
      : blockDevices.includes(eventDevice) ? "device" : "event";
    const navigation = buildActivityNavigation(app, storeId, event, new Date());
    addIp(
      eventIp,
      getRecordIpDisplay(event, settings),
      getString(event, "occurred_at") || getString(event, "created"),
      source,
      {
        sightings: 1,
        blockedAttempt: eventType === "blocked_attempt",
        vpnStatus: eventType === "vpn_blocked" ? "blocked" : eventType === "vpn_detected" ? "detected" : "none",
        visitorSessionId: navigation.kind === "visitor" ? navigation.target_id : "",
      }
    );
  });

  const audits = findCollectionSafe(app, STORE_SECURITY_AUDIT_COLLECTION)
    ? listRecordsPaged(
      app,
      STORE_SECURITY_AUDIT_COLLECTION,
      "store = {:store} && block_record_id = {:block}",
      "-created,-id",
      { store: storeId, block: block.id },
      200
    )
    : [];
  const auditActorMap = buildActorMap(app, audits.map((audit) => getRelationId(audit, "actor")));
  const history = audits.map((audit) => ({
    id: audit.id,
    kind: "administrative",
    action: getString(audit, "action"),
    occurred_at: getString(audit, "created"),
    actor_name: auditActorMap[getRelationId(audit, "actor")] || "Sistema",
    reason: sanitizeLifecycleReason(getString(audit, "reason_internal")),
    decision: "",
    risk_level: "",
    ip_display: "",
    ip_resolution_status: "unavailable",
    navigation: { kind: "none", target_id: "" },
  }));
  events.forEach((event) => {
    const ip = getRecordIpDisplay(event, settings);
    history.push({
      id: event.id,
      kind: "security_event",
      action: getString(event, "event_type"),
      occurred_at: getString(event, "occurred_at") || getString(event, "created"),
      actor_name: "Sistema",
      reason: "",
      decision: getString(event, "decision"),
      risk_level: getString(event, "risk_level"),
      ip_display: ip.ip_display,
      ip_resolution_status: ip.ip_resolution_status,
      navigation: buildActivityNavigation(app, storeId, event, new Date()),
    });
  });
  history.sort((left, right) => String(right.occurred_at || "").localeCompare(String(left.occurred_at || "")) || String(right.id).localeCompare(String(left.id)));

  const addressCount = findCollectionSafe(app, STORE_SECURITY_BLOCK_ADDRESSES_COLLECTION)
    ? countRecordsByFilter(
      app,
      STORE_SECURITY_BLOCK_ADDRESSES_COLLECTION,
      "store = {:store} && block = {:block}",
      { store: storeId, block: block.id }
    )
    : 0;
  const ips = Object.keys(relatedIps).map((key) => relatedIps[key])
    .sort((left, right) => String(right.last_seen_at || "").localeCompare(String(left.last_seen_at || "")) || Number(right.included_in_block) - Number(left.included_in_block))
    .slice(0, SECURITY_BLOCK_RELATED_IP_LIMIT)
    .map((item) => {
      const safe = { ...item };
      delete safe._source_priority;
      return safe;
    });

  return {
    related_ips: ips,
    related_ip_count: Object.keys(relatedIps).length,
    related_device_count: blockDevices.length,
    related_address_count: addressCount,
    history: history.slice(0, SECURITY_BLOCK_HISTORY_LIMIT),
    history_count: history.length,
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

function expireDueSecurityBlocks(app, onlyStoreId) {
  if (!findCollectionSafe(app, STORE_SECURITY_BLOCKS_COLLECTION)) return { expired: 0 };
  const now = new Date();
  let expiredCount = 0;
  const storeId = isValidRecordId(onlyStoreId) ? String(onlyStoreId) : "";

  const activeBlocks = listRecordsPaged(
    app,
    STORE_SECURITY_BLOCKS_COLLECTION,
    storeId
      ? 'store = {:store} && status = "active" && expires_at != ""'
      : 'status = "active" && expires_at != ""',
    "expires_at",
    storeId ? { store: storeId } : {},
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
    if (!canReadStore(role, authStoreId, storeId, auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, storeId);
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

    if (!canReadStore(role, authStoreId, storeId, auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, storeId);
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
      address_candidates: [],
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

    try {
      response.address_candidates = buildCustomerAddressCandidates($app, storeId, canonicalCustomerId)
        .map(serializeAddressCandidate);
    } catch (_) {
      logSecurity("error", "PZ_SEC_CUSTOMER_DETAIL_ADDRESSES_FAILED");
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
  const actor = actorId ? findRecordByIdSafe(app, "users", actorId) : null;
  if (actorId && !actor) throw new Error("security_activity_actor_missing");
  const stateChanges = {
    archive_customer: { field: "profile_state", previous: "active", next: "archived" },
    restore_customer: { field: "profile_state", previous: "archived", next: "active" },
    auto_restore_customer: { field: "profile_state", previous: "archived", next: "active" },
    delete_customer_profile: { field: "profile_state", previous: "existing", next: "deleted" },
    customer_watch_enabled: { field: "observation_state", previous: "disabled", next: "enabled" },
    customer_watch_disabled: { field: "observation_state", previous: "enabled", next: "disabled" },
    block_created: { field: "block_state", previous: "inactive", next: "active" },
    block_revoked: { field: "block_state", previous: "active", next: "revoked" },
    block_expired: { field: "block_state", previous: "active", next: "expired" },
    block_device_candidate_detected: { field: "device_review_state", previous: "none", next: "pending" },
    block_device_candidate_confirmed: { field: "device_review_state", previous: "pending", next: "confirmed" },
    block_device_candidate_dismissed: { field: "device_review_state", previous: "pending", next: "dismissed" },
    vpn_policy_updated: { field: "vpn_policy", previous: "previous", next: "updated" },
    ip_information_revealed: { field: "protected_information_access", previous: "protected", next: "revealed_authorized" },
    security_customer_identity_merged: { field: "customer_identity_state", previous: "separate", next: "merged" },
  };
  const change = stateChanges[action] || { field: "security_state", previous: "previous", next: "updated" };
  storeActivity.createActivity(app, {
    storeId,
    actor,
    origin: actor ? undefined : "system",
    module: "security",
    action,
    severity: ["block_created", "block_revoked", "block_device_candidate_confirmed", "delete_customer_profile", "ip_information_revealed", "security_customer_identity_merged"].includes(action)
      ? "critical"
      : "important",
    resourceType: "security",
    resourceId: "",
    resourceLabel: "Seguridad de la tienda",
    changedFields: [change.field],
    previousValues: { [change.field]: change.previous },
    newValues: { [change.field]: change.next },
    summary: SECURITY_ACTIVITY_SUMMARIES[action] || "Seguridad actualizada",
    sourceEventKey: `security:${action}:${audit.id}`,
  });
  return audit;
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

function getOrderAddressCandidate(app, storeId, order) {
  if (!order || getRelationId(order, "store") !== storeId) return null;
  if (getString(order, "delivery_method") !== "delivery") return null;
  const addressDisplay = limitText(getString(order, "customer_address"), 300);
  const zoneId = getRelationId(order, "shipping_zone");
  const zone = zoneId ? findRecordByIdSafe(app, SHIPPING_ZONES_COLLECTION, zoneId) : null;
  if (!zone || getRelationId(zone, "store") !== storeId) return null;
  const municipalityDisplay = limitText(getString(zone, "municipality") || getString(zone, "zone"), 160);
  const fingerprint = deliveryAddressFingerprint(municipalityDisplay, addressDisplay);
  if (!fingerprint) return null;
  return {
    order_id: order.id,
    address_display: addressDisplay,
    municipality_display: municipalityDisplay,
    last_used_at: getString(order, "created"),
    uses_count: 1,
    preselected: false,
    fingerprint,
  };
}

function buildCustomerAddressCandidates(app, storeId, canonicalCustomerId) {
  if (!findCollectionSafe(app, ORDERS_COLLECTION) || !findCollectionSafe(app, SHIPPING_ZONES_COLLECTION)) return [];
  const customerIds = collectCanonicalAndAliasIds(app, storeId, canonicalCustomerId);
  const orders = listByStoreRelation(app, ORDERS_COLLECTION, storeId, "customer", customerIds, "-created");
  orders.sort((left, right) => getString(right, "created").localeCompare(getString(left, "created")));
  const byFingerprint = {};
  const candidates = [];
  orders.forEach((order) => {
    const candidate = getOrderAddressCandidate(app, storeId, order);
    if (!candidate) return;
    const existing = byFingerprint[candidate.fingerprint];
    if (existing) {
      existing.uses_count += 1;
      return;
    }
    byFingerprint[candidate.fingerprint] = candidate;
    candidates.push(candidate);
  });
  if (candidates.length) candidates[0].preselected = true;
  return candidates.slice(0, 50);
}

function serializeAddressCandidate(candidate) {
  return {
    order_id: candidate.order_id,
    address_display: candidate.address_display,
    municipality_display: candidate.municipality_display,
    last_used_at: candidate.last_used_at,
    uses_count: candidate.uses_count,
    preselected: candidate.preselected === true,
  };
}

function selectedAddressSignals(app, storeId, canonicalCustomerId, orderIds, secret) {
  if (!Array.isArray(orderIds) || orderIds.length > 50) return { error: "address_order_ids" };
  if (orderIds.some((id) => !isValidRecordId(id))) return { error: "address_order_ids" };
  const selectedIds = uniqueIds(orderIds);
  const candidates = buildCustomerAddressCandidates(app, storeId, canonicalCustomerId);
  if (!selectedIds.length) return candidates.length ? { error: "address_order_ids" } : { values: [] };
  if (!secret || !findCollectionSafe(app, STORE_SECURITY_BLOCK_ADDRESSES_COLLECTION)) {
    return { error: "address_alerts_unavailable" };
  }
  const byOrderId = {};
  candidates.forEach((candidate) => { byOrderId[candidate.order_id] = candidate; });
  const values = [];
  selectedIds.forEach((orderId) => {
    const candidate = byOrderId[orderId];
    if (!candidate) return;
    values.push({
      sourceOrderId: orderId,
      addressHmac: hmacValue("delivery_address", storeId, candidate.fingerprint, secret),
    });
  });
  if (values.length !== selectedIds.length) return { error: "address_order_ids" };
  return { values };
}

function createBlockAddressSignals(app, storeId, block, customerId, values) {
  if (!values || !values.length) return 0;
  const collection = app.findCollectionByNameOrId(STORE_SECURITY_BLOCK_ADDRESSES_COLLECTION);
  values.forEach((value) => {
    const record = new Record(collection, {});
    record.set("store", storeId);
    record.set("block", block.id);
    record.set("source_customer", customerId);
    record.set("source_order", value.sourceOrderId);
    record.set("address_hmac", value.addressHmac);
    record.set("normalization_version", "v1");
    app.save(record);
  });
  return values.length;
}

function isBlockActiveAt(block, now) {
  if (!block || getString(block, "status") !== "active") return false;
  const expiresAt = getString(block, "expires_at");
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs > now.getTime();
}

function createAddressMatchEvent(app, storeId, order, customerId, settings, block, now) {
  const eventKey = `blocked_address_match:${order.id}:${block.id}`;
  const existing = findFirstByFilter(app, SECURITY_EVENTS_COLLECTION, "event_key = {:eventKey}", { eventKey });
  if (existing) return existing;
  const collection = app.findCollectionByNameOrId(SECURITY_EVENTS_COLLECTION);
  const event = new Record(collection, {});
  event.set("store", storeId);
  if (customerId) event.set("customer", customerId);
  event.set("order", order.id);
  event.set("event_key", eventKey);
  event.set("event_type", "blocked_address_match");
  event.set("source_type", "order");
  event.set("risk_level", "suspicious");
  event.set("decision", "monitored");
  event.set("mode_at_event", getString(settings, "mode") === "protection" ? "protection" : "monitoring");
  event.set("ip_family", "unknown");
  event.set("capture_status", "unavailable");
  event.set("crypto_version", "v1");
  event.set("metadata_json", { matched_block_id: block.id, match_type: "delivery_address_exact_v1" });
  event.set("occurred_at", now.toISOString());
  try {
    app.save(event);
    return event;
  } catch (error) {
    const raced = findFirstByFilter(app, SECURITY_EVENTS_COLLECTION, "event_key = {:eventKey}", { eventKey });
    if (raced) return raced;
    throw error;
  }
}

function createAddressMatchNotification(app, storeId, order, store, events, blocks) {
  if (!events.length || !findCollectionSafe(app, STORE_NOTIFICATIONS_COLLECTION)) return null;
  const existing = findFirstByFilter(
    app,
    STORE_NOTIFICATIONS_COLLECTION,
    'store = {:store} && type = "security_address_match" && entity_collection = "orders" && entity_id = {:order}',
    { store: storeId, order: order.id }
  );
  if (existing) return existing;
  const notification = new Record(app.findCollectionByNameOrId(STORE_NOTIFICATIONS_COLLECTION), {});
  notification.set("store", storeId);
  notification.set("type", "security_address_match");
  notification.set("title", "Dirección vinculada a un cliente bloqueado");
  notification.set("message", `El pedido ${getString(order, "order_number") || order.id} necesita revisión de Seguridad.`);
  notification.set("status", "unread");
  notification.set("priority", "important");
  notification.set("target_url", `/t/${getString(store, "slug")}/admin/orders/${order.id}`);
  notification.set("entity_collection", "orders");
  notification.set("entity_id", order.id);
  notification.set("metadata_json", {
    match_type: "delivery_address_exact_v1",
    security_event_ids: uniqueIds(events.map((event) => event.id)),
    matched_block_ids: uniqueIds(blocks.map((block) => block.id)),
  });
  try {
    app.save(notification);
    return notification;
  } catch (error) {
    const raced = findFirstByFilter(
      app,
      STORE_NOTIFICATIONS_COLLECTION,
      'store = {:store} && type = "security_address_match" && entity_collection = "orders" && entity_id = {:order}',
      { store: storeId, order: order.id }
    );
    if (raced) return raced;
    throw error;
  }
}

function recordBlockedAddressMatchForOrder(app, order, customer, settings, secret) {
  try {
    if (!app || !order || !secret || !findCollectionSafe(app, STORE_SECURITY_BLOCK_ADDRESSES_COLLECTION)) {
      return { matched: false, event_count: 0 };
    }
    const storeId = getRelationId(order, "store");
    const address = getOrderAddressCandidate(app, storeId, order);
    if (!storeId || !address) return { matched: false, event_count: 0 };
    const addressHmac = hmacValue("delivery_address", storeId, address.fingerprint, secret);
    const storedAddresses = listRecordsPaged(
      app,
      STORE_SECURITY_BLOCK_ADDRESSES_COLLECTION,
      "store = {:store} && address_hmac = {:addressHmac}",
      "-created",
      { store: storeId, addressHmac },
      100
    );
    if (!storedAddresses.length) return { matched: false, event_count: 0 };
    const now = new Date();
    const blocks = [];
    storedAddresses.forEach((stored) => {
      const block = findRecordByIdSafe(app, STORE_SECURITY_BLOCKS_COLLECTION, getRelationId(stored, "block"));
      if (!block || getRelationId(block, "store") !== storeId || !isBlockActiveAt(block, now)) return;
      if (!blocks.some((item) => item.id === block.id)) blocks.push(block);
    });
    if (!blocks.length) return { matched: false, event_count: 0 };
    const customerId = customer && getRelationId(customer, "store") === storeId ? customer.id : getRelationId(order, "customer");
    const events = blocks.map((block) => createAddressMatchEvent(app, storeId, order, customerId, settings, block, now));
    const store = findRecordByIdSafe(app, STORES_COLLECTION, storeId);
    if (store) createAddressMatchNotification(app, storeId, order, store, events, blocks);
    return { matched: true, event_count: events.length };
  } catch (_) {
    logSecurity("warn", "PZ_SEC_ADDRESS_MATCH_WRITE_SKIPPED");
    return { matched: false, event_count: 0 };
  }
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
  const allowed = ["store_id", "customer_id", "action", "scope", "duration", "match_phone", "match_device", "match_ip", "match_mode", "address_order_ids", "reason"];
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
  const addressOrderIds = bodyRecordIds(getBodyValue(body, "address_order_ids"));
  const reason = sanitizeLifecycleReason(getBodyValue(body, "reason"));

  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!isValidRecordId(customerId)) return { error: "customer_id" };
  if (action !== "create") return { error: "action" };
  if (!SECURITY_BLOCK_SCOPES.includes(scope)) return { error: "scope" };
  if (!SECURITY_BLOCK_DURATIONS.includes(duration)) return { error: "duration" };
  if (matchPhone === null || matchDevice === null || matchIp === null) return { error: "signals" };
  if (!matchPhone && !matchDevice && !matchIp) return { error: "signals" };
  if (!SECURITY_BLOCK_MATCH_MODES.includes(matchMode)) return { error: "match_mode" };
  if (!addressOrderIds) return { error: "address_order_ids" };
  if (!reason) return { error: "reason" };
  return { storeId, customerId, action, scope, duration, matchPhone, matchDevice, matchIp, matchMode, addressOrderIds, reason };
}

function bodyRecordIds(value) {
  let items = value;
  if (!Array.isArray(items)) {
    try { items = JSON.parse(String(value || "[]")); } catch (_) { items = []; }
  }
  if (!Array.isArray(items) || items.length > 50) return null;
  const result = [];
  for (const item of items) {
    const id = String(item || "").trim();
    if (!isValidRecordId(id)) return null;
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

function parseManualIpBlockCreatePayload(body) {
  const allowed = ["store_id", "action", "scope", "duration", "ip", "visitor_session_id", "ip_source_ids", "device_session_ids", "reason"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const action = String(getBodyValue(body, "action") || "").trim();
  const scope = String(getBodyValue(body, "scope") || "").trim();
  const duration = String(getBodyValue(body, "duration") || "").trim();
  const ipValue = String(getBodyValue(body, "ip") || "").trim();
  const normalizedIp = normalizeIpAddress(ipValue);
  const visitorSessionId = String(getBodyValue(body, "visitor_session_id") || "").trim();
  const ipSourceIds = bodyRecordIds(getBodyValue(body, "ip_source_ids"));
  const deviceSessionIds = bodyRecordIds(getBodyValue(body, "device_session_ids"));
  const reason = sanitizeLifecycleReason(getBodyValue(body, "reason"));

  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (action !== "create_manual_ip") return { error: "action" };
  if (!SECURITY_BLOCK_SCOPES.includes(scope)) return { error: "scope" };
  if (!SECURITY_BLOCK_DURATIONS.includes(duration)) return { error: "duration" };
  if (Boolean(ipValue) === Boolean(visitorSessionId)) return { error: "ip_source" };
  if (ipValue && (!normalizedIp.valid || !isPublicIpAddress(normalizedIp))) return { error: "ip" };
  if (visitorSessionId && !isValidRecordId(visitorSessionId)) return { error: "visitor_session_id" };
  if (ipSourceIds === null || (ipValue && ipSourceIds.length > 0) || (visitorSessionId && ipSourceIds.length < 1)) {
    return { error: "ip_source_ids" };
  }
  if (deviceSessionIds === null) return { error: "device_session_ids" };
  if (!reason) return { error: "reason" };
  return { storeId, action, scope, duration, normalizedIp, visitorSessionId, ipSourceIds, deviceSessionIds, reason };
}

function parseManualIpDeviceLookupPayload(body) {
  const allowed = ["store_id", "ip", "visitor_session_id"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const ipValue = String(getBodyValue(body, "ip") || "").trim();
  const visitorSessionId = String(getBodyValue(body, "visitor_session_id") || "").trim();
  const normalizedIp = normalizeIpAddress(ipValue);
  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (Boolean(ipValue) === Boolean(visitorSessionId)) return { error: "ip_source" };
  if (ipValue && (!normalizedIp.valid || !isPublicIpAddress(normalizedIp))) return { error: "ip" };
  if (visitorSessionId && !isValidRecordId(visitorSessionId)) return { error: "visitor_session_id" };
  return { storeId, normalizedIp, visitorSessionId };
}

function parseVpnPolicyPayload(body) {
  const allowed = ["store_id", "vpn_policy"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const policy = String(getBodyValue(body, "vpn_policy") || "").trim();
  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!["off", "monitor", "block"].includes(policy)) return { error: "vpn_policy" };
  return { storeId, policy };
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

function parseBlockDeviceReviewPayload(body) {
  const allowed = ["store_id", "action", "block_id", "candidate_id", "reason"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const action = String(getBodyValue(body, "action") || "").trim();
  const blockId = String(getBodyValue(body, "block_id") || "").trim();
  const candidateId = String(getBodyValue(body, "candidate_id") || "").trim();
  const reason = sanitizeLifecycleReason(getBodyValue(body, "reason"));
  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!isValidRecordId(blockId)) return { error: "block_id" };
  if (!isValidRecordId(candidateId)) return { error: "candidate_id" };
  if (action !== "confirm_device_candidate" && action !== "dismiss_device_candidate") return { error: "action" };
  if (!reason) return { error: "reason" };
  return { storeId, action, blockId, candidateId, reason };
}

function parseBlockActionPayload(body) {
  const action = String(getBodyValue(body, "action") || "").trim();
  if (action === "create") return parseBlockCreatePayload(body);
  if (action === "create_manual_ip") return parseManualIpBlockCreatePayload(body);
  if (action === "revoke") return parseBlockRevokePayload(body);
  if (action === "confirm_device_candidate" || action === "dismiss_device_candidate") {
    return parseBlockDeviceReviewPayload(body);
  }
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

function hasOverlappingActiveIpBlock(app, storeId, scope, ipHmac) {
  if (!isValidHmacValue(ipHmac)) return false;
  return listRecordsPaged(
    app,
    STORE_SECURITY_BLOCKS_COLLECTION,
    'store = {:store} && status = "active"',
    "",
    { store: storeId },
    200
  ).some((block) => blockScopesOverlap(getString(block, "scope"), scope)
    && getBoolean(block, "match_ip")
    && uniqueHmacValues(getStringArray(block, "ip_hmac_values")).includes(ipHmac));
}

function captureFromVisitorSession(session) {
  return {
    ip_hmac: getString(session, "latest_ip_hmac"),
    ip_masked: getString(session, "latest_ip_masked"),
    ip_encrypted: getString(session, "latest_ip_encrypted"),
    ip_family: getString(session, "latest_ip_family") || "unknown",
    capture_status: getString(session, "latest_capture_status") || "partial",
  };
}

function captureFromVisitorPageview(pageview) {
  return {
    ip_hmac: getString(pageview, "ip_hmac"),
    ip_masked: getString(pageview, "ip_masked"),
    ip_encrypted: getString(pageview, "ip_encrypted"),
    ip_family: getString(pageview, "ip_family") || "unknown",
    capture_status: getString(pageview, "capture_status") || "partial",
  };
}

function visitorHistoricalIpSources(app, storeId, sourceSession) {
  const sourceSessions = (Array.isArray(sourceSession) ? sourceSession : [sourceSession])
    .filter((session) => session && getRelationId(session, "store") === storeId);
  if (!sourceSessions.length) return [];
  const sources = [];
  const sourceByHmac = {};
  const addSource = (record, kind, capture, firstSeenAt, lastSeenAt, isCurrent) => {
    const sourceId = String(record && record.id || "").trim();
    const ipHmac = String(capture && capture.ip_hmac || "").trim();
    if (!isValidRecordId(sourceId) || !isValidHmacValue(ipHmac)) return;
    const firstSeen = String(firstSeenAt || lastSeenAt || "");
    const lastSeen = String(lastSeenAt || firstSeenAt || "");
    const existing = sourceByHmac[ipHmac];
    if (existing) {
      if (!existing.first_seen_at || (firstSeen && Date.parse(firstSeen) < Date.parse(existing.first_seen_at))) {
        existing.first_seen_at = firstSeen;
      }
      if (!existing.last_seen_at || (lastSeen && Date.parse(lastSeen) > Date.parse(existing.last_seen_at))) {
        existing.last_seen_at = lastSeen;
      }
      existing.sightings_count += 1;
      existing.is_current = existing.is_current || isCurrent === true;
      return;
    }
    if (sources.length >= 50) return;
    const source = {
      source_id: sourceId,
      kind,
      record,
      capture,
      first_seen_at: firstSeen,
      last_seen_at: lastSeen,
      sightings_count: 1,
      is_current: isCurrent === true,
    };
    sourceByHmac[ipHmac] = source;
    sources.push(source);
  };

  sourceSessions.forEach((session, index) => {
    addSource(
      session,
      "session",
      captureFromVisitorSession(session),
      getString(session, "first_seen_at") || getString(session, "created"),
      getString(session, "last_seen_at") || getString(session, "updated"),
      index === 0
    );
  });
  if (!findCollectionSafe(app, VISITOR_PAGEVIEWS_COLLECTION)) return sources;
  let pageviews = [];
  if (sourceSessions.length === 1) {
    pageviews = listRecordsPaged(
      app,
      VISITOR_PAGEVIEWS_COLLECTION,
      "store = {:store} && visitor_session = {:visitorSession}",
      "-occurred_at,-id",
      { store: storeId, visitorSession: sourceSessions[0].id },
      200
    );
  } else {
    const pageviewFilter = buildStoreRelationFilter(storeId, "visitor_session", sourceSessions.map((session) => session.id));
    pageviews = pageviewFilter
      ? listRecordsPaged(app, VISITOR_PAGEVIEWS_COLLECTION, pageviewFilter.filter, "-occurred_at,-id", pageviewFilter.params, 200)
      : [];
  }
  pageviews.forEach((pageview) => {
    const occurredAt = getString(pageview, "occurred_at") || getString(pageview, "created");
    addSource(pageview, "pageview", captureFromVisitorPageview(pageview), occurredAt, occurredAt, false);
  });
  return sources;
}

function buildVisitorNetworkHistory(ipSources, networkState, settings) {
  const statusByIpHmac = networkState && networkState.statusByIpHmac || {};
  return (Array.isArray(ipSources) ? ipSources : [])
    .map((source) => {
      const ipHmac = String(source && source.capture && source.capture.ip_hmac || "").trim();
      const display = source.kind === "session"
        ? getVisitorSessionIpDisplay(source.record, settings)
        : getRecordIpDisplay(source.record, settings);
      const network = statusByIpHmac[ipHmac] || { status: "normal", observed_at: "" };
      return {
        ip_display: display.ip_display,
        ip_resolution_status: display.ip_resolution_status,
        network_status: network.status,
        network_observed_at: network.observed_at,
        first_seen_at: String(source.first_seen_at || source.last_seen_at || ""),
        last_seen_at: String(source.last_seen_at || source.first_seen_at || ""),
        sightings_count: Math.max(1, Number(source.sightings_count) || 1),
      };
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.last_seen_at);
      const rightTime = Date.parse(right.last_seen_at);
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
        || String(left.ip_display || "").localeCompare(String(right.ip_display || ""));
    });
}

function resolveManualIpSource(app, parsed, settings, secret) {
  if (parsed.visitorSessionId) {
    const session = findRecordByIdSafe(app, VISITOR_SESSIONS_COLLECTION, parsed.visitorSessionId);
    if (!session || getRelationId(session, "store") !== parsed.storeId) return { error: "visitor_not_found" };
    const allSources = visitorHistoricalIpSources(app, parsed.storeId, session);
    if (allSources.length < 1) return { error: "visitor_ip_unavailable" };
    const selectedSources = Array.isArray(parsed.ipSourceIds)
      ? parsed.ipSourceIds.map((sourceId) => allSources.find((source) => source.source_id === sourceId)).filter(Boolean)
      : allSources;
    if (Array.isArray(parsed.ipSourceIds)
      && (selectedSources.length !== parsed.ipSourceIds.length || selectedSources.length < 1)) {
      return { error: "ip_source_ids" };
    }
    return {
      capture: selectedSources[0].capture,
      captures: selectedSources.map((source) => source.capture),
      selectedSources,
      allSources,
      sourceSession: session,
    };
  }
  const capture = buildIpCapture(parsed.normalizedIp, parsed.storeId, settings, secret);
  return isValidHmacValue(capture.ip_hmac)
    ? { capture, captures: [capture], selectedSources: [], allSources: [], sourceSession: null }
    : { error: "security_secret_unavailable" };
}

function manualIpDeviceCandidates(app, storeId, ipHmacValues, sourceSession) {
  const ipHmacs = uniqueHmacValues(Array.isArray(ipHmacValues) ? ipHmacValues : [ipHmacValues]);
  if (ipHmacs.length < 1) return [];
  const sessions = [];
  if (sourceSession && getRelationId(sourceSession, "store") === storeId) sessions.push(sourceSession);
  ipHmacs.forEach((ipHmac) => {
    listRecordsPaged(
      app,
      VISITOR_SESSIONS_COLLECTION,
      "store = {:store} && latest_ip_hmac = {:ipHmac}",
      "-last_seen_at,-id",
      { store: storeId, ipHmac },
      200
    ).forEach((session) => {
      if (!sessions.some((existing) => existing.id === session.id)) sessions.push(session);
    });
  });
  const sourceDevice = sourceSession ? getString(sourceSession, "browser_token_hmac") : "";
  const seen = {};
  const candidates = [];
  sessions.forEach((session) => {
    const deviceHmac = getString(session, "browser_token_hmac");
    if (!isValidHmacValue(deviceHmac) || seen[deviceHmac] || candidates.length >= 50) return;
    seen[deviceHmac] = true;
    candidates.push({
      session_id: session.id,
      device_hmac: deviceHmac,
      last_seen_at: getString(session, "last_seen_at"),
      preselected: Boolean(sourceDevice && sourceDevice === deviceHmac),
    });
  });
  return candidates;
}

function selectedManualDeviceHmacs(candidates, selectedSessionIds) {
  const bySession = {};
  candidates.forEach((candidate) => { bySession[candidate.session_id] = candidate.device_hmac; });
  const result = [];
  for (const sessionId of selectedSessionIds || []) {
    const deviceHmac = bySession[sessionId];
    if (!isValidHmacValue(deviceHmac)) return { error: "device_session_ids" };
    if (!result.includes(deviceHmac)) result.push(deviceHmac);
  }
  return { values: result };
}

function serializeManualIpDeviceCandidates(candidates) {
  return (candidates || []).map((candidate, index) => ({
    session_id: candidate.session_id,
    label: `Dispositivo observado ${index + 1}`,
    last_seen_at: candidate.last_seen_at,
    preselected: candidate.preselected === true,
  }));
}

function serializeManualIpCandidates(sources, settings) {
  return (sources || []).map((source) => {
    const display = source.kind === "session"
      ? getVisitorSessionIpDisplay(source.record, settings)
      : getRecordIpDisplay(source.record, settings);
    return {
      source_id: source.source_id,
      ip_display: display.ip_display,
      ip_resolution_status: display.ip_resolution_status,
      last_seen_at: source.last_seen_at,
      preselected: source.is_current === true,
    };
  });
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

function createManualIpBlockRecord(app, storeId, actorId, parsed, ipCaptures, deviceHmacs) {
  const now = new Date();
  const captures = (Array.isArray(ipCaptures) ? ipCaptures : [ipCaptures])
    .filter((capture) => capture && isValidHmacValue(capture.ip_hmac));
  const representative = captures[0];
  const selectedIps = uniqueHmacValues(captures.map((capture) => capture.ip_hmac));
  const selectedDevices = uniqueHmacValues(deviceHmacs || []);
  const collection = app.findCollectionByNameOrId(STORE_SECURITY_BLOCKS_COLLECTION);
  const block = new Record(collection, {});
  block.set("store", storeId);
  block.set("customer", "");
  block.set("scope", parsed.scope);
  block.set("status", "active");
  block.set("match_phone", false);
  block.set("match_device", selectedDevices.length > 0);
  block.set("match_ip", true);
  block.set("match_mode", "any");
  block.set("phone_hmac_values", []);
  block.set("device_hmac_values", selectedDevices);
  block.set("ip_hmac_values", selectedIps);
  block.set("duration", parsed.duration);
  block.set("starts_at", now.toISOString());
  block.set("expires_at", durationExpiresAt(parsed.duration, now));
  block.set("reason_internal", parsed.reason);
  block.set("manual_ip", true);
  block.set("manual_ip_masked", representative.ip_masked || "");
  block.set("manual_ip_encrypted", representative.ip_encrypted || "");
  block.set("manual_ip_family", representative.ip_family || "unknown");
  block.set("manual_ip_capture_status", representative.capture_status || "partial");
  block.set("review_device_candidates", true);
  if (actorId) block.set("created_by", actorId);
  app.save(block);
  return block;
}

function findBlockDeviceCandidate(app, storeId, blockId, deviceHmac) {
  return findFirstByFilter(
    app,
    STORE_SECURITY_BLOCK_DEVICE_CANDIDATES_COLLECTION,
    "store = {:store} && block = {:block} && device_hmac = {:device}",
    { store: storeId, block: blockId, device: deviceHmac }
  );
}

function recordManualBlockDeviceCandidate(app, block, signals, nowValue) {
  if (!app || !block || !findCollectionSafe(app, STORE_SECURITY_BLOCK_DEVICE_CANDIDATES_COLLECTION)) return null;
  const storeId = getRelationId(block, "store");
  const deviceHmac = String(signals && signals.device || "").trim();
  const ipHmac = String(signals && signals.ip || "").trim();
  if (!isValidRecordId(storeId)
    || !getBoolean(block, "manual_ip")
    || !getBoolean(block, "review_device_candidates")
    || getString(block, "status") !== "active"
    || !isValidHmacValue(deviceHmac)
    || !isValidHmacValue(ipHmac)
    || !getStringArray(block, "ip_hmac_values").includes(ipHmac)
    || getStringArray(block, "device_hmac_values").includes(deviceHmac)) return null;

  const now = nowValue instanceof Date ? nowValue : new Date();
  let candidate = findBlockDeviceCandidate(app, storeId, block.id, deviceHmac);
  if (candidate) {
    if (getString(candidate, "status") !== "pending") return candidate;
    candidate.set("last_seen_at", now.toISOString());
    candidate.set("attempts_count", Math.max(1, getNumber(candidate, "attempts_count")) + 1);
    app.save(candidate);
    return candidate;
  }

  const collection = app.findCollectionByNameOrId(STORE_SECURITY_BLOCK_DEVICE_CANDIDATES_COLLECTION);
  candidate = new Record(collection, {});
  candidate.set("store", storeId);
  candidate.set("block", block.id);
  candidate.set("device_hmac", deviceHmac);
  candidate.set("status", "pending");
  candidate.set("first_seen_at", now.toISOString());
  candidate.set("last_seen_at", now.toISOString());
  candidate.set("attempts_count", 1);
  let created = false;
  try {
    app.save(candidate);
    created = true;
  } catch (error) {
    candidate = findBlockDeviceCandidate(app, storeId, block.id, deviceHmac);
    if (!candidate) throw error;
  }
  if (created) {
    createSecurityBlockAudit(app, storeId, "block_device_candidate_detected", "", block, "automatic device candidate detection");
  }
  return candidate;
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
    if (!canManageStore(role, authStoreId, parsed.storeId, auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
    }

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

function handleManualIpBlockCreate(e, auth, parsed) {
  const role = authRole(auth);
  const authStoreId = authStore(auth);
  if (!canManageStore(role, authStoreId, parsed.storeId, auth)) {
    return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
  }

  expireDueSecurityBlocks($app, parsed.storeId);
  const settings = getSecuritySettingsRecord($app, parsed.storeId);
  const capabilityError = validateBlockCapabilities(settings, parsed);
  if (capabilityError) return e.json(capabilityError.status, { ok: false, error: capabilityError.error });

  const secret = getValidHmacSecret();
  if (!secret) return e.json(503, { ok: false, error: "security_secret_unavailable" });
  const source = resolveManualIpSource($app, parsed, settings, secret);
  if (source.error === "visitor_not_found") return e.json(404, { ok: false, error: "not_found" });
  if (source.error === "visitor_ip_unavailable") return e.json(409, { ok: false, error: source.error });
  if (source.error === "ip_source_ids") return e.json(400, { ok: false, error: source.error });
  if (source.error) return e.json(503, { ok: false, error: source.error });

  let result = null;
  $app.runInTransaction((txApp) => {
    if (source.captures.some((capture) => hasOverlappingActiveIpBlock(txApp, parsed.storeId, parsed.scope, capture.ip_hmac))) {
      result = { status: 409, error: "overlapping_block" };
      return;
    }
    const candidateIpHmacs = source.sourceSession
      ? source.allSources.map((item) => item.capture.ip_hmac)
      : source.captures.map((capture) => capture.ip_hmac);
    const candidates = manualIpDeviceCandidates(txApp, parsed.storeId, candidateIpHmacs, source.sourceSession);
    const selectedDevices = selectedManualDeviceHmacs(candidates, parsed.deviceSessionIds);
    if (selectedDevices.error) {
      result = { status: 400, error: selectedDevices.error };
      return;
    }
    const actorId = getString(auth, "id");
    const block = createManualIpBlockRecord(txApp, parsed.storeId, actorId, parsed, source.captures, selectedDevices.values);
    createSecurityBlockAudit(txApp, parsed.storeId, "block_created", actorId, block, parsed.reason);
    result = {
      status: 200,
      block,
      selectedDeviceCount: selectedDevices.values.length,
      selectedIpCount: source.captures.length,
    };
  });

  if (!result) return e.json(500, { ok: false, error: "block_create_failed" });
  if (result.status === 400) return e.json(400, { ok: false, error: result.error });
  if (result.status === 409) return e.json(409, { ok: false, error: result.error });
  return e.json(200, {
    ok: true,
    block: serializeSecurityBlock(result.block, settings),
    selected_ip_count: result.selectedIpCount,
    selected_device_count: result.selectedDeviceCount,
  });
}

function handleManualIpDeviceLookup(e) {
  setNoStore(e, true);
  try {
    const info = e.requestInfo();
    const parsed = parseManualIpDeviceLookupPayload(info.body || {});
    if (parsed.error) return e.json(400, { ok: false, error: "invalid_payload", parameter: parsed.error });
    const role = authRole(info.auth);
    const authStoreId = authStore(info.auth);
    if (!canManageStore(role, authStoreId, parsed.storeId, info.auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
    }
    const settings = getSecuritySettingsRecord($app, parsed.storeId);
    if (!canBlockWithSettings(settings)) return e.json(403, { ok: false, error: "blocking_disabled" });
    const secret = getValidHmacSecret();
    if (!secret) return e.json(503, { ok: false, error: "security_secret_unavailable" });
    const source = resolveManualIpSource($app, parsed, settings, secret);
    if (source.error === "visitor_not_found") return e.json(404, { ok: false, error: "not_found" });
    if (source.error === "visitor_ip_unavailable") return e.json(409, { ok: false, error: source.error });
    if (source.error) return e.json(503, { ok: false, error: source.error });
    const candidates = manualIpDeviceCandidates(
      $app,
      parsed.storeId,
      source.captures.map((capture) => capture.ip_hmac),
      source.sourceSession
    );
    const display = source.sourceSession
      ? getVisitorSessionIpDisplay(source.sourceSession, settings)
      : (getString(settings, "ip_visibility") === "hidden"
        ? { ip_display: "", ip_resolution_status: "hidden" }
        : getString(settings, "ip_visibility") === "full"
          ? { ip_display: parsed.normalizedIp.canonical, ip_resolution_status: "full" }
          : { ip_display: parsed.normalizedIp.masked, ip_resolution_status: "masked" });
    return e.json(200, {
      ok: true,
      ip_display: display.ip_display,
      ip_resolution_status: display.ip_resolution_status,
      ip_candidates: source.sourceSession ? serializeManualIpCandidates(source.allSources, settings) : [],
      candidates: serializeManualIpDeviceCandidates(candidates),
    });
  } catch (_) {
    logSecurity("error", "PZ_SEC_MANUAL_IP_DEVICE_LOOKUP_FAILED");
    return e.json(500, { ok: false, error: "manual_ip_device_lookup_failed" });
  }
}

function handleVpnPolicyUpdate(e) {
  setNoStore(e, true);
  try {
    const info = e.requestInfo();
    const parsed = parseVpnPolicyPayload(info.body || {});
    if (parsed.error) return e.json(400, { ok: false, error: "invalid_payload", parameter: parsed.error });
    const role = authRole(info.auth);
    const authStoreId = authStore(info.auth);
    if (!canManageStore(role, authStoreId, parsed.storeId, info.auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
    }
    let result = null;
    $app.runInTransaction((txApp) => {
      const settings = getSecuritySettingsRecord(txApp, parsed.storeId);
      if (!settings || !canObserveWithSettings(settings)) {
        result = { status: 403, error: "security_disabled" };
        return;
      }
      if (parsed.policy === "block" && securityMode(settings) !== "protection") {
        result = { status: 409, error: "protection_required" };
        return;
      }
      const previous = getString(settings, "vpn_policy") || "off";
      if (previous !== parsed.policy) {
        settings.set("vpn_policy", parsed.policy);
        txApp.save(settings);
        createSecurityAudit(
          txApp,
          parsed.storeId,
          "vpn_policy_updated",
          getString(info.auth, "id"),
          settings.id,
          `Política VPN: ${previous} -> ${parsed.policy}`,
          {},
          {}
        );
      }
      result = { status: 200, previous };
    });
    if (!result) return e.json(500, { ok: false, error: "vpn_policy_update_failed" });
    if (result.status !== 200) return e.json(result.status, { ok: false, error: result.error });
    return e.json(200, { ok: true, vpn_policy: parsed.policy, changed: result.previous !== parsed.policy });
  } catch (_) {
    logSecurity("error", "PZ_SEC_VPN_POLICY_UPDATE_FAILED");
    return e.json(500, { ok: false, error: "vpn_policy_update_failed" });
  }
}

function handleSecurityBlockCreate(e, auth, parsed) {
  const role = authRole(auth);
  const authStoreId = authStore(auth);
  if (!canManageStore(role, authStoreId, parsed.storeId, auth)) {
    return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
  }

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

    const addressSignals = selectedAddressSignals(
      txApp,
      parsed.storeId,
      customer.id,
      parsed.addressOrderIds,
      parsed.addressOrderIds.length ? getValidHmacSecret() : ""
    );
    if (addressSignals.error) {
      result = {
        status: addressSignals.error === "address_alerts_unavailable" ? 503 : 400,
        error: addressSignals.error,
      };
      return;
    }

    const activeBefore = getActiveBlocksForCustomer(txApp, parsed.storeId, customer.id).length;
    const actorId = getString(auth, "id");
    const block = createSecurityBlockRecord(txApp, parsed.storeId, customer, actorId, parsed, signals);
    createBlockAddressSignals(txApp, parsed.storeId, block, customer.id, addressSignals.values);
    setCustomerBlockedState(txApp, parsed.storeId, customer, activeBefore);
    createSecurityBlockAudit(txApp, parsed.storeId, "block_created", actorId, block, parsed.reason);
    result = { status: 200, block };
  });

  if (!result || result.status === 404) return e.json(404, { ok: false, error: "not_found" });
  if (result.status === 400) return e.json(400, { ok: false, error: result.error, signal: result.signal });
  if (result.status === 409) return e.json(409, { ok: false, error: result.error || "conflict" });
  if (result.status === 503) return e.json(503, { ok: false, error: result.error || "address_alerts_unavailable" });
  return e.json(200, { ok: true, block: serializeSecurityBlock(result.block) });
}

function handleSecurityBlockDeviceReview(e, auth, parsed) {
  const role = authRole(auth);
  const authStoreId = authStore(auth);
  if (!canManageStore(role, authStoreId, parsed.storeId, auth)) {
    return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
  }

  expireDueSecurityBlocks($app, parsed.storeId);
  const settings = getSecuritySettingsRecord($app, parsed.storeId);
  if (!canBlockWithSettings(settings)) return e.json(403, { ok: false, error: "blocking_disabled" });

  let result = null;
  $app.runInTransaction((txApp) => {
    const block = findRecordByIdSafe(txApp, STORE_SECURITY_BLOCKS_COLLECTION, parsed.blockId);
    const candidate = findRecordByIdSafe(txApp, STORE_SECURITY_BLOCK_DEVICE_CANDIDATES_COLLECTION, parsed.candidateId);
    if (!block
      || !candidate
      || getRelationId(block, "store") !== parsed.storeId
      || getRelationId(candidate, "store") !== parsed.storeId
      || getRelationId(candidate, "block") !== block.id) {
      result = { status: 404, error: "not_found" };
      return;
    }
    if (getString(block, "status") !== "active"
      || !getBoolean(block, "manual_ip")
      || !getBoolean(block, "review_device_candidates")) {
      result = { status: 409, error: "block_not_reviewable" };
      return;
    }
    const capabilityError = validateBlockCapabilities(settings, {
      scope: getString(block, "scope"),
      duration: getString(block, "duration"),
    });
    if (capabilityError) {
      result = capabilityError;
      return;
    }
    if (getString(candidate, "status") !== "pending") {
      result = { status: 409, error: "candidate_not_pending" };
      return;
    }

    const actorId = getString(auth, "id");
    const now = new Date().toISOString();
    if (parsed.action === "confirm_device_candidate") {
      const deviceHmac = getString(candidate, "device_hmac");
      if (!isValidHmacValue(deviceHmac)) {
        result = { status: 409, error: "candidate_unavailable" };
        return;
      }
      block.set("device_hmac_values", uniqueHmacValues(getStringArray(block, "device_hmac_values").concat([deviceHmac])));
      block.set("match_device", true);
      block.set("match_mode", "any");
      txApp.save(block);
      candidate.set("status", "confirmed");
      candidate.set("confirmed_at", now);
      if (actorId) candidate.set("confirmed_by", actorId);
      txApp.save(candidate);
      createSecurityBlockAudit(txApp, parsed.storeId, "block_device_candidate_confirmed", actorId, block, parsed.reason);
      result = { status: 200, block, candidateStatus: "confirmed" };
      return;
    }

    candidate.set("status", "dismissed");
    candidate.set("dismissed_at", now);
    if (actorId) candidate.set("dismissed_by", actorId);
    txApp.save(candidate);
    createSecurityBlockAudit(txApp, parsed.storeId, "block_device_candidate_dismissed", actorId, block, parsed.reason);
    result = { status: 200, block, candidateStatus: "dismissed" };
  });

  if (!result) return e.json(500, { ok: false, error: "device_review_failed" });
  if (result.status !== 200) return e.json(result.status, { ok: false, error: result.error || "device_review_failed" });
  return e.json(200, {
    ok: true,
    block: serializeSecurityBlock(result.block, settings),
    candidate_status: result.candidateStatus,
  });
}

function handleSecurityBlockRevoke(e, auth, parsed) {
  const role = authRole(auth);
  const authStoreId = authStore(auth);
  if (!canManageStore(role, authStoreId, parsed.storeId, auth)) {
    return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
  }

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
    if (parsed.action === "create_manual_ip") return handleManualIpBlockCreate(e, info.auth, parsed);
    if (parsed.action === "confirm_device_candidate" || parsed.action === "dismiss_device_candidate") {
      return handleSecurityBlockDeviceReview(e, info.auth, parsed);
    }
    return handleSecurityBlockCreate(e, info.auth, parsed);
  } catch (_) {
    if (action === "revoke") {
      logSecurity("error", "PZ_SEC_BLOCK_REVOKE_FAILED");
      return e.json(500, { ok: false, error: "block_revoke_failed" });
    }
    if (action === "confirm_device_candidate" || action === "dismiss_device_candidate") {
      logSecurity("error", "PZ_SEC_BLOCK_DEVICE_REVIEW_FAILED");
      return e.json(500, { ok: false, error: "device_review_failed" });
    }
    logSecurity("error", "PZ_SEC_BLOCK_CREATE_FAILED");
    return e.json(500, { ok: false, error: "block_create_failed" });
  }
}

function parseBlocksPagePayload(body) {
  const allowed = ["store_id", "page", "status", "scope", "search", "focus_id"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return { error: "payload" };
  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const page = normalizePositivePage(getBodyValue(body, "page"));
  const status = String(getBodyValue(body, "status") || "").trim();
  const scope = String(getBodyValue(body, "scope") || "").trim();
  const search = limitText(getBodyValue(body, "search"), 80);
  const focusId = String(getBodyValue(body, "focus_id") || "").trim();
  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!page) return { error: "page" };
  if (!SECURITY_BLOCK_STATUSES.includes(status)) return { error: "status" };
  if (!(scope === "all" || SECURITY_BLOCK_SCOPES.includes(scope))) return { error: "scope" };
  if (focusId && !isValidRecordId(focusId)) return { error: "focus_id" };
  return { storeId, page, status, scope, search, focusId };
}

function blocksPageFilter(parsed) {
  const params = { store: parsed.storeId };
  const parts = ["store = {:store}"];
  if (parsed.status !== "all") parts.push(`status = "${parsed.status}"`);
  if (parsed.scope !== "all") parts.push(`scope = "${parsed.scope}"`);
  if (parsed.focusId) {
    parts.push("id = {:focusId}");
    params.focusId = parsed.focusId;
  }
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

function manualIpSearchHmac(storeId, search) {
  const normalized = normalizeIpAddress(search);
  if (!isPublicIpAddress(normalized)) return "";
  let secret = "";
  try { secret = getValidHmacSecret(); } catch (_) { secret = ""; }
  return secret ? String(hmacValue("ip", storeId, normalized.canonical, secret) || "") : "";
}

function blockMatchesSearch(block, customerMatches, search, ipHmac) {
  const customerId = getRelationId(block, "customer");
  if (customerId && customerMatches[customerId] === true) return true;
  if (ipHmac && getStringArray(block, "ip_hmac_values").includes(ipHmac)) return true;
  const reason = normalizeSearchTerm(getString(block, "reason_internal"));
  return Boolean(reason && reason.includes(normalizeSearchTerm(search)));
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
  const metrics = { active_blocks: 0, affected_customers: 0, manual_ip_blocks: 0, expires_today: 0, permanent_blocks: 0 };
  blocks.forEach((block) => {
    if (getString(block, "status") !== "active") return;
    metrics.active_blocks += 1;
    const customerId = getRelationId(block, "customer");
    if (customerId && !activeCustomerIds.includes(customerId)) activeCustomerIds.push(customerId);
    if (getBoolean(block, "manual_ip")) metrics.manual_ip_blocks += 1;
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
    if (!canReadStore(role, authStoreId, parsed.storeId, auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
    }

    const settings = getReadableSecuritySettings($app, parsed.storeId, role);
    if (!settings) return e.json(403, { ok: false, error: "security_disabled" });

    expireDueSecurityBlocks($app);
    if (!findCollectionSafe($app, STORE_SECURITY_BLOCKS_COLLECTION)) {
      return e.json(200, {
        ok: true,
        blocks: { page: 1, perPage: SECURITY_BLOCKS_PER_PAGE, totalItems: 0, totalPages: 1, items: [] },
        metrics: { active_blocks: 0, affected_customers: 0, manual_ip_blocks: 0, expires_today: 0, permanent_blocks: 0 },
      });
    }

    const built = blocksPageFilter(parsed);
    let blocks = listRecordsPaged($app, STORE_SECURITY_BLOCKS_COLLECTION, built.filter, "-created", built.params, 200);
    if (parsed.search) {
      const searchMatches = customerIdsMatchingBlockSearch($app, parsed.storeId, parsed.search) || {};
      const ipHmac = manualIpSearchHmac(parsed.storeId, parsed.search);
      blocks = blocks.filter((block) => blockMatchesSearch(block, searchMatches, parsed.search, ipHmac));
    }

    const totalItems = blocks.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / SECURITY_BLOCKS_PER_PAGE));
    const safePage = Math.min(parsed.page, totalPages);
    const start = (safePage - 1) * SECURITY_BLOCKS_PER_PAGE;
    const pageItems = blocks.slice(start, start + SECURITY_BLOCKS_PER_PAGE);
    const customerMap = {};
    getStoreRecordsByIds($app, STORE_CUSTOMERS_COLLECTION, parsed.storeId, pageItems.map((block) => getRelationId(block, "customer"))).forEach((customer) => {
      customerMap[customer.id] = customer;
    });
    const actorIds = [];
    pageItems.forEach((block) => {
      actorIds.push(getRelationId(block, "created_by"));
      actorIds.push(getRelationId(block, "revoked_by"));
    });
    const actorMap = buildActorMap($app, actorIds);
    const deviceReviewMap = buildBlockDeviceReviewMap($app, parsed.storeId, pageItems);
    const serializedItems = pageItems.map((block) => {
      const serialized = serializeBlockForList(
        $app,
        parsed.storeId,
        block,
        customerMap,
        actorMap,
        settings,
        deviceReviewMap
      );
      if (parsed.focusId === block.id) {
        serialized.detail = buildSecurityBlockDetail($app, parsed.storeId, block, settings);
      }
      return serialized;
    });

    return e.json(200, {
      ok: true,
      blocks: {
        page: safePage,
        perPage: SECURITY_BLOCKS_PER_PAGE,
        totalItems,
        totalPages,
        items: serializedItems,
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

    if (!canManageStore(role, authStoreId, parsed.storeId, auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
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

    if (role !== "master_admin" && role !== "store_admin" && role !== "store_staff") {
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

    let outcome = null;
    $app.runInTransaction((txApp) => {
      const recordMaps = {};
      Object.keys(grouped).forEach((source) => {
        recordMaps[source] = resolveSourceRecords(txApp, source, grouped[source]);
      });

      const settingsByStore = {};
      for (const item of items) {
        const source = String(getBodyValue(item, "source") || "");
        const id = String(getBodyValue(item, "id") || "");
        const record = recordMaps[source] && recordMaps[source][id];
        if (!record) {
          outcome = { status: 404, error: "not_found" };
          return;
        }
        const storeId = storeIdForRecord(record);
        if (!canManageStore(role, userStore, storeId, auth, txApp)) {
          const belongsToAnotherTenant = ["store_admin", "store_staff"].includes(role)
            && !!userStore
            && userStore !== storeId;
          const storeExists = !!findRecordByIdSafe(txApp, STORES_COLLECTION, storeId);
          outcome = belongsToAnotherTenant || !storeExists
            ? { status: 404, error: "not_found" }
            : { status: 403, error: "permission_denied" };
          return;
        }
        if (!settingsByStore[storeId]) {
          settingsByStore[storeId] = getReadableSecuritySettings(txApp, storeId, role);
        }
        if (!settingsByStore[storeId]) {
          outcome = { status: 403, error: "unauthorized" };
          return;
        }
      }
      if (outcome) return;

      const resolved = [];
      const countsByStore = {};
      const countFieldBySource = {
        security_event: "events_affected",
        visitor_session: "sessions_affected",
        visitor_pageview: "pageviews_affected",
      };
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
        countsByStore[storeId] = countsByStore[storeId] || {};
        const countField = countFieldBySource[source];
        countsByStore[storeId][countField] = Number(countsByStore[storeId][countField] || 0) + 1;
      });

      const actorId = String((auth && auth.id) || getString(auth, "id") || "");
      Object.keys(countsByStore).sort().forEach((storeId) => {
        createSecurityAudit(
          txApp,
          storeId,
          "ip_information_revealed",
          actorId,
          "",
          "Acceso autorizado a información protegida",
          countsByStore[storeId],
          {}
        );
      });
      outcome = { status: 200, items: resolved };
    });

    if (!outcome) throw new Error("resolve_transaction_incomplete");
    if (outcome.status !== 200) {
      return e.json(outcome.status, { ok: false, error: outcome.error });
    }
    return e.json(200, { ok: true, items: outcome.items });
  } catch (_) {
    logSecurity("error", "PZ_SEC_IP_RESOLVE_FAILED");
    return e.json(500, { ok: false, error: "resolve_failed" });
  }
}

function deleteBatch(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 200, 0, params || {}) || [];
  records.forEach((record) => app.delete(record));
  return records.length;
}

function visitorRetentionCutoffs(today) {
  return {
    pageviews: addDaysToDay(today, -(VISITOR_PAGEVIEW_RETENTION_DAYS - 1)),
    sessions: addDaysToDay(today, -(VISITOR_SESSION_RETENTION_DAYS - 1)),
  };
}

function cleanupVisitors(app) {
  const today = getHavanaDay(new Date());
  const cutoffs = visitorRetentionCutoffs(today);
  const settingsRecords = listRecordsPaged(
    app,
    SECURITY_SETTINGS_COLLECTION,
    "",
    "store",
    {},
    200
  );

  let deletedPageviews = 0;
  let deletedSessions = 0;

  settingsRecords.forEach((settings) => {
    const storeId = getRelationId(settings, "store");
    if (!storeId) return;
    if (!cutoffs.pageviews || !cutoffs.sessions) return;

    let batchCount = 0;
    do {
      batchCount = deleteBatch(
        app,
        VISITOR_PAGEVIEWS_COLLECTION,
        "store = {:store} && day < {:cutoffDay}",
        { store: storeId, cutoffDay: cutoffs.pageviews }
      );
      deletedPageviews += batchCount;
    } while (batchCount > 0);

    do {
      batchCount = deleteBatch(
        app,
        VISITOR_SESSIONS_COLLECTION,
        "store = {:store} && day < {:cutoffDay}",
        { store: storeId, cutoffDay: cutoffs.sessions }
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
  buildIpCapture,
  createSecurityAudit,
  handleTrackNavigation,
  handleResolveIps,
  handleSecurityActivityPage,
  handleSecurityVisitorsPage,
  handleSecurityVisitorDetail,
  handleCustomerDetail,
  handleMonitoringSummary,
  handleCustomerLifecycle,
  handleCustomerObservation,
  handleManualIpDeviceLookup,
  handleVpnPolicyUpdate,
  handleSecurityBlockAction,
  handleSecurityBlocksPage,
  handleVisitorRetentionCleanup,
  handleSecurityBlocksExpiry,
  expireDueSecurityBlocks,
  linkVisitorSessionToCustomerByBrowserToken,
  recordManualBlockDeviceCandidate,
  recordBlockedAddressMatchForOrder,
  _test: {
    normalizeIpAddress,
    isPublicIpAddress,
    getHavanaDay,
    blocksMetrics,
    parseManualIpBlockCreatePayload,
    parseManualIpDeviceLookupPayload,
    parseVpnPolicyPayload,
    manualIpDeviceCandidates,
    selectedManualDeviceHmacs,
    parseBlockDeviceReviewPayload,
    parseNavigationPayload,
    parseVisitorsPagePayload,
    parseVisitorDetailPayload,
    normalizeVisitorRange,
    visitorRangeCutoffDay,
    groupVisitorSessions,
    listRelatedVisitorSessionsForHistory,
    paginateArray,
    visitorRetentionCutoffs,
    cleanupVisitors,
    visitorPageviewRetentionDays: VISITOR_PAGEVIEW_RETENTION_DAYS,
    visitorSessionRetentionDays: VISITOR_SESSION_RETENTION_DAYS,
    buildVisitorCustomerOrdersDetail,
    buildVisitorVpnInfo,
    buildVisitorNetworkState,
    buildVisitorNetworkHistory,
    buildVisitorSecurityStatus,
    buildActivityNavigation,
    buildSecurityBlockDetail,
    securityEventRelatesToBlock,
    visitorCustomerOrdersPerPage: VISITOR_CUSTOMER_ORDERS_PER_PAGE,
    normalizeDeliveryAddressPart,
    deliveryAddressFingerprint,
    buildCustomerAddressCandidates,
    selectedAddressSignals,
    createBlockAddressSignals,
    getOrderAddressCandidate,
    normalizePath,
    canUseStorePermission,
    securityCapabilityAllowed,
  },
};
