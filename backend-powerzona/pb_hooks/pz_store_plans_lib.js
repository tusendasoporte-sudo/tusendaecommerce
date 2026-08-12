/// <reference path="../pb_data/types.d.ts" />

const DAY_MS = 24 * 60 * 60 * 1000;
const HAVANA_TIME_ZONE = "America/Havana";
const FREE_TRIAL_DAYS = 30;
const STORE_PLAN_AUDIT_COLLECTION = "store_plan_audit";
const MASTER_ROLE = "master_admin";
const PERMANENT_PLAN_CODES = Object.freeze(["basic", "premium"]);
const MONTHLY_PRICES_USD = Object.freeze({ free: 0, basic: 5, premium: 10 });

const BASIC_CAPABILITIES = Object.freeze({
  max_active_users: 1,
  max_devices_per_user: 5,
  max_store_devices: 5,
  max_product_images: 2,
  raffles_enabled: false,
  security_enabled: false,
  landing_qr_enabled: false,
  product_expiration_tools_enabled: false,
  push_campaigns_enabled: false,
});

const PREMIUM_CAPABILITIES = Object.freeze({
  max_active_users: 4,
  max_devices_per_user: 5,
  max_store_devices: 20,
  max_product_images: 4,
  raffles_enabled: true,
  security_enabled: true,
  landing_qr_enabled: true,
  product_expiration_tools_enabled: true,
  push_campaigns_enabled: true,
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
    push_campaigns_enabled: capabilities.push_campaigns_enabled,
  };
}

function parseDate(value, allowEmpty) {
  if (value === null || value === undefined || value === "") {
    if (allowEmpty) return null;
    throw new TypeError("invalid_date");
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new TypeError("invalid_date");
    return new Date(value.getTime());
  }

  let raw = value;
  if (typeof value === "object" && typeof value.string === "function") {
    try {
      raw = value.string();
    } catch (_) {
      throw new TypeError("invalid_date");
    }
  }
  if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) {
    if (allowEmpty) return null;
    throw new TypeError("invalid_date");
  }

  const date = new Date(typeof raw === "string" ? raw.trim() : raw);
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

function havanaCivilParts(date) {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
        timeZone: HAVANA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const mapped = {};
      parts.forEach((part) => {
        if (part.type !== "literal") mapped[part.type] = Number(part.value);
      });
      if (mapped.year && mapped.month && mapped.day) {
        return { year: mapped.year, month: mapped.month, day: mapped.day };
      }
    }
  } catch (_) {}

  const year = date.getUTCFullYear();
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const secondSundayMarch = 8 + ((7 - marchFirst.getUTCDay()) % 7);
  const novemberFirst = new Date(Date.UTC(year, 10, 1));
  const firstSundayNovember = 1 + ((7 - novemberFirst.getUTCDay()) % 7);
  const dstStart = Date.UTC(year, 2, secondSundayMarch, 5, 0, 0);
  const dstEnd = Date.UTC(year, 10, firstSundayNovember, 5, 0, 0);
  const offsetHours = date.getTime() >= dstStart && date.getTime() < dstEnd ? -4 : -5;
  const shifted = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getHavanaCivilDateKey(value) {
  const parts = havanaCivilParts(parseDate(value, false));
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function civilDayNumber(value) {
  const parts = havanaCivilParts(parseDate(value, false));
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

function getDaysRemaining(expiresAt, now) {
  const expiration = parseDate(expiresAt, true);
  if (!expiration) return null;
  const current = now === undefined ? new Date() : parseDate(now, false);
  return Math.max(0, civilDayNumber(expiration) - civilDayNumber(current));
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

function booleanValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
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
  const isPermanent = booleanValue(recordValue(storeOrValues, "plan_is_permanent"));
  const current = now === undefined ? new Date() : parseDate(now, false);
  const expiration = isPermanent ? null : parseDate(expiresAt, true);
  const daysRemaining = isPermanent ? null : getDaysRemaining(expiration, current);

  let state = "unconfigured";
  if (isPermanent) {
    state = "active";
  } else if (expiration) {
    if (expiration.getTime() <= current.getTime()) state = "expired";
    else if (daysRemaining <= 3) state = "critical";
    else if (daysRemaining <= 7) state = "expiring";
    else state = "active";
  }

  return {
    plan: definition.code,
    plan_name: definition.name,
    plan_started_at: startedAt,
    plan_expires_at: isPermanent ? null : expiresAt,
    plan_duration_months: Math.max(0, Number(recordValue(storeOrValues, "plan_duration_months") || 0)),
    plan_is_permanent: isPermanent,
    days_remaining: daysRemaining,
    state,
    isConfigured: isPermanent || !!expiresAt,
    isExpired: state === "expired",
    can_renew: !isPermanent && plan !== "free",
    monthly_price_usd: MONTHLY_PRICES_USD[plan],
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
    return !!stores.fields.getByName("plan_expires_at") && !!stores.fields.getByName("plan_is_permanent");
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
    plan_is_permanent: false,
    free_trial_used: true,
    plan_updated_by: String(actorId || "").trim(),
    plan_updated_at: startedAt.toISOString(),
  };
}

function normalizeDurationMonths(value) {
  const months = Number(value);
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new RangeError("invalid_plan_duration_months");
  }
  return months;
}

function getMonthlyPriceUsd(plan) {
  getPlanDefinition(plan);
  return MONTHLY_PRICES_USD[plan];
}

function buildPlanChangeValues(storeOrValues, input, now, actorId) {
  const plan = String(input && input.plan || "").trim();
  const isPermanent = !!(input && input.is_permanent);
  const definition = getPlanDefinition(plan);
  if (isPermanent && !PERMANENT_PLAN_CODES.includes(plan)) {
    throw new RangeError("invalid_plan_permanence");
  }

  const changedAt = parseDate(now === undefined ? new Date() : now, false);
  let durationMonths = 0;
  let expiresAt = "";
  if (!isPermanent && definition.duration.kind === "fixed_days") {
    expiresAt = addFreeTrialDays(changedAt).toISOString();
  } else if (!isPermanent) {
    durationMonths = normalizeDurationMonths(input && input.duration_months);
    expiresAt = addCalendarMonthsClamped(changedAt, durationMonths).toISOString();
  }

  return {
    plan,
    plan_started_at: changedAt.toISOString(),
    plan_expires_at: expiresAt,
    plan_duration_months: durationMonths,
    plan_is_permanent: isPermanent,
    free_trial_used: booleanValue(recordValue(storeOrValues, "free_trial_used")) || plan === "free",
    plan_updated_by: String(actorId || "").trim(),
    plan_updated_at: changedAt.toISOString(),
  };
}

function buildPlanRenewalValues(storeOrValues, months, now, actorId) {
  const current = resolvePlanState(storeOrValues, now);
  if (current.plan_is_permanent) throw new RangeError("permanent_plan_not_renewable");
  if (current.plan === "free") throw new RangeError("free_plan_not_renewable");

  const durationMonths = normalizeDurationMonths(months);
  const renewedAt = parseDate(now === undefined ? new Date() : now, false);
  const currentExpiration = parseDate(current.plan_expires_at, true);
  const hasActiveExpiration = currentExpiration && currentExpiration.getTime() > renewedAt.getTime();
  const baseDate = hasActiveExpiration ? currentExpiration : renewedAt;

  return {
    plan: current.plan,
    plan_started_at: hasActiveExpiration && current.plan_started_at
      ? current.plan_started_at
      : renewedAt.toISOString(),
    plan_expires_at: addCalendarMonthsClamped(baseDate, durationMonths).toISOString(),
    plan_duration_months: durationMonths,
    plan_is_permanent: false,
    free_trial_used: booleanValue(recordValue(storeOrValues, "free_trial_used")),
    plan_updated_by: String(actorId || "").trim(),
    plan_updated_at: renewedAt.toISOString(),
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
  HAVANA_TIME_ZONE,
  MONTHLY_PRICES_USD,
  PERMANENT_PLAN_CODES,
  PLAN_CODES,
  PLAN_DEFINITIONS,
  addCalendarMonthsClamped,
  addFreeTrialDays,
  buildNewStoreTrialValues,
  buildPlanChangeValues,
  buildPlanRenewalValues,
  getDaysRemaining,
  getHavanaCivilDateKey,
  getMonthlyPriceUsd,
  getPlanCapabilities,
  getPlanDefinition,
  handleStoreCreate,
  handleStoreCreateRequest,
  initializeNewStoreRecord,
  isValidPlanCode,
  normalizedIso,
  parseDate,
  resolvePlanState,
};
