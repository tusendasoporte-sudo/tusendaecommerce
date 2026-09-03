'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const BACKEND_DIR = path.resolve(__dirname, '..');
const POCKETBASE_EXE = path.join(
  BACKEND_DIR,
  process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase',
);
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const LOOPBACK = '127.0.0.1';
const TEMP_PREFIX = 'pz-promo-data-runtime-';
const PROMO_MIGRATIONS = [
  '1787520000_promo_tenant_foundation.js',
  '1787520100_promo_authoring_media.js',
  '1787520200_promo_revision_publication.js',
  '1787520300_promo_audit_analytics.js',
];
const ADDITIVE_POST_DATA_MIGRATIONS = [
  '1787520400_promo_permissions.js',
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
  '1788354000_promo_theme_catalog_bootstrap.js',
];
const POST_DATA_NON_PROMO_MIGRATIONS = [
  '1787700000_storefront_private_inbox_coupon_wallet.js',
  '1788440400_storefront_resilient_installations.js',
  '1788447600_taxonomy_contract_indexes.js',
  '1788447700_store_plan_lifecycle_notifications.js',
];
const PROMO_COLLECTIONS = [
  'promo_sites',
  'promo_site_entitlements',
  'promo_theme_releases',
  'promo_domain_bindings',
  'promo_draft_documents',
  'promo_media_assets',
  'promo_revisions',
  'promo_revision_media_refs',
  'promo_publication_slots',
  'promo_publication_events',
  'promo_review_requests',
  'promo_audit_events',
  'promo_analytics_events',
  'promo_analytics_daily',
];
const EXPECTED_INDEXES = [
  'ux_promo_sites_store',
  'ux_promo_sites_public_slug',
  'ix_promo_sites_status',
  'ux_promo_entitlements_site',
  'ix_promo_entitlements_enabled_until',
  'ux_promo_theme_release',
  'ix_promo_theme_status',
  'ux_promo_domain_current_host',
  'ux_promo_domain_current_primary',
  'ix_promo_domain_lookup',
  'ix_promo_domain_site_state',
  'ux_promo_draft_site',
  'ix_promo_draft_updated',
  'ux_promo_media_site_sha',
  'ix_promo_media_site_state',
  'ix_promo_media_site_purpose',
  'ix_promo_media_poster',
  'ux_promo_revision_sequence',
  'ux_promo_revision_digest',
  'ix_promo_revision_created',
  'ix_promo_revision_theme',
  'ux_promo_revision_media_use',
  'ix_promo_revision_media_asset',
  'ix_promo_revision_media_site',
  'ux_promo_publication_site',
  'ix_promo_publication_state',
  'ix_promo_publication_revision',
  'ix_promo_publication_canonical',
  'ux_promo_publication_idempotency',
  'ix_promo_publication_events_created',
  'ix_promo_publication_generation',
  'ix_promo_publication_target',
  'ux_promo_audit_source',
  'ix_promo_audit_site_created',
  'ix_promo_audit_module_created',
  'ix_promo_audit_resource_created',
  'ux_promo_analytics_dedupe',
  'ix_promo_analytics_site_time',
  'ix_promo_analytics_type_time',
  'ix_promo_analytics_expiry',
  'ux_promo_analytics_daily_bucket',
  'ix_promo_analytics_daily_site_day',
  'ux_promo_review_request_token',
  'ix_promo_review_request_site_status',
  'ix_promo_review_request_store_status',
  'ux_promo_review_request_review',
  'ix_promo_review_request_expiry',
];
const WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA',
  'base64',
);
const MP4 = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

function runPocketBase(args, dataDirectory, environment, input) {
  return spawnSync(
    POCKETBASE_EXE,
    [...args, ...runtimeFlags(dataDirectory)],
    {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      env: environment,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      input,
    },
  );
}

function assertCommand(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} fallo (exit=${result.status}): ${result.error || ''}\n${result.stdout || ''}\n${result.stderr || ''}`,
  );
  assert.doesNotMatch(
    `${result.stdout || ''}\n${result.stderr || ''}`,
    /failed to (?:apply|revert) migration|panic:/i,
    `${label} reporto un error de migracion`,
  );
}

function sqliteValue(dataDirectory, sql) {
  const database = new DatabaseSync(path.join(dataDirectory, 'data.db'), { readOnly: true });
  try {
    return database.prepare(sql).get();
  } finally {
    database.close();
  }
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

function startPocketBase(dataDirectory, port, environment) {
  let output = '';
  let spawnError = null;
  const child = spawn(
    POCKETBASE_EXE,
    ['serve', `--http=${LOOPBACK}:${port}`, ...runtimeFlags(dataDirectory)],
    {
      cwd: BACKEND_DIR,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-100_000); };
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
      throw new Error(`PocketBase termino antes de iniciar.\n${runtime.output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch (_) {}
    await delay(150);
  }
  throw new Error(`PocketBase no quedo listo.\n${runtime.output()}`);
}

async function stopPocketBase(runtime) {
  if (!runtime || runtime.child.exitCode !== null || runtime.child.signalCode !== null) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
  if (!graceful && runtime.child.exitCode === null && runtime.child.signalCode === null) {
    runtime.child.kill('SIGKILL');
    await Promise.race([exited, delay(5000)]);
  }
}

async function apiRequest(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || (options.body === undefined && options.json === undefined ? 'GET' : 'POST'),
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
      ...(options.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw, headers: response.headers };
}

function assertStatus(result, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert.ok(allowed.includes(result.status), `${label}: status=${result.status} ${result.raw}`);
}

function assertValidation(result, code, label) {
  assertStatus(result, 400, label);
  assert.match(result.raw, new RegExp(code), `${label}: ${result.raw}`);
}

function safeRemoveTemporaryRoot(directory) {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()), `temporal fuera de alcance: ${resolved}`);
  assert.match(path.basename(resolved), /^pz-promo-data-runtime-[A-Za-z0-9_-]+$/);
  fs.rmSync(resolved, { recursive: true, force: true });
}

function formData(values, file, filename, mimeType) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  form.append('file', new Blob([file], { type: mimeType }), filename);
  return form;
}

test('gate runtime DATA: migraciones, hooks, privacidad, aislamiento, media e rollback seguro', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 300_000,
}, async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dataDirectory = path.join(temporaryRoot, 'main-data');
  const emptyRollbackDirectory = path.join(temporaryRoot, 'empty-rollback-data');
  const reviewRuntimeDirectory = path.join(temporaryRoot, 'review-runtime-data');
  const environment = runtimeEnvironment();
  const superEmail = 'promo-data-runtime-super@example.test';
  const superPassword = `QA-Promo-${randomBytes(24).toString('base64url')}!Aa1`;
  const userPassword = `QA-Promo-User-${randomBytes(24).toString('base64url')}!Aa1`;
  let runtime = null;

  try {
    const migrationNames = fs.readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d+_.+\.js$/.test(name))
      .sort();
    assert.deepEqual(
      migrationNames.filter((name) => /^\d+_promo_/.test(name)),
      [...PROMO_MIGRATIONS, ...ADDITIVE_POST_DATA_MIGRATIONS],
      'la matriz runtime DATA debe enumerar todas las migraciones Promo en orden',
    );

    const version = spawnSync(POCKETBASE_EXE, ['--version'], {
      cwd: BACKEND_DIR, encoding: 'utf8', windowsHide: true,
    });
    assertCommand(version, 'version de PocketBase');
    assert.match(version.stdout, /0\.39\.8/);

    const firstUp = runPocketBase(['migrate', 'up'], dataDirectory, environment);
    assertCommand(firstUp, 'primer migrate up efimero');
    const migrationsAfterFirstUp = sqliteValue(
      dataDirectory,
      'SELECT COUNT(*) AS count FROM `_migrations`',
    ).count;
    assert.equal(
      sqliteValue(
        dataDirectory,
        "SELECT COUNT(*) AS count FROM `_collections` WHERE `name` LIKE 'promo_%'",
      ).count,
      14,
      'el primer migrate up crea las 14 colecciones Promo',
    );
    const secondUp = runPocketBase(['migrate', 'up'], dataDirectory, environment);
    assertCommand(secondUp, 'segundo migrate up efimero');
    const migrationsAfterSecondUp = sqliteValue(
      dataDirectory,
      'SELECT COUNT(*) AS count FROM `_migrations`',
    ).count;
    assert.equal(migrationsAfterSecondUp, migrationsAfterFirstUp, 'el segundo up no duplica history');

    const emptyUp = runPocketBase(['migrate', 'up'], emptyRollbackDirectory, environment);
    assertCommand(emptyUp, 'migrate up para rollback vacio');
    const emptyDown = runPocketBase(
      ['migrate', 'down', String(
        PROMO_MIGRATIONS.length
          + ADDITIVE_POST_DATA_MIGRATIONS.length
          + POST_DATA_NON_PROMO_MIGRATIONS.length
      )],
      emptyRollbackDirectory,
      environment,
      'y\n',
    );
    assertCommand(emptyDown, 'rollback vacio de todas las migraciones Promo');
    for (const migration of [
      ...POST_DATA_NON_PROMO_MIGRATIONS,
      ...ADDITIVE_POST_DATA_MIGRATIONS,
      ...PROMO_MIGRATIONS,
    ]) {
      assert.match(emptyDown.stdout, new RegExp(`Reverted ${migration.replace('.', '\\.')}`));
    }
    assert.equal(
      sqliteValue(
        emptyRollbackDirectory,
        "SELECT COUNT(*) AS count FROM `_collections` WHERE `name` LIKE 'promo_%'",
      ).count,
      0,
      'rollback vacio elimina solo el schema Promo',
    );

    const bootstrap = runPocketBase(
      ['superuser', 'create', superEmail, superPassword],
      dataDirectory,
      environment,
    );
    assertCommand(bootstrap, 'bootstrap de superuser efimero');

    const port = await freeLoopbackPort();
    const baseUrl = `http://${LOOPBACK}:${port}`;
    runtime = startPocketBase(dataDirectory, port, environment);
    await waitForPocketBase(runtime, baseUrl);

    const request = (route, options) => apiRequest(baseUrl, route, options);
    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      json: { identity: superEmail, password: superPassword },
    });
    assertStatus(superAuth, 200, 'autenticar superuser efimero');
    const superToken = superAuth.data.token;

    async function create(collection, values) {
      const result = await request(`/api/collections/${collection}/records`, {
        token: superToken,
        json: values,
      });
      assertStatus(result, [200, 201], `crear ${collection}`);
      return result.data;
    }

    async function createMedia(values, file, filename, mimeType) {
      return request('/api/collections/promo_media_assets/records', {
        token: superToken,
        body: formData(values, file, filename, mimeType),
      });
    }

    const collectionList = await request('/api/collections?perPage=500', { token: superToken });
    assertStatus(collectionList, 200, 'listar metadata de colecciones');
    const promoMetadata = collectionList.data.items
      .filter((collection) => collection.name.startsWith('promo_'))
      .sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(
      promoMetadata.map((collection) => collection.name),
      PROMO_COLLECTIONS.slice().sort(),
    );
    for (const collection of promoMetadata) {
      for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
        assert.equal(collection[rule], null, `${collection.name}.${rule}`);
      }
      const records = await request(`/api/collections/${collection.name}/records?perPage=1`, {
        token: superToken,
      });
      assertStatus(records, 200, `comprobar cero backfill en ${collection.name}`);
      assert.equal(records.data.totalItems, 0, collection.name);
    }

    const runtimeIndexes = promoMetadata.flatMap((collection) => collection.indexes || []);
    assert.equal(runtimeIndexes.length, EXPECTED_INDEXES.length);
    for (const indexName of EXPECTED_INDEXES) {
      assert.ok(runtimeIndexes.some((sql) => sql.includes(`\`${indexName}\``)), indexName);
    }
    const mediaMetadata = promoMetadata.find((collection) => collection.name === 'promo_media_assets');
    const mediaFileField = mediaMetadata.fields.find((field) => field.name === 'file');
    const mediaPurposeField = mediaMetadata.fields.find((field) => field.name === 'purpose');
    assert.equal(mediaFileField.protected, true);
    assert.equal(mediaFileField.maxSize, 25 * 1024 * 1024);
    assert.deepEqual(mediaFileField.mimeTypes, ['image/webp', 'video/mp4', 'video/webm']);
    assert.equal(mediaPurposeField.values.includes('review'), false);
    const reviewRequestMetadata = promoMetadata.find(
      (collection) => collection.name === 'promo_review_requests',
    );
    assert.equal(reviewRequestMetadata.fields.some((field) => field.name === 'photo_assets'), false);
    assert.equal(reviewRequestMetadata.fields.some((field) => field.name === 'photo_consent'), false);
    const auditMetadata = promoMetadata.find((collection) => collection.name === 'promo_audit_events');
    const auditModuleField = auditMetadata.fields.find((field) => field.name === 'module');
    assert.ok(auditModuleField.values.includes('reviews'));
    const entitlementMetadata = promoMetadata.find(
      (collection) => collection.name === 'promo_site_entitlements',
    );
    const entitlementMax = (name) => entitlementMetadata.fields.find((field) => field.name === name).max;
    assert.equal(entitlementMax('max_services'), 50);
    assert.equal(entitlementMax('max_gallery_assets'), 300);
    assert.equal(entitlementMax('max_locales'), 10);
    assert.equal(entitlementMax('max_videos'), 3);
    assert.equal(entitlementMax('max_storage_bytes'), 250 * 1024 * 1024);

    const master = await create('users', {
      email: 'promo-data-runtime-master@example.test',
      password: userPassword,
      passwordConfirm: userPassword,
      display_name: 'Promo DATA Runtime Master',
      role: 'master_admin',
      status: 'active',
      phone: '',
      emailVisibility: true,
    });
    const storeA = await create('stores', {
      name: 'Promo DATA Runtime A',
      slug: 'promo-data-runtime-a',
      status: 'active',
      plan: 'premium',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const storeB = await create('stores', {
      name: 'Promo DATA Runtime B',
      slug: 'promo-data-runtime-b',
      status: 'active',
      plan: 'premium',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const storeAdmin = await create('users', {
      store: storeA.id,
      email: 'promo-data-runtime-admin@example.test',
      password: userPassword,
      passwordConfirm: userPassword,
      display_name: 'Promo DATA Runtime Admin',
      role: 'store_admin',
      status: 'active',
      phone: '',
      emailVisibility: true,
    });
    const masterAuth = await request('/api/collections/users/auth-with-password', {
      json: { identity: master.email, password: userPassword },
    });
    assertStatus(masterAuth, 200, 'autenticar Master regular');
    const storeAdminAuth = await request('/api/collections/users/auth-with-password', {
      headers: { 'X-PZ-Admin-Device': 'P'.repeat(43) },
      json: { identity: storeAdmin.email, password: userPassword },
    });
    assertStatus(storeAdminAuth, 200, 'autenticar Admin de tienda regular');

    for (const collection of PROMO_COLLECTIONS) {
      const query = '?perPage=5&fields=id&filter=id%20!%3D%20%22%22&sort=id&expand=site';
      assertStatus(
        await request(`/api/collections/${collection}/records${query}`),
        403,
        `API anonima cerrada para ${collection}`,
      );
      for (const [role, token] of [
        ['master_admin', masterAuth.data.token],
        ['store_admin', storeAdminAuth.data.token],
      ]) {
        assertStatus(
          await request(`/api/collections/${collection}/records${query}`, { token }),
          403,
          `API ${role} cerrada para ${collection}`,
        );
        assertStatus(
          await request(`/api/collections/${collection}/records`, { token, json: {} }),
          403,
          `create directo ${role} cerrado para ${collection}`,
        );
      }
    }

    const invalidReservedSlug = await request('/api/collections/promo_sites/records', {
      token: superToken,
      json: {
        store: storeA.id,
        public_slug: 'admin',
        status: 'draft',
        contract_version: 1,
        created_by: master.id,
        updated_by: master.id,
      },
    });
    assertValidation(invalidReservedSlug, 'invalid_promo_public_slug', 'hook de slug reservado');

    const siteA = await create('promo_sites', {
      store: storeA.id,
      public_slug: 'promo-runtime-a',
      status: 'draft',
      contract_version: 1,
      created_by: master.id,
      updated_by: master.id,
    });
    const siteB = await create('promo_sites', {
      store: storeB.id,
      public_slug: 'promo-runtime-b',
      status: 'draft',
      contract_version: 1,
      created_by: master.id,
      updated_by: master.id,
    });
    assertStatus(
      await request(`/api/collections/promo_sites/records/${siteA.id}`, {
        token: storeAdminAuth.data.token,
      }),
      403,
      'view directo de sitio cerrado',
    );
    assertStatus(
      await request(`/api/collections/promo_sites/records/${siteA.id}`, {
        token: storeAdminAuth.data.token,
        method: 'PATCH',
        json: { status: 'active' },
      }),
      403,
      'update directo de sitio cerrado',
    );
    assertStatus(
      await request(`/api/collections/promo_sites/records/${siteA.id}`, {
        token: storeAdminAuth.data.token,
        method: 'DELETE',
      }),
      403,
      'delete directo de sitio cerrado',
    );

    const invalidEntitlement = {
      site: siteB.id,
      source: 'unassigned',
      promo_site_enabled: false,
      publish_enabled: false,
      custom_domain_enabled: false,
      theme_customization_enabled: false,
      multilanguage_enabled: false,
      video_enabled: false,
      analytics_enabled: false,
      landing_qr_bridge_enabled: false,
      max_services: 0,
      max_gallery_assets: 0,
      max_locales: 0,
      max_videos: 0,
      max_storage_bytes: 0,
      updated_by: master.id,
    };
    assertValidation(
      await request('/api/collections/promo_site_entitlements/records', {
        token: superToken,
        json: { ...invalidEntitlement, promo_site_enabled: true },
      }),
      'unassigned_promo_entitlement_enabled',
      'entitlement unassigned no habilita gates',
    );
    assertStatus(
      await request('/api/collections/promo_site_entitlements/records', {
        token: superToken,
        json: { ...invalidEntitlement, source: 'contract', max_services: 51 },
      }),
      400,
      'hard ceiling de servicios',
    );
    const entitlementA = await create('promo_site_entitlements', { ...invalidEntitlement, site: siteA.id });
    const entitlementB = await create('promo_site_entitlements', invalidEntitlement);

    const bindingA = await create('promo_domain_bindings', {
      site: siteA.id,
      hostname_ascii: 'a.promo-runtime.example.test',
      hostname_display: 'a.promo-runtime.example.test',
      role: 'primary',
      status: 'active',
      is_current: true,
      verification_method: 'manual',
      state_version: 1,
      verified_by: master.id,
      verified_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
    });
    const bindingB = await create('promo_domain_bindings', {
      site: siteB.id,
      hostname_ascii: 'b.promo-runtime.example.test',
      hostname_display: 'b.promo-runtime.example.test',
      role: 'primary',
      status: 'active',
      is_current: true,
      verification_method: 'manual',
      state_version: 1,
      verified_by: master.id,
      verified_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
    });
    assertStatus(
      await request('/api/collections/promo_domain_bindings/records', {
        token: superToken,
        json: {
          site: siteB.id,
          hostname_ascii: bindingA.hostname_ascii,
          hostname_display: bindingA.hostname_ascii,
          role: 'alias',
          status: 'active',
          is_current: true,
          state_version: 1,
        },
      }),
      400,
      'indice parcial de hostname current',
    );
    assertStatus(
      await request('/api/collections/promo_domain_bindings/records', {
        token: superToken,
        json: {
          site: siteA.id,
          hostname_ascii: 'other-a.promo-runtime.example.test',
          hostname_display: 'other-a.promo-runtime.example.test',
          role: 'primary',
          status: 'active',
          is_current: true,
          state_version: 1,
        },
      }),
      400,
      'indice parcial de primary current por site',
    );

    for (const entitlement of [entitlementA, entitlementB]) {
      assertStatus(await request(`/api/collections/promo_site_entitlements/records/${entitlement.id}`, {
        token: superToken,
        method: 'PATCH',
        json: { source: 'contract', promo_site_enabled: true, custom_domain_enabled: true },
      }), 200, 'habilitar dominio solo en fixture efímera');
    }
    const domainHeadersA = { 'X-PZ-Promo-Store': storeA.id };
    const domainHeadersB = { 'X-PZ-Promo-Store': storeB.id };
    assertStatus(await request('/api/pz/promo/private/v1/domains/list', {
      token: storeAdminAuth.data.token,
      json: { contract: 'promo.domain.list.read.v1' },
    }), 403, 'Admin no recibe operaciones globales de dominio');
    assertStatus(await request('/api/pz/promo/private/v1/domains/list', {
      token: masterAuth.data.token,
      json: { contract: 'promo.domain.list.read.v1' },
    }), 403, 'Master sin contexto no gestiona dominios');
    const initialDomainList = await request('/api/pz/promo/private/v1/domains/list', {
      token: masterAuth.data.token,
      headers: domainHeadersA,
      json: { contract: 'promo.domain.list.read.v1' },
    });
    assertStatus(initialDomainList, 200, 'Master lista solo bindings de tenant A');
    assert.equal(initialDomainList.data.bindings.length, 1);
    assert.equal(initialDomainList.data.bindings[0].hostname_ascii, bindingA.hostname_ascii);
    assert.equal(JSON.stringify(initialDomainList.data).includes(siteA.id), false);
    assert.equal(JSON.stringify(initialDomainList.data).includes(storeA.id), false);

    const domainCreateBody = {
      contract: 'promo.domain.create.v1', hostname: 'DOM-Alias.Example.Test.', role: 'alias',
    };
    const domainCreated = await request('/api/pz/promo/private/v1/domains/create', {
      token: masterAuth.data.token, headers: domainHeadersA, json: domainCreateBody,
    });
    assertStatus(domainCreated, 201, 'Master crea binding pending normalizado');
    assert.equal(domainCreated.data.binding.hostname_ascii, 'dom-alias.example.test');
    assert.equal(domainCreated.data.binding.status, 'pending');
    assert.equal(domainCreated.data.binding.state_version, 1);
    const domainBindingId = domainCreated.data.binding.binding_id;
    assertStatus(await request('/api/pz/promo/private/v1/domains/create', {
      token: masterAuth.data.token,
      headers: domainHeadersA,
      json: { contract: 'promo.domain.create.v1', hostname: 'other-primary.example.test', role: 'primary' },
    }), 409, 'un sitio no registra dos primary current');
    const domainReplay = await request('/api/pz/promo/private/v1/domains/create', {
      token: masterAuth.data.token, headers: domainHeadersA, json: domainCreateBody,
    });
    assertStatus(domainReplay, 200, 'replay de create es idempotente');
    assert.equal(domainReplay.data.changed, false);
    assert.equal(domainReplay.data.binding.binding_id, domainBindingId);
    assertStatus(await request('/api/pz/promo/private/v1/domains/create', {
      token: masterAuth.data.token, headers: domainHeadersB, json: domainCreateBody,
    }), 409, 'hostname current no puede cruzarse a tenant B');
    assertStatus(await request('/api/pz/promo/private/v1/domains/verify', {
      token: masterAuth.data.token,
      headers: domainHeadersA,
      json: {
        contract: 'promo.domain.verify.v1', binding_id: domainBindingId, expected_status: 'pending',
        expected_state_version: 1, verification_method: 'dns', verification_evidence_sha256: 'raw-challenge',
      },
    }), 400, 'verificación solo admite digest, nunca challenge crudo');
    const verifyDomainBody = {
      contract: 'promo.domain.verify.v1', binding_id: domainBindingId, expected_status: 'pending',
      expected_state_version: 1, verification_method: 'dns', verification_evidence_sha256: 'd'.repeat(64),
    };
    const verifiedDomain = await request('/api/pz/promo/private/v1/domains/verify', {
      token: masterAuth.data.token,
      headers: domainHeadersA,
      json: verifyDomainBody,
    });
    assertStatus(verifiedDomain, 200, 'Master verifica con evidencia reducida a SHA-256');
    assert.equal(verifiedDomain.data.binding.status, 'verified');
    assert.equal(verifiedDomain.data.binding.state_version, 2);
    assert.equal(JSON.stringify(verifiedDomain.data).includes('d'.repeat(64)), false);
    const verifiedReplay = await request('/api/pz/promo/private/v1/domains/verify', {
      token: masterAuth.data.token, headers: domainHeadersA, json: verifyDomainBody,
    });
    assertStatus(verifiedReplay, 200, 'replay inmediato de verify es idempotente');
    assert.equal(verifiedReplay.data.changed, false);
    const updateDomain = async (expectedStatus, version, nextStatus) => request(
      '/api/pz/promo/private/v1/domains/status/update',
      {
        token: masterAuth.data.token,
        headers: domainHeadersA,
        json: {
          contract: 'promo.domain.status.update.v1', binding_id: domainBindingId,
          expected_status: expectedStatus, expected_state_version: version, next_status: nextStatus,
        },
      },
    );
    assertStatus(await updateDomain('pending', 1, 'active'), 409, 'CAS stale no activa binding');
    const activatedDomain = await updateDomain('verified', 2, 'active');
    assertStatus(activatedDomain, 200, 'alias activa solo con primary activo del mismo tenant');
    assert.equal(activatedDomain.data.binding.state_version, 3);
    const activatedReplay = await updateDomain('verified', 2, 'active');
    assertStatus(activatedReplay, 200, 'replay inmediato de transición CAS es idempotente');
    assert.equal(activatedReplay.data.changed, false);
    assertStatus(await updateDomain('active', 3, 'paused'), 200, 'Master pausa alias');
    assertStatus(await updateDomain('paused', 4, 'active'), 200, 'Master reactiva alias');
    assertStatus(await updateDomain('active', 5, 'revoked'), 200, 'Master revoca alias');
    const releasedDomain = await updateDomain('revoked', 6, 'released');
    assertStatus(releasedDomain, 200, 'Master libera hostname después de revocarlo');
    assert.equal(releasedDomain.data.binding.is_current, false);
    assert.equal(releasedDomain.data.binding.state_version, 7);
    const reusedDomain = await request('/api/pz/promo/private/v1/domains/create', {
      token: masterAuth.data.token, headers: domainHeadersA, json: domainCreateBody,
    });
    assertStatus(reusedDomain, 201, 'hostname liberado exige un row y verificación nuevos');
    assert.notEqual(reusedDomain.data.binding.binding_id, domainBindingId);
    const domainAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: masterAuth.data.token,
      headers: domainHeadersA,
      json: {
        contract: 'promo.audit.list.v1', page: 1, per_page: 50,
        filters: { module: 'domain' },
      },
    });
    assertStatus(domainAudit, 200, 'writer AUDIT lista transiciones de dominio del tenant A');
    assert.equal(domainAudit.data.events.length, 8);
    assert.equal(domainAudit.data.events.every((event) => event.module === 'domain' && event.severity === 'critical'), true);
    const domainAuditText = JSON.stringify(domainAudit.data);
    assert.equal(domainAuditText.includes('dom-alias.example.test'), false, 'AUDIT no copia hostname');
    assert.equal(domainAuditText.includes('d'.repeat(64)), false, 'AUDIT no copia evidencia');

    const readyImageAResponse = await createMedia({
      site: siteA.id,
      kind: 'image',
      purpose: 'hero',
      status: 'ready',
      mime_detected: 'image/webp',
      sha256: createHash('sha256').update('ready-image-a').digest('hex'),
      bytes: WEBP.length,
      width: 1,
      height: 1,
      duration_ms: 0,
      created_by: master.id,
      ready_at: new Date().toISOString(),
    }, WEBP, 'ready-a.webp', 'image/webp');
    assertStatus(readyImageAResponse, [200, 201], 'crear imagen ready A');
    const readyImageA = readyImageAResponse.data;
    assertValidation(
      await createMedia({
        site: siteA.id,
        kind: 'image',
        purpose: 'gallery',
        status: 'ready',
        mime_detected: 'image/webp',
        sha256: createHash('sha256').update('oversized-image-a').digest('hex'),
        bytes: (100 * 1024) + 1,
        width: 1,
        height: 1,
        duration_ms: 0,
        created_by: master.id,
      }, WEBP, 'oversized-a.webp', 'image/webp'),
      'invalid_promo_image',
      'imagen mayor de 100 KiB',
    );
    for (let index = 1; index < 300; index += 1) {
      const uploaded = await createMedia({
        site: siteA.id,
        kind: 'image',
        purpose: 'gallery',
        status: 'uploaded',
        created_by: master.id,
      }, WEBP, `image-a-${String(index).padStart(3, '0')}.webp`, 'image/webp');
      assertStatus(uploaded, [200, 201], `crear imagen ${index + 1}/300`);
    }
    assertValidation(
      await createMedia({
        site: siteA.id,
        kind: 'image',
        purpose: 'gallery',
        status: 'uploaded',
        created_by: master.id,
      }, WEBP, 'image-a-301.webp', 'image/webp'),
      'promo_image_count_exceeded',
      'imagen 301 bloqueada',
    );

    for (let index = 1; index <= 3; index += 1) {
      const uploaded = await createMedia({
        site: siteA.id,
        kind: 'video',
        purpose: 'gallery',
        status: 'uploaded',
        created_by: master.id,
      }, MP4, `video-a-${index}.mp4`, 'video/mp4');
      assertStatus(uploaded, [200, 201], `crear video ${index}/3`);
    }
    assertValidation(
      await createMedia({
        site: siteA.id,
        kind: 'video',
        purpose: 'gallery',
        status: 'uploaded',
        created_by: master.id,
      }, MP4, 'video-a-4.mp4', 'video/mp4'),
      'promo_video_count_exceeded',
      'video 4 bloqueado',
    );

    const readyImageBResponse = await createMedia({
      site: siteB.id,
      kind: 'image',
      purpose: 'hero',
      status: 'ready',
      mime_detected: 'image/webp',
      sha256: createHash('sha256').update('ready-image-b').digest('hex'),
      bytes: WEBP.length,
      width: 1,
      height: 1,
      duration_ms: 0,
      created_by: master.id,
      ready_at: new Date().toISOString(),
    }, WEBP, 'ready-b.webp', 'image/webp');
    assertStatus(readyImageBResponse, [200, 201], 'crear imagen ready B');
    const readyImageB = readyImageBResponse.data;

    const directFile = await request(
      `/api/files/promo_media_assets/${readyImageA.id}/${encodeURIComponent(readyImageA.file)}`,
    );
    assert.notEqual(directFile.status, 200, 'archivo protected no se sirve directamente');

    const theme = await create('promo_theme_releases', {
      theme_id: 'promo.runtime.black-gold',
      version: '1.0.0',
      status: 'approved',
      renderer_key: 'promo.runtime.black-gold',
      contract_version: 1,
      manifest_sha256: 'a'.repeat(64),
      token_schema_sha256: 'b'.repeat(64),
      approved_by: master.id,
      approved_at: new Date().toISOString(),
    });
    const snapshot = {
      locales: { default: 'es', published: ['es'] },
      sections: [],
      media_refs: {},
      contact: { actions: [] },
    };
    const revisionA = await create('promo_revisions', {
      site: siteA.id,
      sequence: 1,
      schema_version: 1,
      snapshot_json: snapshot,
      snapshot_sha256: createHash('sha256').update('revision-a').digest('hex'),
      theme_release: theme.id,
      default_locale: 'es',
      published_locales_json: ['es'],
      source_draft_version: 1,
      created_by: master.id,
    });
    const revisionB = await create('promo_revisions', {
      site: siteB.id,
      sequence: 1,
      schema_version: 1,
      snapshot_json: snapshot,
      snapshot_sha256: createHash('sha256').update('revision-b').digest('hex'),
      theme_release: theme.id,
      default_locale: 'es',
      published_locales_json: ['es'],
      source_draft_version: 1,
      created_by: master.id,
    });
    await create('promo_revision_media_refs', {
      site: siteA.id,
      revision: revisionA.id,
      media_asset: readyImageA.id,
      use_key: 'hero_main',
    });
    assertValidation(
      await request('/api/collections/promo_revision_media_refs/records', {
        token: superToken,
        json: {
          site: siteA.id,
          revision: revisionA.id,
          media_asset: readyImageB.id,
          use_key: 'hero_cross_tenant',
        },
      }),
      'cross_promo_site_relation',
      'media ref cross-tenant',
    );
    assertValidation(
      await request('/api/collections/promo_publication_slots/records', {
        token: superToken,
        json: {
          site: siteA.id,
          state: 'active',
          published_revision: revisionA.id,
          canonical_mode: 'custom',
          primary_binding: bindingB.id,
          generation: 1,
          published_by: master.id,
          published_at: new Date().toISOString(),
        },
      }),
      'cross_promo_site_relation',
      'slot con binding cross-tenant',
    );
    assertValidation(
      await request('/api/collections/promo_analytics_events/records', {
        token: superToken,
        json: {
          site: siteA.id,
          revision: revisionB.id,
          event_type: 'page_view',
          day: '2026-08-23',
          locale: 'es',
          theme_key: 'promo.runtime.black-gold@1.0.0',
          occurred_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }),
      'cross_promo_site_relation',
      'analytics con revision cross-tenant',
    );

    const daily = await create('promo_analytics_daily', {
      site: siteA.id,
      day: '2026-08-23',
      event_type: 'page_view',
      locale: 'es',
      theme_key: 'promo.runtime.black-gold@1.0.0',
      dimension_key: '',
      event_count: 1,
      unique_count: 1,
    });
    assert.ok(daily.id);
    assert.doesNotMatch(runtime.output(), /failed to load.*pz_promo_data|SyntaxError/i);

    await stopPocketBase(runtime);
    runtime = null;

    for (const migration of [
      ...ADDITIVE_POST_DATA_MIGRATIONS,
      ...POST_DATA_NON_PROMO_MIGRATIONS,
    ].sort().reverse()) {
      const additiveDown = runPocketBase(
        ['migrate', 'down', '1'],
        dataDirectory,
        environment,
        'y\n',
      );
      assertCommand(additiveDown, `rollback vacío de ${migration} posterior a DATA`);
      assert.match(
        additiveDown.stdout,
        new RegExp(`Reverted ${migration.replace('.', '\\.')}`),
      );
    }

    const blockedDown = runPocketBase(
      ['migrate', 'down', '1'],
      dataDirectory,
      environment,
      'y\n',
    );
    assert.match(
      `${blockedDown.stdout || ''}\n${blockedDown.stderr || ''}`,
      /unsafe_rollback_promo_data/,
    );
    assert.equal(
      sqliteValue(
        dataDirectory,
        "SELECT COUNT(*) AS count FROM `_collections` WHERE `name` LIKE 'promo_%'",
      ).count,
      13,
      'rollback bloqueado conserva las 13 colecciones',
    );
    assert.equal(
      sqliteValue(dataDirectory, 'SELECT COUNT(*) AS count FROM `promo_analytics_daily`').count,
      1,
      'rollback bloqueado conserva los datos',
    );

    const reviewUp = runPocketBase(['migrate', 'up'], reviewRuntimeDirectory, environment);
    assertCommand(reviewUp, 'migrate up efímero para moderación de reseñas');
    const reviewSuperEmail = 'promo-review-runtime-super@example.test';
    const reviewSuperPassword = `QA-Promo-Review-${randomBytes(24).toString('base64url')}!Aa1`;
    const reviewUserPassword = `QA-Promo-Review-User-${randomBytes(24).toString('base64url')}!Aa1`;
    assertCommand(runPocketBase(
      ['superuser', 'create', reviewSuperEmail, reviewSuperPassword],
      reviewRuntimeDirectory,
      environment,
    ), 'bootstrap superuser efímero para moderación');
    const reviewPort = await freeLoopbackPort();
    const reviewBaseUrl = `http://${LOOPBACK}:${reviewPort}`;
    runtime = startPocketBase(reviewRuntimeDirectory, reviewPort, environment);
    await waitForPocketBase(runtime, reviewBaseUrl);
    const reviewRequest = (route, options) => apiRequest(reviewBaseUrl, route, options);
    const reviewSuperAuth = await reviewRequest('/api/collections/_superusers/auth-with-password', {
      json: { identity: reviewSuperEmail, password: reviewSuperPassword },
    });
    assertStatus(reviewSuperAuth, 200, 'autenticar superuser efímero para moderación');
    const reviewSuperToken = reviewSuperAuth.data.token;
    const reviewCreate = async (collection, values) => {
      const result = await reviewRequest(`/api/collections/${collection}/records`, {
        token: reviewSuperToken,
        json: values,
      });
      assertStatus(result, [200, 201], `crear ${collection} para moderación`);
      return result.data;
    };
    const reviewMaster = await reviewCreate('users', {
      email: 'promo-review-runtime-master@example.test',
      password: reviewUserPassword,
      passwordConfirm: reviewUserPassword,
      display_name: 'Promo Review Runtime Master',
      role: 'master_admin',
      status: 'active',
      phone: '',
      emailVisibility: true,
    });
    const reviewStore = await reviewCreate('stores', {
      name: 'Promo Review Runtime',
      slug: 'promo-review-runtime',
      status: 'active',
      plan: 'premium',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const reviewSite = await reviewCreate('promo_sites', {
      store: reviewStore.id,
      public_slug: 'promo-review-runtime',
      status: 'active',
      contract_version: 1,
      created_by: reviewMaster.id,
      updated_by: reviewMaster.id,
    });
    await reviewCreate('promo_site_entitlements', {
      site: reviewSite.id,
      source: 'contract',
      promo_site_enabled: true,
      publish_enabled: true,
      custom_domain_enabled: false,
      theme_customization_enabled: true,
      multilanguage_enabled: true,
      video_enabled: true,
      analytics_enabled: true,
      landing_qr_bridge_enabled: true,
      max_services: 20,
      max_gallery_assets: 150,
      max_locales: 2,
      max_videos: 3,
      max_storage_bytes: 262144000,
      updated_by: reviewMaster.id,
    });
    const pendingReview = await reviewCreate('reviews', {
      store: reviewStore.id,
      type: 'store',
      rating: 5,
      customer_name: 'Ana',
      comment: 'good',
      status: 'pending',
      source: 'public_store',
      verified_purchase: false,
      featured: false,
      approved_at: '',
    });
    const reviewMasterAuth = await reviewRequest('/api/collections/users/auth-with-password', {
      json: { identity: reviewMaster.email, password: reviewUserPassword },
    });
    assertStatus(reviewMasterAuth, 200, 'autenticar Master efímero para moderación');
    const privateReviewRequest = await reviewRequest('/api/pz/promo/private/v1/reviews/requests/create', {
      token: reviewMasterAuth.data.token,
      headers: { 'X-PZ-Promo-Store': reviewStore.id },
      json: {
        contract: 'promo.review-requests.create.v2',
        locale: 'es',
        customer_label: '',
        work_label: 'Solicitud sin fotos creada por soporte Master',
        expires_days: 30,
      },
    });
    assertStatus(privateReviewRequest, 201, 'Master crea solicitud de reseña sin fotos');
    assert.equal(privateReviewRequest.data.contract, 'promo.review-requests.created.v2');
    assert.match(privateReviewRequest.data.token, /^[A-Za-z0-9_-]{43,96}$/);
    assert.equal(privateReviewRequest.data.request.shareable, true);
    const storedReviewSecret = sqliteValue(
      reviewRuntimeDirectory,
      `SELECT token_sha256, token_encrypted FROM promo_review_requests WHERE id = '${privateReviewRequest.data.request.id}'`,
    );
    assert.equal(storedReviewSecret.token_sha256, createHash('sha256').update(privateReviewRequest.data.token).digest('hex'));
    assert.notEqual(storedReviewSecret.token_encrypted, privateReviewRequest.data.token);
    assert.equal(String(storedReviewSecret.token_encrypted || '').includes(privateReviewRequest.data.token), false);
    const listedReviewRequests = await reviewRequest('/api/pz/promo/private/v1/reviews/requests/list', {
      token: reviewMasterAuth.data.token,
      headers: { 'X-PZ-Promo-Store': reviewStore.id },
      json: { contract: 'promo.review-requests.list.v2', page: 1 },
    });
    assertStatus(listedReviewRequests, 200, 'listado privado indica disponibilidad sin exponer secretos');
    assert.equal(listedReviewRequests.data.requests[0].shareable, true);
    assert.equal(listedReviewRequests.raw.includes(privateReviewRequest.data.token), false);
    assert.equal(listedReviewRequests.raw.includes(storedReviewSecret.token_encrypted), false);
    const revealedReviewRequest = await reviewRequest('/api/pz/promo/private/v1/reviews/requests/reveal', {
      token: reviewMasterAuth.data.token,
      headers: { 'X-PZ-Promo-Store': reviewStore.id },
      json: {
        contract: 'promo.review-requests.reveal.v1',
        request_id: privateReviewRequest.data.request.id,
      },
    });
    assertStatus(revealedReviewRequest, 200, 'Master recupera solicitud cifrada sin exponerla en listado');
    assert.equal(revealedReviewRequest.data.token, privateReviewRequest.data.token);
    const deletedReviewRequest = await reviewRequest('/api/pz/promo/private/v1/reviews/requests/delete', {
      token: reviewMasterAuth.data.token,
      headers: { 'X-PZ-Promo-Store': reviewStore.id },
      json: {
        contract: 'promo.review-requests.delete.v1',
        request_id: privateReviewRequest.data.request.id,
      },
    });
    assertStatus(deletedReviewRequest, 200, 'Master elimina físicamente solicitud de reseña');
    assert.equal(deletedReviewRequest.data.request_id, privateReviewRequest.data.request.id);
    const deletedRequestRow = await reviewRequest(
      `/api/collections/promo_review_requests/records/${privateReviewRequest.data.request.id}`,
      { token: reviewSuperToken },
    );
    assertStatus(deletedRequestRow, 404, 'solicitud eliminada ya no existe en PocketBase');
    const moderatedReview = await reviewRequest('/api/pz/promo/private/v1/reviews/moderate', {
      token: reviewMasterAuth.data.token,
      headers: { 'X-PZ-Promo-Store': reviewStore.id },
      json: {
        contract: 'promo.reviews.moderate.v1',
        review_id: pendingReview.id,
        action: 'approve',
        expected_updated: pendingReview.updated,
      },
    });
    assertStatus(moderatedReview, 200, 'Master aprueba reseña Promo con auditoría reviews');
    assert.equal(moderatedReview.data.review.status, 'approved');
    const reviewAuditRows = await reviewRequest(
      '/api/collections/promo_audit_events/records?perPage=5&filter=module%3D%22reviews%22',
      { token: reviewSuperToken },
    );
    assertStatus(reviewAuditRows, 200, 'superuser verifica auditoría de aprobación Promo');
    assert.equal(reviewAuditRows.data.totalItems, 4);
    assert.deepEqual(reviewAuditRows.data.items.map((event) => event.action).sort(), [
      'promo.reviews.moderate',
      'promo.reviews.request.create',
      'promo.reviews.request.delete',
      'promo.reviews.request.reveal',
    ]);
    await stopPocketBase(runtime);
    runtime = null;

    t.diagnostic(`PocketBase ${version.stdout.trim().replace(/^pocketbase(?:\.exe)?\s+version\s+/i, '')}`);
    t.diagnostic(`migrate up idempotente: ${migrationsAfterFirstUp} entradas sin duplicados`);
    t.diagnostic(`colecciones Promo privadas: ${promoMetadata.length}; indices: ${runtimeIndexes.length}`);
    t.diagnostic('aislamiento A/B, 300/301 imágenes, 3/4 videos y API directa negativa verificados');
    t.diagnostic('moderación de reseña y auditoría reviews verificadas en PocketBase efímero');
    t.diagnostic('rollback vacio aplicado; rollback con datos abortado sin perdida');
  } finally {
    await stopPocketBase(runtime);
    safeRemoveTemporaryRoot(temporaryRoot);
  }
});
