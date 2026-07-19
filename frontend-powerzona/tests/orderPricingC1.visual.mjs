import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const PB_URL = String(process.env.PZ_C1_VISUAL_PB_URL || '').replace(/\/+$/, '');
const FRONTEND_URL = String(process.env.PZ_C1_VISUAL_FRONTEND_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = String(process.env.PZ_C1_VISUAL_SUPER_EMAIL || '');
const SUPER_PASSWORD = String(process.env.PZ_C1_VISUAL_SUPER_PASSWORD || '');
if (!PB_URL || !FRONTEND_URL || !SUPER_EMAIL || !SUPER_PASSWORD) throw new Error('Faltan variables PZ_C1_VISUAL_*');

const stamp = Date.now();
const prefix = `PZORDC1QA_${stamp}`;
const slug = `pzordc1qa-visual-${stamp}`;
const adminEmail = `${slug}@example.test`;
const adminPassword = 'PZORDC1QA-Visual-2026!Safe';
const evidenceDir = path.resolve(process.cwd(), '../docs/tusenda84/reportes/evidencias/PZ-ORD-PRICE01-C1');
const created = new Map();
let superToken = '';
let adminToken = '';
let browser = null;
let order = null;

function remember(collection, record) {
  if (!created.has(collection)) created.set(collection, []);
  created.get(collection).push(record.id);
  return record;
}

async function api(route, { token = '', method = 'GET', body, headers = {} } = {}) {
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
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${raw}`);
  return data;
}

async function create(collection, body) {
  return remember(collection, await api(`/api/collections/${collection}/records`, { token: superToken, method: 'POST', body }));
}

async function remove(collection, id) {
  try { await api(`/api/collections/${collection}/records/${id}`, { token: superToken, method: 'DELETE' }); } catch (_) {}
}

async function list(collection, filter) {
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
    order_prefix: 'VC',
    notifications_enabled: true,
    notify_new_order: true,
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
      idempotency_key: `PZORDC1QA_${stamp}_visual_token`,
      customer_name: `${prefix} Cliente visual`,
      customer_phone: '+1 555 222 3344',
      currency_id: usd.id,
      delivery_method: 'pickup',
      items: [{ product_id: product.id, quantity: 2 }],
    },
  });
  order = checkout.order;
  remember('orders', checkout.order);
  for (const item of checkout.items || []) remember('order_items', item);
  const directAuth = await api('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: adminEmail, password: adminPassword },
    headers: { 'X-PZ-Admin-Device': 'V'.repeat(43) },
  });
  adminToken = directAuth.token;
  return { store, admin, product };
}

async function capture() {
  await mkdir(evidenceDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('#login-email').fill(adminEmail);
  await page.locator('#login-password').fill(adminPassword);
  await page.locator('#login-button').click();
  await page.waitForURL((url) => url.pathname.includes('/admin'), { timeout: 20_000 });
  await page.goto(`${FRONTEND_URL}/t/${slug}/admin/orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.order-product-card').first().waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidenceDir, '01-linea-desglose-pc.png'), fullPage: true });

  await page.locator('.adjust-price-btn').first().click();
  await page.locator('#price-adjustment-modal').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidenceDir, '02-modal-ajuste-precio.png'), fullPage: true });

  await page.locator('#price-adjustment-final-price').fill('15');
  await page.locator('#price-adjustment-warning').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidenceDir, '03-aumento-advertencia.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(evidenceDir, '04-ajuste-movil.png'), fullPage: false });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#price-adjustment-final-price').fill('7');
  await page.locator('#price-adjustment-reason').selectOption('special_discount');
  await page.locator('#price-adjustment-reason-text').fill('Acuerdo visual C1 con el cliente');
  await page.locator('#price-adjustment-submit').click();
  await page.locator('#price-adjustment-modal').waitFor({ state: 'hidden' });
  await page.getByText('Ajuste especial', { exact: true }).first().waitFor({ state: 'visible' });

  await page.goto(`${FRONTEND_URL}/orden/${encodeURIComponent(order.order_number)}/${encodeURIComponent(order.receipt_token)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#receipt-items').waitFor({ state: 'visible' });
  await page.getByText('Ajuste especial', { exact: true }).first().waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(evidenceDir, '05-recibo-ajuste.png'), fullPage: true });
  await context.close();
}

async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  if (!superToken) return;
  const storeId = created.get('stores')?.[0] || '';
  for (const audit of await list('order_price_adjustments', storeId ? `store_id_snapshot="${storeId}"` : '')) await remove('order_price_adjustments', audit.id);
  for (const usage of await list('manual_coupon_usages', order ? `order="${order.id}"` : '')) await remove('manual_coupon_usages', usage.id);
  for (const item of await list('order_items', order ? `order="${order.id}"` : '')) {
    try { await api(`/api/pz/admin/orders/${order.id}/items/${item.id}`, { token: adminToken, method: 'DELETE' }); } catch (_) {}
  }
  for (const notification of await list('store_notifications', storeId ? `store="${storeId}"` : '')) await remove('store_notifications', notification.id);
  for (const collection of ['orders', 'automatic_promotions', 'products', 'settings', 'currencies']) {
    for (const id of [...(created.get(collection) || [])].reverse()) await remove(collection, id);
  }
  for (const userId of [...(created.get('users') || [])].reverse()) {
    for (const deviceAudit of await list('store_user_device_audit', `target_user="${userId}" || actor="${userId}"`)) await remove('store_user_device_audit', deviceAudit.id);
    for (const device of await list('store_user_devices', `user="${userId}" || revoked_by="${userId}"`)) await remove('store_user_devices', device.id);
    await remove('users', userId);
  }
  for (const id of [...(created.get('stores') || [])].reverse()) await remove('stores', id);
}

try {
  await seed();
  await capture();
  process.stdout.write(`${evidenceDir}\n`);
} finally {
  await cleanup();
}
