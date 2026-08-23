/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const audit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const domain = typeof __hooks === "undefined"
  ? require("./pz_promo_domain_lib.js")
  : require(`${__hooks}/pz_promo_domain_lib.js`);

const MAX_BINDINGS_PER_SITE = 100;
const SAFE_ERROR_CODES = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan", "promo_not_found",
  "store_not_promo", "store_inactive", "promo_site_inactive", "promo_store_context_required",
  "promo_capability_denied", "promo_permission_denied", "reserved_promo_action", "unknown_promo_action",
  "invalid_payload", "invalid_promo_hostname", "invalid_promo_port", "promo_domain_conflict",
  "promo_domain_not_found", "promo_domain_state_conflict", "invalid_promo_domain_transition",
  "promo_domain_in_use", "promo_domain_limit", "promo_domain_primary_required", "promo_domain_unavailable",
]);

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = Number.isInteger(status) ? status : undefined;
  return error;
}

function safeText(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return Number.isInteger(max) ? result.slice(0, max) : result;
}

function normalizedObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const result = JSON.parse(JSON.stringify(value));
    if (typeof result === "string") {
      const parsed = JSON.parse(result);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    }
    return result && typeof result === "object" && !Array.isArray(result) ? result : null;
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
      return safeText(headers.get(name) || headers.get(String(name).toLowerCase()) || headers.get(normalized), 80);
    }
  } catch (_) {}
  const keys = Object.keys(headers).filter((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === normalized
  ));
  return keys.length === 1 ? safeText(headers[keys[0]], 80) : "";
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
    return [
      "promo_sites", "promo_site_entitlements", "promo_domain_bindings", "promo_publication_slots",
      "promo_revisions", "promo_audit_events",
    ].every((name) => {
      const collection = app.findCollectionByNameOrId(name);
      return collection.listRule === null && collection.viewRule === null
        && collection.createRule === null && collection.updateRule === null && collection.deleteRule === null;
    });
  } catch (_) { return false; }
}

function requestContext(e) {
  setPrivateHeaders(e);
  if (!collectionsReady(e.app)) throw codedError("promo_domain_unavailable", 503);
  if (!e.auth) throw codedError("unauthorized", 403);
  const info = e.requestInfo();
  if (!info || !exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
  return {
    body: normalizedObject(info.body || {}),
    supportStoreId: requestHeader(info, "X-PZ-Promo-Store"),
  };
}

function domainDecision(app, auth, supportStoreId) {
  return promo.requirePromoAction(app, auth, "promo.master.domains.manage", {
    requestedStoreId: supportStoreId,
  });
}

function recordId(record) {
  return promo.recordId(record);
}

function recordString(record, key) {
  return promo.recordString(record, key);
}

function relationId(record, key) {
  return promo.relationId(record, key);
}

function recordInteger(record, key) {
  return promo.recordInteger(record, key);
}

function recordBool(record, key) {
  return promo.recordBool(record, key);
}

function findRecord(app, collection, id) {
  if (!domain.RECORD_ID_PATTERN.test(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRows(app, filter, sort, limit, params) {
  try {
    return Array.from(app.findRecordsByFilter(
      "promo_domain_bindings", filter, sort || "created", limit || 2, 0, params || {},
    ) || []);
  } catch (_) { throw codedError("promo_domain_unavailable", 503); }
}

function currentHostRows(app, hostname) {
  return findRows(app, "hostname_ascii = {:hostname} && is_current = true", "id", 3, { hostname })
    .filter((record) => recordString(record, "hostname_ascii") === hostname && recordBool(record, "is_current"));
}

function currentPrimaryRows(app, siteId) {
  return findRows(
    app,
    "site = {:site} && role = {:role} && is_current = true",
    "id",
    3,
    { site: siteId, role: "primary" },
  ).filter((record) => relationId(record, "site") === siteId
    && recordString(record, "role") === "primary" && recordBool(record, "is_current"));
}

function bindingForDecision(app, decision, bindingId) {
  const binding = findRecord(app, "promo_domain_bindings", bindingId);
  if (!binding || relationId(binding, "site") !== recordId(decision.site)) {
    throw codedError("promo_domain_not_found", 404);
  }
  return binding;
}

function bindingResponse(record, changed) {
  return {
    ok: true,
    contract: domain.DOMAIN_BINDING_CONTRACT,
    changed,
    binding: domain.domainPrivateProjection(record),
  };
}

function parseList(body) {
  return !!body && exactPayload(body, ["contract"])
    && body.contract === domain.DOMAIN_LIST_READ_CONTRACT;
}

function parseCreate(body) {
  if (!body || !exactPayload(body, ["contract", "hostname", "role"])
    || body.contract !== domain.DOMAIN_CREATE_CONTRACT
    || !domain.DOMAIN_ROLES.includes(body.role)) return null;
  let hostname;
  try { hostname = domain.normalizeAuthority(body.hostname, { allowPort: false }); }
  catch (_) { return null; }
  if (domain.isPlatformNamespace(hostname.hostname_ascii)) return null;
  return { hostname, role: body.role };
}

function parseVerify(body) {
  if (!body || !exactPayload(body, [
    "binding_id", "contract", "expected_state_version", "expected_status",
    "verification_evidence_sha256", "verification_method",
  ]) || body.contract !== domain.DOMAIN_VERIFY_CONTRACT
    || !domain.RECORD_ID_PATTERN.test(String(body.binding_id || ""))
    || body.expected_status !== "pending"
    || !Number.isSafeInteger(Number(body.expected_state_version)) || Number(body.expected_state_version) < 1
    || !domain.DOMAIN_VERIFICATION_METHODS.includes(body.verification_method)
    || !domain.SHA256_PATTERN.test(String(body.verification_evidence_sha256 || ""))) return null;
  return {
    bindingId: body.binding_id,
    expectedStateVersion: Number(body.expected_state_version),
    expectedStatus: body.expected_status,
    evidenceSha256: body.verification_evidence_sha256,
    verificationMethod: body.verification_method,
  };
}

function parseStatusUpdate(body) {
  if (!body || !exactPayload(body, [
    "binding_id", "contract", "expected_state_version", "expected_status", "next_status",
  ]) || body.contract !== domain.DOMAIN_STATUS_UPDATE_CONTRACT
    || !domain.RECORD_ID_PATTERN.test(String(body.binding_id || ""))
    || !domain.DOMAIN_STATUSES.includes(body.expected_status)
    || !["active", "paused", "revoked", "released"].includes(body.next_status)
    || !Number.isSafeInteger(Number(body.expected_state_version)) || Number(body.expected_state_version) < 1) return null;
  return {
    bindingId: body.binding_id,
    expectedStateVersion: Number(body.expected_state_version),
    expectedStatus: body.expected_status,
    nextStatus: body.next_status,
  };
}

function handleList(e) {
  try {
    const context = requestContext(e);
    if (!parseList(context.body)) throw codedError("invalid_payload", 400);
    const decision = domainDecision(e.app, e.auth, context.supportStoreId);
    const rows = findRows(
      e.app,
      "site = {:site}",
      "-is_current,role,created",
      MAX_BINDINGS_PER_SITE + 1,
      { site: recordId(decision.site) },
    ).filter((record) => relationId(record, "site") === recordId(decision.site));
    if (rows.length > MAX_BINDINGS_PER_SITE) throw codedError("promo_domain_unavailable", 503);
    return e.json(200, {
      ok: true,
      contract: domain.DOMAIN_CATALOG_CONTRACT,
      bindings: rows.map((record) => domain.domainPrivateProjection(record)),
    });
  } catch (error) { return sendError(e, error); }
}

function createRecord(app, decision, input) {
  const record = new Record(app.findCollectionByNameOrId("promo_domain_bindings"), {});
  record.set("site", recordId(decision.site));
  record.set("hostname_ascii", input.hostname.hostname_ascii);
  record.set("hostname_display", input.hostname.hostname_display);
  record.set("role", input.role);
  record.set("status", "pending");
  record.set("is_current", true);
  record.set("verification_method", "");
  record.set("verification_evidence_sha256", "");
  record.set("provider_reference", "");
  record.set("state_version", 1);
  app.save(record);
  return record;
}

function auditDomain(app, decision, action, binding, previous, paths) {
  const next = domain.domainAuditSnapshot(binding);
  audit.createPromoAudit(app, decision, {
    action,
    resourceType: "promo_domain_binding",
    resourceId: recordId(binding),
    changedPaths: paths || [],
    previousValues: previous || {},
    newValues: next,
    sourceEventKey: `promo.domain.${recordId(binding)}.${next.status}.v${next.state_version}`,
  });
}

function handleCreate(e) {
  let context;
  let input;
  try {
    context = requestContext(e);
    input = parseCreate(context.body);
    if (!input) throw codedError("invalid_payload", 400);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = domainDecision(app, e.auth, context.supportStoreId);
      const existing = currentHostRows(app, input.hostname.hostname_ascii);
      if (existing.length) {
        if (existing.length === 1 && relationId(existing[0], "site") === recordId(decision.site)
          && recordString(existing[0], "role") === input.role
          && recordString(existing[0], "status") === "pending") {
          response = bindingResponse(existing[0], false);
          return;
        }
        throw codedError("promo_domain_conflict", 409);
      }
      if (input.role === "primary" && currentPrimaryRows(app, recordId(decision.site)).length) {
        throw codedError("promo_domain_conflict", 409);
      }
      const siteRows = findRows(
        app,
        "site = {:site}",
        "id",
        MAX_BINDINGS_PER_SITE,
        { site: recordId(decision.site) },
      ).filter((record) => relationId(record, "site") === recordId(decision.site));
      if (siteRows.length >= MAX_BINDINGS_PER_SITE) throw codedError("promo_domain_limit", 409);
      let binding;
      try { binding = createRecord(app, decision, input); }
      catch (error) {
        if (currentHostRows(app, input.hostname.hostname_ascii).length
          || (input.role === "primary" && currentPrimaryRows(app, recordId(decision.site)).length)) {
          throw codedError("promo_domain_conflict", 409);
        }
        throw error;
      }
      auditDomain(app, decision, "promo.domain.create", binding, {}, [
        "/role", "/status", "/is_current", "/state_version",
      ]);
      response = bindingResponse(binding, true);
    });
    return e.json(response.changed ? 201 : 200, response);
  } catch (error) { return sendError(e, error); }
}

function lockBinding(app, bindingId) {
  app.db().newQuery("UPDATE promo_domain_bindings SET id = id WHERE id = {:id}")
    .bind({ id: bindingId })
    .execute();
}

function assertExpected(binding, expectedStatus, expectedVersion) {
  if (recordString(binding, "status") !== expectedStatus
    || recordInteger(binding, "state_version") !== expectedVersion) {
    throw codedError("promo_domain_state_conflict", 409);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function handleVerify(e) {
  let context;
  let input;
  try {
    context = requestContext(e);
    input = parseVerify(context.body);
    if (!input) throw codedError("invalid_payload", 400);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = domainDecision(app, e.auth, context.supportStoreId);
      let binding = bindingForDecision(app, decision, input.bindingId);
      lockBinding(app, recordId(binding));
      binding = bindingForDecision(app, decision, input.bindingId);
      if (recordString(binding, "status") === "verified"
        && recordInteger(binding, "state_version") === input.expectedStateVersion + 1
        && recordString(binding, "verification_method") === input.verificationMethod
        && recordString(binding, "verification_evidence_sha256") === input.evidenceSha256) {
        response = bindingResponse(binding, false);
        return;
      }
      assertExpected(binding, input.expectedStatus, input.expectedStateVersion);
      const previous = domain.domainAuditSnapshot(binding);
      binding.set("status", "verified");
      binding.set("verification_method", input.verificationMethod);
      binding.set("verification_evidence_sha256", input.evidenceSha256);
      binding.set("verified_by", recordId(decision.actor));
      binding.set("verified_at", nowIso());
      binding.set("state_version", input.expectedStateVersion + 1);
      app.save(binding);
      auditDomain(app, decision, "promo.domain.verify", binding, previous, [
        "/status", "/state_version", "/verification_method",
      ]);
      response = bindingResponse(binding, true);
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error); }
}

function publicationSlot(app, siteId) {
  try {
    const rows = Array.from(app.findRecordsByFilter(
      "promo_publication_slots", "site = {:site}", "id", 2, 0, { site: siteId },
    ) || []);
    return rows.length === 1 ? rows[0] : null;
  } catch (_) { throw codedError("promo_domain_unavailable", 503); }
}

function assertNotCanonicalInUse(app, binding) {
  const slot = publicationSlot(app, relationId(binding, "site"));
  if (slot && recordString(slot, "state") === "active"
    && recordString(slot, "canonical_mode") === "custom"
    && relationId(slot, "primary_binding") === recordId(binding)) {
    throw codedError("promo_domain_in_use", 409);
  }
}

function assertAliasHasPrimary(app, binding) {
  if (recordString(binding, "role") !== "alias") return;
  const rows = findRows(
    app,
    "site = {:site} && role = {:role} && is_current = true && status = {:status}",
    "id",
    3,
    { site: relationId(binding, "site"), role: "primary", status: "active" },
  ).filter((record) => relationId(record, "site") === relationId(binding, "site")
    && recordString(record, "role") === "primary"
    && recordString(record, "status") === "active"
    && recordBool(record, "is_current"));
  if (rows.length !== 1) throw codedError("promo_domain_primary_required", 409);
}

function assertStatusTransition(binding, nextStatus) {
  const current = recordString(binding, "status");
  if (!(data.DOMAIN_TRANSITIONS[current] || []).includes(nextStatus)) {
    throw codedError("invalid_promo_domain_transition", 400);
  }
  if (nextStatus === "active" && !["verified", "paused"].includes(current)) {
    throw codedError("invalid_promo_domain_transition", 400);
  }
  if (nextStatus === "paused" && current !== "active") throw codedError("invalid_promo_domain_transition", 400);
  if (nextStatus === "released" && current !== "revoked") throw codedError("invalid_promo_domain_transition", 400);
}

function actionForStatus(status) {
  if (status === "active") return "promo.domain.activate";
  if (status === "paused") return "promo.domain.pause";
  if (status === "revoked") return "promo.domain.revoke";
  if (status === "released") return "promo.domain.release";
  throw codedError("invalid_promo_domain_transition", 400);
}

function transitionBinding(app, binding, nextStatus, expectedVersion) {
  binding.set("status", nextStatus);
  binding.set("state_version", expectedVersion + 1);
  if (nextStatus === "active") binding.set("activated_at", nowIso());
  if (nextStatus === "released") {
    binding.set("is_current", false);
    binding.set("retired_at", nowIso());
  }
  app.save(binding);
  return binding;
}

function handleStatusUpdate(e) {
  let context;
  let input;
  try {
    context = requestContext(e);
    input = parseStatusUpdate(context.body);
    if (!input) throw codedError("invalid_payload", 400);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = domainDecision(app, e.auth, context.supportStoreId);
      let binding = bindingForDecision(app, decision, input.bindingId);
      lockBinding(app, recordId(binding));
      binding = bindingForDecision(app, decision, input.bindingId);
      if (recordString(binding, "status") === input.nextStatus
        && recordInteger(binding, "state_version") === input.expectedStateVersion + 1) {
        response = bindingResponse(binding, false);
        return;
      }
      assertExpected(binding, input.expectedStatus, input.expectedStateVersion);
      if (input.nextStatus === input.expectedStatus) {
        response = bindingResponse(binding, false);
        return;
      }
      assertStatusTransition(binding, input.nextStatus);
      if (input.nextStatus === "active") assertAliasHasPrimary(app, binding);
      if (["paused", "revoked", "released"].includes(input.nextStatus)) assertNotCanonicalInUse(app, binding);
      const previous = domain.domainAuditSnapshot(binding);
      binding = transitionBinding(app, binding, input.nextStatus, input.expectedStateVersion);
      auditDomain(app, decision, actionForStatus(input.nextStatus), binding, previous, [
        "/status", "/is_current", "/state_version",
      ]);
      response = bindingResponse(binding, true);
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error); }
}

function errorCode(error) {
  const code = safeText(error && (error.code || error.message), 80);
  if (SAFE_ERROR_CODES.has(code)) return code;
  if (error instanceof domain.PromoDomainError) return "invalid_payload";
  return "promo_domain_unavailable";
}

function errorStatus(error) {
  const code = errorCode(error);
  if (["promo_domain_conflict", "promo_domain_state_conflict", "promo_domain_in_use", "promo_domain_limit", "promo_domain_primary_required"].includes(code)) return 409;
  if (code === "promo_domain_not_found" || code === "promo_not_found" || code === "store_not_promo") return 404;
  if (["invalid_payload", "invalid_promo_hostname", "invalid_promo_port", "invalid_promo_domain_transition"].includes(code)) return 400;
  if (code === "promo_domain_unavailable") return 503;
  if (Number.isInteger(error && error.status)) return error.status;
  return 403;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(errorStatus(error), { ok: false, error: code });
}

module.exports = {
  MAX_BINDINGS_PER_SITE,
  SAFE_ERROR_CODES,
  assertAliasHasPrimary,
  assertExpected,
  assertNotCanonicalInUse,
  assertStatusTransition,
  bindingResponse,
  collectionsReady,
  currentHostRows,
  currentPrimaryRows,
  domainDecision,
  errorCode,
  errorStatus,
  exactPayload,
  handleCreate,
  handleList,
  handleStatusUpdate,
  handleVerify,
  parseCreate,
  parseList,
  parseStatusUpdate,
  parseVerify,
  requireAuthenticatedUser,
  sendError,
};
