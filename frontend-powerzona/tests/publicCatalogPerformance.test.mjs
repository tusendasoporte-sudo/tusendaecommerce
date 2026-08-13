import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import {
  clearPublicDataCache,
  getCachedPublicData,
  PUBLIC_DATA_CACHE_TTL_MS,
} from '../src/lib/publicDataCache.ts';
import {
  acceptsGzip,
  isPublicCatalogPath,
  optimizePublicCatalogResponse,
} from '../src/lib/publicCatalogResponse.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('cache publico deduplica promesas y separa datos por tienda', async () => {
  clearPublicDataCache();
  let loads = 0;
  const load = async () => {
    loads += 1;
    return { store: 'powerzona', loads };
  };

  const [first, second] = await Promise.all([
    getCachedPublicData('settings:powerzona', load),
    getCachedPublicData('settings:powerzona', load),
  ]);
  const cached = await getCachedPublicData('settings:powerzona', load);
  const otherStore = await getCachedPublicData('settings:otra-tienda', load);

  assert.equal(PUBLIC_DATA_CACHE_TTL_MS, 15_000);
  assert.equal(loads, 2);
  assert.deepEqual(first, second);
  assert.deepEqual(cached, first);
  assert.equal(otherStore.loads, 2);
});

test('cache publico descarta fallos para permitir reintentos', async () => {
  clearPublicDataCache();
  let attempts = 0;
  const load = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporal');
    return 'ok';
  };

  await assert.rejects(getCachedPublicData('retry:key', load), /temporal/);
  assert.equal(await getCachedPublicData('retry:key', load), 'ok');
  assert.equal(attempts, 2);
});

test('optimizacion HTTP solo cubre catalogo publico', () => {
  assert.equal(isPublicCatalogPath('/'), true);
  assert.equal(isPublicCatalogPath('/t/powerzona'), true);
  assert.equal(isPublicCatalogPath('/t/powerzona/categoria/proteinas'), true);
  assert.equal(isPublicCatalogPath('/t/powerzona/subcategoria/mass-gainer'), true);
  assert.equal(isPublicCatalogPath('/t/powerzona/producto/whey'), true);
  assert.equal(isPublicCatalogPath('/t/powerzona/buscar'), true);
  assert.equal(isPublicCatalogPath('/t/powerzona/admin/products'), false);
  assert.equal(isPublicCatalogPath('/t/powerzona/checkout'), false);
  assert.equal(isPublicCatalogPath('/api/checkout/orders'), false);
  assert.equal(acceptsGzip('br, gzip;q=1.0'), true);
  assert.equal(acceptsGzip('gzip;q=0, br'), false);
});

test('respuesta publica agrega cache privado y gzip conservando el HTML', async () => {
  const html = '<!doctype html><html><body>'.concat('catalogo-publico '.repeat(200), '</body></html>');
  const request = new Request('https://example.test/t/powerzona', {
    headers: { 'Accept-Encoding': 'br, gzip' },
  });
  const response = new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

  const optimized = optimizePublicCatalogResponse(request, response, '/t/powerzona');
  const compressed = Buffer.from(await optimized.arrayBuffer());

  assert.equal(optimized.headers.get('Cache-Control'), 'private, max-age=15, stale-while-revalidate=30');
  assert.equal(optimized.headers.get('Content-Encoding'), 'gzip');
  assert.match(optimized.headers.get('Vary') || '', /Accept-Encoding/i);
  assert.equal(gunzipSync(compressed).toString('utf8'), html);
  assert.ok(compressed.byteLength < Buffer.byteLength(html));
});

test('respuesta respeta no-store previo y no comprime rutas privadas', async () => {
  const request = new Request('https://example.test/t/powerzona/checkout', {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  const response = new Response('<html>checkout</html>', {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });

  const optimized = optimizePublicCatalogResponse(request, response, '/t/powerzona/checkout');
  assert.equal(optimized, response);
  assert.equal(optimized.headers.get('Content-Encoding'), null);
  assert.match(optimized.headers.get('Cache-Control') || '', /no-store/);
});

test('integracion conserva seguridad por solicitud y no cachea inventario', () => {
  const middleware = read('../src/middleware.ts');
  const api = read('../src/lib/api.ts');
  const stores = read('../src/lib/stores.ts');

  assert.match(middleware, /publicAccessDecision[\s\S]*const response = await next\(\);[\s\S]*optimizePublicCatalogResponse/);
  assert.match(stores, /getCachedPublicData\(`store:\$\{normalizedSlug\}`/);
  assert.match(api, /getCachedPublicData\(`settings:\$\{storeId\}`/);
  assert.match(api, /getCachedPublicData\(`categories:\$\{storeId\}`/);
  assert.match(api, /getCachedPublicData\(`subcategories:\$\{storeId\}:category:\$\{categoryId\}`/);
  assert.match(api, /getCachedPublicData\(`subcategory:\$\{storeId\}:\$\{slug\}`/);
  assert.match(api, /getCachedPublicData\(`currencies:\$\{storeId\}`/);
  assert.match(api, /getCachedPublicData\(`automatic-promotions:\$\{storeId\}`/);
  assert.doesNotMatch(api, /getCachedPublicData\(`(?:products|homepage-products|gifts):/);
});
