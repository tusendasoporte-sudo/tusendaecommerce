import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { chromium } from 'playwright';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const layout = read('../src/layouts/Layout.astro');
const cart = read('../src/components/Cart.astro');
const ready = read('../src/lib/cartRuntimeReady.js');
const scripts = Array.from(layout.matchAll(/<script define:vars=\{\{[^]*?\}\}>([^]*?)<\/script>/g), m => m[1]);
const storage = scripts.find(s => s.includes('function migrateLegacyCart'));
const promotions = scripts.find(s => s.includes('window.PZ_PROMOTIONS_READY ='));
const cartScript = cart.match(/<script define:vars=\{\{ storeInitials \}\}>([^]*?)<\/script>/)[1];
const cartMarkup = cart.replace(/^---[^]*?---/, '').split('<script define:vars=')[0];
const engines = ['cart-live-validator', 'cart-promotions'].map(name => {
  const body = read('../public/' + name + '.js');
  return { body, path: `/_astro/${name}.${createHash('sha256').update(body).digest('hex').slice(0, 8)}.js` };
});
const script = body => `<script>(()=>{${body}\n})();</script>`;

test('carrito real: HTML temprano, clic antes de cargar, cupones, fallos, stock y aislamiento', async t => {
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find(path => path && existsSync(path));
  if (!executablePath) return t.skip('No hay Chromium del sistema disponible.');
  assert.ok(storage && promotions);
  const requests = [];
  const engineRequests = [];
  const gates = new Map();
  const products = new Map();
  const product = { id: 'product1', name: 'Producto de prueba', active: true, base_price_usd: 10,
    regular_price_usd: 10, stock: 4, track_stock: true, allow_preorder: false,
    category: '', subcategory: '', only_usd: false, delivery_mode: 'both', has_variations: false, images: [] };
  let origin;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const engine = engines.find(e => url.pathname === e.path);
    if (engine) {
      engineRequests.push(url.pathname + url.search);
      const mode = url.searchParams.get('mode');
      if (mode?.startsWith('hold')) await gates.get(mode)?.promise;
      if ((mode === 'fail' && engine === engines[0]) || (mode === 'fail-promotions' && engine === engines[1])) {
        res.writeHead(503); res.end('unavailable'); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' });
      res.end(engine.body); return;
    }
    requests.push({ method: req.method, path: url.pathname, filter: url.searchParams.get('filter') });
    if (url.pathname.startsWith('/api/collections/')) {
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname.includes('/products/records/')) {
        const item = products.get(url.pathname.split('/').at(-1)) || product;
        const store = new URL(req.headers.referer || origin).pathname.split('/')[2] || 'powerzona';
        res.end(JSON.stringify({ ...item, store })); return;
      }
      if (url.pathname.includes('/automatic_promotions/')) {
        res.end(JSON.stringify({ items: [{ id: 'promo1', active: true, type: 'product_discount',
          product: 'product1', discount_type: 'percentage', discount_value: 10 }] })); return;
      }
      if (url.pathname.includes('/manual_coupons/')) {
        res.end(JSON.stringify({ items: [{ id: 'coupon1', code: 'AHORRA', active: true,
          scope: 'cart', discount_type: 'percentage', discount_value: 5, unlimited_uses: true }] })); return;
      }
      res.end(JSON.stringify({ items: [] })); return;
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const store = url.pathname.split('/')[2] || 'powerzona';
    const prefix = `/t/${store}`;
    const checkout = url.pathname.endsWith('/checkout');
    const legacy = url.searchParams.get('legacy') === '1';
    const deferred = !checkout && !legacy;
    const mode = url.searchParams.get('mode') || 'fast';
    const vars = `const currentStoreId=${JSON.stringify(store)},currentStoreSlug=${JSON.stringify(store)},publicPathPrefix=${JSON.stringify(prefix)},pocketbaseUrl=${JSON.stringify(origin)};`;
    const tag = i => `<script src="${engines[i].path}?mode=${mode}" ${deferred ? 'defer' : ''}></script>`;
    const probe = checkout ? script(`window.checkoutHadValidator=!!window.PZCartLiveValidator;`) : '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><style>.hidden{display:none}.translate-x-full{transform:translateX(110%)}#cart-sidebar{background:white;padding:16px}#cart-floating-btn{position:relative}button{padding:8px}body{font-family:Arial}img,svg{max-width:48px}</style></head><body>
      ${script(vars + storage)}${deferred ? script(ready) : ''}${tag(0)}
      <main><h1>Catálogo listo</h1><a href="${prefix}/categoria/prueba">Categoría de prueba</a><button id="early-cart" onclick="document.getElementById('cart-floating-btn').click()">Abrir carrito</button>${probe}</main>
      ${tag(1)}${script(vars + promotions)}${cartMarkup}${script('const storeInitials="PZ";' + cartScript)}
      </body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { for (const gate of gates.values()) gate.release(); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const errors = [];
  async function makePage(store = 'powerzona', options = {}) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, ...options });
    await context.addInitScript(({ store }) => {
      localStorage.setItem(`tusenda84_cart_${store}`, JSON.stringify([{ id: 'product1', title: 'Producto de prueba',
        price: 10, regular_price_usd: 10, quantity: 1, stock: 4, track_stock: true,
        category: '', subcategory: '', only_usd: false, delivery_mode: 'both', store_id: store }]));
      localStorage.setItem(`powerzona_saved_coupons_${store}`, '["AHORRA"]');
    }, { store });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    return page;
  }
  function hold(name) {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    gates.set(name, { promise, release });
    return release;
  }

  await t.test('el contenido aparece con los motores retenidos y una compra temprana espera validacion', async t => {
    const release = hold('hold-new');
    t.after(release);
    const page = await makePage();
    await page.goto(origin + '/t/powerzona?mode=hold-new', { waitUntil: 'commit' });
    await page.getByRole('heading', { name: 'Catálogo listo' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Abrir carrito', exact: true }).click();
    await page.locator('#checkout-btn').click();
    await page.getByRole('button', { name: 'Actualizando carrito...' }).waitFor();
    assert.equal(requests.some(r => r.path.includes('/products/records/')), false);
    assert.ok(!page.url().endsWith('/checkout'));
    release();
    await page.waitForLoadState('load');
    await page.waitForFunction(() => document.getElementById('checkout-btn').textContent === 'Hacer el pedido' || location.pathname.endsWith('/checkout'));
    assert.ok(requests.some(r => r.path.includes('/products/records/product1')));
    if (!page.url().endsWith('/checkout')) await page.locator('#checkout-btn').click();
    await page.waitForURL(origin + '/t/powerzona/checkout');
    assert.equal(await page.evaluate(() => window.checkoutHadValidator), true);
    assert.equal(await page.evaluate(() => typeof window.PZ_CART_RUNTIME_READY), 'undefined');
    await page.close();
  });

  await t.test('control anterior bloquea el HTML con el mismo recurso retenido', async t => {
    const release = hold('hold-old');
    t.after(release);
    const page = await makePage();
    await page.goto(origin + '/t/powerzona?mode=hold-old&legacy=1', { waitUntil: 'commit' });
    await page.waitForFunction(() => !!document.querySelector('script[src]'));
    assert.equal(await page.locator('h1').count(), 0);
    release();
    await page.waitForLoadState('load');
    assert.equal(await page.locator('h1').textContent(), 'Catálogo listo');
    await page.close();
  });

  await t.test('promociones y cupones se cargan una vez con aislamiento por tienda', async () => {
    const page = await makePage('otra', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const start = requests.length;
    await page.goto(origin + '/t/otra?coupon=AHORRA');
    await page.getByRole('heading', { name: 'Cupón ya listo' }).waitFor();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    assert.ok(!page.url().includes('coupon='));
    await page.waitForFunction(() => document.getElementById('cart-total').textContent === '$9.00 USD');
    await page.getByRole('button', { name: 'Abrir carrito', exact: true }).click();
    await page.locator('.increase-item-btn').click();
    await page.waitForFunction(() => document.getElementById('cart-count').textContent === '2');
    await page.locator('.decrease-item-btn').click();
    await page.waitForFunction(() => document.getElementById('cart-count').textContent === '1');
    const calls = requests.slice(start).filter(r => /automatic_promotions|manual_coupons/.test(r.path));
    assert.equal(calls.length, 2);
    assert.ok(calls.every(r => r.filter.includes('store="otra"')));
    assert.equal(await page.evaluate(() => localStorage.getItem('powerzona_selected_coupon_otra')), 'AHORRA');
    assert.equal(await page.evaluate(() => localStorage.getItem('tusenda84_cart_powerzona')), null);
    await page.locator('.delete-item-btn').click();
    await page.waitForFunction(() => document.getElementById('checkout-btn').disabled);
    await page.close();
  });

  await t.test('la navegacion reutiliza los motores inmutables sin otra descarga', async () => {
    const page = await makePage();
    const start = engineRequests.length;
    await page.goto(origin + '/t/powerzona');
    assert.equal(engineRequests.length - start, 2);
    await page.getByRole('link', { name: 'Categoría de prueba' }).click();
    await page.waitForURL(origin + '/t/powerzona/categoria/prueba');
    await page.evaluate(() => window.PZ_CART_RUNTIME_READY);
    assert.equal(engineRequests.length - start, 2, 'misma URL con hash reutilizada en otra pagina');
    await page.close();
  });

  for (const mode of ['fail', 'fail-promotions']) await t.test(`${mode}: no permite checkout ni elimina un cupon guardado`, async () => {
    const page = await makePage();
    await page.goto(origin + `/t/powerzona?mode=${mode}&coupon=AHORRA`);
    await page.getByRole('heading', { name: 'No se pudo cargar el cupón' }).waitFor();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    assert.ok(page.url().includes('coupon=AHORRA'));
    await page.getByRole('button', { name: 'Abrir carrito', exact: true }).click();
    await page.locator('#checkout-btn').click();
    await page.waitForFunction(() => document.getElementById('cart-live-alert').textContent.includes('No pudimos actualizar el carrito'));
    assert.ok(!page.url().includes('/checkout'));
    assert.equal(await page.evaluate(() => localStorage.getItem('powerzona_saved_coupons_powerzona')), '["AHORRA"]');
    await page.close();
  });

  await t.test('un producto agotado sigue retirandose antes de continuar', async () => {
    products.set('product1', { ...product, stock: 0 });
    const page = await makePage();
    await page.goto(origin + '/t/powerzona');
    await page.getByRole('button', { name: 'Abrir carrito', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('cart-live-alert').textContent.includes('Agotado') || document.getElementById('cart-total').textContent === '$0.00 USD');
    await page.locator('#checkout-btn').click();
    await page.waitForFunction(() => localStorage.getItem('tusenda84_cart_powerzona') === '[]');
    assert.ok(!page.url().endsWith('/checkout'));
    await page.close();
  });
  assert.deepEqual(errors, []);
  assert.ok(requests.every(r => r.method === 'GET'), 'sin pedidos ni escrituras de datos');
});
