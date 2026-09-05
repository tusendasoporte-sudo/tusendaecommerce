import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildPublicCategoryCounts } from '../src/lib/publicCategoryCounts.ts';

function oldCount(products, subcategories, categoryId) {
  const children = new Set(subcategories.filter(s => s.category === categoryId).map(s => s.id));
  return new Map(products.filter(p => p.subcategory ? children.has(p.subcategory) : p.category === categoryId)
    .map(p => [p.id, p])).size;
}

test('conserva exactamente el conteo anterior, precedencia y deduplicación', () => {
  const subs = [{ id: 's1', category: 'a' }, { id: 's2', category: 'b' }];
  const products = [
    { id: 'p1', category: 'a', subcategory: '' },
    { id: 'p1', category: 'a', subcategory: '' },
    { id: 'p2', category: 'b', subcategory: 's1' },
    { id: 'p3', category: 'a', subcategory: 'hidden' },
    { id: 'p4', category: '', subcategory: '' },
    { id: 'p5', category: '', subcategory: 's2' },
  ];
  const counts = buildPublicCategoryCounts(products, subs);
  for (const id of ['a', 'b', 'empty', '']) assert.equal(counts.get(id) || 0, oldCount(products, subs, id));
  assert.equal(counts.get('a'), 2);
  assert.equal(counts.get('b'), 1);
  assert.equal(buildPublicCategoryCounts([], []).size, 0);
});

test('paridad determinista en catálogos grandes y relaciones repetidas', () => {
  const categories = Array.from({ length: 80 }, (_, i) => `c${i}`);
  const subs = Array.from({ length: 250 }, (_, i) => ({ id: `s${i % 230}`, category: categories[i % 80] }));
  const products = Array.from({ length: 10000 }, (_, i) => ({
    id: `p${i % 8900}`, category: categories[i % 80], subcategory: i % 3 ? `s${i % 300}` : '',
  }));
  const counts = buildPublicCategoryCounts(products, subs);
  for (const id of [...categories, 'missing']) assert.equal(counts.get(id) || 0, oldCount(products, subs, id));
});

test('portada reutiliza conteos sin cambiar la consulta, imágenes o TTL', () => {
  const home = readFileSync(new URL('../src/components/public-store/PublicStoreHome.astro', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
  assert.match(home, /buildPublicCategoryCounts\(productTaxonomyIndex, subcategories\)/);
  assert.equal((home.match(/productCountsByCategory\.get\(category\.id\)/g) || []).length, 3);
  assert.doesNotMatch(home, /productsByCategoryTotal/);
  assert.match(api, /getCachedPublicData\(`product-taxonomy:\$\{storeId\}`/);
  assert.match(api, /fields: 'id,category,subcategory,active'/);
});
