/// <reference path="../pb_data/types.d.ts" />

const {
  utf8ByteLength,
  isValidHmacSecretValue,
  isValidAesKeyValue,
  getValidHmacSecret,
  getValidAesKey,
} = require(`${__hooks}/pz_security_secret_contract.js`);
const teamPermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const SECURITY_SETTINGS_COLLECTION = "store_security_settings";
const STORE_CUSTOMERS_COLLECTION = "store_customers";
const STORE_CUSTOMER_PHONES_COLLECTION = "store_customer_phones";
const STORE_CUSTOMER_DEVICES_COLLECTION = "store_customer_devices";
const STORE_CUSTOMER_LINKS_COLLECTION = "store_customer_links";
const SECURITY_EVENTS_COLLECTION = "store_security_events";
const VISITOR_SESSIONS_COLLECTION = "store_visitor_sessions";
const VISITOR_PAGEVIEWS_COLLECTION = "store_visitor_pageviews";
const STORE_SECURITY_AUDIT_COLLECTION = "store_security_audit";
const ORDERS_COLLECTION = "orders";
const ORDER_ITEMS_COLLECTION = "order_items";
const SHIPPING_ZONES_COLLECTION = "shipping_zones";
const STORES_COLLECTION = "stores";
const ORDER_INTERNAL_REGISTERING = {};

const LOG_MESSAGES = {
  PZ_SEC_AES_KEY_MISSING: "PowerZona security stored partial IP data.",
  PZ_SEC_AES_ENCRYPT_FAILED: "PowerZona security stored partial IP data.",
  PZ_SEC_HMAC_SECRET_INVALID: "PowerZona security skipped identity write.",
  PZ_SEC_PUBLIC_REGISTER_FAILED: "PowerZona security public registration skipped safely.",
  PZ_SEC_ORDER_PHONE_RELINK_SKIPPED: "PowerZona security skipped order phone relink.",
  PZ_SEC_ORDER_UPDATE_REBUILD_FAILED: "PowerZona security order update rebuild skipped safely.",
  PZ_SEC_ORDER_DELETE_REBUILD_FAILED: "PowerZona security order delete rebuild skipped safely.",
  PZ_SEC_CUSTOMER_IDENTITY_FAILED: "PowerZona security canonical customer operation skipped safely.",
  PZ_SEC_CUSTOMER_AUTO_RESTORE_FAILED: "PowerZona security archived customer restore skipped safely.",
};

function logSecurity(level, code) {
  try {
    const logger = $app.logger();
    const message = LOG_MESSAGES[code] || "PowerZona security operation skipped safely.";
    if (level === "error") {
      logger.error(message, "code", code);
    } else {
      logger.warn(message, "code", code);
    }
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
  setNoStore(e);
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

function isStrictRegisterPayload(body) {
  const allowed = ["order_id", "receipt_token", "browser_token_digest"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length) return false;
  if (keys.some((key) => !allowed.includes(key))) return false;

  const orderId = String(getBodyValue(body, "order_id") || "");
  const receiptToken = String(getBodyValue(body, "receipt_token") || "");
  const browserTokenDigest = String(getBodyValue(body, "browser_token_digest") || "");

  return isValidRecordId(orderId)
    && /^[A-Za-z0-9]{16,120}$/.test(receiptToken)
    && /^[a-f0-9]{64}$/.test(browserTokenDigest);
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("011")) digits = digits.slice(3);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d{8,15}$/.test(digits)) return "";
  return digits;
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

function getNumberRaw(record, key) {
  try {
    const value = record.get(key);
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  } catch (_) {
    try {
      const number = Number(record.getFloat(key));
      return Number.isFinite(number) ? number : NaN;
    } catch (_) {
      return NaN;
    }
  }
}

function getRecordDateString(record, key) {
  const value = getString(record, key);
  return value || "";
}

function limitText(value, max) {
  return String(value || "").trim().slice(0, max);
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

function findRecordByIdSafe(app, collection, id) {
  if (!id) return null;
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
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

function isOrderSecurityIdentityErased(order) {
  return Boolean(getString(order, "security_identity_erased_at"));
}

function authRole(auth) {
  return getString(auth, "role");
}

function authStore(auth) {
  return getRelationId(auth, "store");
}

function hasCanonicalIdentitySchema(app) {
  return Boolean(
    findCollectionSafe(app, STORE_CUSTOMER_PHONES_COLLECTION)
    && findCollectionSafe(app, STORE_CUSTOMER_DEVICES_COLLECTION)
    && findCollectionSafe(app, STORE_CUSTOMER_LINKS_COLLECTION)
    && collectionHasField(app, STORE_CUSTOMERS_COLLECTION, "merged_into")
  );
}

function listRecordsPaged(app, collection, filter, sort, params, batchSize) {
  const records = [];
  const limit = batchSize || 200;
  let offset = 0;
  while (true) {
    const chunk = app.findRecordsByFilter(collection, filter || "", sort || "", limit, offset, params || {}) || [];
    if (!chunk.length) return records;
    records.push(...chunk);
    if (chunk.length < limit) return records;
    offset += limit;
  }
}

function statusRank(status) {
  if (status === "blocked") return 3;
  if (status === "watch") return 2;
  return 1;
}

function mostRestrictiveStatus(a, b) {
  return statusRank(a) >= statusRank(b) ? (a || "normal") : (b || "normal");
}

function isBeforeOrTieById(a, b) {
  const aCreated = getString(a, "created");
  const bCreated = getString(b, "created");
  if (aCreated && bCreated && aCreated !== bCreated) return aCreated < bCreated;
  if (aCreated && !bCreated) return true;
  if (!aCreated && bCreated) return false;
  return String(a.id || "") <= String(b.id || "");
}

function sanitizeMergeReason(value) {
  return limitText(String(value || "")
    .replace(/[a-f0-9]{32,}/gi, "[redactado]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\b\d{4,}\b/g, "[numero]")
    .replace(/\b(token|secret|hmac)\b/gi, "[redactado]")
    .trim(), 500);
}

function canUseStorePermission(role, authStoreId, storeId, auth, permission) {
  const store = findRecordByIdSafe($app, STORES_COLLECTION, storeId);
  if (!store) return false;
  if (role === "master_admin") return true;
  if (!["store_admin", "store_staff"].includes(role) || !authStoreId || authStoreId !== storeId) return false;
  return teamPermissions.hasStorePermission($app, auth, store, permission);
}

function canReadStore(role, authStoreId, storeId, auth) {
  return canUseStorePermission(role, authStoreId, storeId, auth, "security.view");
}

function canManageStore(role, authStoreId, storeId, auth) {
  return canUseStorePermission(role, authStoreId, storeId, auth, "security.manage");
}

function respondStorePermissionDenied(e, role, authStoreId, storeId) {
  const isStoreUser = role === "store_admin" || role === "store_staff";
  const belongsToAnotherTenant = isStoreUser && !!authStoreId && authStoreId !== storeId;
  if (belongsToAnotherTenant || !findRecordByIdSafe($app, STORES_COLLECTION, storeId)) {
    return e.json(404, { ok: false, error: "not_found" });
  }
  return e.json(403, { ok: false, error: "permission_denied" });
}

function createSecurityAudit(app, storeId, action, actorId, subjectRecordId, reason, counts) {
  const collection = app.findCollectionByNameOrId(STORE_SECURITY_AUDIT_COLLECTION);
  const audit = new Record(collection, {});
  const safeCounts = counts || {};

  audit.set("store", storeId);
  audit.set("action", action);
  if (actorId) audit.set("actor", actorId);
  audit.set("subject_record_id", String(subjectRecordId || "").slice(0, 40));
  audit.set("reason_internal", sanitizeMergeReason(reason));
  audit.set("orders_affected", Math.max(0, Number(safeCounts.orders_affected || 0)));
  audit.set("events_affected", Math.max(0, Number(safeCounts.events_affected || 0)));
  audit.set("phones_affected", Math.max(0, Number(safeCounts.phones_affected || 0)));
  audit.set("devices_affected", Math.max(0, Number(safeCounts.devices_affected || 0)));
  audit.set("sessions_affected", Math.max(0, Number(safeCounts.sessions_affected || 0)));
  audit.set("pageviews_affected", Math.max(0, Number(safeCounts.pageviews_affected || 0)));
  app.save(audit);
}

function autoRestoreArchivedCustomer(app, storeId, customer) {
  if (!customer || !getBoolean(customer, "archived")) return;
  try {
    customer.set("archived", false);
    customer.set("archived_at", "");
    customer.set("archived_by", "");
    customer.set("archive_reason", "");
    app.save(customer);
    createSecurityAudit(app, storeId, "auto_restore_customer", "", customer.id, "new order identity signal", {});
  } catch (_) {
    logSecurity("error", "PZ_SEC_CUSTOMER_AUTO_RESTORE_FAILED");
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

function findCustomerPhone(app, storeId, phoneNormalized) {
  if (!storeId || !phoneNormalized) return null;
  return findFirstByFilter(
    app,
    STORE_CUSTOMER_PHONES_COLLECTION,
    "store = {:store} && phone_normalized = {:phone}",
    { store: storeId, phone: phoneNormalized }
  );
}

function findCustomerDevice(app, storeId, browserTokenHmac) {
  if (!storeId || !browserTokenHmac) return null;
  return findFirstByFilter(
    app,
    STORE_CUSTOMER_DEVICES_COLLECTION,
    "store = {:store} && browser_token_hmac = {:browserTokenHmac}",
    { store: storeId, browserTokenHmac }
  );
}

function findCustomerByCompatPhone(app, storeId, phoneNormalized) {
  if (!storeId || !phoneNormalized) return null;
  return findFirstByFilter(
    app,
    STORE_CUSTOMERS_COLLECTION,
    "store = {:store} && phone_normalized = {:phone}",
    { store: storeId, phone: phoneNormalized }
  );
}

function createCanonicalCustomer(app, storeId, phoneNormalized, phoneHmac, displayName) {
  const existing = findCustomerByCompatPhone(app, storeId, phoneNormalized);
  if (existing) {
    const canonical = resolveCanonicalCustomer(app, storeId, existing);
    if (canonical) return canonical;
  }

  const customersCollection = app.findCollectionByNameOrId(STORE_CUSTOMERS_COLLECTION);
  const customer = new Record(customersCollection, {});
  customer.set("store", storeId);
  customer.set("phone_normalized", phoneNormalized);
  customer.set("status", "normal");
  customer.set("phones_count", 0);
  customer.set("devices_count", 0);
  if (displayName) customer.set("display_name", limitText(displayName, 120));
  if (phoneHmac) customer.set("phone_hmac", phoneHmac);

  try {
    app.save(customer);
    return customer;
  } catch (error) {
    const raced = findCustomerByCompatPhone(app, storeId, phoneNormalized);
    const canonical = resolveCanonicalCustomer(app, storeId, raced);
    if (canonical) return canonical;
    throw error;
  }
}

function setCompatPhoneIfAvailable(app, customer, storeId, phoneNormalized, phoneHmac) {
  if (!customer || !phoneNormalized) return;
  const existing = findCustomerByCompatPhone(app, storeId, phoneNormalized);
  if (existing && existing.id !== customer.id) return;
  customer.set("phone_normalized", phoneNormalized);
  if (phoneHmac) customer.set("phone_hmac", phoneHmac);
}

function unsetPrimaryPhones(app, storeId, customerId, exceptPhoneId) {
  const phones = listRecordsPaged(
    app,
    STORE_CUSTOMER_PHONES_COLLECTION,
    "store = {:store} && customer = {:customer} && is_primary = true",
    "",
    { store: storeId, customer: customerId },
    100
  );
  phones.forEach((phone) => {
    if (phone.id === exceptPhoneId) return;
    phone.set("is_primary", false);
    app.save(phone);
  });
}

function ensureCustomerPhone(app, storeId, customerId, phoneNormalized, phoneHmac, seenAt, makePrimary, report) {
  if (!storeId || !customerId || !phoneNormalized) return null;
  const phonesCollection = app.findCollectionByNameOrId(STORE_CUSTOMER_PHONES_COLLECTION);
  let canonical = resolveCanonicalCustomer(app, storeId, customerId);
  if (!canonical) return null;

  let phone = findCustomerPhone(app, storeId, phoneNormalized);
  let created = false;
  if (!phone) {
    phone = new Record(phonesCollection, {});
    phone.set("store", storeId);
    phone.set("customer", canonical.id);
    phone.set("phone_normalized", phoneNormalized);
    phone.set("orders_count", 0);
    created = true;
  } else {
    const phoneCustomer = resolveCanonicalCustomer(app, storeId, getRelationId(phone, "customer"));
    if (phoneCustomer && phoneCustomer.id !== canonical.id) {
      const merged = mergeCustomersIntoCanonical(app, storeId, phoneCustomer.id, canonical.id, "auto_phone", "phone match", "");
      if (report) addMergeReport(report, merged);
      canonical = resolveCanonicalCustomer(app, storeId, merged.canonical_id) || canonical;
    }
    phone.set("customer", canonical.id);
  }

  if (phoneHmac) phone.set("phone_hmac", phoneHmac);
  if (seenAt && !getString(phone, "first_seen_at")) phone.set("first_seen_at", seenAt);
  if (seenAt) phone.set("last_seen_at", seenAt);
  phone.set("orders_count", countOrdersByPhone(app, storeId, canonical.id, phoneNormalized));
  if (makePrimary) phone.set("is_primary", true);

  try {
    app.save(phone);
    if (created && report) report.phones_created += 1;
  } catch (error) {
    const raced = findCustomerPhone(app, storeId, phoneNormalized);
    if (!raced) throw error;
    phone = raced;
    phone.set("customer", canonical.id);
    if (phoneHmac) phone.set("phone_hmac", phoneHmac);
    if (seenAt && !getString(phone, "first_seen_at")) phone.set("first_seen_at", seenAt);
    if (seenAt) phone.set("last_seen_at", seenAt);
    phone.set("orders_count", countOrdersByPhone(app, storeId, canonical.id, phoneNormalized));
    if (makePrimary) phone.set("is_primary", true);
    app.save(phone);
  }

  if (makePrimary) unsetPrimaryPhones(app, storeId, canonical.id, phone.id);
  return phone;
}

function countOrdersByPhone(app, storeId, customerId, phoneNormalized) {
  try {
    const orders = app.findRecordsByFilter(
      ORDERS_COLLECTION,
      "store = {:store} && customer = {:customer}",
      "",
      0,
      0,
      { store: storeId, customer: customerId }
    ) || [];
    return orders.filter((order) => normalizePhone(getString(order, "customer_phone")) === phoneNormalized).length;
  } catch (_) {
    return 0;
  }
}

function countOrdersByBrowserToken(app, storeId, customerId, browserTokenHmac) {
  if (!browserTokenHmac) return 0;
  try {
    const events = app.findRecordsByFilter(
      SECURITY_EVENTS_COLLECTION,
      "store = {:store} && customer = {:customer} && browser_token_hmac = {:browserTokenHmac} && order != \"\"",
      "",
      0,
      0,
      { store: storeId, customer: customerId, browserTokenHmac }
    ) || [];
    const orderIds = {};
    events.forEach((event) => {
      const orderId = getRelationId(event, "order");
      if (orderId) orderIds[orderId] = true;
    });
    return Object.keys(orderIds).length;
  } catch (_) {
    return 0;
  }
}

function ensureCustomerDevice(app, storeId, customerId, browserTokenHmac, seenAt, ipCapture, report) {
  if (!storeId || !customerId || !browserTokenHmac) return null;
  const devicesCollection = app.findCollectionByNameOrId(STORE_CUSTOMER_DEVICES_COLLECTION);
  let canonical = resolveCanonicalCustomer(app, storeId, customerId);
  if (!canonical) return null;

  let device = findCustomerDevice(app, storeId, browserTokenHmac);
  let created = false;
  if (!device) {
    device = new Record(devicesCollection, {});
    device.set("store", storeId);
    device.set("customer", canonical.id);
    device.set("browser_token_hmac", browserTokenHmac);
    device.set("orders_count", 0);
    created = true;
  } else {
    const deviceCustomer = resolveCanonicalCustomer(app, storeId, getRelationId(device, "customer"));
    if (deviceCustomer && deviceCustomer.id !== canonical.id) {
      const merged = mergeCustomersIntoCanonical(app, storeId, deviceCustomer.id, canonical.id, "auto_device", "device match", "");
      if (report) addMergeReport(report, merged);
      canonical = resolveCanonicalCustomer(app, storeId, merged.canonical_id) || canonical;
    }
    device.set("customer", canonical.id);
  }

  if (seenAt && !getString(device, "first_seen_at")) device.set("first_seen_at", seenAt);
  if (seenAt) device.set("last_seen_at", seenAt);
  device.set("orders_count", countOrdersByBrowserToken(app, storeId, canonical.id, browserTokenHmac));
  if (ipCapture) {
    device.set("latest_ip_hmac", ipCapture.ip_hmac || "");
    device.set("latest_ip_masked", ipCapture.ip_masked || "");
    device.set("latest_ip_encrypted", ipCapture.ip_encrypted || "");
    device.set("latest_ip_family", ipCapture.ip_family || "unknown");
    device.set("latest_capture_status", ipCapture.capture_status || "unavailable");
    device.set("crypto_version", "v1");
  }

  try {
    app.save(device);
    if (created && report) report.devices_created += 1;
  } catch (error) {
    const raced = findCustomerDevice(app, storeId, browserTokenHmac);
    if (!raced) throw error;
    device = raced;
    device.set("customer", canonical.id);
    if (seenAt && !getString(device, "first_seen_at")) device.set("first_seen_at", seenAt);
    if (seenAt) device.set("last_seen_at", seenAt);
    if (ipCapture) {
      device.set("latest_ip_hmac", ipCapture.ip_hmac || "");
      device.set("latest_ip_masked", ipCapture.ip_masked || "");
      device.set("latest_ip_encrypted", ipCapture.ip_encrypted || "");
      device.set("latest_ip_family", ipCapture.ip_family || "unknown");
      device.set("latest_capture_status", ipCapture.capture_status || "unavailable");
      device.set("crypto_version", "v1");
    }
    device.set("orders_count", countOrdersByBrowserToken(app, storeId, canonical.id, browserTokenHmac));
    app.save(device);
  }

  return device;
}

function chooseDeterministicCanonical(a, b) {
  if (!a) return b;
  if (!b) return a;
  return isBeforeOrTieById(a, b) ? a : b;
}

function addMergeReport(report, result) {
  if (!report || !result) return;
  report.aliases_created += result.aliases_created || 0;
  report.orders_moved += result.orders_moved || 0;
  report.events_moved += result.events_moved || 0;
  report.sessions_moved += result.sessions_moved || 0;
  report.pageviews_moved += result.pageviews_moved || 0;
}

function emptyMergeResult(canonicalId) {
  return {
    canonical_id: canonicalId || "",
    aliases_created: 0,
    orders_moved: 0,
    events_moved: 0,
    sessions_moved: 0,
    pageviews_moved: 0,
  };
}

function moveCustomerReferences(app, collectionName, storeId, sourceCustomerId, canonicalCustomerId) {
  if (!findCollectionSafe(app, collectionName)) return 0;
  let moved = 0;
  const records = listRecordsPaged(
    app,
    collectionName,
    "store = {:store} && customer = {:source}",
    "",
    { store: storeId, source: sourceCustomerId },
    200
  );

  records.forEach((record) => {
    if (getRelationId(record, "store") !== storeId) return;
    if (getRelationId(record, "customer") !== sourceCustomerId) return;
    record.set("customer", canonicalCustomerId);
    if (collectionName === ORDERS_COLLECTION) ORDER_INTERNAL_REGISTERING[record.id] = true;
    try {
      app.save(record);
      moved += 1;
    } finally {
      if (collectionName === ORDERS_COLLECTION) delete ORDER_INTERNAL_REGISTERING[record.id];
    }
  });

  return moved;
}

function moveIdentityCatalog(app, collectionName, storeId, sourceCustomerId, canonicalCustomerId) {
  if (!findCollectionSafe(app, collectionName)) return;
  const records = listRecordsPaged(
    app,
    collectionName,
    "store = {:store} && customer = {:source}",
    "",
    { store: storeId, source: sourceCustomerId },
    200
  );

  records.forEach((record) => {
    if (getRelationId(record, "store") !== storeId) return;
    record.set("customer", canonicalCustomerId);
    app.save(record);
  });
}

function upsertCustomerLink(app, storeId, canonicalCustomerId, linkedCustomerId, linkType, reason, createdBy) {
  const linksCollection = app.findCollectionByNameOrId(STORE_CUSTOMER_LINKS_COLLECTION);
  let link = findFirstByFilter(
    app,
    STORE_CUSTOMER_LINKS_COLLECTION,
    "store = {:store} && linked_customer = {:linked}",
    { store: storeId, linked: linkedCustomerId }
  );
  const created = !link;
  if (!link) link = new Record(linksCollection, {});

  link.set("store", storeId);
  link.set("canonical_customer", canonicalCustomerId);
  link.set("linked_customer", linkedCustomerId);
  link.set("link_type", linkType);
  link.set("status", "active");
  link.set("reason_internal", sanitizeMergeReason(reason || linkType));
  if (createdBy) link.set("created_by", createdBy);
  app.save(link);
  return created;
}

function combineInternalNotes(canonical, source) {
  const canonicalNotes = getString(canonical, "internal_notes");
  const sourceNotes = getString(source, "internal_notes");
  if (!sourceNotes || canonicalNotes.includes(sourceNotes)) return canonicalNotes;
  if (!canonicalNotes) return sourceNotes;
  return limitText(`${canonicalNotes}\n\nNotas de cliente consolidado:\n${sourceNotes}`, 4000);
}

function zeroAliasStats(alias) {
  [
    "orders_count",
    "pending_orders_count",
    "confirmed_orders_count",
    "preparing_orders_count",
    "delivered_orders_count",
    "cancelled_orders_count",
    "confirmed_total_usd",
    "phones_count",
    "devices_count",
  ].forEach((field) => alias.set(field, 0));
  alias.set("first_order_at", "");
  alias.set("last_order_at", "");
  alias.set("last_order", "");
  alias.set("last_address", "");
  alias.set("last_municipality", "");
}

function mergeCustomersIntoCanonical(app, storeId, customerAId, customerBId, linkType, reason, createdBy, forcedCanonicalId) {
  const customerA = resolveCanonicalCustomer(app, storeId, customerAId);
  const customerB = resolveCanonicalCustomer(app, storeId, customerBId);
  if (!customerA && !customerB) return emptyMergeResult("");
  if (customerA && !customerB) return emptyMergeResult(customerA.id);
  if (!customerA && customerB) return emptyMergeResult(customerB.id);
  if (customerA.id === customerB.id) return emptyMergeResult(customerA.id);

  let canonical = forcedCanonicalId ? resolveCanonicalCustomer(app, storeId, forcedCanonicalId) : null;
  if (!canonical || (canonical.id !== customerA.id && canonical.id !== customerB.id)) {
    canonical = chooseDeterministicCanonical(customerA, customerB);
  }
  const source = canonical.id === customerA.id ? customerB : customerA;
  const result = emptyMergeResult(canonical.id);

  result.orders_moved = moveCustomerReferences(app, ORDERS_COLLECTION, storeId, source.id, canonical.id);
  result.events_moved = moveCustomerReferences(app, SECURITY_EVENTS_COLLECTION, storeId, source.id, canonical.id);
  result.sessions_moved = moveCustomerReferences(app, VISITOR_SESSIONS_COLLECTION, storeId, source.id, canonical.id);
  result.pageviews_moved = moveCustomerReferences(app, VISITOR_PAGEVIEWS_COLLECTION, storeId, source.id, canonical.id);
  moveIdentityCatalog(app, STORE_CUSTOMER_PHONES_COLLECTION, storeId, source.id, canonical.id);
  moveIdentityCatalog(app, STORE_CUSTOMER_DEVICES_COLLECTION, storeId, source.id, canonical.id);

  canonical.set("status", mostRestrictiveStatus(getString(canonical, "status"), getString(source, "status")));
  canonical.set("internal_notes", combineInternalNotes(canonical, source));
  app.save(canonical);

  source.set("merged_into", canonical.id);
  source.set("merged_at", new Date().toISOString());
  source.set("merge_reason", linkType);
  zeroAliasStats(source);
  app.save(source);

  if (upsertCustomerLink(app, storeId, canonical.id, source.id, linkType, reason, createdBy)) {
    result.aliases_created = 1;
  }

  rebuildCustomerStats(app, canonical.id);
  zeroAliasStats(source);
  app.save(source);
  return result;
}

function resolveOrderCanonicalCustomer(app, options) {
  const storeId = options.storeId;
  const phoneNormalized = options.phoneNormalized;
  const phoneHmac = options.phoneHmac;
  const browserTokenHmac = options.browserTokenHmac;
  const displayName = options.displayName;
  const order = options.order || null;
  const seenAt = options.seenAt || new Date().toISOString();
  const ipCapture = options.ipCapture || null;
  const report = options.report || null;
  const mergeType = options.mergeType || "auto_device";
  const currentCustomerId = options.currentCustomerId || (order ? getRelationId(order, "customer") : "");

  if (!hasCanonicalIdentitySchema(app)) {
    return upsertCustomer(app, storeId, phoneNormalized, phoneHmac, displayName);
  }

  const phoneRecord = findCustomerPhone(app, storeId, phoneNormalized);
  const deviceRecord = findCustomerDevice(app, storeId, browserTokenHmac);
  const phoneCustomer = phoneRecord ? resolveCanonicalCustomer(app, storeId, getRelationId(phoneRecord, "customer")) : null;
  const deviceCustomer = deviceRecord ? resolveCanonicalCustomer(app, storeId, getRelationId(deviceRecord, "customer")) : null;
  const currentCustomer = currentCustomerId ? resolveCanonicalCustomer(app, storeId, currentCustomerId) : null;
  let canonical = deviceCustomer || phoneCustomer || currentCustomer;

  if (phoneCustomer && deviceCustomer && phoneCustomer.id !== deviceCustomer.id) {
    const merged = mergeCustomersIntoCanonical(app, storeId, phoneCustomer.id, deviceCustomer.id, mergeType, "strong identity match", "");
    if (report) addMergeReport(report, merged);
    canonical = resolveCanonicalCustomer(app, storeId, merged.canonical_id);
  }

  if (canonical && currentCustomer && canonical.id !== currentCustomer.id) {
    const merged = mergeCustomersIntoCanonical(app, storeId, canonical.id, currentCustomer.id, mergeType, "existing order customer match", "");
    if (report) addMergeReport(report, merged);
    canonical = resolveCanonicalCustomer(app, storeId, merged.canonical_id);
  }

  if (!canonical) {
    canonical = createCanonicalCustomer(app, storeId, phoneNormalized, phoneHmac, displayName);
  }

  if (!canonical || getRelationId(canonical, "store") !== storeId) return null;
  autoRestoreArchivedCustomer(app, storeId, canonical);
  if (displayName) canonical.set("display_name", limitText(displayName, 120));
  setCompatPhoneIfAvailable(app, canonical, storeId, phoneNormalized, phoneHmac);
  app.save(canonical);

  const phone = ensureCustomerPhone(app, storeId, canonical.id, phoneNormalized, phoneHmac, seenAt, true, report);
  if (phone) canonical = resolveCanonicalCustomer(app, storeId, getRelationId(phone, "customer")) || canonical;

  const device = ensureCustomerDevice(app, storeId, canonical.id, browserTokenHmac, seenAt, ipCapture, report);
  if (device) canonical = resolveCanonicalCustomer(app, storeId, getRelationId(device, "customer")) || canonical;

  rebuildCustomerStats(app, canonical.id);
  return canonical;
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

function hasReadableSecuritySettings(app, storeId, role) {
  if (role === "master_admin") return Boolean(getSecuritySettingsRecord(app, storeId));
  return Boolean(getActiveSecuritySettings(app, storeId));
}

function hasOrderItems(app, orderId) {
  try {
    const items = app.findRecordsByFilter(
      ORDER_ITEMS_COLLECTION,
      "order = {:order}",
      "",
      1,
      0,
      { order: orderId }
    );
    return Array.isArray(items) && items.length > 0;
  } catch (_) {
    return false;
  }
}

function resolveOrderMunicipality(app, order) {
  const storeId = getRelationId(order, "store");
  const zoneId = getRelationId(order, "shipping_zone");
  if (!storeId || !isValidRecordId(zoneId)) return "";

  const zone = findRecordByIdSafe(app, SHIPPING_ZONES_COLLECTION, zoneId);
  if (!zone) return "";

  if (collectionHasField(app, SHIPPING_ZONES_COLLECTION, "store")) {
    const zoneStoreId = getRelationId(zone, "store");
    if (!zoneStoreId || zoneStoreId !== storeId) return "";
  }

  return limitText(getString(zone, "municipality"), 120);
}

function getOrderCreatedAt(order) {
  return getRecordDateString(order, "created")
    || getRecordDateString(order, "updated")
    || new Date().toISOString();
}

function getOrderTotalUsd(order) {
  const usdTotal = getNumberRaw(order, "usd_total");
  if (Number.isFinite(usdTotal)) return Math.max(0, usdTotal);

  const fallbackTotal = getNumberRaw(order, "total");
  if (Number.isFinite(fallbackTotal)) return Math.max(0, fallbackTotal);

  return 0;
}

function upsertCustomer(app, storeId, phoneNormalized, phoneHmac, displayName) {
  const customersCollection = app.findCollectionByNameOrId(STORE_CUSTOMERS_COLLECTION);
  let customer = findFirstByFilter(
    app,
    STORE_CUSTOMERS_COLLECTION,
    "store = {:store} && phone_normalized = {:phone}",
    { store: storeId, phone: phoneNormalized }
  );

  if (customer) {
    if (displayName) customer.set("display_name", limitText(displayName, 120));
    if (phoneHmac) customer.set("phone_hmac", phoneHmac);
    app.save(customer);
    return customer;
  }

  customer = new Record(customersCollection, {});
  customer.set("store", storeId);
  customer.set("phone_normalized", phoneNormalized);
  customer.set("status", "normal");
  if (displayName) customer.set("display_name", limitText(displayName, 120));
  if (phoneHmac) customer.set("phone_hmac", phoneHmac);

  try {
    app.save(customer);
    return customer;
  } catch (error) {
    const racedCustomer = findFirstByFilter(
      app,
      STORE_CUSTOMERS_COLLECTION,
      "store = {:store} && phone_normalized = {:phone}",
      { store: storeId, phone: phoneNormalized }
    );
    if (!racedCustomer || getRelationId(racedCustomer, "store") !== storeId) throw error;

    if (displayName) racedCustomer.set("display_name", limitText(displayName, 120));
    if (phoneHmac) racedCustomer.set("phone_hmac", phoneHmac);
    app.save(racedCustomer);
    return racedCustomer;
  }
}

function rebuildCustomerStats(app, customerId) {
  if (!customerId) return;

  const customer = findRecordByIdSafe(app, STORE_CUSTOMERS_COLLECTION, customerId);
  if (!customer) return;

  const storeId = getRelationId(customer, "store");
  if (!storeId) return;

  if (getRelationId(customer, "merged_into")) {
    zeroAliasStats(customer);
    app.save(customer);
    return;
  }

  const orders = app.findRecordsByFilter(
    ORDERS_COLLECTION,
    "store = {:store} && customer = {:customer}",
    "created",
    0,
    0,
    { store: storeId, customer: customerId }
  ) || [];

  const stats = {
    orders_count: 0,
    pending_orders_count: 0,
    confirmed_orders_count: 0,
    preparing_orders_count: 0,
    delivered_orders_count: 0,
    cancelled_orders_count: 0,
    confirmed_total_usd: 0,
  };
  let firstAt = "";
  let lastAt = "";
  let lastOrder = null;
  let latestNameAt = "";
  let latestName = "";
  let latestAddressAt = "";
  let latestAddress = "";
  let latestMunicipalityAt = "";
  let latestMunicipality = "";

  for (const order of orders) {
    if (!order) continue;
    if (getRelationId(order, "store") !== storeId) continue;

    const status = getString(order, "status");
    const createdAt = getOrderCreatedAt(order);
    const name = limitText(getString(order, "customer_name"), 120);
    const address = limitText(getString(order, "customer_address"), 240);
    const municipality = resolveOrderMunicipality(app, order);

    stats.orders_count += 1;
    if (status === "pending") stats.pending_orders_count += 1;
    if (status === "confirmed") stats.confirmed_orders_count += 1;
    if (status === "preparing") stats.preparing_orders_count += 1;
    if (status === "delivered") stats.delivered_orders_count += 1;
    if (status === "cancelled") stats.cancelled_orders_count += 1;
    if (status === "confirmed" || status === "preparing" || status === "delivered") {
      stats.confirmed_total_usd += getOrderTotalUsd(order);
    }

    if (!firstAt || createdAt < firstAt) firstAt = createdAt;
    if (!lastAt || createdAt >= lastAt) {
      lastAt = createdAt;
      lastOrder = order;
    }
    if (name && (!latestNameAt || createdAt >= latestNameAt)) {
      latestNameAt = createdAt;
      latestName = name;
    }
    if (address && (!latestAddressAt || createdAt >= latestAddressAt)) {
      latestAddressAt = createdAt;
      latestAddress = address;
    }
    if (municipality && (!latestMunicipalityAt || createdAt >= latestMunicipalityAt)) {
      latestMunicipalityAt = createdAt;
      latestMunicipality = municipality;
    }
  }

  Object.keys(stats).forEach((key) => customer.set(key, stats[key]));
  customer.set("first_order_at", firstAt || "");
  customer.set("last_order_at", lastAt || "");
  customer.set("last_order", lastOrder ? lastOrder.id : "");

  if (latestName) customer.set("display_name", latestName);
  customer.set("last_address", latestAddress);
  customer.set("last_municipality", latestMunicipality);

  if (hasCanonicalIdentitySchema(app)) {
    const phones = listRecordsPaged(
      app,
      STORE_CUSTOMER_PHONES_COLLECTION,
      "store = {:store} && customer = {:customer}",
      "-last_seen_at,-updated,-created",
      { store: storeId, customer: customerId },
      200
    );
    const devices = listRecordsPaged(
      app,
      STORE_CUSTOMER_DEVICES_COLLECTION,
      "store = {:store} && customer = {:customer}",
      "-last_seen_at,-updated,-created",
      { store: storeId, customer: customerId },
      200
    );
    let primaryPhone = phones.find((phone) => getBoolean(phone, "is_primary")) || null;
    if (!primaryPhone && phones.length) primaryPhone = phones[0];
    if (primaryPhone) {
      const primaryPhoneValue = getString(primaryPhone, "phone_normalized");
      setCompatPhoneIfAvailable(app, customer, storeId, primaryPhoneValue, getString(primaryPhone, "phone_hmac"));
      unsetPrimaryPhones(app, storeId, customerId, primaryPhone.id);
      primaryPhone.set("is_primary", true);
      primaryPhone.set("orders_count", countOrdersByPhone(app, storeId, customerId, primaryPhoneValue));
      app.save(primaryPhone);
    }
    phones.forEach((phone) => {
      const phoneValue = getString(phone, "phone_normalized");
      phone.set("orders_count", countOrdersByPhone(app, storeId, customerId, phoneValue));
      app.save(phone);
    });
    devices.forEach((device) => {
      const browserTokenHmac = getString(device, "browser_token_hmac");
      device.set("orders_count", countOrdersByBrowserToken(app, storeId, customerId, browserTokenHmac));
      app.save(device);
    });
    customer.set("phones_count", phones.length);
    customer.set("devices_count", devices.length);
  }

  app.save(customer);
}

function invalidIp() {
  return {
    valid: false,
    canonical: "",
    family: "unknown",
    masked: "",
  };
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

  return {
    valid: true,
    canonical: octets.join("."),
    family: "ipv4",
    masked: `${octets[0]}.${octets[1]}.***.${octets[3]}`,
  };
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
    } catch (_) {
      logSecurity("warn", "PZ_SEC_AES_ENCRYPT_FAILED");
    }
  }

  return capture;
}

function createOrderCreatedEventIfMissing(app, storeId, customerId, order, settings, phoneHmac, browserTokenHmac, ipCapture) {
  const eventKey = `order_created:${order.id}`;
  const existing = findFirstByFilter(app, SECURITY_EVENTS_COLLECTION, "event_key = {:eventKey}", { eventKey });
  if (existing) {
    let changed = false;
    if (getRelationId(existing, "store") !== storeId) return existing;
    if (getRelationId(existing, "customer") !== customerId) {
      existing.set("customer", customerId);
      changed = true;
    }
    if (phoneHmac && getString(existing, "phone_hmac") !== phoneHmac) {
      existing.set("phone_hmac", phoneHmac);
      changed = true;
    }
    if (browserTokenHmac && getString(existing, "browser_token_hmac") !== browserTokenHmac) {
      existing.set("browser_token_hmac", browserTokenHmac);
      changed = true;
    }
    if (ipCapture && ipCapture.ip_hmac && getString(existing, "ip_hmac") !== ipCapture.ip_hmac) {
      existing.set("ip_hmac", ipCapture.ip_hmac);
      existing.set("ip_masked", ipCapture.ip_masked);
      existing.set("ip_encrypted", ipCapture.ip_encrypted);
      existing.set("ip_family", ipCapture.ip_family);
      existing.set("capture_status", ipCapture.capture_status);
      existing.set("crypto_version", "v1");
      changed = true;
    }
    if (changed) app.save(existing);
    return existing;
  }

  const eventsCollection = app.findCollectionByNameOrId(SECURITY_EVENTS_COLLECTION);
  const event = new Record(eventsCollection, {});
  const mode = getString(settings, "mode") || "monitoring";
  event.set("store", storeId);
  event.set("customer", customerId);
  event.set("order", order.id);
  event.set("event_key", eventKey);
  event.set("event_type", "order_created");
  event.set("source_type", "order");
  event.set("risk_level", "normal");
  event.set("decision", mode === "monitoring" ? "monitored" : "allowed");
  event.set("mode_at_event", mode);
  event.set("phone_hmac", phoneHmac);
  event.set("ip_hmac", ipCapture.ip_hmac);
  event.set("ip_masked", ipCapture.ip_masked);
  event.set("ip_encrypted", ipCapture.ip_encrypted);
  event.set("ip_family", ipCapture.ip_family);
  event.set("browser_token_hmac", browserTokenHmac);
  event.set("capture_status", ipCapture.capture_status);
  event.set("crypto_version", "v1");
  event.set("metadata_json", {
    order_status: getString(order, "status"),
    delivery_method: getString(order, "delivery_method"),
    has_shipping_zone: Boolean(getRelationId(order, "shipping_zone")),
  });
  event.set("occurred_at", getOrderCreatedAt(order));

  try {
    app.save(event);
    return event;
  } catch (error) {
    const racedEvent = findFirstByFilter(app, SECURITY_EVENTS_COLLECTION, "event_key = {:eventKey}", { eventKey });
    if (racedEvent) return racedEvent;
    throw error;
  }
}

function attachOrderToCustomer(app, order, customerId, registeredAt) {
  const currentCustomerId = getRelationId(order, "customer");
  const hasRegisteredAt = Boolean(getString(order, "security_registered_at"));
  let changed = false;

  if (currentCustomerId !== customerId) {
    order.set("customer", customerId);
    changed = true;
  }

  if (!hasRegisteredAt && registeredAt) {
    order.set("security_registered_at", registeredAt);
    changed = true;
  }

  if (changed) {
    ORDER_INTERNAL_REGISTERING[order.id] = true;
    try {
      app.save(order);
    } finally {
      delete ORDER_INTERNAL_REGISTERING[order.id];
    }
  }
}

function registerOrderSecurityIdentity(orderId, receiptToken, browserTokenDigest, requestIp) {
  const normalizedIp = normalizeIpAddress(requestIp);
  const registeredAt = new Date().toISOString();

  $app.runInTransaction((txApp) => {
    const txOrder = findRecordByIdSafe(txApp, ORDERS_COLLECTION, orderId);
    if (!txOrder) return;

    const storedToken = getString(txOrder, "receipt_token");
    if (!storedToken || !$security.equal(storedToken, receiptToken)) return;
    if (isOrderSecurityIdentityErased(txOrder)) return;

    const txStoreId = getRelationId(txOrder, "store");
    if (!txStoreId) return;

    const txPhoneNormalized = normalizePhone(getString(txOrder, "customer_phone"));
    if (!txPhoneNormalized) return;
    if (!hasOrderItems(txApp, txOrder.id)) return;

    const txSettings = getActiveSecuritySettings(txApp, txStoreId);
    if (!txSettings) return;

    const secret = getValidHmacSecret();
    if (!secret) {
      logSecurity("warn", "PZ_SEC_HMAC_SECRET_INVALID");
      return;
    }

    const phoneHmac = hmacValue("phone", txStoreId, txPhoneNormalized, secret);
    const browserTokenHmac = hmacValue("browser", txStoreId, browserTokenDigest, secret);
    const ipCapture = buildIpCapture(normalizedIp, txStoreId, txSettings, secret);

    const customer = resolveOrderCanonicalCustomer(txApp, {
      storeId: txStoreId,
      phoneNormalized: txPhoneNormalized,
      phoneHmac,
      browserTokenHmac,
      displayName: getString(txOrder, "customer_name"),
      order: txOrder,
      seenAt: getOrderCreatedAt(txOrder),
      ipCapture,
      mergeType: "auto_device",
    });
    if (!customer || getRelationId(customer, "store") !== txStoreId) return;

    attachOrderToCustomer(txApp, txOrder, customer.id, registeredAt);
    createOrderCreatedEventIfMissing(
      txApp,
      txStoreId,
      customer.id,
      txOrder,
      txSettings,
      phoneHmac,
      browserTokenHmac,
      ipCapture
    );
    try {
      require(`${__hooks}/pz_security_monitoring_lib.js`).linkVisitorSessionToCustomerByBrowserToken(
        txApp,
        txStoreId,
        browserTokenHmac,
        customer.id
      );
    } catch (_) {}
    rebuildCustomerStats(txApp, customer.id);
  });
}

function relinkOrderToPhoneCustomer(app, order, secret, touchedCustomerIds) {
  if (isOrderSecurityIdentityErased(order)) return false;

  const storeId = getRelationId(order, "store");
  const phoneNormalized = normalizePhone(getString(order, "customer_phone"));
  if (!storeId || !phoneNormalized) return false;

  const settings = getActiveSecuritySettings(app, storeId);
  if (!settings) return false;
  if (!hasOrderItems(app, order.id)) return false;

  const phoneHmac = secret ? hmacValue("phone", storeId, phoneNormalized, secret) : "";
  const customer = resolveOrderCanonicalCustomer(app, {
    storeId,
    phoneNormalized,
    phoneHmac,
    browserTokenHmac: "",
    displayName: getString(order, "customer_name"),
    order,
    seenAt: getOrderCreatedAt(order),
    ipCapture: null,
    mergeType: "auto_phone",
  });
  if (!customer || getRelationId(customer, "store") !== storeId) return false;

  const previousCustomerId = getRelationId(order, "customer");
  if (previousCustomerId) touchedCustomerIds[previousCustomerId] = true;
  attachOrderToCustomer(app, order, customer.id, getString(order, "security_registered_at") || new Date().toISOString());
  touchedCustomerIds[customer.id] = true;
  return true;
}

function enforceOrderCustomerStore(app, order, touchedCustomerIds) {
  const storeId = getRelationId(order, "store");
  const customerId = getRelationId(order, "customer");
  if (!storeId || !customerId) return true;

  const customer = findRecordByIdSafe(app, STORE_CUSTOMERS_COLLECTION, customerId);
  if (!customer) return false;
  if (getRelationId(customer, "store") === storeId) return true;

  touchedCustomerIds[customerId] = true;
  order.set("customer", "");
  ORDER_INTERNAL_REGISTERING[order.id] = true;
  try {
    app.save(order);
  } finally {
    delete ORDER_INTERNAL_REGISTERING[order.id];
  }
  return false;
}

function handleRegisterOrder(e) {
  setNoStore(e);

  try {
    const info = e.requestInfo();
    const body = info.body || {};
    if (!isStrictRegisterPayload(body)) return respondOk(e);

    const orderId = String(getBodyValue(body, "order_id") || "");
    const receiptToken = String(getBodyValue(body, "receipt_token") || "");
    const browserTokenDigest = String(getBodyValue(body, "browser_token_digest") || "");
    const requestIp = e.realIP();

    registerOrderSecurityIdentity(orderId, receiptToken, browserTokenDigest, requestIp);
  } catch (_) {
    logSecurity("error", "PZ_SEC_PUBLIC_REGISTER_FAILED");
  }

  return respondOk(e);
}

function invalidBackfill(e, parameter) {
  setNoStore(e);
  return e.json(400, { ok: false, error: "invalid_parameter", parameter });
}

function parseBackfillPayload(body) {
  const allowed = ["dry_run", "store_id", "limit", "offset"];
  const keys = getBodyKeys(body);
  const extraKey = keys.find((key) => !allowed.includes(key));
  if (extraKey) return { error: extraKey };

  const dryRunRaw = getBodyValue(body, "dry_run");
  if (hasOwn(body, "dry_run") && typeof dryRunRaw !== "boolean") return { error: "dry_run" };
  const dryRun = hasOwn(body, "dry_run") ? dryRunRaw : true;

  const limitRaw = getBodyValue(body, "limit");
  if (hasOwn(body, "limit") && (typeof limitRaw !== "number" || !Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 500)) {
    return { error: "limit" };
  }
  const limit = hasOwn(body, "limit") ? limitRaw : 500;

  const offsetRaw = getBodyValue(body, "offset");
  if (hasOwn(body, "offset") && (typeof offsetRaw !== "number" || !Number.isInteger(offsetRaw) || offsetRaw < 0)) {
    return { error: "offset" };
  }
  const offset = hasOwn(body, "offset") ? offsetRaw : 0;

  let storeId = "";
  if (hasOwn(body, "store_id")) {
    const rawStoreId = getBodyValue(body, "store_id");
    if (typeof rawStoreId !== "string") return { error: "store_id" };
    storeId = rawStoreId.trim();
    if (storeId && !isValidRecordId(storeId)) return { error: "store_id" };
  }

  return { dryRun, limit, offset, storeId };
}

function activeStoreIdsForBackfill(app, requestedStoreId) {
  const settingsFilter = requestedStoreId
    ? 'store = {:store} && enabled = true && mode != "disabled"'
    : 'enabled = true && mode != "disabled"';
  const settingsParams = requestedStoreId ? { store: requestedStoreId } : {};
  const settingsRecords = app.findRecordsByFilter(
    SECURITY_SETTINGS_COLLECTION,
    settingsFilter,
    "store",
    0,
    0,
    settingsParams
  ) || [];
  const activeStoreIds = [];

  for (const settings of settingsRecords) {
    const mode = getString(settings, "mode");
    const storeId = getRelationId(settings, "store");
    if (storeId && (mode === "monitoring" || mode === "protection") && !activeStoreIds.includes(storeId)) {
      activeStoreIds.push(storeId);
    }
  }

  return activeStoreIds;
}

function createIdentityBackfillReport(dryRun, limit, offset) {
  return {
    ok: true,
    dry_run: dryRun,
    limit,
    offset,
    stores: 0,
    customers_before: 0,
    canonical_customers_after: 0,
    aliases_created: 0,
    phones_created: 0,
    devices_created: 0,
    orders_moved: 0,
    events_moved: 0,
    sessions_moved: 0,
    pageviews_moved: 0,
    ip_only_matches_ignored: 0,
    erased_orders_skipped: 0,
    invalid_records_skipped: 0,
  };
}

function countCanonicalCustomers(app, storeId) {
  const filter = hasCanonicalIdentitySchema(app)
    ? 'store = {:store} && merged_into = ""'
    : "store = {:store}";
  try {
    return (app.findRecordsByFilter(
      STORE_CUSTOMERS_COLLECTION,
      filter,
      "",
      0,
      0,
      { store: storeId }
    ) || []).length;
  } catch (_) {
    return 0;
  }
}

function findOrderSecurityEvent(app, storeId, orderId) {
  const byKey = findFirstByFilter(
    app,
    SECURITY_EVENTS_COLLECTION,
    "store = {:store} && event_key = {:eventKey}",
    { store: storeId, eventKey: `order_created:${orderId}` }
  );
  if (byKey) return byKey;

  const events = app.findRecordsByFilter(
    SECURITY_EVENTS_COLLECTION,
    "store = {:store} && order = {:order}",
    "-occurred_at,-created",
    1,
    0,
    { store: storeId, order: orderId }
  ) || [];
  return events.length ? events[0] : null;
}

function ipCaptureFromRecord(record, prefix) {
  if (!record) return null;
  const fieldPrefix = prefix || "";
  const hmacField = fieldPrefix ? `${fieldPrefix}_ip_hmac` : "ip_hmac";
  const maskedField = fieldPrefix ? `${fieldPrefix}_ip_masked` : "ip_masked";
  const encryptedField = fieldPrefix ? `${fieldPrefix}_ip_encrypted` : "ip_encrypted";
  const familyField = fieldPrefix ? `${fieldPrefix}_ip_family` : "ip_family";
  const captureField = fieldPrefix ? `${fieldPrefix}_capture_status` : "capture_status";

  return {
    ip_hmac: getString(record, hmacField),
    ip_masked: getString(record, maskedField),
    ip_encrypted: getString(record, encryptedField),
    ip_family: getString(record, familyField) || "unknown",
    capture_status: getString(record, captureField) || "unavailable",
  };
}

function updateSecurityEventCustomer(app, event, storeId, customerId, report) {
  if (!event || getRelationId(event, "store") !== storeId) return;
  if (getRelationId(event, "customer") === customerId) return;
  event.set("customer", customerId);
  app.save(event);
  if (report) report.events_moved += 1;
}

function seedExistingCustomerPhones(app, storeId, secret, dryRun, report, seenKeys) {
  const customers = listRecordsPaged(
    app,
    STORE_CUSTOMERS_COLLECTION,
    "store = {:store}",
    "created,id",
    { store: storeId },
    200
  );

  customers.forEach((customer) => {
    if (getRelationId(customer, "merged_into")) return;
    const phoneNormalized = normalizePhone(getString(customer, "phone_normalized"));
    if (!phoneNormalized) {
      report.invalid_records_skipped += 1;
      return;
    }
    const key = `${storeId}|${phoneNormalized}`;
    if (dryRun) {
      if (!findCustomerPhone(app, storeId, phoneNormalized) && !seenKeys[key]) {
        seenKeys[key] = true;
        report.phones_created += 1;
      }
      return;
    }
    const phoneHmac = secret ? hmacValue("phone", storeId, phoneNormalized, secret) : getString(customer, "phone_hmac");
    ensureCustomerPhone(app, storeId, customer.id, phoneNormalized, phoneHmac, getString(customer, "created"), false, report);
  });
}

function processBackfillOrder(app, storeId, order, secret, dryRun, report, seenPhoneKeys, seenDeviceKeys) {
  if (isOrderSecurityIdentityErased(order)) {
    report.erased_orders_skipped += 1;
    return;
  }

  const phoneNormalized = normalizePhone(getString(order, "customer_phone"));
  if (!phoneNormalized || !hasOrderItems(app, order.id)) {
    report.invalid_records_skipped += 1;
    return;
  }

  const event = findOrderSecurityEvent(app, storeId, order.id);
  const browserTokenHmac = event ? getString(event, "browser_token_hmac") : "";
  const phoneKey = `${storeId}|${phoneNormalized}`;
  const deviceKey = `${storeId}|${browserTokenHmac}`;

  if (dryRun) {
    if (!findCustomerPhone(app, storeId, phoneNormalized) && !seenPhoneKeys[phoneKey]) {
      seenPhoneKeys[phoneKey] = true;
      report.phones_created += 1;
    }
    if (browserTokenHmac && !findCustomerDevice(app, storeId, browserTokenHmac) && !seenDeviceKeys[deviceKey]) {
      seenDeviceKeys[deviceKey] = true;
      report.devices_created += 1;
    }
    return;
  }

  const phoneHmac = secret ? hmacValue("phone", storeId, phoneNormalized, secret) : "";
  const beforeCustomerId = getRelationId(order, "customer");
  const customer = resolveOrderCanonicalCustomer(app, {
    storeId,
    phoneNormalized,
    phoneHmac,
    browserTokenHmac,
    displayName: getString(order, "customer_name"),
    order,
    seenAt: getOrderCreatedAt(order),
    ipCapture: ipCaptureFromRecord(event, ""),
    report,
    mergeType: "backfill",
  });
  if (!customer) {
    report.invalid_records_skipped += 1;
    return;
  }

  attachOrderToCustomer(app, order, customer.id, getString(order, "security_registered_at") || new Date().toISOString());
  if (beforeCustomerId && beforeCustomerId !== customer.id) report.orders_moved += 1;
  updateSecurityEventCustomer(app, event, storeId, customer.id, report);
  rebuildCustomerStats(app, customer.id);
}

function seedDevicesFromCollection(app, collectionName, storeId, dryRun, report, seenDeviceKeys) {
  if (!findCollectionSafe(app, collectionName)) return;
  const tokenField = "browser_token_hmac";
  const records = listRecordsPaged(
    app,
    collectionName,
    `store = {:store} && ${tokenField} != ""`,
    collectionName === SECURITY_EVENTS_COLLECTION ? "-occurred_at,-created" : "-last_seen_at,-updated,-created",
    { store: storeId },
    200
  );

  records.forEach((record) => {
    const browserTokenHmac = getString(record, "browser_token_hmac");
    const key = `${storeId}|${browserTokenHmac}`;
    const currentCustomerId = getRelationId(record, "customer");
    const existingDevice = findCustomerDevice(app, storeId, browserTokenHmac);
    const existingDeviceCustomer = existingDevice ? resolveCanonicalCustomer(app, storeId, getRelationId(existingDevice, "customer")) : null;
    const recordCustomer = currentCustomerId ? resolveCanonicalCustomer(app, storeId, currentCustomerId) : null;

    if (dryRun) {
      if (!existingDevice && !seenDeviceKeys[key]) {
        seenDeviceKeys[key] = true;
        report.devices_created += 1;
      }
      return;
    }

    const targetCustomer = recordCustomer || existingDeviceCustomer;
    if (!targetCustomer) {
      report.invalid_records_skipped += 1;
      return;
    }

    const prefix = collectionName === VISITOR_SESSIONS_COLLECTION ? "latest" : "";
    const device = ensureCustomerDevice(
      app,
      storeId,
      targetCustomer.id,
      browserTokenHmac,
      getString(record, collectionName === VISITOR_SESSIONS_COLLECTION ? "last_seen_at" : "occurred_at"),
      ipCaptureFromRecord(record, prefix),
      report
    );
    const canonical = device ? resolveCanonicalCustomer(app, storeId, getRelationId(device, "customer")) : targetCustomer;
    if (canonical && getRelationId(record, "customer") !== canonical.id) {
      record.set("customer", canonical.id);
      app.save(record);
      if (collectionName === SECURITY_EVENTS_COLLECTION) report.events_moved += 1;
      if (collectionName === VISITOR_SESSIONS_COLLECTION) report.sessions_moved += 1;
    }
    if (canonical) rebuildCustomerStats(app, canonical.id);
  });
}

function handleBackfill(e) {
  setNoStore(e, true);

  const info = e.requestInfo();
  const body = info.body || {};
  const parsed = parseBackfillPayload(body);
  if (parsed.error) return invalidBackfill(e, parsed.error);

  const dryRun = parsed.dryRun;
  const requestedStoreId = parsed.storeId;
  const limit = parsed.limit;
  const offset = parsed.offset;

  if (requestedStoreId && !findRecordByIdSafe($app, STORES_COLLECTION, requestedStoreId)) {
    return invalidBackfill(e, "store_id");
  }

  const secret = getValidHmacSecret();
  if (!dryRun && !secret) {
    return e.json(400, { ok: false, error: "invalid_hmac_secret" });
  }

  const activeStoreIds = activeStoreIdsForBackfill($app, requestedStoreId);
  const snapshotCreatedBefore = new Date().toISOString();
  const report = createIdentityBackfillReport(dryRun, limit, offset);
  report.stores = activeStoreIds.length;
  report.requested_store_security_active = requestedStoreId ? activeStoreIds.includes(requestedStoreId) : true;
  const seenPhoneKeys = {};
  const seenDeviceKeys = {};
  let skippedByOffset = 0;
  let scannedOrders = 0;

  for (const storeId of activeStoreIds) {
    report.customers_before += countCanonicalCustomers($app, storeId);
    seedExistingCustomerPhones($app, storeId, secret, dryRun, report, seenPhoneKeys);

    let pageOffset = 0;
    while (scannedOrders < limit) {
      const orders = $app.findRecordsByFilter(
        ORDERS_COLLECTION,
        "store = {:store} && created <= {:snapshotCreatedBefore}",
        "created,id",
        200,
        pageOffset,
        { store: storeId, snapshotCreatedBefore }
      ) || [];
      if (!orders.length) break;

      for (const order of orders) {
        if (skippedByOffset < offset) {
          skippedByOffset += 1;
          continue;
        }
        if (scannedOrders >= limit) break;
        scannedOrders += 1;
        processBackfillOrder($app, storeId, order, secret, dryRun, report, seenPhoneKeys, seenDeviceKeys);
      }

      if (orders.length < 200 || scannedOrders >= limit) break;
      pageOffset += 200;
    }

    seedDevicesFromCollection($app, SECURITY_EVENTS_COLLECTION, storeId, dryRun, report, seenDeviceKeys);
    seedDevicesFromCollection($app, VISITOR_SESSIONS_COLLECTION, storeId, dryRun, report, seenDeviceKeys);
    report.canonical_customers_after += dryRun ? countCanonicalCustomers($app, storeId) : countCanonicalCustomers($app, storeId);
    if (scannedOrders >= limit) break;
  }

  return e.json(200, report);
}

function normalizeEndpointPage(value) {
  const number = Number(value || 1);
  if (!Number.isInteger(number) || number < 1 || number > 1000) return 1;
  return number;
}

function parseCustomersPagePayload(body) {
  const allowed = ["store_id", "page", "status", "search"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length) return { error: "payload" };
  if (keys.some((key) => !allowed.includes(key))) return { error: "payload" };

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  if (!isValidRecordId(storeId)) return { error: "store_id" };

  const pageRaw = getBodyValue(body, "page");
  if (typeof pageRaw !== "number" || !Number.isInteger(pageRaw) || pageRaw < 1 || pageRaw > 1000) {
    return { error: "page" };
  }

  const status = String(getBodyValue(body, "status") || "all").trim();
  if (!["all", "normal", "watch", "blocked", "archived"].includes(status)) return { error: "status" };

  return {
    storeId,
    page: pageRaw,
    status,
    search: limitText(getBodyValue(body, "search"), 80),
  };
}

function normalizeSearchTerm(value) {
  return String(value || "").trim().toLowerCase();
}

function phoneCustomerMatchMap(app, storeId, phoneSearch) {
  const map = {};
  if (!phoneSearch || !findCollectionSafe(app, STORE_CUSTOMER_PHONES_COLLECTION)) return map;
  const phones = listRecordsPaged(
    app,
    STORE_CUSTOMER_PHONES_COLLECTION,
    "store = {:store} && phone_normalized ~ {:phone}",
    "",
    { store: storeId, phone: phoneSearch },
    200
  );
  phones.forEach((phone) => {
    const customer = resolveCanonicalCustomer(app, storeId, getRelationId(phone, "customer"));
    if (customer) map[customer.id] = true;
  });
  return map;
}

function customerSortValue(customer) {
  return getString(customer, "last_order_at") || getString(customer, "updated") || getString(customer, "created") || "";
}

function primaryPhoneForCustomer(app, storeId, customerId) {
  if (!findCollectionSafe(app, STORE_CUSTOMER_PHONES_COLLECTION)) return null;
  const primary = findFirstByFilter(
    app,
    STORE_CUSTOMER_PHONES_COLLECTION,
    "store = {:store} && customer = {:customer} && is_primary = true",
    { store: storeId, customer: customerId }
  );
  if (primary) return primary;

  const phones = app.findRecordsByFilter(
    STORE_CUSTOMER_PHONES_COLLECTION,
    "store = {:store} && customer = {:customer}",
    "-last_seen_at,-updated,-created",
    1,
    0,
    { store: storeId, customer: customerId }
  ) || [];
  return phones.length ? phones[0] : null;
}

function countStoreRecordsByCustomer(app, collectionName, storeId, customerIds) {
  if (!findCollectionSafe(app, collectionName)) return 0;
  let total = 0;
  customerIds.forEach((customerId) => {
    total += listRecordsPaged(
      app,
      collectionName,
      "store = {:store} && customer = {:customer}",
      "",
      { store: storeId, customer: customerId },
      200
    ).length;
  });
  return total;
}

function collectAliasIdsForCustomer(app, storeId, canonicalId) {
  const ids = [canonicalId];
  let cursor = 0;
  while (cursor < ids.length) {
    const parent = ids[cursor];
    cursor += 1;
    const aliases = listRecordsPaged(
      app,
      STORE_CUSTOMERS_COLLECTION,
      "store = {:store} && merged_into = {:parent}",
      "",
      { store: storeId, parent },
      200
    );
    aliases.forEach((alias) => {
      if (!ids.includes(alias.id)) ids.push(alias.id);
    });
  }
  return ids;
}

function lifecycleCountsForCustomer(app, storeId, customerId) {
  const customerIds = collectAliasIdsForCustomer(app, storeId, customerId);
  const sessions = [];
  customerIds.forEach((id) => {
    sessions.push(...listRecordsPaged(
      app,
      VISITOR_SESSIONS_COLLECTION,
      "store = {:store} && customer = {:customer}",
      "",
      { store: storeId, customer: id },
      200
    ));
  });

  const seenPageviews = {};
  customerIds.forEach((id) => {
    listRecordsPaged(
      app,
      VISITOR_PAGEVIEWS_COLLECTION,
      "store = {:store} && customer = {:customer}",
      "",
      { store: storeId, customer: id },
      200
    ).forEach((pageview) => {
      seenPageviews[pageview.id] = true;
    });
  });
  sessions.forEach((session) => {
    listRecordsPaged(
      app,
      VISITOR_PAGEVIEWS_COLLECTION,
      "store = {:store} && visitor_session = {:session}",
      "",
      { store: storeId, session: session.id },
      200
    ).forEach((pageview) => {
      seenPageviews[pageview.id] = true;
    });
  });

  return {
    orders_affected: countStoreRecordsByCustomer(app, ORDERS_COLLECTION, storeId, customerIds),
    events_affected: countStoreRecordsByCustomer(app, SECURITY_EVENTS_COLLECTION, storeId, customerIds),
    phones_affected: countStoreRecordsByCustomer(app, STORE_CUSTOMER_PHONES_COLLECTION, storeId, customerIds),
    devices_affected: countStoreRecordsByCustomer(app, STORE_CUSTOMER_DEVICES_COLLECTION, storeId, customerIds),
    sessions_affected: sessions.length,
    pageviews_affected: Object.keys(seenPageviews).length,
  };
}

function serializeCustomerListItem(app, storeId, customer) {
  const primaryPhone = primaryPhoneForCustomer(app, storeId, customer.id);
  const primaryPhoneValue = primaryPhone ? getString(primaryPhone, "phone_normalized") : getString(customer, "phone_normalized");
  return {
    id: customer.id,
    store: storeId,
    display_name: getString(customer, "display_name"),
    phone_normalized: primaryPhoneValue,
    primary_phone: primaryPhoneValue,
    first_order_at: getString(customer, "first_order_at"),
    last_order_at: getString(customer, "last_order_at"),
    last_order: getRelationId(customer, "last_order"),
    orders_count: Math.max(0, getNumberRaw(customer, "orders_count") || 0),
    pending_orders_count: Math.max(0, getNumberRaw(customer, "pending_orders_count") || 0),
    confirmed_orders_count: Math.max(0, getNumberRaw(customer, "confirmed_orders_count") || 0),
    preparing_orders_count: Math.max(0, getNumberRaw(customer, "preparing_orders_count") || 0),
    delivered_orders_count: Math.max(0, getNumberRaw(customer, "delivered_orders_count") || 0),
    cancelled_orders_count: Math.max(0, getNumberRaw(customer, "cancelled_orders_count") || 0),
    confirmed_total_usd: Math.max(0, getNumberRaw(customer, "confirmed_total_usd") || 0),
    phones_count: Math.max(0, getNumberRaw(customer, "phones_count") || 0),
    devices_count: Math.max(0, getNumberRaw(customer, "devices_count") || 0),
    last_address: getString(customer, "last_address"),
    last_municipality: getString(customer, "last_municipality"),
    status: getString(customer, "status") || "normal",
    archived: getBoolean(customer, "archived"),
    archived_at: getString(customer, "archived_at"),
    lifecycle_counts: lifecycleCountsForCustomer(app, storeId, customer.id),
    created: getString(customer, "created"),
    updated: getString(customer, "updated"),
  };
}

function buildCustomersPage(app, storeId, page, status, search) {
  const cleanSearch = normalizeSearchTerm(search);
  const phoneSearch = normalizePhone(cleanSearch);
  const phoneMatches = phoneSearch ? phoneCustomerMatchMap(app, storeId, phoneSearch) : {};
  const archivedOnly = status === "archived";
  const customers = listRecordsPaged(
    app,
    STORE_CUSTOMERS_COLLECTION,
    archivedOnly
      ? 'store = {:store} && merged_into = "" && archived = true'
      : 'store = {:store} && merged_into = "" && archived = false',
    "-last_order_at,-updated,-created",
    { store: storeId },
    200
  ).filter((customer) => {
    if (!archivedOnly && status !== "all" && getString(customer, "status") !== status) return false;
    if (phoneSearch) return phoneMatches[customer.id] === true;
    if (cleanSearch) return normalizeSearchTerm(getString(customer, "display_name")).includes(cleanSearch);
    return true;
  });

  customers.sort((a, b) => {
    const bValue = customerSortValue(b);
    const aValue = customerSortValue(a);
    if (aValue !== bValue) return bValue > aValue ? 1 : -1;
    return String(a.id || "") > String(b.id || "") ? 1 : -1;
  });

  const perPage = 20;
  const totalItems = customers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    page: safePage,
    perPage,
    totalItems,
    totalPages,
    items: customers.slice(start, start + perPage).map((customer) => serializeCustomerListItem(app, storeId, customer)),
  };
}

function handleCustomersPage(e) {
  setNoStore(e, true);

  try {
    const info = e.requestInfo();
    const auth = info.auth;
    const role = authRole(auth);
    const authStoreId = authStore(auth);
    const parsed = parseCustomersPagePayload(info.body || {});
    if (parsed.error) return e.json(400, { ok: false, error: "invalid_payload", parameter: parsed.error });
    if (!canReadStore(role, authStoreId, parsed.storeId, auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
    }
    if (!hasReadableSecuritySettings($app, parsed.storeId, role)) return e.json(403, { ok: false, error: "security_disabled" });

    const page = buildCustomersPage($app, parsed.storeId, parsed.page, parsed.status, parsed.search);
    return e.json(200, { ok: true, customers: page });
  } catch (_) {
    logSecurity("error", "PZ_SEC_CUSTOMER_IDENTITY_FAILED");
    return e.json(500, { ok: false, error: "customers_page_failed" });
  }
}

function parseMergePayload(body) {
  const allowed = ["store_id", "canonical_customer_id", "source_customer_id", "reason"];
  const keys = getBodyKeys(body);
  if (keys.length !== allowed.length) return { error: "payload" };
  if (keys.some((key) => !allowed.includes(key))) return { error: "payload" };

  const storeId = String(getBodyValue(body, "store_id") || "").trim();
  const canonicalCustomerId = String(getBodyValue(body, "canonical_customer_id") || "").trim();
  const sourceCustomerId = String(getBodyValue(body, "source_customer_id") || "").trim();
  const reason = limitText(getBodyValue(body, "reason"), 500);
  if (!isValidRecordId(storeId)) return { error: "store_id" };
  if (!isValidRecordId(canonicalCustomerId)) return { error: "canonical_customer_id" };
  if (!isValidRecordId(sourceCustomerId)) return { error: "source_customer_id" };
  if (canonicalCustomerId === sourceCustomerId) return { error: "same_customer" };
  if (!reason) return { error: "reason" };

  return { storeId, canonicalCustomerId, sourceCustomerId, reason };
}

function handleMergeCustomers(e) {
  setNoStore(e, true);

  try {
    const info = e.requestInfo();
    const auth = info.auth;
    const role = authRole(auth);
    const authStoreId = authStore(auth);
    const parsed = parseMergePayload(info.body || {});
    if (parsed.error) return e.json(400, { ok: false, error: "invalid_payload", parameter: parsed.error });
    if (!canManageStore(role, authStoreId, parsed.storeId, auth)) {
      return respondStorePermissionDenied(e, role, authStoreId, parsed.storeId);
    }
    if (!getActiveSecuritySettings($app, parsed.storeId)) return e.json(403, { ok: false, error: "security_disabled" });
    if (!hasCanonicalIdentitySchema($app)) return e.json(400, { ok: false, error: "schema_unavailable" });

    let result = null;
    $app.runInTransaction((txApp) => {
      const canonical = resolveCanonicalCustomer(txApp, parsed.storeId, parsed.canonicalCustomerId);
      const source = resolveCanonicalCustomer(txApp, parsed.storeId, parsed.sourceCustomerId);
      if (!canonical || !source) return;
      if (canonical.id === source.id) return;
      const createdBy = getString(auth, "id");
      result = mergeCustomersIntoCanonical(
        txApp,
        parsed.storeId,
        canonical.id,
        source.id,
        "manual",
        parsed.reason,
        createdBy,
        canonical.id
      );
    });

    if (!result) return e.json(404, { ok: false, error: "not_found" });
    return e.json(200, { ok: true, canonical_customer_id: result.canonical_id });
  } catch (_) {
    logSecurity("error", "PZ_SEC_CUSTOMER_IDENTITY_FAILED");
    return e.json(500, { ok: false, error: "merge_failed" });
  }
}

function handleOrderUpdate(e) {
  if (ORDER_INTERNAL_REGISTERING[e.record.id]) return;

  const order = e.record;
  const original = order.original();
  const touchedCustomerIds = {};
  const oldCustomerId = getRelationId(original, "customer");
  const currentCustomerId = getRelationId(order, "customer");
  if (oldCustomerId) touchedCustomerIds[oldCustomerId] = true;
  if (currentCustomerId) touchedCustomerIds[currentCustomerId] = true;

  if (isOrderSecurityIdentityErased(order)) {
    Object.keys(touchedCustomerIds).forEach((customerId) => rebuildCustomerStats($app, customerId));
    return;
  }

  const oldPhone = normalizePhone(getString(original, "customer_phone"));
  const newPhone = normalizePhone(getString(order, "customer_phone"));
  const phoneChangedToAnotherValidPhone = Boolean(newPhone && oldPhone !== newPhone);

  try {
    if (!enforceOrderCustomerStore($app, order, touchedCustomerIds)) {
      Object.keys(touchedCustomerIds).forEach((customerId) => rebuildCustomerStats($app, customerId));
      return;
    }

    if (phoneChangedToAnotherValidPhone) {
      const storeId = getRelationId(order, "store");
      const settings = getActiveSecuritySettings($app, storeId);
      if (settings) {
        const secret = getValidHmacSecret();
        if (secret) {
          relinkOrderToPhoneCustomer($app, order, secret, touchedCustomerIds);
        } else {
          logSecurity("warn", "PZ_SEC_ORDER_PHONE_RELINK_SKIPPED");
        }
      }
    }

    Object.keys(touchedCustomerIds).forEach((customerId) => rebuildCustomerStats($app, customerId));
  } catch (_) {
    logSecurity("error", "PZ_SEC_ORDER_UPDATE_REBUILD_FAILED");
  }
}

function handleOrderDelete(e) {
  try {
    const customerId = getRelationId(e.record, "customer");
    if (customerId) {
      const storeId = getRelationId(e.record, "store");
      const canonical = storeId ? resolveCanonicalCustomer($app, storeId, customerId) : null;
      rebuildCustomerStats($app, canonical ? canonical.id : customerId);
    }
  } catch (_) {
    logSecurity("error", "PZ_SEC_ORDER_DELETE_REBUILD_FAILED");
  }
}

module.exports = {
  handleRegisterOrder,
  handleBackfill,
  handleCustomersPage,
  handleMergeCustomers,
  handleOrderUpdate,
  handleOrderDelete,
  _test: {
    normalizeIpAddress,
    buildIpCapture,
    normalizePhone,
    utf8ByteLength,
    isValidHmacSecretValue,
    isValidAesKeyValue,
  },
};
