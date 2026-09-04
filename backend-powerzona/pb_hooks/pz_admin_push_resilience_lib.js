/// <reference path="../pb_data/types.d.ts" />

'use strict';

const permissions = typeof __hooks === 'undefined'
  ? require('./pz_store_team_permissions_lib.js')
  : require(__hooks + '/pz_store_team_permissions_lib.js');
const userDevices = typeof __hooks === 'undefined'
  ? require('./pz_store_user_devices_lib.js')
  : require(__hooks + '/pz_store_user_devices_lib.js');

const DEVICES = 'store_push_devices';
const NOTIFICATIONS = 'store_notifications';
const RECEIPTS = 'admin_push_delivery_receipts';
const UUID_DOMAIN = 'pz_admin_push_uuid:v2|';
const FID_DOMAIN = 'pz_admin_push_fid:v1|';
const CREDENTIAL_DOMAIN = 'pz_admin_push_credential:v2|';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const APP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const CREDENTIAL_PATTERN = /^pza_v1_[a-f0-9]{64}$/;
const PERMISSION_STATES = Object.freeze(['prompt', 'granted', 'denied']);
const DELIVERY_TRIGGERS = Object.freeze(['fcm', 'foreground_poll', 'resume_sync', 'workmanager']);
const SYNC_TRIGGERS = Object.freeze(['foreground_poll', 'resume_sync', 'workmanager']);
const RECEIPT_STATES = Object.freeze(['fcm_received', 'native_delivered', 'read']);
const SYNC_WINDOW_MS = 72 * 60 * 60 * 1000;
const RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE_ERRORS = new Set([
  'unauthorized',
  'permission_denied',
  'device_not_authorized',
  'invalid_payload',
  'invalid_credential',
  'credential_revoked',
  'installation_conflict',
  'notification_not_eligible',
  'admin_push_unavailable',
]);

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === 'function') {
    try {
      const value = body.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  return body[key];
}

function exactPayload(body, expectedKeys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== 'function').sort();
  const expected = expectedKeys.slice().sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === 'function') {
    try { return record.get(key); } catch (_) {}
  }
  if (typeof record.getString === 'function') {
    try { return record.getString(key); } catch (_) {}
  }
  return record[key];
}

function recordString(record, key, max) {
  const value = recordValue(record, key);
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max || 10000);
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || '').trim();
  if (value && typeof value === 'object') return String(value.id || '').trim();
  return String(value || '').trim();
}

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : -1;
}

function requestHeader(e, info, name) {
  try {
    if (e && e.request && e.request.header && typeof e.request.header.get === 'function') {
      const value = String(e.request.header.get(name) || '').trim();
      if (value) return value;
    }
  } catch (_) {}
  const headers = info && info.headers;
  if (!headers || typeof headers !== 'object') return '';
  const expected = name.toLowerCase().replace(/-/g, '_');
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase().replace(/-/g, '_') === expected,
  );
  return key ? String(headers[key] || '').trim() : '';
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function first(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); }
  catch (_) { return null; }
}

function records(app, collection, filter, sort, limit, params) {
  try {
    return app.findRecordsByFilter(
      collection,
      filter || '',
      sort || '',
      limit || 100,
      0,
      params || {},
    ) || [];
  } catch (_) { return []; }
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('Referrer-Policy', 'no-referrer');
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: 'unauthorized' });
  return e.next();
}

function codedError(code) {
  const safe = SAFE_ERRORS.has(code) ? code : 'admin_push_unavailable';
  const error = new Error(safe);
  error.code = safe;
  return error;
}

function errorCode(error) {
  const value = String(error && (error.code || error.message) || '');
  return SAFE_ERRORS.has(value) ? value : 'admin_push_unavailable';
}

function statusFor(code) {
  if (code === 'invalid_payload') return 400;
  if (code === 'invalid_credential' || code === 'credential_revoked') return 401;
  if (code === 'unauthorized' || code === 'permission_denied' || code === 'device_not_authorized') return 403;
  if (code === 'notification_not_eligible') return 404;
  return code === 'admin_push_unavailable' ? 503 : 409;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(statusFor(code), { ok: false, error: code });
}

function defaultSecurity() {
  return {
    sha256(value) { return $security.sha256(value); },
    randomHex(length) {
      return $security.randomStringWithAlphabet(length, 'abcdef0123456789');
    },
  };
}

function securityProvider(options) {
  return options && options.security ? options.security : defaultSecurity();
}

function normalizedDigest(value) {
  const digest = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(digest) ? digest : '';
}

function domainDigest(domain, value, security) {
  const digest = normalizedDigest(security.sha256(domain + value));
  if (!digest) throw codedError('admin_push_unavailable');
  return digest;
}

function installationUuidDigest(value, security) {
  const uuid = String(value || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(uuid)) throw codedError('invalid_payload');
  return domainDigest(UUID_DOMAIN, uuid, security || defaultSecurity());
}

function firebaseInstallationDigest(value, security) {
  const fid = String(value || '').trim();
  if (!FID_PATTERN.test(fid)) throw codedError('invalid_payload');
  return domainDigest(FID_DOMAIN, fid, security || defaultSecurity());
}

function credentialDigest(value, security) {
  const credential = String(value || '').trim();
  if (!CREDENTIAL_PATTERN.test(credential)) throw codedError('invalid_credential');
  return domainDigest(CREDENTIAL_DOMAIN, credential, security || defaultSecurity());
}

function createCredential(security) {
  const random = String(security.randomHex(64) || '').trim().toLowerCase();
  const credential = 'pza_v1_' + random;
  if (!CREDENTIAL_PATTERN.test(credential)) throw codedError('admin_push_unavailable');
  return credential;
}

function isActiveStoreUser(record) {
  return !!record
    && ['store_admin', 'store_staff'].includes(recordString(record, 'role', 30))
    && recordString(record, 'status', 30) === 'active'
    && !!relationId(record, 'store');
}

function parseRegisterPayload(body) {
  const keys = [
    'installation_id', 'firebase_installation_id', 'app_id', 'device_label',
    'os_version', 'app_version', 'app_version_code', 'notification_permission',
    'notifications_enabled', 'credential_required',
  ];
  if (!exactPayload(body, keys)) return null;
  const installationId = recordString(body, 'installation_id', 36).toLowerCase();
  const firebaseInstallationId = recordString(body, 'firebase_installation_id', 255);
  const appId = recordString(body, 'app_id', 190);
  const deviceLabel = recordString(body, 'device_label', 120);
  const osVersion = recordString(body, 'os_version', 40);
  const appVersion = recordString(body, 'app_version', 40);
  const appVersionCode = integer(bodyValue(body, 'app_version_code'));
  const notificationPermission = recordString(body, 'notification_permission', 20);
  const notificationsEnabled = bodyValue(body, 'notifications_enabled');
  const credentialRequired = bodyValue(body, 'credential_required');
  if (!UUID_PATTERN.test(installationId)
    || (firebaseInstallationId && !FID_PATTERN.test(firebaseInstallationId))
    || !APP_ID_PATTERN.test(appId)
    || !deviceLabel
    || !osVersion
    || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(appVersion)
    || appVersionCode < 1
    || !PERMISSION_STATES.includes(notificationPermission)
    || typeof notificationsEnabled !== 'boolean'
    || typeof credentialRequired !== 'boolean') return null;
  return Object.freeze({
    installationId,
    firebaseInstallationId,
    appId,
    deviceLabel,
    osVersion,
    appVersion,
    appVersionCode,
    notificationPermission,
    notificationsEnabled,
    credentialRequired,
  });
}

function parseSyncPayload(body) {
  if (!exactPayload(body, ['delivery_trigger'])) return null;
  const trigger = recordString(body, 'delivery_trigger', 30);
  return SYNC_TRIGGERS.includes(trigger) ? Object.freeze({ trigger }) : null;
}

function parseFirebasePayload(body) {
  if (!exactPayload(body, ['firebase_installation_id'])) return null;
  const fid = recordString(body, 'firebase_installation_id', 255);
  return FID_PATTERN.test(fid) ? Object.freeze({ fid }) : null;
}

function parseReceiptPayload(body) {
  if (!exactPayload(body, ['receipts'])) return null;
  const source = bodyValue(body, 'receipts');
  if (!Array.isArray(source) || source.length < 1 || source.length > 50) return null;
  const receipts = [];
  for (const item of source) {
    if (!exactPayload(item, ['notification_id', 'state', 'occurred_at', 'delivery_trigger'])) {
      return null;
    }
    const notificationId = recordString(item, 'notification_id', 15);
    const state = recordString(item, 'state', 30);
    const occurredAt = new Date(recordString(item, 'occurred_at', 40));
    const trigger = recordString(item, 'delivery_trigger', 30);
    if (!RECORD_ID_PATTERN.test(notificationId)
      || !RECEIPT_STATES.includes(state)
      || !Number.isFinite(occurredAt.getTime())
      || (state === 'read' && trigger)
      || (state === 'fcm_received' && trigger !== 'fcm')
      || (state === 'native_delivered' && !DELIVERY_TRIGGERS.includes(trigger))) return null;
    receipts.push(Object.freeze({
      notificationId,
      state,
      occurredAt: occurredAt.toISOString(),
      trigger,
    }));
  }
  return Object.freeze({ receipts: Object.freeze(receipts) });
}

function registrationContext(e, options) {
  const app = options && options.app ? options.app : (e.app || $app);
  const info = e.requestInfo();
  const auth = (info && info.auth) || e.auth;
  if (!isActiveStoreUser(auth)) throw codedError('unauthorized');
  const parsed = parseRegisterPayload((info && info.body) || {});
  if (!parsed) throw codedError('invalid_payload');
  const store = findRecord(app, 'stores', relationId(auth, 'store'));
  if (!store) throw codedError('unauthorized');
  if (!permissions.hasStorePermission(app, auth, store, 'notifications.view')) {
    throw codedError('permission_denied');
  }
  let adminDevice = null;
  try {
    adminDevice = userDevices.resolveAuthorizedUserDevice(
      app,
      auth,
      requestHeader(e, info, userDevices.DEVICE_HEADER),
    );
  } catch (_) {
    throw codedError('device_not_authorized');
  }
  return Object.freeze({ app, auth, store, adminDevice, parsed, info });
}

function deviceResponse(device) {
  return {
    id: String(device && (device.id || recordString(device, 'id', 15))).slice(0, 15),
    status: recordString(device, 'status', 30),
    app_id: recordString(device, 'app_id', 190),
    firebase_status: recordString(device, 'firebase_status', 30) || 'pending',
    notification_permission: recordString(device, 'notification_permission', 20) || 'prompt',
    notifications_enabled: recordValue(device, 'notifications_enabled') === true,
    last_seen_at: recordString(device, 'last_seen_at', 40),
    last_sync_at: recordString(device, 'last_sync_at', 40),
  };
}

function bindingChanged(device, context) {
  if (!device || !device.id) return true;
  return relationId(device, 'store') !== String(context.store.id)
    || relationId(device, 'user') !== String(context.auth.id)
    || relationId(device, 'admin_device') !== String(context.adminDevice.id)
    || recordString(device, 'app_id', 190) !== context.parsed.appId;
}

function registerInstallation(app, context, security, now) {
  const parsed = context.parsed;
  const uuidDigest = installationUuidDigest(parsed.installationId, security);
  const fidDigest = parsed.firebaseInstallationId
    ? firebaseInstallationDigest(parsed.firebaseInstallationId, security)
    : '';
  const byUuid = first(
    app,
    DEVICES,
    'installation_uuid_digest = {:digest}',
    { digest: uuidDigest },
  );
  const byFid = fidDigest
    ? first(app, DEVICES, 'installation_digest = {:digest}', { digest: fidDigest })
    : null;
  if (byUuid && byFid && byUuid.id !== byFid.id) throw codedError('installation_conflict');
  let device = byUuid || byFid;
  const created = !device;
  if (!device) device = new Record(app.findCollectionByNameOrId(DEVICES), {});
  const mustRotate = created
    || parsed.credentialRequired
    || bindingChanged(device, context)
    || !normalizedDigest(recordString(device, 'credential_digest', 64));
  let credential = '';
  if (mustRotate) {
    credential = createCredential(security);
    device.set('credential_digest', credentialDigest(credential, security));
  }
  device.set('store', context.store.id);
  device.set('user', context.auth.id);
  device.set('admin_device', context.adminDevice.id);
  device.set('installation_uuid_digest', uuidDigest);
  if (parsed.firebaseInstallationId) {
    device.set('installation_id', parsed.firebaseInstallationId);
    device.set('installation_digest', fidDigest);
    device.set('firebase_status', 'registered');
  } else if (created) {
    device.set('installation_id', '');
    device.set('installation_digest', '');
    device.set('firebase_status', 'pending');
  }
  device.set('app_id', parsed.appId);
  device.set('platform', 'android');
  device.set('status', 'active');
  device.set('device_label', parsed.deviceLabel);
  device.set('os_version', parsed.osVersion);
  device.set('app_version', parsed.appVersion);
  device.set('notification_permission', parsed.notificationPermission);
  device.set('notifications_enabled', parsed.notificationsEnabled);
  device.set('last_seen_at', now.toISOString());
  device.set('last_heartbeat_at', now.toISOString());
  device.set('last_error', '');
  device.set('disabled_at', '');
  app.save(device);
  return Object.freeze({ created, credential, device });
}

function handleRegister(e, options) {
  setPrivateHeaders(e);
  try {
    const context = registrationContext(e, options);
    const security = securityProvider(options);
    const now = options && options.now instanceof Date ? options.now : new Date();
    let result = null;
    const run = typeof context.app.runInTransaction === 'function'
      ? context.app.runInTransaction.bind(context.app)
      : (callback) => callback(context.app);
    run((app) => {
      const transactionContext = {
        ...context,
        store: findRecord(app, 'stores', context.store.id) || context.store,
        auth: findRecord(app, 'users', context.auth.id) || context.auth,
        adminDevice: findRecord(app, 'store_user_devices', context.adminDevice.id) || context.adminDevice,
      };
      result = registerInstallation(app, transactionContext, security, now);
    });
    return e.json(result.created ? 201 : 200, {
      ok: true,
      created: result.created,
      credential: result.credential,
      credential_updated: !!result.credential,
      device: deviceResponse(result.device),
    });
  } catch (error) {
    return sendError(e, error);
  }
}

function bearerCredential(e, info) {
  const authorization = requestHeader(e, info, 'Authorization');
  if (!authorization.startsWith('Bearer ')) return '';
  return authorization.slice(7).trim();
}

function credentialContext(app, e, info, security) {
  const credential = bearerCredential(e, info);
  if (!CREDENTIAL_PATTERN.test(credential)) throw codedError('invalid_credential');
  const digest = credentialDigest(credential, security);
  const device = first(app, DEVICES, 'credential_digest = {:digest}', { digest });
  if (!device || recordString(device, 'status', 30) !== 'active') {
    throw codedError('credential_revoked');
  }
  const user = findRecord(app, 'users', relationId(device, 'user'));
  const store = findRecord(app, 'stores', relationId(device, 'store'));
  const adminDevice = findRecord(app, 'store_user_devices', relationId(device, 'admin_device'));
  if (!isActiveStoreUser(user)
    || !store
    || relationId(user, 'store') !== String(store.id)
    || !adminDevice
    || recordString(adminDevice, 'status', 30) !== 'authorized'
    || relationId(adminDevice, 'user') !== String(user.id)
    || relationId(adminDevice, 'store') !== String(store.id)
    || !permissions.hasStorePermission(app, user, store, 'notifications.view')) {
    throw codedError('credential_revoked');
  }
  return Object.freeze({ device, user, store, adminDevice });
}

function isExpirationType(value) {
  const type = String(value || '');
  return type.startsWith('product_expir') || type.startsWith('variation_expir');
}

function canAccessNotification(app, context, notification) {
  return relationId(notification, 'store') === String(context.store.id)
    && (!isExpirationType(recordString(notification, 'type', 80))
      || permissions.hasStorePermission(
        app,
        context.user,
        context.store,
        'catalog.expirations.manage',
      ));
}

function canReceiveNotification(app, context, notification) {
  return recordValue(context.device, 'notifications_enabled') === true
    && canAccessNotification(app, context, notification);
}

function safeTarget(value) {
  const target = String(value || '').trim().slice(0, 500);
  return target.startsWith('/') && !target.startsWith('//') ? target : '/admin';
}

function notificationPayload(notification, now) {
  const createdRaw = recordString(notification, 'created', 40);
  const created = new Date(createdRaw);
  const createdAt = Number.isFinite(created.getTime()) ? created : now;
  return {
    notification_id: String(notification.id || recordString(notification, 'id', 15)).slice(0, 15),
    schema_version: '1',
    channel: 'admin',
    store_id: relationId(notification, 'store').slice(0, 15),
    type: recordString(notification, 'type', 80),
    title: recordString(notification, 'title', 160),
    body: recordString(notification, 'message', 600),
    target_url: safeTarget(recordString(notification, 'target_url', 500)),
    priority: ['normal', 'important', 'critical'].includes(recordString(notification, 'priority', 20))
      ? recordString(notification, 'priority', 20)
      : 'normal',
    created_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + SYNC_WINDOW_MS).toISOString(),
  };
}

function syncNotifications(app, context, parsed, now) {
  const since = new Date(now.getTime() - SYNC_WINDOW_MS).toISOString();
  const candidates = records(
    app,
    NOTIFICATIONS,
    "store = {:store} && status = 'unread' && created >= {:since}",
    '-created',
    200,
    { store: context.store.id, since },
  ).filter((notification) => canReceiveNotification(app, context, notification));
  const notifications = candidates.slice(0, 50).reverse().map(
    (notification) => notificationPayload(notification, now),
  );
  context.device.set('last_sync_at', now.toISOString());
  context.device.set('last_seen_at', now.toISOString());
  context.device.set('last_heartbeat_at', now.toISOString());
  context.device.set('last_delivery_trigger', parsed.trigger);
  context.device.set('last_error', '');
  app.save(context.device);
  return Object.freeze({
    ok: true,
    notifications: Object.freeze(notifications),
    server_time: now.toISOString(),
  });
}

function setEarliest(record, field, occurredAt) {
  const current = new Date(recordString(record, field, 40));
  const candidate = new Date(occurredAt);
  if (!Number.isFinite(candidate.getTime())) return false;
  if (Number.isFinite(current.getTime()) && current.getTime() <= candidate.getTime()) return false;
  record.set(field, candidate.toISOString());
  return true;
}

function deliveryTime(receipt) {
  const fcm = new Date(recordString(receipt, 'fcm_received_at', 40));
  const displayed = new Date(recordString(receipt, 'displayed_at', 40));
  const values = [fcm, displayed].filter((value) => Number.isFinite(value.getTime()));
  return values.length ? Math.min(...values.map((value) => value.getTime())) : 0;
}

function recordReceipts(app, context, parsed, now) {
  const oldest = now.getTime() - RECEIPT_RETENTION_MS;
  const newest = now.getTime() + 5 * 60 * 1000;
  let accepted = 0;
  let duplicates = 0;
  for (const item of parsed.receipts) {
    const occurred = new Date(item.occurredAt);
    if (occurred.getTime() < oldest || occurred.getTime() > newest) {
      duplicates += 1;
      continue;
    }
    const notification = findRecord(app, NOTIFICATIONS, item.notificationId);
    if (!notification || !canAccessNotification(app, context, notification)) {
      duplicates += 1;
      continue;
    }
    let receipt = first(
      app,
      RECEIPTS,
      'device = {:device} && notification = {:notification}',
      { device: context.device.id, notification: notification.id },
    );
    if (!receipt) {
      receipt = new Record(app.findCollectionByNameOrId(RECEIPTS), {});
      receipt.set('store', context.store.id);
      receipt.set('user', context.user.id);
      receipt.set('admin_device', context.adminDevice.id);
      receipt.set('device', context.device.id);
      receipt.set('notification', notification.id);
    }
    const field = item.state === 'fcm_received'
      ? 'fcm_received_at'
      : item.state === 'native_delivered' ? 'displayed_at' : 'read_at';
    const changed = setEarliest(receipt, field, item.occurredAt);
    if (item.state === 'read') setEarliest(receipt, 'displayed_at', item.occurredAt);
    const currentDeliveryTime = deliveryTime(receipt);
    const candidateTime = occurred.getTime();
    if (item.trigger
      && (!recordString(receipt, 'delivery_trigger', 30)
        || !currentDeliveryTime
        || candidateTime <= currentDeliveryTime)) {
      receipt.set('delivery_trigger', item.trigger);
    }
    receipt.set('last_occurred_at', item.occurredAt);
    receipt.set('delete_after', new Date(now.getTime() + RECEIPT_RETENTION_MS).toISOString());
    app.save(receipt);
    if (item.state === 'read' && recordString(notification, 'status', 20) === 'unread') {
      notification.set('status', 'read');
      notification.set('read_at', item.occurredAt);
      app.save(notification);
    }
    if (changed) accepted += 1;
    else duplicates += 1;
  }
  context.device.set('last_seen_at', now.toISOString());
  context.device.set('last_error', '');
  app.save(context.device);
  return Object.freeze({ ok: true, accepted, duplicates });
}

function enrichFirebase(app, context, parsed, security, now) {
  const digest = firebaseInstallationDigest(parsed.fid, security);
  const collision = first(app, DEVICES, 'installation_digest = {:digest}', { digest });
  if (collision && collision.id !== context.device.id) throw codedError('installation_conflict');
  context.device.set('installation_id', parsed.fid);
  context.device.set('installation_digest', digest);
  context.device.set('firebase_status', 'registered');
  context.device.set('last_seen_at', now.toISOString());
  context.device.set('last_heartbeat_at', now.toISOString());
  context.device.set('last_error', '');
  app.save(context.device);
  return Object.freeze({ ok: true, device: deviceResponse(context.device) });
}

function handleCredentialAction(e, action, options) {
  setPrivateHeaders(e);
  try {
    const app = options && options.app ? options.app : (e.app || $app);
    const info = e.requestInfo();
    const body = (info && info.body) || {};
    const parsed = action === 'sync'
      ? parseSyncPayload(body)
      : action === 'ack' ? parseReceiptPayload(body) : parseFirebasePayload(body);
    if (!parsed) throw codedError('invalid_payload');
    const security = securityProvider(options);
    const now = options && options.now instanceof Date ? options.now : new Date();
    let response = null;
    const run = typeof app.runInTransaction === 'function'
      ? app.runInTransaction.bind(app)
      : (callback) => callback(app);
    run((transaction) => {
      const context = credentialContext(transaction, e, info, security);
      if (action === 'sync') response = syncNotifications(transaction, context, parsed, now);
      else if (action === 'ack') response = recordReceipts(transaction, context, parsed, now);
      else response = enrichFirebase(transaction, context, parsed, security, now);
    });
    return e.json(200, response);
  } catch (error) {
    return sendError(e, error);
  }
}

function handleSync(e, options) {
  return handleCredentialAction(e, 'sync', options);
}

function handleAck(e, options) {
  return handleCredentialAction(e, 'ack', options);
}

function handleFirebase(e, options) {
  return handleCredentialAction(e, 'firebase', options);
}

function cleanupReceipts(app, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_cleanup_time');
  const due = records(
    app,
    RECEIPTS,
    "delete_after != '' && delete_after <= {:now}",
    'delete_after',
    500,
    { now: now.toISOString() },
  );
  let deleted = 0;
  let failed = 0;
  due.forEach((record) => {
    try { app.delete(record); deleted += 1; } catch (_) { failed += 1; }
  });
  return Object.freeze({ deleted, failed });
}

function healthSnapshot(app, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  try {
    const devices = records(app, DEVICES, "status = 'active'", '-last_seen_at', 500, {});
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const receipts = records(app, RECEIPTS, 'created >= {:since}', '-created', 1000, { since });
    const triggerCount = { fcm: 0, foreground_poll: 0, resume_sync: 0, workmanager: 0 };
    receipts.forEach((receipt) => {
      const trigger = recordString(receipt, 'delivery_trigger', 30);
      if (Object.prototype.hasOwnProperty.call(triggerCount, trigger)) triggerCount[trigger] += 1;
    });
    return {
      available: true,
      generated_at: now.toISOString(),
      summary: {
        active_installations: devices.length,
        credential_ready: devices.filter((device) => !!recordString(device, 'credential_digest', 64)).length,
        firebase_registered: devices.filter((device) => recordString(device, 'firebase_status', 30) === 'registered').length,
        permission_granted: devices.filter((device) => recordString(device, 'notification_permission', 20) === 'granted').length,
        notifications_enabled: devices.filter((device) => recordValue(device, 'notifications_enabled') === true).length,
        synced_24h: devices.filter((device) => {
          const date = new Date(recordString(device, 'last_sync_at', 40));
          return Number.isFinite(date.getTime()) && date.getTime() >= now.getTime() - 24 * 60 * 60 * 1000;
        }).length,
        receipts_7d: receipts.length,
        delivery_triggers: triggerCount,
      },
      installations: devices.slice(0, 50).map((device) => ({
        id: String(device.id || recordString(device, 'id', 15)).slice(0, 15),
        store_id: relationId(device, 'store').slice(0, 15),
        user_id: relationId(device, 'user').slice(0, 15),
        device_label: recordString(device, 'device_label', 120),
        app_version: recordString(device, 'app_version', 40),
        firebase_status: recordString(device, 'firebase_status', 30) || 'pending',
        notification_permission: recordString(device, 'notification_permission', 20) || 'prompt',
        notifications_enabled: recordValue(device, 'notifications_enabled') === true,
        last_seen_at: recordString(device, 'last_seen_at', 40),
        last_sync_at: recordString(device, 'last_sync_at', 40),
        last_delivery_trigger: recordString(device, 'last_delivery_trigger', 30),
      })),
    };
  } catch (_) {
    return {
      available: false,
      generated_at: now.toISOString(),
      summary: {
        active_installations: 0,
        credential_ready: 0,
        firebase_registered: 0,
        permission_granted: 0,
        notifications_enabled: 0,
        synced_24h: 0,
        receipts_7d: 0,
        delivery_triggers: { fcm: 0, foreground_poll: 0, resume_sync: 0, workmanager: 0 },
      },
      installations: [],
    };
  }
}

module.exports = {
  APP_ID_PATTERN,
  CREDENTIAL_PATTERN,
  DELIVERY_TRIGGERS,
  DEVICES,
  FID_PATTERN,
  NOTIFICATIONS,
  RECEIPTS,
  UUID_PATTERN,
  canAccessNotification,
  canReceiveNotification,
  cleanupReceipts,
  createCredential,
  credentialDigest,
  deviceResponse,
  exactPayload,
  firebaseInstallationDigest,
  handleAck,
  handleFirebase,
  handleRegister,
  handleSync,
  healthSnapshot,
  installationUuidDigest,
  notificationPayload,
  parseFirebasePayload,
  parseReceiptPayload,
  parseRegisterPayload,
  parseSyncPayload,
  recordReceipts,
  registerInstallation,
  requireAuthenticatedUser,
  syncNotifications,
};
