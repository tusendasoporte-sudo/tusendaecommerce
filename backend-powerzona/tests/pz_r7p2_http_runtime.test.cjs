'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

const BACKEND_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(BACKEND_DIR, '..', 'frontend-powerzona');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const ASTRO_CLI = path.join(FRONTEND_DIR, 'node_modules', 'astro', 'bin', 'astro.mjs');
const TEMP_ROOT = path.join(BACKEND_DIR, '.tmp');
const TEMP_PREFIX = 'R7P2QA_';
const LOOPBACK = '127.0.0.1';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function runtimeEnvironment() {
  return {
    ...process.env,
    PZ_SECURITY_HMAC_SECRET: randomBytes(32).toString('hex'),
    PZ_SECURITY_AES_KEY: randomBytes(24).toString('base64url').slice(0, 32),
  };
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

function assertOwnedTempDirectory(directory) {
  const root = path.resolve(TEMP_ROOT);
  const target = path.resolve(directory);
  assert.equal(path.dirname(target), root);
  assert.match(path.basename(target), /^R7P2QA_[A-Za-z0-9_-]+$/);
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
    `bootstrap superuser falló: ${result.error || ''}\n${result.stdout || ''}\n${result.stderr || ''}`,
  );
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
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-30000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => {
    spawnError = error;
    capture(error.stack || error.message);
  });
  return { child, output: () => output, spawnError: () => spawnError };
}

function startAstro(port, pocketBaseUrl, env) {
  let output = '';
  let spawnError = null;
  const child = spawn(
    process.execPath,
    [ASTRO_CLI, 'dev', '--ignore-lock', '--host', LOOPBACK, '--port', String(port)],
    {
      cwd: FRONTEND_DIR,
      env: {
        ...env,
        // Astro 7 auto-detecta agentes y desacopla `astro dev`; la prueba necesita
        // conservar el proceso hijo en primer plano para poder detenerlo y limpiarlo.
        ASTRO_DEV_BACKGROUND: '0',
        PUBLIC_POCKETBASE_URL: pocketBaseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-30000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => {
    spawnError = error;
    capture(error.stack || error.message);
  });
  return { child, output: () => output, spawnError: () => spawnError };
}

async function waitForPocketBase(runtime, baseUrl) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (runtime.spawnError()) throw runtime.spawnError();
    if (runtime.child.exitCode !== null) {
      throw new Error(`PocketBase terminó antes de iniciar.\n${runtime.output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) return;
    } catch (_) {}
    await delay(100);
  }
  throw new Error(`PocketBase no quedó listo.\n${runtime.output()}`);
}

async function waitForAstro(runtime, baseUrl) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (runtime.spawnError()) throw runtime.spawnError();
    if (runtime.child.exitCode !== null) {
      throw new Error(`Astro terminó antes de iniciar.\n${runtime.output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/t/runtime-no-existe/rifa`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(1000),
      });
      if (response.status >= 200 && response.status < 600) return;
    } catch (_) {}
    await delay(100);
  }
  throw new Error(`Astro no quedó listo.\n${runtime.output()}`);
}

async function stopPocketBase(runtime) {
  if (!runtime || runtime.child.exitCode !== null) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
  if (!graceful && runtime.child.exitCode === null) {
    runtime.child.kill('SIGKILL');
    await Promise.race([exited, delay(5000)]);
  }
}

async function stopAstro(runtime) {
  if (!runtime || runtime.child.exitCode !== null) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
  if (!graceful && runtime.child.exitCode === null) {
    runtime.child.kill('SIGKILL');
    await Promise.race([exited, delay(5000)]);
  }
}

async function apiRequest(baseUrl, route, {
  token = '',
  body,
  method = body === undefined ? 'GET' : 'POST',
  headers = {},
} = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return {
    status: response.status,
    data,
    raw,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function assertStatus(result, status, label) {
  assert.equal(result.status, status, `${label}: HTTP ${result.status}\n${result.raw}`);
}

test('R7P2 HTTP runtime valida Premium, REST/F12, enter/status, archivos y restauración', {
  timeout: 180000,
}, async () => {
  assert.equal(fs.existsSync(POCKETBASE_EXE), true, `falta ${POCKETBASE_EXE}`);
  assert.equal(fs.existsSync(ASTRO_CLI), true, `falta ${ASTRO_CLI}`);
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const tempDirectory = fs.mkdtempSync(path.join(TEMP_ROOT, TEMP_PREFIX));
  assertOwnedTempDirectory(tempDirectory);
  const dataDirectory = path.join(tempDirectory, 'pb_data');
  const runtimeMigrationsDirectory = path.join(tempDirectory, 'pb_migrations');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.cpSync(MIGRATIONS_DIR, runtimeMigrationsDirectory, { recursive: true });

  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toLowerCase();
  const superEmail = `r7p2-${suffix}@example.test`;
  const superPassword = `QA-R7P2-${randomBytes(24).toString('base64url')}!Aa1`;
  const env = runtimeEnvironment();
  let runtime = null;
  let astroRuntime = null;
  let failure = null;
  let baseUrl = '';
  let frontendBaseUrl = '';

  try {
    bootstrapSuperuser(dataDirectory, runtimeMigrationsDirectory, superEmail, superPassword, env);
    const port = await freeLoopbackPort();
    baseUrl = `http://${LOOPBACK}:${port}`;
    runtime = startPocketBase(dataDirectory, runtimeMigrationsDirectory, port, env);
    await waitForPocketBase(runtime, baseUrl);

    const request = (route, options) => apiRequest(baseUrl, route, options);
    const auth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: superEmail, password: superPassword },
    });
    assertStatus(auth, 200, 'autenticar superuser efímero');
    const superToken = auth.data.token;

    async function create(collection, body) {
      const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
      assertStatus(result, 200, `crear ${collection}`);
      return result.data;
    }

    async function count(collection, filter = '') {
      const query = new URLSearchParams({ page: '1', perPage: '1' });
      if (filter) query.set('filter', filter);
      const result = await request(`/api/collections/${collection}/records?${query}`, { token: superToken });
      assertStatus(result, 200, `contar ${collection}`);
      return Number(result.data.totalItems || 0);
    }

    const premiumStore = await create('stores', {
      name: `R7P2 Premium ${suffix}`,
      slug: `r7p2-premium-${suffix}`,
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const basicStore = await create('stores', {
      name: `R7P2 Basic ${suffix}`,
      slug: `r7p2-basic-${suffix}`,
      status: 'active',
      plan: 'basic',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const basicPrimaryPassword = `QA-Basic-Primary-${randomBytes(24).toString('base64url')}!Aa1`;
    const basicPrimary = await create('users', {
      store: basicStore.id,
      email: `r7p2-basic-primary-${suffix}@example.test`,
      password: basicPrimaryPassword,
      passwordConfirm: basicPrimaryPassword,
      display_name: 'Principal Basic R7P2 Runtime',
      role: 'store_admin',
      status: 'active',
      emailVisibility: true,
    });
    const premiumAdditionalPassword = `QA-Premium-Staff-${randomBytes(24).toString('base64url')}!Aa1`;
    const premiumAdditional = await create('users', {
      store: premiumStore.id,
      email: `r7p2-premium-staff-${suffix}@example.test`,
      password: premiumAdditionalPassword,
      passwordConfirm: premiumAdditionalPassword,
      display_name: 'Adicional Premium R7P2 Runtime',
      role: 'store_staff',
      status: 'active',
      emailVisibility: true,
    });
    const masterPassword = `QA-Master-${randomBytes(24).toString('base64url')}!Aa1`;
    const master = await create('users', {
      email: `r7p2-master-${suffix}@example.test`,
      password: masterPassword,
      passwordConfirm: masterPassword,
      display_name: 'Master R7P2 Runtime',
      role: 'master_admin',
      status: 'active',
      emailVisibility: true,
    });
    const masterAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: master.email, password: masterPassword },
    });
    assertStatus(masterAuth, 200, 'autenticar Master efímero');
    const masterToken = masterAuth.data.token;
    async function changePlan(storeId, plan, confirmExpirationCleanup = false) {
      const result = await request('/api/pz/master/store-plan/change', {
        token: masterToken,
        body: {
          store_id: storeId,
          plan,
          is_permanent: plan !== 'free',
          duration_months: 0,
          reason: 'Prueba runtime R7P2',
          confirm_expiration_cleanup: confirmExpirationCleanup,
        },
      });
      assertStatus(result, 200, `cambiar plan a ${plan}`);
      return result.data;
    }
    await changePlan(premiumStore.id, 'premium');
    await changePlan(basicStore.id, 'basic');
    const assignedBasicPrimary = await request('/api/pz/master/primary-admin/assign', {
      token: masterToken,
      body: {
        store_id: basicStore.id,
        user_id: basicPrimary.id,
        reason: 'Prueba runtime R7P2-C1',
      },
    });
    assertStatus(assignedBasicPrimary, 200, 'asignar Principal Basic');
    const basicPrimaryDevice = 'B'.repeat(43);
    const premiumAdditionalDevice = 'S'.repeat(43);
    const basicPrimaryAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: basicPrimary.email, password: basicPrimaryPassword },
      headers: { 'X-PZ-Admin-Device': basicPrimaryDevice },
    });
    assertStatus(basicPrimaryAuth, 200, 'autenticar Principal Basic');
    const premiumAdditionalAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: premiumAdditional.email, password: premiumAdditionalPassword },
      headers: { 'X-PZ-Admin-Device': premiumAdditionalDevice },
    });
    assertStatus(premiumAdditionalAuth, 200, 'autenticar adicional Premium');

    const basicPrimaryAccess = await request('/api/pz/store/access/context', {
      token: basicPrimaryAuth.data.token,
      body: {},
    });
    assertStatus(basicPrimaryAccess, 200, 'contexto del Principal Basic');
    assert.equal(basicPrimaryAccess.data.access.is_primary_admin, true);
    assert.equal(basicPrimaryAccess.data.plan.code, 'basic');
    assert.equal(basicPrimaryAccess.data.access.permissions.includes('raffles.manage'), false);
    const premiumAdditionalAccess = await request('/api/pz/store/access/context', {
      token: premiumAdditionalAuth.data.token,
      body: {},
    });
    assertStatus(premiumAdditionalAccess, 200, 'contexto del adicional Premium');
    assert.equal(premiumAdditionalAccess.data.access.is_primary_admin, false);
    assert.equal(premiumAdditionalAccess.data.access.permissions.includes('raffles.manage'), false);

    function sessionCookie(authResult, device) {
      const pbAuth = encodeURIComponent(JSON.stringify({
        token: authResult.data.token,
        record: authResult.data.record,
      }));
      return `pb_auth=${pbAuth}; pz_admin_device=${device}`;
    }
    const basicPrimaryCookie = sessionCookie(basicPrimaryAuth, basicPrimaryDevice);
    const premiumAdditionalCookie = sessionCookie(premiumAdditionalAuth, premiumAdditionalDevice);

    const dates = {
      starts_at: '2026-01-01T00:00:00.000Z',
      closes_at: '2099-12-30T00:00:00.000Z',
      draw_at: '2099-12-31T00:00:00.000Z',
    };
    const premiumRaffle = await create('raffles', {
      store: premiumStore.id,
      title: 'Rifa Premium',
      slug: 'rifa-1',
      slot_number: 1,
      is_configured: true,
      access_code: 'R7-RUNTIME',
      status: 'active',
      link_enabled: true,
      show_in_store: true,
      visible: true,
      selection_manually_closed: false,
      prizes_json: [{ id: 'premio-1', name: 'Premio', description: 'Runtime', image: '' }],
      prizes_display_mode: 'fixed',
      store_featured_prize_ids: ['premio-1'],
      ...dates,
    });
    const basicRaffle = await create('raffles', {
      store: basicStore.id,
      title: 'Rifa Basic conservada',
      slug: 'rifa-1',
      slot_number: 1,
      is_configured: true,
      access_code: 'R7-BASIC',
      status: 'active',
      link_enabled: true,
      show_in_store: true,
      visible: true,
      selection_manually_closed: false,
      prizes_json: [{ id: 'premio-1', name: 'Premio Basic', description: 'Conservado', image: '' }],
      prizes_display_mode: 'fixed',
      store_featured_prize_ids: ['premio-1'],
      ...dates,
    });

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');
    const upload = new FormData();
    upload.append('images', new Blob([png], { type: 'image/png' }), 'premio.png');
    const uploadResponse = await fetch(`${baseUrl}/api/collections/raffles/records/${premiumRaffle.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
      body: upload,
      signal: AbortSignal.timeout(10000),
    });
    if (uploadResponse.status !== 200) {
      assert.fail(`subir imagen: HTTP ${uploadResponse.status}\n${await uploadResponse.text()}`);
    }
    const uploadedPremium = await uploadResponse.json();
    const imageName = uploadedPremium.images[0];
    assert.ok(imageName);

    const frontendPort = await freeLoopbackPort();
    frontendBaseUrl = `http://${LOOPBACK}:${frontendPort}`;
    astroRuntime = startAstro(frontendPort, baseUrl, env);
    await waitForAstro(astroRuntime, frontendBaseUrl);

    const basicAdminPage = await fetch(
      `${frontendBaseUrl}/t/${encodeURIComponent(basicStore.slug)}/admin/promos/raffles`,
      {
        headers: { Cookie: basicPrimaryCookie },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      },
    );
    assert.equal(basicAdminPage.status, 200);
    assert.match(basicAdminPage.headers.get('content-type') || '', /text\/html/);
    const basicAdminHtml = await basicAdminPage.text();
    assert.match(basicAdminHtml, /data-admin-sidebar-root/);
    assert.match(basicAdminHtml, /data-raffles-premium-gate/);
    assert.match(basicAdminHtml, /Plan Premium requerido/);
    assert.equal(basicAdminHtml.includes('data-raffles-editor'), false);
    assert.equal(basicAdminHtml.includes('Rifa Basic conservada'), false);
    assert.equal(basicAdminHtml.includes('R7-BASIC'), false);
    assert.equal(basicAdminHtml.includes('raffle-new-btn'), false);
    assert.equal(basicAdminHtml.includes('/api/admin/raffles'), false);

    const basicLegacyAdminPage = await fetch(`${frontendBaseUrl}/admin/promos/raffles`, {
      headers: { Cookie: basicPrimaryCookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(basicLegacyAdminPage.status, 302);
    assert.equal(
      basicLegacyAdminPage.headers.get('location'),
      `/t/${basicStore.slug}/admin/promos/raffles`,
    );

    const premiumAdditionalPage = await fetch(
      `${frontendBaseUrl}/t/${encodeURIComponent(premiumStore.slug)}/admin/promos/raffles`,
      {
        headers: { Cookie: premiumAdditionalCookie },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      },
    );
    assert.equal(premiumAdditionalPage.status, 403);
    const premiumAdditionalHtml = await premiumAdditionalPage.text();
    assert.match(premiumAdditionalHtml, /No tienes permiso/);
    assert.equal(premiumAdditionalHtml.includes('data-raffles-premium-gate'), false);
    assert.equal(premiumAdditionalHtml.includes('data-raffles-editor'), false);

    const crossTenantAdminPage = await fetch(
      `${frontendBaseUrl}/t/${encodeURIComponent(premiumStore.slug)}/admin/promos/raffles`,
      {
        headers: { Cookie: basicPrimaryCookie },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      },
    );
    assert.equal(crossTenantAdminPage.status, 403);
    const crossTenantAdminHtml = await crossTenantAdminPage.text();
    assert.match(crossTenantAdminHtml, /Acceso no disponible/);
    assert.equal(crossTenantAdminHtml.includes('data-raffles-premium-gate'), false);

    const premiumPage = await fetch(
      `${frontendBaseUrl}/t/${encodeURIComponent(premiumStore.slug)}/rifa/rifa-1`,
      { redirect: 'manual', signal: AbortSignal.timeout(10000) },
    );
    assert.equal(premiumPage.status, 200);
    const premiumHtml = await premiumPage.text();
    assert.match(premiumHtml, /Rifa Premium/);
    assert.equal(premiumHtml.includes('R7-RUNTIME'), false);
    assert.equal(premiumHtml.includes('access_code_hash'), false);

    for (const pathName of [
      `/t/${encodeURIComponent(basicStore.slug)}/rifa`,
      `/t/${encodeURIComponent(basicStore.slug)}/rifa/rifa-1`,
    ]) {
      const blockedPage = await fetch(`${frontendBaseUrl}${pathName}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(blockedPage.status, 302);
      assert.equal(blockedPage.headers.get('location'), `/t/${basicStore.slug}`);
      assert.match(blockedPage.headers.get('cache-control') || '', /no-store/);
      assert.match(blockedPage.headers.get('x-robots-tag') || '', /noindex/);
    }

    const basicHome = await fetch(`${frontendBaseUrl}/t/${encodeURIComponent(basicStore.slug)}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(basicHome.status, 200);
    const basicHomeHtml = await basicHome.text();
    assert.equal(basicHomeHtml.includes('Rifa Basic conservada'), false);
    assert.equal(basicHomeHtml.includes('R7-BASIC'), false);

    const blockedFrontendStatus = await apiRequest(frontendBaseUrl, '/api/raffles/status', {
      body: { storeSlug: basicStore.slug, raffleSlug: 'rifa-1', phone: '55555555' },
    });
    assertStatus(blockedFrontendStatus, 404, 'status frontend Básico');
    assert.match(blockedFrontendStatus.headers['cache-control'] || '', /no-store/);

    const premiumPublic = await request('/api/pz/raffles/public', {
      body: { action: 'detail', store_slug: premiumStore.slug, raffle_slug: 'rifa-1' },
    });
    assertStatus(premiumPublic, 200, 'snapshot Premium');
    assert.equal(premiumPublic.data.raffle.title, 'Rifa Premium');
    assert.equal(JSON.stringify(premiumPublic.data).includes('R7-RUNTIME'), false);
    assert.equal(JSON.stringify(premiumPublic.data).includes('access_code'), false);

    const basicPublic = await request('/api/pz/raffles/public', {
      body: { action: 'detail', store_slug: basicStore.slug, raffle_slug: 'rifa-1' },
    });
    assertStatus(basicPublic, 404, 'snapshot Basic bloqueado');
    assert.match(basicPublic.headers['cache-control'] || '', /no-store/);

    const directRaffles = await request(`/api/collections/raffles/records?filter=${encodeURIComponent(`store="${premiumStore.id}"`)}`);
    assertStatus(directRaffles, 404, 'REST anónimo de rifas');
    const directEntries = await request(`/api/collections/raffle_entries/records?filter=${encodeURIComponent(`raffle="${premiumRaffle.id}"`)}`);
    assertStatus(directEntries, 404, 'REST anónimo de participantes');

    const blockedEnter = await request('/api/pz/raffles/enter', {
      body: {
        storeSlug: basicStore.slug,
        raffleSlug: 'rifa-1',
        access_code: 'R7-BASIC',
        chosen_number: '11',
        phone: '55555555',
      },
    });
    assertStatus(blockedEnter, 404, 'enter Basic');
    assert.equal(await count('raffle_entries', `store="${basicStore.id}"`), 0);
    assert.equal(await count('store_notifications', `store="${basicStore.id}"`), 0);

    const blockedStatus = await request('/api/pz/raffles/status', {
      body: { storeSlug: basicStore.slug, raffleSlug: 'rifa-1', phone: '55555555' },
    });
    assertStatus(blockedStatus, 404, 'status Basic');

    const entered = await request('/api/pz/raffles/enter', {
      body: {
        storeSlug: premiumStore.slug,
        raffleSlug: 'rifa-1',
        access_code: 'R7-RUNTIME',
        chosen_number: '07',
        phone: '55555555',
      },
    });
    assertStatus(entered, 200, 'enter Premium');
    assert.equal(entered.data.selected_number, '07');
    assert.equal(await count('raffle_entries', `store="${premiumStore.id}"`), 1);
    assert.equal(await count('store_notifications', `store="${premiumStore.id}"`), 1);

    const status = await request('/api/pz/raffles/status', {
      body: { storeSlug: premiumStore.slug, raffleSlug: 'rifa-1', phone: '55555555' },
    });
    assertStatus(status, 200, 'status Premium');
    assert.equal(status.data.status, 'active');
    assert.equal(status.data.receipt.chosen_number, '07');

    const premiumFile = await fetch(`${baseUrl}/api/files/raffles/${premiumRaffle.id}/${encodeURIComponent(imageName)}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(premiumFile.status, 200);

    await changePlan(premiumStore.id, 'basic', true);
    const downgradedPublic = await request('/api/pz/raffles/public', {
      body: { action: 'detail', store_slug: premiumStore.slug, raffle_slug: 'rifa-1' },
    });
    assertStatus(downgradedPublic, 404, 'snapshot tras downgrade');
    const downgradedFile = await fetch(`${baseUrl}/api/files/raffles/${premiumRaffle.id}/${encodeURIComponent(imageName)}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(downgradedFile.status, 404);
    assert.match(
      downgradedFile.headers.get('cache-control') || '',
      /no-store/,
      `${JSON.stringify(Object.fromEntries(downgradedFile.headers.entries()))}\n${await downgradedFile.text()}`,
    );
    assert.equal(await count('raffle_entries', `raffle="${premiumRaffle.id}"`), 1);
    const downgradedPage = await fetch(
      `${frontendBaseUrl}/t/${encodeURIComponent(premiumStore.slug)}/rifa/rifa-1`,
      { redirect: 'manual', signal: AbortSignal.timeout(10000) },
    );
    assert.equal(downgradedPage.status, 302);
    assert.equal(downgradedPage.headers.get('location'), `/t/${premiumStore.slug}`);

    await changePlan(premiumStore.id, 'premium');
    const restored = await request('/api/pz/raffles/public', {
      body: { action: 'detail', store_slug: premiumStore.slug, raffle_slug: 'rifa-1' },
    });
    assertStatus(restored, 200, 'Premium restaurado');
    assert.equal(restored.data.raffle.title, 'Rifa Premium');
    assert.equal(await count('raffle_entries', `raffle="${premiumRaffle.id}"`), 1);
    assert.equal(await count('store_notifications', `store="${premiumStore.id}"`), 1);
    const restoredFile = await fetch(`${baseUrl}/api/files/raffles/${premiumRaffle.id}/${encodeURIComponent(imageName)}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(restoredFile.status, 200);
    const restoredPage = await fetch(
      `${frontendBaseUrl}/t/${encodeURIComponent(premiumStore.slug)}/rifa/rifa-1`,
      { redirect: 'manual', signal: AbortSignal.timeout(10000) },
    );
    assert.equal(restoredPage.status, 200);

    const basicStored = await request(`/api/collections/raffles/records/${basicRaffle.id}`, { token: superToken });
    assertStatus(basicStored, 200, 'configuración Basic preservada');
    assert.equal(basicStored.data.title, 'Rifa Basic conservada');
    assert.equal(basicStored.data.access_code, 'R7-BASIC');
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      await stopAstro(astroRuntime);
      if (frontendBaseUrl) {
        await assert.rejects(
          fetch(`${frontendBaseUrl}/`, { signal: AbortSignal.timeout(500) }),
        );
      }
      await stopPocketBase(runtime);
      if (baseUrl) {
        await assert.rejects(
          fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) }),
        );
      }
    } catch (cleanupError) {
      if (!failure) throw cleanupError;
    } finally {
      assertOwnedTempDirectory(tempDirectory);
      fs.rmSync(tempDirectory, { recursive: true, force: true });
      assert.equal(fs.existsSync(tempDirectory), false);
    }
  }
});
