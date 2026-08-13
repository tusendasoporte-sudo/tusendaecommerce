const activity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_lib.js")
  : require(`${__hooks}/pz_store_activity_lib.js`);
const teamPermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PRODUCT_LIST_LIMIT = 1000;
const ORDER_LIST_LIMIT = 200;
const ORDER_ITEM_LIMIT = 500;

const PRODUCT_LIST_FIELDS = Object.freeze([
  "id", "store", "name", "slug", "internal_ref", "category", "subcategory",
  "price_currency", "base_price_usd", "regular_price_usd", "offer_price_usd",
  "regular_price_amount", "offer_price_amount", "is_offer", "only_usd", "stock",
  "track_stock", "allow_preorder", "has_variations", "active", "featured",
  "delivery_mode", "images", "image_order", "updated", "expiration_date",
]);

function text(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return result.slice(0, Math.max(0, Number(max) || 0));
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function bodyKeys(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function parseBootstrapPayload(body) {
  const keys = bodyKeys(body);
  if (keys.some((key) => key !== "store_id")) throw new Error("invalid_payload");
  const storeId = text(bodyValue(body, "store_id"), 15);
  if (storeId && !RECORD_ID_PATTERN.test(storeId)) throw new Error("invalid_payload");
  return { storeId };
}

function recordId(record) {
  if (!record) return "";
  try { return text(record.id, 80); } catch (_) {}
  try { return text(record.get("id"), 80); } catch (_) {}
  return "";
}

function recordValue(record, key) {
  if (!record) return null;
  if (key === "id") return recordId(record);
  try { return record.get(key); } catch (_) {}
  try { return record[key]; } catch (_) {}
  return null;
}

function recordPublic(record) {
  if (!record) return null;
  try {
    if (typeof record.publicExport === "function") return record.publicExport();
  } catch (_) {}
  return { id: recordId(record) };
}

function recordFields(record, fields) {
  const result = {};
  fields.forEach((field) => {
    const value = recordValue(record, field);
    if (value !== undefined) result[field] = value;
  });
  return result;
}

function findRecords(app, collection, filter, sort, limit, params) {
  return app.findRecordsByFilter(collection, filter || "", sort || "", limit, 0, params || {}) || [];
}

function hasPermission(app, context, permission) {
  return context.master || teamPermissions.hasStorePermission(app, context.actor, context.store, permission);
}

function requirePermission(app, context, permission) {
  if (!hasPermission(app, context, permission)) throw new Error("forbidden");
}

function privateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
  } catch (_) {}
}

function redactOrder(order, permissions) {
  const safe = { ...(order || {}) };
  if (!permissions.contactCustomers) {
    ["customer_phone", "customer_email", "customer_address", "receipt_token", "customer"]
      .forEach((field) => delete safe[field]);
  }
  if (!permissions.manageReviews) delete safe.review_token;
  if (safe.expand && typeof safe.expand === "object") {
    safe.expand = { ...safe.expand };
    if (!permissions.contactCustomers) delete safe.expand.customer;
  }
  return safe;
}

function relationMap(records) {
  const result = {};
  records.forEach((record) => {
    const exported = recordPublic(record);
    const id = text(exported && exported.id, 80);
    if (id) result[id] = exported;
  });
  return result;
}

function enrichOrder(order, shippingZones, currencies) {
  const expand = { ...(order.expand || {}) };
  const shippingZoneId = text(order.shipping_zone, 80);
  const currencyId = text(order.currency, 80);
  if (shippingZoneId && shippingZones[shippingZoneId]) expand.shipping_zone = shippingZones[shippingZoneId];
  if (currencyId && currencies[currencyId]) expand.currency = currencies[currencyId];
  return Object.keys(expand).length ? { ...order, expand } : order;
}

function orderItemFilter(orderIds) {
  const bindings = {};
  const clauses = orderIds.map((id, index) => {
    const key = `order${index}`;
    bindings[key] = id;
    return `order = {:${key}}`;
  });
  return { filter: clauses.join(" || "), bindings };
}

function productsBootstrap(app, context) {
  requirePermission(app, context, "catalog.view");
  const params = { store: context.storeId };
  const storeFilter = "store = {:store}";
  const categories = findRecords(app, "categories", storeFilter, "order,name,id", PRODUCT_LIST_LIMIT, params).map(recordPublic);
  const subcategories = findRecords(app, "subcategories", storeFilter, "order,name,id", PRODUCT_LIST_LIMIT, params).map(recordPublic);
  const products = findRecords(app, "products", storeFilter, "name,id", PRODUCT_LIST_LIMIT, params)
    .map((record) => recordFields(record, PRODUCT_LIST_FIELDS));
  const currencies = findRecords(app, "currencies", storeFilter, "-is_default,-is_base,code,id", 100, params).map(recordPublic);
  const activeShippingZones = findRecords(app, "shipping_zones", "store = {:store} && active = true", "id", 1, params);
  return {
    categories,
    subcategories,
    products,
    currencies,
    active_shipping_zone_count: activeShippingZones.length,
  };
}

function ordersBootstrap(app, context) {
  requirePermission(app, context, "orders.view");
  const params = { store: context.storeId };
  const orderRecords = findRecords(app, "orders", "store = {:store}", "-created,-id", ORDER_LIST_LIMIT, params);
  const orderIds = orderRecords.map(recordId).filter(Boolean);
  const itemQuery = orderItemFilter(orderIds);
  const itemRecords = orderIds.length
    ? findRecords(app, "order_items", itemQuery.filter, "created,id", ORDER_ITEM_LIMIT, itemQuery.bindings)
    : [];
  const shippingZones = relationMap(findRecords(app, "shipping_zones", "store = {:store}", "municipality,zone,id", 500, params));
  const currencies = relationMap(findRecords(app, "currencies", "store = {:store}", "code,id", 100, params));
  const settings = hasPermission(app, context, "reviews.manage")
    ? findRecords(app, "settings", "store = {:store} && active = true", "-updated,-id", 1, params)[0] || null
    : null;
  const permissions = {
    contactCustomers: hasPermission(app, context, "orders.contact_customer"),
    manageReviews: hasPermission(app, context, "reviews.manage"),
  };
  const orders = orderRecords.map((record) => {
    const exported = enrichOrder(recordPublic(record), shippingZones, currencies);
    return redactOrder(exported, permissions);
  });
  return {
    orders,
    order_items: itemRecords.map(recordPublic),
    settings: settings ? recordPublic(settings) : null,
  };
}

function statusForError(error) {
  const code = text(error && (error.code || error.message), 80);
  if (["unauthorized", "forbidden", "primary_admin_required"].includes(code)) return 403;
  if (code === "invalid_payload") return 400;
  return 503;
}

function safeError(error) {
  const code = text(error && (error.code || error.message), 80);
  return ["unauthorized", "forbidden", "primary_admin_required", "invalid_payload"].includes(code)
    ? code
    : "admin_read_unavailable";
}

function handleProductsBootstrap(e) {
  privateHeaders(e);
  try {
    const parsed = parseBootstrapPayload(e.requestInfo().body || {});
    const context = activity.loadAccessContext($app, e, { storeId: parsed.storeId, requirePrimary: false });
    return e.json(200, { ok: true, data: productsBootstrap($app, context) });
  } catch (error) {
    return e.json(statusForError(error), { ok: false, error: safeError(error) });
  }
}

function handleOrdersBootstrap(e) {
  privateHeaders(e);
  try {
    const parsed = parseBootstrapPayload(e.requestInfo().body || {});
    const context = activity.loadAccessContext($app, e, { storeId: parsed.storeId, requirePrimary: false });
    return e.json(200, { ok: true, data: ordersBootstrap($app, context) });
  } catch (error) {
    return e.json(statusForError(error), { ok: false, error: safeError(error) });
  }
}

module.exports = {
  ORDER_ITEM_LIMIT,
  ORDER_LIST_LIMIT,
  PRODUCT_LIST_FIELDS,
  PRODUCT_LIST_LIMIT,
  enrichOrder,
  handleOrdersBootstrap,
  handleProductsBootstrap,
  orderItemFilter,
  ordersBootstrap,
  parseBootstrapPayload,
  productsBootstrap,
  redactOrder,
  recordFields,
};
