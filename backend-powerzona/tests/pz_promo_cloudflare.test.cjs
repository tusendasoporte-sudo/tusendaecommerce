'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const audit = require('../pb_hooks/pz_promo_audit_lib.js');
const api = require('../pb_hooks/pz_promo_cloudflare_api_lib.js');
const cloudflare = require('../pb_hooks/pz_promo_cloudflare_lib.js');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const BASE_INPUT = Object.freeze({
  binding_id: 'bindaaaaaaaaaaa',
  expected_state_version: 3,
  expected_status: 'verified',
  hostname: 'shop.example.test',
  operation: 'prepare',
  role: 'primary',
});

function client() {
  const transport = cloudflare.createDeterministicSimulationTransport({ sha256 });
  return cloudflare.createCloudflareServerClient({ mode: 'simulation', sha256, transport });
}

function record(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] ?? ''); },
  };
}

test('cliente Cloudflare server-only es determinista y prepara solo un descriptor no ejecutado', () => {
  const first = client().simulate(BASE_INPUT);
  const replay = client().simulate({ ...BASE_INPUT });
  assert.deepEqual(first, replay);
  assert.equal(first.contract, 'promo.domain.cloudflare.simulation.v1');
  assert.equal(first.mode, 'simulation');
  assert.equal(first.provider_request.method, 'POST');
  assert.equal(first.provider_request.action, 'custom_hostname.create');
  assert.equal(first.provider_request.body.hostname, 'shop.example.test');
  assert.deepEqual(first.provider_request.body.ssl, {
    method: 'txt', type: 'dv', wildcard: false, settings: { min_tls_version: '1.2' },
  });
  assert.deepEqual(first.provider_state, {
    hostname: 'not_executed', certificate: 'not_executed', dns: 'not_executed', ingress: 'not_executed',
  });
  assert.equal(Object.values(first.deferred).every(Boolean), true);
  assert.notEqual(
    first.simulation_reference,
    client().simulate({ ...BASE_INPUT, expected_state_version: 4 }).simulation_reference,
  );
});

test('inspect/remove generan descriptores mínimos sin activar ni eliminar recursos', () => {
  const inspect = client().simulate({ ...BASE_INPUT, operation: 'inspect' });
  const remove = client().simulate({ ...BASE_INPUT, operation: 'remove' });
  assert.equal(inspect.provider_request.method, 'GET');
  assert.equal(inspect.provider_request.body, null);
  assert.equal(remove.provider_request.method, 'DELETE');
  assert.equal(remove.provider_request.body, null);
  assert.equal(inspect.provider_state.hostname, 'not_executed');
  assert.equal(remove.provider_state.hostname, 'not_executed');
  const serialized = JSON.stringify({ inspect, remove });
  for (const forbidden of [
    'Authorization', 'Bearer ', 'api_key', 'access_token', 'validation_records',
    'provider_reference', 'site_id', 'store_id', 'account_id',
  ]) assert.equal(serialized.includes(forbidden), false, `simulación excluye ${forbidden}`);
});

test('boundary rechaza modo live, browser y transportes no simulados', () => {
  assert.throws(() => cloudflare.createCloudflareServerClient({
    mode: 'live', sha256, transport: cloudflare.createDeterministicSimulationTransport({ sha256 }),
  }), /promo_cloudflare_live_disabled/);
  assert.throws(() => cloudflare.createCloudflareServerClient({
    mode: 'simulation', sha256, transport: { kind: 'http', execute() {} },
  }), /promo_cloudflare_live_disabled/);
  assert.throws(() => cloudflare.createCloudflareServerClient({
    mode: 'simulation', sha256,
    transport: cloudflare.createDeterministicSimulationTransport({ sha256 }),
    runtime: { browser: true },
  }), /promo_cloudflare_server_only/);
});

test('normalización reutiliza DOM-CORE y falla cerrada por estado, plataforma o payload extra', () => {
  assert.equal(client().simulate({
    ...BASE_INPUT, hostname: 'xn--maana-pta.example',
  }).binding.hostname_ascii, 'xn--maana-pta.example');
  for (const input of [
    { ...BASE_INPUT, hostname: 'Mañana.Example.' },
    { ...BASE_INPUT, hostname: 'shop.example.test:443' },
    { ...BASE_INPUT, hostname: 'admin.tusenda84.com' },
    { ...BASE_INPUT, expected_status: 'active' },
    { ...BASE_INPUT, operation: 'remove', expected_status: 'active' },
    { ...BASE_INPUT, store_id: 'storeaaaaaaaaaa' },
  ]) assert.throws(() => client().simulate(input), /invalid_payload|operation_denied/);
});

test('manifiesto limita el futuro token a SSL/certificados en una sola zona y excluye DNS', () => {
  assert.deepEqual(cloudflare.CLOUDFLARE_PERMISSION_MANIFEST, {
    contract: 'promo.domain.cloudflare.permissions.v1',
    provider: 'cloudflare',
    resource_scope: 'one_authorized_saas_zone',
    permission_group: 'SSL and Certificates',
    access: 'Write',
    operations: ['custom_hostname.create', 'custom_hostname.read', 'custom_hostname.delete'],
    zone_identifiers: 'server_configuration_only',
    excluded_permissions: [
      'account_administration', 'dns_write', 'zone_settings_write', 'cache_purge', 'workers_write',
    ],
  });
});

test('contrato HTTP es exacto y no acepta tenant, zona, credencial o filtros del cliente', () => {
  const body = {
    binding_id: 'bindaaaaaaaaaaa',
    contract: 'promo.domain.cloudflare.simulate.v1',
    expected_state_version: 3,
    expected_status: 'verified',
    mode: 'simulation',
    operation: 'prepare',
  };
  assert.deepEqual(api.parseSimulation(body), {
    bindingId: 'bindaaaaaaaaaaa', expectedStateVersion: 3, expectedStatus: 'verified', operation: 'prepare',
  });
  for (const injected of [
    'store_id', 'site_id', 'zone_id', 'account_id', 'provider_reference', 'api_token',
    'filter', 'sort', 'fields', 'expand', 'hostname',
  ]) assert.equal(api.parseSimulation({ ...body, [injected]: 'attacker' }), null);
  assert.equal(api.parseSimulation({ ...body, mode: 'live' }), null);
  assert.equal(api.parseSimulation({ ...body, expected_state_version: '3' }), null);
  assert.equal(api.parseSimulation({ ...body, contract: 'promo.domain.cloudflare.live.v1' }), null);
});

test('AUDIT registra las tres simulaciones con snapshot allowlisted sin hostname o proveedor', () => {
  const decision = {
    actor: record('useraaaaaaaaaaa', { role: 'master_admin', display_name: 'Master' }),
    site: record('siteaaaaaaaaaaa'),
    is_master: true,
  };
  for (const [operation, action] of Object.entries(api.ACTION_BY_OPERATION)) {
    assert.ok(audit.ACTION_CATALOG[action]);
    const values = audit.buildPromoAuditValues(decision, {
      action,
      resourceType: 'promo_domain_binding',
      resourceId: 'bindaaaaaaaaaaa',
      changedPaths: [],
      previousValues: {},
      newValues: {
        role: 'primary', status: 'verified', is_current: true, state_version: 3, verification_method: 'dns',
      },
      sourceEventKey: `promo.domain.cf.${operation}.bindaaaaaaaaaaa.v3`,
    });
    assert.equal(values.module, 'domain');
    assert.equal(values.severity, 'critical');
    assert.deepEqual(values.changed_paths_json, []);
    const serialized = JSON.stringify(values);
    for (const forbidden of ['shop.example.test', 'provider_reference', 'challenge', 'token']) {
      assert.equal(serialized.includes(forbidden), false, `AUDIT excluye ${forbidden}`);
    }
  }
});

test('hook registra una sola ruta privada POST y el módulo no contiene transporte externo o secretos', () => {
  const hooks = path.join(__dirname, '..', 'pb_hooks');
  const route = fs.readFileSync(path.join(hooks, 'pz_promo_cloudflare.pb.js'), 'utf8');
  const lib = fs.readFileSync(path.join(hooks, 'pz_promo_cloudflare_lib.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(hooks, 'pz_promo_cloudflare_api_lib.js'), 'utf8');
  assert.deepEqual(
    [...route.matchAll(/"(\/api\/pz\/promo\/[^\"]+)"/g)].map((match) => match[1]),
    ['/api/pz/promo/private/v1/domains/cloudflare/simulate'],
  );
  assert.equal((route.match(/\$apis\.requireAuth\(\)/g) || []).length, 1);
  assert.equal((route.match(/\$apis\.bodyLimit\(/g) || []).length, 1);
  assert.doesNotMatch(route, /routerAdd\(\s*"(?:GET|PATCH|DELETE)"|\/public\//);
  assert.match(apiSource, /"promo\.master\.domains\.manage"|domainApi\.domainDecision/);
  assert.match(apiSource, /createPromoAudit/);
  assert.doesNotMatch(`${lib}\n${apiSource}`, /\bfetch\s*\(|XMLHttpRequest|https\.request|process\.env|\$os\.getenv|Authorization\s*:/);
});
