'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const performance = require('../pb_hooks/pz_promo_performance_lib.js');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function identity(overrides = {}, hash = sha256) {
  return performance.generationCacheIdentity({
    canonicalHost: 'tusenda84.com',
    tenantId: 'siteaaaaaaaaaaa',
    generation: 7,
    locale: 'es',
    themeId: 'promo.black-gold',
    themeVersion: '1.0.0',
    publicPath: '/promo/demo-promo/es',
    representation: performance.HTML_REPRESENTATION,
    ...overrides,
  }, hash);
}

test('cache generation-aware separa cada dimensión pública contractual', () => {
  const base = identity();
  assert.equal(base.contract, 'promo.public.cache.v2');
  assert.match(base.key, /^[a-f0-9]{64}$/);
  const variants = [
    identity({ canonicalHost: 'primary.example.test' }),
    identity({ tenantId: 'sitebbbbbbbbbbb' }),
    identity({ generation: 8 }),
    identity({ locale: 'en' }),
    identity({ themeVersion: '1.0.1' }),
    identity({ publicPath: '/promo/demo-promo/en' }),
  ];
  assert.equal(new Set([base.key, ...variants.map((item) => item.key)]).size, variants.length + 1);
});

test('cache falla cerrada ante host, tenant, generación, tema, ruta o representación ambiguos', () => {
  for (const overrides of [
    { canonicalHost: 'evil.test/path' },
    { tenantId: 'short' },
    { generation: 0 },
    { locale: 'es?tenant=b' },
    { themeVersion: 'latest' },
    { publicPath: '//evil.test/es' },
    { representation: 'application/json' },
  ]) assert.throws(() => identity(overrides), performance.PromoPerformanceError);
  assert.throws(() => identity({}, () => ''), performance.PromoPerformanceError);
});

test('módulo PERF no depende de Cloudflare, DNS, secretos ni Commerce', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_performance_lib.js'), 'utf8');
  assert.doesNotMatch(source, /cloudflare|dns|token|secret|products|orders|cart|checkout/i);
  assert.match(source, /generation|theme|locale|representation/i);
  assert.doesNotMatch(source, /revisionId/);
});
