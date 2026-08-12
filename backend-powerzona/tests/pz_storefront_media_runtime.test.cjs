'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const BACKEND_DIR = path.resolve(__dirname, '..');
const DEFAULT_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const POCKETBASE_EXE = String(process.env.PZ_C04_POCKETBASE_EXE || DEFAULT_EXE);
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA',
  'base64',
);

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
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-80_000); };
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
    if (runtime.child.exitCode !== null) {
      throw new Error(`PocketBase terminó antes de iniciar.\n${runtime.output()}`);
    }
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

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || (options.body === undefined && options.json === undefined ? 'GET' : 'POST'),
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
      ...(options.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { response, status: response.status, data, raw };
}

async function authenticate(baseUrl, collection, identity, password) {
  const result = await request(baseUrl, `/api/collections/${collection}/auth-with-password`, {
    json: { identity, password },
  });
  assert.equal(result.status, 200, result.raw);
  assert.ok(result.data?.token, result.raw);
  return result.data.token;
}

test('PocketBase 0.38.2 persiste WebP público tras reinicio y restauración consistente', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 120_000,
}, async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c04-runtime-'));
  const restoreDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c04-restore-'));
  const environment = {
    ...process.env,
    PZ_STOREFRONT_INTERNAL_SECRET: 'runtime-internal-c04-abcdefghijklmnopqrstuvwxyz',
    PZ_STOREFRONT_CREDENTIAL_SECRET: 'runtime-credential-c04-abcdefghijklmnopqrstuvwxyz',
    PZ_SECURITY_HMAC_SECRET: 'runtime-security-hmac-c04-abcdefghijklmnopqrstuvwxyz',
    PZ_SECURITY_AES_KEY: '12345678901234567890123456789012',
    PZ_PUSH_RELAY_SECRET: 'runtime-relay-c04-abcdefghijklmnopqrstuvwxyz',
  };
  const superEmail = 'pz-c04-super@example.com';
  const superPassword = 'Qa-C04-super-password-2026!';
  const masterEmail = 'pz-c04-master@example.com';
  const masterPassword = 'Qa-C04-master-password-2026!';
  let runtime = null;
  let restoredRuntime = null;

  try {
    const bootstrap = spawnSync(
      POCKETBASE_EXE,
      ['superuser', 'create', superEmail, superPassword, ...runtimeFlags(dataDirectory)],
      {
        cwd: BACKEND_DIR,
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.equal(bootstrap.status, 0, `${bootstrap.stdout || ''}\n${bootstrap.stderr || ''}`);

    const firstPort = await freePort();
    const firstBaseUrl = `http://127.0.0.1:${firstPort}`;
    runtime = startPocketBase(dataDirectory, firstPort, environment);
    await waitForPocketBase(runtime, firstBaseUrl);

    const superToken = await authenticate(firstBaseUrl, '_superusers', superEmail, superPassword);
    const mediaCollection = await request(firstBaseUrl, '/api/collections/push_media', {
      token: superToken,
    });
    assert.equal(mediaCollection.status, 200, mediaCollection.raw);
    const mediaFileField = mediaCollection.data.fields.find((field) => field.name === 'file');
    const mediaBytesField = mediaCollection.data.fields.find((field) => field.name === 'bytes');
    assert.equal(mediaFileField.maxSize, 100 * 1024);
    assert.equal(mediaBytesField.max, 100 * 1024);
    const stores = await request(
      firstBaseUrl,
      `/api/collections/stores/records?filter=${encodeURIComponent('slug = "powerzona"')}&perPage=1`,
      { token: superToken },
    );
    assert.equal(stores.status, 200, stores.raw);
    assert.equal(stores.data.items.length, 1, stores.raw);
    const store = stores.data.items[0];
    assert.equal(store.plan, 'premium');

    const master = await request(firstBaseUrl, '/api/collections/users/records', {
      token: superToken,
      json: {
        email: masterEmail,
        emailVisibility: false,
        password: masterPassword,
        passwordConfirm: masterPassword,
        verified: true,
        name: 'QA C04 Master',
        role: 'master_admin',
        status: 'active',
      },
    });
    assert.ok([200, 201].includes(master.status), master.raw);
    const masterToken = await authenticate(firstBaseUrl, 'users', masterEmail, masterPassword);

    const anonymousList = await request(firstBaseUrl, '/api/collections/push_media/records');
    assert.equal(anonymousList.status, 403, anonymousList.raw);

    const sha256 = crypto.createHash('sha256').update(WEBP).digest('hex');
    const form = new FormData();
    form.append('sha256', sha256);
    form.append('width', '1');
    form.append('height', '1');
    form.append('bytes', String(WEBP.length));
    form.append('file', new Blob([WEBP], { type: 'image/webp' }), `${'a'.repeat(32)}.webp`);
    const uploaded = await request(firstBaseUrl, '/api/pz/storefront/v1/media/upload', {
      token: masterToken,
      headers: { 'X-PZ-Support-Store': store.id },
      body: form,
    });
    assert.equal(uploaded.status, 201, uploaded.raw);
    assert.equal(uploaded.data.media.sha256, sha256);
    assert.equal(uploaded.data.media.bytes, WEBP.length);
    assert.equal(
      new Date(uploaded.data.media.delete_after).getTime() - Date.now() <= 24 * 60 * 60 * 1000,
      true,
    );
    assert.equal(
      new Date(uploaded.data.media.delete_after).getTime() - Date.now() > (23 * 60 * 60 * 1000),
      true,
    );
    assert.match(uploaded.data.media.file, /^[a-f0-9]{32}_[A-Za-z0-9]+\.webp$/);

    const filePath = `/api/pz/storefront/v1/media/file/${uploaded.data.media.id}/${encodeURIComponent(uploaded.data.media.file)}`;
    const firstFile = await fetch(`${firstBaseUrl}${filePath}`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(firstFile.status, 200);
    assert.equal(firstFile.headers.get('content-type'), 'image/webp');
    assert.equal(firstFile.headers.get('cache-control'), 'public, max-age=300, must-revalidate');
    assert.deepEqual(Buffer.from(await firstFile.arrayBuffer()), WEBP);

    await stopPocketBase(runtime);
    runtime = null;

    const restartPort = await freePort();
    const restartBaseUrl = `http://127.0.0.1:${restartPort}`;
    runtime = startPocketBase(dataDirectory, restartPort, environment);
    await waitForPocketBase(runtime, restartBaseUrl);
    const afterRestart = await fetch(`${restartBaseUrl}${filePath}`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(afterRestart.status, 200);
    assert.deepEqual(Buffer.from(await afterRestart.arrayBuffer()), WEBP);
    await stopPocketBase(runtime);
    runtime = null;

    fs.cpSync(dataDirectory, restoreDirectory, { recursive: true, force: true });
    const restorePort = await freePort();
    const restoreBaseUrl = `http://127.0.0.1:${restorePort}`;
    restoredRuntime = startPocketBase(restoreDirectory, restorePort, environment);
    await waitForPocketBase(restoredRuntime, restoreBaseUrl);
    const afterRestore = await fetch(`${restoreBaseUrl}${filePath}`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(afterRestore.status, 200);
    assert.equal(afterRestore.headers.get('cache-control'), 'public, max-age=300, must-revalidate');
    assert.deepEqual(Buffer.from(await afterRestore.arrayBuffer()), WEBP);
  } finally {
    await stopPocketBase(runtime);
    await stopPocketBase(restoredRuntime);
    for (const directory of [dataDirectory, restoreDirectory]) {
      const resolved = path.resolve(directory);
      assert.equal(resolved.startsWith(path.resolve(os.tmpdir())), true);
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
});
