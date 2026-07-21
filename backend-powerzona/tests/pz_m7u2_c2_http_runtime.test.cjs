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
const TEMP_PREFIX = 'M7U2C2F1QA_';
const LOOPBACK = '127.0.0.1';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function opaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url').slice(0, bytes);
}

function runtimePassword(label) {
  return `QA-${label}-${randomBytes(24).toString('base64url')}!Aa1`;
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
    `--migrationsDir=${migrationsDirectory || MIGRATIONS_DIR}`,
    '--hooksWatch=false',
    '--hooksPool=2',
    '--automigrate=true',
    '--indexFallback=false',
  ];
}

function bootstrapSuperuser(dataDirectory, migrationsDirectory, email, password) {
  const result = spawnSync(
    POCKETBASE_EXE,
    ['superuser', 'create', email, password, ...pocketBaseFlags(dataDirectory, migrationsDirectory)],
    {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
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

function startPocketBase(dataDirectory, migrationsDirectory, port) {
  let output = '';
  let spawnError = null;
  const child = spawn(
    POCKETBASE_EXE,
    ['serve', `--http=${LOOPBACK}:${port}`, ...pocketBaseFlags(dataDirectory, migrationsDirectory)],
    {
      cwd: BACKEND_DIR,
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
  assert.equal(path.dirname(resolvedDirectory), resolvedRoot, `directorio temporal fuera de alcance: ${resolvedDirectory}`);
  assert.match(path.basename(resolvedDirectory), /^M7U2C2F1QA_[A-Za-z0-9_-]+$/);
}

async function apiRequest(baseUrl, route, { token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
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
  return {
    status: response.status,
    data,
    raw,
    headers: Object.fromEntries(response.headers.entries()),
  };
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

function deepObjectKeys(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => deepObjectKeys(item, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  Object.entries(value).forEach(([key, item]) => {
    output.push(key);
    deepObjectKeys(item, output);
  });
  return output;
}

test('M7U2-C2 HTTP runtime valida actividad privada y eliminacion segura end-to-end', { timeout: 180000 }, async () => {
  assert.equal(fs.existsSync(POCKETBASE_EXE), true, `falta binario PocketBase: ${POCKETBASE_EXE}`);
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const tempDirectory = fs.mkdtempSync(path.join(TEMP_ROOT, TEMP_PREFIX));
  assertOwnedTempDirectory(tempDirectory);
  const dataDirectory = path.join(tempDirectory, 'pb_data');
  fs.mkdirSync(dataDirectory, { recursive: true });
  const runtimeMigrationsDirectory = path.join(tempDirectory, 'pb_migrations');
  fs.cpSync(MIGRATIONS_DIR, runtimeMigrationsDirectory, { recursive: true });

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toLowerCase();
  const prefix = `M7U2C2F1QA_${suffix}`;
  const slugPrefix = `m7u2c2f1qa-${suffix}`;
  const superEmail = `${slugPrefix}-super@example.test`;
  const superPassword = runtimePassword('superuser');
  const passwords = {
    master: runtimePassword('master'),
    primaryA: runtimePassword('primary-a'),
    primaryB: runtimePassword('primary-b'),
    primaryBasic: runtimePassword('primary-basic'),
    blockedBasic: runtimePassword('blocked-basic'),
  };
  let runtime = null;
  let failure = null;

  try {
    bootstrapSuperuser(dataDirectory, runtimeMigrationsDirectory, superEmail, superPassword);
    const port = await freeLoopbackPort();
    const baseUrl = `http://${LOOPBACK}:${port}`;
    runtime = startPocketBase(dataDirectory, runtimeMigrationsDirectory, port);
    await waitForPocketBase(runtime, baseUrl);

    const request = (route, options) => apiRequest(baseUrl, route, options);
    let superToken = '';
    let masterToken = '';
    let primaryAToken = '';
    let primaryBToken = '';
    let primaryBasicToken = '';

    async function createRecord(collection, body) {
      const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
      assertStatus(result, 200, `crear ${collection}`);
      return result.data;
    }

    async function createAdminRecord(collection, body, token = primaryAToken) {
      const result = await request(`/api/collections/${collection}/records`, { token, body });
      assertStatus(result, 200, `crear ${collection} mediante actor Store`);
      return result.data;
    }

    async function patchAdminRecord(collection, id, body, token = primaryAToken) {
      const result = await request(`/api/collections/${collection}/records/${id}`, {
        token,
        method: 'PATCH',
        body,
      });
      assertStatus(result, 200, `actualizar ${collection} mediante actor Store`);
      return result.data;
    }

    async function listRecords(collection, filter = '') {
      const query = new URLSearchParams({ page: '1', perPage: '200' });
      if (filter) query.set('filter', filter);
      const result = await request(`/api/collections/${collection}/records?${query}`, { token: superToken });
      assertStatus(result, 200, `listar ${collection}`);
      return result.data?.items || [];
    }

    async function login(email, password, device = '') {
      return request('/api/collections/users/auth-with-password', {
        body: { identity: email, password },
        headers: device ? { 'X-PZ-Admin-Device': device } : {},
      });
    }

    async function refresh(token, device = '') {
      return request('/api/collections/users/auth-refresh', {
        token,
        body: {},
        headers: device ? { 'X-PZ-Admin-Device': device } : {},
      });
    }

    async function activity(token, action, body = {}) {
      return request(`/api/pz/store/activity/${action}`, { token, body });
    }

    async function team(token, action, body = {}) {
      return request(`/api/pz/store/team/${action}`, { token, body });
    }

    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: superEmail, password: superPassword },
    });
    assertStatus(superAuth, 200, 'autenticar superuser efimero');
    superToken = superAuth.data.token;

    const storeA = await createRecord('stores', {
      name: `${prefix} Store A`,
      slug: `${slugPrefix}-a`,
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const storeB = await createRecord('stores', {
      name: `${prefix} Store B`,
      slug: `${slugPrefix}-b`,
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const storeBasic = await createRecord('stores', {
      name: `${prefix} Store Basic`,
      slug: `${slugPrefix}-basic`,
      status: 'active',
      plan: 'basic',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });

    const master = await createRecord('users', {
      email: `${slugPrefix}-master@example.test`,
      password: passwords.master,
      passwordConfirm: passwords.master,
      display_name: `${prefix} Master`,
      role: 'master_admin',
      status: 'active',
      emailVisibility: true,
    });
    const primaryA = await createRecord('users', {
      email: `${slugPrefix}-primary-a@example.test`,
      password: passwords.primaryA,
      passwordConfirm: passwords.primaryA,
      display_name: `${prefix} Primary A`,
      role: 'store_admin',
      status: 'active',
      store: storeA.id,
      emailVisibility: true,
    });
    const primaryB = await createRecord('users', {
      email: `${slugPrefix}-primary-b@example.test`,
      password: passwords.primaryB,
      passwordConfirm: passwords.primaryB,
      display_name: `${prefix} Primary B`,
      role: 'store_admin',
      status: 'active',
      store: storeB.id,
      emailVisibility: true,
    });
    // The blocked fixture authenticates while it is the sole active Basic
    // user. It is suspended for the principal assignment and reactivated
    // afterwards, preserving the old token so /activity exercises its own
    // plan guard instead of stopping earlier in the auth hook.
    const blockedBasic = await createRecord('users', {
      email: `${slugPrefix}-blocked-basic@example.test`,
      password: passwords.blockedBasic,
      passwordConfirm: passwords.blockedBasic,
      display_name: `${prefix} Blocked Basic`,
      role: 'store_staff',
      status: 'active',
      store: storeBasic.id,
      emailVisibility: true,
    });
    const primaryBasic = await createRecord('users', {
      email: `${slugPrefix}-primary-basic@example.test`,
      password: passwords.primaryBasic,
      passwordConfirm: passwords.primaryBasic,
      display_name: `${prefix} Primary Basic`,
      role: 'store_admin',
      status: 'active',
      store: storeBasic.id,
      emailVisibility: true,
    });
    const blockedBasicDevice = 'K'.repeat(43);
    const blockedBeforeAssignment = await login(blockedBasic.email, passwords.blockedBasic, blockedBasicDevice);
    assertStatus(blockedBeforeAssignment, 200, 'login previo del futuro usuario bloqueado por plan');
    const blockedBasicToken = blockedBeforeAssignment.data.token;
    const suspendBlockedFixture = await request(`/api/collections/users/records/${blockedBasic.id}`, {
      token: superToken,
      method: 'PATCH',
      body: { status: 'suspended' },
    });
    assertStatus(suspendBlockedFixture, 200, 'preparar fixture Basic para asignacion principal');

    const masterAuth = await login(master.email, passwords.master);
    assertStatus(masterAuth, 200, 'login Master');
    masterToken = masterAuth.data.token;

    for (const [store, plan] of [[storeA, 'premium'], [storeB, 'premium'], [storeBasic, 'basic']]) {
      const changedPlan = await request('/api/pz/master/store-plan/change', {
        token: masterToken,
        body: {
          store_id: store.id,
          plan,
          is_permanent: true,
          duration_months: 0,
          reason: `${prefix} activate premium`,
          confirm_expiration_cleanup: false,
        },
      });
      assertStatus(changedPlan, 200, `activar ${plan} ${store.id}`);
    }

    for (const [store, primary] of [[storeA, primaryA], [storeB, primaryB], [storeBasic, primaryBasic]]) {
      const assigned = await request('/api/pz/master/primary-admin/assign', {
        token: masterToken,
        body: {
          store_id: store.id,
          user_id: primary.id,
          reason: `${prefix} assign primary`,
        },
      });
      assertStatus(assigned, 200, `asignar principal ${store.id}`);
      assert.equal(assigned.data.primary_admin.id, primary.id);
    }

    const rejectedDirectPlanUpdate = await request(`/api/collections/stores/records/${storeA.id}`, {
      token: masterToken,
      method: 'PATCH',
      body: { plan: 'basic' },
    });
    assertStatus(rejectedDirectPlanUpdate, 404, 'Master no evita flujo oficial modificando plan por REST');
    const storeAfterRejectedPlan = await request(`/api/collections/stores/records/${storeA.id}`, { token: superToken });
    assertStatus(storeAfterRejectedPlan, 200, 'tienda persiste tras plan directo rechazado');
    assert.equal(storeAfterRejectedPlan.data.plan, 'premium');

    const rejectedDirectStoreDelete = await request(`/api/collections/stores/records/${storeB.id}`, {
      token: masterToken,
      method: 'DELETE',
    });
    assertStatus(rejectedDirectStoreDelete, 404, 'tienda no se borra por REST fuera del flujo integral Master');
    const storeAfterRejectedDelete = await request(`/api/collections/stores/records/${storeB.id}`, { token: superToken });
    assertStatus(storeAfterRejectedDelete, 200, 'tienda sobrevive al borrado REST rechazado');

    const auditedStorePresentationUpdate = await request(`/api/collections/stores/records/${storeA.id}`, {
      token: masterToken,
      method: 'PATCH',
      body: { featured: true, featured_order: 7 },
    });
    assertStatus(auditedStorePresentationUpdate, 200, 'cambio directo permitido de tienda queda auditado');

    const reactivateBlockedFixture = await request(`/api/collections/users/records/${blockedBasic.id}`, {
      token: superToken,
      method: 'PATCH',
      body: { status: 'active' },
    });
    assertStatus(reactivateBlockedFixture, 200, 'activar fixture bloqueada despues de asignar principal');

    const primaryADevice = 'A'.repeat(43);
    const primaryBDevice = 'B'.repeat(43);
    const primaryAAuth = await login(primaryA.email, passwords.primaryA, primaryADevice);
    assertStatus(primaryAAuth, 200, 'login principal A');
    primaryAToken = primaryAAuth.data.token;
    const primaryBAuth = await login(primaryB.email, passwords.primaryB, primaryBDevice);
    assertStatus(primaryBAuth, 200, 'login principal B');
    primaryBToken = primaryBAuth.data.token;
    const primaryBasicAuth = await login(primaryBasic.email, passwords.primaryBasic, 'J'.repeat(43));
    assertStatus(primaryBasicAuth, 200, 'login principal Basic');
    primaryBasicToken = primaryBasicAuth.data.token;

    const blockedActivity = await activity(blockedBasicToken, 'self', {});
    assertStatus(blockedActivity, 403, 'usuario bloqueado por plan no accede a activity');
    assert.equal(blockedActivity.data.error, 'unauthorized');
    assertStatus(
      await login(blockedBasic.email, passwords.blockedBasic, blockedBasicDevice),
      [400, 401, 403],
      'usuario bloqueado por plan tampoco obtiene sesion nueva',
    );
    const basicTeam = await team(primaryBasicToken, 'list', {});
    assertStatus(basicTeam, 200, 'principal Basic ve usuario persistido y bloqueado');
    const blockedBasicRow = basicTeam.data.users.find((user) => user.id === blockedBasic.id);
    assert.ok(blockedBasicRow, 'usuario bloqueado persiste en el equipo Basic');
    assert.equal(blockedBasicRow.blocked_by_plan, true);
    assert.equal(blockedBasicRow.email, blockedBasic.email, 'principal recibe correo completo incluso para usuario bloqueado por plan');

    const productA = await createRecord('products', {
      store: storeA.id,
      name: `${prefix} Product A`,
      slug: `${slugPrefix}-product-a`,
      base_price_usd: 10,
      regular_price_usd: 10,
      stock: 5,
      active: true,
      delivery_mode: 'both',
    });
    const productB = await createRecord('products', {
      store: storeB.id,
      name: `${prefix} Product B`,
      slug: `${slugPrefix}-product-b`,
      base_price_usd: 10,
      regular_price_usd: 10,
      stock: 5,
      active: true,
      delivery_mode: 'both',
    });
    const productBasic = await createRecord('products', {
      store: storeBasic.id,
      name: `${prefix} Product Basic`,
      slug: `${slugPrefix}-product-basic`,
      base_price_usd: 10,
      regular_price_usd: 10,
      stock: 5,
      active: true,
      delivery_mode: 'both',
    });
    const deniedBasicExpiration = await request(`/api/collections/products/records/${productBasic.id}`, {
      token: primaryBasicToken,
      method: 'PATCH',
      body: { expiration_date: '2099-12-30' },
    });
    assertStatus(deniedBasicExpiration, 403, 'F12 no habilita vencimiento Premium en tienda Basic');
    assert.match(deniedBasicExpiration.raw, /expiration_premium_required|permission_denied/);
    const productBasicAfterDenial = await request(`/api/collections/products/records/${productBasic.id}`, {
      token: superToken,
    });
    assertStatus(productBasicAfterDenial, 200, 'producto Basic permanece intacto');
    assert.equal(String(productBasicAfterDenial.data.expiration_date || ''), '');

    const memberEmail = `${slugPrefix}-catalog@example.test`;
    const memberPhone = '+1 555 0199';
    const memberCreateReason = `${prefix} create catalog member`;
    const memberPermissions = permissionCatalog.normalizePermissions([
      'catalog.products.edit',
      'catalog.products.stock',
      'catalog.expirations.manage',
    ]);
    const createdMember = await team(primaryAToken, 'create', {
      email: memberEmail,
      display_name: `${prefix} Catalog Member`,
      phone: memberPhone,
      template_code: 'custom',
      permissions: memberPermissions,
      reason: memberCreateReason,
    });
    assertStatus(createdMember, 200, 'crear miembro de catalogo');
    assert.ok(createdMember.data.temporary_password.length >= 20);
    const member = createdMember.data.user;
    const firstTemporaryPassword = createdMember.data.temporary_password;

    const createdSuspendedMember = await team(primaryAToken, 'create', {
      email: `${slugPrefix}-suspended@example.test`,
      display_name: `${prefix} Suspended Member`,
      phone: '',
      template_code: 'read_only',
      permissions: permissionCatalog.resolveTemplatePermissions('read_only'),
      reason: `${prefix} create suspended fixture`,
    });
    assertStatus(createdSuspendedMember, 200, 'crear segundo adicional');
    const suspendedMember = createdSuspendedMember.data.user;
    const suspendedMemberPassword = createdSuspendedMember.data.temporary_password;
    const createdThirdMember = await team(primaryAToken, 'create', {
      email: `${slugPrefix}-third@example.test`,
      display_name: `${prefix} Third Member`,
      phone: '',
      template_code: 'orders_shipping',
      permissions: permissionCatalog.resolveTemplatePermissions('orders_shipping'),
      reason: `${prefix} create third fixture`,
    });
    assertStatus(createdThirdMember, 200, 'crear tercer adicional');
    const thirdMember = createdThirdMember.data.user;
    const thirdMemberPassword = createdThirdMember.data.temporary_password;

    const fullCapacitySummary = await team(primaryAToken, 'summary', {});
    assertStatus(fullCapacitySummary, 200, 'Premium alcanza principal mas tres adicionales');
    assert.equal(fullCapacitySummary.data.user_counts.active, 4);
    assert.equal(fullCapacitySummary.data.user_counts.available, 0);
    const overCapacity = await team(primaryAToken, 'create', {
      email: `${slugPrefix}-over-capacity@example.test`,
      display_name: `${prefix} Over Capacity`,
      phone: '',
      template_code: 'read_only',
      permissions: permissionCatalog.resolveTemplatePermissions('read_only'),
      reason: `${prefix} verify premium capacity`,
    });
    assertStatus(overCapacity, 409, 'Premium rechaza cuarto adicional activo');
    assert.equal(overCapacity.data.error, 'active_user_limit_reached');

    const suspendedDevice = 'D'.repeat(43);
    const suspendedMemberAuth = await login(suspendedMember.email, suspendedMemberPassword, suspendedDevice);
    assertStatus(suspendedMemberAuth, 200, 'login antes de suspender segundo adicional');
    const suspendedMemberToken = suspendedMemberAuth.data.token;
    const suspended = await team(primaryAToken, 'suspend', {
      user_id: suspendedMember.id,
      reason: `${prefix} suspend fixture member`,
    });
    assertStatus(suspended, 200, 'suspender segundo adicional mediante endpoint oficial');
    assert.equal(suspended.data.user.status, 'suspended');
    assertStatus(
      await activity(suspendedMemberToken, 'self', {}),
      [401, 403],
      'usuario suspendido no accede a activity',
    );
    const suspendedSummary = await team(primaryAToken, 'summary', {});
    assertStatus(suspendedSummary, 200, 'resumen conserva adicional suspendido');
    assert.equal(suspendedSummary.data.user_counts.active, 3);
    assert.equal(suspendedSummary.data.user_counts.suspended, 1);
    const teamFixtureList = await team(primaryAToken, 'list', {});
    assertStatus(teamFixtureList, 200, 'equipo Premium conserva tres adicionales registrados');
    assert.equal(teamFixtureList.data.users.filter((user) => !user.is_primary_admin).length, 3);
    assert.equal(teamFixtureList.data.users.find((user) => user.id === suspendedMember.id).status, 'suspended');
    assert.equal(teamFixtureList.data.users.find((user) => user.id === member.id).email, member.email);
    assert.equal(teamFixtureList.data.users.find((user) => user.id === suspendedMember.id).email, suspendedMember.email);
    assert.equal(JSON.stringify(teamFixtureList.data.users).includes('***@'), false, 'el principal no recibe correos enmascarados');
    const crossTenantTeamList = await team(primaryBToken, 'list', {});
    assertStatus(crossTenantTeamList, 200, 'principal B lista exclusivamente su tienda');
    assert.equal(crossTenantTeamList.data.users.some((user) => user.email === member.email), false);

    const memberDevice = 'C'.repeat(43);
    const memberAuth = await login(member.email, firstTemporaryPassword, memberDevice);
    assertStatus(memberAuth, 200, 'login de miembro con acceso temporal');
    let memberToken = memberAuth.data.token;
    const deniedStaffTeamList = await team(memberToken, 'list', {});
    assertStatus(deniedStaffTeamList, 403, 'Store Staff no recibe el listado privado con correos');
    assert.equal(deniedStaffTeamList.data.error, 'permission_denied');

    for (const collection of ['store_activity_audit', 'store_activity_reviews']) {
      const privateRead = await request(`/api/collections/${collection}/records?perPage=10`, { token: memberToken });
      assertStatus(privateRead, [403, 404], `${collection} permanece privado`);
    }
    const rejectedDirectCreate = await request('/api/collections/store_activity_audit/records', {
      token: superToken,
      body: {},
    });
    assertStatus(rejectedDirectCreate, 404, 'ni superuser escribe actividad por REST');

    const emptyLiveReport = await activity(primaryAToken, 'user-report', {
      actor_id: thirdMember.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(emptyLiveReport, 200, 'reporte de integrante vivo sin eventos');
    assert.equal(emptyLiveReport.data.actor.state, 'active');
    assert.equal(emptyLiveReport.data.summary.total_changes, 0);
    assert.equal(emptyLiveReport.data.events.length, 0);

    // Seed only the records that official operations need as trusted input.
    // Every administrative mutation asserted below is performed with the
    // principal token, never with the superuser token.
    const usd = await createAdminRecord('currencies', {
      store: storeA.id,
      code: 'USD',
      name: `${prefix} USD`,
      symbol: '$',
      exchange_rate: 1,
      active: true,
      is_default: true,
      is_base: true,
    });
    const storeSettings = await createAdminRecord('settings', {
      store: storeA.id,
      stored_name: `${prefix} Store A`,
      store_name: `${prefix} Store A`,
      whatsapp_number: '+15550198',
      default_currency: usd.id,
      active: true,
      order_prefix: 'QA',
      notifications_enabled: true,
      notify_new_order: true,
    });
    const settingsUpdated = await request(`/api/collections/settings/records/${storeSettings.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { order_prefix: 'QB' },
    });
    assertStatus(settingsUpdated, 200, 'principal modifica settings por REST protegido');

    const categoryA = await createAdminRecord('categories', {
      store: storeA.id,
      name: `${prefix} Category A`,
      slug: `${slugPrefix}-category-a`,
      active: true,
    });
    const categoryB = await createAdminRecord('categories', {
      store: storeA.id,
      name: `${prefix} Category B`,
      slug: `${slugPrefix}-category-b`,
      active: true,
    });
    await patchAdminRecord('products', productA.id, { category: categoryA.id });
    await patchAdminRecord('products', productA.id, { category: categoryB.id });
    const categoryReplacementEvents = await activity(primaryAToken, 'list', {
      action: 'product_updated',
      resource_type: 'product',
      resource_id: productA.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(categoryReplacementEvents, 200, 'reemplazo real de relacion queda consultable');
    const categoryReplacementEvent = categoryReplacementEvents.data.events.find((event) => (
      event.changed_fields.includes('category')
      && event.previous_values.category === 'Asignación anterior'
    ));
    assert.ok(categoryReplacementEvent, 'reemplazo A a B genera evento aunque conserve cardinalidad');
    assert.equal(categoryReplacementEvent.new_values.category, 'Asignación actualizada');
    const safeCategoryReplacement = JSON.stringify(categoryReplacementEvent);
    assert.equal(safeCategoryReplacement.includes(categoryA.id), false);
    assert.equal(safeCategoryReplacement.includes(categoryB.id), false);

    const productGeneralExpiration = await request(`/api/collections/products/records/${productA.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { expiration_date: '2099-12-30' },
    });
    assertStatus(productGeneralExpiration, 200, 'principal define vencimiento general Premium');

    const variation = await createAdminRecord('product_variations', {
      store: storeA.id,
      product: productA.id,
      variation_type: 'Size',
      value: `${prefix} Large`,
      active: true,
      price_usd: 12,
      stock: 6,
    });
    const productVariationMode = await request(`/api/collections/products/records/${productA.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { has_variations: true },
    });
    assertStatus(productVariationMode, 200, 'principal activa explicitamente el modo variaciones');
    const variationExpiration = await request(`/api/collections/product_variations/records/${variation.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { expiration_date: '2099-12-29' },
    });
    assertStatus(variationExpiration, 200, 'principal modifica vencimiento de variacion Premium');
    const variationExpirationRetry = await request(`/api/collections/product_variations/records/${variation.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { expiration_date: '2099-12-29' },
    });
    assertStatus(variationExpirationRetry, 200, 'retry de vencimiento no duplica limpieza del producto');
    const productAfterVariationExpiration = await request(`/api/collections/products/records/${productA.id}`, {
      token: superToken,
    });
    assertStatus(productAfterVariationExpiration, 200, 'leer producto tras activar modo por variacion');
    assert.equal(String(productAfterVariationExpiration.data.expiration_date || ''), '');
    const autoClearEvents = await activity(primaryAToken, 'list', {
      action: 'product_expiration_cleared_for_variation',
      resource_type: 'product',
      resource_id: productA.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(autoClearEvents, 200, 'listar limpieza automatica central del producto');
    assert.equal(autoClearEvents.data.events.length, 1, 'primera fecha por variacion genera un solo evento central');
    assert.deepEqual(autoClearEvents.data.events[0].changed_fields, ['expiration_date']);
    assert.deepEqual(autoClearEvents.data.events[0].previous_values, { expiration_date: '2099-12-30' });
    assert.deepEqual(autoClearEvents.data.events[0].new_values, { expiration_date: '' });

    const shippingZone = await createAdminRecord('shipping_zones', {
      store: storeA.id,
      municipality: `${prefix} Municipality`,
      zone: 'Center',
      price_usd: 4,
      active: true,
    });
    const promotion = await createAdminRecord('automatic_promotions', {
      store: storeA.id,
      name: `${prefix} Promotion`,
      active: true,
      type: 'product_discount',
      scope: 'product',
      discount_type: 'percentage',
      discount_value: 10,
      product: productA.id,
      priority: 1,
    });
    const couponCode = `QC${suffix.slice(-12).toUpperCase()}`;
    const coupon = await createAdminRecord('manual_coupons', {
      store: storeA.id,
      code: couponCode,
      name: `${prefix} Coupon`,
      active: true,
      scope: 'cart',
      discount_type: 'percentage',
      discount_value: 5,
      unlimited_uses: true,
      max_uses: 0,
    });
    const gift = await createAdminRecord('gifts', {
      store: storeA.id,
      name: `${prefix} Gift`,
      min_order_usd: 5,
      stock: 3,
      active: true,
    });
    const raffle = await createAdminRecord('raffles', {
      store: storeA.id,
      title: `${prefix} Raffle`,
      slug: `${slugPrefix}-raffle`,
      status: 'draft',
      visible: false,
      link_enabled: true,
      show_in_store: false,
    });
    const raffleAccessCode = `QA-${opaqueToken(18)}`;
    await patchAdminRecord('currencies', usd.id, { name: `${prefix} USD Updated` });
    await patchAdminRecord('shipping_zones', shippingZone.id, { price_usd: 5 });
    await patchAdminRecord('automatic_promotions', promotion.id, { discount_value: 15 });
    await patchAdminRecord('manual_coupons', coupon.id, { discount_value: 10 });
    await patchAdminRecord('gifts', gift.id, { stock: 2 });
    await patchAdminRecord('raffles', raffle.id, { access_code: raffleAccessCode });
    const reviewCustomerName = `${prefix} Private Review Customer`;
    const reviewComment = `${prefix} private review comment must not reach activity`;
    const review = await createAdminRecord('reviews', {
      store: storeA.id,
      type: 'product',
      product: productA.id,
      rating: 5,
      customer_name: reviewCustomerName,
      comment: reviewComment,
      status: 'pending',
      source: 'admin_created',
      verified_purchase: false,
      featured: false,
    });
    const approvedReview = await request(`/api/collections/reviews/records/${review.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { status: 'approved', approved_at: new Date().toISOString() },
    });
    assertStatus(approvedReview, 200, 'principal aprueba resena por REST protegido');

    const securityReason = `${prefix} token 0123456789abcdef0123456789abcdef phone +15550196 ip 203.0.113.7`;
    const securityPhone = '5355501987';
    await createRecord('store_security_settings', {
      store: storeA.id,
      enabled: true,
      mode: 'monitoring',
      manual_blocking_enabled: false,
      full_access_blocking_enabled: false,
      permanent_blocks_enabled: false,
      retention_days: 30,
      ip_visibility: 'hidden',
      notify_blocked_attempts: false,
    });
    const securityCustomer = await createRecord('store_customers', {
      store: storeA.id,
      display_name: `${prefix} Security Subject`,
      phone_normalized: securityPhone,
      phone_hmac: `${prefix.toLowerCase()}-private-hmac`,
      status: 'normal',
      internal_notes: `${prefix} private security metadata`,
    });
    const observedCustomer = await request('/api/pz/security/customer-observation', {
      token: primaryAToken,
      body: {
        store_id: storeA.id,
        customer_id: securityCustomer.id,
        action: 'enable',
        reason: securityReason,
      },
    });
    assertStatus(observedCustomer, 200, 'principal genera evento Seguridad oficial');
    assert.equal(observedCustomer.data.status, 'watch');

    const orderCustomerName = `${prefix} Private Order Customer`;
    const orderCustomerPhone = '+1 555 0197';
    const checkout = await request('/api/pz/checkout/orders', {
      body: {
        store_id: storeA.id,
        idempotency_key: opaqueToken(),
        customer_name: orderCustomerName,
        customer_phone: orderCustomerPhone,
        currency_id: usd.id,
        delivery_method: 'pickup',
        items: [{ product_id: productA.id, variation_id: variation.id, quantity: 1 }],
      },
    });
    assertStatus(checkout, 200, 'checkout siembra orden canonica');
    const order = checkout.data.order;
    const orderItem = checkout.data.items[0];

    const directOrderStatus = await request(`/api/collections/orders/records/${order.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { status: 'confirmed' },
    });
    assertStatus(directOrderStatus, 403, 'F12 no cambia estado de orden por REST directo');
    const directOrderItem = await request(`/api/collections/order_items/records/${orderItem.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { quantity: 9, unit_price_final_usd: 0.01 },
    });
    assertStatus(directOrderItem, 403, 'F12 no altera item ni precio por REST directo');

    const adjustedOrderItem = await request(`/api/pz/admin/orders/${order.id}/items/${orderItem.id}/price-adjustments`, {
      token: primaryAToken,
      body: {
        final_unit_price_usd: 9,
        reason_code: 'price_correction',
        reason_text: `${prefix} canonical runtime adjustment`,
      },
    });
    assertStatus(adjustedOrderItem, 200, 'ajuste de precio usa endpoint oficial');
    const transitionedOrder = await request(`/api/pz/admin/orders/${order.id}/transition`, {
      token: primaryAToken,
      body: { status: 'confirmed' },
    });
    assertStatus(transitionedOrder, 200, 'estado de orden usa endpoint oficial');
    assert.equal(transitionedOrder.data.order.status, 'confirmed');
    const deliveredOrder = await request(`/api/pz/admin/orders/${order.id}/transition`, {
      token: primaryAToken,
      body: { status: 'delivered' },
    });
    assertStatus(deliveredOrder, 200, 'entrega de orden usa endpoint oficial');
    const issuedOrderReview = await request(`/api/pz/admin/orders/${order.id}/review-token`, {
      token: primaryAToken,
      body: {},
    });
    assertStatus(issuedOrderReview, 200, 'token de resena se emite por endpoint oficial');
    const orderReviewToken = issuedOrderReview.data.order.review_token;
    assert.match(orderReviewToken, /^[A-Za-z0-9_-]{40}$/);

    const f12ForeignReparent = await request(`/api/collections/products/records/${productB.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      body: { store: storeA.id, name: `${prefix} Forged Reparent` },
    });
    assertStatus(f12ForeignReparent, 404, 'F12 no reparenta producto de otra tienda');
    const productBAfterF12 = await request(`/api/collections/products/records/${productB.id}`, { token: superToken });
    assertStatus(productBAfterF12, 200, 'producto ajeno sigue accesible solo para verificacion superuser');
    assert.equal(productBAfterF12.data.store, storeB.id);
    assert.equal(productBAfterF12.data.name, `${prefix} Product B`);

    const reusedRequestId = `${prefix}-same-request-id`;
    const memberStockFour = await request(`/api/collections/products/records/${productA.id}`, {
      token: memberToken,
      method: 'PATCH',
      headers: { 'X-Request-ID': reusedRequestId },
      body: { stock: 4 },
    });
    assertStatus(memberStockFour, 200, 'miembro actualiza stock a cuatro');
    const memberStockThree = await request(`/api/collections/products/records/${productA.id}`, {
      token: memberToken,
      method: 'PATCH',
      headers: { 'X-Request-ID': reusedRequestId },
      body: { stock: 3 },
    });
    assertStatus(memberStockThree, 200, 'request id reutilizado no colapsa otro cambio real');
    const memberNoopRetry = await request(`/api/collections/products/records/${productA.id}`, {
      token: memberToken,
      method: 'PATCH',
      headers: { 'X-Request-ID': reusedRequestId },
      body: { stock: 3 },
    });
    assertStatus(memberNoopRetry, 200, 'retry sin cambio es idempotente');

    const memberSelf = await activity(memberToken, 'self', {
      module: 'catalog',
      action: 'product_updated',
      page: 1,
      per_page: 50,
    });
    assertStatus(memberSelf, 200, 'actividad propia del miembro');
    assert.equal(memberSelf.data.events.length, 2, 'dos cambios reales y ningun evento para el no-op');
    assert.equal(memberSelf.data.pagination.total_items, 2);
    assert.ok(memberSelf.data.events.every((event) => event.action === 'product_updated'));
    assert.ok(memberSelf.data.events.every((event) => !Object.hasOwn(event, 'review')));
    assert.match(memberSelf.headers['cache-control'] || '', /private.*no-store|no-store.*private/i);

    const forgedSelf = await activity(memberToken, 'self', { actor_id: primaryA.id });
    assertStatus(forgedSelf, 400, 'self rechaza actor_id controlado por cliente');
    assert.equal(forgedSelf.data.error, 'invalid_payload');
    const memberFullList = await activity(memberToken, 'list', {});
    assertStatus(memberFullList, 403, 'miembro no obtiene lista completa');
    assert.equal(memberFullList.data.error, 'primary_admin_required');
    const memberForeignReport = await activity(memberToken, 'user-report', { actor_id: primaryA.id });
    assertStatus(memberForeignReport, 403, 'miembro no obtiene reporte ajeno');

    const memberLastModified = await activity(memberToken, 'last-modified', {
      resources: [
        { type: 'product', id: productA.id },
        { type: 'product', id: productB.id },
      ],
    });
    assertStatus(memberLastModified, 200, 'ultima modificacion acotada para miembro');
    assert.deepEqual(Object.keys(memberLastModified.data.items), [`product:${productA.id}`]);
    assert.equal(memberLastModified.data.items[`product:${productA.id}`].actor_name, '');
    assert.equal(memberLastModified.data.items[`product:${productA.id}`].summary, '');

    const primaryStockTwo = await request(`/api/collections/products/records/${productA.id}`, {
      token: primaryAToken,
      method: 'PATCH',
      headers: { 'X-Request-ID': `${prefix}-primary-stock` },
      body: { stock: 2 },
    });
    assertStatus(primaryStockTwo, 200, 'principal genera actividad separada');

    const rollbackExpirationProduct = await createAdminRecord('products', {
      store: storeA.id,
      name: `${prefix} Expiration Rollback`,
      slug: `${slugPrefix}-expiration-rollback`,
      base_price_usd: 9,
      regular_price_usd: 9,
      stock: 2,
      active: true,
      delivery_mode: 'both',
      expiration_date: '2099-12-28',
    });
    const rollbackExpirationVariation = await createAdminRecord('product_variations', {
      store: storeA.id,
      product: rollbackExpirationProduct.id,
      variation_type: 'Size',
      value: `${prefix} Rollback`,
      active: true,
      price_usd: 9,
      stock: 2,
    });

    // Prove the write and its central event share one database transaction.
    // This only alters the disposable runtime schema and is restored before
    // continuing: an impossible source-key pattern forces the audit save to
    // fail after e.next(), so the product mutation must roll back as well.
    const activitySchema = await request('/api/collections/store_activity_audit', { token: superToken });
    assertStatus(activitySchema, 200, 'leer esquema efimero de actividad');
    const sourceKeyField = activitySchema.data.fields.find((field) => field.name === 'source_event_key');
    assert.ok(sourceKeyField, 'source_event_key existe en esquema efimero');
    const originalSourcePattern = sourceKeyField.pattern || '';
    const productEventsBeforeRollback = await listRecords(
      'store_activity_audit',
      recordFilter('resource_id_snapshot', productA.id),
    );
    sourceKeyField.pattern = '^M7U2C2_RUNTIME_NEVER_MATCH$';
    const forcedFailureSchema = await request(`/api/collections/${activitySchema.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: { fields: activitySchema.data.fields },
    });
    assertStatus(forcedFailureSchema, 200, 'activar fallo efimero de auditoria');
    try {
      const rejectedUnauditedMutation = await request(`/api/collections/products/records/${productA.id}`, {
        token: primaryAToken,
        method: 'PATCH',
        body: { stock: 1 },
      });
      assertStatus(rejectedUnauditedMutation, 400, 'mutacion sin auditoria falla cerrada');
      const productAfterRollback = await request(`/api/collections/products/records/${productA.id}`, {
        token: superToken,
      });
      assertStatus(productAfterRollback, 200, 'leer producto tras rollback');
      assert.equal(productAfterRollback.data.stock, 2, 'rollback conserva el stock anterior');
      const productEventsAfterRollback = await listRecords(
        'store_activity_audit',
        recordFilter('resource_id_snapshot', productA.id),
      );
      assert.equal(
        productEventsAfterRollback.length,
        productEventsBeforeRollback.length,
        'fallo atomico no deja evento parcial',
      );

      const rejectedExpirationAutoClear = await request(
        `/api/collections/product_variations/records/${rollbackExpirationVariation.id}`,
        {
          token: primaryAToken,
          method: 'PATCH',
          body: { expiration_date: '2099-12-27' },
        },
      );
      assertStatus(rejectedExpirationAutoClear, 400, 'limpieza automatica sin auditoria falla cerrada');
      const productAfterExpirationRollback = await request(
        `/api/collections/products/records/${rollbackExpirationProduct.id}`,
        { token: superToken },
      );
      assertStatus(productAfterExpirationRollback, 200, 'leer producto tras rollback de limpieza automatica');
      assert.equal(
        String(productAfterExpirationRollback.data.expiration_date || '').slice(0, 10),
        '2099-12-28',
        'rollback conserva el vencimiento general',
      );
      const variationAfterExpirationRollback = await request(
        `/api/collections/product_variations/records/${rollbackExpirationVariation.id}`,
        { token: superToken },
      );
      assertStatus(variationAfterExpirationRollback, 200, 'leer variacion tras rollback de limpieza automatica');
      assert.equal(String(variationAfterExpirationRollback.data.expiration_date || ''), '');
      const autoClearEventsAfterRollback = await listRecords(
        'store_activity_audit',
        `${recordFilter('resource_id_snapshot', rollbackExpirationProduct.id)} && ${recordFilter('action', 'product_expiration_cleared_for_variation')}`,
      );
      assert.equal(autoClearEventsAfterRollback.length, 0, 'rollback no deja evento automatico parcial');
    } finally {
      sourceKeyField.pattern = originalSourcePattern;
      const restoredActivitySchema = await request(`/api/collections/${activitySchema.data.id}`, {
        token: superToken,
        method: 'PATCH',
        body: { fields: activitySchema.data.fields },
      });
      assertStatus(restoredActivitySchema, 200, 'restaurar esquema efimero de actividad');
    }

    const operationalEvents = new Map();
    for (const [action, moduleName] of [
      ['product_expiration_cleared_for_variation', 'catalog'],
      ['product_variation_created', 'catalog'],
      ['product_variation_updated', 'catalog'],
      ['shipping_zone_created', 'shipping'],
      ['shipping_zone_updated', 'shipping'],
      ['promotion_created', 'marketing'],
      ['promotion_updated', 'marketing'],
      ['coupon_created', 'marketing'],
      ['coupon_updated', 'marketing'],
      ['gift_created', 'marketing'],
      ['gift_updated', 'marketing'],
      ['raffle_created', 'marketing'],
      ['raffle_updated', 'marketing'],
      ['review_created', 'operation'],
      ['review_updated', 'operation'],
      ['currency_created', 'settings'],
      ['currency_updated', 'settings'],
      ['settings_created', 'settings'],
      ['settings_updated', 'settings'],
      ['order_item_price_adjusted', 'orders'],
      ['order_status_changed', 'orders'],
      ['order_review_access_issued', 'orders'],
      ['customer_watch_enabled', 'security'],
      ['team_user_suspended', 'team'],
      ['store_plan_updated', 'plan'],
    ]) {
      const byAction = await activity(primaryAToken, 'list', {
        action,
        page: 1,
        per_page: 50,
      });
      assertStatus(byAction, 200, `listar cobertura ${action}`);
      assert.ok(byAction.data.events.length >= 1, `falta evento runtime ${action}`);
      const event = byAction.data.events[0];
      assert.equal(event.module, moduleName, `modulo de ${action}`);
      operationalEvents.set(action, event);
    }

    assert.ok(
      operationalEvents.get('product_variation_updated').changed_fields.includes('expiration_date'),
      'vencimiento de variacion queda auditado',
    );
    assert.equal(operationalEvents.get('shipping_zone_updated').previous_values.price_usd, 4);
    assert.equal(operationalEvents.get('shipping_zone_updated').new_values.price_usd, 5);
    assert.equal(operationalEvents.get('promotion_updated').previous_values.discount_value, 10);
    assert.equal(operationalEvents.get('promotion_updated').new_values.discount_value, 15);
    assert.equal(operationalEvents.get('coupon_updated').new_values.discount_value, 10);
    assert.equal(operationalEvents.get('gift_updated').new_values.stock, 2);
    assert.deepEqual(
      operationalEvents.get('customer_watch_enabled').previous_values,
      { observation_state: 'disabled' },
    );
    assert.deepEqual(
      operationalEvents.get('customer_watch_enabled').new_values,
      { observation_state: 'enabled' },
    );
    assert.equal(operationalEvents.get('order_status_changed').resource_type, 'order');
    assert.ok(operationalEvents.get('order_item_price_adjusted').changed_fields.includes('final_unit_price_usd'));
    assert.equal(operationalEvents.get('review_updated').previous_values.status, 'pending');
    assert.equal(operationalEvents.get('review_updated').new_values.status, 'approved');
    assert.equal(operationalEvents.get('settings_updated').previous_values.order_prefix, 'QA');
    assert.equal(operationalEvents.get('settings_updated').new_values.order_prefix, 'QB');

    const crossModuleResources = [
      { type: 'product', id: productA.id },
      { type: 'product_variation', id: variation.id },
      { type: 'order', id: order.id },
      { type: 'shipping_zone', id: shippingZone.id },
      { type: 'promotion', id: promotion.id },
      { type: 'coupon', id: coupon.id },
      { type: 'gift', id: gift.id },
      { type: 'raffle', id: raffle.id },
      { type: 'review', id: review.id },
      { type: 'settings', id: storeSettings.id },
      { type: 'currency', id: usd.id },
    ];
    const crossModuleLastModified = await activity(primaryAToken, 'last-modified', {
      resources: crossModuleResources,
    });
    assertStatus(crossModuleLastModified, 200, 'last-modified cubre modulos editables reales');
    assert.deepEqual(
      Object.keys(crossModuleLastModified.data.items).sort(),
      crossModuleResources.map((resource) => `${resource.type}:${resource.id}`).sort(),
    );

    const operationalCorpus = JSON.stringify([...operationalEvents.values()]);
    for (const [label, secret] of [
      ['review customer', reviewCustomerName],
      ['review comment', reviewComment],
      ['order customer', orderCustomerName],
      ['order phone', orderCustomerPhone],
      ['order review token', orderReviewToken],
      ['security phone', securityPhone],
      ['security reason', securityReason],
      ['security customer id', securityCustomer.id],
      ['raffle access code', raffleAccessCode],
    ]) {
      assert.equal(operationalCorpus.includes(secret), false, `redaccion operativa: ${label}`);
    }
    const operationalKeys = deepObjectKeys([...operationalEvents.values()]);
    assert.equal(
      operationalKeys.some((key) => /password|secret|cookie|digest|hmac|bearer|email|phone|customer_name|comment/i.test(key)),
      false,
      `clave sensible en evento operativo: ${operationalKeys.join(', ')}`,
    );

    const selfAfterPrimary = await activity(memberToken, 'self', {
      module: 'catalog', action: 'product_updated', page: 1, per_page: 50,
    });
    assertStatus(selfAfterPrimary, 200, 'self permanece aislado por actor');
    assert.equal(selfAfterPrimary.data.events.length, 2);

    const primaryLastModified = await activity(primaryAToken, 'last-modified', {
      resources: [{ type: 'product', id: productA.id }],
    });
    assertStatus(primaryLastModified, 200, 'principal ve ultima modificacion completa');
    assert.equal(primaryLastModified.data.items[`product:${productA.id}`].actor_name, `${prefix} Primary A`);
    assert.ok(primaryLastModified.data.items[`product:${productA.id}`].summary.length > 0);

    const memberProductEvents = await activity(primaryAToken, 'list', {
      actor_id: member.id,
      module: 'catalog',
      action: 'product_updated',
      resource_type: 'product',
      resource_id: productA.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(memberProductEvents, 200, 'principal filtra cambios del miembro');
    assert.equal(memberProductEvents.data.events.length, 2, 'idempotencia central conserva exactamente dos cambios');
    assert.ok(memberProductEvents.data.events.every((event) => event.actor_state === 'active'));
    assert.ok(memberProductEvents.data.events.every((event) => event.changed_fields.includes('stock')));
    assert.match(memberProductEvents.headers['cache-control'] || '', /private.*no-store|no-store.*private/i);
    const foreignResourceHistory = await activity(primaryAToken, 'list', {
      resource_type: 'product',
      resource_id: productB.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(foreignResourceHistory, 200, 'historial por recurso conserva aislamiento');
    assert.equal(foreignResourceHistory.data.events.length, 0);

    const reviewedEventId = memberProductEvents.data.events[0].id;
    const forbiddenReview = await activity(memberToken, 'review', {
      activity_id: reviewedEventId,
      status: 'reviewed',
      note: '',
    });
    assertStatus(forbiddenReview, 403, 'miembro no revisa actividad');
    const reviewNote = `${prefix} verify stock correction`;
    const reviewed = await activity(primaryAToken, 'review', {
      activity_id: reviewedEventId,
      status: 'requires_correction',
      note: reviewNote,
    });
    assertStatus(reviewed, 200, 'principal marca cambio para correccion');
    assert.equal(reviewed.data.review.status, 'requires_correction');
    const reviewedDetail = await activity(primaryAToken, 'detail', { activity_id: reviewedEventId });
    assertStatus(reviewedDetail, 200, 'detalle incluye revision privada para principal');
    assert.equal(reviewedDetail.data.event.review.status, 'requires_correction');
    assert.equal(reviewedDetail.data.event.review.note, reviewNote);
    const closureNote = `${prefix} correction verified and closed`;
    const correctionClosed = await activity(primaryAToken, 'review', {
      activity_id: reviewedEventId,
      status: 'reviewed',
      note: closureNote,
    });
    assertStatus(correctionClosed, 200, 'principal cierra correccion con una nota nueva');
    assert.equal(correctionClosed.data.review.status, 'reviewed');
    assert.equal(correctionClosed.data.review.note, closureNote);
    const closedDetail = await activity(primaryAToken, 'detail', { activity_id: reviewedEventId });
    assertStatus(closedDetail, 200, 'detalle conserva nota nueva de cierre');
    assert.equal(closedDetail.data.event.review.status, 'reviewed');
    assert.equal(closedDetail.data.event.review.note, closureNote);

    const rejectedDirectUpdate = await request(`/api/collections/store_activity_audit/records/${reviewedEventId}`, {
      token: superToken,
      method: 'PATCH',
      body: { summary: 'forbidden direct rewrite' },
    });
    assertStatus(rejectedDirectUpdate, 404, 'actividad central no se reescribe por REST');
    const rejectedDirectDelete = await request(`/api/collections/store_activity_audit/records/${reviewedEventId}`, {
      token: superToken,
      method: 'DELETE',
    });
    assertStatus(rejectedDirectDelete, 404, 'actividad central no se borra por REST');
    const rejectedReviewCreate = await request('/api/collections/store_activity_reviews/records', {
      token: superToken,
      body: {},
    });
    assertStatus(rejectedReviewCreate, 404, 'revision directa por REST rechazada');

    const issueReason = `${prefix} rotate temporary access`;
    const issued = await team(primaryAToken, 'issue-temporary-access', {
      user_id: member.id,
      reason: issueReason,
    });
    assertStatus(issued, 200, 'emitir nuevo acceso temporal');
    const secondTemporaryPassword = issued.data.temporary_password;
    assert.ok(secondTemporaryPassword.length >= 20);
    assert.equal(secondTemporaryPassword === firstTemporaryPassword, false, 'la rotacion genera otra credencial');
    assertStatus(await refresh(memberToken, memberDevice), 401, 'emision temporal revoca sesion anterior');

    const temporaryEvents = await activity(primaryAToken, 'list', {
      action: 'team_temporary_password_issued',
      page: 1,
      per_page: 50,
    });
    assertStatus(temporaryEvents, 200, 'actividad de acceso temporal');
    assert.equal(temporaryEvents.data.events.length, 1);
    const temporaryDetail = await activity(primaryAToken, 'detail', {
      activity_id: temporaryEvents.data.events[0].id,
    });
    assertStatus(temporaryDetail, 200, 'detalle de acceso temporal');
    const redactionCorpus = JSON.stringify([
      memberProductEvents.data,
      temporaryEvents.data,
      temporaryDetail.data,
    ]);
    for (const [label, secret] of [
      ['first temporary credential', firstTemporaryPassword],
      ['second temporary credential', secondTemporaryPassword],
      ['member email', memberEmail],
      ['member phone', memberPhone],
      ['member creation reason', memberCreateReason],
      ['temporary access reason', issueReason],
    ]) {
      assert.equal(redactionCorpus.includes(secret), false, `dato sensible filtrado en actividad: ${label}`);
    }
    const redactionKeys = deepObjectKeys([
      memberProductEvents.data,
      temporaryEvents.data,
      temporaryDetail.data,
    ]);
    assert.equal(
      redactionKeys.some((key) => /password|secret|cookie|digest|hmac|bearer|email|phone/i.test(key)),
      false,
      `clave sensible expuesta: ${redactionKeys.join(', ')}`,
    );

    const memberReauth = await login(member.email, secondTemporaryPassword, memberDevice);
    assertStatus(memberReauth, 200, 'relogin con segundo acceso temporal');
    memberToken = memberReauth.data.token;
    const wrongConfirmation = await team(primaryAToken, 'delete', {
      user_id: member.id,
      confirmation_email: `${slugPrefix}-wrong@example.test`,
      reason_code: 'access_no_longer_needed',
      reason_detail: '',
    });
    assertStatus(wrongConfirmation, 400, 'eliminacion exige correo exacto');
    assert.equal(wrongConfirmation.data.error, 'delete_confirmation_mismatch');
    const stillValid = await refresh(memberToken, memberDevice);
    assertStatus(stillValid, 200, 'confirmacion incorrecta no muta ni revoca');
    memberToken = stillValid.data.token;

    const maskedConfirmation = await team(primaryAToken, 'delete', {
      user_id: member.id,
      confirmation_email: 'm***@example.test',
      reason_code: 'access_no_longer_needed',
      reason_detail: '',
    });
    assertStatus(maskedConfirmation, 400, 'correo enmascarado no confirma la identidad');
    assert.equal(maskedConfirmation.data.error, 'delete_confirmation_mismatch');
    const legacyStoreReason = await team(primaryAToken, 'delete', {
      user_id: member.id,
      confirmation_email: member.email,
      reason: `${prefix} legacy free reason`,
    });
    assertStatus(legacyStoreReason, 400, 'endpoint Store rechaza el contrato libre anterior');
    assert.equal(legacyStoreReason.data.error, 'invalid_payload');
    const manipulatedReason = await team(primaryAToken, 'delete', {
      user_id: member.id,
      confirmation_email: member.email,
      reason_code: 'Acceso ya no necesario',
      reason_detail: '',
    });
    assertStatus(manipulatedReason, 400, 'F12 no puede enviar etiqueta ni codigo manipulado');
    assert.equal(manipulatedReason.data.error, 'delete_reason_invalid');
    const shortOtherReason = await team(primaryAToken, 'delete', {
      user_id: member.id,
      confirmation_email: member.email,
      reason_code: 'other',
      reason_detail: '1234567',
    });
    assertStatus(shortOtherReason, 400, 'Otro exige al menos ocho caracteres');
    assert.equal(shortOtherReason.data.error, 'delete_reason_detail_too_short');
    const deniedStaffDelete = await team(memberToken, 'delete', {
      user_id: thirdMember.id,
      confirmation_email: thirdMember.email,
      reason_code: 'duplicate_account',
      reason_detail: '',
    });
    assertStatus(deniedStaffDelete, 403, 'Store Staff no elimina usuarios ni obtiene confirmaciones');
    assert.equal(deniedStaffDelete.data.error, 'permission_denied');
    const deniedCrossTenantDelete = await team(primaryBToken, 'delete', {
      user_id: member.id,
      confirmation_email: member.email,
      reason_code: 'access_no_longer_needed',
      reason_detail: '',
    });
    assertStatus(deniedCrossTenantDelete, 404, 'principal de otra tienda no elimina ni descubre el usuario');
    assert.equal(deniedCrossTenantDelete.data.error, 'user_not_found');

    const deletionReasonCode = 'access_no_longer_needed';
    const deletionReasonLabel = 'Acceso ya no necesario';
    const deleted = await team(primaryAToken, 'delete', {
      user_id: member.id,
      confirmation_email: `  ${member.email.toUpperCase()}  `,
      reason_code: deletionReasonCode,
      reason_detail: `${prefix} detail ignored for predefined reason`,
    });
    assertStatus(deleted, 200, 'eliminacion principal segura');
    assert.equal(deleted.data.user_deleted, true);
    assert.equal(deleted.data.sessions_revoked, true);
    assert.equal(deleted.data.user_id, member.id);

    const deletedRecord = await request(`/api/collections/users/records/${member.id}`, { token: superToken });
    assertStatus(deletedRecord, 404, 'registro auth eliminado fisicamente');
    assertStatus(await refresh(memberToken, memberDevice), [401, 403], 'sesion del eliminado deja de servir');
    assertStatus(await login(member.email, secondTemporaryPassword, memberDevice), [400, 401, 403], 'eliminado no vuelve a autenticar');

    const repeatedDelete = await team(primaryAToken, 'delete', {
      user_id: member.id,
      confirmation_email: member.email,
      reason_code: deletionReasonCode,
      reason_detail: '',
    });
    assertStatus(repeatedDelete, 404, 'reintento de eliminacion no duplica efectos');
    assert.equal(repeatedDelete.data.error, 'user_not_found');

    const accessRows = await listRecords('store_user_access', recordFilter('user', member.id));
    assert.equal(accessRows.length, 0, 'acceso del usuario eliminado');
    const deviceRows = await listRecords('store_user_devices', recordFilter('user', member.id));
    assert.equal(deviceRows.length, 0, 'dispositivos del usuario eliminado');
    const specializedDeletionRows = await listRecords(
      'store_user_audit',
      `${recordFilter('target_user_id_snapshot', member.id)} && ${recordFilter('action', 'user_deleted')}`,
    );
    assert.equal(specializedDeletionRows.length, 1, 'auditoria especializada historica unica');
    assert.equal(String(specializedDeletionRows[0].target_user || ''), '');
    assert.equal(specializedDeletionRows[0].target_user_id_snapshot, member.id);
    const storedDeletionReason = JSON.parse(specializedDeletionRows[0].reason);
    assert.deepEqual(storedDeletionReason, {
      reason_code: deletionReasonCode,
      reason_label_snapshot: deletionReasonLabel,
      reason_detail: '',
    });

    const centralDeletionEvents = await activity(primaryAToken, 'list', {
      action: 'user_deleted',
      resource_type: 'team_user',
      resource_id: member.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(centralDeletionEvents, 200, 'evento central de eliminacion');
    assert.equal(centralDeletionEvents.data.events.length, 1, 'un solo evento pese al reintento');
    const deletionEvent = centralDeletionEvents.data.events[0];
    assert.equal(deletionEvent.actor_state, 'active');
    assert.equal(deletionEvent.resource_state, 'deleted');
    assert.equal(deletionEvent.severity, 'critical');
    const deletionDetail = await activity(primaryAToken, 'detail', { activity_id: deletionEvent.id });
    assertStatus(deletionDetail, 200, 'detalle historico de eliminacion');
    assert.equal(deletionDetail.data.event.new_values.reason_code, deletionReasonCode);
    assert.equal(deletionDetail.data.event.new_values.reason_label_snapshot, deletionReasonLabel);
    assert.equal(deletionDetail.data.event.new_values.reason_detail, undefined);
    const deletionCorpus = JSON.stringify(deletionDetail.data);
    for (const secret of [member.email, firstTemporaryPassword, secondTemporaryPassword]) {
      assert.equal(deletionCorpus.includes(secret), false);
    }

    const deletedActorReport = await activity(primaryAToken, 'user-report', {
      actor_id: member.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(deletedActorReport, 200, 'reporte historico del actor eliminado');
    assert.equal(deletedActorReport.data.actor.state, 'deleted');
    assert.equal(deletedActorReport.data.actor.name, `${prefix} Catalog Member`);
    assert.ok(deletedActorReport.data.events.length >= 2);
    assert.ok(deletedActorReport.data.events.every((event) => event.actor_state === 'deleted'));
    const persistedReviewedEvent = deletedActorReport.data.events.find((event) => event.id === reviewedEventId);
    assert.ok(persistedReviewedEvent, 'actividad revisada persiste tras borrar actor');
    assert.equal(persistedReviewedEvent.review.status, 'reviewed');
    assert.equal(persistedReviewedEvent.review.note, '', 'reporte histórico no expone notas internas de revisión');

    const recreatedPermissions = permissionCatalog.resolveTemplatePermissions('read_only');
    const recreatedMemberResult = await team(primaryAToken, 'create', {
      email: member.email,
      display_name: `${prefix} Recreated Member`,
      phone: '',
      template_code: 'read_only',
      permissions: recreatedPermissions,
      reason: `${prefix} recreate deleted address with fresh identity`,
    });
    assertStatus(recreatedMemberResult, 200, 'recrear el mismo correo genera identidad nueva');
    const recreatedMember = recreatedMemberResult.data.user;
    const recreatedTemporaryPassword = recreatedMemberResult.data.temporary_password;
    assert.notEqual(recreatedMember.id, member.id, 'el correo reutilizado recibe otro id');
    assert.ok(recreatedTemporaryPassword.length >= 20);
    assert.notEqual(recreatedTemporaryPassword, firstTemporaryPassword);
    assert.notEqual(recreatedTemporaryPassword, secondTemporaryPassword);

    const recreatedDetail = await team(primaryAToken, 'detail', { user_id: recreatedMember.id });
    assertStatus(recreatedDetail, 200, 'identidad recreada inicia solo con asignacion explicita');
    assert.equal(recreatedDetail.data.user.template_code, 'read_only');
    assert.deepEqual(recreatedDetail.data.user.permissions, recreatedPermissions.slice().sort());
    assert.equal(recreatedDetail.data.user.authorized_device_count, 0);
    const recreatedAccessRows = await listRecords('store_user_access', recordFilter('user', recreatedMember.id));
    assert.equal(recreatedAccessRows.length, 1, 'la identidad nueva tiene un unico acceso propio');
    const recreatedDeviceRows = await listRecords('store_user_devices', recordFilter('user', recreatedMember.id));
    assert.equal(recreatedDeviceRows.length, 0, 'la identidad nueva no hereda dispositivos ni sesiones');
    assertStatus(await refresh(memberToken, memberDevice), [401, 403], 'recrear correo no revive sesion del id eliminado');

    const oldReportAfterRecreation = await activity(primaryAToken, 'user-report', {
      actor_id: member.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(oldReportAfterRecreation, 200, 'snapshot del id eliminado permanece separado');
    assert.equal(oldReportAfterRecreation.data.actor.state, 'deleted');
    assert.equal(oldReportAfterRecreation.data.actor.name, `${prefix} Catalog Member`);
    assert.ok(oldReportAfterRecreation.data.events.some((event) => event.id === reviewedEventId));

    const recreatedReport = await activity(primaryAToken, 'user-report', {
      actor_id: recreatedMember.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(recreatedReport, 200, 'identidad recreada no hereda actividad del id anterior');
    assert.equal(recreatedReport.data.actor.state, 'active');
    assert.equal(recreatedReport.data.summary.total_changes, 0);
    assert.equal(recreatedReport.data.events.length, 0);
    const recreatedCreationEvents = await activity(primaryAToken, 'list', {
      action: 'team_user_created',
      page: 1,
      per_page: 50,
    });
    assertStatus(recreatedCreationEvents, 200, 'actividad de recreacion permanece saneada');
    const recreatedAuditCorpus = JSON.stringify(recreatedCreationEvents.data);
    for (const secret of [
      member.email,
      firstTemporaryPassword,
      secondTemporaryPassword,
      suspendedMemberPassword,
      thirdMemberPassword,
      recreatedTemporaryPassword,
    ]) {
      assert.equal(recreatedAuditCorpus.includes(secret), false);
    }
    assert.equal(
      deepObjectKeys(recreatedCreationEvents.data)
        .some((key) => /password|secret|cookie|digest|hmac|bearer|email|phone/i.test(key)),
      false,
      'actividad de altas no expone claves sensibles',
    );

    const otherMemberResult = await team(primaryAToken, 'create', {
      email: `${slugPrefix}-other-reason@example.test`,
      display_name: `${prefix} Other Reason Member`,
      phone: '',
      template_code: 'read_only',
      permissions: recreatedPermissions,
      reason: `${prefix} create other-reason deletion fixture`,
    });
    assertStatus(otherMemberResult, 200, 'crear identidad separada para motivo Otro');
    const otherMember = otherMemberResult.data.user;
    const otherTemporaryPassword = otherMemberResult.data.temporary_password;
    const otherReasonDetail = 'Cuenta reemplazada durante la validación operativa C2F1.';
    const otherDeleted = await team(primaryAToken, 'delete', {
      user_id: otherMember.id,
      confirmation_email: otherMember.email,
      reason_code: 'other',
      reason_detail: `  ${otherReasonDetail}  `,
    });
    assertStatus(otherDeleted, 200, 'eliminacion con Otro y detalle valido');
    const otherAccessRows = await listRecords('store_user_access', recordFilter('user', otherMember.id));
    const otherDeviceRows = await listRecords('store_user_devices', recordFilter('user', otherMember.id));
    assert.equal(otherAccessRows.length, 0);
    assert.equal(otherDeviceRows.length, 0);
    const otherSpecializedRows = await listRecords(
      'store_user_audit',
      `${recordFilter('target_user_id_snapshot', otherMember.id)} && ${recordFilter('action', 'user_deleted')}`,
    );
    assert.equal(otherSpecializedRows.length, 1, 'Otro conserva una sola auditoria especializada');
    assert.deepEqual(JSON.parse(otherSpecializedRows[0].reason), {
      reason_code: 'other',
      reason_label_snapshot: 'Otro',
      reason_detail: otherReasonDetail,
    });
    const otherCentralEvents = await activity(primaryAToken, 'list', {
      action: 'user_deleted',
      resource_type: 'team_user',
      resource_id: otherMember.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(otherCentralEvents, 200, 'actividad consulta motivo Otro');
    assert.equal(otherCentralEvents.data.events.length, 1);
    const otherDeletionDetail = await activity(primaryAToken, 'detail', {
      activity_id: otherCentralEvents.data.events[0].id,
    });
    assertStatus(otherDeletionDetail, 200, 'detalle interno conserva explicacion de Otro');
    assert.equal(otherDeletionDetail.data.event.new_values.reason_code, 'other');
    assert.equal(otherDeletionDetail.data.event.new_values.reason_label_snapshot, 'Otro');
    assert.equal(otherDeletionDetail.data.event.new_values.reason_detail, otherReasonDetail);
    assert.equal(JSON.stringify(otherDeletionDetail.data).includes(otherTemporaryPassword), false);

    const summary = await activity(primaryAToken, 'summary', {});
    assertStatus(summary, 200, 'resumen operativo tras eliminacion');
    assert.ok(summary.data.summary.changes_today >= 1);
    assert.ok(summary.data.actors.some((actor) => actor.ref === member.id && actor.state === 'deleted'));

    const productBExpiration = await request(`/api/collections/products/records/${productB.id}`, {
      token: primaryBToken,
      method: 'PATCH',
      body: { expiration_date: '2099-11-30' },
    });
    assertStatus(productBExpiration, 200, 'tienda B prepara vencimiento general antes de downgrade');
    const productBVariationMode = await createRecord('products', {
      store: storeB.id,
      name: `${prefix} Product B Variation Mode`,
      slug: `${slugPrefix}-product-b-variation-mode`,
      base_price_usd: 8,
      regular_price_usd: 8,
      stock: 4,
      active: true,
      delivery_mode: 'both',
    });
    const variationB = await createAdminRecord('product_variations', {
      store: storeB.id,
      product: productBVariationMode.id,
      variation_type: 'Size',
      value: `${prefix} B Small`,
      active: true,
      price_usd: 8,
      stock: 4,
      expiration_date: '2099-11-29',
    }, primaryBToken);
    const downgradeB = await request('/api/pz/master/store-plan/change', {
      token: masterToken,
      body: {
        store_id: storeB.id,
        plan: 'basic',
        is_permanent: true,
        duration_months: 0,
        reason: `${prefix} audit expiration cleanup`,
        confirm_expiration_cleanup: true,
      },
    });
    assertStatus(downgradeB, 200, 'downgrade oficial limpia vencimientos con auditoria atomica');
    assert.ok(downgradeB.data.expiration_cleanup_result, 'downgrade informa limpieza de vencimientos');
    const productBAfterDowngrade = await request(`/api/collections/products/records/${productB.id}`, { token: superToken });
    const variationBAfterDowngrade = await request(`/api/collections/product_variations/records/${variationB.id}`, { token: superToken });
    assertStatus(productBAfterDowngrade, 200, 'producto B persiste tras downgrade');
    assertStatus(variationBAfterDowngrade, 200, 'variacion B persiste tras downgrade');
    assert.equal(String(productBAfterDowngrade.data.expiration_date || ''), '');
    assert.equal(String(variationBAfterDowngrade.data.expiration_date || ''), '');

    const productDowngradeEvents = await activity(primaryBToken, 'list', {
      action: 'product_expiration_cleared_for_plan_downgrade',
      resource_type: 'product',
      resource_id: productB.id,
      page: 1,
      per_page: 50,
    });
    const variationDowngradeEvents = await activity(primaryBToken, 'list', {
      action: 'product_variation_expiration_cleared_for_plan_downgrade',
      resource_type: 'product_variation',
      resource_id: variationB.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(productDowngradeEvents, 200, 'limpieza downgrade producto queda auditada');
    assertStatus(variationDowngradeEvents, 200, 'limpieza downgrade variacion queda auditada');
    assert.equal(productDowngradeEvents.data.events.length, 1);
    assert.equal(variationDowngradeEvents.data.events.length, 1);
    assert.deepEqual(productDowngradeEvents.data.events[0].previous_values, { expiration_date: '2099-11-30' });
    assert.deepEqual(variationDowngradeEvents.data.events[0].previous_values, { expiration_date: '2099-11-29' });
    assert.deepEqual(productDowngradeEvents.data.events[0].new_values, { expiration_date: '' });
    assert.deepEqual(variationDowngradeEvents.data.events[0].new_values, { expiration_date: '' });
    const downgradeLastModified = await activity(primaryBToken, 'last-modified', {
      resources: [
        { type: 'product', id: productB.id },
        { type: 'product_variation', id: variationB.id },
      ],
    });
    assertStatus(downgradeLastModified, 200, 'last-modified refleja limpieza por downgrade');
    assert.equal(downgradeLastModified.data.items[`product:${productB.id}`].actor_name, `${prefix} Master`);
    assert.equal(downgradeLastModified.data.items[`product_variation:${variationB.id}`].actor_name, `${prefix} Master`);

    const storeBActivity = await activity(primaryBToken, 'list', { page: 1, per_page: 50 });
    assertStatus(storeBActivity, 200, 'principal B obtiene solo su tienda');
    const storeAEventIds = new Set([
      ...memberProductEvents.data.events.map((event) => event.id),
      deletionEvent.id,
    ]);
    assert.ok(storeBActivity.data.events.every((event) => !storeAEventIds.has(event.id)));
    assert.equal(JSON.stringify(storeBActivity.data).includes(`${prefix} Catalog Member`), false);
    const crossTenantDetail = await activity(primaryBToken, 'detail', { activity_id: deletionEvent.id });
    assertStatus(crossTenantDetail, 404, 'detalle de otra tienda permanece oculto');
    assert.equal(crossTenantDetail.data.error, 'activity_not_found');
    const crossTenantReport = await activity(primaryBToken, 'user-report', {
      actor_id: member.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(crossTenantReport, 404, 'reporte de otra tienda permanece oculto');
    const crossTenantResource = await activity(primaryBToken, 'last-modified', {
      resources: [{ type: 'product', id: productA.id }],
    });
    assertStatus(crossTenantResource, 200, 'last-modified oculta recurso ajeno');
    assert.deepEqual(crossTenantResource.data.items, {});
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
    } catch (cleanupError) {
      if (!failure) failure = cleanupError;
      else failure.message += `\nError de cleanup: ${cleanupError.stack || cleanupError.message}`;
    }
  }

  if (failure) throw failure;
});
