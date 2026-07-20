'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

const BACKEND_DIR = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const C3_MIGRATION_NAME = '1784595900_m7u2_c3_permission_normalization.js';
const C3_MIGRATION_PATH = path.join(MIGRATIONS_DIR, C3_MIGRATION_NAME);
const POCKETBASE_EXE = path.join(
  BACKEND_DIR,
  process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase',
);
const TEMP_ROOT = path.join(BACKEND_DIR, '.tmp');
const TEMP_PREFIX = 'M7U2C3QA_';
const LOOPBACK = '127.0.0.1';

const MARKETING = [
  'promotions.manage',
  'coupons.manage',
  'gifts.manage',
  'raffles.manage',
  'landing_qr.manage',
  'analytics.view',
];
const READ_ONLY = ['catalog.view', 'orders.view', 'analytics.view'];
const LEGACY_MARKETING = [
  'catalog.view',
  'orders.view',
  'promotions.manage',
  'coupons.manage',
  'gifts.manage',
  'raffles.manage',
  'analytics.view',
  'landing_qr.manage',
];
const LEGACY_READ_ONLY = [
  'catalog.view',
  'orders.view',
  'notifications.view',
  'analytics.view',
  'security.view',
];
const CUSTOM = ['security.view'];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function runtimePassword(label) {
  return `QA-${label}-${randomBytes(24).toString('base64url')}!Aa1`;
}

function runtimeEnvironment() {
  return {
    ...process.env,
    PZ_SECURITY_HMAC_SECRET: randomBytes(32).toString('hex'),
    PZ_SECURITY_AES_KEY: randomBytes(24).toString('base64url').slice(0, 32),
  };
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function pocketBaseFlags(dataDirectory, migrationsDirectory) {
  return [
    `--dir=${dataDirectory}`,
    `--hooksDir=${HOOKS_DIR}`,
    `--migrationsDir=${migrationsDirectory}`,
    '--hooksWatch=false',
    '--hooksPool=2',
    '--automigrate=true',
    '--indexFallback=false',
  ];
}

function assertCommand(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} fallo (exit=${result.status}): ${result.error || ''}\n${result.stdout || ''}\n${result.stderr || ''}`,
  );
}

function bootstrapSuperuser(dataDirectory, migrationsDirectory, email, password, env) {
  const result = spawnSync(
    POCKETBASE_EXE,
    ['superuser', 'create', email, password, ...pocketBaseFlags(dataDirectory, migrationsDirectory)],
    {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      env,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  assertCommand(result, 'bootstrap de superuser efimero');
}

function migrateUp(dataDirectory, migrationsDirectory, env, label) {
  const result = spawnSync(
    POCKETBASE_EXE,
    ['migrate', 'up', ...pocketBaseFlags(dataDirectory, migrationsDirectory)],
    {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      env,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  assertCommand(result, label);
}

function startPocketBase(dataDirectory, migrationsDirectory, port, env) {
  let output = '';
  let spawnError = null;
  const child = spawn(
    POCKETBASE_EXE,
    ['serve', `--http=${LOOPBACK}:${port}`, ...pocketBaseFlags(dataDirectory, migrationsDirectory)],
    {
      cwd: BACKEND_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const capture = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-30000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => {
    spawnError = error;
    capture(`\nspawn error: ${error.stack || error.message}`);
  });
  return {
    child,
    output: () => output,
    spawnError: () => spawnError,
  };
}

async function waitForPocketBase(runtime, baseUrl) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (runtime.spawnError()) throw runtime.spawnError();
    if (runtime.child.exitCode !== null) {
      throw new Error(`PocketBase termino antes de iniciar (exit=${runtime.child.exitCode}).\n${runtime.output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) return;
    } catch (_) {}
    await delay(100);
  }
  throw new Error(`PocketBase no quedo listo en 30 segundos.\n${runtime.output()}`);
}

async function stopPocketBase(runtime) {
  if (!runtime || runtime.child.exitCode !== null) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  const graceful = await Promise.race([
    exited.then(() => true),
    delay(5000).then(() => false),
  ]);
  if (graceful || runtime.child.exitCode !== null) return;
  runtime.child.kill('SIGKILL');
  await Promise.race([exited, delay(5000)]);
  assert.notEqual(runtime.child.exitCode, null, `PocketBase no termino.\n${runtime.output()}`);
}

function assertOwnedTempDirectory(directory) {
  const resolvedRoot = path.resolve(TEMP_ROOT);
  const resolvedDirectory = path.resolve(directory);
  assert.equal(
    path.dirname(resolvedDirectory),
    resolvedRoot,
    `directorio temporal fuera de alcance: ${resolvedDirectory}`,
  );
  assert.match(path.basename(resolvedDirectory), /^M7U2C3QA_[A-Za-z0-9_-]+$/);
}

function copyPreC3Migrations(targetDirectory) {
  fs.mkdirSync(targetDirectory, { recursive: true });
  for (const entry of fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js') || entry.name === C3_MIGRATION_NAME) continue;
    fs.copyFileSync(
      path.join(MIGRATIONS_DIR, entry.name),
      path.join(targetDirectory, entry.name),
    );
  }
  assert.equal(fs.existsSync(path.join(targetDirectory, C3_MIGRATION_NAME)), false);
}

async function apiRequest(baseUrl, route, {
  token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST',
} = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw };
}

function assertStatus(result, expected, label) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    accepted.includes(result.status),
    `${label}: HTTP ${result.status}; esperados ${accepted.join('/')}\n${result.raw}`,
  );
}

function recordFilter(field, value) {
  return `${field} = "${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sorted(value) {
  return Array.from(value || [], (item) => String(item)).sort();
}

function havanaDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Havana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function assertExactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label}: objeto esperado`);
  assert.deepEqual(Object.keys(value).sort(), expected.slice().sort(), `${label}: contrato de campos`);
}

function assertNoObjectKeysDeep(value, forbidden, label) {
  const denied = new Set(forbidden);
  const inspect = (candidate, location) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => inspect(item, `${location}[${index}]`));
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    for (const [key, item] of Object.entries(candidate)) {
      assert.equal(denied.has(key), false, `${label}: campo privado ${location}.${key}`);
      inspect(item, `${location}.${key}`);
    }
  };
  inspect(value, '$');
}

function assertSerializedExcludes(value, forbiddenValues, label) {
  const serialized = JSON.stringify(value);
  for (const forbidden of forbiddenValues.filter(Boolean)) {
    assert.equal(
      serialized.includes(String(forbidden)),
      false,
      `${label}: valor privado serializado ${forbidden}`,
    );
  }
}

test('M7U2-C3 HTTP runtime migra legacy en dos fases y revoca solo sesiones afectadas', {
  timeout: 180000,
}, async () => {
  assert.equal(fs.existsSync(POCKETBASE_EXE), true, `falta binario PocketBase: ${POCKETBASE_EXE}`);
  assert.equal(fs.existsSync(C3_MIGRATION_PATH), true, `falta migracion C3: ${C3_MIGRATION_PATH}`);

  const tempRootExisted = fs.existsSync(TEMP_ROOT);
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const tempDirectory = fs.mkdtempSync(path.join(TEMP_ROOT, TEMP_PREFIX));
  assertOwnedTempDirectory(tempDirectory);
  const dataDirectory = path.join(tempDirectory, 'pb_data');
  const runtimeMigrationsDirectory = path.join(tempDirectory, 'pb_migrations');
  fs.mkdirSync(dataDirectory, { recursive: true });
  copyPreC3Migrations(runtimeMigrationsDirectory);

  const suffix = `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`.toLowerCase();
  const prefix = `M7U2C3QA_${suffix}`;
  const slugPrefix = `m7u2c3qa-${suffix}`;
  const superEmail = `${slugPrefix}-super@example.test`;
  const superPassword = runtimePassword('superuser');
  const masterEmail = `${slugPrefix}-master@example.test`;
  const masterPassword = runtimePassword('master');
  const env = runtimeEnvironment();
  const fixtures = [
    {
      key: 'marketing',
      template: 'marketing_promotions',
      before: LEGACY_MARKETING,
      after: MARKETING,
      changed: true,
      device: 'M'.repeat(43),
    },
    {
      key: 'readonly',
      template: 'read_only',
      before: LEGACY_READ_ONLY,
      after: READ_ONLY,
      changed: true,
      device: 'R'.repeat(43),
    },
    {
      key: 'custom',
      template: 'custom',
      before: CUSTOM,
      after: CUSTOM,
      changed: false,
      device: 'C'.repeat(43),
    },
    {
      key: 'reordered',
      template: 'marketing_promotions',
      before: MARKETING.slice().reverse(),
      after: MARKETING.slice().reverse(),
      changed: false,
      device: 'O'.repeat(43),
    },
  ].map((item) => ({
    ...item,
    email: `${slugPrefix}-${item.key}@example.test`,
    password: runtimePassword(item.key),
    store: null,
    user: null,
    access: null,
    oldToken: '',
    currentToken: '',
    category: null,
    subcategory: null,
    extraCategories: [],
    extraSubcategories: [],
    product: null,
    analyticsEvents: [],
    settings: null,
    order: null,
    orderItems: [],
    coupon: null,
    couponUsage: null,
    promotion: null,
    visualItem: null,
    privateMarkers: null,
  }));
  const ordersReader = {
    email: `${slugPrefix}-orders-reader@example.test`,
    password: runtimePassword('orders-reader'),
    device: 'D'.repeat(43),
    user: null,
    access: null,
    oldToken: '',
    currentToken: '',
  };

  let runtime = null;
  let failure = null;

  try {
    bootstrapSuperuser(
      dataDirectory,
      runtimeMigrationsDirectory,
      superEmail,
      superPassword,
      env,
    );
    const firstPort = await freeLoopbackPort();
    const firstBaseUrl = `http://${LOOPBACK}:${firstPort}`;
    runtime = startPocketBase(
      dataDirectory,
      runtimeMigrationsDirectory,
      firstPort,
      env,
    );
    await waitForPocketBase(runtime, firstBaseUrl);

    const firstRequest = (route, options) => apiRequest(firstBaseUrl, route, options);
    const firstSuperAuth = await firstRequest('/api/collections/_superusers/auth-with-password', {
      body: { identity: superEmail, password: superPassword },
    });
    assertStatus(firstSuperAuth, 200, 'autenticar superuser en fase previa');
    const firstSuperToken = firstSuperAuth.data.token;

    async function firstCreate(collection, body) {
      const result = await firstRequest(`/api/collections/${collection}/records`, {
        token: firstSuperToken,
        body,
      });
      assertStatus(result, 200, `crear ${collection} en fase previa`);
      return result.data;
    }

    for (const fixture of fixtures) {
      // Una tienda efimera por actor evita que la prueba de migracion dependa
      // del orden de cuota entre usuarios; cada caso sigue ejerciendo el
      // mismo esquema y las mismas reglas reales de autenticacion.
      fixture.store = await firstCreate('stores', {
        name: `${prefix} Store ${fixture.key}`,
        slug: `${slugPrefix}-${fixture.key}`,
        status: 'active',
        plan: 'premium',
        plan_started_at: new Date().toISOString(),
        plan_expires_at: '',
        plan_duration_months: 0,
        plan_is_permanent: true,
      });
    }

    const master = await firstCreate('users', {
      email: masterEmail,
      password: masterPassword,
      passwordConfirm: masterPassword,
      display_name: `${prefix} Master`,
      role: 'master_admin',
      status: 'active',
      emailVisibility: true,
    });
    assert.ok(master.id);
    const masterAuth = await firstRequest('/api/collections/users/auth-with-password', {
      body: { identity: masterEmail, password: masterPassword },
    });
    assertStatus(masterAuth, 200, 'login Master para activar Premium');
    for (const fixture of fixtures) {
      const premium = await firstRequest('/api/pz/master/store-plan/change', {
        token: masterAuth.data.token,
        body: {
          store_id: fixture.store.id,
          plan: 'premium',
          is_permanent: true,
          duration_months: 0,
          reason: `${prefix} activar Premium`,
          confirm_expiration_cleanup: false,
        },
      });
      assertStatus(premium, 200, `activar Premium ${fixture.key}`);
    }

    for (const fixture of fixtures) {
      fixture.user = await firstCreate('users', {
        email: fixture.email,
        password: fixture.password,
        passwordConfirm: fixture.password,
        display_name: `${prefix} ${fixture.key}`,
        role: 'store_staff',
        status: 'active',
        store: fixture.store.id,
        emailVisibility: true,
      });
      fixture.access = await firstCreate('store_user_access', {
        store: fixture.store.id,
        user: fixture.user.id,
        template_code: fixture.template,
        permissions_json: fixture.before,
      });
    }

    const fixtureByKey = Object.fromEntries(fixtures.map((fixture) => [fixture.key, fixture]));
    ordersReader.user = await firstCreate('users', {
      email: ordersReader.email,
      password: ordersReader.password,
      passwordConfirm: ordersReader.password,
      display_name: `${prefix} Orders Reader`,
      role: 'store_staff',
      status: 'active',
      store: fixtureByKey.marketing.store.id,
      emailVisibility: true,
    });
    ordersReader.access = await firstCreate('store_user_access', {
      store: fixtureByKey.marketing.store.id,
      user: ordersReader.user.id,
      template_code: 'custom',
      permissions_json: ['orders.view'],
    });
    const eventDay = havanaDay();

    async function seedCatalogAndAnalytics(fixture) {
      const marker = `${prefix}-${fixture.key}`;
      fixture.privateMarkers = {
        visitor: `visitor-private-${suffix}-${fixture.key}`,
        session: `session-private-${suffix}-${fixture.key}`,
        referrer: `https://private.example.test/${suffix}/${fixture.key}`,
        userAgent: `Private-QA-Agent/${suffix}-${fixture.key}`,
        linkUrl: `https://private.example.test/${suffix}/${fixture.key}/landing-secret`,
        internalRef: `SKU-PRIVATE-${suffix}-${fixture.key}`,
      };
      fixture.category = await firstCreate('categories', {
        store: fixture.store.id,
        name: `${marker} Category`,
        slug: `${slugPrefix}-${fixture.key}-category`,
        active: true,
        order: 7,
      });
      fixture.subcategory = await firstCreate('subcategories', {
        store: fixture.store.id,
        category: fixture.category.id,
        name: `${marker} Subcategory`,
        slug: `${slugPrefix}-${fixture.key}-subcategory`,
        active: true,
        order: 9,
      });
      const extraTaxonomyCount = fixture.key === 'marketing' ? 105 : 2;
      for (let index = 1; index <= extraTaxonomyCount; index += 1) {
        const category = await firstCreate('categories', {
          store: fixture.store.id,
          name: `${marker} Category Extra ${index}`,
          slug: `${slugPrefix}-${fixture.key}-category-extra-${index}`,
          active: true,
          order: 10 + index,
        });
        fixture.extraCategories.push(category);
        fixture.extraSubcategories.push(await firstCreate('subcategories', {
          store: fixture.store.id,
          category: category.id,
          name: `${marker} Subcategory Extra ${index}`,
          slug: `${slugPrefix}-${fixture.key}-subcategory-extra-${index}`,
          active: true,
          order: 10 + index,
        }));
      }
      fixture.product = await firstCreate('products', {
        store: fixture.store.id,
        category: fixture.category.id,
        subcategory: fixture.subcategory.id,
        name: `${marker} Product`,
        slug: `${slugPrefix}-${fixture.key}-product`,
        description: `<p>${marker} private product body</p>`,
        active: true,
        base_price_usd: 123.45,
        regular_price_usd: 150.75,
        cost_usd: 88.25,
        stock: 77,
        track_stock: true,
        delivery_mode: 'both',
        internal_ref: fixture.privateMarkers.internalRef,
      });
      const expirationPatch = await firstRequest(
        `/api/collections/products/records/${fixture.product.id}`,
        {
          token: masterAuth.data.token,
          method: 'PATCH',
          body: { expiration_date: '2099-12-31' },
        },
      );
      assertStatus(expirationPatch, 200, `sembrar vencimiento privado ${fixture.key}`);
      fixture.product = expirationPatch.data;
      fixture.analyticsEvents.push(await firstCreate('store_analytics_events', {
        store: fixture.store.id,
        day: eventDay,
        visitor_id: fixture.privateMarkers.visitor,
        session_id: fixture.privateMarkers.session,
        event_type: 'pageview',
        page_type: 'product',
        entity_type: 'product',
        entity_id: fixture.product.id,
        path: `/t/${fixture.store.slug}/producto/${fixture.product.slug}`,
        referrer: fixture.privateMarkers.referrer,
        user_agent: fixture.privateMarkers.userAgent,
      }));
      fixture.analyticsEvents.push(await firstCreate('store_analytics_events', {
        store: fixture.store.id,
        day: eventDay,
        visitor_id: fixture.privateMarkers.visitor,
        session_id: `${fixture.privateMarkers.session}-landing`,
        event_type: 'landing_qr_click',
        page_type: 'landing_qr',
        entity_type: 'landing_qr',
        path: `/t/${fixture.store.slug}/qr`,
        referrer: fixture.privateMarkers.referrer,
        user_agent: fixture.privateMarkers.userAgent,
        link_id: `link-${fixture.key}`,
        link_type: 'whatsapp',
        link_label: `${marker} Private CTA`,
        link_url: fixture.privateMarkers.linkUrl,
      }));
    }

    await seedCatalogAndAnalytics(fixtureByKey.marketing);
    await seedCatalogAndAnalytics(fixtureByKey.reordered);

    const readOnlyMarkers = {
      visitor: `visitor-private-${suffix}-readonly`,
      session: `session-private-${suffix}-readonly`,
      referrer: `https://private.example.test/${suffix}/readonly`,
      userAgent: `Private-QA-Agent/${suffix}-readonly`,
    };
    fixtureByKey.readonly.privateMarkers = readOnlyMarkers;
    fixtureByKey.readonly.analyticsEvents.push(await firstCreate('store_analytics_events', {
      store: fixtureByKey.readonly.store.id,
      day: eventDay,
      visitor_id: readOnlyMarkers.visitor,
      session_id: readOnlyMarkers.session,
      event_type: 'pageview',
      page_type: 'store_home',
      entity_type: 'store',
      path: `/t/${fixtureByKey.readonly.store.slug}`,
      referrer: readOnlyMarkers.referrer,
      user_agent: readOnlyMarkers.userAgent,
    }));

    const marketingCurrency = await firstCreate('currencies', {
      store: fixtureByKey.marketing.store.id,
      code: 'USD',
      name: `${prefix} Marketing USD`,
      symbol: '$',
      exchange_rate: 1,
      active: true,
      is_default: true,
    });
    fixtureByKey.marketing.settings = await firstCreate('settings', {
      store: fixtureByKey.marketing.store.id,
      stored_name: `${prefix} Marketing Settings`,
      store_name: `${prefix} Marketing Settings`,
      whatsapp_number: '+15551234567',
      default_currency: marketingCurrency.id,
      active: true,
      business_notes: `${prefix} BUSINESS NOTES PRIVATE`,
      order_prefix: 'MKT',
      marketing_bar_active: true,
      marketing_bar_text: `${prefix} Marketing Bar Initial`,
    });
    fixtureByKey.marketing.coupon = await firstCreate('manual_coupons', {
      store: fixtureByKey.marketing.store.id,
      code: `C3_${suffix.toUpperCase()}`,
      name: `${prefix} Private Coupon`,
      customer_message: `${prefix} coupon message private`,
      active: true,
      scope: 'product',
      discount_type: 'percentage',
      discount_value: 5,
      product: fixtureByKey.marketing.product.id,
      unlimited_uses: false,
      max_uses: 5,
      used_count: 0,
    });
    const checkout = await firstRequest('/api/pz/checkout/orders', {
      body: {
        store_id: fixtureByKey.marketing.store.id,
        idempotency_key: randomBytes(32).toString('base64url').slice(0, 32),
        customer_name: `${prefix} Private Customer`,
        customer_phone: '+1 555 987 6543',
        currency_id: marketingCurrency.id,
        delivery_method: 'pickup',
        coupon_code: fixtureByKey.marketing.coupon.code,
        items: [{ product_id: fixtureByKey.marketing.product.id, quantity: 1 }],
      },
    });
    assertStatus(checkout, 200, 'crear pedido y uso de cupon por checkout canonico');
    fixtureByKey.marketing.order = checkout.data.order;
    fixtureByKey.marketing.orderItems = checkout.data.items || [];
    assert.ok(fixtureByKey.marketing.orderItems.length > 0, 'checkout crea al menos un order_item');
    assert.ok(fixtureByKey.marketing.order.customer_phone, 'pedido contiene telefono privado sembrado');
    assert.ok(fixtureByKey.marketing.order.receipt_token, 'pedido contiene token de recibo privado');
    const usageQuery = new URLSearchParams({
      perPage: '10',
      filter: recordFilter('coupon', fixtureByKey.marketing.coupon.id),
    });
    const couponUsages = await firstRequest(
      `/api/collections/manual_coupon_usages/records?${usageQuery}`,
      { token: firstSuperToken },
    );
    assertStatus(couponUsages, 200, 'leer uso de cupon sembrado');
    assert.equal(couponUsages.data.items.length, 1, 'checkout crea un uso manual de cupon');
    fixtureByKey.marketing.couponUsage = couponUsages.data.items[0];
    fixtureByKey.marketing.promotion = await firstCreate('automatic_promotions', {
      store: fixtureByKey.marketing.store.id,
      name: `${prefix} Product Promotion`,
      active: true,
      type: 'product_discount',
      scope: 'product',
      discount_type: 'percentage',
      discount_value: 1,
      product: fixtureByKey.marketing.product.id,
    });
    fixtureByKey.marketing.visualItem = await firstCreate('store_visual_items', {
      store: fixtureByKey.marketing.store.id,
      type: 'promo_visual',
      title: `${prefix} Visual Item`,
      description: `${prefix} visual private body`,
      action_type: 'categoria',
      category: fixtureByKey.marketing.category.id,
      sort_order: 1,
      active: true,
    });

    await firstCreate('store_security_settings', {
      store: fixtureByKey.custom.store.id,
      enabled: true,
      mode: 'monitoring',
      manual_blocking_enabled: false,
      full_access_blocking_enabled: false,
      permanent_blocks_enabled: false,
      retention_days: 30,
      ip_visibility: 'hidden',
      notify_blocked_attempts: false,
    });

    for (const fixture of fixtures) {
      const auth = await firstRequest('/api/collections/users/auth-with-password', {
        body: { identity: fixture.email, password: fixture.password },
        headers: { 'X-PZ-Admin-Device': fixture.device },
      });
      assertStatus(auth, 200, `login legacy ${fixture.key}`);
      fixture.oldToken = auth.data.token;
    }
    const ordersReaderAuth = await firstRequest('/api/collections/users/auth-with-password', {
      body: { identity: ordersReader.email, password: ordersReader.password },
      headers: { 'X-PZ-Admin-Device': ordersReader.device },
    });
    assertStatus(ordersReaderAuth, 200, 'login custom orders.view previo a C3');
    ordersReader.oldToken = ordersReaderAuth.data.token;

    await stopPocketBase(runtime);
    runtime = null;

    fs.copyFileSync(
      C3_MIGRATION_PATH,
      path.join(runtimeMigrationsDirectory, C3_MIGRATION_NAME),
    );
    migrateUp(dataDirectory, runtimeMigrationsDirectory, env, 'primer migrate up C3');
    migrateUp(dataDirectory, runtimeMigrationsDirectory, env, 'segundo migrate up C3 idempotente');

    const secondPort = await freeLoopbackPort();
    const secondBaseUrl = `http://${LOOPBACK}:${secondPort}`;
    runtime = startPocketBase(
      dataDirectory,
      runtimeMigrationsDirectory,
      secondPort,
      env,
    );
    await waitForPocketBase(runtime, secondBaseUrl);
    const request = (route, options) => apiRequest(secondBaseUrl, route, options);

    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: superEmail, password: superPassword },
    });
    assertStatus(superAuth, 200, 'autenticar superuser despues de C3');
    const superToken = superAuth.data.token;

    async function listRecords(collection, filter = '') {
      const query = new URLSearchParams({ page: '1', perPage: '200', sort: 'id' });
      if (filter) query.set('filter', filter);
      const result = await request(`/api/collections/${collection}/records?${query}`, {
        token: superToken,
      });
      assertStatus(result, 200, `listar ${collection}`);
      return result.data?.items || [];
    }

    async function accessContext(token) {
      return request('/api/pz/store/access/context', { token, body: {} });
    }

    async function refresh(token, device) {
      return request('/api/collections/users/auth-refresh', {
        token,
        body: {},
        headers: { 'X-PZ-Admin-Device': device },
      });
    }

    async function login(fixture) {
      return request('/api/collections/users/auth-with-password', {
        body: { identity: fixture.email, password: fixture.password },
        headers: { 'X-PZ-Admin-Device': fixture.device },
      });
    }

    for (const fixture of fixtures.filter((item) => item.changed)) {
      assertStatus(
        await refresh(fixture.oldToken, fixture.device),
        [401, 403],
        `refresh viejo revocado ${fixture.key}`,
      );
      assertStatus(
        await accessContext(fixture.oldToken),
        [401, 403],
        `contexto viejo revocado ${fixture.key}`,
      );
      const freshAuth = await login(fixture);
      assertStatus(freshAuth, 200, `relogin posterior ${fixture.key}`);
      fixture.currentToken = freshAuth.data.token;
      const context = await accessContext(fixture.currentToken);
      assertStatus(context, 200, `contexto posterior ${fixture.key}`);
      assert.equal(context.data.access.template_code, fixture.template);
      assert.deepEqual(sorted(context.data.access.permissions), sorted(fixture.after));
    }

    for (const fixture of fixtures.filter((item) => !item.changed)) {
      fixture.currentToken = fixture.oldToken;
      const context = await accessContext(fixture.oldToken);
      assertStatus(context, 200, `sesion intacta ${fixture.key}`);
      assert.equal(context.data.access.template_code, fixture.template);
      assert.deepEqual(sorted(context.data.access.permissions), sorted(fixture.after));
      const refreshed = await refresh(fixture.oldToken, fixture.device);
      assertStatus(refreshed, 200, `refresh intacto ${fixture.key}`);
    }

    ordersReader.currentToken = ordersReader.oldToken;
    const ordersReaderContext = await accessContext(ordersReader.currentToken);
    assertStatus(ordersReaderContext, 200, 'custom orders.view permanece autenticado tras C3');
    assert.equal(ordersReaderContext.data.access.template_code, 'custom');
    assert.deepEqual(ordersReaderContext.data.access.permissions, ['orders.view']);
    assertStatus(
      await refresh(ordersReader.currentToken, ordersReader.device),
      200,
      'sesion custom orders.view no rota por C3',
    );

    for (const fixture of fixtures) {
      const rows = await listRecords('store_user_access', recordFilter('user', fixture.user.id));
      assert.equal(rows.length, 1, `acceso unico ${fixture.key}`);
      assert.deepEqual(rows[0].permissions_json, fixture.after, `permisos persistidos ${fixture.key}`);
      assert.equal(rows[0].template_code, fixture.template);
    }

    const specialized = await listRecords(
      'store_user_audit',
      recordFilter('action', 'team_permissions_normalized'),
    );
    assert.equal(specialized.length, 2, 'dos auditorias especializadas, solo por cambios de conjunto');
    const specializedByTarget = new Map(
      specialized.map((item) => [item.target_user_id_snapshot, item]),
    );
    for (const fixture of fixtures.filter((item) => item.changed)) {
      const audit = specializedByTarget.get(fixture.user.id);
      assert.ok(audit, `auditoria especializada ${fixture.key}`);
      assert.equal(audit.previous_template_code, fixture.template);
      assert.equal(audit.new_template_code, fixture.template);
      assert.deepEqual(audit.previous_permissions_json, fixture.before);
      assert.deepEqual(audit.new_permissions_json, fixture.after);
      assert.equal(audit.sessions_revoked, true);
    }
    for (const fixture of fixtures.filter((item) => !item.changed)) {
      assert.equal(specializedByTarget.has(fixture.user.id), false, `sin auditoria ${fixture.key}`);
    }

    const central = await listRecords(
      'store_activity_audit',
      recordFilter('action', 'team_permissions_normalized'),
    );
    assert.equal(central.length, 2, 'dos actividades centrales, sin duplicado por segundo migrate up');
    const expectedSources = fixtures
      .filter((item) => item.changed)
      .map((item) => `migration:m7u2c3:team_permissions_normalized:${item.access.id}`)
      .sort();
    assert.deepEqual(central.map((item) => item.source_event_key).sort(), expectedSources);
    for (const event of central) {
      assert.equal(event.origin, 'migration');
      assert.equal(event.actor_role_snapshot, 'migration');
      assert.equal(event.module, 'team');
      assert.equal(event.severity, 'critical');
      assert.equal(event.resource_type, 'team_user_permissions');
      assert.deepEqual(event.changed_fields_json, ['permissions_json']);
    }

    async function analyticsSummary(fixture) {
      return request('/api/pz/store/analytics/summary', {
        token: fixture.currentToken,
        body: { range: '30', pages_page: 1 },
      });
    }

    async function marketingSelectors(fixture, body = {}) {
      return request('/api/pz/store/marketing/selectors', {
        token: fixture.currentToken,
        body,
      });
    }

    function assertSafeAnalytics(summary, fixture, otherFixture, includeLandingQr) {
      const expectedTopLevel = [
        'ok', 'range', 'period_days', 'generated_at', 'time_zone', 'metrics', 'daily',
        'top_viewed_products', 'top_pages', 'pages',
        ...(includeLandingQr ? ['landing_qr'] : []),
      ];
      assertExactKeys(summary, expectedTopLevel, `analytics ${fixture.key}`);
      assertExactKeys(summary.metrics, ['visitors', 'recurrent_visitors', 'pageviews'], `metricas ${fixture.key}`);
      assertExactKeys(
        summary.pages,
        ['page', 'per_page', 'total_items', 'total_pages', 'items'],
        `paginacion analytics ${fixture.key}`,
      );
      for (const row of summary.daily) {
        assertExactKeys(
          row,
          ['day', 'label', 'visitors', 'recurrent_visitors', 'pageviews'],
          `serie diaria ${fixture.key}`,
        );
      }
      for (const row of summary.top_viewed_products) {
        assertExactKeys(row, ['name', 'slug', 'active', 'views', 'public_path'], `top producto ${fixture.key}`);
      }
      for (const row of [...summary.top_pages, ...summary.pages.items]) {
        assertExactKeys(
          row,
          ['page_type', 'name', 'detail', 'visits', 'last_visited_at', 'public_path'],
          `pagina analytics ${fixture.key}`,
        );
      }
      if (includeLandingQr) {
        assertExactKeys(summary.landing_qr, ['views', 'clicks', 'top_buttons'], `landing QR ${fixture.key}`);
        for (const row of summary.landing_qr.top_buttons) {
          assertExactKeys(row, ['link_type', 'link_label', 'clicks'], `boton landing QR ${fixture.key}`);
        }
      } else {
        assert.equal(Object.prototype.hasOwnProperty.call(summary, 'landing_qr'), false);
      }
      assertNoObjectKeysDeep(summary, [
        'id', 'store', 'visitor_id', 'session_id', 'referrer', 'user_agent', 'link_url',
        'link_id', 'entity_id', 'entity_type', 'event_type', 'path', 'collectionId',
        'collectionName', 'created', 'updated',
      ], `analytics sanitizado ${fixture.key}`);
      assertSerializedExcludes(summary, [
        fixture.store.id,
        fixture.category?.id,
        fixture.subcategory?.id,
        fixture.product?.id,
        ...fixture.analyticsEvents.map((event) => event.id),
        ...Object.values(fixture.privateMarkers || {}),
        otherFixture?.store?.id,
        otherFixture?.category?.id,
        otherFixture?.subcategory?.id,
        otherFixture?.product?.id,
        otherFixture?.product?.name,
        otherFixture?.product?.slug,
        ...Object.values(otherFixture?.privateMarkers || {}),
      ], `analytics sin IDs, PII ni tenant ajeno ${fixture.key}`);
    }

    function assertSafeSelectors(payload, fixture, otherFixture) {
      assertExactKeys(
        payload,
        ['ok', 'products', 'categories', 'subcategories', 'taxonomy'],
        `selectores ${fixture.key}`,
      );
      assertExactKeys(payload.taxonomy, [
        'page', 'per_page', 'categories_has_more', 'subcategories_has_more', 'has_more',
      ], `paginacion taxonomia ${fixture.key}`);
      assert.equal(payload.ok, true);
      const taxonomyTotal = 1 + fixture.extraCategories.length;
      const expectedPageSize = Math.min(100, taxonomyTotal);
      assert.equal(payload.products.length, 1, `producto propio unico ${fixture.key}`);
      assert.equal(payload.categories.length, expectedPageSize, `categorias propias ${fixture.key}`);
      assert.equal(payload.subcategories.length, expectedPageSize, `subcategorias propias ${fixture.key}`);
      assert.equal(payload.taxonomy.page, 1);
      assert.equal(payload.taxonomy.per_page, 100);
      assert.equal(payload.taxonomy.categories_has_more, taxonomyTotal > 100);
      assert.equal(payload.taxonomy.subcategories_has_more, taxonomyTotal > 100);
      assert.equal(payload.taxonomy.has_more, taxonomyTotal > 100);
      for (const row of payload.products) {
        assertExactKeys(row, [
          'ref', 'name', 'slug', 'public_path', 'thumbnail_url', 'category_ref',
          'category_name', 'subcategory_ref', 'subcategory_name', 'visible',
        ], `selector producto ${fixture.key}`);
      }
      for (const row of payload.categories) {
        assertExactKeys(
          row,
          ['ref', 'name', 'slug', 'public_path', 'thumbnail_url', 'visible'],
          `selector categoria ${fixture.key}`,
        );
      }
      for (const row of payload.subcategories) {
        assertExactKeys(row, [
          'ref', 'name', 'slug', 'public_path', 'thumbnail_url', 'category_ref',
          'category_name', 'visible',
        ], `selector subcategoria ${fixture.key}`);
      }
      const product = payload.products.find((item) => item.ref === fixture.product.id);
      const category = payload.categories.find((item) => item.ref === fixture.category.id);
      const subcategory = payload.subcategories.find((item) => item.ref === fixture.subcategory.id);
      assert.ok(product, `selector incluye producto base ${fixture.key}`);
      assert.ok(category, `selector incluye categoria base ${fixture.key}`);
      assert.ok(subcategory, `selector incluye subcategoria base ${fixture.key}`);
      assert.equal(product.category_ref, fixture.category.id);
      assert.equal(product.subcategory_ref, fixture.subcategory.id);
      assert.equal(subcategory.category_ref, fixture.category.id);
      assertNoObjectKeysDeep(payload, [
        'id', 'store', 'base_price_usd', 'regular_price_usd', 'cost', 'cost_usd',
        'stock', 'sku', 'internal_ref', 'expiration_date', 'description', 'collectionId',
        'collectionName', 'created', 'updated',
      ], `selectores publicos ${fixture.key}`);
      assertSerializedExcludes(payload, [
        fixture.privateMarkers.internalRef,
        otherFixture.store.id,
        otherFixture.category.id,
        otherFixture.subcategory.id,
        otherFixture.product.id,
        otherFixture.product.name,
        otherFixture.product.slug,
        ...otherFixture.extraCategories.flatMap((item) => [item.id, item.name, item.slug]),
        ...otherFixture.extraSubcategories.flatMap((item) => [item.id, item.name, item.slug]),
        ...Object.values(otherFixture.privateMarkers),
      ], `selectores sin secretos ni tenant ajeno ${fixture.key}`);
    }

    const marketingSummary = await analyticsSummary(fixtureByKey.marketing);
    assertStatus(marketingSummary, 200, 'Marketing consume resumen analytics sanitizado');
    assert.equal(marketingSummary.data.ok, true);
    assert.equal(marketingSummary.data.metrics.pageviews, 1);
    assert.equal(marketingSummary.data.metrics.visitors, 1);
    assert.equal(
      marketingSummary.data.top_viewed_products.some((item) => item.name === fixtureByKey.marketing.product.name),
      true,
      'analytics Marketing incluye su producto agregado',
    );
    assert.equal(marketingSummary.data.landing_qr.clicks, 1);
    assertSafeAnalytics(marketingSummary.data, fixtureByKey.marketing, fixtureByKey.reordered, true);

    const reorderedSummary = await analyticsSummary(fixtureByKey.reordered);
    assertStatus(reorderedSummary, 200, 'Marketing reordenado consume su resumen aislado');
    assert.equal(reorderedSummary.data.metrics.pageviews, 1);
    assert.equal(
      reorderedSummary.data.top_viewed_products.some((item) => item.name === fixtureByKey.reordered.product.name),
      true,
      'analytics de segunda tienda incluye solo su producto',
    );
    assertSafeAnalytics(reorderedSummary.data, fixtureByKey.reordered, fixtureByKey.marketing, true);

    const readOnlySummary = await analyticsSummary(fixtureByKey.readonly);
    assertStatus(readOnlySummary, 200, 'Read-only consume analytics');
    assert.equal(readOnlySummary.data.metrics.pageviews, 1);
    assertSafeAnalytics(readOnlySummary.data, fixtureByKey.readonly, fixtureByKey.marketing, false);

    const marketingSelectorResult = await marketingSelectors(fixtureByKey.marketing);
    assertStatus(marketingSelectorResult, 200, 'Marketing consume selector seguro');
    assertSafeSelectors(marketingSelectorResult.data, fixtureByKey.marketing, fixtureByKey.reordered);
    const reorderedSelectorResult = await marketingSelectors(fixtureByKey.reordered);
    assertStatus(reorderedSelectorResult, 200, 'segunda tienda consume selector seguro');
    assertSafeSelectors(reorderedSelectorResult.data, fixtureByKey.reordered, fixtureByKey.marketing);

    const taxonomyPageSize = 100;
    const taxonomyPage1 = await marketingSelectors(fixtureByKey.marketing, {
      taxonomy_page: 1,
      taxonomy_per_page: taxonomyPageSize,
    });
    assertStatus(taxonomyPage1, 200, 'selector taxonomia pagina 1');
    assert.equal(taxonomyPage1.data.products.length, 1, 'productos solo se cargan en pagina 1');
    assert.equal(taxonomyPage1.data.categories.length, taxonomyPageSize);
    assert.equal(taxonomyPage1.data.subcategories.length, taxonomyPageSize);
    assert.deepEqual(taxonomyPage1.data.taxonomy, {
      page: 1,
      per_page: taxonomyPageSize,
      categories_has_more: true,
      subcategories_has_more: true,
      has_more: true,
    });

    const taxonomyPage2 = await marketingSelectors(fixtureByKey.marketing, {
      taxonomy_page: 2,
      taxonomy_per_page: taxonomyPageSize,
    });
    assertStatus(taxonomyPage2, 200, 'selector taxonomia pagina 2');
    assert.deepEqual(taxonomyPage2.data.products, [], 'pagina 2 no retransmite productos');
    assert.equal(taxonomyPage2.data.categories.length, 6);
    assert.equal(taxonomyPage2.data.subcategories.length, 6);
    assert.deepEqual(taxonomyPage2.data.taxonomy, {
      page: 2,
      per_page: taxonomyPageSize,
      categories_has_more: false,
      subcategories_has_more: false,
      has_more: false,
    });

    const categoryPage1Refs = taxonomyPage1.data.categories.map((item) => item.ref);
    const categoryPage2Refs = taxonomyPage2.data.categories.map((item) => item.ref);
    const subcategoryPage1Refs = taxonomyPage1.data.subcategories.map((item) => item.ref);
    const subcategoryPage2Refs = taxonomyPage2.data.subcategories.map((item) => item.ref);
    assert.equal(new Set(categoryPage1Refs).size, categoryPage1Refs.length, 'pagina 1 categorias sin duplicados');
    assert.equal(new Set(categoryPage2Refs).size, categoryPage2Refs.length, 'pagina 2 categorias sin duplicados');
    assert.equal(new Set(subcategoryPage1Refs).size, subcategoryPage1Refs.length, 'pagina 1 subcategorias sin duplicados');
    assert.equal(new Set(subcategoryPage2Refs).size, subcategoryPage2Refs.length, 'pagina 2 subcategorias sin duplicados');
    assert.equal(categoryPage2Refs.some((ref) => categoryPage1Refs.includes(ref)), false, 'categorias no se repiten entre paginas');
    assert.equal(
      subcategoryPage2Refs.some((ref) => subcategoryPage1Refs.includes(ref)),
      false,
      'subcategorias no se repiten entre paginas',
    );
    assert.equal(new Set([...categoryPage1Refs, ...categoryPage2Refs]).size, 106);
    assert.equal(new Set([...subcategoryPage1Refs, ...subcategoryPage2Refs]).size, 106);

    const requestedPage2Ref = taxonomyPage2.data.categories[0].ref;
    const hydratedPage2 = await marketingSelectors(fixtureByKey.marketing, {
      refs: [requestedPage2Ref],
      taxonomy_page: 2,
      taxonomy_per_page: taxonomyPageSize,
    });
    assertStatus(hydratedPage2, 200, 'selector rehidrata ref seleccionada de pagina 2');
    assert.deepEqual(hydratedPage2.data.products, [], 'rehidratacion pagina 2 no carga productos');
    assert.equal(
      hydratedPage2.data.categories.some((item) => item.ref === requestedPage2Ref),
      true,
      'ref solicitada permanece seleccionable sin catalog.view',
    );
    assert.ok(hydratedPage2.data.categories.length <= taxonomyPageSize + 1);
    assert.ok(hydratedPage2.data.subcategories.length <= taxonomyPageSize + 1);

    const reorderedTaxonomySecrets = [
      fixtureByKey.reordered.store.id,
      fixtureByKey.reordered.category.id,
      fixtureByKey.reordered.subcategory.id,
      fixtureByKey.reordered.product.id,
      ...fixtureByKey.reordered.extraCategories.flatMap((item) => [item.id, item.name, item.slug]),
      ...fixtureByKey.reordered.extraSubcategories.flatMap((item) => [item.id, item.name, item.slug]),
    ];
    for (const [label, payload] of [
      ['pagina 1', taxonomyPage1.data],
      ['pagina 2', taxonomyPage2.data],
      ['pagina 2 hidratada', hydratedPage2.data],
    ]) {
      assertNoObjectKeysDeep(payload, [
        'id', 'store', 'base_price_usd', 'regular_price_usd', 'cost', 'cost_usd',
        'stock', 'sku', 'internal_ref', 'expiration_date', 'description', 'collectionId',
        'collectionName', 'created', 'updated',
      ], `selector paginado seguro ${label}`);
      assertSerializedExcludes(payload, reorderedTaxonomySecrets, `selector paginado aislado ${label}`);
    }
    assertStatus(
      await marketingSelectors(fixtureByKey.marketing, {
        taxonomy_page: 1,
        taxonomy_per_page: 101,
      }),
      400,
      'selector rechaza taxonomy_per_page fuera de limite',
    );
    assertStatus(
      await marketingSelectors(fixtureByKey.readonly),
      403,
      'Read-only no consume selectores de Marketing',
    );
    assertStatus(
      await marketingSelectors(fixtureByKey.custom),
      403,
      'custom Seguridad no consume selectores de Marketing',
    );
    assertStatus(
      await analyticsSummary(fixtureByKey.custom),
      403,
      'custom Seguridad no consume analytics',
    );

    for (const collection of [
      'orders', 'products', 'categories', 'subcategories',
      'store_analytics_events', 'manual_coupon_usages',
    ]) {
      const rawList = await request(`/api/collections/${collection}/records?perPage=10`, {
        token: fixtureByKey.marketing.currentToken,
      });
      assertStatus(rawList, 403, `Marketing no lee raw ${collection}`);
    }
    for (const [collection, id] of [
      ['products', fixtureByKey.marketing.product.id],
      ['categories', fixtureByKey.marketing.category.id],
      ['subcategories', fixtureByKey.marketing.subcategory.id],
      ['store_analytics_events', fixtureByKey.marketing.analyticsEvents[0].id],
    ]) {
      assertStatus(
        await request(`/api/collections/${collection}/records/${id}`, {
          token: fixtureByKey.marketing.currentToken,
        }),
        403,
        `Marketing no ve raw ${collection}`,
      );
    }
    assertStatus(
      await request(
        `/api/collections/manual_coupon_usages/records/${fixtureByKey.marketing.couponUsage.id}`,
        {
          token: fixtureByKey.marketing.currentToken,
          method: 'PATCH',
          body: { discount_usd: 7.17 },
        },
      ),
      403,
      'Marketing no muta usos manuales de cupon',
    );

    async function marketingCollectionQuery(collection, queryValues) {
      const query = new URLSearchParams({ perPage: '10', ...queryValues });
      return request(`/api/collections/${collection}/records?${query}`, {
        token: fixtureByKey.marketing.currentToken,
      });
    }

    for (const [collection, expectedId] of [
      ['settings', fixtureByKey.marketing.settings.id],
      ['automatic_promotions', fixtureByKey.marketing.promotion.id],
      ['manual_coupons', fixtureByKey.marketing.coupon.id],
      ['store_visual_items', fixtureByKey.marketing.visualItem.id],
    ]) {
      const safeQuery = await marketingCollectionQuery(collection, {
        filter: 'active = true',
        sort: '-created',
      });
      assertStatus(safeQuery, 200, `Marketing conserva query directa segura ${collection}`);
      assert.equal(
        safeQuery.data.items.some((item) => item.id === expectedId),
        true,
        `query segura encuentra fixture ${collection}`,
      );
    }

    for (const [collection, queryValues, label] of [
      ['settings', { filter: 'business_notes != ""' }, 'filter settings.business_notes'],
      ['settings', { sort: 'order_prefix' }, 'sort settings.order_prefix'],
      [
        'automatic_promotions',
        { filter: 'product.cost_usd > 0' },
        'filter automatic_promotions.product.cost_usd',
      ],
      [
        'automatic_promotions',
        { sort: 'product.stock' },
        'sort automatic_promotions.product.stock',
      ],
      [
        'manual_coupons',
        { filter: 'product.expiration_date != ""' },
        'filter manual_coupons.product.expiration_date',
      ],
      [
        'manual_coupons',
        { expand: 'product', fields: 'id,expand.product.expiration_date' },
        'expand manual_coupons.product.expiration_date',
      ],
      [
        'store_visual_items',
        { filter: 'category.store != ""' },
        'filter store_visual_items.category.store',
      ],
      [
        'store_visual_items',
        { sort: 'category.name' },
        'sort store_visual_items.category.name',
      ],
    ]) {
      assertStatus(
        await marketingCollectionQuery(collection, queryValues),
        403,
        `Marketing no usa oraculo por ${label}`,
      );
    }

    const directOrder = await request(
      `/api/collections/orders/records/${fixtureByKey.marketing.order.id}`,
      { token: ordersReader.currentToken },
    );
    assertStatus(directOrder, 200, 'custom orders.view lee pedido directo redactado');
    assert.equal(directOrder.data.id, fixtureByKey.marketing.order.id);
    for (const field of [
      'customer_phone', 'customer_email', 'customer_address', 'customer',
      'receipt_token', 'review_token',
    ]) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(directOrder.data, field),
        false,
        `pedido directo oculta ${field}`,
      );
    }
    assertSerializedExcludes(directOrder.data, [
      fixtureByKey.marketing.order.customer_phone,
      fixtureByKey.marketing.order.receipt_token,
    ], 'pedido directo sin contacto ni tokens');

    async function ordersReaderQuery(collection, queryValues) {
      const query = new URLSearchParams({ perPage: '10', ...queryValues });
      return request(`/api/collections/${collection}/records?${query}`, {
        token: ordersReader.currentToken,
      });
    }

    const safeOrdersQuery = await ordersReaderQuery('orders', {
      filter: 'status = "pending"',
      sort: '-created',
    });
    assertStatus(safeOrdersQuery, 200, 'custom orders.view conserva query operativa segura');
    assert.equal(
      safeOrdersQuery.data.items.some((item) => item.id === fixtureByKey.marketing.order.id),
      true,
      'query segura encuentra pedido propio',
    );
    for (const item of safeOrdersQuery.data.items) {
      for (const field of [
        'customer_phone', 'customer_email', 'customer_address', 'customer',
        'receipt_token', 'review_token',
      ]) {
        assert.equal(Object.prototype.hasOwnProperty.call(item, field), false, `lista pedidos oculta ${field}`);
      }
    }
    const safeOrderItemsQuery = await ordersReaderQuery('order_items', {
      filter: `order = "${fixtureByKey.marketing.order.id}"`,
      sort: 'created',
    });
    assertStatus(safeOrderItemsQuery, 200, 'custom orders.view lee order_items propios');
    assert.ok(safeOrderItemsQuery.data.items.length > 0, 'pedido canonico conserva order_items');

    for (const [collection, queryValues, label] of [
      ['orders', { filter: 'customer_phone ~ "555"' }, 'filter orders.customer_phone'],
      ['orders', { sort: 'customer_address' }, 'sort orders.customer_address'],
      ['orders', { filter: 'receipt_token != ""' }, 'filter orders.receipt_token'],
      ['orders', { filter: 'review_token != ""' }, 'filter orders.review_token'],
      ['orders', { sort: 'review_token' }, 'sort orders.review_token'],
      [
        'order_items',
        { filter: 'order.customer_phone ~ "555"' },
        'filter order_items.order.customer_phone',
      ],
      [
        'order_items',
        { filter: 'order.review_token != ""' },
        'filter order_items.order.review_token',
      ],
    ]) {
      assertStatus(
        await ordersReaderQuery(collection, queryValues),
        403,
        `custom orders.view no usa oraculo por ${label}`,
      );
    }

    const marketingSettings = await request('/api/collections/settings/records?perPage=10', {
      token: fixtureByKey.marketing.currentToken,
    });
    assertStatus(marketingSettings, 200, 'Marketing lista settings redactados');
    assert.equal(marketingSettings.data.items.length, 1);
    const settingsItem = marketingSettings.data.items[0];
    assert.equal(settingsItem.id, fixtureByKey.marketing.settings.id);
    assert.equal(settingsItem.marketing_bar_text, `${prefix} Marketing Bar Initial`);
    assert.equal(Object.prototype.hasOwnProperty.call(settingsItem, 'business_notes'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(settingsItem, 'order_prefix'), false);
    assertSerializedExcludes(settingsItem, [
      `${prefix} BUSINESS NOTES PRIVATE`,
      'MKT',
    ], 'settings Marketing redactados');

    const patchedMarketingBar = `${prefix} Marketing Bar Patched`;
    const settingsPatch = await request(
      `/api/collections/settings/records/${fixtureByKey.marketing.settings.id}`,
      {
        token: fixtureByKey.marketing.currentToken,
        method: 'PATCH',
        body: { marketing_bar_text: patchedMarketingBar },
      },
    );
    assertStatus(settingsPatch, 200, 'Marketing actualiza solo su campo permitido');
    assert.equal(settingsPatch.data.marketing_bar_text, patchedMarketingBar);
    assert.equal(Object.prototype.hasOwnProperty.call(settingsPatch.data, 'business_notes'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(settingsPatch.data, 'order_prefix'), false);
    assertSerializedExcludes(settingsPatch.data, [
      `${prefix} BUSINESS NOTES PRIVATE`,
      'MKT',
    ], 'respuesta PATCH de settings redactada');

    const landingQrTitle = `${prefix} Landing QR Safe`;
    const landingQrSubtitle = `${prefix} Landing QR Subtitle`;
    const landingQrPatch = await request(
      `/api/collections/settings/records/${fixtureByKey.marketing.settings.id}`,
      {
        token: fixtureByKey.marketing.currentToken,
        method: 'PATCH',
        body: {
          landing_qr_title: landingQrTitle,
          landing_qr_subtitle: landingQrSubtitle,
        },
      },
    );
    assertStatus(landingQrPatch, 200, 'Marketing actualiza solo campos landing_qr permitidos');
    assert.equal(landingQrPatch.data.landing_qr_title, landingQrTitle);
    assert.equal(landingQrPatch.data.landing_qr_subtitle, landingQrSubtitle);
    assert.equal(Object.prototype.hasOwnProperty.call(landingQrPatch.data, 'business_notes'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(landingQrPatch.data, 'order_prefix'), false);
    assertSerializedExcludes(landingQrPatch.data, [
      `${prefix} BUSINESS NOTES PRIVATE`,
      'MKT',
    ], 'respuesta PATCH landing QR redactada');
    assertStatus(
      await request(`/api/collections/settings/records/${fixtureByKey.marketing.settings.id}`, {
        token: fixtureByKey.marketing.currentToken,
        method: 'PATCH',
        body: {
          active: false,
          store_name: `${prefix} FORBIDDEN STORE NAME`,
        },
      }),
      403,
      'Marketing no modifica active ni store_name',
    );
    assertStatus(
      await request(`/api/collections/settings/records/${fixtureByKey.marketing.settings.id}`, {
        token: fixtureByKey.marketing.currentToken,
        method: 'PATCH',
        body: {
          business_notes: `${prefix} FORBIDDEN NOTES`,
          order_prefix: 'BAD',
        },
      }),
      403,
      'Marketing no modifica settings generales privados',
    );

    const securityRoute = '/api/pz/security/monitoring-summary';
    assertStatus(
      await request(securityRoute, {
        token: fixtureByKey.marketing.currentToken,
        body: { store_id: fixtureByKey.marketing.store.id },
      }),
      403,
      'Marketing no accede a Seguridad',
    );
    assertStatus(
      await request(securityRoute, {
        token: fixtureByKey.readonly.currentToken,
        body: { store_id: fixtureByKey.readonly.store.id },
      }),
      403,
      'Read-only no accede a Seguridad',
    );
    const customSecurity = await request(securityRoute, {
      token: fixtureByKey.custom.currentToken,
      body: { store_id: fixtureByKey.custom.store.id },
    });
    assertStatus(customSecurity, 200, 'custom conserva security.view funcional');
    assertExactKeys(customSecurity.data, [
      'ok', 'active_customers_count', 'archived_customers_count', 'events_count',
      'visitors_today_count', 'watch_customers_count', 'blocked_customers_count',
    ], 'resumen Seguridad custom');
    assert.equal(customSecurity.data.ok, true);
    for (const key of Object.keys(customSecurity.data).filter((key) => key.endsWith('_count'))) {
      assert.equal(typeof customSecurity.data[key], 'number', `contador Seguridad ${key}`);
    }
    assertStatus(
      await request(securityRoute, {
        token: fixtureByKey.custom.currentToken,
        body: { store_id: fixtureByKey.marketing.store.id },
      }),
      404,
      'Seguridad no filtra existencia de otra tienda',
    );

    const auditSchema = await request('/api/collections/store_user_audit', { token: superToken });
    assertStatus(auditSchema, 200, 'leer esquema de auditoria posterior a C3');
    const actionField = auditSchema.data.fields.find((field) => field.name === 'action');
    assert.ok(actionField);
    assert.equal(
      actionField.values.filter((value) => value === 'team_permissions_normalized').length,
      1,
    );
  } catch (error) {
    failure = error;
  } finally {
    try {
      await stopPocketBase(runtime);
    } catch (stopError) {
      if (!failure) failure = stopError;
      else failure.message += `\nError al cerrar PocketBase: ${stopError.stack || stopError.message}`;
    }
    if (failure && runtime && runtime.output()) {
      failure.message += `\nPocketBase log (cola):\n${runtime.output()}`;
    }
    try {
      assertOwnedTempDirectory(tempDirectory);
      fs.rmSync(tempDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      assert.equal(fs.existsSync(tempDirectory), false, `no se limpio ${tempDirectory}`);
      if (!tempRootExisted && fs.existsSync(TEMP_ROOT) && fs.readdirSync(TEMP_ROOT).length === 0) {
        fs.rmdirSync(TEMP_ROOT);
      }
    } catch (cleanupError) {
      if (!failure) failure = cleanupError;
      else failure.message += `\nError de cleanup: ${cleanupError.stack || cleanupError.message}`;
    }
  }

  if (failure) throw failure;
});
