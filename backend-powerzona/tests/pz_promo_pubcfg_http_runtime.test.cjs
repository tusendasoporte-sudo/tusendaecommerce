'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const pubcfg = require('../pb_hooks/pz_promo_pubcfg_lib.js');

const BACKEND_DIR = path.resolve(__dirname, '..');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
const LOOPBACK = '127.0.0.1';
const TEMP_PREFIX = 'pz-promo-pubcfg-runtime-';

function runtimeEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/TOKEN|SECRET|PASSWORD|CLOUDFLARE|COOLIFY|POCKETBASE_URL|PB_URL/i.test(key)) delete environment[key];
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

function runPocketBase(args, dataDirectory, environment) {
  return spawnSync(POCKETBASE_EXE, [...args, ...runtimeFlags(dataDirectory)], {
    cwd: BACKEND_DIR, encoding: 'utf8', env: environment, timeout: 120_000, windowsHide: true,
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
  const child = spawn(POCKETBASE_EXE, ['serve', `--http=${LOOPBACK}:${port}`, ...runtimeFlags(dataDirectory)], {
    cwd: BACKEND_DIR, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
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
    method: options.method || (body ? 'POST' : 'GET'), headers, body,
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw, headers: response.headers };
}

function assertStatus(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(statuses.includes(result.status), `${label}: HTTP ${result.status}\n${result.raw}`);
}

function emptyDraft() {
  return {
    contract: 'promo.site.v1', system_catalog_version: 'promo.system.v1',
    locales: { default: '', published: [] }, theme: { theme_id: '', version: '', tokens: {} },
    identity: { public_business_key: '' }, section_order: [], sections: [], media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {},
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function publishedDocument(name, themeVersion = '1.0.0') {
  return {
    contract: 'promo.site.v1', system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['en', 'es'] },
    theme: { theme_id: 'promo.aladdin.black-gold', version: themeVersion, tokens: {} },
    identity: { public_business_key: 'business-public' },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: '' }, media_use_keys: [],
    }],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {
      en: {
        identity: { name: `${name} EN`, summary: 'Public Promo identity' },
        navigation: { 'hero-main': 'Home' },
        sections: { 'hero-main': { heading: `${name} EN`, summary: 'Informational content' } },
        contact: {}, media_alt: {}, seo: { title: `${name} EN`, description: `Public presentation of ${name}` },
      },
      es: {
        identity: { name, summary: 'Identidad pública Promo' },
        navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: name, summary: 'Contenido informativo' } },
        contact: {}, media_alt: {}, seo: { title: name, description: `Presentación pública de ${name}` },
      },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

const digest = (document) => createHash('sha256').update(pubcfg.canonicalJson(document)).digest('hex');

test('gate runtime PUBCFG: proyección publicada allowlisted, actores, CAS, aislamiento y REST cerrado', {
  skip: !fs.existsSync(POCKETBASE_EXE), timeout: 240_000,
}, async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dataDirectory = path.join(temporaryRoot, 'data');
  const environment = runtimeEnvironment();
  const superEmail = 'promo-pubcfg-super@example.test';
  const superPassword = `QA-Promo-Pubcfg-${randomBytes(24).toString('base64url')}!Aa1`;
  const userPassword = `QA-Promo-Pubcfg-User-${randomBytes(24).toString('base64url')}!Aa1`;
  let runtime = null;

  try {
    assertCommand(runPocketBase(['migrate', 'up'], dataDirectory, environment), 'migrate up PUBCFG');
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
      const result = await request(`/api/collections/${collection}/records`, { token: superToken, json: values });
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
      email: 'promo-pubcfg-master@example.test', password: userPassword, passwordConfirm: userPassword,
      display_name: 'Master PUBCFG', role: 'master_admin', status: 'active', phone: '', emailVisibility: true,
    });
    const masterAuth = await authenticate(master.email, 'M'.repeat(43));
    assertStatus(masterAuth, 200, 'auth Master');
    const masterToken = masterAuth.data.token;

    async function createStore(name, slug) {
      const store = await create('stores', { name, slug, status: 'active' });
      const planned = await request('/api/pz/master/store-plan/change', {
        token: masterToken,
        json: {
          store_id: store.id, plan: 'premium', is_permanent: true, duration_months: 0,
          reason: 'Fixture temporal PUBCFG', confirm_expiration_cleanup: false,
        },
      });
      assertStatus(planned, 200, `plan premium ${slug}`);
      return store;
    }

    async function createStoreUser(store, key, role, status = 'active') {
      return create('users', {
        email: `promo-pubcfg-${key}@example.test`, password: userPassword, passwordConfirm: userPassword,
        display_name: `PUBCFG ${key}`, role, store: store.id, status, phone: '', emailVisibility: true,
      });
    }

    async function assignPrimary(store, user) {
      const assigned = await request('/api/pz/master/primary-admin/assign', {
        token: masterToken,
        json: { store_id: store.id, user_id: user.id, reason: 'Principal temporal PUBCFG' },
      });
      assertStatus(assigned, 200, `principal ${store.slug}`);
    }

    const storeA = await createStore('Promo PUBCFG A', 'promo-pubcfg-a-store');
    const storeB = await createStore('Promo PUBCFG B', 'promo-pubcfg-b-store');
    const commerce = await createStore('Commerce PUBCFG', 'commerce-pubcfg');
    const primaryA = await createStoreUser(storeA, 'primary-a', 'store_admin');
    const secondaryA = await createStoreUser(storeA, 'secondary-a', 'store_admin');
    const staffA = await createStoreUser(storeA, 'staff-a', 'store_staff');
    const suspendedA = await createStoreUser(storeA, 'suspended-a', 'store_staff');
    const commerceAdmin = await createStoreUser(commerce, 'commerce', 'store_admin');
    await assignPrimary(storeA, primaryA);

    await create('store_user_access', {
      store: storeA.id, user: secondaryA.id, template_code: 'custom', permissions_json: [],
      promo_permissions_json: ['promo.site.view', 'promo.content.manage'], promo_permissions_version: 1,
      created_by: primaryA.id, updated_by: primaryA.id,
    });
    await create('store_user_access', {
      store: storeA.id, user: staffA.id, template_code: 'custom', permissions_json: [],
      promo_permissions_json: ['promo.site.view'], promo_permissions_version: 1,
      created_by: primaryA.id, updated_by: primaryA.id,
    });
    await create('store_user_access', {
      store: storeA.id, user: suspendedA.id, template_code: 'custom', permissions_json: [],
      promo_permissions_json: ['promo.site.view'], promo_permissions_version: 1,
      created_by: primaryA.id, updated_by: primaryA.id,
    });
    await create('store_user_access', {
      store: commerce.id, user: commerceAdmin.id, template_code: 'custom', permissions_json: [],
      promo_permissions_json: ['promo.site.view', 'promo.content.manage'], promo_permissions_version: 1,
      created_by: commerceAdmin.id, updated_by: commerceAdmin.id,
    });

    const now = new Date().toISOString();
    const theme1 = await create('promo_theme_releases', {
      theme_id: 'promo.aladdin.black-gold', version: '1.0.0', status: 'approved',
      renderer_key: 'promo.aladdin.black-gold', contract_version: 1,
      manifest_sha256: 'a'.repeat(64), token_schema_sha256: 'b'.repeat(64),
      approved_by: master.id, approved_at: now,
    });
    await create('promo_theme_releases', {
      theme_id: 'promo.aladdin.black-gold', version: '1.0.1', status: 'approved',
      renderer_key: 'promo.aladdin.black-gold', contract_version: 1,
      manifest_sha256: 'c'.repeat(64), token_schema_sha256: 'd'.repeat(64),
      approved_by: master.id, approved_at: now,
    });

    async function createPromoFixture(store, publicSlug, publicName) {
      const site = await create('promo_sites', {
        store: store.id, public_slug: publicSlug, status: 'active', contract_version: 1,
        created_by: master.id, updated_by: master.id,
      });
      const entitlement = await create('promo_site_entitlements', {
        site: site.id, source: 'contract', promo_site_enabled: true, publish_enabled: true,
        custom_domain_enabled: false, theme_customization_enabled: false, multilanguage_enabled: true,
        video_enabled: true, analytics_enabled: false, landing_qr_bridge_enabled: false,
        max_services: 20, max_gallery_assets: 12, max_locales: 2, max_videos: 2,
        max_storage_bytes: 52428800, updated_by: master.id,
      });
      const draftDocument = emptyDraft();
      const draft = await create('promo_draft_documents', {
        site: site.id, schema_version: 1, document_json: draftDocument, version: 1,
        document_sha256: digest(draftDocument), created_by: primaryA.id, updated_by: primaryA.id,
      });
      const snapshot = publishedDocument(publicName);
      const revision = await create('promo_revisions', {
        site: site.id, sequence: 1, schema_version: 1, snapshot_json: snapshot,
        snapshot_sha256: digest(snapshot), theme_release: theme1.id, default_locale: snapshot.locales.default,
        published_locales_json: snapshot.locales.published, source_draft_version: 1, created_by: master.id,
      });
      const slot = await create('promo_publication_slots', {
        site: site.id, state: 'active', published_revision: revision.id, canonical_mode: 'platform',
        generation: 1, published_by: master.id, published_at: now,
      });
      return { site, entitlement, draft, revision, slot, snapshot };
    }

    const fixtureA = await createPromoFixture(storeA, 'promo-pubcfg-a', 'Publicado A');
    const fixtureB = await createPromoFixture(storeB, 'promo-pubcfg-b', 'Publicado B');

    const publicA = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a');
    const publicB = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-b');
    assertStatus(publicA, 200, 'público A');
    assertStatus(publicB, 200, 'público B');
    assert.equal(publicA.data.content_by_locale.es.identity.name, 'Publicado A');
    assert.equal(publicB.data.content_by_locale.es.identity.name, 'Publicado B');
    assert.equal(publicA.headers.get('cache-control').includes('no-store'), true);
    const publicSerialized = JSON.stringify(publicA.data);
    for (const forbidden of [
      storeA.id, fixtureA.site.id, fixtureA.revision.id, 'snapshot_sha256', 'tokenKey', 'provider_reference',
      'phone_e164', 'permissions', 'price', 'currency', 'stock', 'cart', 'checkout',
    ]) assert.equal(publicSerialized.includes(forbidden), false, `público excluye ${forbidden}`);

    const neutralLocale = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a/locales');
    assertStatus(neutralLocale, 200, 'I18N neutral usa default publicado');
    assert.equal(neutralLocale.data.contract, 'promo.public.localized.v1');
    assert.equal(neutralLocale.data.locale.effective, 'es');
    assert.equal(neutralLocale.data.locale.source, 'default');
    assert.equal(neutralLocale.data.content.identity.name, 'Publicado A');
    assert.equal(neutralLocale.headers.get('content-language'), 'es');
    assert.match(neutralLocale.headers.get('vary'), /Accept-Language/);
    assert.deepEqual(neutralLocale.data.selector.options.map((option) => option.locale), ['en', 'es']);
    const englishByHeader = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a/locales', {
      headers: { 'Accept-Language': 'en-US;q=0.9, es;q=0.8' },
    });
    assertStatus(englishByHeader, 200, 'I18N negocia Accept-Language por idioma');
    assert.equal(englishByHeader.data.locale.effective, 'en');
    assert.equal(englishByHeader.data.locale.source, 'accept-language');
    assert.equal(englishByHeader.data.content.identity.name, 'Publicado A EN');
    const englishByCookie = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a/locales', {
      headers: { Cookie: 'pz_promo_locale=en', 'Accept-Language': 'es' },
    });
    assert.equal(englishByCookie.data.locale.source, 'preference');
    assert.equal(englishByCookie.data.locale.effective, 'en');
    const explicitEnglish = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a/locales/EN', {
      headers: { Cookie: 'pz_promo_locale=es', 'Accept-Language': 'es' },
    });
    assertStatus(explicitEnglish, 200, 'locale URL explícito domina cookie/header y canonicaliza alias');
    assert.equal(explicitEnglish.data.locale.source, 'url');
    assert.equal(explicitEnglish.data.locale.effective, 'en');
    assert.match(explicitEnglish.headers.get('set-cookie'), /pz_promo_locale=en/);
    const localizedSerialized = JSON.stringify(explicitEnglish.data);
    for (const forbidden of [
      'content_by_locale', 'Identidad pública Promo', storeA.id, fixtureA.site.id, fixtureA.revision.id,
      'phone_e164', 'tokenKey', 'price', 'currency', 'stock', 'cart', 'checkout',
    ]) assert.equal(localizedSerialized.includes(forbidden), false, `I18N excluye ${forbidden}`);
    assertStatus(
      await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a/locales/fr'),
      404,
      'locale explícito no publicado falla cerrado sin default',
    );
    assertStatus(
      await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a/locales?store_id=attacker'),
      400,
      'entrada neutral rechaza tenancy por query',
    );
    const localizedB = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-b/locales/en');
    assertStatus(localizedB, 200, 'I18N tenant B');
    assert.equal(localizedB.data.content.identity.name, 'Publicado B EN');
    assert.equal(JSON.stringify(localizedB.data).includes('Publicado A'), false, 'I18N no mezcla tenant A/B');

    for (const query of [
      '?store_id=attacker', '?site_id=attacker', '?revision_id=attacker', '?filter=id%21%3D%22%22',
      '?sort=-created', '?fields=*', '?expand=site.store',
    ]) {
      const injected = await request(`/api/pz/promo/public/v1/sites/promo-pubcfg-a${query}`);
      assertStatus(injected, 400, `query pública rechazada ${query}`);
    }
    assertStatus(await request('/api/pz/promo/public/v1/sites/commerce-pubcfg'), 404, 'Commerce sin Promo');
    assertStatus(await request('/api/pz/promo/public/v1/sites/unknown-promo'), 404, 'tenant desconocido');

    const candidate = publishedDocument('Candidata privada');
    await create('promo_revisions', {
      site: fixtureA.site.id, sequence: 2, schema_version: 1, snapshot_json: candidate,
      snapshot_sha256: digest(candidate), theme_release: theme1.id, default_locale: candidate.locales.default,
      published_locales_json: candidate.locales.published, source_draft_version: 1, created_by: master.id,
    });
    const afterCandidate = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a');
    assertStatus(afterCandidate, 200, 'candidata no desplaza slot');
    assert.equal(afterCandidate.data.content_by_locale.es.identity.name, 'Publicado A');

    const corruptSnapshot = publishedDocument('Digest corrupto');
    const corruptRevision = await create('promo_revisions', {
      site: fixtureB.site.id, sequence: 2, schema_version: 1, snapshot_json: corruptSnapshot,
      snapshot_sha256: 'f'.repeat(64), theme_release: theme1.id, default_locale: corruptSnapshot.locales.default,
      published_locales_json: corruptSnapshot.locales.published, source_draft_version: 1, created_by: master.id,
    });
    await update('promo_publication_slots', fixtureB.slot.id, {
      published_revision: corruptRevision.id, generation: 2,
    });
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-b'), 404, 'digest inconsistente falla cerrado');
    fixtureB.slot = await update('promo_publication_slots', fixtureB.slot.id, {
      published_revision: fixtureB.revision.id, generation: 3,
    });
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-b'), 200, 'restaura revisión exacta B');

    const primaryAuth = await authenticate(primaryA.email, 'A'.repeat(43));
    const secondaryAuth = await authenticate(secondaryA.email, 'B'.repeat(43));
    const staffAuth = await authenticate(staffA.email, 'C'.repeat(43));
    const commerceAuth = await authenticate(commerceAdmin.email, 'D'.repeat(43));
    const suspendedAuth = await authenticate(suspendedA.email, 'E'.repeat(43));
    for (const [result, label] of [[primaryAuth, 'principal'], [secondaryAuth, 'secundario'], [staffAuth, 'staff'], [commerceAuth, 'Commerce'], [suspendedAuth, 'suspendible']]) {
      assertStatus(result, 200, `auth ${label}`);
    }
    const readBody = { contract: 'promo.draft.read.v1' };
    const primaryRead = await request('/api/pz/promo/private/v1/draft/read', { token: primaryAuth.data.token, json: readBody });
    assertStatus(primaryRead, 200, 'principal lee draft');
    assert.equal(primaryRead.data.draft.version, 1);
    assert.equal(primaryRead.data.draft.document.locales.published.length, 0);
    assert.equal(primaryRead.headers.get('x-robots-tag').includes('noindex'), true);

    const masterNoContext = await request('/api/pz/promo/private/v1/draft/read', { token: masterToken, json: readBody });
    assertStatus(masterNoContext, 403, 'Master requiere contexto explícito');
    const masterRead = await request('/api/pz/promo/private/v1/draft/read', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id }, json: readBody,
    });
    assertStatus(masterRead, 200, 'Master usa soporte reservado explícito');
    const staffRead = await request('/api/pz/promo/private/v1/draft/read', { token: staffAuth.data.token, json: readBody });
    assertStatus(staffRead, 200, 'staff con view lee draft');
    const commerceRead = await request('/api/pz/promo/private/v1/draft/read', { token: commerceAuth.data.token, json: readBody });
    assertStatus(commerceRead, 404, 'Commerce no lee draft Promo');

    const edited = publishedDocument('Solo borrador A');
    const primaryUpdate = await request('/api/pz/promo/private/v1/draft/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 1, document: edited },
    });
    assertStatus(primaryUpdate, 200, 'principal actualiza con CAS');
    assert.equal(primaryUpdate.data.changed, true);
    assert.equal(primaryUpdate.data.draft.version, 2);
    const publicAfterDraft = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a');
    assert.equal(publicAfterDraft.data.content_by_locale.es.identity.name, 'Publicado A', 'draft no es fallback público');

    const conflict = await request('/api/pz/promo/private/v1/draft/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 1, document: edited },
    });
    assertStatus(conflict, 409, 'conflicto CAS');
    assert.equal(conflict.data.error, 'promo_draft_conflict');

    const themeChange = structuredClone(edited);
    themeChange.theme.version = '1.0.1';
    const secondaryTheme = await request('/api/pz/promo/private/v1/draft/update', {
      token: secondaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 2, document: themeChange },
    });
    assertStatus(secondaryTheme, 403, 'secundario sin theme.select');
    assert.equal(secondaryTheme.data.error, 'promo_permission_denied');

    const secondaryEdit = structuredClone(edited);
    secondaryEdit.content_by_locale.es.identity.name = 'Edición secundaria';
    const secondaryUpdate = await request('/api/pz/promo/private/v1/draft/update', {
      token: secondaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 2, document: secondaryEdit },
    });
    assertStatus(secondaryUpdate, 200, 'secundario con content.manage edita default locale');
    assert.equal(secondaryUpdate.data.draft.version, 3);
    const staffUpdate = await request('/api/pz/promo/private/v1/draft/update', {
      token: staffAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 3, document: secondaryEdit },
    });
    assertStatus(staffUpdate, 403, 'staff sin manage no escribe');

    for (const injected of ['store_id', 'site_id', 'revision_id', 'filter', 'sort', 'fields', 'expand']) {
      const manipulated = await request('/api/pz/promo/private/v1/draft/update', {
        token: primaryAuth.data.token,
        json: {
          contract: 'promo.draft.update.v1', expected_version: 3, document: secondaryEdit, [injected]: storeB.id,
        },
      });
      assertStatus(manipulated, 400, `payload privado rechaza ${injected}`);
    }
    const commerceField = { ...secondaryEdit, price: 99 };
    const unsafe = await request('/api/pz/promo/private/v1/draft/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 3, document: commerceField },
    });
    assertStatus(unsafe, 400, 'unknown/Commerce key rechazada');
    const html = structuredClone(secondaryEdit);
    html.content_by_locale.es.identity.summary = '<script>alert(1)</script>';
    assertStatus(await request('/api/pz/promo/private/v1/draft/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 3, document: html },
    }), 400, 'HTML/JS rechazado');

    const directDraft = await request(`/api/collections/promo_draft_documents/records/${fixtureA.draft.id}`, {
      token: primaryAuth.data.token,
    });
    assertStatus(directDraft, [403, 404], 'REST directo draft cerrado');
    const directRevision = await request(`/api/collections/promo_revisions/records/${fixtureA.revision.id}?fields=*&expand=site,theme_release`, {
      token: masterToken,
    });
    assertStatus(directRevision, [403, 404], 'REST directo revisión cerrado para Master');

    await update('users', suspendedA.id, { status: 'suspended' });
    const suspendedRead = await request('/api/pz/promo/private/v1/draft/read', {
      token: suspendedAuth.data.token, json: readBody,
    });
    assertStatus(suspendedRead, [401, 403], 'usuario suspendido no lee');

    const revokeSecondary = await request('/api/pz/promo/team/update-permissions', {
      token: primaryAuth.data.token,
      json: {
        user_id: secondaryA.id, expected_version: 1,
        permissions: ['promo.site.view', 'promo.content.manage', 'promo.theme.select'],
        reason: 'Rotación runtime PUBCFG',
      },
    });
    assertStatus(revokeSecondary, 200, 'cambio de permiso rota sesión');
    const revokedRead = await request('/api/pz/promo/private/v1/draft/read', {
      token: secondaryAuth.data.token, json: readBody,
    });
    assertStatus(revokedRead, [401, 403], 'sesión revocada no conserva lectura');

    const disableB = await request('/api/pz/promo/master/entitlements/update', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeB.id },
      json: {
        expected_updated: fixtureB.entitlement.updated, source: 'contract',
        capabilities: { promo_site_enabled: false }, reason: 'Capability ausente runtime',
      },
    });
    assertStatus(disableB, 200, 'Master deshabilita capability B');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-b'), 404, 'capability ausente cierra público');

    fixtureA.slot = await update('promo_publication_slots', fixtureA.slot.id, { state: 'paused', generation: 2 });
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 404, 'slot inactivo cierra público');
    fixtureA.slot = await update('promo_publication_slots', fixtureA.slot.id, { state: 'active', generation: 3 });
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 200, 'slot reactivado sirve revisión exacta');
    const localBinding = await create('promo_domain_bindings', {
      site: fixtureA.site.id, hostname_ascii: 'promo-a.example.test', hostname_display: 'promo-a.example.test',
      role: 'primary', status: 'active', is_current: true, verification_method: 'manual', state_version: 1,
      verified_by: master.id, verified_at: now, activated_at: now,
    });
    await update('promo_publication_slots', fixtureA.slot.id, {
      canonical_mode: 'custom', primary_binding: localBinding.id, generation: 4,
    });
    assertStatus(
      await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'),
      404,
      'PUBCFG no suplanta DOM-CORE cuando canonical es custom',
    );

    const auditListBody = {
      contract: 'promo.audit.list.v1', page: 1, per_page: 50,
      filters: { action: 'promo.draft.update' },
    };
    const primaryAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryAuth.data.token, json: auditListBody,
    });
    assertStatus(primaryAudit, 200, 'principal lee auditoría Promo saneada');
    assert.equal(primaryAudit.data.contract, 'promo.audit.list.v1');
    assert.equal(primaryAudit.data.events.length, 2);
    assert.equal(primaryAudit.data.events.some((event) => event.severity === 'critical'), true);
    assert.equal(primaryAudit.data.events.some((event) => event.severity === 'important'), true);
    const projectedAudit = JSON.stringify(primaryAudit.data);
    for (const forbidden of [
      storeA.id, storeB.id, fixtureA.site.id, fixtureB.site.id, 'Solo borrador A',
      'Edición secundaria', userPassword, 'source_event_key', 'correlation_id', 'actor_snapshot_json',
    ]) assert.equal(projectedAudit.includes(forbidden), false, `auditoría proyectada excluye ${forbidden}`);
    const localizationAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.audit.list.v1', page: 1, per_page: 50,
        filters: { action: 'promo.localization.update' },
      },
    });
    assertStatus(localizationAudit, 200, 'principal lee eventos localización del writer AUDIT');
    assert.equal(localizationAudit.data.events.length, 2);
    assert.equal(localizationAudit.data.events.every((event) => event.module === 'localization'), true);
    assert.equal(JSON.stringify(localizationAudit.data).includes('Edición secundaria'), false);
    const auditDetail = await request('/api/pz/promo/private/v1/audit/detail', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.audit.detail.v1', event_id: primaryAudit.data.events[0].id },
    });
    assertStatus(auditDetail, 200, 'detalle audit tenant-scoped');
    assert.equal(auditDetail.data.event.action, 'promo.draft.update');
    assert.deepEqual(Object.keys(auditDetail.data.event).sort(), [
      'action', 'actor', 'after', 'before', 'changed_paths', 'contract', 'created',
      'id', 'module', 'origin', 'resource', 'severity', 'summary',
    ]);
    assertStatus(await request('/api/pz/promo/private/v1/audit/list', {
      token: secondaryAuth.data.token, json: auditListBody,
    }), 403, 'secundario no lee auditoría operativa');
    assertStatus(await request('/api/pz/promo/private/v1/audit/list', {
      token: staffAuth.data.token, json: auditListBody,
    }), 403, 'staff no lee auditoría operativa');
    assertStatus(await request('/api/pz/promo/private/v1/audit/list', {
      token: commerceAuth.data.token, json: auditListBody,
    }), 404, 'Commerce no lee auditoría Promo');
    assertStatus(await request('/api/pz/promo/private/v1/audit/list', {
      token: masterToken, json: auditListBody,
    }), 403, 'Master requiere contexto audit explícito');
    const masterAuditB = await request('/api/pz/promo/private/v1/audit/list', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeB.id }, json: auditListBody,
    });
    assertStatus(masterAuditB, 200, 'Master lee únicamente el tenant declarado');
    assert.equal(masterAuditB.data.pagination.total_items, 0, 'draft audit A no cruza a B');
    for (const injected of ['store_id', 'site_id', 'actor_id', 'filter', 'sort', 'fields', 'expand']) {
      assertStatus(await request('/api/pz/promo/private/v1/audit/list', {
        token: primaryAuth.data.token, json: { ...auditListBody, [injected]: storeB.id },
      }), 400, `audit rechaza ${injected}`);
    }

    const audits = await request('/api/collections/promo_audit_events/records?filter=action%3D%22promo.draft.update%22', {
      token: superToken,
    });
    assertStatus(audits, 200, 'superuser verifica auditoría temporal');
    assert.ok(audits.data.items.length >= 2);
    const auditSerialized = JSON.stringify(audits.data.items);
    assert.equal(auditSerialized.includes('Solo borrador A'), false, 'audit no copia documento');
    assert.equal(auditSerialized.includes(userPassword), false, 'audit no copia secretos');

    t.diagnostic('Master, principal, secundario, staff, suspendido, sesión revocada y Commerce validados');
    t.diagnostic('dos tiendas aisladas, draft/candidata no publicados, CAS y payloads manipulados validados');
    t.diagnostic('capability ausente, slot/custom inactivos, digest, REST directo y proyección allowlisted validados');
  } finally {
    await stopPocketBase(runtime);
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    assert.ok(resolvedTemporaryRoot.startsWith(`${resolvedSystemTemp}${path.sep}`));
    fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
  }
});
