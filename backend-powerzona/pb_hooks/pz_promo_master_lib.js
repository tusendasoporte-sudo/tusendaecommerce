/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const permissionsApi = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_api_lib.js")
  : require(`${__hooks}/pz_promo_permissions_api_lib.js`);
const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const pubcfg = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_lib.js`);
const pubcfgApi = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_api_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_api_lib.js`);
const audit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const theme = typeof __hooks === "undefined"
  ? require("./pz_promo_theme_lib.js")
  : require(`${__hooks}/pz_promo_theme_lib.js`);

const CATALOG_READ_CONTRACT = "promo.master.store.catalog.read.v1";
const CATALOG_RESPONSE_CONTRACT = "promo.master.store.catalog.v1";
const OVERVIEW_READ_CONTRACT = "promo.master.overview.read.v1";
const OVERVIEW_RESPONSE_CONTRACT = "promo.master.overview.v1";
const LIFECYCLE_UPDATE_CONTRACT = "promo.master.lifecycle.update.v1";
const LIFECYCLE_RESPONSE_CONTRACT = "promo.master.lifecycle.v1";
const PREFERENCES_UPDATE_CONTRACT = "promo.master.preferences.update.v1";
const PREFERENCES_RESPONSE_CONTRACT = "promo.master.preferences.v1";
const DEFAULT_PROMO_THEME_ID = "promo.black-gold";
const DEFAULT_PROMO_THEME_VERSION = "1.0.0";
const DEFAULT_PROMO_CAPABILITIES = Object.freeze({
  promo_site_enabled: true,
  publish_enabled: true,
  custom_domain_enabled: false,
  theme_customization_enabled: true,
  multilanguage_enabled: true,
  language_selector_enabled: false,
  video_enabled: false,
  analytics_enabled: true,
  landing_qr_bridge_enabled: false,
  max_services: 12,
  max_locales: 2,
  max_videos: 0,
  max_storage_bytes: 250 * 1024 * 1024,
});
const LIFECYCLE_REASON_CODES = Object.freeze([
  "administrative_request", "contract_change", "incident_recovery", "incident_response",
]);
const MASTER_LIFECYCLE_TRANSITIONS = Object.freeze({
  draft: Object.freeze(["active"]),
  active: Object.freeze(["suspended"]),
  paused: Object.freeze(["suspended", "retired"]),
  suspended: Object.freeze(["retired"]),
  retired: Object.freeze([]),
});
const REQUIRED_COLLECTIONS = Object.freeze([
  "promo_sites", "promo_site_entitlements", "promo_theme_releases",
  "promo_draft_documents", "promo_media_assets", "promo_revisions", "promo_revision_media_refs",
  "promo_publication_slots", "promo_publication_events", "promo_audit_events",
  "promo_analytics_events", "promo_analytics_daily",
]);
const SAFE_ERRORS = new Set([
  "unauthorized", "session_revoked", "user_inactive", "promo_not_found", "store_not_promo",
  "store_inactive", "promo_site_inactive", "promo_store_context_required", "invalid_payload",
  "invalid_promo_site_transition", "promo_lifecycle_conflict", "promo_lifecycle_validation_failed",
  "promo_capability_denied", "promo_master_unavailable", "promo_preferences_conflict",
  "promo_theme_not_selectable", "unknown_promo_theme", "invalid_promo_document",
]);

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = Number.isInteger(status) ? status : undefined;
  return error;
}

function recordId(record) { return promo.recordId(record); }
function recordString(record, key) { return promo.recordString(record, key); }
function recordInteger(record, key) { return promo.recordInteger(record, key); }
function relationId(record, key) { return promo.relationId(record, key); }
function recordBool(record, key) { return promo.recordBool(record, key); }
function recordValue(record, key) { return promo.recordValue(record, key); }

function normalizedObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
  } catch (_) { return null; }
}

function exactPayload(value, keys) {
  const object = normalizedObject(value);
  if (!object) return false;
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requestHeader(info, name) {
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return String(headers.get(name) || headers.get(String(name).toLowerCase()) || headers.get(normalized) || "")
        .trim().slice(0, 80);
    }
  } catch (_) {}
  const matches = Object.keys(headers).filter((key) => String(key).toLowerCase().replace(/-/g, "_") === normalized);
  return matches.length === 1 ? String(headers[matches[0]] || "").trim().slice(0, 80) : "";
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

function collectionsReady(app) {
  try {
    return REQUIRED_COLLECTIONS.every((name) => {
      const collection = app.findCollectionByNameOrId(name);
      return collection.listRule === null && collection.viewRule === null
        && collection.createRule === null && collection.updateRule === null
        && collection.deleteRule === null;
    });
  } catch (_) { return false; }
}

function requestContext(e) {
  setPrivateHeaders(e);
  if (!e || !e.auth) throw codedError("unauthorized", 403);
  if (!collectionsReady(e.app)) throw codedError("promo_master_unavailable", 503);
  const info = e.requestInfo();
  if (!info || !exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
  return {
    body: normalizedObject(info.body || {}),
    storeId: requestHeader(info, "X-PZ-Promo-Store"),
  };
}

function findRecord(app, collection, id) {
  if (!/^[a-z0-9]{15}$/.test(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRows(app, collection, filter, sort, limit, params, offset) {
  try {
    return Array.from(app.findRecordsByFilter(
      collection,
      filter || "",
      sort || "id",
      Number.isInteger(limit) ? limit : 100,
      Number.isInteger(offset) ? offset : 0,
      params || {},
    ) || []);
  } catch (_) { throw codedError("promo_master_unavailable", 503); }
}

function findExact(app, collection, filter, params) {
  const rows = findRows(app, collection, filter, "id", 2, params, 0);
  return rows.length === 1 ? rows[0] : null;
}

function allRows(app, collection, filter, sort, params, hardLimit) {
  const output = [];
  const pageSize = 200;
  const limit = Number.isInteger(hardLimit) ? hardLimit : 5000;
  while (output.length < limit) {
    const rows = findRows(app, collection, filter, sort, Math.min(pageSize, limit - output.length), params, output.length);
    output.push(...rows);
    if (rows.length < pageSize) break;
  }
  if (output.length >= limit) throw codedError("promo_master_unavailable", 503);
  return output;
}

function safeJson(record, key) {
  try {
    const value = recordValue(record, key);
    const normalized = pubcfg.normalizeJson(value);
    return normalized && typeof normalized === "object" ? normalized : null;
  } catch (_) { return null; }
}

function siteProjection(site) {
  const status = recordString(site, "status");
  return Object.freeze({
    public_slug: recordString(site, "public_slug"),
    status,
    contract_version: recordInteger(site, "contract_version") || 0,
    updated: recordString(site, "updated"),
    allowed_next_statuses: MASTER_LIFECYCLE_TRANSITIONS[status] || Object.freeze([]),
  });
}

function siteAuditSnapshot(site) {
  return Object.freeze({
    status: recordString(site, "status"),
    public_slug: recordString(site, "public_slug"),
    contract_version: recordInteger(site, "contract_version") || 0,
  });
}

function slotProjection(slot) {
  if (!slot) return Object.freeze({ state: "missing", generation: 0, canonical: { mode: "platform" }, revision_id: "" });
  return Object.freeze({
    state: recordString(slot, "state"),
    generation: Math.max(0, recordInteger(slot, "generation") || 0),
    canonical: Object.freeze({ mode: "platform" }),
    revision_id: relationId(slot, "published_revision"),
    published_at: recordString(slot, "published_at"),
    updated: recordString(slot, "updated"),
  });
}

function catalogItem(app, site) {
  const siteId = recordId(site);
  const entitlement = findExact(app, "promo_site_entitlements", "site = {:site}", { site: siteId });
  const slot = findExact(app, "promo_publication_slots", "site = {:site}", { site: siteId });
  return Object.freeze({
    store_id: relationId(site, "store"),
    type: "promo",
    site: Object.freeze({ public_slug: recordString(site, "public_slug"), status: recordString(site, "status") }),
    entitlement_state: entitlement
      ? (recordBool(entitlement, "promo_site_enabled") ? "enabled" : "disabled")
      : "missing",
    publication: slotProjection(slot),
  });
}

function handleCatalogRead(e) {
  try {
    const context = requestContext(e);
    if (!context.body || !exactPayload(context.body, ["contract"])
      || context.body.contract !== CATALOG_READ_CONTRACT || context.storeId) {
      throw codedError("invalid_payload", 400);
    }
    promo.requireActiveMasterSession(e.app, e.auth);
    const sites = allRows(e.app, "promo_sites", "", "store", {}, 5000);
    const items = sites.map((site) => catalogItem(e.app, site));
    if (items.some((item) => !/^[a-z0-9]{15}$/.test(item.store_id))) {
      throw codedError("promo_master_unavailable", 503);
    }
    return e.json(200, { ok: true, contract: CATALOG_RESPONSE_CONTRACT, items });
  } catch (error) { return sendError(e, error); }
}

function validationState(callback) {
  try {
    const result = callback();
    return Object.freeze({ state: "ready", code: "ready", result });
  } catch (error) {
    const code = String(error && (error.code || error.message) || "");
    const safe = ["promo_capability_denied", "promo_publication_validation_failed", "promo_draft_conflict",
      "promo_candidate_not_found", "promo_candidate_unavailable", "promo_pubcfg_unavailable"];
    return Object.freeze({ state: "blocked", code: safe.includes(code) ? code : "validation_unavailable", result: null });
  }
}

function draftProjection(app, decision) {
  const draft = pubcfgApi.findDraft(app, recordId(decision.site));
  if (!draft) return Object.freeze({ state: "missing", version: 0, digest: "", theme: null, locales: null, readiness: { state: "blocked", code: "promo_draft_unavailable" } });
  let document;
  try { document = pubcfgApi.validatedStoredDraft(draft); }
  catch (_) { return Object.freeze({ state: "incoherent", version: 0, digest: "", theme: null, locales: null, readiness: { state: "blocked", code: "promo_draft_unavailable" } }); }
  const version = recordInteger(draft, "version") || 0;
  const readiness = validationState(() => {
    const publicDocument = pubcfg.validatePromoDocument(document, { publicRevision: true });
    pubcfgApi.assertDraftTheme(app, publicDocument, { selectionChanged: false });
    const assets = pubcfgApi.loadDocumentAssets(app, recordId(decision.site), publicDocument, { publicRevision: true });
    pubcfgApi.assertEntitlementMetrics(decision.entitlement, publicDocument, assets);
    return true;
  });
  return Object.freeze({
    state: "available",
    version,
    digest: recordString(draft, "document_sha256"),
    theme: Object.freeze({
      theme_id: String(document.theme.theme_id || ""),
      version: String(document.theme.version || ""),
      override_keys: Object.keys(document.theme.tokens || {}).sort().slice(0, 64),
    }),
    locales: Object.freeze({
      default: String(document.locales.default || ""),
      published: Array.isArray(document.locales.published) ? document.locales.published.slice(0, 10) : [],
    }),
    readiness: Object.freeze({ state: readiness.state, code: readiness.code }),
  });
}

function themeReleaseProjections(app) {
  return Object.keys(theme.THEME_REGISTRY).sort().map((key) => {
    const entry = theme.THEME_REGISTRY[key];
    const manifest = theme.publicManifest(entry);
    const release = findExact(
      app,
      "promo_theme_releases",
      "theme_id = {:theme} && version = {:version}",
      { theme: manifest.theme_id, version: manifest.version },
    );
    const status = release ? theme.recordString(release, "status") : "absent";
    const targets = status === "absent" ? ["draft"] : (data.THEME_TRANSITIONS[status] || []).filter((value) => value !== status);
    return Object.freeze({
      theme_id: manifest.theme_id,
      version: manifest.version,
      renderer_key: manifest.renderer_key,
      status,
      allowed_next_statuses: Object.freeze(targets),
    });
  });
}

function recentActivity(app, siteId) {
  const result = [];
  findRows(app, "promo_audit_events", "site = {:site}", "-created", 12, { site: siteId }, 0)
    .filter((row) => relationId(row, "site") === siteId)
    .forEach((row) => {
      try {
        const item = audit.mapAuditRecord(row);
        result.push(Object.freeze({
          created: item.created,
          module: item.module,
          action: item.action,
          severity: item.severity,
          summary: item.summary,
          actor: Object.freeze({ name: item.actor.name, role: item.actor.role }),
        }));
      } catch (_) {}
    });
  return result;
}

function operationSnapshot(app, auth, storeId) {
  const can = (action) => promo.canPromoAction(app, auth, action, { requestedStoreId: storeId });
  return Object.freeze({
    lifecycle_update: can("promo.master.site.lifecycle"),
    preferences_update: can("promo.master.support"),
    candidate_create: false,
    publish: false,
    rollback: false,
    unpublish: false,
    canonical_switch: false,
    pause: false,
    resume: false,
  });
}

function publicationControls(decision, slot, operations) {
  void decision;
  void slot;
  void operations;
  return Object.freeze({});
}

function publicationHealth(app, decision, slot) {
  if (!slot) return Object.freeze({ state: "incoherent", issues: ["slot_missing"] });
  if (["suspended", "retired"].includes(recordString(decision.site, "status"))) {
    return Object.freeze({ state: "not_serving", issues: [] });
  }
  if (recordString(slot, "state") !== "active") return Object.freeze({ state: "not_serving", issues: [] });
  if (recordString(slot, "canonical_mode") !== "platform" || relationId(slot, "primary_binding")) {
    return Object.freeze({ state: "incoherent", issues: ["platform_canonical_required"] });
  }
  try {
    pubcfgApi.resolvePublicProjectionForSite(app, decision.site, {
      canonicalMode: "platform",
      primaryBindingId: "",
      expectedGeneration: recordInteger(slot, "generation"),
    });
    return Object.freeze({ state: "healthy", issues: [] });
  } catch (_) { return Object.freeze({ state: "incoherent", issues: ["public_projection_unavailable"] }); }
}

function overviewResponse(app, auth, storeId) {
  const decision = promo.requirePromoAction(app, auth, "promo.master.support", { requestedStoreId: storeId });
  const siteId = recordId(decision.site);
  const entitlement = decision.entitlement;
  if (!entitlement) throw codedError("promo_master_unavailable", 503);
  const slot = findExact(app, "promo_publication_slots", "site = {:site}", { site: siteId });
  const publication = slotProjection(slot);
  const revisions = Object.freeze([]);
  const operations = operationSnapshot(app, auth, storeId);
  const issues = [];
  if (recordInteger(decision.site, "contract_version") !== 1) issues.push("site_contract_incoherent");
  if (!slot) issues.push("slot_missing");
  const draft = draftProjection(app, decision);
  if (draft.state !== "available") issues.push("draft_unavailable");
  const health = publicationHealth(app, decision, slot);
  const promoPlan = typeof __hooks === "undefined"
    ? require("./pz_promo_plan_lib.js")
    : require(`${__hooks}/pz_promo_plan_lib.js`);
  const planState = promoPlan.resolvePromoPlanState(decision.store);
  const photosUsed = allRows(
    app,
    "promo_media_assets",
    "site = {:site} && kind = 'image' && status != 'deleted'",
    "id",
    { site: siteId },
    1000,
  ).length;
  issues.push(...health.issues);
  return Object.freeze({
    ok: true,
    contract: OVERVIEW_RESPONSE_CONTRACT,
    store: Object.freeze({
      name: recordString(decision.store, "name"),
      slug: recordString(decision.store, "slug"),
      status: recordString(decision.store, "status"),
      type: "promo",
    }),
    site: siteProjection(decision.site),
    operations,
    entitlement: permissionsApi.entitlementResponse(entitlement),
    plan: Object.freeze({
      code: String(planState.plan || "free"),
      name: String(planState.plan_name || "Plan Promo"),
      state: String(planState.state || "unconfigured"),
      expires_at: String(planState.plan_expires_at || ""),
      days_remaining: Number.isInteger(planState.days_remaining) ? planState.days_remaining : null,
      photo_limit: Math.max(0, Number(planState.max_gallery_assets || 0)),
    }),
    media: Object.freeze({ photos_used: photosUsed, photo_limit: Math.max(0, Number(planState.max_gallery_assets || 0)) }),
    draft,
    publication: Object.freeze({
      ...publication,
      health,
      controls: publicationControls(decision, slot, operations),
      reason_codes: Object.freeze({}),
    }),
    revisions,
    theme: Object.freeze({
      draft: draft.theme,
      published: publication.state === "active" ? draft.theme : null,
      releases: themeReleaseProjections(app),
    }),
    activity: recentActivity(app, siteId),
    health: Object.freeze({ state: issues.length ? "incoherent" : "ready", issues: Object.freeze(Array.from(new Set(issues))) }),
  });
}

function handleOverviewRead(e) {
  try {
    const context = requestContext(e);
    if (!context.body || !exactPayload(context.body, ["contract"])
      || context.body.contract !== OVERVIEW_READ_CONTRACT) throw codedError("invalid_payload", 400);
    if (!/^[a-z0-9]{15}$/.test(context.storeId)) throw codedError("promo_store_context_required", 403);
    return e.json(200, overviewResponse(e.app, e.auth, context.storeId));
  } catch (error) { return sendError(e, error); }
}

function parseLifecycleUpdate(body) {
  if (!body || !exactPayload(body, ["contract", "expected_status", "expected_updated", "next_status", "reason_code"])
    || body.contract !== LIFECYCLE_UPDATE_CONTRACT
    || !Object.prototype.hasOwnProperty.call(data.SITE_TRANSITIONS, body.expected_status)
    || !Object.prototype.hasOwnProperty.call(data.SITE_TRANSITIONS, body.next_status)
    || !LIFECYCLE_REASON_CODES.includes(body.reason_code)) return null;
  const expectedUpdated = String(body.expected_updated || "").trim();
  if (!expectedUpdated || expectedUpdated.length > 50) return null;
  return {
    expectedStatus: body.expected_status,
    expectedUpdated,
    nextStatus: body.next_status,
    reasonCode: body.reason_code,
  };
}

function syncLifecycleSlot(app, decision, nextStatus, reasonCode) {
  const siteId = recordId(decision.site);
  let slot = findExact(app, "promo_publication_slots", "site = {:site}", { site: siteId });
  if (!slot) throw codedError("promo_master_unavailable", 503);
  app.db().newQuery("UPDATE promo_publication_slots SET id = id WHERE id = {:id}")
    .bind({ id: recordId(slot) }).execute();
  slot = findRecord(app, "promo_publication_slots", recordId(slot));
  if (!slot || relationId(slot, "site") !== siteId) throw codedError("promo_master_unavailable", 503);
  const previous = {
    state: recordString(slot, "state"),
    generation: Math.max(0, recordInteger(slot, "generation") || 0),
    canonical_mode: recordString(slot, "canonical_mode") || "platform",
  };
  if (nextStatus === "active") {
    if (recordString(decision.store, "status") !== "active"
      || !promo.resolvePromoCapabilityAccess(decision.entitlement, "promo_site_enabled").allowed
      || !promo.resolvePromoCapabilityAccess(decision.entitlement, "publish_enabled").allowed) {
      throw codedError("promo_capability_denied", 403);
    }
    try {
      const live = pubcfgApi.findDraft(app, siteId);
      const document = pubcfg.validatePromoDocument(pubcfgApi.validatedStoredLive(live), { publicRevision: true });
      pubcfgApi.assertDraftTheme(app, document, { selectionChanged: false });
      const assets = pubcfgApi.loadDocumentAssets(app, siteId, document, { publicRevision: true });
      pubcfgApi.assertEntitlementMetrics(decision.entitlement, document, assets);
    } catch (error) {
      if (String(error && (error.code || error.message) || "") === "promo_capability_denied") throw error;
      throw codedError("promo_lifecycle_validation_failed", 409);
    }
    slot.set("state", "active");
    slot.set("published_at", new Date().toISOString());
  } else {
    slot.set("state", "unpublished");
  }
  slot.set("published_revision", "");
  slot.set("generation", previous.generation + 1);
  slot.set("published_by", recordId(decision.actor));
  app.save(slot);
  audit.createPromoAudit(app, decision, {
    action: "promo.lifecycle.public_state.update",
    resourceType: "promo_publication_slot",
    resourceId: recordId(slot),
    changedPaths: ["/state", "/generation"],
    previousValues: previous,
    newValues: {
      state: recordString(slot, "state"),
      generation: recordInteger(slot, "generation"),
      canonical_mode: recordString(slot, "canonical_mode") || "platform",
      reason_code: reasonCode,
    },
    sourceEventKey: `promo.lifecycle.slot.${recordId(slot)}.${previous.generation + 1}`,
  });
  return slot;
}

function handleLifecycleUpdate(e) {
  let context;
  let input;
  try {
    context = requestContext(e);
    input = parseLifecycleUpdate(context.body);
    if (!input) throw codedError("invalid_payload", 400);
    if (!/^[a-z0-9]{15}$/.test(context.storeId)) throw codedError("promo_store_context_required", 403);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      let decision = promo.requirePromoAction(app, e.auth, "promo.master.site.lifecycle", {
        requestedStoreId: context.storeId,
      });
      app.db().newQuery("UPDATE promo_sites SET id = id WHERE id = {:id}")
        .bind({ id: recordId(decision.site) }).execute();
      const site = findRecord(app, "promo_sites", recordId(decision.site));
      if (!site || relationId(site, "store") !== recordId(decision.store)) throw codedError("promo_not_found", 404);
      if (recordString(site, "status") !== input.expectedStatus
        || recordString(site, "updated") !== input.expectedUpdated) throw codedError("promo_lifecycle_conflict", 409);
      if (input.nextStatus !== input.expectedStatus
        && !(MASTER_LIFECYCLE_TRANSITIONS[input.expectedStatus] || []).includes(input.nextStatus)) {
        throw codedError("invalid_promo_site_transition", 400);
      }
      if (input.nextStatus !== input.expectedStatus) {
        const previous = siteAuditSnapshot(site);
        syncLifecycleSlot(app, { ...decision, site }, input.nextStatus, input.reasonCode);
        site.set("status", input.nextStatus);
        site.set("updated_by", recordId(decision.actor));
        app.save(site);
        decision = { ...decision, site };
        audit.createPromoAudit(app, decision, {
          action: "promo.site.status.update",
          resourceType: "promo_site",
          resourceId: recordId(site),
          changedPaths: ["/status"],
          previousValues: previous,
          newValues: siteAuditSnapshot(site),
          sourceEventKey: `promo.site.status.${recordId(site)}.${input.expectedStatus}.${input.nextStatus}.${audit.stableFingerprint({
            expected_updated: input.expectedUpdated, reason_code: input.reasonCode,
          })}`,
        });
      }
      response = { ok: true, contract: LIFECYCLE_RESPONSE_CONTRACT, changed: input.nextStatus !== input.expectedStatus, site: siteProjection(site) };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error); }
}

function parsePreferencesUpdate(body) {
  if (!body || !exactPayload(body, [
    "contract", "expected_entitlement_updated", "expected_draft_version",
    "language_selector_enabled", "theme_id",
  ]) || body.contract !== PREFERENCES_UPDATE_CONTRACT) return null;
  const expectedEntitlementUpdated = String(body.expected_entitlement_updated || "").trim();
  const expectedDraftVersion = Number(body.expected_draft_version);
  const themeId = String(body.theme_id || "").trim();
  if (!expectedEntitlementUpdated || expectedEntitlementUpdated.length > 50
    || !Number.isSafeInteger(expectedDraftVersion) || expectedDraftVersion < 1
    || typeof body.language_selector_enabled !== "boolean"
    || !theme.registryEntry(themeId, DEFAULT_PROMO_THEME_VERSION)) return null;
  return {
    expectedEntitlementUpdated,
    expectedDraftVersion,
    languageSelectorEnabled: body.language_selector_enabled,
    themeId,
  };
}

function entitlementPreferenceSnapshot(entitlement) {
  return Object.freeze({
    source: recordString(entitlement, "source"),
    capabilities: Object.freeze({
      language_selector_enabled: recordBool(entitlement, "language_selector_enabled"),
    }),
  });
}

function handlePreferencesUpdate(e) {
  let context;
  let input;
  try {
    context = requestContext(e);
    input = parsePreferencesUpdate(context.body);
    if (!input) throw codedError("invalid_payload", 400);
    if (!/^[a-z0-9]{15}$/.test(context.storeId)) throw codedError("promo_store_context_required", 403);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = promo.requirePromoAction(app, e.auth, "promo.master.support", {
        requestedStoreId: context.storeId,
      });
      const siteId = recordId(decision.site);
      app.db().newQuery("UPDATE promo_site_entitlements SET id = id WHERE id = {:id}")
        .bind({ id: recordId(decision.entitlement) }).execute();
      const entitlement = findRecord(app, "promo_site_entitlements", recordId(decision.entitlement));
      let draft = pubcfgApi.findDraft(app, siteId);
      if (!entitlement || !draft) throw codedError("promo_master_unavailable", 503);
      app.db().newQuery("UPDATE promo_draft_documents SET id = id WHERE id = {:id}")
        .bind({ id: recordId(draft) }).execute();
      draft = findRecord(app, "promo_draft_documents", recordId(draft));
      if (!draft || relationId(draft, "site") !== siteId
        || recordString(entitlement, "updated") !== input.expectedEntitlementUpdated
        || recordInteger(draft, "version") !== input.expectedDraftVersion) {
        throw codedError("promo_preferences_conflict", 409);
      }

      const previousEntitlement = entitlementPreferenceSnapshot(entitlement);
      const previousDocument = pubcfgApi.validatedStoredDraft(draft);
      const nextDocument = JSON.parse(JSON.stringify(previousDocument));
      const themeChanged = nextDocument.theme.theme_id !== input.themeId
        || nextDocument.theme.version !== DEFAULT_PROMO_THEME_VERSION;
      nextDocument.theme = {
        theme_id: input.themeId,
        version: DEFAULT_PROMO_THEME_VERSION,
        tokens: themeChanged ? {} : (nextDocument.theme.tokens || {}),
      };
      const siteIsActive = recordString(decision.site, "status") === "active";
      const validatedDocument = pubcfg.validatePromoDocument(nextDocument, { publicRevision: siteIsActive });
      pubcfgApi.assertDraftTheme(app, validatedDocument, { selectionChanged: themeChanged });
      const assets = pubcfgApi.loadDocumentAssets(app, siteId, validatedDocument, { publicRevision: siteIsActive });
      pubcfgApi.assertEntitlementMetrics(entitlement, validatedDocument, assets);

      const selectorChanged = recordBool(entitlement, "language_selector_enabled") !== input.languageSelectorEnabled;
      if (selectorChanged) {
        entitlement.set("language_selector_enabled", input.languageSelectorEnabled);
        entitlement.set("source", "contract");
        entitlement.set("updated_by", recordId(decision.actor));
        app.save(entitlement);
        audit.createPromoAudit(app, decision, {
          action: "promo.entitlements.update",
          resourceType: "promo_site_entitlements",
          resourceId: recordId(entitlement),
          changedPaths: ["/capabilities/language_selector_enabled"],
          previousValues: previousEntitlement,
          newValues: entitlementPreferenceSnapshot(entitlement),
          sourceEventKey: `promo.preferences.language.${recordId(entitlement)}.${recordString(entitlement, "updated")}`,
        });
      }

      if (themeChanged) {
        const previousDigest = pubcfg.digestDocument(previousDocument);
        const nextDigest = pubcfg.digestDocument(validatedDocument);
        const nextVersion = input.expectedDraftVersion + 1;
        draft.set("document_json", validatedDocument);
        draft.set("document_sha256", nextDigest);
        draft.set("version", nextVersion);
        draft.set("updated_by", recordId(decision.actor));
        app.save(draft);
        const slot = findExact(app, "promo_publication_slots", "site = {:site}", { site: siteId });
        if (!slot) throw codedError("promo_master_unavailable", 503);
        slot.set("state", siteIsActive ? "active" : "unpublished");
        slot.set("published_revision", "");
        slot.set("generation", Math.max(0, recordInteger(slot, "generation")) + 1);
        app.save(slot);
        audit.createPromoAudit(app, decision, {
          action: "promo.theme.selection.update",
          resourceType: "promo_draft_document",
          resourceId: recordId(draft),
          changedPaths: ["/theme"],
          previousValues: { digest: previousDigest, version: input.expectedDraftVersion, theme: previousDocument.theme },
          newValues: { digest: nextDigest, version: nextVersion, theme: validatedDocument.theme },
          sourceEventKey: `promo.preferences.theme.${recordId(draft)}.${nextVersion}`,
        });
      }

      response = {
        ok: true,
        contract: PREFERENCES_RESPONSE_CONTRACT,
        changed: selectorChanged || themeChanged,
        language_selector_enabled: recordBool(entitlement, "language_selector_enabled"),
        theme: { theme_id: input.themeId, version: DEFAULT_PROMO_THEME_VERSION },
        draft_version: recordInteger(draft, "version"),
      };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error); }
}

function emptyDraftDocument(requestedThemeId) {
  const themeId = String(requestedThemeId || DEFAULT_PROMO_THEME_ID).trim();
  if (!theme.registryEntry(themeId, DEFAULT_PROMO_THEME_VERSION)) throw codedError("unknown_promo_theme", 400);
  return {
    contract: "promo.site.v2",
    system_catalog_version: "promo.system.v1",
    locales: { default: "", published: [] },
    theme: { theme_id: themeId, version: DEFAULT_PROMO_THEME_VERSION, tokens: {} },
    identity: { public_business_key: "" },
    section_order: [],
    sections: [],
    media_refs: {},
    contact: {
      enabled: false,
      primary_action_key: "",
      secondary_action_keys: [],
      actions: [],
      logo_media_use_key: "",
      qr_media_use_key: "",
    },
    content_by_locale: {},
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function createPromoFoundation(app, actor, store, publicSlug, requestedPlan, requestedThemeId) {
  if (!actor || recordString(actor, "role") !== promo.MASTER_ROLE || recordString(actor, "status") !== "active") {
    throw codedError("unauthorized", 403);
  }
  const storeId = recordId(store);
  const slug = String(publicSlug || "").trim();
  const promoPlan = typeof __hooks === "undefined"
    ? require("./pz_promo_plan_lib.js")
    : require(`${__hooks}/pz_promo_plan_lib.js`);
  const planCode = requestedPlan === undefined ? "free" : String(requestedPlan || "").trim();
  const imageQuota = promoPlan.imageLimitForPlan(planCode);
  if (!storeId) throw codedError("promo_master_unavailable", 503);
  try { data.assertPublicSlug(slug); } catch (_) { throw codedError("invalid_payload", 400); }
  if (findExact(app, "promo_sites", "store = {:store}", { store: storeId })) throw codedError("store_not_promo", 409);
  if (findExact(app, "promo_sites", "public_slug = {:slug}", { slug })) throw codedError("promo_public_slug_exists", 409);

  const site = new Record(app.findCollectionByNameOrId("promo_sites"), {});
  site.set("store", storeId);
  site.set("public_slug", slug);
  site.set("status", "draft");
  site.set("contract_version", 1);
  site.set("created_by", recordId(actor));
  site.set("updated_by", recordId(actor));
  app.save(site);

  const entitlement = new Record(app.findCollectionByNameOrId("promo_site_entitlements"), {});
  entitlement.set("site", recordId(site));
  entitlement.set("source", "contract");
  promo.PROMO_BOOLEAN_CAPABILITY_KEYS.forEach((key) => entitlement.set(
    key, Object.prototype.hasOwnProperty.call(DEFAULT_PROMO_CAPABILITIES, key)
      ? DEFAULT_PROMO_CAPABILITIES[key]
      : false,
  ));
  promo.PROMO_NUMERIC_CAPABILITY_KEYS.forEach((key) => entitlement.set(key, 0));
  ["max_services", "max_locales", "max_videos", "max_storage_bytes"].forEach((key) => {
    entitlement.set(key, DEFAULT_PROMO_CAPABILITIES[key]);
  });
  entitlement.set("max_gallery_assets", imageQuota);
  entitlement.set("updated_by", recordId(actor));
  app.save(entitlement);

  const document = pubcfg.validatePromoDocument(emptyDraftDocument(requestedThemeId));
  const draft = new Record(app.findCollectionByNameOrId("promo_draft_documents"), {});
  draft.set("site", recordId(site));
  draft.set("schema_version", 1);
  draft.set("document_json", document);
  draft.set("version", 1);
  draft.set("document_sha256", pubcfg.digestDocument(document));
  draft.set("created_by", recordId(actor));
  draft.set("updated_by", recordId(actor));
  app.save(draft);

  const slot = new Record(app.findCollectionByNameOrId("promo_publication_slots"), {});
  slot.set("site", recordId(site));
  slot.set("state", "unpublished");
  slot.set("canonical_mode", "platform");
  slot.set("generation", 0);
  app.save(slot);

  audit.createPromoAudit(app, { actor, site, is_master: true }, {
    action: "promo.site.create",
    resourceType: "promo_site",
    resourceId: recordId(site),
    changedPaths: [],
    previousValues: {},
    newValues: siteAuditSnapshot(site),
    sourceEventKey: `promo.site.create.${recordId(site)}`,
  });
  return Object.freeze({ site, entitlement, draft, slot });
}

function errorCode(error) {
  const code = String(error && (error.code || error.message) || "").trim().slice(0, 80);
  if (SAFE_ERRORS.has(code)) return code;
  return "promo_master_unavailable";
}

function errorStatus(error) {
  const code = errorCode(error);
  if (["store_not_promo", "promo_not_found"].includes(code)) return 404;
  if (["promo_lifecycle_conflict", "promo_lifecycle_validation_failed", "promo_preferences_conflict"].includes(code)) return 409;
  if (["invalid_payload", "invalid_promo_site_transition", "unknown_promo_theme", "invalid_promo_document"].includes(code)) return 400;
  if (code === "promo_master_unavailable") return 503;
  if (Number.isInteger(error && error.status)) return error.status;
  return 403;
}

function sendError(e, error) {
  return e.json(errorStatus(error), { ok: false, error: errorCode(error) });
}

module.exports = {
  CATALOG_READ_CONTRACT,
  CATALOG_RESPONSE_CONTRACT,
  LIFECYCLE_REASON_CODES,
  LIFECYCLE_RESPONSE_CONTRACT,
  LIFECYCLE_UPDATE_CONTRACT,
  PREFERENCES_RESPONSE_CONTRACT,
  PREFERENCES_UPDATE_CONTRACT,
  OVERVIEW_READ_CONTRACT,
  OVERVIEW_RESPONSE_CONTRACT,
  REQUIRED_COLLECTIONS,
  MASTER_LIFECYCLE_TRANSITIONS,
  catalogItem,
  collectionsReady,
  createPromoFoundation,
  emptyDraftDocument,
  errorCode,
  errorStatus,
  exactPayload,
  handleCatalogRead,
  handleLifecycleUpdate,
  handlePreferencesUpdate,
  handleOverviewRead,
  overviewResponse,
  parseLifecycleUpdate,
  parsePreferencesUpdate,
  requireAuthenticatedUser,
  sendError,
  siteProjection,
  slotProjection,
};
