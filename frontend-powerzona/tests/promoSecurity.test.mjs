import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPromoSecurityHeaders,
  isPromoPlatformHostRequest,
  parsePromoRequestHost,
  PROMO_PUBLIC_CSP,
  PromoSecurityError,
  promoRequestAuthority,
  promoSecurityUnavailable,
  validatePromoFrontendRequest,
} from '../src/lib/promoSecurity.ts';

function request(url, options = {}) {
  const parsed = new URL(url);
  const headers = new Headers(options.headers || {});
  if (!headers.has('host')) headers.set('host', parsed.host);
  return new Request(url, { ...options, headers });
}

function rejected(fn, status, code) {
  assert.throws(fn, (error) => error instanceof PromoSecurityError
    && error.status === status && (!code || error.code === code));
}

test('Host es exacto, no usa sufijos ni X-Forwarded-Host como autoridad', () => {
  assert.deepEqual(parsePromoRequestHost('Promo.Example.Test:8443'), {
    hostname: 'promo.example.test', port: 8443, authority: 'promo.example.test:8443',
  });
  assert.equal(parsePromoRequestHost('[2001:db8::1]:8443').hostname, '2001:db8::1');
  for (const poison of [
    '', ' promo.example.test', 'promo.example.test ', 'a.test,b.test', 'https://promo.test',
    'user@promo.test', 'promo.test/path', '*.promo.test', 'promo..test', 'promo.test:0',
    '[:::]',
  ]) rejected(() => parsePromoRequestHost(poison), 421, 'promo_host_unavailable');

  const spoofed = request('https://primary.example.test/', {
    headers: { Host: 'primary.example.test', 'X-Forwarded-Host': 'attacker.example.test' },
  });
  assert.equal(promoRequestAuthority(spoofed).hostname, 'primary.example.test');
  rejected(() => promoRequestAuthority(request('https://primary.example.test/', {
    headers: { Host: 'primary.example.test', 'X-Forwarded-Host': 'a.test,b.test' },
  })), 421);
  rejected(() => promoRequestAuthority(request('https://primary.example.test/', {
    headers: { Host: 'other.example.test' },
  })), 421);
});

test('plataforma permanece exacta y Commerce normal queda fuera de la barrera Promo', () => {
  assert.equal(isPromoPlatformHostRequest(request('https://tusenda84.com/promo/demo/es')), true);
  assert.equal(isPromoPlatformHostRequest(request('https://unknown.91.99.99.83.sslip.io/')), false);
  assert.equal(isPromoPlatformHostRequest(request('https://tusenda84.com.evil.test/')), false);
  assert.deepEqual(validatePromoFrontendRequest(request('https://tusenda84.com/api/admin/orders', {
    method: 'POST', headers: { 'X-Forwarded-Host': 'a.test,b.test' },
  })), { relevant: false, platform: true, hostname: 'tusenda84.com' });
});

test('Origin cubre JSON, puertos, aliases y locales con resolución fail-closed', () => {
  const platformPath = 'https://tusenda84.com/api/admin/promo-cms';
  assert.equal(validatePromoFrontendRequest(request(platformPath, {
    method: 'PUT',
    headers: { Origin: 'https://tusenda84.com', 'Content-Type': 'application/json' },
  })).platform, true);
  for (const origin of ['', 'null', 'https://tusenda84.com.evil.test', 'https://evil.test', 'http://tusenda84.com']) {
    rejected(() => validatePromoFrontendRequest(request(platformPath, {
      method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' },
    })), 403, 'promo_origin_forbidden');
  }
  rejected(() => validatePromoFrontendRequest(request(platformPath, {
    method: 'PUT', headers: { Origin: 'https://tusenda84.com', 'Sec-Fetch-Site': 'cross-site' },
  })), 403);

  assert.equal(validatePromoFrontendRequest(request('https://alias.example.test/api/promo/analytics/host', {
    method: 'POST', headers: { Origin: 'https://alias.example.test', 'Content-Type': 'application/json' },
  })).platform, false);
  assert.equal(validatePromoFrontendRequest(request('https://alias.example.test/es-MX')).relevant, true);
  rejected(() => validatePromoFrontendRequest(request('https://alias.example.test/api/promo/analytics/host', {
    method: 'POST', headers: { Origin: 'https://primary.example.test' },
  })), 403);
  rejected(() => validatePromoFrontendRequest(request('https://alias.example.test/api/admin/promo-cms')), 404);
  rejected(() => validatePromoFrontendRequest(request('https://alias.example.test/api/promo/analytics/sites/store-b', {
    method: 'POST', headers: { Origin: 'https://alias.example.test' },
  })), 404);
  rejected(() => validatePromoFrontendRequest(request('https://tusenda84.com/api/promo/analytics/host', {
    method: 'POST', headers: { Origin: 'https://tusenda84.com' },
  })), 404);
});

test('CSP y errores no reflejan Host, Origin, tenant ni payload', async () => {
  assert.match(PROMO_PUBLIC_CSP, /default-src 'self'/);
  assert.match(PROMO_PUBLIC_CSP, /script-src 'self'/);
  assert.match(PROMO_PUBLIC_CSP, /object-src 'none'/);
  assert.match(PROMO_PUBLIC_CSP, /frame-ancestors 'none'/);
  assert.doesNotMatch(PROMO_PUBLIC_CSP, /unsafe-eval|script-src[^;]*https:/);
  const response = applyPromoSecurityHeaders(new Response('ok'));
  assert.equal(response.headers.get('Content-Security-Policy'), PROMO_PUBLIC_CSP);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');

  const unavailable = promoSecurityUnavailable(new PromoSecurityError('tenant-b-secret', 421), '/api/promo/test');
  assert.equal(unavailable.status, 421);
  const body = await unavailable.text();
  assert.doesNotMatch(body, /tenant-b-secret|primary\.example|Origin/i);
  assert.deepEqual(JSON.parse(body), { ok: false, error: 'promo_host_unavailable' });

  const pageUnavailable = promoSecurityUnavailable(new PromoSecurityError('tenant-b-secret', 421), '/promo/demo/es');
  assert.equal(pageUnavailable.status, 421);
  const pageBody = await pageUnavailable.text();
  assert.match(pageBody, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(pageBody, /<h1>Sitio no disponible<\/h1>/);
  assert.match(pageBody, /No pudimos mostrar este sitio en este momento\./);
  assert.match(pageBody, /place-items:center/);
  assert.doesNotMatch(pageBody, /tenant-b-secret|primary\.example|Origin/i);
});
