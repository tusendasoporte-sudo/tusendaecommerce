const assert = require('node:assert/strict');
const test = require('node:test');

const BASE_URL = String(process.env.PZ_PZPW01_BASE_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = process.env.PZ_PZPW01_SUPER_EMAIL || '';
const SUPER_PASSWORD = process.env.PZ_PZPW01_SUPER_PASSWORD || '';
const runtimeTest = BASE_URL && SUPER_EMAIL && SUPER_PASSWORD ? test : test.skip;

async function request(path, { token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
}

function unique(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

runtimeTest('PZPW01 HTTP PocketBase valida cada cambio, objetivo, variaciones, pausa y borrado', async () => {
  const suffix = unique('pzpw01');
  const password = 'Pzpw01-Runtime-8427';
  let superToken = '';
  let store = null;
  const masterIds = [];

  async function superCreate(collection, body) {
    const response = await request(`/api/collections/${collection}/records`, { token: superToken, body });
    assert.equal(response.status, 200, `${collection}: ${JSON.stringify(response.data)}`);
    return response.data;
  }

  async function list(collection, filter = '') {
    const query = new URLSearchParams({ perPage: '200', sort: 'created' });
    if (filter) query.set('filter', filter);
    const response = await request(`/api/collections/${collection}/records?${query}`, { token: superToken });
    assert.equal(response.status, 200, `${collection}: ${JSON.stringify(response.data)}`);
    return response.data.items || [];
  }

  async function patch(collection, id, body) {
    const response = await request(`/api/collections/${collection}/records/${id}`, {
      token: superToken, method: 'PATCH', body,
    });
    assert.equal(response.status, 200, `${collection}: ${JSON.stringify(response.data)}`);
    return response.data;
  }

  async function masterPost(token, endpoint, body) {
    return request(`/api/pz/master/${endpoint}`, { token, body });
  }

  try {
    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    assert.equal(superAuth.status, 200, JSON.stringify(superAuth.data));
    superToken = superAuth.data.token;

    store = await superCreate('stores', {
      name: `PZPW01 ${suffix}`, slug: suffix, status: 'active', plan: 'premium', plan_is_permanent: true,
    });
    const category = await superCreate('categories', {
      store: store.id, name: 'Pruebas PZPW01', slug: `${suffix}-cat`, active: true,
    });
    const masterOne = await superCreate('users', {
      email: `${suffix}-master-1@example.com`, password, passwordConfirm: password,
      role: 'master_admin', status: 'active', display_name: 'Master Uno', emailVisibility: true,
    });
    const masterTwo = await superCreate('users', {
      email: `${suffix}-master-2@example.com`, password, passwordConfirm: password,
      role: 'master_admin', status: 'active', display_name: 'Master Dos', emailVisibility: true,
    });
    masterIds.push(masterOne.id, masterTwo.id);
    const storeAdmin = await superCreate('users', {
      email: `${suffix}-admin@example.com`, password, passwordConfirm: password,
      role: 'store_admin', status: 'active', store: store.id, display_name: 'Admin Tienda', emailVisibility: true,
    });

    const authOne = await request('/api/collections/users/auth-with-password', {
      body: { identity: masterOne.email, password },
    });
    const authAdmin = await request('/api/collections/users/auth-with-password', {
      body: { identity: storeAdmin.email, password },
      headers: { 'X-PZ-Admin-Device': 'P'.repeat(43) },
    });
    assert.equal(authOne.status, 200);
    assert.equal(authAdmin.status, 200);
    const masterToken = authOne.data.token;

    const product = await superCreate('products', {
      store: store.id, category: category.id, name: 'Creatina PZPW01', slug: `${suffix}-creatina`,
      base_price_usd: 35, stock: 10, active: true, delivery_mode: 'pickup', has_variations: false,
    });
    const enabled = await masterPost(masterToken, 'product-watch-action', {
      store_id: store.id, product_id: product.id, action: 'enable',
    });
    assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
    const watchId = enabled.data.watch.id;
    assert.match(watchId, /^[a-z0-9]{15}$/);

    const target = await masterPost(masterToken, 'product-watch-target', {
      watch_id: watchId, target_alert_enabled: true, target_price_usd: 30,
    });
    assert.equal(target.status, 200, JSON.stringify(target.data));
    assert.equal((await list('master_notifications', `store="${store.id}"`)).length, 0);

    const unauthorized = await masterPost(authAdmin.data.token, 'product-watch-detail', { watch_id: watchId, page: 1 });
    assert.equal(unauthorized.status, 403);
    const injected = await masterPost(masterToken, 'product-watch-target', {
      watch_id: watchId, target_alert_enabled: true, target_price_usd: 30, store_id: store.id,
    });
    assert.equal(injected.status, 400);
    assert.equal(injected.data.error, 'invalid_payload');

    const sequence = [
      [34.5, 'normal'],
      [30, 'critical'],
      [29.5, 'critical'],
      [28, 'critical'],
      [32, 'normal'],
    ];
    for (let index = 0; index < sequence.length; index += 1) {
      const [price, tone] = sequence[index];
      await patch('products', product.id, { base_price_usd: price });
      const events = await list('master_product_price_events', `watch="${watchId}"`);
      const notifications = await list('master_notifications', `store="${store.id}"`);
      assert.equal(events.length, index + 1);
      assert.equal(notifications.length, (index + 1) * 2);
      assert.equal(events.at(-1).notification_tone, tone);
      assert.equal(events.at(-1).target_met_snapshot, tone === 'critical');
      assert.equal(events.at(-1).effective_price_after_usd, price);
      const latestNotifications = notifications.slice(-2);
      assert.ok(latestNotifications.every((item) => item.tone === tone));
      assert.ok(latestNotifications.every((item) => item.event_count === 1));
      assert.ok(latestNotifications.every((item) => item.action_url === `/master/price-watch/${watchId}`));
    }

    await patch('products', product.id, { base_price_usd: 32 });
    assert.equal((await list('master_product_price_events', `watch="${watchId}"`)).length, 5);
    assert.equal((await list('master_notifications', `store="${store.id}"`)).length, 10);
    for (const masterId of masterIds) {
      assert.equal((await list('master_notifications', `store="${store.id}" && recipient="${masterId}"`)).length, 5);
    }

    const paused = await masterPost(masterToken, 'product-watch-action', {
      store_id: store.id, product_id: product.id, action: 'pause',
    });
    assert.equal(paused.status, 200);
    await patch('products', product.id, { base_price_usd: 27 });
    assert.equal((await list('master_product_price_events', `watch="${watchId}"`)).length, 5);
    const resumed = await masterPost(masterToken, 'product-watch-action', {
      store_id: store.id, product_id: product.id, action: 'resume',
    });
    assert.equal(resumed.status, 200);
    assert.equal((await list('master_product_price_events', `watch="${watchId}"`)).length, 5);
    await patch('products', product.id, { base_price_usd: 26 });
    assert.equal((await list('master_product_price_events', `watch="${watchId}"`)).length, 6);

    const variedProduct = await superCreate('products', {
      store: store.id, category: category.id, name: 'Proteína variable PZPW01', slug: `${suffix}-variable`,
      base_price_usd: 20, stock: 1, active: true, delivery_mode: 'pickup', has_variations: true,
    });
    const lowVariation = await superCreate('product_variations', {
      product: variedProduct.id, variation_type: 'Tamaño', value: 'Pequeña', price_usd: 20,
      stock: 4, active: true, sort_order: 1,
    });
    const highVariation = await superCreate('product_variations', {
      product: variedProduct.id, variation_type: 'Tamaño', value: 'Grande', price_usd: 40,
      stock: 4, active: true, sort_order: 2,
    });
    assert.ok(lowVariation.id);
    const variedWatchResponse = await masterPost(masterToken, 'product-watch-action', {
      store_id: store.id, product_id: variedProduct.id, action: 'enable',
    });
    assert.equal(variedWatchResponse.status, 200, JSON.stringify(variedWatchResponse.data));
    const variedWatchId = variedWatchResponse.data.watch.id;
    assert.equal((await masterPost(masterToken, 'product-watch-target', {
      watch_id: variedWatchId, target_alert_enabled: true, target_price_usd: 30,
    })).status, 200);
    await patch('product_variations', highVariation.id, { price_usd: 39 });
    const variedEvents = await list('master_product_price_events', `watch="${variedWatchId}"`);
    assert.equal(variedEvents.length, 1);
    assert.equal(variedEvents[0].effective_price_after_usd, 20);
    assert.equal(variedEvents[0].notification_tone, 'critical');
    assert.equal((await list('master_notifications', `action_url="/master/price-watch/${variedWatchId}"`)).length, 2);

    const detail = await masterPost(masterToken, 'product-watch-detail', { watch_id: variedWatchId, page: 1 });
    assert.equal(detail.status, 200, JSON.stringify(detail.data));
    assert.equal(detail.data.product.has_variations, true);
    assert.equal(detail.data.pricing.current_effective_price_usd, 20);
    assert.equal(detail.data.pricing.target_met, true);
    const serializedDetail = JSON.stringify(detail.data);
    for (const forbidden of ['before_state', 'after_state', 'last_snapshot', 'fingerprint', 'dedupe_key']) {
      assert.equal(serializedDetail.includes(forbidden), false);
    }

    const deletedProduct = await superCreate('products', {
      store: store.id, category: category.id, name: 'Producto eliminado PZPW01', slug: `${suffix}-deleted`,
      base_price_usd: 12, stock: 1, active: true, delivery_mode: 'pickup', has_variations: false,
    });
    const deletedWatchResponse = await masterPost(masterToken, 'product-watch-action', {
      store_id: store.id, product_id: deletedProduct.id, action: 'enable',
    });
    assert.equal(deletedWatchResponse.status, 200);
    const deletedWatchId = deletedWatchResponse.data.watch.id;
    assert.equal((await request(`/api/collections/products/records/${deletedProduct.id}`, { token: superToken, method: 'DELETE' })).status, 204);
    const deletedDetail = await masterPost(masterToken, 'product-watch-detail', { watch_id: deletedWatchId, page: 1 });
    assert.equal(deletedDetail.status, 200);
    assert.equal(deletedDetail.data.product.exists, false);
    assert.equal(deletedDetail.data.watch.status, 'deleted');

    const preview = await masterPost(masterToken, 'store-delete-preview', { store_id: store.id });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.ok(preview.data.counts.price_watches >= 3);
    assert.ok(preview.data.counts.price_events >= 8);
    assert.ok(preview.data.counts.master_notifications >= 16);
    const execute = await masterPost(masterToken, 'store-delete-execute', {
      store_id: store.id,
      expected_slug: preview.data.store.slug,
      expected_updated: preview.data.store.updated,
      confirmation: preview.data.confirmation_phrase,
    });
    assert.equal(execute.status, 200, JSON.stringify(execute.data));
    assert.equal((await list('master_product_watches', `store="${store.id}"`)).length, 0);
    assert.equal((await list('master_product_price_events', `store="${store.id}"`)).length, 0);
    assert.equal((await list('master_notifications', `store="${store.id}"`)).length, 0);
    store = null;
  } finally {
    if (superToken) {
      if (store) {
        for (const collection of ['master_notifications', 'master_product_price_events', 'master_product_watches', 'product_variations', 'products', 'categories', 'users']) {
          const records = await list(collection, collection === 'users' ? `store="${store.id}"` : `store="${store.id}"`).catch(() => []);
          for (const record of records) {
            await request(`/api/collections/${collection}/records/${record.id}`, { token: superToken, method: 'DELETE' });
          }
        }
        await request(`/api/collections/stores/records/${store.id}`, { token: superToken, method: 'DELETE' });
      }
      for (const id of masterIds) {
        await request(`/api/collections/users/records/${id}`, { token: superToken, method: 'DELETE' });
      }
    }
  }
});
