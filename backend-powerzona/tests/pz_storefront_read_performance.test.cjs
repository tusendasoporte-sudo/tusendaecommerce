'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const migration = readFileSync(
  require.resolve('../pb_migrations/1786580000_storefront_read_performance.js'),
  'utf8',
);

test('migracion agrega indices para las lecturas publicas frecuentes', () => {
  for (const indexName of [
    'idx_settings_store_active_updated',
    'idx_categories_store_active_order_name',
    'idx_subcategories_store_active_order_name',
    'idx_products_store_active_created',
    'idx_products_store_active_featured_order',
    'idx_products_store_active_category_created',
    'idx_products_store_active_subcategory_created',
    'idx_product_variations_product_active_sort',
    'idx_reviews_store_status_type_featured_created',
  ]) {
    assert.match(migration, new RegExp(indexName));
  }
  assert.match(migration, /collection\.addIndex\(indexName, false, columns/);
  assert.match(migration, /collection\.removeIndex\(indexName\)/);
});

test('migracion habilita miniaturas para taxonomia y variaciones', () => {
  assert.match(migration, /\["categories", "image", \["300x200", "700x420"\]\]/);
  assert.match(migration, /\["subcategories", "image", \["300x200", "700x420"\]\]/);
  assert.match(migration, /\["product_variations", "image", \["300x300", "900x900"\]\]/);
  assert.match(migration, /\.thumbs = thumbs/);
});
