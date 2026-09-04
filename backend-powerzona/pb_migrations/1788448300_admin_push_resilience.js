/// <reference path="../pb_data/types.d.ts" />

'use strict';

const DEVICES = 'store_push_devices';
const RECEIPTS = 'admin_push_delivery_receipts';

function idField(id) {
  return {
    autogeneratePattern: '[a-z0-9]{15}', hidden: false, id, max: 15, min: 15,
    name: 'id', pattern: '^[a-z0-9]+$', presentable: false, primaryKey: true,
    required: true, system: true, type: 'text',
  };
}

function textField(id, name, max, required, hidden, pattern) {
  return {
    autogeneratePattern: '', hidden: hidden === true, id, max, min: required ? 1 : 0,
    name, pattern: pattern || '', presentable: false, primaryKey: false,
    required: !!required, system: false, type: 'text',
  };
}

function relationField(id, name, collectionId, required, hidden, cascadeDelete) {
  return {
    cascadeDelete: cascadeDelete === true, collectionId, hidden: hidden === true, id,
    maxSelect: 1, minSelect: required ? 1 : 0, name, presentable: false,
    required: !!required, system: false, type: 'relation',
  };
}

function selectField(id, name, values) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: false, system: false, type: 'select', values,
  };
}

function boolField(id, name) {
  return {
    hidden: false, id, name, presentable: false, required: false,
    system: false, type: 'bool',
  };
}

function dateField(id, name) {
  return {
    hidden: false, id, max: '', min: '', name, presentable: false,
    required: false, system: false, type: 'date',
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate,
    presentable: false, system: false, type: 'autodate',
  };
}

function fieldByName(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function addField(collection, definition) {
  if (!fieldByName(collection, definition.name)) collection.fields.add(new Field(definition));
}

function removeField(collection, name) {
  const field = fieldByName(collection, name);
  if (field) collection.fields.removeById(field.id);
}

function addIndex(collection, name, unique, columns, where) {
  try { if (collection.getIndex(name)) return; } catch (_) {}
  collection.addIndex(name, unique, columns, where || '');
}

function removeIndex(collection, name) {
  try { collection.removeIndex(name); } catch (_) {}
}

function rows(app, collection, filter) {
  try { return app.findRecordsByFilter(collection, filter || '', 'id', 1, 0, {}) || []; }
  catch (_) { return []; }
}

function forEachRecord(app, collection, callback) {
  for (let offset = 0; ; offset += 200) {
    const page = app.findRecordsByFilter(collection, '', 'id', 200, offset, {}) || [];
    page.forEach(callback);
    if (page.length < 200) break;
  }
}

migrate((app) => {
  const devices = app.findCollectionByNameOrId(DEVICES);
  const installationId = fieldByName(devices, 'installation_id');
  const installationDigest = fieldByName(devices, 'installation_digest');
  installationId.required = false;
  installationId.min = 0;
  installationDigest.required = false;
  installationDigest.min = 0;
  removeIndex(devices, 'idx_store_push_devices_installation');
  addIndex(
    devices,
    'idx_store_push_devices_installation',
    true,
    'installation_digest',
    "installation_digest != ''",
  );
  addField(devices, textField(
    'txt17884483001', 'installation_uuid_digest', 64, false, true, '^[a-f0-9]{64}$',
  ));
  addField(devices, textField(
    'txt17884483002', 'credential_digest', 64, false, true, '^[a-f0-9]{64}$',
  ));
  addField(devices, selectField(
    'sel17884483003', 'notification_permission', ['prompt', 'granted', 'denied'],
  ));
  addField(devices, selectField(
    'sel17884483004', 'firebase_status', ['pending', 'registered', 'unavailable', 'failed'],
  ));
  addField(devices, dateField('dat17884483005', 'last_sync_at'));
  addField(devices, dateField('dat17884483006', 'last_heartbeat_at'));
  addField(devices, selectField(
    'sel17884483007', 'last_delivery_trigger',
    ['fcm', 'foreground_poll', 'resume_sync', 'workmanager'],
  ));
  addField(devices, textField(
    'txt17884483008', 'last_error', 80, false, true, '^[a-z0-9_:-]{1,80}$',
  ));
  addField(devices, boolField('bol17884483009', 'notifications_enabled'));
  addIndex(
    devices,
    'idx_store_push_devices_native_uuid',
    true,
    'installation_uuid_digest',
    "installation_uuid_digest != ''",
  );
  addIndex(
    devices,
    'idx_store_push_devices_credential',
    true,
    'credential_digest',
    "credential_digest != ''",
  );
  addIndex(
    devices,
    'idx_store_push_devices_native_sync',
    false,
    'status, last_sync_at',
    '',
  );
  app.save(devices);

  forEachRecord(app, DEVICES, (device) => {
    device.set('notifications_enabled', true);
    app.save(device);
  });

  let receipts = null;
  try { receipts = app.findCollectionByNameOrId(RECEIPTS); } catch (_) {}
  if (!receipts) {
    const stores = app.findCollectionByNameOrId('stores');
    const users = app.findCollectionByNameOrId('users');
    const adminDevices = app.findCollectionByNameOrId('store_user_devices');
    const notifications = app.findCollectionByNameOrId('store_notifications');
    receipts = new Collection({
      id: 'pbc_1788448301',
      name: RECEIPTS,
      type: 'base',
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        idField('txt17884483101'),
        relationField('rel17884483102', 'store', stores.id, true, false, false),
        relationField('rel17884483103', 'user', users.id, true, true, false),
        relationField('rel17884483104', 'admin_device', adminDevices.id, true, true, false),
        relationField('rel17884483105', 'device', devices.id, true, true, true),
        relationField('rel17884483106', 'notification', notifications.id, true, false, true),
        dateField('dat17884483107', 'fcm_received_at'),
        dateField('dat17884483108', 'displayed_at'),
        dateField('dat17884483109', 'read_at'),
        selectField(
          'sel17884483110', 'delivery_trigger',
          ['fcm', 'foreground_poll', 'resume_sync', 'workmanager'],
        ),
        dateField('dat17884483111', 'last_occurred_at'),
        dateField('dat17884483112', 'delete_after'),
        autoDateField('aut17884483113', 'created', false),
        autoDateField('aut17884483114', 'updated', true),
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_admin_push_receipt_unique ON admin_push_delivery_receipts (device, notification)',
        'CREATE INDEX idx_admin_push_receipt_store_displayed ON admin_push_delivery_receipts (store, displayed_at)',
        'CREATE INDEX idx_admin_push_receipt_retention ON admin_push_delivery_receipts (delete_after)',
      ],
    });
    app.save(receipts);
  }
}, (app) => {
  const nativeDevices = rows(
    app,
    DEVICES,
    "installation_uuid_digest != '' || credential_digest != '' || installation_id = ''",
  );
  const receiptRows = rows(app, RECEIPTS, '');
  if (nativeDevices.length || receiptRows.length) {
    throw new Error('unsafe_rollback_admin_push_resilience');
  }

  try { app.delete(app.findCollectionByNameOrId(RECEIPTS)); } catch (_) {}

  const devices = app.findCollectionByNameOrId(DEVICES);
  removeIndex(devices, 'idx_store_push_devices_native_uuid');
  removeIndex(devices, 'idx_store_push_devices_credential');
  removeIndex(devices, 'idx_store_push_devices_native_sync');
  for (const field of [
    'installation_uuid_digest', 'credential_digest', 'notification_permission',
    'firebase_status', 'last_sync_at', 'last_heartbeat_at',
    'last_delivery_trigger', 'last_error', 'notifications_enabled',
  ]) removeField(devices, field);
  removeIndex(devices, 'idx_store_push_devices_installation');
  addIndex(devices, 'idx_store_push_devices_installation', true, 'installation_digest', '');
  const installationId = fieldByName(devices, 'installation_id');
  const installationDigest = fieldByName(devices, 'installation_digest');
  installationId.required = true;
  installationId.min = 1;
  installationDigest.required = true;
  installationDigest.min = 1;
  app.save(devices);
});
