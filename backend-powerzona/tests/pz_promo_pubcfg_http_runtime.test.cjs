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

function runPocketBase(args, dataDirectory, environment, input) {
  return spawnSync(POCKETBASE_EXE, [...args, ...runtimeFlags(dataDirectory)], {
    cwd: BACKEND_DIR, encoding: 'utf8', env: environment, input,
    timeout: 120_000, windowsHide: true,
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
    theme: { theme_id: 'promo.black-gold', version: themeVersion, tokens: {} },
    identity: { public_business_key: 'business-public' },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: 'estimate' }, media_use_keys: [],
    }],
    media_refs: {},
    contact: {
      enabled: true, primary_action_key: 'estimate', secondary_action_keys: [],
      actions: [{ key: 'estimate', type: 'whatsapp', enabled: true, config: { phone_e164: '+5351234567' } }],
    },
    content_by_locale: {
      en: {
        identity: { name: `${name} EN`, summary: 'Public Promo identity' },
        navigation: { 'hero-main': 'Home' },
        sections: { 'hero-main': { heading: `${name} EN`, summary: 'Informational content' } },
        contact: {
          estimate: { label: 'Request an estimate', aria_label: 'Request an estimate through WhatsApp', message: 'Hello, I would like an estimate.' },
        },
        media_alt: {}, seo: { title: `${name} EN`, description: `Public presentation of ${name}` },
      },
      es: {
        identity: { name, summary: 'Identidad pública Promo' },
        navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: name, summary: 'Contenido informativo' } },
        contact: {
          estimate: { label: 'Solicitar estimado', aria_label: 'Solicitar un estimado por WhatsApp', message: 'Hola, deseo un estimado.' },
        },
        media_alt: {}, seo: { title: name, description: `Presentación pública de ${name}` },
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
    const storeC = await createStore('Promo PUBLISH Primera', 'promo-publish-first-store');
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
      theme_id: 'promo.black-gold', version: '1.0.0', status: 'approved',
      renderer_key: 'promo.black-gold', contract_version: 1,
      manifest_sha256: theme.BLACK_GOLD_MANIFEST_SHA256,
      token_schema_sha256: theme.BLACK_GOLD_TOKEN_SCHEMA_SHA256,
      approved_by: master.id, approved_at: now,
    });

    async function createPromoFixture(store, publicSlug, publicName) {
      const site = await create('promo_sites', {
        store: store.id, public_slug: publicSlug, status: 'active', contract_version: 1,
        created_by: master.id, updated_by: master.id,
      });
      const entitlement = await create('promo_site_entitlements', {
        site: site.id, source: 'contract', promo_site_enabled: true, publish_enabled: true,
        custom_domain_enabled: true, theme_customization_enabled: true, multilanguage_enabled: true,
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

    const firstDocument = publishedDocument('Primera publicación C');
    const firstSite = await create('promo_sites', {
      store: storeC.id, public_slug: 'promo-publish-first', status: 'draft', contract_version: 1,
      created_by: master.id, updated_by: master.id,
    });
    await create('promo_site_entitlements', {
      site: firstSite.id, source: 'contract', promo_site_enabled: true, publish_enabled: true,
      custom_domain_enabled: false, theme_customization_enabled: true, multilanguage_enabled: true,
      video_enabled: false, analytics_enabled: false, landing_qr_bridge_enabled: false,
      max_services: 20, max_gallery_assets: 12, max_locales: 2, max_videos: 0,
      max_storage_bytes: 52428800, updated_by: master.id,
    });
    await create('promo_draft_documents', {
      site: firstSite.id, schema_version: 1, document_json: firstDocument, version: 1,
      document_sha256: digest(firstDocument), created_by: master.id, updated_by: master.id,
    });
    await create('promo_publication_slots', {
      site: firstSite.id, state: 'unpublished', canonical_mode: 'platform', generation: 0,
    });

    assertStatus(
      await request('/api/pz/promo/public/v1/sites/promo-publish-first'),
      404,
      'draft inicial no es serving público',
    );
    const firstCandidateRequest = {
      contract: 'promo.candidate.create.v1', expected_draft_version: 1,
    };
    assertStatus(await request('/api/pz/promo/private/v1/publication/candidates/create', {
      token: masterToken, json: firstCandidateRequest,
    }), 403, 'candidata Master exige contexto explícito');
    const firstCandidate = await request('/api/pz/promo/private/v1/publication/candidates/create', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id }, json: firstCandidateRequest,
    });
    assertStatus(firstCandidate, 201, `crea primera candidata inmutable\n${runtime.output()}`);
    assert.equal(firstCandidate.data.contract, 'promo.candidate.v1');
    assert.equal(firstCandidate.data.candidate.sequence, 1);
    assert.equal(firstCandidate.data.candidate.source_draft_version, 1);
    assert.equal(firstCandidate.data.candidate.reused, false);
    assertStatus(
      await request('/api/pz/promo/public/v1/sites/promo-publish-first'),
      404,
      'crear candidata no altera serving',
    );
    const repeatedCandidate = await request('/api/pz/promo/private/v1/publication/candidates/create', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id }, json: firstCandidateRequest,
    });
    assertStatus(repeatedCandidate, 200, 'digest idéntico reutiliza candidata');
    assert.equal(repeatedCandidate.data.candidate.revision_id, firstCandidate.data.candidate.revision_id);
    assert.equal(repeatedCandidate.data.candidate.reused, true);
    const firstPreviewBody = {
      contract: 'promo.preview.read.v1',
      candidate_revision_id: firstCandidate.data.candidate.revision_id,
      locale: 'es',
    };
    assertStatus(await request('/api/pz/promo/private/v1/publication/preview', {
      json: firstPreviewBody,
    }), 403, 'preview requiere autenticación central');
    const firstPreview = await request('/api/pz/promo/private/v1/publication/preview', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id }, json: firstPreviewBody,
    });
    assertStatus(firstPreview, 200, 'preview privado de candidata exacta');
    assert.equal(firstPreview.data.contract, 'promo.preview.v1');
    assert.equal(firstPreview.data.visibility, 'private');
    assert.equal(firstPreview.data.preview.content.identity.name, 'Primera publicación C');
    assert.match(firstPreview.headers.get('cache-control'), /private, no-store/);
    assert.match(firstPreview.headers.get('x-robots-tag'), /noindex/);
    assert.equal(JSON.stringify(firstPreview.data).includes('content_by_locale'), false);
    assert.equal(JSON.stringify(firstPreview.data).includes('Primera publicación C EN'), false);
    const firstPublishBody = {
      contract: 'promo.publication.publish.v1',
      candidate_revision_id: firstCandidate.data.candidate.revision_id,
      expected_generation: 0,
      idempotency_key: 'publish.first.c.0001',
      reason_code: 'content_release',
      canonical: { mode: 'platform' },
    };
    const firstPublish = await request('/api/pz/promo/private/v1/publication/publish', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id }, json: firstPublishBody,
    });
    assertStatus(firstPublish, 200, `primera publicación atómica\n${runtime.output()}`);
    assert.equal(firstPublish.data.generation_before, 0);
    assert.equal(firstPublish.data.generation_after, 1);
    assert.equal(firstPublish.data.replayed, false);
    const firstPublic = await request('/api/pz/promo/public/v1/sites/promo-publish-first');
    assertStatus(firstPublic, 200, 'primera publicación activa serving slot→revision');
    assert.equal(firstPublic.data.content_by_locale.es.identity.name, 'Primera publicación C');
    const firstReplay = await request('/api/pz/promo/private/v1/publication/publish', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id }, json: firstPublishBody,
    });
    assertStatus(firstReplay, 200, 'replay idempotente no vuelve a publicar');
    assert.equal(firstReplay.data.replayed, true);
    assert.equal(firstReplay.data.generation_after, 1);
    const staleFirstPublish = await request('/api/pz/promo/private/v1/publication/publish', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id },
      json: { ...firstPublishBody, idempotency_key: 'publish.first.c.0002' },
    });
    assertStatus(staleFirstPublish, 409, 'CAS stale falla sin desplazar revisión pública');
    assert.equal(staleFirstPublish.data.error, 'promo_publication_conflict');
    const staleFirstReplay = await request('/api/pz/promo/private/v1/publication/publish', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id },
      json: { ...firstPublishBody, idempotency_key: 'publish.first.c.0002' },
    });
    assertStatus(staleFirstReplay, 409, 'replay de rechazo conserva el resultado idempotente');
    assert.equal(staleFirstReplay.data.error, 'promo_publication_conflict');
    const firstSecurityAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id },
      json: {
        contract: 'promo.audit.list.v1', page: 1, per_page: 50,
        filters: { action: 'promo.security.reject' },
      },
    });
    assertStatus(firstSecurityAudit, 200, 'CAS rechazado genera AUDIT central saneado');
    assert.equal(firstSecurityAudit.data.events.length, 1, 'replay no duplica rechazo ni AUDIT');
    assert.equal(firstSecurityAudit.data.events[0].after.class, 'promo_publication_conflict');
    assert.equal(JSON.stringify(firstSecurityAudit.data).includes('publish.first.c.0002'), false);
    for (const injected of ['store_id', 'site_id', 'actor_id', 'filter', 'sort', 'fields', 'expand']) {
      assertStatus(await request('/api/pz/promo/private/v1/publication/publish', {
        token: masterToken, headers: { 'X-PZ-Promo-Store': storeC.id },
        json: { ...firstPublishBody, [injected]: storeA.id },
      }), 400, `PUBLISH rechaza ${injected}`);
    }

    const publicA = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a');
    const publicB = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-b');
    assertStatus(publicA, 200, 'público A');
    assertStatus(publicB, 200, 'público B');
    assert.equal(publicA.data.content_by_locale.es.identity.name, 'Publicado A');
    assert.equal(publicB.data.content_by_locale.es.identity.name, 'Publicado B');
    assert.equal(publicA.data.theme.tokens.surface, 'obsidian', 'Theme completa defaults seguros');
    assert.equal(publicA.data.theme.tokens.accent, 'heritage_gold');
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

    const platformShell = await request('/api/pz/promo/public/v1/shell/sites/promo-pubcfg-a');
    assertStatus(platformShell, 200, 'SHELL SSR resuelve canonical plataforma publicado');
    assert.equal(platformShell.data.contract, 'promo.public.shell.v1');
    assert.deepEqual(platformShell.data.route, {
      source: 'platform', action: 'redirect', location: '/promo/promo-pubcfg-a/es',
    });
    const localizedPlatformShell = await request('/api/pz/promo/public/v1/shell/sites/promo-pubcfg-a/locales/es');
    assertStatus(localizedPlatformShell, 200, 'SHELL localized sirve identidad SEO estable');
    assert.equal(localizedPlatformShell.data.profile.locale.effective, 'es');
    assert.equal(localizedPlatformShell.data.profile.content.identity.name, 'Publicado A');
    assert.equal(localizedPlatformShell.data.profile.locale.canonical_path, '/promo/promo-pubcfg-a/es');
    assert.deepEqual(localizedPlatformShell.data.profile.contact_action, {
      contract: 'promo.contact.action.v1', available: true,
      action: {
        key: 'estimate', type: 'whatsapp', label: 'Solicitar estimado',
        aria_label: 'Solicitar un estimado por WhatsApp',
        href: 'https://wa.me/5351234567?text=Hola%2C%20deseo%20un%20estimado.',
      },
    });
    assert.deepEqual(localizedPlatformShell.data.profile.selector.options.map((option) => option.href), [
      '/promo/promo-pubcfg-a/en', '/promo/promo-pubcfg-a/es',
    ]);
    assert.equal(platformShell.headers.get('cache-control').includes('no-store'), true);
    assert.equal(localizedPlatformShell.data.seo.canonical_url, 'https://tusenda84.com/promo/promo-pubcfg-a/es');
    assert.equal(localizedPlatformShell.data.seo.open_graph.type, 'website');
    const platformSitemap = await request('/api/pz/promo/public/v1/seo/sites/promo-pubcfg-a/sitemap');
    assertStatus(platformSitemap, 200, 'SEO sitemap deriva locales de revisión publicada');
    assert.deepEqual(platformSitemap.data.identity.locales.map((entry) => entry.locale), ['en', 'es']);
    assert.equal(platformSitemap.data.identity.sitemap_url,
      'https://tusenda84.com/promo/promo-pubcfg-a/sitemap.xml');

    const explicitShell = await request('/api/pz/promo/public/v1/shell/sites/promo-pubcfg-a/locales/en');
    assertStatus(explicitShell, 200, 'SHELL SSR aplica locale explícito publicado');
    assert.equal(explicitShell.data.profile.locale.effective, 'en');
    assert.equal(explicitShell.data.profile.content.identity.name, 'Publicado A EN');
    assert.equal(explicitShell.data.profile.contact_action.action.label, 'Request an estimate');
    assert.equal(
      explicitShell.data.profile.contact_action.action.href,
      'https://wa.me/5351234567?text=Hello%2C%20I%20would%20like%20an%20estimate.',
    );
    assert.equal(JSON.stringify(explicitShell.data).includes('Identidad pública Promo'), false, 'SHELL no mezcla locale español');
    const commerceBridge = await request('/api/pz/promo/public/v1/shell/stores/promo-pubcfg-a-store');
    assertStatus(commerceBridge, 200, 'guard Commerce reconoce solo Promo activa publicada');
    assert.deepEqual(commerceBridge.data.route, {
      source: 'commerce-bridge', action: 'redirect', location: '/promo/promo-pubcfg-a',
    });
    assertStatus(
      await request('/api/pz/promo/public/v1/shell/stores/commerce-pubcfg'),
      404,
      'guard Commerce conserva tienda no Promo sin fallback',
    );
    assertStatus(
      await request('/api/pz/promo/public/v1/shell/host', { headers: { Host: 'unknown.example.test' } }),
      421,
      'SHELL Host unknown falla cerrado',
    );

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

    const normalizedService = fs.readFileSync(path.join(
      BACKEND_DIR, '..', 'frontend-powerzona', 'public', 'brand', 'tusenda84-bazzar-logo.webp',
    ));
    const serviceSha = createHash('sha256').update(normalizedService).digest('hex');
    const uploadBody = new FormData();
    uploadBody.append('contract', 'promo.media.upload.v1');
    uploadBody.append('kind', 'image');
    uploadBody.append('purpose', 'service');
    uploadBody.append('mime', 'image/webp');
    uploadBody.append('sha256', serviceSha);
    uploadBody.append('bytes', String(normalizedService.length));
    uploadBody.append('width', '512');
    uploadBody.append('height', '512');
    uploadBody.append('duration_ms', '0');
    uploadBody.append('poster_asset_id', '');
    uploadBody.append('file', new Blob([normalizedService], { type: 'image/webp' }), `${'a'.repeat(32)}.webp`);
    const mediaUpload = await request('/api/pz/promo/private/v1/media/upload', {
      token: primaryAuth.data.token, method: 'POST', body: uploadBody,
    });
    assertStatus(mediaUpload, 201, `MEDIA normaliza y persiste asset tenant A\n${runtime.output()}`);
    assert.equal(mediaUpload.data.contract, 'promo.media.asset.v1');
    assert.equal(mediaUpload.data.asset.status, 'ready');
    assert.equal(mediaUpload.data.asset.purpose, 'service');
    assert.deepEqual(mediaUpload.data.asset.preview.variants.map((item) => item.width), [320, 512]);
    const mediaAssetId = mediaUpload.data.asset.asset_id;
    const privateOriginal = await request(mediaUpload.data.asset.preview.url, { token: primaryAuth.data.token });
    assertStatus(privateOriginal, 200, 'preview privado MEDIA sirve asset propio');
    assertStatus(await request(mediaUpload.data.asset.preview.url, { token: staffAuth.data.token }), 200, 'staff con site.view ve preview propio');
    assertStatus(await request(mediaUpload.data.asset.preview.url, {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeB.id },
    }), 404, 'preview privado MEDIA no mezcla contexto Master de tenant B');
    const mediaList = await request('/api/pz/promo/private/v1/media/list', {
      token: primaryAuth.data.token, json: { contract: 'promo.media.list.v1' },
    });
    assertStatus(mediaList, 200, 'catálogo privado MEDIA');
    assert.equal(mediaList.data.assets.length, 1);
    assert.equal(JSON.stringify(mediaList.data).includes(storeA.id), false, 'catálogo MEDIA no expone tenant');

    const mediaSnapshot = publishedDocument('Publicado A');
    mediaSnapshot.section_order = ['services-main'];
    mediaSnapshot.sections = [{
      key: 'services-main', type: 'services', variant: 'default', visible: true,
      config: { item_keys: ['service-one'] }, media_use_keys: ['service_main'],
    }];
    mediaSnapshot.media_refs = { service_main: { asset_id: mediaAssetId, purpose: 'service' } };
    mediaSnapshot.content_by_locale.es.navigation = { 'services-main': 'Servicios' };
    mediaSnapshot.content_by_locale.es.sections = {
      'services-main': { heading: 'Servicios', summary: 'Servicios publicados', items: [{ key: 'service-one', name: 'Servicio' }] },
    };
    mediaSnapshot.content_by_locale.es.media_alt = { service_main: { alt: 'Servicio accesible A', decorative: false } };
    mediaSnapshot.content_by_locale.en.navigation = { 'services-main': 'Services' };
    mediaSnapshot.content_by_locale.en.sections = {
      'services-main': { heading: 'Services', summary: 'Published services', items: [{ key: 'service-one', name: 'Service' }] },
    };
    mediaSnapshot.content_by_locale.en.media_alt = { service_main: { alt: 'Accessible service A', decorative: false } };
    const mediaRevision = await create('promo_revisions', {
      site: fixtureA.site.id, sequence: 3, schema_version: 1, snapshot_json: mediaSnapshot,
      snapshot_sha256: digest(mediaSnapshot), theme_release: theme1.id, default_locale: mediaSnapshot.locales.default,
      published_locales_json: mediaSnapshot.locales.published, source_draft_version: 1, created_by: master.id,
    });
    await create('promo_revision_media_refs', {
      site: fixtureA.site.id, revision: mediaRevision.id, media_asset: mediaAssetId, use_key: 'service_main',
    });
    fixtureA.slot = await update('promo_publication_slots', fixtureA.slot.id, {
      published_revision: mediaRevision.id, generation: 2,
    });
    const publicMedia = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a');
    assertStatus(publicMedia, 200, 'PUBCFG proyecta MEDIA publicada');
    assert.equal(publicMedia.data.media[0].delivery.contract, 'promo.media.delivery.v1');
    assert.equal(publicMedia.data.media[0].delivery.loading, 'lazy');
    assert.equal(JSON.stringify(publicMedia.data.media[0]).includes(mediaAssetId), false, 'público no expone asset ID');
    const localizedMedia = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a/locales/es');
    assertStatus(localizedMedia, 200, 'I18N proyecta alt efectivo');
    assert.deepEqual(localizedMedia.data.media[0].accessibility, { alt: 'Servicio accesible A', decorative: false });
    assertStatus(await request(publicMedia.data.media[0].delivery.src), 200, 'delivery pública valida revisión exacta');
    assertStatus(await request(`${publicMedia.data.media[0].delivery.src}?download=1`), 404, 'delivery pública rechaza query no allowlisted');
    const crossTenantMediaPath = publicMedia.data.media[0].delivery.src.replace('/promo-pubcfg-a/', '/promo-pubcfg-b/');
    assertStatus(await request(crossTenantMediaPath), 404, 'delivery pública no mezcla tenant B');
    fixtureA.slot = await update('promo_publication_slots', fixtureA.slot.id, {
      published_revision: fixtureA.revision.id, generation: 3,
    });
    const retiredMedia = await request('/api/pz/promo/private/v1/media/retire', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.media.retire.v1', asset_id: mediaAssetId, expected_status: 'ready' },
    });
    assertStatus(retiredMedia, 200, 'MEDIA retira asset fuera de draft/publicación activa');
    assert.equal(retiredMedia.data.asset.status, 'retired');

    const readBody = { contract: 'promo.draft.read.v1' };
    const primaryRead = await request('/api/pz/promo/private/v1/draft/read', { token: primaryAuth.data.token, json: readBody });
    assertStatus(primaryRead, 200, 'principal lee draft');
    assert.equal(primaryRead.data.draft.version, 1);
    assert.equal(primaryRead.data.draft.document.locales.published.length, 0);
    assert.equal(primaryRead.headers.get('x-robots-tag').includes('noindex'), true);
    const emptyThemeCatalog = await request('/api/pz/promo/private/v1/themes/catalog', {
      token: primaryAuth.data.token, json: { contract: 'promo.theme.catalog.read.v1' },
    });
    assertStatus(emptyThemeCatalog, 200, 'catálogo Theme privado para principal');
    assert.equal(emptyThemeCatalog.data.contract, 'promo.theme.catalog.v1');
    assert.equal(emptyThemeCatalog.data.current.source, 'safe_fallback');
    assert.equal(emptyThemeCatalog.data.fallback.selectable, true);
    assert.equal(emptyThemeCatalog.data.themes.length, 1);
    const catalogSerialized = JSON.stringify(emptyThemeCatalog.data);
    for (const forbidden of [
      fixtureA.site.id, theme1.id, 'manifest_sha256', 'token_schema_sha256', 'approved_by', 'provider_reference',
    ]) assert.equal(catalogSerialized.includes(forbidden), false, `catálogo Theme excluye ${forbidden}`);

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
    const selectedThemeCatalog = await request('/api/pz/promo/private/v1/themes/catalog', {
      token: primaryAuth.data.token, json: { contract: 'promo.theme.catalog.read.v1' },
    });
    assertStatus(selectedThemeCatalog, 200, 'catálogo resuelve selección tenant-scoped');
    assert.equal(selectedThemeCatalog.data.current.source, 'selected');
    assert.equal(selectedThemeCatalog.data.current.theme_id, 'promo.black-gold');
    assert.equal(selectedThemeCatalog.data.current.tokens.surface, 'obsidian');
    const masterCatalogB = await request('/api/pz/promo/private/v1/themes/catalog', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeB.id },
      json: { contract: 'promo.theme.catalog.read.v1' },
    });
    assertStatus(masterCatalogB, 200, 'Master Theme usa únicamente el tenant explícito B');
    assert.equal(masterCatalogB.data.current.source, 'safe_fallback');
    assert.equal(JSON.stringify(masterCatalogB.data).includes('Solo borrador A'), false);
    assertStatus(await request('/api/pz/promo/private/v1/themes/catalog', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.theme.catalog.read.v1', site_id: fixtureB.site.id },
    }), 400, 'catálogo Theme rechaza tenant inyectado');
    const publicAfterDraft = await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a');
    assert.equal(publicAfterDraft.data.content_by_locale.es.identity.name, 'Publicado A', 'draft no es fallback público');

    const conflict = await request('/api/pz/promo/private/v1/draft/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 1, document: edited },
    });
    assertStatus(conflict, 409, 'conflicto CAS');
    assert.equal(conflict.data.error, 'promo_draft_conflict');

    const themeChange = structuredClone(edited);
    themeChange.theme.tokens = { radius: 'soft' };
    const secondaryTheme = await request('/api/pz/promo/private/v1/draft/update', {
      token: secondaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 2, document: themeChange },
    });
    assertStatus(secondaryTheme, 403, 'secundario sin appearance.manage');
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
    const unsafeThemeToken = structuredClone(secondaryEdit);
    unsafeThemeToken.theme.tokens = { accent: '#ffffff' };
    assertStatus(await request('/api/pz/promo/private/v1/draft/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 3, document: unsafeThemeToken },
    }), 400, 'token Theme fuera de allowlist rechazado');

    const candidateARequest = { contract: 'promo.candidate.create.v1', expected_draft_version: 3 };
    assertStatus(await request('/api/pz/promo/private/v1/publication/candidates/create', {
      token: secondaryAuth.data.token, json: candidateARequest,
    }), 403, 'secundario sin promo.publish no crea candidata');
    const candidateA = await request('/api/pz/promo/private/v1/publication/candidates/create', {
      token: primaryAuth.data.token, json: candidateARequest,
    });
    assertStatus(candidateA, 201, `principal crea candidata publicable tenant A\n${runtime.output()}`);
    const previewContextA = await request('/api/pz/promo/private/v1/publication/preview/context', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.preview.context.read.v1' },
    });
    assertStatus(previewContextA, 200, 'contexto privado fija draft y revisión publicada del tenant A');
    assert.equal(previewContextA.data.contract, 'promo.preview.context.v1');
    assert.equal(previewContextA.data.draft.version, 3);
    assert.deepEqual(previewContextA.data.draft.locales, { default: 'es', published: ['en', 'es'] });
    assert.equal(previewContextA.data.publication.generation, 3);
    assert.equal(previewContextA.data.publication.current.revision_id, fixtureA.revision.id);
    assert.equal(JSON.stringify(previewContextA.data).includes(fixtureA.site.id), false, 'no expone site interno');
    assertStatus(await request('/api/pz/promo/private/v1/publication/preview/context', {
      token: masterToken,
      headers: { 'X-PZ-Promo-Store': storeB.id },
      json: { contract: 'promo.preview.context.read.v1' },
    }), 200, 'Master requiere y conserva contexto explícito del tenant B');
    assertStatus(await request('/api/pz/promo/private/v1/publication/preview/context', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.preview.context.read.v1', store_id: storeB.id },
    }), 400, 'contexto rechaza tenant inyectado en body');
    const previewA = await request('/api/pz/promo/private/v1/publication/preview', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.preview.read.v1',
        candidate_revision_id: candidateA.data.candidate.revision_id,
        locale: 'en',
      },
    });
    assertStatus(previewA, 200, 'preview localiza candidata A sin publicarla');
    assert.equal(previewA.data.preview.content.identity.name, 'Solo borrador A EN');
    assert.equal(JSON.stringify(previewA.data).includes('Edición secundaria"'), false, 'preview EN no mezcla contenido ES');
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a')).data.content_by_locale.es.identity.name,
      'Publicado A', 'candidata exacta nunca sustituye el slot público');

    const publishA1Body = {
      contract: 'promo.publication.publish.v1',
      candidate_revision_id: candidateA.data.candidate.revision_id,
      expected_generation: 3,
      idempotency_key: 'publish.tenant.a.0001',
      reason_code: 'content_release',
      canonical: { mode: 'platform' },
    };
    await update('promo_site_entitlements', fixtureA.entitlement.id, { max_locales: 1 });
    const quotaRejectedPublish = await request('/api/pz/promo/private/v1/publication/publish', {
      token: primaryAuth.data.token,
      json: { ...publishA1Body, idempotency_key: 'publish.tenant.a.quota' },
    });
    assertStatus(quotaRejectedPublish, 403, 'publish revalida cuotas actuales después de crear candidata');
    assert.equal(quotaRejectedPublish.data.error, 'promo_capability_denied');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 404,
      'cuota insuficiente falla cerrado sin desplazar el slot');
    fixtureA.entitlement = await update('promo_site_entitlements', fixtureA.entitlement.id, { max_locales: 2 });
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a')).data.content_by_locale.es.identity.name,
      'Publicado A', 'restaurar cuota demuestra que el rechazo conservó la revisión pública previa');
    const publishA1 = await request('/api/pz/promo/private/v1/publication/publish', {
      token: primaryAuth.data.token, json: publishA1Body,
    });
    assertStatus(publishA1, 200, `publicación posterior usa CAS y evento atómico\n${runtime.output()}`);
    assert.equal(publishA1.data.generation_after, 4);
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a')).data.content_by_locale.es.identity.name,
      'Edición secundaria', 'público lee revisión exacta recién señalada');
    assertStatus(await request('/api/pz/promo/private/v1/publication/publish', {
      token: staffAuth.data.token, json: publishA1Body,
    }), 403, 'staff no puede reusar idempotency key ajena');

    const laterDocument = structuredClone(secondaryEdit);
    laterDocument.content_by_locale.es.identity.name = 'Publicación posterior A';
    laterDocument.content_by_locale.es.sections['hero-main'].heading = 'Publicación posterior A';
    laterDocument.content_by_locale.es.seo.title = 'Publicación posterior A';
    const laterDraft = await request('/api/pz/promo/private/v1/draft/update', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.draft.update.v1', expected_version: 3, document: laterDocument },
    });
    assertStatus(laterDraft, 200, 'edita borrador sin tocar revisión pública');
    assert.equal(laterDraft.data.draft.version, 4);
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a')).data.content_by_locale.es.identity.name,
      'Edición secundaria');
    const candidateA2 = await request('/api/pz/promo/private/v1/publication/candidates/create', {
      token: primaryAuth.data.token,
      json: { contract: 'promo.candidate.create.v1', expected_draft_version: 4 },
    });
    assertStatus(candidateA2, 201, 'crea segunda candidata inmutable');
    const publishA2 = await request('/api/pz/promo/private/v1/publication/publish', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.publication.publish.v1',
        candidate_revision_id: candidateA2.data.candidate.revision_id,
        expected_generation: 4,
        idempotency_key: 'publish.tenant.a.0002',
        reason_code: 'content_correction',
        canonical: { mode: 'platform' },
      },
    });
    assertStatus(publishA2, 200, 'segunda publicación incrementa exactamente una generación');
    assert.equal(publishA2.data.generation_after, 5);
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a')).data.content_by_locale.es.identity.name,
      'Publicación posterior A');

    const rollbackA = await request('/api/pz/promo/private/v1/publication/rollback', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.rollback.v1',
        candidate_revision_id: candidateA.data.candidate.revision_id,
        expected_generation: 5,
        idempotency_key: 'rollback.tenant.a.01',
        reason_code: 'content_correction',
        canonical: { mode: 'platform' },
      },
    });
    assertStatus(rollbackA, 200, 'rollback Master selecciona revisión histórica explícita');
    assert.equal(rollbackA.data.generation_after, 6);
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a')).data.content_by_locale.es.identity.name,
      'Edición secundaria');
    assertStatus(await request('/api/pz/promo/private/v1/publication/rollback', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.publication.rollback.v1',
        candidate_revision_id: candidateA2.data.candidate.revision_id,
        expected_generation: 6,
        idempotency_key: 'rollback.tenant.a.02',
        reason_code: 'content_correction',
        canonical: { mode: 'platform' },
      },
    }), 403, 'rollback global permanece reservado al Master');

    const localBinding = await create('promo_domain_bindings', {
      site: fixtureA.site.id, hostname_ascii: 'promo-a.example.test', hostname_display: 'promo-a.example.test',
      role: 'primary', status: 'active', is_current: true, verification_method: 'manual', state_version: 1,
      verified_by: master.id, verified_at: now, activated_at: now,
    });
    const foreignBinding = await create('promo_domain_bindings', {
      site: fixtureB.site.id, hostname_ascii: 'promo-b.example.test', hostname_display: 'promo-b.example.test',
      role: 'primary', status: 'active', is_current: true, verification_method: 'manual', state_version: 1,
      verified_by: master.id, verified_at: now, activated_at: now,
    });
    assertStatus(await request('/api/pz/promo/private/v1/publication/canonical/switch', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.canonical.switch.v1', expected_generation: 6,
        idempotency_key: 'canonical.tenant.a.bad', reason_code: 'canonical_change',
        canonical: { mode: 'custom', primary_binding_id: foreignBinding.id },
      },
    }), 409, 'primary binding cross-tenant falla cerrado sin consumir generation');
    const switchCustom = await request('/api/pz/promo/private/v1/publication/canonical/switch', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.canonical.switch.v1', expected_generation: 6,
        idempotency_key: 'canonical.tenant.a.01', reason_code: 'canonical_change',
        canonical: { mode: 'custom', primary_binding_id: localBinding.id },
      },
    });
    assertStatus(switchCustom, 200, `canonical custom cambia con slot/evento atómicos\n${runtime.output()}`);
    assert.equal(switchCustom.data.generation_after, 7);
    assert.equal(switchCustom.data.canonical.primary_binding_id, localBinding.id);
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 404,
      'ruta plataforma no suplanta custom después del switch');
    const platformRedirect = await request('/api/pz/promo/public/v1/shell/sites/promo-pubcfg-a');
    assertStatus(platformRedirect, 200, 'SHELL plataforma materializa redirect custom validado');
    assert.deepEqual(platformRedirect.data.route, {
      source: 'custom', action: 'redirect', location: 'https://promo-a.example.test/es',
    });
    const customShell = await request('/api/pz/promo/public/v1/shell/host/locales/en', {
      headers: { Host: 'promo-a.example.test', 'Accept-Language': 'en' },
    });
    assertStatus(customShell, 200, `SHELL Host primary sirve revisión custom exacta\n${runtime.output()}`);
    assert.deepEqual(customShell.data.route, { source: 'custom', action: 'serve' });
    assert.equal(customShell.data.profile.locale.effective, 'en');
    assert.equal(customShell.data.profile.content.identity.name, 'Solo borrador A EN');
    assert.equal(customShell.data.profile.contact_action.action.label, 'Request an estimate');
    assert.equal(customShell.data.profile.locale.canonical_path, '/en');
    assert.deepEqual(customShell.data.profile.selector.options.map((option) => option.href), ['/en', '/es']);
    const customBridge = await request('/api/pz/promo/public/v1/shell/stores/promo-pubcfg-a-store');
    assert.equal(customShell.data.seo.canonical_url, 'https://promo-a.example.test/en');
    const platformSitemapRedirect = await request('/api/pz/promo/public/v1/seo/sites/promo-pubcfg-a/sitemap');
    assert.deepEqual(platformSitemapRedirect.data.route, {
      source: 'custom', action: 'redirect', location: 'https://promo-a.example.test/sitemap.xml',
    });
    const customSitemap = await request('/api/pz/promo/public/v1/seo/host/sitemap', {
      headers: { Host: 'promo-a.example.test' },
    });
    assert.equal(customSitemap.data.identity.sitemap_url, 'https://promo-a.example.test/sitemap.xml');
    assertStatus(customBridge, 200, 'guard Commerce usa primary custom exacto');
    assert.equal(customBridge.data.route.location, 'https://promo-a.example.test/');
    const switchPlatform = await request('/api/pz/promo/private/v1/publication/canonical/switch', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.canonical.switch.v1', expected_generation: 7,
        idempotency_key: 'canonical.tenant.a.02', reason_code: 'domain_recovery',
        canonical: { mode: 'platform' },
      },
    });
    assertStatus(switchPlatform, 200, 'retorno a canonical plataforma es explícito');
    assert.equal(switchPlatform.data.generation_after, 8);
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 200,
      'plataforma vuelve a servir solo después del switch');

    const pauseA = await request('/api/pz/promo/private/v1/publication/pause', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.pause.v1', expected_generation: 8,
        idempotency_key: 'pause.tenant.a.0001', reason_code: 'content_review',
      },
    });
    assertStatus(pauseA, 200, 'pausa Master conserva revisión pero cierra serving');
    assert.equal(pauseA.data.state, 'paused');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 404);
    const resumeA = await request('/api/pz/promo/private/v1/publication/resume', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.resume.v1', expected_generation: 9,
        idempotency_key: 'resume.tenant.a.001', reason_code: 'content_approved',
      },
    });
    assertStatus(resumeA, 200, 'resume revalida revisión y canonical antes de servir');
    assert.equal(resumeA.data.generation_after, 10);
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 200);
    const unpublishA = await request('/api/pz/promo/private/v1/publication/unpublish', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.unpublish.v1', expected_generation: 10,
        idempotency_key: 'unpublish.tenant.a.1', reason_code: 'administrative_request',
      },
    });
    assertStatus(unpublishA, 200, 'unpublish limpia puntero activo y pausa sitio');
    assert.equal(unpublishA.data.state, 'unpublished');
    assert.equal(unpublishA.data.revision, null);
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 404,
      'unpublish nunca cae a draft/latest/candidate/Commerce');
    assertStatus(await request('/api/pz/promo/public/v1/shell/stores/promo-pubcfg-a-store'), 503,
      'guard /t falla cerrado para Promo reconocida pero no publicada');
    const republishA = await request('/api/pz/promo/private/v1/publication/publish', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.publish.v1',
        candidate_revision_id: candidateA2.data.candidate.revision_id,
        expected_generation: 11,
        idempotency_key: 'publish.tenant.a.0003',
        reason_code: 'content_release',
        canonical: { mode: 'platform' },
      },
    });
    assertStatus(republishA, 200, 'Master recupera publicación después de unpublish explícito');
    assert.equal(republishA.data.generation_after, 12);
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a')).data.content_by_locale.es.identity.name,
      'Publicación posterior A');
    const retiredMediaRollback = await request('/api/pz/promo/private/v1/publication/rollback', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.rollback.v1', candidate_revision_id: mediaRevision.id,
        expected_generation: 12, idempotency_key: 'rollback.retired.media',
        reason_code: 'media_recovery', canonical: { mode: 'platform' },
      },
    });
    assertStatus(retiredMediaRollback, 409, 'rollback revalida media ready y rechaza asset retirado');
    assert.equal((await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a')).data.content_by_locale.es.identity.name,
      'Publicación posterior A', 'rollback inválido conserva revisión pública previa');

    const directDraft = await request(`/api/collections/promo_draft_documents/records/${fixtureA.draft.id}`, {
      token: primaryAuth.data.token,
    });
    assertStatus(directDraft, [403, 404], 'REST directo draft cerrado');
    const directRevision = await request(`/api/collections/promo_revisions/records/${fixtureA.revision.id}?fields=*&expand=site,theme_release`, {
      token: masterToken,
    });
    assertStatus(directRevision, [403, 404], 'REST directo revisión cerrado para Master');
    assertStatus(await request('/api/collections/promo_publication_events/records?sort=-created&expand=site,actor', {
      token: primaryAuth.data.token,
    }), [403, 404], 'REST directo publication events cerrado para Admin');

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

    const releaseBody = (expectedStatus, nextStatus) => ({
      contract: 'promo.theme.release.update.v1', theme_id: 'promo.black-gold', version: '1.0.0',
      expected_status: expectedStatus, next_status: nextStatus,
    });
    assertStatus(await request('/api/pz/promo/private/v1/themes/releases/update', {
      token: masterToken, json: releaseBody('approved', 'deprecated'),
    }), 403, 'Master Theme requiere contexto explícito');
    assertStatus(await request('/api/pz/promo/private/v1/themes/releases/update', {
      token: primaryAuth.data.token, json: releaseBody('approved', 'deprecated'),
    }), 403, 'Admin no gestiona catálogo global Theme');
    const deprecatedTheme = await request('/api/pz/promo/private/v1/themes/releases/update', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: releaseBody('approved', 'deprecated'),
    });
    assertStatus(deprecatedTheme, 200, 'Master depreca release compilado exacto');
    assert.equal(deprecatedTheme.data.release.status, 'deprecated');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 200, 'deprecated conserva revisión publicada');
    const deprecatedCatalog = await request('/api/pz/promo/private/v1/themes/catalog', {
      token: primaryAuth.data.token, json: { contract: 'promo.theme.catalog.read.v1' },
    });
    assertStatus(deprecatedCatalog, 200, 'selección existente deprecated sigue editable');
    assert.equal(deprecatedCatalog.data.current.status, 'deprecated');
    assert.equal(deprecatedCatalog.data.themes.length, 0, 'deprecated no aparece como nueva selección');
    const retiredTheme = await request('/api/pz/promo/private/v1/themes/releases/update', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: releaseBody('deprecated', 'retired'),
    });
    assertStatus(retiredTheme, 200, 'Master retira release sin borrar artefacto');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 200, 'retired conserva serving/rollback retenido');
    const blockedTheme = await request('/api/pz/promo/private/v1/themes/releases/update', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: releaseBody('retired', 'blocked'),
    });
    assertStatus(blockedTheme, 200, 'Master bloquea release vulnerable');
    assertStatus(await request('/api/pz/promo/public/v1/sites/promo-pubcfg-a'), 404, 'blocked falla cerrado sin otro tema');
    assertStatus(await request('/api/pz/promo/private/v1/publication/rollback', {
      token: masterToken, headers: { 'X-PZ-Promo-Store': storeA.id },
      json: {
        contract: 'promo.publication.rollback.v1',
        candidate_revision_id: candidateA.data.candidate.revision_id,
        expected_generation: 12, idempotency_key: 'rollback.blocked.theme',
        reason_code: 'theme_recovery', canonical: { mode: 'platform' },
      },
    }), 409, 'rollback revalida Theme y rechaza release blocked');

    const auditListBody = {
      contract: 'promo.audit.list.v1', page: 1, per_page: 50,
      filters: { action: 'promo.draft.update' },
    };
    const primaryAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryAuth.data.token, json: auditListBody,
    });
    assertStatus(primaryAudit, 200, 'principal lee auditoría Promo saneada');
    assert.equal(primaryAudit.data.contract, 'promo.audit.list.v1');
    assert.equal(primaryAudit.data.events.length, 3);
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
    assert.equal(localizationAudit.data.events.length, 3);
    assert.equal(localizationAudit.data.events.every((event) => event.module === 'localization'), true);
    assert.equal(JSON.stringify(localizationAudit.data).includes('Edición secundaria'), false);
    const themeSelectionAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.audit.list.v1', page: 1, per_page: 50,
        filters: { action: 'promo.theme.selection.update' },
      },
    });
    assertStatus(themeSelectionAudit, 200, 'selección Theme usa writer AUDIT');
    assert.equal(themeSelectionAudit.data.events.length, 1);
    assert.equal(themeSelectionAudit.data.events[0].severity, 'critical');
    const rollbackAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.audit.list.v1', page: 1, per_page: 50,
        filters: { action: 'promo.publication.rollback' },
      },
    });
    assertStatus(rollbackAudit, 200, 'rollback usa writer AUDIT central');
    assert.equal(rollbackAudit.data.events.length, 1);
    assert.equal(rollbackAudit.data.events[0].severity, 'critical');
    assert.equal(rollbackAudit.data.events[0].after.reason_code, 'content_correction');
    assert.equal(JSON.stringify(rollbackAudit.data).includes('idempotency'), false);
    const publishAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.audit.list.v1', page: 1, per_page: 50,
        filters: { action: 'promo.publication.publish' },
      },
    });
    assertStatus(publishAudit, 200, 'publicaciones exitosas generan AUDIT tenant-scoped');
    assert.equal(publishAudit.data.events.length, 3, 'replay/CAS rechazado no duplican eventos exitosos A');
    const securityAudit = await request('/api/pz/promo/private/v1/audit/list', {
      token: primaryAuth.data.token,
      json: {
        contract: 'promo.audit.list.v1', page: 1, per_page: 50,
        filters: { action: 'promo.security.reject' },
      },
    });
    assertStatus(securityAudit, 200, 'rechazos de transición usan AUDIT central tenant-scoped');
    assert.equal(securityAudit.data.events.length, 4, 'quota, binding foráneo, media retirada y theme bloqueado');
    assert.equal(securityAudit.data.events.every((event) => event.module === 'security'), true);
    assert.equal(JSON.stringify(securityAudit.data).includes('rollback.retired.media'), false);
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
    const themeReleaseAudits = await request('/api/collections/promo_audit_events/records?filter=action%3D%22promo.theme.release.update%22', {
      token: superToken,
    });
    assertStatus(themeReleaseAudits, 200, 'superuser verifica audit global Theme temporal');
    assert.equal(themeReleaseAudits.data.items.length, 3);
    assert.equal(themeReleaseAudits.data.items.every((item) => !item.site && item.scope_key === 'global'), true);
    assert.equal(JSON.stringify(themeReleaseAudits.data.items).includes('manifest_sha256'), false);

    await stopPocketBase(runtime);
    runtime = null;
    const generationMigrationDown = runPocketBase(
      ['migrate', 'down', '1'], dataDirectory, environment, 'y\n',
    );
    assert.equal(generationMigrationDown.error, undefined);
    assert.match(
      `${generationMigrationDown.stdout}\n${generationMigrationDown.stderr}`,
      /unsafe_rollback_promo_publication_zero_generation/,
      'down de compatibilidad aborta al encontrar el evento válido generation cero',
    );

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
