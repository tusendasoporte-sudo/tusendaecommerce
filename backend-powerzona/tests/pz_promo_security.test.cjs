'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const security = require('../pb_hooks/pz_promo_security_lib.js');

function requestEvent(options = {}) {
  const values = new Map();
  for (const [name, raw] of Object.entries(options.headers || {})) {
    values.set(name.toLowerCase(), Array.isArray(raw) ? raw.map(String) : [String(raw)]);
  }
  if (!values.has('host')) values.set('host', [options.host || 'tusenda84.com']);
  const responseHeaders = new Map();
  const responseHeader = { set: (name, value) => responseHeaders.set(name.toLowerCase(), String(value)) };
  const method = options.method || 'GET';
  const host = options.host || values.get('host')[0];
  return {
    request: {
      method,
      host,
      url: { path: options.path || '/api/pz/promo/public/v1/shell/sites/demo' },
      header: {
        values: (name) => (values.get(String(name).toLowerCase()) || []).slice(),
        get: (name) => (values.get(String(name).toLowerCase()) || [])[0] || '',
      },
    },
    response: { header: () => responseHeader },
    requestInfo: () => ({ method, headers: {} }),
    remoteIP: () => options.remoteIP || '203.0.113.10',
    next: () => ({ next: true, headers: responseHeaders }),
    json: (status, body) => ({ status, body, headers: responseHeaders }),
  };
}

test('Host y Origin rechazan poison, sufijos, listas y puertos ambiguos', () => {
  assert.deepEqual(security.parseRequestHost('Promo.Example.Test:8443'), {
    hostname: 'promo.example.test', port: 8443, authority: 'promo.example.test:8443',
  });
  for (const poison of [
    '', ' promo.test', 'promo.test ', 'a.test,b.test', 'https://promo.test', 'user@promo.test',
    'promo.test/path', '*.promo.test', 'promo..test', 'promo.test:0', 'promo.test:65536',
    '[:::]',
  ]) assert.throws(() => security.parseRequestHost(poison), security.PromoSecurityError, poison);
  assert.equal(security.parseRequestHost('[2001:db8::1]:8443').hostname, '2001:db8::1');

  assert.equal(security.validateOrigin({
    method: 'POST', path: '/api/pz/promo/private/v1/draft/update', host: '127.0.0.1:8090',
    origin: 'https://tusenda84.com',
  }).origin, 'https://tusenda84.com');
  assert.equal(security.validateOrigin({
    method: 'POST', path: '/api/pz/promo/public/v1/analytics/host/events', host: 'promo.example.test:443',
    origin: 'https://promo.example.test',
  }).origin, 'https://promo.example.test');
  for (const origin of ['null', 'https://promo.example.test.evil.test', 'https://evil.test', 'http://promo.example.test']) {
    assert.throws(() => security.validateOrigin({
      method: 'POST', path: '/api/pz/promo/public/v1/analytics/host/events',
      host: 'promo.example.test', origin,
    }), (error) => error.code === 'promo_origin_forbidden' && error.status === 403, origin);
  }
  assert.throws(() => security.validateOrigin({
    method: 'POST', path: '/api/pz/promo/private/v1/draft/update', host: 'tusenda84.com',
    origin: 'https://tusenda84.com', fetchSite: 'cross-site',
  }), /promo_origin_forbidden/);
});

test('middleware cubre collector landing_qr_open, Host y XFH sin confiar en cabeceras proxy', () => {
  security.resetRateLimits();
  const accepted = security.enforceRequest(requestEvent({
    method: 'POST',
    path: '/api/pz/promo/public/v1/analytics/sites/store-a/events',
    headers: { Host: 'tusenda84.com', Origin: 'https://tusenda84.com', 'Content-Type': 'application/json' },
  }));
  assert.equal(accepted.next, true);
  assert.match(accepted.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(accepted.headers.get('content-security-policy'), /unsafe-eval/);

  const missingOrigin = security.enforceRequest(requestEvent({
    method: 'POST', path: '/api/pz/promo/public/v1/analytics/sites/store-a/events',
    headers: { Host: 'tusenda84.com', 'Content-Type': 'application/json' },
  }));
  assert.equal(missingOrigin.next, true);

  const crossOrigin = security.enforceRequest(requestEvent({
    method: 'POST', path: '/api/pz/promo/public/v1/analytics/sites/store-a/events',
    headers: { Host: 'tusenda84.com', Origin: 'https://evil.example', 'Content-Type': 'application/json' },
  }));
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(crossOrigin.body, { ok: false, error: 'promo_origin_forbidden' });

  const wrongType = security.enforceRequest(requestEvent({
    method: 'POST', path: '/api/pz/promo/public/v1/analytics/sites/store-a/events',
    headers: { Host: 'tusenda84.com', Origin: 'https://tusenda84.com', 'Content-Type': 'text/plain' },
  }));
  assert.equal(wrongType.status, 400);
  assert.deepEqual(wrongType.body, { ok: false, error: 'invalid_payload' });

  const spoofed = security.enforceRequest(requestEvent({
    path: '/api/pz/promo/public/v1/shell/host', host: 'primary.example.test',
    headers: { Host: 'primary.example.test', 'X-Forwarded-Host': 'store-b.test,store-c.test' },
  }));
  assert.equal(spoofed.status, 421);
  assert.deepEqual(spoofed.body, { ok: false, error: 'promo_host_unavailable' });
});

test('rate limiting es proporcional, acotado y clasifica toda ruta Promo registrada', () => {
  assert.equal(security.ratePolicy('/api/pz/promo/public/v1/analytics/host/events', 'POST').id, 'public_collect');
  assert.equal(security.ratePolicy('/api/pz/promo/public/v1/sites/demo/media/hero/digest/file.webp', 'GET').id, 'public_media');
  assert.equal(security.ratePolicy('/api/pz/promo/private/v1/media/upload', 'POST').id, 'private_write');
  assert.equal(security.ratePolicy('/api/pz/promo/private/v1/draft/read', 'POST').id, 'private_read');
  assert.equal(security.ratePolicy('/api/pz/promo/private/v1/draft/update', 'POST').id, 'private_write');
  assert.equal(security.ratePolicy('/api/pz/promo/private/v1/publication/publish', 'POST').id, 'critical_write');
  assert.ok(security.RATE_POLICIES.critical_write.limit < security.RATE_POLICIES.private_write.limit);
  assert.ok(security.RATE_POLICIES.private_write.limit < security.RATE_POLICIES.public_read.limit);
  assert.ok(security.RATE_POLICIES.public_read.limit < security.RATE_POLICIES.public_media.limit);

  security.resetRateLimits();
  const policy = security.RATE_POLICIES.critical_write;
  assert.equal(security.consumeRateLimit(policy, 'peer|tenant|route', 1_000, 2).allowed, true);
  assert.equal(security.consumeRateLimit(policy, 'peer|tenant|route', 1_001, 2).allowed, true);
  const blocked = security.consumeRateLimit(policy, 'peer|tenant|route', 1_002, 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 60);
  assert.equal(security.consumeRateLimit(policy, 'peer|tenant|route', 61_001, 2).allowed, true);

  const hooks = path.join(__dirname, '..', 'pb_hooks');
  const routes = fs.readdirSync(hooks).filter((name) => /^pz_promo.*\.pb\.js$/.test(name))
    .flatMap((name) => {
      const source = fs.readFileSync(path.join(hooks, name), 'utf8');
      return Array.from(source.matchAll(/routerAdd\(\s*"([A-Z]+)"\s*,\s*"(\/api\/pz\/promo\/[^"]+)"/g),
        (match) => ({ file: name, method: match[1], route: match[2] }));
    });
  assert.ok(routes.length >= 45);
  for (const route of routes) assert.ok(security.ratePolicy(route.route, route.method), `${route.file}: ${route.route}`);
});

test('contrato está global antes de permisos y conserva checkOrigin sin IP reenviada', () => {
  const hook = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_security.pb.js'), 'utf8');
  const lib = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_security_lib.js'), 'utf8');
  const astro = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend-powerzona', 'astro.config.mjs'), 'utf8');
  assert.match(hook, /routerUse\(new Middleware/);
  assert.match(hook, /-950/);
  assert.match(lib, /e\.remoteIP\(\)/);
  assert.doesNotMatch(lib, /\.realIP\(\)|X-Forwarded-For/);
  assert.match(astro, /checkOrigin:\s*true/);
  assert.doesNotMatch(astro, /checkOrigin:\s*false/);
});
