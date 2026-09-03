const assert = require('node:assert/strict');
const test = require('node:test');

const BASE_URL = String(process.env.PZ_PRODUCT_QUOTA_RUNTIME_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = String(process.env.PZ_PRODUCT_QUOTA_SUPER_EMAIL || '');
const SUPER_PASSWORD = String(process.env.PZ_PRODUCT_QUOTA_SUPER_PASSWORD || '');
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(BASE_URL);
const SKIP_REASON = !BASE_URL || !SUPER_EMAIL || !SUPER_PASSWORD
  ? 'requiere PZ_PRODUCT_QUOTA_RUNTIME_URL, PZ_PRODUCT_QUOTA_SUPER_EMAIL y PZ_PRODUCT_QUOTA_SUPER_PASSWORD'
  : !IS_LOCAL
    ? 'PZ_PRODUCT_QUOTA_RUNTIME_URL debe apuntar a localhost, 127.0.0.1 o ::1'
    : false;

async function request(path, { token = '', body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...headers,
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
  return Object.values(result?.data?.data || {}).map((item) => item?.code).find(Boolean) || '';
}

function productInput(storeId, suffix, active = true) {
  return {
    store: storeId,
    name: `Producto cuota ${suffix}`,
    slug: `quota-${suffix}`,
    base_price_usd: 10,
    regular_price_usd: 10,
    stock: 1,
    active,
    delivery_mode: 'both',
    has_variations: false,
  };
}

test('Prompt 3 HTTP runtime: API, concurrencia, downgrade, variantes, borrado y Promo', { skip: SKIP_REASON, timeout: 120000 }, async () => {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const password = `Quota!${suffix}Aa1`;
  const resources = [];
  let superToken = '';

  try {
    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    assert.equal(superAuth.status, 200, JSON.stringify(superAuth.data));
    superToken = superAuth.data.token;

    async function create(collection, body) {
      const response = await request(`/api/collections/${collection}/records`, { token: superToken, body });
      assert.equal(response.status, 200, `${collection}: ${JSON.stringify(response.data)}`);
      resources.push({ collection, id: response.data.id });
      return response.data;
    }

  const store = await create('stores', {
    name: `Quota ${suffix}`,
    slug: `quota-${suffix}`,
    status: 'active',
  });
  const otherStore = await create('stores', {
    name: `Quota other ${suffix}`,
    slug: `quota-other-${suffix}`,
    status: 'active',
  });
  const master = await create('users', {
    email: `quota-master-${suffix}@example.test`,
    password,
    passwordConfirm: password,
    display_name: 'Master Quota',
    role: 'master_admin',
    status: 'active',
    emailVisibility: true,
  });
  const admin = await create('users', {
    email: `quota-admin-${suffix}@example.test`,
    password,
    passwordConfirm: password,
    display_name: 'Admin Quota',
    role: 'store_admin',
    status: 'active',
    store: store.id,
    emailVisibility: true,
  });
  const masterAuth = await request('/api/collections/users/auth-with-password', {
    body: { identity: master.email, password },
  });
  const deviceHeaders = { 'X-PZ-Admin-Device': 'Q'.repeat(43) };
  const adminAuth = await request('/api/collections/users/auth-with-password', {
    body: { identity: admin.email, password },
    headers: deviceHeaders,
  });
  assert.equal(masterAuth.status, 200, JSON.stringify(masterAuth.data));
  assert.equal(adminAuth.status, 200, JSON.stringify(adminAuth.data));
  const masterToken = masterAuth.data.token;
  const adminToken = adminAuth.data.token;

  const products = [];
  for (let index = 0; index < 99; index += 1) {
    const created = await create('products', productInput(store.id, `${suffix}-${index}`, index % 2 === 0));
    products.push(created);
  }

  const concurrent = await Promise.all([
    request('/api/collections/products/records', {
      token: superToken,
      body: productInput(store.id, `${suffix}-concurrent-a`, false),
    }),
    request('/api/collections/products/records', {
      token: superToken,
      body: productInput(store.id, `${suffix}-concurrent-b`, true),
    }),
  ]);
  assert.deepEqual(concurrent.map((entry) => entry.status).sort((a, b) => a - b), [200, 409], JSON.stringify(concurrent));
  const concurrentCreated = concurrent.find((entry) => entry.status === 200)?.data;
  products.push(concurrentCreated);
  resources.push({ collection: 'products', id: concurrentCreated.id });
  assert.equal(errorCode(concurrent.find((entry) => entry.status === 409)), 'product_limit_reached');

  const directBypass = await request('/api/collections/products/records', {
    token: adminToken,
    headers: deviceHeaders,
    body: productInput(store.id, `${suffix}-direct-bypass`),
  });
  assert.equal(directBypass.status, 409, JSON.stringify(directBypass.data));
  assert.equal(errorCode(directBypass), 'product_limit_reached');

  const ownerBootstrap = await request('/api/pz/admin/read/products-bootstrap', {
    token: adminToken,
    headers: deviceHeaders,
    body: { store_id: store.id },
  });
  assert.equal(ownerBootstrap.status, 200, JSON.stringify(ownerBootstrap.data));
  assert.deepEqual(ownerBootstrap.data.data.product_quota, {
    catalog_contract: 'tusenda84.commercial-plan-catalog.v1',
    store_type: 'ecommerce',
    plan: 'free',
    used: 100,
    limit: 100,
    remaining: 0,
    over_by: 0,
    percentage: 100,
    state: 'limit_reached',
    can_create: false,
  });

  const variation = await create('product_variations', {
    product: products[0].id,
    variation_type: 'Tamaño',
    value: 'Grande',
    price_usd: 12,
    stock: 2,
    active: true,
    sort_order: 1,
  });
  assert.ok(variation.id);

  const editAtLimit = await request(`/api/collections/products/records/${products[0].id}`, {
    token: superToken,
    method: 'PATCH',
    body: { name: `Producto editado ${suffix}` },
  });
  assert.equal(editAtLimit.status, 200, JSON.stringify(editAtLimit.data));
  const reparent = await request(`/api/collections/products/records/${products[0].id}`, {
    token: superToken,
    method: 'PATCH',
    body: { store: otherStore.id },
  });
  assert.equal(reparent.status, 409, JSON.stringify(reparent.data));
  assert.equal(errorCode(reparent), 'product_store_immutable');

  assert.equal((await request(`/api/collections/products/records/${products[1].id}`, { token: superToken, method: 'DELETE' })).status, 204);
  const replacement = await create('products', productInput(store.id, `${suffix}-replacement`, false));
  products.push(replacement);

  const premium = await request('/api/pz/master/store-plan/change', {
    token: masterToken,
    body: {
      store_id: store.id,
      plan: 'premium',
      is_permanent: true,
      duration_months: 0,
      reason: 'Prueba de cuota Premium',
      confirm_expiration_cleanup: false,
    },
  });
  assert.equal(premium.status, 200, JSON.stringify(premium.data));
  assert.equal(premium.data.product_quota.limit, 1600);
  const aboveFree = await create('products', productInput(store.id, `${suffix}-above-free`, true));
  products.push(aboveFree);

  const downgrade = await request('/api/pz/master/store-plan/change', {
    token: masterToken,
    body: {
      store_id: store.id,
      plan: 'free',
      is_permanent: false,
      duration_months: 0,
      reason: 'Prueba de reducción con catálogo conservado',
      confirm_expiration_cleanup: true,
    },
  });
  assert.equal(downgrade.status, 200, JSON.stringify(downgrade.data));
  assert.equal(downgrade.data.product_quota.state, 'over_limit');
  assert.equal(downgrade.data.product_quota.used, 101);
  assert.equal(downgrade.data.product_quota.limit, 100);

  const editAfterDowngrade = await request(`/api/collections/products/records/${products[2].id}`, {
    token: superToken,
    method: 'PATCH',
    body: { stock: 7 },
  });
  assert.equal(editAfterDowngrade.status, 200, JSON.stringify(editAfterDowngrade.data));
  const createAfterDowngrade = await request('/api/collections/products/records', {
    token: superToken,
    body: productInput(store.id, `${suffix}-blocked-after-downgrade`),
  });
  assert.equal(createAfterDowngrade.status, 409, JSON.stringify(createAfterDowngrade.data));

  assert.equal((await request(`/api/collections/products/records/${products[3].id}`, { token: superToken, method: 'DELETE' })).status, 204);
  assert.equal((await request(`/api/collections/products/records/${products[4].id}`, { token: superToken, method: 'DELETE' })).status, 204);
  const afterDeletes = await create('products', productInput(store.id, `${suffix}-after-deletes`, true));
  assert.ok(afterDeletes.id);

  await create('promo_sites', {
    store: store.id,
    public_slug: `quota-promo-${suffix}`,
    status: 'draft',
    contract_version: 1,
    created_by: master.id,
    updated_by: master.id,
  });
  const promoUnaffected = await create('products', productInput(store.id, `${suffix}-promo-unaffected`, true));
  assert.ok(promoUnaffected.id);
  } finally {
    if (superToken) {
      for (const resource of resources.reverse()) {
        await request(`/api/collections/${resource.collection}/records/${resource.id}`, {
          token: superToken,
          method: 'DELETE',
        }).catch(() => null);
      }
    }
  }
});
