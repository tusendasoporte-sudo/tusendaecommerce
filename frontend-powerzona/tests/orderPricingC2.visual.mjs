import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const PB_URL = String(process.env.PZ_C2_VISUAL_PB_URL || '').replace(/\/+$/, '');
const FRONTEND_URL = String(process.env.PZ_C2_VISUAL_FRONTEND_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = String(process.env.PZ_C2_VISUAL_SUPER_EMAIL || '');
const SUPER_PASSWORD = String(process.env.PZ_C2_VISUAL_SUPER_PASSWORD || '');
if (!PB_URL || !FRONTEND_URL || !SUPER_EMAIL || !SUPER_PASSWORD) throw new Error('Faltan variables PZ_C2_VISUAL_*');

const stamp = Date.now();
const prefix = `PZORDC2QA_${stamp}`;
const slug = `pzordc2qa-visual-${stamp}`;
const adminEmail = `${slug}@example.test`;
const adminPassword = 'PZORDC2QA-Visual-2026!Safe';
const evidenceDir = path.resolve(process.cwd(), '../docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C2');
const created = new Map();
let superToken = '';
let adminToken = '';
let browser = null;
let order = null;
let orderItem = null;

function remember(collection, record) {
  if (!created.has(collection)) created.set(collection, []);
  created.get(collection).push(record.id);
  return record;
}

async function request(route, { token = '', method = 'GET', body, headers = {}, allowError = false } = {}) {
  const response = await fetch(`${PB_URL}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  if (!response.ok && !allowError) throw new Error(`${method} ${route}: ${response.status} ${raw}`);
  return { status: response.status, data, raw };
}

async function api(route, options = {}) {
  return (await request(route, options)).data;
}

async function create(collection, body) {
  return remember(collection, await api(`/api/collections/${collection}/records`, {
    token: superToken, method: 'POST', body,
  }));
}

async function remove(collection, id) {
  await request(`/api/collections/${collection}/records/${id}`, {
    token: superToken, method: 'DELETE', allowError: true,
  });
}

async function list(collection, filter = '') {
  const query = new URLSearchParams({ perPage: '500' });
  if (filter) query.set('filter', filter);
  return (await api(`/api/collections/${collection}/records?${query}`, { token: superToken }))?.items || [];
}

async function seed() {
  const auth = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST', body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
  });
  superToken = auth.token;

  const store = await create('stores', { name: `${prefix} Tienda visual`, slug, status: 'active' });
  await api(`/api/collections/stores/records/${store.id}`, {
    token: superToken,
    method: 'PATCH',
    body: { plan: 'premium', plan_started_at: new Date().toISOString(), plan_expires_at: '', plan_duration_months: 0, plan_is_permanent: true },
  });
  const admin = await create('users', {
    store: store.id,
    email: adminEmail,
    password: adminPassword,
    passwordConfirm: adminPassword,
    display_name: `${prefix} Administrador`,
    role: 'store_admin',
    status: 'active',
    emailVisibility: true,
  });
  const usd = await create('currencies', {
    store: store.id, code: 'USD', name: `${prefix} USD`, symbol: '$', exchange_rate: 1, active: true, is_default: true,
  });
  await create('settings', {
    store: store.id,
    stored_name: `${prefix} Tienda visual`,
    store_name: `${prefix} Tienda visual`,
    whatsapp_number: '+15551234567',
    default_currency: usd.id,
    active: true,
    order_prefix: 'CT',
    notifications_enabled: true,
    notify_new_order: true,
  });
  const zone = await create('shipping_zones', {
    store: store.id, municipality: `${prefix} Municipio`, zone: 'Centro', price_usd: 4, active: true,
  });
  const product = await create('products', {
    store: store.id,
    name: `${prefix} Producto con acuerdo`,
    slug: `${slug}-producto`,
    active: true,
    base_price_usd: 10,
    regular_price_usd: 10,
    stock: 30,
    track_stock: true,
    has_variations: false,
    delivery_mode: 'both',
  });
  await create('automatic_promotions', {
    store: store.id,
    name: `${prefix} Promoción 10%`,
    active: true,
    type: 'product_discount',
    scope: 'product',
    discount_type: 'percentage',
    discount_value: 10,
    product: product.id,
    priority: 10,
  });
  const checkout = await api('/api/pz/checkout/orders', {
    method: 'POST',
    body: {
      store_id: store.id,
      idempotency_key: `PZORDC2QA_${stamp}_visual_token`,
      customer_name: `${prefix} Cliente visual`,
      customer_phone: '+1 555 222 3344',
      customer_address: `${prefix} Calle 1`,
      currency_id: usd.id,
      delivery_method: 'delivery',
      shipping_zone_id: zone.id,
      items: [{ product_id: product.id, quantity: 2 }],
    },
  });
  order = remember('orders', checkout.order);
  orderItem = remember('order_items', checkout.items[0]);
  assert.equal(order.total, 22);

  const directAuth = await api('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: adminEmail, password: adminPassword },
    headers: { 'X-PZ-Admin-Device': 'R'.repeat(43) },
  });
  adminToken = directAuth.token;
  return { store, admin, product };
}

async function login(page) {
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('#login-email').fill(adminEmail);
  await page.locator('#login-password').fill(adminPassword);
  await page.locator('#login-button').click();
  await page.waitForURL((url) => url.pathname.includes('/admin'), { timeout: 20_000 });
}

async function openOrder(page) {
  await page.goto(`${FRONTEND_URL}/t/${slug}/admin/orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.order-product-card').first().waitFor({ state: 'visible' });
}

async function openAdjustment(page) {
  await page.locator('.adjust-price-btn').first().click();
  await page.locator('#price-adjustment-modal').waitFor({ state: 'visible' });
}

async function patchOrder(body) {
  await api(`/api/collections/orders/records/${order.id}`, { token: superToken, method: 'PATCH', body });
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, JSON.stringify(dimensions));
}

async function capture() {
  await mkdir(evidenceDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await login(page);
  await openOrder(page);

  await openAdjustment(page);
  await page.locator('#price-adjustment-final-price').fill('7');
  await page.locator('#price-adjustment-reason').selectOption('special_discount');
  await page.locator('#price-adjustment-reason-text').fill('Acuerdo visual C2 con el cliente');
  await page.locator('#price-adjustment-submit').click();
  await page.locator('#price-adjustment-modal').waitFor({ state: 'hidden' });

  await openAdjustment(page);
  await page.locator('#price-adjustment-reset').click();
  await page.locator('#price-adjustment-reset-summary').waitFor({ state: 'visible' });
  await page.locator('#price-adjustment-submit').click();
  await page.locator('#price-adjustment-reason-error').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidenceDir, '01-reset-motivo-obligatorio-pc.png'), fullPage: false });

  await page.locator('#price-adjustment-reason').selectOption('other');
  await page.locator('#price-adjustment-reason-text').fill('1234');
  await page.locator('#price-adjustment-submit').click();
  await page.locator('#price-adjustment-reason-text-error').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidenceDir, '02-reset-otro-explicacion.png'), fullPage: false });
  const itemAfterRejectedReset = await api(`/api/collections/order_items/records/${orderItem.id}`, { token: superToken });
  assert.equal(itemAfterRejectedReset.has_manual_price_adjustment, true);
  await page.keyboard.press('Escape');

  await patchOrder({ status: 'confirmed', stock_deducted: false });
  await openOrder(page);
  await openAdjustment(page);
  await page.locator('#price-adjustment-state-warning').waitFor({ state: 'visible' });
  await page.getByText('La orden está confirmada.', { exact: false }).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidenceDir, '03-advertencia-confirmada.png'), fullPage: false });
  await page.keyboard.press('Escape');

  await patchOrder({ status: 'preparing', stock_deducted: false });
  await openOrder(page);
  await openAdjustment(page);
  await page.locator('#price-adjustment-final-price').fill('15');
  await page.locator('#price-adjustment-state-warning').waitFor({ state: 'visible' });
  await page.locator('#price-adjustment-warning').waitFor({ state: 'visible' });
  await page.getByText('La orden está en preparación.', { exact: false }).waitFor({ state: 'visible' });
  await page.getByText('Estás aumentando el total', { exact: false }).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidenceDir, '04-advertencia-preparando.png'), fullPage: false });
  await page.keyboard.press('Escape');

  await page.goto(`${FRONTEND_URL}/orden/${encodeURIComponent(order.order_number)}/${encodeURIComponent(order.receipt_token)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#receipt-totals').waitFor({ state: 'visible' });
  await page.getByText('Total final', { exact: true }).waitFor({ state: 'visible' });
  const totalLabels = await page.locator('#receipt-totals > div > span').allTextContents();
  assert.ok(totalLabels.indexOf('Envío') >= 0);
  assert.ok(totalLabels.indexOf('Total final') > totalLabels.indexOf('Envío'));
  assert.equal(await page.locator('.receipt-total-final').count(), 1);
  assert.match(await page.locator('.receipt-total-final').innerText(), /\$18\.00 USD/);
  await page.screenshot({ path: path.join(evidenceDir, '05-total-final-recibo.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await openOrder(page);
  await openAdjustment(page);
  await page.locator('#price-adjustment-reset').click();
  await page.locator('#price-adjustment-reset-summary').waitFor({ state: 'visible' });
  await page.locator('#price-adjustment-reason').selectOption('price_correction');
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(evidenceDir, '06-reset-movil.png'), fullPage: false });

  await page.setViewportSize({ width: 412, height: 915 });
  await assertNoHorizontalOverflow(page);
  const modalBox = await page.locator('.price-adjustment-card').boundingBox();
  assert.ok(modalBox && modalBox.x >= 0 && modalBox.x + modalBox.width <= 413, JSON.stringify(modalBox));
  await context.close();
}

async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  if (!superToken) return;
  const storeId = created.get('stores')?.[0] || '';
  for (const audit of await list('order_price_adjustments', storeId ? `store_id_snapshot="${storeId}"` : '')) await remove('order_price_adjustments', audit.id);
  for (const usage of await list('manual_coupon_usages', order ? `order="${order.id}"` : '')) await remove('manual_coupon_usages', usage.id);
  for (const item of await list('order_items', order ? `order="${order.id}"` : '')) {
    await request(`/api/pz/admin/orders/${order.id}/items/${item.id}`, { token: adminToken, method: 'DELETE', allowError: true });
  }
  for (const notification of await list('store_notifications', storeId ? `store="${storeId}"` : '')) await remove('store_notifications', notification.id);
  for (const collection of ['orders', 'automatic_promotions', 'products', 'shipping_zones', 'settings', 'currencies']) {
    for (const id of [...(created.get(collection) || [])].reverse()) await remove(collection, id);
  }
  for (const userId of [...(created.get('users') || [])].reverse()) {
    for (const audit of await list('store_user_device_audit', `target_user="${userId}" || actor="${userId}"`)) await remove('store_user_device_audit', audit.id);
    for (const device of await list('store_user_devices', `user="${userId}" || revoked_by="${userId}"`)) await remove('store_user_devices', device.id);
    await remove('users', userId);
  }
  for (const id of [...(created.get('stores') || [])].reverse()) await remove('stores', id);

  for (const [collection, field] of [
    ['stores', 'name'], ['products', 'name'], ['orders', 'customer_name'], ['order_items', 'product_name'],
    ['automatic_promotions', 'name'], ['shipping_zones', 'municipality'], ['settings', 'store_name'], ['currencies', 'name'],
    ['order_price_adjustments', 'product_name_snapshot'],
  ]) {
    assert.equal((await list(collection, `${field}~"${prefix}"`)).length, 0, `${collection} conserva fixtures ${prefix}`);
  }
  assert.equal((await list('users', `email~"pzordc2qa-visual-${stamp}"`)).length, 0, `users conserva fixtures ${prefix}`);
}

try {
  await seed();
  await capture();
  process.stdout.write(`${evidenceDir}\n`);
} finally {
  await cleanup();
}
