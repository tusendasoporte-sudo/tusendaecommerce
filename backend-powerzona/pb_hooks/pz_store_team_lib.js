/// <reference path="../pb_data/types.d.ts" />

const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const masterUsers = typeof __hooks === "undefined"
  ? require("./pz_master_store_users_lib.js")
  : require(`${__hooks}/pz_master_store_users_lib.js`);
const activityAudit = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);
const deleteReasons = typeof __hooks === "undefined"
  ? require("./pz_store_team_delete_reasons_lib.js")
  : require(`${__hooks}/pz_store_team_delete_reasons_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ASSIGNABLE_PERMISSIONS = 28;
const STORE_ROLES = Object.freeze(["store_admin", "store_staff"]);
const USER_STATUSES = Object.freeze(["active", "suspended"]);
const TEMPLATE_CODES = Object.freeze([
  "secondary_admin",
  "catalog_inventory",
  "orders_shipping",
  "marketing_promotions",
  "read_only",
  "custom",
]);
const TEAM_AUDIT_ACTIONS = Object.freeze([
  "team_user_created",
  "team_user_updated",
  "team_user_suspended",
  "team_user_reactivated",
  "team_permissions_changed",
  "team_permissions_normalized",
  "team_template_changed",
  "team_sessions_revoked",
  "team_devices_revoked",
  "team_temporary_password_issued",
  "primary_admin_assigned",
  "primary_admin_replaced",
  "plan_access_locked",
  "plan_access_restored",
]);
const SAFE_ERRORS = new Set([
  "unauthorized",
  "permission_denied",
  "blocked_by_plan",
  "principal_not_configured",
  "invalid_payload",
  "invalid_email",
  "invalid_template",
  "invalid_permissions",
  "reserved_permission",
  "user_not_found",
  "email_exists",
  "active_user_limit_reached",
  "primary_admin_protected",
  "delete_confirmation_mismatch",
  "delete_reason_required",
  "delete_reason_invalid",
  "delete_reason_detail_required",
  "delete_reason_detail_too_short",
  "delete_reason_detail_too_long",
  "delete_reason_detail_invalid",
  "user_delete_failed",
  "user_already_suspended",
  "user_already_active",
  "team_unavailable",
  "team_create_failed",
  "team_update_failed",
  "temporary_password_issue_failed",
  "session_revocation_failed",
  "device_revocation_failed",
  "audit_load_failed",
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

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function safeDate(record, key) {
  const raw = recordString(record, key);
  if (!raw) return "";
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function bounded(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function isValidId(value) {
  return typeof value === "string" && RECORD_ID_PATTERN.test(value);
}

function exactPayload(body, keys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") {
    try {
      const value = body.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
  return undefined;
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
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function codedError(code) {
  const safe = SAFE_ERRORS.has(code) ? code : "team_unavailable";
  const error = new Error(safe);
  error.code = safe;
  return error;
}

function errorCode(error) {
  const value = String(error && (error.code || error.message) || "");
  return SAFE_ERRORS.has(value) ? value : "";
}

function statusForError(code) {
  if (["unauthorized", "permission_denied", "blocked_by_plan"].includes(code)) return 403;
  if (code === "user_not_found") return 404;
  if ([
    "principal_not_configured",
    "email_exists",
    "active_user_limit_reached",
    "primary_admin_protected",
    "user_already_suspended",
    "user_already_active",
  ].includes(code)) return 409;
  if ([
    "invalid_payload", "invalid_email", "invalid_template", "invalid_permissions", "reserved_permission",
    "delete_confirmation_mismatch", "delete_reason_required", "delete_reason_invalid",
    "delete_reason_detail_required", "delete_reason_detail_too_short", "delete_reason_detail_too_long",
    "delete_reason_detail_invalid",
  ].includes(code)) return 400;
  if (code === "team_unavailable") return 503;
  return 500;
}

function sendError(e, error, fallback) {
  const code = errorCode(error) || fallback;
  return e.json(statusForError(code), { ok: false, error: code });
}

function findRecord(app, collection, id) {
  if (!app || !isValidId(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows;
}

function queryOne(app, sql, bindings, model) {
  const rows = queryRows(app, sql, bindings, model);
  return rows.length ? rows[0] : null;
}

function countValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function activeStoreUser(user) {
  return !!user
    && STORE_ROLES.includes(recordString(user, "role"))
    && recordString(user, "status") === "active"
    && isValidId(relationId(user, "store"));
}

function activeMaster(user) {
  return !!user && recordString(user, "role") === "master_admin" && recordString(user, "status") === "active";
}

function requestHeader(info, name) {
  const lower = String(name || "").toLowerCase();
  const target = lower.replace(/-/g, "_");
  const headers = info && info.headers || {};
  try {
    if (typeof headers.get === "function") return bounded(headers.get(name) || headers.get(lower) || headers.get(target), 80);
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase().replace(/-/g, "_") === target);
  return key ? bounded(headers[key], 80) : "";
}

function teamReady(app) {
  try {
    const stores = app.findCollectionByNameOrId("stores");
    const access = app.findCollectionByNameOrId("store_user_access");
    const audit = app.findCollectionByNameOrId("store_user_audit");
    const activity = app.findCollectionByNameOrId("store_activity_audit");
    const reviews = app.findCollectionByNameOrId("store_activity_reviews");
    return !!stores.fields.getByName("primary_admin_user")
      && !!access.fields.getByName("permissions_json")
      && !!access.fields.getByName("template_code")
      && access.listRule === null
      && access.viewRule === null
      && !!audit.fields.getByName("previous_permissions_json")
      && !!audit.fields.getByName("new_permissions_json")
      && activity.listRule === null
      && activity.viewRule === null
      && activity.createRule === null
      && activity.updateRule === null
      && activity.deleteRule === null
      && reviews.listRule === null
      && reviews.viewRule === null;
  } catch (_) { return false; }
}

function storePlan(store) {
  const maxAccess = capabilities.resolveStoreCapabilityAccess(store, "max_active_users", { enforceExpiration: true });
  const expirationAccess = capabilities.resolveStoreCapabilityAccess(store, "product_expiration_tools_enabled", { enforceExpiration: true });
  const pushAccess = capabilities.resolveStoreCapabilityAccess(store, "push_campaigns_enabled", { enforceExpiration: true });
  if (!maxAccess || !Number.isInteger(maxAccess.limit) || maxAccess.limit < 1) throw codedError("team_unavailable");
  return {
    code: bounded(maxAccess.plan, 30),
    label: maxAccess.plan === "premium" ? "Plan Premium" : maxAccess.plan === "basic" ? "Plan Básico" : "Plan Free",
    max_active_users: permissions.effectiveMaxActiveUsers(store),
    product_expiration_tools_enabled: expirationAccess && expirationAccess.allowed === true,
    push_campaigns_enabled: pushAccess && pushAccess.allowed === true,
  };
}

function teamCounts(app, storeId) {
  const row = queryOne(app, `
    SELECT
      COUNT(*) AS totalUsers,
      COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS activeUsers,
      COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspendedUsers
    FROM users
    WHERE store = {:storeId} AND role IN ('store_admin', 'store_staff')
  `, { storeId }, { totalUsers: 0, activeUsers: 0, suspendedUsers: 0 }) || {};
  return {
    total: countValue(row.totalUsers),
    active: countValue(row.activeUsers),
    suspended: countValue(row.suspendedUsers),
  };
}

function lockStore(app, storeId) {
  app.db().newQuery("UPDATE stores SET id = id WHERE id = {:storeId}").bind({ storeId }).execute();
}

function loadActorContext(app, actorId, requirePrimary, requestedStoreId) {
  const actor = findRecord(app, "users", actorId);
  const master = activeMaster(actor);
  if (!master && !activeStoreUser(actor)) throw codedError("unauthorized");
  const storeId = master ? bounded(requestedStoreId, 15) : relationId(actor, "store");
  if (!isValidId(storeId)) throw codedError("unauthorized");
  const store = findRecord(app, "stores", storeId);
  if (!store || (!master && recordString(store, "status") !== "active")) throw codedError("unauthorized");
  if (!master && permissions.isBlockedByPlan(app, actor, store)) throw codedError("blocked_by_plan");
  const isPrimary = master || permissions.isPrimaryAdmin(app, actor, store);
  if (requirePrimary && !isPrimary) {
    if (!relationId(store, "primary_admin_user")) throw codedError("principal_not_configured");
    throw codedError("permission_denied");
  }
  return { actor, store, isPrimary, master };
}

function requestContext(e, parser, requirePrimary) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!info || (!activeStoreUser(info.auth) && !activeMaster(info.auth))) throw codedError("unauthorized");
    if (!teamReady($app)) throw codedError("team_unavailable");
    const parsed = parser(info.body || {});
    const actorId = recordString(info.auth, "id");
    if (!parsed || !isValidId(actorId)) throw codedError("invalid_payload");
    const supportStoreId = activeMaster(info.auth) ? requestHeader(info, "X-PZ-Support-Store") : "";
    const loaded = loadActorContext($app, actorId, requirePrimary !== false, supportStoreId);
    return { info, parsed, actorId, ...loaded };
  } catch (error) {
    return { error };
  }
}

function parseEmpty(body) {
  return exactPayload(body, []) ? {} : null;
}

function parseTarget(body) {
  if (!exactPayload(body, ["user_id"])) return null;
  const userId = bodyValue(body, "user_id");
  return isValidId(userId) ? { userId } : null;
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : "";
}

function plainPermissionArray(value) {
  try {
    const cloned = JSON.parse(JSON.stringify(value));
    if (Array.isArray(cloned)) return cloned;
  } catch (_) {}
  if (Array.isArray(value)) {
    const cloned = [];
    for (let index = 0; index < value.length; index += 1) cloned.push(String(value[index]));
    return cloned;
  }
  if (value !== null && value !== undefined && Number.isInteger(Number(value.length))) {
    const length = Number(value.length);
    if (length >= 0 && length <= MAX_ASSIGNABLE_PERMISSIONS) {
      const cloned = [];
      for (let index = 0; index < length; index += 1) cloned.push(String(value[index]));
      return cloned;
    }
  }
  return null;
}

function normalizedRawPermissions(value) {
  const values = plainPermissionArray(value);
  if (!values || values.length > MAX_ASSIGNABLE_PERMISSIONS) {
    throw codedError("invalid_permissions");
  }
  const raw = values.map((item) => typeof item === "string" ? item.trim() : "");
  if (raw.some((item) => !item)) throw codedError("invalid_permissions");
  if (raw.some((item) => permissions.RESERVED_PERMISSIONS.includes(item))) throw codedError("reserved_permission");
  if (raw.some((item) => !permissions.ASSIGNABLE_PERMISSION_KEYS.includes(item))) throw codedError("invalid_permissions");
  return raw.filter((item, index, values) => values.indexOf(item) === index).sort();
}

function normalizedPermissionsResult(value) {
  const input = [];
  if (value && typeof value.some === "function") {
    value.some((item) => {
      input.push(String(item));
      return false;
    });
  } else {
    const cloned = plainPermissionArray(value);
    if (!cloned) throw codedError("invalid_permissions");
    cloned.forEach((item) => input.push(String(item)));
  }
  if (input.length > MAX_ASSIGNABLE_PERMISSIONS) throw codedError("invalid_permissions");
  const selected = {};
  for (let index = 0; index < input.length; index += 1) {
    const key = String(input[index] === null || input[index] === undefined ? "" : input[index]).trim();
    if (!permissions.ASSIGNABLE_PERMISSION_KEYS.includes(key)) throw codedError("invalid_permissions");
    selected[key] = true;
  }
  let changed = true;
  while (changed) {
    changed = false;
    Object.keys(selected).forEach((key) => {
      const dependencies = permissions.PERMISSION_DEPENDENCIES[key];
      const length = Number(dependencies && dependencies.length);
      for (let index = 0; Number.isInteger(length) && index < length; index += 1) {
        const dependency = dependencies[index];
        if (!permissions.ASSIGNABLE_PERMISSION_KEYS.includes(dependency) || selected[dependency]) continue;
        selected[dependency] = true;
        changed = true;
      }
    });
  }
  return Object.keys(selected).sort();
}

function permissionSelection(templateCode, rawPermissions) {
  if (!TEMPLATE_CODES.includes(templateCode)) throw codedError("invalid_template");
  const raw = normalizedRawPermissions(rawPermissions);
  const normalized = normalizedPermissionsResult(raw);
  if (templateCode === "custom") return { templateCode, permissions: normalized };
  const template = permissions.PERMISSION_TEMPLATES[templateCode];
  const templatePermissions = normalizedPermissionsResult(template && template.permissions);
  const exact = normalized.length === templatePermissions.length
    && normalized.every((key, index) => key === templatePermissions[index]);
  return { templateCode: exact ? templateCode : "custom", permissions: normalized };
}

function parseMutable(body, includeTarget) {
  const keys = ["email", "display_name", "phone", "template_code", "permissions", "reason"];
  if (includeTarget) keys.unshift("user_id");
  if (!exactPayload(body, keys)) return null;
  const userId = includeTarget ? bodyValue(body, "user_id") : "";
  const email = normalizeEmail(bodyValue(body, "email"));
  const displayName = bodyValue(body, "display_name");
  const phone = bodyValue(body, "phone");
  const templateCode = bodyValue(body, "template_code");
  const reason = bodyValue(body, "reason");
  if ((includeTarget && !isValidId(userId)) || !email) throw codedError("invalid_email");
  if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 140) return null;
  if (typeof phone !== "string" || phone.length > 60 || typeof reason !== "string" || reason.length > 500) return null;
  const selection = permissionSelection(templateCode, bodyValue(body, "permissions"));
  return {
    userId,
    email,
    displayName: displayName.trim(),
    phone: phone.trim(),
    reason: reason.trim(),
    ...selection,
  };
}

function parseCreate(body) { return parseMutable(body, false); }
function parseUpdate(body) { return parseMutable(body, true); }

function parseAction(body) {
  if (!exactPayload(body, ["user_id", "reason"])) return null;
  const userId = bodyValue(body, "user_id");
  const reason = bodyValue(body, "reason");
  if (!isValidId(userId) || typeof reason !== "string" || reason.length > 500) return null;
  return { userId, reason: reason.trim() };
}

function parseDelete(body) {
  if (!exactPayload(body, ["user_id", "confirmation_email", "reason_code", "reason_detail"])) return null;
  const userId = bodyValue(body, "user_id");
  const confirmationEmail = normalizeEmail(bodyValue(body, "confirmation_email"));
  if (!isValidId(userId)) return null;
  if (!confirmationEmail) throw codedError("delete_confirmation_mismatch");
  const validatedReason = deleteReasons.validateStoreDeleteReason(
    bodyValue(body, "reason_code"),
    bodyValue(body, "reason_detail"),
  );
  if (!validatedReason.ok) throw codedError(validatedReason.error);
  return { userId, confirmationEmail, deletionReason: validatedReason.value };
}

function parseAudit(body) {
  if (!exactPayload(body, ["user_id", "page", "per_page"])) return null;
  const userId = bodyValue(body, "user_id");
  const page = bodyValue(body, "page");
  const perPage = bodyValue(body, "per_page");
  if (!isValidId(userId) || !Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 50) return null;
  return { userId, page, perPage };
}

function loadTarget(app, store, userId) {
  const target = findRecord(app, "users", userId);
  if (!target || relationId(target, "store") !== store.id || !STORE_ROLES.includes(recordString(target, "role"))) {
    throw codedError("user_not_found");
  }
  if (permissions.isPrimaryAdmin(app, target, store)) throw codedError("primary_admin_protected");
  return target;
}

function findAccess(app, storeId, userId) {
  try {
    return app.findFirstRecordByFilter(
      "store_user_access",
      "store = {:storeId} && user = {:userId}",
      { storeId, userId }
    );
  } catch (_) { return null; }
}

function jsonPermissions(record) {
  try {
    if (record && typeof record.getStringSlice === "function") {
      return normalizedPermissionsResult(record.getStringSlice("permissions_json"));
    }
  } catch (_) {}
  const value = recordValue(record, "permissions_json");
  if (Array.isArray(value)) return normalizedPermissionsResult(value);
  if (typeof value === "string" && value) {
    try { return normalizedPermissionsResult(JSON.parse(value)); } catch (_) { return []; }
  }
  if (value && Array.isArray(value.permissions)) return normalizedPermissionsResult(value.permissions);
  return [];
}

function saveAccess(app, store, user, actor, templateCode, selectedPermissions) {
  let access = findAccess(app, store.id, user.id);
  const isNew = !access;
  if (!access) access = new Record(app.findCollectionByNameOrId("store_user_access"), {});
  access.set("store", store.id);
  access.set("user", user.id);
  access.set("template_code", templateCode);
  access.set("permissions_json", selectedPermissions.slice().sort());
  if (isNew) access.set("created_by", actor.id);
  access.set("updated_by", actor.id);
  app.save(access);
  return access;
}

function roleForTemplate(templateCode) {
  return templateCode === "secondary_admin" ? "store_admin" : "store_staff";
}

function userSnapshot(user, access) {
  return {
    email: bounded(recordString(user, "email").toLowerCase(), 254),
    display_name: bounded(recordString(user, "display_name") || recordString(user, "name") || recordString(user, "email"), 140),
    phone: bounded(recordString(user, "phone"), 60),
    role: STORE_ROLES.includes(recordString(user, "role")) ? recordString(user, "role") : "",
    status: USER_STATUSES.includes(recordString(user, "status")) ? recordString(user, "status") : "",
    template_code: access ? bounded(recordString(access, "template_code"), 40) : "",
    permissions: access ? jsonPermissions(access) : [],
  };
}

function deviceSummary(app, userId) {
  const row = queryOne(app, `
    SELECT
      COALESCE(SUM(CASE WHEN status = 'authorized' THEN 1 ELSE 0 END), 0) AS deviceCount,
      COALESCE(MAX(last_seen_at), '') AS lastSeenAt
    FROM store_user_devices WHERE user = {:userId}
  `, { userId }, { deviceCount: 0, lastSeenAt: "" }) || {};
  const raw = String(row.lastSeenAt || "").trim();
  const parsed = raw ? new Date(raw.includes("T") ? raw : raw.replace(" ", "T")) : null;
  return {
    authorized_device_count: countValue(row.deviceCount),
    last_activity_at: parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "",
  };
}

function teamUserResponse(app, store, user) {
  const primary = permissions.isPrimaryAdmin(app, user, store);
  const access = primary ? null : findAccess(app, store.id, user.id);
  const snapshot = userSnapshot(user, access);
  const blocked = permissions.isBlockedByPlan(app, user, store);
  const temporaryState = masterUsers.temporaryPasswordState(user);
  const devices = deviceSummary(app, user.id);
  let state = "active";
  if (snapshot.status === "suspended") state = "suspended";
  else if (blocked) state = "blocked_by_plan";
  else if (temporaryState === "expired") state = "temporary_password_expired";
  else if (temporaryState === "pending") state = "temporary_password_pending";
  return {
    id: String(user.id || "").slice(0, 15),
    email: snapshot.email,
    display_name: snapshot.display_name,
    phone: snapshot.phone,
    role: snapshot.role,
    status: snapshot.status,
    template_code: primary ? "primary_admin" : (snapshot.template_code || "custom"),
    permissions: primary ? [] : snapshot.permissions,
    state,
    is_primary_admin: primary,
    blocked_by_plan: blocked,
    temporary_password_state: temporaryState,
    temporary_password_expires_at: safeDate(user, "temporary_password_expires_at"),
    created: safeDate(user, "created"),
    updated: safeDate(user, "updated"),
    ...devices,
  };
}

function listTeamUsers(app, store) {
  const rows = queryRows(app, `
    SELECT id FROM users
    WHERE store = {:storeId} AND role IN ('store_admin', 'store_staff')
    ORDER BY CASE WHEN id = {:primaryId} THEN 0 ELSE 1 END,
      CASE WHEN status = 'active' THEN 0 ELSE 1 END,
      LOWER(COALESCE(display_name, '')), LOWER(email), id
  `, { storeId: store.id, primaryId: relationId(store, "primary_admin_user") }, { id: "" });
  return rows.map((row) => findRecord(app, "users", String(row.id || ""))).filter(Boolean);
}

function activeAdditionalUsers(app, store) {
  const rows = queryRows(app, `
    SELECT id FROM users
    WHERE store = {:storeId}
      AND id != {:primaryId}
      AND role IN ('store_admin', 'store_staff')
      AND status = 'active'
    ORDER BY created, id
  `, { storeId: store.id, primaryId: relationId(store, "primary_admin_user") }, { id: "" });
  return rows.map((row) => findRecord(app, "users", String(row.id || ""))).filter(Boolean);
}

function summaryPayload(app, store) {
  const plan = storePlan(store);
  const counts = teamCounts(app, store.id);
  const primaryId = relationId(store, "primary_admin_user");
  const primaryUser = primaryId ? findRecord(app, "users", primaryId) : null;
  const effectiveActive = listTeamUsers(app, store).filter((user) => (
    recordString(user, "status") === "active"
      && !permissions.isBlockedByPlan(app, user, store)
  )).length;
  return {
    store: {
      name: bounded(recordString(store, "name"), 140),
      slug: bounded(recordString(store, "slug"), 80),
    },
    primary_admin: primaryUser ? teamUserResponse(app, store, primaryUser) : null,
    principal_pending: !primaryId,
    plan,
    user_counts: {
      total: counts.total,
      active: effectiveActive,
      stored_active: counts.active,
      suspended: counts.suspended,
      available: Math.max(0, plan.max_active_users - effectiveActive),
    },
    can_create: !!primaryId && plan.max_active_users > counts.active,
  };
}

function emailExists(app, email, excludeId) {
  const row = queryOne(app, `
    SELECT COUNT(*) AS matches FROM users
    WHERE LOWER(email) = {:email} AND ({:excludeId} = '' OR id != {:excludeId})
  `, { email, excludeId: excludeId || "" }, { matches: 0 }) || {};
  return countValue(row.matches) > 0;
}

function generateTemporaryPassword() {
  if (typeof $security === "undefined" || typeof $security.randomStringWithAlphabet !== "function") {
    throw codedError("temporary_password_issue_failed");
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return `T84!${$security.randomStringWithAlphabet(20, alphabet)}`;
}

function createUser(app, store, parsed) {
  const password = generateTemporaryPassword();
  const user = new Record(app.findCollectionByNameOrId("users"), {});
  user.setEmail(parsed.email);
  user.setEmailVisibility(true);
  user.setPassword(password);
  user.set("display_name", parsed.displayName);
  user.set("phone", parsed.phone);
  user.set("role", roleForTemplate(parsed.templateCode));
  user.set("status", "active");
  user.set("store", store.id);
  const temporary = masterUsers.temporaryPasswordDates();
  user.set("must_change_password", true);
  user.set("temporary_password_issued_at", temporary.issued_at);
  user.set("temporary_password_expires_at", temporary.expires_at);
  try { app.save(user); } catch (error) {
    if (emailExists(app, parsed.email, "")) throw codedError("email_exists");
    throw codedError("team_create_failed");
  }
  return { user, password, temporary };
}

function setAuditField(record, key, value) {
  try {
    const collection = record.collection ? record.collection() : null;
    if (collection && collection.fields && !collection.fields.getByName(key)) return;
  } catch (_) {}
  record.set(key, value);
}

function createCentralTeamActivity(app, store, actor, target, action, previous, next, specializedAudit) {
  const safeSnapshot = (snapshot) => {
    if (!snapshot) return {};
    return {
      display_name: bounded(snapshot.display_name, 140),
      role: STORE_ROLES.includes(snapshot.role) ? snapshot.role : "",
      status: USER_STATUSES.includes(snapshot.status) ? snapshot.status : "",
      template_code: TEMPLATE_CODES.includes(snapshot.template_code) ? snapshot.template_code : "",
      permissions: Array.isArray(snapshot.permissions) ? snapshot.permissions.slice(0, MAX_ASSIGNABLE_PERMISSIONS) : [],
    };
  };
  const before = safeSnapshot(previous);
  const after = safeSnapshot(next);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const name = bounded(after.display_name || before.display_name || recordString(target, "display_name") || "Usuario del equipo", 140);
  const summaries = {
    team_user_created: `Creó el acceso de ${name}`,
    team_user_updated: `Actualizó datos y permisos de ${name}`,
    team_user_suspended: `Suspendió temporalmente a ${name}`,
    team_user_reactivated: `Reactivó el acceso de ${name}`,
    team_permissions_normalized: `Normalizó los permisos de ${name}`,
    team_sessions_revoked: `Cerró las sesiones de ${name}`,
    team_devices_revoked: `Revocó los dispositivos de ${name}`,
    team_temporary_password_issued: `Emitió acceso temporal para ${name}`,
    primary_admin_assigned: `Asignó a ${name} como Administrador principal`,
    primary_admin_replaced: `Reemplazó al Administrador principal por ${name}`,
    plan_access_locked: `Bloqueó por plan el acceso de ${name}`,
    plan_access_restored: `Restauró por plan el acceso de ${name}`,
  };
  return activityAudit.createActivity(app, {
    storeId: store.id,
    actor,
    origin: actor ? undefined : "system",
    module: "team",
    action,
    severity: ["team_user_suspended", "team_user_updated", "team_permissions_normalized", "primary_admin_assigned", "primary_admin_replaced", "plan_access_locked"].includes(action) ? "critical" : "important",
    resourceType: "team_user",
    resourceId: target && target.id,
    resourceLabel: name,
    changedFields: changed,
    previousValues: before,
    newValues: after,
    summary: summaries[action] || `Actualizó el acceso de ${name}`,
    sourceEventKey: `team:${action}:${specializedAudit.id}`,
  });
}

function createTeamAudit(app, store, actor, target, action, previous, next, reason, sessionsRevoked, skipCentral) {
  if (!TEAM_AUDIT_ACTIONS.includes(action)) throw codedError("team_unavailable");
  const record = new Record(app.findCollectionByNameOrId("store_user_audit"), {});
  const actorName = bounded(recordString(actor, "display_name") || recordString(actor, "email") || "Sistema", 160);
  const values = {
    store: store.id,
    store_id_snapshot: store.id,
    store_name_snapshot: bounded(recordString(store, "name"), 140),
    store_slug_snapshot: bounded(recordString(store, "slug"), 80),
    target_user: target ? target.id : "",
    target_user_id_snapshot: target ? target.id : "",
    actor: actor && actor.id ? actor.id : "",
    actor_name_snapshot: actorName,
    actor_role_snapshot: activeMaster(actor) ? "master_admin" : (recordString(actor, "role") || "system"),
    action,
    previous_email: previous && previous.email || "",
    new_email: next && next.email || "",
    previous_display_name: previous && previous.display_name || "",
    new_display_name: next && next.display_name || "",
    previous_phone: previous && previous.phone || "",
    new_phone: next && next.phone || "",
    previous_role: previous && previous.role || "",
    new_role: next && next.role || "",
    previous_status: previous && previous.status || "",
    new_status: next && next.status || "",
    previous_template_code: previous && previous.template_code || "",
    new_template_code: next && next.template_code || "",
    previous_permissions_json: previous && previous.permissions || [],
    new_permissions_json: next && next.permissions || [],
    sessions_revoked: sessionsRevoked === true,
    reason: bounded(reason, 500),
  };
  Object.keys(values).forEach((key) => setAuditField(record, key, values[key]));
  app.save(record);
  if (skipCentral !== true) createCentralTeamActivity(app, store, actor, target, action, previous, next, record);
  return record;
}

function handleAccessContext(e) {
  const context = requestContext(e, parseEmpty, false);
  if (context.error) return sendError(e, context.error, "team_unavailable");
  try {
    const resolved = context.master
      ? permissions.ASSIGNABLE_PERMISSION_KEYS.slice()
      : permissions.resolveEffectiveStorePermissions($app, context.actor, context.store);
    const effective = Array.isArray(resolved) ? resolved : (resolved.permissions || []);
    const access = context.master ? null : findAccess($app, context.store.id, context.actor.id);
    return e.json(200, {
      ok: true,
      user: {
        display_name: bounded(recordString(context.actor, "display_name"), 140),
        role: recordString(context.actor, "role"),
      },
      store: {
        name: bounded(recordString(context.store, "name"), 140),
        slug: bounded(recordString(context.store, "slug"), 80),
      },
      access: {
        is_primary_admin: context.isPrimary,
        blocked_by_plan: false,
        permissions: effective.slice().sort(),
        template_code: context.master ? "primary_admin" : (context.isPrimary ? "primary_admin" : bounded(recordString(access, "template_code"), 40)),
      },
      plan: storePlan(context.store),
    });
  } catch (error) { return sendError(e, error, "team_unavailable"); }
}

function handleSummary(e) {
  const context = requestContext(e, parseEmpty, true);
  if (context.error) return sendError(e, context.error, "team_unavailable");
  try { return e.json(200, { ok: true, ...summaryPayload($app, context.store) }); }
  catch (error) { return sendError(e, error, "team_unavailable"); }
}

function handleList(e) {
  const context = requestContext(e, parseEmpty, true);
  if (context.error) return sendError(e, context.error, "team_unavailable");
  try {
    return e.json(200, {
      ok: true,
      ...summaryPayload($app, context.store),
      users: listTeamUsers($app, context.store).map((user) => teamUserResponse($app, context.store, user)),
    });
  } catch (error) { return sendError(e, error, "team_unavailable"); }
}

function handleDetail(e) {
  const context = requestContext(e, parseTarget, true);
  if (context.error) return sendError(e, context.error, "team_unavailable");
  try {
    const target = loadTarget($app, context.store, context.parsed.userId);
    return e.json(200, { ok: true, user: teamUserResponse($app, context.store, target), ...summaryPayload($app, context.store) });
  } catch (error) { return sendError(e, error, "team_unavailable"); }
}

function handleCreate(e) {
  const context = requestContext(e, parseCreate, true);
  if (context.error) return sendError(e, context.error, "team_create_failed");
  let response = null;
  try {
    $app.runInTransaction((app) => {
      lockStore(app, context.store.id);
      const loaded = loadActorContext(app, context.actorId, true, context.store.id);
      if (emailExists(app, context.parsed.email, "")) throw codedError("email_exists");
      const plan = storePlan(loaded.store);
      const counts = teamCounts(app, loaded.store.id);
      if (counts.active >= plan.max_active_users) throw codedError("active_user_limit_reached");
      const created = createUser(app, loaded.store, context.parsed);
      const access = saveAccess(app, loaded.store, created.user, loaded.actor, context.parsed.templateCode, context.parsed.permissions);
      const next = userSnapshot(created.user, access);
      createTeamAudit(app, loaded.store, loaded.actor, created.user, "team_user_created", null, next, context.parsed.reason, false);
      createTeamAudit(app, loaded.store, loaded.actor, created.user, "team_temporary_password_issued", next, next, context.parsed.reason, false, true);
      response = {
        ok: true,
        user: teamUserResponse(app, loaded.store, created.user),
        temporary_password: created.password,
        temporary_password_expires_at: created.temporary.expires_at,
        plan,
      };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "team_create_failed"); }
}

function handleUpdate(e) {
  const context = requestContext(e, parseUpdate, true);
  if (context.error) return sendError(e, context.error, "team_update_failed");
  let response = null;
  try {
    $app.runInTransaction((app) => {
      lockStore(app, context.store.id);
      const loaded = loadActorContext(app, context.actorId, true, context.store.id);
      const target = loadTarget(app, loaded.store, context.parsed.userId);
      const previousAccess = findAccess(app, loaded.store.id, target.id);
      const previous = userSnapshot(target, previousAccess);
      if (emailExists(app, context.parsed.email, target.id)) throw codedError("email_exists");
      const nextRole = roleForTemplate(context.parsed.templateCode);
      const sessionsRevoked = previous.email !== context.parsed.email || previous.role !== nextRole
        || previous.template_code !== context.parsed.templateCode
        || previous.permissions.join("|") !== context.parsed.permissions.join("|");
      target.setEmail(context.parsed.email);
      target.set("display_name", context.parsed.displayName);
      target.set("phone", context.parsed.phone);
      target.set("role", nextRole);
      if (sessionsRevoked) target.refreshTokenKey();
      try { app.save(target); } catch (error) {
        if (emailExists(app, context.parsed.email, target.id)) throw codedError("email_exists");
        throw codedError("team_update_failed");
      }
      const access = saveAccess(app, loaded.store, target, loaded.actor, context.parsed.templateCode, context.parsed.permissions);
      const next = userSnapshot(target, access);
      createTeamAudit(app, loaded.store, loaded.actor, target, "team_user_updated", previous, next, context.parsed.reason, sessionsRevoked);
      if (previous.template_code !== next.template_code) {
        createTeamAudit(app, loaded.store, loaded.actor, target, "team_template_changed", previous, next, context.parsed.reason, sessionsRevoked, true);
      }
      if (previous.permissions.join("|") !== next.permissions.join("|")) {
        createTeamAudit(app, loaded.store, loaded.actor, target, "team_permissions_changed", previous, next, context.parsed.reason, sessionsRevoked, true);
      }
      response = { ok: true, user: teamUserResponse(app, loaded.store, target), sessions_revoked: sessionsRevoked };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "team_update_failed"); }
}

function mutateStatus(e, nextStatus) {
  const context = requestContext(e, parseAction, true);
  if (context.error) return sendError(e, context.error, "team_update_failed");
  let response = null;
  try {
    $app.runInTransaction((app) => {
      lockStore(app, context.store.id);
      const loaded = loadActorContext(app, context.actorId, true, context.store.id);
      const target = loadTarget(app, loaded.store, context.parsed.userId);
      const access = findAccess(app, loaded.store.id, target.id);
      const previous = userSnapshot(target, access);
      if (previous.status === nextStatus) throw codedError(nextStatus === "active" ? "user_already_active" : "user_already_suspended");
      if (nextStatus === "active") {
        const plan = storePlan(loaded.store);
        const counts = teamCounts(app, loaded.store.id);
        if (counts.active >= plan.max_active_users) throw codedError("active_user_limit_reached");
      }
      target.set("status", nextStatus);
      target.refreshTokenKey();
      app.save(target);
      const next = userSnapshot(target, access);
      const action = nextStatus === "active" ? "team_user_reactivated" : "team_user_suspended";
      createTeamAudit(app, loaded.store, loaded.actor, target, action, previous, next, context.parsed.reason, true);
      response = { ok: true, user: teamUserResponse(app, loaded.store, target), sessions_revoked: true };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "team_update_failed"); }
}

function handleSuspend(e) { return mutateStatus(e, "suspended"); }
function handleReactivate(e) { return mutateStatus(e, "active"); }

function handleIssueTemporaryAccess(e) {
  const context = requestContext(e, parseAction, true);
  if (context.error) return sendError(e, context.error, "temporary_password_issue_failed");
  let response = null;
  try {
    $app.runInTransaction((app) => {
      lockStore(app, context.store.id);
      const loaded = loadActorContext(app, context.actorId, true, context.store.id);
      const target = loadTarget(app, loaded.store, context.parsed.userId);
      const access = findAccess(app, loaded.store.id, target.id);
      const snapshot = userSnapshot(target, access);
      const password = generateTemporaryPassword();
      const temporary = masterUsers.temporaryPasswordDates();
      target.setPassword(password);
      target.set("must_change_password", true);
      target.set("temporary_password_issued_at", temporary.issued_at);
      target.set("temporary_password_expires_at", temporary.expires_at);
      target.refreshTokenKey();
      app.save(target);
      createTeamAudit(app, loaded.store, loaded.actor, target, "team_temporary_password_issued", snapshot, snapshot, context.parsed.reason, true);
      response = {
        ok: true,
        user: teamUserResponse(app, loaded.store, target),
        temporary_password: password,
        temporary_password_expires_at: temporary.expires_at,
        sessions_revoked: true,
      };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "temporary_password_issue_failed"); }
}

function handleRevokeSessions(e) {
  const context = requestContext(e, parseAction, true);
  if (context.error) return sendError(e, context.error, "session_revocation_failed");
  let response = null;
  try {
    $app.runInTransaction((app) => {
      const loaded = loadActorContext(app, context.actorId, true, context.store.id);
      const target = loadTarget(app, loaded.store, context.parsed.userId);
      const access = findAccess(app, loaded.store.id, target.id);
      const snapshot = userSnapshot(target, access);
      target.refreshTokenKey();
      app.save(target);
      createTeamAudit(app, loaded.store, loaded.actor, target, "team_sessions_revoked", snapshot, snapshot, context.parsed.reason, true);
      response = { ok: true, user_id: target.id, sessions_revoked: true };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "session_revocation_failed"); }
}

function handleRevokeDevices(e) {
  const context = requestContext(e, parseAction, true);
  if (context.error) return sendError(e, context.error, "device_revocation_failed");
  let response = null;
  try {
    $app.runInTransaction((app) => {
      const loaded = loadActorContext(app, context.actorId, true, context.store.id);
      const target = loadTarget(app, loaded.store, context.parsed.userId);
      const access = findAccess(app, loaded.store.id, target.id);
      const snapshot = userSnapshot(target, access);
      const records = app.findRecordsByFilter(
        "store_user_devices",
        "store = {:storeId} && user = {:userId} && status = 'authorized'",
        "id",
        200,
        0,
        { storeId: loaded.store.id, userId: target.id }
      ) || [];
      const now = new Date().toISOString();
      records.forEach((device) => {
        device.set("status", "revoked");
        device.set("revoked_at", now);
        device.set("revoked_by", loaded.actor.id);
        device.set("revoke_reason", context.parsed.reason);
        app.save(device);
      });
      target.refreshTokenKey();
      app.save(target);
      createTeamAudit(app, loaded.store, loaded.actor, target, "team_devices_revoked", snapshot, snapshot, context.parsed.reason, true);
      response = { ok: true, user_id: target.id, devices_revoked: records.length, sessions_revoked: true };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "device_revocation_failed"); }
}

function handleDelete(e) {
  const context = requestContext(e, parseDelete, true);
  if (context.error) return sendError(e, context.error, "user_delete_failed");
  let response = null;
  try {
    $app.runInTransaction((app) => {
      lockStore(app, context.store.id);
      const loaded = loadActorContext(app, context.actorId, true, context.store.id);
      const target = loadTarget(app, loaded.store, context.parsed.userId);
      response = masterUsers.deleteStoreUserTransactional(app, {
        store: loaded.store,
        actor: loaded.actor,
        target,
        confirmationEmail: context.parsed.confirmationEmail,
        reasonCode: context.parsed.deletionReason.reason_code,
        reasonDetail: context.parsed.deletionReason.reason_detail,
      });
    });
    if (!response) throw codedError("user_delete_failed");
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "user_delete_failed"); }
}

function auditResponse(record) {
  const previousPermissions = recordValue(record, "previous_permissions_json");
  const nextPermissions = recordValue(record, "new_permissions_json");
  const deletionReason = deleteReasons.parseStoredDeleteReason(recordString(record, "reason"));
  return {
    action: TEAM_AUDIT_ACTIONS.includes(recordString(record, "action")) ? recordString(record, "action") : "",
    actor_name: bounded(recordString(record, "actor_name_snapshot"), 160),
    actor_role: bounded(recordString(record, "actor_role_snapshot"), 40),
    previous_template_code: bounded(recordString(record, "previous_template_code"), 40),
    new_template_code: bounded(recordString(record, "new_template_code"), 40),
    previous_permissions: Array.isArray(previousPermissions) ? previousPermissions : [],
    new_permissions: Array.isArray(nextPermissions) ? nextPermissions : [],
    sessions_revoked: recordBool(record, "sessions_revoked"),
    reason: deletionReason.structured
      ? `${deletionReason.reason_label_snapshot}${deletionReason.reason_detail ? `: ${deletionReason.reason_detail}` : ""}`
      : deletionReason.legacy_reason,
    reason_code: deletionReason.reason_code,
    reason_label_snapshot: deletionReason.reason_label_snapshot,
    reason_detail: deletionReason.reason_detail,
    created: safeDate(record, "created"),
  };
}

function handleAudit(e) {
  const context = requestContext(e, parseAudit, true);
  if (context.error) return sendError(e, context.error, "audit_load_failed");
  try {
    const target = loadTarget($app, context.store, context.parsed.userId);
    const offset = (context.parsed.page - 1) * context.parsed.perPage;
    const rows = $app.findRecordsByFilter(
      "store_user_audit",
      "store = {:storeId} && target_user = {:userId}",
      "-created,-id",
      context.parsed.perPage,
      offset,
      { storeId: context.store.id, userId: target.id }
    ) || [];
    const total = queryOne($app, `
      SELECT COUNT(*) AS totalItems FROM store_user_audit
      WHERE store = {:storeId} AND target_user = {:userId}
    `, { storeId: context.store.id, userId: target.id }, { totalItems: 0 }) || {};
    const totalItems = countValue(total.totalItems);
    return e.json(200, {
      ok: true,
      user: teamUserResponse($app, context.store, target),
      audit: rows.map(auditResponse),
      pagination: {
        page: context.parsed.page,
        per_page: context.parsed.perPage,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / context.parsed.perPage)),
      },
    });
  } catch (error) { return sendError(e, error, "audit_load_failed"); }
}

function reconcilePlanAccess(app, store, previousMaxActiveUsers, actor) {
  const previousMax = Math.max(1, Math.floor(Number(previousMaxActiveUsers) || 1));
  const nextMax = storePlan(store).max_active_users;
  if (previousMax === nextMax) return { locked: 0, restored: 0 };
  const primaryId = relationId(store, "primary_admin_user");
  const users = activeAdditionalUsers(app, store);
  const previousSlots = Math.max(0, previousMax - (primaryId ? 1 : 0));
  const nextSlots = Math.max(0, nextMax - (primaryId ? 1 : 0));
  let locked = 0;
  let restored = 0;
  if (nextSlots < previousSlots) {
    users.slice(nextSlots, previousSlots).forEach((user) => {
      const access = findAccess(app, store.id, user.id);
      const snapshot = userSnapshot(user, access);
      user.refreshTokenKey();
      app.save(user);
      createTeamAudit(app, store, actor, user, "plan_access_locked", snapshot, snapshot, "Cambio de plan", true);
      locked += 1;
    });
  } else if (nextSlots > previousSlots) {
    users.slice(previousSlots, nextSlots).forEach((user) => {
      const access = findAccess(app, store.id, user.id);
      const snapshot = userSnapshot(user, access);
      createTeamAudit(app, store, actor, user, "plan_access_restored", snapshot, snapshot, "Cambio de plan", false);
      restored += 1;
    });
  }
  return { locked, restored };
}

function effectivePlanMax(store) {
  return permissions.effectiveMaxActiveUsers(store);
}

function rejectBlockedByPlanAuthentication(e) {
  const user = e && e.record;
  if (!user || !STORE_ROLES.includes(recordString(user, "role"))) return;
  const store = findRecord($app, "stores", relationId(user, "store"));
  if (!store) return;
  if (permissions.isBlockedByPlan($app, user, store)) {
    throw new BadRequestError("Failed to authenticate.");
  }
}

module.exports = {
  SAFE_ERRORS,
  TEAM_AUDIT_ACTIONS,
  TEMPLATE_CODES,
  activeStoreUser,
  auditResponse,
  exactPayload,
  effectivePlanMax,
  generateTemporaryPassword,
  handleAccessContext,
  handleAudit,
  handleCreate,
  handleDelete,
  handleDetail,
  handleIssueTemporaryAccess,
  handleList,
  handleReactivate,
  handleRevokeDevices,
  handleRevokeSessions,
  handleSummary,
  handleSuspend,
  handleUpdate,
  normalizedRawPermissions,
  plainPermissionArray,
  parseAction,
  parseAudit,
  parseCreate,
  parseDelete,
  parseEmpty,
  parseTarget,
  parseUpdate,
  permissionSelection,
  reconcilePlanAccess,
  rejectBlockedByPlanAuthentication,
  requireAuthenticatedUser,
  roleForTemplate,
  statusForError,
  teamUserResponse,
};
