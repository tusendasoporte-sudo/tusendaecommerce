/// <reference path="../pb_data/types.d.ts" />

const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);

const READ_PERMISSIONS = Object.freeze({
  products: "catalog.view",
  product_variations: "catalog.view",
  categories: "catalog.view",
  subcategories: "catalog.view",
  orders: "orders.view",
  order_items: "orders.view",
  shipping_methods: "shipping.manage",
  shipping_zones: "shipping.manage",
  automatic_promotions: "promotions.manage",
  manual_coupons: "coupons.manage",
  manual_coupon_usages: "coupons.manage",
  gifts: "gifts.manage",
  raffles: "raffles.manage",
  raffle_entries: "raffles.manage",
  reviews: "reviews.manage",
  store_notifications: "notifications.view",
  store_analytics_events: "analytics.view",
  store_security_settings: "security.view",
  store_security_events: "security.view",
  store_security_blocks: "security.view",
  store_visitor_sessions: "security.view",
  store_customers: "security.view",
});

const READ_ANY_PERMISSIONS = Object.freeze({
  settings: Object.freeze([
    "catalog.view", "orders.view", "shipping.manage", "promotions.manage", "coupons.manage",
    "gifts.manage", "raffles.manage", "reviews.manage", "notifications.view", "analytics.view",
    "landing_qr.manage", "store.settings.manage", "security.view",
  ]),
  store_visual_items: Object.freeze(["promotions.manage", "gifts.manage", "landing_qr.manage"]),
  currencies: Object.freeze(["catalog.view", "orders.view", "analytics.view", "store.settings.manage"]),
});

const DENY_PERMISSION = "__mutation_denied__";

// `orders.view` intentionally exposes the operational order snapshot, but not
// customer contact channels nor the bearer-like public link secrets. Public
// receipt/review reads are left untouched because they don't use a store-user
// identity and remain protected by their existing collection rules.
const ORDER_CONTACT_PRIVATE_FIELDS = Object.freeze([
  "customer_phone",
  "customer_email",
  "customer_address",
  "receipt_token",
  "customer",
]);
const ORDER_REVIEW_PRIVATE_FIELDS = Object.freeze(["review_token"]);
const ORDER_EXPAND_COLLECTIONS = Object.freeze([
  "order_items",
  "manual_coupon_usages",
  "reviews",
]);

const RELATION_COLLECTIONS = Object.freeze({
  products: Object.freeze({ category: "categories", subcategory: "subcategories", related_products: "products" }),
  product_variations: Object.freeze({ product: "products" }),
  subcategories: Object.freeze({ category: "categories" }),
  orders: Object.freeze({ shipping_zone: "shipping_zones", currency: "currencies", customer: "store_customers" }),
  order_items: Object.freeze({ order: "orders", product: "products", variation: "product_variations", gift: "gifts" }),
  automatic_promotions: Object.freeze({ product: "products", category: "categories", subcategory: "subcategories" }),
  manual_coupons: Object.freeze({ product: "products", category: "categories", subcategory: "subcategories" }),
  manual_coupon_usages: Object.freeze({ coupon: "manual_coupons", order: "orders" }),
  raffle_entries: Object.freeze({ raffle: "raffles" }),
  reviews: Object.freeze({ product: "products", order: "orders" }),
  store_visual_items: Object.freeze({ category: "categories" }),
});

const MUTATION_PERMISSIONS = Object.freeze({
  categories: "catalog.categories.manage",
  subcategories: "catalog.categories.manage",
  orders: "orders.status.manage",
  order_items: "orders.items.manage",
  shipping_methods: "shipping.manage",
  shipping_zones: "shipping.manage",
  automatic_promotions: "promotions.manage",
  manual_coupons: "coupons.manage",
  manual_coupon_usages: "coupons.manage",
  gifts: "gifts.manage",
  raffles: "raffles.manage",
  raffle_entries: "raffles.manage",
  reviews: "reviews.manage",
  store_notifications: "notifications.view",
  store_visual_items: "promotions.manage",
  currencies: "store.settings.manage",
  store_security_settings: "security.manage",
  store_security_events: "security.manage",
  store_security_blocks: "security.manage",
  store_visitor_sessions: "security.manage",
  store_customers: "security.manage",
});

const PRODUCT_FIELD_PERMISSIONS = Object.freeze({
  expiration_date: "catalog.expirations.manage",
  base_price_usd: "catalog.products.price",
  regular_price_usd: "catalog.products.price",
  cost_usd: "catalog.products.price",
  profit_margin: "catalog.products.price",
  extra_price: "catalog.products.price",
  is_offer: "catalog.products.price",
  price: "catalog.products.price",
  price_usd: "catalog.products.price",
  precio: "catalog.products.price",
  precio_usd: "catalog.products.price",
  offer_price: "catalog.products.price",
  offer_price_usd: "catalog.products.price",
  only_usd: "catalog.products.price",
  stock: "catalog.products.stock",
  track_stock: "catalog.products.stock",
  allow_preorder: "catalog.products.stock",
  image: "catalog.products.images",
  images: "catalog.products.images",
  image_order: "catalog.products.images",
  gallery: "catalog.products.images",
  cover_image: "catalog.products.images",
  active: "catalog.products.visibility",
  visible: "catalog.products.visibility",
  status: "catalog.products.visibility",
  featured: "catalog.products.visibility",
  featured_order: "catalog.products.visibility",
});

const SETTINGS_META_FIELDS = Object.freeze([
  "id", "store", "store_name", "stored_name", "collectionId", "collectionName", "created", "updated",
]);
const REVIEW_SETTINGS_FIELDS = Object.freeze([
  "store_reviews_enabled",
  "product_reviews_enabled",
  "verified_order_reviews_enabled",
  "show_store_rating",
  "show_product_rating",
  "show_verified_badge",
  "notify_review_pending",
]);

function recordValue(record, key) {
  if (!record) return undefined;
  try { return record.get(key); } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  if (value && typeof value.string === "function") {
    try { return String(value.string() || "").trim(); } catch (_) { return ""; }
  }
  return String(value === null || value === undefined ? "" : value).trim();
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function relationIds(record, key) {
  const value = recordValue(record, key);
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.map((item) => String(item && item.id || item || "").trim()).filter(Boolean);
  if (value && typeof value === "object" && Number.isInteger(Number(value.length))) {
    const ids = [];
    for (let index = 0; index < Number(value.length); index += 1) {
      ids.push(String(value[index] && value[index].id || value[index] || "").trim());
    }
    return ids.filter(Boolean);
  }
  if (value && typeof value === "object") return [String(value.id || "").trim()].filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

function originalRecord(record) {
  if (!record || typeof record.original !== "function") return null;
  try { return record.original(); } catch (_) { return null; }
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function storeUser(auth) {
  return auth
    && ["store_admin", "store_staff"].includes(recordString(auth, "role"))
    && recordString(auth, "status") === "active"
    && relationId(auth, "store");
}

function storeIdentity(auth) {
  return auth
    && ["store_admin", "store_staff"].includes(recordString(auth, "role"))
    && relationId(auth, "store");
}

function requestBody(e) {
  try {
    const info = e.requestInfo();
    return info && info.body && typeof info.body === "object" ? info.body : {};
  } catch (_) { return {}; }
}

function bodyKeys(e) {
  const body = requestBody(e);
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function hasUnsavedFiles(e, key) {
  try {
    if (e && e.record && typeof e.record.getUnsavedFiles === "function"
      && Array.from(e.record.getUnsavedFiles(key) || []).length) return true;
  } catch (_) {}
  try {
    if (e && typeof e.findUploadedFiles === "function") {
      for (const candidate of [key, `${key}+`, `+${key}`]) {
        if (Array.from(e.findUploadedFiles(candidate) || []).length) return true;
      }
    }
  } catch (_) {}
  return false;
}

function mutationKeys(e, collection) {
  const keys = bodyKeys(e);
  const fileFields = collection === "products"
    ? ["images"]
    : (collection === "product_variations" ? ["image"] : (collection === "settings" ? ["landing_qr_hero_image"] : []));
  fileFields.forEach((key) => {
    if (hasUnsavedFiles(e, key) && !keys.includes(key)) keys.push(key);
  });
  return keys;
}

function normalizedBodyKey(key) {
  return String(key || "").trim().replace(/[+-]$/, "");
}

function productFieldPermission(key) {
  return PRODUCT_FIELD_PERMISSIONS[normalizedBodyKey(key)] || "";
}

function collectionName(e, fallback) {
  if (fallback) return fallback;
  try { return String(e.collection.name || ""); } catch (_) {}
  try { return String(e.record.collection().name || ""); } catch (_) {}
  return "";
}

function recordStoreId(app, collection, record) {
  if (!record) return "";
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
  if (collection === "manual_coupon_usages") {
    const coupon = findRecord(app, "manual_coupons", relationId(record, "coupon"));
    if (coupon) return relationId(coupon, "store");
    const order = findRecord(app, "orders", relationId(record, "order"));
    return relationId(order, "store");
  }
  return "";
}

function denyIsolation() {
  const message = "The requested resource wasn't found.";
  if (typeof NotFoundError === "function") throw new NotFoundError(message);
  const error = new Error("not_found");
  error.code = "not_found";
  throw error;
}

function assertTenantAndRelationIntegrity(e, collection, operation) {
  const auth = e && e.auth;
  const record = e && e.record;
  if (!storeIdentity(auth) || !record) return;
  const actorStoreId = relationId(auth, "store");
  const original = operation === "update" || operation === "delete" ? originalRecord(record) : null;
  const originalStoreId = original ? recordStoreId(e.app, collection, original) : "";
  if (originalStoreId && originalStoreId !== actorStoreId) return;

  const directStoreId = relationId(record, "store");
  const originalDirectStoreId = original ? relationId(original, "store") : "";
  if (original && originalDirectStoreId !== directStoreId) denyIsolation();
  if (directStoreId && directStoreId !== actorStoreId) denyIsolation();

  const relations = RELATION_COLLECTIONS[collection] || {};
  Object.keys(relations).forEach((field) => {
    relationIds(record, field).forEach((id) => {
      const related = findRecord(e.app, relations[field], id);
      if (!related) return;
      const relatedStoreId = recordStoreId(e.app, relations[field], related);
      if (relatedStoreId && relatedStoreId !== actorStoreId) denyIsolation();
    });
  });
}

function requiredProductPermissions(operation, keys) {
  if (operation === "create") {
    const result = ["catalog.products.create"];
    keys.forEach((key) => {
      const permission = productFieldPermission(key);
      if (permission) result.push(permission);
    });
    return [...new Set(result)];
  }
  if (operation === "delete") return ["catalog.products.delete"];
  const ignored = new Set(["id", "store", "product", "collectionId", "collectionName", "created", "updated"]);
  const result = [];
  keys.forEach((key) => {
    const permission = productFieldPermission(key);
    if (permission) result.push(permission);
    else if (!ignored.has(normalizedBodyKey(key))) result.push("catalog.products.edit");
  });
  if (!result.length) result.push("catalog.products.edit");
  return [...new Set(result)];
}

function requiredOrderPermissions(operation, keys, body) {
  // Status/inventory reconciliation, token issuance and physical deletion are
  // atomic private actions in pz_order_pricing. Direct collection mutations
  // must never be able to bypass those invariants, even with the matching
  // granular permission.
  if (operation === "delete") return [DENY_PERMISSION];
  if (operation === "create") return [DENY_PERMISSION];
  const result = [];
  let denied = false;
  const ignored = new Set(["id", "store", "collectionId", "collectionName", "created", "updated"]);
  const statusFields = new Set(["status", "payment_status", "delivery_status", "delivered_at"]);
  const contactFields = new Set([
    "customer_name", "customer_phone", "customer_email", "customer_address", "notes",
    "customer_notes", "admin_notes", "whatsapp_sent",
  ]);
  const shippingFields = new Set(["delivery_method", "shipping_zone", "shipping", "shipping_usd", "shipping_cup"]);
  const reviewFields = new Set([
    "review_requested_at", "review_request_count", "review_skipped_at", "review_completed_at",
  ]);
  const economicFields = new Set(["subtotal", "total", "total_usd", "usd_total"]);

  keys.map(normalizedBodyKey).forEach((key) => {
    if (ignored.has(key)) return;
    if (statusFields.has(key)) {
      denied = true;
      return;
    }
    if (key === "receipt_token" || key === "review_token" || key === "stock_deducted") {
      denied = true;
      return;
    }
    if (contactFields.has(key)) { result.push("orders.contact_customer"); return; }
    if (shippingFields.has(key)) {
      result.push("shipping.manage");
      if (["shipping", "shipping_usd", "shipping_cup"].includes(key)) result.push("orders.price_adjustment");
      return;
    }
    if (reviewFields.has(key)) { result.push("reviews.manage"); return; }
    if (economicFields.has(key)) { result.push("orders.price_adjustment"); return; }
    // Economic snapshots, ownership, identity tokens and future internal
    // fields are closed until an official action maps them explicitly.
    denied = true;
  });
  if (denied) return [DENY_PERMISSION];
  if (!result.length) {
    return [DENY_PERMISSION];
  }
  return [...new Set(result)];
}

function settingsFieldPermission(key) {
  const normalized = normalizedBodyKey(key).toLowerCase();
  if (normalized.startsWith("landing_qr_")) return "landing_qr.manage";
  if (normalized.startsWith("review_") || normalized.startsWith("reviews_") || normalized.startsWith("rating_")) {
    return "reviews.manage";
  }
  if (REVIEW_SETTINGS_FIELDS.includes(normalized)) return "reviews.manage";
  if (normalized.startsWith("gifts_public_")) return "gifts.manage";
  if (normalized.startsWith("marketing_bar_") || normalized.startsWith("promotion_") || normalized.startsWith("promotions_")) {
    return "promotions.manage";
  }
  if (normalized === "notify_expiration_alerts") return "catalog.expirations.manage";
  if (SETTINGS_META_FIELDS.includes(normalizedBodyKey(key))) return "";
  return "store.settings.manage";
}

function requiredSettingsPermissions(keys, operation, body) {
  const selected = keys.map((key) => {
    const normalized = normalizedBodyKey(key).toLowerCase();
    const activeIsDefault = body && (body.active === true || body.active === "true");
    if (normalized === "active" && operation === "create" && activeIsDefault) return "";
    return settingsFieldPermission(key);
  }).filter(Boolean);
  return [...new Set(selected.length ? selected : ["store.settings.manage"])];
}

function mutationPermissions(collection, operation, keys, body) {
  if (collection === "products" || collection === "product_variations") {
    return requiredProductPermissions(operation, keys);
  }
  if (collection === "orders") return requiredOrderPermissions(operation, keys, body);
  if (collection === "settings") return requiredSettingsPermissions(keys, operation, body);
  // Direct order-item mutations can alter economic snapshots. Store users
  // must use the canonical private endpoints instead.
  if (collection === "order_items") return [DENY_PERMISSION];
  const permission = MUTATION_PERMISSIONS[collection];
  return permission ? [permission] : [];
}

function isSafeNotificationUpdate(keys) {
  const allowed = new Set(["status", "read_at", "archived_at"]);
  return keys.length > 0 && keys.every((key) => allowed.has(normalizedBodyKey(key)));
}

function isExpirationNotification(record) {
  const type = recordString(record, "type").toLowerCase();
  const sourceType = recordString(record, "source_type").toLowerCase();
  return type.startsWith("product_expir")
    || sourceType.includes("expiration")
    || sourceType.includes("product_expir");
}

function denyInvalidNotification() {
  const message = "No se pudo crear la notificación.";
  if (typeof BadRequestError === "function") {
    throw new BadRequestError(message, {
      notification: new ValidationError("invalid_notification", message),
    });
  }
  const error = new Error("invalid_notification");
  error.code = "invalid_notification";
  throw error;
}

function sanitizePublicNotificationCreate(e) {
  const notification = e && e.record;
  if (!notification) denyInvalidNotification();
  const storeId = relationId(notification, "store");
  const store = findRecord(e.app, "stores", storeId);
  const type = recordString(notification, "type");
  const entityCollection = recordString(notification, "entity_collection");
  const entityId = recordString(notification, "entity_id");
  if (!store || !entityId) denyInvalidNotification();

  let title = "";
  let message = "";
  let priority = "normal";
  let targetUrl = "";
  let metadata = {};
  if (type === "review_pending" && entityCollection === "reviews") {
    const review = findRecord(e.app, "reviews", entityId);
    if (!review || relationId(review, "store") !== storeId || recordString(review, "status") !== "pending") {
      denyInvalidNotification();
    }
    const customer = recordString(review, "customer_name") || "Cliente";
    const rating = Math.max(1, Math.min(5, Number(recordValue(review, "rating")) || 1));
    title = "Nueva reseña pendiente";
    message = `${customer.slice(0, 120)} dejó una reseña con ${rating} estrellas.`;
    priority = "important";
    targetUrl = `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/store-settings#rating-pending`;
    metadata = { review_id: review.id, source: recordString(review, "source") || "public_review" };
  } else if (type === "review_pending" && entityCollection === "orders") {
    const order = findRecord(e.app, "orders", entityId);
    if (!order || relationId(order, "store") !== storeId) denyInvalidNotification();
    let reviews = [];
    try {
      reviews = e.app.findRecordsByFilter(
        "reviews",
        'order = {:orderId} && status = "pending"',
        "created",
        20,
        0,
        { orderId: order.id },
      ) || [];
    } catch (_) {}
    if (!reviews.length) denyInvalidNotification();
    const customer = recordString(order, "customer_name") || "Cliente";
    title = "Nueva reseña pendiente";
    message = `${customer.slice(0, 120)} dejó ${reviews.length} reseña${reviews.length === 1 ? "" : "s"} de una orden.`;
    priority = "important";
    targetUrl = `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/store-settings#rating-pending`;
    metadata = { order_id: order.id, review_count: reviews.length, source: "order_review_link" };
  } else if (type === "raffle_entry_created" && entityCollection === "raffle_entries") {
    const entry = findRecord(e.app, "raffle_entries", entityId);
    const raffle = entry ? findRecord(e.app, "raffles", relationId(entry, "raffle")) : null;
    if (!entry || !raffle || relationId(entry, "store") !== storeId || relationId(raffle, "store") !== storeId) {
      denyInvalidNotification();
    }
    const number = recordString(entry, "chosen_number");
    title = "Nueva participación en rifa";
    message = `Nueva participación en rifa: número ${number.slice(0, 2)}`;
    targetUrl = `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/promos/raffles`;
    metadata = { raffle_id: raffle.id, chosen_number: number, source: "public_raffle" };
  } else {
    denyInvalidNotification();
  }

  notification.set("title", title);
  notification.set("message", message);
  notification.set("status", "unread");
  notification.set("priority", priority);
  notification.set("target_url", targetUrl);
  notification.set("metadata_json", metadata);
}

function denyPermission(permission) {
  const message = "No tienes permiso para realizar esta acción.";
  if (typeof ForbiddenError === "function") {
    throw new ForbiddenError(message, {
      permission: new ValidationError("permission_denied", message),
    });
  }
  const error = new Error("permission_denied");
  error.code = "permission_denied";
  error.permission = permission;
  throw error;
}

function enforce(e, required, collection) {
  const auth = e && e.auth;
  if (!storeIdentity(auth)) return e.next();
  if (!storeUser(auth)) denyPermission(required[0] || "");
  const app = e.app;
  const actorStoreId = relationId(auth, "store");
  const targetStoreId = e.record ? recordStoreId(app, collection, e.record) : actorStoreId;
  // Defer cross-store/not-found responses to the existing collection rules so
  // another tenant's resource remains indistinguishable from a missing one.
  if (targetStoreId && targetStoreId !== actorStoreId) return e.next();
  const store = findRecord(app, "stores", actorStoreId);
  if (!store) return e.next();
  for (const permission of required) {
    if (!permissions.hasStorePermission(app, auth, store, permission)) denyPermission(permission);
  }
  return e.next();
}

function enforceAny(e, required, collection) {
  const auth = e && e.auth;
  if (!storeIdentity(auth)) return e.next();
  if (!storeUser(auth)) denyPermission(required[0] || "");
  const app = e.app;
  const actorStoreId = relationId(auth, "store");
  const targetStoreId = e.record ? recordStoreId(app, collection, e.record) : actorStoreId;
  if (targetStoreId && targetStoreId !== actorStoreId) return e.next();
  const store = findRecord(app, "stores", actorStoreId);
  if (!store) return e.next();
  if (!required.some((permission) => permissions.hasStorePermission(app, auth, store, permission))) {
    denyPermission(required[0] || "");
  }
  return e.next();
}

function orderReadRedactionFields(app, auth, store) {
  if (!storeUser(auth) || !store) return [];
  const hidden = [];
  if (!permissions.hasStorePermission(app, auth, store, "orders.contact_customer")) {
    hidden.push(...ORDER_CONTACT_PRIVATE_FIELDS);
  }
  if (!permissions.hasStorePermission(app, auth, store, "reviews.manage")) {
    hidden.push(...ORDER_REVIEW_PRIVATE_FIELDS);
  }
  return hidden;
}

function hidePublicFields(record, fieldNames) {
  if (!record || !fieldNames.length) return false;
  if (typeof record.hide === "function") {
    record.hide(...fieldNames);
    return true;
  }
  let changed = false;
  fieldNames.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      delete record[field];
      changed = true;
    }
  });
  return changed;
}

function expandedOrderRecords(record) {
  if (!record) return [];
  if (typeof record.expandedAll === "function") {
    try { return Array.from(record.expandedAll("order") || []).filter(Boolean); } catch (_) {}
  }
  const expanded = record.expand && record.expand.order;
  if (Array.isArray(expanded)) return expanded.filter(Boolean);
  return expanded ? [expanded] : [];
}

function eventResultRecords(e) {
  const records = [];
  if (e && e.record) records.push(e.record);
  if (e && Array.isArray(e.records)) records.push(...e.records.filter(Boolean));
  if (e && e.result && Array.isArray(e.result.items)) records.push(...e.result.items.filter(Boolean));
  return records;
}

function redactOrderRead(e, collection) {
  const auth = e && e.auth;
  if (!storeUser(auth)) return false;
  const store = findRecord(e.app, "stores", relationId(auth, "store"));
  const hidden = orderReadRedactionFields(e.app, auth, store);
  if (!hidden.length) return false;

  let changed = false;
  eventResultRecords(e).forEach((record) => {
    if (collection === "orders") {
      changed = hidePublicFields(record, hidden) || changed;
      return;
    }
    if (ORDER_EXPAND_COLLECTIONS.includes(collection)) {
      expandedOrderRecords(record).forEach((order) => {
        changed = hidePublicFields(order, hidden) || changed;
      });
    }
  });
  return changed;
}

function enforceRead(e, collection) {
  const name = collectionName(e, collection);
  const permission = READ_PERMISSIONS[name];
  const anyPermissions = READ_ANY_PERMISSIONS[name];
  const result = permission
    ? enforce(e, [permission], name)
    : (anyPermissions ? enforceAny(e, anyPermissions, name) : e.next());
  redactOrderRead(e, name);
  if (name !== "store_notifications" || !storeUser(e && e.auth)) return result;
  const store = findRecord(e.app, "stores", relationId(e.auth, "store"));
  if (!store || permissions.hasStorePermission(e.app, e.auth, store, "catalog.expirations.manage")) return result;
  if (e.record && isExpirationNotification(e.record)) denyPermission("catalog.expirations.manage");
  if (Array.isArray(e.records)) {
    e.records = e.records.filter((record) => !isExpirationNotification(record));
  }
  if (e.result && Array.isArray(e.result.items)) {
    e.result.items = e.result.items.filter((record) => !isExpirationNotification(record));
  }
  return result;
}

function enforceMutation(e, collection, operation) {
  const name = collectionName(e, collection);
  if (!e.auth && name === "store_notifications" && operation === "create") {
    sanitizePublicNotificationCreate(e);
    return e.next();
  }
  if (!storeIdentity(e && e.auth)) return e.next();
  if (!storeUser(e && e.auth)) denyPermission("");
  const keys = mutationKeys(e, name);
  const body = requestBody(e);
  assertTenantAndRelationIntegrity(e, name, operation);
  if (name === "store_analytics_events") denyPermission("analytics.view");
  if (name === "store_notifications") {
    if (operation === "create") {
      const store = findRecord(e.app, "stores", relationId(e.auth, "store"));
      if (!store || !permissions.isPrimaryAdmin(e.app, e.auth, store)) denyPermission("notifications.view");
    }
    if (operation === "update" && !isSafeNotificationUpdate(keys)) {
      denyPermission("notifications.view");
    }
    if (operation === "delete") {
      const store = findRecord(e.app, "stores", relationId(e.auth, "store"));
      if (!store || !permissions.isPrimaryAdmin(e.app, e.auth, store)) denyPermission("notifications.view");
    }
    const actorStoreId = relationId(e.auth, "store");
    const targetStoreId = e.record ? recordStoreId(e.app, name, e.record) : actorStoreId;
    if (e.record && targetStoreId === actorStoreId && isExpirationNotification(e.record)) {
      const store = findRecord(e.app, "stores", actorStoreId);
      if (!store || !permissions.hasStorePermission(e.app, e.auth, store, "catalog.expirations.manage")) {
        denyPermission("catalog.expirations.manage");
      }
    }
  }
  return enforce(e, mutationPermissions(name, operation, keys, body), name);
}

function realtimeCollectionName(topic) {
  const clean = String(topic || "").split("?", 1)[0].replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  return clean.split("/", 1)[0];
}

function hasCollectionReadAccess(app, auth, collection) {
  if (!storeIdentity(auth)) return true;
  if (!storeUser(auth) || collection === "*") return false;
  const store = findRecord(app, "stores", relationId(auth, "store"));
  if (!store) return false;
  const exact = READ_PERMISSIONS[collection];
  if (exact) return permissions.hasStorePermission(app, auth, store, exact);
  const any = READ_ANY_PERMISSIONS[collection];
  if (any) return any.some((permission) => permissions.hasStorePermission(app, auth, store, permission));
  try {
    app.findCollectionByNameOrId(collection);
    return false;
  } catch (_) {
    return true;
  }
}

function enforceRealtimeSubscribe(e) {
  const auth = e && e.auth;
  if (!storeIdentity(auth)) return e.next();
  const subscriptions = e.subscriptions;
  const length = Number(subscriptions && subscriptions.length);
  if (!Number.isInteger(length) || length < 0) denyPermission("");
  for (let index = 0; index < length; index += 1) {
    const collection = realtimeCollectionName(subscriptions[index]);
    if (!collection || !hasCollectionReadAccess(e.app, auth, collection)) {
      denyPermission(READ_PERMISSIONS[collection] || "");
    }
  }
  return e.next();
}

function realtimeAuth(e) {
  let auth = null;
  try { auth = e.client.get("auth"); } catch (_) {}
  const authId = recordString(auth, "id");
  if (!authId) return auth;
  const current = findRecord(e.app, "users", authId);
  if (!current) return null;
  let connectedTokenKey = "";
  let currentTokenKey = "";
  try { connectedTokenKey = String(auth.tokenKey() || ""); } catch (_) {
    connectedTokenKey = recordString(auth, "tokenKey");
  }
  try { currentTokenKey = String(current.tokenKey() || ""); } catch (_) {
    currentTokenKey = recordString(current, "tokenKey");
  }
  // The realtime connection keeps the auth record that completed its
  // handshake. Rotating tokenKey must therefore invalidate that already-open
  // connection as well as future HTTP refreshes.
  if (!connectedTokenKey || !currentTokenKey || connectedTokenKey !== currentTokenKey) return null;
  return current;
}

function realtimePayload(message) {
  if (!message) return null;
  let raw = message.data;
  if (typeof raw !== "string") {
    const length = Number(raw && raw.length);
    if (!Number.isInteger(length) || length < 0 || length > 1048576) return null;
    let decoded = "";
    for (let index = 0; index < length; index += 1) decoded += String.fromCharCode(Number(raw[index]) || 0);
    raw = decoded;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function enforceRealtimeMessage(e) {
  const auth = realtimeAuth(e);
  let connectedAuth = null;
  try { connectedAuth = e.client.get("auth"); } catch (_) {}
  // An anonymous connection may still receive public realtime events. An
  // authenticated connection whose live identity no longer validates (record
  // removed or tokenKey rotated) must instead stop here.
  if (!auth && recordString(connectedAuth, "id")) return;
  if (!storeIdentity(auth)) return e.next();
  const collection = realtimeCollectionName(e && e.message && e.message.name);
  if (!collection || !hasCollectionReadAccess(e.app, auth, collection)) return;
  const payload = realtimePayload(e.message);
  const record = payload && payload.record;
  if (record) {
    const actorStoreId = relationId(auth, "store");
    const targetStoreId = recordStoreId(e.app, collection, record);
    if (targetStoreId && targetStoreId !== actorStoreId) return;
    if (collection === "store_notifications") {
      const complete = record.id ? findRecord(e.app, "store_notifications", String(record.id)) : null;
      const inspected = complete || record;
      if (!recordString(inspected, "type") && !recordString(inspected, "source_type")) return;
      const store = findRecord(e.app, "stores", actorStoreId);
      if (isExpirationNotification(inspected)
        && (!store || !permissions.hasStorePermission(e.app, auth, store, "catalog.expirations.manage"))) return;
    }
  } else if (collection === "store_notifications") {
    return;
  }
  if (payload && record && ["orders", ...ORDER_EXPAND_COLLECTIONS].includes(collection)) {
    const store = findRecord(e.app, "stores", relationId(auth, "store"));
    const hidden = orderReadRedactionFields(e.app, auth, store);
    let changed = false;
    if (collection === "orders") changed = hidePublicFields(record, hidden);
    else {
      expandedOrderRecords(record).forEach((order) => {
        changed = hidePublicFields(order, hidden) || changed;
      });
    }
    if (changed) e.message.data = JSON.stringify(payload);
  }
  return e.next();
}

module.exports = {
  MUTATION_PERMISSIONS,
  PRODUCT_FIELD_PERMISSIONS,
  READ_ANY_PERMISSIONS,
  READ_PERMISSIONS,
  DENY_PERMISSION,
  ORDER_CONTACT_PRIVATE_FIELDS,
  ORDER_REVIEW_PRIVATE_FIELDS,
  bodyKeys,
  assertTenantAndRelationIntegrity,
  enforceMutation,
  enforceAny,
  enforceRead,
  enforceRealtimeMessage,
  enforceRealtimeSubscribe,
  hasCollectionReadAccess,
  mutationPermissions,
  isExpirationNotification,
  isSafeNotificationUpdate,
  mutationKeys,
  orderReadRedactionFields,
  productFieldPermission,
  recordStoreId,
  redactOrderRead,
  relationIds,
  requiredOrderPermissions,
  requiredProductPermissions,
  requiredSettingsPermissions,
  realtimeCollectionName,
  realtimeAuth,
  sanitizePublicNotificationCreate,
  settingsFieldPermission,
};
