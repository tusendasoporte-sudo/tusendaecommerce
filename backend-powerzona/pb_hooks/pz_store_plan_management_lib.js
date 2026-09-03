/// <reference path="../pb_data/types.d.ts" />

const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);
const planCatalog = typeof __hooks === "undefined"
  ? require("./pz_plan_catalog_lib.js")
  : require(`${__hooks}/pz_plan_catalog_lib.js`);
const productExpiration = typeof __hooks === "undefined"
  ? require("./pz_product_expiration_lib.js")
  : require(`${__hooks}/pz_product_expiration_lib.js`);
const storeTeam = typeof __hooks === "undefined"
  ? require("./pz_store_team_lib.js")
  : require(`${__hooks}/pz_store_team_lib.js`);
const storeActivity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);
const storefrontAppAdmin = typeof __hooks === "undefined"
  ? require("./pz_storefront_app_admin_lib.js")
  : require(`${__hooks}/pz_storefront_app_admin_lib.js`);
const productQuota = typeof __hooks === "undefined"
  ? require("./pz_product_quota_lib.js")
  : require(`${__hooks}/pz_product_quota_lib.js`);
const backgroundNotifications = typeof __hooks === "undefined"
  ? require("./pz_store_background_notifications_lib.js")
  : require(`${__hooks}/pz_store_background_notifications_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const AUDIT_COLLECTION = "store_plan_audit";
const PLAN_ACTION_LABELS = Object.freeze({
  legacy_initialized: "Plan heredado inicializado",
  trial_started: "Prueba gratuita iniciada",
  plan_assigned: "Plan asignado",
  plan_changed: "Plan cambiado",
  plan_renewed: "Plan renovado",
  plan_expiration_corrected: "Vencimiento corregido",
  plan_expired: "Plan vencido",
  plan_made_permanent: "Plan convertido a permanente",
  plan_made_temporary: "Plan convertido a temporal",
});

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
  if (!body || typeof body !== "object") return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = allowedKeys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
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
  return String(recordValue(record, key) || "").trim();
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordNumber(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isFinite(value) ? value : 0;
}

function boundedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeIsoDate(value) {
  return plans.normalizedIso(value) || "";
}

function recordDate(record, key) {
  return safeIsoDate(recordValue(record, key));
}

function isMaster(info) {
  return recordString(info && info.auth, "role") === "master_admin"
    && recordString(info && info.auth, "status").toLowerCase() !== "suspended";
}

function findRecord(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function planManagementReady(app) {
  try {
    const stores = app.findCollectionByNameOrId("stores");
    const audit = app.findCollectionByNameOrId(AUDIT_COLLECTION);
    const devices = app.findCollectionByNameOrId("store_user_devices");
    const expirationCycles = app.findCollectionByNameOrId(productExpiration.CYCLES_COLLECTION);
    return !!stores.fields.getByName("plan_is_permanent")
      && !!audit.fields.getByName("previous_is_permanent")
      && !!audit.fields.getByName("new_is_permanent")
      && devices.listRule === null
      && devices.viewRule === null
      && !!devices.fields.getByName("device_digest")
      && expirationCycles.listRule === null
      && !!expirationCycles.fields.getByName("cycle_key");
  } catch (_) {
    return false;
  }
}

function queryOne(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows.length ? rows[0] : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function storeUsage(app, storeId) {
  const row = queryOne(app, `
    SELECT
      (SELECT COUNT(*) FROM users
        WHERE store = {:storeId}
          AND status = 'active'
          AND role IN ('store_admin', 'store_staff')) AS activeUsers,
      (SELECT COUNT(DISTINCT device_digest) FROM store_user_devices
        WHERE store = {:storeId} AND status = 'authorized') AS storeDevices,
      COALESCE((SELECT MAX(deviceCount) FROM (
        SELECT COUNT(*) AS deviceCount
        FROM store_user_devices
        WHERE store = {:storeId} AND status = 'authorized'
        GROUP BY user
      )), 0) AS maxDevicesPerUser,
      (SELECT COUNT(*) FROM products WHERE store = {:storeId}) AS products
  `, { storeId }, { activeUsers: 0, storeDevices: 0, maxDevicesPerUser: 0, products: 0 }) || {};
  return normalizeUsageRow(row);
}

function mapAudit(record) {
  const action = recordString(record, "action");
  return {
    id: String(record.id || recordString(record, "id")).slice(0, 15),
    action,
    action_label: PLAN_ACTION_LABELS[action] || "Actualización de plan",
    actor_name: recordString(record, "actor_name_snapshot") || "Sistema",
    actor_role: recordString(record, "actor_role_snapshot") || "system",
    previous_plan: recordString(record, "previous_plan"),
    new_plan: recordString(record, "new_plan"),
    previous_started_at: recordDate(record, "previous_started_at"),
    new_started_at: recordDate(record, "new_started_at"),
    previous_expires_at: recordDate(record, "previous_expires_at"),
    new_expires_at: recordDate(record, "new_expires_at"),
    previous_is_permanent: recordBool(record, "previous_is_permanent"),
    new_is_permanent: recordBool(record, "new_is_permanent"),
    duration_months: Math.max(0, Math.floor(recordNumber(record, "duration_months"))),
    commercial_terms: planCatalog.normalizeCommercialAuditSnapshot(recordValue(record, "commercial_snapshot_json")),
    reason: boundedString(recordString(record, "reason"), 500),
    created: recordDate(record, "created"),
  };
}

function planHistory(app, storeId, limit) {
  return (app.findRecordsByFilter(
    AUDIT_COLLECTION,
    "store = {:storeId}",
    "-created",
    limit,
    0,
    { storeId }
  ) || []).map(mapAudit);
}

function storeSnapshot(store) {
  return {
    plan: recordString(store, "plan"),
    plan_started_at: recordDate(store, "plan_started_at"),
    plan_expires_at: recordDate(store, "plan_expires_at"),
    plan_duration_months: Math.max(0, Math.floor(recordNumber(store, "plan_duration_months"))),
    plan_is_permanent: recordBool(store, "plan_is_permanent"),
  };
}

function definitionsResponse() {
  return plans.PLAN_CODES.map((code) => {
    const definition = plans.getPlanDefinition(code);
    return {
      code,
      name: definition.name,
      monthly_price_cup: plans.getMonthlyPriceCup(code),
      pricing: plans.getPlanPricing(code),
      catalog_contract: planCatalog.CATALOG_CONTRACT,
      duration: definition.duration,
      grace_days: plans.getPlanGraceDays(code),
      supports_permanent: definition.supports_permanent,
      capabilities: plans.getPlanCapabilities(code),
    };
  });
}

function normalizeUsageRow(row) {
  const source = row || {};
  return {
    active_users: nonNegativeInteger(source.activeUsers),
    store_devices: nonNegativeInteger(source.storeDevices),
    max_devices_per_user: nonNegativeInteger(source.maxDevicesPerUser),
    products: nonNegativeInteger(source.products),
  };
}

function runResponseStage(stage, callback) {
  try {
    return callback();
  } catch (error) {
    error.planStage = stage;
    throw error;
  }
}

function buildPlanResponse(app, store) {
  const state = runResponseStage("resolve_plan_state", () => plans.resolvePlanState(store, new Date()));
  const history = runResponseStage("plan_history", () => planHistory(app, store.id, 20));
  const usage = runResponseStage("store_usage", () => storeUsage(app, store.id));
  const definitions = runResponseStage("definitions_response", definitionsResponse);
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    store: {
      id: String(store.id || "").slice(0, 15),
      name: boundedString(recordString(store, "name"), 160),
      slug: boundedString(recordString(store, "slug"), 120),
      status: recordString(store, "status") === "active" ? "active" : "suspended",
      free_trial_used: recordBool(store, "free_trial_used"),
    },
    plan: state,
    usage,
    product_quota: productQuota.productQuotaView(app, store, usage.products),
    expiration_cleanup: productExpiration.getStoreExpirationCleanupPreview(app, store.id),
    catalog_contract: planCatalog.CATALOG_CONTRACT,
    definitions,
    last_change: history.length ? history[0] : null,
    history,
  };
}

function handlePlanCatalog(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info)) return e.json(403, { ok: false, error: "unauthorized" });
    return e.json(200, { ok: true, ...planCatalog.getCatalogDto() });
  } catch (error) {
    logFailure("PZ_MASTER_PLAN_CATALOG_FAILED", error);
    return e.json(500, { ok: false, error: "plan_catalog_failed" });
  }
}

function parseDetailPayload(body) {
  if (!exactPayload(body, ["store_id"])) return null;
  const storeId = bodyValue(body, "store_id");
  return typeof storeId === "string" && RECORD_ID_PATTERN.test(storeId) ? { storeId } : null;
}

function parseChangePayload(body) {
  const withConfirmation = exactPayload(body, ["store_id", "plan", "is_permanent", "duration_months", "reason", "confirm_expiration_cleanup"]);
  const legacyPayload = exactPayload(body, ["store_id", "plan", "is_permanent", "duration_months", "reason"]);
  if (!withConfirmation && !legacyPayload) return null;
  const storeId = bodyValue(body, "store_id");
  const plan = bodyValue(body, "plan");
  const isPermanent = bodyValue(body, "is_permanent");
  const durationMonths = bodyValue(body, "duration_months");
  const reason = bodyValue(body, "reason");
  const confirmExpirationCleanup = withConfirmation ? bodyValue(body, "confirm_expiration_cleanup") : false;
  if (typeof storeId !== "string" || !RECORD_ID_PATTERN.test(storeId)) return null;
  if (typeof plan !== "string" || !plans.isValidPlanCode(plan)) return null;
  if (typeof isPermanent !== "boolean") return null;
  if (!Number.isInteger(durationMonths)
    || (durationMonths !== 0 && !planCatalog.COMMERCIAL_PERIOD_MONTHS.includes(durationMonths))) return null;
  if (typeof reason !== "string" || reason.length > 500) return null;
  if (typeof confirmExpirationCleanup !== "boolean") return null;
  if (isPermanent && !plans.PERMANENT_PLAN_CODES.includes(plan)) return null;
  if (!isPermanent && plan === "free" && durationMonths !== 0) return null;
  if (!isPermanent && plan !== "free" && durationMonths < 1) return null;
  if (isPermanent && durationMonths !== 0) return null;
  return { storeId, plan, isPermanent, durationMonths, reason: reason.trim(), confirmExpirationCleanup };
}

function parseRenewPayload(body) {
  if (!exactPayload(body, ["store_id", "months", "reason"])) return null;
  const storeId = bodyValue(body, "store_id");
  const months = bodyValue(body, "months");
  const reason = bodyValue(body, "reason");
  if (typeof storeId !== "string" || !RECORD_ID_PATTERN.test(storeId)) return null;
  if (!Number.isInteger(months) || !planCatalog.COMMERCIAL_PERIOD_MONTHS.includes(months)) return null;
  if (typeof reason !== "string" || reason.length > 500) return null;
  return { storeId, months, reason: reason.trim() };
}

function applyValues(record, values) {
  Object.keys(values).forEach((key) => record.set(key, values[key]));
}

function createAudit(app, store, actor, action, previous, next, durationMonths, reason) {
  const collection = app.findCollectionByNameOrId(AUDIT_COLLECTION);
  const audit = new Record(collection, {});
  audit.set("store", store.id);
  audit.set("store_id_snapshot", String(store.id || "").slice(0, 15));
  audit.set("store_name_snapshot", boundedString(recordString(store, "name"), 140));
  audit.set("store_slug_snapshot", boundedString(recordString(store, "slug"), 80));
  audit.set("actor", actor.id);
  audit.set("actor_name_snapshot", boundedString(
    recordString(actor, "display_name") || recordString(actor, "name") || recordString(actor, "email"),
    160
  ));
  audit.set("actor_role_snapshot", "master_admin");
  audit.set("action", action);
  audit.set("previous_plan", previous.plan);
  audit.set("new_plan", next.plan);
  audit.set("previous_started_at", previous.plan_started_at);
  audit.set("new_started_at", next.plan_started_at);
  audit.set("previous_expires_at", previous.plan_expires_at);
  audit.set("new_expires_at", next.plan_expires_at);
  audit.set("previous_is_permanent", previous.plan_is_permanent);
  audit.set("new_is_permanent", next.plan_is_permanent);
  audit.set("duration_months", durationMonths);
  audit.set("commercial_snapshot_json", planCatalog.getCommercialAuditSnapshot("ecommerce", next.plan, {
    months: durationMonths,
    is_permanent: next.plan_is_permanent,
  }));
  audit.set("reason", reason);
  app.save(audit);
  return audit;
}

function createPlanActivity(app, store, actor, audit, action, previous, next) {
  const changedFields = [];
  if (previous.plan !== next.plan) changedFields.push("plan");
  if (previous.plan_started_at !== next.plan_started_at) changedFields.push("plan_started_at");
  if (previous.plan_expires_at !== next.plan_expires_at) changedFields.push("plan_expires_at");
  if (previous.plan_is_permanent !== next.plan_is_permanent) changedFields.push("plan_is_permanent");
  const label = PLAN_ACTION_LABELS[action] || "Plan actualizado";
  return storeActivity.createActivity(app, {
    storeId: store.id,
    actor,
    module: "plan",
    action,
    severity: action === "plan_renewed" ? "important" : "critical",
    resourceType: "store_plan",
    resourceId: store.id,
    resourceLabel: boundedString(recordString(store, "name") || "Tienda", 140),
    changedFields,
    previousValues: {
      plan: previous.plan,
      plan_started_at: previous.plan_started_at,
      plan_expires_at: previous.plan_expires_at,
      plan_is_permanent: previous.plan_is_permanent,
    },
    newValues: {
      plan: next.plan,
      plan_started_at: next.plan_started_at,
      plan_expires_at: next.plan_expires_at,
      plan_is_permanent: next.plan_is_permanent,
    },
    summary: `${label} por Master Admin`,
    sourceEventKey: `plan:${action}:${audit.id}`,
  });
}

function permanenceAction(previous, next) {
  if (previous.plan_is_permanent !== next.plan_is_permanent) {
    return next.plan_is_permanent ? "plan_made_permanent" : "plan_made_temporary";
  }
  return "plan_changed";
}

function knownErrorCode(error) {
  const message = boundedString(error && error.message, 100);
  return [
    "invalid_plan_code",
    "invalid_plan_duration_months",
    "invalid_plan_permanence",
    "free_trial_already_used",
    "permanent_plan_not_renewable",
    "free_plan_not_renewable",
  ].includes(message) ? message : "";
}

function logFailure(code, error) {
  try {
    const allowedStages = [
      "request_validation",
      "management_ready",
      "store_load",
      "resolve_plan_state",
      "plan_history",
      "store_usage",
      "definitions_response",
      "response_serialization",
      "unknown",
    ];
    const rawStage = boundedString(error && error.planStage, 40);
    const stage = allowedStages.includes(rawStage) ? rawStage : "unknown";
    const rawName = boundedString(error && error.name, 30);
    const errorName = ["Error", "TypeError", "RangeError"].includes(rawName) ? rawName : "Error";
    const rawMessage = boundedString(error && error.message, 80);
    const safeMessage = ["invalid_date", "invalid_plan_code"].includes(rawMessage) ? rawMessage : "internal_error";
    $app.logger().error(
      "PowerZona master plan management failed safely.",
      "code", code,
      "stage", stage,
      "error_name", errorName,
      "safe_message", safeMessage
    );
  } catch (_) {}
}

function handlePlanDetail(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseDetailPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!planManagementReady($app)) return e.json(503, { ok: false, error: "plan_management_unavailable" });
    const store = findRecord($app, "stores", parsed.storeId);
    if (!store) return e.json(404, { ok: false, error: "store_not_found" });
    const response = buildPlanResponse($app, store);
    return runResponseStage("response_serialization", () => e.json(200, response));
  } catch (error) {
    logFailure("PZ_MASTER_PLAN_DETAIL_FAILED", error);
    return e.json(500, { ok: false, error: "plan_detail_failed" });
  }
}

function handlePlanChange(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseChangePayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!planManagementReady($app)) return e.json(503, { ok: false, error: "plan_management_unavailable" });
    const actorId = recordString(info.auth, "id");
    let response = null;
    $app.runInTransaction((txApp) => {
      const actor = findRecord(txApp, "users", actorId);
      const store = findRecord(txApp, "stores", parsed.storeId);
      if (!actor || !isMaster({ auth: actor })) throw new Error("unauthorized");
      if (!store) throw new Error("store_not_found");
      const previous = storeSnapshot(store);
      const previousTeamLimit = storeTeam.effectivePlanMax(store);
      const values = plans.buildPlanChangeValues(store, {
        plan: parsed.plan,
        is_permanent: parsed.isPermanent,
        duration_months: parsed.durationMonths,
      }, new Date(), actorId);
      applyValues(store, values);
      txApp.save(store);
      backgroundNotifications.archiveStorePlanNotifications(txApp, store.id, new Date());
      const next = storeSnapshot(store);
      const action = permanenceAction(previous, next);
      const audit = createAudit(txApp, store, actor, action, previous, next, parsed.durationMonths, parsed.reason);
      createPlanActivity(txApp, store, actor, audit, action, previous, next);
      const teamAccessTransition = storeTeam.reconcilePlanAccess(
        txApp,
        store,
        previousTeamLimit,
        actor
      );
      const androidDistributionTransition = storefrontAppAdmin.withdrawForPlanDowngrade(
        txApp,
        store,
        actor,
        previous.plan,
        next.plan
      );
      response = buildPlanResponse(txApp, store);
      response.downgrade_data_preserved = previous.plan === "premium" && next.plan !== "premium";
      response.team_access_transition = teamAccessTransition;
      response.android_distribution_transition = androidDistributionTransition;
    });
    return runResponseStage("response_serialization", () => e.json(200, response));
  } catch (error) {
    const code = knownErrorCode(error) || boundedString(error && error.message, 80);
    if (code === "unauthorized") return e.json(403, { ok: false, error: code });
    if (code === "store_not_found") return e.json(404, { ok: false, error: code });
    if (knownErrorCode(error)) return e.json(409, { ok: false, error: code });
    logFailure("PZ_MASTER_PLAN_CHANGE_FAILED", error);
    return e.json(500, { ok: false, error: "plan_change_failed" });
  }
}

function handlePlanRenew(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseRenewPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!planManagementReady($app)) return e.json(503, { ok: false, error: "plan_management_unavailable" });
    const actorId = recordString(info.auth, "id");
    let response = null;
    $app.runInTransaction((txApp) => {
      const actor = findRecord(txApp, "users", actorId);
      const store = findRecord(txApp, "stores", parsed.storeId);
      if (!actor || !isMaster({ auth: actor })) throw new Error("unauthorized");
      if (!store) throw new Error("store_not_found");
      const previous = storeSnapshot(store);
      const previousTeamLimit = storeTeam.effectivePlanMax(store);
      const values = plans.buildPlanRenewalValues(store, parsed.months, new Date(), actorId);
      applyValues(store, values);
      txApp.save(store);
      backgroundNotifications.archiveStorePlanNotifications(txApp, store.id, new Date());
      const next = storeSnapshot(store);
      const audit = createAudit(txApp, store, actor, "plan_renewed", previous, next, parsed.months, parsed.reason);
      createPlanActivity(txApp, store, actor, audit, "plan_renewed", previous, next);
      const teamAccessTransition = storeTeam.reconcilePlanAccess(
        txApp,
        store,
        previousTeamLimit,
        actor
      );
      response = buildPlanResponse(txApp, store);
      response.team_access_transition = teamAccessTransition;
    });
    return runResponseStage("response_serialization", () => e.json(200, response));
  } catch (error) {
    const code = knownErrorCode(error) || boundedString(error && error.message, 80);
    if (code === "unauthorized") return e.json(403, { ok: false, error: code });
    if (code === "store_not_found") return e.json(404, { ok: false, error: code });
    if (knownErrorCode(error)) return e.json(409, { ok: false, error: code });
    logFailure("PZ_MASTER_PLAN_RENEW_FAILED", error);
    return e.json(500, { ok: false, error: "plan_renew_failed" });
  }
}

module.exports = {
  buildPlanResponse,
  definitionsResponse,
  handlePlanCatalog,
  handlePlanChange,
  handlePlanDetail,
  handlePlanRenew,
  mapAudit,
  normalizeUsageRow,
  parseChangePayload,
  parseRenewPayload,
  requireAuthenticatedUser,
  safeIsoDate,
};
