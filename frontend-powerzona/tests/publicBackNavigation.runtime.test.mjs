import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('volver público: historial real, BFCache, respaldo y carrito vigente', async t => {
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find(path => path && existsSync(path));
  if (!executablePath) return t.skip('No hay Chromium del sistema disponible.');
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/publicBackNavigation.ts', import.meta.url))],
    bundle: true, format: 'iife', globalName: 'PublicBack', write: false });
  const validator = readFileSync(new URL('../public/cart-live-validator.js', import.meta.url), 'utf8');
  const script = bundle.outputFiles[0].text + '\nPublicBack.installPublicBackNavigation();';
  const base = '/t/powerzona', category = base + '/categoria/proteinas', product = base + '/producto/whey';
  const requests = [];
  let stock = 4;
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://fixture.test').pathname;
    if (path === '/runtime.js' || path === '/validator.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(path === '/runtime.js' ? script : validator); return;
    }
    requests.push({ path, method: req.method });
    if (path.startsWith('/api/collections/products/records/')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ id: 'product1', store: 'powerzona', name: 'Whey', active: true,
        base_price_usd: 10, regular_price_usd: 10, stock, track_stock: true,
        category: '', subcategory: '', has_variations: false })); return;
    }
    if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const backHref = path === category || path === base + '/regalos' ? base + '/#categorias'
      : path === base + '/buscar' ? base : category;
    const enabled = !path.includes('/admin') && !path.includes('/checkout');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, max-age=15' });
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font:18px Arial;margin:16px}a,button{display:inline-block;padding:12px}#categorias{margin-top:1000px;height:1600px}</style></head>
      <body data-pz-public-back="${enabled}"><h1>${path}</h1>
      <a id="back" data-pz-inner-back href="${backHref}">Volver</a>
      <a id="category" href="${category}">Proteínas</a><a id="product" style="${path === category ? 'display:block;margin-top:1400px' : ''}" href="${product}">Whey</a>
      <a id="other" href="${base}/categoria/otra">Otra categoría</a>
      <a id="subcategory" href="${base}/subcategoria/whey">Subcategoría</a>
      <a id="gifts" href="${base}/regalos">Regalos</a><a id="search" href="${base}/buscar">Buscar</a>
      <a id="external" href="http://localhost:${server.address().port}/external">Externo</a>
      <a id="blank" data-pz-inner-back href="${category}" target="_blank">Nueva pestaña</a>
      <a id="download" data-pz-inner-back href="${category}" download>Descargar</a>
      <button id="validate">Validar carrito</button><output id="validation"></output>
      <section id="categorias">Categorías de portada</section>
      <script>window.documentMarker=crypto.randomUUID();window.shows=[];
        addEventListener('pageshow',event=>window.shows.push({persisted:event.persisted}));
        addEventListener('pagehide',()=>window.departureY=scrollY);
        window.PZ_CURRENT_STORE_ID='powerzona';window.PZ_POCKETBASE_URL=location.origin;</script>
      <script src="/validator.js"></script><script src="/runtime.js"></script>
      <script>document.getElementById('validate').onclick=async()=>{
        const result=await PZCartLiveValidator.validateCartAgainstStore([{id:'product1',store_id:'powerzona',
          title:'Whey',price:10,quantity:1,stock:4,track_stock:true}]);
        document.getElementById('validation').textContent=JSON.stringify(result);
      };</script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Playwright disables BFCache by default. Remove that switch, and do not use
  // routing/CDP interception; assert actual pageshow.persisted, not guessed reuse.
  const browser = await chromium.launch({ executablePath, headless: true,
    ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  t.after(() => browser.close());
  const errors = [];
  const makePage = async (options = {}, init) => {
    const context = await browser.newContext(options);
    context.setDefaultTimeout(7000);
    t.after(() => context.close());
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };
  const state = page => page.evaluate(() => ({ key: navigation.currentEntry.key,
    index: navigation.currentEntry.index, marker: window.documentMarker,
    restored: window.shows.at(-1)?.persisted, scrollY }));
  const go = async (page, selector, path, mobile = false) => {
    if (mobile) await page.locator(selector).tap({ noWaitAfter: true }); else await page.locator(selector).click({ noWaitAfter: true });
    // BFCache restores an existing document instead of firing a new load event.
    await page.waitForFunction(url => location.href === url && document.readyState === 'complete', origin + path);
  };

  for (const mobile of [false, true]) await t.test(`regreso exacto, ancla y adelante (${mobile ? 'móvil' : 'escritorio'})`, async () => {
    const page = await makePage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1443, height: 1278 }, isMobile: mobile, hasTouch: mobile });
    await page.goto(origin + base);
    const homeState = await state(page);
    await go(page, '#category', category, mobile);
    const cat = await state(page);
    // The fixture's product is below the fold; normal click/tap scrolls to it.
    await go(page, '#product', product, mobile);
    const count = requests.filter(r => r.path === category).length;
    await go(page, '#back', category, mobile);
    await page.waitForFunction(() => scrollY === window.departureY && scrollY > 100);
    const returned = await state(page);
    assert.equal(returned.key, cat.key);
    assert.equal(returned.index, cat.index);
    assert.equal(returned.marker, cat.marker);
    assert.equal(returned.restored, true, 'Restauración BFCache real');
    assert.ok(returned.scrollY > 100, 'Conserva el desplazamiento anterior');
    assert.equal(requests.filter(r => r.path === category).length, count, 'Sin nueva petición HTML');
    await go(page, '#back', base + '#categorias', mobile);
    assert.equal((await state(page)).key, homeState.key);
    assert.equal((await state(page)).marker, homeState.marker);
    await page.waitForFunction(() => Math.abs(document.getElementById('categorias').getBoundingClientRect().top) < 2);
    await page.goForward({ waitUntil: 'commit' });
    await page.waitForFunction(url => location.href === url, origin + category);
    await go(page, '#product', product, mobile);
    await go(page, '#back', category, mobile);
    assert.equal((await state(page)).key, cat.key, 'No quedan entradas repetidas de categoría');
    await page.close();
  });

  await t.test('entrada directa, origen incorrecto, nueva pestaña y salto externo conservan el enlace', async () => {
    for (const from of [null, base + '/categoria/otra', '/t/otra/categoria/proteinas', base + '/buscar']) {
      const page = await makePage();
      if (from) { await page.goto(origin + from); await go(page, '#product', product); }
      else await page.goto(origin + product);
      const before = await state(page);
      await go(page, '#back', category);
      assert.equal((await state(page)).index, before.index + 1, String(from));
      await page.close();
    }
    const page = await makePage();
    await page.goto(origin + category);
    const popupPromise = page.context().waitForEvent('page');
    await page.locator('#product').click({ modifiers: ['Control'] });
    const popup = await popupPromise;
    await popup.waitForLoadState('load');
    await go(popup, '#back', category);
    assert.equal(new URL(popup.url()).pathname, category);
    await popup.close();
    await page.locator('#external').click();
    await page.waitForURL(`http://localhost:${server.address().port}/external`);
    // Navigate through a real cross-origin link, not a reconstructed referrer.
    await page.evaluate(url => document.getElementById('product').href = url, origin + product);
    await go(page, '#product', product);
    await go(page, '#back', category);
    assert.equal((await state(page)).restored, false, 'No salta por encima del origen externo');
    await page.close();
  });

  await t.test('subcategoría, regalos y búsqueda respetan el padre; administración y checkout quedan fuera', async () => {
    for (const [parent, selector, child, destination] of [
      [category, '#subcategory', base + '/subcategoria/whey', category],
      [base, '#gifts', base + '/regalos', base + '#categorias'],
      [base, '#search', base + '/buscar', base],
    ]) {
      const page = await makePage();
      await page.goto(origin + parent);
      const before = await state(page);
      await go(page, selector, child);
      await go(page, '#back', destination);
      assert.equal((await state(page)).key, before.key);
      await page.close();
    }
    for (const privatePath of [base + '/admin/products', base + '/checkout']) {
      const page = await makePage();
      await page.goto(origin + category);
      await page.goto(origin + privatePath);
      const before = await state(page);
      await go(page, '#back', category);
      assert.equal((await state(page)).index, before.index + 1);
      await page.close();
    }
  });

  await t.test('sin API, almacenamiento bloqueado y JavaScript desactivado sigue navegando', async () => {
    const unsupported = await makePage({}, () => Object.defineProperty(window, 'navigation', { value: undefined }));
    await unsupported.goto(origin + category);
    await go(unsupported, '#product', product);
    await go(unsupported, '#back', category);
    assert.equal(await unsupported.evaluate(() => window.shows.at(-1).persisted), false);
    const blocked = await makePage({}, () => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
    await blocked.goto(origin + base);
    await go(blocked, '#category', category);
    await go(blocked, '#back', base + '/#categorias');
    assert.equal((await state(blocked)).restored, false);
    const noJS = await makePage({ javaScriptEnabled: false });
    await noJS.goto(origin + product);
    await go(noJS, '#back', category);
  });

  await t.test('recarga, doble clic, target y descarga no rompen el historial', async () => {
    const page = await makePage();
    await page.goto(origin + category);
    const cat = await state(page);
    await go(page, '#product', product);
    await page.reload();
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#blank').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');
    assert.equal(new URL(popup.url()).pathname, category);
    await popup.close();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download').click();
    await (await downloadPromise).cancel();
    await page.locator('#back').click({ clickCount: 2, noWaitAfter: true });
    await page.waitForFunction(url => location.href === url, origin + category);
    assert.equal((await state(page)).key, cat.key);
    await page.close();
  });

  await t.test('un fallo o cancelación no fuerza navegación ni deja el botón bloqueado', async () => {
    for (const name of ['AbortError', 'InvalidStateError', 'sync']) {
      const page = await makePage();
      await page.goto(origin + category);
      await go(page, '#product', product);
      await page.evaluate(name => {
        window.originalBack = navigation.back.bind(navigation);
        navigation.back = () => {
          if (name === 'sync') throw new Error('Unsupported');
          return { committed: Promise.reject(new DOMException('Fixture', name)), finished: Promise.reject(new DOMException('Fixture', name)) };
        };
      }, name);
      await page.locator('#back').click();
      if (name === 'AbortError') {
        assert.equal(new URL(page.url()).pathname, product);
        await page.evaluate(() => navigation.back = window.originalBack);
        await go(page, '#back', category);
      } else await page.waitForURL(origin + category);
      await page.close();
    }
  });

  await t.test('pageshow real invalida la validación previa y detecta stock agotado', async () => {
    stock = 4;
    const page = await makePage();
    await page.goto(origin + category);
    await page.locator('#validate').click();
    await page.waitForFunction(() => document.getElementById('validation').textContent.includes('validatedAt'));
    assert.equal(JSON.parse(await page.locator('#validation').textContent()).invalidCount, 0);
    await go(page, '#product', product);
    stock = 0;
    await go(page, '#back', category);
    assert.equal((await state(page)).restored, true);
    const count = requests.filter(r => r.path.startsWith('/api/')).length;
    await page.locator('#validate').click();
    await page.waitForFunction(() => JSON.parse(document.getElementById('validation').textContent).invalidCount === 1);
    assert.ok(requests.filter(r => r.path.startsWith('/api/')).length > count);
    await page.close();
  });
  assert.deepEqual(errors, []);
  assert.ok(requests.every(r => r.method === 'GET'), 'Solo lecturas, sin pedidos');
});
