const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const domain = require('../pb_hooks/pz_promo_domain_lib.js');
const api = require('../pb_hooks/pz_promo_domain_api_lib.js');

function record(id, values = {}) {
  return { id, ...values };
}

function fixture(options = {}) {
  const ids = {
    siteA: 'siteaaaaaaaaaaa',
    siteB: 'sitebbbbbbbbbbb',
    storeA: 'storeaaaaaaaaaa',
    storeB: 'storebbbbbbbbbb',
    entitlementA: 'entaaaaaaaaaaaa',
    primaryA: 'bindprimaryaaaa',
    aliasA: 'bindaliasaaaaaa',
    primaryB: 'bindprimarybbbb',
    slotA: 'slotaaaaaaaaaaa',
    revisionA: 'revaaaaaaaaaaaa',
  };
  const primary = record(ids.primaryA, {
    site: ids.siteA,
    hostname_ascii: 'primary.example.test',
    hostname_display: 'primary.example.test',
    role: 'primary', status: options.primaryStatus || 'active', is_current: true,
    verification_method: 'manual', state_version: 3,
  });
  const alias = record(ids.aliasA, {
    site: ids.siteA,
    hostname_ascii: 'alias.example.test',
    hostname_display: 'alias.example.test',
    role: 'alias', status: options.aliasStatus || 'active', is_current: true,
    verification_method: 'dns', state_version: 3,
  });
  const collections = {
    promo_domain_bindings: [primary, alias],
    promo_sites: [record(ids.siteA, {
      store: ids.storeA, public_slug: 'promo-a', status: options.siteStatus || 'active', contract_version: 1,
    })],
    stores: [record(ids.storeA, { status: options.storeStatus || 'active' })],
    promo_site_entitlements: [record(ids.entitlementA, {
      site: ids.siteA, source: 'contract', promo_site_enabled: options.promoEnabled !== false,
      custom_domain_enabled: options.domainEnabled !== false,
    })],
    promo_publication_slots: [record(ids.slotA, {
      site: ids.siteA, state: options.slotState || 'active', canonical_mode: options.canonicalMode || 'custom',
      primary_binding: options.primaryId || ids.primaryA, published_revision: ids.revisionA, generation: 4,
    })],
    promo_revisions: [record(ids.revisionA, { site: ids.siteA, schema_version: 1 })],
  };
  const app = {
    findRecordById(collection, id) {
      const found = (collections[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params = {}) {
      let rows = (collections[collection] || []).slice();
      if (Object.hasOwn(params, 'hostname')) rows = rows.filter((item) => item.hostname_ascii === params.hostname);
      if (Object.hasOwn(params, 'site')) rows = rows.filter((item) => item.site === params.site);
      return rows.slice(0, limit);
    },
  };
  return { app, collections, ids, primary, alias };
}

test('DOM-CORE normaliza autoridad, puerto, punto final e IDN A-label de forma determinista', () => {
  assert.deepEqual(domain.normalizeAuthority('Shop.Example.COM.:443', { allowPort: true }), {
    hostname_ascii: 'shop.example.com', hostname_display: 'shop.example.com', port: 443,
  });
  const unicode = domain.normalizeAuthority('Mañana.Example.', { allowPort: true });
  assert.deepEqual(unicode, {
    hostname_ascii: 'xn--maana-pta.example', hostname_display: 'mañana.example', port: null,
  });
  assert.deepEqual(domain.normalizeAuthority('XN--MAANA-PTA.EXAMPLE', { allowPort: false }), unicode);
  assert.equal(domain.punycodeDecode(domain.punycodeEncode('mañana')), 'mañana');
});

test('DOM-CORE rechaza autoridad ambigua, puertos inválidos, IP, wildcard, paths y A-label corrupto', () => {
  for (const [value, options] of [
    ['example.test:0', { allowPort: true }],
    ['example.test:65536', { allowPort: true }],
    ['example.test:443', { allowPort: false }],
    ['example.test/path', { allowPort: true }],
    ['user@example.test', { allowPort: true }],
    ['*.example.test', { allowPort: true }],
    ['127.0.0.1', { allowPort: true }],
    ['127.1', { allowPort: true }],
    ['example.test..', { allowPort: true }],
    ['ab--cd.example', { allowPort: true }],
    ['xn--invalid-.example', { allowPort: true }],
    [' example.test', { allowPort: true }],
  ]) assert.throws(() => domain.normalizeAuthority(value, options), domain.PromoDomainError, value);
});

test('DOM-CORE solo acepta X-Forwarded-Host desde un peer declarado confiable y nunca listas ambiguas', () => {
  const untrusted = domain.selectAuthoritativeHost({
    Host: 'primary.example.test:8443',
    'X-Forwarded-Host': 'attacker.example.test',
  }, { trustedProxy: false });
  assert.equal(untrusted.hostname_ascii, 'primary.example.test');
  assert.equal(untrusted.source, 'host');
  assert.equal(untrusted.port, 8443);

  const trusted = domain.selectAuthoritativeHost({
    Host: 'origin.internal.example',
    'X-Forwarded-Host': 'Alias.Example.Test.:443',
  }, {
    trustedProxy: true,
    proxyContract: domain.TRUSTED_PROXY_CONTRACT,
    remotePeer: '10.20.30.40',
    trustedProxyPeers: ['10.20.30.40'],
  });
  assert.equal(trusted.hostname_ascii, 'alias.example.test');
  assert.equal(trusted.source, 'x-forwarded-host');
  for (const options of [
    { trustedProxy: true },
    {
      trustedProxy: true,
      proxyContract: domain.TRUSTED_PROXY_CONTRACT,
      remotePeer: '10.20.30.41',
      trustedProxyPeers: ['10.20.30.40'],
    },
    {
      trustedProxy: true,
      proxyContract: domain.TRUSTED_PROXY_CONTRACT,
      remotePeer: '10.20.30.40',
      trustedProxyPeers: ['10.20.30.0/24'],
    },
  ]) assert.throws(
    () => domain.selectAuthoritativeHost({ Host: 'origin.internal.example' }, options),
    (error) => error.status === 421,
  );
  const trustedOptions = {
    trustedProxy: true,
    proxyContract: domain.TRUSTED_PROXY_CONTRACT,
    remotePeer: '10.20.30.40',
    trustedProxyPeers: ['10.20.30.40'],
  };
  for (const headers of [
    { Host: 'primary.example.test', 'X-Forwarded-Host': 'a.example.test,b.example.test' },
    { Host: 'primary.example.test', 'X-Forwarded-Host': '' },
    { Host: ['a.example.test', 'b.example.test'] },
  ]) assert.throws(
    () => domain.selectAuthoritativeHost(headers, trustedOptions),
    (error) => error.code === 'invalid_promo_host_header' && error.status === 421,
  );
});

test('DOM-CORE resuelve primary exacto a un solo tenant y proyecta ruta pública allowlisted', () => {
  const { app, ids } = fixture();
  const resolved = domain.resolveHostBindingContext(app, { Host: 'PRIMARY.EXAMPLE.TEST.:443' }, {
    trustedProxy: false,
    platformHosts: ['tusenda84.com', 'api.tusenda84.com'],
  });
  assert.equal(resolved.site_id, ids.siteA);
  assert.equal(resolved.generation, 4);
  assert.equal(resolved.binding_role, 'primary');
  assert.deepEqual(domain.projectHostRoute({ ...resolved, projection: {} }), {
    ok: true,
    contract: 'promo.domain.route.v1',
    action: 'serve',
    host: 'primary.example.test',
    canonical_host: 'primary.example.test',
    site: { public_slug: 'promo-a' },
  });
  const serialized = JSON.stringify(domain.projectHostRoute({ ...resolved, projection: {} }));
  for (const forbidden of [ids.siteA, ids.storeA, ids.revisionA, 'generation', 'entitlement', 'binding_id']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('DOM-CORE resuelve alias exacto únicamente hacia el primary activo del mismo site', () => {
  const { app } = fixture();
  const resolved = domain.resolveHostBindingContext(app, { Host: 'alias.example.test' }, {});
  const route = domain.projectHostRoute({ ...resolved, projection: {} });
  assert.equal(route.action, 'redirect');
  assert.equal(route.canonical_host, 'primary.example.test');
  assert.equal(route.host, 'alias.example.test');
});

test('DOM-CORE falla 421 cerrado para unknown, suffix, estados inválidos y cruces de primary', () => {
  for (const [headers, options] of [
    [{ Host: 'unknown.example.test' }, {}],
    [{ Host: 'primary.example.test.evil' }, {}],
    [{ Host: 'primary.example.test' }, { siteStatus: 'paused' }],
    [{ Host: 'primary.example.test' }, { storeStatus: 'paused' }],
    [{ Host: 'primary.example.test' }, { domainEnabled: false }],
    [{ Host: 'primary.example.test' }, { canonicalMode: 'platform' }],
    [{ Host: 'alias.example.test' }, { primaryStatus: 'paused' }],
  ]) {
    const { app } = fixture(options);
    assert.throws(
      () => domain.resolveHostBindingContext(app, headers, {}),
      (error) => error.code === 'promo_host_unavailable' && error.status === 421,
      JSON.stringify({ headers, options }),
    );
  }

  const crossed = fixture();
  crossed.primary.site = crossed.ids.siteB;
  assert.throws(
    () => domain.resolveHostBindingContext(crossed.app, { Host: 'alias.example.test' }, {}),
    (error) => error.code === 'promo_host_unavailable' && error.status === 421,
  );
  assert.throws(
    () => domain.resolveHostBindingContext(fixture().app, { Host: 'tusenda84.com' }, {}),
    (error) => error.code === 'promo_platform_host' && error.status === 421,
  );
});

test('DOM-CORE no sirve por Host sin validar el contrato PUBCFG publicado completo', () => {
  const { app } = fixture();
  assert.doesNotThrow(() => domain.resolveHostBindingContext(app, { Host: 'primary.example.test' }, {}));
  assert.throws(
    () => domain.resolveHostContext(app, { Host: 'primary.example.test' }, {}),
    (error) => error.code === 'promo_host_unavailable' && error.status === 421,
  );
});

test('DOM-CORE mantiene payloads privados exactos y bloquea tenancy, secretos o provider input', () => {
  assert.equal(api.parseList({ contract: 'promo.domain.list.read.v1' }), true);
  assert.equal(api.parseList({ contract: 'promo.domain.list.read.v1', filter: '*' }), false);
  assert.deepEqual(api.parseCreate({
    contract: 'promo.domain.create.v1', hostname: 'Mañana.Example.', role: 'primary',
  }), {
    hostname: { hostname_ascii: 'xn--maana-pta.example', hostname_display: 'mañana.example', port: null },
    role: 'primary',
  });
  for (const extra of ['store_id', 'site_id', 'provider_reference', 'verification_token', 'filter']) {
    assert.equal(api.parseCreate({
      contract: 'promo.domain.create.v1', hostname: 'safe.example.test', role: 'alias', [extra]: 'x',
    }), null);
  }
  assert.equal(api.parseCreate({
    contract: 'promo.domain.create.v1', hostname: 'api.tusenda84.com', role: 'primary',
  }), null);
  assert.ok(api.parseVerify({
    contract: 'promo.domain.verify.v1', binding_id: 'bindprimaryaaaa', expected_status: 'pending',
    expected_state_version: 1, verification_method: 'dns', verification_evidence_sha256: 'a'.repeat(64),
  }));
  assert.equal(api.parseVerify({
    contract: 'promo.domain.verify.v1', binding_id: 'bindprimaryaaaa', expected_status: 'pending',
    expected_state_version: 1, verification_method: 'dns', verification_evidence_sha256: 'raw-challenge',
  }), null);
  assert.ok(api.parseStatusUpdate({
    contract: 'promo.domain.status.update.v1', binding_id: 'bindprimaryaaaa',
    expected_status: 'verified', expected_state_version: 2, next_status: 'active',
  }));
});

test('DOM-CORE limita respuesta privada y auditoría a campos allowlisted', () => {
  const binding = record('bindprimaryaaaa', {
    site: 'siteaaaaaaaaaaa', hostname_ascii: 'safe.example.test', hostname_display: 'safe.example.test',
    role: 'primary', status: 'verified', is_current: true, verification_method: 'dns', state_version: 2,
    verification_evidence_sha256: 'a'.repeat(64), provider_reference: 'provider-secret-like-value',
    verified_by: 'useraaaaaaaaaaa', verified_at: '2026-08-23T12:00:00Z', activated_at: '', retired_at: '',
  });
  const projected = JSON.stringify(domain.domainPrivateProjection(binding));
  assert.equal(projected.includes('provider-secret-like-value'), false);
  assert.equal(projected.includes('a'.repeat(64)), false);
  assert.equal(projected.includes('siteaaaaaaaaaaa'), false);
  assert.deepEqual(domain.domainAuditSnapshot(binding), {
    role: 'primary', status: 'verified', is_current: true, state_version: 2, verification_method: 'dns',
  });
});

test('DOM-CORE detecta de forma exacta el primary current reservado por sitio', () => {
  const { app, ids } = fixture();
  const rows = api.currentPrimaryRows(app, ids.siteA);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, ids.primaryA);
  assert.equal(api.currentPrimaryRows(app, ids.siteB).length, 0);
});

test('DOM-CORE no pausa, revoca o libera el primary que aún gobierna el slot custom', () => {
  const { app, primary, alias } = fixture();
  assert.throws(
    () => api.assertNotCanonicalInUse(app, primary),
    (error) => error.code === 'promo_domain_in_use' && error.status === 409,
  );
  assert.doesNotThrow(() => api.assertNotCanonicalInUse(app, alias));
});

test('DOM-CORE registra solo rutas privadas Master y no implementa Cloudflare, DNS, publish o shell', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_domain.pb.js'), 'utf8');
  assert.match(source, /\/api\/pz\/promo\/private\/v1\/domains\/list/);
  assert.match(source, /\/api\/pz\/promo\/private\/v1\/domains\/create/);
  assert.match(source, /\/api\/pz\/promo\/private\/v1\/domains\/verify/);
  assert.match(source, /\/api\/pz\/promo\/private\/v1\/domains\/status\/update/);
  assert.equal((source.match(/routerAdd\(/g) || []).length, 4);
  assert.doesNotMatch(source, /public\/v1|Cloudflare|Coolify|DNS|publish|rollback|shell/i);
});
