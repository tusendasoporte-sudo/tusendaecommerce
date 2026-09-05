import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('precarga publica con Astro real: intencion, limites, ahorro de datos y navegacion intacta', async (t) => {
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].find(path => path && existsSync(path));
  if (!executablePath) return t.skip('No hay Chromium del sistema disponible.');
  const controller = await build({
    entryPoints: [fileURLToPath(new URL('../src/lib/publicNavigationPrefetch.ts', import.meta.url))],
    bundle: true, format: 'iife', globalName: 'PublicNavigation', write: false,
  });
  // Exercise the installed Astro implementation, including real HTTP prefetch.
  const astro = await build({
    entryPoints: [fileURLToPath(new URL('../node_modules/astro/dist/prefetch/index.js', import.meta.url))],
    bundle: true, format: 'iife', globalName: 'AstroPrefetch', write: false,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.SSR': 'false',
      __PREFETCH_PREFETCH_ALL__: 'false', __PREFETCH_DEFAULT_STRATEGY__: '"hover"',
      __EXPERIMENTAL_CLIENT_PRERENDER__: 'false' },
    plugins: [{ name: 'fixture-adapter', setup(builder) {
      builder.onResolve({ filter: /^virtual:astro:adapter-config\/client$/ }, () => ({ path: 'adapter', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const internalFetchHeaders = {};', loader: 'js' }));
    } }],
  });
  const script = `${controller.outputFiles[0].text}\n${astro.outputFiles[0].text}\nPublicNavigation.installPublicNavigationPrefetch(AstroPrefetch.prefetch);`;
  const requests = [];
  const base = '/t/powerzona';
  const server = createServer((req, res) => {
    if (req.url === '/runtime.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(script); return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');
    if (/\/(?:categoria|subcategoria|producto)\//.test(req.url)) {
      requests.push({ url: req.url, purpose: req.headers['sec-purpose'] || req.headers.purpose || '' });
      res.end('<h1>Destino del catalogo</h1><script>window.targetExecuted = true;</script>'); return;
    }
    const enabled = req.url === base;
    res.end(`<!doctype html><html><body data-pz-public-prefetch="${enabled}">
      <h1>Portada de prueba</h1>
      <nav style="display:flex;flex-direction:column;gap:16px">
      <a id="category" href="${base}/categoria/gym">Categoria</a>
      <a id="product" href="${base}/producto/whey">Producto</a>
      <a id="subcategory" href="${base}/subcategoria/creatinas">Subcategoria</a>
      <a id="extra" href="${base}/producto/extra">Cuarto destino</a>
      <a id="checkout" href="${base}/checkout">Checkout</a>
      <a id="other-store" href="/t/otra/categoria/gym">Otra tienda</a>
      <a id="token" href="${base}/producto/token?preview=1">Preview</a>
      <a id="download" href="${base}/producto/download" download>Descarga</a>
      <a id="blank" href="${base}/producto/blank" target="_blank">Otra pestaña</a>
      <a id="optout" href="${base}/producto/optout" data-pz-no-prefetch>Excluido</a>
      <div id="cart-sidebar"><a id="cart" href="${base}/producto/cart">Carrito</a></div>
      </nav><script src="/runtime.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  // All fixture URLs are loopback. Avoid request interception: it disables the
  // browser HTTP cache and would invalidate the reuse assertion below.
  await page.goto(origin + base);
  await page.waitForTimeout(300);
  assert.equal(requests.length, 0, 'No descarga el catalogo al cargar la portada.');
  await page.hover('#category');
  await page.hover('h1');
  await page.waitForTimeout(250);
  assert.equal(requests.length, 0, 'Un paso breve del puntero no debe descargar.');

  for (const id of ['checkout', 'other-store', 'token', 'download', 'blank', 'optout', 'cart']) {
    await page.focus('#' + id);
    await page.waitForTimeout(220);
  }
  assert.equal(requests.length, 0, 'Respeta las exclusiones aun con foco.');
  for (const [id, path] of [['category', '/categoria/gym'], ['product', '/producto/whey'], ['subcategory', '/subcategoria/creatinas']]) {
    await Promise.all([
      page.waitForResponse(response => response.url() === origin + base + path),
      id === 'product' ? page.focus('#' + id) : page.hover('#' + id),
    ]);
  }
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.purpose.includes('prefetch')));
  assert.equal(await page.evaluate(() => window.targetExecuted), undefined, 'La precarga no ejecuta scripts de los destinos.');
  await page.hover('#extra');
  await page.waitForTimeout(250);
  await page.hover('#category');
  await page.waitForTimeout(250);
  assert.equal(requests.length, 3, 'Limita a tres destinos sin duplicar el mismo.');
  await page.click('#category');
  await page.waitForURL(origin + base + '/categoria/gym');
  assert.equal(await page.locator('h1').innerText(), 'Destino del catalogo');
  assert.equal(await page.evaluate(() => window.targetExecuted), true);
  assert.equal(requests.filter(request => request.url === base + '/categoria/gym').length, 1, 'La navegacion reutiliza la respuesta precargada.');

  const cautious = await browser.newPage();
  await cautious.addInitScript(() => Object.defineProperty(navigator, 'connection', {
    value: { saveData: true, effectiveType: '4g' }, configurable: true,
  }));
  await cautious.goto(origin + base);
  await cautious.hover('#category');
  await cautious.focus('#product');
  await cautious.dispatchEvent('#subcategory', 'pointerdown', { pointerType: 'touch', button: 0, isPrimary: true });
  await cautious.waitForTimeout(300);
  assert.equal(await cautious.locator('link[rel="prefetch"]').count(), 0, 'Ahorro de datos bloquea raton, foco y toque.');
  await cautious.evaluate(() => { navigator.connection.saveData = false; navigator.connection.effectiveType = '3g'; });
  await cautious.hover('#subcategory');
  await cautious.waitForTimeout(250);
  assert.equal(await cautious.locator('link[rel="prefetch"]').count(), 0, '3G no descarga especulativamente.');
  await cautious.evaluate(() => { navigator.connection.effectiveType = '4g'; });
  await cautious.dispatchEvent('#subcategory', 'pointerdown', { pointerType: 'touch', button: 0, isPrimary: true });
  await cautious.waitForFunction(() => document.querySelectorAll('link[rel="prefetch"]').length === 1);
  await cautious.goto(origin + base + '/checkout');
  await cautious.hover('#category');
  await cautious.waitForTimeout(250);
  assert.equal(await cautious.locator('link[rel="prefetch"]').count(), 0, 'Checkout no instala la precarga.');
});
