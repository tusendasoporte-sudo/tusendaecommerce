'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const adminPush = require('../pb_hooks/pz_admin_push_resilience_lib.js');

const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../pb_hooks/pz_admin_push_resilience.pb.js'),
  'utf8',
);
const migrationSource = fs.readFileSync(
  path.resolve(__dirname, '../pb_migrations/1788448300_admin_push_resilience.js'),
  'utf8',
);

const security = {
  sha256(value) {
    return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
  },
  randomHex(length) {
    return 'a'.repeat(length);
  },
};

function registerPayload(overrides = {}) {
  return {
    installation_id: '123e4567-e89b-42d3-a456-426614174000',
    firebase_installation_id: '',
    app_id: 'com.tusenda84.admin',
    device_label: 'Pixel QA',
    os_version: 'Android 16 (API 36)',
    app_version: '2.0.0',
    app_version_code: 8,
    notification_permission: 'prompt',
    notifications_enabled: false,
    credential_required: true,
    ...overrides,
  };
}

test('el registro Admin nace de UUID local aunque Firebase y el permiso estén pendientes', () => {
  const parsed = adminPush.parseRegisterPayload(registerPayload());
  assert.ok(parsed);
  assert.equal(parsed.installationId, '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(parsed.firebaseInstallationId, '');
  assert.equal(parsed.notificationPermission, 'prompt');
  assert.equal(parsed.notificationsEnabled, false);
  assert.equal(adminPush.parseRegisterPayload({ ...registerPayload(), injected: true }), null);
  assert.equal(adminPush.parseRegisterPayload(registerPayload({ installation_id: 'firebase-token' })), null);
});

test('credencial, UUID y Firebase usan dominios criptográficos separados', () => {
  const credential = adminPush.createCredential(security);
  assert.match(credential, adminPush.CREDENTIAL_PATTERN);
  const uuidDigest = adminPush.installationUuidDigest(
    '123e4567-e89b-42d3-a456-426614174000',
    security,
  );
  const firebaseDigest = adminPush.firebaseInstallationDigest('abcdefghijklmnop', security);
  const secretDigest = adminPush.credentialDigest(credential, security);
  assert.match(uuidDigest, /^[a-f0-9]{64}$/);
  assert.equal(new Set([uuidDigest, firebaseDigest, secretDigest]).size, 3);
});

test('sync y recibos rechazan campos laxos y conservan el origen de entrega', () => {
  assert.deepEqual(
    adminPush.parseSyncPayload({ delivery_trigger: 'workmanager' }),
    { trigger: 'workmanager' },
  );
  assert.equal(adminPush.parseSyncPayload({ delivery_trigger: 'fcm' }), null);
  const parsed = adminPush.parseReceiptPayload({
    receipts: [{
      notification_id: 'n'.repeat(15),
      state: 'native_delivered',
      occurred_at: '2026-09-04T12:00:00.000Z',
      delivery_trigger: 'resume_sync',
    }],
  });
  assert.equal(parsed.receipts[0].trigger, 'resume_sync');
  assert.equal(adminPush.parseReceiptPayload({
    receipts: [{
      notification_id: 'n'.repeat(15),
      state: 'read',
      occurred_at: '2026-09-04T12:00:00.000Z',
      delivery_trigger: 'fcm',
    }],
  }), null);
});

test('pausar bloquea nuevas entregas pero permite confirmar una ya recibida', () => {
  const context = {
    store: { id: 's'.repeat(15) },
    user: { id: 'u'.repeat(15) },
    device: { notifications_enabled: false },
  };
  const notification = {
    id: 'n'.repeat(15),
    store: 's'.repeat(15),
    type: 'new_order',
  };
  assert.equal(adminPush.canAccessNotification({}, context, notification), true);
  assert.equal(adminPush.canReceiveNotification({}, context, notification), false);
  context.device.notifications_enabled = true;
  assert.equal(adminPush.canReceiveNotification({}, context, notification), true);
});

test('leer desde Android cierra el aviso y los recibos obsoletos no bloquean la cola', () => {
  class FakeRecord {
    constructor(_collection, values = {}) {
      Object.assign(this, values);
    }
    get(key) { return this[key]; }
    set(key, value) { this[key] = value; }
  }
  const notification = new FakeRecord(null, {
    id: 'n'.repeat(15),
    store: 's'.repeat(15),
    type: 'new_order',
    status: 'unread',
    read_at: '',
  });
  const storedReceipts = [];
  const app = {
    findRecordById(collection, id) {
      if (collection === adminPush.NOTIFICATIONS && id === notification.id) return notification;
      throw new Error('not_found');
    },
    findFirstRecordByFilter() {
      throw new Error('not_found');
    },
    findCollectionByNameOrId(name) {
      return { name };
    },
    save(record) {
      if (!record.id && record !== notification) {
        record.id = 'r'.repeat(15);
        storedReceipts.push(record);
      }
    },
  };
  const context = {
    store: { id: 's'.repeat(15) },
    user: { id: 'u'.repeat(15) },
    adminDevice: { id: 'a'.repeat(15) },
    device: new FakeRecord(null, {
      id: 'd'.repeat(15),
      store: 's'.repeat(15),
      notifications_enabled: true,
    }),
  };
  const previousRecord = global.Record;
  global.Record = FakeRecord;
  try {
    const now = new Date('2026-09-04T12:00:00.000Z');
    const result = adminPush.recordReceipts(app, context, {
      receipts: [{
        notificationId: notification.id,
        state: 'read',
        occurredAt: '2026-09-04T11:59:00.000Z',
        trigger: '',
      }, {
        notificationId: 'x'.repeat(15),
        state: 'native_delivered',
        occurredAt: '2026-07-01T12:00:00.000Z',
        trigger: 'workmanager',
      }],
    }, now);
    assert.deepEqual(result, { ok: true, accepted: 1, duplicates: 1 });
    assert.equal(notification.status, 'read');
    assert.equal(notification.read_at, '2026-09-04T11:59:00.000Z');
    assert.equal(storedReceipts.length, 1);
  } finally {
    global.Record = previousRecord;
  }
});

test('la carga recuperable tiene contrato limitado y vencimiento de 72 horas', () => {
  const payload = adminPush.notificationPayload({
    id: 'n'.repeat(15),
    store: 's'.repeat(15),
    type: 'low_stock',
    title: 'Stock bajo',
    message: 'Quedan dos unidades.',
    target_url: 'https://example.test/phishing',
    priority: 'unknown',
    created: '2026-09-04T12:00:00.000Z',
  }, new Date('2026-09-04T12:30:00.000Z'));
  assert.deepEqual(Object.keys(payload), [
    'notification_id', 'schema_version', 'channel', 'store_id', 'type',
    'title', 'body', 'target_url', 'priority', 'created_at', 'expires_at',
  ]);
  assert.equal(payload.target_url, '/admin');
  assert.equal(payload.priority, 'normal');
  assert.equal(
    new Date(payload.expires_at).getTime() - new Date(payload.created_at).getTime(),
    72 * 60 * 60 * 1000,
  );
});

test('Master recibe métricas agregadas sin identificadores Firebase ni credenciales', () => {
  const app = {
    findRecordsByFilter(collection) {
      if (collection === adminPush.DEVICES) {
        return [{
          id: 'd'.repeat(15),
          store: 's'.repeat(15),
          user: 'u'.repeat(15),
          device_label: 'Pixel QA',
          app_version: '2.0.0',
          firebase_status: 'registered',
          notification_permission: 'granted',
          notifications_enabled: true,
          credential_digest: 'a'.repeat(64),
          last_seen_at: '2026-09-04T11:59:00.000Z',
          last_sync_at: '2026-09-04T11:58:00.000Z',
          last_delivery_trigger: 'workmanager',
        }];
      }
      if (collection === adminPush.RECEIPTS) {
        return [{ delivery_trigger: 'workmanager' }];
      }
      return [];
    },
  };
  const health = adminPush.healthSnapshot(app, new Date('2026-09-04T12:00:00.000Z'));
  assert.equal(health.available, true);
  assert.equal(health.summary.active_installations, 1);
  assert.equal(health.summary.synced_24h, 1);
  assert.equal(health.summary.delivery_triggers.workmanager, 1);
  const serialized = JSON.stringify(health);
  assert.doesNotMatch(serialized, /firebase_installation_id|installation_uuid_digest|credential_digest/);
});

test('rutas y colecciones resilientes permanecen privadas', () => {
  assert.match(routeSource, /admin-push\/v2\/register/);
  assert.match(routeSource, /\$apis\.requireAuth\('users'\)/);
  assert.match(routeSource, /admin-push\/v2\/notifications\/sync/);
  assert.match(routeSource, /admin-push\/v2\/notifications\/ack/);
  assert.match(routeSource, /admin_push_receipt_cleanup/);
  const backendSource = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_admin_push_resilience_lib.js'),
    'utf8',
  );
  assert.match(backendSource, /status = 'unread' && created >= \{:since\}/);
  assert.doesNotMatch(backendSource, /status != 'archived'/);
  assert.match(migrationSource, /name:\s*RECEIPTS[\s\S]*?listRule:\s*null[\s\S]*?viewRule:\s*null/);
  assert.match(migrationSource, /'credential_digest', 64, false, true/);
  assert.match(migrationSource, /unsafe_rollback_admin_push_resilience/);
});
