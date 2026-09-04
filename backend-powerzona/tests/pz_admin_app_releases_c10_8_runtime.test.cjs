'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const BACKEND_DIR = path.resolve(__dirname, '..');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const RUNNER_SECRET = 'c108-runtime-runner-secret-abcdefghijklmnopqrstuvwxyz';
const ENGINE_REVISION = 'b'.repeat(40);
const SIGNING_CERT = `${'11:'.repeat(31)}11`;
const PASSWORD = 'Qa-C108-runtime-password-2026!';
const DEVICE_HEADER = 'X-PZ-Admin-Device';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function squarePng(size) {
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const stride = size * 4 + 1; const pixels = Buffer.alloc(stride * size);
  for (let row = 0; row < size; row += 1) pixels.fill(0xff, row * stride + 1, (row + 1) * stride);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function runtimeFlags(dataDirectory) {
  return [
    `--dir=${dataDirectory}`, `--hooksDir=${HOOKS_DIR}`, `--migrationsDir=${MIGRATIONS_DIR}`,
    '--hooksWatch=false', '--hooksPool=2', '--automigrate=true', '--indexFallback=false',
  ];
}

function startPocketBase(dataDirectory, port, environment) {
  let output = '';
  let spawnError = null;
  const child = spawn(POCKETBASE_EXE, ['serve', `--http=127.0.0.1:${port}`, ...runtimeFlags(dataDirectory)], {
    cwd: BACKEND_DIR, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-50_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => { spawnError = error; capture(`\n${error.stack || error.message}`); });
  return { child, output: () => output, spawnError: () => spawnError };
}

async function waitForPocketBase(runtime, baseUrl) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (runtime.spawnError()) throw runtime.spawnError();
    if (runtime.child.exitCode !== null) throw new Error(`PocketBase terminó antes de iniciar.\n${runtime.output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch (_) {}
    await sleep(150);
  }
  throw new Error(`PocketBase no quedó listo.\n${runtime.output()}`);
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
  return { status: response.status, data, raw, headers: response.headers };
}

function assertStatus(result, expected, action) {
  assert.equal(result.status, expected, `${action}: ${result.raw}`);
}

test('runtime C10.8 completa custodia, prueba Master, publicación global y obligatoriedad sin servicios externos', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 90_000,
}, async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c108-runtime-'));
  const environment = {
    ...process.env,
    PZ_ADMIN_APP_RUNNER_SECRET: RUNNER_SECRET,
    PZ_ADMIN_ENGINE_VERSION: '2.0.0',
    PZ_ADMIN_ENGINE_REVISION: ENGINE_REVISION,
    PZ_ADMIN_API_BASE_URL: 'https://api.tusenda84.com',
    PZ_ADMIN_ENGINE_UPDATE_SEVERITY: 'recommended',
  };
  const superEmail = 'super-c108-runtime@example.test';
  const masterEmail = 'master-c108-runtime@example.test';
  const adminEmail = 'admin-c108-runtime@example.test';
  const deviceTokens = ['A'.repeat(43), 'B'.repeat(43), 'C'.repeat(43)];
  let runtime = null;

  try {
    const bootstrap = spawnSync(
      POCKETBASE_EXE,
      ['superuser', 'create', superEmail, PASSWORD, ...runtimeFlags(dataDirectory)],
      { cwd: BACKEND_DIR, env: environment, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );
    assert.equal(bootstrap.status, 0, `${bootstrap.stdout || ''}\n${bootstrap.stderr || ''}`);

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    runtime = startPocketBase(dataDirectory, port, environment);
    await waitForPocketBase(runtime, baseUrl);
    const request = (route, options) => apiRequest(baseUrl, route, options);

    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: superEmail, password: PASSWORD },
    });
    assertStatus(superAuth, 200, 'autenticar superuser');
    const superToken = superAuth.data.token;

    async function create(collection, body) {
      const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
      assert.ok([200, 201].includes(result.status), `crear ${collection}: ${result.raw}`);
      return result.data;
    }

    const master = await create('users', {
      email: masterEmail, password: PASSWORD, passwordConfirm: PASSWORD, display_name: 'Master C10.8 Runtime',
      role: 'master_admin', status: 'active', phone: '', emailVisibility: true,
    });
    const store = await create('stores', {
      name: 'QA C10.8 Runtime', slug: 'qa-c10-8-runtime', status: 'active', plan: 'premium',
      plan_started_at: new Date().toISOString(), plan_expires_at: '', plan_duration_months: 0, plan_is_permanent: true,
    });
    const admin = await create('users', {
      email: adminEmail, password: PASSWORD, passwordConfirm: PASSWORD, display_name: 'Admin C10.8 Runtime',
      role: 'store_admin', status: 'active', store: store.id, phone: '', emailVisibility: true,
    });

    const masterAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: masterEmail, password: PASSWORD },
    });
    assertStatus(masterAuth, 200, 'autenticar Master');
    const masterToken = masterAuth.data.token;

    const adminLogins = [];
    for (let index = 0; index < deviceTokens.length; index += 1) {
      const login = await request('/api/collections/users/auth-with-password', {
        headers: { [DEVICE_HEADER]: deviceTokens[index], 'User-Agent': `Mozilla/5.0 C108Device/${index + 1}` },
        body: { identity: adminEmail, password: PASSWORD },
      });
      assertStatus(login, 200, `autorizar dispositivo ${index + 1}`);
      adminLogins.push(login.data.token);
    }

    const deviceQuery = new URLSearchParams({ page: '1', perPage: '20', filter: `user = "${admin.id}"` });
    const devices = await request(`/api/collections/store_user_devices/records?${deviceQuery}`, { token: superToken });
    assertStatus(devices, 200, 'inventariar dispositivos temporales');
    const deviceIds = deviceTokens.map((rawToken) => {
      const digest = sha256(`pz_admin_device:v1|${rawToken}`);
      return devices.data.items.find((item) => item.device_digest === digest)?.id || '';
    });
    assert.ok(deviceIds.every((id) => /^[a-z0-9]{15}$/.test(id)), 'resolver los tres dispositivos exactos');
    const adminHeaders = { [DEVICE_HEADER]: deviceTokens[0] };

    const pushRegistration = await request('/api/pz/admin-push/v2/register', {
      token: adminLogins[0],
      headers: adminHeaders,
      body: {
        installation_id: '123e4567-e89b-42d3-a456-426614174000',
        firebase_installation_id: '',
        app_id: 'com.tusenda84.admin',
        device_label: 'Android Runtime C10.8',
        os_version: 'Android 16 (API 36)',
        app_version: '2.0.0',
        app_version_code: 4,
        notification_permission: 'granted',
        notifications_enabled: true,
        credential_required: true,
      },
    });
    assertStatus(pushRegistration, 201, 'registrar identidad local Admin sin depender de Firebase');
    assert.match(pushRegistration.data.credential, /^pza_v1_[a-f0-9]{64}$/);
    assert.equal(pushRegistration.data.device.firebase_status, 'pending');
    const pushCredential = pushRegistration.data.credential;

    const firebaseEnrichment = await request('/api/pz/admin-push/v2/firebase', {
      token: pushCredential,
      body: { firebase_installation_id: 'runtimeAdminFid_20260904' },
    });
    assertStatus(firebaseEnrichment, 200, 'enriquecer Firebase después del registro básico');
    assert.equal(firebaseEnrichment.data.device.firebase_status, 'registered');

    const recoverableNotification = await create('store_notifications', {
      store: store.id,
      type: 'low_stock',
      title: 'Stock bajo runtime',
      message: 'Quedan dos unidades.',
      status: 'unread',
      priority: 'important',
      target_url: '/admin/products',
    });
    const synchronized = await request('/api/pz/admin-push/v2/notifications/sync', {
      token: pushCredential,
      body: { delivery_trigger: 'workmanager' },
    });
    assertStatus(synchronized, 200, 'recuperar avisos no leídos sin Firebase');
    assert.deepEqual(
      synchronized.data.notifications.map((item) => item.notification_id),
      [recoverableNotification.id],
    );

    const occurredAt = new Date().toISOString();
    const acknowledged = await request('/api/pz/admin-push/v2/notifications/ack', {
      token: pushCredential,
      body: {
        receipts: [{
          notification_id: recoverableNotification.id,
          state: 'native_delivered',
          occurred_at: occurredAt,
          delivery_trigger: 'workmanager',
        }, {
          notification_id: recoverableNotification.id,
          state: 'read',
          occurred_at: occurredAt,
          delivery_trigger: '',
        }],
      },
    });
    assertStatus(acknowledged, 200, 'confirmar entrega y lectura nativas');
    assert.equal(acknowledged.data.accepted + acknowledged.data.duplicates, 2);
    const readNotification = await request(
      `/api/collections/store_notifications/records/${recoverableNotification.id}`,
      { token: superToken },
    );
    assertStatus(readNotification, 200, 'comprobar lectura durable');
    assert.equal(readNotification.data.status, 'read');

    const pausedRegistration = await request('/api/pz/admin-push/v2/register', {
      token: adminLogins[0],
      headers: adminHeaders,
      body: {
        installation_id: '123e4567-e89b-42d3-a456-426614174000',
        firebase_installation_id: 'runtimeAdminFid_20260904',
        app_id: 'com.tusenda84.admin',
        device_label: 'Android Runtime C10.8',
        os_version: 'Android 16 (API 36)',
        app_version: '2.0.0',
        app_version_code: 4,
        notification_permission: 'granted',
        notifications_enabled: false,
        credential_required: false,
      },
    });
    assertStatus(pausedRegistration, 200, 'pausar avisos sin borrar la instalación');
    assert.equal(pausedRegistration.data.credential, '');
    const pausedNotification = await create('store_notifications', {
      store: store.id,
      type: 'new_order',
      title: 'Pedido runtime pausado',
      message: 'No debe entregarse mientras la instalación esté pausada.',
      status: 'unread',
      priority: 'critical',
      target_url: '/admin/orders',
    });
    const pausedSync = await request('/api/pz/admin-push/v2/notifications/sync', {
      token: pushCredential,
      body: { delivery_trigger: 'resume_sync' },
    });
    assertStatus(pausedSync, 200, 'sincronizar instalación pausada sin entregar');
    assert.equal(pausedSync.data.notifications.length, 0);
    assert.ok(pausedNotification.id);

    const anonymous = await request('/api/pz/master/admin-app-releases/detail', { body: { channel: 'staging' } });
    assert.ok([401, 403].includes(anonymous.status));

    const configured = await request('/api/pz/master/admin-app-releases/configure', {
      token: masterToken,
      body: {
        display_name: 'Tu Senda 84 Admin', package_name: 'com.tusenda84.admin',
        admin_url: 'https://tusenda84.com/admin',
        signing_cert_sha256: SIGNING_CERT, current_version_code: 3, current_version_name: '1.0.2',
        splash_background_color: '#FFFFFF',
        confirmation: 'CONFIGURAR MOBILE ADMIN',
      },
    });
    assertStatus(configured, 200, 'configurar identidad C10.8');

    const iconBytes = squarePng(512);
    const iconForm = new FormData();
    iconForm.append('kind', 'icon'); iconForm.append('sha256', sha256(iconBytes));
    iconForm.append('bytes', String(iconBytes.length)); iconForm.append('width', '512'); iconForm.append('height', '512');
    iconForm.append('confirmation', 'CAMBIAR IMAGEN MOBILE ADMIN');
    iconForm.append('file', new Blob([iconBytes], { type: 'image/png' }), 'icon.png');
    const uploadedIcon = await request('/api/pz/master/admin-app-releases/brand/upload', { token: masterToken, body: iconForm });
    assertStatus(uploadedIcon, 201, 'guardar icono protegido');
    assert.equal(uploadedIcon.data.asset.sha256, sha256(iconBytes));

    const preview = await request('/api/pz/master/admin-app-releases/preview', {
      token: masterToken, body: { version_name: '1.0.3' },
    });
    assertStatus(preview, 201, 'crear preview C10.8');
    assert.equal(preview.data.job.engine.api_base_url, 'https://api.tusenda84.com');
    const confirmed = await request('/api/pz/master/admin-app-releases/confirm', {
      token: masterToken,
      body: { job_id: preview.data.job.id, preview_hash: preview.data.job.preview_hash, confirmation: 'CONFIRMAR BUILD MOBILE ADMIN' },
    });
    assertStatus(confirmed, 200, 'confirmar build C10.8');

    const runnerHeaders = {
      'x-pz-admin-app-runner': RUNNER_SECRET,
      'x-pz-admin-app-runner-id': 'runtime-c108',
    };
    const heartbeat = await request('/api/pz/internal/admin-app-runners/heartbeat', {
      headers: runnerHeaders,
      body: {
        runner_id: 'runtime-c108',
        engine_version: '2.0.0',
        engine_revision: ENGINE_REVISION,
        mode: 'manual',
        allow_firebase: true,
        allow_signing: true,
        workspace_clean: true,
      },
    });
    assertStatus(heartbeat, 200, 'registrar Runner Admin independiente');

    const authorized = await request('/api/pz/master/admin-app-releases/start-runner', {
      token: masterToken,
      body: {
        job_id: preview.data.job.id,
        preview_hash: preview.data.job.preview_hash,
        confirmation: 'INICIAR RUNNER ADMIN',
      },
    });
    assertStatus(authorized, 200, 'autorizar un solo trabajo para el Runner Admin');
    assert.equal(authorized.data.runner.runner_id, 'runtime-c108');

    const claimed = await request('/api/pz/internal/admin-app-builds/claim', {
      headers: runnerHeaders, body: { runner_id: 'runtime-c108' },
    });
    assertStatus(claimed, 200, 'reclamar build C10.8');
    assert.equal(claimed.data.job.id, preview.data.job.id);
    assert.equal(claimed.data.job.preview.engine.api_base_url, 'https://api.tusenda84.com');
    assert.equal(claimed.data.job.profile.icon.sha256, sha256(iconBytes));
    const runnerIcon = await fetch(`${baseUrl}${claimed.data.job.profile.icon.download_path}`, { headers: runnerHeaders, signal: AbortSignal.timeout(20_000) });
    assert.equal(runnerIcon.status, 200);
    assert.deepEqual(Buffer.from(await runnerIcon.arrayBuffer()), iconBytes);

    const fixtures = [
      ['apk', 'mobile-admin-1.0.3-4.apk', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x43, 0x31, 0x30, 0x38])],
      ['checksums', 'SHA256SUMS.txt', Buffer.from('checksum runtime c108\n')],
      ['instructions', 'INSTRUCCIONES.txt', Buffer.from('instalar sin desinstalar\n')],
      ['build_manifest', 'build-manifest.json', Buffer.from('{"schema_version":2}')],
    ].map(([kind, fileName, bytes]) => ({ kind, fileName, bytes, sha256: sha256(bytes) }));

    for (const fixture of fixtures) {
      const form = new FormData();
      form.append('job_id', preview.data.job.id);
      form.append('runner_id', 'runtime-c108');
      form.append('kind', fixture.kind);
      form.append('file_name', fixture.fileName);
      form.append('sha256', fixture.sha256);
      form.append('bytes', String(fixture.bytes.length));
      form.append('file', new Blob([fixture.bytes], { type: 'application/octet-stream' }), fixture.fileName);
      const upload = await request('/api/pz/internal/admin-app-builds/artifacts/upload', { headers: runnerHeaders, body: form });
      assert.equal(upload.status, 201, `subir ${fixture.kind}: ${upload.raw}\n${runtime.output()}`);
    }

    const completed = await request('/api/pz/internal/admin-app-builds/complete', {
      headers: runnerHeaders,
      body: {
        job_id: preview.data.job.id, runner_id: 'runtime-c108', status: 'succeeded', failure_code: '',
        signing_cert_sha256: SIGNING_CERT,
        engine_name: 'Tu Senda 84 Admin Engine', engine_version: '2.0.0', engine_contract_version: 2,
        engine_revision: ENGINE_REVISION,
        artifacts: fixtures.map((fixture) => ({
          kind: fixture.kind, file_name: fixture.fileName, sha256: fixture.sha256, bytes: fixture.bytes.length,
        })),
      },
    });
    assertStatus(completed, 200, 'completar build C10.8');

    for (const [collection, field] of [
      ['admin_app_brand_assets', 'file'],
      ['admin_app_release_profiles', 'current_engine_revision'],
      ['admin_app_build_jobs', 'execution_authorized_at'],
      ['admin_app_download_tickets', 'profile'],
      ['admin_app_runner_agents', 'runner_id'],
      ['admin_push_delivery_receipts', 'notification'],
    ]) {
      const schema = await request(`/api/collections/${collection}`, { token: superToken, method: 'GET' });
      assertStatus(schema, 200, `consultar esquema ${collection}`);
      assert.ok(schema.data.fields.some((item) => item.name === field), `${collection} no contiene ${field}: ${schema.raw}`);
    }

    const detail = await request('/api/pz/master/admin-app-releases/detail', {
      token: masterToken, body: { channel: 'production' },
    });
    assertStatus(detail, 200, 'consultar inventario C10.8');
    assert.equal(detail.data.engine.ready, true);
    assert.equal(detail.data.engine.api_base_url, 'https://api.tusenda84.com');
    assert.equal(detail.data.jobs.every((job) => job.engine.api_base_url === 'https://api.tusenda84.com'), true);
    assert.equal(detail.data.runner_control.authorization_state, 'none');
    assert.equal(detail.data.runner_control.agents[0].runner_id, 'runtime-c108');
    assert.equal(detail.data.policy.runner_isolated, true);
    assert.equal(detail.data.policy.canonical_build_channel, 'production');
    assert.equal(detail.data.policy.single_artifact_release, true);
    assert.equal(detail.data.policy.publication_reuses_approved_artifact, true);
    assert.equal(detail.data.notification_health.available, true);
    assert.equal(detail.data.notification_health.summary.active_installations, 1);
    assert.equal(detail.data.notification_health.summary.credential_ready, 1);
    assert.equal(detail.data.notification_health.summary.firebase_registered, 1);
    assert.equal(detail.data.notification_health.summary.notifications_enabled, 0);
    assert.equal(detail.data.notification_health.summary.delivery_triggers.workmanager, 1);
    assert.equal(detail.data.profile.latest_version_code, 3, 'una candidata no sustituye la versión publicada');
    assert.equal(detail.data.profile.latest_version_name, '1.0.2');
    const apk = detail.data.artifacts.find((item) => item.kind === 'apk');
    assert.ok(apk?.stored && apk.lifecycle_status === 'available');

    const masterPhysical = await fetch(`${baseUrl}/api/pz/master/admin-app-artifacts/${apk.id}/${apk.file_name}`, {
      headers: { Authorization: `Bearer ${masterToken}` }, signal: AbortSignal.timeout(20_000),
    });
    assert.equal(masterPhysical.status, 200, 'Master descarga la APK antes de publicarla');
    assert.equal(masterPhysical.headers.get('x-pz-apk-sha256'), fixtures[0].sha256);
    assert.deepEqual(Buffer.from(await masterPhysical.arrayBuffer()), fixtures[0].bytes);

    const unpublishedPortal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[0], headers: adminHeaders,
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(unpublishedPortal, 404, 'no entregar una APK sin publicar');

    const prematurePublish = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'publish_general', artifact_id: apk.id, confirmation: 'PUBLICAR MOBILE ADMIN PARA TODOS' },
    });
    assertStatus(prematurePublish, 409, 'impedir publicación antes de aprobar la prueba');

    const approved = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'approve_test', artifact_id: apk.id, confirmation: 'APROBAR APK MOBILE ADMIN' },
    });
    assertStatus(approved, 200, 'aprobar prueba manual del Master');

    const publish = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'publish_general', artifact_id: apk.id, confirmation: 'PUBLICAR MOBILE ADMIN PARA TODOS' },
    });
    assertStatus(publish, 200, 'publicar para todos los administradores autorizados');
    assert.equal(publish.data.created, 0);
    const publishedDetail = await request('/api/pz/master/admin-app-releases/detail', {
      token: masterToken, body: { channel: 'production' },
    });
    assertStatus(publishedDetail, 200, 'actualizar la versión vigente solo al publicar');
    assert.equal(publishedDetail.data.profile.latest_version_code, 4);
    assert.equal(publishedDetail.data.profile.latest_version_name, '1.0.3');
    assert.equal(publishedDetail.data.artifacts.length, detail.data.artifacts.length, 'publicar no debe crear otro artefacto');
    const publishedApk = publishedDetail.data.artifacts.find((item) => item.id === apk.id);
    assert.equal(publishedApk?.sha256, apk.sha256, 'publicar debe conservar la APK y el SHA-256 aprobados');

    const assignments = await request('/api/collections/admin_app_release_assignments/records?page=1&perPage=20', { token: superToken });
    assertStatus(assignments, 200, 'verificar ausencia de asignaciones individuales');
    assert.equal(assignments.data.totalItems, 0);

    const portal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[0], headers: adminHeaders,
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(portal, 200, 'abrir portal autenticado');
    assert.equal(portal.data.access.recipient.device.id, deviceIds[0]);

    const secondDevicePortal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[1], headers: { [DEVICE_HEADER]: deviceTokens[1] },
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(secondDevicePortal, 200, 'dar acceso automático a otro dispositivo autorizado');

    const ticket = await request('/api/pz/admin-app/releases/ticket', {
      token: adminLogins[0], headers: adminHeaders,
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(ticket, 201, 'crear ticket de un uso');
    const storedTicketQuery = new URLSearchParams({ page: '1', perPage: '20', filter: `artifact = "${apk.id}"` });
    const storedTickets = await request(`/api/collections/admin_app_download_tickets/records?${storedTicketQuery}`, { token: superToken });
    assertStatus(storedTickets, 200, 'verificar ticket global');
    assert.equal(storedTickets.data.items[0].assignment || '', '');
    assert.equal(storedTickets.data.items[0].profile, configured.data.profile.id);
    const physical = await fetch(`${baseUrl}${ticket.data.download_path}`, {
      headers: { Authorization: `Bearer ${adminLogins[0]}`, ...adminHeaders },
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(physical.status, 200);
    assert.equal(physical.headers.get('x-pz-apk-sha256'), fixtures[0].sha256);
    assert.deepEqual(Buffer.from(await physical.arrayBuffer()), fixtures[0].bytes);
    const reused = await fetch(`${baseUrl}${ticket.data.download_path}`, {
      headers: { Authorization: `Bearer ${adminLogins[0]}`, ...adminHeaders },
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(reused.status, 404);

    const checkIn = await request('/api/pz/admin-app/releases/check-in', {
      token: adminLogins[0], headers: adminHeaders,
      body: { package_name: 'com.tusenda84.admin', version_code: 4, version_name: '1.0.3' },
    });
    assertStatus(checkIn, 200, 'registrar instalación global');
    assert.equal(checkIn.data.recipient.device.id, deviceIds[0]);

    const futureAdmin = await create('users', {
      email: 'future-admin-c108-runtime@example.test', password: PASSWORD, passwordConfirm: PASSWORD,
      display_name: 'Admin futuro C10.8 Runtime', role: 'store_admin', status: 'active', store: store.id,
      phone: '', emailVisibility: true,
    });
    const futureDeviceToken = 'F'.repeat(43);
    const futureLogin = await request('/api/collections/users/auth-with-password', {
      headers: { [DEVICE_HEADER]: futureDeviceToken, 'User-Agent': 'Mozilla/5.0 FutureC108Device' },
      body: { identity: futureAdmin.email, password: PASSWORD },
    });
    assertStatus(futureLogin, 200, 'autorizar administrador creado después de publicar');
    const futurePortal = await request('/api/pz/admin-app/releases/portal', {
      token: futureLogin.data.token, headers: { [DEVICE_HEADER]: futureDeviceToken },
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(futurePortal, 200, 'entregar automáticamente al administrador futuro');

    const minimum = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'set_minimum', profile_id: configured.data.profile.id, version_code: 4, confirmation: 'EXIGIR VERSION 4' },
    });
    assertStatus(minimum, 200, 'activar versión mínima');

    const policy = await request('/api/pz/admin-app/releases/policy', {
      token: adminLogins[0], headers: adminHeaders,
      body: { package_name: 'com.tusenda84.admin', version_code: 3, version_name: '1.0.2' },
    });
    assertStatus(policy, 200, 'consultar obligatoriedad');
    assert.equal(policy.data.policy.update_required, true);
    assert.equal(policy.data.policy.minimum_supported_version_code, 4);

    const paused = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'pause_release', artifact_id: apk.id, confirmation: 'PAUSAR PUBLICACION MOBILE ADMIN' },
    });
    assertStatus(paused, 200, 'pausar temporalmente la publicación exacta');
    const pausedPortal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[0], headers: adminHeaders,
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(pausedPortal, 404, 'detener nuevas entregas mientras está pausada');
    const masterWhilePaused = await fetch(`${baseUrl}/api/pz/master/admin-app-artifacts/${apk.id}/${apk.file_name}`, {
      headers: { Authorization: `Bearer ${masterToken}` }, signal: AbortSignal.timeout(20_000),
    });
    assert.equal(masterWhilePaused.status, 200, 'conservar descarga de auditoría para el Master');

    const resumed = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'resume_release', artifact_id: apk.id, confirmation: 'REANUDAR PUBLICACION MOBILE ADMIN' },
    });
    assertStatus(resumed, 200, 'reanudar el mismo APK sin reconstruir');
    const resumedPortal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[0], headers: adminHeaders,
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(resumedPortal, 200, 'volver a entregar el mismo checksum');
    assert.equal(resumedPortal.data.access.artifact.sha256, apk.sha256);

    const withdrawn = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'withdraw_release', artifact_id: apk.id, confirmation: 'RETIRAR PUBLICACION MOBILE ADMIN' },
    });
    assertStatus(withdrawn, 200, 'retirar definitivamente la publicación');
    const withdrawnPortal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[0], headers: adminHeaders,
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(withdrawnPortal, 404, 'no entregar una publicación retirada');
    const withdrawnDetail = await request('/api/pz/master/admin-app-releases/detail', {
      token: masterToken, body: { channel: 'production' },
    });
    assertStatus(withdrawnDetail, 200, 'auditar publicación retirada');
    assert.equal(withdrawnDetail.data.profile.minimum_supported_version_code, 0, 'retirar elimina la obligatoriedad');

    const unknownDevicePortal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[0], headers: { [DEVICE_HEADER]: 'Z'.repeat(43) },
      body: { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' },
    });
    assertStatus(unknownDevicePortal, 409, 'rechazar un dispositivo no autorizado');

    const privateRecords = await request('/api/collections/admin_app_artifacts/records', { token: adminLogins[0] });
    assertStatus(privateRecords, 403, 'mantener colecciones privadas');
    assert.equal(master.id.length, 15);
  } finally {
    await stopPocketBase(runtime);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});
