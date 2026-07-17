const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const BASE_URL = String(process.env.PZ_F7P8_RUNTIME_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = String(process.env.PZ_F7P8_SUPER_EMAIL || '');
const SUPER_PASSWORD = String(process.env.PZ_F7P8_SUPER_PASSWORD || '');
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(BASE_URL);
const SKIP_REASON = !BASE_URL || !SUPER_EMAIL || !SUPER_PASSWORD
  ? 'requiere PZ_F7P8_RUNTIME_URL, PZ_F7P8_SUPER_EMAIL y PZ_F7P8_SUPER_PASSWORD'
  : !IS_LOCAL
    ? 'PZ_F7P8_RUNTIME_URL debe apuntar a localhost, 127.0.0.1 o ::1'
    : false;

async function request(path, { token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!isForm && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw };
}

function unique() {
  return `f7p8-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function productForm(storeId, slug, files = [], extra = {}) {
  const form = new FormData();
  form.set('store', storeId);
  form.set('name', `F7P8 ${slug}`);
  form.set('slug', slug);
  form.set('active', 'true');
  form.set('track_stock', 'false');
  form.set('stock', '0');
  form.set('base_price_usd', '1');
  form.set('regular_price_usd', '1');
  form.set('delivery_mode', 'both');
  Object.entries(extra).forEach(([key, value]) => form.set(key, String(value)));
  files.forEach((file) => form.append('images', new Blob([file.bytes], { type: file.type }), file.name));
  return form;
}

function patchImages(field, files = [], values = {}) {
  const form = new FormData();
  files.forEach((file) => form.append(field, new Blob([file.bytes], { type: file.type }), file.name));
  Object.entries(values).forEach(([key, value]) => form.append(key, String(value)));
  return form;
}

function errorCode(result) {
  const entries = result?.data?.data && typeof result.data.data === 'object'
    ? Object.values(result.data.data)
    : [];
  return entries.map((item) => item?.code).find(Boolean) || '';
}

test('F7P8 HTTP runtime protege multipart y bypass directos', { skip: SKIP_REASON }, async () => {
  const prefix = unique();
  const ids = { products: [], users: [], stores: [] };
  const fixtureDir = await mkdtemp(join(tmpdir(), `${prefix}-`));
  let superToken = '';

  async function remove(collection, id) {
    if (!id || !superToken) return;
    await request(`/api/collections/${collection}/records/${id}`, { token: superToken, method: 'DELETE' });
  }

  async function removeUserRelations(userId) {
    const related = [
      ['store_user_device_audit', `target_user="${userId}" || actor="${userId}"`],
      ['store_user_devices', `user="${userId}" || revoked_by="${userId}"`],
    ];
    for (const [collection, filter] of related) {
      const records = await request(`/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`, { token: superToken });
      if (records.status !== 200) continue;
      for (const record of records.data?.items || []) await remove(collection, record.id);
    }
  }

  async function createStore(suffix, plan) {
    const created = await request('/api/collections/stores/records', {
      token: superToken,
      body: { name: `${prefix}-${suffix}`, slug: `${prefix}-${suffix}`, status: 'active' },
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    ids.stores.push(created.data.id);
    if (plan !== 'free') {
      const updated = await request(`/api/collections/stores/records/${created.data.id}`, {
        token: superToken,
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
    return created.data;
  }

  async function createProduct(storeId, suffix, files) {
    const result = await request('/api/collections/products/records', {
      token: superToken,
      body: productForm(storeId, `${prefix}-${suffix}`, files),
    });
    if (result.status === 200 && result.data?.id) ids.products.push(result.data.id);
    return result;
  }

  try {
    const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlGv1sAAAAASUVORK5CYII=', 'base64');
    const jpegBytes = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==', 'base64');
    const webpBytes = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=', 'base64');
    await writeFile(join(fixtureDir, 'valid.png'), pngBytes);
    await writeFile(join(fixtureDir, 'valid.jpg'), jpegBytes);
    await writeFile(join(fixtureDir, 'valid.webp'), webpBytes);
    const validFiles = [
      { name: 'valid.png', type: 'image/png', bytes: await readFile(join(fixtureDir, 'valid.png')) },
      { name: 'valid.jpg', type: 'image/jpeg', bytes: await readFile(join(fixtureDir, 'valid.jpg')) },
      { name: 'valid.webp', type: 'image/webp', bytes: await readFile(join(fixtureDir, 'valid.webp')) },
    ];

    const auth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    assert.equal(auth.status, 200, JSON.stringify(auth.data));
    superToken = auth.data.token;

    const free = await createStore('free', 'free');
    const basic = await createStore('basic', 'basic');
    const premium = await createStore('premium', 'premium');

    const freeThree = await createProduct(free.id, 'free-three', validFiles);
    assert.equal(freeThree.status, 400, JSON.stringify(freeThree));
    assert.equal(errorCode(freeThree), 'product_image_limit_exceeded', JSON.stringify(freeThree));

    const basicThree = await createProduct(basic.id, 'basic-three', validFiles);
    assert.equal(basicThree.status, 400);
    assert.equal(errorCode(basicThree), 'product_image_limit_exceeded');

    const premiumFour = await createProduct(premium.id, 'premium-four', [validFiles[0], validFiles[1], validFiles[2], validFiles[0]]);
    assert.equal(premiumFour.status, 200, JSON.stringify(premiumFour.data));

    const premiumFifth = await request(`/api/collections/products/records/${premiumFour.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: patchImages('images+', [validFiles[0]]),
    });
    assert.equal(premiumFifth.status, 400);

    const basicTwo = await createProduct(basic.id, 'basic-two', validFiles.slice(0, 2));
    assert.equal(basicTwo.status, 200, JSON.stringify(basicTwo.data));
    const basicAppend = await request(`/api/collections/products/records/${basicTwo.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: patchImages('images+', [validFiles[2]]),
    });
    assert.equal(basicAppend.status, 400);
    assert.equal(errorCode(basicAppend), 'product_image_limit_exceeded');

    const basicReplaceThree = await request(`/api/collections/products/records/${basicTwo.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: patchImages('images', validFiles),
    });
    assert.equal(basicReplaceThree.status, 400);

    const downgrade = await request(`/api/collections/stores/records/${premium.id}`, {
      token: superToken,
      method: 'PATCH',
      body: { plan: 'basic', plan_is_permanent: true, plan_expires_at: '' },
    });
    assert.equal(downgrade.status, 200, JSON.stringify(downgrade.data));
    const lockedNames = premiumFour.data.images;
    const deleteLocked = await request(`/api/collections/products/records/${premiumFour.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: patchImages('images-', [], { 'images-': lockedNames[2] }),
    });
    assert.equal(deleteLocked.status, 400);
    assert.equal(errorCode(deleteLocked), 'product_image_slot_locked');
    const promoteLocked = await request(`/api/collections/products/records/${premiumFour.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: { image_order: JSON.stringify([lockedNames[2], lockedNames[0], lockedNames[1], lockedNames[3]]) },
    });
    assert.equal(promoteLocked.status, 400);
    assert.equal(errorCode(promoteLocked), 'product_image_slot_locked');

    const deleteActiveWithTail = await request(`/api/collections/products/records/${premiumFour.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: patchImages('images-', [], { 'images-': lockedNames[0] }),
    });
    assert.equal(deleteActiveWithTail.status, 400);
    assert.equal(errorCode(deleteActiveWithTail), 'product_image_delete_would_activate_locked');

    const replaceLocked = await request(`/api/collections/products/records/${premiumFour.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: patchImages('images+', [validFiles[0]], { 'images-': lockedNames[2] }),
    });
    assert.equal(replaceLocked.status, 400);
    assert.equal(errorCode(replaceLocked), 'product_image_slot_locked');

    for (const requestedOrder of [
      [lockedNames[0], lockedNames[0], lockedNames[2], lockedNames[3]],
      [lockedNames[0], lockedNames[1], 'foreign.webp', lockedNames[3]],
    ]) {
      const invalidOrder = await request(`/api/collections/products/records/${premiumFour.data.id}`, {
        token: superToken,
        method: 'PATCH',
        body: { image_order: JSON.stringify(requestedOrder) },
      });
      assert.equal(invalidOrder.status, 400);
      assert.equal(errorCode(invalidOrder), 'invalid_product_image_order');
    }

    const replaceActive = await request(`/api/collections/products/records/${premiumFour.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: patchImages('images+', [validFiles[0]], { 'images-': lockedNames[0] }),
    });
    assert.equal(replaceActive.status, 200, JSON.stringify(replaceActive.data));
    const replacementOrder = Array.isArray(replaceActive.data.image_order)
      ? replaceActive.data.image_order
      : JSON.parse(replaceActive.data.image_order || '[]');
    assert.deepEqual(replacementOrder.slice(2), lockedNames.slice(2));

    const upgrade = await request(`/api/collections/stores/records/${premium.id}`, {
      token: superToken,
      method: 'PATCH',
      body: { plan: 'premium', plan_is_permanent: true, plan_expires_at: '' },
    });
    assert.equal(upgrade.status, 200, JSON.stringify(upgrade.data));
    const restored = await request(`/api/collections/products/records/${premiumFour.data.id}`, { token: superToken });
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    const restoredOrder = Array.isArray(restored.data.image_order)
      ? restored.data.image_order
      : JSON.parse(restored.data.image_order || '[]');
    assert.equal(restoredOrder.length, 4);
    assert.deepEqual(restoredOrder.slice(2), lockedNames.slice(2));

    const manipulatedStore = await request(`/api/collections/products/records/${basicTwo.data.id}`, {
      token: superToken,
      method: 'PATCH',
      body: patchImages('images+', [validFiles[2]], { store: premium.id }),
    });
    assert.equal(manipulatedStore.status, 400);
    assert.equal(errorCode(manipulatedStore), 'product_image_management_unavailable');

    const svg = { name: 'invalid.svg', type: 'image/svg+xml', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') };
    const gif = { name: 'invalid.gif', type: 'image/gif', bytes: Buffer.from('GIF89a') };
    const bmp = { name: 'invalid.bmp', type: 'image/bmp', bytes: Buffer.from('BMcorrupt') };
    const corrupt = { name: 'corrupt.png', type: 'image/png', bytes: Buffer.from('not-a-real-png') };
    const oversized = {
      name: 'oversized.png',
      type: 'image/png',
      bytes: Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(2_097_152),
        Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
      ]),
    };
    for (const [suffix, file] of [['svg', svg], ['gif', gif], ['bmp', bmp], ['corrupt', corrupt], ['oversized', oversized]]) {
      const invalid = await createProduct(premium.id, `invalid-${suffix}`, [file]);
      assert.equal(invalid.status, 400, suffix);
    }

    const userPassword = 'F7P8-Other-Store!42';
    const user = await request('/api/collections/users/records', {
      token: superToken,
      body: {
        email: `${prefix}-admin@example.com`,
        password: userPassword,
        passwordConfirm: userPassword,
        display_name: 'F7P8 Admin',
        role: 'store_admin',
        status: 'active',
        store: basic.id,
        emailVisibility: true,
      },
    });
    assert.equal(user.status, 200, JSON.stringify(user.data));
    ids.users.push(user.data.id);
    const userAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: user.data.email, password: userPassword },
      headers: { 'X-PZ-Admin-Device': 'F'.repeat(43) },
    });
    assert.equal(userAuth.status, 200, JSON.stringify(userAuth.data));
    const otherStorePatch = await request(`/api/collections/products/records/${premiumFour.data.id}`, {
      token: userAuth.data.token,
      method: 'PATCH',
      body: { name: 'F7P8 forbidden cross tenant' },
    });
    assert.ok([401, 403, 404].includes(otherStorePatch.status), JSON.stringify(otherStorePatch.data));
  } finally {
    for (const id of ids.products.reverse()) await remove('products', id);
    for (const id of ids.users.reverse()) {
      await removeUserRelations(id);
      await remove('users', id);
    }
    for (const id of ids.stores.reverse()) await remove('stores', id);
    await rm(fixtureDir, { recursive: true, force: true });

    if (superToken) {
      for (const collection of ['products', 'users', 'stores']) {
        const filter = collection === 'users'
          ? `email~"${prefix}"`
          : collection === 'stores'
            ? `slug~"${prefix}"`
            : `slug~"${prefix}"`;
        const remaining = await request(`/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`, { token: superToken });
        assert.equal(remaining.status, 200, JSON.stringify(remaining.data));
        assert.equal(remaining.data?.totalItems || 0, 0, `${collection} conserva fixtures ${prefix}`);
      }
    }
  }
});
