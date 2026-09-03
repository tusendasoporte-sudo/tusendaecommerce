/// <reference path="../pb_data/types.d.ts" />

const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const commerce = typeof __hooks === "undefined"
  ? require("./pz_product_commerce_lib.js")
  : require(`${__hooks}/pz_product_commerce_lib.js`);
const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const manualCoupons = typeof __hooks === "undefined"
  ? require("./pz_manual_coupons_lib.js")
  : require(`${__hooks}/pz_manual_coupons_lib.js`);

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
  gifts: "gifts.manage",
  raffles: "raffles.manage",
  raffle_entries: "raffles.manage",
  reviews: "reviews.manage",
  store_notifications: "notifications.view",
  store_security_settings: "security.view",
  store_security_events: "security.view",
  store_security_blocks: "security.view",
  store_visitor_sessions: "security.view",
  store_customers: "security.view",
});

const READ_ALL_PERMISSIONS = Object.freeze({
  manual_coupon_usages: Object.freeze(["coupons.manage", "orders.view"]),
});

// Store users consume analytics through the aggregate endpoint. Raw events
// remain private even when the actor owns the tenant and has analytics.view.
const DENIED_STORE_READS = Object.freeze({
  store_analytics_events: "analytics.view",
});

const SECURITY_PRIVATE_COLLECTIONS = Object.freeze([
  "store_security_settings",
  "store_security_events",
  "store_security_blocks",
  "store_visitor_sessions",
  "store_customers",
]);

// C02: ni los usuarios de tienda con permiso push ni la app pública acceden
// por CRUD REST a estas tablas. Los gateways privados de C03+ usarán $app.
const STOREFRONT_PUSH_PRIVATE_COLLECTIONS = Object.freeze([
  "storefront_app_configs",
  "storefront_installations",
  "storefront_installation_diagnostics",
  "storefront_app_download_events",
  "storefront_web_sessions",
  "storefront_order_links",
  "storefront_installation_coupons",
  "push_media",
  "push_campaigns",
  "push_campaign_deliveries",
  "push_events",
  "push_daily_stats",
]);

const READ_ANY_PERMISSIONS = Object.freeze({
  settings: Object.freeze([
    "catalog.view", "orders.view", "shipping.manage", "promotions.manage", "coupons.manage",
    "gifts.manage", "raffles.manage", "reviews.manage", "notifications.view",
    "landing_qr.manage", "store.settings.manage", "security.view",
  ]),
  store_visual_items: Object.freeze(["promotions.manage", "gifts.manage", "landing_qr.manage"]),
  currencies: Object.freeze(["catalog.view", "orders.view", "store.settings.manage"]),
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
const COUPON_USAGE_CONTACT_PRIVATE_FIELDS = Object.freeze([
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_address",
]);
const PUBLIC_PRODUCT_PRIVATE_FIELDS = Object.freeze([
  "cost_usd",
  "cost_amount",
  "profit_margin",
  "internal_ref",
  "expiration_date",
  "supplier",
  "supplier_id",
  "provider",
  "provider_id",
  "vendor",
  "vendor_id",
  "proveedor",
]);
const PUBLIC_VARIATION_PRIVATE_FIELDS = Object.freeze([
  "cost_usd",
  "cost_amount",
  "internal_ref",
  "expiration_date",
  "supplier",
  "supplier_id",
  "provider",
  "provider_id",
  "vendor",
  "vendor_id",
  "proveedor",
]);
const PUBLIC_PRODUCT_QUERY_FIELDS = Object.freeze([
  "id", "store", "name", "slug", "description", "images", "image_order", "category", "subcategory",
  "base_price_usd", "regular_price_usd", "offer_price_usd", "is_offer", "stock", "track_stock",
  "allow_preorder", "featured", "featured_order", "active", "only_usd", "delivery_mode",
  "has_variations", "variation_view", "extra_info", "related_products", "created", "updated",
]);
const PUBLIC_VARIATION_QUERY_FIELDS = Object.freeze([
  "id", "product", "variation_type", "value", "price_usd", "extra_price", "image", "sort_order",
  "allow_preorder", "stock", "active", "is_offer", "offer_price_usd", "created", "updated",
]);
const PUBLIC_EXPAND_COLLECTIONS = Object.freeze({
  products: Object.freeze({ category: "categories", subcategory: "subcategories" }),
  settings: Object.freeze({ default_currency: "currencies" }),
});
const ORDER_EXPAND_COLLECTIONS = Object.freeze([
  "order_items",
  "manual_coupon_usages",
  "reviews",
]);

const RELATION_COLLECTIONS = Object.freeze({
  products: Object.freeze({ category: "categories", subcategory: "subcategories", related_products: "products", price_currency: "currencies" }),
  product_variations: Object.freeze({ product: "products", price_currency: "currencies" }),
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
  price_currency: "catalog.products.price",
  regular_price_amount: "catalog.products.price",
  price_amount: "catalog.products.price",
  offer_price_amount: "catalog.products.price",
  cost_amount: "catalog.products.price",
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
const GENERAL_PUBLIC_SETTINGS_FIELDS = Object.freeze([
  "whatsapp_number",
  "welcome_text",
  "logo_image",
]);
const PUBLIC_SETTINGS_PRIVATE_FIELDS = Object.freeze([
  "analytics_retention_days",
  "business_notes",
  "low_stock_threshold",
  "maintenance_mode",
  "order_prefix",
  "pending_order_hours",
  "product_expiring_critical_days",
  "product_expiring_days_before",
]);
const PUBLIC_SETTINGS_FUNCTIONAL_FIELDS = Object.freeze([
  "notifications_enabled",
  "notify_review_pending",
]);
const SETTINGS_QUERY_META_FIELDS = Object.freeze([
  "id", "store", "active", "collectionid", "collectionname", "created", "updated",
]);
const MARKETING_QUERY_FIELDS = Object.freeze({
  automatic_promotions: Object.freeze([
    "id", "store", "name", "active", "type", "scope", "discount_type", "discount_value",
    "buy_qty", "pay_qty", "min_qty", "min_subtotal_usd", "product", "category", "subcategory",
    "starts_at", "ends_at", "badge_text", "priority", "stackable", "created", "updated",
  ]),
  manual_coupons: Object.freeze([
    "id", "store", "code", "name", "customer_message", "active", "scope", "discount_type",
    "discount_value", "min_subtotal_usd", "product", "category", "subcategory", "starts_at",
    "ends_at", "unlimited_uses", "max_uses", "used_count", "created", "updated",
  ]),
  store_visual_items: Object.freeze([
    "id", "store", "type", "title", "description", "image", "button_text", "action_type",
    "target_url", "whatsapp_message", "category", "attachment", "sort_order", "active", "created", "updated",
  ]),
  gifts: Object.freeze([
    "id", "store", "name", "description", "image", "min_order_usd", "stock", "sort_order",
    "active", "created", "updated",
  ]),
  raffles: Object.freeze([
    "id", "store", "title", "slug", "description", "conditions", "access_code", "images",
    "prizes_json", "prizes_display_mode", "starts_at", "closes_at", "draw_at", "status",
    "winner_number", "no_winner_number", "result_published_at", "no_winner_expires_at", "finalized_at",
    "link_enabled", "show_in_store", "visible", "slot_number", "is_configured",
    "selection_manually_closed", "reset_at", "winner_message", "whatsapp_group_invite_enabled",
    "whatsapp_group_invite_url", "store_featured_prize_ids", "created", "updated",
  ]),
});
const PRODUCT_PROMOTION_TYPES = Object.freeze([
  "buy_x_pay_y",
  "volume_discount",
  "product_discount",
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

function recordBoolean(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
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

function findRecords(app, collection, filter, params) {
  const records = [];
  const batchSize = 500;
  let offset = 0;
  try {
    while (true) {
      const batch = Array.from(app.findRecordsByFilter(
        collection,
        filter,
        "sort_order,id",
        batchSize,
        offset,
        params || {},
      ) || []);
      records.push(...batch);
      if (batch.length < batchSize) break;
      offset += batch.length;
    }
    return records;
  } catch (_) { return []; }
}

function findRecordPage(app, collection, filter, sort, limit, offset, params) {
  try {
    return Array.from(app.findRecordsByFilter(
      collection,
      filter,
      sort,
      limit,
      offset,
      params || {},
    ) || []);
  } catch (_) { return []; }
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

function superuserRequest(e) {
  try {
    if (e && typeof e.hasSuperuserAuth === "function" && e.hasSuperuserAuth()) return true;
  } catch (_) {}
  try {
    const info = e && typeof e.requestInfo === "function" ? e.requestInfo() : null;
    return !!(info && typeof info.hasSuperuserAuth === "function" && info.hasSuperuserAuth());
  } catch (_) {
    return false;
  }
}

function requestQuery(e) {
  try {
    const info = e.requestInfo();
    return info && info.query && typeof info.query === "object" ? info.query : {};
  } catch (_) { return {}; }
}

function queryValue(query, key) {
  if (!query) return "";
  if (typeof query.get === "function") {
    try {
      const value = query.get(key);
      if (value !== undefined && value !== null) return value;
    } catch (_) {}
  }
  return query[key] === undefined || query[key] === null ? "" : query[key];
}

function filterQueryFields(value) {
  if (value === "" || value === null || value === undefined) return [];
  if (typeof value !== "string" || value.length > 4096) return null;
  let visible = "";
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      visible += " ";
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      visible += " ";
      continue;
    }
    visible += char;
  }
  if (quote) return null;
  const literals = new Set(["and", "false", "null", "or", "true"]);
  const fields = [];
  const matches = visible.match(/[@A-Za-z_][@A-Za-z0-9_.:]*/g) || [];
  matches.forEach((raw) => {
    const field = raw.toLowerCase();
    if (!literals.has(field) && !fields.includes(field)) fields.push(field);
  });
  return fields;
}

function sortQueryFields(value) {
  if (value === "" || value === null || value === undefined) return [];
  if (typeof value !== "string" || value.length > 1024) return null;
  const fields = [];
  for (const rawPart of value.split(",")) {
    const part = rawPart.trim();
    if (!/^[+-]?[A-Za-z_][A-Za-z0-9_]*$/.test(part)) return null;
    const field = part.replace(/^[+-]/, "").toLowerCase();
    if (!fields.includes(field)) fields.push(field);
  }
  return fields;
}

function projectionQueryFields(value) {
  if (value === "" || value === null || value === undefined) return [];
  if (typeof value !== "string" || value.length > 2048) return null;
  const fields = [];
  for (const rawPart of value.split(",")) {
    const field = rawPart.trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(field)) return null;
    if (!fields.includes(field)) fields.push(field);
  }
  return fields;
}

function expandQueryFields(value) {
  if (value === "" || value === null || value === undefined) return [];
  if (typeof value !== "string" || value.length > 1024) return null;
  const fields = [];
  for (const rawPart of value.split(",")) {
    const field = rawPart.trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(field)) return null;
    if (!fields.includes(field)) fields.push(field);
  }
  return fields;
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
  if (originalStoreId && originalStoreId !== actorStoreId) {
    if (["settings", "raffles", "raffle_entries"].includes(collection)) denyIsolation();
    return;
  }

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
  if (SETTINGS_META_FIELDS.some((field) => field.toLowerCase() === normalized)) return "";
  return "store.settings.manage";
}

function settingsReadFieldPermission(key) {
  const normalized = normalizedBodyKey(key).toLowerCase();
  if (GENERAL_PUBLIC_SETTINGS_FIELDS.includes(normalized)) return "";
  return settingsFieldPermission(key);
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
  // Coupon usage is an order-derived ledger. Only the canonical pricing
  // service may create or remove rows; store REST mutations always fail.
  if (collection === "manual_coupon_usages") return [DENY_PERMISSION];
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
  if (SECURITY_PRIVATE_COLLECTIONS.includes(collection) && !securityCapabilityAllowed(app, store)) {
    denyPermission(required[0] || "security.view");
  }
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
  if (SECURITY_PRIVATE_COLLECTIONS.includes(collection) && !securityCapabilityAllowed(app, store)) {
    denyPermission(required[0] || "security.view");
  }
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
  const append = (value) => {
    if (!value) return;
    try {
      Array.from(value).filter(Boolean).forEach((record) => records.push(record));
      return;
    } catch (_) {}
    const length = Number(value.length);
    if (!Number.isInteger(length) || length < 0) return;
    for (let index = 0; index < length; index += 1) {
      if (value[index]) records.push(value[index]);
    }
  };
  if (e) append(e.records);
  if (e && e.result) append(e.result.items);
  return records;
}

function recordCollectionName(record, fallback) {
  try { return String(record.collection().name || fallback || ""); } catch (_) {}
  const direct = recordString(record, "collectionName") || recordString(record, "collection_name");
  return direct || String(fallback || "");
}

function recordFieldNames(record) {
  try {
    const collection = record.collection();
    if (collection && collection.fields && typeof collection.fields.fieldNames === "function") {
      return Array.from(collection.fields.fieldNames() || []).map(String).filter(Boolean);
    }
  } catch (_) {}
  try {
    if (typeof record.fieldsData === "function") {
      const data = record.fieldsData();
      if (data && typeof data === "object") return Object.keys(data).filter(Boolean);
    }
  } catch (_) {}
  if (!record || typeof record !== "object") return [];
  return Object.keys(record).filter((key) => (
    key !== "expand"
    && key !== "hidden"
    && !key.startsWith("_")
    && typeof record[key] !== "function"
  ));
}

function expandedEntries(record) {
  const entries = [];
  if (!record || typeof record !== "object") return entries;
  let expanded = record.expand;
  if (typeof expanded === "function") {
    try { expanded = record.expand(); } catch (_) { expanded = null; }
  }
  if (expanded && typeof expanded === "object") {
    Object.keys(expanded).forEach((field) => {
      const value = expanded[field];
      const records = Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []);
      if (records.length) entries.push({ field, records });
    });
  }
  if (typeof record.expandedAll === "function") {
    recordFieldNames(record).forEach((field) => {
      try {
        const values = Array.from(record.expandedAll(field) || []).filter(Boolean);
        const known = entries.find((entry) => entry.field === field);
        if (known) {
          values.forEach((value) => {
            if (!known.records.includes(value)) known.records.push(value);
          });
        } else if (values.length) entries.push({ field, records: values });
      } catch (_) {}
    });
  }
  return entries;
}

function expandedChildren(record) {
  const children = [];
  expandedEntries(record).forEach((entry) => {
    entry.records.forEach((value) => {
      if (!children.includes(value)) children.push(value);
    });
  });
  return children;
}

function walkRecordTree(record, fallbackCollection, visitor, seen) {
  if (!record || typeof record !== "object") return;
  const inspected = seen || [];
  if (inspected.includes(record)) return;
  inspected.push(record);
  visitor(record, recordCollectionName(record, fallbackCollection));
  expandedChildren(record).forEach((child) => walkRecordTree(child, "", visitor, inspected));
}

function redactSettingsRecord(app, auth, record) {
  if (!storeUser(auth) || !record) return false;
  const store = findRecord(app, "stores", relationId(auth, "store"));
  if (!store) return false;
  const effective = permissions.resolveEffectiveStorePermissions(app, auth, store);
  const allowed = new Set(effective);
  const hidden = recordFieldNames(record).filter((field) => {
    const required = settingsReadFieldPermission(field);
    return required && !allowed.has(required);
  });
  return hidePublicFields(record, hidden);
}

function isPublicSettingsPrivateField(field) {
  const normalized = normalizedBodyKey(field).toLowerCase();
  if (PUBLIC_SETTINGS_FUNCTIONAL_FIELDS.includes(normalized)) return false;
  return PUBLIC_SETTINGS_PRIVATE_FIELDS.includes(normalized)
    || normalized.startsWith("notify_")
    || normalized.startsWith("notification_");
}

function activeStoreSettings(app, storeId) {
  if (!storeId) return null;
  return findRecordPage(
    app,
    "settings",
    "store = {:store} && active = true",
    "-updated,-created",
    1,
    0,
    { store: storeId },
  )[0] || null;
}

function landingQrCapabilityAllowed(store) {
  return !!store && capabilities.hasStoreCapability(
    store,
    "landing_qr_enabled",
    { enforceExpiration: true },
  );
}

function securityCapabilityAllowed(app, store) {
  return !!store && capabilities.hasStoreCapability(
    store,
    "security_enabled",
    { app, enforceExpiration: true },
  );
}

function landingQrPublicAvailable(app, storeOrId, settingsRecord) {
  const store = typeof storeOrId === "string" ? findRecord(app, "stores", storeOrId) : storeOrId;
  if (!landingQrCapabilityAllowed(store)) return false;
  const settings = settingsRecord || activeStoreSettings(app, recordString(store, "id"));
  return !!settings && recordBoolean(settings, "landing_qr_enabled");
}

function isLandingQrSettingsField(field) {
  return normalizedBodyKey(field).toLowerCase().startsWith("landing_qr_");
}

function redactAnonymousSettingsRecord(app, record) {
  if (!record) return false;
  const storeId = relationId(record, "store");
  const landingAvailable = landingQrPublicAvailable(app, storeId, record);
  const hidden = recordFieldNames(record).filter((field) =>
    isPublicSettingsPrivateField(field)
    || (!landingAvailable && isLandingQrSettingsField(field)));
  return hidePublicFields(record, hidden);
}

function redactSettingsRead(e, collection) {
  const auth = e && e.auth;
  let changed = false;
  eventResultRecords(e).forEach((record) => {
    walkRecordTree(record, collection, (candidate, name) => {
      if (name !== "settings") return;
      if (publicProductConsumer(auth)) changed = redactAnonymousSettingsRecord(e.app, candidate) || changed;
      else if (storeUser(auth)) changed = redactSettingsRecord(e.app, auth, candidate) || changed;
    });
  });
  return changed;
}

function publicProductConsumer(auth) {
  if (!auth) return true;
  return recordString(auth, "role") === "customer";
}

function redactPublicProductRecord(record, collection) {
  if (collection === "products") return hidePublicFields(record, PUBLIC_PRODUCT_PRIVATE_FIELDS);
  if (collection === "product_variations") return hidePublicFields(record, PUBLIC_VARIATION_PRIVATE_FIELDS);
  return false;
}

function redactPublicProductRead(e, collection) {
  if (!publicProductConsumer(e && e.auth)) return false;
  let changed = false;
  eventResultRecords(e).forEach((record) => {
    walkRecordTree(record, collection, (candidate, name) => {
      changed = redactPublicProductRecord(candidate, name) || changed;
    });
  });
  return changed;
}

function publicProductContext(app, collection, record, cache) {
  if (!app || !record || !["products", "product_variations"].includes(collection)) return null;
  const product = collection === "products"
    ? record
    : findRecord(app, "products", relationId(record, "product"));
  if (!product) return null;
  const cacheKey = recordString(product, "id");
  if (cache && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (collection === "product_variations"
      && !cached.variations.some((variation) => recordString(variation, "id") === recordString(record, "id"))) {
      cached.variations.push(record);
    }
    return cached;
  }
  const store = findRecord(app, "stores", relationId(product, "store"));
  if (!store) return null;
  const productId = cacheKey;
  const variations = findRecords(app, "product_variations", "product = {:product}", { product: productId });
  if (collection === "product_variations"
    && !variations.some((variation) => recordString(variation, "id") === recordString(record, "id"))) {
    variations.push(record);
  }
  const categoryId = relationId(product, "category");
  const subcategoryId = relationId(product, "subcategory");
  const context = {
    product,
    store,
    variations,
    category: categoryId ? findRecord(app, "categories", categoryId) : null,
    subcategory: subcategoryId ? findRecord(app, "subcategories", subcategoryId) : null,
  };
  if (cache) cache.set(cacheKey, context);
  return context;
}

function publicProductRecordAvailable(app, collection, record, now, cache) {
  const context = publicProductContext(app, collection, record, cache);
  if (!context) return false;
  const units = commerce.buildProductUnits(context.product, context.variations);
  const candidates = collection === "products"
    ? units
    : units.filter((unit) => unit.variation_id === recordString(record, "id"));
  return candidates.some((unit) => {
    const availability = commerce.evaluateUnitAvailability({
      store: context.store,
      product: context.product,
      variations: context.variations,
      unit,
      category: context.category,
      subcategory: context.subcategory,
      quantity: 1,
      now,
    });
    // Agotado no equivale a oculto: la lectura pública conserva la unidad
    // para mostrar "Agotado", mientras checkout sigue rechazándola mediante
    // evaluateUnitAvailability con reason=stock_unavailable.
    return availability.available || availability.reason === "stock_unavailable";
  });
}

function productScopedPromotion(record) {
  const type = recordString(record, "type").toLowerCase();
  const scope = recordString(record, "scope").toLowerCase();
  if (type === "cart_subtotal_discount" || scope === "cart") return false;
  return scope === "product" || PRODUCT_PROMOTION_TYPES.includes(type);
}

function publicPromotionRecordAvailable(app, record, now, cache) {
  if (!record || recordValue(record, "active") === false) return false;
  if (!productScopedPromotion(record)) return true;
  const product = findRecord(app, "products", relationId(record, "product"));
  if (!product) return false;
  const promotionStoreId = relationId(record, "store");
  if (!promotionStoreId || promotionStoreId !== relationId(product, "store")) return false;
  return publicProductRecordAvailable(app, "products", product, now, cache);
}

function publicListCandidates(e, collection) {
  const query = requestQuery(e);
  const rawFilter = String(queryValue(query, "filter") || "").trim();
  const rawSort = String(queryValue(query, "sort") || "").trim();
  const filter = rawFilter ? `(${rawFilter}) && active = true` : "active = true";
  const sort = rawSort || "-created";
  const records = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const batch = findRecordPage(e.app, collection, filter, sort, batchSize, offset);
    records.push(...batch);
    if (batch.length < batchSize) break;
  }
  return records;
}

function applyRequestedExpands(e, records) {
  if (!records.length || !e.app || typeof e.app.expandRecords !== "function") return;
  const raw = String(queryValue(requestQuery(e), "expand") || "").trim();
  if (!raw) return;
  const expands = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (!expands.length) return;
  try { e.app.expandRecords(records, expands); } catch (_) {}
}

function setPublicUnavailableHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  } catch (_) {}
}

function enforcePublicProductReadCachePolicy(e) {
  const request = e && e.request;
  const method = String(request && request.method || "").toUpperCase();
  const path = String(request && request.url && request.url.path || "");
  const isPublicProductRead = /^\/api\/collections\/(products|product_variations)\/records(?:\/[a-zA-Z0-9_-]+)?\/?$/.test(path);
  if (method === "GET" && isPublicProductRead) {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
  }
  return e.next();
}

function enforceRaffleFileCachePolicy(e) {
  const request = e && e.request;
  const method = String(request && request.method || "").toUpperCase();
  const path = String(request && request.url && request.url.path || "");
  if (method === "GET" && /^\/api\/files\/raffles\/[a-zA-Z0-9_-]+\//.test(path)) {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return e.next();
}

function respondPublicUnavailable(e) {
  const payload = {
    code: 404,
    message: "The requested resource wasn't found.",
    data: {},
  };
  setPublicUnavailableHeaders(e);
  if (e && typeof e.json === "function") {
    e.json(404, payload);
    return true;
  }
  denyIsolation();
  return true;
}

function filterPublicProductRead(e, collection) {
  if (!publicProductConsumer(e && e.auth) || !["products", "product_variations"].includes(collection)) return false;
  const now = new Date();
  const cache = new Map();
  const available = (record) => publicProductRecordAvailable(e.app, collection, record, now, cache);
  if (e.record && !available(e.record)) {
    return respondPublicUnavailable(e);
  }
  if (e.result && Array.isArray(e.result.items)
    && Number.isInteger(Number(e.result.page)) && Number.isInteger(Number(e.result.perPage))) {
    const page = Math.max(1, Number(e.result.page));
    const perPage = Math.max(1, Number(e.result.perPage));
    const filtered = publicListCandidates(e, collection).filter(available);
    const items = filtered.slice((page - 1) * perPage, page * perPage);
    applyRequestedExpands(e, items);
    e.result.items = items;
    e.result.totalItems = filtered.length;
    e.result.totalPages = Math.ceil(filtered.length / perPage);
    e.records = items;
    return false;
  }
  if (Array.isArray(e.records)) e.records = e.records.filter(available);
  if (e.result && Array.isArray(e.result.items)) e.result.items = e.result.items.filter(available);
  return false;
}

function filterPublicPromotionRead(e, collection) {
  if (!publicProductConsumer(e && e.auth) || collection !== "automatic_promotions") return false;
  const now = new Date();
  const cache = new Map();
  const available = (record) => publicPromotionRecordAvailable(e.app, record, now, cache);
  if (e.record && !available(e.record)) {
    return respondPublicUnavailable(e);
  }
  if (e.result && Array.isArray(e.result.items)
    && Number.isInteger(Number(e.result.page)) && Number.isInteger(Number(e.result.perPage))) {
    const page = Math.max(1, Number(e.result.page));
    const perPage = Math.max(1, Number(e.result.perPage));
    const filtered = publicListCandidates(e, collection).filter(available);
    const items = filtered.slice((page - 1) * perPage, page * perPage);
    applyRequestedExpands(e, items);
    e.result.items = items;
    e.result.totalItems = filtered.length;
    e.result.totalPages = Math.ceil(filtered.length / perPage);
    e.records = items;
    return false;
  }
  if (Array.isArray(e.records)) e.records = e.records.filter(available);
  if (e.result && Array.isArray(e.result.items)) e.result.items = e.result.items.filter(available);
  return false;
}

function removeExpansion(record, field) {
  let changed = false;
  let expanded = record && record.expand;
  if (typeof expanded === "function") {
    try {
      expanded = record.expand();
      if (expanded && Object.prototype.hasOwnProperty.call(expanded, field)
        && typeof record.setExpand === "function") {
        delete expanded[field];
        record.setExpand(expanded);
        changed = true;
      }
    } catch (_) {}
  } else if (expanded && Object.prototype.hasOwnProperty.call(expanded, field)) {
    delete expanded[field];
    changed = true;
  }
  // Older runtimes without setExpand cannot surgically remove an expanded
  // child, so fail closed by hiding its relation field as a last resort.
  return changed ? true : hidePublicFields(record, [field]);
}

function redactPublicRestrictedExpansions(record, collection, seen) {
  if (!record || typeof record !== "object") return false;
  const inspected = seen || [];
  if (inspected.includes(record)) return false;
  inspected.push(record);
  const allowed = PUBLIC_EXPAND_COLLECTIONS[collection] || {};
  let changed = false;
  expandedEntries(record).forEach((entry) => {
    const childCollection = allowed[entry.field];
    const invalid = !childCollection || entry.records.some((child) => {
      const actual = recordCollectionName(child, childCollection);
      return actual !== childCollection;
    });
    if (invalid) {
      changed = removeExpansion(record, entry.field) || changed;
      return;
    }
    entry.records.forEach((child) => {
      changed = redactPublicRestrictedExpansions(child, childCollection, inspected) || changed;
    });
  });
  return changed;
}

function collectionReadAllowed(allowed, collection) {
  if (DENIED_STORE_READS[collection]) return false;
  const all = READ_ALL_PERMISSIONS[collection];
  if (all) return all.every((permission) => allowed.has(permission));
  const exact = READ_PERMISSIONS[collection];
  if (exact) return allowed.has(exact);
  const any = READ_ANY_PERMISSIONS[collection];
  if (any) return any.some((permission) => allowed.has(permission));
  // Expansions are an opt-in surface. An unclassified child collection must
  // never inherit the parent collection's permission implicitly.
  return false;
}

function redactRestrictedExpansions(e, collection) {
  const auth = e && e.auth;
  if (!storeUser(auth)) return false;
  const store = findRecord(e.app, "stores", relationId(auth, "store"));
  if (!store) return false;
  const allowed = new Set(permissions.resolveEffectiveStorePermissions(e.app, auth, store));
  const seen = [];
  let changed = false;
  const inspect = (record, fallback) => {
    if (!record || typeof record !== "object" || seen.includes(record)) return;
    seen.push(record);
    expandedEntries(record).forEach((entry) => {
      const restricted = entry.records.some((child) => {
        const name = recordCollectionName(child, "");
        return !!name && !collectionReadAllowed(allowed, name);
      });
      if (restricted) {
        changed = removeExpansion(record, entry.field) || changed;
        return;
      }
      entry.records.forEach((child) => inspect(child, recordCollectionName(child, fallback)));
    });
  };
  eventResultRecords(e).forEach((record) => inspect(record, collection));
  return changed;
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

function redactCouponUsageRead(e, collection) {
  const auth = e && e.auth;
  if (!storeUser(auth)) return false;
  const store = findRecord(e.app, "stores", relationId(auth, "store"));
  if (!store) return false;
  const effective = permissions.resolveEffectiveStorePermissions(e.app, auth, store);
  if (effective.includes("orders.contact_customer")) return false;
  let changed = false;
  eventResultRecords(e).forEach((record) => {
    walkRecordTree(record, collection, (candidate, name) => {
      if (name === "manual_coupon_usages") {
        changed = hidePublicFields(candidate, COUPON_USAGE_CONTACT_PRIVATE_FIELDS) || changed;
      }
    });
  });
  return changed;
}

function fieldPathContains(field, restrictedFields) {
  const restricted = new Set(restrictedFields.map((value) => String(value).toLowerCase()));
  return String(field || "").toLowerCase().split(/[.:]/).some((part) => restricted.has(part));
}

function unreadableRelationTraversal(field, collection, allowed) {
  const normalized = String(field || "").toLowerCase();
  if (!normalized.includes(".") && !normalized.includes(":")) return false;
  const root = normalized.split(/[.:]/, 1)[0];
  const childCollection = RELATION_COLLECTIONS[collection] && RELATION_COLLECTIONS[collection][root];
  return !childCollection || !collectionReadAllowed(allowed, childCollection);
}

function assertSafeReadQuery(e, collection) {
  const auth = e && e.auth;
  const isPublic = publicProductConsumer(auth);
  const isStore = storeUser(auth);
  const marketingFields = MARKETING_QUERY_FIELDS[collection];
  let store = null;
  let effective = [];
  let primary = false;
  if (isStore) {
    store = findRecord(e.app, "stores", relationId(auth, "store"));
    if (store) {
      effective = permissions.resolveEffectiveStorePermissions(e.app, auth, store);
      primary = permissions.isPrimaryAdmin(e.app, auth, store);
    }
  }
  const settingsGuarded = collection === "settings" && (isPublic || isStore);
  const ordersGuarded = isStore && collection === "orders" && store
    && (!effective.includes("orders.contact_customer") || !effective.includes("reviews.manage"));
  const usageGuarded = isStore && collection === "manual_coupon_usages" && store
    && !effective.includes("orders.contact_customer");
  const relatedOrderGuarded = isStore && store && !primary
    && ["order_items", "reviews"].includes(collection);
  const guarded = settingsGuarded
    || (isStore && !!marketingFields && !primary)
    || ordersGuarded
    || usageGuarded
    || relatedOrderGuarded
    || (isPublic && ["products", "product_variations", "automatic_promotions"].includes(collection));
  if (!guarded) return true;

  const query = requestQuery(e);
  const filterFields = filterQueryFields(queryValue(query, "filter"));
  const sortFields = sortQueryFields(queryValue(query, "sort"));
  const projectionFields = projectionQueryFields(queryValue(query, "fields"));
  const expandFields = expandQueryFields(queryValue(query, "expand"));
  if (!filterFields || !sortFields || !projectionFields || !expandFields) denyPermission("query.restricted");
  const referenced = [...new Set([...filterFields, ...sortFields, ...projectionFields])];

  if (collection === "settings") {
    if (isStore) {
      const allowed = new Set(effective);
      const queryable = (field) => {
        if (field.includes(".") || field.includes(":")) return false;
        if (SETTINGS_QUERY_META_FIELDS.includes(field)) return true;
        const required = settingsReadFieldPermission(field);
        return !required || allowed.has(required);
      };
      const expandsAllowed = expandFields.every((field) =>
        field === "default_currency" && allowed.has("store.settings.manage"));
      if (!expandsAllowed || referenced.some((field) => !queryable(field))) {
        denyPermission("query.restricted");
      }
    } else if (isPublic) {
      if (referenced.some((field) => (
        field.includes(".")
        || field.includes(":")
        || isPublicSettingsPrivateField(field)
      )) || expandFields.some((field) => field !== "default_currency")) {
        denyPermission("query.restricted");
      }
    }
  }

  if ((isStore && marketingFields && !primary)
    || (isPublic && collection === "automatic_promotions")) {
    if (expandFields.length
      || referenced.some((field) => !marketingFields.includes(field))) {
      denyPermission("query.restricted");
    }
  }

  if (isStore && collection === "orders" && store) {
    const restricted = [];
    if (!effective.includes("orders.contact_customer")) restricted.push(...ORDER_CONTACT_PRIVATE_FIELDS);
    if (!effective.includes("reviews.manage")) restricted.push(...ORDER_REVIEW_PRIVATE_FIELDS);
    if (referenced.some((field) => (
      field.includes(".")
      || field.includes(":")
      || fieldPathContains(field, restricted)
    ))) {
      denyPermission("query.restricted");
    }
  }

  if (relatedOrderGuarded) {
    const restricted = [];
    if (!effective.includes("orders.contact_customer")) restricted.push(...ORDER_CONTACT_PRIVATE_FIELDS);
    if (!effective.includes("reviews.manage")) restricted.push(...ORDER_REVIEW_PRIVATE_FIELDS);
    const allowed = new Set(effective);
    if (referenced.some((field) => (
      field.includes(":")
      || field.split(".").length > 2
      || fieldPathContains(field, restricted)
      || unreadableRelationTraversal(field, collection, allowed)
    ))) denyPermission("query.restricted");
  }

  if (isStore && collection === "manual_coupon_usages" && store
    && !effective.includes("orders.contact_customer")) {
    if (referenced.some((field) => (
      field.includes(".")
      || field.includes(":")
      || fieldPathContains(field, COUPON_USAGE_CONTACT_PRIVATE_FIELDS)
    ))) denyPermission("query.restricted");
  }

  if (isPublic && collection === "products"
    && (referenced.some((field) => !PUBLIC_PRODUCT_QUERY_FIELDS.includes(field))
      || expandFields.some((field) => !["category", "subcategory"].includes(field)))) {
    denyPermission("query.restricted");
  }
  if (isPublic && collection === "product_variations"
    && (referenced.some((field) => !PUBLIC_VARIATION_QUERY_FIELDS.includes(field))
      || expandFields.length)) {
    denyPermission("query.restricted");
  }
  return true;
}

function enforceRead(e, collection) {
  const name = collectionName(e, collection);
  if (STOREFRONT_PUSH_PRIVATE_COLLECTIONS.includes(name) && !superuserRequest(e)) {
    denyPermission("marketing.push.manage");
  }
  if (publicProductConsumer(e && e.auth) && ["raffles", "raffle_entries"].includes(name)) {
    return respondPublicUnavailable(e);
  }
  assertSafeReadQuery(e, name);
  const deniedPermission = DENIED_STORE_READS[name];
  if (deniedPermission && storeIdentity(e && e.auth)) denyPermission(deniedPermission);
  // RecordsListRequestEvent/RecordViewRequestEvent already contain the records
  // selected by PocketBase.  The default handler serializes them during
  // e.next(), so public commercial filtering must happen before advancing the
  // hook chain; mutating e.result/e.records afterwards is too late for HTTP.
  if (filterPublicProductRead(e, name)) return;
  if (filterPublicPromotionRead(e, name)) return;
  const permission = READ_PERMISSIONS[name];
  const allPermissions = READ_ALL_PERMISSIONS[name];
  const anyPermissions = READ_ANY_PERMISSIONS[name];
  const result = allPermissions
    ? enforce(e, allPermissions, name)
    : (permission
      ? enforce(e, [permission], name)
      : (anyPermissions ? enforceAny(e, anyPermissions, name) : e.next()));
  redactRestrictedExpansions(e, name);
  redactOrderRead(e, name);
  redactCouponUsageRead(e, name);
  redactSettingsRead(e, name);
  redactPublicProductRead(e, name);
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

function enrichAuth(e) {
  let info = e && e.requestInfo;
  if (typeof info === "function") {
    try { info = info(); } catch (_) { info = null; }
  }
  return info && info.auth || null;
}

// Request hooks are the authorization boundary. RecordEnrich is the reliable
// PocketBase serialization boundary for per-field redaction (list, view,
// mutation responses, expands and realtime). Apply the same redactors here
// before e.next(), as required by PocketBase's enrich lifecycle.
function enforceEnrich(e, collection) {
  const name = collectionName(e, collection);
  const context = {
    app: e && e.app,
    auth: enrichAuth(e),
    record: e && e.record,
  };
  if (publicProductConsumer(context.auth)) {
    redactPublicRestrictedExpansions(context.record, name);
  }
  redactRestrictedExpansions(context, name);
  redactOrderRead(context, name);
  redactCouponUsageRead(context, name);
  redactSettingsRead(context, name);
  redactPublicProductRead(context, name);
  return e.next();
}

function enforceMutation(e, collection, operation) {
  const name = collectionName(e, collection);
  if (name === "manual_coupons" && ["create", "update"].includes(operation)) {
    const safe = manualCoupons.normalizeCouponRecord(e && e.record);
    if (safe) manualCoupons.raiseCouponRequestError(safe);
  }
  if (STOREFRONT_PUSH_PRIVATE_COLLECTIONS.includes(name) && !superuserRequest(e)) {
    denyPermission("marketing.push.manage");
  }
  if (!e.auth && name === "store_notifications" && operation === "create") {
    sanitizePublicNotificationCreate(e);
    return e.next();
  }
  if (!storeIdentity(e && e.auth)) {
    if (superuserRequest(e)) return e.next();
    if (["raffles", "raffle_entries"].includes(name)) denyIsolation();
    if (name === "store_analytics_events" && operation === "create") {
      assertPublicAnalyticsEventAllowed(e);
    }
    return e.next();
  }
  if (!storeUser(e && e.auth)) denyPermission("");
  const keys = mutationKeys(e, name);
  const body = requestBody(e);
  assertTenantAndRelationIntegrity(e, name, operation);
  if (name === "store_analytics_events") denyPermission("analytics.view");
  if (name === "manual_coupon_usages") denyPermission("coupons.manage");
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
  const result = enforce(e, mutationPermissions(name, operation, keys, body), name);
  if (name === "settings") redactSettingsRead(e, name);
  return result;
}

function isLandingQrAnalyticsEvent(record) {
  const eventType = recordString(record, "event_type").toLowerCase();
  const pageType = recordString(record, "page_type").toLowerCase();
  return eventType === "landing_qr_view"
    || eventType === "landing_qr_click"
    || pageType === "landing_qr";
}

function assertPublicAnalyticsEventAllowed(e) {
  const record = e && e.record;
  if (!record || !isLandingQrAnalyticsEvent(record)) return true;
  const storeId = relationId(record, "store");
  const store = findRecord(e.app, "stores", storeId);
  if (!store || !landingQrPublicAvailable(e.app, store)) denyIsolation();

  const slug = recordString(store, "slug");
  const canonicalPath = slug ? `/t/${encodeURIComponent(slug)}/links` : "";
  const path = recordString(record, "path");
  const pageType = recordString(record, "page_type").toLowerCase();
  const entityType = recordString(record, "entity_type").toLowerCase();
  const entityId = relationId(record, "entity_id") || recordString(record, "entity_id");
  if (pageType !== "landing_qr"
    || entityType !== "landing_qr"
    || entityId !== storeId
    || (path !== canonicalPath && path !== "/links")) {
    denyIsolation();
  }
  return true;
}

function rafflesCapabilityAllowed(store) {
  return !!store && capabilities.hasStoreCapability(
    store,
    "raffles_enabled",
    { enforceExpiration: true },
  );
}

function publicRaffleAvailable(raffle, store) {
  if (!raffle || !store || recordString(store, "status") !== "active") return false;
  return rafflesCapabilityAllowed(store)
    && relationId(raffle, "store") === recordString(store, "id")
    && ["rifa-1", "rifa-2", "rifa-3"].includes(recordString(raffle, "slug"))
    && recordBoolean(raffle, "is_configured")
    && recordBoolean(raffle, "link_enabled")
    && recordString(raffle, "status") !== "archived";
}

function enforceFileDownload(e) {
  const collection = collectionName(e, "");
  const fieldName = String(e && e.fileField && e.fileField.name || "").trim();
  const landingQrFile = collection === "settings" && fieldName === "landing_qr_hero_image";
  const raffleFile = collection === "raffles" && fieldName === "images";
  if (!landingQrFile && !raffleFile) return e.next();
  if (superuserRequest(e)) return e.next();
  const record = e && e.record;
  const storeId = recordStoreId(e.app, collection, record);
  const store = findRecord(e.app, "stores", storeId);
  const auth = e && e.auth;
  const available = landingQrFile
    ? landingQrCapabilityAllowed(store)
    : (storeIdentity(auth) ? rafflesCapabilityAllowed(store) : publicRaffleAvailable(record, store));
  if (!available) {
    return respondPublicUnavailable(e);
  }

  if (storeIdentity(auth)) {
    if (!storeUser(auth) || relationId(auth, "store") !== storeId) {
      return respondPublicUnavailable(e);
    }
    const permission = landingQrFile ? "landing_qr.manage" : "raffles.manage";
    if (!permissions.hasStorePermission(e.app, auth, store, permission)) {
      denyPermission(permission);
    }
  }
  return e.next();
}

function realtimeCollectionName(topic) {
  const clean = String(topic || "").split("?", 1)[0].replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  return clean.split("/", 1)[0];
}

function realtimeTopicQuery(topic) {
  const value = String(topic || "");
  const question = value.indexOf("?");
  if (question < 0) return {};
  const raw = value.slice(question + 1);
  if (!raw || raw.length > 2048 || raw.includes("#")) return null;
  const query = {};
  for (const pair of raw.split("&")) {
    if (!pair) return null;
    const equals = pair.indexOf("=");
    const rawKey = equals < 0 ? pair : pair.slice(0, equals);
    const rawValue = equals < 0 ? "" : pair.slice(equals + 1);
    let key = "";
    let decoded = "";
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " ")).trim().toLowerCase();
      decoded = decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch (_) {
      return null;
    }
    if (!["expand", "fields"].includes(key) || Object.prototype.hasOwnProperty.call(query, key)) return null;
    query[key] = decoded;
  }
  return query;
}

function hasCollectionReadAccess(app, auth, collection) {
  if (!storeIdentity(auth)) return true;
  if (!storeUser(auth) || collection === "*") return false;
  if (DENIED_STORE_READS[collection]) return false;
  const store = findRecord(app, "stores", relationId(auth, "store"));
  if (!store) return false;
  if (SECURITY_PRIVATE_COLLECTIONS.includes(collection) && !securityCapabilityAllowed(app, store)) return false;
  const all = READ_ALL_PERMISSIONS[collection];
  if (all) return all.every((permission) => permissions.hasStorePermission(app, auth, store, permission));
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
  const storeActor = !!storeIdentity(auth);
  const publicActor = publicProductConsumer(auth);
  if (!storeActor && !publicActor) return e.next();
  const subscriptions = e.subscriptions;
  const length = Number(subscriptions && subscriptions.length);
  if (!Number.isInteger(length) || length < 0) denyPermission("");
  for (let index = 0; index < length; index += 1) {
    const topic = subscriptions[index];
    const collection = realtimeCollectionName(topic);
    if (publicActor && ["raffles", "raffle_entries"].includes(collection)) {
      denyPermission("query.restricted");
    }
    if (!collection || (storeActor && !hasCollectionReadAccess(e.app, auth, collection))) {
      denyPermission(
        DENIED_STORE_READS[collection]
        || (READ_ALL_PERMISSIONS[collection] && READ_ALL_PERMISSIONS[collection][0])
        || READ_PERMISSIONS[collection]
        || "",
      );
    }
    const query = realtimeTopicQuery(topic);
    if (!query || (collection === "*" && Object.keys(query).length)) denyPermission("query.restricted");
    assertSafeReadQuery({
      app: e.app,
      auth,
      requestInfo: () => ({ query }),
    }, collection);
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
  const collection = realtimeCollectionName(e && e.message && e.message.name);
  if (!storeIdentity(auth)) {
    if (["raffles", "raffle_entries"].includes(collection)) return;
    const publicPayload = realtimePayload(e.message);
    const publicRecord = publicPayload && publicPayload.record;
    let publicChanged = false;
    if (publicRecord && publicProductConsumer(auth)) {
      if (["products", "product_variations"].includes(collection)) {
        const canonical = findRecord(e.app, collection, recordString(publicRecord, "id"));
        if (!canonical || !publicProductRecordAvailable(e.app, collection, canonical, new Date())) return;
      } else if (collection === "automatic_promotions") {
        const canonical = findRecord(e.app, collection, recordString(publicRecord, "id"));
        if (!canonical || !publicPromotionRecordAvailable(e.app, canonical, new Date())) return;
      }
      publicChanged = redactPublicRestrictedExpansions(publicRecord, collection) || publicChanged;
      walkRecordTree(publicRecord, collection, (candidate, name) => {
        publicChanged = redactPublicProductRecord(candidate, name) || publicChanged;
        if (name === "settings") {
          publicChanged = redactAnonymousSettingsRecord(e.app, candidate) || publicChanged;
        }
      });
    }
    if (publicChanged) e.message.data = JSON.stringify(publicPayload);
    return e.next();
  }
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
  if (payload && record && redactRestrictedExpansions({ app: e.app, auth, record }, collection)) {
    e.message.data = JSON.stringify(payload);
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
  if (payload && record) {
    let settingsChanged = false;
    walkRecordTree(record, collection, (candidate, name) => {
      if (name === "settings") {
        settingsChanged = redactSettingsRecord(e.app, auth, candidate) || settingsChanged;
      }
    });
    settingsChanged = redactCouponUsageRead({ app: e.app, auth, record }, collection) || settingsChanged;
    if (settingsChanged) e.message.data = JSON.stringify(payload);
  }
  return e.next();
}

module.exports = {
  COUPON_USAGE_CONTACT_PRIVATE_FIELDS,
  DENIED_STORE_READS,
  MUTATION_PERMISSIONS,
  PRODUCT_FIELD_PERMISSIONS,
  PUBLIC_PRODUCT_PRIVATE_FIELDS,
  PUBLIC_SETTINGS_PRIVATE_FIELDS,
  PUBLIC_VARIATION_PRIVATE_FIELDS,
  SECURITY_PRIVATE_COLLECTIONS,
  STOREFRONT_PUSH_PRIVATE_COLLECTIONS,
  READ_ALL_PERMISSIONS,
  READ_ANY_PERMISSIONS,
  READ_PERMISSIONS,
  DENY_PERMISSION,
  ORDER_CONTACT_PRIVATE_FIELDS,
  ORDER_REVIEW_PRIVATE_FIELDS,
  MARKETING_QUERY_FIELDS,
  bodyKeys,
  collectionReadAllowed,
  assertSafeReadQuery,
  assertTenantAndRelationIntegrity,
  enforceMutation,
  enforceFileDownload,
  enforceEnrich,
  enforceAny,
  enforceRead,
  enforceRealtimeMessage,
  enforceRealtimeSubscribe,
  enforcePublicProductReadCachePolicy,
  enforceRaffleFileCachePolicy,
  filterPublicPromotionRead,
  filterPublicProductRead,
  hasCollectionReadAccess,
  mutationPermissions,
  isExpirationNotification,
  isSafeNotificationUpdate,
  mutationKeys,
  orderReadRedactionFields,
  productFieldPermission,
  publicProductRecordAvailable,
  publicPromotionRecordAvailable,
  filterQueryFields,
  sortQueryFields,
  recordStoreId,
  redactPublicProductRead,
  redactPublicRestrictedExpansions,
  redactCouponUsageRead,
  redactAnonymousSettingsRecord,
  redactRestrictedExpansions,
  redactSettingsRead,
  redactSettingsRecord,
  redactOrderRead,
  relationIds,
  requiredOrderPermissions,
  requiredProductPermissions,
  requiredSettingsPermissions,
  realtimeCollectionName,
  realtimeTopicQuery,
  realtimeAuth,
  sanitizePublicNotificationCreate,
  settingsReadFieldPermission,
  settingsFieldPermission,
  activeStoreSettings,
  assertPublicAnalyticsEventAllowed,
  isLandingQrAnalyticsEvent,
  landingQrCapabilityAllowed,
  landingQrPublicAvailable,
  securityCapabilityAllowed,
  rafflesCapabilityAllowed,
  publicRaffleAvailable,
};
