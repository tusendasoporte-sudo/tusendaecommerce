/// <reference path="../pb_data/types.d.ts" />

const audit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const permissionsApi = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_api_lib.js")
  : require(`${__hooks}/pz_promo_permissions_api_lib.js`);

const LIST_CONTRACT = "promo.audit.list.v1";
const DETAIL_CONTRACT = "promo.audit.detail.v1";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const MAX_PAGE_SIZE = 100;
const MAX_DATE_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const SAFE_ERROR_CODES = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan",
  "promo_not_found", "store_not_promo", "store_inactive", "promo_site_inactive",
  "promo_store_context_required", "promo_capability_denied", "promo_permission_denied",
  "invalid_payload", "promo_audit_not_found", "promo_audit_unavailable",
]);

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function safeText(value, max) {
  return audit.safeText(value, max || 1000);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    if (typeof normalized === "string") {
      const reparsed = JSON.parse(normalized);
      return reparsed && typeof reparsed === "object" && !Array.isArray(reparsed) ? reparsed : null;
    }
    return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
  } catch (_) { return null; }
}

function exactPayload(value, keys) {
  const object = plainObject(value);
  if (!object) return false;
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function allowedPayload(value, keys) {
  const object = plainObject(value);
  if (!object) return false;
  return Object.keys(object).every((key) => keys.includes(key));
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") {
    try {
      const value = body.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  return Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined;
}

function requestHeader(info, name) {
  const headers = info && info.headers || {};
  const lower = String(name || "").toLowerCase();
  const normalized = lower.replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return safeText(headers.get(name) || headers.get(lower) || headers.get(normalized), 80);
    }
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === normalized
  ));
  return key ? safeText(headers[key], 80) : "";
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e || !e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function errorCode(error) {
  const code = safeText(error && (error.code || error.message), 80);
  if (SAFE_ERROR_CODES.has(code)) return code;
  if (error instanceof audit.PromoAuditError) return "promo_audit_unavailable";
  return "promo_audit_unavailable";
}

function statusForError(error) {
  if (error && Number.isInteger(error.status)) return error.status;
  const code = errorCode(error);
  if (code === "invalid_payload") return 400;
  if (["promo_not_found", "store_not_promo", "promo_audit_not_found"].includes(code)) return 404;
  if (code === "promo_audit_unavailable") return 503;
  return 403;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(statusForError(error), { ok: false, error: code });
}

function auditReady(app) {
  try {
    const collection = app.findCollectionByNameOrId(audit.AUDIT_COLLECTION);
    return collection.listRule === null
      && collection.viewRule === null
      && collection.createRule === null
      && collection.updateRule === null
      && collection.deleteRule === null;
  } catch (_) { return false; }
}

function parseDate(value) {
  const raw = safeText(value, 50);
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw codedError("invalid_payload", 400);
  return date.toISOString();
}

function parseListPayload(body) {
  if (!exactPayload(body, ["contract", "page", "per_page", "filters"])
    || bodyValue(body, "contract") !== LIST_CONTRACT) return null;
  const page = bodyValue(body, "page");
  const perPage = bodyValue(body, "per_page");
  const filters = plainObject(bodyValue(body, "filters"));
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000
    || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > MAX_PAGE_SIZE
    || !filters
    || !allowedPayload(filters, ["module", "action", "severity", "resource_type", "date_from", "date_to"])) return null;
  for (const key of Object.keys(filters)) {
    if (typeof filters[key] !== "string") return null;
  }
  const moduleName = safeText(filters.module || "all", 40).toLowerCase();
  const action = safeText(filters.action, 100);
  const severity = safeText(filters.severity || "all", 40).toLowerCase();
  const resourceType = safeText(filters.resource_type, 80);
  if (!["all", ...audit.MODULES].includes(moduleName)
    || !["all", ...audit.SEVERITIES].includes(severity)
    || (action && !audit.ACTION_CATALOG[action])
    || (resourceType && !audit.RESOURCE_SAFE_FIELDS[resourceType])) return null;
  let dateFrom;
  let dateTo;
  try {
    dateFrom = parseDate(filters.date_from);
    dateTo = parseDate(filters.date_to);
  } catch (_) { return null; }
  if (Boolean(dateFrom) !== Boolean(dateTo)) return null;
  if (dateFrom && (new Date(dateTo).getTime() - new Date(dateFrom).getTime() < 0
    || new Date(dateTo).getTime() - new Date(dateFrom).getTime() > MAX_DATE_RANGE_MS)) return null;
  return { page, perPage, module: moduleName, action, severity, resourceType, dateFrom, dateTo };
}

function parseDetailPayload(body) {
  if (!exactPayload(body, ["contract", "event_id"])
    || bodyValue(body, "contract") !== DETAIL_CONTRACT) return null;
  if (typeof bodyValue(body, "event_id") !== "string") return null;
  const eventId = safeText(bodyValue(body, "event_id"), 15);
  return RECORD_ID_PATTERN.test(eventId) ? { eventId } : null;
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

const AUDIT_ROW_MODEL = Object.freeze({
  id: "", actor_snapshot_json: "", origin: "", module: "", action: "", severity: "",
  resource_type: "", resource_id_snapshot: "", changed_paths_json: "",
  previous_values_json: "", new_values_json: "", summary: "", created: "",
});

function selectAudit() {
  return `
    SELECT id, actor_snapshot_json, origin, module, action, severity,
      resource_type, resource_id_snapshot, changed_paths_json,
      previous_values_json, new_values_json, summary, created
    FROM promo_audit_events
  `;
}

function listWhere(siteId, filters) {
  const where = ["site = {:site}"];
  const bindings = { site: siteId };
  if (filters.module !== "all") { where.push("module = {:module}"); bindings.module = filters.module; }
  if (filters.action) { where.push("action = {:action}"); bindings.action = filters.action; }
  if (filters.severity !== "all") { where.push("severity = {:severity}"); bindings.severity = filters.severity; }
  if (filters.resourceType) { where.push("resource_type = {:resourceType}"); bindings.resourceType = filters.resourceType; }
  if (filters.dateFrom) {
    where.push("created >= {:dateFrom} AND created <= {:dateTo}");
    bindings.dateFrom = filters.dateFrom;
    bindings.dateTo = filters.dateTo;
  }
  return { sql: where.join(" AND "), bindings };
}

function loadDecision(e) {
  if (!auditReady(e.app)) throw codedError("promo_audit_unavailable", 503);
  const info = e.requestInfo();
  if (!info || !e.auth) throw codedError("unauthorized", 403);
  const supportStoreId = requestHeader(info, "X-PZ-Promo-Store");
  return permissionsApi.managementDecision(e.app, e.auth, supportStoreId);
}

function handleList(e) {
  setPrivateHeaders(e);
  try {
    const parsed = parseListPayload(e.requestInfo().body || {});
    if (!parsed) throw codedError("invalid_payload", 400);
    const decision = loadDecision(e);
    const siteId = audit.recordId(decision.site);
    const where = listWhere(siteId, parsed);
    const total = queryOne(e.app, `SELECT COUNT(*) AS total_items FROM promo_audit_events WHERE ${where.sql}`, where.bindings, { total_items: 0 });
    const rows = queryRows(e.app, `${selectAudit()} WHERE ${where.sql} ORDER BY created DESC, id DESC LIMIT {:limit} OFFSET {:offset}`, {
      ...where.bindings,
      limit: parsed.perPage,
      offset: (parsed.page - 1) * parsed.perPage,
    }, AUDIT_ROW_MODEL);
    const totalItems = count(total.total_items);
    return e.json(200, {
      ok: true,
      contract: LIST_CONTRACT,
      events: rows.map(audit.mapAuditRecord),
      pagination: {
        page: parsed.page,
        per_page: parsed.perPage,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / parsed.perPage)),
      },
    });
  } catch (error) { return sendError(e, error); }
}

function handleDetail(e) {
  setPrivateHeaders(e);
  try {
    const parsed = parseDetailPayload(e.requestInfo().body || {});
    if (!parsed) throw codedError("invalid_payload", 400);
    const decision = loadDecision(e);
    const rows = queryRows(e.app, `${selectAudit()} WHERE site = {:site} AND id = {:id} LIMIT 1`, {
      site: audit.recordId(decision.site), id: parsed.eventId,
    }, AUDIT_ROW_MODEL);
    if (!rows[0]) throw codedError("promo_audit_not_found", 404);
    return e.json(200, { ok: true, contract: DETAIL_CONTRACT, event: audit.mapAuditRecord(rows[0]) });
  } catch (error) { return sendError(e, error); }
}

module.exports = {
  DETAIL_CONTRACT,
  LIST_CONTRACT,
  MAX_DATE_RANGE_MS,
  MAX_PAGE_SIZE,
  SAFE_ERROR_CODES,
  auditReady,
  errorCode,
  exactPayload,
  handleDetail,
  handleList,
  parseDetailPayload,
  parseListPayload,
  requireAuthenticatedUser,
  statusForError,
};
