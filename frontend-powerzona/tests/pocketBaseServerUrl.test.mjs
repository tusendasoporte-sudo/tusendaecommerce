import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveServerPocketBaseUrl } from '../src/lib/pocketBaseServerUrl.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('proxy SSR prioriza la URL interna valida y normaliza solo al origen', () => {
  assert.equal(
    resolveServerPocketBaseUrl('http://powerzona-pocketbase-staging:8080/', 'https://public.example'),
    'http://powerzona-pocketbase-staging:8080',
  );
});

test('proxy SSR conserva la URL publica cuando la interna no esta configurada', () => {
  assert.equal(
    resolveServerPocketBaseUrl('', 'https://public.example/'),
    'https://public.example',
  );
});

test('proxy SSR falla cerrado si la URL interna configurada es invalida', () => {
  for (const invalid of [
    'ftp://powerzona-pocketbase-staging:8080',
    'http://user:password@powerzona-pocketbase-staging:8080',
    'http://powerzona-pocketbase-staging:8080/private',
    'http://powerzona-pocketbase-staging:8080?redirect=public.example',
    'not-a-url',
  ]) {
    assert.equal(resolveServerPocketBaseUrl(invalid, 'https://public.example'), '', invalid);
  }
});

test('proxies SSR de identidad usan el selector interno', () => {
  const proxies = [
    '../src/pages/api/security/track-navigation.ts',
    '../src/pages/api/security/register-order.ts',
    '../src/pages/api/reviews/create.ts',
    '../src/pages/api/checkout/orders.ts',
    '../src/pages/api/analytics/events.ts',
    '../src/pages/api/raffles/enter.ts',
    '../src/pages/api/raffles/status.ts',
    '../src/pages/api/landing-qr/click.ts',
  ];
  for (const proxy of proxies) {
    const source = read(proxy);
    assert.match(source, /serverPocketBaseUrl\(\)/, proxy);
    assert.doesNotMatch(source, /import\.meta\.env\.PUBLIC_POCKETBASE_URL/, proxy);
  }

  const publicSecurity = read('../src/lib/publicSecurity.ts');
  assert.match(publicSecurity, /const baseUrl = serverPocketBaseUrl\(\)/);
  assert.match(read('../src/lib/pocketbase.ts'), /import\.meta\.env\.PUBLIC_POCKETBASE_URL/);
  assert.match(read('../src/lib/auth.ts'), /import\.meta\.env\.PUBLIC_POCKETBASE_URL/);
});

test('paginas SSR privadas del Master usan la URL interna para llamadas servidor a servidor', () => {
  const masterPages = [
    '../src/pages/master/index.astro',
    '../src/pages/master/mobile-admin.astro',
    '../src/pages/master/notifications.astro',
    '../src/pages/master/price-watch.astro',
    '../src/pages/master/price-watch/[watchId].astro',
    '../src/pages/master/settings.astro',
    '../src/pages/master/stores/index.astro',
    '../src/pages/master/stores/[storeId].astro',
    '../src/pages/master/stores/[storeId]/app.astro',
    '../src/pages/master/stores/[storeId]/plan.astro',
    '../src/pages/master/products/[storeId].astro',
    '../src/pages/master/products/[storeId]/[productId].astro',
    '../src/pages/master/analytics/[storeId].astro',
    '../src/pages/master/analytics/[storeId]/orders/[orderId].astro',
  ];

  for (const page of masterPages) {
    const source = read(page);
    assert.match(source, /serverPocketBaseUrl\(\)/, page);
    assert.doesNotMatch(source, /import\.meta\.env\.PUBLIC_POCKETBASE_URL/, page);
  }
});

test('consultas privadas Master envian el token PocketBase sin prefijo Bearer', () => {
  const clients = [
    '../src/lib/masterStoreOverview.ts',
    '../src/lib/masterStoreProducts.ts',
    '../src/lib/masterStoreAnalytics.ts',
  ];

  for (const client of clients) {
    const source = read(client);
    assert.match(source, /Authorization:\s*authToken/, client);
    assert.doesNotMatch(source, /Authorization:\s*`Bearer \$\{authToken\}`/, client);
  }
});
