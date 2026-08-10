'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const creation = require('../pb_hooks/pz_master_store_creation_lib.js');

const MASTER_ID = 'masterstore0001';

function mutableRecord(id, values = {}, collection = null) {
  return {
    id,
    ...values,
    _collection: collection,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] || ''); },
    set(key, value) { this[key] = value; },
  };
}

function fixture({ existingSlug = false, failCurrency = false } = {}) {
  const stores = { name: 'stores' };
  const currencies = { name: 'currencies' };
  const actor = mutableRecord(MASTER_ID, { role: 'master_admin', status: 'active' });
  const saved = [];
  let sequence = 0;
  const previousRecord = global.Record;
  global.Record = class FakeRecord {
    constructor(collection) {
      sequence += 1;
      return mutableRecord(`record${String(sequence).padStart(9, '0')}`.slice(0, 15), {}, collection);
    }
  };
  const app = {
    findCollectionByNameOrId(name) {
      if (name === 'stores') return stores;
      if (name === 'currencies') return currencies;
      throw new Error('collection_not_found');
    },
    findRecordById(name, id) {
      if (name === 'users' && id === MASTER_ID) return actor;
      throw new Error('not_found');
    },
    findFirstRecordByFilter() {
      if (existingSlug) return mutableRecord('existingstore01');
      throw new Error('not_found');
    },
    save(record) {
      if (failCurrency && record._collection === currencies) throw new Error('currency_failed');
      saved.push(record);
      return record;
    },
  };
  return {
    app,
    saved,
    restore() { global.Record = previousRecord; },
  };
}

test('valida un payload cerrado y normalizado para crear tiendas', () => {
  assert.deepEqual(creation.parseCreateStorePayload({
    name: ' Mi Tienda ',
    slug: 'mi-tienda',
    status: 'active',
    owner_phone: ' +53 50000000 ',
  }), {
    name: 'Mi Tienda',
    slug: 'mi-tienda',
    status: 'active',
    ownerPhone: '+53 50000000',
  });
  assert.equal(creation.parseCreateStorePayload({
    name: 'Mi Tienda', slug: 'Mi Tienda', status: 'active', owner_phone: '',
  }), null);
  assert.equal(creation.parseCreateStorePayload({
    name: 'Mi Tienda', slug: 'mi-tienda', status: 'active', owner_phone: '', actor_id: MASTER_ID,
  }), null);
});

test('crea la tienda y las cinco monedas fijas con solo USD activa', () => {
  const current = fixture();
  try {
    const result = creation.createStoreWithSystemCurrencies(current.app, MASTER_ID, {
      name: 'Mi Tienda', slug: 'mi-tienda', status: 'active', ownerPhone: '+53 50000000',
    });
    assert.equal(current.saved.length, 6);
    assert.equal(result.store.name, 'Mi Tienda');
    assert.equal(result.store.plan, 'free');
    assert.equal(result.store.plan_updated_by, MASTER_ID);
    assert.deepEqual(result.currencies.map((currency) => currency.code), ['USD', 'CUP', 'EUR', 'CASHAPP', 'ZELLE']);
    result.currencies.forEach((currency) => {
      assert.equal(currency.store, result.store.id);
      assert.equal(currency.exchange_rate, 1);
      assert.equal(currency.is_system, true);
    });
    const usd = result.currencies[0];
    assert.equal(usd.active, true);
    assert.equal(usd.is_default, true);
    assert.equal(usd.is_base, true);
    result.currencies.slice(1).forEach((currency) => {
      assert.equal(currency.active, false);
      assert.equal(currency.is_default, false);
      assert.equal(currency.is_base, false);
    });
  } finally {
    current.restore();
  }
});

test('rechaza slug duplicado y propaga cualquier fallo de monedas para rollback', () => {
  const duplicate = fixture({ existingSlug: true });
  try {
    assert.throws(
      () => creation.createStoreWithSystemCurrencies(duplicate.app, MASTER_ID, {
        name: 'Duplicada', slug: 'duplicada', status: 'active', ownerPhone: '',
      }),
      /store_slug_exists/,
    );
    assert.equal(duplicate.saved.length, 0);
  } finally {
    duplicate.restore();
  }

  const failed = fixture({ failCurrency: true });
  try {
    assert.throws(
      () => creation.createStoreWithSystemCurrencies(failed.app, MASTER_ID, {
        name: 'Sin moneda', slug: 'sin-moneda', status: 'active', ownerPhone: '',
      }),
      /currency_failed/,
    );
    assert.equal(failed.saved.length, 1);
  } finally {
    failed.restore();
  }
});

test('la ruta exige autenticaciÃ³n y ejecuta la operaciÃ³n dentro de una transacciÃ³n', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_master_store_creation.pb.js'), 'utf8');
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_master_store_creation_lib.js'), 'utf8');
  assert.match(route, /\/api\/pz\/master\/stores\/create/);
  assert.match(route, /\$apis\.requireAuth\(\)/);
  assert.match(route, /onRecordUpdateRequest[\s\S]*enforceFixedCurrencyUpdate/);
  assert.match(route, /onRecordDeleteRequest[\s\S]*rejectFixedCurrencyDelete/);
  assert.match(source, /\$app\.runInTransaction/);
  assert.match(source, /createStoreWithSystemCurrencies\(txApp/);
});

test('las monedas fijas no pueden renombrarse, moverse de tienda ni eliminarse', () => {
  const original = mutableRecord('fixedcurrency01', {
    store: 'storecurrency01', code: 'CUP', is_system: true, is_base: false, active: false,
  });
  const current = mutableRecord(original.id, {
    store: original.store, code: original.code, is_system: false, is_base: true, active: false,
    original: () => original,
  });
  let continued = 0;
  creation.enforceFixedCurrencyUpdate({ record: current, next() { continued += 1; } });
  assert.equal(continued, 1);
  assert.equal(current.is_system, true);
  assert.equal(current.is_base, false);
  assert.throws(
    () => creation.enforceFixedCurrencyUpdate({
      record: mutableRecord(original.id, { ...original, code: 'OTRA', original: () => original }),
      next() {},
    }),
    /identidad de una moneda fija/,
  );
  assert.throws(
    () => creation.rejectFixedCurrencyDelete({ record: original, next() {} }),
    /eliminar una moneda fija/,
  );
  let customContinued = 0;
  creation.rejectFixedCurrencyDelete({
    record: mutableRecord('customcurrency1', { code: 'CAD' }),
    next() { customContinued += 1; },
  });
  assert.equal(customContinued, 1);
});

test('la migraciÃ³n repara las cinco monedas fijas sin borrar preferencias configuradas', () => {
  const migration = fs.readFileSync(path.resolve(__dirname, '../pb_migrations/1786486400_store_system_currencies_bootstrap.js'), 'utf8');
  assert.match(migration, /listRecords\(app, "stores", ""\)/);
  assert.match(migration, /\{ code: "USD"/);
  assert.match(migration, /\{ code: "CUP"/);
  assert.match(migration, /\{ code: "EUR"/);
  assert.match(migration, /\{ code: "CASHAPP"/);
  assert.match(migration, /\{ code: "ZELLE"/);
  assert.match(migration, /configuredDefault \|\| flaggedDefault/);
  assert.match(migration, /selectedDefault \|\| usd/);
  assert.match(migration, /currencies\.deleteRule = fixedCurrencyDeleteRule\(\)/);
  assert.doesNotMatch(migration, /app\.delete\(/);
});

test('el backfill crea las cinco fijas y conserva una moneda predeterminada elegida por el admin', () => {
  const migrationPath = path.resolve(__dirname, '../pb_migrations/1786486400_store_system_currencies_bootstrap.js');
  const previousMigrate = global.migrate;
  const previousRecord = global.Record;
  let up = null;
  let nextId = 0;
  global.migrate = (upHandler) => { up = upHandler; };
  global.Record = class FakeRecord {
    constructor(collection) {
      nextId += 1;
      return mutableRecord(`currency${String(nextId).padStart(7, '0')}`.slice(0, 15), {}, collection);
    }
  };

  const stores = [mutableRecord('storecurrency01'), mutableRecord('storecurrency02'), mutableRecord('storecurrency03')];
  const currencyCollection = { name: 'currencies' };
  const currencies = [
    mutableRecord('eurocurrency001', {
      store: stores[1].id, code: 'EUR', name: 'Euro', symbol: 'EUR', exchange_rate: 0.9,
      active: true, is_default: true, is_system: true, is_base: false,
    }, currencyCollection),
    mutableRecord('usdcurrency0001', {
      store: stores[2].id, code: 'USD', name: '', symbol: '', exchange_rate: 350,
      active: false, is_default: false, is_system: false, is_base: false,
    }, currencyCollection),
    mutableRecord('cupcurrency0001', {
      store: stores[2].id, code: 'CUP', name: 'Peso cubano', symbol: 'CUP', exchange_rate: 350,
      active: true, is_default: false, is_system: true, is_base: true,
    }, currencyCollection),
  ];
  const settings = [
    mutableRecord('settingscurr001', { store: stores[0].id, default_currency: '' }),
    mutableRecord('settingscurr002', { store: stores[1].id, default_currency: 'eurocurrency001' }),
  ];
  const app = {
    findCollectionByNameOrId(name) {
      if (name === 'currencies') return currencyCollection;
      if (name === 'stores') return { name: 'stores' };
      throw new Error('collection_not_found');
    },
    findRecordsByFilter(name, _filter, _sort, limit, offset, params) {
      const records = name === 'stores'
        ? stores
        : currencies.filter((record) => !params?.store || record.store === params.store);
      return records.slice(offset, offset + limit);
    },
    findFirstRecordByFilter(name, _filter, params) {
      if (name !== 'settings') throw new Error('not_found');
      const record = settings.find((item) => item.store === params.store);
      if (!record) throw new Error('not_found');
      return record;
    },
    save(record) {
      if (record._collection === currencyCollection && !currencies.includes(record)) currencies.push(record);
      return record;
    },
  };

  try {
    delete require.cache[require.resolve(migrationPath)];
    require(migrationPath);
    assert.equal(typeof up, 'function');
    up(app);

    const usdA = currencies.find((record) => record.store === stores[0].id && record.code === 'USD');
    const usdB = currencies.find((record) => record.store === stores[1].id && record.code === 'USD');
    const usdC = currencies.find((record) => record.store === stores[2].id && record.code === 'USD');
    const fixedCodes = ['USD', 'CUP', 'EUR', 'CASHAPP', 'ZELLE'];
    stores.forEach((store) => {
      assert.deepEqual(
        currencies.filter((record) => record.store === store.id && fixedCodes.includes(record.code)).map((record) => record.code).sort(),
        [...fixedCodes].sort(),
      );
      currencies.filter((record) => record.store === store.id && record.code !== 'USD').forEach((record) => {
        assert.equal(record.is_system, true);
        assert.equal(record.is_base, false);
      });
    });
    assert.ok(usdA);
    assert.equal(usdA.is_default, true);
    assert.equal(settings[0].default_currency, usdA.id);
    currencies.filter((record) => record.store === stores[0].id && record.code !== 'USD').forEach((record) => {
      assert.equal(record.active, false);
      assert.equal(record.is_default, false);
    });
    assert.ok(usdB);
    assert.equal(usdB.is_default, false);
    assert.equal(currencies[0].is_default, true);
    assert.equal(currencies[0].active, true);
    assert.equal(settings[1].default_currency, currencies[0].id);
    assert.equal(usdC.exchange_rate, 1);
    assert.equal(usdC.active, true);
    assert.equal(usdC.is_system, true);
    assert.equal(usdC.is_base, true);
    assert.equal(usdC.is_default, true);
    assert.equal(currencies[2].is_base, false);
    assert.match(app.findCollectionByNameOrId('currencies').deleteRule, /is_system != true/);
    assert.match(app.findCollectionByNameOrId('currencies').deleteRule, /code != "ZELLE"/);
  } finally {
    global.migrate = previousMigrate;
    global.Record = previousRecord;
    delete require.cache[require.resolve(migrationPath)];
  }
});
