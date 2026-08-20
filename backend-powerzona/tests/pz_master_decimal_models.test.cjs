const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const hooksDir = path.resolve(__dirname, '..', 'pb_hooks');

function source(name) {
  return fs.readFileSync(path.join(hooksDir, name), 'utf8');
}

test('los modelos SQL Master declaran importes monetarios como float64', () => {
  const overview = source('pz_master_overview_lib.js');
  const products = source('pz_master_products_lib.js');
  const analytics = source('pz_master_dashboard_lib.js');

  assert.match(overview, /usdTotal:\s*-0/);
  assert.match(products, /basePriceUsd:\s*-0/);
  assert.match(products, /regularPriceUsd:\s*-0/);
  assert.match(products, /offerPriceUsd:\s*-0/);
  assert.match(products, /currentPriceUsd:\s*-0/);
  assert.match(analytics, /revenueUsd:\s*-0/);
  assert.match(analytics, /usdTotal:\s*-0/);
  assert.match(analytics, /unitPriceUsd:\s*-0/);
  assert.match(analytics, /lineTotalUsd:\s*-0/);
});
