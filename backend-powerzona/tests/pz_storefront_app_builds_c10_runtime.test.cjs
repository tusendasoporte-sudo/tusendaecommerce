'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const BACKEND_DIR = path.resolve(__dirname, '..');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const ENGINE_REVISION = 'b'.repeat(40);
const OLD_ENGINE_REVISION = 'a'.repeat(40);
const APK_SHA256 = 'c'.repeat(64);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function runtimeFlags(dataDirectory) {
  return [
    `--dir=${dataDirectory}`,
    `--hooksDir=${HOOKS_DIR}`,
    `--migrationsDir=${MIGRATIONS_DIR}`,
    '--hooksWatch=false',
    '--hooksPool=2',
    '--automigrate=true',
    '--indexFallback=false',
  ];
}

function startPocketBase(dataDirectory, port, environment) {
  let output = '';
  let spawnError = null;
  const child = spawn(
    POCKETBASE_EXE,
    ['serve', `--http=127.0.0.1:${port}`, ...runtimeFlags(dataDirectory)],
    {
      cwd: BACKEND_DIR,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-50_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => {
    spawnError = error;
    capture(`\n${error.stack || error.message}`);
  });
  return { child, output: () => output, spawnError: () => spawnError };
}

async function waitForPocketBase(runtime, baseUrl) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (runtime.spawnError()) throw runtime.spawnError();
    if (runtime.child.exitCode !== null) throw new Error(`PocketBase termino antes de iniciar.\n${runtime.output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch (_) {}
    await sleep(150);
  }
  throw new Error(`PocketBase no quedo listo.\n${runtime.output()}`);
}

async function stopPocketBase(runtime) {
  if (!runtime || runtime.child.exitCode !== null || runtime.child.signalCode !== null) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), sleep(5000).then(() => false)]);
  if (!graceful && runtime.child.exitCode === null && runtime.child.signalCode === null) {
    runtime.child.kill('SIGKILL');
    await Promise.race([exited, sleep(5000)]);
  }
}

async function apiRequest(baseUrl, route, {
  token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST',
} = {}) {
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw };
}

function normalizedPngFixture(kind) {
  const dimensions = kind === 'icon' ? [1024, 1024] : [1080, 1920];
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  Buffer.from('IHDR').copy(bytes, 12);
  bytes.writeUInt32BE(dimensions[0], 16);
  bytes.writeUInt32BE(dimensions[1], 20);
  return {
    bytes,
    width: dimensions[0],
    height: dimensions[1],
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fileName: `${kind}-${(kind === 'icon' ? 'a' : 'b').repeat(32)}.png`,
  };
}

function assertStatus(result, expected, action) {
  assert.equal(result.status, expected, `${action}: ${result.raw}`);
}

test('runtime C10 aplica migracion y completa la entrega manual por WhatsApp sin enviar ni abrir enlaces', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 90_000,
}, async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c10-runtime-'));
  const runtimeEnvironment = {
    ...process.env,
    PZ_STOREFRONT_ENGINE_VERSION: '2.1.0',
    PZ_STOREFRONT_ENGINE_REVISION: ENGINE_REVISION,
    PZ_STOREFRONT_ENGINE_UPDATE_SEVERITY: 'recommended',
    PZ_STORE_APP_RUNNER_SECRET: 'runtime-runner-c10-secret-abcdefghijklmnopqrstuvwxyz',
  };
  const superEmail = 'pz-c10-runtime@example.test';
  const superPassword = 'Qa-C10-runtime-password-2026!';
  const masterEmail = 'master-c10-runtime@example.test';
  const masterPassword = 'Qa-C10-master-password-2026!';
  let runtime = null;

  try {
    const bootstrap = spawnSync(
      POCKETBASE_EXE,
      ['superuser', 'create', superEmail, superPassword, ...runtimeFlags(dataDirectory)],
      {
        cwd: BACKEND_DIR,
        env: runtimeEnvironment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.equal(bootstrap.status, 0, `${bootstrap.stdout || ''}\n${bootstrap.stderr || ''}`);

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    runtime = startPocketBase(dataDirectory, port, runtimeEnvironment);
    await waitForPocketBase(runtime, baseUrl);

    const request = (route, options) => apiRequest(baseUrl, route, options);
    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: superEmail, password: superPassword },
    });
    assertStatus(superAuth, 200, 'autenticar superuser');
    const superToken = superAuth.data.token;

    async function create(collection, body) {
      const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
      assert.ok([200, 201].includes(result.status), `crear ${collection}: ${result.raw}`);
      return result.data;
    }

    async function update(collection, id, body) {
      const result = await request(`/api/collections/${collection}/records/${id}`, {
        token: superToken, body, method: 'PATCH',
      });
      assertStatus(result, 200, `actualizar ${collection}`);
      return result.data;
    }

    const master = await create('users', {
      email: masterEmail,
      password: masterPassword,
      passwordConfirm: masterPassword,
      display_name: 'Master C10 Runtime',
      role: 'master_admin',
      status: 'active',
      phone: '',
      emailVisibility: true,
    });
    const masterAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: masterEmail, password: masterPassword },
    });
    assertStatus(masterAuth, 200, 'autenticar Master');
    const masterToken = masterAuth.data.token;

    const anonymous = await request('/api/pz/master/storefront-app-builds', {
      body: { store_id: 'abcdefghijklmon' },
    });
    assert.ok([401, 403].includes(anonymous.status), `bloquear acceso anonimo: ${anonymous.raw}`);

    const store = await create('stores', {
      name: 'Tienda C10 Runtime',
      slug: 'tienda-c10-runtime',
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const premiumStore = await request('/api/pz/master/store-plan/change', {
      token: masterToken,
      body: {
        store_id: store.id,
        plan: 'premium',
        is_permanent: true,
        duration_months: 0,
        reason: 'Fixture automatica C10 Premium',
        confirm_expiration_cleanup: false,
      },
    });
    assertStatus(premiumStore, 200, 'activar Premium en tienda C10');

    const provisionStore = await create('stores', {
      name: 'Tienda C10 Provision Runtime',
      slug: 'tienda-c10-provision-runtime',
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const premiumProvisionStore = await request('/api/pz/master/store-plan/change', {
      token: masterToken,
      body: {
        store_id: provisionStore.id,
        plan: 'premium',
        is_permanent: true,
        duration_months: 0,
        reason: 'Fixture automatica C10 Provision Premium',
        confirm_expiration_cleanup: false,
      },
    });
    assertStatus(premiumProvisionStore, 200, 'activar Premium en tienda de aprovisionamiento C10');

    const uploadedBrandAssets = {};
    for (const kind of ['icon', 'splash']) {
      const fixture = normalizedPngFixture(kind);
      const form = new FormData();
      form.append('store_id', provisionStore.id);
      form.append('kind', kind);
      form.append('sha256', fixture.sha256);
      form.append('width', String(fixture.width));
      form.append('height', String(fixture.height));
      form.append('bytes', String(fixture.bytes.length));
      form.append('source_format', 'png');
      form.append('source_width', String(fixture.width));
      form.append('source_height', String(fixture.height));
      form.append('normalizer_version', 'storefront-brand-v1-sharp-0.34');
      form.append('file', new Blob([fixture.bytes], { type: 'image/png' }), fixture.fileName);
      const uploaded = await request('/api/pz/master/storefront-app-builds/brand-assets/upload', {
        token: masterToken, body: form,
      });
      assertStatus(uploaded, 201, `guardar ${kind} normalizado`);
      assert.equal(uploaded.data.asset.sha256, fixture.sha256);
      uploadedBrandAssets[kind] = uploaded.data.asset;
    }

    const brandDetail = await request('/api/pz/master/storefront-app-builds', {
      token: masterToken, body: { store_id: provisionStore.id },
    });
    const rawBrandRecords = await request('/api/collections/storefront_app_brand_assets/records?perPage=10', {
      token: superToken,
    });
    assertStatus(brandDetail, 200, 'consultar recursos de marca');
    assert.equal(brandDetail.data.brand_assets.ready, true, JSON.stringify({ state: brandDetail.data.brand_assets, records: rawBrandRecords.data }));
    assert.equal(brandDetail.data.brand_assets.icon.id, uploadedBrandAssets.icon.id);
    assert.equal(brandDetail.data.brand_assets.splash.id, uploadedBrandAssets.splash.id);

    const appBuildPreview = await request('/api/pz/master/storefront-app-builds/preview', {
      token: masterToken,
      body: {
        store_id: provisionStore.id,
        operation: 'provision',
        app_key: 'tienda-c10-runtime-provision',
        brand_key: 'tienda-c10-runtime-provision',
        display_name: 'App C10 Runtime Provision',
        distribution: 'direct',
        firebase_project_id: 'tienda-c10-runtime-provision',
        package_name: 'com.tusenda84.tiendac10runtimeprovision',
        store_url: 'https://runtime.example/t/tienda-c10-provision-runtime',
        version_code: 1,
        version_name: '1.0.0',
      },
    });
    assertStatus(appBuildPreview, 200, 'crear vista previa de aprovisionamiento');
    assert.equal(appBuildPreview.data.job.status, 'preview');
    assert.equal(appBuildPreview.data.job.preview.schema_version, 2);
    assert.equal(appBuildPreview.data.job.preview.branding.assets.icon.sha256, uploadedBrandAssets.icon.sha256);
    assert.equal(appBuildPreview.data.job.preview.branding.assets.splash.sha256, uploadedBrandAssets.splash.sha256);

    const storedAppBuildPreview = await request(
      `/api/collections/storefront_app_build_jobs/records/${appBuildPreview.data.job.id}`,
      { token: superToken },
    );
    assertStatus(storedAppBuildPreview, 200, 'consultar vista previa almacenada');
    assert.equal(storedAppBuildPreview.data.status, 'preview');
    assert.equal(storedAppBuildPreview.data.created_by, master.id);
    assert.equal(typeof storedAppBuildPreview.data.request_json, 'object');

    const appBuildConfirmed = await request('/api/pz/master/storefront-app-builds/confirm', {
      token: masterToken,
      body: {
        job_id: appBuildPreview.data.job.id,
        preview_hash: appBuildPreview.data.job.preview_hash,
      },
    });
    assert.equal(appBuildConfirmed.status, 200, `confirmar vista previa de aprovisionamiento: ${appBuildConfirmed.raw}\n${runtime.output()}`);
    assert.equal(appBuildConfirmed.data.job.status, 'queued');
    assert.equal(appBuildConfirmed.data.profile.status, 'queued');

    const blockedBrandReplacement = new FormData();
    const replacementFixture = normalizedPngFixture('icon');
    for (const [key, value] of Object.entries({
      store_id: provisionStore.id, kind: 'icon', sha256: replacementFixture.sha256,
      width: replacementFixture.width, height: replacementFixture.height, bytes: replacementFixture.bytes.length,
      source_format: 'png', source_width: replacementFixture.width, source_height: replacementFixture.height,
      normalizer_version: 'storefront-brand-v1-sharp-0.34',
    })) blockedBrandReplacement.append(key, String(value));
    blockedBrandReplacement.append('file', new Blob([replacementFixture.bytes], { type: 'image/png' }), replacementFixture.fileName);
    const blockedReplacement = await request('/api/pz/master/storefront-app-builds/brand-assets/upload', {
      token: masterToken, body: blockedBrandReplacement,
    });
    assertStatus(blockedReplacement, 409, 'bloquear cambio de marca con trabajo en cola');
    assert.equal(blockedReplacement.data.error, 'active_job_exists');

    const canceledProvision = await request('/api/pz/master/storefront-app-builds/cancel', {
      token: masterToken,
      body: { job_id: appBuildConfirmed.data.job.id, confirmation: 'CANCELAR TRABAJO' },
    });
    assertStatus(canceledProvision, 200, 'cancelar trabajo no reclamado');
    assert.equal(canceledProvision.data.job.status, 'canceled');
    assert.equal(canceledProvision.data.profile, null);

    const primary = await create('users', {
      email: 'principal-c10-runtime@example.test',
      password: 'Qa-C10-primary-password-2026!',
      passwordConfirm: 'Qa-C10-primary-password-2026!',
      display_name: 'Administradora Principal C10',
      role: 'store_admin',
      status: 'active',
      store: store.id,
      phone: 'numero-invalido',
      emailVisibility: true,
    });
    const assigned = await request('/api/pz/master/primary-admin/assign', {
      token: masterToken,
      body: { store_id: store.id, user_id: primary.id, reason: 'Fixture automatica C10' },
    });
    assertStatus(assigned, 200, 'asignar administrador principal');

    const profile = await create('storefront_app_build_profiles', {
      store: store.id,
      app_key: 'tienda-c10-runtime',
      display_name: 'App Tienda C10 Runtime',
      package_name: 'com.tusenda84.tiendac10runtime',
      store_url: 'https://runtime.example/t/tienda-c10-runtime',
      brand_key: 'tienda-c10-runtime',
      distribution: 'direct',
      status: 'provisioned',
      firebase_project_id: 'tienda-c10-runtime',
      firebase_project_number: '123456789012',
      firebase_app_id: '1:123456789012:android:abcdef0123456789',
      current_version_code: 7,
      current_version_name: '1.4.0',
      current_engine_version: '2.0.0',
      current_engine_revision: OLD_ENGINE_REVISION,
      created_by: master.id,
      updated_by: master.id,
    });
    const job = await create('storefront_app_build_jobs', {
      store: store.id,
      profile: profile.id,
      operation: 'update',
      status: 'succeeded',
      preview_hash: 'd'.repeat(64),
      request_json: { fixture: true },
      preview_json: { fixture: true },
      preview_expires_at: '2099-01-01T00:00:00.000Z',
      created_by: master.id,
      confirmed_by: master.id,
      confirmed_at: new Date().toISOString(),
      runner_id: 'runtime-c10',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      delivery_status: 'pending',
    });
    const artifact = await create('storefront_app_artifacts', {
      store: store.id,
      profile: profile.id,
      job: job.id,
      kind: 'apk',
      visibility: 'store_delivery',
      file_name: 'tienda-c10-runtime-1.4.0.apk',
      storage_locator: 'runtime-only/never-delivered/tienda-c10-runtime-1.4.0.apk',
      sha256: APK_SHA256,
      bytes: 12345678,
      version_code: 7,
      version_name: '1.4.0',
    });

    const detailBlocked = await request('/api/pz/master/storefront-app-builds', {
      token: masterToken, body: { store_id: store.id },
    });
    assertStatus(detailBlocked, 200, 'consultar detalle C10');
    assert.equal(detailBlocked.data.manual_whatsapp_delivery.sender.phone_state, 'missing');
    assert.equal(detailBlocked.data.manual_whatsapp_delivery.recipient.phone_state, 'invalid');
    assert.equal(detailBlocked.data.manual_whatsapp_delivery.recipient.status, 'missing_whatsapp');
    assert.equal(detailBlocked.data.profile.engine_update.available, true);
    assert.equal(detailBlocked.data.artifacts[0].storage_locator, undefined);

    const noSender = await request('/api/pz/master/storefront-app-builds/whatsapp/preview', {
      token: masterToken, body: { store_id: store.id, artifact_id: artifact.id },
    });
    assertStatus(noSender, 409, 'bloquear vista previa sin remitente');
    assert.equal(noSender.data.error, 'master_whatsapp_required');

    const invalidSender = await request('/api/pz/master/storefront-app-builds/whatsapp/settings', {
      token: masterToken, body: { whatsapp_number: '53-ABC' },
    });
    assertStatus(invalidSender, 400, 'rechazar numero Master invalido');
    assert.equal(invalidSender.data.error, 'invalid_payload');

    const savedSender = await request('/api/pz/master/storefront-app-builds/whatsapp/settings', {
      token: masterToken, body: { whatsapp_number: '+1 (305) 555-0187' },
    });
    assertStatus(savedSender, 200, 'guardar numero Master');
    assert.equal(savedSender.data.sender.whatsapp_number, '13055550187');
    assert.equal(savedSender.data.sender.configured, true);

    const invalidPrimary = await request('/api/pz/master/storefront-app-builds/whatsapp/preview', {
      token: masterToken, body: { store_id: store.id, artifact_id: artifact.id },
    });
    assertStatus(invalidPrimary, 409, 'bloquear destinatario invalido');
    assert.equal(invalidPrimary.data.error, 'primary_admin_whatsapp_required');

    await update('users', primary.id, { phone: '+53 5 123 4567' });
    const noArtifact = await request('/api/pz/master/storefront-app-builds/whatsapp/preview', {
      token: masterToken, body: { store_id: store.id, artifact_id: 'missingartifact1' },
    });
    assertStatus(noArtifact, 409, 'bloquear cuando no existe APK');
    assert.equal(noArtifact.data.error, 'apk_not_ready');

    const updatesPending = await request('/api/pz/master/storefront-app-builds/updates', {
      token: masterToken, body: {},
    });
    assertStatus(updatesPending, 200, 'consultar alertas pendientes');
    assert.equal(updatesPending.data.update_count, 1);
    assert.equal(updatesPending.data.delivery_pending_count, 1);
    assert.equal(updatesPending.data.deliveries[0].recipient.status, 'ready');

    const preview = await request('/api/pz/master/storefront-app-builds/whatsapp/preview', {
      token: masterToken, body: { store_id: store.id, artifact_id: artifact.id },
    });
    assertStatus(preview, 200, 'generar vista previa manual');
    assert.equal(preview.data.preview.mode, 'manual_wa_me');
    assert.equal(preview.data.preview.automatic_send, false);
    assert.equal(preview.data.preview.cloud_api, false);
    assert.equal(preview.data.preview.attachment_required, true);
    assert.equal(preview.data.preview.attachment_sha256, APK_SHA256);
    assert.equal(preview.data.preview.sender_whatsapp, '13055550187');
    assert.equal(preview.data.preview.recipient_whatsapp, '5351234567');
    assert.match(preview.data.preview.message, /tienda-c10-runtime-1\.4\.0\.apk/);
    assert.match(preview.data.preview.message, new RegExp(APK_SHA256));
    const whatsappUrl = new URL(preview.data.preview.whatsapp_url);
    assert.equal(whatsappUrl.protocol, 'https:');
    assert.equal(whatsappUrl.hostname, 'wa.me');
    assert.equal(whatsappUrl.pathname, '/5351234567');
    assert.ok(whatsappUrl.searchParams.get('text').includes('SHA-256'));

    const wrongConfirmation = await request('/api/pz/master/storefront-app-builds/whatsapp/marked-sent', {
      token: masterToken,
      body: {
        store_id: store.id,
        artifact_id: artifact.id,
        message_sha256: preview.data.preview.message_sha256,
        confirmation: 'ENVIAR',
      },
    });
    assertStatus(wrongConfirmation, 400, 'rechazar confirmacion incorrecta');

    const wrongDigest = await request('/api/pz/master/storefront-app-builds/whatsapp/marked-sent', {
      token: masterToken,
      body: {
        store_id: store.id,
        artifact_id: artifact.id,
        message_sha256: 'e'.repeat(64),
        confirmation: 'MARCAR ENVIADO',
      },
    });
    assertStatus(wrongDigest, 409, 'rechazar vista previa alterada');
    assert.equal(wrongDigest.data.error, 'delivery_preview_mismatch');

    const marked = await request('/api/pz/master/storefront-app-builds/whatsapp/marked-sent', {
      token: masterToken,
      body: {
        store_id: store.id,
        artifact_id: artifact.id,
        message_sha256: preview.data.preview.message_sha256,
        confirmation: 'MARCAR ENVIADO',
      },
    });
    assertStatus(marked, 200, 'marcar entrega manual');
    assert.equal(marked.data.idempotent, false);
    assert.equal(marked.data.job.delivery_status, 'marked_sent');
    assert.equal(marked.data.job.delivery_sender_whatsapp, '13055550187');
    assert.equal(marked.data.job.delivery_recipient_whatsapp, '5351234567');
    assert.equal(marked.data.job.delivery_message_sha256, preview.data.preview.message_sha256);
    assert.ok(marked.data.job.delivery_marked_at);

    const repeated = await request('/api/pz/master/storefront-app-builds/whatsapp/marked-sent', {
      token: masterToken,
      body: {
        store_id: store.id,
        artifact_id: artifact.id,
        message_sha256: preview.data.preview.message_sha256,
        confirmation: 'MARCAR ENVIADO',
      },
    });
    assertStatus(repeated, 200, 'repetir marcado idempotente');
    assert.equal(repeated.data.idempotent, true);

    const updatesDone = await request('/api/pz/master/storefront-app-builds/updates', {
      token: masterToken, body: {},
    });
    assertStatus(updatesDone, 200, 'confirmar alerta resuelta');
    assert.equal(updatesDone.data.delivery_pending_count, 0);

    const storeWithoutPrimary = await create('stores', {
      name: 'Tienda C10 Sin Principal',
      slug: 'tienda-c10-sin-principal',
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const premiumStoreWithoutPrimary = await request('/api/pz/master/store-plan/change', {
      token: masterToken,
      body: {
        store_id: storeWithoutPrimary.id,
        plan: 'premium',
        is_permanent: true,
        duration_months: 0,
        reason: 'Fixture automatica C10 sin principal',
        confirm_expiration_cleanup: false,
      },
    });
    assertStatus(premiumStoreWithoutPrimary, 200, 'activar Premium en tienda sin principal');
    const profileWithoutPrimary = await create('storefront_app_build_profiles', {
      store: storeWithoutPrimary.id,
      app_key: 'tienda-c10-sin-principal',
      display_name: 'App C10 Sin Principal',
      package_name: 'com.tusenda84.c10sinprincipal',
      store_url: 'https://runtime.example/t/tienda-c10-sin-principal',
      brand_key: 'c10-sin-principal',
      distribution: 'direct',
      status: 'provisioned',
      firebase_project_id: 'c10-sin-principal',
      current_version_code: 1,
      current_version_name: '1.0.0',
      current_engine_version: '2.1.0',
      current_engine_revision: ENGINE_REVISION,
      created_by: master.id,
      updated_by: master.id,
    });
    const jobWithoutPrimary = await create('storefront_app_build_jobs', {
      store: storeWithoutPrimary.id,
      profile: profileWithoutPrimary.id,
      operation: 'update',
      status: 'succeeded',
      preview_hash: 'f'.repeat(64),
      request_json: { fixture: true },
      preview_json: { fixture: true },
      preview_expires_at: '2099-01-01T00:00:00.000Z',
      created_by: master.id,
      confirmed_by: master.id,
      confirmed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      delivery_status: 'pending',
    });
    const artifactWithoutPrimary = await create('storefront_app_artifacts', {
      store: storeWithoutPrimary.id,
      profile: profileWithoutPrimary.id,
      job: jobWithoutPrimary.id,
      kind: 'apk',
      visibility: 'store_delivery',
      file_name: 'c10-sin-principal-1.0.0.apk',
      storage_locator: 'runtime-only/never-delivered/c10-sin-principal-1.0.0.apk',
      sha256: '1'.repeat(64),
      bytes: 7654321,
      version_code: 1,
      version_name: '1.0.0',
    });
    const missingPrimary = await request('/api/pz/master/storefront-app-builds/whatsapp/preview', {
      token: masterToken,
      body: { store_id: storeWithoutPrimary.id, artifact_id: artifactWithoutPrimary.id },
    });
    assertStatus(missingPrimary, 409, 'bloquear tienda sin administrador principal');
    assert.equal(missingPrimary.data.error, 'primary_admin_required');

    const detailMissingPrimary = await request('/api/pz/master/storefront-app-builds', {
      token: masterToken, body: { store_id: storeWithoutPrimary.id },
    });
    assertStatus(detailMissingPrimary, 200, 'mostrar estado sin administrador principal');
    assert.equal(detailMissingPrimary.data.manual_whatsapp_delivery.recipient.status, 'missing_primary');

    const privateRecords = await request('/api/collections/storefront_app_build_jobs/records', {
      token: masterToken,
    });
    assertStatus(privateRecords, 403, 'mantener colecciones de builds privadas incluso para Master');
  } finally {
    await stopPocketBase(runtime);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});
