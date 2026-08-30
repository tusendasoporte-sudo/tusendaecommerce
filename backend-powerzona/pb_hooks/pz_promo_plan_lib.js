/// <reference path="../pb_data/types.d.ts" />

const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);

const DAY_MS = 24 * 60 * 60 * 1000;
const PROMO_PLAN_CODES = Object.freeze(["free", "basic"]);
const PROMO_PLAN_GRACE_DAYS = 3;
const PROMO_PLAN_IMAGE_LIMITS = Object.freeze({ free: 150, basic: 300 });
const PROMO_READ_ONLY_ACTIONS = Object.freeze(["promo.site.view", "promo.analytics.view"]);

function recordValue(record, key) {
  if (!record) return undefined;
  try { return record.get(key); } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key) {
  return String(recordValue(record, key) || "").trim();
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordId(record) {
  return String(record && (record.id || recordValue(record, "id")) || "").trim();
}

function relationId(record, key) {
  const value = recordValue(record, key);
  return String(Array.isArray(value) ? value[0] || "" : value || "").trim();
}

function findExact(app, collection, filter, params) {
  try {
    const rows = Array.from(app.findRecordsByFilter(collection, filter, "id", 2, 0, params || {}) || []);
    return rows.length === 1 ? rows[0] : null;
  } catch (_) {
    try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
  }
}

function findPromoSiteByStore(app, storeOrId) {
  const storeId = typeof storeOrId === "object" ? recordId(storeOrId) : String(storeOrId || "").trim();
  if (!app || !storeId) return null;
  return findExact(app, "promo_sites", "store = {:store}", { store: storeId });
}

function isPromoStore(app, storeOrId) {
  return !!findPromoSiteByStore(app, storeOrId);
}

function isPromoPlanCode(value) {
  return typeof value === "string" && PROMO_PLAN_CODES.includes(value);
}

function imageLimitForPlan(plan) {
  const code = String(plan || "").trim();
  if (!isPromoPlanCode(code)) throw new RangeError("invalid_promo_plan_code");
  return PROMO_PLAN_IMAGE_LIMITS[code];
}

function promoPlanDefinitions() {
  return PROMO_PLAN_CODES.map((code) => {
    const base = plans.getPlanDefinition(code);
    return {
      code,
      name: code === "free" ? "Plan Gratis Promo" : "Plan Básico Promo",
      monthly_price_usd: 0,
      duration: base.duration,
      supports_permanent: false,
      capabilities: {
        max_active_users: 0,
        max_devices_per_user: 0,
        max_store_devices: 0,
        max_product_images: 0,
        max_gallery_assets: imageLimitForPlan(code),
        raffles_enabled: false,
        security_enabled: false,
        landing_qr_enabled: false,
        product_expiration_tools_enabled: false,
        push_campaigns_enabled: false,
      },
    };
  });
}

function resolvePromoPlanState(storeOrValues, now) {
  const current = now === undefined ? new Date() : plans.parseDate(now, false);
  const storedPlan = recordString(storeOrValues, "plan");
  const legacyPremium = storedPlan === "premium" && recordBool(storeOrValues, "plan_is_permanent");
  if (!isPromoPlanCode(storedPlan) && !legacyPremium) {
    return {
      plan: "free",
      plan_name: "Plan Promo sin configurar",
      plan_started_at: null,
      plan_expires_at: null,
      plan_duration_months: 0,
      plan_is_permanent: false,
      days_remaining: null,
      state: "unconfigured",
      isConfigured: false,
      isExpired: false,
      can_renew: false,
      monthly_price_usd: 0,
      capabilities: promoPlanDefinitions()[0].capabilities,
      in_grace: false,
      grace_days: PROMO_PLAN_GRACE_DAYS,
      grace_expires_at: null,
      can_mutate: false,
      public_allowed: false,
      max_gallery_assets: PROMO_PLAN_IMAGE_LIMITS.free,
      legacy_contract: false,
    };
  }
  const source = legacyPremium ? {
    plan: "basic",
    plan_started_at: recordValue(storeOrValues, "plan_started_at"),
    plan_expires_at: recordValue(storeOrValues, "plan_expires_at"),
    plan_duration_months: recordValue(storeOrValues, "plan_duration_months"),
    plan_is_permanent: true,
  } : storeOrValues;
  const base = plans.resolvePlanState(source, current);
  const expiration = plans.parseDate(base.plan_expires_at, true);
  const graceExpiration = expiration
    ? new Date(expiration.getTime() + PROMO_PLAN_GRACE_DAYS * DAY_MS)
    : null;
  const inGrace = base.state === "expired"
    && !!graceExpiration
    && current.getTime() < graceExpiration.getTime();
  const operational = ["active", "expiring", "critical"].includes(base.state);
  const finalExpired = base.state === "expired" && !inGrace;
  return {
    ...base,
    plan_name: legacyPremium ? "Plan Básico Promo (legado)" : base.plan === "free" ? "Plan Gratis Promo" : "Plan Básico Promo",
    monthly_price_usd: 0,
    state: inGrace ? "grace" : base.state,
    isExpired: finalExpired,
    in_grace: inGrace,
    grace_days: PROMO_PLAN_GRACE_DAYS,
    grace_expires_at: graceExpiration ? graceExpiration.toISOString() : null,
    can_mutate: operational,
    public_allowed: operational || inGrace,
    max_gallery_assets: imageLimitForPlan(base.plan),
    legacy_contract: legacyPremium,
  };
}

function assertPromoPlanSelection(storeOrValues, input) {
  const plan = String(input && input.plan || "").trim();
  const isPermanent = !!(input && input.is_permanent);
  const durationMonths = Number(input && input.duration_months);
  if (!isPromoPlanCode(plan)) throw new RangeError("invalid_promo_plan_code");
  if (isPermanent) throw new RangeError("invalid_promo_plan_permanence");
  if (plan === "free") {
    if (durationMonths !== 0) throw new RangeError("invalid_plan_duration_months");
    if (recordBool(storeOrValues, "free_trial_used")) {
      throw new RangeError("promo_free_trial_already_used");
    }
  } else if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 12) {
    throw new RangeError("invalid_plan_duration_months");
  }
  return { plan, is_permanent: false, duration_months: durationMonths };
}

function planSnapshot(store) {
  return {
    plan: recordString(store, "plan"),
    plan_started_at: plans.normalizedIso(recordValue(store, "plan_started_at")) || "",
    plan_expires_at: plans.normalizedIso(recordValue(store, "plan_expires_at")) || "",
    plan_duration_months: Math.max(0, Math.floor(Number(recordValue(store, "plan_duration_months") || 0))),
    plan_is_permanent: recordBool(store, "plan_is_permanent"),
  };
}

function createInitialPromoPlanAudit(app, store, actor, previous, next, durationMonths) {
  const collection = app.findCollectionByNameOrId("store_plan_audit");
  const audit = new Record(collection, {});
  audit.set("store", recordId(store));
  audit.set("store_id_snapshot", recordId(store).slice(0, 15));
  audit.set("store_name_snapshot", recordString(store, "name").slice(0, 140));
  audit.set("store_slug_snapshot", recordString(store, "slug").slice(0, 80));
  audit.set("actor", recordId(actor));
  audit.set("actor_name_snapshot", (recordString(actor, "display_name") || recordString(actor, "name")).slice(0, 160));
  audit.set("actor_role_snapshot", "master_admin");
  audit.set("action", "plan_assigned");
  audit.set("previous_plan", previous.plan);
  audit.set("new_plan", next.plan);
  audit.set("previous_started_at", previous.plan_started_at);
  audit.set("new_started_at", next.plan_started_at);
  audit.set("previous_expires_at", previous.plan_expires_at);
  audit.set("new_expires_at", next.plan_expires_at);
  audit.set("previous_is_permanent", previous.plan_is_permanent);
  audit.set("new_is_permanent", next.plan_is_permanent);
  audit.set("duration_months", durationMonths);
  audit.set("reason", "Asignación inicial de plan Promo");
  app.save(audit);
  return audit;
}

function assignInitialPromoPlan(app, store, actor, requestedPlan, requestedDurationMonths, now) {
  const initialPlan = requestedPlan === undefined ? "free" : String(requestedPlan || "").trim();
  if (initialPlan === "free" && recordString(store, "plan") === "free" && recordBool(store, "free_trial_used")) {
    return planSnapshot(store);
  }
  const selection = assertPromoPlanSelection(store, {
    plan: initialPlan,
    is_permanent: false,
    duration_months: requestedDurationMonths === undefined ? 0 : requestedDurationMonths,
  });
  const previous = planSnapshot(store);
  const values = plans.buildPlanChangeValues(store, selection, now === undefined ? new Date() : now, recordId(actor));
  Object.keys(values).forEach((key) => store.set(key, values[key]));
  app.save(store);
  const next = planSnapshot(store);
  createInitialPromoPlanAudit(app, store, actor, previous, next, selection.duration_months);
  return next;
}

function syncPromoEntitlement(app, storeOrId, actorId) {
  const site = findPromoSiteByStore(app, storeOrId);
  if (!site) return null;
  const entitlement = findExact(app, "promo_site_entitlements", "site = {:site}", { site: recordId(site) });
  if (!entitlement) throw new Error("promo_entitlement_not_found");
  const store = typeof storeOrId === "object"
    ? storeOrId
    : (() => { try { return app.findRecordById("stores", String(storeOrId || "")); } catch (_) { return null; } })();
  if (!store || relationId(site, "store") !== recordId(store)) throw new Error("promo_entitlement_not_found");
  entitlement.set("source", "contract");
  entitlement.set("max_gallery_assets", imageLimitForPlan(recordString(store, "plan")));
  entitlement.set("updated_by", String(actorId || "").trim());
  app.save(entitlement);
  return entitlement;
}

function actionAllowsExpiredRead(actionKey) {
  return PROMO_READ_ONLY_ACTIONS.includes(String(actionKey || "").trim());
}

function assertPromoOperationalAccess(store, actionKey, now) {
  if (actionAllowsExpiredRead(actionKey)) return resolvePromoPlanState(store, now);
  const state = resolvePromoPlanState(store, now);
  if (!state.can_mutate) {
    const error = new Error(state.state === "unconfigured" ? "promo_plan_unconfigured" : "promo_plan_expired");
    error.code = error.message;
    error.status = 403;
    throw error;
  }
  return state;
}

function assertPromoPublicAccess(store, now) {
  const state = resolvePromoPlanState(store, now);
  if (!state.public_allowed) {
    const error = new Error("promo_plan_expired");
    error.code = error.message;
    error.status = 403;
    throw error;
  }
  return state;
}

module.exports = {
  PROMO_PLAN_CODES,
  PROMO_PLAN_GRACE_DAYS,
  PROMO_PLAN_IMAGE_LIMITS,
  actionAllowsExpiredRead,
  assignInitialPromoPlan,
  assertPromoOperationalAccess,
  assertPromoPlanSelection,
  assertPromoPublicAccess,
  findPromoSiteByStore,
  imageLimitForPlan,
  isPromoPlanCode,
  isPromoStore,
  promoPlanDefinitions,
  resolvePromoPlanState,
  syncPromoEntitlement,
};
