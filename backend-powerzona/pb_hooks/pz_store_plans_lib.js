/// <reference path="../pb_data/types.d.ts" />

const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_TRIAL_DAYS = 30;
const STORE_PLAN_AUDIT_COLLECTION = "store_plan_audit";
const MASTER_ROLE = "master_admin";

const BASIC_CAPABILITIES = Object.freeze({
  max_active_users: 1,
  max_devices_per_user: 2,
  max_store_devices: 2,
  max_product_images: 2,
  raffles_enabled: false,
  security_enabled: false,
  landing_qr_enabled: false,
  product_expiration_tools_enabled: false,
});

const PREMIUM_CAPABILITIES = Object.freeze({
  max_active_users: 4,
  max_devices_per_user: 2,
  max_store_devices: 8,
  max_product_images: 4,
  raffles_enabled: true,
  security_enabled: true,
  landing_qr_enabled: true,
  product_expiration_tools_enabled: true,
});

const PLAN_CODES = Object.freeze(["free", "basic", "premium"]);

const PLAN_DEFINITIONS = Object.freeze({
  free: Object.freeze({
    code: "free",
    name: "Prueba gratuita",
    duration: Object.freeze({
      kind: "fixed_days",
      days: FREE_TRIAL_DAYS,
      min_months: 0,
      max_months: 0,
    }),
    capabilities: BASIC_CAPABILITIES,
  }),
  basic: Object.freeze({
    code: "basic",
    name: "Plan Básico",
    duration: Object.freeze({
      kind: "calendar_months",
      days: null,
      min_months: 1,
      max_months: 12,
    }),
    capabilities: BASIC_CAPABILITIES,
  }),
  premium: Object.freeze({
    code: "premium",
    name: "Plan Premium",
    duration: Object.freeze({
      kind: "calendar_months",
      days: null,
      min_months: 1,
      max_months: 12,
    }),
    capabilities: PREMIUM_CAPABILITIES,
  }),
});

function isValidPlanCode(value) {
  return typeof value === "string" && PLAN_CODES.includes(value);
}

function getPlanDefinition(plan) {
  if (!isValidPlanCode(plan)) {
    throw new RangeError("invalid_plan_code");
  }
  return PLAN_DEFINITIONS[plan];
}

function getPlanCapabilities(plan) {
  const capabilities = getPlanDefinition(plan).capabilities;
  return {
    max_active_users: capabilities.max_active_users,
    max_devices_per_user: capabilities.max_devices_per_user,
    max_store_devices: capabilities.max_store_devices,
    max_product_images: capabilities.max_product_images,
    raffles_enabled: capabilities.raffles_enabled,
    security_enabled: capabilities.security_enabled,
    landing_qr_enabled: capabilities.landing_qr_enabled,
    product_expiration_tools_enabled: capabilities.product_expiration_tools_enabled,
  };
}

function parseDate(value, allowEmpty) {
  if (value === null || value === undefined || value === "") {
    if (allowEmpty) return null;
    throw new TypeError("invalid_date");
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("invalid_date");
  }
  return date;
}

function addFreeTrialDays(date) {
  const source = parseDate(date, false);
  return new Date(source.getTime() + FREE_TRIAL_DAYS * DAY_MS);
}

function addCalendarMonthsClamped(date, months) {
  const source = parseDate(date, false);
  const amount = Number(months);
  if (!Number.isInteger(amount) || amount < 1 || amount > 12) {
    throw new RangeError("invalid_plan_duration_months");
  }

  const originalDay = source.getUTCDate();
  const result = new Date(source.getTime());
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + amount);
  const lastDay = new Date(result.getTime());
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  result.setUTCDate(Math.min(originalDay, lastDay.getUTCDate()));
  return result;
}

function getDaysRemaining(expiresAt, now) {
  const expiration = parseDate(expiresAt, true);
  if (!expiration) return null;
  const current = now === undefined ? new Date() : parseDate(now, false);
  const difference = expiration.getTime() - current.getTime();
  if (difference <= 0) return 0;
  return Math.ceil(difference / DAY_MS);
}

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try {
      return record.get(key);
    } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try {
      return record.getString(key);
    } catch (_) {}
  }
  return record[key];
}

function normalizedIso(value) {
  const date = parseDate(value, true);
  return date ? date.toISOString() : null;
}

function resolvePlanState(storeOrValues, now) {
  const plan = String(recordValue(storeOrValues, "plan") || "").trim();
  const definition = getPlanDefinition(plan);
  const startedAt = normalizedIso(recordValue(storeOrValues, "plan_started_at"));
  const expiresAt = normalizedIso(recordValue(storeOrValues, "plan_expires_at"));
  const daysRemaining = getDaysRemaining(expiresAt, now);

  let state = "unconfigured";
  if (expiresAt) {
    if (daysRemaining === 0) state = "expired";
    else if (daysRemaining <= 3) state = "critical";
    else if (daysRemaining <= 7) state = "expiring";
    else state = "active";
  }

  return {
    plan: definition.code,
    plan_name: definition.name,
    plan_started_at: startedAt,
    plan_expires_at: expiresAt,
    days_remaining: daysRemaining,
    state,
    isConfigured: !!expiresAt,
    isExpired: state === "expired",
    capabilities: getPlanCapabilities(plan),
  };
}

function recordString(record, key) {
  const value = recordValue(record, key);
  return String(value || "").trim();
}

function recordSet(record, key, value) {
  if (!record || typeof record.set !== "function") throw new TypeError("invalid_store_record");
  record.set(key, value);
}

function actorFromRecord(record) {
  if (!record || recordString(record, "role") !== MASTER_ROLE) return null;
  const id = String(record.id || recordString(record, "id")).trim();
  if (!id) return null;
  return {
    id,
    name: (recordString(record, "display_name") || recordString(record, "name")).slice(0, 160),
    role: MASTER_ROLE,
  };
}

function findMasterActor(app, actorId) {
  const id = String(actorId || "").trim();
  if (!app || !id) return null;
  try {
    return actorFromRecord(app.findRecordById("users", id));
  } catch (_) {
    return null;
  }
}

function planFoundationReady(app) {
  if (!app) return false;
  try {
    const stores = app.findCollectionByNameOrId("stores");
    app.findCollectionByNameOrId(STORE_PLAN_AUDIT_COLLECTION);
    return !!stores.fields.getByName("plan_expires_at");
  } catch (_) {
    return false;
  }
}

function buildNewStoreTrialValues(now, actorId) {
  const startedAt = parseDate(now === undefined ? new Date() : now, false);
  return {
    plan: "free",
    plan_started_at: startedAt.toISOString(),
    plan_expires_at: addFreeTrialDays(startedAt).toISOString(),
    plan_duration_months: 0,
    free_trial_used: true,
    plan_updated_by: String(actorId || "").trim(),
    plan_updated_at: startedAt.toISOString(),
  };
}

function initializeNewStoreRecord(record, actorId, now) {
  const values = buildNewStoreTrialValues(now, actorId);
  Object.keys(values).forEach((key) => recordSet(record, key, values[key]));
  return values;
}

function createTrialStartedAudit(app, store, actor, values) {
  const collection = app.findCollectionByNameOrId(STORE_PLAN_AUDIT_COLLECTION);
  const audit = new Record(collection, {});
  audit.set("store", store.id);
  audit.set("store_id_snapshot", String(store.id || "").slice(0, 15));
  audit.set("store_name_snapshot", recordString(store, "name").slice(0, 140));
  audit.set("store_slug_snapshot", recordString(store, "slug").slice(0, 80));
  audit.set("actor", actor ? actor.id : "");
  audit.set("actor_name_snapshot", actor ? actor.name : "");
  audit.set("actor_role_snapshot", actor ? actor.role : "");
  audit.set("action", "trial_started");
  audit.set("new_plan", "free");
  audit.set("new_started_at", values.plan_started_at);
  audit.set("new_expires_at", values.plan_expires_at);
  audit.set("duration_months", 0);
  app.save(audit);
}

function handleStoreCreateRequest(e) {
  if (!planFoundationReady(e && e.app)) return e.next();
  const actor = actorFromRecord(e && e.auth);
  initializeNewStoreRecord(e.record, actor ? actor.id : "", new Date());
  return e.next();
}

function handleStoreCreate(e) {
  const app = e && e.app;
  const store = e && e.record;
  if (!app || !store) throw new Error("store_plan_initialization_failed");
  if (!planFoundationReady(app)) return e.next();
  const actor = findMasterActor(app, recordString(store, "plan_updated_by"));
  const values = initializeNewStoreRecord(store, actor ? actor.id : "", new Date());

  e.next();

  try {
    createTrialStartedAudit(app, store, actor, values);
  } catch (error) {
    try {
      app.delete(store);
    } catch (_) {
      try {
        app.logger().error(
          "PowerZona store plan initialization compensation failed safely.",
          "code",
          "PZ_STORE_PLAN_COMPENSATION_FAILED"
        );
      } catch (_) {}
    }
    throw error;
  }
}

module.exports = {
  PLAN_CODES,
  PLAN_DEFINITIONS,
  addCalendarMonthsClamped,
  addFreeTrialDays,
  buildNewStoreTrialValues,
  getDaysRemaining,
  getPlanCapabilities,
  getPlanDefinition,
  handleStoreCreate,
  handleStoreCreateRequest,
  initializeNewStoreRecord,
  isValidPlanCode,
  resolvePlanState,
};
