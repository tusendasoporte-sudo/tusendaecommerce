'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const pubcfg = require('../pb_hooks/pz_promo_pubcfg_lib.js');
const theme = require('../pb_hooks/pz_promo_theme_lib.js');

const BACKEND_DIR = path.resolve(__dirname, '..');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const LOOPBACK = '127.0.0.1';
const TEMP_PREFIX = 'pz-promo-live-runtime-';

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
  let body = options.body;
  if (Object.prototype.hasOwnProperty.call(options, 'json')) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const method = options.method || (body ? 'POST' : 'GET');
  const hasAuthoritativeHost = Object.keys(headers).some((key) => key.toLowerCase() === 'host');
  let status;
  let raw;
  let responseHeaders;
  if (hasAuthoritativeHost) {
    const target = new URL(`${baseUrl}${route}`);
    const result = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode || 0,
          raw: Buffer.concat(chunks).toString('utf8'),
          headers: new Headers(response.headers),
        }));
      });
      request.on('error', reject);
      if (body) request.write(body);
      request.end();
    });
    ({ status, raw, headers: responseHeaders } = result);
  } else {
    const response = await fetch(`${baseUrl}${route}`, { method, headers, body });
    status = response.status;
    raw = await response.text();
    responseHeaders = response.headers;
  }
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status, data, raw, headers: responseHeaders };
}

function assertStatus(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(statuses.includes(result.status), `${label}: HTTP ${result.status}\n${result.raw}`);
}

function legacyPublishedDocument(name) {
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['en', 'es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    identity: { public_business_key: 'business-public' },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: 'estimate' }, media_use_keys: [],
    }],
    media_refs: {},
    contact: {
      enabled: true,
      primary_action_key: 'estimate',
      secondary_action_keys: [],
      actions: [{
        key: 'estimate', type: 'whatsapp', enabled: true,
        config: { phone_e164: '+5351234567' },
      }],
    },
    content_by_locale: {
      en: {
        identity: { name: `${name} EN`, summary: 'Public Promo identity' },
        navigation: { 'hero-main': 'Home' },
        sections: { 'hero-main': { heading: `${name} EN`, summary: 'Informational content' } },
        contact: {
          estimate: {
            label: 'Request an estimate',
            aria_label: 'Request an estimate through WhatsApp',
            message: 'Hello, I would like an estimate.',
          },
        },
        media_alt: {},
        seo: { title: `${name} EN`, description: `Public presentation of ${name}` },
      },
      es: {
        identity: { name, summary: 'Identidad pública Promo' },
        navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: name, summary: 'Contenido informativo' } },
        contact: {
          estimate: {
            label: 'Solicitar estimado',
            aria_label: 'Solicitar un estimado por WhatsApp',
            message: 'Hola, deseo un estimado.',
          },
        },
        media_alt: {},
        seo: { title: name, description: `Presentación pública de ${name}` },
      },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function liveDocument(name) {
  const document = pubcfg.upgradePromoDocument(legacyPublishedDocument(name));
  document.content_by_locale.es.identity.slogan = 'Cada espacio cuenta una historia';
  document.content_by_locale.en.identity.slogan = 'Every space tells a story';
  return document;
}

const digest = (document) => createHash('sha256').update(pubcfg.canonicalJson(document)).digest('hex');

test('gate runtime LIVE: guardado inmediato, lifecycle, temas, QR, aislamiento y fail-closed', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 240_000,
}, async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dataDirectory = path.join(temporaryRoot, 'data');
  const environment = runtimeEnvironment();
  const superEmail = 'promo-live-runtime-super@example.test';
  const superPassword = `QA-Promo-Live-${randomBytes(24).toString('base64url')}!Aa1`;
  const userPassword = `QA-Promo-Live-User-${randomBytes(24).toString('base64url')}!Aa1`;
  let runtime = null;

  try {
    assertCommand(runPocketBase(['migrate', 'up'], dataDirectory, environment), 'migrate up LIVE');
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

    async function update(collection, id, values) {
      const result = await request(`/api/collections/${collection}/records/${id}`, {
        method: 'PATCH', token: superToken, json: values,
      });
      assertStatus(result, 200, `actualizar ${collection}/${id}`);
      return result.data;
    }

    async function authenticate(email, device) {
      return request('/api/collections/users/auth-with-password', {
        headers: device ? { 'X-PZ-Admin-Device': device } : {},
        json: { identity: email, password: userPassword },
      });
    }

    const master = await create('users', {
      email: 'promo-live-master@example.test', password: userPassword, passwordConfirm: userPassword,
      display_name: 'Master LIVE', role: 'master_admin', status: 'active', phone: '', emailVisibility: true,
    });
    const masterAuth = await authenticate(master.email, 'M'.repeat(43));
    assertStatus(masterAuth, 200, 'auth Master');
    const masterToken = masterAuth.data.token;

    async function createStore(name, slug) {
      const store = await create('stores', { name, slug, status: 'active' });
      const planned = await request('/api/pz/master/store-plan/change', {
        token: masterToken,
        json: {
          store_id: store.id,
          plan: 'premium',
          is_permanent: true,
          duration_months: 0,
          reason: 'Fixture temporal LIVE',
          confirm_expiration_cleanup: false,
        },
      });
      assertStatus(planned, 200, `plan premium ${slug}`);
      return store;
    }

    async function createStoreUser(store, key, role) {
      return create('users', {
        email: `promo-live-${key}@example.test`,
        password: userPassword,
        passwordConfirm: userPassword,
        display_name: `LIVE ${key}`,
        role,
        store: store.id,
        status: 'active',
        phone: '',
        emailVisibility: true,
      });
    }

    async function assignPrimary(store, user) {
      const assigned = await request('/api/pz/master/primary-admin/assign', {
        token: masterToken,
        json: { store_id: store.id, user_id: user.id, reason: 'Principal temporal LIVE' },
      });
      assertStatus(assigned, 200, `principal ${store.slug}`);
    }

    const storeA = await createStore('Promo LIVE A', 'promo-live-a-store');
    const storeB = await createStore('Promo LIVE B', 'promo-live-b-store');
    const storeC = await createStore('Promo LIVE Lifecycle', 'promo-live-lifecycle-store');
    const commerce = await createStore('Commerce LIVE', 'commerce-live');
    const primaryA = await createStoreUser(storeA, 'primary-a', 'store_admin');
    const secondaryA = await createStoreUser(storeA, 'secondary-a', 'store_admin');
    const staffA = await createStoreUser(storeA, 'staff-a', 'store_staff');
    const commerceAdmin = await createStoreUser(commerce, 'commerce', 'store_admin');
    await assignPrimary(storeA, primaryA);

    await create('store_user_access', {
      store: storeA.id,
      user: secondaryA.id,
      template_code: 'custom',
      permissions_json: [],
      promo_permissions_json: ['promo.site.view', 'promo.content.manage'],
      promo_permissions_version: 1,
      created_by: primaryA.id,
      updated_by: primaryA.id,
    });
    await create('store_user_access', {
      store: storeA.id,
      user: staffA.id,
      template_code: 'custom',
      permissions_json: [],
      promo_permissions_json: ['promo.site.view'],
      promo_permissions_version: 1,
      created_by: primaryA.id,
      updated_by: primaryA.id,
    });
    await create('store_user_access', {
      store: commerce.id,
      user: commerceAdmin.id,
      template_code: 'custom',
      permissions_json: [],
      promo_permissions_json: ['promo.site.view', 'promo.content.manage'],
      promo_permissions_version: 1,
      created_by: commerceAdmin.id,
      updated_by: commerceAdmin.id,
    });

    const now = new Date().toISOString();
    for (const entry of Object.values(theme.THEME_REGISTRY)) {
      await create('promo_theme_releases', {
        theme_id: entry.manifest.theme_id,
        version: entry.manifest.version,
        status: 'approved',
        renderer_key: entry.manifest.renderer_key,
        contract_version: entry.manifest.contract_version,
        manifest_sha256: entry.manifest_sha256,
        token_schema_sha256: entry.token_schema_sha256,
        approved_by: master.id,
        approved_at: now,
      });
    }

    async function createPromoFixture(store, publicSlug, publicName, status, actorId) {
      const site = await create('promo_sites', {
        store: store.id,
        public_slug: publicSlug,
        status,
        contract_version: 1,
        created_by: actorId,
        updated_by: actorId,
      });
      const entitlement = await create('promo_site_entitlements', {
        site: site.id,
        source: 'contract',
        promo_site_enabled: true,
        publish_enabled: true,
        custom_domain_enabled: false,
        theme_customization_enabled: true,
        multilanguage_enabled: true,
        video_enabled: true,
        analytics_enabled: publicSlug === 'promo-live-a',
        landing_qr_bridge_enabled: false,
        max_services: 20,
        max_gallery_assets: 12,
        max_locales: 2,
        max_videos: 2,
        max_storage_bytes: 52428800,
        updated_by: actorId,
      });
      const document = liveDocument(publicName);
      const live = await create('promo_draft_documents', {
        site: site.id,
        schema_version: 1,
        document_json: document,
        version: 1,
        document_sha256: digest(document),
        created_by: actorId,
        updated_by: actorId,
      });
      const slot = await create('promo_publication_slots', {
        site: site.id,
        state: status === 'active' ? 'active' : 'unpublished',
        canonical_mode: 'platform',
        generation: status === 'active' ? 1 : 0,
        ...(status === 'active' ? { published_by: actorId, published_at: now } : {}),
      });
      return { site, entitlement, live, slot, document };
    }

    const fixtureA = await createPromoFixture(storeA, 'promo-live-a', 'Publicado A', 'active', primaryA.id);
    const fixtureB = await createPromoFixture(storeB, 'promo-live-b', 'Publicado B', 'active', master.id);
    const fixtureC = await createPromoFixture(storeC, 'promo-live-lifecycle', 'Lifecycle C', 'draft', master.id);

    const primaryAuth = await authenticate(primaryA.email, 'A'.repeat(43));
    const secondaryAuth = await authenticate(secondaryA.email, 'B'.repeat(43));
    const staffAuth = await authenticate(staffA.email, 'C'.repeat(43));
    const commerceAuth = await authenticate(commerceAdmin.email, 'D'.repeat(43));
    for (const [result, label] of [
      [primaryAuth, 'principal'], [secondaryAuth, 'secundario'], [staffAuth, 'staff'], [commerceAuth, 'Commerce'],
    ]) assertStatus(result, 200, `auth ${label}`);

    const initialPublicA = await request('/api/pz/promo/public/v1/sites/promo-live-a');
    const initialPublicB = await request('/api/pz/promo/public/v1/sites/promo-live-b');
    assertStatus(initialPublicA, 200, 'público A lee documento vivo');
    assertStatus(initialPublicB, 200, 'público B lee documento vivo');
    assert.equal(initialPublicA.data.content_by_locale.es.identity.name, 'Publicado A');
    assert.equal(initialPublicB.data.content_by_locale.es.identity.name, 'Publicado B');
    assert.equal(initialPublicA.data.content_by_locale.es.identity.slogan, 'Cada espacio cuenta una historia');
    assert.equal(initialPublicA.headers.get('cache-control').includes('no-store'), true);
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-live-lifecycle'), 404,
      'lifecycle draft permanece fuera de serving');

    const activateC = await request('/api/pz/promo/master/v1/lifecycle/update', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeC.id },
      json: {
        contract: 'promo.master.lifecycle.update.v1',
        expected_status: 'draft',
        expected_updated: fixtureC.site.updated,
        next_status: 'active',
        reason_code: 'contract_change',
      },
    });
    assertStatus(activateC, 200, `Master activa documento vivo validado\n${runtime.output()}`);
    assert.equal(activateC.data.changed, true);
    assert.equal(activateC.data.site.status, 'active');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-live-lifecycle'), 200,
      'activación Master habilita serving sin candidata');
    const suspendC = await request('/api/pz/promo/master/v1/lifecycle/update', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeC.id },
      json: {
        contract: 'promo.master.lifecycle.update.v1',
        expected_status: 'active',
        expected_updated: activateC.data.site.updated,
        next_status: 'suspended',
        reason_code: 'administrative_request',
      },
    });
    assertStatus(suspendC, 200, 'Master suspende serving con CAS');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-live-lifecycle'), 404,
      'suspensión Master falla cerrada');

    const localizedA = await request('/api/pz/promo/public/v1/sites/promo-live-a/locales/en');
    assertStatus(localizedA, 200, 'i18n explícito sirve un solo locale');
    assert.equal(localizedA.data.locale.effective, 'en');
    assert.equal(localizedA.data.content.identity.name, 'Publicado A EN');
    assert.equal(JSON.stringify(localizedA.data).includes('Identidad pública Promo'), false);
    const initialShell = await request('/api/pz/promo/public/v1/shell/sites/promo-live-a/locales/es');
    assertStatus(initialShell, 200, 'SHELL sirve canonical plataforma');
    const initialCacheKey = initialShell.headers.get('x-pz-promo-cache-key') || '';
    assert.match(initialCacheKey, /^[a-f0-9]{64}$/);
    assert.equal(initialShell.data.profile.content.identity.name, 'Publicado A');
    assertStatus(await request('/api/pz/promo/public/v1/shell/host', {
      headers: { Host: 'unknown.example.test' },
    }), 421, 'Host desconocido falla cerrado');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-live-a?store_id=attacker'), 400,
      'ruta pública rechaza tenancy inyectado');

    const liveReadBody = { contract: 'promo.live.read.v1' };
    const primaryRead = await request('/api/pz/promo/private/v1/live/read', {
      token: primaryAuth.data.token,
      json: liveReadBody,
    });
    assertStatus(primaryRead, 200, 'principal lee documento vivo');
    assert.equal(primaryRead.data.contract, 'promo.live.v1');
    assert.equal(primaryRead.data.live.version, 1);
    assert.equal(primaryRead.data.live.generation, 1);
    assert.equal(primaryRead.data.live.public_state, 'active');
    assert.equal(primaryRead.data.live.document.contract, 'promo.site.v2');
    assertStatus(await request('/api/pz/promo/private/v1/live/read', {
      token: masterToken,
      json: liveReadBody,
    }), 403, 'Master exige contexto explícito');
    const masterReadB = await request('/api/pz/promo/private/v1/live/read', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeB.id },
      json: liveReadBody,
    });
    assertStatus(masterReadB, 200, 'Master conserva contexto tenant B');
    assert.equal(masterReadB.data.live.document.content_by_locale.es.identity.name, 'Publicado B');
    assertStatus(await request('/api/pz/promo/private/v1/live/read', {
      token: staffAuth.data.token,
      json: liveReadBody,
    }), 200, 'staff con view puede leer');
    assertStatus(await request('/api/pz/promo/private/v1/live/read', {
      token: commerceAuth.data.token,
      json: liveReadBody,
    }), 404, 'Commerce no adquiere tenant Promo');

    const themeCatalog = await request('/api/pz/promo/private/v1/themes/catalog', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.theme.catalog.read.v1' },
    });
    assertStatus(themeCatalog, 200, 'catálogo privado de apariencias');
    assert.equal(themeCatalog.data.themes.length, 6);
    assert.deepEqual(themeCatalog.data.themes.map((item) => item.theme_id).sort(), [
      'promo.artisan', 'promo.black-gold', 'promo.minimal',
      'promo.portfolio', 'promo.professional', 'promo.vibrant',
    ]);

    const firstEdit = structuredClone(primaryRead.data.live.document);
    firstEdit.theme = { theme_id: 'promo.minimal', version: '1.0.0', tokens: {} };
    firstEdit.content_by_locale.es.identity.name = 'Cambio inmediato A';
    firstEdit.content_by_locale.es.sections['hero-main'].heading = 'Cambio inmediato A';
    firstEdit.content_by_locale.es.seo.title = 'Cambio inmediato A';
    firstEdit.content_by_locale.es.identity.slogan = 'Diseño que se guarda y se muestra';
    const firstUpdate = await request('/api/pz/promo/private/v1/live/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.live.update.v1', expected_version: 1, document: firstEdit },
    });
    assertStatus(firstUpdate, 200, `guardado vivo con CAS\n${runtime.output()}`);
    assert.equal(firstUpdate.data.changed, true);
    assert.equal(firstUpdate.data.live.version, 2);
    assert.equal(firstUpdate.data.live.generation, 2);
    assert.equal(firstUpdate.data.live.public_state, 'active');
    const afterFirstSave = await request('/api/pz/promo/public/v1/sites/promo-live-a');
    assertStatus(afterFirstSave, 200, 'guardado actualiza página pública automáticamente');
    assert.equal(afterFirstSave.data.content_by_locale.es.identity.name, 'Cambio inmediato A');
    assert.equal(afterFirstSave.data.content_by_locale.es.identity.slogan, 'Diseño que se guarda y se muestra');
    assert.equal(afterFirstSave.data.theme.theme_id, 'promo.minimal');
    const changedShell = await request('/api/pz/promo/public/v1/shell/sites/promo-live-a/locales/es');
    assertStatus(changedShell, 200, 'SHELL refleja guardado vivo');
    assert.notEqual(changedShell.headers.get('x-pz-promo-cache-key'), initialCacheKey,
      'generation invalida representación previa');

    const staleUpdate = await request('/api/pz/promo/private/v1/live/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.live.update.v1', expected_version: 1, document: firstEdit },
    });
    assertStatus(staleUpdate, 409, 'CAS obsoleto falla sin sobrescribir');
    assert.equal(staleUpdate.data.error, 'promo_live_conflict');
    const unchangedUpdate = await request('/api/pz/promo/private/v1/live/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.live.update.v1', expected_version: 2, document: firstEdit },
    });
    assertStatus(unchangedUpdate, 200, `guardar contenido idéntico es idempotente\n${runtime.output()}`);
    assert.equal(unchangedUpdate.data.changed, false);
    assert.equal(unchangedUpdate.data.live.generation, 2);

    const secondEdit = structuredClone(firstUpdate.data.live.document);
    secondEdit.content_by_locale.es.identity.name = 'Edición secundaria A';
    secondEdit.content_by_locale.es.sections['hero-main'].heading = 'Edición secundaria A';
    secondEdit.content_by_locale.es.seo.title = 'Edición secundaria A';
    assert.doesNotThrow(() => pubcfg.validatePromoDocument(secondEdit, { publicRevision: true }));
    const secondaryUpdate = await request('/api/pz/promo/private/v1/live/update', {
      token: secondaryAuth.data.token,
      json: { contract: 'promo.live.update.v1', expected_version: 2, document: secondEdit },
    });
    assertStatus(secondaryUpdate, 200, `secundario autorizado guarda contenido vivo\n${runtime.output()}`);
    assert.equal(secondaryUpdate.data.live.version, 3);
    assert.equal(secondaryUpdate.data.live.generation, 3);
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-live-a'))
      .data.content_by_locale.es.identity.name, 'Edición secundaria A');
    assertStatus(await request('/api/pz/promo/private/v1/live/update', {
      token: staffAuth.data.token,
      json: { contract: 'promo.live.update.v1', expected_version: 3, document: secondEdit },
    }), 403, 'staff read-only no escribe');
    assertStatus(await request('/api/pz/promo/private/v1/live/update', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.live.update.v1', expected_version: 3, document: secondEdit,
        store_id: storeB.id,
      },
    }), 400, 'body no acepta tenancy');
    assertStatus(await request('/api/pz/promo/private/v1/live/update', {
      token: primaryAuth.data.token,
      headers: { 'X-PZ-Promo-Store': storeB.id },
      json: { contract: 'promo.live.update.v1', expected_version: 3, document: secondEdit },
    }), 404, 'cabecera tenant cruzada falla cerrada');
    const unsafeHtml = structuredClone(secondEdit);
    unsafeHtml.content_by_locale.es.identity.summary = '<script>alert(1)</script>';
    assertStatus(await request('/api/pz/promo/private/v1/live/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.live.update.v1', expected_version: 3, document: unsafeHtml },
    }), 400, 'HTML/JS falla cerrado');

    fixtureA.entitlement = await update('promo_site_entitlements', fixtureA.entitlement.id, { max_locales: 1 });
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-live-a'), 404,
      'cuota reducida invalida serving sin fallback');
    fixtureA.entitlement = await update('promo_site_entitlements', fixtureA.entitlement.id, { max_locales: 2 });
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-live-a'), 200,
      'restaurar capacidad recupera el mismo documento vivo');

    const qrBytes = fs.readFileSync(path.join(
      BACKEND_DIR, '..', 'frontend-powerzona', 'public', 'brand', 'tusenda84-bazzar-logo.webp',
    ));
    const qrSha = createHash('sha256').update(qrBytes).digest('hex');
    const qrBody = new FormData();
    qrBody.append('contract', 'promo.media.upload.v1');
    qrBody.append('kind', 'image');
    qrBody.append('purpose', 'qr');
    qrBody.append('mime', 'image/webp');
    qrBody.append('sha256', qrSha);
    qrBody.append('bytes', String(qrBytes.length));
    qrBody.append('width', '512');
    qrBody.append('height', '512');
    qrBody.append('duration_ms', '0');
    qrBody.append('poster_asset_id', '');
    qrBody.append('file', new Blob([qrBytes], { type: 'image/webp' }), `${'a'.repeat(32)}.webp`);
    const qrUpload = await request('/api/pz/promo/private/v1/media/upload', {
      token: primaryAuth.data.token,
      method: 'POST',
      body: qrBody,
    });
    assertStatus(qrUpload, 201, `sube QR normalizado 512x512\n${runtime.output()}`);
    assert.equal(qrUpload.data.asset.purpose, 'qr');
    assert.deepEqual(qrUpload.data.asset.preview.variants.map((item) => item.width), [512]);
    const qrAssetId = qrUpload.data.asset.asset_id;

    const qrDocument = structuredClone(secondaryUpdate.data.live.document);
    qrDocument.contact.qr_media_use_key = 'contact_qr';
    qrDocument.media_refs.contact_qr = { asset_id: qrAssetId, purpose: 'qr' };
    qrDocument.content_by_locale.es.media_alt.contact_qr = {
      alt: 'Código QR de contacto de la tienda', decorative: false,
    };
    qrDocument.content_by_locale.en.media_alt.contact_qr = {
      alt: 'Store contact QR code', decorative: false,
    };
    assert.doesNotThrow(() => pubcfg.validatePromoDocument(qrDocument, { publicRevision: true }));
    const qrUpdate = await request('/api/pz/promo/private/v1/live/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.live.update.v1', expected_version: 3, document: qrDocument },
    });
    assertStatus(qrUpdate, 200, `guardar QR actualiza página pública\n${runtime.output()}`);
    assert.equal(qrUpdate.data.live.version, 4);
    assert.equal(qrUpdate.data.live.generation, 4);
    const publicQr = await request('/api/pz/promo/public/v1/sites/promo-live-a');
    assertStatus(publicQr, 200, 'QR disponible públicamente por referencia saneada');
    assert.equal(publicQr.data.contact.qr_media_use_key, 'contact_qr');
    const qrMedia = publicQr.data.media.find((item) => item.key === 'contact_qr');
    assert.equal(qrMedia.purpose, 'qr');
    assert.equal(JSON.stringify(qrMedia).includes(qrAssetId), false, 'proyección QR no expone asset ID');
    assertStatus(await request(qrMedia.delivery.src), 200, 'delivery QR pública exacta');
    const qrInUse = await request('/api/pz/promo/private/v1/media/retire', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.media.retire.v1', asset_id: qrAssetId, expected_status: 'ready' },
    });
    assertStatus(qrInUse, 409, 'QR vivo no puede retirarse mientras está referenciado');
    assert.equal(qrInUse.data.error, 'promo_media_in_use');

    const withoutQr = structuredClone(qrUpdate.data.live.document);
    withoutQr.contact.qr_media_use_key = '';
    delete withoutQr.media_refs.contact_qr;
    delete withoutQr.content_by_locale.es.media_alt.contact_qr;
    delete withoutQr.content_by_locale.en.media_alt.contact_qr;
    assert.doesNotThrow(() => pubcfg.validatePromoDocument(withoutQr, { publicRevision: true }));
    const removeQr = await request('/api/pz/promo/private/v1/live/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.live.update.v1', expected_version: 4, document: withoutQr },
    });
    assertStatus(removeQr, 200, `QR opcional puede retirarse del contenido vivo\n${runtime.output()}`);
    assert.equal(removeQr.data.live.version, 5);
    assert.equal(removeQr.data.live.generation, 5);
    const retiredQr = await request('/api/pz/promo/private/v1/media/retire', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.media.retire.v1', asset_id: qrAssetId, expected_status: 'ready' },
    });
    assertStatus(retiredQr, 200, 'asset QR fuera de uso puede retirarse');

    const overviewA = await request('/api/pz/promo/master/v1/overview', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeA.id },
      json: { contract: 'promo.master.overview.read.v1' },
    });
    assertStatus(overviewA, 200, `Master resume modelo vivo\n${runtime.output()}`);
    assert.equal(overviewA.data.draft.version, 5);
    assert.equal(overviewA.data.draft.readiness.state, 'ready');
    assert.equal(overviewA.data.publication.state, 'active');
    assert.equal(overviewA.data.publication.generation, 5);
    assert.deepEqual(overviewA.data.publication.controls, {});
    assert.deepEqual(overviewA.data.revisions, []);
    assert.deepEqual(overviewA.data.publication.canonical, { mode: 'platform' });
    assert.equal(overviewA.data.publication.health.state, 'healthy');
    assert.equal(overviewA.data.theme.releases.length, 6);

    const analyticsEvent = {
      contract: 'promo.analytics.collect.v1',
      event_type: 'page_view',
      event_id: '1f5a1ed2-58e3-49eb-b74e-c2c427b1b6da',
      locale: 'es',
    };
    assertStatus(await request('/api/pz/promo/public/v1/analytics/sites/promo-live-a/events', {
      json: analyticsEvent,
    }), 202, 'analytics usa generación viva sin identidad de visitante');
    assertStatus(await request('/api/pz/promo/public/v1/analytics/sites/promo-live-a/events', {
      json: { ...analyticsEvent, event_id: 'cf40b530-194f-4a83-974a-77496912e871' },
    }), 202, 'analytics acumula una segunda visita en el mismo bucket sin dimensión');
    assertStatus(await request('/api/pz/promo/public/v1/analytics/sites/promo-live-a/events', {
      json: { ...analyticsEvent, url: 'https://attacker.test/?pii=1' },
    }), 400, 'analytics rechaza URL/PII');
    assertStatus(await request('/api/pz/promo/public/v1/analytics/sites/promo-live-b/events', {
      json: { ...analyticsEvent, event_id: 'ef02538e-a75f-4b3a-b3f0-3918c48718fa' },
    }), 202, 'tenant sin analytics responde sin oráculo');
    const rawAnalytics = await request('/api/collections/promo_analytics_events/records', {
      token: superToken,
    });
    assertStatus(rawAnalytics, 200, 'superuser verifica analytics efímera');
    assert.equal(rawAnalytics.data.items.length, 2);
    assert.equal(rawAnalytics.data.items[0].site, fixtureA.site.id);
    assert.equal(rawAnalytics.data.items[0].content_generation, 5);
    assert.equal(rawAnalytics.data.items[0].revision, '');
    assert.equal(JSON.stringify(rawAnalytics.data.items).includes('attacker.test'), false);
    const dailyAnalytics = await request('/api/collections/promo_analytics_daily/records', {
      token: superToken,
    });
    assertStatus(dailyAnalytics, 200, 'superuser verifica agregado diario de analytics');
    const pageViewBuckets = dailyAnalytics.data.items.filter((item) => (
      item.site === fixtureA.site.id && item.event_type === 'page_view' && item.locale === 'es'
    ));
    assert.equal(pageViewBuckets.length, 1, 'visitas sin dimensión comparten un solo bucket diario');
    assert.equal(pageViewBuckets[0].dimension_key, '');
    assert.equal(pageViewBuckets[0].event_count, 2, 'cada apertura válida incrementa Visitas');

    const auditList = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.audit.list.v1',
        page: 1,
        per_page: 50,
        filters: { action: 'promo.content.live.update' },
      },
    });
    assertStatus(auditList, 200, 'auditoría lista guardados vivos tenant-scoped');
    assert.equal(auditList.data.events.length, 4, 'idempotencia y CAS rechazado no duplican guardados');
    const auditsRaw = await request('/api/collections/promo_audit_events/records', { token: superToken });
    assertStatus(auditsRaw, 200, 'superuser verifica auditoría saneada');
    const serializedAudit = JSON.stringify(auditsRaw.data.items);
    assert.equal(serializedAudit.includes('Edición secundaria A'), false);
    assert.equal(serializedAudit.includes('Diseño que se guarda y se muestra'), false);
    assert.equal(serializedAudit.includes(userPassword), false);

    assertStatus(await request('/api/collections/promo_draft_documents/records', {
      token: primaryAuth.data.token,
    }), [403, 404], 'REST directo del documento vivo permanece privado');
    assertStatus(await request('/api/collections/promo_media_assets/records', {
      token: primaryAuth.data.token,
    }), [403, 404], 'REST directo de medios permanece privado');
    const publicSerialized = JSON.stringify(await request('/api/pz/promo/public/v1/sites/promo-live-a'));
    for (const forbidden of [
      storeA.id, fixtureA.site.id, fixtureA.live.id, 'document_sha256', 'phone_e164',
      'permissions', 'price', 'currency', 'stock', 'cart', 'checkout',
    ]) assert.equal(publicSerialized.includes(forbidden), false, `público excluye ${forbidden}`);

    t.diagnostic('guardado vivo automático, CAS, seis apariencias y QR 512x512 verificados');
    t.diagnostic('Master lifecycle, plataforma, i18n, shell, aislamiento A/B y Host fail-closed verificados');
    t.diagnostic('analytics por generación, auditoría saneada, cuotas y REST directo cerrado verificados');
  } finally {
    await stopPocketBase(runtime);
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.ok(resolvedTemporaryRoot.startsWith(`${resolvedSystemTemp}${path.sep}`));
    fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
  }
});
