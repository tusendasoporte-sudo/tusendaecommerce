'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const STORE = 'storeanalytic01';
const INSTALLATION = 'installanalyt01';
const CAMPAIGN = 'campaignanal001';
const DELIVERY = 'deliveryanal001';
const COUPON = 'couponanalyt001';
const ORDER = 'orderanalyt0001';
const NOW = new Date('2026-08-15T12:00:00.000Z');
const BACKEND_DIR = path.resolve(__dirname, '..');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');

class FakeRecord {
  constructor(collection, values = {}) {
    this.collectionName = collection?.name || collection;
    this.values = { ...values };
    this.id = String(values.id || '');
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) { if (key === 'id') this.id = String(value || ''); else this.values[key] = value; }
}

global.Record = FakeRecord;
global.DynamicModel = class DynamicModel { constructor(values) { Object.assign(this, values); } };
global.arrayOf = () => [];

const analytics = require('../pb_hooks/pz_storefront_analytics_lib.js');
const activity = require('../pb_hooks/pz_store_activity_audit_lib.js');
const storeAnalytics = require('../pb_hooks/pz_store_analytics_lib.js');

function record(collection, id, values = {}) {
  return new FakeRecord(collection, { id, ...values });
}

function createApp() {
  const names = [
    'stores', 'storefront_app_configs', 'storefront_installations', 'push_campaigns',
    'push_campaign_deliveries', 'push_events', 'push_daily_stats', 'manual_coupons',
    'orders', 'storefront_order_links',
  ];
  const collections = new Map(names.map((name) => [name, { name }]));
  const tables = new Map(names.map((name) => [name, []]));
  let nextId = 1;
  const rows = (name) => tables.get(name) || [];
  const add = (item) => {
    const table = rows(item.collectionName);
    const index = table.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) table[index] = item; else table.push(item);
    return item;
  };
  const relation = (item, key) => String(item.get(key) || '');
  const matches = (item, filter, params) => {
    const map = {
      store: 'store', installation: 'installation', key: 'idempotency_key', delivery: 'delivery',
      campaign: 'campaign', coupon: 'coupon', order: 'order', status: 'status', scopeKey: 'scope_key', day: 'day_key',
    };
    for (const [key, value] of Object.entries(params || {})) {
      if (key === 'coupon' && String(filter).includes('campaign.target_coupon')) continue;
      const field = key === 'campaign' && String(filter).includes('campaign_id_snapshot')
        ? 'campaign_id_snapshot'
        : map[key];
      if (field && relation(item, field) !== String(value)) return false;
    }
    if (String(filter).includes('delete_after <= {:now}') && params.now) {
      const expiry = new Date(item.getString('delete_after')).getTime();
      if (!Number.isFinite(expiry) || expiry > new Date(params.now).getTime()) return false;
    }
    if (String(filter).includes('attribution_source != ""')) {
      const source = item.getString('attribution_source');
      if (!source || source === 'none') return false;
    }
    const types = [...String(filter).matchAll(/event_type\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
    if (types.length && !types.includes(item.getString('event_type'))) return false;
    const statuses = [...String(filter).matchAll(/status\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
    if (statuses.length && !statuses.includes(item.getString('status'))) return false;
    if (params.cutoff || params.end) {
      const lastSeen = new Date(item.getString('last_seen_at')).getTime();
      if (!Number.isFinite(lastSeen)) return false;
      if (params.cutoff && lastSeen < new Date(params.cutoff).getTime()) return false;
      if (params.end && lastSeen > new Date(params.end).getTime()) return false;
    }
    if (String(filter).includes('scope = "campaign_funnel"') && item.getString('scope') !== 'campaign_funnel') return false;
    if (String(filter).includes('scope = "store_installations"') && item.getString('scope') !== 'store_installations') return false;
    if (String(filter).includes('campaign.target_coupon') && params.coupon) {
      const campaign = rows('push_campaigns').find((candidate) => candidate.id === relation(item, 'campaign'));
      if (!campaign || relation(campaign, 'target_coupon') !== String(params.coupon)) return false;
    }
    return true;
  };
  const app = {
    rows, add,
    findCollectionByNameOrId(name) {
      if (!collections.has(name)) throw new Error('collection_not_found');
      return collections.get(name);
    },
    findRecordById(collection, id) {
      const found = rows(collection).find((item) => item.id === id);
      if (!found) throw new Error('record_not_found');
      return found;
    },
    findFirstRecordByFilter(collection, filter, params = {}) {
      const found = rows(collection).find((item) => matches(item, filter, params));
      if (!found) throw new Error('record_not_found');
      return found;
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params = {}) {
      const result = rows(collection).filter((item) => matches(item, filter, params));
      if (String(sort).startsWith('-received_at')) {
        result.sort((a, b) => b.getString('received_at').localeCompare(a.getString('received_at')));
      } else if (String(sort).startsWith('-last_seen_at')) {
        result.sort((a, b) => b.getString('last_seen_at').localeCompare(a.getString('last_seen_at'))
          || b.id.localeCompare(a.id));
      }
      return result.slice(offset, offset + limit);
    },
    save(item) {
      if (!item.id) item.id = `event${String(nextId++).padStart(10, '0')}`.slice(0, 15);
      return add(item);
    },
    delete(item) {
      const table = rows(item.collectionName);
      const index = table.indexOf(item);
      if (index >= 0) table.splice(index, 1);
    },
    db() { throw new Error('sql_unavailable'); },
  };
  add(record('stores', STORE, { status: 'active' }));
  add(record('storefront_app_configs', 'appanalytic0001', {
    store: STORE, status: 'active', store_path_prefix: '/t/powerzona',
    app_key: 'powerzona-storefront-staging', package_name: 'com.tusenda84.powerzona',
  }));
  add(record('storefront_installations', INSTALLATION, {
    store: STORE, app_config: 'appanalytic0001', status: 'active', first_seen_at: '2026-08-10T12:00:00.000Z',
    last_seen_at: '2026-08-14T12:00:00.000Z',
    notification_permission: 'granted', app_version: '1.0.0', android_version: '16', device_model: 'Pixel',
  }));
  add(record('manual_coupons', COUPON, {
    store: STORE, code: 'APP10', active: true, unlimited_uses: true,
    starts_at: '2026-08-01T00:00:00.000Z', ends_at: '2026-09-01T00:00:00.000Z',
  }));
  add(record('push_campaigns', CAMPAIGN, {
    store: STORE, status: 'sent', target_type: 'coupon', target_path: '/t/powerzona?coupon=APP10',
    target_coupon: COUPON,
  }));
  add(record('push_campaign_deliveries', DELIVERY, {
    store: STORE, campaign: CAMPAIGN, installation: INSTALLATION, status: 'accepted',
    accepted_at: '2026-08-14T12:00:00.000Z', delete_after: '2026-11-12T12:00:00.000Z',
  }));
  return app;
}

function resolved(app) {
  return { storeId: STORE, installation: app.findRecordById('storefront_installations', INSTALLATION) };
}

function nativePayload(eventType, targetPath = '') {
  return {
    eventType, deliveryId: DELIVERY, idempotencyKey: `${eventType}:${DELIVERY}`,
    clientOccurredAt: NOW.toISOString(), targetPath,
  };
}

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

function startPocketBase(dataDirectory, hooksDirectory, port) {
  let output = '';
  const child = spawn(
    POCKETBASE_EXE,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      `--dir=${dataDirectory}`,
      `--hooksDir=${hooksDirectory}`,
      `--migrationsDir=${MIGRATIONS_DIR}`,
      '--hooksWatch=false',
      '--hooksPool=2',
      '--automigrate=true',
      '--indexFallback=false',
    ],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PZ_STOREFRONT_INTERNAL_SECRET: 'runtime-internal-c09-abcdefghijklmnopqrstuvwxyz',
        PZ_STOREFRONT_CREDENTIAL_SECRET: 'runtime-credential-c09-abcdefghijklmnopqrstuvwxyz',
        PZ_SECURITY_HMAC_SECRET: 'runtime-security-hmac-c09-abcdefghijklmnopqrstuvwxyz',
        PZ_SECURITY_AES_KEY: '12345678901234567890123456789012',
        PZ_PUSH_RELAY_SECRET: 'runtime-relay-c09-abcdefghijklmnopqrstuvwxyz',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-50_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  return { child, output: () => output };
}

async function waitForPocketBase(runtime, baseUrl) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
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

test('normaliza rutas sin depender del constructor URL de Node o navegador', () => {
  const originalUrl = globalThis.URL;
  globalThis.URL = undefined;
  try {
    assert.equal(
      analytics.canonicalPath('/t/powerzona/producto/audifnos'),
      '/t/powerzona/producto/audifnos',
    );
    assert.equal(analytics.canonicalPath('/t/powerzona/?coupon=APP10'), '/t/powerzona?coupon=APP10');
    assert.equal(analytics.canonicalPath('/t/powerzona/producto/audifnos#detalle'), '');
    assert.equal(analytics.canonicalPath('/t/powerzona/../admin'), '');
    assert.equal(analytics.canonicalPath('/t/powerzona%2Fadmin'), '');
  } finally {
    globalThis.URL = originalUrl;
  }
});

test('runtime PocketBase real normaliza la ruta usada por destination_viewed', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 90_000,
}, async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c09-runtime-'));
  const hooksDirectory = path.join(dataDirectory, 'pb_hooks');
  let runtime = null;
  try {
    fs.cpSync(HOOKS_DIR, hooksDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(hooksDirectory, 'zz_pz_c09_runtime_probe.pb.js'),
      `routerAdd("GET", "/api/pz/tests/c09-canonical-path", (e) => {\n`
        + `  const analytics = require(\`${'${__hooks}'}/pz_storefront_analytics_lib.js\`);\n`
        + '  return e.json(200, {\n'
        + '    product: analytics.canonicalPath("/t/powerzona/producto/audifnos"),\n'
        + '    coupon: analytics.canonicalPath("/t/powerzona/?coupon=APP10"),\n'
        + '    unsafe: analytics.canonicalPath("/t/powerzona/../admin"),\n'
        + '  });\n'
        + '});\n',
      'utf8',
    );
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    runtime = startPocketBase(dataDirectory, hooksDirectory, port);
    await waitForPocketBase(runtime, baseUrl);
    const response = await fetch(`${baseUrl}/api/pz/tests/c09-canonical-path`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(body, {
      product: '/t/powerzona/producto/audifnos',
      coupon: '/t/powerzona?coupon=APP10',
      unsafe: '',
    });
  } finally {
    await stopPocketBase(runtime);
    const resolved = path.resolve(dataDirectory);
    assert.equal(resolved.startsWith(path.resolve(os.tmpdir())), true);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test('opened y destination_viewed son autenticados, ordenados e idempotentes', () => {
  const app = createApp();
  const open = analytics.recordNativeEvent(app, resolved(app), nativePayload('opened'), NOW);
  assert.equal(open.duplicate, false);
  assert.equal(analytics.recordNativeEvent(app, resolved(app), nativePayload('opened'), NOW).duplicate, true);
  assert.throws(
    () => analytics.recordNativeEvent(app, resolved(app), nativePayload('destination_viewed', '/t/powerzona'), NOW),
    (error) => error.code === 'destination_not_verified',
  );
  const destination = analytics.recordNativeEvent(
    app,
    resolved(app),
    nativePayload('destination_viewed', '/t/powerzona?coupon=APP10'),
    new Date(NOW.getTime() + 1000),
  );
  assert.equal(destination.duplicate, false);
  assert.equal(app.rows('push_events').filter((item) => item.getString('event_type') === 'opened').length, 1);
  assert.equal(app.rows('push_events').filter((item) => item.getString('event_type') === 'destination_viewed').length, 1);
});

test('rechaza entrega ajena, no aceptada y evento fuera de siete dÃ­as', () => {
  const app = createApp();
  app.findRecordById('push_campaign_deliveries', DELIVERY).set('status', 'unknown');
  assert.throws(
    () => analytics.recordNativeEvent(app, resolved(app), nativePayload('opened'), NOW),
    (error) => error.code === 'delivery_not_eligible',
  );
  app.findRecordById('push_campaign_deliveries', DELIVERY).set('status', 'accepted');
  assert.throws(
    () => analytics.recordNativeEvent(app, resolved(app), nativePayload('opened'), new Date('2026-08-22T12:00:00.000Z')),
    (error) => error.code === 'event_window_expired',
  );
});

test('cupÃ³n y orden usan la misma instalaciÃ³n, prioridad de cupÃ³n y una atribuciÃ³n por orden', () => {
  const app = createApp();
  analytics.recordNativeEvent(app, resolved(app), nativePayload('opened'), NOW);
  analytics.recordNativeEvent(
    app, resolved(app), nativePayload('destination_viewed', '/t/powerzona?coupon=APP10'),
    new Date(NOW.getTime() + 1000),
  );
  const couponEvent = analytics.recordCouponApplied(app, resolved(app), STORE, 'APP10', new Date(NOW.getTime() + 2000));
  assert.equal(couponEvent.getString('event_type'), 'coupon_applied');
  assert.equal(analytics.recordCouponApplied(app, resolved(app), STORE, 'APP10', new Date(NOW.getTime() + 3000)).id, couponEvent.id);

  const order = app.add(record('orders', ORDER, { store: STORE, status: 'pending', coupon_id: COUPON, coupon_code: 'APP10' }));
  const secureLink = app.add(record('storefront_order_links', 'securelink00001', {
    store: STORE, installation: INSTALLATION, order: ORDER, status: 'active', attribution_source: 'none',
  }));
  const link = analytics.attributeOrder(
    app, resolved(app), order, { couponRecord: app.findRecordById('manual_coupons', COUPON) },
    new Date(NOW.getTime() + 4000),
  );
  assert.equal(link.id, secureLink.id);
  assert.equal(link.getString('attribution_source'), 'coupon');
  assert.equal(link.getString('campaign_id_snapshot'), CAMPAIGN);
  assert.equal(analytics.attributeOrder(app, resolved(app), order, {}, new Date(NOW.getTime() + 5000)).id, link.id);
  assert.equal(app.rows('storefront_order_links').length, 1);
  assert.equal(app.rows('push_events').filter((item) => item.getString('event_type') === 'order_attributed').length, 1);
  const metrics = analytics.campaignMetrics(app, CAMPAIGN, STORE);
  assert.equal(metrics.orders_attributed, 1);
  assert.equal(metrics.buyer_installations, 1);
  assert.equal(metrics.denominators.conversion, 1);
});

test('atribuir una orden nunca reactiva un enlace C07 revocado', () => {
  const app = createApp();
  analytics.recordNativeEvent(app, resolved(app), nativePayload('opened'), NOW);
  analytics.recordNativeEvent(
    app, resolved(app), nativePayload('destination_viewed', '/t/powerzona?coupon=APP10'),
    new Date(NOW.getTime() + 1000),
  );
  const order = app.add(record('orders', ORDER, { store: STORE, status: 'pending' }));
  const revoked = app.add(record('storefront_order_links', 'revokedlink0001', {
    store: STORE, installation: INSTALLATION, order: ORDER, status: 'revoked', attribution_source: 'none',
  }));
  const link = analytics.attributeOrder(app, resolved(app), order, {}, new Date(NOW.getTime() + 2000));
  assert.equal(link.id, revoked.id);
  assert.equal(link.getString('status'), 'revoked');
  assert.equal(link.getString('attribution_source'), 'destination_viewed');
});

test('el snapshot tecnico del cupon mantiene la ventana despues de redactar la campana', () => {
  const app = createApp();
  analytics.recordNativeEvent(app, resolved(app), nativePayload('opened'), NOW);
  analytics.recordNativeEvent(
    app, resolved(app), nativePayload('destination_viewed', '/t/powerzona?coupon=APP10'),
    new Date(NOW.getTime() + 1000),
  );
  app.findRecordById('push_campaigns', CAMPAIGN).set('target_coupon', '');
  const couponEvent = analytics.recordCouponApplied(
    app,
    resolved(app),
    STORE,
    'APP10',
    new Date(NOW.getTime() + 6 * 86_400_000),
  );
  assert.equal(couponEvent.getString('event_type'), 'coupon_applied');
  assert.equal(couponEvent.getString('campaign'), CAMPAIGN);
});

test('mÃ©tricas mantienen denominadores exactos y separan incertidumbre de fallo confirmado', () => {
  const app = createApp();
  app.add(record('push_campaign_deliveries', 'deliveryanal002', {
    store: STORE, campaign: CAMPAIGN, installation: 'otherinstall001', status: 'unknown',
  }));
  app.add(record('push_campaign_deliveries', 'deliveryanal003', {
    store: STORE, campaign: CAMPAIGN, installation: 'otherinstall002', status: 'failed_permanent',
  }));
  analytics.recordNativeEvent(app, resolved(app), nativePayload('opened'), NOW);
  const metrics = analytics.campaignMetrics(app, CAMPAIGN, STORE);
  assert.equal(metrics.selected, 3);
  assert.equal(metrics.accepted, 1);
  assert.equal(metrics.failed_confirmed, 1);
  assert.equal(metrics.unknown, 1);
  assert.deepEqual(metrics.denominators, {
    acceptance: 3, failures: 3, opened: 1, destination_viewed: 1,
    coupon_applied: 0, conversion: 0,
  });
});

test('analÃ­tica de instalaciones usa hoy/7/15/30/90 y bajas como detecciÃ³n tÃ©cnica', () => {
  const app = createApp();
  app.add(record('storefront_installations', 'installanalyt02', {
    store: STORE, status: 'disabled', first_seen_at: '2026-07-01T00:00:00.000Z',
    disabled_at: '2026-08-14T00:00:00.000Z', notification_permission: 'denied',
  }));
  const result = analytics.buildInstallationAnalytics(app, { storeId: STORE }, '90', NOW);
  assert.equal(result.period_days, 90);
  assert.equal(result.active_estimate_window_days, 30);
  assert.equal(result.metrics.instalaciones_vigentes_ahora, 1);
  assert.equal(result.metrics.instalaciones_nuevas, 1);
  assert.equal(result.metrics.bajas_detectadas, 1);
  assert.match(result.measurement_note, /estimación.*30 días/i);
  assert.throws(() => analytics.buildInstallationAnalytics(app, { storeId: STORE }, '365', NOW), /invalid_payload/);
});

test('detalle pagina diez instalaciones activas y solo expone referencias administrativas seguras', () => {
  const app = createApp();
  for (let index = 2; index <= 13; index += 1) {
    app.add(record('storefront_installations', `detail${String(index).padStart(9, '0')}`, {
      store: STORE,
      app_config: 'appanalytic0001',
      status: index === 13 ? 'disabled' : 'active',
      first_seen_at: '2026-08-10T12:00:00.000Z',
      last_seen_at: `2026-08-${String(Math.min(index, 15)).padStart(2, '0')}T11:00:00.000Z`,
      notification_permission: 'granted',
      app_version: `1.${index}.0`,
      android_version: '16',
      device_model: `Modelo ${index}`,
      fid_digest: `private-fid-${index}`,
      app_set_digest: `private-app-set-${index}`,
    }));
  }
  const first = analytics.buildInstallationDetails(
    app,
    { storeId: STORE },
    { page: 1, perPage: 10 },
    NOW,
    { referenceFor: (_storeId, installationId) => `APP-TEST-${installationId.slice(-4).toUpperCase()}` },
  );
  assert.equal(first.page, 1);
  assert.equal(first.per_page, 10);
  assert.equal(first.total_items, 12);
  assert.equal(first.total_pages, 2);
  assert.equal(first.items.length, 10);
  assert.deepEqual(Object.keys(first.items[0]).sort(), [
    'android_version', 'app_version', 'device_model', 'installation_code',
  ]);
  assert.doesNotMatch(
    JSON.stringify(first),
    /fid_digest|app_set_digest|credential|firebase_app_id|app_identifier|package_name/,
  );
  const second = analytics.buildInstallationDetails(
    app,
    { storeId: STORE },
    { page: 2, perPage: 10 },
    NOW,
    { referenceFor: (_storeId, installationId) => `APP-TEST-${installationId.slice(-4).toUpperCase()}` },
  );
  assert.equal(second.items.length, 2);
  assert.deepEqual(analytics.parseInstallationDetailsPayload({ page: 2, per_page: 10 }), { page: 2, perPage: 10 });
  assert.equal(analytics.parseInstallationDetailsPayload({ page: 1, per_page: 20 }), null);
});

test('Hoy y la serie diaria comparten exactamente la zona America/Havana del panel general', () => {
  const app = createApp();
  app.rows('storefront_installations').push(record('storefront_installations', 'installanalyt03', {
    store: STORE, status: 'active', first_seen_at: '2026-08-14T23:30:00.000Z',
    last_seen_at: '2026-08-14T23:30:00.000Z',
    notification_permission: 'granted', app_version: '1.0.0', android_version: '16', device_model: 'Pixel',
  }));
  const beforeMidnightHavana = new Date('2026-08-15T02:00:00.000Z');
  const result = analytics.buildInstallationAnalytics(app, { storeId: STORE }, 'today', beforeMidnightHavana);
  assert.equal(result.time_zone, 'America/Havana');
  assert.equal(result.metrics.instalaciones_nuevas, 1);
  assert.deepEqual(result.daily, [{ day: '2026-08-14', new_installations: 1, bajas_detectadas: 0 }]);
  const aggregate = analytics.upsertStoreDailyStats(app, STORE, beforeMidnightHavana);
  assert.equal(aggregate.getString('day_key'), '2026-08-14');
});

test('limpieza elimina solo eventos, entregas y agregados cuyo plazo técnico de 90 días venció', () => {
  const app = createApp();
  app.rows('push_events').push(
    record('push_events', 'expiredevent001', { store: STORE, campaign: CAMPAIGN, delete_after: '2026-08-15T11:59:59.000Z' }),
    record('push_events', 'futureevent0001', { store: STORE, campaign: CAMPAIGN, delete_after: '2026-08-15T12:00:01.000Z' }),
  );
  app.rows('push_campaign_deliveries').push(record('push_campaign_deliveries', 'expireddeliv001', {
    store: STORE, campaign: CAMPAIGN, installation: INSTALLATION, delete_after: '2026-08-15T12:00:00.000Z',
  }));
  app.rows('push_daily_stats').push(
    record('push_daily_stats', 'expireddaily001', { store: STORE, delete_after: '2026-08-14T00:00:00.000Z' }),
    record('push_daily_stats', 'futuredaily0001', { store: STORE, delete_after: '2026-08-16T00:00:00.000Z' }),
  );
  assert.deepEqual(analytics.cleanupExpiredAnalytics(app, NOW), { events: 1, deliveries: 1, daily_stats: 1 });
  assert.equal(app.rows('push_events').some((item) => item.id === 'futureevent0001'), true);
  assert.equal(app.rows('push_campaign_deliveries').some((item) => item.id === DELIVERY), true);
  assert.equal(app.rows('push_daily_stats').some((item) => item.id === 'futuredaily0001'), true);
});

test('analítica agregada procesa 40 000 instalaciones sin truncar el denominador ni exponer filas', () => {
  const app = createApp();
  const rows = app.rows('storefront_installations');
  for (let index = 0; index < 40_000; index += 1) {
    rows.push(record('storefront_installations', `load${String(index).padStart(11, '0')}`, {
      store: STORE,
      status: index % 10 === 0 ? 'disabled' : 'active',
      first_seen_at: '2026-08-10T12:00:00.000Z',
      last_seen_at: '2026-08-15T11:00:00.000Z',
      disabled_at: index % 10 === 0 ? '2026-08-14T12:00:00.000Z' : '',
      notification_permission: index % 3 === 0 ? 'denied' : 'granted',
      app_version: `1.${index % 5}.0`, android_version: '16', device_model: `Modelo ${index % 4}`,
    }));
  }
  const result = analytics.buildInstallationAnalytics(app, { storeId: STORE }, '90', NOW);
  assert.equal(result.metrics.instalaciones_vigentes_ahora, 36_001);
  assert.equal(result.metrics.instalaciones_nuevas, 36_001);
  assert.equal(result.metrics.bajas_detectadas, 4_000);
  assert.equal(Object.hasOwn(result, 'installations'), false);
  assert.equal(result.distributions.device_models.reduce((sum, item) => sum + item.count, 0), 36_001);
});

test('un fallo de lectura no se presenta como una metrica enganosa en cero', () => {
  const app = createApp();
  app.findRecordsByFilter = () => { throw new Error('database_unavailable'); };
  assert.throws(
    () => analytics.buildInstallationAnalytics(app, { storeId: STORE }, '30', NOW),
    /database_unavailable/,
  );
  assert.throws(
    () => analytics.campaignMetrics(app, CAMPAIGN, STORE),
    /database_unavailable/,
  );
});

test('una lectura Master de agregados queda auditada sin identificadores de instalacion', () => {
  const app = createApp();
  const actor = record('users', 'masteranalyt001', { role: 'master_admin' });
  const originalContext = storeAnalytics.loadStoreContext;
  const originalCreateActivity = activity.createActivity;
  let audit = null;
  storeAnalytics.loadStoreContext = () => ({
    storeId: STORE,
    store: app.findRecordById('stores', STORE),
    actor,
    master: true,
  });
  activity.createActivity = (_app, values) => { audit = values; return values; };
  try {
    const result = analytics.handleInstallationsAnalytics({
      app,
      auth: actor,
      requestInfo: () => ({ auth: actor, body: { range: '7' }, headers: {} }),
      response: { header: () => ({ set() {} }) },
      json: (status, payload) => ({ status, payload }),
    });
    assert.equal(result.status, 200);
    assert.equal(audit.action, 'push_analytics_viewed');
    assert.equal(audit.storeId, STORE);
    assert.deepEqual(audit.newValues, { range: '7' });
    assert.doesNotMatch(JSON.stringify(audit), /fid|credential|token|payload|installation/i);
  } finally {
    storeAnalytics.loadStoreContext = originalContext;
    activity.createActivity = originalCreateActivity;
  }
});
