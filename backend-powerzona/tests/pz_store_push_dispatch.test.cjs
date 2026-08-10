const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const push = require('../pb_hooks/pz_store_push_dispatch_lib.js');

function record(values) {
  return {
    id: values.id,
    get(key) { return values[key]; },
    getString(key) { return String(values[key] ?? ''); },
  };
}

test('normaliza solo los datos necesarios para una notificacion Android', () => {
  assert.deepEqual(push.normalizeNotificationPayload(record({
    id: 'notification001',
    store: 'store0000000001',
    type: 'new_order',
    title: 'Nuevo pedido',
    message: 'Pedido #104 listo para revisar',
    target_url: '/t/tienda/admin/orders/order000000001',
    priority: 'critical',
  })), {
    id: 'notification001',
    store_id: 'store0000000001',
    type: 'new_order',
    title: 'Nuevo pedido',
    body: 'Pedido #104 listo para revisar',
    target_url: '/t/tienda/admin/orders/order000000001',
    priority: 'critical',
  });
});

test('reemplaza enlaces externos y prioridades desconocidas por valores seguros', () => {
  const normalized = push.normalizeNotificationPayload(record({
    id: 'notification001',
    store: 'store0000000001',
    type: 'system_warning',
    title: 'Aviso',
    message: 'Revisa el panel',
    target_url: 'https://evil.example/phishing',
    priority: 'urgent',
  }));
  assert.equal(normalized.target_url, '/admin');
  assert.equal(normalized.priority, 'normal');
});

test('el relay exige HTTPS, salvo autorizacion explicita para una red privada', () => {
  assert.equal(push.validRelayUrl('https://admin.example/api/internal/push/send', false), 'https://admin.example/api/internal/push/send');
  assert.equal(push.validRelayUrl('http://frontend:4321/api/internal/push/send', false), '');
  assert.equal(push.validRelayUrl('http://frontend:4321/api/internal/push/send', true), 'http://frontend:4321/api/internal/push/send');
});

test('la configuracion exige un secreto compartido de al menos 32 caracteres', () => {
  const values = {
    PZ_PUSH_RELAY_URL: 'https://admin.example/api/internal/push/send',
    PZ_PUSH_RELAY_SECRET: 'a'.repeat(32),
    PZ_PUSH_RELAY_ALLOW_HTTP: '0',
  };
  assert.deepEqual(push.relayConfig((key) => values[key]), {
    url: values.PZ_PUSH_RELAY_URL,
    secret: values.PZ_PUSH_RELAY_SECRET,
  });
  values.PZ_PUSH_RELAY_SECRET = 'short';
  assert.equal(push.relayConfig((key) => values[key]), null);
});

test('solo acepta IDs invalidos devueltos dentro del lote enviado', () => {
  const sent = [
    { id: 'device000000001', fid: 'abcdefghijklmnop', app_id: 'com.tusenda84.admin' },
    { id: 'device000000002', fid: 'qrstuvwxyzABCDEF', app_id: 'com.tusenda84.admin' },
  ];
  const result = push.validInvalidDeviceIds({
    statusCode: 200,
    json: { ok: true, invalid_device_ids: ['device000000002', 'foreign-device'] },
  }, sent);
  assert.deepEqual(result, ['device000000002']);
});

test('los avisos de vencimiento conservan el permiso especializado', () => {
  assert.equal(push.isExpirationType('product_expired'), true);
  assert.equal(push.isExpirationType('variation_expiring_soon'), true);
  assert.equal(push.isExpirationType('new_order'), false);
});

test('el hook se activa unicamente tras crear una notificacion de tienda', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_store_push_dispatch.pb.js'),
    'utf8',
  );
  assert.match(source, /onRecordAfterCreateSuccess/);
  assert.match(source, /"store_notifications"/);
  assert.match(source, /continueNotificationCreated/);
});
