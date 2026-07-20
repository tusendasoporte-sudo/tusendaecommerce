/// <reference path="../pb_data/types.d.ts" />

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const storePermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const activityAudit = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);
const deleteReasons = typeof __hooks === "undefined"
  ? require("./pz_store_team_delete_reasons_lib.js")
  : require(`${__hooks}/pz_store_team_delete_reasons_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORE_ROLES = Object.freeze(["store_admin", "store_staff"]);
const USER_STATUSES = Object.freeze(["active", "suspended"]);
const AUDIT_COLLECTION = "store_user_audit";
const TEMPORARY_PASSWORD_TTL_HOURS = 72;
const TEMPORARY_PASSWORD_TTL_MS = TEMPORARY_PASSWORD_TTL_HOURS * 60 * 60 * 1000;
const COMPACT_USER_LIST_LIMIT = 10;
const AUDIT_ACTIONS = Object.freeze([
  "user_created",
  "user_updated",
  "password_changed",
  "sessions_revoked",
  "self_password_changed",
  "temporary_password_issued",
  "forced_password_changed",
  "user_deleted",
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
const VISIBLE_AUDIT_ACTIONS = Object.freeze([...AUDIT_ACTIONS, ...TEAM_AUDIT_ACTIONS]);
const TEAM_TEMPLATE_CODES = Object.freeze([
  "secondary_admin",
  "catalog_inventory",
  "orders_shipping",
  "marketing_promotions",
  "read_only",
  "custom",
]);
const SAFE_CODES = new Set([
  "unauthorized",
  "invalid_payload",
  "store_not_found",
  "user_not_found",
  "email_exists",
  "invalid_email",
  "invalid_password",
  "current_password_required",
  "new_password_required",
  "password_confirmation_mismatch",
  "password_reuse_not_allowed",
  "current_password_invalid",
  "invalid_role",
  "invalid_status",
  "active_user_limit_reached",
  "last_active_admin_required",
  "primary_admin_replacement_required",
  "user_management_unavailable",
  "user_create_failed",
  "user_update_failed",
  "password_change_failed",
  "session_revocation_failed",
  "audit_load_failed",
  "temporary_password_expired",
  "temporary_password_change_required",
  "temporary_password_not_required",
  "temporary_password_issue_failed",
  "forced_password_change_failed",
  "delete_confirmation_mismatch",
  "delete_reason_required",
  "delete_reason_too_short",
  "delete_reason_invalid",
  "delete_reason_detail_required",
  "delete_reason_detail_too_short",
  "delete_reason_detail_too_long",
  "delete_reason_detail_invalid",
  "user_delete_failed",
]);

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

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function exactPayload(body, allowedKeys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = allowedKeys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function valid(value) {
  return { ok: true, value };
}

function invalid(error) {
  return { ok: false, error };
}

function isValidRecordId(value) {
  return typeof value === "string" && RECORD_ID_PATTERN.test(value);
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function parseSummaryPayload(body) {
  if (!exactPayload(body, ["store_ids"])) return invalid("invalid_payload");
  const storeIds = bodyValue(body, "store_ids");
  if (!Array.isArray(storeIds) || storeIds.length > 100 || storeIds.some((id) => !isValidRecordId(id))) {
    return invalid("invalid_payload");
  }
  return valid({ storeIds: [...new Set(storeIds)] });
}

function parseListPayload(body) {
  const keys = ["store_id", "page", "per_page", "search", "role", "status"];
  if (!exactPayload(body, keys)) return invalid("invalid_payload");
  const storeId = bodyValue(body, "store_id");
  const page = bodyValue(body, "page");
  const perPage = bodyValue(body, "per_page");
  const search = bodyValue(body, "search");
  const role = bodyValue(body, "role");
  const status = bodyValue(body, "status");
  if (!isValidRecordId(storeId) || !Number.isInteger(page) || page < 1) return invalid("invalid_payload");
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 50) return invalid("invalid_payload");
  if (typeof search !== "string" || search.length > 120) return invalid("invalid_payload");
  if (!["all", ...STORE_ROLES].includes(role)) return invalid("invalid_role");
  if (!["all", ...USER_STATUSES].includes(status)) return invalid("invalid_status");
  return valid({ storeId, page, perPage, search: search.trim(), role, status });
}

function parseTargetPayload(body) {
  if (!exactPayload(body, ["store_id", "user_id"])) return invalid("invalid_payload");
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  if (!isValidRecordId(storeId) || !isValidRecordId(userId)) return invalid("invalid_payload");
  return valid({ storeId, userId });
}

function parseMutableUserFields(body, keys) {
  if (!exactPayload(body, keys)) return invalid("invalid_payload");
  const storeId = bodyValue(body, "store_id");
  const userId = keys.includes("user_id") ? bodyValue(body, "user_id") : "";
  const email = normalizeEmail(bodyValue(body, "email"));
  const displayName = bodyValue(body, "display_name");
  const phone = bodyValue(body, "phone");
  const role = bodyValue(body, "role");
  const status = bodyValue(body, "status");
  const reason = bodyValue(body, "reason");
  if (!isValidRecordId(storeId) || (keys.includes("user_id") && !isValidRecordId(userId))) {
    return invalid("invalid_payload");
  }
  if (!email) return invalid("invalid_email");
  if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 140) {
    return invalid("invalid_payload");
  }
  if (typeof phone !== "string" || phone.length > 60) return invalid("invalid_payload");
  if (!STORE_ROLES.includes(role)) return invalid("invalid_role");
  if (!USER_STATUSES.includes(status)) return invalid("invalid_status");
  if (typeof reason !== "string" || reason.length > 500) return invalid("invalid_payload");
  return valid({
    storeId,
    userId,
    email,
    displayName: displayName.trim(),
    phone: phone.trim(),
    role,
    status,
    reason: reason.trim(),
  });
}

function parseCreatePayload(body) {
  const keys = ["store_id", "email", "password", "display_name", "phone", "role", "status", "reason"];
  const parsed = parseMutableUserFields(body, keys);
  if (!parsed.ok) return parsed;
  const password = bodyValue(body, "password");
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return invalid("invalid_password");
  }
  return valid({ ...parsed.value, password });
}

function parseUpdatePayload(body) {
  return parseMutableUserFields(
    body,
    ["store_id", "user_id", "email", "display_name", "phone", "role", "status", "reason"]
  );
}

function parsePasswordPayload(body) {
  if (!exactPayload(body, ["store_id", "user_id", "password", "reason"])) {
    return invalid("invalid_payload");
  }
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const password = bodyValue(body, "password");
  const reason = bodyValue(body, "reason");
  if (!isValidRecordId(storeId) || !isValidRecordId(userId)) return invalid("invalid_payload");
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return invalid("invalid_password");
  }
  if (typeof reason !== "string" || reason.length > 500) return invalid("invalid_payload");
  return valid({ storeId, userId, password, reason: reason.trim() });
}

function parseSelfPasswordPayload(body) {
  if (!exactPayload(body, ["currentPassword", "newPassword", "newPasswordConfirm"])) {
    return invalid("invalid_payload");
  }
  const currentPassword = bodyValue(body, "currentPassword");
  const newPassword = bodyValue(body, "newPassword");
  const newPasswordConfirm = bodyValue(body, "newPasswordConfirm");
  if (typeof currentPassword !== "string" || !currentPassword.length) {
    return invalid("current_password_required");
  }
  if (typeof newPassword !== "string" || !newPassword.length || !newPassword.trim()) {
    return invalid("new_password_required");
  }
  if (typeof newPasswordConfirm !== "string" || !newPasswordConfirm.length) {
    return invalid("password_confirmation_mismatch");
  }
  if (newPassword !== newPasswordConfirm) return invalid("password_confirmation_mismatch");
  if (currentPassword.length > 128 || newPassword.length > 128) return invalid("invalid_password");
  return valid({ currentPassword, newPassword });
}

function parseSelfRevokePayload(body) {
  if (!exactPayload(body, [])) return invalid("invalid_payload");
  return valid({});
}

function parseRevokePayload(body) {
  if (!exactPayload(body, ["store_id", "user_id", "reason"])) return invalid("invalid_payload");
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const reason = bodyValue(body, "reason");
  if (!isValidRecordId(storeId) || !isValidRecordId(userId)) return invalid("invalid_payload");
  if (typeof reason !== "string" || reason.length > 500) return invalid("invalid_payload");
  return valid({ storeId, userId, reason: reason.trim() });
}

function parseAuditPayload(body) {
  if (!exactPayload(body, ["store_id", "user_id", "page", "per_page"])) {
    return invalid("invalid_payload");
  }
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const page = bodyValue(body, "page");
  const perPage = bodyValue(body, "per_page");
  if (!isValidRecordId(storeId) || !isValidRecordId(userId)) return invalid("invalid_payload");
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 50) {
    return invalid("invalid_payload");
  }
  return valid({ storeId, userId, page, perPage });
}

function parseDeletePayload(body) {
  if (!exactPayload(body, ["store_id", "user_id", "confirmation_email", "reason"])) {
    return invalid("invalid_payload");
  }
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const confirmationEmail = normalizeEmail(bodyValue(body, "confirmation_email"));
  const reason = bodyValue(body, "reason");
  if (!isValidRecordId(storeId) || !isValidRecordId(userId)) return invalid("invalid_payload");
  if (!confirmationEmail) return invalid("delete_confirmation_mismatch");
  if (typeof reason !== "string" || !reason.trim()) return invalid("delete_reason_required");
  if (reason.trim().length < 8) return invalid("delete_reason_too_short");
  if (reason.length > 500) return invalid("invalid_payload");
  return valid({ storeId, userId, confirmationEmail, reason: reason.trim() });
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    return record.get(key);
  } catch (_) {
    try {
      return record.getString(key);
    } catch (_) {
      return record[key];
    }
  }
}

function recordString(record, key) {
  const value = recordValue(record, key);
  if (value && typeof value.string === "function") {
    try {
      return String(value.string() || "").trim();
    } catch (_) {}
  }
  return String(value === null || value === undefined ? "" : value).trim();
}

function recordBoolean(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function safeDate(record, key) {
  const raw = recordString(record, key);
  if (!raw) return "";
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function temporaryPasswordDates(now) {
  const issued = now instanceof Date ? new Date(now.getTime()) : new Date(now || Date.now());
  if (!Number.isFinite(issued.getTime())) throw codedError("temporary_password_issue_failed");
  return {
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + TEMPORARY_PASSWORD_TTL_MS).toISOString(),
  };
}

function temporaryPasswordState(record, now) {
  if (!recordBoolean(record, "must_change_password")) return "none";
  const expiresAt = safeDate(record, "temporary_password_expires_at");
  const current = now instanceof Date ? now.getTime() : new Date(now || Date.now()).getTime();
  if (!expiresAt || !Number.isFinite(current)) return "expired";
  return new Date(expiresAt).getTime() > current ? "pending" : "expired";
}

function bounded(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function isActiveMaster(record) {
  return recordString(record, "role") === "master_admin" && recordString(record, "status") === "active";
}

function isActiveStoreAdmin(record) {
  return recordString(record, "role") === "store_admin"
    && recordString(record, "status") === "active"
    && isValidRecordId(relationId(record, "store"));
}

function isActiveStoreUser(record) {
  return STORE_ROLES.includes(recordString(record, "role"))
    && recordString(record, "status") === "active"
    && isValidRecordId(relationId(record, "store"));
}

function findRecord(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function userManagementReady(app) {
  try {
    const users = app.findCollectionByNameOrId("users");
    const audit = app.findCollectionByNameOrId(AUDIT_COLLECTION);
    return users.type === "auth"
      && !!users.fields.getByName("store")
      && !!users.fields.getByName("status")
      && !!users.fields.getByName("must_change_password")
      && !!users.fields.getByName("temporary_password_issued_at")
      && !!users.fields.getByName("temporary_password_expires_at")
      && !!audit.fields.getByName("target_user_id_snapshot")
      && audit.listRule === null
      && audit.viewRule === null
      && audit.createRule === null
      && audit.updateRule === null
      && audit.deleteRule === null;
  } catch (_) {
    return false;
  }
}

function selfPasswordManagementReady(app) {
  try {
    if (!userManagementReady(app)) return false;
    const users = app.findCollectionByNameOrId("users");
    const password = users.fields.getByName("password");
    const action = app.findCollectionByNameOrId(AUDIT_COLLECTION).fields.getByName("action");
    return !!password && !!action;
  } catch (_) {
    return false;
  }
}

function passwordMeetsCollectionPolicy(app, password) {
  try {
    if (typeof password !== "string" || !password.length || !password.trim() || password.length > 128) return false;
    const field = app.findCollectionByNameOrId("users").fields.getByName("password");
    const minimum = Number(field.min || 0);
    const maximum = Number(field.max || 0);
    if (!Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(maximum) || maximum < 0) return false;
    if (password.length < Math.max(1, Math.floor(minimum))) return false;
    if (maximum > 0 && password.length > Math.floor(maximum)) return false;
    return true;
  } catch (_) {
    return false;
  }
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

function storeUserCounts(app, storeId) {
  const row = queryOne(app, `
    SELECT
      COUNT(*) AS totalUsers,
      COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS activeUsers,
      COALESCE(SUM(CASE WHEN status = 'active' AND role = 'store_admin' THEN 1 ELSE 0 END), 0) AS activeAdmins,
      COALESCE(SUM(CASE WHEN status = 'active' AND role = 'store_staff' THEN 1 ELSE 0 END), 0) AS activeStaff
    FROM users
    WHERE store = {:storeId} AND role IN ('store_admin', 'store_staff')
  `, { storeId }, { totalUsers: 0, activeUsers: 0, activeAdmins: 0, activeStaff: 0 }) || {};
  return {
    total_users: countValue(row.totalUsers),
    active_users: countValue(row.activeUsers),
    active_admins: countValue(row.activeAdmins),
    active_staff: countValue(row.activeStaff),
  };
}

function storeAuthorizedDeviceCounts(app, storeId) {
  const summaries = storeUserDeviceSummaries(app, storeId);
  const result = {};
  Object.keys(summaries).forEach((userId) => {
    result[userId] = summaries[userId].authorized_device_count;
  });
  return result;
}

function storeUserDeviceSummaries(app, storeId) {
  const rows = queryRows(app, `
    SELECT
      user AS userId,
      COALESCE(SUM(CASE WHEN status = 'authorized' THEN 1 ELSE 0 END), 0) AS deviceCount,
      MAX(last_seen_at) AS lastSeenAt
    FROM store_user_devices
    WHERE store = {:storeId}
    GROUP BY user
  `, { storeId }, { userId: "", deviceCount: 0, lastSeenAt: "" });
  const result = {};
  rows.forEach((row) => {
    const userId = String(row.userId || "").trim();
    const rawLastSeen = String(row.lastSeenAt || "").trim();
    const normalized = rawLastSeen.includes("T") ? rawLastSeen : rawLastSeen.replace(" ", "T");
    const parsed = new Date(normalized).getTime();
    if (isValidRecordId(userId)) {
      result[userId] = {
        authorized_device_count: countValue(row.deviceCount),
        last_admin_activity_at: Number.isFinite(parsed) ? new Date(parsed).toISOString() : "",
      };
    }
  });
  return result;
}

function distinctAuthorizedStoreDeviceCount(app, storeId) {
  const row = queryOne(app, `
    SELECT COUNT(DISTINCT device_digest) AS deviceCount
    FROM store_user_devices
    WHERE store = {:storeId} AND status = 'authorized'
  `, { storeId }, { deviceCount: 0 }) || {};
  return countValue(row.deviceCount);
}

function storeDeviceLimit(store) {
  const access = capabilities.resolveStoreCapabilityAccess(
    store,
    "max_devices_per_user",
    { enforceExpiration: false }
  );
  if (!access || !Number.isInteger(access.limit) || access.limit < 0
    || ["invalid_plan_data", "invalid_capability"].includes(access.reason)) {
    throw codedError("user_management_unavailable");
  }
  return access.limit;
}

function storeCapability(store, capabilityKey) {
  const access = capabilities.resolveStoreCapabilityAccess(
    store,
    capabilityKey,
    { enforceExpiration: false }
  );
  if (!access || ["invalid_plan_data", "invalid_capability"].includes(access.reason)) {
    throw codedError("user_management_unavailable");
  }
  return access;
}

function planAccess(store, requiredAmount) {
  const options = { enforceExpiration: false };
  if (Number.isInteger(requiredAmount)) options.requiredAmount = requiredAmount;
  const access = capabilities.resolveStoreCapabilityAccess(store, "max_active_users", options);
  if (!access || access.reason === "invalid_plan_data" || access.reason === "invalid_capability") {
    throw codedError("user_management_unavailable");
  }
  return access;
}

function planResponse(store, counts, app) {
  const access = planAccess(store);
  const deviceAccess = storeCapability(store, "max_devices_per_user");
  const storeDeviceAccess = storeCapability(store, "max_store_devices");
  const securityAccess = storeCapability(store, "security_enabled");
  const rafflesAccess = storeCapability(store, "raffles_enabled");
  const landingAccess = storeCapability(store, "landing_qr_enabled");
  return {
    code: access.plan,
    state: access.plan_state,
    is_permanent: access.is_permanent,
    is_configured: access.is_configured,
    is_expired: access.is_expired,
    max_active_users: access.limit,
    total_users: counts.total_users,
    active_users: counts.active_users,
    over_limit: counts.active_users > access.limit,
    active_admins: counts.active_admins,
    active_staff: counts.active_staff,
    store_authorized_device_count: app ? distinctAuthorizedStoreDeviceCount(app, store.id) : 0,
    max_store_devices: storeDeviceAccess.limit,
    max_devices_per_user: deviceAccess.limit,
    security_enabled: securityAccess.allowed,
    raffles_enabled: rafflesAccess.allowed,
    landing_qr_enabled: landingAccess.allowed,
  };
}

function storeResponse(store) {
  return {
    id: String(store.id || recordString(store, "id")).slice(0, 15),
    name: bounded(recordString(store, "name"), 140),
    slug: bounded(recordString(store, "slug"), 80),
    status: recordString(store, "status"),
  };
}

function userSnapshot(record) {
  return {
    email: bounded(recordString(record, "email").toLowerCase(), 254),
    display_name: bounded(recordString(record, "display_name"), 140),
    phone: bounded(recordString(record, "phone"), 60),
    role: STORE_ROLES.includes(recordString(record, "role")) ? recordString(record, "role") : "",
    status: USER_STATUSES.includes(recordString(record, "status")) ? recordString(record, "status") : "",
  };
}

function sanitizeUser(record, activeAdminCount, deviceSummary) {
  const snapshot = userSnapshot(record);
  const devices = deviceSummary && typeof deviceSummary === "object" ? deviceSummary : {};
  return {
    id: String(record.id || recordString(record, "id")).slice(0, 15),
    email: snapshot.email,
    display_name: snapshot.display_name,
    phone: snapshot.phone,
    role: snapshot.role,
    status: snapshot.status,
    created: safeDate(record, "created"),
    updated: safeDate(record, "updated"),
    must_change_password: recordBoolean(record, "must_change_password"),
    temporary_password_state: temporaryPasswordState(record),
    temporary_password_issued_at: safeDate(record, "temporary_password_issued_at"),
    temporary_password_expires_at: safeDate(record, "temporary_password_expires_at"),
    last_admin_activity_at: bounded(devices.last_admin_activity_at, 40),
    is_last_active_admin: snapshot.role === "store_admin"
      && snapshot.status === "active"
      && activeAdminCount === 1,
    authorized_device_count: countValue(devices.authorized_device_count),
    device_limit: countValue(devices.device_limit),
  };
}

function sanitizeUsersWithDevices(app, store, records, activeAdminCount) {
  const summaries = storeUserDeviceSummaries(app, store.id);
  const deviceLimit = storeDeviceLimit(store);
  return records.map((record) => sanitizeUser(record, activeAdminCount, {
    ...(summaries[record.id] || {}),
    device_limit: deviceLimit,
  }));
}

function targetBelongsToStore(record, storeId) {
  return !!record
    && relationId(record, "store") === storeId
    && STORE_ROLES.includes(recordString(record, "role"));
}

function isPrimaryAdminUser(store, user) {
  return !!store && !!user
    && isValidRecordId(String(user.id || recordString(user, "id")))
    && relationId(store, "primary_admin_user") === String(user.id || recordString(user, "id"));
}

function projectedCounts(counts, previous, next) {
  const wasActive = previous.status === "active" && STORE_ROLES.includes(previous.role);
  const willBeActive = next.status === "active" && STORE_ROLES.includes(next.role);
  const wasAdmin = wasActive && previous.role === "store_admin";
  const willBeAdmin = willBeActive && next.role === "store_admin";
  return {
    active_users: counts.active_users - (wasActive ? 1 : 0) + (willBeActive ? 1 : 0),
    active_admins: counts.active_admins - (wasAdmin ? 1 : 0) + (willBeAdmin ? 1 : 0),
  };
}

function projectedActiveAdminsAfterDeletion(counts, target) {
  const activeAdmins = countValue(counts && counts.active_admins);
  const removesActiveAdmin = target
    && target.role === "store_admin"
    && target.status === "active";
  return Math.max(0, activeAdmins - (removesActiveAdmin ? 1 : 0));
}

function updateRevokesSessions(previous, next) {
  return previous.email !== next.email
    || previous.role !== next.role
    || (previous.status === "active" && next.status === "suspended");
}

function sessionsMustBeRevoked(action, previous, next) {
  if ([
    "password_changed",
    "sessions_revoked",
    "self_password_changed",
    "temporary_password_issued",
    "forced_password_changed",
  ].includes(action)) return true;
  if (action === "user_updated") return updateRevokesSessions(previous, next);
  return false;
}

function auditActorRole(actor, action) {
  const role = recordString(actor, "role");
  if (role === "master_admin" || role === "store_admin") return role;
  if (role === "store_staff" && [
    "forced_password_changed",
    "self_password_changed",
    "sessions_revoked",
  ].includes(action)) return role;
  throw codedError("user_management_unavailable");
}

function buildAuditValues(store, actor, target, action, previous, next, sessionsRevoked, reason) {
  const actorRole = auditActorRole(actor, action);
  const actorName = bounded(
    recordString(actor, "display_name")
      || recordString(actor, "name")
      || recordString(actor, "email")
      || (actorRole === "master_admin" ? "Master Admin" : "Store Admin"),
    160
  );
  return {
    store: String(store.id || "").slice(0, 15),
    store_id_snapshot: String(store.id || "").slice(0, 15),
    store_name_snapshot: bounded(recordString(store, "name"), 140),
    store_slug_snapshot: bounded(recordString(store, "slug"), 80),
    target_user: String(target.id || "").slice(0, 15),
    target_user_id_snapshot: String(target.id || "").slice(0, 15),
    actor: String(actor.id || "").slice(0, 15),
    actor_name_snapshot: actorName,
    actor_role_snapshot: actorRole,
    action,
    previous_email: bounded(previous && previous.email, 254),
    new_email: bounded(next && next.email, 254),
    previous_display_name: bounded(previous && previous.display_name, 140),
    new_display_name: bounded(next && next.display_name, 140),
    previous_phone: bounded(previous && previous.phone, 60),
    new_phone: bounded(next && next.phone, 60),
    previous_role: STORE_ROLES.includes(previous && previous.role) ? previous.role : "",
    new_role: STORE_ROLES.includes(next && next.role) ? next.role : "",
    previous_status: USER_STATUSES.includes(previous && previous.status) ? previous.status : "",
    new_status: USER_STATUSES.includes(next && next.status) ? next.status : "",
    sessions_revoked: sessionsRevoked === true,
    reason: bounded(reason, 500),
  };
}

function centralUserActivity(app, store, actor, target, action, previous, next, sessionsRevoked, specializedAudit, deletionReason) {
  const before = {};
  const after = {};
  const safeKeys = ["display_name", "role", "status"];
  safeKeys.forEach((key) => {
    if (previous && previous[key] !== undefined && previous[key] !== "") before[key] = previous[key];
    if (next && next[key] !== undefined && next[key] !== "") after[key] = next[key];
  });
  if (sessionsRevoked === true) after.sessions_revoked = true;
  if (action === "user_deleted" && deletionReason) {
    after.reason_code = deletionReason.reason_code;
    after.reason_label_snapshot = deletionReason.reason_label_snapshot;
    if (deletionReason.reason_detail) after.reason_detail = deletionReason.reason_detail;
  }
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  if (sessionsRevoked === true && !changed.includes("sessions_revoked")) changed.push("sessions_revoked");
  const targetName = bounded(
    (next && next.display_name) || (previous && previous.display_name)
      || recordString(target, "display_name") || "Usuario del equipo",
    140,
  );
  const summaries = {
    user_created: `Creó el acceso de ${targetName}`,
    user_updated: `Actualizó el acceso de ${targetName}`,
    password_changed: `Restableció el acceso de ${targetName}`,
    sessions_revoked: `Cerró las sesiones de ${targetName}`,
    self_password_changed: "Cambió su contraseña",
    temporary_password_issued: `Emitió acceso temporal para ${targetName}`,
    forced_password_changed: "Completó el cambio de contraseña temporal",
    user_deleted: `Eliminó permanentemente a ${targetName}`,
  };
  return activityAudit.createActivity(app, {
    storeId: store.id,
    actor,
    module: "team",
    action,
    severity: action === "user_deleted" ? "critical" : (["password_changed", "sessions_revoked", "temporary_password_issued"].includes(action) ? "important" : "normal"),
    resourceType: "team_user",
    resourceId: target && target.id,
    resourceLabel: targetName,
    changedFields: changed,
    previousValues: before,
    newValues: after,
    summary: summaries[action] || `Actualizó a ${targetName}`,
    sourceEventKey: `team:${action}:${specializedAudit.id}`,
  });
}

function createAudit(app, store, actor, target, action, previous, next, sessionsRevoked, reason, deletionReason) {
  if (!AUDIT_ACTIONS.includes(action)) throw codedError("user_management_unavailable");
  const record = new Record(app.findCollectionByNameOrId(AUDIT_COLLECTION), {});
  const values = buildAuditValues(store, actor, target, action, previous, next, sessionsRevoked, reason);
  Object.keys(values).forEach((key) => record.set(key, values[key]));
  app.save(record);
  centralUserActivity(app, store, actor, target, action, previous, next, sessionsRevoked, record, deletionReason);
  return record;
}

function relationFieldType(field) {
  try {
    if (field && typeof field.type === "function") return String(field.type());
    return String(field && field.type || "");
  } catch (_) {
    return "";
  }
}

function isOwnedDeviceUserRelation(collectionName, fieldName) {
  return (collectionName === "store_user_devices" || collectionName === "store_user_access")
    && fieldName === "user";
}

function userRelationInventory(app) {
  const users = app.findCollectionByNameOrId("users");
  const collections = app.findAllCollections() || [];
  const relations = [];
  collections.forEach((collection) => {
    if (!collection || !collection.name || !collection.fields) return;
    try {
      if (typeof collection.isView === "function" && collection.isView()) return;
    } catch (_) {}
    Array.from(collection.fields).forEach((field) => {
      if (relationFieldType(field) !== "relation" || String(field.collectionId || "") !== users.id) return;
      relations.push({ collection, field });
    });
  });
  return relations;
}

function relationFilter(field, bindingName) {
  const name = String(field && field.name || "");
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw codedError("user_delete_failed");
  return `${name} ${Number(field.maxSelect || 0) > 1 ? "?=" : "="} {:${bindingName}}`;
}

function relatedRecords(app, collection, field, userId, limit) {
  return app.findRecordsByFilter(
    collection.name,
    relationFilter(field, "userId"),
    "id",
    limit,
    0,
    { userId }
  ) || [];
}

function assertNoUnexpectedRequiredUserRelations(app, userId) {
  userRelationInventory(app).forEach(({ collection, field }) => {
    if (isOwnedDeviceUserRelation(collection.name, field.name)) return;
    if (field.required !== true && Number(field.minSelect || 0) < 1) return;
    if (relatedRecords(app, collection, field, userId, 1).length) {
      throw codedError("user_delete_failed");
    }
  });
}

function clearOptionalUserRelations(app, userId) {
  let cleared = 0;
  userRelationInventory(app).forEach(({ collection, field }) => {
    if (isOwnedDeviceUserRelation(collection.name, field.name)) return;
    if (field.required === true || Number(field.minSelect || 0) > 0) return;
    for (let batch = 0; batch < 1000; batch += 1) {
      const records = relatedRecords(app, collection, field, userId, 200);
      if (!records.length) break;
      records.forEach((record) => {
        record.set(field.name, Number(field.maxSelect || 0) > 1 ? [] : "");
        app.save(record);
        cleared += 1;
      });
      if (batch === 999) throw codedError("user_delete_failed");
    }
  });
  return cleared;
}

function loadTargetDevices(app, userId) {
  return app.findRecordsByFilter(
    "store_user_devices",
    "user = {:userId}",
    "id",
    200,
    0,
    { userId }
  ) || [];
}

function loadTargetAccessRecords(app, storeId, userId) {
  return app.findRecordsByFilter(
    "store_user_access",
    "store = {:storeId} && user = {:userId}",
    "id",
    10,
    0,
    { storeId, userId }
  ) || [];
}

function deleteTargetAccessRecords(app, storeId, userId) {
  const records = loadTargetAccessRecords(app, storeId, userId);
  records.forEach((record) => {
    try { app.delete(record); } catch (_) { throw codedError("user_delete_failed"); }
  });
  if (loadTargetAccessRecords(app, storeId, userId).length) throw codedError("user_delete_failed");
  return records.length;
}

function clearDeviceAuditRelations(app, devices) {
  devices.forEach((device) => {
    for (let batch = 0; batch < 1000; batch += 1) {
      const records = app.findRecordsByFilter(
        "store_user_device_audit",
        "device = {:deviceId}",
        "id",
        200,
        0,
        { deviceId: device.id }
      ) || [];
      if (!records.length) break;
      records.forEach((record) => {
        record.set("device", "");
        app.save(record);
      });
      if (batch === 999) throw codedError("user_delete_failed");
    }
  });
}

function auditPermissions(record, key) {
  let value = recordValue(record, key);
  if (typeof value === "string" && value) {
    try { value = JSON.parse(value); } catch (_) { value = []; }
  }
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((permission) => typeof permission === "string" && /^[a-z0-9._]+$/.test(permission))
    .map((permission) => permission.slice(0, 80)))]
    .slice(0, 50)
    .sort();
}

function mapAudit(record) {
  const deletionReason = deleteReasons.parseStoredDeleteReason(recordString(record, "reason"));
  return {
    id: String(record.id || recordString(record, "id")).slice(0, 15),
    action: VISIBLE_AUDIT_ACTIONS.includes(recordString(record, "action")) ? recordString(record, "action") : "",
    actor_name: bounded(recordString(record, "actor_name_snapshot"), 160),
    actor_role: bounded(recordString(record, "actor_role_snapshot"), 40),
    previous_email: bounded(recordString(record, "previous_email"), 254),
    new_email: bounded(recordString(record, "new_email"), 254),
    previous_display_name: bounded(recordString(record, "previous_display_name"), 140),
    new_display_name: bounded(recordString(record, "new_display_name"), 140),
    previous_phone: bounded(recordString(record, "previous_phone"), 60),
    new_phone: bounded(recordString(record, "new_phone"), 60),
    previous_role: STORE_ROLES.includes(recordString(record, "previous_role")) ? recordString(record, "previous_role") : "",
    new_role: STORE_ROLES.includes(recordString(record, "new_role")) ? recordString(record, "new_role") : "",
    previous_status: USER_STATUSES.includes(recordString(record, "previous_status")) ? recordString(record, "previous_status") : "",
    new_status: USER_STATUSES.includes(recordString(record, "new_status")) ? recordString(record, "new_status") : "",
    previous_template_code: TEAM_TEMPLATE_CODES.includes(recordString(record, "previous_template_code")) ? recordString(record, "previous_template_code") : "",
    new_template_code: TEAM_TEMPLATE_CODES.includes(recordString(record, "new_template_code")) ? recordString(record, "new_template_code") : "",
    previous_permissions: auditPermissions(record, "previous_permissions_json"),
    new_permissions: auditPermissions(record, "new_permissions_json"),
    sessions_revoked: recordValue(record, "sessions_revoked") === true,
    reason: deletionReason.structured
      ? `${deletionReason.reason_label_snapshot}${deletionReason.reason_detail ? `: ${deletionReason.reason_detail}` : ""}`
      : deletionReason.legacy_reason,
    reason_code: deletionReason.reason_code,
    reason_label_snapshot: deletionReason.reason_label_snapshot,
    reason_detail: deletionReason.reason_detail,
    created: safeDate(record, "created"),
  };
}

function codedError(code) {
  const error = new Error(SAFE_CODES.has(code) ? code : "user_management_unavailable");
  error.code = SAFE_CODES.has(code) ? code : "user_management_unavailable";
  return error;
}

function errorCode(error) {
  const code = String(error && (error.code || error.message) || "");
  return SAFE_CODES.has(code) ? code : "";
}

function statusForCode(code) {
  if (code === "unauthorized") return 403;
  if (code === "store_not_found" || code === "user_not_found") return 404;
  if ([
    "email_exists",
    "active_user_limit_reached",
    "last_active_admin_required",
    "primary_admin_replacement_required",
    "temporary_password_change_required",
    "temporary_password_not_required",
    "temporary_password_expired",
  ].includes(code)) return 409;
  if (code === "user_management_unavailable") return 503;
  if ([
    "invalid_payload",
    "invalid_email",
    "invalid_password",
    "invalid_role",
    "invalid_status",
    "current_password_required",
    "new_password_required",
    "password_confirmation_mismatch",
    "password_reuse_not_allowed",
    "current_password_invalid",
    "delete_confirmation_mismatch",
    "delete_reason_required",
    "delete_reason_too_short",
    "delete_reason_invalid",
    "delete_reason_detail_required",
    "delete_reason_detail_too_short",
    "delete_reason_detail_too_long",
    "delete_reason_detail_invalid",
  ].includes(code)) return 400;
  return 500;
}

function sendError(e, code, fallback) {
  const safe = SAFE_CODES.has(code) ? code : fallback;
  return e.json(statusForCode(safe), { ok: false, error: safe });
}

function logFailure(operation) {
  try {
    $app.logger().error("PowerZona store user management failed safely.", "operation", operation);
  } catch (_) {}
}

function requestContext(e, parser) {
  setPrivateHeaders(e);
  const info = e.requestInfo();
  if (!isActiveMaster(info && info.auth)) return { error: "unauthorized" };
  const parsed = parser(info.body || {});
  if (!parsed.ok) return { error: parsed.error };
  if (!userManagementReady($app)) return { error: "user_management_unavailable" };
  const actorId = recordString(info.auth, "id");
  if (!isValidRecordId(actorId)) return { error: "unauthorized" };
  return { info, actorId, parsed: parsed.value };
}

function selfPasswordRequestContext(e) {
  setPrivateHeaders(e);
  const info = e.requestInfo();
  if (!isActiveStoreUser(info && info.auth)) return { error: "unauthorized" };
  const parsed = parseSelfPasswordPayload(info.body || {});
  if (!parsed.ok) return { error: parsed.error };
  if (!selfPasswordManagementReady($app)) return { error: "user_management_unavailable" };
  const actorId = recordString(info.auth, "id");
  if (!isValidRecordId(actorId)) return { error: "unauthorized" };
  return { info, actorId, parsed: parsed.value };
}

function temporaryPasswordRequestContext(e) {
  setPrivateHeaders(e);
  const info = e.requestInfo();
  if (!isActiveStoreUser(info && info.auth)) return { error: "unauthorized" };
  const parsed = parseSelfPasswordPayload(info.body || {});
  if (!parsed.ok) return { error: parsed.error };
  if (!selfPasswordManagementReady($app)) return { error: "user_management_unavailable" };
  const actorId = recordString(info.auth, "id");
  if (!isValidRecordId(actorId)) return { error: "unauthorized" };
  return { info, actorId, parsed: parsed.value };
}

function selfRevokeRequestContext(e) {
  setPrivateHeaders(e);
  const info = e.requestInfo();
  if (!isActiveStoreUser(info && info.auth)) return { error: "unauthorized" };
  const parsed = parseSelfRevokePayload(info.body || {});
  if (!parsed.ok) return { error: parsed.error };
  if (!selfPasswordManagementReady($app)) return { error: "user_management_unavailable" };
  const actorId = recordString(info.auth, "id");
  if (!isValidRecordId(actorId)) return { error: "unauthorized" };
  return { info, actorId, parsed: parsed.value };
}

function lockStore(app, storeId) {
  app.db().newQuery("UPDATE stores SET id = id WHERE id = {:storeId}").bind({ storeId }).execute();
}

function loadTransactionContext(app, actorId, storeId) {
  lockStore(app, storeId);
  const actor = findRecord(app, "users", actorId);
  if (!actor || !isActiveMaster(actor)) throw codedError("unauthorized");
  const store = findRecord(app, "stores", storeId);
  if (!store) throw codedError("store_not_found");
  return { actor, store };
}

function loadSelfPasswordContext(app, actorId, allowStaff) {
  let actor = findRecord(app, "users", actorId);
  const allowed = allowStaff ? isActiveStoreUser(actor) : isActiveStoreAdmin(actor);
  if (!actor || !allowed) throw codedError("unauthorized");
  const storeId = relationId(actor, "store");
  lockStore(app, storeId);
  actor = findRecord(app, "users", actorId);
  const reloadedAllowed = allowStaff ? isActiveStoreUser(actor) : isActiveStoreAdmin(actor);
  if (!actor || !reloadedAllowed || relationId(actor, "store") !== storeId) {
    throw codedError("unauthorized");
  }
  const store = findRecord(app, "stores", storeId);
  if (!store) throw codedError("unauthorized");
  return { actor, store };
}

function validateSelfPasswordCredentials(actor, parsed) {
  if (!actor || typeof actor.validatePassword !== "function") throw codedError("password_change_failed");
  if (!actor.validatePassword(parsed.currentPassword)) return "current_password_invalid";
  if (actor.validatePassword(parsed.newPassword)) return "password_reuse_not_allowed";
  return "";
}

function selfPasswordSuccessResponse() {
  return {
    ok: true,
    code: "password_changed",
    reauth_required: true,
    sessions_revoked: true,
  };
}

function loadTarget(app, userId, storeId) {
  const user = findRecord(app, "users", userId);
  if (!targetBelongsToStore(user, storeId)) throw codedError("user_not_found");
  return user;
}

function emailExists(app, email, excludeId) {
  const row = queryOne(app, `
    SELECT COUNT(*) AS matches
    FROM users
    WHERE LOWER(email) = {:email} AND ({:excludeId} = '' OR id != {:excludeId})
  `, { email, excludeId: excludeId || "" }, { matches: 0 }) || {};
  return countValue(row.matches) > 0;
}

function findStoreUserAccess(app, storeId, userId) {
  try {
    return app.findFirstRecordByFilter(
      "store_user_access",
      "store = {:store} && user = {:user}",
      { store: storeId, user: userId },
    );
  } catch (_) {
    return null;
  }
}

function defaultAccessForRole(role) {
  const templateCode = role === "store_admin" ? "secondary_admin" : "read_only";
  return {
    templateCode,
    permissions: storePermissions.resolveTemplatePermissions(templateCode).slice().sort(),
  };
}

function ensureMasterManagedAccess(app, store, user, actor, previousRole) {
  if (!app || !store || !user || !actor || isPrimaryAdminUser(store, user)) return null;
  const role = recordString(user, "role");
  if (!STORE_ROLES.includes(role)) return null;
  let access = findStoreUserAccess(app, store.id, user.id);
  if (access && previousRole === role) return access;
  let collection;
  try { collection = app.findCollectionByNameOrId("store_user_access"); } catch (_) { return access; }
  const created = !access;
  if (!access) access = new Record(collection, {});
  const defaults = defaultAccessForRole(role);
  access.set("store", store.id);
  access.set("user", user.id);
  access.set("template_code", defaults.templateCode);
  access.set("permissions_json", defaults.permissions);
  if (created) access.set("created_by", actor.id);
  access.set("updated_by", actor.id);
  app.save(access);
  return access;
}

function validationHasField(error, field) {
  try {
    if (error && error.data && Object.prototype.hasOwnProperty.call(error.data, field)) return true;
    const serialized = JSON.stringify(error && error.data || {});
    return serialized.includes(`\"${field}\"`);
  } catch (_) {
    return false;
  }
}

function saveNewUser(app, values) {
  const user = new Record(app.findCollectionByNameOrId("users"), {});
  user.setEmail(values.email);
  user.setEmailVisibility(true);
  user.setPassword(values.password);
  user.set("display_name", values.displayName);
  user.set("phone", values.phone);
  user.set("role", values.role);
  user.set("status", values.status);
  user.set("store", values.storeId);
  const temporary = temporaryPasswordDates();
  user.set("must_change_password", true);
  user.set("temporary_password_issued_at", temporary.issued_at);
  user.set("temporary_password_expires_at", temporary.expires_at);
  try {
    app.save(user);
  } catch (error) {
    if (validationHasField(error, "email")) throw codedError("email_exists");
    if (validationHasField(error, "password")) throw codedError("invalid_password");
    throw codedError("user_create_failed");
  }
  return user;
}

function applyUserUpdate(app, user, next, revokeSessions) {
  user.setEmail(next.email);
  user.set("display_name", next.display_name);
  user.set("phone", next.phone);
  user.set("role", next.role);
  user.set("status", next.status);
  if (revokeSessions) user.refreshTokenKey();
  try {
    app.save(user);
  } catch (error) {
    if (validationHasField(error, "email")) throw codedError("email_exists");
    throw codedError("user_update_failed");
  }
}

function listStoreUsers(app, parsed) {
  const likeSearch = `%${parsed.search.toLowerCase().replace(/([%_\\])/g, "\\$1")}%`;
  const bindings = {
    storeId: parsed.storeId,
    role: parsed.role,
    status: parsed.status,
    search: likeSearch,
    limit: parsed.perPage,
    offset: (parsed.page - 1) * parsed.perPage,
  };
  const where = `
    store = {:storeId}
    AND role IN ('store_admin', 'store_staff')
    AND ({:role} = 'all' OR role = {:role})
    AND ({:status} = 'all' OR status = {:status})
    AND (
      {:search} = '%%'
      OR LOWER(email) LIKE {:search} ESCAPE '\\'
      OR LOWER(COALESCE(display_name, '')) LIKE {:search} ESCAPE '\\'
      OR LOWER(COALESCE(phone, '')) LIKE {:search} ESCAPE '\\'
    )
  `;
  const totalRow = queryOne(app, `SELECT COUNT(*) AS totalItems FROM users WHERE ${where}`, bindings, { totalItems: 0 }) || {};
  const idRows = queryRows(app, `
    SELECT id
    FROM users
    WHERE ${where}
    ORDER BY LOWER(COALESCE(display_name, '')), LOWER(email), id
    LIMIT {:limit} OFFSET {:offset}
  `, bindings, { id: "" });
  return {
    totalItems: countValue(totalRow.totalItems),
    records: idRows.map((row) => findRecord(app, "users", String(row.id || ""))).filter(Boolean),
  };
}

function listPayloadForStoreCounts(parsed, counts) {
  if (counts.total_users > COMPACT_USER_LIST_LIMIT) return parsed;
  return {
    ...parsed,
    page: 1,
    perPage: COMPACT_USER_LIST_LIMIT,
    search: "",
    role: "all",
  };
}

function handleSummary(e) {
  const context = requestContext(e, parseSummaryPayload);
  if (context.error) return sendError(e, context.error, "user_management_unavailable");
  try {
    const totalRow = queryOne($app, `
      SELECT COUNT(*) AS totalUsers
      FROM users
      WHERE store != '' AND role IN ('store_admin', 'store_staff')
    `, {}, { totalUsers: 0 }) || {};
    const stores = context.parsed.storeIds.map((storeId) => {
      if (!findRecord($app, "stores", storeId)) throw codedError("store_not_found");
      return { store_id: storeId, ...storeUserCounts($app, storeId) };
    });
    return e.json(200, { ok: true, total_users: countValue(totalRow.totalUsers), stores });
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "user_management_unavailable");
    logFailure("summary");
    return sendError(e, "", "user_management_unavailable");
  }
}

function handleList(e) {
  const context = requestContext(e, parseListPayload);
  if (context.error) return sendError(e, context.error, "user_management_unavailable");
  try {
    const store = findRecord($app, "stores", context.parsed.storeId);
    if (!store) return sendError(e, "store_not_found", "user_management_unavailable");
    const counts = storeUserCounts($app, store.id);
    const listPayload = listPayloadForStoreCounts(context.parsed, counts);
    const result = listStoreUsers($app, listPayload);
    const totalPages = Math.max(1, Math.ceil(result.totalItems / listPayload.perPage));
    return e.json(200, {
      ok: true,
      store: storeResponse(store),
      plan: planResponse(store, counts, $app),
      users: sanitizeUsersWithDevices($app, store, result.records, counts.active_admins),
      pagination: {
        page: listPayload.page,
        per_page: listPayload.perPage,
        total_items: result.totalItems,
        total_pages: totalPages,
      },
    });
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "user_management_unavailable");
    logFailure("list");
    return sendError(e, "", "user_management_unavailable");
  }
}

function handleDetail(e) {
  const context = requestContext(e, parseTargetPayload);
  if (context.error) return sendError(e, context.error, "user_management_unavailable");
  try {
    const store = findRecord($app, "stores", context.parsed.storeId);
    if (!store) return sendError(e, "store_not_found", "user_management_unavailable");
    const user = findRecord($app, "users", context.parsed.userId);
    if (!targetBelongsToStore(user, store.id)) return sendError(e, "user_not_found", "user_management_unavailable");
    const counts = storeUserCounts($app, store.id);
    return e.json(200, {
      ok: true,
      store: storeResponse(store),
      plan: planResponse(store, counts, $app),
      user: sanitizeUsersWithDevices($app, store, [user], counts.active_admins)[0],
      protection: {
        last_active_admin: sanitizeUser(user, counts.active_admins).is_last_active_admin,
      },
    });
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "user_management_unavailable");
    logFailure("detail");
    return sendError(e, "", "user_management_unavailable");
  }
}

function handleCreate(e) {
  const context = requestContext(e, parseCreatePayload);
  if (context.error) return sendError(e, context.error, "user_create_failed");
  let response = null;
  let failureStage = "transaction";
  try {
    $app.runInTransaction((txApp) => {
      failureStage = "context";
      const loaded = loadTransactionContext(txApp, context.actorId, context.parsed.storeId);
      failureStage = "email";
      if (emailExists(txApp, context.parsed.email, "")) throw codedError("email_exists");
      failureStage = "counts";
      const counts = storeUserCounts(txApp, loaded.store.id);
      failureStage = "plan";
      const access = planAccess(loaded.store);
      const projectedActive = counts.active_users + (context.parsed.status === "active" ? 1 : 0);
      if (context.parsed.status === "active") {
        const projectedAccess = planAccess(loaded.store, projectedActive);
        if (!projectedAccess.allowed) throw codedError("active_user_limit_reached");
      }
      failureStage = "user_save";
      const user = saveNewUser(txApp, context.parsed);
      failureStage = "access_save";
      ensureMasterManagedAccess(txApp, loaded.store, user, loaded.actor, "");
      const next = userSnapshot(user);
      failureStage = "audit_save";
      createAudit(txApp, loaded.store, loaded.actor, user, "user_created", null, next, false, context.parsed.reason);
      createAudit(
        txApp,
        loaded.store,
        loaded.actor,
        user,
        "temporary_password_issued",
        next,
        next,
        false,
        context.parsed.reason
      );
      const nextCounts = {
        ...counts,
        total_users: counts.total_users + 1,
        active_users: projectedActive,
        active_admins: counts.active_admins + (next.status === "active" && next.role === "store_admin" ? 1 : 0),
        active_staff: counts.active_staff + (next.status === "active" && next.role === "store_staff" ? 1 : 0),
      };
      response = {
        ok: true,
        user: sanitizeUser(user, nextCounts.active_admins, {
          authorized_device_count: 0,
          device_limit: storeDeviceLimit(loaded.store),
        }),
        plan: planResponse(loaded.store, nextCounts, txApp),
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) {
      if (code === "user_create_failed") logFailure(`create_${failureStage}`);
      return sendError(e, code, "user_create_failed");
    }
    logFailure(`create_${failureStage}`);
    return sendError(e, "", "user_create_failed");
  }
}

function handleUpdate(e) {
  const context = requestContext(e, parseUpdatePayload);
  if (context.error) return sendError(e, context.error, "user_update_failed");
  let response = null;
  try {
    $app.runInTransaction((txApp) => {
      const loaded = loadTransactionContext(txApp, context.actorId, context.parsed.storeId);
      const user = loadTarget(txApp, context.parsed.userId, loaded.store.id);
      const previous = userSnapshot(user);
      const next = {
        email: context.parsed.email,
        display_name: context.parsed.displayName,
        phone: context.parsed.phone,
        role: context.parsed.role,
        status: context.parsed.status,
      };
      if (isPrimaryAdminUser(loaded.store, user)
        && (next.role !== "store_admin" || next.status !== "active")) {
        throw codedError("primary_admin_replacement_required");
      }
      if (emailExists(txApp, next.email, user.id)) throw codedError("email_exists");
      const counts = storeUserCounts(txApp, loaded.store.id);
      const projected = projectedCounts(counts, previous, next);
      if (projected.active_admins < 1 && counts.active_admins >= 1) {
        throw codedError("last_active_admin_required");
      }
      planAccess(loaded.store);
      if (projected.active_users > counts.active_users) {
        const access = planAccess(loaded.store, projected.active_users);
        if (!access.allowed) throw codedError("active_user_limit_reached");
      }
      const sessionsRevoked = sessionsMustBeRevoked("user_updated", previous, next);
      applyUserUpdate(txApp, user, next, sessionsRevoked);
      ensureMasterManagedAccess(txApp, loaded.store, user, loaded.actor, previous.role);
      createAudit(
        txApp,
        loaded.store,
        loaded.actor,
        user,
        "user_updated",
        previous,
        next,
        sessionsRevoked,
        context.parsed.reason
      );
      const nextCounts = {
        ...counts,
        active_users: projected.active_users,
        active_admins: projected.active_admins,
      };
      response = {
        ok: true,
        user: sanitizeUsersWithDevices(txApp, loaded.store, [user], nextCounts.active_admins)[0],
        plan: planResponse(loaded.store, nextCounts, txApp),
        sessions_revoked: sessionsRevoked,
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "user_update_failed");
    logFailure("update");
    return sendError(e, "", "user_update_failed");
  }
}

function handleSelfPasswordChange(e) {
  const context = selfPasswordRequestContext(e);
  if (context.error) return sendError(e, context.error, "password_change_failed");
  let response = null;
  try {
    $app.runInTransaction((txApp) => {
      const loaded = loadSelfPasswordContext(txApp, context.actorId, true);
      if (recordBoolean(loaded.actor, "must_change_password")) {
        throw codedError("temporary_password_change_required");
      }
      if (!passwordMeetsCollectionPolicy(txApp, context.parsed.newPassword)) {
        throw codedError("invalid_password");
      }
      const credentialError = validateSelfPasswordCredentials(loaded.actor, context.parsed);
      if (credentialError) throw codedError(credentialError);
      const snapshot = userSnapshot(loaded.actor);
      const sessionsRevoked = sessionsMustBeRevoked("self_password_changed", snapshot, snapshot);
      loaded.actor.setPassword(context.parsed.newPassword);
      if (sessionsRevoked) loaded.actor.refreshTokenKey();
      try {
        txApp.save(loaded.actor);
      } catch (error) {
        if (validationHasField(error, "password")) throw codedError("invalid_password");
        throw codedError("password_change_failed");
      }
      createAudit(
        txApp,
        loaded.store,
        loaded.actor,
        loaded.actor,
        "self_password_changed",
        snapshot,
        snapshot,
        sessionsRevoked,
        ""
      );
      response = selfPasswordSuccessResponse();
    });
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "password_change_failed");
    logFailure("self_password_change");
    return sendError(e, "", "password_change_failed");
  }
}

function handleChangePassword(e) {
  const context = requestContext(e, parsePasswordPayload);
  if (context.error) return sendError(e, context.error, "temporary_password_issue_failed");
  let response = null;
  try {
    $app.runInTransaction((txApp) => {
      const loaded = loadTransactionContext(txApp, context.actorId, context.parsed.storeId);
      const user = loadTarget(txApp, context.parsed.userId, loaded.store.id);
      if (!passwordMeetsCollectionPolicy(txApp, context.parsed.password)) {
        throw codedError("invalid_password");
      }
      const snapshot = userSnapshot(user);
      const sessionsRevoked = sessionsMustBeRevoked("temporary_password_issued", snapshot, snapshot);
      const temporary = temporaryPasswordDates();
      user.setPassword(context.parsed.password);
      user.set("must_change_password", true);
      user.set("temporary_password_issued_at", temporary.issued_at);
      user.set("temporary_password_expires_at", temporary.expires_at);
      if (sessionsRevoked) user.refreshTokenKey();
      try {
        txApp.save(user);
      } catch (error) {
        if (validationHasField(error, "password")) throw codedError("invalid_password");
        throw codedError("temporary_password_issue_failed");
      }
      createAudit(
        txApp,
        loaded.store,
        loaded.actor,
        user,
        "temporary_password_issued",
        snapshot,
        snapshot,
        sessionsRevoked,
        context.parsed.reason
      );
      response = {
        ok: true,
        user_id: user.id,
        temporary_password_issued: true,
        must_change_password: true,
        temporary_password_expires_at: temporary.expires_at,
        sessions_revoked: sessionsRevoked,
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "temporary_password_issue_failed");
    logFailure("temporary_password_issue");
    return sendError(e, "", "temporary_password_issue_failed");
  }
}

function handleTemporaryPasswordChange(e) {
  const context = temporaryPasswordRequestContext(e);
  if (context.error) return sendError(e, context.error, "forced_password_change_failed");
  let response = null;
  try {
    $app.runInTransaction((txApp) => {
      const loaded = loadSelfPasswordContext(txApp, context.actorId, true);
      const state = temporaryPasswordState(loaded.actor);
      if (state === "none") throw codedError("temporary_password_not_required");
      if (state === "expired") throw codedError("temporary_password_expired");
      if (!passwordMeetsCollectionPolicy(txApp, context.parsed.newPassword)) {
        throw codedError("invalid_password");
      }
      const credentialError = validateSelfPasswordCredentials(loaded.actor, context.parsed);
      if (credentialError) throw codedError(credentialError);
      const snapshot = userSnapshot(loaded.actor);
      loaded.actor.setPassword(context.parsed.newPassword);
      loaded.actor.set("must_change_password", false);
      loaded.actor.set("temporary_password_issued_at", "");
      loaded.actor.set("temporary_password_expires_at", "");
      loaded.actor.refreshTokenKey();
      try {
        txApp.save(loaded.actor);
      } catch (error) {
        if (validationHasField(error, "password")) throw codedError("invalid_password");
        throw codedError("forced_password_change_failed");
      }
      createAudit(
        txApp,
        loaded.store,
        loaded.actor,
        loaded.actor,
        "forced_password_changed",
        snapshot,
        snapshot,
        true,
        ""
      );
      response = {
        ok: true,
        code: "forced_password_changed",
        must_change_password: false,
        reauth_required: true,
        sessions_revoked: true,
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "forced_password_change_failed");
    logFailure("forced_password_change");
    return sendError(e, "", "forced_password_change_failed");
  }
}

function handleSelfRevokeSessions(e) {
  const context = selfRevokeRequestContext(e);
  if (context.error) return sendError(e, context.error, "session_revocation_failed");
  let response = null;
  try {
    $app.runInTransaction((txApp) => {
      const loaded = loadSelfPasswordContext(txApp, context.actorId, true);
      if (recordBoolean(loaded.actor, "must_change_password")) {
        throw codedError("temporary_password_change_required");
      }
      const snapshot = userSnapshot(loaded.actor);
      loaded.actor.refreshTokenKey();
      try {
        txApp.save(loaded.actor);
      } catch (_) {
        throw codedError("session_revocation_failed");
      }
      createAudit(
        txApp,
        loaded.store,
        loaded.actor,
        loaded.actor,
        "sessions_revoked",
        snapshot,
        snapshot,
        true,
        ""
      );
      response = {
        ok: true,
        code: "sessions_revoked",
        reauth_required: true,
        sessions_revoked: true,
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "session_revocation_failed");
    logFailure("self_revoke_sessions");
    return sendError(e, "", "session_revocation_failed");
  }
}

function handleRevokeSessions(e) {
  const context = requestContext(e, parseRevokePayload);
  if (context.error) return sendError(e, context.error, "session_revocation_failed");
  let response = null;
  try {
    $app.runInTransaction((txApp) => {
      const loaded = loadTransactionContext(txApp, context.actorId, context.parsed.storeId);
      const user = loadTarget(txApp, context.parsed.userId, loaded.store.id);
      const snapshot = userSnapshot(user);
      const sessionsRevoked = sessionsMustBeRevoked("sessions_revoked", snapshot, snapshot);
      if (sessionsRevoked) user.refreshTokenKey();
      try {
        txApp.save(user);
      } catch (_) {
        throw codedError("session_revocation_failed");
      }
      createAudit(
        txApp,
        loaded.store,
        loaded.actor,
        user,
        "sessions_revoked",
        snapshot,
        snapshot,
        sessionsRevoked,
        context.parsed.reason
      );
      response = { ok: true, user_id: user.id, sessions_revoked: sessionsRevoked };
    });
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "session_revocation_failed");
    logFailure("revoke_sessions");
    return sendError(e, "", "session_revocation_failed");
  }
}

function deleteStoreUserTransactional(app, options) {
  const input = options && typeof options === "object" ? options : {};
  const store = input.store;
  const actor = input.actor;
  const user = input.target;
  if (!store || !actor || !targetBelongsToStore(user, store.id)) throw codedError("user_not_found");
  const snapshot = userSnapshot(user);
  if (isPrimaryAdminUser(store, user)) throw codedError("primary_admin_replacement_required");
  if (recordString(actor, "role") !== "master_admin" && actor.id === user.id) {
    throw codedError("primary_admin_replacement_required");
  }
  if (normalizeEmail(input.confirmationEmail) !== snapshot.email) {
    throw codedError("delete_confirmation_mismatch");
  }
  let deletionReason = null;
  let reason = "";
  if (recordString(actor, "role") === "master_admin" && !input.reasonCode) {
    reason = bounded(input.reason, 500).trim();
    if (!reason) throw codedError("delete_reason_required");
    if (reason.length < 8) throw codedError("delete_reason_too_short");
  } else {
    const validatedReason = deleteReasons.validateStoreDeleteReason(input.reasonCode, input.reasonDetail);
    if (!validatedReason.ok) throw codedError(validatedReason.error);
    deletionReason = validatedReason.value;
    reason = deleteReasons.serializeDeleteReason(deletionReason);
    if (!reason) throw codedError("delete_reason_invalid");
  }

  const counts = storeUserCounts(app, store.id);
  if (projectedActiveAdminsAfterDeletion(counts, snapshot) < 1) {
    throw codedError("last_active_admin_required");
  }

  // The specialized record and its central counterpart are written before
  // relations are detached; both keep historical snapshots after auth delete.
  const deletionAudit = createAudit(
    app,
    store,
    actor,
    user,
    "user_deleted",
    snapshot,
    null,
    true,
    reason,
    deletionReason
  );

  try {
    user.refreshTokenKey();
    app.save(user);
  } catch (_) { throw codedError("user_delete_failed"); }

  const devices = loadTargetDevices(app, user.id);
  assertNoUnexpectedRequiredUserRelations(app, user.id);
  clearOptionalUserRelations(app, user.id);
  clearDeviceAuditRelations(app, devices);

  devices.forEach((device) => {
    try { app.delete(device); } catch (_) { throw codedError("user_delete_failed"); }
  });
  if (loadTargetDevices(app, user.id).length) throw codedError("user_delete_failed");
  deleteTargetAccessRecords(app, store.id, user.id);

  try { app.delete(user); } catch (_) { throw codedError("user_delete_failed"); }
  if (findRecord(app, "users", user.id)) throw codedError("user_delete_failed");
  const persistedAudit = findRecord(app, AUDIT_COLLECTION, deletionAudit.id);
  if (!persistedAudit || recordString(persistedAudit, "action") !== "user_deleted") {
    throw codedError("user_delete_failed");
  }
  const central = activityAudit.findActivityBySource(app, store.id, `team:user_deleted:${deletionAudit.id}`);
  if (!central) throw codedError("user_delete_failed");

  return {
    ok: true,
    user_deleted: true,
    user_id: user.id,
    sessions_revoked: true,
  };
}

function handleDelete(e) {
  const context = requestContext(e, parseDeletePayload);
  if (context.error) return sendError(e, context.error, "user_delete_failed");
  let response = null;
  try {
    $app.runInTransaction((txApp) => {
      const loaded = loadTransactionContext(txApp, context.actorId, context.parsed.storeId);
      const user = loadTarget(txApp, context.parsed.userId, loaded.store.id);
      response = deleteStoreUserTransactional(txApp, {
        store: loaded.store,
        actor: loaded.actor,
        target: user,
        confirmationEmail: context.parsed.confirmationEmail,
        reason: context.parsed.reason,
      });
    });
    if (!response) throw codedError("user_delete_failed");
    return e.json(200, response);
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "user_delete_failed");
    logFailure("delete");
    return sendError(e, "", "user_delete_failed");
  }
}

function handleAudit(e) {
  const context = requestContext(e, parseAuditPayload);
  if (context.error) return sendError(e, context.error, "audit_load_failed");
  try {
    const store = findRecord($app, "stores", context.parsed.storeId);
    if (!store) return sendError(e, "store_not_found", "audit_load_failed");
    const user = findRecord($app, "users", context.parsed.userId);
    if (!targetBelongsToStore(user, store.id)) return sendError(e, "user_not_found", "audit_load_failed");
    const offset = (context.parsed.page - 1) * context.parsed.perPage;
    const totalRow = queryOne($app, `
      SELECT COUNT(*) AS totalItems
      FROM store_user_audit
      WHERE store = {:storeId} AND target_user = {:userId}
    `, { storeId: store.id, userId: user.id }, { totalItems: 0 }) || {};
    const records = $app.findRecordsByFilter(
      AUDIT_COLLECTION,
      "store = {:storeId} && target_user = {:userId}",
      "-created,-id",
      context.parsed.perPage,
      offset,
      { storeId: store.id, userId: user.id }
    ) || [];
    const totalItems = countValue(totalRow.totalItems);
    return e.json(200, {
      ok: true,
      store: storeResponse(store),
      user: sanitizeUsersWithDevices(
        $app,
        store,
        [user],
        storeUserCounts($app, store.id).active_admins
      )[0],
      audit: records.map(mapAudit),
      pagination: {
        page: context.parsed.page,
        per_page: context.parsed.perPage,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / context.parsed.perPage)),
      },
    });
  } catch (error) {
    const code = errorCode(error);
    if (code) return sendError(e, code, "audit_load_failed");
    logFailure("audit");
    return sendError(e, "", "audit_load_failed");
  }
}

function rejectSuspendedAuthentication(e) {
  if (e && e.record && recordString(e.record, "status") === "suspended") {
    throw new BadRequestError("Failed to authenticate.");
  }
}

function throwTemporaryPasswordAuthError() {
  const code = "temporary_password_expired";
  const message = "Temporary access is no longer available.";
  throw new BadRequestError(message, {
    [code]: new ValidationError(code, message),
  });
}

function enforceTemporaryPasswordAuthentication(e) {
  const user = e && e.record;
  if (!user) return;
  if (!STORE_ROLES.includes(recordString(user, "role"))) return;
  if (temporaryPasswordState(user) === "expired") throwTemporaryPasswordAuthError();
}

module.exports = {
  AUDIT_ACTIONS,
  TEAM_AUDIT_ACTIONS,
  STORE_ROLES,
  TEMPORARY_PASSWORD_TTL_HOURS,
  TEMPORARY_PASSWORD_TTL_MS,
  USER_STATUSES,
  auditActorRole,
  buildAuditValues,
  deleteStoreUserTransactional,
  exactPayload,
  enforceTemporaryPasswordAuthentication,
  handleAudit,
  handleChangePassword,
  handleCreate,
  handleDelete,
  handleDetail,
  handleList,
  handleRevokeSessions,
  handleSelfRevokeSessions,
  handleSelfPasswordChange,
  handleTemporaryPasswordChange,
  handleSummary,
  handleUpdate,
  isActiveMaster,
  isActiveStoreAdmin,
  isActiveStoreUser,
  isPrimaryAdminUser,
  defaultAccessForRole,
  ensureMasterManagedAccess,
  isValidRecordId,
  listPayloadForStoreCounts,
  mapAudit,
  normalizeEmail,
  parseAuditPayload,
  parseCreatePayload,
  parseDeletePayload,
  parseListPayload,
  parsePasswordPayload,
  parseRevokePayload,
  parseSelfPasswordPayload,
  parseSelfRevokePayload,
  parseSummaryPayload,
  parseTargetPayload,
  parseUpdatePayload,
  planAccess,
  planResponse,
  passwordMeetsCollectionPolicy,
  projectedCounts,
  projectedActiveAdminsAfterDeletion,
  rejectSuspendedAuthentication,
  requireAuthenticatedUser,
  sanitizeUser,
  sanitizeUsersWithDevices,
  selfPasswordSuccessResponse,
  sessionsMustBeRevoked,
  storeAuthorizedDeviceCounts,
  storeUserDeviceSummaries,
  storeDeviceLimit,
  targetBelongsToStore,
  temporaryPasswordDates,
  temporaryPasswordState,
  updateRevokesSessions,
  validateSelfPasswordCredentials,
  userSnapshot,
};
