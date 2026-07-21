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
const TEMP_PREFIX = 'V7E9C3F2R2QA_';
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
  assert.match(path.basename(resolvedDirectory), /^V7E9C3F2R2QA_[A-Za-z0-9_-]+$/);
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

test('V7E9-C3F2-R2 HTTP runtime valida pedidos, historial, estados efectivos, permisos, tenant y cleanup', { timeout: 180000 }, async () => {
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
  const prefix = `V7E9C3F2R2QA_${stamp}`;
  const slugPrefix = `v7e9c3f2r2qa-${suffix}`;
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

    async function deleteRecord(collection, id, token) {
      return request(`/api/collections/${collection}/records/${id}`, { token, method: 'DELETE' });
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

    async function expirationEndpoint(token, view = 'summary', query = '', windowDays = 30) {
      return request('/api/pz/admin/product-expirations', {
        token,
        body: { view, window_days: windowDays, page: 1, page_size: 10, query },
      });
    }

    async function productHistory(token, route, body) {
      return request(`/api/pz/store/products/history/${route}`, { token, body });
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
    const viewerCreated = await teamCreate('catalog-viewer', ['catalog.view']);
    assertStatus(viewerCreated, 200, 'crear adicional con solo lectura de catálogo');
    const deniedCreated = await teamCreate('denied-member', []);
    assertStatus(deniedCreated, 200, 'crear adicional sin permiso granular');
    const member = memberCreated.data.user;
    const viewer = viewerCreated.data.user;
    const deniedMember = deniedCreated.data.user;
    const memberAuth = await login(member, memberCreated.data.temporary_password, 'E'.repeat(43));
    const viewerAuth = await login(viewer, viewerCreated.data.temporary_password, 'G'.repeat(43));
    const deniedAuth = await login(deniedMember, deniedCreated.data.temporary_password, 'F'.repeat(43));
    assertStatus(memberAuth, 200, 'login adicional con permiso');
    assertStatus(viewerAuth, 200, 'login adicional de solo lectura');
    assertStatus(deniedAuth, 200, 'login adicional sin permiso');
    const memberToken = memberAuth.data.token;
    const viewerToken = viewerAuth.data.token;
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

    async function publicList(collection, filter = '') {
      const query = new URLSearchParams({ page: '1', perPage: '100' });
      if (filter) query.set('filter', filter);
      return request(`/api/collections/${collection}/records?${query}`);
    }

    async function publicDetail(collection, id) {
      return request(`/api/collections/${collection}/records/${id}`);
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
    const expiredPublicList = await publicList('products', `id="${expiredProduct.id}"`);
    assertStatus(expiredPublicList, 200, 'listado público responde sin unidad vencida');
    assert.equal(expiredPublicList.data.items.length, 0, 'producto general vencido desaparece del listado público');
    const expiredPublicDetail = await publicDetail('products', expiredProduct.id);
    assertStatus(expiredPublicDetail, 404, 'detalle público vencido usa fallback no encontrado');
    assert.match(
      String(expiredPublicDetail.headers['cache-control'] || ''),
      /private|no-store/i,
      `detalle vencido sin no-store; headers=${JSON.stringify(expiredPublicDetail.headers)} body=${expiredPublicDetail.raw}`,
    );
    assert.equal(expiredPublicDetail.raw.includes(today), false, 'detalle público no revela fecha privada');
    const rejectedProductCheckout = await checkout(expiredProduct);
    assertStatus(rejectedProductCheckout, 422, 'checkout rechaza producto vencido');
    assert.deepEqual(rejectedProductCheckout.data, { ok: false, error: 'order_unavailable' });
    assert.equal(rejectedProductCheckout.raw.includes(today), false, 'respuesta no revela fecha');
    assert.equal(/expir|venc/i.test(rejectedProductCheckout.raw), false, 'respuesta no revela motivo');

    const futurePublicProduct = await createProduct('future-public-product');
    assertStatus(await patchRecord('products', futurePublicProduct.id, { expiration_date: havanaCivilDate(15) }, tokens.premium), 200, 'configurar producto futuro');
    const futurePublicDetail = await publicDetail('products', futurePublicProduct.id);
    assertStatus(futurePublicDetail, 200, 'producto futuro permanece público');
    assert.equal(Object.prototype.hasOwnProperty.call(futurePublicDetail.data, 'expiration_date'), false, 'fecha futura se redacta públicamente');
    const undatedPublicProduct = await createProduct('undated-public-product');
    assertStatus(await publicDetail('products', undatedPublicProduct.id), 200, 'producto sin fecha permanece público');

    const commerceVariationProduct = await createProduct('commerce-variation', storePremium, { has_variations: true, stock: 0 });
    const expiredVariation = await createRecord('product_variations', {
      store: storePremium.id, product: commerceVariationProduct.id, variation_type: 'Talla', value: `${prefix} Expired`,
      active: false, price_usd: 12, stock: 8,
    });
    const validVariation = await createRecord('product_variations', {
      store: storePremium.id, product: commerceVariationProduct.id, variation_type: 'Talla', value: `${prefix} Valid`,
      active: true, price_usd: 14, stock: 8,
    });
    const undatedVariation = await createRecord('product_variations', {
      store: storePremium.id, product: commerceVariationProduct.id, variation_type: 'Talla', value: `${prefix} Undated`,
      active: true, price_usd: 15, stock: 8,
    });
    const inactiveVariation = await createRecord('product_variations', {
      store: storePremium.id, product: commerceVariationProduct.id, variation_type: 'Talla', value: `${prefix} Inactive`,
      active: false, price_usd: 16, stock: 8,
    });
    const upcomingDate = havanaCivilDate(10);
    assertStatus(await patchRecord('product_variations', expiredVariation.id, { expiration_date: today }, memberToken), 200, 'configurar variacion vencida oculta');
    const rejectedActivation = await patchRecord('product_variations', expiredVariation.id, { active: true }, tokens.premium);
    assertStatus(rejectedActivation, [400, 409, 422], 'activar una variacion vencida se rechaza');
    assert.match(rejectedActivation.raw, /variation_expired_cannot_activate|fecha de vencimiento/i);
    assert.equal((await readRecord('product_variations', expiredVariation.id)).active, false, 'el rechazo conserva la variacion oculta');
    assertStatus(await patchRecord('product_variations', validVariation.id, { expiration_date: upcomingDate }, memberToken), 200, 'configurar variacion próxima');
    assertStatus(await patchRecord('product_variations', inactiveVariation.id, { expiration_date: today }, memberToken), 200, 'configurar variación manualmente oculta y vencida');
    assertStatus(await patchRecord('product_variations', inactiveVariation.id, { expiration_date: havanaCivilDate(5) }, memberToken), 200, 'corregir fecha sin activar conserva ocultación manual');
    assert.equal((await readRecord('product_variations', inactiveVariation.id)).active, false);
    assertStatus(await checkout(commerceVariationProduct, expiredVariation), 422, 'checkout rechaza variacion vencida');
    assertStatus(await checkout(commerceVariationProduct, inactiveVariation), 422, 'checkout rechaza variación manualmente oculta');
    assert.equal((await listRecords('order_items', `variation="${inactiveVariation.id}" || variation="${expiredVariation.id}"`)).length, 0, 'ningún order_item conserva unidades no vendibles');
    assertStatus(await checkout(commerceVariationProduct, validVariation), 200, 'otra variacion vendible conserva producto disponible');

    const mixedPublicProducts = await publicList('products', `id="${commerceVariationProduct.id}"`);
    assertStatus(mixedPublicProducts, 200, 'contenedor mixed permanece público');
    assert.equal(mixedPublicProducts.data.items.length, 1, 'una variación vigente conserva visible el padre');
    const mixedPublicVariations = await publicList('product_variations', `product="${commerceVariationProduct.id}"`);
    assertStatus(mixedPublicVariations, 200, 'variaciones públicas se filtran por unidad');
    assert.deepEqual(
      mixedPublicVariations.data.items.map((item) => item.id).sort(),
      [validVariation.id, undatedVariation.id].sort(),
      'vencida e inactiva no son seleccionables públicamente',
    );
    assert.ok(mixedPublicVariations.data.items.every((item) => !Object.prototype.hasOwnProperty.call(item, 'expiration_date')));

    const mixedExpired = await expirationEndpoint(tokens.premium, 'expired', 'commerce-variation');
    const mixedUpcoming = await expirationEndpoint(tokens.premium, 'upcoming', 'commerce-variation');
    assertStatus(mixedExpired, 200, 'V7E9 lista variación vencida');
    assertStatus(mixedUpcoming, 200, 'V7E9 lista variación próxima');
    assert.equal(mixedExpired.data.total_items, 0);
    assert.equal(mixedUpcoming.data.total_items, 1);
    assert.equal(mixedUpcoming.data.items[0].mode, 'variations');
    assert.equal(mixedUpcoming.data.items[0].product_id, commerceVariationProduct.id);
    assert.match(mixedUpcoming.data.items[0].affected_variations[0].name, /Valid$/);
    assert.equal(mixedExpired.data.items.some((item) => item.affected_variations.length === 0), false, 'padre no aparece como unidad V7E9');

    let mixedCycles = await listRecords('product_expiration_cycles', `product="${commerceVariationProduct.id}"`);
    assert.deepEqual(mixedCycles.map((cycle) => cycle.entity_id).sort(), [validVariation.id]);
    const mixedNotificationIds = [...new Set(mixedCycles.map((cycle) => cycle.notification))];
    assert.equal(mixedNotificationIds.length, 1, 'solo la variación activa usa notificación');
    for (const notificationId of mixedNotificationIds) {
      const notification = await readRecord('store_notifications', notificationId);
      assert.equal(notification.metadata_json.variation_ids.length, 1);
    }
    assertStatus(await patchRecord('product_variations', validVariation.id, { expiration_date: upcomingDate }, memberToken), 200, 'repetir fecha no duplica alerta');
    assert.equal((await listRecords('product_expiration_cycles', `product="${commerceVariationProduct.id}"`)).length, 1);

    const foreignVariation = await createRecord('product_variations', {
      store: storeOther.id, product: otherProduct.id, variation_type: 'Talla', value: `${prefix} Foreign`,
      active: true, price_usd: 9, stock: 4,
    });
    assertStatus(await checkout(commerceVariationProduct, foreignVariation), 422, 'variation_id de otro producto/tenant se rechaza');

    const disabledMode = await patchRecord('products', commerceVariationProduct.id, {
      has_variations: false,
      base_price_usd: 19,
      regular_price_usd: 19,
      stock: 3,
    }, tokens.premium);
    assertStatus(disabledMode, 200, 'desactivar variaciones guarda false real');
    assert.equal(disabledMode.data.has_variations, false);
    assert.equal((await listRecords('product_expiration_cycles', `product="${commerceVariationProduct.id}"`)).length, 0, 'modo padre limpia ciclos de variaciones');
    for (const variation of [expiredVariation, validVariation, inactiveVariation]) {
      assert.ok(String((await readRecord('product_variations', variation.id)).expiration_date || ''), 'desactivar conserva fechas de variaciones');
    }
    const hiddenVariations = await publicList('product_variations', `product="${commerceVariationProduct.id}"`);
    assertStatus(hiddenVariations, 200, 'listado público de variaciones desactivadas responde vacío');
    assert.equal(hiddenVariations.data.items.length, 0);
    assertStatus(await checkout(commerceVariationProduct, validVariation), 422, 'variation_id retenido se rechaza en modo padre');
    const parentModeCheckout = await checkout(await readRecord('products', commerceVariationProduct.id), null, true);
    assertStatus(parentModeCheckout, 200, 'modo padre usa su unidad canónica');
    close(parentModeCheckout.data.items[0].unit_price_final_usd, 19, 'modo padre usa precio padre');
    const retainedVariationParentAdd = await request(`/api/pz/admin/orders/${parentModeCheckout.data.order.id}/items`, {
      token: tokens.premium,
      body: { product_id: commerceVariationProduct.id, quantity: 1 },
    });
    assertStatus(retainedVariationParentAdd, 200, 'Pedidos Admin ignora variaciones conservadas y agrega el padre');
    close(retainedVariationParentAdd.data.items[0].unit_price_final_usd, 19, 'Pedidos Admin conserva precio padre en modo general');
    assertStatus(await request(`/api/pz/admin/orders/${parentModeCheckout.data.order.id}/items`, {
      token: tokens.premium,
      body: { product_id: commerceVariationProduct.id, variation_id: validVariation.id, quantity: 1 },
    }), 422, 'Pedidos Admin rechaza variation_id retenido cuando has_variations=false');

    const enabledMode = await patchRecord('products', commerceVariationProduct.id, { has_variations: true }, tokens.premium);
    assertStatus(enabledMode, 200, 'reactivar variaciones válidas');
    assert.equal(enabledMode.data.has_variations, true);
    mixedCycles = await listRecords('product_expiration_cycles', `product="${commerceVariationProduct.id}"`);
    assert.deepEqual(mixedCycles.map((cycle) => cycle.entity_id).sort(), [validVariation.id], 'reactivar recalcula solo alertas vigentes y activas');
    assertStatus(await patchRecord('product_variations', validVariation.id, { expiration_date: upcomingDate }, memberToken), 200, 'recalcular reactivado sigue idempotente');
    assert.equal((await listRecords('product_expiration_cycles', `product="${commerceVariationProduct.id}"`)).length, 1, 'reactivar no duplica ciclos');
    assertStatus(await checkout(commerceVariationProduct, expiredVariation), 422, 'reactivar mantiene bloqueada la vencida');
    assertStatus(await checkout(commerceVariationProduct, validVariation), 200, 'reactivar restaura variación vigente');

    assertStatus(await patchRecord('product_variations', expiredVariation.id, {
      expiration_date: havanaCivilDate(12),
      active: true,
    }, tokens.premium), 200, 'corregir fecha y activar en la misma operación');
    assertStatus(await patchRecord('product_variations', expiredVariation.id, { expiration_date: today }, memberToken), 200, 'volver a fecha vencida registra transición');
    assertStatus(await checkout(commerceVariationProduct, expiredVariation), 422, 'unidad manualmente activa y vencida no se vende');
    assertStatus(await patchRecord('product_variations', expiredVariation.id, { expiration_date: havanaCivilDate(12) }, memberToken), 200, 'corregir una unidad activa registra reactivación');
    const modeActivities = await listRecords(
      'store_activity_audit',
      `store="${storePremium.id}" && resource_id_snapshot="${commerceVariationProduct.id}"`,
    );
    assert.equal(modeActivities.filter((event) => event.action === 'product_variations_disabled').length, 1);
    assert.equal(modeActivities.filter((event) => event.action === 'product_variations_enabled').length, 1);
    const unitActivities = await listRecords(
      'store_activity_audit',
      `store="${storePremium.id}" && resource_id_snapshot="${expiredVariation.id}"`,
    );
    assert.ok(unitActivities.some((event) => event.action === 'product_unit_expired'));
    assert.ok(unitActivities.some((event) => event.action === 'product_unit_reactivated'));

    assertStatus(await patchRecord('product_variations', validVariation.id, { price_usd: 14.25 }, tokens.premium), 200, 'crear cambio de precio para historial');
    for (let index = 0; index < 22; index += 1) {
      assertStatus(
        await patchRecord('product_variations', validVariation.id, { stock: 20 + index }, tokens.premium),
        200,
        `crear evento paginado ${index + 1}`,
      );
    }

    const historyAuditCountBefore = (await listRecords(
      'store_activity_audit',
      `store="${storePremium.id}" && parent_product_id_snapshot="${commerceVariationProduct.id}"`,
    )).length;
    const historySummary = await productHistory(tokens.premium, 'summary', { product_id: commerceVariationProduct.id });
    assertStatus(historySummary, 200, 'resumen privado del historial');
    assert.equal(historySummary.data.product.id, commerceVariationProduct.id);
    assert.equal(historySummary.data.product.mode, 'variations');
    assert.ok(historySummary.data.product.variations.some((item) => item.id === validVariation.id));
    assert.equal(historySummary.data.permissions.price, true);

    const historyPageOne = await productHistory(tokens.premium, 'list', {
      product_id: commerceVariationProduct.id,
      scope: 'all',
      page: 1,
      per_page: 20,
    });
    assertStatus(historyPageOne, 200, 'historial paginado del producto');
    assert.equal(historyPageOne.data.pagination.per_page, 20);
    assert.equal(historyPageOne.data.events.length, 20);
    assert.ok(historyPageOne.data.pagination.total_items > 20);
    assert.ok(historyPageOne.data.pagination.total_pages >= 2);
    assert.ok(historyPageOne.data.events.some((event) => event.variation_id === validVariation.id));

    const variationHistory = await productHistory(tokens.premium, 'list', {
      product_id: commerceVariationProduct.id,
      variation_id: validVariation.id,
      scope: 'variations',
      page: 1,
      per_page: 20,
    });
    assertStatus(variationHistory, 200, 'historial filtrado por variación');
    assert.ok(variationHistory.data.events.length > 0);
    assert.ok(variationHistory.data.events.every((event) => event.variation_id === validVariation.id));

    const expirationOnlyHistory = await productHistory(memberToken, 'list', {
      product_id: commerceVariationProduct.id,
      scope: 'all',
      page: 1,
      per_page: 20,
    });
    assertStatus(expirationOnlyHistory, 200, 'adicional de vencimientos consulta historial limitado');
    assert.equal(expirationOnlyHistory.data.scope, 'expirations');
    assert.ok(expirationOnlyHistory.data.events.length > 0);
    assert.ok(expirationOnlyHistory.data.events.every((event) => event.changes.every((change) => (
      change.field !== 'price_usd' && change.field !== 'stock' && change.field !== 'active'
    ))));

    const priceHistory = await productHistory(tokens.premium, 'list', {
      product_id: commerceVariationProduct.id,
      variation_id: validVariation.id,
      scope: 'price_stock',
      page: 1,
      per_page: 50,
    });
    assertStatus(priceHistory, 200, 'principal consulta cambios de precio y stock');
    const priceEvent = priceHistory.data.events.find((event) => event.changes.some((change) => change.field === 'price_usd'));
    assert.ok(priceEvent, 'el historial conserva el cambio de precio');
    const priceDetail = await productHistory(tokens.premium, 'detail', {
      product_id: commerceVariationProduct.id,
      event_id: priceEvent.id,
    });
    assertStatus(priceDetail, 200, 'detalle del evento dentro del producto');
    assert.ok(priceDetail.data.event.changes.some((change) => change.field === 'price_usd'));
    assertStatus(await productHistory(memberToken, 'detail', {
      product_id: commerceVariationProduct.id,
      event_id: priceEvent.id,
    }), 404, 'permiso solo vencimientos no abre detalle de precio');
    const viewerPriceDetail = await productHistory(viewerToken, 'detail', {
      product_id: commerceVariationProduct.id,
      event_id: priceEvent.id,
    });
    assertStatus(viewerPriceDetail, 200, 'lector de catálogo abre evento no sensible');
    assert.equal(viewerPriceDetail.data.event.changes.some((change) => change.field === 'price_usd'), false, 'precio se redacta sin permiso');

    const expirationEvent = expirationOnlyHistory.data.events[0];
    assertStatus(await productHistory(viewerToken, 'detail', {
      product_id: commerceVariationProduct.id,
      event_id: expirationEvent.id,
    }), 404, 'lector sin vencimientos no abre detalle de vencimiento');
    assertStatus(await productHistory(deniedToken, 'summary', { product_id: commerceVariationProduct.id }), 403, 'usuario sin catálogo no consulta historial');
    assertStatus(await productHistory(tokens.premium, 'summary', { product_id: otherProduct.id }), 404, 'producto de otro tenant no se revela');
    assertStatus(await productHistory(tokens.premium, 'detail', {
      product_id: otherProduct.id,
      event_id: priceEvent.id,
    }), 404, 'evento no puede cruzarse con otro producto o tenant');
    const historyAuditCountAfter = (await listRecords(
      'store_activity_audit',
      `store="${storePremium.id}" && parent_product_id_snapshot="${commerceVariationProduct.id}"`,
    )).length;
    assert.equal(historyAuditCountAfter, historyAuditCountBefore, 'consultar historial no genera actividad de éxito');

    const historicalProduct = await createProduct('historical-deleted-product', storePremium, { has_variations: true, stock: 0 });
    const historicalVariation = await createRecord('product_variations', {
      store: storePremium.id,
      product: historicalProduct.id,
      variation_type: 'Edición',
      value: `${prefix} Eliminada`,
      active: true,
      price_usd: 18,
      stock: 3,
    });
    assertStatus(await patchRecord('product_variations', historicalVariation.id, { stock: 4 }, tokens.premium), 200, 'crear snapshot histórico de variación');
    assertStatus(await deleteRecord('product_variations', historicalVariation.id, tokens.premium), 204, 'eliminar variación histórica');
    const deletedVariationSummary = await productHistory(tokens.premium, 'summary', {
      product_id: historicalProduct.id,
      variation_id: historicalVariation.id,
    });
    assertStatus(deletedVariationSummary, 200, 'historial conserva variación eliminada');
    assert.ok(deletedVariationSummary.data.product.variations.some((item) => item.id === historicalVariation.id && item.state === 'deleted'));
    assertStatus(await deleteRecord('products', historicalProduct.id, tokens.premium), 204, 'eliminar producto histórico');
    const deletedProductSummary = await productHistory(tokens.premium, 'summary', { product_id: historicalProduct.id });
    assertStatus(deletedProductSummary, 200, 'historial conserva producto eliminado');
    assert.equal(deletedProductSummary.data.product.state, 'deleted');

    const inheritedProduct = await createProduct('inherited-product', storePremium, { has_variations: true, stock: 0 });
    const inheritedOne = await createRecord('product_variations', {
      store: storePremium.id, product: inheritedProduct.id, variation_type: 'Sabor', value: `${prefix} Heredada A`,
      active: true, price_usd: 11, stock: 2,
    });
    const inheritedTwo = await createRecord('product_variations', {
      store: storePremium.id, product: inheritedProduct.id, variation_type: 'Sabor', value: `${prefix} Heredada B`,
      active: true, price_usd: 13, stock: 2,
    });
    const inheritedInactive = await createRecord('product_variations', {
      store: storePremium.id, product: inheritedProduct.id, variation_type: 'Sabor', value: `${prefix} Heredada inactiva`,
      active: false, price_usd: 15, stock: 2,
    });
    assertStatus(await patchRecord('products', inheritedProduct.id, { expiration_date: firstDate }, memberToken), 200, 'fecha general se hereda por unidad activa');
    const inheritedCycles = await listRecords('product_expiration_cycles', `product="${inheritedProduct.id}"`);
    assert.deepEqual(inheritedCycles.map((cycle) => cycle.entity_id).sort(), [inheritedOne.id, inheritedTwo.id].sort());
    assert.equal(inheritedCycles.some((cycle) => cycle.entity_id === inheritedProduct.id || cycle.entity_id === inheritedInactive.id), false);
    const inheritedRows = await expirationEndpoint(tokens.premium, 'upcoming', 'inherited-product');
    assertStatus(inheritedRows, 200, 'V7E9 lista herencia por variación');
    assert.equal(inheritedRows.data.total_items, 2);
    assert.ok(inheritedRows.data.items.every((item) => item.mode === 'variations' && item.affected_variations.length === 1));

    const canonicalProduct = await createProduct('canonical-product', storePremium, { base_price_usd: 17, regular_price_usd: 17 });
    const canonicalCheckout = await checkout(canonicalProduct, null, true);
    assertStatus(canonicalCheckout, 200, 'checkout canonico acepta request sin confiar en precio');
    assert.equal(canonicalCheckout.data.items[0].product_name, canonicalProduct.name);
    close(canonicalCheckout.data.items[0].unit_price_final_usd, 17, 'precio final canonico');
    const canonicalOrder = canonicalCheckout.data.order;
    const adminParentAdd = await request(`/api/pz/admin/orders/${canonicalOrder.id}/items`, {
      token: tokens.premium,
      body: { product_id: futurePublicProduct.id, quantity: 1 },
    });
    assertStatus(adminParentAdd, 200, 'Pedidos Admin agrega padre sin variation_id');
    const parentAdminItem = adminParentAdd.data.items.find((item) => item.product === futurePublicProduct.id);
    assert.ok(parentAdminItem && !parentAdminItem.variation);
    close(parentAdminItem.unit_price_final_usd, 10, 'Pedidos Admin usa precio canónico del padre');
    assertStatus(await request(`/api/pz/admin/orders/${canonicalOrder.id}/items`, {
      token: tokens.premium,
      body: { product_id: commerceVariationProduct.id, quantity: 1 },
    }), 422, 'Pedidos Admin exige variación cuando el modo está activo');
    assertStatus(await request(`/api/pz/admin/orders/${canonicalOrder.id}/items`, {
      token: tokens.premium,
      body: { product_id: commerceVariationProduct.id, variation_id: inactiveVariation.id, quantity: 1 },
    }), 422, 'Pedidos Admin rechaza variación manualmente oculta');
    const adminVariationAdd = await request(`/api/pz/admin/orders/${canonicalOrder.id}/items`, {
      token: tokens.premium,
      body: { product_id: commerceVariationProduct.id, variation_id: validVariation.id, quantity: 1 },
    });
    assertStatus(adminVariationAdd, 200, 'Pedidos Admin agrega una variación vendible');
    const variationAdminItem = adminVariationAdd.data.items.find((item) => item.variation === validVariation.id);
    assert.ok(variationAdminItem);
    close(variationAdminItem.unit_price_final_usd, 14.25, 'Pedidos Admin usa precio canónico de la variación');
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
    const deletedMember = await request('/api/pz/store/team/delete', {
      token: tokens.premium,
      body: {
        user_id: member.id,
        confirmation_email: member.email,
        reason_code: 'access_no_longer_needed',
        reason_detail: '',
      },
    });
    assertStatus(deletedMember, 200, 'eliminar actor histórico de prueba');
    const deletedActorHistory = await productHistory(tokens.premium, 'list', {
      product_id: memberProduct.id,
      scope: 'expirations',
      page: 1,
      per_page: 20,
    });
    assertStatus(deletedActorHistory, 200, 'historial resuelve actor eliminado por snapshot');
    assert.ok(deletedActorHistory.data.events.some((event) => (
      event.actor === member.display_name && event.actor_state === 'deleted'
    )));

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
