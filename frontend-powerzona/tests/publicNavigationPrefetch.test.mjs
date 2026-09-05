import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getPublicPrefetchUrl, canPrefetchPublicNavigation, PUBLIC_PREFETCH_LIMIT } from '../src/lib/publicNavigationPrefetch.ts';
import { getPublicMediaPreconnectOrigin } from '../src/lib/publicMediaUrl.ts';

const origin = 'https://tusenda84.com';
const home = `${origin}/t/powerzona`;

test('precarga solo categorias, subcategorias y productos de la tienda actual', () => {
  for (const section of ['categoria', 'subcategoria', 'producto']) {
    const path = `/t/powerzona/${section}/vitaminas-2`;
    assert.equal(getPublicPrefetchUrl(path, home), origin + path);
    assert.equal(getPublicPrefetchUrl(origin + path, home), origin + path);
    assert.equal(getPublicPrefetchUrl(`${path}/`, home), origin + path + '/');
    assert.equal(getPublicPrefetchUrl(`/${section}/vitaminas-2`, origin + '/'), `${origin}/${section}/vitaminas-2`);
    assert.equal(getPublicPrefetchUrl(path, home + '/buscar?q=vitaminas'), origin + path);
  }
  assert.equal(PUBLIC_PREFETCH_LIMIT, 3);
});

test('no precarga acciones, enlaces privados, externos, tokens ni otras tiendas', () => {
  for (const path of [
    '/t/otra/producto/test', '/t/powerzona2/producto/test', '/producto/test',
    '/t/powerzona/admin/products', '/master', '/login', '/logout', '/api/checkout/orders',
    '/t/powerzona/checkout', '/t/powerzona/regalos', '/t/powerzona/buscar?q=test',
    '/t/powerzona/review/order/private-token', '/orden/number/private-token',
    '/t/powerzona/producto/test?preview=1', '/t/powerzona/producto/test#variant',
    '/t/powerzona/categoria/%2fadmin', '/t/powerzona/producto/test/history',
    'https://other.example/t/powerzona/producto/test', '//other.example/producto/test',
    'https://user:password@tusenda84.com/t/powerzona/producto/test',
    'javascript:alert(1)', 'mailto:test@example.com', '#categorias',
  ]) assert.equal(getPublicPrefetchUrl(path, home), '', path);
});

test('no se activa desde administracion, checkout, recibos, bazar o enlaces de acceso', () => {
  for (const source of ['/master', '/admin/products', '/t/powerzona/admin', '/t/powerzona/checkout', '/checkout', '/login', '/orden/1/token', '/links', '/t/powerzona/review/order/token', '/bazar']) {
    assert.equal(getPublicPrefetchUrl('/t/powerzona/producto/test', origin + source), '', source);
  }
  assert.equal(getPublicPrefetchUrl('/t/powerzona/producto/test', home + '/producto/test'), '');
  assert.equal(getPublicPrefetchUrl('/t/powerzona/producto/test/', home + '/producto/test'), '');
});

test('respeta ahorro de datos, desconexion y conexiones 2G o 3G', () => {
  assert.equal(canPrefetchPublicNavigation(true), true);
  assert.equal(canPrefetchPublicNavigation(true, { effectiveType: '4g' }), true);
  assert.equal(canPrefetchPublicNavigation(false), false);
  for (const effectiveType of ['slow-2g', '2g', '3g']) {
    assert.equal(canPrefetchPublicNavigation(true, { effectiveType }), false);
  }
  assert.equal(canPrefetchPublicNavigation(true, { saveData: true, effectiveType: '4g' }), false);
});

test('conexion de imagenes usa configuracion publica valida y no duplica origenes', () => {
  const api = 'https://api.tusenda84.com';
  const media = 'https://media.tusenda84.com';
  assert.equal(getPublicMediaPreconnectOrigin(media + '/', api, origin), media);
  assert.equal(getPublicMediaPreconnectOrigin('https://cdn.otra-tienda.test', api, origin), 'https://cdn.otra-tienda.test');
  for (const value of ['', undefined, api, origin, 'javascript:alert(1)', 'https://user:pass@cdn.test', 'https://cdn.test/private', 'https://cdn.test/?token=secret', 'https://cdn.test/#token']) {
    assert.equal(getPublicMediaPreconnectOrigin(value, api, origin), '', String(value));
  }
});

test('integracion mantiene Astro, la navegacion normal y las politicas HTTP existentes', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const layout = read('../src/layouts/Layout.astro');
  const controller = read('../src/lib/publicNavigationPrefetch.ts');
  const config = read('../astro.config.mjs');
  assert.match(layout, /!hideStoreFloatingUi && isPublicCatalogPath\(Astro.url.pathname\)/);
  assert.match(layout, /PUBLIC_MEDIA_CDN_URL, pocketbaseUrl, Astro.url.origin/);
  assert.match(layout, /rel="preconnect" href=\{mediaPreconnectOrigin\}/);
  assert.match(layout, /data-pz-public-prefetch=\{enablePublicNavigationPrefetch \? 'true' : undefined\}/);
  assert.match(layout, /import \{ prefetch \} from 'astro:prefetch'/);
  assert.match(layout, /installPublicNavigationPrefetch\(prefetch\)/);
  assert.match(config, /prefetchAll: false/);
  assert.doesNotMatch(config, /clientPrerender:\s*true/);
  assert.doesNotMatch(controller, /preventDefault|localStorage|sessionStorage|\.fetch\(|innerHTML|location\.assign/);
  assert.match(read('../src/lib/publicCatalogResponse.ts'), /private, max-age=15, stale-while-revalidate=30/);
});
