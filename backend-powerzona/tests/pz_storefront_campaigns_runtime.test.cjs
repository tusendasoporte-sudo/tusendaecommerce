'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const BACKEND_DIR = path.resolve(__dirname, '..');
const DEFAULT_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const POCKETBASE_EXE = String(process.env.PZ_C05_POCKETBASE_EXE || DEFAULT_EXE);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('imagen del backend incluye la base IANA usada por America/Havana', () => {
  const dockerfile = fs.readFileSync(path.join(BACKEND_DIR, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /apk add --no-cache[^\n]*\btzdata\b/);
});

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

function flags(dataDirectory) {
  return [
    `--dir=${dataDirectory}`,
    `--hooksDir=${path.join(BACKEND_DIR, 'pb_hooks')}`,
    `--migrationsDir=${path.join(BACKEND_DIR, 'pb_migrations')}`,
    '--hooksWatch=false', '--hooksPool=2', '--automigrate=true', '--indexFallback=false',
  ];
}

function start(dataDirectory, port, environment) {
  let output = '';
  const child = spawn(POCKETBASE_EXE, ['serve', `--http=127.0.0.1:${port}`, ...flags(dataDirectory)], {
    cwd: BACKEND_DIR, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-80_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  return { child, output: () => output };
}

async function stop(runtime) {
  if (!runtime || runtime.child.exitCode !== null || runtime.child.signalCode !== null) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  if (!await Promise.race([exited.then(() => true), sleep(5000).then(() => false)])) {
    runtime.child.kill('SIGKILL');
    await Promise.race([exited, sleep(5000)]);
  }
}

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.json === undefined ? 'GET' : 'POST',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
      ...(options.json === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw };
}

async function authenticate(baseUrl, collection, identity, password) {
  const result = await request(baseUrl, `/api/collections/${collection}/auth-with-password`, {
    json: { identity, password },
  });
  assert.equal(result.status, 200, result.raw);
  return result.data.token;
}

test('PocketBase 0.38.2 acepta zona IANA al crear un borrador C05', {
  skip: !fs.existsSync(POCKETBASE_EXE), timeout: 90_000,
}, async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c05-runtime-'));
  const environment = {
    ...process.env,
    PZ_STOREFRONT_INTERNAL_SECRET: 'runtime-internal-c05-abcdefghijklmnopqrstuvwxyz',
    PZ_STOREFRONT_CREDENTIAL_SECRET: 'runtime-credential-c05-abcdefghijklmnopqrstuvwxyz',
    PZ_SECURITY_HMAC_SECRET: 'runtime-security-hmac-c05-abcdefghijklmnopqrstuvwxyz',
    PZ_SECURITY_AES_KEY: '12345678901234567890123456789012',
    PZ_PUSH_RELAY_SECRET: 'runtime-admin-relay-c05-abcdefghijklmnopqrstuvwxyz',
    PZ_STOREFRONT_PUSH_RELAY_URL: 'https://runtime-c05.example.com/api/internal/push/v2/send',
    PZ_STOREFRONT_PUSH_RELAY_SECRET: 'runtime-storefront-relay-c05-abcdefghijklmnopqrstuvwxyz',
  };
  const superEmail = 'pz-c05-super@example.com';
  const superPassword = 'Qa-C05-super-password-2026!';
  const masterEmail = 'pz-c05-master@example.com';
  const masterPassword = 'Qa-C05-master-password-2026!';
  let runtime = null;
  try {
    const bootstrap = spawnSync(POCKETBASE_EXE, ['superuser', 'create', superEmail, superPassword, ...flags(dataDirectory)], {
      cwd: BACKEND_DIR, env: environment, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(bootstrap.status, 0, `${bootstrap.stdout || ''}\n${bootstrap.stderr || ''}`);
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    runtime = start(dataDirectory, port, environment);
    for (let index = 0; index < 200; index += 1) {
      try {
        if ((await request(baseUrl, '/api/health')).status === 200) break;
      } catch (_) {}
      if (runtime.child.exitCode !== null) throw new Error(runtime.output());
      await sleep(100);
    }
    const superToken = await authenticate(baseUrl, '_superusers', superEmail, superPassword);
    const stores = await request(baseUrl, `/api/collections/stores/records?filter=${encodeURIComponent('slug = "powerzona"')}&perPage=1`, { token: superToken });
    assert.equal(stores.status, 200, stores.raw);
    const store = stores.data.items[0];
    const appConfig = await request(baseUrl, '/api/collections/storefront_app_configs/records', {
      token: superToken,
      json: {
        store: store.id,
        app_key: 'powerzona_runtime_c05',
        display_name: 'PowerZona Runtime C05',
        package_name: 'com.tusenda84.powerzona.runtimec05',
        firebase_app_id: '1:123456789012:android:abcdef0123456789',
        public_origin: 'https://runtime-c05.example.com',
        store_path_prefix: '/t/powerzona',
        status: 'active',
      },
    });
    assert.ok([200, 201].includes(appConfig.status), appConfig.raw);
    const master = await request(baseUrl, '/api/collections/users/records', {
      token: superToken,
      json: {
        email: masterEmail, emailVisibility: false, password: masterPassword,
        passwordConfirm: masterPassword, verified: true, name: 'QA C05 Master',
        role: 'master_admin', status: 'active',
      },
    });
    assert.ok([200, 201].includes(master.status), master.raw);
    const masterToken = await authenticate(baseUrl, 'users', masterEmail, masterPassword);
    const newAudiencePreview = await request(baseUrl, '/api/pz/storefront/v1/campaigns/audience-preview', {
      token: masterToken,
      headers: { 'X-PZ-Support-Store': store.id },
      json: { audience_type: 'all_active', audience_config: {}, target_type: 'home' },
    });
    assert.equal(newAudiencePreview.status, 200, newAudiencePreview.raw);
    assert.deepEqual(newAudiencePreview.data.audience, { count: 0, snapshot: false });
    const saved = await request(baseUrl, '/api/pz/storefront/v1/campaigns/save', {
      token: masterToken,
      headers: { 'X-PZ-Support-Store': store.id },
      json: {
        title: 'Runtime C05', body: 'Validación IANA PocketBase 0.38.2',
        timezone: 'America/Havana', audience_type: 'all_active', audience_config: {}, target_type: 'home',
      },
    });
    assert.equal(saved.status, 201, saved.raw);
    assert.equal(saved.data.campaign.status, 'draft');
    assert.equal(saved.data.campaign.timezone, 'America/Havana');
    const preview = await request(baseUrl, '/api/pz/storefront/v1/campaigns/audience-preview', {
      token: masterToken,
      headers: { 'X-PZ-Support-Store': store.id },
      json: { campaign_id: saved.data.campaign.id },
    });
    assert.equal(preview.status, 200, preview.raw);
    assert.equal(preview.data.audience.count, 0);
    const versionSaved = await request(baseUrl, '/api/pz/storefront/v1/campaigns/save', {
      token: masterToken,
      headers: { 'X-PZ-Support-Store': store.id },
      json: {
        title: 'Runtime C05 app version', body: 'Validación JSON PocketBase 0.38.2',
        timezone: 'America/Havana', audience_type: 'app_version',
        audience_config: { app_version_code: 1 }, target_type: 'home',
      },
    });
    assert.equal(versionSaved.status, 201, versionSaved.raw);
    const versionPreview = await request(baseUrl, '/api/pz/storefront/v1/campaigns/audience-preview', {
      token: masterToken,
      headers: { 'X-PZ-Support-Store': store.id },
      json: { campaign_id: versionSaved.data.campaign.id },
    });
    assert.equal(versionPreview.status, 200, versionPreview.raw);
    assert.equal(versionPreview.data.audience.count, 0);

    const started = await request(baseUrl, '/api/pz/storefront/v1/campaigns/schedule', {
      token: masterToken,
      headers: { 'X-PZ-Support-Store': store.id },
      json: { campaign_id: saved.data.campaign.id, mode: 'now' },
    });
    assert.equal(started.status, 200, started.raw);
    assert.equal(started.data.campaign.status, 'failed');
    assert.equal(started.data.campaign.failure_code, 'no_eligible_installations');
    assert.notEqual(started.data.campaign.started_at, '');

    const rawCampaign = await request(
      baseUrl,
      `/api/collections/push_campaigns/records/${saved.data.campaign.id}`,
      { token: superToken },
    );
    assert.equal(rawCampaign.status, 200, rawCampaign.raw);
    const completedAt = new Date(rawCampaign.data.completed_at).getTime();
    const deleteAfter = new Date(rawCampaign.data.delete_after).getTime();
    assert.equal(deleteAfter - completedAt, 7 * 86_400_000);

    const listed = await request(baseUrl, '/api/pz/storefront/v1/campaigns', {
      token: masterToken,
      headers: { 'X-PZ-Support-Store': store.id },
    });
    assert.equal(listed.status, 200, listed.raw);
    assert.equal(listed.data.quota_timezone, 'America/Havana');
  } finally {
    await stop(runtime);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});
