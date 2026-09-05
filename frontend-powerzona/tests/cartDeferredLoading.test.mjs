import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../src/lib/cartRuntimeReady.js');

function runtime(state = 'loading') {
  const events = new Map();
  const window = {};
  const document = { readyState: state, addEventListener: (name, fn) => events.set(name, fn) };
  const context = vm.createContext({ window, document, Promise, Error });
  vm.runInContext(source, context);
  return { window, events, context };
}

test('el catalogo espera ambos motores sin realizar consultas ni cambiar almacenamiento', async () => {
  const r = runtime();
  let ready = false;
  r.window.PZ_CART_RUNTIME_READY.then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  r.window.PZCartLiveValidator = { applyCartValidation() {} };
  r.window.PZPromotions = { loadActivePromotions() {}, loadActiveCoupons() {} };
  r.events.get('DOMContentLoaded')();
  await r.window.PZ_CART_RUNTIME_READY;
  assert.equal(ready, true);
  const first = r.window.PZ_CART_RUNTIME_READY;
  vm.runInContext(source, r.context);
  assert.equal(r.window.PZ_CART_RUNTIME_READY, first, 'instalacion idempotente');
});

test('motor ausente rechaza la espera en vez de permitir omitir la validacion', async () => {
  const r = runtime();
  r.events.get('DOMContentLoaded')();
  await assert.rejects(r.window.PZ_CART_RUNTIME_READY, /dependencias del carrito/);
  const complete = runtime('complete');
  await assert.rejects(complete.window.PZ_CART_RUNTIME_READY, /dependencias del carrito/);
});

test('integracion difiere solo el catalogo y conserva fuentes y URLs antiguas', () => {
  const layout = read('../src/layouts/Layout.astro');
  const cart = read('../src/components/Cart.astro');
  assert.match(layout, /cart-live-validator\.js\?url&no-inline/);
  assert.match(layout, /cart-promotions\.js\?url&no-inline/);
  assert.match(layout, /const deferCartScripts = enablePublicNavigationPrefetch/);
  assert.equal((layout.match(/defer=\{deferCartScripts\}/g) || []).length, 2);
  assert.match(layout, /withCartRuntime\(\(\) => window\.PZPromotions\?\.loadActivePromotions/);
  assert.match(layout, /withCartRuntime\(\(\) => window\.PZPromotions\?\.loadActiveCoupons/);
  assert.match(cart, /await window\.PZ_CART_RUNTIME_READY;\s*const validator = getCartValidator\(\)/);
  assert.match(cart, /force: true, removeUnavailable: true/);
  assert.match(layout, /No se pudo cargar el cupón/);
  assert.ok(read('../public/cart-live-validator.js').includes('window.PZCartLiveValidator ='));
  assert.ok(read('../public/cart-promotions.js').includes('window.PZPromotions ='));
});
