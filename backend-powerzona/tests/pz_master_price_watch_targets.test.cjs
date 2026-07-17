const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const priceWatch = require('../pb_hooks/pz_master_price_watch_lib.js');
const read = (relative) => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
const priceSource = read('pb_hooks/pz_master_price_watch_lib.js');
const routesSource = read('pb_hooks/pz_master_price_watch.pb.js');
const notificationsSource = read('pb_hooks/pz_master_notifications_lib.js');
const overviewSource = read('pb_hooks/pz_master_overview_lib.js');
const migrationSource = read('pb_migrations/1783387000_master_price_watch_targets.js');
const deletionSource = read('pb_hooks/pz_master_store_deletion_lib.js');

function productSnapshot(effective) {
  return {
    has_variations: false,
    product: { regular: effective, offer_active: false, offer: 0, effective },
    variations: [],
    active_range: { min: 0, max: 0 },
  };
}

function variationSnapshot(prices) {
  return {
    has_variations: true,
    product: { regular: 0, offer_active: false, offer: 0, effective: 0 },
    variations: prices.map((effective, index) => ({
      id: `variation00000${index}`.slice(0, 15), active: true, regular: effective,
      offer_active: false, offer: 0, effective,
    })),
    active_range: { min: Math.min(...prices), max: Math.max(...prices) },
  };
}

test('el helper central usa precio efectivo simple y mínimo de variaciones activas válidas', () => {
  assert.equal(priceWatch.effectivePriceFromSnapshot(productSnapshot(35.99)), 35.99);
  assert.equal(priceWatch.effectivePriceFromSnapshot(variationSnapshot([42, 29.5, 31])), 29.5);
  const snapshot = variationSnapshot([10, 20]);
  snapshot.variations[0].active = false;
  assert.equal(priceWatch.effectivePriceFromSnapshot(snapshot), 20);
});

test('precio cero nunca alcanza el objetivo y la igualdad sí es crítica', () => {
  const configuration = { enabled: true, price: 30 };
  assert.equal(priceWatch.targetMetForPrice(configuration, 0), false);
  assert.equal(priceWatch.targetMetForPrice(configuration, 30), true);
  assert.equal(priceWatch.targetMetForPrice(configuration, 29.99), true);
  assert.equal(priceWatch.targetMetForPrice(configuration, 30.01), false);
  assert.equal(priceWatch.targetMetForPrice({ enabled: false, price: 30 }, 20), false);
});

test('cada transición produce un solo tono y el regreso por encima vuelve a normal', () => {
  const change = { summary: 'Precio de variación cambió' };
  const configuration = { enabled: true, price: 30 };
  const above = priceWatch.priceNotificationCopy(change, productSnapshot(35), productSnapshot(34.5), configuration, 'Creatina', false);
  const equal = priceWatch.priceNotificationCopy(change, productSnapshot(34.5), productSnapshot(30), configuration, 'Creatina', false);
  const belowAgain = priceWatch.priceNotificationCopy(change, productSnapshot(29.5), productSnapshot(28), configuration, 'Creatina', false);
  const returned = priceWatch.priceNotificationCopy(change, productSnapshot(28), productSnapshot(32), configuration, 'Creatina', false);
  assert.equal(above.tone, 'normal');
  assert.equal(equal.tone, 'critical');
  assert.match(equal.title, /Precio objetivo alcanzado/);
  assert.equal(belowAgain.tone, 'critical');
  assert.match(belowAgain.title, /Precio bajo el objetivo/);
  assert.equal(returned.tone, 'normal');
  assert.match(returned.title, /Precio por encima del objetivo/);
});

test('un cambio de un centavo notifica y no existe margen mínimo de cinco dólares', () => {
  const copy = priceWatch.priceNotificationCopy(
    { summary: 'Cambio real' }, productSnapshot(36), productSnapshot(35.99),
    { enabled: false, price: 0 }, 'Producto', false,
  );
  assert.equal(copy.type, 'product_price_changed');
  assert.equal(copy.tone, 'normal');
  assert.match(copy.message, /\$36\.00 a \$35\.99/);
  assert.doesNotMatch(priceSource, /MINIMUM_PRICE|PRICE_MARGIN|>=\s*5|>\s*5/);
});

test('payloads privados son exactos y validan precio, precisión e inyección', () => {
  const id = 'watchtest000001';
  assert.deepEqual(priceWatch.parseWatchDetailPayload({ watch_id: id, page: 1 }), { watchId: id, page: 1 });
  assert.equal(priceWatch.parseWatchDetailPayload({ watch_id: id, page: 1, store_id: 'storetest000001' }), null);
  assert.equal(priceWatch.parseWatchTargetPayload({ watch_id: id, target_alert_enabled: true, target_price_usd: 30 }).error, '');
  assert.equal(priceWatch.parseWatchTargetPayload({ watch_id: id, target_alert_enabled: true, target_price_usd: 30.001 }).error, 'invalid_target_price');
  assert.equal(priceWatch.parseWatchTargetPayload({ watch_id: id, target_alert_enabled: true, target_price_usd: 0 }).error, 'invalid_target_price');
  assert.equal(priceWatch.parseWatchTargetPayload({ watch_id: id, target_alert_enabled: false, target_price_usd: 0 }).error, '');
  assert.equal(priceWatch.parseWatchTargetPayload({ watch_id: id, target_alert_enabled: true, target_price_usd: 30, store_id: 'storetest000001' }).error, 'invalid_payload');
});

test('migración agrega snapshots, tone, backfill normal y down conservador', () => {
  for (const field of [
    'target_alert_enabled', 'target_price_usd', 'target_updated_at', 'target_updated_by',
    'target_alert_enabled_snapshot', 'target_price_usd_snapshot', 'target_met_snapshot',
    'effective_price_after_usd', 'notification_tone', 'tone',
  ]) assert.match(migrationSource, new RegExp(`"${field}"`));
  assert.match(migrationSource, /UPDATE master_product_price_events[\s\S]*notification_tone = 'normal'/);
  assert.match(migrationSource, /UPDATE master_notifications SET tone = 'normal'/);
  assert.match(migrationSource, /removeIndex\(watches, TARGET_INDEX\)/);
  assert.doesNotMatch(migrationSource, /app\.delete\(.*master_product_(?:watches|price_events)/);
});

test('evento guarda snapshots, dedupe y una notificación dirigida al watch', () => {
  assert.match(priceSource, /eventExists\(app, dedupeKey\)/);
  assert.match(priceSource, /event\.set\("target_met_snapshot", notification\.targetMet\)/);
  assert.match(priceSource, /event\.set\("notification_tone", notification\.tone\)/);
  assert.match(priceSource, /watchId: watch\.id/);
  assert.match(notificationsSource, /actionUrl: `\/master\/price-watch\/\$\{encodeURIComponent\(watchId\)\}`/);
  assert.match(notificationsSource, /const priceEvent = data\.type === "product_price_changed" \|\| data\.type === "product_price_target_reached"/);
  assert.match(notificationsSource, /const grouped = priceEvent \? null/);
  assert.match(notificationsSource, /notification\.set\("event_count", 1\)/);
});

test('rutas privadas, actividad y listado usan el id del seguimiento', () => {
  assert.match(routesSource, /\/api\/pz\/master\/product-watch-detail/);
  assert.match(routesSource, /\/api\/pz\/master\/product-watch-target/);
  assert.match(routesSource, /bodyLimit\(1024\)/);
  assert.match(routesSource, /skipSuccessActivityLog/);
  assert.match(overviewSource, /'\/master\/price-watch\/' \|\| watch/);
  assert.match(overviewSource, /action_url: safeActionUrl\(`\/master\/price-watch\/\$\{String\(row\.watchId\)\}`\)/);
});

test('el borrado de tienda conserva conteos y eliminación de watches, eventos y notificaciones', () => {
  assert.match(deletionSource, /price_watches/);
  assert.match(deletionSource, /price_events/);
  assert.match(deletionSource, /master_notifications/);
  assert.match(deletionSource, /deleteExpected\(app, "master_product_watches"/);
});
