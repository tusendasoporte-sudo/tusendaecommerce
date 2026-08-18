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
const RUNNER_SECRET = 'c108-runtime-runner-secret-abcdefghijklmnopqrstuvwxyz';
const SIGNING_CERT = `${'11:'.repeat(31)}11`;
const PASSWORD = 'Qa-C108-runtime-password-2026!';
const DEVICE_HEADER = 'X-PZ-Admin-Device';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

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

test('runtime C10.8 completa custodia, piloto, oleadas, ticket y obligatoriedad sin servicios externos', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 90_000,
}, async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c108-runtime-'));
  const environment = { ...process.env, PZ_ADMIN_APP_RUNNER_SECRET: RUNNER_SECRET };
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

    const anonymous = await request('/api/pz/master/admin-app-releases/detail', { body: { channel: 'staging' } });
    assert.ok([401, 403].includes(anonymous.status));

    const configured = await request('/api/pz/master/admin-app-releases/configure', {
      token: masterToken,
      body: {
        channel: 'staging', display_name: 'Tu Senda 84 Admin', package_name: 'com.tusenda84.admin',
        admin_url: 'https://tusenda84.com/admin', firebase_project_id: '', firebase_app_id: '',
        signing_cert_sha256: SIGNING_CERT, current_version_code: 3, current_version_name: '1.0.2',
        confirmation: 'CONFIGURAR MOBILE ADMIN',
      },
    });
    assertStatus(configured, 200, 'configurar identidad C10.8');

    const preview = await request('/api/pz/master/admin-app-releases/preview', {
      token: masterToken, body: { channel: 'staging', version_code: 4, version_name: '1.0.3' },
    });
    assertStatus(preview, 201, 'crear preview C10.8');
    const confirmed = await request('/api/pz/master/admin-app-releases/confirm', {
      token: masterToken,
      body: { job_id: preview.data.job.id, preview_hash: preview.data.job.preview_hash, confirmation: 'CONFIRMAR BUILD MOBILE ADMIN' },
    });
    assertStatus(confirmed, 200, 'confirmar build C10.8');

    const runnerHeaders = {
      'x-pz-admin-app-runner': RUNNER_SECRET,
      'x-pz-admin-app-runner-id': 'runtime-c108',
    };
    const claimed = await request('/api/pz/internal/admin-app-builds/claim', {
      headers: runnerHeaders, body: { runner_id: 'runtime-c108' },
    });
    assertStatus(claimed, 200, 'reclamar build C10.8');
    assert.equal(claimed.data.job.id, preview.data.job.id);

    const fixtures = [
      ['apk', 'mobile-admin-1.0.3-4.apk', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x43, 0x31, 0x30, 0x38])],
      ['checksums', 'SHA256SUMS.txt', Buffer.from('checksum runtime c108\n')],
      ['instructions', 'INSTRUCCIONES.txt', Buffer.from('instalar sin desinstalar\n')],
      ['build_manifest', 'build-manifest.json', Buffer.from('{"schema_version":1}')],
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
        artifacts: fixtures.map((fixture) => ({
          kind: fixture.kind, file_name: fixture.fileName, sha256: fixture.sha256, bytes: fixture.bytes.length,
        })),
      },
    });
    assertStatus(completed, 200, 'completar build C10.8');

    const detail = await request('/api/pz/master/admin-app-releases/detail', {
      token: masterToken, body: { channel: 'staging' },
    });
    assertStatus(detail, 200, 'consultar inventario C10.8');
    const apk = detail.data.artifacts.find((item) => item.kind === 'apk');
    assert.ok(apk?.stored && apk.lifecycle_status === 'available');

    const assign = async (deviceId, stage, wave) => request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'assign', artifact_id: apk.id, user_id: admin.id, device_id: deviceId, stage, wave },
    });
    const pilot = await assign(deviceIds[0], 'pilot', 0);
    assert.equal(pilot.status, 200, `asignar piloto: ${pilot.raw}\n${runtime.output()}`);
    assert.match(pilot.data.grant, /^[A-Za-z0-9_-]{43}$/);

    const adminHeaders = { [DEVICE_HEADER]: deviceTokens[0] };
    const portal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[0], headers: adminHeaders, body: { grant: pilot.data.grant },
    });
    assertStatus(portal, 200, 'abrir portal autenticado');
    assert.equal(portal.data.access.assignment.device.id, deviceIds[0]);

    const ticket = await request('/api/pz/admin-app/releases/ticket', {
      token: adminLogins[0], headers: adminHeaders, body: { grant: pilot.data.grant },
    });
    assertStatus(ticket, 201, 'crear ticket de un uso');
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
    assertStatus(checkIn, 200, 'registrar instalación piloto');
    const validatePilot = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: { action: 'validate_pilot', assignment_id: pilot.data.assignment.id, confirmation: 'VALIDAR PILOTO MOBILE ADMIN' },
    });
    assertStatus(validatePilot, 200, 'validar piloto');

    assertStatus(await assign(deviceIds[1], 'gradual', 1), 200, 'abrir oleada gradual');
    assertStatus(await assign(deviceIds[2], 'general', 2), 200, 'abrir publicación general');
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

    const revoke = await request('/api/pz/master/admin-app-releases/action', {
      token: masterToken,
      body: {
        action: 'revoke_assignment', assignment_id: pilot.data.assignment.id,
        reason: 'Fin de fixture runtime C10.8', confirmation: 'REVOCAR ENTREGA MOBILE ADMIN',
      },
    });
    assertStatus(revoke, 200, 'revocar piloto temporal');
    const revokedPortal = await request('/api/pz/admin-app/releases/portal', {
      token: adminLogins[0], headers: adminHeaders, body: { grant: pilot.data.grant },
    });
    assertStatus(revokedPortal, 404, 'cerrar grant revocado');

    const privateRecords = await request('/api/collections/admin_app_artifacts/records', { token: adminLogins[0] });
    assertStatus(privateRecords, 403, 'mantener colecciones privadas');
    assert.equal(master.id.length, 15);
  } finally {
    await stopPocketBase(runtime);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});
