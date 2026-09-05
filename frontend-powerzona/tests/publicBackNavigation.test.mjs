import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getPublicBackPlan } from '../src/lib/publicBackNavigation.ts';

const origin = 'https://tusenda84.com';
const home = origin + '/t/powerzona';
const category = home + '/categoria/proteinas';
const product = home + '/producto/whey';
const entry = (url, index) => ({ key: `entry-${index}`, index, url });
function plan(target, previous = category, current = product) {
  const entries = [entry(previous, 0), entry(current, 1)];
  return getPublicBackPlan(target, current, entries[1], entries);
}

test('reutiliza solo la entrada anterior correspondiente al destino de la misma tienda', () => {
  assert.deepEqual(plan(category), { key: 'entry-0', href: category, categoryAnchor: false });
  assert.ok(plan(category + '/', category));
  assert.ok(plan(home + '/subcategoria/whey', home + '/subcategoria/whey'));
  assert.ok(plan(category, category, home + '/subcategoria/whey'));
  assert.ok(plan(home, home, home + '/buscar'));
  assert.ok(plan(home + '/#categorias', home, home + '/regalos'));
  assert.ok(plan(origin + '/categoria/gym', origin + '/categoria/gym', origin + '/producto/whey'));
});

test('preserva la sección categorías sin crear una nueva entrada de historial', () => {
  for (const previous of [home, home + '/', home + '#categorias', home + '/#categorias']) {
    assert.deepEqual(plan(home + '/#categorias', previous, category), {
      key: 'entry-0', href: home + '/#categorias', categoryAnchor: true,
    });
  }
  assert.equal(plan(home + '/#categorias', home + '#regalos', category), null);
});

test('no salta entradas ni confunde atrás con una navegación padre', () => {
  for (const previous of [home, home + '/categoria/otra', home + '/buscar', product, category + '?orden=precio']) {
    assert.equal(plan(category, previous), null, previous);
  }
  const entries = [entry(category, 0), entry(home + '/buscar', 1), entry(product, 2)];
  assert.equal(getPublicBackPlan(category, product, entries[2], entries), null);
  assert.equal(getPublicBackPlan(category, product, entries[2], [entries[0], entries[2]]), null);
  assert.equal(getPublicBackPlan(category, product, null, entries), null);
  assert.equal(getPublicBackPlan(category, product, entry(product, 0), [entry(product, 0)]), null);
  assert.equal(getPublicBackPlan(category, product, entry(product, 1), [entry(category, 0)]), null);
  assert.equal(getPublicBackPlan(category, product, entry('https://wrong.example', 1), [entry(category, 0), entry(product, 1)]), null);
});

test('rechaza otras tiendas/orígenes, credenciales, rutas privadas y parámetros', () => {
  for (const url of [
    'https://other.example/t/powerzona/categoria/proteinas',
    origin + '/t/otra/categoria/proteinas', origin + '/t/powerzona2/categoria/proteinas',
    origin + '/categoria/proteinas', home + '/admin', home + '/checkout',
    home + '/orden/1/token', origin + '/master', 'javascript:alert(1)',
    home + '/categoria/proteinas?token=private', home + '/categoria/proteinas#otra',
    'https://user:pass@tusenda84.com/t/powerzona/categoria/proteinas',
  ]) assert.equal(plan(url, url), null, url);
  for (const source of [home + '/admin/products', home + '/checkout', home + '/producto/whey?preview=1', origin + '/master']) {
    assert.equal(plan(category, category, source), null, source);
  }
});

test('integración progresiva, sin reemplazar el router ni modificar imágenes o comercio', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const controller = read('../src/lib/publicBackNavigation.ts');
  assert.match(read('../src/layouts/Layout.astro'), /data-pz-public-back=\{enablePublicNavigationPrefetch \? 'true' : undefined\}/);
  assert.match(controller, /a\[data-pz-inner-back\]\[href\]/);
  assert.doesNotMatch(controller.replace(/^\s*\/\/.*$/gm, ''), /document\.referrer|history\.length|localStorage|\.fetch\(|innerHTML|pushState|beforeunload|unload["']/);
  assert.match(read('../public/cart-live-validator.js'), /addEventListener\('pageshow', resetCache\)/);
});
