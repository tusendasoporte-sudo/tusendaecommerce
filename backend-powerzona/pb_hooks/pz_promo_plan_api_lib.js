/// <reference path="../pb_data/types.d.ts" />

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const promoPlans = typeof __hooks === "undefined"
  ? require("./pz_promo_plan_lib.js")
  : require(`${__hooks}/pz_promo_plan_lib.js`);
const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;

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

function exactPayload(body, keys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

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

function safeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength || 500);
}

function safeDate(value) {
  try { return plans.normalizedIso(value) || ""; } catch (_) { return ""; }
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function planSnapshot(store) {
  return {
    plan: recordString(store, "plan"),
    plan_started_at: safeDate(recordValue(store, "plan_started_at")),
    plan_expires_at: safeDate(recordValue(store, "plan_expires_at")),
    plan_duration_months: Math.max(0, Math.floor(Number(recordValue(store, "plan_duration_months") || 0))),
    plan_is_permanent: recordBool(store, "plan_is_permanent"),
  };
}

function mapAudit(record) {
  const previousPlan = recordString(record, "previous_plan") === "premium"
    ? "basic"
    : recordString(record, "previous_plan");
  const newPlan = recordString(record, "new_plan") === "premium"
    ? "basic"
    : recordString(record, "new_plan");
  return {
    id: recordId(record).slice(0, 15),
    action: safeText(recordString(record, "action"), 50),
    actor_name: safeText(recordString(record, "actor_name_snapshot") || "Sistema", 160),
    previous_plan: safeText(previousPlan, 20),
    new_plan: safeText(newPlan, 20),
    previous_expires_at: safeDate(recordValue(record, "previous_expires_at")),
    new_expires_at: safeDate(recordValue(record, "new_expires_at")),
    duration_months: Math.max(0, Math.floor(Number(recordValue(record, "duration_months") || 0))),
    reason: safeText(recordString(record, "reason"), 500),
    created: safeDate(recordValue(record, "created")),
  };
}

function history(app, storeId) {
  try {
    return Array.from(app.findRecordsByFilter(
      "store_plan_audit", "store = {:store}", "-created,-id", 20, 0, { store: storeId },
    ) || []).map(mapAudit);
  } catch (_) { return []; }
}

function buildResponse(app, store, now) {
  const state = promoPlans.resolvePromoPlanState(store, now === undefined ? new Date() : now);
  const planHistory = history(app, recordId(store));
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    store: {
      id: recordId(store).slice(0, 15),
      name: safeText(recordString(store, "name"), 140),
      slug: safeText(recordString(store, "slug"), 80),
      status: recordString(store, "status") === "active" ? "active" : "suspended",
      type: "promo",
      free_trial_used: recordBool(store, "free_trial_used"),
    },
    plan: state,
    definitions: promoPlans.promoPlanDefinitions(),
    last_change: planHistory.length ? planHistory[0] : null,
    history: planHistory,
  };
}

function parseDetailPayload(body) {
  if (!exactPayload(body, ["store_id"])) return null;
  const storeId = bodyValue(body, "store_id");
  return typeof storeId === "string" && RECORD_ID_PATTERN.test(storeId) ? { storeId } : null;
}

function parseChangePayload(body) {
  if (!exactPayload(body, ["store_id", "plan", "duration_months", "reason"])) return null;
  const storeId = bodyValue(body, "store_id");
  const plan = bodyValue(body, "plan");
  const durationMonths = bodyValue(body, "duration_months");
  const reason = bodyValue(body, "reason");
  if (typeof storeId !== "string" || !RECORD_ID_PATTERN.test(storeId)) return null;
  if (typeof plan !== "string" || !promoPlans.isPromoPlanCode(plan)) return null;
  if (!Number.isInteger(durationMonths) || durationMonths < 0 || durationMonths > 12) return null;
  if (typeof reason !== "string" || reason.length > 500) return null;
  if ((plan === "free" && durationMonths !== 0) || (plan === "basic" && durationMonths < 1)) return null;
  return { storeId, plan, durationMonths, reason: reason.trim() };
}

function parseRenewPayload(body) {
  if (!exactPayload(body, ["store_id", "months", "reason"])) return null;
  const storeId = bodyValue(body, "store_id");
  const months = bodyValue(body, "months");
  const reason = bodyValue(body, "reason");
  if (typeof storeId !== "string" || !RECORD_ID_PATTERN.test(storeId)) return null;
  if (!Number.isInteger(months) || months < 1 || months > 12) return null;
  if (typeof reason !== "string" || reason.length > 500) return null;
  return { storeId, months, reason: reason.trim() };
}

function createAudit(app, store, actor, action, previous, next, months, reason) {
  const audit = new Record(app.findCollectionByNameOrId("store_plan_audit"), {});
  audit.set("store", recordId(store));
  audit.set("store_id_snapshot", recordId(store).slice(0, 15));
  audit.set("store_name_snapshot", recordString(store, "name").slice(0, 140));
  audit.set("store_slug_snapshot", recordString(store, "slug").slice(0, 80));
  audit.set("actor", recordId(actor));
  audit.set("actor_name_snapshot", (recordString(actor, "display_name") || recordString(actor, "name")).slice(0, 160));
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
  audit.set("duration_months", months);
  audit.set("reason", safeText(reason, 500));
  app.save(audit);
  return audit;
}

function loadContext(app, session, storeId) {
  const actor = promo.requireActiveMasterSession(app, session);
  const store = findRecord(app, "stores", storeId);
  if (!store || !promoPlans.isPromoStore(app, store)) {
    const error = new Error("store_not_promo");
    error.code = "store_not_promo";
    throw error;
  }
  return { actor, store };
}

function applyValues(record, values) {
  Object.keys(values).forEach((key) => record.set(key, values[key]));
}

function errorCode(error) {
  const code = safeText(error && (error.code || error.message), 80);
  return [
    "unauthorized", "session_revoked", "user_inactive", "store_not_promo",
    "invalid_promo_plan_code", "invalid_promo_plan_permanence",
    "invalid_plan_duration_months", "promo_free_trial_already_used",
    "free_plan_not_renewable", "permanent_plan_not_renewable",
  ].includes(code) ? code : "";
}

function sendError(e, error) {
  const code = errorCode(error);
  if (["unauthorized", "session_revoked", "user_inactive"].includes(code)) {
    return e.json(403, { ok: false, error: code });
  }
  if (code === "store_not_promo") return e.json(404, { ok: false, error: code });
  if (code) return e.json(409, { ok: false, error: code });
  return e.json(500, { ok: false, error: "promo_plan_failed" });
}

function handleDetail(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const parsed = parseDetailPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const context = loadContext(e.app, e.auth, parsed.storeId);
    return e.json(200, buildResponse(e.app, context.store));
  } catch (error) { return sendError(e, error); }
}

function handleChange(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const parsed = parseChangePayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = null;
    e.app.runInTransaction((app) => {
      const context = loadContext(app, e.auth, parsed.storeId);
      const selection = promoPlans.assertPromoPlanSelection(context.store, {
        plan: parsed.plan, is_permanent: false, duration_months: parsed.durationMonths,
      });
      const previous = planSnapshot(context.store);
      const values = plans.buildPlanChangeValues(context.store, selection, new Date(), recordId(context.actor));
      applyValues(context.store, values);
      app.save(context.store);
      promoPlans.syncPromoEntitlement(app, context.store, recordId(context.actor));
      const next = planSnapshot(context.store);
      createAudit(app, context.store, context.actor, "plan_changed", previous, next, parsed.durationMonths, parsed.reason);
      response = buildResponse(app, context.store);
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error); }
}

function handleRenew(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const parsed = parseRenewPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = null;
    e.app.runInTransaction((app) => {
      const context = loadContext(app, e.auth, parsed.storeId);
      if (recordString(context.store, "plan") !== "basic") throw new Error("free_plan_not_renewable");
      const previous = planSnapshot(context.store);
      const values = plans.buildPlanRenewalValues(context.store, parsed.months, new Date(), recordId(context.actor));
      applyValues(context.store, values);
      app.save(context.store);
      promoPlans.syncPromoEntitlement(app, context.store, recordId(context.actor));
      const next = planSnapshot(context.store);
      createAudit(app, context.store, context.actor, "plan_renewed", previous, next, parsed.months, parsed.reason);
      response = buildResponse(app, context.store);
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error); }
}

module.exports = {
  buildResponse,
  handleChange,
  handleDetail,
  handleRenew,
  mapAudit,
  parseChangePayload,
  parseDetailPayload,
  parseRenewPayload,
  requireAuthenticatedUser,
};
