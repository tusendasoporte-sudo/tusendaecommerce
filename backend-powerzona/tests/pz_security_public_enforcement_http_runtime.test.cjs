const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, createHmac, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

const BACKEND_DIR = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const TEMP_ROOT = path.join(BACKEND_DIR, '.tmp');
const PREFIX = 'BLOCKS03BQA_';
const LOOPBACK = '127.0.0.1';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function flags(dataDirectory, migrationsDirectory) {
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

function bootstrap(dataDirectory, migrationsDirectory, email, password, env) {
  const result = spawnSync(POCKETBASE_EXE, [
    'superuser', 'create', email, password, ...flags(dataDirectory, migrationsDirectory),
  ], { cwd: BACKEND_DIR, env, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || ''}`);
}

function start(dataDirectory, migrationsDirectory, port, env) {
  let output = '';
  let spawnError = null;
  const child = spawn(POCKETBASE_EXE, [
    'serve', `--http=${LOOPBACK}:${port}`, ...flags(dataDirectory, migrationsDirectory),
  ], { cwd: BACKEND_DIR, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-30000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => { spawnError = error; capture(error.stack || error.message); });
  return { child, output: () => output, spawnError: () => spawnError };
}

async function waitForReady(runtime, baseUrl) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (runtime.spawnError()) throw runtime.spawnError();
    if (runtime.child.exitCode !== null) throw new Error(runtime.output());
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) return;
    } catch (_) {}
    await delay(100);
  }
  throw new Error(`PocketBase no quedó listo.\n${runtime.output()}`);
}

async function stop(runtime) {
  if (!runtime || runtime.child.exitCode !== null) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
  if (!graceful && runtime.child.exitCode === null) {
    runtime.child.kill('SIGKILL');
    await Promise.race([exited, delay(5000)]);
  }
}

async function api(baseUrl, route, { token = '', body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, raw, data, headers: response.headers };
}

function assertStatus(result, status, label) {
  assert.equal(result.status, status, `${label}: HTTP ${result.status}\n${result.raw}`);
}

test('BLOCKS03B HTTP runtime bloquea por cookie, no por IP local, y audita idempotente', {
  timeout: 120000,
  skip: fs.existsSync(POCKETBASE_EXE) ? false : `requiere ${POCKETBASE_EXE}`,
}, async () => {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const tempDirectory = fs.mkdtempSync(path.join(TEMP_ROOT, PREFIX));
  assert.equal(path.dirname(path.resolve(tempDirectory)), path.resolve(TEMP_ROOT));
  assert.match(path.basename(tempDirectory), /^BLOCKS03BQA_[A-Za-z0-9_-]+$/);
  const dataDirectory = path.join(tempDirectory, 'pb_data');
  const migrationsDirectory = path.join(tempDirectory, 'pb_migrations');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.cpSync(MIGRATIONS_DIR, migrationsDirectory, { recursive: true });

  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toLowerCase();
  const email = `blocks03b-${suffix}@example.test`;
  const password = `QA-BLOCKS03B-${randomBytes(24).toString('base64url')}!Aa1`;
  const hmacSecret = randomBytes(48).toString('base64url');
  const env = {
    ...process.env,
    PZ_SECURITY_HMAC_SECRET: hmacSecret,
    PZ_SECURITY_AES_KEY: randomBytes(24).toString('base64url').slice(0, 32),
  };
  let runtime = null;
  let failure = null;

  try {
    bootstrap(dataDirectory, migrationsDirectory, email, password, env);
    const port = await freePort();
    const baseUrl = `http://${LOOPBACK}:${port}`;
    runtime = start(dataDirectory, migrationsDirectory, port, env);
    await waitForReady(runtime, baseUrl);

    const auth = await api(baseUrl, '/api/collections/_superusers/auth-with-password', {
      body: { identity: email, password },
    });
    assertStatus(auth, 200, 'autenticar superuser efímero');
    const superToken = auth.data.token;
    const create = async (collection, body) => {
      const result = await api(baseUrl, `/api/collections/${collection}/records`, { token: superToken, body });
      assertStatus(result, 200, `crear ${collection}`);
      return result.data;
    };
    const count = async (collection, filter = '') => {
      const query = new URLSearchParams({ page: '1', perPage: '1' });
      if (filter) query.set('filter', filter);
      const result = await api(baseUrl, `/api/collections/${collection}/records?${query}`, { token: superToken });
      assertStatus(result, 200, `contar ${collection}`);
      return Number(result.data.totalItems || 0);
    };

    const store = await create('stores', {
      name: `BLOCKS03B ${suffix}`,
      slug: `blocks03b-${suffix}`,
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const otherStore = await create('stores', {
      name: `BLOCKS03B Other ${suffix}`,
      slug: `blocks03b-other-${suffix}`,
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const masterPassword = `QA-BLOCKS03B-MASTER-${randomBytes(24).toString('base64url')}!Aa1`;
    const master = await create('users', {
      email: `blocks03b-master-${suffix}@example.test`,
      password: masterPassword,
      passwordConfirm: masterPassword,
      display_name: 'Master BLOCKS03B Runtime',
      role: 'master_admin',
      status: 'active',
      emailVisibility: true,
    });
    const masterAuth = await api(baseUrl, '/api/collections/users/auth-with-password', {
      body: { identity: master.email, password: masterPassword },
    });
    assertStatus(masterAuth, 200, 'autenticar Master efímero');
    for (const targetStore of [store, otherStore]) {
      const changed = await api(baseUrl, '/api/pz/master/store-plan/change', {
        token: masterAuth.data.token,
        body: {
          store_id: targetStore.id,
          plan: 'premium',
          is_permanent: true,
          duration_months: 0,
          reason: 'Prueba runtime BLOCKS03B',
          confirm_expiration_cleanup: false,
        },
      });
      assertStatus(changed, 200, 'activar Premium en fixture');
    }
    await create('store_security_settings', {
      store: store.id,
      enabled: true,
      mode: 'protection',
      manual_blocking_enabled: true,
      full_access_blocking_enabled: true,
      permanent_blocks_enabled: true,
      retention_days: 30,
      ip_visibility: 'hidden',
      notify_blocked_attempts: true,
    });
    await create('store_security_settings', {
      store: otherStore.id,
      enabled: true,
      mode: 'protection',
      manual_blocking_enabled: true,
      full_access_blocking_enabled: true,
      permanent_blocks_enabled: true,
      retention_days: 30,
      ip_visibility: 'hidden',
      notify_blocked_attempts: false,
    });
    const deviceToken = randomBytes(32).toString('base64url');
    assert.equal(deviceToken.length, 43);
    const deviceDigest = createHash('sha256').update(deviceToken).digest('hex');
    const deviceHmac = createHmac('sha256', hmacSecret)
      .update(`browser|${store.id}|${deviceDigest}`)
      .digest('hex');
    const phoneHmac = createHmac('sha256', hmacSecret)
      .update(`phone|${store.id}|535551212`)
      .digest('hex');
    const customer = await create('store_customers', {
      store: store.id,
      display_name: 'Cliente runtime',
      phone_normalized: '535551212',
      status: 'blocked',
    });
    const block = await create('store_security_blocks', {
      store: store.id,
      customer: customer.id,
      scope: 'full_access',
      status: 'active',
      match_phone: true,
      match_device: true,
      match_ip: false,
      match_mode: 'any',
      phone_hmac_values: [phoneHmac],
      device_hmac_values: [deviceHmac],
      ip_hmac_values: [],
      duration: 'days_7',
      starts_at: new Date(Date.now() - 60000).toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      reason_internal: 'runtime privado',
    });
    const publicHeaders = {
      Cookie: `pz_client_device=${deviceToken}`,
      'X-Request-Id': 'blocks03b-runtime-same-request',
    };

    const blockedCheckout = await api(baseUrl, '/api/pz/checkout/orders', {
      headers: publicHeaders,
      body: {
        store_id: store.id,
        idempotency_key: 'BLOCKS03B_RUNTIME_ORDER_01',
        currency_id: '',
        shipping_zone_id: '',
        delivery_method: 'pickup',
        coupon_code: '',
        customer_name: 'Cliente runtime',
        customer_phone: '+53 555 12 12',
        customer_address: '',
        customer_municipality: '',
        customer_note: '',
        items: [{ product_id: 'fakeproduct0001', variation_id: '', gift_id: '', quantity: 1 }],
      },
    });
    assertStatus(blockedCheckout, 403, 'checkout bloqueado por teléfono canónico');

    const blocked = await api(baseUrl, '/api/pz/security/public-access', {
      body: { store_slug: store.slug }, headers: publicHeaders,
    });
    assertStatus(blocked, 404, 'full_access bloqueado');
    assert.deepEqual(blocked.data, { ok: false, error: 'not_found' });
    assert.match(blocked.headers.get('cache-control') || '', /private.*no-store/);
    assert.equal(blocked.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.doesNotMatch(blocked.raw, /block|security|store|customer|reason|hmac|cipher|metadata/i);

    const duplicate = await api(baseUrl, '/api/pz/security/public-access', {
      body: { store_slug: store.slug }, headers: publicHeaders,
    });
    assertStatus(duplicate, 404, 'reintento idempotente');
    assert.equal(await count('store_security_events', `store = "${store.id}" && event_type = "blocked_attempt"`), 2);
    assert.equal(await count('store_activity_audit', `store = "${store.id}" && action = "blocked_attempt"`), 2);
    assert.equal(await count('store_notifications', `store = "${store.id}" && type = "security_blocked_attempt"`), 2);

    const directStore = await api(baseUrl, `/api/collections/stores/records/${store.id}`, { headers: publicHeaders });
    assertStatus(directStore, 404, 'lectura REST directa bloqueada');
    assert.doesNotMatch(directStore.raw, new RegExp(store.slug, 'i'));
    const directStoreList = await api(
      baseUrl,
      `/api/collections/stores/records?filter=${encodeURIComponent(`id = "${store.id}"`)}`,
      { headers: publicHeaders },
    );
    assertStatus(directStoreList, 200, 'listado REST directo filtrado');
    assert.equal((directStoreList.data.items || []).some((item) => item.id === store.id), false);

    const review = await api(baseUrl, '/api/collections/reviews/records', {
      headers: publicHeaders,
      body: {
        store: store.id,
        type: 'store',
        rating: 5,
        customer_name: 'Cliente runtime',
        customer_contact: 'dato-no-confiable',
        comment: 'Prueba runtime',
        status: 'pending',
        source: 'public_store',
        verified_purchase: false,
        featured: false,
      },
    });
    assertStatus(review, 403, 'reseña directa bloqueada');
    assert.equal(await count('reviews', `store = "${store.id}"`), 0);

    const analytics = await api(baseUrl, '/api/collections/store_analytics_events/records', {
      headers: publicHeaders,
      body: {
        store: store.id,
        event_type: 'pageview',
        day: new Date().toISOString().slice(0, 10),
        visitor_id: 'blocks03b_visitor',
        session_id: 'blocks03b_session',
        page_type: 'store_home',
        entity_type: '',
        entity_id: '',
        path: `/t/${store.slug}`,
        referrer: '',
        user_agent: '',
      },
    });
    assertStatus(analytics, 403, 'analítica directa bloqueada');
    assert.equal(await count('store_analytics_events', `store = "${store.id}"`), 0);

    const navigation = await api(baseUrl, '/api/pz/security/track-navigation', {
      headers: publicHeaders,
      body: {
        store_id: store.id,
        event_id: 'blocks03b-navigation',
        visitor_id: 'blocks03b_visitor',
        session_id: 'blocks03b_session',
        browser_token_digest: deviceDigest,
        page_type: 'store_home',
        entity_type: '',
        entity_id: '',
        path: `/t/${store.slug}`,
      },
    });
    assertStatus(navigation, 403, 'navegación directa bloqueada antes de mutar');

    const isolated = await api(baseUrl, '/api/pz/security/public-access', {
      body: { store_slug: otherStore.slug }, headers: publicHeaders,
    });
    assert.equal([200, 204].includes(isolated.status), true, `otra tienda: HTTP ${isolated.status}\n${isolated.raw}`);

    const revoked = await api(baseUrl, `/api/collections/store_security_blocks/records/${block.id}`, {
      token: superToken,
      method: 'PATCH',
      body: { status: 'revoked', revoked_at: new Date().toISOString(), revoke_reason: 'runtime cleanup' },
    });
    assertStatus(revoked, 200, 'revocar bloqueo');
    const allowedAfterRevoke = await api(baseUrl, '/api/pz/security/public-access', {
      body: { store_slug: store.slug }, headers: publicHeaders,
    });
    assert.equal([200, 204].includes(allowedAfterRevoke.status), true, `revocado: HTTP ${allowedAfterRevoke.status}\n${allowedAfterRevoke.raw}`);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await stop(runtime);
    if (runtime && runtime.child.exitCode === null) {
      failure ||= new Error('PocketBase runtime siguió activo');
    }
    assert.equal(path.dirname(path.resolve(tempDirectory)), path.resolve(TEMP_ROOT));
    assert.match(path.basename(tempDirectory), /^BLOCKS03BQA_[A-Za-z0-9_-]+$/);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempDirectory), false);
    if (failure && runtime) {
      failure.message = `${failure.message}\n${runtime.output()}`;
    }
  }
});
