import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../frontend-powerzona/package.json', import.meta.url));
const { chromium } = require('playwright');
const code = readFileSync(resolve(root, 'frontend-powerzona/public/admin-navigation.js'), 'utf8');
const css = readFileSync(resolve(root, 'frontend-powerzona/public/admin-navigation.css'), 'utf8');
const sidebarSource = readFileSync(resolve(root, 'frontend-powerzona/src/components/admin/AdminSidebar.astro'), 'utf8');
const sidebarCss = sidebarSource.match(/<style is:global>([\s\S]*?)<\/style>/)?.[1] || '';
const counts = new Map();
let rejectCatalog = false;
let actorId = 'actor-one';
let origin;
const names = { products: 'Productos', catalog: 'Categorías', shipping: 'Envíos', orders: 'Pedidos', security: 'Seguridad' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, origin);
  if (url.pathname.startsWith('/api/pz/admin/read/')) {
    const section = url.pathname.split('/').at(-1).replace('-bootstrap', '');
    counts.set(section, (counts.get(section) || 0) + 1);
    if (section === 'catalog') await new Promise((resolve) => setTimeout(resolve, 900));
    const denied = section === 'catalog' && rejectCatalog;
    response.writeHead(denied ? 403 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(denied ? { ok: false } : { ok: true, data: { label: names[section], categories: [{ id: 'cat1', name: 'Suplementos' }], products: [{ id: 'p1', name: 'Proteína' }] } }));
    return;
  }
  const section = url.pathname.split('/').at(-1);
  const name = names[section] || 'Productos';
  const config = JSON.stringify({ basePath: '/t/demo/admin', baseUrl: origin, storeId: 'store0000000001', token: 'test-token', actorId });
  response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  response.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sidebarCss}\n${css}
    body{margin:0;background:#f1f5f9;font:15px Arial;color:#0f172a}.fixture{display:flex;gap:32px;padding:24px}nav{width:230px;flex-shrink:0;background:white;padding:18px;border-radius:18px;box-sizing:border-box}.fixture-main{flex:1}.fixture-main h1{font-size:36px}.fixture-card{background:white;padding:26px;border-radius:16px}a{color:inherit;text-decoration:none}h2{font-size:20px}@media(max-width:600px){.fixture{gap:12px;padding:12px}nav{width:180px;padding:8px}.fixture-main h1{font-size:23px}}</style></head><body>
    <div class="fixture"><nav data-admin-sidebar-root><h2>PowerZona</h2><p>Admin Panel</p>${Object.entries(names).map(([key, label]) => `<a class="pz-admin-sidebar__nav-item${key === section ? ' is-active' : ''}" href="/t/demo/admin/${key}"><span class="pz-admin-sidebar__nav-icon"><svg viewBox="0 0 24 24"><path d="M4 5h16v15H4z"/></svg></span><span>${label}</span></a>`).join('')}<a href="#detail">Mismo documento</a><a href="/logout">Salir</a></nav><main class="fixture-main"><h1>${name}</h1><div class="fixture-card" id="content">Preparando datos</div><input aria-label="Prueba de formulario" placeholder="Escribe aquí"></main></div>
    <script>window.PZ_ADMIN_NAVIGATION_CONFIG=${config};</script><script>${code}</script>
    <script>${section !== 'security' ? `window.PZAdminNavigation.read(${JSON.stringify(section)}).then(data => { document.querySelector('#content').textContent = data.label + ' listo'; });` : `document.querySelector('#content').textContent = 'Seguridad lista';`}</script></body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
const artifacts = resolve(root, '.codex-artifacts/admin-navigation');
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PZ_TEST_BROWSER_CHANNEL || 'msedge' });
const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const link = (name) => page.getByRole('link', { name, exact: true });
async function products() {
  await page.goto(`${origin}/t/demo/admin/products`);
  await page.getByText('Productos listo', { exact: true }).waitFor();
}
try {
  await products();
  const before = counts.get('catalog') || 0;
  await link('Categorías').click({ noWaitAfter: true });
  assert.match(page.url(), /\/products$/);
  assert.equal(await link('Categorías').textContent(), 'Categorías');
  await page.locator('.pz-navigation-spinner').waitFor({ state: 'visible' });
  assert.equal(await link('Categorías').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('.pz-navigation-original-icon').evaluate((el) => getComputedStyle(el).display), 'none');
  await page.screenshot({ path: resolve(artifacts, 'desktop-loading.png') });
  await page.getByText('Categorías listo', { exact: true }).waitFor();
  assert.equal(counts.get('catalog') - before, 1, 'el destino debe consumir la precarga sin repetirla');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('pz-admin-next-page:v1:store0000000001')), null);
  await page.goBack();
  await page.getByText('Productos listo', { exact: true }).waitFor();
  assert.equal(await page.locator('[aria-busy="true"]').count(), 0);

  rejectCatalog = true;
  await link('Categorías').click({ noWaitAfter: true });
  await page.getByRole('alert').waitFor();
  assert.match(page.url(), /\/products$/);
  assert.equal(await page.locator('.pz-navigation-spinner').count(), 0);
  rejectCatalog = false;
  const duplicateBefore = counts.get('catalog');
  await link('Categorías').click({ noWaitAfter: true });
  await link('Categorías').click({ noWaitAfter: true });
  await page.getByText('Categorías listo', { exact: true }).waitFor();
  assert.equal(counts.get('catalog') - duplicateBefore, 1, 'doble clic no duplica lecturas');

  await products();
  await link('Categorías').click({ noWaitAfter: true });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1100);
  assert.match(page.url(), /\/products$/);
  assert.equal(await page.locator('.pz-navigation-spinner').count(), 0);

  await page.getByLabel('Prueba de formulario').fill('Cambios pendientes');
  await page.evaluate(() => window.addEventListener('beforeunload', (event) => { event.preventDefault(); event.returnValue = ''; }));
  page.once('dialog', (dialog) => dialog.dismiss());
  await link('Categorías').click({ noWaitAfter: true });
  await page.waitForTimeout(1200);
  assert.match(page.url(), /\/products$/);
  assert.equal(await page.getByLabel('Prueba de formulario').inputValue(), 'Cambios pendientes');
  assert.equal(await page.locator('.pz-navigation-spinner').count(), 0);
  page.once('dialog', (dialog) => dialog.accept());
  await products();

  await link('Mismo documento').click();
  assert.equal(await page.locator('.pz-navigation-spinner').count(), 0);
  await link('Seguridad').click();
  await page.getByText('Seguridad lista', { exact: true }).waitFor();

  // A payload prepared for a different authenticated actor must not be reused.
  await page.evaluate(() => sessionStorage.setItem('pz-admin-next-page:v1:store0000000001', JSON.stringify({
    storeId: 'store0000000001', section: 'products', identity: 'other-actor', path: '/t/demo/admin/products',
    expiresAt: Date.now() + 15000, data: { label: 'Datos ajenos' },
  })));
  await products();
  assert.equal(await page.getByText('Datos ajenos listo').count(), 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await link('Categorías').click({ noWaitAfter: true });
  await page.locator('.pz-navigation-spinner').waitFor({ state: 'visible' });
  assert.equal(await link('Categorías').textContent(), 'Categorías');
  await page.screenshot({ path: resolve(artifacts, 'mobile-loading.png') });
  await page.getByText('Categorías listo', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['spinner sin texto', 'página actual durante carga', 'precarga consumida una vez', 'Atrás', 'error y reintento', 'doble clic', 'Escape', 'formulario y cancelación', 'anclas', 'navegación nativa', 'aislamiento de usuario', 'móvil'], artifacts }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
