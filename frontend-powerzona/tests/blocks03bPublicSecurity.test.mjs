import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  publicSecurityProxyDiagnostics,
  publicSecurityProxyHeaders,
  publicSecurityResolverForPath,
  renderPublicUnavailable,
  renderVpnUnavailable,
} from '../src/lib/publicSecurity.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('BLOCKS03B: resuelve rutas públicas por slug o credencial canónica', () => {
  assert.deepEqual(publicSecurityResolverForPath('/t/mi-tienda'), { store_slug: 'mi-tienda' });
  assert.deepEqual(publicSecurityResolverForPath('/t/mi-tienda/producto/cafe'), { store_slug: 'mi-tienda' });
  assert.deepEqual(publicSecurityResolverForPath('/t/mi-tienda/rifa/rifa-1'), { store_slug: 'mi-tienda' });
  assert.deepEqual(publicSecurityResolverForPath('/t/mi-tienda/links/qr.svg'), { store_slug: 'mi-tienda' });
  assert.deepEqual(publicSecurityResolverForPath('/checkout'), { store_slug: 'powerzona' });
  assert.deepEqual(publicSecurityResolverForPath('/'), { store_slug: 'powerzona' });
  assert.deepEqual(publicSecurityResolverForPath('/qr'), { store_slug: 'powerzona' });
  assert.deepEqual(publicSecurityResolverForPath('/regalos'), { store_slug: 'powerzona' });
  assert.deepEqual(publicSecurityResolverForPath('/orden/PZ-84/AbCdEfGhIjKlMnOp'), {
    order_number: 'PZ-84', receipt_token: 'AbCdEfGhIjKlMnOp',
  });
  assert.deepEqual(publicSecurityResolverForPath('/review/order/AbCdEfGhIjKlMnOp'), {
    review_token: 'AbCdEfGhIjKlMnOp',
  });
  assert.deepEqual(publicSecurityResolverForPath('/t/mi-tienda/review/order/AbCdEfGhIjKlMnOp'), {
    review_token: 'AbCdEfGhIjKlMnOp',
  });
  assert.deepEqual(publicSecurityResolverForPath('/api/og/producto/mi-tienda/cafe.png'), { store_slug: 'mi-tienda' });
});

test('BLOCKS03B: admin, master y APIs de mutación quedan fuera del bloqueo de página', () => {
  for (const path of [
    '/admin', '/admin/orders', '/master', '/master/security/store',
    '/t/mi-tienda/admin', '/t/mi-tienda/admin/security', '/login', '/master-login',
    '/api/checkout/orders', '/api/reviews/create', '/api/raffles/enter',
    '/api/analytics/events', '/api/security/track-navigation', '/api/security/register-order',
  ]) {
    assert.equal(publicSecurityResolverForPath(path), null, path);
  }
});

test('BLOCKS03B: página genérica es privada, no-store y no revela bloqueo ni tienda', async () => {
  const response = renderPublicUnavailable();
  const html = await response.text();
  assert.equal(response.status, 404);
  assert.match(response.headers.get('cache-control') || '', /private.*no-store/);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'none'/);
  assert.match(html, /Página no disponible/);
  assert.doesNotMatch(html, /bloque|seguridad|tienda|cliente|hmac|cipher|metadata|motivo|scope/i);
});

test('VPN-PILOT: pagina de rechazo pide desactivar VPN sin revelar proveedor ni senales internas', async () => {
  const response = renderVpnUnavailable('https://shop.example/t/powerzona/producto/cafe?ref=uno&vista=dos');
  const html = await response.text();
  assert.equal(response.status, 403);
  assert.match(response.headers.get('cache-control') || '', /private.*no-store/);
  assert.match(html, /Desactiva la VPN o el proxy/);
  assert.match(html, /href="\/t\/powerzona\/producto\/cafe\?ref=uno&amp;vista=dos"/);
  assert.doesNotMatch(html, /shop\.example/);
  assert.doesNotMatch(html, /ipapi|hmac|metadata|is_vpn|is_proxy|proveedor/i);
});

test('BLOCKS03B: proxy transporta solo cookie propia e IP recibida del runtime', () => {
  const request = new Request('https://shop.example/api/checkout/orders', {
    headers: {
      cookie: `session=secret; pz_client_device=${'A'.repeat(43)}; other=value`,
      'x-forwarded-for': '203.0.113.99',
      authorization: 'Bearer private',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '198.51.100.8');
  assert.equal(headers.Cookie, `pz_client_device=${'A'.repeat(43)}`);
  assert.equal(headers['X-Forwarded-For'], '198.51.100.8');
  assert.equal('Authorization' in headers, false);
  assert.doesNotMatch(JSON.stringify(headers), /session=secret|203\.0\.113\.99|other=value/);
});

test('BLOCKS03B: proxy privado usa la IP publica del extremo derecho de X-Forwarded-For', () => {
  const request = new Request('https://shop.example/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '10.0.1.1, 198.51.100.24',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '10.0.1.1');
  assert.equal(headers['X-Forwarded-For'], '198.51.100.24');
});

test('VPN-PILOT: produccion usa el cliente validado antes del borde IPv4 de Cloudflare', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '198.51.100.24, 104.22.102.50, 10.0.1.1',
      'cf-connecting-ip': '198.51.100.24',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '10.0.1.1');
  assert.equal(headers['X-Forwarded-For'], '198.51.100.24');
});

test('VPN-PILOT: runtime publico IPv4 de Cloudflare usa la IP real confirmada', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '198.51.100.24',
      'cf-connecting-ip': '198.51.100.24',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '104.23.248.93');
  assert.equal(headers['X-Forwarded-For'], '198.51.100.24');
});

test('VPN-PILOT: runtime publico IPv6 de Cloudflare usa la IP real confirmada', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '2001:db8:1234:0:0:0:0:8',
      'cf-connecting-ip': '2001:db8:1234::8',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '2606:4700:3030::6816:6632');
  assert.equal(headers['X-Forwarded-For'], '2001:db8:1234::8');
});

test('VPN-PILOT: runtime Cloudflare con cabeceras discrepantes conserva el borde', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '203.0.113.99',
      'cf-connecting-ip': '198.51.100.24',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '104.23.248.93');
  assert.equal(headers['X-Forwarded-For'], '104.23.248.93');
});

test('VPN-PILOT: produccion ignora IP inyectada antes del cliente confirmado por Cloudflare', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '203.0.113.99, 198.51.100.24, 172.70.35.89, 10.0.1.1',
      'cf-connecting-ip': '198.51.100.24',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '10.0.1.1');
  assert.equal(headers['X-Forwarded-For'], '198.51.100.24');
});

test('VPN-PILOT: no confia en cabeceras Cloudflare falsificadas desde un borde no Cloudflare', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '203.0.113.99, 104.22.102.50, 198.51.100.24, 10.0.1.1',
      'cf-connecting-ip': '203.0.113.99',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '10.0.1.1');
  assert.equal(headers['X-Forwarded-For'], '198.51.100.24');
});

test('VPN-PILOT: discrepancia de Cloudflare conserva el borde derecho como opcion segura', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '203.0.113.99, 104.22.102.50, 10.0.1.1',
      'cf-connecting-ip': '198.51.100.24',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '10.0.1.1');
  assert.equal(headers['X-Forwarded-For'], '104.22.102.50');
});

test('VPN-PILOT: produccion resuelve cliente IPv6 antes del borde IPv6 de Cloudflare', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '2001:db8:1234:0:0:0:0:8, 2606:4700:3030::6816:6632, fd00::1',
      'cf-connecting-ip': '2001:db8:1234::8',
    },
  });
  const headers = publicSecurityProxyHeaders(request, 'fd00::1');
  assert.equal(headers['X-Forwarded-For'], '2001:db8:1234::8');
});

test('VPN-PILOT: cabecera sobredimensionada no sustituye la direccion privada del runtime', () => {
  const request = new Request('https://tusenda84.com/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '198.51.100.24,'.repeat(200),
      'cf-connecting-ip': '198.51.100.24',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '10.0.1.1');
  assert.equal(headers['X-Forwarded-For'], '10.0.1.1');
});

test('BLOCKS03B: cliente publico directo ignora X-Forwarded-For controlado por el usuario', () => {
  const request = new Request('https://shop.example/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '10.0.1.1, 203.0.113.99',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '198.51.100.8');
  assert.equal(headers['X-Forwarded-For'], '198.51.100.8');
});

test('BLOCKS03B: cadena de proxy invalida no sustituye la direccion del runtime', () => {
  const request = new Request('https://shop.example/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': 'forged, 999.999.999.999, 10.0.1.2',
    },
  });
  const headers = publicSecurityProxyHeaders(request, '10.0.1.1');
  assert.equal(headers['X-Forwarded-For'], '10.0.1.1');
});

test('BLOCKS03B: diagnostico de proxy solo devuelve clasificaciones y no valores sensibles', () => {
  const request = new Request('https://shop.example/api/security/track-navigation', {
    headers: {
      'x-forwarded-for': '10.0.1.1, 198.51.100.24:443, forged',
      'x-real-ip': '203.0.113.10',
      'cf-connecting-ip': '198.51.100.30',
      'cf-connecting-ipv6': '2001:db8::10',
      'x-forwarded-host': 'private.example',
      'x-forwarded-proto': 'https',
    },
  });
  const result = publicSecurityProxyDiagnostics(request, '10.0.1.1');

  assert.deepEqual(result, {
    runtime: 'private',
    resolved: 'private',
    resolved_source: 'runtime',
    forwarded_for: {
      present: true,
      oversized: false,
      count: 3,
      classes: ['private', 'invalid', 'invalid'],
      truncated: false,
    },
    x_real_ip: 'public',
    cf_connecting_ip: 'public',
    cf_connecting_ipv6: 'public',
    forwarded_host_present: true,
    forwarded_proto: 'https',
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /10\.0\.1\.1|198\.51\.100\.(?:24|30)|203\.0\.113\.10|2001:db8::10|private\.example/,
  );
});

test('BLOCKS03B: diagnostico temporal exige un host exacto permitido y cabecera explicita', () => {
  const navigationApi = read('../src/pages/api/security/track-navigation.ts');
  assert.match(navigationApi, /STAGING_DIAGNOSTIC_HOST = 'mob76fcvxkxyb8tq0nwys18o\.91\.99\.99\.83\.sslip\.io'/);
  assert.match(navigationApi, /PRODUCTION_DIAGNOSTIC_HOST = 'tusenda84\.com'/);
  assert.match(navigationApi, /PROXY_DIAGNOSTIC_HOSTS\.has\(new URL\(request\.url\)\.hostname\.toLowerCase\(\)\)/);
  assert.doesNotMatch(navigationApi, /hostname\.(?:endsWith|includes)\(/);
  assert.match(navigationApi, /request\.headers\.get\(PROXY_DIAGNOSTIC_HEADER\) === 'classify'/);
  assert.match(navigationApi, /publicSecurityProxyDiagnostics\(request, clientAddress\)/);
  assert.ok(
    navigationApi.indexOf('isAllowedProxyDiagnostic(request)')
      < navigationApi.indexOf("request.headers.get('content-length')"),
  );
});

test('BLOCKS03B: middleware consulta antes de cargar y mantiene excepciones administrativas', () => {
  const middleware = read('../src/middleware.ts');
  const publicHelper = read('../src/lib/publicSecurity.ts');
  assert.match(middleware, /publicSecurityResolverForPath\(pathname\)/);
  assert.match(middleware, /publicAccessDecision\(context\.request, clientAddress, resolver\)/);
  assert.match(middleware, /decision\.reason === 'vpn_or_proxy_detected'[\s\S]*?renderVpnUnavailable\(context\.request\.url\)[\s\S]*?renderPublicUnavailable\(\)/);
  assert.ok(middleware.indexOf('publicSecurityResolverForPath(pathname)') < middleware.indexOf('return next();'));
  assert.match(publicHelper, /\^\\\/t\\\/\[\^\/\]\+\\\/admin/);
  assert.match(publicHelper, /Cache-Control': 'private, no-store/);
});

test('BLOCKS03B: mutaciones públicas usan proxies de mismo origen con destino fijo', () => {
  const checkoutPage = read('../src/pages/checkout.astro');
  const tracker = read('../src/components/StoreAnalyticsTracker.astro');
  const storeHome = read('../src/components/public-store/PublicStoreHome.astro');
  const product = read('../src/pages/producto/[slug].astro');
  const orderReview = read('../src/pages/t/[storeSlug]/review/order/[token].astro');
  const checkoutApi = read('../src/pages/api/checkout/orders.ts');
  const reviewApi = read('../src/pages/api/reviews/create.ts');
  const raffleEnter = read('../src/pages/api/raffles/enter.ts');
  const raffleStatus = read('../src/pages/api/raffles/status.ts');
  const landingClick = read('../src/pages/api/landing-qr/click.ts');
  const analyticsApi = read('../src/pages/api/analytics/events.ts');
  const navigationApi = read('../src/pages/api/security/track-navigation.ts');
  const registerOrderApi = read('../src/pages/api/security/register-order.ts');

  assert.match(checkoutPage, /fetch\('\/api\/checkout\/orders'/);
  assert.match(checkoutPage, /fetch\('\/api\/security\/register-order'/);
  assert.doesNotMatch(checkoutPage, /fetch\(`\$\{POCKETBASE_URL\}\/api\/pz\/checkout\/orders/);
  assert.match(tracker, /const endpoint = '\/api\/analytics\/events'/);
  assert.match(tracker, /const securityEndpoint = '\/api\/security\/track-navigation'/);
  assert.match(storeHome, /fetch\('\/api\/reviews\/create'/);
  assert.match(product, /fetch\('\/api\/reviews\/create'/);
  assert.match(orderReview, /\/api\/reviews\/create\?review_token=/);
  assert.match(checkoutApi, /\$\{baseUrl\}\/api\/pz\/checkout\/orders/);
  assert.match(reviewApi, /\$\{baseUrl\}\/api\/collections\/reviews\/records/);
  assert.match(raffleEnter, /publicSecurityProxyHeaders\(request, clientAddress\)/);
  assert.match(raffleStatus, /publicSecurityProxyHeaders\(request, clientAddress\)/);
  assert.match(landingClick, /publicSecurityProxyHeaders\(request, clientAddress\)/);
  assert.match(landingClick, /api\/collections\/store_analytics_events\/records/);
  assert.match(analyticsApi, /api\/collections\/store_analytics_events\/records/);
  assert.match(navigationApi, /api\/pz\/security\/track-navigation/);
  assert.match(registerOrderApi, /api\/pz\/security\/register-order/);
  for (const proxy of [checkoutApi, reviewApi, analyticsApi, navigationApi, registerOrderApi]) {
    assert.match(proxy, /publicSecurityProxyHeaders\(request, clientAddress\)/);
    assert.doesNotMatch(proxy, /body\.(?:tenant|ip|device)|x-real-ip|authorization/i);
  }
});

test('BLOCKS03B: checkOrigin y SSR seguro permanecen activos', () => {
  const config = read('../astro.config.mjs');
  assert.match(config, /output:\s*'server'/);
  assert.match(config, /checkOrigin:\s*true/);
  assert.doesNotMatch(config, /checkOrigin:\s*false/);
});
