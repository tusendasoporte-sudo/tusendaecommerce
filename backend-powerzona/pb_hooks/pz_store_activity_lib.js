/// <reference path="../pb_data/types.d.ts" />

const activityAudit = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);
const teamPermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_RESOURCE_BATCH = 100;
const MAX_DATE_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const REVIEW_STATUSES = Object.freeze(["pending", "reviewed", "requires_correction"]);
const FILTER_MODULES = Object.freeze(["all", ...activityAudit.MODULES]);
const FILTER_SEVERITIES = Object.freeze(["all", ...activityAudit.SEVERITIES]);
const SAFE_ERRORS = new Set([
  "unauthorized", "primary_admin_required", "invalid_payload", "activity_not_found",
  "activity_unavailable", "review_note_required", "unknown_resource_type",
]);

const RESOURCE_TABLES = Object.freeze({
  product: Object.freeze({ table: "products", store: "store" }),
  product_variation: Object.freeze({ table: "product_variations", parentTable: "products", parentField: "product" }),
  category: Object.freeze({ table: "categories", store: "store" }),
  subcategory: Object.freeze({ table: "subcategories", store: "store" }),
  order: Object.freeze({ table: "orders", store: "store" }),
  order_item: Object.freeze({ table: "order_items", parentTable: "orders", parentField: "order" }),
  shipping_method: Object.freeze({ table: "shipping_methods", store: "store" }),
  shipping_zone: Object.freeze({ table: "shipping_zones", store: "store" }),
  promotion: Object.freeze({ table: "automatic_promotions", store: "store" }),
  coupon: Object.freeze({ table: "manual_coupons", store: "store" }),
  gift: Object.freeze({ table: "gifts", store: "store" }),
  raffle: Object.freeze({ table: "raffles", store: "store" }),
  raffle_entry: Object.freeze({ table: "raffle_entries", parentTable: "raffles", parentField: "raffle" }),
  review: Object.freeze({ table: "reviews", store: "store" }),
  visual_item: Object.freeze({ table: "store_visual_items", store: "store" }),
  settings: Object.freeze({ table: "settings", store: "store" }),
  currency: Object.freeze({ table: "currencies", store: "store" }),
  security_settings: Object.freeze({ table: "store_security_settings", store: "store" }),
  security_block: Object.freeze({ table: "store_security_blocks", store: "store" }),
  team_user: Object.freeze({ table: "users", store: "store" }),
  activity: Object.freeze({ table: "store_activity_audit", store: "store" }),
  store_plan: Object.freeze({ table: "stores", selfStore: true }),
});
const VIRTUAL_RESOURCE_TYPES = new Set(["security"]);

function text(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return result.slice(0, Math.max(0, Number(max) || 0));
}

function recordValue(record, key) {
  return activityAudit.recordValue(record, key);
}

function recordString(record, key, max) {
  return text(activityAudit.recordString(record, key), max || 1000);
}

function relationId(record, key) {
  return text(activityAudit.relationId(record, key), 80);
}

function recordId(record) {
  return text(activityAudit.recordId(record), 80);
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

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function codedError(code) {
  const safe = SAFE_ERRORS.has(code) ? code : "activity_unavailable";
  const error = new Error(safe);
  error.code = safe;
  return error;
}

function errorCode(error) {
  const code = text(error && (error.code || error.message), 80);
  return SAFE_ERRORS.has(code) ? code : "";
}

function errorStatus(code) {
  if (code === "unauthorized" || code === "primary_admin_required") return 403;
  if (code === "activity_not_found") return 404;
  if (["invalid_payload", "review_note_required", "unknown_resource_type"].includes(code)) return 400;
  return 503;
}

function sendError(e, error, fallback) {
  const code = errorCode(error) || fallback || "activity_unavailable";
  return e.json(errorStatus(code), { ok: false, error: code });
}

function findRecord(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model || {}));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows;
}

function queryOne(app, sql, bindings, model) {
  const rows = queryRows(app, sql, bindings, model);
  return rows[0] || { ...(model || {}) };
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function activeActor(record) {
  const role = recordString(record, "role", 40);
  const status = recordString(record, "status", 40).toLowerCase();
  return !!record && ["master_admin", "store_admin", "store_staff"].includes(role)
    && status === "active";
}

function loadRequestActor(app, e) {
  let auth = e && e.auth;
  try { auth = e.requestInfo().auth || auth; } catch (_) {}
  const id = recordId(auth);
  const actor = RECORD_ID_PATTERN.test(id) ? findRecord(app, "users", id) : null;
  if (!activeActor(actor)) throw codedError("unauthorized");
  return actor;
}

function loadAccessContext(app, e, options) {
  const actor = loadRequestActor(app, e);
  const role = recordString(actor, "role", 40);
  const requestedStoreId = text(options && options.storeId, 15);
  let storeId = "";
  if (role === "master_admin") {
    if (!RECORD_ID_PATTERN.test(requestedStoreId)) throw codedError("invalid_payload");
    storeId = requestedStoreId;
  } else {
    storeId = relationId(actor, "store");
    if (!RECORD_ID_PATTERN.test(storeId)) throw codedError("unauthorized");
    if (requestedStoreId && requestedStoreId !== storeId) throw codedError("unauthorized");
  }
  const store = findRecord(app, "stores", storeId);
  if (!store) throw codedError("unauthorized");
  if (role !== "master_admin" && recordString(store, "status", 40).toLowerCase() !== "active") {
    throw codedError("unauthorized");
  }
  if (role !== "master_admin" && teamPermissions.isBlockedByPlan(app, actor, store)) {
    throw codedError("unauthorized");
  }
  const primary = role === "master_admin" || teamPermissions.isPrimaryAdmin(app, actor, store);
  if (options && options.requirePrimary && !primary) throw codedError("primary_admin_required");
  return { actor, role, store, storeId, primary, master: role === "master_admin" };
}

function parseDate(value, endOfDay) {
  const raw = text(value, 40);
  if (!raw) return "";
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : raw;
  const date = new Date(candidate);
  if (!Number.isFinite(date.getTime())) throw codedError("invalid_payload");
  return date.toISOString();
}

function parsePagination(value, fallback, max) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) throw codedError("invalid_payload");
  return value;
}

function parseFilters(body, options) {
  const allowed = ["store_id", "actor_id", "module", "action", "severity", "review_status", "resource_type", "resource_id", "date_from", "date_to", "search", "page", "per_page"];
  if (!allowedPayload(body, allowed, [])) throw codedError("invalid_payload");
  const storeId = text(bodyValue(body, "store_id"), 15);
  const actorId = text(bodyValue(body, "actor_id"), 40);
  const moduleName = text(bodyValue(body, "module") || "all", 40).toLowerCase();
  const action = text(bodyValue(body, "action"), 100).toLowerCase();
  const severity = text(bodyValue(body, "severity") || "all", 40).toLowerCase();
  const reviewStatus = text(bodyValue(body, "review_status") || "all", 40).toLowerCase();
  const resourceType = text(bodyValue(body, "resource_type"), 80).toLowerCase();
  const resourceId = text(bodyValue(body, "resource_id"), 80);
  const search = text(bodyValue(body, "search"), 120);
  let dateFrom = parseDate(bodyValue(body, "date_from"), false);
  let dateTo = parseDate(bodyValue(body, "date_to"), true);
  if (actorId && !RECORD_ID_PATTERN.test(actorId) && !["system", "migration"].includes(actorId)) throw codedError("invalid_payload");
  if (!FILTER_MODULES.includes(moduleName) || !FILTER_SEVERITIES.includes(severity)) throw codedError("invalid_payload");
  if (!["all", ...REVIEW_STATUSES].includes(reviewStatus)) throw codedError("invalid_payload");
  if (Boolean(resourceType) !== Boolean(resourceId)) throw codedError("invalid_payload");
  if (resourceType && !RESOURCE_TABLES[resourceType] && !VIRTUAL_RESOURCE_TYPES.has(resourceType)) throw codedError("unknown_resource_type");
  if (resourceId && !RECORD_ID_PATTERN.test(resourceId)) throw codedError("invalid_payload");
  if (action && !/^[a-z0-9_.-]{1,100}$/.test(action)) throw codedError("invalid_payload");
  const now = Date.now();
  if (dateFrom && !dateTo) dateTo = new Date(now).toISOString();
  if (!dateFrom && dateTo) {
    const dateToTime = new Date(dateTo).getTime();
    if (Math.abs(dateToTime - now) > MAX_DATE_RANGE_MS) throw codedError("invalid_payload");
    dateFrom = new Date(dateToTime - MAX_DATE_RANGE_MS).toISOString();
  }
  if (dateFrom && dateTo) {
    const range = new Date(dateTo).getTime() - new Date(dateFrom).getTime();
    if (range < 0 || range > MAX_DATE_RANGE_MS) throw codedError("invalid_payload");
  }
  return {
    storeId,
    actorId: options && options.forcedActorId ? options.forcedActorId : actorId,
    module: moduleName,
    action,
    severity,
    reviewStatus: options && options.hideReviews ? "all" : reviewStatus,
    resourceType,
    resourceId,
    dateFrom,
    dateTo,
    search,
    page: parsePagination(bodyValue(body, "page"), 1, 1000000),
    perPage: parsePagination(bodyValue(body, "per_page"), PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function listWhere(filters, storeId) {
  const where = ["a.store = {:storeId}"];
  const bindings = { storeId };
  if (filters.actorId) { where.push("a.actor_id_snapshot = {:actorId}"); bindings.actorId = filters.actorId; }
  if (filters.module !== "all") { where.push("a.module = {:module}"); bindings.module = filters.module; }
  if (filters.action) { where.push("a.action = {:action}"); bindings.action = filters.action; }
  if (filters.severity !== "all") { where.push("a.severity = {:severity}"); bindings.severity = filters.severity; }
  if (filters.reviewStatus === "pending") where.push("COALESCE(r.status, 'pending') = 'pending'");
  else if (filters.reviewStatus !== "all") {
    where.push("r.status = {:reviewStatus}"); bindings.reviewStatus = filters.reviewStatus;
  }
  if (filters.resourceType) {
    where.push("a.resource_type = {:resourceType} AND a.resource_id_snapshot = {:resourceId}");
    bindings.resourceType = filters.resourceType;
    bindings.resourceId = filters.resourceId;
  }
  if (filters.dateFrom) { where.push("a.created >= {:dateFrom}"); bindings.dateFrom = filters.dateFrom; }
  if (filters.dateTo) { where.push("a.created <= {:dateTo}"); bindings.dateTo = filters.dateTo; }
  if (filters.search) {
    const escaped = filters.search.toLowerCase().replace(/([%_\\])/g, "\\$1");
    bindings.search = `%${escaped}%`;
    where.push("(LOWER(a.summary) LIKE {:search} ESCAPE '\\' OR LOWER(a.resource_label_snapshot) LIKE {:search} ESCAPE '\\' OR LOWER(a.actor_name_snapshot) LIKE {:search} ESCAPE '\\')");
  }
  return { sql: where.join(" AND "), bindings };
}

const ACTIVITY_ROW_MODEL = Object.freeze({
  id: "", actor: "", actor_id_snapshot: "", actor_name_snapshot: "", actor_role_snapshot: "",
  origin: "", module: "", action: "", severity: "", resource_type: "",
  resource_id_snapshot: "", resource_label_snapshot: "", changed_fields_json: "",
  previous_values_json: "", new_values_json: "", summary: "", created: "",
  review_status: "", review_note: "", reviewed_at: "", reviewed_by_name: "",
});

function activitySelect() {
  return `
    SELECT
      a.id, a.actor, a.actor_id_snapshot, a.actor_name_snapshot, a.actor_role_snapshot,
      a.origin, a.module, a.action, a.severity, a.resource_type, a.resource_id_snapshot,
      a.resource_label_snapshot, a.changed_fields_json, a.previous_values_json,
      a.new_values_json, a.summary, a.created,
      COALESCE(r.status, 'pending') AS review_status,
      COALESCE(r.note, '') AS review_note,
      COALESCE(r.reviewed_at, '') AS reviewed_at,
      COALESCE(r.reviewed_by_name_snapshot, '') AS reviewed_by_name
    FROM store_activity_audit a
    LEFT JOIN store_activity_reviews r ON r.activity = a.id
  `;
}

function parseJsonArray(value) {
  let parsed = value;
  if (typeof parsed === "string" && parsed) {
    try { parsed = JSON.parse(parsed); } catch (_) { parsed = []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => text(item, 80)).filter((item) => /^[a-z0-9_.-]+$/i.test(item) && !activityAudit.PROHIBITED_KEY_PATTERN.test(item)).slice(0, 50);
}

function collectionExists(app, collection) {
  try { return !!app.findCollectionByNameOrId(collection); } catch (_) { return false; }
}

function resourceExistence(app, storeId, rows) {
  const grouped = {};
  rows.forEach((row) => {
    const type = text(row.resource_type, 80);
    const id = text(row.resource_id_snapshot, 80);
    if (VIRTUAL_RESOURCE_TYPES.has(type) && !id) return;
    if (!RESOURCE_TABLES[type] || !RECORD_ID_PATTERN.test(id)) return;
    if (!grouped[type]) grouped[type] = new Set();
    grouped[type].add(id);
  });
  const bindings = { storeId };
  const selects = [];
  let bindingIndex = 0;
  Object.keys(grouped).sort().forEach((type) => {
    const config = RESOURCE_TABLES[type];
    if (!collectionExists(app, config.table)) return;
    if (config.parentTable && !collectionExists(app, config.parentTable)) return;
    const placeholders = [];
    [...grouped[type]].sort().forEach((id) => {
      const key = `resource${bindingIndex++}`;
      bindings[key] = id;
      placeholders.push(`{:${key}}`);
    });
    if (!placeholders.length) return;
    const typeLiteral = type.replace(/'/g, "");
    const tenantClause = config.selfStore
      ? "id = {:storeId}"
      : (config.parentTable
        ? `${config.parentField} IN (SELECT id FROM ${config.parentTable} WHERE store = {:storeId})`
        : `${config.store} = {:storeId}`);
    selects.push(`SELECT '${typeLiteral}' AS resource_type, id FROM ${config.table} WHERE ${tenantClause} AND id IN (${placeholders.join(",")})`);
  });
  if (!selects.length) return new Set();
  const found = queryRows(app, selects.join(" UNION ALL "), bindings, { resource_type: "", id: "" });
  return new Set(found.map((row) => `${text(row.resource_type, 80)}:${text(row.id, 80)}`));
}

function safeStoreSlug(store) {
  return encodeURIComponent(recordString(store, "slug", 80).toLowerCase());
}

function resourcePath(store, row, exists) {
  if (!exists) return "";
  const slug = safeStoreSlug(store);
  const id = encodeURIComponent(text(row.resource_id_snapshot, 80));
  const base = `/t/${slug}/admin`;
  const routes = {
    product: `${base}/products?product=${id}`,
    product_variation: `${base}/products`,
    category: `${base}/catalog/category/${id}`,
    subcategory: `${base}/catalog`,
    order: `${base}/orders/${id}`,
    order_item: `${base}/orders`,
    shipping_method: `${base}/shipping`,
    shipping_zone: `${base}/shipping`,
    promotion: `${base}/promos`,
    coupon: `${base}/promos`,
    gift: `${base}/gifts`,
    raffle: `${base}/promos/raffles`,
    raffle_entry: `${base}/promos/raffles`,
    review: `${base}/store-settings#rating-pending`,
    visual_item: `${base}/store-settings`,
    settings: `${base}/store-settings`,
    currency: `${base}/store-settings`,
    security_settings: `${base}/security`,
    security_block: `${base}/security`,
    team_user: `${base}/team`,
    activity: `${base}/team?tab=activity`,
    security: `${base}/security`,
    store_plan: `${base}/account#plan`,
  };
  return routes[text(row.resource_type, 80)] || "";
}

function mapActivity(row, context, options) {
  const actorSnapshot = text(row.actor_id_snapshot, 40);
  const actorRelation = text(row.actor, 40);
  const actorState = ["system", "migration"].includes(actorSnapshot)
    ? actorSnapshot
    : (actorRelation ? "active" : "deleted");
  const resourceKey = `${text(row.resource_type, 80)}:${text(row.resource_id_snapshot, 80)}`;
  const exists = VIRTUAL_RESOURCE_TYPES.has(text(row.resource_type, 80)) || options.existing.has(resourceKey);
  const previous = activityAudit.sanitizeObject(row.previous_values_json);
  const next = activityAudit.sanitizeObject(row.new_values_json);
  const mapped = {
    id: text(row.id, 15),
    actor_name: text(row.actor_name_snapshot, 160) || "Sistema",
    actor_state: actorState,
    actor_role: activityAudit.ACTOR_ROLES.includes(text(row.actor_role_snapshot, 40)) ? text(row.actor_role_snapshot, 40) : "system",
    origin: activityAudit.ORIGINS.includes(text(row.origin, 40)) ? text(row.origin, 40) : "system",
    module: activityAudit.MODULES.includes(text(row.module, 40)) ? text(row.module, 40) : "operation",
    action: text(row.action, 100),
    severity: activityAudit.SEVERITIES.includes(text(row.severity, 40)) ? text(row.severity, 40) : "normal",
    resource_type: (RESOURCE_TABLES[text(row.resource_type, 80)] || VIRTUAL_RESOURCE_TYPES.has(text(row.resource_type, 80))) ? text(row.resource_type, 80) : "",
    resource_label: text(row.resource_label_snapshot, 180),
    resource_state: exists ? "active" : "deleted",
    resource_path: resourcePath(context.store, row, exists),
    changed_fields: parseJsonArray(row.changed_fields_json),
    previous_values: previous,
    new_values: next,
    summary: text(row.summary, 500),
    created: text(row.created, 50),
  };
  if (!options.hideReviews) {
    mapped.review = {
      status: REVIEW_STATUSES.includes(text(row.review_status, 40)) ? text(row.review_status, 40) : "pending",
      note: options.includeReviewNote ? text(row.review_note, 1000) : "",
      reviewed_at: text(row.reviewed_at, 50),
      reviewed_by_name: options.includeReviewNote ? text(row.reviewed_by_name, 160) : "",
    };
  }
  return mapped;
}

function listActivities(app, context, filters, options) {
  const where = listWhere(filters, context.storeId);
  const total = queryOne(app, `SELECT COUNT(*) AS total_items FROM store_activity_audit a LEFT JOIN store_activity_reviews r ON r.activity = a.id WHERE ${where.sql}`, where.bindings, { total_items: 0 });
  const bindings = {
    ...where.bindings,
    limit: filters.perPage,
    offset: (filters.page - 1) * filters.perPage,
  };
  const rows = queryRows(app, `${activitySelect()} WHERE ${where.sql} ORDER BY a.created DESC, a.id DESC LIMIT {:limit} OFFSET {:offset}`, bindings, ACTIVITY_ROW_MODEL);
  const existing = resourceExistence(app, context.storeId, rows);
  const totalItems = count(total.total_items);
  return {
    events: rows.map((row) => mapActivity(row, context, { ...options, existing })),
    pagination: {
      page: filters.page,
      per_page: filters.perPage,
      total_items: totalItems,
      total_pages: Math.max(1, Math.ceil(totalItems / filters.perPage)),
    },
  };
}

function actorOptions(app, storeId) {
  const rows = queryRows(app, `
    WITH ranked_actors AS (
      SELECT actor_id_snapshot, actor_name_snapshot, actor,
        ROW_NUMBER() OVER (
          PARTITION BY actor_id_snapshot
          ORDER BY created DESC, id DESC
        ) AS row_number
      FROM store_activity_audit
      WHERE store = {:storeId}
    )
    SELECT actor_id_snapshot, actor_name_snapshot, actor
    FROM ranked_actors
    WHERE row_number = 1
    ORDER BY LOWER(actor_name_snapshot), actor_id_snapshot
    LIMIT 100
  `, { storeId }, { actor_id_snapshot: "", actor_name_snapshot: "", actor: "" });
  return rows.map((row) => ({
    ref: text(row.actor_id_snapshot, 40),
    name: text(row.actor_name_snapshot, 160) || "Sistema",
    state: ["system", "migration"].includes(text(row.actor_id_snapshot, 40))
      ? text(row.actor_id_snapshot, 40)
      : (text(row.actor, 40) ? "active" : "deleted"),
  }));
}

function summaryForStore(app, storeId) {
  const row = queryOne(app, `
    SELECT
      COALESCE(SUM(CASE WHEN DATE(a.created, 'localtime') = DATE('now', 'localtime') THEN 1 ELSE 0 END), 0) AS today_changes,
      COALESCE(SUM(CASE WHEN COALESCE(r.status, 'pending') = 'pending' THEN 1 ELSE 0 END), 0) AS pending_reviews,
      COALESCE(SUM(CASE WHEN a.severity = 'critical' THEN 1 ELSE 0 END), 0) AS critical_changes,
      COUNT(DISTINCT CASE
        WHEN a.actor_id_snapshot NOT IN ('system', 'migration') THEN a.actor_id_snapshot
        ELSE NULL
      END) AS active_actors
    FROM store_activity_audit a
    LEFT JOIN store_activity_reviews r ON r.activity = a.id
    WHERE a.store = {:storeId}
  `, { storeId }, { today_changes: 0, pending_reviews: 0, critical_changes: 0, active_actors: 0 });
  return {
    changes_today: count(row.today_changes),
    pending_reviews: count(row.pending_reviews),
    critical_changes: count(row.critical_changes),
    users_with_activity: count(row.active_actors),
  };
}

function handleSummary(e) {
  setPrivateHeaders(e);
  try {
    const body = e.requestInfo().body || {};
    if (!allowedPayload(body, ["store_id"], [])) throw codedError("invalid_payload");
    const context = loadAccessContext($app, e, { storeId: text(bodyValue(body, "store_id"), 15), requirePrimary: true });
    return e.json(200, { ok: true, summary: summaryForStore($app, context.storeId), actors: actorOptions($app, context.storeId) });
  } catch (error) { return sendError(e, error, "activity_unavailable"); }
}

function handleList(e) {
  setPrivateHeaders(e);
  try {
    const body = e.requestInfo().body || {};
    const filters = parseFilters(body);
    const context = loadAccessContext($app, e, { storeId: filters.storeId, requirePrimary: true });
    const result = listActivities($app, context, filters, { hideReviews: false, includeReviewNote: false });
    return e.json(200, { ok: true, ...result, actors: actorOptions($app, context.storeId) });
  } catch (error) { return sendError(e, error, "activity_unavailable"); }
}

function detailPayload(body) {
  if (!allowedPayload(body, ["store_id", "activity_id"], ["activity_id"])) throw codedError("invalid_payload");
  const activityId = text(bodyValue(body, "activity_id"), 15);
  if (!RECORD_ID_PATTERN.test(activityId)) throw codedError("invalid_payload");
  return { storeId: text(bodyValue(body, "store_id"), 15), activityId };
}

function activityRowById(app, storeId, activityId) {
  const rows = queryRows(app, `${activitySelect()} WHERE a.store = {:storeId} AND a.id = {:activityId} LIMIT 1`, { storeId, activityId }, ACTIVITY_ROW_MODEL);
  return rows[0] || null;
}

function handleDetail(e) {
  setPrivateHeaders(e);
  try {
    const parsed = detailPayload(e.requestInfo().body || {});
    const context = loadAccessContext($app, e, { storeId: parsed.storeId, requirePrimary: true });
    const row = activityRowById($app, context.storeId, parsed.activityId);
    if (!row) throw codedError("activity_not_found");
    const existing = resourceExistence($app, context.storeId, [row]);
    return e.json(200, { ok: true, event: mapActivity(row, context, { existing, hideReviews: false, includeReviewNote: true }) });
  } catch (error) { return sendError(e, error, "activity_unavailable"); }
}

function reviewPayload(body) {
  if (!allowedPayload(body, ["store_id", "activity_id", "status", "note"], ["activity_id", "status", "note"])) throw codedError("invalid_payload");
  const activityId = text(bodyValue(body, "activity_id"), 15);
  const status = text(bodyValue(body, "status"), 40).toLowerCase();
  const note = text(bodyValue(body, "note"), 1001);
  if (!RECORD_ID_PATTERN.test(activityId) || !["reviewed", "requires_correction"].includes(status) || note.length > 1000) throw codedError("invalid_payload");
  if (status === "requires_correction" && note.length < 8) throw codedError("review_note_required");
  return { storeId: text(bodyValue(body, "store_id"), 15), activityId, status, note };
}

function findReview(app, storeId, activityId) {
  try {
    return app.findFirstRecordByFilter(
      activityAudit.REVIEW_COLLECTION,
      "store = {:store} && activity = {:activity}",
      { store: storeId, activity: activityId },
    );
  } catch (_) { return null; }
}

function handleReview(e) {
  setPrivateHeaders(e);
  try {
    const parsed = reviewPayload(e.requestInfo().body || {});
    const requestActorId = recordId(e.auth);
    let response = null;
    $app.runInTransaction((app) => {
      const context = loadAccessContext(app, e, { storeId: parsed.storeId, requirePrimary: true });
      const eventRecord = findRecord(app, activityAudit.ACTIVITY_COLLECTION, parsed.activityId);
      if (!eventRecord || relationId(eventRecord, "store") !== context.storeId) throw codedError("activity_not_found");
      let review = findReview(app, context.storeId, parsed.activityId);
      const previousStatus = review ? recordString(review, "status", 40) : "pending";
      const previousNote = review ? recordString(review, "note", 1000) : "";
      if (!review) review = new Record(app.findCollectionByNameOrId(activityAudit.REVIEW_COLLECTION), {});
      review.set("store", context.storeId);
      review.set("activity", parsed.activityId);
      review.set("status", parsed.status);
      review.set("note", parsed.note || (parsed.status === "reviewed" ? previousNote : ""));
      review.set("reviewed_by", context.actor.id);
      review.set("reviewed_by_name_snapshot", recordString(context.actor, "display_name", 160) || recordString(context.actor, "name", 160) || "Administrador");
      review.set("reviewed_at", new Date().toISOString());
      app.save(review);
      const reviewEvent = activityAudit.createActivity(app, {
        storeId: context.storeId,
        actor: context.actor,
        module: "activity",
        action: parsed.status === "reviewed" ? "activity_marked_reviewed" : "activity_requires_correction",
        severity: parsed.status === "requires_correction" ? "important" : "normal",
        resourceType: "activity",
        resourceId: parsed.activityId,
        resourceLabel: "Cambio administrativo",
        changedFields: ["review_status"],
        previousValues: { review_status: previousStatus },
        newValues: { review_status: parsed.status },
        summary: parsed.status === "reviewed" ? "Marcó un cambio como revisado" : "Indicó que un cambio requiere corrección",
        sourceEventKey: `activity:review:${parsed.activityId}:${review.id}:${recordString(review, "updated", 50) || parsed.status}`,
      });
      const reviewEventState = new Record(app.findCollectionByNameOrId(activityAudit.REVIEW_COLLECTION), {});
      reviewEventState.set("store", context.storeId);
      reviewEventState.set("activity", reviewEvent.id);
      reviewEventState.set("status", "reviewed");
      reviewEventState.set("note", "");
      reviewEventState.set("reviewed_by", context.actor.id);
      reviewEventState.set("reviewed_by_name_snapshot", recordString(context.actor, "display_name", 160) || recordString(context.actor, "name", 160) || "Administrador");
      reviewEventState.set("reviewed_at", new Date().toISOString());
      app.save(reviewEventState);
      response = {
        ok: true,
        review: {
          status: parsed.status,
          note: recordString(review, "note", 1000),
          reviewed_at: recordString(review, "reviewed_at", 50),
        },
      };
    });
    if (!response || requestActorId !== recordId(e.auth)) throw codedError("unauthorized");
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "activity_unavailable"); }
}

function reportPayload(body) {
  const filters = parseFilters(body);
  if (!RECORD_ID_PATTERN.test(filters.actorId)) throw codedError("invalid_payload");
  return filters;
}

function userReportSummary(app, storeId, actorId) {
  const row = queryOne(app, `
    SELECT
      COUNT(*) AS total_changes,
      COALESCE(SUM(CASE WHEN module = 'catalog' THEN 1 ELSE 0 END), 0) AS catalog_changes,
      COALESCE(SUM(CASE WHEN module = 'orders' THEN 1 ELSE 0 END), 0) AS order_changes,
      COALESCE(SUM(CASE WHEN changed_fields_json LIKE '%price%' OR changed_fields_json LIKE '%stock%' THEN 1 ELSE 0 END), 0) AS price_stock_changes,
      COALESCE(SUM(CASE WHEN changed_fields_json LIKE '%expiration_date%' THEN 1 ELSE 0 END), 0) AS expiration_changes,
      COALESCE(SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END), 0) AS critical_changes,
      COALESCE(MAX(created), '') AS last_activity
    FROM store_activity_audit
    WHERE store = {:storeId} AND actor_id_snapshot = {:actorId}
  `, { storeId, actorId }, { total_changes: 0, catalog_changes: 0, order_changes: 0, price_stock_changes: 0, expiration_changes: 0, critical_changes: 0, last_activity: "" });
  const pending = queryOne(app, `
    SELECT COUNT(*) AS pending
    FROM store_activity_audit a
    LEFT JOIN store_activity_reviews r ON r.activity = a.id
    WHERE a.store = {:storeId} AND a.actor_id_snapshot = {:actorId}
      AND COALESCE(r.status, 'pending') = 'pending'
  `, { storeId, actorId }, { pending: 0 });
  return {
    total_changes: count(row.total_changes),
    products: count(row.catalog_changes),
    orders: count(row.order_changes),
    price_stock: count(row.price_stock_changes),
    expirations: count(row.expiration_changes),
    last_activity: text(row.last_activity, 50),
    critical_changes: count(row.critical_changes),
    pending_reviews: count(pending.pending),
  };
}

function historicalActor(app, storeId, actorId) {
  const liveActor = findRecord(app, "users", actorId);
  if (liveActor
    && relationId(liveActor, "store") === storeId
    && ["store_admin", "store_staff"].includes(recordString(liveActor, "role", 40))) {
    return {
      name: recordString(liveActor, "display_name", 160)
        || recordString(liveActor, "name", 160)
        || "Usuario del equipo",
      state: "active",
    };
  }
  const row = queryOne(app, `
    SELECT actor_name_snapshot, MAX(actor) AS actor
    FROM store_activity_audit
    WHERE store = {:storeId} AND actor_id_snapshot = {:actorId}
    GROUP BY actor_name_snapshot
    ORDER BY MAX(created) DESC
    LIMIT 1
  `, { storeId, actorId }, { actor_name_snapshot: "", actor: "" });
  if (!text(row.actor_name_snapshot, 160)) throw codedError("activity_not_found");
  return { name: text(row.actor_name_snapshot, 160), state: text(row.actor, 40) ? "active" : "deleted" };
}

function handleUserReport(e) {
  setPrivateHeaders(e);
  try {
    const filters = reportPayload(e.requestInfo().body || {});
    const context = loadAccessContext($app, e, { storeId: filters.storeId, requirePrimary: true });
    const actor = historicalActor($app, context.storeId, filters.actorId);
    const result = listActivities($app, context, filters, { hideReviews: false, includeReviewNote: false });
    return e.json(200, { ok: true, actor, summary: userReportSummary($app, context.storeId, filters.actorId), ...result });
  } catch (error) { return sendError(e, error, "activity_unavailable"); }
}

function handleSelf(e) {
  setPrivateHeaders(e);
  try {
    const actorId = recordId(e.auth);
    if (!RECORD_ID_PATTERN.test(actorId)) throw codedError("unauthorized");
    const body = e.requestInfo().body || {};
    if (bodyKeys(body).includes("actor_id") || bodyKeys(body).includes("review_status") || bodyKeys(body).includes("store_id")) throw codedError("invalid_payload");
    const filters = parseFilters(body, { forcedActorId: actorId, hideReviews: true });
    const context = loadAccessContext($app, e, { storeId: "", requirePrimary: false });
    const result = listActivities($app, context, filters, { hideReviews: true, includeReviewNote: false });
    const ownSummary = userReportSummary($app, context.storeId, actorId);
    delete ownSummary.pending_reviews;
    return e.json(200, { ok: true, summary: ownSummary, ...result });
  } catch (error) { return sendError(e, error, "activity_unavailable"); }
}

function lastModifiedPayload(body) {
  if (!allowedPayload(body, ["store_id", "resources"], ["resources"])) throw codedError("invalid_payload");
  const raw = bodyValue(body, "resources");
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_RESOURCE_BATCH) throw codedError("invalid_payload");
  const seen = new Set();
  const resources = raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || !allowedPayload(item, ["type", "id"], ["type", "id"])) throw codedError("invalid_payload");
    const type = text(bodyValue(item, "type"), 80);
    const id = text(bodyValue(item, "id"), 80);
    if (!RESOURCE_TABLES[type]) throw codedError("unknown_resource_type");
    if (!RECORD_ID_PATTERN.test(id)) throw codedError("invalid_payload");
    const key = `${type}:${id}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { type, id };
  }).filter(Boolean);
  return { storeId: text(bodyValue(body, "store_id"), 15), resources };
}

function lastModifiedRows(app, storeId, resources) {
  const bindings = { storeId };
  const grouped = {};
  resources.forEach((resource) => {
    if (!grouped[resource.type]) grouped[resource.type] = [];
    grouped[resource.type].push(resource.id);
  });
  const ownershipSelects = [];
  let bindingIndex = 0;
  Object.keys(grouped).sort().forEach((type) => {
    const config = RESOURCE_TABLES[type];
    if (!config || !collectionExists(app, config.table)) return;
    if (config.parentTable && !collectionExists(app, config.parentTable)) return;
    const placeholders = grouped[type].map((id) => {
      const key = `resource${bindingIndex++}`;
      bindings[key] = id;
      return `{:${key}}`;
    });
    const tenantClause = config.selfStore
      ? "id = {:storeId}"
      : (config.parentTable
        ? `${config.parentField} IN (SELECT id FROM ${config.parentTable} WHERE store = {:storeId})`
        : `${config.store} = {:storeId}`);
    ownershipSelects.push(`
      SELECT '${type}' AS resource_type, id AS resource_id_snapshot
      FROM ${config.table}
      WHERE ${tenantClause} AND id IN (${placeholders.join(",")})
    `);
  });
  if (!ownershipSelects.length) return [];
  return queryRows(app, `
    WITH owned_resources AS (
      ${ownershipSelects.join(" UNION ALL ")}
    ), ranked_activity AS (
      SELECT a.*, ROW_NUMBER() OVER (
        PARTITION BY a.resource_type, a.resource_id_snapshot
        ORDER BY a.created DESC, a.id DESC
      ) AS row_number
      FROM store_activity_audit a
      INNER JOIN owned_resources owned
        ON owned.resource_type = a.resource_type
        AND owned.resource_id_snapshot = a.resource_id_snapshot
      WHERE a.store = {:storeId}
    )
    SELECT id, actor, actor_id_snapshot, actor_name_snapshot, severity, resource_type,
      resource_id_snapshot, summary, created
    FROM ranked_activity
    WHERE row_number = 1
  `, bindings, { id: "", actor: "", actor_id_snapshot: "", actor_name_snapshot: "", severity: "", resource_type: "", resource_id_snapshot: "", summary: "", created: "" });
}

function handleLastModified(e) {
  setPrivateHeaders(e);
  try {
    const parsed = lastModifiedPayload(e.requestInfo().body || {});
    const context = loadAccessContext($app, e, { storeId: parsed.storeId, requirePrimary: false });
    // Tenant ownership and latest-event selection are resolved in one grouped
    // SQL statement; the endpoint never performs a resource-by-resource query.
    const rows = lastModifiedRows($app, context.storeId, parsed.resources);
    const items = {};
    rows.forEach((row) => {
      const key = `${text(row.resource_type, 80)}:${text(row.resource_id_snapshot, 80)}`;
      items[key] = {
        actor_name: context.primary ? text(row.actor_name_snapshot, 160) : "",
        actor_state: text(row.actor, 40) ? "active" : (["system", "migration"].includes(text(row.actor_id_snapshot, 40)) ? text(row.actor_id_snapshot, 40) : "deleted"),
        created: text(row.created, 50),
        summary: context.primary ? text(row.summary, 500) : "",
        severity: activityAudit.SEVERITIES.includes(text(row.severity, 40)) ? text(row.severity, 40) : "normal",
      };
    });
    return e.json(200, { ok: true, items });
  } catch (error) { return sendError(e, error, "activity_unavailable"); }
}

module.exports = {
  MAX_RESOURCE_BATCH,
  PAGE_SIZE,
  RESOURCE_TABLES,
  REVIEW_STATUSES,
  actorOptions,
  activityRowById,
  allowedPayload,
  handleDetail,
  handleLastModified,
  handleList,
  handleReview,
  handleSelf,
  handleSummary,
  handleUserReport,
  historicalActor,
  lastModifiedPayload,
  listActivities,
  loadAccessContext,
  mapActivity,
  parseFilters,
  requireAuthenticatedUser,
  resourceExistence,
  resourcePath,
  reviewPayload,
  summaryForStore,
  userReportSummary,
};
