/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const audit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const domain = typeof __hooks === "undefined"
  ? require("./pz_promo_domain_lib.js")
  : require(`${__hooks}/pz_promo_domain_lib.js`);
const domainApi = typeof __hooks === "undefined"
  ? require("./pz_promo_domain_api_lib.js")
  : require(`${__hooks}/pz_promo_domain_api_lib.js`);
const cloudflare = typeof __hooks === "undefined"
  ? require("./pz_promo_cloudflare_lib.js")
  : require(`${__hooks}/pz_promo_cloudflare_lib.js`);

const ACTION_BY_OPERATION = Object.freeze({
  prepare: "promo.domain.cloudflare.prepare.simulate",
  inspect: "promo.domain.cloudflare.inspect.simulate",
  remove: "promo.domain.cloudflare.remove.simulate",
});
const SAFE_ERROR_CODES = new Set([
  ...domainApi.SAFE_ERROR_CODES,
  "promo_cloudflare_live_disabled", "promo_cloudflare_server_only",
  "promo_cloudflare_operation_denied", "promo_cloudflare_simulation_unavailable",
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

function requestContext(e) {
  setPrivateHeaders(e);
  if (!domainApi.collectionsReady(e.app)) throw codedError("promo_domain_unavailable", 503);
  if (!e.auth) throw codedError("unauthorized", 403);
  const info = e.requestInfo();
  if (!info || !exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
  return {
    body: normalizedObject(info.body || {}),
    supportStoreId: requestHeader(info, "X-PZ-Promo-Store"),
  };
}

function parseSimulation(body) {
  if (!body || !exactPayload(body, [
    "binding_id", "contract", "expected_state_version", "expected_status", "mode", "operation",
  ]) || body.contract !== cloudflare.CLOUDFLARE_SIMULATE_CONTRACT
    || body.mode !== cloudflare.CLOUDFLARE_MODE
    || !domain.RECORD_ID_PATTERN.test(String(body.binding_id || ""))
    || !domain.DOMAIN_STATUSES.includes(body.expected_status)
    || !cloudflare.SIMULATION_OPERATIONS.includes(body.operation)
    || !Number.isSafeInteger(body.expected_state_version)
    || body.expected_state_version < 1) return null;
  return Object.freeze({
    bindingId: body.binding_id,
    expectedStateVersion: body.expected_state_version,
    expectedStatus: body.expected_status,
    operation: body.operation,
  });
}

function findBinding(app, decision, bindingId) {
  let binding = null;
  try { binding = app.findRecordById("promo_domain_bindings", bindingId); } catch (_) {}
  if (!binding || promo.relationId(binding, "site") !== promo.recordId(decision.site)) {
    throw codedError("promo_domain_not_found", 404);
  }
  return binding;
}

function lockBinding(app, bindingId) {
  app.db().newQuery("UPDATE promo_domain_bindings SET id = id WHERE id = {:id}")
    .bind({ id: bindingId })
    .execute();
}

function assertBinding(binding, input) {
  if (!promo.recordBool(binding, "is_current")
    || promo.recordString(binding, "status") !== input.expectedStatus
    || promo.recordInteger(binding, "state_version") !== input.expectedStateVersion) {
    throw codedError("promo_domain_state_conflict", 409);
  }
  const hostname = promo.recordString(binding, "hostname_ascii");
  let normalized;
  try { normalized = domain.normalizeAuthority(hostname, { allowPort: false }); }
  catch (_) { throw codedError("promo_cloudflare_simulation_unavailable", 503); }
  if (normalized.hostname_ascii !== hostname || domain.isPlatformNamespace(hostname)
    || !domain.DOMAIN_ROLES.includes(promo.recordString(binding, "role"))) {
    throw codedError("promo_cloudflare_simulation_unavailable", 503);
  }
  if (!(cloudflare.SIMULATION_STATES[input.operation] || []).includes(input.expectedStatus)) {
    throw codedError("promo_cloudflare_operation_denied", 409);
  }
  return hostname;
}

function sha256(value) {
  let result = "";
  try { result = safeText($security.sha256(value)).toLowerCase(); } catch (_) {}
  if (!domain.SHA256_PATTERN.test(result)) throw codedError("promo_cloudflare_simulation_unavailable", 503);
  return result;
}

function simulationClient() {
  const transport = cloudflare.createDeterministicSimulationTransport({ sha256 });
  return cloudflare.createCloudflareServerClient({
    mode: cloudflare.CLOUDFLARE_MODE,
    sha256,
    transport,
  });
}

function auditSimulation(app, decision, binding, operation) {
  const action = ACTION_BY_OPERATION[operation];
  const snapshot = domain.domainAuditSnapshot(binding);
  audit.createPromoAudit(app, decision, {
    action,
    resourceType: "promo_domain_binding",
    resourceId: promo.recordId(binding),
    changedPaths: [],
    previousValues: {},
    newValues: snapshot,
    sourceEventKey: `promo.domain.cf.${operation}.${promo.recordId(binding)}.v${snapshot.state_version}`,
  });
  return action;
}

function handleSimulate(e) {
  let context;
  let input;
  try {
    context = requestContext(e);
    input = parseSimulation(context.body);
    if (!input) throw codedError("invalid_payload", 400);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = domainApi.domainDecision(app, e.auth, context.supportStoreId);
      let binding = findBinding(app, decision, input.bindingId);
      lockBinding(app, promo.recordId(binding));
      binding = findBinding(app, decision, input.bindingId);
      const hostname = assertBinding(binding, input);
      const simulation = simulationClient().simulate({
        binding_id: promo.recordId(binding),
        expected_state_version: input.expectedStateVersion,
        expected_status: input.expectedStatus,
        hostname,
        operation: input.operation,
        role: promo.recordString(binding, "role"),
      });
      const action = auditSimulation(app, decision, binding, input.operation);
      const finalBinding = findBinding(app, decision, input.bindingId);
      assertBinding(finalBinding, input);
      response = {
        ...simulation,
        audit: Object.freeze({ recorded: true, action }),
      };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error); }
}

function errorCode(error) {
  const code = safeText(error && (error.code || error.message), 100);
  if (SAFE_ERROR_CODES.has(code)) return code;
  if (error instanceof cloudflare.PromoCloudflareError) return "promo_cloudflare_simulation_unavailable";
  return "promo_cloudflare_simulation_unavailable";
}

function errorStatus(error) {
  const code = errorCode(error);
  if (["promo_domain_state_conflict", "promo_cloudflare_operation_denied"].includes(code)) return 409;
  if (["promo_domain_not_found", "promo_not_found", "store_not_promo"].includes(code)) return 404;
  if (code === "invalid_payload") return 400;
  if (code === "promo_cloudflare_simulation_unavailable" || code === "promo_domain_unavailable") return 503;
  if (Number.isInteger(error && error.status)) return error.status;
  return 403;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(errorStatus(error), { ok: false, error: code });
}

module.exports = {
  ACTION_BY_OPERATION,
  SAFE_ERROR_CODES,
  assertBinding,
  errorCode,
  errorStatus,
  findBinding,
  handleSimulate,
  parseSimulation,
  requireAuthenticatedUser,
  sendError,
  simulationClient,
};
