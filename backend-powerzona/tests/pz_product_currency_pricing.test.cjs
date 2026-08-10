const assert = require('node:assert/strict');
const test = require('node:test');

const pricing = require('../pb_hooks/pz_product_currency_pricing_lib.js');

class MutableRecord {
  constructor(id, data, original = null) {
    this.id = id;
    this.data = { ...data };
    this._original = original;
  }
  get(key) { return this.data[key]; }
  set(key, value) { this.data[key] = value; }
  original() { return this._original; }
}

function appFixture() {
  const usd = new MutableRecord('usd000000000001', {
    store: 'store0000000001', code: 'USD', exchange_rate: 1, active: true,
  });
  const cup = new MutableRecord('cup000000000001', {
    store: 'store0000000001', code: 'CUP', exchange_rate: 350, active: true,
  });
  const products = [];
  const variations = [];
  const currencies = [usd, cup];
  const tables = { products, product_variations: variations, currencies };
  return {
    usd, cup, products, variations,
    findRecordById(collection, id) {
      const record = (tables[collection] || []).find((item) => item.id === id);
      if (!record) throw new Error('not_found');
      return record;
    },
    findFirstRecordByFilter(collection, _filter, params) {
      const record = (tables[collection] || []).find((item) => item.get('store') === params.store && item.get('code') === 'USD');
      if (!record) throw new Error('not_found');
      return record;
    },
    findRecordsByFilter(collection, filter, _sort, limit, offset, params) {
      let records = (tables[collection] || []).slice();
      if (filter.includes('price_currency')) records = records.filter((item) => item.get('price_currency') === params.currency);
      if (filter.includes('product =')) records = records.filter((item) => item.get('product') === params.product);
      return records.slice(offset, offset + limit);
    },
    save(record) { return record; },
  };
}

function requestEvent(app, record, body) {
  return { app, record, requestInfo: () => ({ body }) };
}

test('producto conserva su importe CUP y deriva el equivalente canonico USD', () => {
  const app = appFixture();
  const product = new MutableRecord('product00000001', {
    store: 'store0000000001',
    price_currency: app.cup.id,
    regular_price_amount: 7000,
    offer_price_amount: 6300,
    cost_amount: 3500,
    is_offer: true,
  });
  app.products.push(product);

  const error = pricing.normalizeProductPricingRequest(requestEvent(app, product, {
    price_currency: app.cup.id,
    regular_price_amount: 7000,
    offer_price_amount: 6300,
    cost_amount: 3500,
    is_offer: true,
  }));

  assert.equal(error, null);
  assert.equal(product.get('regular_price_amount'), 7000);
  assert.equal(product.get('base_price_usd'), 18);
  assert.equal(product.get('regular_price_usd'), 20);
  assert.equal(product.get('offer_price_usd'), 18);
  assert.equal(product.get('cost_usd'), 10);
});

test('variacion hereda obligatoriamente la moneda del producto', () => {
  const app = appFixture();
  const product = new MutableRecord('product00000001', {
    store: 'store0000000001', price_currency: app.cup.id,
  });
  const variation = new MutableRecord('variation000001', {
    product: product.id,
    price_currency: app.usd.id,
    price_amount: 1750,
    offer_price_amount: 0,
    cost_amount: 700,
    is_offer: false,
  });
  app.products.push(product);
  app.variations.push(variation);

  const error = pricing.normalizeVariationPricingRequest(requestEvent(app, variation, {
    product: product.id,
    price_currency: app.usd.id,
    price_amount: 1750,
    cost_amount: 700,
  }));

  assert.equal(error, null);
  assert.equal(variation.get('price_currency'), app.cup.id);
  assert.equal(variation.get('price_amount'), 1750);
  assert.equal(variation.get('price_usd'), 5);
  assert.equal(variation.get('cost_usd'), 2);
});

test('cambiar la tasa no altera el importe original y recalcula USD', () => {
  const app = appFixture();
  const previousCup = new MutableRecord(app.cup.id, {
    store: 'store0000000001', code: 'CUP', exchange_rate: 350,
  });
  app.cup._original = previousCup;
  app.cup.set('exchange_rate', 700);
  const product = new MutableRecord('product00000001', {
    store: 'store0000000001', price_currency: app.cup.id,
    regular_price_amount: 7000, offer_price_amount: 0, cost_amount: 1400, is_offer: false,
  });
  const variation = new MutableRecord('variation000001', {
    product: product.id, price_currency: app.cup.id,
    price_amount: 3500, offer_price_amount: 0, cost_amount: 700, is_offer: false,
  });
  app.products.push(product);
  app.variations.push(variation);

  pricing.repriceRecordsAfterCurrencyRateChange({ app, record: app.cup });

  assert.equal(product.get('regular_price_amount'), 7000);
  assert.equal(product.get('base_price_usd'), 10);
  assert.equal(product.get('cost_usd'), 2);
  assert.equal(variation.get('price_amount'), 3500);
  assert.equal(variation.get('price_usd'), 5);
});

test('cambiar la moneda del padre convierte los importes heredados de variaciones', () => {
  const app = appFixture();
  const previous = new MutableRecord('product00000001', {
    store: 'store0000000001', price_currency: app.cup.id,
  });
  const product = new MutableRecord('product00000001', {
    store: 'store0000000001', price_currency: app.usd.id,
  }, previous);
  const variation = new MutableRecord('variation000001', {
    product: product.id, price_currency: app.cup.id,
    price_amount: 3500, price_usd: 10,
    offer_price_amount: 2800, offer_price_usd: 8,
    cost_amount: 1750, cost_usd: 5,
  });
  app.products.push(product);
  app.variations.push(variation);

  pricing.syncVariationsAfterProductCurrencyChange({ app, record: product });

  assert.equal(variation.get('price_currency'), app.usd.id);
  assert.equal(variation.get('price_amount'), 10);
  assert.equal(variation.get('offer_price_amount'), 8);
  assert.equal(variation.get('cost_amount'), 5);
  assert.equal(variation.get('price_usd'), 10);
});
