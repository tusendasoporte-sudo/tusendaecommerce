/// <reference path="../pb_data/types.d.ts" />

const audit = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);
const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const SCOPES = Object.freeze(["all", "product", "variations", "expirations", "price_stock", "visibility", "images", "category"]);
const SAFE_ERRORS = new Set(["unauthorized", "permission_denied", "invalid_payload", "product_not_found", "variation_not_found", "history_event_not_found", "history_unavailable"]);
const FIELD_GROUPS = Object.freeze({
  price: new Set(["base_price_usd", "regular_price_usd", "offer_price_usd", "price", "price_usd", "cost_usd", "profit_margin", "is_offer"]),
  stock: new Set(["stock", "track_stock", "allow_preorder"]),
  expiration: new Set(["expiration_date", "expired"]),
  images: new Set(["image", "images", "image_order"]),
  category: new Set(["category", "subcategory"]),
  visibility: new Set(["active", "visible", "visibility", "status", "featured", "featured_order"]),
});

function text(value, max) {
  let output = "";
  try { output = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return output.slice(0, Math.max(0, Number(max) || 0));
}

function recordValue(record, key) {
  if (!record) return undefined;
  try { return record.get(key); } catch (_) {}
  return record[key];
}

function recordString(record, key, max) {
  let value = recordValue(record, key);
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object") value = value.id || value.value || "";
  return text(value, max || 1000);
}

function relationId(record, key) {
  return recordString(record, key, 15);
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true";
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

function allowedPayload(body, allowed, required) {
  const keys = bodyKeys(body);
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key));
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

function codedError(code) {
  const safe = SAFE_ERRORS.has(code) ? code : "history_unavailable";
  const error = new Error(safe);
  error.code = safe;
  return error;
}

function errorCode(error) {
  const code = text(error && (error.code || error.message), 80);
  return SAFE_ERRORS.has(code) ? code : "history_unavailable";
}

function errorStatus(code) {
  if (["unauthorized", "permission_denied"].includes(code)) return 403;
  if (["product_not_found", "variation_not_found", "history_event_not_found"].includes(code)) return 404;
  if (code === "invalid_payload") return 400;
  return 503;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(errorStatus(code), { ok: false, error: code });
}

function findRecord(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecords(app, collection, filter, sort, params) {
  try { return Array.from(app.findRecordsByFilter(collection, filter, sort, 500, 0, params || {}) || []); }
  catch (_) { return []; }
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model || {}));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows;
}

function queryOne(app, sql, bindings, model) {
  return queryRows(app, sql, bindings, model)[0] || { ...(model || {}) };
}

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function activeActor(record) {
  return !!record
    && ["master_admin", "store_admin", "store_staff"].includes(recordString(record, "role", 40))
    && recordString(record, "status", 40).toLowerCase() === "active";
}

function requestHeader(e, name) {
  let info = null;
  try { info = e.requestInfo(); } catch (_) {}
  const target = String(name || "").toLowerCase();
  const headers = info && info.headers || {};
  try {
    if (typeof headers.get === "function") return text(headers.get(name) || headers.get(target), 80);
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase() === target);
  return key ? text(headers[key], 80) : "";
}

function loadContext(app, e) {
  let actor = e && e.auth;
  try { actor = e.requestInfo().auth || actor; } catch (_) {}
  actor = findRecord(app, "users", text(actor && actor.id, 15));
  if (!activeActor(actor)) throw codedError("unauthorized");
  const master = recordString(actor, "role", 40) === "master_admin";
  const storeId = master ? requestHeader(e, "X-PZ-Support-Store") : relationId(actor, "store");
  if (!RECORD_ID_PATTERN.test(storeId)) throw codedError("unauthorized");
  const store = findRecord(app, "stores", storeId);
  if (!store || (!master && recordString(store, "status", 40).toLowerCase() !== "active")
    || (!master && permissions.isBlockedByPlan(app, actor, store))) {
    throw codedError("unauthorized");
  }
  const granted = master ? permissions.ASSIGNABLE_PERMISSION_KEYS.slice() : permissions.resolveEffectiveStorePermissions(app, actor, store);
  if (!granted.includes("catalog.view")) throw codedError("permission_denied");
  return { actor, store, storeId, granted, primary: master || permissions.isPrimaryAdmin(app, actor, store), master };
}

function parseId(value, code) {
  const id = text(value, 15);
  if (!RECORD_ID_PATTERN.test(id)) throw codedError(code || "invalid_payload");
  return id;
}

function productAuditExists(app, storeId, productId) {
  const row = queryOne(app, `
    SELECT COUNT(*) AS total
    FROM store_activity_audit
    WHERE store = {:storeId}
      AND ((resource_type = 'product' AND resource_id_snapshot = {:productId})
        OR parent_product_id_snapshot = {:productId})
  `, { storeId, productId }, { total: 0 });
  return count(row.total) > 0;
}

function loadProductContext(app, context, productId, variationId) {
  const product = findRecord(app, "products", productId);
  if (product && relationId(product, "store") !== context.storeId) throw codedError("product_not_found");
  if (!product && !productAuditExists(app, context.storeId, productId)) throw codedError("product_not_found");
  const variations = product
    ? findRecords(app, "product_variations", "product = {:product}", "sort_order,variation_type,value", { product: productId })
    : [];
  if (variationId) {
    const current = variations.find((variation) => String(variation.id || "") === variationId);
    if (!current) {
      const historical = queryOne(app, `
        SELECT COUNT(*) AS total FROM store_activity_audit
        WHERE store = {:storeId} AND resource_type = 'product_variation'
          AND parent_product_id_snapshot = {:productId} AND variation_id_snapshot = {:variationId}
      `, { storeId: context.storeId, productId, variationId }, { total: 0 });
      if (!count(historical.total)) throw codedError("variation_not_found");
    }
  }
  return { product, variations };
}

function productSnapshot(app, context, productId, loaded) {
  const product = loaded.product;
  let name = product ? recordString(product, "name", 180) : "";
  if (!name) {
    const row = queryOne(app, `
      SELECT resource_label_snapshot FROM store_activity_audit
      WHERE store = {:storeId} AND resource_type = 'product' AND resource_id_snapshot = {:productId}
      ORDER BY created DESC, id DESC LIMIT 1
    `, { storeId: context.storeId, productId }, { resource_label_snapshot: "" });
    name = text(row.resource_label_snapshot, 180) || "Producto eliminado";
  }
  const categoryId = product ? relationId(product, "category") : "";
  const category = categoryId ? findRecord(app, "categories", categoryId) : null;
  const imagesValue = product ? recordValue(product, "images") : [];
  const images = Array.isArray(imagesValue) ? imagesValue : (imagesValue ? [imagesValue] : []);
  const firstImage = text(images[0], 180);
  const imageUrl = product && firstImage
    ? `/api/files/products/${encodeURIComponent(productId)}/${encodeURIComponent(firstImage)}?thumb=160x160`
    : "";
  const currentVariations = loaded.variations.map((variation) => ({
    id: text(variation.id, 15),
    name: text(`${recordString(variation, "variation_type", 80) || "Variación"}: ${recordString(variation, "value", 80) || "Sin valor"}`, 180),
    state: "active",
  }));
  const historical = queryRows(app, `
    SELECT variation_id_snapshot, resource_label_snapshot
    FROM store_activity_audit
    WHERE store = {:storeId} AND resource_type = 'product_variation'
      AND parent_product_id_snapshot = {:productId} AND variation_id_snapshot != ''
    GROUP BY variation_id_snapshot
    ORDER BY LOWER(resource_label_snapshot), variation_id_snapshot
    LIMIT 500
  `, { storeId: context.storeId, productId }, { variation_id_snapshot: "", resource_label_snapshot: "" });
  const present = new Set(currentVariations.map((variation) => variation.id));
  const variations = currentVariations.concat(historical
    .filter((row) => RECORD_ID_PATTERN.test(text(row.variation_id_snapshot, 15)) && !present.has(text(row.variation_id_snapshot, 15)))
    .map((row) => ({ id: text(row.variation_id_snapshot, 15), name: text(row.resource_label_snapshot, 180) || "Variación eliminada", state: "deleted" })));
  return {
    id: productId,
    name,
    category: category ? recordString(category, "name", 180) : "Sin categoría",
    active: product ? recordBool(product, "active") : false,
    state: product ? "active" : "deleted",
    mode: product && recordBool(product, "has_variations") ? "variations" : "general",
    image_url: imageUrl,
    variations,
  };
}

function redactProductSnapshot(product, context) {
  const safe = { ...(product || {}) };
  if (!context.granted.includes("catalog.products.images")) safe.image_url = "";
  if (!context.granted.includes("catalog.categories.manage")) safe.category = "";
  return safe;
}

function parseBasePayload(body, allowed) {
  if (!allowedPayload(body, allowed, ["product_id"])) throw codedError("invalid_payload");
  const productId = parseId(bodyValue(body, "product_id"));
  const variationRaw = text(bodyValue(body, "variation_id"), 15);
  const variationId = variationRaw ? parseId(variationRaw) : "";
  return { productId, variationId };
}

function scopeClause(scope) {
  const fields = (names) => names.map((name) => `LOWER(CAST(a.changed_fields_json AS TEXT)) LIKE '%\"${name}\"%'`).join(" OR ");
  if (scope === "product") return "a.resource_type = 'product'";
  if (scope === "variations") return "a.resource_type = 'product_variation'";
  if (scope === "expirations") return `(LOWER(a.action) LIKE '%expir%' OR ${fields(["expiration_date", "expired"])})`;
  if (scope === "price_stock") return `(${fields([...FIELD_GROUPS.price, ...FIELD_GROUPS.stock])})`;
  if (scope === "visibility") return `(${fields([...FIELD_GROUPS.visibility])})`;
  if (scope === "images") return `(${fields([...FIELD_GROUPS.images])})`;
  if (scope === "category") return `(${fields([...FIELD_GROUPS.category])})`;
  return "1 = 1";
}

function forcedExpirationOnly(context) {
  const useful = context.granted.filter((permission) => permission !== "catalog.view");
  return useful.length === 1 && useful[0] === "catalog.expirations.manage";
}

function parseListPayload(body, context) {
  const base = parseBasePayload(body, ["product_id", "variation_id", "scope", "page", "per_page"]);
  let scope = text(bodyValue(body, "scope") || "all", 40).toLowerCase();
  if (!SCOPES.includes(scope)) throw codedError("invalid_payload");
  if (forcedExpirationOnly(context)) scope = "expirations";
  const page = Number(bodyValue(body, "page") || 1);
  const perPage = Number(bodyValue(body, "per_page") || PAGE_SIZE);
  if (!Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(perPage) || perPage < 1 || perPage > MAX_PAGE_SIZE) {
    throw codedError("invalid_payload");
  }
  return { ...base, scope, page, perPage };
}

function parseJsonArray(value) {
  let parsed = value;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch (_) { parsed = []; } }
  return Array.isArray(parsed) ? parsed.map((item) => text(item, 80)).filter(Boolean).slice(0, 50) : [];
}

function fieldAllowed(field, context) {
  if (FIELD_GROUPS.price.has(field)) return context.granted.includes("catalog.products.price");
  if (FIELD_GROUPS.stock.has(field)) return context.granted.includes("catalog.products.stock");
  if (FIELD_GROUPS.expiration.has(field)) return context.granted.includes("catalog.expirations.manage");
  if (FIELD_GROUPS.images.has(field)) return context.granted.includes("catalog.products.images");
  if (FIELD_GROUPS.category.has(field)) return context.granted.includes("catalog.categories.manage");
  if (FIELD_GROUPS.visibility.has(field)) return context.granted.includes("catalog.products.visibility");
  return true;
}

function safeChanges(row, context) {
  const before = audit.sanitizeObject(row.previous_values_json);
  const after = audit.sanitizeObject(row.new_values_json);
  return parseJsonArray(row.changed_fields_json)
    .filter((field) => fieldAllowed(field, context))
    .map((field) => ({ field, before: before[field], after: after[field] }))
    .filter((change) => change.before !== undefined || change.after !== undefined);
}

function mapRow(row, context) {
  const variationId = text(row.variation_id_snapshot, 15);
  return {
    id: text(row.id, 15),
    actor: text(row.actor_name_snapshot, 160) || "Sistema",
    actor_state: ["system", "migration"].includes(text(row.actor_id_snapshot, 40)) ? text(row.actor_id_snapshot, 40) : (text(row.actor, 15) ? "active" : "deleted"),
    created: text(row.created, 50),
    action: text(row.action, 100),
    element: text(row.resource_label_snapshot, 180) || (variationId ? "Variación" : "Producto"),
    summary: text(row.summary, 500),
    resource_type: text(row.resource_type, 80),
    variation_id: variationId,
    variation_label: variationId ? text(row.resource_label_snapshot, 180) : "",
    changes: safeChanges(row, context),
  };
}

const ROW_MODEL = Object.freeze({
  id: "", actor: "", actor_id_snapshot: "", actor_name_snapshot: "", action: "",
  resource_type: "", resource_label_snapshot: "", variation_id_snapshot: "",
  changed_fields_json: "", previous_values_json: "", new_values_json: "", summary: "", created: "",
});

function listRows(app, context, parsed) {
  const where = ["a.store = {:storeId}", `((a.resource_type = 'product' AND a.resource_id_snapshot = {:productId}) OR (a.resource_type = 'product_variation' AND a.parent_product_id_snapshot = {:productId}))`, scopeClause(parsed.scope)];
  const bindings = { storeId: context.storeId, productId: parsed.productId };
  if (parsed.variationId) {
    where.push("a.resource_type = 'product_variation' AND a.variation_id_snapshot = {:variationId}");
    bindings.variationId = parsed.variationId;
  }
  if (!context.granted.includes("catalog.expirations.manage")) where.push("LOWER(a.action) NOT LIKE '%expir%' AND LOWER(CAST(a.changed_fields_json AS TEXT)) NOT LIKE '%\"expiration_date\"%'");
  const sqlWhere = where.map((clause) => `(${clause})`).join(" AND ");
  const total = queryOne(app, `SELECT COUNT(*) AS total FROM store_activity_audit a WHERE ${sqlWhere}`, bindings, { total: 0 });
  const rows = queryRows(app, `
    SELECT a.id, a.actor, a.actor_id_snapshot, a.actor_name_snapshot, a.action,
      a.resource_type, a.resource_label_snapshot, a.variation_id_snapshot,
      a.changed_fields_json, a.previous_values_json, a.new_values_json, a.summary, a.created
    FROM store_activity_audit a
    WHERE ${sqlWhere}
    ORDER BY a.created DESC, a.id DESC
    LIMIT {:limit} OFFSET {:offset}
  `, { ...bindings, limit: parsed.perPage, offset: (parsed.page - 1) * parsed.perPage }, ROW_MODEL);
  const totalItems = count(total.total);
  return {
    events: rows.map((row) => mapRow(row, context)),
    pagination: { page: parsed.page, per_page: parsed.perPage, total_items: totalItems, total_pages: Math.max(1, Math.ceil(totalItems / parsed.perPage)) },
  };
}

function detailVisibilityClause(context) {
  if (forcedExpirationOnly(context)) return scopeClause("expirations");
  if (!context.granted.includes("catalog.expirations.manage")) {
    return "LOWER(a.action) NOT LIKE '%expir%' AND LOWER(CAST(a.changed_fields_json AS TEXT)) NOT LIKE '%\"expiration_date\"%'";
  }
  return "1 = 1";
}

function handleSummary(e) {
  setPrivateHeaders(e);
  try {
    const body = e.requestInfo().body || {};
    const parsed = parseBasePayload(body, ["product_id", "variation_id"]);
    const context = loadContext($app, e);
    const loaded = loadProductContext($app, context, parsed.productId, parsed.variationId);
    const product = redactProductSnapshot(productSnapshot($app, context, parsed.productId, loaded), context);
    return e.json(200, { ok: true, product, selected_variation_id: parsed.variationId, permissions: {
      price: context.granted.includes("catalog.products.price"),
      stock: context.granted.includes("catalog.products.stock"),
      expirations: context.granted.includes("catalog.expirations.manage"),
      images: context.granted.includes("catalog.products.images"),
      category: context.granted.includes("catalog.categories.manage"),
      visibility: context.granted.includes("catalog.products.visibility"),
    } });
  } catch (error) { return sendError(e, error); }
}

function handleList(e) {
  setPrivateHeaders(e);
  try {
    const body = e.requestInfo().body || {};
    const context = loadContext($app, e);
    const parsed = parseListPayload(body, context);
    loadProductContext($app, context, parsed.productId, parsed.variationId);
    return e.json(200, { ok: true, scope: parsed.scope, ...listRows($app, context, parsed) });
  } catch (error) { return sendError(e, error); }
}

function handleDetail(e) {
  setPrivateHeaders(e);
  try {
    const body = e.requestInfo().body || {};
    if (!allowedPayload(body, ["product_id", "event_id"], ["product_id", "event_id"])) throw codedError("invalid_payload");
    const productId = parseId(bodyValue(body, "product_id"));
    const eventId = parseId(bodyValue(body, "event_id"));
    const context = loadContext($app, e);
    loadProductContext($app, context, productId, "");
    const rows = queryRows($app, `
      SELECT a.id, a.actor, a.actor_id_snapshot, a.actor_name_snapshot, a.action,
        a.resource_type, a.resource_label_snapshot, a.variation_id_snapshot,
        a.changed_fields_json, a.previous_values_json, a.new_values_json, a.summary, a.created
      FROM store_activity_audit a
      WHERE a.id = {:eventId} AND a.store = {:storeId}
        AND ((a.resource_type = 'product' AND a.resource_id_snapshot = {:productId})
          OR (a.resource_type = 'product_variation' AND a.parent_product_id_snapshot = {:productId}))
        AND (${detailVisibilityClause(context)})
      LIMIT 1
    `, { eventId, storeId: context.storeId, productId }, ROW_MODEL);
    if (!rows[0]) throw codedError("history_event_not_found");
    return e.json(200, { ok: true, event: mapRow(rows[0], context) });
  } catch (error) { return sendError(e, error); }
}

module.exports = {
  SCOPES,
  detailVisibilityClause,
  fieldAllowed,
  forcedExpirationOnly,
  handleDetail,
  handleList,
  handleSummary,
  listRows,
  loadProductContext,
  mapRow,
  parseListPayload,
  redactProductSnapshot,
  requireAuthenticatedUser(e) {
    setPrivateHeaders(e);
    if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
    return e.next();
  },
};
