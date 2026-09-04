'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const BACKEND_DIR = path.resolve(__dirname, '..');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const LOOPBACK = '127.0.0.1';
const TEMP_PREFIX = 'pz-promo-perm-runtime-';
const PERMISSIONS_MIGRATION = '1787520400_promo_permissions.js';
const POST_PERMISSION_MIGRATIONS = [
  '1787520500_promo_publication_zero_generation.js',
  '1787520600_promo_analytics_landing_qr.js',
  '1787520650_promo_theme_catalog.js',
  '1787520660_promo_qr_media.js',
  '1787520700_promo_live_content.js',
  '1787683200_promo_media_quota_150.js',
  '1787698800_promo_review_requests.js',
  '1787698900_promo_brand_logo.js',
  '1787699000_promo_audit_reviews_module.js',
  '1787699100_promo_translation_state.js',
  '1787699200_promo_language_selector.js',
  '1787699300_promo_reviews_without_photos.js',
  '1787699400_promo_review_request_secure_sharing.js',
  '1787699500_promo_media_quota_300.js',
  '1787699600_promo_operational_defaults.js',
  '1787699700_promo_publish_empty_foundations.js',
  '1787700000_storefront_private_inbox_coupon_wallet.js',
  '1788354000_promo_theme_catalog_bootstrap.js',
  '1788440400_storefront_resilient_installations.js',
  '1788447600_taxonomy_contract_indexes.js',
  '1788447700_store_plan_lifecycle_notifications.js',
  '1788447800_store_plan_commercial_audit.js',
  '1788447900_public_homepage_settings.js',
  '1788448000_storefront_delivery_transport_observability.js',
  '1788448100_homepage_store_label.js',
];

function runtimeEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/TOKEN|SECRET|PASSWORD|OPENAI|TRANSLATION|CLOUDFLARE|COOLIFY|POCKETBASE_URL|PB_URL/i.test(key)) {
      delete environment[key];
    }
  }
  environment.PZ_SECURITY_HMAC_SECRET = randomBytes(32).toString('hex');
  environment.PZ_SECURITY_AES_KEY = randomBytes(24).toString('base64url').slice(0, 32);
  return environment;
}

function runtimeFlags(dataDirectory) {
  return [
    `--dir=${dataDirectory}`,
    `--hooksDir=${HOOKS_DIR}`,
    `--migrationsDir=${MIGRATIONS_DIR}`,
    '--hooksWatch=false',
    '--hooksPool=2',
    '--automigrate=false',
    '--indexFallback=false',
  ];
}

function runPocketBase(args, dataDirectory, environment, input = '') {
  return spawnSync(POCKETBASE_EXE, [...args, ...runtimeFlags(dataDirectory)], {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
    env: environment,
    input,
    timeout: 120_000,
    windowsHide: true,
  });
}

function assertCommand(result, label) {
  assert.equal(result.error, undefined, `${label}: ${result.error?.message || ''}`);
  assert.equal(result.status, 0, `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function startPocketBase(dataDirectory, port, environment) {
  const child = spawn(POCKETBASE_EXE, [
    'serve', `--http=${LOOPBACK}:${port}`, ...runtimeFlags(dataDirectory),
  ], {
    cwd: BACKEND_DIR,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, output: () => output };
}

async function stopPocketBase(runtime) {
  if (!runtime || !runtime.child || runtime.child.exitCode !== null) return;
  runtime.child.kill();
  await Promise.race([
    new Promise((resolve) => runtime.child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (runtime.child.exitCode === null) runtime.child.kill('SIGKILL');
}

async function waitForPocketBase(runtime, baseUrl) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (runtime.child.exitCode !== null) throw new Error(`PocketBase terminó antes de iniciar:\n${runtime.output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PocketBase no respondió:\n${runtime.output()}`);
}

async function apiRequest(baseUrl, route, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body;
  if (Object.prototype.hasOwnProperty.call(options, 'json')) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || (body ? 'POST' : 'GET'),
    headers,
    body,
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw };
}

function assertStatus(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(statuses.includes(result.status), `${label}: HTTP ${result.status}\n${result.raw}`);
}

function sqliteValue(dataDirectory, sql) {
  const db = new DatabaseSync(path.join(dataDirectory, 'data.db'), { readOnly: true });
  try { return db.prepare(sql).get(); } finally { db.close(); }
}

test('gate runtime PERM: actores, capacidades, permisos, sesiones, aislamiento, REST y rollback efímero', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 240_000,
}, async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dataDirectory = path.join(temporaryRoot, 'main-data');
  const emptyRollbackDirectory = path.join(temporaryRoot, 'empty-rollback-data');
  const environment = runtimeEnvironment();
  const superEmail = 'promo-perm-runtime-super@example.test';
  const superPassword = `QA-Promo-Perm-${randomBytes(24).toString('base64url')}!Aa1`;
  const userPassword = `QA-Promo-User-${randomBytes(24).toString('base64url')}!Aa1`;
  let runtime = null;

  try {
    assertCommand(runPocketBase(['migrate', 'up'], dataDirectory, environment), 'migrate up PERM');
    assertCommand(runPocketBase(['migrate', 'up'], emptyRollbackDirectory, environment), 'migrate up rollback vacío');
    assert.equal(
      sqliteValue(
        emptyRollbackDirectory,
        "SELECT COUNT(*) AS count FROM `_collections` WHERE `name` LIKE 'promo_%'",
      ).count,
      14,
      'up vacío contiene DATA y solicitudes de reseña',
    );
    const emptyPermissionDown = runPocketBase(
      ['migrate', 'down', String(POST_PERMISSION_MIGRATIONS.length + 1)],
      emptyRollbackDirectory,
      environment,
      'y\n',
    );
    assertCommand(emptyPermissionDown, 'down PERM vacío');
    for (const migration of [...POST_PERMISSION_MIGRATIONS, PERMISSIONS_MIGRATION]) {
      assert.match(
        emptyPermissionDown.stdout,
        new RegExp(`Reverted ${migration.replace('.', '\\.')}`),
      );
    }
    assert.equal(
      sqliteValue(
        emptyRollbackDirectory,
        "SELECT COUNT(*) AS count FROM `_collections` WHERE `name` LIKE 'promo_%'",
      ).count,
      13,
      `down focal conserva las trece colecciones DATA: ${emptyPermissionDown.stdout}`,
    );
    const accessSchema = JSON.parse(sqliteValue(
      emptyRollbackDirectory,
      "SELECT `fields` FROM `_collections` WHERE `name` = 'store_user_access'",
    ).fields);
    assert.equal(accessSchema.some((field) => field.name === 'promo_permissions_json'), false);

    assertCommand(
      runPocketBase(['superuser', 'create', superEmail, superPassword], dataDirectory, environment),
      'crear superuser efímero',
    );
    const port = await freeLoopbackPort();
    const baseUrl = `http://${LOOPBACK}:${port}`;
    runtime = startPocketBase(dataDirectory, port, environment);
    await waitForPocketBase(runtime, baseUrl);
    const request = (route, options) => apiRequest(baseUrl, route, options);

    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      json: { identity: superEmail, password: superPassword },
    });
    assertStatus(superAuth, 200, 'auth superuser');
    const superToken = superAuth.data.token;

    async function create(collection, values) {
      const result = await request(`/api/collections/${collection}/records`, {
        token: superToken,
        json: values,
      });
      assertStatus(result, [200, 201], `crear ${collection}`);
      return result.data;
    }

    async function update(collection, recordId, values) {
      const result = await request(`/api/collections/${collection}/records/${recordId}`, {
        method: 'PATCH', token: superToken, json: values,
      });
      assertStatus(result, 200, `actualizar ${collection}/${recordId}`);
      return result.data;
    }

    async function authenticate(email, password = userPassword, device = '') {
      return request('/api/collections/users/auth-with-password', {
        headers: device ? { 'X-PZ-Admin-Device': device } : {},
        json: { identity: email, password },
      });
    }

    const master = await create('users', {
      email: 'promo-perm-master@example.test', password: userPassword, passwordConfirm: userPassword,
      display_name: 'Master Promo PERM', role: 'master_admin', status: 'active', phone: '', emailVisibility: true,
    });
    const masterAuth = await authenticate(master.email);
    assertStatus(masterAuth, 200, 'auth Master');
    const masterToken = masterAuth.data.token;

    async function createStore(name, slug, plan) {
      const store = await create('stores', { name, slug, status: 'active' });
      const changed = await request('/api/pz/master/store-plan/change', {
        token: masterToken,
        json: {
          store_id: store.id,
          plan,
          is_permanent: true,
          duration_months: 0,
          reason: 'Fixture temporal PERM',
          confirm_expiration_cleanup: false,
        },
      });
      assertStatus(changed, 200, `plan ${plan} ${slug}`);
      return store;
    }

    async function createStoreUser(store, key, role = 'store_staff', status = 'active') {
      return create('users', {
        email: `promo-perm-${key}@example.test`, password: userPassword, passwordConfirm: userPassword,
        display_name: `Promo ${key}`, role, store: store.id, status, phone: '', emailVisibility: true,
      });
    }

    async function assignPrimary(store, user) {
      const result = await request('/api/pz/master/primary-admin/assign', {
        token: masterToken,
        json: { store_id: store.id, user_id: user.id, reason: 'Principal temporal PERM' },
      });
      assertStatus(result, 200, `asignar principal ${store.slug}`);
    }

    const storeA = await createStore('Promo PERM A', 'promo-perm-a', 'premium');
    const storeB = await createStore('Promo PERM B', 'promo-perm-b', 'basic');
    const storeCommerce = await createStore('Commerce PERM', 'commerce-perm', 'premium');

    const primaryA = await createStoreUser(storeA, 'primary-a', 'store_admin');
    await assignPrimary(storeA, primaryA);
    const secondaryA = await createStoreUser(storeA, 'secondary-a', 'store_admin');
    const staffA = await createStoreUser(storeA, 'staff-a', 'store_staff');
    const suspendedA = await createStoreUser(storeA, 'suspended-a', 'store_staff');
    const primaryB = await createStoreUser(storeB, 'primary-b', 'store_admin');
    await assignPrimary(storeB, primaryB);
    await createStoreUser(storeB, 'allowed-b', 'store_staff');
    const blockedB = await createStoreUser(storeB, 'blocked-b', 'store_staff');
    const commerceAdmin = await createStoreUser(storeCommerce, 'commerce', 'store_admin');

    const accessSecondary = await create('store_user_access', {
      store: storeA.id, user: secondaryA.id, template_code: 'custom',
      permissions_json: ['landing_qr.manage'], promo_permissions_json: [], promo_permissions_version: 0,
      created_by: primaryA.id, updated_by: primaryA.id,
    });
    await create('store_user_access', {
      store: storeA.id, user: staffA.id, template_code: 'custom', permissions_json: [],
      promo_permissions_json: [], promo_permissions_version: 0, created_by: primaryA.id, updated_by: primaryA.id,
    });
    await create('store_user_access', {
      store: storeA.id, user: suspendedA.id, template_code: 'custom', permissions_json: [],
      promo_permissions_json: ['promo.site.view'], promo_permissions_version: 1,
      created_by: primaryA.id, updated_by: primaryA.id,
    });
    await create('store_user_access', {
      store: storeB.id, user: blockedB.id, template_code: 'custom', permissions_json: [],
      promo_permissions_json: ['promo.site.view'], promo_permissions_version: 1,
      created_by: primaryB.id, updated_by: primaryB.id,
    });
    await create('store_user_access', {
      store: storeCommerce.id, user: commerceAdmin.id, template_code: 'custom', permissions_json: [],
      promo_permissions_json: ['promo.site.view'], promo_permissions_version: 1,
      created_by: commerceAdmin.id, updated_by: commerceAdmin.id,
    });

    const siteA = await create('promo_sites', {
      store: storeA.id, public_slug: 'promo-perm-a', status: 'active', contract_version: 1,
      created_by: master.id, updated_by: master.id,
    });
    const siteB = await create('promo_sites', {
      store: storeB.id, public_slug: 'promo-perm-b', status: 'active', contract_version: 1,
      created_by: master.id, updated_by: master.id,
    });
    async function createEntitlement(site) {
      return create('promo_site_entitlements', {
        site: site.id, source: 'contract', promo_site_enabled: true, publish_enabled: true,
        custom_domain_enabled: true, theme_customization_enabled: true, multilanguage_enabled: true,
        video_enabled: true, analytics_enabled: true, landing_qr_bridge_enabled: true,
        max_services: 20, max_gallery_assets: 12, max_locales: 2, max_videos: 2,
        max_storage_bytes: 52428800, updated_by: master.id,
      });
    }
    let entitlementA = await createEntitlement(siteA);
    await createEntitlement(siteB);

    const primaryDevice = 'A'.repeat(43);
    const secondaryDevice = 'B'.repeat(43);
    const staffDevice = 'C'.repeat(43);
    const blockedDevice = 'D'.repeat(43);
    const commerceDevice = 'E'.repeat(43);
    const suspendedDevice = 'F'.repeat(43);
    const primaryAuth = await authenticate(primaryA.email, userPassword, primaryDevice);
    const secondaryBeforeGrant = await authenticate(secondaryA.email, userPassword, secondaryDevice);
    const staffAuth = await authenticate(staffA.email, userPassword, staffDevice);
    const blockedAuth = await authenticate(blockedB.email, userPassword, blockedDevice);
    const commerceAuth = await authenticate(commerceAdmin.email, userPassword, commerceDevice);
    assertStatus(primaryAuth, 200, 'auth principal');
    assertStatus(secondaryBeforeGrant, 200, 'auth secundario previo');
    assertStatus(staffAuth, 200, 'auth staff');
    assertStatus(blockedAuth, [400, 401, 403], 'login bloqueado por plan');
    assertStatus(commerceAuth, 200, 'auth Commerce');
    const primaryToken = primaryAuth.data.token;
    const oldSecondaryToken = secondaryBeforeGrant.data.token;
    const staffToken = staffAuth.data.token;

    const masterNoContext = await request('/api/pz/promo/access/context', { token: masterToken, json: {} });
    assertStatus(masterNoContext, 403, 'Master sin contexto explícito');
    const masterContext = await request('/api/pz/promo/access/context', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id }, json: {},
    });
    assertStatus(masterContext, 200, 'Master con contexto Promo');
    assert.ok(masterContext.data.access.reserved_permissions.includes('promo.entitlements.manage'));
    assert.ok(masterContext.data.access.allowed_actions.includes('promo.master.entitlements.manage'));

    assertStatus(await request('/api/pz/promo/private/v1/domains/cloudflare/simulate', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {},
    }), 404, 'la simulación Cloudflare permanece retirada');

    const staffContext = await request('/api/pz/promo/access/context', { token: staffToken, json: {} });
    assertStatus(staffContext, 403, 'staff sin concesión');

    const grant = await request('/api/pz/promo/team/update-permissions', {
      token: primaryToken,
      json: {
        user_id: secondaryA.id,
        expected_version: 0,
        permissions: ['promo.content.manage', 'promo.analytics.view'],
        reason: 'Concesión runtime PERM',
      },
    });
    assertStatus(grant, 200, 'principal concede permisos Promo');
    assert.equal(grant.data.sessions_revoked, true);
    assert.deepEqual(grant.data.user.assigned_permissions, [
      'promo.site.view', 'promo.content.manage', 'promo.analytics.view',
    ]);
    assert.equal(grant.data.user.version, 1);

    const revokedContext = await request('/api/pz/promo/access/context', { token: oldSecondaryToken, json: {} });
    assertStatus(revokedContext, [401, 403], 'sesión revocada no conserva acceso');
    const secondaryAuth = await authenticate(secondaryA.email, userPassword, secondaryDevice);
    assertStatus(secondaryAuth, 200, 'nuevo login secundario');
    const secondaryToken = secondaryAuth.data.token;
    const secondaryContext = await request('/api/pz/promo/access/context', { token: secondaryToken, json: {} });
    assertStatus(secondaryContext, 200, 'contexto secundario concedido');
    assert.deepEqual(secondaryContext.data.access.permissions, [
      'promo.site.view', 'promo.content.manage', 'promo.analytics.view',
    ]);
    assert.ok(secondaryContext.data.access.allowed_actions.includes('promo.content.manage'));
    assert.equal(secondaryContext.data.access.allowed_actions.includes('promo.publish'), false);

    const crossStore = await request('/api/pz/promo/access/context', {
      token: secondaryToken, headers: { 'X-PZ-Promo-Store': storeB.id }, json: {},
    });
    assertStatus(crossStore, 404, 'header cross-store');
    const injectedStore = await request('/api/pz/promo/team/detail', {
      token: primaryToken,
      json: { user_id: secondaryA.id, store_id: storeB.id, filter: 'site != ""', expand: 'site.store' },
    });
    assertStatus(injectedStore, 400, 'payload manipulado');
    const crossTarget = await request('/api/pz/promo/team/detail', {
      token: primaryToken, json: { user_id: blockedB.id },
    });
    assertStatus(crossTarget, 404, 'target de otra tienda');

    const unknownPermission = await request('/api/pz/promo/team/update-permissions', {
      token: primaryToken,
      json: { user_id: secondaryA.id, expected_version: 1, permissions: ['promo.unknown'], reason: 'Motivo runtime' },
    });
    assertStatus(unknownPermission, 400, 'permiso unknown');
    assert.equal(unknownPermission.data.error, 'invalid_promo_permissions');
    const reservedPermission = await request('/api/pz/promo/team/update-permissions', {
      token: primaryToken,
      json: { user_id: secondaryA.id, expected_version: 1, permissions: ['promo.entitlements.manage'], reason: 'Motivo runtime' },
    });
    assertStatus(reservedPermission, 400, 'permiso reservado');
    assert.equal(reservedPermission.data.error, 'reserved_promo_permission');

    const adminEntitlement = await request('/api/pz/promo/master/entitlements/update', {
      token: primaryToken,
      headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        expected_updated: entitlementA.updated, source: 'contract',
        capabilities: { analytics_enabled: false }, reason: 'Intento Admin',
      },
    });
    assertStatus(adminEntitlement, 403, 'Admin no modifica capacidades');
    const unknownCapability = await request('/api/pz/promo/master/entitlements/update', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        expected_updated: entitlementA.updated, source: 'contract',
        capabilities: { unknown_enabled: true }, reason: 'Unknown runtime',
      },
    });
    assertStatus(unknownCapability, 400, 'capacidad unknown');
    assert.equal(unknownCapability.data.error, 'unknown_promo_capability');
    const enabledDomainCapability = await request('/api/pz/promo/master/entitlements/update', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        expected_updated: entitlementA.updated, source: 'contract',
        capabilities: { custom_domain_enabled: true }, reason: 'Dominio privado runtime',
      },
    });
    assertStatus(enabledDomainCapability, 200, 'Master habilita dominio solo en el tenant explícito');
    entitlementA = enabledDomainCapability.data.entitlement;
    assert.equal(entitlementA.capabilities.custom_domain_enabled, true);

    const disableAnalytics = await request('/api/pz/promo/master/entitlements/update', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        expected_updated: entitlementA.updated, source: 'contract',
        capabilities: { analytics_enabled: false }, reason: 'Deshabilita analytics runtime',
      },
    });
    assertStatus(disableAnalytics, 200, 'Master modifica capacidad');
    entitlementA = disableAnalytics.data.entitlement;
    assert.equal(entitlementA.capabilities.analytics_enabled, false);
    const contextWithoutAnalytics = await request('/api/pz/promo/access/context', { token: secondaryToken, json: {} });
    assertStatus(contextWithoutAnalytics, 200, 'permiso persistido con capacidad ausente');
    assert.deepEqual(contextWithoutAnalytics.data.access.permissions, ['promo.site.view', 'promo.content.manage']);
    assert.equal(contextWithoutAnalytics.data.access.allowed_actions.includes('promo.analytics.view'), false);

    const auditListBody = {
      contract: 'promo.audit.list.v1', page: 1, per_page: 50, filters: {},
    };
    const primaryAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryToken, json: auditListBody,
    });
    assertStatus(primaryAudit, 200, 'principal lee actividad Promo crítica');
    assert.equal(primaryAudit.data.events.length, 3);
    assert.deepEqual(primaryAudit.data.events.map((event) => event.action).sort(), [
      'promo.entitlements.update',
      'promo.entitlements.update',
      'promo.team.permissions.update',
    ]);
    assert.equal(primaryAudit.data.events.every((event) => event.severity === 'critical'), true);
    const entitlementAudit = primaryAudit.data.events.find((event) => event.action === 'promo.entitlements.update');
    assert.equal(entitlementAudit.before.capabilities.analytics_enabled, true);
    assert.equal(entitlementAudit.after.capabilities.analytics_enabled, false);
    const permissionsAudit = primaryAudit.data.events.find((event) => event.action === 'promo.team.permissions.update');
    assert.equal(permissionsAudit.before.sessions_revoked, false);
    assert.equal(permissionsAudit.after.sessions_revoked, true);
    const serializedAudit = JSON.stringify(primaryAudit.data);
    for (const forbidden of [
      storeA.id, storeB.id, siteA.id, siteB.id, userPassword, 'tokenKey', 'source_event_key',
      'correlation_id', 'actor_snapshot_json', secondaryA.email,
    ]) assert.equal(serializedAudit.includes(forbidden), false, `audit privado excluye ${forbidden}`);
    assertStatus(await request('/api/pz/promo/private/v1/audit/list', {
      token: secondaryToken, json: auditListBody,
    }), 403, 'secundario no obtiene lector de auditoría');
    const masterAuditB = await request('/api/pz/promo/private/v1/audit/list', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeB.id }, json: auditListBody,
    });
    assertStatus(masterAuditB, 200, 'Master usa tenant audit explícito');
    assert.equal(masterAuditB.data.pagination.total_items, 0, 'eventos A no cruzan a B');

    const commerceContext = await request('/api/pz/promo/access/context', {
      token: commerceAuth.data.token, json: {},
    });
    assertStatus(commerceContext, 404, 'Commerce no recibe Promo aunque tenga grant corrupto/inyectado');
    const masterCommerceContext = await request('/api/pz/promo/access/context', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeCommerce.id }, json: {},
    });
    assertStatus(masterCommerceContext, 404, 'Master tampoco infiere Promo para Commerce');

    const suspendAfterLogin = await authenticate(suspendedA.email, userPassword, suspendedDevice);
    assertStatus(suspendAfterLogin, 200, 'login antes de suspensión');
    await update('users', suspendedA.id, { status: 'suspended' });
    const suspendedContext = await request('/api/pz/promo/access/context', {
      token: suspendAfterLogin.data.token, json: {},
    });
    assertStatus(suspendedContext, [401, 403], 'usuario suspendido');

    const directQuery = '?perPage=5&fields=id,promo_permissions_json&filter=promo_permissions_version%20%3E%200&sort=-promo_permissions_version&expand=store,user';
    for (const [token, label] of [[secondaryToken, 'secundario'], [masterToken, 'Master']]) {
      const directAccess = await request(`/api/collections/store_user_access/records${directQuery}`, { token });
      assertStatus(directAccess, [403, 404], `REST grants privado ${label}`);
      const directPromo = await request(`/api/collections/promo_site_entitlements/records${directQuery}`, { token });
      assertStatus(directPromo, [403, 404], `REST entitlement privado ${label}`);
      const directAudit = await request(`/api/collections/promo_audit_events/records${directQuery}`, { token });
      assertStatus(directAudit, [403, 404], `REST audit privado ${label}`);
    }
    const directPatch = await request(`/api/collections/store_user_access/records/${accessSecondary.id}`, {
      method: 'PATCH', token: secondaryToken, json: { promo_permissions_json: ['promo.publish'] },
    });
    assertStatus(directPatch, [403, 404], 'PATCH REST directo no suplanta API');

    const grantRows = await request(`/api/collections/store_user_access/records/${accessSecondary.id}`, {
      token: superToken,
    });
    assertStatus(grantRows, 200, 'superuser verifica persistencia temporal');
    assert.deepEqual(grantRows.data.promo_permissions_json, [
      'promo.site.view', 'promo.content.manage', 'promo.analytics.view',
    ]);
    assert.equal(grantRows.data.promo_permissions_version, 1);

    await stopPocketBase(runtime);
    runtime = null;
    for (const migration of POST_PERMISSION_MIGRATIONS.slice().reverse()) {
      const compatibilityDown = runPocketBase(
        ['migrate', 'down', '1'], dataDirectory, environment, 'y\n',
      );
      assertCommand(compatibilityDown, `down ${migration} antes de probar bloqueo PERM`);
      assert.match(
        compatibilityDown.stdout,
        new RegExp(`Reverted ${migration.replace('.', '\\.')}`),
      );
    }
    const blockedDown = runPocketBase(['migrate', 'down', '1'], dataDirectory, environment, 'y\n');
    assert.match(`${blockedDown.stdout}\n${blockedDown.stderr}`, /unsafe_rollback_promo_permissions/);
    const persistedFields = JSON.parse(sqliteValue(
      dataDirectory,
      "SELECT `fields` FROM `_collections` WHERE `name` = 'store_user_access'",
    ).fields);
    assert.ok(persistedFields.some((field) => field.name === 'promo_permissions_json'));

    t.diagnostic('Master, principal, secundario, staff, suspendido, bloqueado y Commerce validados');
    t.diagnostic('dos tiendas, sesión revocada, capacidades/permisos unknown y REST directo cerrados');
    t.diagnostic('migración PERM reversible en vacío y conservada al detectar grants');
  } finally {
    await stopPocketBase(runtime);
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.ok(resolvedTemporaryRoot.startsWith(`${resolvedSystemTemp}${path.sep}`));
    fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
  }
});
