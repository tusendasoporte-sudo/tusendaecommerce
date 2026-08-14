import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildStorefrontMulticastMessage,
  classifyFirebaseDeliveryError,
  firebaseRetryAfterSeconds,
  normalizePushRelayV2Payload,
  normalizePushRelayV2Result,
} from '../src/lib/pushRelayV2Payload.ts';

const payload = () => ({
  app: {
    app_key: 'powerzona',
    firebase_app_id: '1:115337530324:android:8d3f78f8a93cdc1ea8e441',
    package_name: 'com.tusenda84.powerzona',
  },
  message: {
    schema_version: '1',
    channel: 'storefront',
    store_key: 'powerzona',
    campaign_id: 'campaign0000001',
    title: 'Oferta PowerZona',
    body: 'Creatina con descuento por tiempo limitado.',
    image_url: 'https://media.example/api/pz/storefront/v1/media/file/media0000000001/a.webp',
    target_type: 'product',
    target_path: '/t/powerzona/producto/creatina',
  },
  deliveries: [{ delivery_id: 'delivery0000001', fid: 'abcdefghijklmnopqrstuv' }],
});

test('normaliza un lote storefront exacto sin cruzar app ni paquete', () => {
  assert.deepEqual(normalizePushRelayV2Payload(payload()), payload());
  const wrongStore = payload();
  wrongStore.message.store_key = 'otra-tienda';
  assert.equal(normalizePushRelayV2Payload(wrongStore), null);
  const duplicate = payload();
  duplicate.deliveries.push({ delivery_id: 'delivery0000002', fid: duplicate.deliveries[0].fid });
  assert.equal(normalizePushRelayV2Payload(duplicate), null);
});

test('rechaza campos extra, destinos administrativos, URL no HTTPS y más de 500 FID', () => {
  assert.equal(normalizePushRelayV2Payload({ ...payload(), injected: true }), null);
  const admin = payload();
  admin.message.target_path = '/t/powerzona/admin';
  assert.equal(normalizePushRelayV2Payload(admin), null);
  const image = payload();
  image.message.image_url = 'http://media.example/a.webp';
  assert.equal(normalizePushRelayV2Payload(image), null);
  const oversized = payload();
  oversized.deliveries = Array.from({ length: 501 }, (_, index) => ({
    delivery_id: `d${String(index).padStart(14, '0')}`,
    fid: `fid_${String(index).padStart(16, '0')}`,
  }));
  assert.equal(normalizePushRelayV2Payload(oversized), null);
});

test('el mensaje FCM usa restrictedPackageName, tag estable e imagen híbrida', () => {
  const normalized = normalizePushRelayV2Payload(payload());
  const message = buildStorefrontMulticastMessage(normalized);
  assert.equal(message.android.restrictedPackageName, 'com.tusenda84.powerzona');
  assert.equal(message.android.notification.tag, 'pz_storefront_campaign0000001');
  assert.equal(message.android.collapseKey, 'pz_storefront_campaign0000001');
  assert.equal(message.notification.imageUrl, payload().message.image_url);
  assert.equal(message.data.channel, 'storefront');
});

test('clasifica FID inválido, fallos transitorios con Retry-After y permanentes', () => {
  assert.deepEqual(
    classifyFirebaseDeliveryError({ code: 'messaging/registration-token-not-registered' }),
    { status: 'invalid_fid', error_code: 'messaging/registration-token-not-registered', retry_after_seconds: 0 },
  );
  const transient = classifyFirebaseDeliveryError({ code: 'messaging/quota-exceeded', retryAfter: '120' });
  assert.equal(transient.status, 'failed_transient');
  assert.equal(transient.retry_after_seconds, 120);
  assert.equal(classifyFirebaseDeliveryError({ code: 'messaging/mismatched-credential' }).status, 'failed_permanent');
  assert.equal(firebaseRetryAfterSeconds({ retryAfter: '999999' }), 3600);
});

test('valida resultados por delivery sin aceptar IDs, estados o campos inyectados', () => {
  const allowed = new Set(['delivery0000001']);
  assert.deepEqual(normalizePushRelayV2Result({
    delivery_id: 'delivery0000001',
    status: 'accepted',
    firebase_message_id: 'projects/p/messages/1',
    error_code: '',
    retry_after_seconds: 0,
  }, allowed), {
    delivery_id: 'delivery0000001',
    status: 'accepted',
    firebase_message_id: 'projects/p/messages/1',
    error_code: '',
    retry_after_seconds: 0,
  });
  assert.equal(normalizePushRelayV2Result({
    delivery_id: 'delivery0000009', status: 'accepted', firebase_message_id: 'x', error_code: '', retry_after_seconds: 0,
  }, allowed), null);
});

test('v2 usa credenciales y secreto storefront sin modificar el relay administrativo v1', () => {
  const v2 = readFileSync(new URL('../src/pages/api/internal/push/v2/send.ts', import.meta.url), 'utf8');
  const v1 = readFileSync(new URL('../src/pages/api/internal/push/send.ts', import.meta.url), 'utf8');
  assert.match(v2, /PZ_STOREFRONT_PUSH_RELAY_SECRET/);
  assert.match(v2, /PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(v2, /firebase_send_ambiguous/);
  assert.match(v1, /PZ_PUSH_RELAY_SECRET/);
  assert.doesNotMatch(v1, /STOREFRONT/);
});
