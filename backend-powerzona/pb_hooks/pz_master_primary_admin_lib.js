/// <reference path="../pb_data/types.d.ts" />

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const storePermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const MAX_ASSIGNABLE_PERMISSIONS = 28;
const STORE_ROLES = Object.freeze(["store_admin", "store_staff"]);
const ACTIVE_ADMIN_ROLE = "store_admin";
const REPLACEMENT_CONFIRMATION = "REEMPLAZAR ADMINISTRADOR PRINCIPAL";
const PREVIOUS_USER_MODES = Object.freeze(["keep_active", "suspend"]);
const TEMPLATE_CODES = Object.freeze([
  "secondary_admin",
  "catalog_inventory",
  "orders_shipping",
  "marketing_promotions",
  "read_only",
  "custom",
]);
const AUDIT_ACTIONS = Object.freeze([
  "primary_admin_assigned",
  "primary_admin_replaced",
  "team_user_updated",
  "team_user_suspended",
  "plan_access_locked",
]);
const SAFE_ERRORS = new Set([
  "unauthorized",
  "invalid_payload",
  "invalid_template",
  "invalid_permissions",
  "reserved_permission",
  "store_not_found",
  "user_not_found",
  "primary_admin_not_configured",
  "primary_admin_already_configured",
  "primary_admin_same_user",
  "primary_admin_candidate_inactive",
  "primary_admin_candidate_role",
  "active_user_limit_reached",
  "replacement_confirmation_mismatch",
  "replacement_reason_required",
  "primary_admin_unavailable",
  "primary_admin_assign_failed",
  "primary_admin_replace_failed",
]);

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try {
      const value = record.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try { return record.getString(key); } catch (_) {}
  }
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

function safeDate(record, key) {
  const value = recordString(record, key);
  if (!value) return "";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
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

function isActiveMaster(record) {
  return !!record
    && recordString(record, "role") === "master_admin"
    && recordString(record, "status") === "active";
}

function primaryAdminId(store) {
  return relationId(store, "primary_admin_user");
}

function belongsToStore(user, storeId) {
  return !!user && relationId(user, "store") === storeId && STORE_ROLES.includes(recordString(user, "role"));
}

function isActivePrimaryCandidate(user, storeId) {
  return belongsToStore(user, storeId)
    && recordString(user, "role") === ACTIVE_ADMIN_ROLE
    && recordString(user, "status") === "active";
}

function validResult(value) {
  return { ok: true, value };
}

function invalidResult(error) {
  return { ok: false, error };
}

function parseStatusPayload(body) {
  if (!exactPayload(body, ["store_id"])) return invalidResult("invalid_payload");
  const storeId = bodyValue(body, "store_id");
  return isValidId(storeId) ? validResult({ storeId }) : invalidResult("invalid_payload");
}

function parseReason(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 500) return null;
  return value.trim();
}

function parseAssignPayload(body) {
  if (!exactPayload(body, ["store_id", "user_id", "reason"])) return invalidResult("invalid_payload");
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const reason = parseReason(bodyValue(body, "reason"));
  if (!isValidId(storeId) || !isValidId(userId)) return invalidResult("invalid_payload");
  if (!reason) return invalidResult("replacement_reason_required");
  return validResult({ storeId, userId, reason });
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
  const raw = values.map((permission) => typeof permission === "string" ? permission.trim() : "");
  if (raw.some((permission) => !permission)) throw codedError("invalid_permissions");
  if (raw.some((permission) => storePermissions.RESERVED_PERMISSIONS.includes(permission))) {
    throw codedError("reserved_permission");
  }
  if (raw.some((permission) => !storePermissions.ASSIGNABLE_PERMISSION_KEYS.includes(permission))) {
    throw codedError("invalid_permissions");
  }
  return raw.filter((permission, index, values) => values.indexOf(permission) === index);
}

function normalizePermissions(value) {
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
    const permission = String(input[index] === null || input[index] === undefined ? "" : input[index]).trim();
    if (!storePermissions.ASSIGNABLE_PERMISSION_KEYS.includes(permission)) throw codedError("invalid_permissions");
    selected[permission] = true;
  }
  let changed = true;
  while (changed) {
    changed = false;
    Object.keys(selected).forEach((permission) => {
      const dependencies = storePermissions.PERMISSION_DEPENDENCIES[permission];
      const length = Number(dependencies && dependencies.length);
      for (let index = 0; Number.isInteger(length) && index < length; index += 1) {
        const dependency = dependencies[index];
        if (!storePermissions.ASSIGNABLE_PERMISSION_KEYS.includes(dependency) || selected[dependency]) continue;
        selected[dependency] = true;
        changed = true;
      }
    });
  }
  return Object.keys(selected).sort();
}

function permissionSelection(templateCode, rawPermissions) {
  if (!TEMPLATE_CODES.includes(templateCode)) throw codedError("invalid_template");
  const normalized = normalizePermissions(normalizedRawPermissions(rawPermissions));
  if (templateCode === "custom") return { templateCode, permissions: normalized };
  const templatePermissions = normalizePermissions(storePermissions.resolveTemplatePermissions(templateCode));
  const exact = normalized.length === templatePermissions.length
    && normalized.every((permission, index) => permission === templatePermissions[index]);
  return { templateCode: exact ? templateCode : "custom", permissions: normalized };
}

function parseReplacePayload(body) {
  const keys = [
    "store_id",
    "user_id",
    "previous_user_mode",
    "template_code",
    "permissions",
    "reason",
    "confirmation",
  ];
  if (!exactPayload(body, keys)) return invalidResult("invalid_payload");
  const storeId = bodyValue(body, "store_id");
  const userId = bodyValue(body, "user_id");
  const previousUserMode = bodyValue(body, "previous_user_mode");
  const reason = parseReason(bodyValue(body, "reason"));
  if (!isValidId(storeId) || !isValidId(userId) || !PREVIOUS_USER_MODES.includes(previousUserMode)) {
    return invalidResult("invalid_payload");
  }
  if (!reason) return invalidResult("replacement_reason_required");
  if (bodyValue(body, "confirmation") !== REPLACEMENT_CONFIRMATION) {
    return invalidResult("replacement_confirmation_mismatch");
  }
  if (previousUserMode === "suspend") {
    const suspendedPermissions = plainPermissionArray(bodyValue(body, "permissions"));
    if (bodyValue(body, "template_code") !== "" || !suspendedPermissions
      || suspendedPermissions.length !== 0) {
      return invalidResult("invalid_payload");
    }
    return validResult({
      storeId,
      userId,
      previousUserMode,
      templateCode: "",
      permissions: [],
      reason,
    });
  }
  try {
    const selection = permissionSelection(bodyValue(body, "template_code"), bodyValue(body, "permissions"));
    return validResult({ storeId, userId, previousUserMode, reason, ...selection });
  } catch (error) {
    return invalidResult(errorCode(error) || "invalid_permissions");
  }
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
  const safe = SAFE_ERRORS.has(code) ? code : "primary_admin_unavailable";
  const error = new Error(safe);
  error.code = safe;
  return error;
}

function errorCode(error) {
  const code = String(error && (error.code || error.message) || "");
  return SAFE_ERRORS.has(code) ? code : "";
}

function statusForError(code) {
  if (code === "unauthorized") return 403;
  if (["store_not_found", "user_not_found"].includes(code)) return 404;
  if ([
    "primary_admin_not_configured",
    "primary_admin_already_configured",
    "primary_admin_same_user",
    "primary_admin_candidate_inactive",
    "primary_admin_candidate_role",
    "active_user_limit_reached",
  ].includes(code)) return 409;
  if ([
    "invalid_payload",
    "invalid_template",
    "invalid_permissions",
    "reserved_permission",
    "replacement_confirmation_mismatch",
    "replacement_reason_required",
  ].includes(code)) return 400;
  if (code === "primary_admin_unavailable") return 503;
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

function fieldByName(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function primaryAdminReady(app) {
  try {
    const stores = app.findCollectionByNameOrId("stores");
    const access = app.findCollectionByNameOrId("store_user_access");
    const audit = app.findCollectionByNameOrId("store_user_audit");
    return !!fieldByName(stores, "primary_admin_user")
      && !!fieldByName(access, "template_code")
      && !!fieldByName(access, "permissions_json")
      && access.listRule === null
      && access.viewRule === null
      && access.createRule === null
      && access.updateRule === null
      && access.deleteRule === null
      && !!fieldByName(audit, "previous_template_code")
      && !!fieldByName(audit, "new_template_code")
      && !!fieldByName(audit, "previous_permissions_json")
      && !!fieldByName(audit, "new_permissions_json")
      && audit.listRule === null
      && audit.viewRule === null
      && audit.createRule === null
      && audit.updateRule === null
      && audit.deleteRule === null;
  } catch (_) {
    return false;
  }
}

function requestContext(e, parser) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!info || !isActiveMaster(info.auth)) throw codedError("unauthorized");
    if (!primaryAdminReady($app)) throw codedError("primary_admin_unavailable");
    const parsed = parser(info.body || {});
    if (!parsed.ok) throw codedError(parsed.error);
    const actorId = recordString(info.auth, "id");
    if (!isValidId(actorId)) throw codedError("unauthorized");
    return { actorId, parsed: parsed.value };
  } catch (error) {
    return { error };
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

function activeUserCount(app, storeId) {
  const row = queryOne(app, `
    SELECT COUNT(*) AS activeUsers
    FROM users
    WHERE store = {:storeId}
      AND role IN ('store_admin', 'store_staff')
      AND status = 'active'
  `, { storeId }, { activeUsers: 0 }) || {};
  return countValue(row.activeUsers);
}

function planLimit(store) {
  const access = capabilities.resolveStoreCapabilityAccess(
    store,
    "max_active_users",
    { enforceExpiration: true },
  );
  if (!access || !Number.isInteger(access.limit) || access.limit < 1
    || ["invalid_capability", "invalid_plan_data"].includes(access.reason)) {
    throw codedError("primary_admin_unavailable");
  }
  return access.is_expired ? 1 : access.limit;
}

function assertProjectedActiveUsers(projectedActiveUsers, maxActiveUsers) {
  if (!Number.isInteger(projectedActiveUsers) || projectedActiveUsers < 1
    || !Number.isInteger(maxActiveUsers) || maxActiveUsers < 1) {
    throw codedError("primary_admin_unavailable");
  }
  if (projectedActiveUsers > maxActiveUsers) throw codedError("active_user_limit_reached");
  return true;
}

function projectedReplacementActiveUsers(activeUsers, previousUser, previousUserMode) {
  const wasActive = !!previousUser
    && STORE_ROLES.includes(recordString(previousUser, "role"))
    && recordString(previousUser, "status") === "active";
  const willBeActive = previousUserMode === "keep_active";
  return activeUsers - (wasActive ? 1 : 0) + (willBeActive ? 1 : 0);
}

function assertPrimaryChangeQuota(app, store, previousUser, previousUserMode) {
  const limit = planLimit(store);
  // Free/Básico intentionally preserve additional users with status=active
  // while their effective access is blocked by plan. Selecting a principal
  // must remain possible in that preserved downgrade state.
  if (limit <= 1) return true;
  const activeUsers = activeUserCount(app, store.id);
  const projected = previousUser
    ? projectedReplacementActiveUsers(activeUsers, previousUser, previousUserMode)
    : activeUsers;
  return assertProjectedActiveUsers(projected, limit);
}

function lockStore(app, storeId) {
  app.db().newQuery("UPDATE stores SET id = id WHERE id = {:storeId}").bind({ storeId }).execute();
}

function loadLockedContext(app, actorId, storeId) {
  lockStore(app, storeId);
  const actor = findRecord(app, "users", actorId);
  if (!isActiveMaster(actor)) throw codedError("unauthorized");
  const store = findRecord(app, "stores", storeId);
  if (!store) throw codedError("store_not_found");
  return { actor, store };
}

function loadCandidate(app, store, userId) {
  const user = findRecord(app, "users", userId);
  if (!user || !belongsToStore(user, store.id)) throw codedError("user_not_found");
  if (recordString(user, "status") !== "active") throw codedError("primary_admin_candidate_inactive");
  if (recordString(user, "role") !== ACTIVE_ADMIN_ROLE) throw codedError("primary_admin_candidate_role");
  return user;
}

function sanitizeCandidate(user, configuredPrimaryId) {
  return {
    id: String(user.id || recordString(user, "id")).slice(0, 15),
    email: bounded(recordString(user, "email").toLowerCase(), 254),
    display_name: bounded(recordString(user, "display_name"), 140),
    phone: bounded(recordString(user, "phone"), 60),
    role: recordString(user, "role") === ACTIVE_ADMIN_ROLE ? ACTIVE_ADMIN_ROLE : "",
    status: recordString(user, "status") === "active" ? "active" : "",
    created: safeDate(user, "created"),
    is_primary_admin: !!configuredPrimaryId && user.id === configuredPrimaryId,
  };
}

function activeAdminCandidates(app, store) {
  const idRows = queryRows(app, `
    SELECT id
    FROM users
    WHERE store = {:storeId} AND role = 'store_admin' AND status = 'active'
    ORDER BY CASE WHEN id = {:primaryId} THEN 0 ELSE 1 END,
      LOWER(COALESCE(display_name, '')), LOWER(email), id
  `, { storeId: store.id, primaryId: primaryAdminId(store) }, { id: "" });
  return idRows
    .map((row) => findRecord(app, "users", String(row.id || "")))
    .filter((user) => isActivePrimaryCandidate(user, store.id));
}

function primaryState(store, primary, candidateCount) {
  const configuredId = primaryAdminId(store);
  if (configuredId) {
    if (primary && isActivePrimaryCandidate(primary, store.id)) return "configured";
    return "configured_invalid";
  }
  if (candidateCount > 1) return "pending_multiple";
  if (candidateCount === 1) return "pending_single";
  return "missing";
}

function statusPayload(app, store) {
  const configuredId = primaryAdminId(store);
  const primary = configuredId ? findRecord(app, "users", configuredId) : null;
  const candidates = activeAdminCandidates(app, store);
  const activeUsers = activeUserCount(app, store.id);
  const maxActiveUsers = planLimit(store);
  return {
    ok: true,
    store: {
      id: String(store.id || "").slice(0, 15),
      name: bounded(recordString(store, "name"), 140),
      slug: bounded(recordString(store, "slug"), 80),
    },
    state: primaryState(store, primary, candidates.length),
    primary_admin: configuredId ? {
      id: configuredId,
      valid: !!primary && isActivePrimaryCandidate(primary, store.id),
      ...(primary ? sanitizeCandidate(primary, configuredId) : {}),
    } : null,
    candidates: candidates.map((user) => sanitizeCandidate(user, configuredId)),
    quota: {
      active_users: activeUsers,
      max_active_users: maxActiveUsers,
      within_limit: activeUsers <= maxActiveUsers,
    },
  };
}

function findAccess(app, storeId, userId) {
  try {
    return app.findFirstRecordByFilter(
      "store_user_access",
      "store = {:storeId} && user = {:userId}",
      { storeId, userId },
    );
  } catch (_) {
    return null;
  }
}

function accessPermissions(access) {
  try {
    if (access && typeof access.getStringSlice === "function") {
      return normalizePermissions(access.getStringSlice("permissions_json"));
    }
  } catch (_) {}
  const value = recordValue(access, "permissions_json");
  if (Array.isArray(value)) {
    try { return normalizePermissions(value); } catch (_) { return []; }
  }
  if (typeof value === "string" && value) {
    try { return normalizePermissions(JSON.parse(value)); } catch (_) { return []; }
  }
  return [];
}

function userSnapshot(user, access) {
  return {
    email: bounded(recordString(user, "email").toLowerCase(), 254),
    display_name: bounded(recordString(user, "display_name"), 140),
    phone: bounded(recordString(user, "phone"), 60),
    role: STORE_ROLES.includes(recordString(user, "role")) ? recordString(user, "role") : "",
    status: ["active", "suspended"].includes(recordString(user, "status")) ? recordString(user, "status") : "",
    template_code: access && TEMPLATE_CODES.includes(recordString(access, "template_code"))
      ? recordString(access, "template_code")
      : "",
    permissions: access ? accessPermissions(access) : [],
  };
}

function principalSnapshot(user) {
  return {
    ...userSnapshot(user, null),
    permissions: Array.isArray(storePermissions.PRIMARY_ADMIN_PERMISSION_KEYS)
      ? storePermissions.PRIMARY_ADMIN_PERMISSION_KEYS.slice().sort()
      : [],
  };
}

function roleForTemplate(templateCode) {
  return templateCode === "secondary_admin" ? "store_admin" : "store_staff";
}

function saveAccess(app, store, user, actor, templateCode, selectedPermissions) {
  let access = findAccess(app, store.id, user.id);
  const created = !access;
  if (!access) access = new Record(app.findCollectionByNameOrId("store_user_access"), {});
  access.set("store", store.id);
  access.set("user", user.id);
  access.set("template_code", templateCode);
  access.set("permissions_json", selectedPermissions.slice().sort());
  if (created) access.set("created_by", actor.id);
  access.set("updated_by", actor.id);
  app.save(access);
  return access;
}

function setAuditField(record, key, value) {
  try {
    const collection = record.collection ? record.collection() : null;
    if (collection && collection.fields && !fieldByName(collection, key)) return;
  } catch (_) {}
  record.set(key, value);
}

function buildAuditValues(store, actor, target, action, previous, next, reason) {
  if (!AUDIT_ACTIONS.includes(action)) throw codedError("primary_admin_unavailable");
  return {
    store: store.id,
    store_id_snapshot: String(store.id || "").slice(0, 15),
    store_name_snapshot: bounded(recordString(store, "name"), 140),
    store_slug_snapshot: bounded(recordString(store, "slug"), 80),
    target_user: target.id,
    target_user_id_snapshot: String(target.id || "").slice(0, 15),
    actor: actor.id,
    actor_name_snapshot: bounded(
      recordString(actor, "display_name") || recordString(actor, "email") || "Master Admin",
      160,
    ),
    actor_role_snapshot: "master_admin",
    action,
    previous_email: bounded(previous && previous.email, 254),
    new_email: bounded(next && next.email, 254),
    previous_display_name: bounded(previous && previous.display_name, 140),
    new_display_name: bounded(next && next.display_name, 140),
    previous_phone: bounded(previous && previous.phone, 60),
    new_phone: bounded(next && next.phone, 60),
    previous_role: STORE_ROLES.includes(previous && previous.role) ? previous.role : "",
    new_role: STORE_ROLES.includes(next && next.role) ? next.role : "",
    previous_status: ["active", "suspended"].includes(previous && previous.status) ? previous.status : "",
    new_status: ["active", "suspended"].includes(next && next.status) ? next.status : "",
    previous_template_code: TEMPLATE_CODES.includes(previous && previous.template_code) ? previous.template_code : "",
    new_template_code: TEMPLATE_CODES.includes(next && next.template_code) ? next.template_code : "",
    previous_permissions_json: previous && Array.isArray(previous.permissions) ? previous.permissions : [],
    new_permissions_json: next && Array.isArray(next.permissions) ? next.permissions : [],
    sessions_revoked: true,
    reason: bounded(reason, 500),
  };
}

function createAudit(app, store, actor, target, action, previous, next, reason) {
  const audit = new Record(app.findCollectionByNameOrId("store_user_audit"), {});
  const values = buildAuditValues(store, actor, target, action, previous, next, reason);
  Object.keys(values).forEach((key) => setAuditField(audit, key, values[key]));
  app.save(audit);
  return audit;
}

function revokeUserSessions(app, user) {
  if (!user || typeof user.refreshTokenKey !== "function") throw codedError("primary_admin_unavailable");
  user.refreshTokenKey();
  app.save(user);
}

function revokeUsersBlockedByPlan(app, store, actor, reason) {
  const rows = queryRows(app, `
    SELECT id FROM users
    WHERE store = {:storeId}
      AND role IN ('store_admin', 'store_staff')
      AND status = 'active'
      AND id != {:primaryId}
    ORDER BY created, id
  `, { storeId: store.id, primaryId: primaryAdminId(store) }, { id: "" });
  let revoked = 0;
  rows.forEach((row) => {
    const user = findRecord(app, "users", String(row.id || ""));
    if (!user || !storePermissions.isBlockedByPlan(app, user, store)) return;
    const access = findAccess(app, store.id, user.id);
    const snapshot = userSnapshot(user, access);
    revokeUserSessions(app, user);
    createAudit(app, store, actor, user, "plan_access_locked", snapshot, snapshot, reason);
    revoked += 1;
  });
  return revoked;
}

function assignPrimaryAdminInTransaction(app, actorId, parsed) {
  const loaded = loadLockedContext(app, actorId, parsed.storeId);
  if (primaryAdminId(loaded.store)) throw codedError("primary_admin_already_configured");
  const target = loadCandidate(app, loaded.store, parsed.userId);
  assertPrimaryChangeQuota(app, loaded.store, null, "keep_active");

  revokeUserSessions(app, target);
  loaded.store.set("primary_admin_user", target.id);
  app.save(loaded.store);
  revokeUsersBlockedByPlan(app, loaded.store, loaded.actor, parsed.reason);
  const next = principalSnapshot(target);
  createAudit(app, loaded.store, loaded.actor, target, "primary_admin_assigned", null, next, parsed.reason);
  return statusPayload(app, loaded.store);
}

function replacePrimaryAdminInTransaction(app, actorId, parsed) {
  const loaded = loadLockedContext(app, actorId, parsed.storeId);
  const previousId = primaryAdminId(loaded.store);
  if (!previousId) throw codedError("primary_admin_not_configured");
  if (previousId === parsed.userId) throw codedError("primary_admin_same_user");
  const previousUser = findRecord(app, "users", previousId);
  if (!previousUser || !belongsToStore(previousUser, loaded.store.id)) {
    throw codedError("primary_admin_unavailable");
  }
  const target = loadCandidate(app, loaded.store, parsed.userId);
  assertPrimaryChangeQuota(app, loaded.store, previousUser, parsed.previousUserMode);
  const targetAccess = findAccess(app, loaded.store.id, target.id);
  const targetPreviousSnapshot = userSnapshot(target, targetAccess);
  const previousAccess = findAccess(app, loaded.store.id, previousUser.id);
  const previousSnapshot = principalSnapshot(previousUser);
  let previousNext;
  if (parsed.previousUserMode === "keep_active") {
    previousUser.set("role", roleForTemplate(parsed.templateCode));
    previousUser.set("status", "active");
    previousUser.refreshTokenKey();
    app.save(previousUser);
    const access = saveAccess(
      app,
      loaded.store,
      previousUser,
      loaded.actor,
      parsed.templateCode,
      parsed.permissions,
    );
    previousNext = userSnapshot(previousUser, access);
  } else {
    previousUser.set("status", "suspended");
    previousUser.refreshTokenKey();
    app.save(previousUser);
    previousNext = userSnapshot(previousUser, previousAccess);
  }

  revokeUserSessions(app, target);
  loaded.store.set("primary_admin_user", target.id);
  app.save(loaded.store);
  revokeUsersBlockedByPlan(app, loaded.store, loaded.actor, parsed.reason);
  const nextPrimarySnapshot = principalSnapshot(target);
  createAudit(
    app,
    loaded.store,
    loaded.actor,
    target,
    "primary_admin_replaced",
    targetPreviousSnapshot,
    nextPrimarySnapshot,
    parsed.reason,
  );
  createAudit(
    app,
    loaded.store,
    loaded.actor,
    previousUser,
    parsed.previousUserMode === "suspend" ? "team_user_suspended" : "team_user_updated",
    previousSnapshot,
    previousNext,
    parsed.reason,
  );
  return statusPayload(app, loaded.store);
}

function handleStatus(e) {
  const context = requestContext(e, parseStatusPayload);
  if (context.error) return sendError(e, context.error, "primary_admin_unavailable");
  try {
    const store = findRecord($app, "stores", context.parsed.storeId);
    if (!store) throw codedError("store_not_found");
    return e.json(200, statusPayload($app, store));
  } catch (error) {
    return sendError(e, error, "primary_admin_unavailable");
  }
}

function handleAssign(e) {
  const context = requestContext(e, parseAssignPayload);
  if (context.error) return sendError(e, context.error, "primary_admin_assign_failed");
  try {
    let response = null;
    $app.runInTransaction((app) => {
      response = assignPrimaryAdminInTransaction(app, context.actorId, context.parsed);
    });
    return e.json(200, response);
  } catch (error) {
    return sendError(e, error, "primary_admin_assign_failed");
  }
}

function handleReplace(e) {
  const context = requestContext(e, parseReplacePayload);
  if (context.error) return sendError(e, context.error, "primary_admin_replace_failed");
  try {
    let response = null;
    $app.runInTransaction((app) => {
      response = replacePrimaryAdminInTransaction(app, context.actorId, context.parsed);
    });
    return e.json(200, response);
  } catch (error) {
    return sendError(e, error, "primary_admin_replace_failed");
  }
}

function originalRecord(record) {
  if (!record || typeof record.original !== "function") return null;
  try { return record.original(); } catch (_) { return null; }
}

function directPrimaryAdminMutationAttempt(e) {
  const record = e && e.record;
  if (!record) return false;
  const original = originalRecord(record);
  if (!original && primaryAdminId(record)) return true;
  if (original && primaryAdminId(original) !== primaryAdminId(record)) return true;
  try {
    const info = e.requestInfo();
    const body = info && info.body;
    return !!body && typeof body === "object"
      && Object.prototype.hasOwnProperty.call(body, "primary_admin_user");
  } catch (_) {
    return false;
  }
}

function rejectDirectPrimaryAdminMutation(e) {
  if (!directPrimaryAdminMutationAttempt(e)) return;
  const message = "Usa el flujo oficial para definir o reemplazar al Administrador principal.";
  const data = {
    primary_admin_official_flow_required: new ValidationError(
      "primary_admin_official_flow_required",
      message,
    ),
  };
  if (typeof ForbiddenError === "function") throw new ForbiddenError(message, data);
  throw new BadRequestError(message, data);
}

function protectedPrimaryStore(app, userId) {
  if (!isValidId(String(userId || ""))) return null;
  try {
    return app.findFirstRecordByFilter(
      "stores",
      "primary_admin_user = {:userId}",
      { userId },
    );
  } catch (_) {
    return null;
  }
}

function rejectDirectProtectedPrimaryUserMutation(e, operation) {
  const record = e && e.record;
  if (!record || !protectedPrimaryStore(e.app, record.id)) return;
  if (operation !== "delete") {
    let body = {};
    try { body = e.requestInfo().body || {}; } catch (_) {}
    const keys = Object.keys(body).filter((key) => typeof body[key] !== "function");
    if (!keys.some((key) => ["role", "status", "store"].includes(String(key).replace(/[+-]$/, "")))) return;
  }
  const message = "Usa el flujo oficial para proteger al Administrador principal.";
  const data = {
    primary_admin_protected: new ValidationError("primary_admin_protected", message),
  };
  if (typeof ForbiddenError === "function") throw new ForbiddenError(message, data);
  throw new BadRequestError(message, data);
}

module.exports = {
  ACTIVE_ADMIN_ROLE,
  AUDIT_ACTIONS,
  PREVIOUS_USER_MODES,
  REPLACEMENT_CONFIRMATION,
  SAFE_ERRORS,
  TEMPLATE_CODES,
  activeAdminCandidates,
  activeUserCount,
  assertProjectedActiveUsers,
  assertPrimaryChangeQuota,
  assignPrimaryAdminInTransaction,
  belongsToStore,
  buildAuditValues,
  directPrimaryAdminMutationAttempt,
  exactPayload,
  handleAssign,
  handleReplace,
  handleStatus,
  isActiveMaster,
  isActivePrimaryCandidate,
  parseAssignPayload,
  parseReplacePayload,
  parseStatusPayload,
  permissionSelection,
  planLimit,
  primaryAdminId,
  primaryState,
  principalSnapshot,
  projectedReplacementActiveUsers,
  rejectDirectPrimaryAdminMutation,
  rejectDirectProtectedPrimaryUserMutation,
  replacePrimaryAdminInTransaction,
  revokeUsersBlockedByPlan,
  requireAuthenticatedUser,
  roleForTemplate,
  sanitizeCandidate,
  statusForError,
  statusPayload,
  userSnapshot,
};
