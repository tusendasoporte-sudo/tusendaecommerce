/// <reference path="../pb_data/types.d.ts" />

const M7U2_C3_ACTION = "team_permissions_normalized";
const M7U2_C3_REASON = "M7U2-C3: normalizacion final de permisos reservados por plantilla.";
const M7U2_C3_TARGETS = Object.freeze({
  marketing_promotions: Object.freeze([
    "promotions.manage",
    "coupons.manage",
    "gifts.manage",
    "raffles.manage",
    "landing_qr.manage",
    "analytics.view",
  ]),
  read_only: Object.freeze([
    "catalog.view",
    "orders.view",
    "analytics.view",
  ]),
});

function findCollectionSafe(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

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

function recordString(record, key, max) {
  let value = recordValue(record, key);
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object") value = value.id || value.value || "";
  const text = String(value === null || value === undefined ? "" : value).trim();
  return max ? text.slice(0, max) : text;
}

function relationId(record, key) {
  return recordString(record, key, 15);
}

function plainArray(value) {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch (_) {}
  }
  if (value && typeof value === "object" && typeof value.raw === "string") {
    try {
      const parsed = JSON.parse(value.raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch (_) {}
  }
  if (value && typeof value === "object" && typeof value.string === "function") {
    try {
      const parsed = JSON.parse(String(value.string()));
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch (_) {}
  }
  try {
    const cloned = JSON.parse(JSON.stringify(value));
    if (Array.isArray(cloned)) return cloned.map((item) => String(item));
  } catch (_) {}
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value !== null && value !== undefined && Number.isInteger(Number(value.length))) {
    const result = [];
    const length = Number(value.length);
    if (length < 0 || length > 100) return [];
    for (let index = 0; index < length; index += 1) result.push(String(value[index]));
    return result;
  }
  return [];
}

function recordPermissionArray(record) {
  if (record && typeof record.getStringSlice === "function") {
    try {
      const raw = record.getStringSlice("permissions_json");
      const values = plainArray(raw);
      if (values.length || Number(raw && raw.length) === 0) return values;
    } catch (_) {}
  }
  return plainArray(recordValue(record, "permissions_json"));
}

function permissionSet(value) {
  return [...new Set(value.map((item) => String(item)))].sort();
}

function samePermissionSet(left, right) {
  const leftSet = permissionSet(left);
  const rightSet = permissionSet(right);
  return leftSet.length === rightSet.length
    && leftSet.every((item, index) => item === rightSet[index]);
}

function listRecords(app, collection) {
  const records = [];
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const batch = app.findRecordsByFilter(collection, "", "id", pageSize, offset) || [];
    records.push(...batch);
    if (batch.length < pageSize) return records;
    offset += batch.length;
  }
}

function appendAuditAction(app) {
  const audit = app.findCollectionByNameOrId("store_user_audit");
  const action = audit.fields.getByName("action");
  const values = Array.isArray(action.values) ? action.values.filter(Boolean) : [];
  if (!values.includes(M7U2_C3_ACTION)) values.push(M7U2_C3_ACTION);
  action.values = values;
  app.save(audit);
}

function sourceEventKey(accessId) {
  return `migration:m7u2c3:team_permissions_normalized:${String(accessId || "").slice(0, 80)}`;
}

function existingCentralActivity(app, storeId, sourceKey) {
  try {
    return app.findFirstRecordByFilter(
      "store_activity_audit",
      "store = {:store} && source_event_key = {:source}",
      { store: storeId, source: sourceKey },
    );
  } catch (_) { return null; }
}

function createSpecializedAudit(app, store, user, access, templateCode, previous, next) {
  const audit = new Record(app.findCollectionByNameOrId("store_user_audit"), {});
  const storeId = String(store.id || "").slice(0, 15);
  const userId = String(user.id || "").slice(0, 15);
  audit.set("store", storeId);
  audit.set("store_id_snapshot", storeId);
  audit.set("store_name_snapshot", (recordString(store, "name", 140) || storeId).slice(0, 140));
  audit.set("store_slug_snapshot", (recordString(store, "slug", 80) || storeId).slice(0, 80));
  audit.set("target_user", userId);
  audit.set("target_user_id_snapshot", userId);
  audit.set("actor_name_snapshot", "Migracion M7U2-C3");
  audit.set("actor_role_snapshot", "migration");
  audit.set("action", M7U2_C3_ACTION);
  audit.set("previous_template_code", templateCode);
  audit.set("new_template_code", templateCode);
  audit.set("previous_permissions_json", previous.slice());
  audit.set("new_permissions_json", next.slice());
  audit.set("sessions_revoked", true);
  audit.set("reason", M7U2_C3_REASON);
  app.save(audit);
  return audit;
}

function createCentralActivity(app, store, user, access, templateCode, previous, next) {
  const storeId = String(store.id || "").slice(0, 15);
  const sourceKey = sourceEventKey(access.id);
  const existing = existingCentralActivity(app, storeId, sourceKey);
  if (existing) return existing;

  const activity = new Record(app.findCollectionByNameOrId("store_activity_audit"), {});
  const userId = String(user.id || "").slice(0, 15);
  const label = recordString(user, "display_name", 180)
    || "Usuario del equipo";
  activity.set("store", storeId);
  activity.set("actor", "");
  activity.set("actor_id_snapshot", "migration");
  activity.set("actor_name_snapshot", "Migracion M7U2-C3");
  activity.set("actor_email_snapshot", "");
  activity.set("actor_role_snapshot", "migration");
  activity.set("actor_template_snapshot", "");
  activity.set("origin", "migration");
  activity.set("module", "team");
  activity.set("action", M7U2_C3_ACTION);
  activity.set("severity", "critical");
  activity.set("resource_type", "team_user_permissions");
  activity.set("resource_id_snapshot", String(access.id || "").slice(0, 80));
  activity.set("resource_label_snapshot", label);
  activity.set("changed_fields_json", ["permissions_json"]);
  activity.set("previous_values_json", {
    template_code: templateCode,
    permissions: previous.slice(),
  });
  activity.set("new_values_json", {
    template_code: templateCode,
    permissions: next.slice(),
  });
  activity.set("summary", "Normalizo los permisos de una plantilla del equipo y revoco sus sesiones activas.");
  activity.set("source_event_key", sourceKey);
  app.save(activity);
  return activity;
}

function normalizeAccess(app, access) {
  const templateCode = recordString(access, "template_code", 80);
  const target = M7U2_C3_TARGETS[templateCode];
  if (!target) return false;

  const previous = recordPermissionArray(access);
  const next = target.slice();
  if (samePermissionSet(previous, next)) return false;

  const storeId = relationId(access, "store");
  const userId = relationId(access, "user");
  const store = app.findRecordById("stores", storeId);
  const user = app.findRecordById("users", userId);
  if (!user || typeof user.refreshTokenKey !== "function") {
    throw new Error("m7u2c3_user_session_rotation_unavailable");
  }

  access.set("permissions_json", next);
  app.save(access);
  user.refreshTokenKey();
  app.save(user);
  createSpecializedAudit(app, store, user, access, templateCode, previous, next);
  createCentralActivity(app, store, user, access, templateCode, previous, next);
  return true;
}

migrate((app) => {
  appendAuditAction(app);
  if (!findCollectionSafe(app, "store_user_access")) return;
  listRecords(app, "store_user_access").forEach((access) => normalizeAccess(app, access));
}, (_app) => {
  // Esta correccion retira privilegios. El rollback conserva permisos
  // normalizados, sesiones rotadas y ambas pistas de auditoria.
});
