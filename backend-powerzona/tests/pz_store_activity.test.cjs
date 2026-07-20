'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const audit = require('../pb_hooks/pz_store_activity_audit_lib.js');
const activity = require('../pb_hooks/pz_store_activity_lib.js');

const migrationSource = read('pb_migrations/1784595800_store_activity_audit.js');
const auditSource = read('pb_hooks/pz_store_activity_audit_lib.js');
const activitySource = read('pb_hooks/pz_store_activity_lib.js');
const routeSource = read('pb_hooks/pz_store_activity.pb.js');
const teamRouteSource = read('pb_hooks/pz_store_team.pb.js');
const teamSource = read('pb_hooks/pz_store_team_lib.js');
const masterUsersSource = read('pb_hooks/pz_master_store_users_lib.js');
const orderPricingSource = read('pb_hooks/pz_order_pricing_lib.js');
const securitySource = read('pb_hooks/pz_security_monitoring_lib.js');
const planSource = read('pb_hooks/pz_store_plan_management_lib.js');
const deviceSource = read('pb_hooks/pz_store_user_devices_lib.js');
const primaryAdminSource = read('pb_hooks/pz_master_primary_admin_lib.js');
const masterDeletionSource = read('pb_hooks/pz_master_store_deletion_lib.js');

const STORE_ID = 'str000000000001';
const OTHER_STORE_ID = 'str000000000002';
const ACTOR_ID = 'usr000000000001';
const RESOURCE_ID = 'res000000000001';
const ACTIVITY_ID = 'act000000000001';

function record(id, values) {
  return {
    id,
    ...values,
    get(key) { return values[key]; },
    getString(key) { return String(values[key] || ''); },
  };
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `falta function ${name}`);
  const candidates = [
    source.indexOf('\nfunction ', start + 1),
    source.indexOf('\nmodule.exports', start + 1),
  ].filter((value) => value >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end).trim();
}

class FakeFields {
  constructor(items = []) {
    this.items = items.slice();
  }

  add(field) {
    this.items.push(field);
    return field;
  }

  getByName(name) {
    const field = this.items.find((item) => item.name === name);
    if (!field) throw new Error(`field_not_found:${name}`);
    return field;
  }

  removeById(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`field_not_found:${id}`);
    this.items.splice(index, 1);
  }
}

class FakeField {
  constructor(options) {
    Object.assign(this, options);
  }
}

class FakeCollection {
  constructor(options) {
    Object.assign(this, options);
    this.fields = new FakeFields((options.fields || []).map((field) => (
      field instanceof FakeField ? field : new FakeField(field)
    )));
    this.indexes = (options.indexes || []).slice();
    this.dynamicIndexes = [];
  }

  addIndex(name, unique, columns, where) {
    this.dynamicIndexes.push({ name, unique, columns, where });
  }

  getIndex(name) {
    return this.dynamicIndexes.find((index) => index.name === name) || null;
  }

  removeIndex(name) {
    this.dynamicIndexes = this.dynamicIndexes.filter((index) => index.name !== name);
  }
}

class FakeRecord {
  constructor(collection, values = {}) {
    this.collection = collection;
    Object.assign(this, values);
  }

  set(key, value) {
    this[key] = value;
  }
}

function migrationFixture() {
  const stores = new FakeCollection({ id: 'stores_collection', name: 'stores', fields: [] });
  const users = new FakeCollection({ id: 'users_collection', name: 'users', fields: [] });
  const collections = new Map([[stores.name, stores], [users.name, users]]);
  const touchedOperational = [];
  const app = {
    findCollectionByNameOrId(name) {
      const value = collections.get(name) || [...collections.values()].find((item) => item.id === name);
      if (!value) throw new Error(`collection_not_found:${name}`);
      return value;
    },
    findRecordsByFilter() { return []; },
    findFirstRecordByFilter() { throw new Error('record_not_found'); },
    save(value) {
      if (value instanceof FakeCollection) collections.set(value.name, value);
      else touchedOperational.push(value);
      return value;
    },
    delete(value) {
      if (value instanceof FakeCollection) collections.delete(value.name);
      else touchedOperational.push(value);
    },
  };
  return { app, collections, stores, users, touchedOperational };
}

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(migrationSource, {
    Collection: FakeCollection,
    Field: FakeField,
    Record: FakeRecord,
    migrate(upFn, downFn) { up = upFn; down = downFn; },
  }, { filename: path.join(ROOT, 'pb_migrations/1784595800_store_activity_audit.js') });
  assert.equal(typeof up, 'function');
  assert.equal(typeof down, 'function');
  return { up, down };
}

test('M7U2-C2: las librerías publican el contrato focal estable', () => {
  for (const name of [
    'sanitizeObject',
    'snapshotForRecord',
    'comparisonSnapshotForRecord',
    'changedSnapshots',
    'buildActivityValues',
    'createActivity',
    'createRecordMutationActivity',
  ]) assert.equal(typeof audit[name], 'function', name);

  for (const name of [
    'parseFilters',
    'reviewPayload',
    'lastModifiedPayload',
    'resourcePath',
    'handleSummary',
    'handleList',
    'handleDetail',
    'handleReview',
    'handleUserReport',
    'handleSelf',
    'handleLastModified',
  ]) assert.equal(typeof activity[name], 'function', name);
});

test('M7U2-C2: migración crea dos colecciones privadas, aisladas e indexadas', () => {
  const migration = loadMigration();
  const fixture = migrationFixture();
  migration.up(fixture.app);

  const events = fixture.collections.get('store_activity_audit');
  const reviews = fixture.collections.get('store_activity_reviews');
  assert.ok(events);
  assert.ok(reviews);

  for (const collection of [events, reviews]) {
    assert.equal(collection.listRule, null);
    assert.equal(collection.viewRule, null);
    assert.equal(collection.createRule, null);
    assert.equal(collection.updateRule, null);
    assert.equal(collection.deleteRule, null);
    assert.equal(collection.system, false);
  }

  for (const name of [
    'store', 'actor', 'actor_id_snapshot', 'actor_name_snapshot', 'actor_email_snapshot',
    'actor_role_snapshot', 'actor_template_snapshot', 'origin', 'module', 'action',
    'severity', 'resource_type', 'resource_id_snapshot', 'resource_label_snapshot',
    'changed_fields_json', 'previous_values_json', 'new_values_json', 'summary',
    'source_event_key', 'created',
  ]) assert.ok(events.fields.getByName(name), name);

  for (const name of ['store', 'activity', 'status', 'note', 'reviewed_by', 'reviewed_at', 'created', 'updated']) {
    assert.ok(reviews.fields.getByName(name), name);
  }

  const eventStore = events.fields.getByName('store');
  const eventActor = events.fields.getByName('actor');
  assert.equal(eventStore.collectionId, fixture.stores.id);
  assert.equal(eventStore.required, true);
  assert.equal(eventStore.cascadeDelete, false);
  assert.equal(eventActor.collectionId, fixture.users.id);
  assert.equal(eventActor.required, false);
  assert.equal(eventActor.cascadeDelete, false);
  assert.deepEqual(Array.from(events.fields.getByName('origin').values), ['store_admin', 'master_admin', 'system', 'migration']);
  assert.deepEqual(Array.from(events.fields.getByName('severity').values), ['normal', 'important', 'critical']);
  assert.deepEqual(Array.from(reviews.fields.getByName('status').values), ['pending', 'reviewed', 'requires_correction']);

  const eventIndexes = [...events.indexes, ...events.dynamicIndexes.map((item) => JSON.stringify(item))].join('\n');
  const reviewIndexes = [...reviews.indexes, ...reviews.dynamicIndexes.map((item) => JSON.stringify(item))].join('\n');
  assert.match(eventIndexes, /UNIQUE[\s\S]*source_event_key|source_event_key[\s\S]*"unique":true/i);
  assert.match(eventIndexes, /store[\s\S]*created/i);
  assert.match(eventIndexes, /store[\s\S]*(actor|module|resource_type)/i);
  assert.match(reviewIndexes, /UNIQUE[\s\S]*activity|activity[\s\S]*"unique":true/i);

  migration.up(fixture.app);
  assert.equal(fixture.collections.get('store_activity_audit'), events);
  assert.equal(fixture.collections.get('store_activity_reviews'), reviews);
  assert.equal([...fixture.collections.values()].filter((item) => item.name.startsWith('store_activity_')).length, 2);
});

test('M7U2-C2: rollback retira solo C2 y conserva colecciones operativas', () => {
  const migration = loadMigration();
  const fixture = migrationFixture();
  migration.up(fixture.app);
  migration.down(fixture.app);

  assert.equal(fixture.collections.has('store_activity_audit'), false);
  assert.equal(fixture.collections.has('store_activity_reviews'), false);
  assert.equal(fixture.collections.get('stores'), fixture.stores);
  assert.equal(fixture.collections.get('users'), fixture.users);
  assert.deepEqual(fixture.touchedOperational, []);
  assert.doesNotMatch(migrationSource, /app\.delete\(.*(?:users|stores|products|orders)/s);
  assert.doesNotMatch(migrationSource, /Date\.now\(\)[\s\S]{0,120}source_event_key/);
});

test('M7U2-C2: sanitización conserva allowlists y elimina secretos/PII incluso anidados', () => {
  const orderInput = {
    order_code: 'ORD-2026-001',
    order_number: 'ORD-2026-001',
    status: 'confirmed',
    quantity: 2,
    shipping_amount: 4.5,
    shipping_usd: 4.5,
    reason: 'Corrección administrativa',
    customer_email: 'private-customer@example.test',
    customer_phone: '+53 55555555',
    customer_address: 'Dirección privada QA',
    notes: 'Nota privada QA',
    password: 'Secret-Password-QA',
    temporary_password: 'Temporary-Password-QA',
    token: 'Bearer-Token-QA',
    tokenKey: 'Token-Key-QA',
    cookie: 'Cookie-QA',
    nested: {
      device_digest: 'Digest-QA',
      hmac: 'Hmac-QA',
      ciphertext: 'Ciphertext-QA',
      full_ip: '203.0.113.77',
      browser_private: 'Private-Browser-QA',
      process_env: 'Environment-QA',
      raw_payload: 'Raw-Payload-QA',
    },
  };
  const safeOrder = audit.snapshotForRecord(record(RESOURCE_ID, orderInput), audit.COLLECTION_CONFIG.orders);

  assert.equal(safeOrder.order_number, 'ORD-2026-001');
  assert.equal(safeOrder.status, 'confirmed');
  assert.equal(safeOrder.shipping_usd, 4.5);
  const serialized = JSON.stringify(safeOrder).toLowerCase();
  for (const forbidden of [
    'private-customer', '55555555', 'dirección privada', 'nota privada', 'secret-password',
    'temporary-password', 'bearer-token', 'token-key', 'cookie-qa', 'digest-qa', 'hmac-qa',
    'ciphertext-qa', '203.0.113.77', 'private-browser', 'environment-qa', 'raw-payload',
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);

  const catalogInput = {
    name: 'Producto seguro', status: 'active', visibility: true, price: 12, stock: 4,
    expiration_date: '2026-08-20', category: 'Despensa', image_binary: 'base64-private-qa',
  };
  const safeCatalog = audit.snapshotForRecord(record(RESOURCE_ID, catalogInput), audit.COLLECTION_CONFIG.products);
  for (const key of ['name', 'status', 'price', 'stock', 'expiration_date', 'category']) {
    assert.notEqual(safeCatalog[key], undefined, key);
  }
  assert.equal(safeCatalog.category, true, 'las relaciones se reducen a presencia, nunca a ID');
  assert.equal(JSON.stringify(safeCatalog).includes('base64-private-qa'), false);
  assert.deepEqual(audit.snapshotForRecord(record(RESOURCE_ID, { name: 'No debe pasar' }), undefined), {});

  const nestedSafe = audit.sanitizeObject(orderInput);
  assert.equal(JSON.stringify(nestedSafe).includes('private-customer@example.test'), false);
  assert.equal(JSON.stringify(nestedSafe).includes('Secret-Password-QA'), false);
});

test('M7U2-C2: reemplazos de relación y archivo se detectan sin persistir IDs ni nombres', () => {
  const beforeRecord = record(RESOURCE_ID, {
    name: 'Producto seguro',
    category: 'cat000000000001',
    images: ['foto-anterior-privada.jpg'],
  });
  const afterRecord = record(RESOURCE_ID, {
    name: 'Producto seguro',
    category: 'cat000000000002',
    images: ['foto-nueva-privada.jpg'],
  });
  const before = audit.snapshotForRecord(beforeRecord, audit.COLLECTION_CONFIG.products);
  const after = audit.snapshotForRecord(afterRecord, audit.COLLECTION_CONFIG.products);
  const comparisonBefore = audit.comparisonSnapshotForRecord(beforeRecord, audit.COLLECTION_CONFIG.products);
  const comparisonAfter = audit.comparisonSnapshotForRecord(afterRecord, audit.COLLECTION_CONFIG.products);
  const diff = audit.changedSnapshots(before, after, comparisonBefore, comparisonAfter);

  assert.deepEqual(diff.changed, ['category', 'images']);
  assert.deepEqual(diff.previous, {
    category: 'Asignación anterior',
    images: 'Archivo anterior',
  });
  assert.deepEqual(diff.next, {
    category: 'Asignación actualizada',
    images: 'Archivo actualizado',
  });
  const serialized = JSON.stringify(diff);
  for (const privateValue of [
    'cat000000000001', 'cat000000000002',
    'foto-anterior-privada.jpg', 'foto-nueva-privada.jpg',
  ]) assert.equal(serialized.includes(privateValue), false, privateValue);

  const unchanged = audit.changedSnapshots(before, before, comparisonBefore, comparisonBefore);
  assert.deepEqual(unchanged, { changed: [], previous: {}, next: {} });
});

test('M7U2-C2: source key es determinística, única e independiente de solo tiempo', () => {
  const sourceFunction = functionSource(auditSource, 'requestSourceKey');
  assert.doesNotMatch(sourceFunction, /Date\.now\(\)|new Date\(\)/);
  assert.match(sourceFunction, /recordId\(record\)/);
  assert.match(sourceFunction, /created|updated/);
  assert.match(sourceFunction, /shortFingerprint\(diff\)/);
  assert.match(sourceFunction, /x-request-id|idempotency-key/i);

  const app = {
    existing: null,
    saves: 0,
    findFirstRecordByFilter(_collection, _filter, bindings) {
      if (this.existing && this.existing.source_event_key === bindings.source) return this.existing;
      throw new Error('record_not_found');
    },
    findCollectionByNameOrId(name) { return { name }; },
    save(value) { this.saves += 1; this.existing = value; },
  };
  const previousRecord = global.Record;
  global.Record = FakeRecord;
  try {
    const input = {
      storeId: STORE_ID,
      origin: 'system',
      module: 'catalog',
      action: 'product_updated',
      severity: 'critical',
      resourceType: 'product',
      resourceId: RESOURCE_ID,
      resourceLabel: 'Producto seguro',
      previousValues: { price: 10 },
      newValues: { price: 12 },
      summary: 'Cambió precio',
      sourceEventKey: `product:update:${RESOURCE_ID}:request-20260720-0001`,
    };
    const first = audit.createActivity(app, input);
    const second = audit.createActivity(app, { ...input });
    assert.equal(first, second);
    assert.equal(app.saves, 1);
    assert.throws(() => audit.buildActivityValues(app, { ...input, sourceEventKey: '' }), /source/i);
    assert.throws(() => audit.buildActivityValues(app, { ...input, sourceEventKey: 'token:secret' }), /source/i);
    assert.doesNotThrow(() => audit.buildActivityValues(app, {
      ...input,
      sourceEventKey: `team:team_temporary_password_issued:${ACTIVITY_ID}`,
    }));
  } finally {
    if (previousRecord === undefined) delete global.Record;
    else global.Record = previousRecord;
  }
});

test('M7U2-C2: evento conserva snapshots históricos y separa actor humano de sistema', () => {
  const actor = record(ACTOR_ID, {
    display_name: 'María González',
    email: 'maria.internal@example.test',
    role: 'store_staff',
    template_code: 'orders_shipping',
  });
  const sourceKey = `order:status:${RESOURCE_ID}:operation-0001`;
  const app = {
    findFirstRecordByFilter(collection) {
      if (collection === 'store_user_access') return record('acc000000000001', { template_code: 'orders_shipping' });
      throw new Error('record_not_found');
    },
  };
  const event = audit.buildActivityValues(app, {
    storeId: STORE_ID,
    actor,
    origin: 'store_admin',
    module: 'orders',
    action: 'status_changed',
    severity: 'important',
    resourceType: 'order',
    resourceId: RESOURCE_ID,
    resourceLabel: 'ORD-2026-001',
    previousValues: { status: 'pending', customer_email: 'private@example.test' },
    newValues: { status: 'confirmed', token: 'Secret-Token-QA' },
    summary: 'Cambió el estado del pedido',
    sourceEventKey: sourceKey,
  });

  assert.equal(event.store, STORE_ID);
  assert.equal(event.actor, ACTOR_ID);
  assert.equal(event.actor_id_snapshot, ACTOR_ID);
  assert.equal(event.actor_name_snapshot, 'María González');
  assert.equal(event.actor_email_snapshot, 'maria.internal@example.test');
  assert.equal(event.actor_role_snapshot, 'store_staff');
  assert.equal(event.actor_template_snapshot, 'orders_shipping');
  assert.equal(event.resource_id_snapshot, RESOURCE_ID);
  assert.equal(event.resource_label_snapshot, 'ORD-2026-001');
  assert.equal(event.source_event_key, sourceKey);
  assert.equal(JSON.stringify(event).includes('private@example.test'), false);
  assert.equal(JSON.stringify(event).includes('Secret-Token-QA'), false);

  const system = audit.buildActivityValues(app, {
    storeId: STORE_ID,
    actor: null,
    origin: 'system',
    module: 'security',
    action: 'automatic_lock',
    severity: 'critical',
    resourceType: 'security_block',
    resourceId: RESOURCE_ID,
    resourceLabel: 'Bloqueo automático',
    previousValues: {},
    newValues: { status: 'active' },
    summary: 'Bloqueo creado por el sistema',
    sourceEventKey: 'security:automatic_lock:res000000000001:operation-0001',
  });
  assert.equal(system.origin, 'system');
  assert.equal(system.actor || '', '');
  assert.equal(system.actor_id_snapshot, 'system');
  assert.equal(system.actor_name_snapshot, 'Sistema');
});

test('M7U2-C2: payloads de actividad son exactos, paginados y self no acepta actor arbitrario', () => {
  const summary = activity.parseFilters({});
  assert.equal(summary.page, 1);
  assert.equal(summary.perPage, 20);

  const list = activity.parseFilters({
    page: 2,
    per_page: 20,
    module: 'catalog',
    severity: 'critical',
    review_status: 'pending',
    date_from: '2026-07-01',
    date_to: '2026-07-20',
    search: 'precio',
    resource_type: 'product',
    resource_id: RESOURCE_ID,
  });
  assert.equal(list.page, 2);
  assert.equal(list.perPage, 20);
  assert.equal(list.resourceType, 'product');
  assert.equal(list.resourceId, RESOURCE_ID);
  const recentDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const fromOnly = activity.parseFilters({ date_from: recentDate });
  const toOnly = activity.parseFilters({ date_to: today });
  assert.ok(fromOnly.dateFrom);
  assert.ok(fromOnly.dateTo, 'date_from aislada recibe un límite superior del servidor');
  assert.ok(toOnly.dateFrom, 'date_to aislada recibe un límite inferior del servidor');
  assert.ok(toOnly.dateTo);
  assert.throws(() => activity.parseFilters({ date_from: '1900-01-01' }), /invalid_payload/);
  assert.throws(() => activity.parseFilters({ date_to: '1900-01-01' }), /invalid_payload/);
  assert.throws(() => activity.parseFilters({ page: 1, per_page: 500 }), /invalid_payload/);
  assert.throws(() => activity.parseFilters({ module: 'unknown' }), /invalid_payload/);
  assert.throws(() => activity.parseFilters({ severity: 'urgent' }), /invalid_payload/);
  assert.throws(() => activity.parseFilters({ resource_type: 'product' }), /invalid_payload/);
  assert.throws(() => activity.parseFilters({ resource_type: 'unknown', resource_id: RESOURCE_ID }), /unknown_resource_type/);
  assert.throws(() => activity.parseFilters({ token: 'x' }), /invalid_payload/);
  const selfHandler = functionSource(activitySource, 'handleSelf');
  assert.match(selfHandler, /actor_id/);
  assert.match(selfHandler, /review_status/);
  assert.match(selfHandler, /store_id/);
  assert.match(selfHandler, /forcedActorId:\s*actorId/);
  assert.doesNotMatch(selfHandler, /bodyValue\(body,\s*["']actor_id["']\)/);
  const summaryHandler = functionSource(activitySource, 'summaryForStore');
  assert.match(summaryHandler, /NOT IN\s*\(['"]system['"],\s*['"]migration['"]\)/);
  const actorOptions = functionSource(activitySource, 'actorOptions');
  assert.match(actorOptions, /ROW_NUMBER\(\)[\s\S]*PARTITION BY actor_id_snapshot/);
});

test('M7U2-C2: review valida estado, nota y payload sin alterar evento', () => {
  const reviewed = activity.reviewPayload({
    activity_id: ACTIVITY_ID,
    status: 'reviewed',
    note: 'Verificado por la principal',
  });
  assert.equal(reviewed.activityId, ACTIVITY_ID);
  assert.equal(reviewed.status, 'reviewed');

  const correction = activity.reviewPayload({
    activity_id: ACTIVITY_ID,
    status: 'requires_correction',
    note: 'Corregir el precio publicado',
  });
  assert.equal(correction.status, 'requires_correction');
  assert.throws(() => activity.reviewPayload({ activity_id: ACTIVITY_ID, status: 'requires_correction', note: '   ' }), /review_note_required/);
  assert.throws(() => activity.reviewPayload({ activity_id: ACTIVITY_ID, status: 'requires_correction', note: 'corta' }), /review_note_required/);
  assert.throws(() => activity.reviewPayload({ activity_id: ACTIVITY_ID, status: 'pending', note: '' }), /invalid_payload/);
  assert.throws(() => activity.reviewPayload({ activity_id: ACTIVITY_ID, status: 'reviewed', note: 'x'.repeat(1001) }), /invalid_payload/);
  assert.throws(() => activity.reviewPayload({ activity_id: ACTIVITY_ID, status: 'reviewed', reviewed_by: ACTOR_ID }), /invalid_payload/);

  const handler = functionSource(activitySource, 'handleReview');
  assert.match(handler, /runInTransaction/);
  assert.match(handler, /REVIEW_COLLECTION/);
  assert.match(handler, /createActivity/);
  assert.match(handler, /parsed\.note\s*\|\|\s*\(parsed\.status\s*===\s*"reviewed"\s*\?\s*previousNote/);
  assert.match(handler, /note:\s*recordString\(review,\s*"note",\s*1000\)/);
  assert.doesNotMatch(handler, /(?:delete|save)\(activity(?:Record)?\)/);
});

test('M7U2-C2: last-modified limita lote, tipos e IDs y conserva una consulta agrupada', () => {
  const valid = activity.lastModifiedPayload({
    resources: [
      { type: 'product', id: RESOURCE_ID },
      { type: 'order', id: 'res000000000002' },
    ],
  });
  assert.equal(valid.resources.length, 2);
  assert.throws(() => activity.lastModifiedPayload({ resources: [] }), /invalid_payload/);
  assert.throws(() => activity.lastModifiedPayload({ resources: [{ type: 'unknown', id: RESOURCE_ID }] }), /unknown_resource_type/);
  assert.throws(() => activity.lastModifiedPayload({ resources: [{ type: 'product', id: '../outside' }] }), /invalid_payload/);
  assert.throws(() => activity.lastModifiedPayload({
    resources: Array.from({ length: 101 }, (_, index) => ({
      type: 'product',
      id: `r${String(index).padStart(14, '0')}`,
    })),
  }), /invalid_payload/);
  assert.throws(() => activity.lastModifiedPayload({ resources: [{ type: 'product', id: RESOURCE_ID }], actor_id: ACTOR_ID }), /invalid_payload/);

  const handler = functionSource(activitySource, 'handleLastModified');
  const latest = functionSource(activitySource, 'lastModifiedRows');
  assert.match(handler, /lastModifiedRows/);
  assert.doesNotMatch(handler, /resourceExistence/);
  assert.match(latest, /owned_resources[\s\S]*UNION ALL/);
  assert.equal((latest.match(/queryRows\(/g) || []).length, 1);
  assert.match(latest, /ROW_NUMBER\(\)[\s\S]*PARTITION BY (?:a\.)?resource_type, (?:a\.)?resource_id_snapshot/);
  assert.doesNotMatch(latest, /resources\.(?:forEach|map)[\s\S]{0,700}find(?:First)?Record/);
  assert.doesNotMatch(handler, /previous_values_json|new_values_json|actor_email_snapshot/);
});

test('M7U2-C2: rutas de recurso son allowlist y nunca aceptan URL o path arbitrario', () => {
  const store = record(STORE_ID, { slug: 'tienda-qa' });
  const productRoute = activity.resourcePath(store, { resource_type: 'product', resource_id_snapshot: RESOURCE_ID }, true);
  const orderRoute = activity.resourcePath(store, { resource_type: 'order', resource_id_snapshot: RESOURCE_ID }, true);
  assert.match(productRoute, /^\/t\/tienda-qa\/admin\/products(?:[/?#]|$)/);
  assert.match(orderRoute, /^\/t\/tienda-qa\/admin\/orders(?:[/?#]|$)/);
  assert.equal(/^https?:\/\//i.test(productRoute), false);
  assert.equal(/^https?:\/\//i.test(orderRoute), false);
  assert.equal(activity.resourcePath(store, { resource_type: 'unknown', resource_id_snapshot: RESOURCE_ID }, true) || '', '');
  assert.equal(activity.resourcePath(store, { resource_type: 'order', resource_id_snapshot: RESOURCE_ID }, false) || '', '');
  const encodedTraversal = activity.resourcePath(store, { resource_type: 'order', resource_id_snapshot: '../master' }, true);
  const encodedExternal = activity.resourcePath(store, { resource_type: 'order', resource_id_snapshot: 'https://evil.example' }, true);
  assert.equal(encodedTraversal.includes('../'), false);
  assert.equal(encodedExternal.includes('https://'), false);
});

test('M7U2-C2: siete rutas privadas POST están registradas con auth y límites', () => {
  const routes = [
    ['/api/pz/store/activity/summary', 'handleSummary'],
    ['/api/pz/store/activity/list', 'handleList'],
    ['/api/pz/store/activity/detail', 'handleDetail'],
    ['/api/pz/store/activity/review', 'handleReview'],
    ['/api/pz/store/activity/user-report', 'handleUserReport'],
    ['/api/pz/store/activity/self', 'handleSelf'],
    ['/api/pz/store/activity/last-modified', 'handleLastModified'],
  ];
  for (const [route, handler] of routes) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(routeSource, new RegExp(`"POST"\\s*,\\s*"${escaped}"`, 's'), route);
    assert.match(routeSource, new RegExp(`\\.${handler}\\(e\\)|${handler}\\(e\\)`), handler);
  }
  assert.ok((routeSource.match(/\$apis\.requireAuth\(\)/g) || []).length >= routes.length);
  assert.ok((routeSource.match(/\$apis\.bodyLimit\((?:2048|4096|8192|16384)\)/g) || []).length >= routes.length);
  assert.ok((routeSource.match(/\$apis\.skipSuccessActivityLog\(\)/g) || []).length >= routes.length);
  assert.doesNotMatch(routeSource, /"GET"\s*,\s*"\/api\/pz\/store\/activity\//);
  assert.match(activitySource, /private, no-store/);
});

test('M7U2-C2: REST directo no puede crear, editar ni borrar auditoría o reviews', () => {
  for (const hook of ['onRecordCreateRequest', 'onRecordUpdateRequest', 'onRecordDeleteRequest']) {
    const expression = new RegExp(`${hook}\\([\\s\\S]{0,240}rejectDirectActivityMutation[\\s\\S]{0,160}"store_activity_audit",\\s*"store_activity_reviews"`);
    assert.match(routeSource, expression, hook);
  }
  const reject = functionSource(auditSource, 'rejectDirectActivityMutation');
  assert.match(reject, /NotFoundError|not_found/);
  assert.doesNotMatch(reject, /e\.next\(\)/);
  assert.doesNotMatch(activitySource, /app\.delete\([^)]*(?:ACTIVITY_COLLECTION|store_activity_audit)/);
});

test('M7U2-C2: tienda no admite borrado REST ni cambios directos que tienen flujo especializado', () => {
  assert.match(routeSource, /PZ_ACTIVITY_STORE_COLLECTIONS\s*=\s*\["stores"\]/);
  assert.match(routeSource, /onRecordDeleteRequest\([\s\S]{0,260}rejectDirectStoreDeletion[\s\S]{0,160}PZ_ACTIVITY_STORE_COLLECTIONS/);
  assert.match(routeSource, /onRecordUpdateRequest\([\s\S]{0,260}handleRecordMutationRequest[\s\S]{0,160}PZ_ACTIVITY_STORE_COLLECTIONS/);

  assert.throws(
    () => audit.rejectDirectStoreDeletion({}),
    /not_found|requested resource/i,
  );
  assert.throws(
    () => audit.rejectDirectStoreSpecializedUpdate({
      requestInfo() { return { body: { plan: 'premium' } }; },
    }),
    /not_found|requested resource/i,
  );
  assert.throws(
    () => audit.rejectDirectStoreSpecializedUpdate({
      requestInfo() { return { body: { 'primary_admin_user+': ACTOR_ID } }; },
    }),
    /not_found|requested resource/i,
  );
  assert.doesNotThrow(() => audit.rejectDirectStoreSpecializedUpdate({
    requestInfo() { return { body: { featured: true } }; },
  }));

  for (const field of audit.STORE_SPECIALIZED_FIELDS) {
    assert.throws(
      () => audit.rejectDirectStoreSpecializedUpdate({
        requestInfo() { return { body: { [field]: 'blocked' } }; },
      }),
      /not_found|requested resource/i,
      field,
    );
  }
});

test('M7U2-C2: autorización distingue principal, Master, self y tenant ajeno', () => {
  for (const token of ['isPrimaryAdmin', 'master_admin', 'primary_admin_required', 'activity_not_found', 'unauthorized']) {
    assert.equal(activitySource.includes(token), true, token);
  }
  const selfHandler = functionSource(activitySource, 'handleSelf');
  assert.match(selfHandler, /bodyKeys\(body\)\.includes\("actor_id"\)/);
  assert.match(selfHandler, /forcedActorId:\s*actorId/);
  assert.match(selfHandler, /recordId\(e\.auth\)/);
  assert.doesNotMatch(selfHandler, /bodyValue\(body,\s*["']actor_id["']\)/);
  const reportHandler = functionSource(activitySource, 'handleUserReport');
  assert.match(reportHandler, /requirePrimary:\s*true/);
  assert.match(reportHandler, /actor_id_snapshot|actor/);
  const actorGuard = functionSource(activitySource, 'activeActor');
  const accessGuard = functionSource(activitySource, 'loadAccessContext');
  assert.match(actorGuard, /status\s*===\s*["']active["']/);
  assert.match(accessGuard, /recordString\(store,\s*["']status["']/);
  assert.match(accessGuard, /isBlockedByPlan/);
  assert.match(activitySource, /store\s*=\s*\{:\w+\}|store_id_snapshot\s*=\s*\{:\w+\}/);
  assert.doesNotMatch(activitySource, /`[^`]*(?:filter|where)[^`]*\$\{(?:body|payload|query)/i);
});

test('M7U2-C2: reporte individual admite usuario vivo sin eventos y conserva fallback histórico', () => {
  const liveUser = record(ACTOR_ID, {
    store: STORE_ID,
    role: 'store_staff',
    display_name: 'Usuario sin cambios',
  });
  const liveApp = {
    findRecordById(collection, id) {
      if (collection === 'users' && id === ACTOR_ID) return liveUser;
      throw new Error('not_found');
    },
  };
  assert.deepEqual(activity.historicalActor(liveApp, STORE_ID, ACTOR_ID), {
    name: 'Usuario sin cambios',
    state: 'active',
  });

  const deletedApp = {
    findRecordById() { throw new Error('not_found'); },
    db() {
      return {
        newQuery() {
          return {
            bind() { return this; },
            all(rows) { rows.push({ actor_name_snapshot: 'Usuario eliminado', actor: '' }); },
          };
        },
      };
    },
  };
  const previousArrayOf = global.arrayOf;
  const previousDynamicModel = global.DynamicModel;
  global.arrayOf = () => [];
  global.DynamicModel = class DynamicModel { constructor(values) { Object.assign(this, values); } };
  try {
    assert.deepEqual(activity.historicalActor(deletedApp, STORE_ID, ACTOR_ID), {
      name: 'Usuario eliminado',
      state: 'deleted',
    });
  } finally {
    global.arrayOf = previousArrayOf;
    global.DynamicModel = previousDynamicModel;
  }
});

test('M7U2-C2: cobertura declarada incluye cada colección editable y fuentes especializadas', () => {
  const coverageSource = `${auditSource}\n${activitySource}\n${routeSource}`;
  for (const collection of [
    'stores', 'products', 'product_variations', 'categories', 'subcategories', 'orders', 'order_items',
    'shipping_methods', 'shipping_zones', 'automatic_promotions', 'manual_coupons', 'gifts',
    'raffles', 'raffle_entries', 'reviews', 'settings', 'store_visual_items', 'currencies',
    'store_security_settings', 'store_security_blocks', 'store_user_access',
  ]) assert.equal(coverageSource.includes(collection), true, collection);

  for (const [label, source, specialized] of [
    ['equipo tienda', teamSource, 'store_user_audit'],
    ['equipo Master', masterUsersSource, 'store_user_audit'],
    ['dispositivos', deviceSource, 'store_user_device_audit'],
    ['precios', orderPricingSource, 'order_price_adjustments'],
    ['Seguridad', securitySource, 'store_security_audit'],
    ['Planes', planSource, 'store_plan_audit'],
    ['principal', primaryAdminSource, 'primary_admin_assigned'],
  ]) {
    assert.equal(source.includes(specialized), true, `${label}: ${specialized}`);
    assert.equal((source.match(/\.createActivity\s*\(/g) || []).length, 1, `${label}: un solo puente central`);
  }

  for (const noisy of ['page_view', 'last_seen', 'heartbeat', 'polling', 'cache_hit', 'keystroke']) {
    assert.doesNotMatch(coverageSource, new RegExp(`action\\s*[:=][^\\n]{0,80}["']${noisy}["']`, 'i'), noisy);
  }
});

test('M7U2-C2: solo limpieza integral Master incorpora reviews y eventos centrales', () => {
  const reviews = masterDeletionSource.indexOf('store_activity_reviews');
  const events = masterDeletionSource.indexOf('store_activity_audit');
  assert.ok(reviews >= 0, 'limpieza Master debe incluir store_activity_reviews');
  assert.ok(events > reviews, 'reviews deben eliminarse antes de sus actividades');
  assert.match(masterDeletionSource, /deleteExpected[\s\S]*store_activity_reviews/);
  assert.match(masterDeletionSource, /deleteExpected[\s\S]*store_activity_audit/);
  assert.doesNotMatch(`${teamSource}\n${masterUsersSource}`, /deleteExpected\([^\n]*store_activity_(?:reviews|audit)/);
});

test('M7U2-C2: escritura operativa evita after-success y recibe app transaccional', () => {
  const creator = functionSource(auditSource, 'createActivity');
  const mutation = functionSource(auditSource, 'handleRecordMutationRequest');
  assert.match(creator, /app|txApp/);
  assert.match(creator, /ACTIVITY_COLLECTION/);
  assert.match(creator, /source_event_key/);
  assert.match(mutation, /runInTransaction/);
  assert.match(mutation, /e\.next\(\)[\s\S]*createRecordMutationActivity/);
  assert.doesNotMatch(routeSource, /onRecordAfter(?:Create|Update|Delete)Success/);
  assert.doesNotMatch(auditSource, /setTimeout|Promise\.resolve\([^)]*\)\.then/);
});

test('M7U2-C2: auditor genérico reutiliza una transacción activa sin anidarla', () => {
  let nestedTransactions = 0;
  let nextCalls = 0;
  const expected = new Error('stop_after_transaction_check');
  const txApp = {
    isTransactional() { return true; },
    runInTransaction() { nestedTransactions += 1; },
  };
  const event = {
    app: txApp,
    auth: record(ACTOR_ID, { role: 'store_admin', status: 'active', store: STORE_ID }),
    record: record(RESOURCE_ID, { store: STORE_ID, name: 'Producto' }),
    next() { nextCalls += 1; throw expected; },
  };
  assert.throws(
    () => audit.handleRecordMutationRequest(event, 'update', 'products'),
    (error) => error === expected,
  );
  assert.equal(nextCalls, 1);
  assert.equal(nestedTransactions, 0);
  assert.equal(event.app, txApp);
});

test('M7U2-C2: eliminación principal delega el único servicio físico compartido', () => {
  assert.match(teamRouteSource, /"POST"\s*,\s*"\/api\/pz\/store\/team\/delete"/s);
  assert.match(teamRouteSource, /handleDelete/);
  assert.match(teamRouteSource, /\$apis\.requireAuth\(\)/);
  assert.match(teamRouteSource, /\$apis\.bodyLimit\(4096\)/);
  assert.match(teamRouteSource, /\$apis\.skipSuccessActivityLog\(\)/);

  const combined = `${masterUsersSource}\n${teamSource}`;
  const sharedNames = ['deleteStoreUserTransactional', 'deleteStoreUserInTransaction'];
  const sharedName = sharedNames.find((name) => combined.includes(`function ${name}`));
  assert.ok(sharedName, 'falta servicio compartido de eliminación');
  const definitions = sharedNames.reduce((total, name) => (
    total + (combined.match(new RegExp(`function ${name}\\s*\\(`, 'g')) || []).length
  ), 0);
  assert.equal(definitions, 1);
  assert.match(masterUsersSource, new RegExp(`handleDelete[\\s\\S]*${sharedName}`));
  assert.match(teamSource, new RegExp(`handleDelete[\\s\\S]*${sharedName}`));
  assert.match(teamSource, /primary_admin_user/);
  assert.match(teamSource, /delete_confirmation_mismatch/);
  assert.match(teamSource, /delete_reason_required/);
  assert.match(teamSource, /user_delete_failed/);

  const sharedOwner = masterUsersSource.includes(`function ${sharedName}`) ? masterUsersSource : teamSource;
  const shared = functionSource(sharedOwner, sharedName);
  for (const token of [
    'createAudit', 'deleteTargetAccessRecords', 'assertNoUnexpectedRequiredUserRelations',
    'clearOptionalUserRelations', 'loadTargetDevices', 'app.delete', 'users', 'findActivityBySource',
  ]) assert.equal(shared.includes(token), true, token);
  const masterHandler = functionSource(masterUsersSource, 'handleDelete');
  const teamHandler = functionSource(teamSource, 'handleDelete');
  assert.match(masterHandler, /runInTransaction/);
  assert.match(teamHandler, /runInTransaction/);
  const centralAudit = shared.indexOf('createAudit');
  const deleteUser = shared.lastIndexOf('app.delete');
  assert.ok(centralAudit >= 0 && deleteUser > centralAudit, 'auditoría central debe guardarse antes de borrar auth');
  assert.match(shared, /findRecord[^\n]*"users"|findRecordById\("users"/);
  const specializedCreator = functionSource(masterUsersSource, 'createAudit');
  const centralCreator = functionSource(masterUsersSource, 'centralUserActivity');
  assert.match(specializedCreator, /centralUserActivity/);
  assert.match(centralCreator, /createActivity/);
  assert.match(shared, /team:user_deleted:/);
});
