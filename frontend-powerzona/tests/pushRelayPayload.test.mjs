import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  androidMessagePriority,
  groupDevicesByAppId,
  isInvalidInstallationError,
  normalizeRelayPayload,
} from '../src/lib/pushRelayPayload.js';

const payload = () => ({
  notification: {
    id: 'notification001',
    store_id: 'store0000000001',
    type: 'new_order',
    title: 'Nuevo pedido',
    body: 'Pedido #104 listo para revisar',
    target_url: '/t/tienda/admin/orders/order000000001',
    priority: 'important',
  },
  devices: [{
    id: 'device000000001',
    fid: 'abcdefghijklmnop',
    app_id: 'com.tusenda84.admin',
  }],
});

test('acepta un lote FID valido y conserva un enlace interno', () => {
  assert.deepEqual(normalizeRelayPayload(payload()), payload());
});

test('rechaza campos adicionales, FID invalido y lotes vacios', () => {
  assert.equal(normalizeRelayPayload({ ...payload(), injected: true }), null);
  const badFid = payload();
  badFid.devices[0].fid = 'short';
  assert.equal(normalizeRelayPayload(badFid), null);
  const empty = payload();
  empty.devices = [];
  assert.equal(normalizeRelayPayload(empty), null);
});

test('sanea enlaces externos antes de enviarlos a Android', () => {
  const value = payload();
  value.notification.target_url = 'https://evil.example/phishing';
  assert.equal(normalizeRelayPayload(value).notification.target_url, '/admin');
});

test('agrupa por package ID para restrictedPackageName', () => {
  const devices = [
    { id: 'one', fid: 'abcdefghijklmnop', app_id: 'com.tusenda84.admin' },
    { id: 'two', fid: 'qrstuvwxyzABCDEF', app_id: 'com.example.other' },
  ];
  const groups = groupDevicesByAppId(devices);
  assert.equal(groups.size, 2);
  assert.equal(groups.get('com.tusenda84.admin')[0].id, 'one');
});

test('pedidos, seguridad y prioridad importante usan entrega Android alta', () => {
  assert.equal(androidMessagePriority({ type: 'new_order', priority: 'normal' }), 'high');
  assert.equal(androidMessagePriority({ type: 'security_warning', priority: 'normal' }), 'high');
  assert.equal(androidMessagePriority({ type: 'review_pending', priority: 'normal' }), 'normal');
  assert.equal(androidMessagePriority({ type: 'review_pending', priority: 'important' }), 'high');
});

test('solo invalida errores permanentes de instalacion', () => {
  assert.equal(isInvalidInstallationError({ code: 'messaging/installation-id-not-registered' }), true);
  assert.equal(isInvalidInstallationError({ code: 'messaging/internal-error' }), false);
});

test('el puente Android no devuelve el FID directamente a frames del WebView', () => {
  const bridgeSource = readFileSync(
    new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/AdminPushBridge.java', import.meta.url),
    'utf8',
  );
  const activitySource = readFileSync(
    new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/MainActivity.java', import.meta.url),
    'utf8',
  );
  assert.equal(bridgeSource.includes('public String installationId()'), false);
  assert.equal(bridgeSource.includes('PushRegistrationStore.getInstallationId'), false);
  assert.match(bridgeSource, /public void requestState\(\)/);
  assert.match(activitySource, /pz:android-push-state/);
  assert.match(activitySource, /isAllowedWebHost\(current\.getHost\(\)\)/);
});
