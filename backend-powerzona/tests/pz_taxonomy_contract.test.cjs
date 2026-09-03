const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const taxonomy = require('../pb_hooks/pz_taxonomy_contract_lib.js');

const ACTIVE_FROM = '2026-09-01T12:00:00.000Z';
const ACTIVE_UNTIL = '2099-10-01T12:00:00.000Z';

function record(id, values = {}, originalValues = null) {
  const data = { id, ...values };
  const original = originalValues ? record(id, originalValues) : null;
  return {
    id,
    ...data,
    get(key) { return data[key]; },
    getString(key) { return String(data[key] ?? ''); },
    original() { return original; },
    set(key, value) { data[key] = value; this[key] = value; },
  };
}

function store(id, plan = 'free') {
  return record(id, {
    plan,
    plan_started_at: ACTIVE_FROM,
    plan_expires_at: plan === 'free' ? ACTIVE_UNTIL : '',
    plan_duration_months: plan === 'free' ? 0 : 12,
    plan_is_permanent: plan !== 'free',
    status: 'active',
  });
}

function fakeApp(fixtures = {}) {
  const collections = Object.fromEntries(
    Object.entries(fixtures).map(([name, rows]) => [name, Array.from(rows || [])]),
  );
  return {
    findRecordById(collection, id) {
      const found = (collections[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, _filter, _sort, limit, offset, params = {}) {
      let rows = Array.from(collections[collection] || []);
      for (const [key, value] of Object.entries(params)) {
        rows = rows.filter((item) => {
          const stored = typeof item.get === 'function' ? item.get(key) : item[key];
          return String(Array.isArray(stored) ? stored[0] || '' : stored || '') === String(value);
        });
      }
      return rows.slice(offset || 0, (offset || 0) + Math.max(0, Number(limit || rows.length)));
    },
  };
}

function throwsCode(action, code) {
  assert.throws(action, (error) => error instanceof taxonomy.TaxonomyContractError && error.code === code);
}

test('Prompt 4: Gratis, Básico y Premium permiten categorías y subcategorías', () => {
  for (const [index, plan] of ['free', 'basic', 'premium'].entries()) {
    const storeId = `storetaxplan${index}`;
    const categoryId = `categoryplan${index}`;
    const planStore = store(storeId, plan);
    const category = record(categoryId, {
      store: storeId, name: `Categoría ${plan}`, slug: `categoria-${plan}`, order: 10,
    });
    const app = fakeApp({ stores: [planStore], categories: [category], subcategories: [], promo_sites: [] });
    assert.equal(taxonomy.validateCategoryMutation(app, category, 'create'), true);
    assert.equal(taxonomy.validateSubcategoryMutation(app, record(`subcatplan00${index}`, {
      store: storeId,
      category: categoryId,
      name: `Subcategoría ${plan}`,
      slug: `subcategoria-${plan}`,
      order: 10,
    }), 'create'), true);
  }
});

test('Prompt 4: nombres, rutas y orden inválidos fallan cerrados', () => {
  for (const invalid of ['', ' '.repeat(4), `A${'x'.repeat(120)}`, 'Nombre\ninyectado']) {
    throwsCode(() => taxonomy.validateTaxonomyName(invalid), 'invalid_taxonomy_name');
  }
  for (const invalid of ['', 'Mayusculas', 'dos espacios', '../escape', 'con_underscore']) {
    throwsCode(() => taxonomy.validateTaxonomySlug(invalid), 'invalid_taxonomy_slug');
  }
  for (const invalid of [-1, 1.2, '3.5', Number.MAX_SAFE_INTEGER]) {
    throwsCode(() => taxonomy.validateTaxonomyOrder(invalid), 'invalid_taxonomy_order');
  }
});

test('Prompt 4: la API lógica rechaza duplicados normalizados de categoría', () => {
  const targetStore = store('storetaxonomy01');
  const existing = record('categoryexist01', {
    store: targetStore.id, name: 'Proteínas', slug: 'proteinas', order: 10,
  });
  const app = fakeApp({ stores: [targetStore], categories: [existing], promo_sites: [] });
  throwsCode(() => taxonomy.validateCategoryMutation(app, record('categorynew000', {
    store: targetStore.id, name: '  PROTEINAS ', slug: 'otra-ruta', order: 20,
  }), 'create'), 'taxonomy_duplicate_name');
  throwsCode(() => taxonomy.validateCategoryMutation(app, record('categorynew001', {
    store: targetStore.id, name: 'Suplementos', slug: 'proteinas', order: 20,
  }), 'create'), 'taxonomy_duplicate_slug');
});

test('Prompt 4: la subcategoría exige padre de la misma tienda y rutas únicas por tienda', () => {
  const firstStore = store('storetaxonomy01');
  const secondStore = store('storetaxonomy02', 'premium');
  const firstCategory = record('categoryfirst01', {
    store: firstStore.id, name: 'Proteínas', slug: 'proteinas', order: 10,
  });
  const secondCategory = record('categorysecond1', {
    store: secondStore.id, name: 'Ropa', slug: 'ropa', order: 10,
  });
  const existing = record('subcategory001', {
    store: firstStore.id, category: firstCategory.id, name: 'Whey', slug: 'whey', order: 10,
  });
  const app = fakeApp({
    stores: [firstStore, secondStore],
    categories: [firstCategory, secondCategory],
    subcategories: [existing],
    promo_sites: [],
  });

  throwsCode(() => taxonomy.validateSubcategoryMutation(app, record('subcategory002', {
    store: firstStore.id, category: secondCategory.id, name: 'Cruce', slug: 'cruce', order: 20,
  }), 'create'), 'invalid_subcategory_parent');
  throwsCode(() => taxonomy.validateSubcategoryMutation(app, record('subcategory003', {
    store: firstStore.id, category: firstCategory.id, name: 'whéy', slug: 'whey-dos', order: 20,
  }), 'create'), 'taxonomy_duplicate_name');
  throwsCode(() => taxonomy.validateSubcategoryMutation(app, record('subcategory004', {
    store: firstStore.id, category: firstCategory.id, name: 'Aislado', slug: 'whey', order: 20,
  }), 'create'), 'taxonomy_duplicate_slug');
});

test('Prompt 4: no permite mover taxonomía entre tiendas ni reubicar subcategorías con productos', () => {
  const firstStore = store('storetaxonomy01');
  const secondStore = store('storetaxonomy02');
  const category = record('categoryfirst01', {
    store: secondStore.id, name: 'Nombre', slug: 'nombre', order: 10,
  }, {
    store: firstStore.id, name: 'Nombre', slug: 'nombre', order: 10,
  });
  const app = fakeApp({ stores: [firstStore, secondStore], categories: [], promo_sites: [] });
  throwsCode(() => taxonomy.validateCategoryMutation(app, category, 'update'), 'taxonomy_store_immutable');

  const subcategory = record('subcategory001', {
    store: firstStore.id, category: 'categorysecond1', name: 'Whey', slug: 'whey', order: 10,
  }, {
    store: firstStore.id, category: 'categoryfirst01', name: 'Whey', slug: 'whey', order: 10,
  });
  const firstCategory = record('categoryfirst01', { store: firstStore.id });
  const secondCategory = record('categorysecond1', { store: firstStore.id });
  const assigned = record('producttaxonomy1', { store: firstStore.id, subcategory: subcategory.id });
  const appWithParents = fakeApp({
    stores: [firstStore],
    categories: [firstCategory, secondCategory],
    subcategories: [],
    products: [assigned],
    promo_sites: [],
  });
  throwsCode(
    () => taxonomy.validateSubcategoryMutation(appWithParents, subcategory, 'update'),
    'subcategory_parent_has_products',
  );
  const emptyApp = fakeApp({
    stores: [firstStore], categories: [firstCategory, secondCategory], subcategories: [], products: [], promo_sites: [],
  });
  assert.equal(taxonomy.validateSubcategoryMutation(emptyApp, subcategory, 'update'), true);
});

test('Prompt 4: producto solo acepta relaciones coherentes de la misma tienda', () => {
  const firstStore = store('storetaxonomy01');
  const secondStore = store('storetaxonomy02', 'basic');
  const firstCategory = record('categoryfirst01', { store: firstStore.id });
  const secondCategory = record('categorysecond1', { store: secondStore.id });
  const firstSubcategory = record('subcategory001', { store: firstStore.id, category: firstCategory.id });
  const secondSubcategory = record('subcategory002', { store: firstStore.id, category: 'categoryother01' });
  const app = fakeApp({
    stores: [firstStore, secondStore],
    categories: [firstCategory, secondCategory],
    subcategories: [firstSubcategory, secondSubcategory],
    promo_sites: [],
  });

  assert.equal(taxonomy.validateProductTaxonomyMutation(app, record('productdirect001', {
    store: firstStore.id, category: '', subcategory: '',
  }), 'create'), true);
  assert.equal(taxonomy.validateProductTaxonomyMutation(app, record('productvalid0001', {
    store: firstStore.id, category: firstCategory.id, subcategory: firstSubcategory.id,
  }), 'create'), true);
  throwsCode(() => taxonomy.validateProductTaxonomyMutation(app, record('productbad00001', {
    store: firstStore.id, category: secondCategory.id, subcategory: '',
  }), 'create'), 'invalid_product_category');
  throwsCode(() => taxonomy.validateProductTaxonomyMutation(app, record('productbad00002', {
    store: firstStore.id, category: firstCategory.id, subcategory: secondSubcategory.id,
  }), 'create'), 'invalid_product_subcategory');
  throwsCode(() => taxonomy.validateProductTaxonomyMutation(app, record('productbad00003', {
    store: firstStore.id, category: '', subcategory: firstSubcategory.id,
  }), 'create'), 'invalid_product_subcategory');
});

test('Prompt 4: eliminación protegida evita categorías y subcategorías huérfanas', () => {
  const targetStore = store('storetaxonomy01');
  const category = record('categoryfirst01', { store: targetStore.id });
  const subcategory = record('subcategory001', { store: targetStore.id, category: category.id });
  const product = record('producttaxonomy1', {
    store: targetStore.id, category: category.id, subcategory: subcategory.id,
  });
  const app = fakeApp({
    stores: [targetStore], categories: [category], subcategories: [subcategory], products: [product], promo_sites: [],
  });
  throwsCode(() => taxonomy.assertCategoryDeleteAllowed(app, category), 'category_not_empty');
  throwsCode(() => taxonomy.assertSubcategoryDeleteAllowed(app, subcategory), 'subcategory_not_empty');

  const emptyApp = fakeApp({ stores: [targetStore], categories: [category], subcategories: [], products: [], promo_sites: [] });
  assert.equal(taxonomy.assertCategoryDeleteAllowed(emptyApp, category), true);
  assert.equal(taxonomy.assertSubcategoryDeleteAllowed(emptyApp, subcategory), true);
});

test('Prompt 4: errores públicos omiten detalles internos', () => {
  assert.deepEqual(taxonomy.safeTaxonomyError({
    code: 'invalid_product_subcategory', stack: 'C:\\private\\hook.js', secret: 'token',
  }), {
    code: 'invalid_product_subcategory',
    status: 400,
    field: 'subcategory',
    message: 'La subcategoría seleccionada no pertenece a la categoría y tienda indicadas.',
  });
});

test('Prompt 4: hooks de modelo e índices cubren API e integridad interna', () => {
  const hooks = readFileSync(join(__dirname, '..', 'pb_hooks', 'pz_taxonomy_contract.pb.js'), 'utf8');
  const migration = readFileSync(join(__dirname, '..', 'pb_migrations', '1788447600_taxonomy_contract_indexes.js'), 'utf8');
  for (const collection of ['categories', 'subcategories', 'products']) {
    assert.match(hooks, new RegExp(`onRecordCreate\\([\\s\\S]*?"${collection}"`));
    assert.match(hooks, new RegExp(`onRecordUpdate\\([\\s\\S]*?"${collection}"`));
  }
  assert.match(hooks, /onRecordDelete\([\s\S]*?"categories"/);
  assert.match(hooks, /onRecordDelete\([\s\S]*?"subcategories"/);
  assert.match(migration, /idx_categories_store_slug/);
  assert.match(migration, /idx_subcategories_store_slug/);
  assert.match(migration, /idx_subcategories_store_category_name/);
});
