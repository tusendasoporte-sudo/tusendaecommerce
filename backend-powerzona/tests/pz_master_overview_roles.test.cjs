const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const storeId = 'storetestm7ui11';

function record(values) {
  return {
    id: values.id || '',
    getString(key) { return String(values[key] ?? ''); },
    get(key) { return values[key]; },
  };
}

function createApp() {
  return {
    findRecordById(collection, id) {
      if (collection === 'stores' && id === storeId) {
        return record({ id, name: 'Tienda de prueba', slug: 'tienda-prueba', status: 'active', featured: true });
      }
      throw new Error('record_not_found');
    },
    db() {
      return {
        newQuery() {
          return {
            bind() { return this; },
            all(rows) { rows.push({ ...rows.model }); },
          };
        },
      };
    },
    logger() { return { error() {} }; },
  };
}

const sourcePath = path.resolve(__dirname, '../pb_hooks/pz_master_overview_lib.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const sandbox = {
  module: { exports: {} },
  exports: {},
  Date,
  Error,
  Math,
  Number,
  Object,
  String,
  $app: createApp(),
  DynamicModel: function DynamicModel(model) { return model; },
  arrayOf(model) {
    const rows = [];
    rows.model = model;
    return rows;
  },
};
vm.runInNewContext(source, sandbox, { filename: sourcePath });

const endpoints = [
  ['global', sandbox.module.exports.handleGlobalOverview, { period_days: 30 }],
  ['store', sandbox.module.exports.handleStoreOverview, { store_id: storeId }],
  ['price-watch', sandbox.module.exports.handlePriceWatchPage, { page: 1, status: 'active', store_id: '', search: '' }],
];

function invoke(handler, role, body) {
  const result = { status: 0, payload: null };
  const auth = role ? record({ id: 'authusertest001', role }) : null;
  const event = {
    auth,
    requestInfo() { return { auth, body }; },
    response: { header() { return { set() {} }; } },
    json(status, payload) {
      result.status = status;
      result.payload = payload;
      return result;
    },
  };
  return handler(event);
}

for (const [name, handler, body] of endpoints) {
  test(`${name}: Master recibe 200`, () => {
    const response = invoke(handler, 'master_admin', body);
    assert.equal(response.status, 200);
    assert.equal(response.payload.ok, true);
  });

  for (const role of ['store_admin', 'store_staff', '']) {
    const label = role || 'publico';
    test(`${name}: ${label} recibe 403`, () => {
      const response = invoke(handler, role, body);
      assert.equal(response.status, 403);
      assert.equal(response.payload.error, 'unauthorized');
    });
  }
}

test('user_created abre el listado exacto de usuarios y conserva safeActionUrl', () => {
  assert.match(
    source,
    /SELECT 'user_created'[\s\S]*?u\.created, '\/master\/stores\/' \|\| u\.store \|\| '\/users'/,
  );
  assert.match(source, /action_url: safeActionUrl\(row\.actionUrl\)/);
});

test('las demás actividades recientes conservan sus destinos', () => {
  assert.match(source, /'\/master\/analytics\/' \|\| store \|\| '\/orders\/' \|\| id/);
  assert.match(source, /'\/master\/security\/' \|\| store/);
  assert.match(source, /'\/master\/products\/' \|\| store \|\| '\/' \|\| product_id_snapshot/);
});
