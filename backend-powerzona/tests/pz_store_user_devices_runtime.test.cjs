const assert = require('node:assert/strict');
const test = require('node:test');

const BASE_URL = String(process.env.PZ_D7A6_RUNTIME_URL || '').replace(/\/$/, '');
const SUPER_EMAIL = process.env.PZ_D7A6_SUPER_EMAIL || '';
const SUPER_PASSWORD = process.env.PZ_D7A6_SUPER_PASSWORD || '';
const PASSWORD = 'D7A6-Store-Password-2026!';
const runtimeTest = BASE_URL && SUPER_EMAIL && SUPER_PASSWORD ? test : test.skip;

function deviceToken(seed) {
  const bytes = Buffer.alloc(32);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (seed * 37 + index * 11) % 256;
  return bytes.toString('base64url');
}

async function request(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = options.token;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  return { status: response.status, data, text, headers: response.headers };
}

function safeCode(result) {
  const value = result?.data?.data?.code ?? result?.data?.code ?? result?.data?.error;
  if (typeof value === 'string') return value;
  if (value && typeof value.code === 'string') return value.code;
  const validationData = result?.data?.data;
  if (validationData && typeof validationData === 'object') {
    for (const [key, item] of Object.entries(validationData)) {
      if (item && typeof item.code === 'string' && item.code === key) return key;
    }
  }
  return '';
}

async function superAuth() {
  const result = await request('/api/collections/_superusers/auth-with-password', {
    body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
  });
  assert.equal(result.status, 200, result.text);
  return result.data.token;
}

async function createRecord(collection, body, token) {
  const result = await request(`/api/collections/${collection}/records`, { token, body });
  assert.equal(result.status, 200, `${collection}: ${result.text}`);
  return result.data;
}

async function updateRecord(collection, id, body, token) {
  const result = await request(`/api/collections/${collection}/records/${id}`, {
    method: 'PATCH', token, body,
  });
  assert.equal(result.status, 200, `${collection}/${id}: ${result.text}`);
  return result.data;
}

async function createStore(name, slug, plan, superToken) {
  const created = await createRecord('stores', {
    name, slug, status: 'active', plan: 'free', protected: false,
  }, superToken);
  if (plan === 'free') return created;
  return updateRecord('stores', created.id, {
    plan,
    plan_started_at: new Date().toISOString(),
    plan_expires_at: '',
    plan_duration_months: 1,
    plan_is_permanent: true,
  }, superToken);
}

async function createUser(email, role, storeId, superToken) {
  return createRecord('users', {
    email,
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    verified: true,
    emailVisibility: true,
    display_name: email.split('@')[0],
    role,
    status: 'active',
    store: storeId || '',
  }, superToken);
}

async function login(email, tokenValue, userAgent = 'D7A6 Runtime Chrome/126 Windows') {
  const headers = tokenValue ? { 'X-PZ-Admin-Device': tokenValue, 'User-Agent': userAgent } : {};
  return request('/api/collections/users/auth-with-password', {
    headers,
    body: { identity: email, password: PASSWORD },
  });
}

async function refresh(authToken, tokenValue) {
  const headers = tokenValue ? { 'X-PZ-Admin-Device': tokenValue } : {};
  return request('/api/collections/users/auth-refresh', { token: authToken, headers, body: {} });
}

async function masterPost(pathname, masterToken, body) {
  return request(pathname, { token: masterToken, body });
}

async function countRecords(collection, filter, token) {
  const query = new URLSearchParams({ page: '1', perPage: '1', filter });
  const result = await request(`/api/collections/${collection}/records?${query}`, { token });
  assert.equal(result.status, 200, result.text);
  return result.data.totalItems;
}

runtimeTest('PocketBase 0.39.8 aplica límites, concurrencia, aislamiento y revocación real', async () => {
  const superToken = await superAuth();
  const nonce = Date.now().toString(36).slice(-7);
  const masterEmail = `d7a6-master-${nonce}@example.test`;
  const master = await createUser(masterEmail, 'master_admin', '', superToken);
  assert.ok(master.id);
  const masterLogin = await login(masterEmail, '');
  assert.equal(masterLogin.status, 200, masterLogin.text);
  const masterToken = masterLogin.data.token;
  assert.equal((await refresh(masterToken, '')).status, 200);
  const secondMasterLogin = await login(masterEmail, '');
  assert.equal(secondMasterLogin.status, 200, secondMasterLogin.text);
  const secondMasterToken = secondMasterLogin.data.token;

  const basicStore = await createStore(`D7A6 Basic ${nonce}`, `d7a6-basic-${nonce}`, 'basic', superToken);
  const basicEmail = `d7a6-basic-${nonce}@example.test`;
  const basicUser = await createUser(basicEmail, 'store_admin', basicStore.id, superToken);
  const basicTokens = Array.from({ length: 6 }, (_, index) => deviceToken(10 + index));
  const basicLogins = [];
  for (let index = 0; index < 5; index += 1) {
    const result = await login(basicEmail, basicTokens[index]);
    assert.equal(result.status, 200, `basic device ${index + 1}: ${result.text}`);
    basicLogins.push(result);
  }
  const sixth = await login(basicEmail, basicTokens[5]);
  assert.equal(sixth.status, 400);
  assert.equal(safeCode(sixth), 'user_device_limit_reached');
  assert.equal((await login(basicEmail, basicTokens[0])).status, 200);
  assert.equal((await refresh(basicLogins[0].data.token, basicTokens[0])).status, 200);
  const refreshMissing = await refresh(basicLogins[0].data.token, '');
  assert.equal(refreshMissing.status, 400);
  assert.equal(safeCode(refreshMissing), 'device_required');
  const refreshInvented = await refresh(basicLogins[0].data.token, deviceToken(99));
  assert.equal(refreshInvented.status, 400);
  assert.equal(safeCode(refreshInvented), 'device_not_authorized');
  const basicSecondEmail = `d7a6-basic-${nonce}-second@example.test`;
  const basicSecondUser = await createUser(basicSecondEmail, 'store_staff', basicStore.id, superToken);
  for (let index = 0; index < 5; index += 1) {
    const result = await login(basicSecondEmail, deviceToken(40 + index));
    assert.equal(result.status, 200, `basic second user device ${index + 1}: ${result.text}`);
  }
  const basicStoreUsage = await masterPost('/api/pz/master/store-user-devices/list', masterToken, {
    store_id: basicStore.id,
    user_id: basicSecondUser.id,
    page: 1,
    per_page: 10,
    status: 'all',
  });
  assert.equal(basicStoreUsage.status, 200, basicStoreUsage.text);
  assert.equal(basicStoreUsage.data.authorized_for_user, 5);
  assert.equal(basicStoreUsage.data.user_limit, 5);
  assert.equal(basicStoreUsage.data.distinct_authorized_for_store, 10);
  assert.equal(basicStoreUsage.data.store_limit, 10);

  const freeStore = await createStore(`D7A6 Free ${nonce}`, `d7a6-free-${nonce}`, 'free', superToken);
  const freeEmail = `d7a6-free-${nonce}@example.test`;
  await createUser(freeEmail, 'store_admin', freeStore.id, superToken);
  for (let index = 0; index < 5; index += 1) {
    const result = await login(freeEmail, deviceToken(70 + index));
    assert.equal(result.status, 200, `free device ${index + 1}: ${result.text}`);
  }
  const freeSixth = await login(freeEmail, deviceToken(75));
  assert.equal(freeSixth.status, 400);
  assert.equal(safeCode(freeSixth), 'user_device_limit_reached');

  const premiumStore = await createStore(`D7A6 Premium ${nonce}`, `d7a6-premium-${nonce}`, 'premium', superToken);
  const premiumUsers = [];
  let tokenSeed = 100;
  for (let userIndex = 0; userIndex < 4; userIndex += 1) {
    const email = `d7a6-premium-${nonce}-${userIndex}@example.test`;
    const user = await createUser(email, userIndex === 0 ? 'store_admin' : 'store_staff', premiumStore.id, superToken);
    const tokens = [];
    for (let deviceIndex = 0; deviceIndex < 5; deviceIndex += 1) {
      const tokenValue = deviceToken(tokenSeed++);
      const result = await login(email, tokenValue);
      assert.equal(result.status, 200, `premium ${userIndex}/${deviceIndex}: ${result.text}`);
      tokens.push({ tokenValue, authToken: result.data.token });
    }
    premiumUsers.push({ ...user, email, tokens });
  }
  const twentyFirst = await login(premiumUsers[0].email, deviceToken(tokenSeed++));
  assert.equal(twentyFirst.status, 400);
  assert.ok(['user_device_limit_reached', 'store_device_limit_reached'].includes(safeCode(twentyFirst)));
  const premiumList = await masterPost('/api/pz/master/store-user-devices/list', secondMasterToken, {
    store_id: premiumStore.id,
    user_id: premiumUsers[0].id,
    page: 1,
    per_page: 10,
    status: 'all',
  });
  assert.equal(premiumList.status, 200, premiumList.text);
  assert.equal(premiumList.data.authorized_for_user, 5);
  assert.equal(premiumList.data.user_limit, 5);
  assert.equal(premiumList.data.distinct_authorized_for_store, 20);
  assert.equal(premiumList.data.store_limit, 20);
  const premiumPlanUsage = await masterPost('/api/pz/master/store-plan', masterToken, {
    store_id: premiumStore.id,
  });
  assert.equal(premiumPlanUsage.status, 200, premiumPlanUsage.text);
  assert.equal(premiumPlanUsage.data.usage.store_devices, 20);
  assert.equal(premiumPlanUsage.data.usage.max_devices_per_user, 5);

  const concurrentStore = await createStore(`D7A6 Concurrent ${nonce}`, `d7a6-concurrent-${nonce}`, 'basic', superToken);
  const concurrentEmail = `d7a6-concurrent-${nonce}@example.test`;
  const concurrentUser = await createUser(concurrentEmail, 'store_admin', concurrentStore.id, superToken);
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await login(concurrentEmail, deviceToken(180 + index))).status, 200);
  }
  const concurrent = await Promise.all([
    login(concurrentEmail, deviceToken(190)),
    login(concurrentEmail, deviceToken(191)),
    login(concurrentEmail, deviceToken(192)),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 200).length, 1);
  assert.equal(concurrent.filter((result) => result.status === 400).length, 2);
  assert.ok(concurrent.filter((result) => result.status !== 200).every((result) => (
    ['user_device_limit_reached', 'store_device_limit_reached', 'device_authorization_unavailable'].includes(safeCode(result))
  )));
  const concurrentList = await masterPost('/api/pz/master/store-user-devices/list', masterToken, {
    store_id: concurrentStore.id,
    user_id: concurrentUser.id,
    page: 1,
    per_page: 10,
    status: 'all',
  });
  assert.equal(concurrentList.status, 200, concurrentList.text);
  assert.equal(concurrentList.data.authorized_for_user, 5);
  assert.equal(concurrentList.data.devices.filter((device) => device.status === 'authorized').length, 5);

  const revokeStore = await createStore(`D7A6 Revoke ${nonce}`, `d7a6-revoke-${nonce}`, 'premium', superToken);
  const revokeEmail = `d7a6-revoke-${nonce}@example.test`;
  const otherEmail = `d7a6-other-${nonce}@example.test`;
  const revokeUser = await createUser(revokeEmail, 'store_admin', revokeStore.id, superToken);
  const otherUser = await createUser(otherEmail, 'store_staff', revokeStore.id, superToken);
  const revokeDeviceToken = deviceToken(210);
  const survivorDeviceToken = deviceToken(211);
  const otherDeviceToken = deviceToken(212);
  const revokeLogin = await login(revokeEmail, revokeDeviceToken, 'Mozilla/5.0 Linux Firefox/126.0');
  const survivorLogin = await login(revokeEmail, survivorDeviceToken, 'Mozilla/5.0 Windows Edg/126.0');
  const otherLogin = await login(otherEmail, otherDeviceToken, 'Mozilla/5.0 Android Chrome/126 Mobile');
  assert.equal(revokeLogin.status, 200);
  assert.equal(survivorLogin.status, 200);
  assert.equal(otherLogin.status, 200);

  const beforeRevoke = await masterPost('/api/pz/master/store-user-devices/list', masterToken, {
    store_id: revokeStore.id, user_id: revokeUser.id, page: 1, per_page: 10, status: 'all',
  });
  assert.equal(beforeRevoke.status, 200, beforeRevoke.text);
  const revokedDevice = beforeRevoke.data.devices.find((device) => (
    device.status === 'authorized' && device.browser_name === 'Firefox'
  ));
  assert.ok(revokedDevice?.id);
  for (const device of beforeRevoke.data.devices) {
    assert.equal('device_digest' in device, false);
    assert.equal('user' in device, false);
    assert.equal('store' in device, false);
  }
  const revoke = await masterPost('/api/pz/master/store-user-devices/revoke', masterToken, {
    store_id: revokeStore.id,
    user_id: revokeUser.id,
    device_id: revokedDevice.id,
    reason: 'Prueba runtime D7A6',
  });
  assert.equal(revoke.status, 200, revoke.text);
  assert.equal(revoke.data.sessions_revoked_for_user, true);
  assert.equal(revoke.data.device.status, 'revoked');
  const idempotent = await masterPost('/api/pz/master/store-user-devices/revoke', masterToken, {
    store_id: revokeStore.id,
    user_id: revokeUser.id,
    device_id: revokedDevice.id,
    reason: 'Prueba runtime D7A6 repetida',
  });
  assert.equal(idempotent.status, 200);
  assert.equal(idempotent.data.already_revoked, true);
  assert.equal(idempotent.data.sessions_revoked_for_user, false);

  assert.notEqual((await refresh(revokeLogin.data.token, revokeDeviceToken)).status, 200);
  assert.notEqual((await refresh(survivorLogin.data.token, survivorDeviceToken)).status, 200);
  assert.equal((await refresh(otherLogin.data.token, otherDeviceToken)).status, 200);
  assert.equal((await login(revokeEmail, survivorDeviceToken, 'Mozilla/5.0 Windows Edg/126.0')).status, 200);
  const revokedRelogin = await login(revokeEmail, revokeDeviceToken, 'Mozilla/5.0 Linux Firefox/126.0');
  assert.equal(revokedRelogin.status, 400);
  assert.equal(safeCode(revokedRelogin), 'device_revoked');

  const audit = await masterPost('/api/pz/master/store-user-devices/audit', masterToken, {
    store_id: revokeStore.id, user_id: revokeUser.id, page: 1, per_page: 20,
  });
  assert.equal(audit.status, 200, audit.text);
  assert.equal(audit.data.audit.filter((entry) => entry.action === 'device_revoked').length, 1);
  assert.equal(audit.data.audit.find((entry) => entry.action === 'device_revoked').sessions_revoked, true);

  const storeAccess = await masterPost('/api/pz/master/store-user-devices/list', survivorLogin.data.token, {
    store_id: revokeStore.id, user_id: revokeUser.id, page: 1, per_page: 10, status: 'all',
  });
  assert.equal(storeAccess.status, 403);
  const directCollection = await request('/api/collections/store_user_devices/records?page=1&perPage=10', {
    token: otherLogin.data.token,
  });
  assert.equal(
    directCollection.status === 403
      || (directCollection.status === 200
        && (!directCollection.text
          || (directCollection.data?.totalItems === 0 && directCollection.data?.items?.length === 0))),
    true,
    'store user must not read private device records',
  );

  const foreignList = await masterPost('/api/pz/master/store-user-devices/list', masterToken, {
    store_id: revokeStore.id, user_id: basicUser.id, page: 1, per_page: 10, status: 'all',
  });
  assert.equal(foreignList.status, 404);
  assert.equal(safeCode(foreignList), 'user_not_found');

  const deletePreview = await masterPost('/api/pz/master/store-delete-preview', masterToken, {
    store_id: concurrentStore.id,
  });
  assert.equal(deletePreview.status, 200, deletePreview.text);
  assert.equal(deletePreview.data.counts.user_devices, 5);
  assert.equal(deletePreview.data.counts.user_device_audit, 5);
  const deleteExecute = await masterPost('/api/pz/master/store-delete-execute', masterToken, {
    store_id: concurrentStore.id,
    expected_slug: deletePreview.data.store.slug,
    expected_updated: deletePreview.data.store.updated,
    confirmation: deletePreview.data.confirmation_phrase,
  });
  assert.equal(deleteExecute.status, 200, deleteExecute.text);
  assert.equal(await countRecords('store_user_devices', `store = "${concurrentStore.id}"`, superToken), 0);
  assert.equal(await countRecords('store_user_device_audit', `store = "${concurrentStore.id}"`, superToken), 0);
  assert.equal(await countRecords('users', `store = "${concurrentStore.id}"`, superToken), 0);
  assert.equal(await countRecords('stores', `id = "${concurrentStore.id}"`, superToken), 0);

  const serializedResponses = JSON.stringify({
    sixth: sixth.data,
    premiumList: premiumList.data,
    premiumPlanUsage: premiumPlanUsage.data,
    concurrentList: concurrentList.data,
    beforeRevoke: beforeRevoke.data,
    revoke: revoke.data,
    audit: audit.data,
  });
  for (const forbidden of [
    revokeDeviceToken,
    survivorDeviceToken,
    'device_digest',
    'tokenKey',
    PASSWORD,
    'D7A6 Runtime Chrome/126 Windows',
  ]) {
    assert.equal(serializedResponses.includes(forbidden), false, `secret leaked: ${forbidden}`);
  }

  const rawAuditQuery = new URLSearchParams({
    page: '1', perPage: '200', filter: `store = "${revokeStore.id}"`,
  });
  const rawAudit = await request(`/api/collections/store_user_device_audit/records?${rawAuditQuery}`, {
    token: superToken,
  });
  assert.equal(rawAudit.status, 200, rawAudit.text);
  const logs = await request('/api/logs?page=1&perPage=500', { token: superToken });
  assert.equal(logs.status, 200, logs.text);
  const sensitiveSurfaces = `${rawAudit.text}\n${logs.text}`;
  for (const forbidden of [
    revokeDeviceToken,
    survivorDeviceToken,
    otherDeviceToken,
    'device_digest',
    'tokenKey',
    PASSWORD,
    'Mozilla/5.0 Linux Firefox/126.0',
    'Mozilla/5.0 Windows Edg/126.0',
  ]) {
    assert.equal(sensitiveSurfaces.includes(forbidden), false, `audit/log secret leaked: ${forbidden}`);
  }
});
