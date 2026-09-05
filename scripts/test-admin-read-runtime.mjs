import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const backend = resolve(root, 'backend-powerzona');
const frontend = resolve(root, 'frontend-powerzona');
const require = createRequire(resolve(frontend, 'package.json'));
const { chromium } = require('playwright');
const tempRoot = resolve(root, 'tmp');
mkdirSync(tempRoot, { recursive: true });
const workspace = mkdtempSync(resolve(tempRoot, 'admin-read-runtime-'));
const migrations = resolve(workspace, 'pb_migrations');
cpSync(resolve(backend, 'pb_migrations'), migrations, { recursive: true });
const executable = resolve(backend, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const flags = [`--dir=${resolve(workspace, 'pb_data')}`, `--hooksDir=${resolve(backend, 'pb_hooks')}`, `--migrationsDir=${migrations}`, '--hooksWatch=false', '--automigrate=true'];
const password = `Local!Aa1${randomBytes(18).toString('hex')}`;
const email = 'admin-read-runtime@example.test';
const create = spawnSync(executable, ['superuser', 'create', email, password, ...flags], { cwd: backend, encoding: 'utf8', windowsHide: true });
assert.equal(create.status, 0, create.stderr || create.stdout || String(create.error));
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const pbPort = await freePort();
const baseUrl = `http://127.0.0.1:${pbPort}`;
let pbLog = '';
const pb = spawn(executable, ['serve', `--http=127.0.0.1:${pbPort}`, ...flags], { cwd: backend, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
pb.stdout.on('data', (data) => { pbLog += data.toString(); });
pb.stderr.on('data', (data) => { pbLog += data.toString(); });
let frontendProcess;
let browser;
const device = 'A'.repeat(43);
async function waitFor(url, logs = () => pbLog) {
  for (let index = 0; index < 240; index++) {
    try { if ((await fetch(url)).status < 500) return; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Local server did not start: ${url}\n${logs().slice(-2500)}`);
}
async function request(path, token = '', body, method = body === undefined ? 'GET' : 'POST') {
  const result = await fetch(`${baseUrl}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', 'X-PZ-Admin-Device': device },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: result.status, headers: result.headers, data: await result.json() };
}
function ok(result) {
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}
try {
  await waitFor(`${baseUrl}/api/health`);
  const superToken = ok(await request('/api/collections/_superusers/auth-with-password', '', { identity: email, password })).token;
  const make = async (collection, body) => ok(await request(`/api/collections/${collection}/records`, superToken, body));
  const store = await make('stores', { name: 'Carga QA', slug: 'carga-qa', status: 'active' });
  const other = await make('stores', { name: 'Otra QA', slug: 'otra-qa', status: 'active' });
  const master = await make('users', { email: 'master-read@example.test', password, passwordConfirm: password, role: 'master_admin', status: 'active', display_name: 'Master QA' });
  const owner = await make('users', { email: 'owner-read@example.test', password, passwordConfirm: password, role: 'store_admin', status: 'active', store: store.id, display_name: 'Owner QA' });
  const masterToken = ok(await request('/api/collections/users/auth-with-password', '', { identity: master.email, password })).token;
  ok(await request('/api/pz/master/primary-admin/assign', masterToken, { store_id: store.id, user_id: owner.id, reason: 'Prueba local de cargas administrativas' }));
  const ownerAuth = ok(await request('/api/collections/users/auth-with-password', '', { identity: owner.email, password }));
  const category = await make('categories', { store: store.id, name: 'Suplementos', slug: 'suplementos', order: 10, active: true });
  const subcategory = await make('subcategories', { store: store.id, category: category.id, name: 'Proteínas', slug: 'proteinas', order: 10, active: true });
  const product = await make('products', { store: store.id, name: 'Proteína QA', slug: 'proteina-qa', category: category.id, base_price_usd: 20, regular_price_usd: 20, stock: 4, active: true, delivery_mode: 'both', description: 'Descripción extensa '.repeat(500) });
  await make('products', { store: other.id, name: 'Privado otra tienda', slug: 'privado', base_price_usd: 10, stock: 1, active: true, delivery_mode: 'both' });
  const result = await request('/api/pz/admin/read/catalog-bootstrap', ownerAuth.token, { store_id: store.id });
  const catalog = ok(result).data;
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.deepEqual(catalog.products.map((value) => value.id), [product.id]);
  assert.equal('description' in catalog.products[0], false);
  const legacyProducts = ok(await request(`/api/collections/products/records?filter=${encodeURIComponent(`store="${store.id}"`)}`, ownerAuth.token));
  const payloadBytes = { legacyProducts: Buffer.byteLength(JSON.stringify(legacyProducts)), catalogBootstrap: Buffer.byteLength(JSON.stringify(catalog)) };
  assert.ok(payloadBytes.catalogBootstrap < payloadBytes.legacyProducts / 2, 'el listado debe omitir la descripción extensa de la muestra');
  const detail = ok(await request('/api/pz/admin/read/catalog-detail-bootstrap', ownerAuth.token, { store_id: store.id, category_id: category.id })).data;
  assert.equal(detail.products[0].description, product.description);
  assert.equal((await request('/api/pz/admin/read/catalog-detail-bootstrap', ownerAuth.token, { store_id: store.id, category_id: 'invalid' })).status, 400);
  assert.equal((await request('/api/pz/admin/read/catalog-bootstrap', ownerAuth.token, { store_id: other.id })).status, 403);
  assert.equal((await request('/api/pz/admin/read/catalog-bootstrap', '', { store_id: store.id })).status, 403);
  for (const section of ['dashboard', 'profits', 'gifts', 'shipping', 'products', 'orders']) {
    ok(await request(`/api/pz/admin/read/${section}-bootstrap`, ownerAuth.token, { store_id: store.id }));
  }

  const webPort = await freePort();
  const webUrl = `http://127.0.0.1:${webPort}`;
  let webLog = '';
  frontendProcess = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', String(webPort)], {
    cwd: frontend, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    // Prevent Astro's agent auto-detection from detaching a daemon: the test owns
    // this foreground process and stops only it, leaving other dev servers alone.
    env: { ...process.env, ASTRO_DEV_BACKGROUND: '1', PUBLIC_POCKETBASE_URL: baseUrl, POCKETBASE_URL: baseUrl },
  });
  frontendProcess.stdout.on('data', (data) => { webLog += data.toString(); });
  frontendProcess.stderr.on('data', (data) => { webLog += data.toString(); });
  await waitFor(`${webUrl}/favicon.svg`, () => webLog);
  browser = await chromium.launch({ headless: true, channel: process.env.PZ_TEST_BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: 'pb_auth', value: encodeURIComponent(JSON.stringify({ token: ownerAuth.token, record: ownerAuth.record })), url: webUrl },
    { name: 'pz_admin_device', value: device, url: webUrl },
  ]);
  const page = await context.newPage();
  const pageErrors = [];
  const counts = new Map();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.includes('-bootstrap')) counts.set(path, (counts.get(path) || 0) + 1);
  });
  await page.goto(`${webUrl}/t/carga-qa/admin/products`);
  await page.locator('#products-list').getByText('Proteína QA', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('#product-quota-card').count(), 0);
  const artifactDir = resolve(root, '.codex-artifacts/admin-navigation');
  mkdirSync(artifactDir, { recursive: true });
  await page.route('**/api/pz/admin/read/catalog-bootstrap', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.locator('#pz-admin-sidebar-store').getByRole('link', { name: 'Categorías', exact: true }).click({ noWaitAfter: true });
  await page.locator('.pz-navigation-spinner').waitFor({ state: 'visible' });
  assert.match(page.url(), /\/products$/);
  await page.screenshot({ path: resolve(artifactDir, 'actual-desktop-loading.png') });
  await page.locator('#categories-list').getByText('Suplementos', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(counts.get('/api/pz/admin/read/catalog-bootstrap'), 1);
  await page.goto(`${webUrl}/t/carga-qa/admin/catalog/category/${category.id}`);
  await page.waitForFunction(() => document.querySelector('#category-title')?.textContent === 'Suplementos');
  await page.goto(`${webUrl}/t/carga-qa/admin/catalog/category/${category.id}/subcategory/${subcategory.id}`);
  await page.getByRole('heading', { name: 'Proteínas', exact: true }).waitFor();
  await page.goto(`${webUrl}/t/carga-qa/admin`);
  await page.waitForFunction(() => document.querySelector('#business-products-total')?.textContent === '1', { timeout: 30000 });
  await page.screenshot({ path: resolve(artifactDir, 'actual-dashboard.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${webUrl}/t/carga-qa/admin/products`);
  await page.locator('#products-list').getByText('Proteína QA', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Abrir menú de navegación', exact: true }).click();
  await page.locator('#pz-admin-sidebar-store').getByRole('link', { name: 'Categorías', exact: true }).click({ noWaitAfter: true });
  await page.locator('.pz-navigation-spinner').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.body.classList.contains('sidebar-open')), true);
  await page.screenshot({ path: resolve(artifactDir, 'actual-mobile-loading.png') });
  await page.locator('#categories-list').getByText('Suplementos', { exact: true }).waitFor();
  assert.deepEqual(pageErrors, [], `Errores JS: ${pageErrors.join('\n')}\n${webLog.slice(-1000)}`);
  console.log(JSON.stringify({ ok: true, workspace, payloadBytes, artifacts: artifactDir, checks: ['PocketBase real', 'rutas nuevas', 'aislamiento de tienda', 'sin autenticación', 'campos ligeros', 'productos reales', 'navegación categorías', 'precarga sin duplicación', 'categoría y subcategoría reales', 'resumen real', 'menú móvil durante carga', 'sin errores JavaScript'] }));
} finally {
  if (browser) await browser.close();
  if (frontendProcess) frontendProcess.kill();
  pb.kill();
}
