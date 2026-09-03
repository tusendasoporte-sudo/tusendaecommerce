const assert = require('node:assert/strict');
const test = require('node:test');

const BASE_URL = String(process.env.PZ_TAXONOMY_RUNTIME_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = String(process.env.PZ_TAXONOMY_SUPER_EMAIL || '');
const SUPER_PASSWORD = String(process.env.PZ_TAXONOMY_SUPER_PASSWORD || '');
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(BASE_URL);
const SKIP_REASON = !BASE_URL || !SUPER_EMAIL || !SUPER_PASSWORD
  ? 'requiere PZ_TAXONOMY_RUNTIME_URL, PZ_TAXONOMY_SUPER_EMAIL y PZ_TAXONOMY_SUPER_PASSWORD'
  : !IS_LOCAL
    ? 'PZ_TAXONOMY_RUNTIME_URL debe apuntar a localhost, 127.0.0.1 o ::1'
    : false;

async function request(path, { token = '', body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw };
}

function errorCode(result) {
  const values = result?.data?.data && typeof result.data.data === 'object'
    ? Object.values(result.data.data).flatMap((entry) => Array.isArray(entry) ? entry : [entry])
    : [];
  return values.map((entry) => entry?.code).find(Boolean) || '';
}

function unique() {
  return `p4-tax-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

test('Prompt 4 HTTP runtime protege taxonomía en los tres planes', { skip: SKIP_REASON }, async () => {
  const prefix = unique();
  const ids = { products: [], subcategories: [], categories: [], stores: [] };
  let token = '';

  async function remove(collection, id) {
    if (!id || !token) return;
    await request(`/api/collections/${collection}/records/${id}`, { token, method: 'DELETE' });
  }

  async function createStore(plan) {
    const created = await request('/api/collections/stores/records', {
      token,
      body: { name: `${prefix}-${plan}`, slug: `${prefix}-${plan}`, status: 'active' },
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    ids.stores.push(created.data.id);
    if (plan === 'free') return created.data;
    const updated = await request(`/api/collections/stores/records/${created.data.id}`, {
      token,
      method: 'PATCH',
      body: {
        plan,
        plan_started_at: new Date().toISOString(),
        plan_expires_at: '',
        plan_duration_months: 0,
        plan_is_permanent: true,
      },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    return updated.data;
  }

  async function createCategory(storeId, suffix, extra = {}) {
    const created = await request('/api/collections/categories/records', {
      token,
      body: {
        store: storeId,
        name: `Categoría ${suffix}`,
        slug: `${prefix}-${suffix}`,
        active: true,
        order: 10,
        ...extra,
      },
    });
    if (created.status === 200) ids.categories.push(created.data.id);
    return created;
  }

  async function createSubcategory(storeId, categoryId, suffix, extra = {}) {
    const created = await request('/api/collections/subcategories/records', {
      token,
      body: {
        store: storeId,
        category: categoryId,
        name: `Subcategoría ${suffix}`,
        slug: `${prefix}-${suffix}`,
        active: true,
        order: 10,
        ...extra,
      },
    });
    if (created.status === 200) ids.subcategories.push(created.data.id);
    return created;
  }

  async function createProduct(storeId, categoryId, subcategoryId, suffix) {
    const created = await request('/api/collections/products/records', {
      token,
      body: {
        store: storeId,
        category: categoryId,
        subcategory: subcategoryId,
        name: `Producto ${suffix}`,
        slug: `${prefix}-${suffix}`,
        active: true,
        track_stock: false,
        stock: 0,
        base_price_usd: 1,
        regular_price_usd: 1,
        delivery_mode: 'both',
      },
    });
    if (created.status === 200) ids.products.push(created.data.id);
    return created;
  }

  try {
    const auth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    assert.equal(auth.status, 200, JSON.stringify(auth.data));
    token = auth.data.token;

    const stores = {};
    const categories = {};
    const subcategories = {};
    for (const plan of ['free', 'basic', 'premium']) {
      stores[plan] = await createStore(plan);
      const category = await createCategory(stores[plan].id, `${plan}-cat`);
      assert.equal(category.status, 200, `${plan}: ${JSON.stringify(category.data)}`);
      categories[plan] = category.data;
      const subcategory = await createSubcategory(stores[plan].id, category.data.id, `${plan}-sub`);
      assert.equal(subcategory.status, 200, `${plan}: ${JSON.stringify(subcategory.data)}`);
      subcategories[plan] = subcategory.data;
    }

    const duplicateName = await createCategory(stores.free.id, 'free-duplicate-name', {
      name: '  CATEGORÍA FREE-CAT  ',
    });
    assert.equal(duplicateName.status, 409, JSON.stringify(duplicateName.data));
    assert.equal(errorCode(duplicateName), 'taxonomy_duplicate_name');

    const duplicateSlug = await createCategory(stores.free.id, 'free-duplicate-slug', {
      slug: categories.free.slug,
    });
    assert.equal(duplicateSlug.status, 409, JSON.stringify(duplicateSlug.data));
    assert.equal(errorCode(duplicateSlug), 'taxonomy_duplicate_slug');

    const crossStoreParent = await createSubcategory(
      stores.free.id,
      categories.premium.id,
      'cross-store-parent',
    );
    assert.equal(crossStoreParent.status, 400, JSON.stringify(crossStoreParent.data));
    assert.equal(errorCode(crossStoreParent), 'invalid_subcategory_parent');

    const mismatchedProduct = await createProduct(
      stores.free.id,
      categories.free.id,
      subcategories.premium.id,
      'mismatched-taxonomy',
    );
    assert.equal(mismatchedProduct.status, 400, JSON.stringify(mismatchedProduct.data));
    assert.equal(errorCode(mismatchedProduct), 'invalid_product_subcategory');

    const product = await createProduct(
      stores.free.id,
      categories.free.id,
      subcategories.free.id,
      'valid-taxonomy',
    );
    assert.equal(product.status, 200, JSON.stringify(product.data));

    const blockedSubcategoryDelete = await request(
      `/api/collections/subcategories/records/${subcategories.free.id}`,
      { token, method: 'DELETE' },
    );
    assert.equal(blockedSubcategoryDelete.status, 409, JSON.stringify(blockedSubcategoryDelete.data));
    assert.equal(errorCode(blockedSubcategoryDelete), 'subcategory_not_empty');

    const movedToCategory = await request(`/api/collections/products/records/${product.data.id}`, {
      token,
      method: 'PATCH',
      body: { category: categories.free.id, subcategory: '' },
    });
    assert.equal(movedToCategory.status, 200, JSON.stringify(movedToCategory.data));

    const deletedSubcategory = await request(
      `/api/collections/subcategories/records/${subcategories.free.id}`,
      { token, method: 'DELETE' },
    );
    assert.equal(deletedSubcategory.status, 204, JSON.stringify(deletedSubcategory.data));
    ids.subcategories = ids.subcategories.filter((id) => id !== subcategories.free.id);

    const blockedCategoryDelete = await request(
      `/api/collections/categories/records/${categories.free.id}`,
      { token, method: 'DELETE' },
    );
    assert.equal(blockedCategoryDelete.status, 409, JSON.stringify(blockedCategoryDelete.data));
    assert.equal(errorCode(blockedCategoryDelete), 'category_not_empty');
  } finally {
    for (const id of ids.products.reverse()) await remove('products', id);
    for (const id of ids.subcategories.reverse()) await remove('subcategories', id);
    for (const id of ids.categories.reverse()) await remove('categories', id);
    for (const id of ids.stores.reverse()) await remove('stores', id);
  }
});
