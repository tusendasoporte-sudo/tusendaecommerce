import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const astroConfig = read('../astro.config.mjs');
const middleware = read('../src/middleware.ts');
const sidebar = read('../src/components/admin/AdminSidebar.astro');
const dashboard = read('../src/pages/admin/index.astro');
const orders = read('../src/pages/admin/orders.astro');
const shipping = read('../src/pages/admin/shipping.astro');

test('el middleware comparte autenticacion, tienda y permisos durante la misma peticion', () => {
  assert.match(middleware, /context\.locals\.adminAuthPb = authPb/);
  assert.match(middleware, /context\.locals\.adminContext = adminContext/);
  assert.match(middleware, /context\.locals\.storeAccessContext = storeAccess/);
  assert.match(middleware, /Server-Timing/);
  assert.match(middleware, /pz-admin-total/);

  [dashboard, orders, shipping].forEach((source) => {
    assert.match(source, /Astro\.locals\.adminAuthPb/);
    assert.match(source, /Astro\.locals\.adminContext/);
    assert.match(source, /Astro\.locals\.storeAccessContext/);
    assert.match(source, /storeAccessContext=\{storeAccessContext\}/);
  });
});

test('el piloto precarga solo resumen, pedidos y envios sin convertir formularios en SPA', () => {
  assert.match(astroConfig, /prefetchAll:\s*false/);
  assert.match(sidebar, /const fastAdminNavigationPaths = new Set/);
  assert.match(sidebar, /adminOverviewPath/);
  assert.match(sidebar, /adminOrdersPath/);
  assert.match(sidebar, /adminShippingPath/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminOverviewPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminOrdersPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminShippingPath\)\}/);
  assert.match(sidebar, /mobile \? 'tap' : 'hover'/);
  assert.doesNotMatch(sidebar, /ClientRouter/);
});
