'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

const permissionCatalog = require('../pb_hooks/pz_store_team_permissions_lib.js');

const BACKEND_DIR = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const TEMP_ROOT = path.join(BACKEND_DIR, '.tmp');
const TEMP_PREFIX = 'V7E9C3QA_';
const LOOPBACK = '127.0.0.1';
const EXPIRATION_NOTIFICATION_TYPES = [
  'product_expiring_soon',
  'product_expiring_critical',
  'product_expired',
  'variation_expiring_soon',
  'variation_expiring_critical',
  'variation_expired',
];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function opaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url').slice(0, bytes);
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

function havanaCivilDate(days = 0) {
  const date = new Date(Date.now() + days * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Havana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
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
  assert.equal(
    result.status,
    0,
    `bootstrap superuser fallo (exit=${result.status}): ${result.error || ''}\n${result.stdout || ''}\n${result.stderr || ''}`,
  );
}

function runMigrationCommand(direction, dataDirectory, migrationsDirectory, env) {
  const args = ['migrate', direction];
  if (direction === 'down') args.push('1');
  args.push(...pocketBaseFlags(dataDirectory, migrationsDirectory));
  const result = spawnSync(POCKETBASE_EXE, args, {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
    env,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `migrate ${direction} fallo (exit=${result.status}): ${result.error || ''}\n${result.stdout || ''}\n${result.stderr || ''}`,
  );
  return `${result.stdout || ''}\n${result.stderr || ''}`;
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
  return { child, output: () => output, spawnError: () => spawnError };
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
  const graceful = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
  if (graceful || runtime.child.exitCode !== null) return;
  runtime.child.kill('SIGKILL');
  await Promise.race([exited, delay(5000)]);
  assert.notEqual(runtime.child.exitCode, null, `PocketBase no termino.\n${runtime.output()}`);
}

function assertOwnedTempDirectory(directory) {
  const resolvedRoot = path.resolve(TEMP_ROOT);
  const resolvedDirectory = path.resolve(directory);
  assert.equal(path.dirname(resolvedDirectory), resolvedRoot, `directorio temporal fuera de alcance: ${resolvedDirectory}`);
  assert.match(path.basename(resolvedDirectory), /^V7E9C3QA_[A-Za-z0-9_-]+$/);
}

async function apiRequest(baseUrl, route, { token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw, headers: Object.fromEntries(response.headers.entries()) };
}

function assertStatus(result, expected, label) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  assert.ok(accepted.includes(result.status), `${label}: HTTP ${result.status}; esperados ${accepted.join('/')}\n${result.raw}`);
}

function close(actual, expected, label) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) < 0.000001, `${label}: ${actual} != ${expected}`);
}

test('V7E9-C3 HTTP runtime valida borrado, permisos, comercio, precio y downgrade', { timeout: 180000 }, async () => {
  assert.equal(fs.existsSync(POCKETBASE_EXE), true, `falta binario PocketBase: ${POCKETBASE_EXE}`);
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const tempDirectory = fs.mkdtempSync(path.join(TEMP_ROOT, TEMP_PREFIX));
  assertOwnedTempDirectory(tempDirectory);
  const dataDirectory = path.join(tempDirectory, 'pb_data');
  const runtimeMigrationsDirectory = path.join(tempDirectory, 'pb_migrations');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.cpSync(MIGRATIONS_DIR, runtimeMigrationsDirectory, { recursive: true });

  const stamp = Date.now();
  const suffix = `${stamp.toString(36)}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
  const prefix = `V7E9C3QA_${stamp}`;
  const slugPrefix = `v7e9c3qa-${suffix}`;
  const superEmail = `${slugPrefix}-super@example.test`;
  const superPassword = runtimePassword('superuser');
  const passwords = {
    master: runtimePassword('master'),
    premium: runtimePassword('premium-primary'),
    other: runtimePassword('other-primary'),
    basic: runtimePassword('basic-primary'),
    free: runtimePassword('free-primary'),
  };
  const env = runtimeEnvironment();
  let runtime = null;
  let failure = null;

  try {
    bootstrapSuperuser(dataDirectory, runtimeMigrationsDirectory, superEmail, superPassword, env);
    const firstMigrationUp = runMigrationCommand('up', dataDirectory, runtimeMigrationsDirectory, env);
    const migrationDown = runMigrationCommand('down', dataDirectory, runtimeMigrationsDirectory, env);
    const secondMigrationUp = runMigrationCommand('up', dataDirectory, runtimeMigrationsDirectory, env);
    const migrationUpOutput = `${firstMigrationUp}\n${migrationDown}\n${secondMigrationUp}`;
    const port = await freeLoopbackPort();
    const baseUrl = `http://${LOOPBACK}:${port}`;
    runtime = startPocketBase(dataDirectory, runtimeMigrationsDirectory, port, env);
    await waitForPocketBase(runtime, baseUrl);

    const request = (route, options) => apiRequest(baseUrl, route, options);
    let superToken = '';
    let masterToken = '';

    async function createRecord(collection, body, token = superToken) {
      const result = await request(`/api/collections/${collection}/records`, { token, body });
      assertStatus(result, 200, `crear ${collection}`);
      return result.data;
    }

    async function patchRecord(collection, id, body, token) {
      return request(`/api/collections/${collection}/records/${id}`, { token, method: 'PATCH', body });
    }

    async function readRecord(collection, id) {
      const result = await request(`/api/collections/${collection}/records/${id}`, { token: superToken });
      assertStatus(result, 200, `leer ${collection}/${id}`);
      return result.data;
    }

    async function listRecords(collection, filter = '') {
      const query = new URLSearchParams({ page: '1', perPage: '500' });
      if (filter) query.set('filter', filter);
      const result = await request(`/api/collections/${collection}/records?${query}`, { token: superToken });
      assertStatus(result, 200, `listar ${collection}`);
      return result.data?.items || [];
    }

    async function login(user, password, device) {
      return request('/api/collections/users/auth-with-password', {
        body: { identity: user.email, password },
        headers: { 'X-PZ-Admin-Device': device },
      });
    }

    async function changePlan(store, plan, confirmExpirationCleanup = false) {
      return request('/api/pz/master/store-plan/change', {
        token: masterToken,
        body: {
          store_id: store.id,
          plan,
          is_permanent: plan !== 'free',
          duration_months: 0,
          reason: `${prefix} cambio de plan`,
          confirm_expiration_cleanup: confirmExpirationCleanup,
        },
      });
    }

    async function expirationEndpoint(token) {
      return request('/api/pz/admin/product-expirations', {
        token,
        body: { view: 'summary', window_days: 30, page: 1, page_size: 10, query: '' },
      });
    }

    const auth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: superEmail, password: superPassword },
    });
    assertStatus(auth, 200, 'autenticar superuser efimero');
    superToken = auth.data.token;
    const cycleSchema = await request('/api/collections/product_expiration_cycles', { token: superToken });
    assertStatus(cycleSchema, 200, 'leer esquema de ciclos');
    const thresholdSchema = cycleSchema.data.fields.find((field) => field.name === 'threshold');
    assert.equal(thresholdSchema.required, false, `migracion habilita umbral numerico 0\n${migrationUpOutput}`);

    const storePremium = await createRecord('stores', { name: `${prefix} Premium`, slug: `${slugPrefix}-premium`, status: 'active' });
    const storeOther = await createRecord('stores', { name: `${prefix} Other`, slug: `${slugPrefix}-other`, status: 'active' });
    const storeBasic = await createRecord('stores', { name: `${prefix} Basic`, slug: `${slugPrefix}-basic`, status: 'active' });
    const storeFree = await createRecord('stores', { name: `${prefix} Free`, slug: `${slugPrefix}-free`, status: 'active' });

    const master = await createRecord('users', {
      email: `${slugPrefix}-master@example.test`, password: passwords.master, passwordConfirm: passwords.master,
      display_name: `${prefix} Master`, role: 'master_admin', status: 'active', emailVisibility: true,
    });
    const primarySpecs = [
      ['premium', storePremium, passwords.premium],
      ['other', storeOther, passwords.other],
      ['basic', storeBasic, passwords.basic],
      ['free', storeFree, passwords.free],
    ];
    const principals = {};
    for (const [key, store, password] of primarySpecs) {
      principals[key] = await createRecord('users', {
        store: store.id,
        email: `${slugPrefix}-${key}@example.test`,
        password,
        passwordConfirm: password,
        display_name: `${prefix} Primary ${key}`,
        role: 'store_admin',
        status: 'active',
        emailVisibility: true,
      });
    }

    const masterAuth = await login(master, passwords.master, 'M'.repeat(43));
    assertStatus(masterAuth, 200, 'login Master');
    masterToken = masterAuth.data.token;
    for (const [store, plan] of [
      [storePremium, 'premium'], [storeOther, 'premium'], [storeBasic, 'basic'], [storeFree, 'free'],
    ]) assertStatus(await changePlan(store, plan), 200, `activar ${plan}`);
    for (const [key, store] of primarySpecs.map(([key, store]) => [key, store])) {
      const assigned = await request('/api/pz/master/primary-admin/assign', {
        token: masterToken,
        body: { store_id: store.id, user_id: principals[key].id, reason: `${prefix} asignar principal` },
      });
      assertStatus(assigned, 200, `asignar principal ${key}`);
    }

    const tokens = {};
    let deviceIndex = 0;
    for (const [key, , password] of primarySpecs) {
      const logged = await login(principals[key], password, String.fromCharCode(65 + deviceIndex).repeat(43));
      assertStatus(logged, 200, `login principal ${key}`);
      tokens[key] = logged.data.token;
      deviceIndex += 1;
    }

    const teamCreate = async (suffixName, permissions) => request('/api/pz/store/team/create', {
      token: tokens.premium,
      body: {
        email: `${slugPrefix}-${suffixName}@example.test`,
        display_name: `${prefix} ${suffixName}`,
        phone: '',
        template_code: 'custom',
        permissions,
        reason: `${prefix} crear ${suffixName}`,
      },
    });
    const expirationPermissions = permissionCatalog.normalizePermissions(['catalog.expirations.manage']);
    const memberCreated = await teamCreate('expiration-member', expirationPermissions);
    assertStatus(memberCreated, 200, 'crear adicional con permiso granular');
    const deniedCreated = await teamCreate('denied-member', []);
    assertStatus(deniedCreated, 200, 'crear adicional sin permiso granular');
    const member = memberCreated.data.user;
    const deniedMember = deniedCreated.data.user;
    const memberAuth = await login(member, memberCreated.data.temporary_password, 'E'.repeat(43));
    const deniedAuth = await login(deniedMember, deniedCreated.data.temporary_password, 'F'.repeat(43));
    assertStatus(memberAuth, 200, 'login adicional con permiso');
    assertStatus(deniedAuth, 200, 'login adicional sin permiso');
    const memberToken = memberAuth.data.token;
    const deniedToken = deniedAuth.data.token;

    const usd = await createRecord('currencies', {
      store: storePremium.id, code: 'USD', name: `${prefix} USD`, symbol: '$', exchange_rate: 1,
      active: true, is_default: true, is_base: true,
    });
    await createRecord('settings', {
      store: storePremium.id,
      stored_name: `${prefix} Nombre de tienda extremadamente largo para footer`,
      store_name: `${prefix} Nombre de tienda extremadamente largo para footer`,
      whatsapp_number: '+15550199',
      default_currency: usd.id,
      active: true,
      order_prefix: 'QA',
      notifications_enabled: true,
      notify_new_order: true,
      notify_expiration_alerts: true,
    }, tokens.premium);

    async function createProduct(suffixName, store = storePremium, extra = {}) {
      return createRecord('products', {
        store: store.id,
        name: `${prefix} ${suffixName}`,
        slug: `${slugPrefix}-${suffixName}`,
        active: true,
        base_price_usd: 10,
        regular_price_usd: 10,
        stock: 20,
        track_stock: true,
        has_variations: false,
        delivery_mode: 'both',
        ...extra,
      });
    }

    const expirationFilter = EXPIRATION_NOTIFICATION_TYPES.map((type) => `type="${type}"`).join(' || ');
    const storeCycles = () => listRecords('product_expiration_cycles', `store="${storePremium.id}"`);
    const storeExpirationNotifications = () => listRecords(
      'store_notifications',
      `store="${storePremium.id}" && (${expirationFilter})`,
    );
    const storeNonExpirationNotifications = async () => (
      await listRecords('store_notifications', `store="${storePremium.id}"`)
    ).filter((notification) => !EXPIRATION_NOTIFICATION_TYPES.includes(notification.type));

    const mainProduct = await createProduct('main-product');
    const firstDate = havanaCivilDate(20);
    const primarySave = await patchRecord('products', mainProduct.id, { expiration_date: firstDate }, tokens.premium);
    assertStatus(primarySave, 200, 'Premium principal guarda fecha');
    assert.equal(String(primarySave.data.expiration_date).slice(0, 10), firstDate);
    assert.equal((await storeCycles()).length, 1, 'guardar crea un ciclo vigente');
    assert.equal((await storeExpirationNotifications()).length, 1, 'guardar crea una alerta vigente');
    assertStatus(await expirationEndpoint(tokens.premium), 200, 'principal consulta endpoint Premium');

    const primaryClear = await patchRecord('products', mainProduct.id, { expiration_date: null }, tokens.premium);
    assertStatus(primaryClear, 200, 'Premium principal borra fecha con null');
    assert.equal(String(primaryClear.data.expiration_date || ''), '');
    assert.equal((await storeCycles()).length, 0, 'null limpia ciclos');
    assert.equal((await storeExpirationNotifications()).length, 0, 'null limpia alertas');

    assertStatus(await patchRecord('products', mainProduct.id, { expiration_date: firstDate }, tokens.premium), 200, 'restaurar para multipart');
    const multipartBody = new FormData();
    multipartBody.append('expiration_date', '');
    const multipartClear = await patchRecord('products', mainProduct.id, multipartBody, tokens.premium);
    assertStatus(multipartClear, 200, 'multipart vacio borra fecha');
    assert.equal(String(multipartClear.data.expiration_date || ''), '');
    assert.equal((await storeCycles()).length, 0, 'multipart vacio no deja ciclos');
    assert.equal((await storeExpirationNotifications()).length, 0, 'multipart vacio no deja alertas');

    const invalidDate = await patchRecord('products', mainProduct.id, { expiration_date: '2099-12-30T05:00:00Z' }, tokens.premium);
    assertStatus(invalidDate, 400, 'DateTime arbitrario se rechaza');
    assert.match(invalidDate.raw, /invalid_expiration_date/);
    assert.equal(String((await readRecord('products', mainProduct.id)).expiration_date || ''), '');

    const memberProduct = await createProduct('member-product');
    const changedDate = havanaCivilDate(45);
    assertStatus(await patchRecord('products', memberProduct.id, { expiration_date: changedDate }, memberToken), 200, 'adicional guarda fecha general');
    let memberCycles = await listRecords('product_expiration_cycles', `entity_id="${memberProduct.id}"`);
    assert.equal(memberCycles.length, 1);
    assert.equal(String(memberCycles[0].expiration_date).slice(0, 10), changedDate);
    assertStatus(await patchRecord('products', memberProduct.id, { expiration_date: firstDate }, memberToken), 200, 'cambiar fecha reemplaza ciclo');
    memberCycles = await listRecords('product_expiration_cycles', `entity_id="${memberProduct.id}"`);
    assert.equal(memberCycles.length, 1, 'cambio conserva solo el ciclo nuevo');
    assert.equal(String(memberCycles[0].expiration_date).slice(0, 10), firstDate);
    assertStatus(await patchRecord('products', memberProduct.id, { expiration_date: '' }, memberToken), 200, 'adicional borra fecha general');
    assert.equal((await listRecords('product_expiration_cycles', `entity_id="${memberProduct.id}"`)).length, 0);

    const variationProduct = await createProduct('variation-product', storePremium, { has_variations: true, stock: 0 });
    assertStatus(await patchRecord('products', variationProduct.id, { expiration_date: firstDate }, memberToken), 200, 'adicional guarda fecha general antes de modo variaciones');
    const variationOne = await createRecord('product_variations', {
      store: storePremium.id, product: variationProduct.id, variation_type: 'Color', value: `${prefix} Roja`,
      active: true, price_usd: 12, stock: 8,
    });
    const variationTwo = await createRecord('product_variations', {
      store: storePremium.id, product: variationProduct.id, variation_type: 'Color', value: `${prefix} Azul`,
      active: true, price_usd: 14, stock: 8,
    });
    assertStatus(await patchRecord('product_variations', variationOne.id, { expiration_date: havanaCivilDate(25) }, memberToken), 200, 'primera fecha individual permitida');
    assert.equal(String((await readRecord('products', variationProduct.id)).expiration_date || ''), '', 'primera individual limpia general incompatible');
    assertStatus(await patchRecord('product_variations', variationTwo.id, { expiration_date: changedDate }, memberToken), 200, 'segunda fecha individual permitida');
    assertStatus(await patchRecord('product_variations', variationOne.id, { expiration_date: null }, memberToken), 200, 'borrar fecha de variacion');
    assert.equal((await listRecords('product_expiration_cycles', `entity_id="${variationOne.id}"`)).length, 0);
    assertStatus(await patchRecord('product_variations', variationTwo.id, { expiration_date: '' }, memberToken), 200, 'borrar ultima fecha individual');
    assert.equal(String((await readRecord('product_variations', variationTwo.id)).expiration_date || ''), '');
    assert.equal(String((await readRecord('products', variationProduct.id)).expiration_date || ''), '', 'no restaura fecha general');
    assert.equal((await listRecords('product_expiration_cycles', `product="${variationProduct.id}"`)).length, 0);

    const deniedWrite = await patchRecord('products', memberProduct.id, { expiration_date: firstDate }, deniedToken);
    assertStatus(deniedWrite, 403, 'sin permiso recibe 403');
    assert.match(deniedWrite.raw, /permission_denied/);
    assertStatus(await expirationEndpoint(deniedToken), 403, 'sin permiso no consulta endpoint');
    assertStatus(await expirationEndpoint(tokens.basic), 403, 'endpoint Premium bloqueado en Basic');
    assertStatus(await expirationEndpoint(tokens.free), 403, 'endpoint Premium bloqueado en Free');
    assertStatus(await expirationEndpoint(masterToken), 403, 'Master no usa endpoint privado de tienda');

    const basicProduct = await createProduct('basic-product', storeBasic);
    const freeProduct = await createProduct('free-product', storeFree);
    assertStatus(await patchRecord('products', basicProduct.id, { expiration_date: firstDate }, tokens.basic), 403, 'Basic no guarda fechas');
    assertStatus(await patchRecord('products', freeProduct.id, { expiration_date: firstDate }, tokens.free), 403, 'Free no guarda fechas');
    assert.equal(String((await readRecord('products', basicProduct.id)).expiration_date || ''), '');
    assert.equal(String((await readRecord('products', freeProduct.id)).expiration_date || ''), '');

    const otherProduct = await createProduct('other-product', storeOther);
    assertStatus(await patchRecord('products', otherProduct.id, { expiration_date: firstDate }, memberToken), 404, 'otra tienda permanece oculta');
    assertStatus(await patchRecord('products', mainProduct.id, { expiration_date: firstDate }, masterToken), 403, 'Master no modifica vencimiento de tienda');

    let checkoutSequence = 0;
    async function checkout(product, variation = null, malicious = false) {
      checkoutSequence += 1;
      const item = {
        product_id: product.id,
        quantity: 1,
        ...(variation ? { variation_id: variation.id } : {}),
        ...(malicious ? { unit_price_usd: 0.01, product_name: `${prefix} Nombre manipulado` } : {}),
      };
      return request('/api/pz/checkout/orders', {
        body: {
          store_id: storePremium.id,
          idempotency_key: opaqueToken(),
          customer_name: `${prefix} Cliente ${checkoutSequence}`,
          customer_phone: '+1 555 0109',
          currency_id: usd.id,
          delivery_method: 'pickup',
          items: [item],
        },
      });
    }

    const expiredProduct = await createProduct('expired-product');
    const today = havanaCivilDate(0);
    assertStatus(await patchRecord('products', expiredProduct.id, { expiration_date: today }, tokens.premium), 200, 'configurar producto vencido');
    const rejectedProductCheckout = await checkout(expiredProduct);
    assertStatus(rejectedProductCheckout, 422, 'checkout rechaza producto vencido');
    assert.deepEqual(rejectedProductCheckout.data, { ok: false, error: 'order_unavailable' });
    assert.equal(rejectedProductCheckout.raw.includes(today), false, 'respuesta no revela fecha');
    assert.equal(/expir|venc/i.test(rejectedProductCheckout.raw), false, 'respuesta no revela motivo');

    const commerceVariationProduct = await createProduct('commerce-variation', storePremium, { has_variations: true, stock: 0 });
    const expiredVariation = await createRecord('product_variations', {
      store: storePremium.id, product: commerceVariationProduct.id, variation_type: 'Talla', value: `${prefix} Expired`,
      active: true, price_usd: 12, stock: 8,
    });
    const validVariation = await createRecord('product_variations', {
      store: storePremium.id, product: commerceVariationProduct.id, variation_type: 'Talla', value: `${prefix} Valid`,
      active: true, price_usd: 14, stock: 8,
    });
    assertStatus(await patchRecord('product_variations', expiredVariation.id, { expiration_date: today }, memberToken), 200, 'configurar variacion vencida');
    assertStatus(await checkout(commerceVariationProduct, expiredVariation), 422, 'checkout rechaza variacion vencida');
    assertStatus(await checkout(commerceVariationProduct, validVariation), 200, 'otra variacion vendible conserva producto disponible');

    const canonicalProduct = await createProduct('canonical-product', storePremium, { base_price_usd: 17, regular_price_usd: 17 });
    const canonicalCheckout = await checkout(canonicalProduct, null, true);
    assertStatus(canonicalCheckout, 200, 'checkout canonico acepta request sin confiar en precio');
    assert.equal(canonicalCheckout.data.items[0].product_name, canonicalProduct.name);
    close(canonicalCheckout.data.items[0].unit_price_final_usd, 17, 'precio final canonico');
    const canonicalOrder = canonicalCheckout.data.order;
    const directManipulation = await request('/api/collections/order_items/records', {
      body: {
        order: canonicalOrder.id,
        product: canonicalProduct.id,
        product_name: `${prefix} Nombre manipulado`,
        quantity: 1,
        unit_price_usd: 0.01,
        line_total_usd: 0.01,
      },
    });
    assertStatus(directManipulation, [400, 401, 403, 404], 'F12 no crea order_item directo manipulado');
    const manipulatedItems = await listRecords(
      'order_items',
      `order.store="${storePremium.id}" && (unit_price_usd=0.01 || product_name="${prefix} Nombre manipulado")`,
    );
    assert.equal(manipulatedItems.length, 0, '0 order_items conservan precio o nombre manipulado');

    const actorActivities = await listRecords(
      'store_activity_audit',
      `store="${storePremium.id}" && actor="${principals.premium.id}" && resource_id_snapshot="${mainProduct.id}"`,
    );
    assert.ok(actorActivities.some((event) => String(event.changed_fields_json || '').includes('expiration_date')), 'actividad M7U2 registra cambio de vencimiento');
    assert.ok(actorActivities.every((event) => event.actor === principals.premium.id), 'actividad conserva actor correcto');
    const memberActivities = await listRecords(
      'store_activity_audit',
      `store="${storePremium.id}" && actor="${member.id}" && resource_id_snapshot="${memberProduct.id}"`,
    );
    assert.ok(memberActivities.length >= 2, 'actividad registra al adicional como actor');

    const downgradeProduct = await createProduct('downgrade-product', storePremium, { base_price_usd: 23, regular_price_usd: 23, stock: 11 });
    const downgradeVariationProduct = await createProduct('downgrade-variation-product', storePremium, { has_variations: true, stock: 0 });
    const downgradeVariation = await createRecord('product_variations', {
      store: storePremium.id, product: downgradeVariationProduct.id, variation_type: 'Color', value: `${prefix} Verde`,
      active: true, price_usd: 19, stock: 7,
    });
    assertStatus(await patchRecord('products', downgradeProduct.id, { expiration_date: firstDate }, tokens.premium), 200, 'preparar fecha general para downgrade');
    assertStatus(await patchRecord('product_variations', downgradeVariation.id, { expiration_date: changedDate }, tokens.premium), 200, 'preparar fecha individual para downgrade');
    const cyclesBeforeDowngrade = (await storeCycles()).length;
    const alertsBeforeDowngrade = (await storeExpirationNotifications()).length;
    const nonExpirationBefore = (await storeNonExpirationNotifications()).length;
    const productCountBefore = (await listRecords('products', `store="${storePremium.id}"`)).length;
    const variationCountBefore = (await listRecords('product_variations', `product.store="${storePremium.id}"`)).length;
    assert.ok(cyclesBeforeDowngrade > 0 && alertsBeforeDowngrade > 0, 'fixtures de downgrade tienen ciclos y alertas');

    const cancelledDowngrade = await changePlan(storePremium, 'basic', false);
    assertStatus(cancelledDowngrade, 409, 'downgrade sin confirmacion se cancela');
    assert.equal(String((await readRecord('products', downgradeProduct.id)).expiration_date).slice(0, 10), firstDate);
    assert.equal(String((await readRecord('product_variations', downgradeVariation.id)).expiration_date).slice(0, 10), changedDate);
    assert.equal((await storeCycles()).length, cyclesBeforeDowngrade, 'cancelar conserva ciclos');
    assert.equal((await storeExpirationNotifications()).length, alertsBeforeDowngrade, 'cancelar conserva alertas');

    const confirmedDowngrade = await changePlan(storePremium, 'basic', true);
    assertStatus(confirmedDowngrade, 200, 'downgrade confirmado');
    assert.ok(confirmedDowngrade.data.expiration_cleanup_result, 'respuesta informa limpieza');
    assert.equal(String((await readRecord('products', downgradeProduct.id)).expiration_date || ''), '');
    assert.equal(String((await readRecord('product_variations', downgradeVariation.id)).expiration_date || ''), '');
    assert.equal((await storeCycles()).length, 0, 'downgrade limpia todos los ciclos');
    assert.equal((await storeExpirationNotifications()).length, 0, 'downgrade limpia todas las alertas V7E9');
    assert.equal((await listRecords('products', `store="${storePremium.id}"`)).length, productCountBefore, 'productos se conservan');
    assert.equal((await listRecords('product_variations', `product.store="${storePremium.id}"`)).length, variationCountBefore, 'variaciones se conservan');
    assert.equal((await storeNonExpirationNotifications()).length, nonExpirationBefore, 'otras notificaciones se conservan');
    const downgradeProductAfter = await readRecord('products', downgradeProduct.id);
    close(downgradeProductAfter.base_price_usd, 23, 'downgrade conserva precio');
    assert.equal(downgradeProductAfter.stock, 11, 'downgrade conserva stock');
    assertStatus(await checkout(expiredProduct), 200, 'producto vuelve a venderse con capacidad inactiva');

    const upgraded = await changePlan(storePremium, 'premium', false);
    assertStatus(upgraded, 200, 'upgrade posterior a Premium');
    for (const product of [expiredProduct, downgradeProduct]) {
      assert.equal(String((await readRecord('products', product.id)).expiration_date || ''), '', 'upgrade no restaura fecha general');
    }
    assert.equal(String((await readRecord('product_variations', downgradeVariation.id)).expiration_date || ''), '', 'upgrade no restaura fecha individual');
    assert.equal((await storeCycles()).length, 0, 'upgrade no restaura ciclos');
    assert.equal((await storeExpirationNotifications()).length, 0, 'upgrade no restaura alertas');
  } catch (error) {
    failure = error;
  } finally {
    try {
      await stopPocketBase(runtime);
    } catch (stopError) {
      if (!failure) failure = stopError;
      else failure.message += `\nError al cerrar PocketBase: ${stopError.stack || stopError.message}`;
    }
    if (failure && runtime && runtime.output()) failure.message += `\nPocketBase log (cola):\n${runtime.output()}`;
    try {
      assertOwnedTempDirectory(tempDirectory);
      fs.rmSync(tempDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      assert.equal(fs.existsSync(tempDirectory), false, `no se limpio ${tempDirectory}`);
      const remaining = fs.existsSync(TEMP_ROOT)
        ? fs.readdirSync(TEMP_ROOT).filter((name) => name.startsWith(TEMP_PREFIX))
        : [];
      assert.equal(remaining.length, 0, `quedan fixtures temporales ${remaining.join(', ')}`);
    } catch (cleanupError) {
      if (!failure) failure = cleanupError;
      else failure.message += `\nError de cleanup: ${cleanupError.stack || cleanupError.message}`;
    }
  }

  if (failure) throw failure;
});
