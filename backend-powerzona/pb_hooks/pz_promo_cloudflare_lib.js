/// <reference path="../pb_data/types.d.ts" />

"use strict";

const domain = typeof __hooks === "undefined"
  ? require("./pz_promo_domain_lib.js")
  : require(`${__hooks}/pz_promo_domain_lib.js`);

const CLOUDFLARE_SIMULATE_CONTRACT = "promo.domain.cloudflare.simulate.v1";
const CLOUDFLARE_SIMULATION_RESULT_CONTRACT = "promo.domain.cloudflare.simulation.v1";
const CLOUDFLARE_PROVIDER = "cloudflare";
const CLOUDFLARE_MODE = "simulation";
const SIMULATION_TRANSPORT_KIND = "cloudflare.deterministic-simulation.v1";
const SIMULATION_OPERATIONS = Object.freeze(["prepare", "inspect", "remove"]);
const SIMULATION_STATES = Object.freeze({
  prepare: Object.freeze(["pending", "verified"]),
  inspect: Object.freeze(["pending", "verified", "active", "paused", "revoked"]),
  remove: Object.freeze(["pending", "verified", "paused", "revoked"]),
});
const CLOUDFLARE_PERMISSION_MANIFEST = Object.freeze({
  contract: "promo.domain.cloudflare.permissions.v1",
  provider: CLOUDFLARE_PROVIDER,
  resource_scope: "one_authorized_saas_zone",
  permission_group: "SSL and Certificates",
  access: "Write",
  operations: Object.freeze(["custom_hostname.create", "custom_hostname.read", "custom_hostname.delete"]),
  zone_identifiers: "server_configuration_only",
  excluded_permissions: Object.freeze([
    "account_administration",
    "dns_write",
    "zone_settings_write",
    "cache_purge",
    "workers_write",
  ]),
});
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

class PromoCloudflareError extends Error {
  constructor(code, status) {
    super(code || "promo_cloudflare_simulation_unavailable");
    this.name = "PromoCloudflareError";
    this.code = this.message;
    this.status = Number.isInteger(status) ? status : 400;
  }
}

function fail(code, status) {
  throw new PromoCloudflareError(code, status);
}

function safeText(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return Number.isInteger(max) ? result.slice(0, max) : result;
}

function exactObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value, sha256) {
  if (typeof sha256 !== "function") fail("promo_cloudflare_simulation_unavailable", 503);
  let result = "";
  try { result = safeText(sha256(value)).toLowerCase(); } catch (_) {}
  if (!SHA256_PATTERN.test(result)) fail("promo_cloudflare_simulation_unavailable", 503);
  return result;
}

function assertServerOnly(runtime) {
  if (runtime && runtime.browser === true) fail("promo_cloudflare_server_only", 403);
  if (typeof window !== "undefined" && window && typeof document !== "undefined") {
    fail("promo_cloudflare_server_only", 403);
  }
  return true;
}

function normalizeSimulationInput(input) {
  if (!exactObject(input, [
    "binding_id", "expected_state_version", "expected_status", "hostname", "operation", "role",
  ]) || !domain.RECORD_ID_PATTERN.test(safeText(input.binding_id, 80))
    || !domain.DOMAIN_STATUSES.includes(input.expected_status)
    || !domain.DOMAIN_ROLES.includes(input.role)
    || !SIMULATION_OPERATIONS.includes(input.operation)
    || !Number.isSafeInteger(input.expected_state_version)
    || input.expected_state_version < 1) {
    fail("invalid_payload", 400);
  }
  if (!(SIMULATION_STATES[input.operation] || []).includes(input.expected_status)) {
    fail("promo_cloudflare_operation_denied", 409);
  }
  let hostname;
  try { hostname = domain.normalizeAuthority(input.hostname, { allowPort: false }); }
  catch (_) { fail("invalid_payload", 400); }
  if (hostname.hostname_ascii !== input.hostname || domain.isPlatformNamespace(hostname.hostname_ascii)) {
    fail("invalid_payload", 400);
  }
  return Object.freeze({
    binding_id: input.binding_id,
    expected_state_version: input.expected_state_version,
    expected_status: input.expected_status,
    hostname: hostname.hostname_ascii,
    operation: input.operation,
    role: input.role,
  });
}

function simulatedReference(input, sha256) {
  const material = stableValue({
    contract: CLOUDFLARE_SIMULATE_CONTRACT,
    binding: input.binding_id,
    hostname: input.hostname,
    operation: input.operation,
    state_version: input.expected_state_version,
  });
  return `sim_cf_${digest(material, sha256).slice(0, 24)}`;
}

function buildProviderRequest(input, reference) {
  const common = {
    provider: CLOUDFLARE_PROVIDER,
    mode: CLOUDFLARE_MODE,
    required_permission: "SSL and Certificates Write",
  };
  if (input.operation === "prepare") {
    return Object.freeze({
      ...common,
      action: "custom_hostname.create",
      method: "POST",
      path_template: "/client/v4/zones/:authorized_zone_id/custom_hostnames",
      body: Object.freeze({
        hostname: input.hostname,
        ssl: Object.freeze({
          method: "txt",
          type: "dv",
          wildcard: false,
          settings: Object.freeze({ min_tls_version: "1.2" }),
        }),
      }),
    });
  }
  const action = input.operation === "inspect" ? "custom_hostname.read" : "custom_hostname.delete";
  return Object.freeze({
    ...common,
    action,
    method: input.operation === "inspect" ? "GET" : "DELETE",
    path_template: `/client/v4/zones/:authorized_zone_id/custom_hostnames/${reference}`,
    body: null,
  });
}

function validateProviderRequest(request) {
  if (!request || request.provider !== CLOUDFLARE_PROVIDER || request.mode !== CLOUDFLARE_MODE
    || !["GET", "POST", "DELETE"].includes(request.method)
    || !safeText(request.path_template, 300).startsWith("/client/v4/zones/:authorized_zone_id/custom_hostnames")
    || request.required_permission !== "SSL and Certificates Write"
    || Object.prototype.hasOwnProperty.call(request, "headers")) {
    fail("promo_cloudflare_simulation_unavailable", 503);
  }
  return true;
}

function createDeterministicSimulationTransport(options) {
  const settings = options || {};
  const sha256 = settings.sha256;
  return Object.freeze({
    kind: SIMULATION_TRANSPORT_KIND,
    execute(request, input) {
      validateProviderRequest(request);
      const reference = simulatedReference(input, sha256);
      return Object.freeze({
        ok: true,
        provider: CLOUDFLARE_PROVIDER,
        mode: CLOUDFLARE_MODE,
        simulation_reference: reference,
        request_fingerprint: digest(stableValue(request), sha256).slice(0, 24),
        hostname_status: "not_executed",
        certificate_status: "not_executed",
        dns_status: "not_executed",
        ingress_status: "not_executed",
      });
    },
  });
}

function projectSimulation(input, request, result) {
  if (!result || result.ok !== true || result.mode !== CLOUDFLARE_MODE
    || !/^sim_cf_[a-f0-9]{24}$/.test(safeText(result.simulation_reference, 40))
    || !/^[a-f0-9]{24}$/.test(safeText(result.request_fingerprint, 24))) {
    fail("promo_cloudflare_simulation_unavailable", 503);
  }
  return Object.freeze({
    ok: true,
    contract: CLOUDFLARE_SIMULATION_RESULT_CONTRACT,
    provider: CLOUDFLARE_PROVIDER,
    mode: CLOUDFLARE_MODE,
    operation: input.operation,
    simulation_reference: result.simulation_reference,
    request_fingerprint: result.request_fingerprint,
    binding: Object.freeze({
      binding_id: input.binding_id,
      hostname_ascii: input.hostname,
      role: input.role,
      status: input.expected_status,
      state_version: input.expected_state_version,
    }),
    permission_manifest: CLOUDFLARE_PERMISSION_MANIFEST,
    provider_request: request,
    provider_state: Object.freeze({
      hostname: result.hostname_status,
      certificate: result.certificate_status,
      dns: result.dns_status,
      ingress: result.ingress_status,
    }),
    deferred: Object.freeze({
      live_transport: true,
      cloudflare_account_connection: true,
      ownership_verification: true,
      dns_change: true,
      certificate_activation: true,
      ingress_change: true,
      staging_or_production: true,
    }),
  });
}

function createCloudflareServerClient(options) {
  const settings = options || {};
  assertServerOnly(settings.runtime);
  if (settings.mode !== CLOUDFLARE_MODE) fail("promo_cloudflare_live_disabled", 403);
  if (!settings.transport || settings.transport.kind !== SIMULATION_TRANSPORT_KIND
    || typeof settings.transport.execute !== "function") {
    fail("promo_cloudflare_live_disabled", 403);
  }
  return Object.freeze({
    simulate(input) {
      const normalized = normalizeSimulationInput(input);
      const reference = simulatedReference(normalized, settings.sha256);
      const request = buildProviderRequest(normalized, reference);
      const result = settings.transport.execute(request, normalized);
      return projectSimulation(normalized, request, result);
    },
  });
}

module.exports = {
  CLOUDFLARE_MODE,
  CLOUDFLARE_PERMISSION_MANIFEST,
  CLOUDFLARE_PROVIDER,
  CLOUDFLARE_SIMULATE_CONTRACT,
  CLOUDFLARE_SIMULATION_RESULT_CONTRACT,
  PromoCloudflareError,
  SIMULATION_OPERATIONS,
  SIMULATION_STATES,
  SIMULATION_TRANSPORT_KIND,
  assertServerOnly,
  buildProviderRequest,
  createCloudflareServerClient,
  createDeterministicSimulationTransport,
  normalizeSimulationInput,
  projectSimulation,
  simulatedReference,
  validateProviderRequest,
};
