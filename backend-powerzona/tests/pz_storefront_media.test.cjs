'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const media = require('../pb_hooks/pz_storefront_media_lib.js');

const STORE_A = 'storemedia00001';
const STORE_B = 'storemedia00002';
const USER_A = 'usermedia000001';

class FakeRecord {
  constructor(collection, values = {}) {
    this.collectionName = collection?.name || collection;
    this.values = { ...values };
    this.id = String(values.id || '');
  }

  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) {
    if (key === 'id') this.id = String(value || '');
    else this.values[key] = value;
  }
}

global.Record = FakeRecord;

function record(collection, id, values = {}) {
  return new FakeRecord(collection, { id, ...values });
}

function premiumStore(id = STORE_A, overrides = {}) {
  return record('stores', id, {
    status: 'active',
    plan: 'premium',
    plan_is_permanent: true,
    plan_started_at: '2026-01-01T00:00:00.000Z',
    primary_admin_user: USER_A,
    ...overrides,
  });
}

function createApp({ store = premiumStore(), userOverrides = {}, accessPermissions = [] } = {}) {
  const tables = new Map();
  const collections = new Map([
    ['stores', { name: 'stores' }],
    ['users', { name: 'users' }],
    ['store_user_access', { name: 'store_user_access' }],
    [media.MEDIA_COLLECTION, { name: media.MEDIA_COLLECTION }],
    [media.CAMPAIGNS_COLLECTION, { name: media.CAMPAIGNS_COLLECTION }],
  ]);
  const add = (item) => {
    if (!tables.has(item.collectionName)) tables.set(item.collectionName, []);
    const rows = tables.get(item.collectionName);
    const current = rows.findIndex((candidate) => candidate.id === item.id);
    if (current >= 0) rows[current] = item;
    else rows.push(item);
    return item;
  };
  add(store);
  add(record('stores', STORE_B, {
    status: 'active', plan: 'premium', plan_is_permanent: true,
    plan_started_at: '2026-01-01T00:00:00.000Z', primary_admin_user: '',
  }));
  add(record('users', USER_A, {
    role: 'store_admin', status: 'active', store: store.id, ...userOverrides,
  }));
  add(record('store_user_access', 'accessmedia0001', {
    store: store.id,
    user: USER_A,
    template_code: 'custom',
    permissions_json: accessPermissions,
  }));
  let nextMedia = 1;
  const rows = (collection) => tables.get(collection) || [];
  const app = {
    tables,
    rows,
    add,
    findCollectionByNameOrId(name) {
      const collection = collections.get(name);
      if (!collection) throw new Error('collection_not_found');
      return collection;
    },
    findRecordById(collection, id) {
      const found = rows(collection).find((item) => item.id === id);
      if (!found) throw new Error('record_not_found');
      return found;
    },
    findFirstRecordByFilter(collection, _filter, params = {}) {
      const found = rows(collection).find((item) => {
        if (params.mediaId !== undefined) return item.getString('media') === params.mediaId;
        if (collection === 'store_user_access') {
          return item.getString('store') === store.id && item.getString('user') === USER_A;
        }
        return false;
      });
      if (!found) throw new Error('record_not_found');
      return found;
    },
    findRecordsByFilter(collection, filter, _sort, limit, _offset, params = {}) {
      return rows(collection).filter((item) => {
        if (params.storeId !== undefined && item.getString('store') !== params.storeId) return false;
        if (params.mediaId !== undefined && item.getString('media') !== params.mediaId) return false;
        if (filter.includes('delete_after')) {
          const value = new Date(item.getString('delete_after')).getTime();
          return Number.isFinite(value) && value <= new Date(params.now).getTime();
        }
        return true;
      }).slice(0, limit);
    },
    save(item) {
      if (!item.id && item.collectionName === media.MEDIA_COLLECTION) {
        item.id = `media${String(nextMedia++).padStart(10, '0')}`;
      }
      add(item);
      return item;
    },
    delete(item) {
      const current = rows(item.collectionName);
      tables.set(item.collectionName, current.filter((candidate) => candidate.id !== item.id));
    },
    runInTransaction(callback) { callback(this); },
  };
  return app;
}

function webpFile({ name = `${'a'.repeat(32)}.webp`, size = 128, validMagic = true } = {}) {
  const prefix = [
    0x52, 0x49, 0x46, 0x46, 0x22, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x16, 0, 0, 0, 0x30, 0x01, 0,
    0x9d, 0x01, 0x2a, 0xb0, 0x04, 0x76, 0x02,
  ];
  if (!validMagic) prefix[0] = 0x4d;
  return {
    originalName: name,
    name,
    size,
    reader: {
      open() {
        let offset = 0;
        return {
          read(target) {
            if (offset >= prefix.length) return 0;
            const count = Math.min(target.length, prefix.length - offset);
            for (let index = 0; index < count; index += 1) target[index] = prefix[offset + index];
            offset += count;
            return count;
          },
          close() {},
        };
      },
    },
  };
}

function uploadMetadata(overrides = {}) {
  return {
    bytes: '128',
    width: '1200',
    height: '630',
    sha256: 'b'.repeat(64),
    ...overrides,
  };
}

test('contrato de metadatos es exacto y acota WebP final', () => {
  assert.deepEqual(media.parseUploadMetadata(uploadMetadata()), {
    bytes: 128, width: 1200, height: 630, sha256: 'b'.repeat(64),
  });
  assert.equal(media.parseUploadMetadata({ ...uploadMetadata(), store_id: STORE_B }), null);
  assert.equal(media.parseUploadMetadata(uploadMetadata({ bytes: String(media.MAX_OUTPUT_BYTES + 1) })), null);
  assert.equal(media.parseUploadMetadata(uploadMetadata({ width: '1201' })), null);
  assert.equal(media.parseUploadMetadata(uploadMetadata({ sha256: '../bad' })), null);
  assert.deepEqual(media.parseDeletePayload({ media_id: 'media0000000001' }), { mediaId: 'media0000000001' });
  assert.equal(media.parseDeletePayload({ media_id: 'media0000000001', store_id: STORE_B }), null);
});

test('PocketBase vuelve a comprobar tamaño, nombre aleatorio y firma WebP real', () => {
  assert.equal(media.hasWebpMagic(webpFile()), true);
  assert.deepEqual(media.parseUploadedWebpDimensions(webpFile()), { width: 1200, height: 630 });
  assert.equal(media.validateUploadedWebp(webpFile(), {
    bytes: 128, width: 1200, height: 630, sha256: 'b'.repeat(64),
  }), true);
  assert.throws(
    () => media.validateUploadedWebp(webpFile({ name: 'oferta.pdf.exe.webp' }), {
      bytes: 128, width: 100, height: 100, sha256: 'b'.repeat(64),
    }),
    (error) => error.code === 'media_invalid',
  );
  assert.throws(
    () => media.validateUploadedWebp(webpFile({ validMagic: false }), {
      bytes: 128, width: 100, height: 100, sha256: 'b'.repeat(64),
    }),
    (error) => error.code === 'media_invalid',
  );
  assert.throws(
    () => media.validateUploadedWebp(webpFile({ size: 129 }), {
      bytes: 128, width: 100, height: 100, sha256: 'b'.repeat(64),
    }),
    (error) => error.code === 'media_invalid',
  );
  assert.throws(
    () => media.validateUploadedWebp(webpFile(), {
      bytes: 128, width: 1199, height: 630, sha256: 'b'.repeat(64),
    }),
    (error) => error.code === 'media_invalid',
  );
});

test('fallos de consulta no abren cuota ni autorizan borrado', () => {
  const app = createApp();
  app.findRecordsByFilter = () => { throw new Error('database_unavailable'); };
  assert.throws(() => media.mediaUsage(app, STORE_A), /database_unavailable/);
  assert.throws(() => media.hasCampaignReference(app, 'media0000000001'), /database_unavailable/);
});

test('acceso exige tienda activa, Premium y marketing.push.manage', () => {
  const primaryApp = createApp();
  const context = media.loadMediaAccessContext(primaryApp, { id: USER_A }, '');
  assert.equal(context.storeId, STORE_A);
  assert.equal(media.assertMediaAccess(primaryApp, context), true);

  const freeApp = createApp({ store: premiumStore(STORE_A, {
    plan: 'free', plan_is_permanent: false, plan_expires_at: '2026-09-01T00:00:00.000Z',
  }) });
  assert.throws(
    () => media.assertMediaAccess(freeApp, media.loadMediaAccessContext(freeApp, { id: USER_A }, '')),
    (error) => error.code === 'plan_not_available',
  );

  const staffApp = createApp({
    store: premiumStore(STORE_A, { primary_admin_user: '' }),
    userOverrides: { role: 'store_staff' },
    accessPermissions: [],
  });
  assert.throws(
    () => media.assertMediaAccess(staffApp, media.loadMediaAccessContext(staffApp, { id: USER_A }, '')),
    (error) => error.code === 'permission_denied',
  );
});

test('alta conserva tenant, autor, retención y cuota física', () => {
  const app = createApp();
  const context = media.loadMediaAccessContext(app, { id: USER_A }, '');
  const now = new Date('2026-08-12T12:00:00.000Z');
  const created = media.createMediaRecord(app, context, webpFile(), {
    bytes: 128,
    width: 1200,
    height: 630,
    sha256: 'b'.repeat(64),
  }, now);
  assert.equal(created.getString('store'), STORE_A);
  assert.equal(created.getString('created_by'), USER_A);
  assert.equal(created.getString('status'), 'active');
  assert.equal(created.getString('delete_after'), '2026-08-13T12:00:00.000Z');
  assert.deepEqual(media.mediaUsage(app, STORE_A), { count: 1, bytes: 128 });

  for (let index = 1; index < media.MAX_STORED_MEDIA_PER_STORE; index += 1) {
    app.add(record(media.MEDIA_COLLECTION, `quota${String(index).padStart(10, '0')}`, {
      store: STORE_A, bytes: 1, status: 'archived',
    }));
  }
  assert.throws(
    () => media.assertMediaQuota(app, STORE_A, 1),
    (error) => error.code === 'media_count_exceeded',
  );
});

test('vencimiento absoluto elimina el medio y limpia referencias de campañas', () => {
  const app = createApp();
  const orphan = app.add(record(media.MEDIA_COLLECTION, 'media0000000001', {
    store: STORE_A, file: 'orphan.webp', bytes: 100, status: 'active',
    delete_after: '2026-08-01T00:00:00.000Z', referenced_at: '',
  }));
  const referenced = app.add(record(media.MEDIA_COLLECTION, 'media0000000002', {
    store: STORE_A, file: 'used.webp', bytes: 100, status: 'active',
    delete_after: '2026-08-01T00:00:00.000Z', referenced_at: '',
  }));
  app.add(record(media.CAMPAIGNS_COLLECTION, 'campaign0000001', {
    store: STORE_A, media: referenced.id, status: 'draft',
  }));

  const result = media.cleanupDueOrphans(app, new Date('2026-08-12T00:00:00.000Z'));
  assert.deepEqual(result, { scanned: 2, deleted: 2, detached_campaigns: 1, failed: 0 });
  assert.equal(app.rows(media.MEDIA_COLLECTION).includes(orphan), false);
  assert.equal(app.rows(media.MEDIA_COLLECTION).includes(referenced), false);
  assert.equal(app.rows(media.CAMPAIGNS_COLLECTION)[0].getString('media'), '');
});

test('descarga pública limita caché a cinco minutos y bloquea estados no publicables', () => {
  const values = new Map();
  const event = {
    record: record(media.MEDIA_COLLECTION, 'media0000000001', { status: 'active' }),
    response: { header: () => ({ set: (key, value) => values.set(key, value) }) },
    next: () => 'continued',
  };
  assert.equal(media.handleFileDownload(event), 'continued');
  assert.equal(values.get('Cache-Control'), 'public, max-age=300, must-revalidate');
  assert.equal(values.get('X-Content-Type-Options'), 'nosniff');
  event.record.set('status', 'pending_delete');
  assert.throws(() => media.handleFileDownload(event), (error) => error.code === 'media_not_found');
  event.record.set('status', 'unexpected');
  assert.throws(() => media.handleFileDownload(event), (error) => error.code === 'media_not_found');
});

test('rutas mantienen CRUD cerrado, límites, auth, descarga y tareas de vencimiento', () => {
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_storefront_media.pb.js'),
    'utf8',
  );
  assert.match(routes, /\/media\/upload/);
  assert.match(routes, /\/media\/list/);
  assert.match(routes, /\/media\/delete/);
  assert.match(routes, /\/media\/file\/\{record\}\/\{filename\}/);
  assert.equal((routes.match(/\$apis\.requireAuth\("users"\)/g) || []).length, 3);
  assert.equal((routes.match(/\$apis\.bodyLimit\(/g) || []).length, 4);
  assert.match(routes, /onFileDownloadRequest[\s\S]*"push_media"/);
  assert.match(routes, /cronAdd\([\s\S]*pz_storefront_push_media_expiry/);
  assert.match(routes, /cronAdd\([\s\S]*pz_store_storage_budget_monitor/);

  const foundation = fs.readFileSync(
    path.resolve(__dirname, '../pb_migrations/1786579200_storefront_push_foundation.js'),
    'utf8',
  );
  assert.match(foundation, /mimeTypes: \["image\/webp"\]/);
  assert.match(foundation, /maxSize: 768000/);
  assert.match(foundation, /protected: false/);
  assert.match(foundation, /privateCollection\([\s\S]*"push_media"/);

  const maximum = fs.readFileSync(
    path.resolve(__dirname, '../pb_migrations/1786579400_storefront_push_media_100k.js'),
    'utf8',
  );
  assert.match(maximum, /100 \* 1024/);
  assert.match(maximum, /getByName\("file"\)\.maxSize = maxBytes/);
  assert.match(maximum, /getByName\("bytes"\)\.max = maxBytes/);
});
