const assert = require('node:assert/strict');
const test = require('node:test');

const BASE_URL = String(process.env.PZ_U7I7_BASE_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = process.env.PZ_U7I7_SUPER_EMAIL || '';
const SUPER_PASSWORD = process.env.PZ_U7I7_SUPER_PASSWORD || '';
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

runtimeTest('U7I7 HTTP PocketBase 0.38.2 valida temporales, sesiones, dispositivos y aislamiento', async () => {
  const suffix = unique('u7i7');
  const password = {
    master: 'Master-U7I7-Run!42',
    adminTemp: 'Temporal-Admin!42',
    adminPersonal: 'Personal-Admin!84',
    adminVoluntary: 'Voluntary-Admin!88',
    staffTemp: 'Temporal-Staff!42',
    staffPersonal: 'Personal-Staff!84',
    resetTemp: 'Temporal-Reset!96',
    resetTempAgain: 'Temporal-Reset-Again!97',
    basicAdmin: 'Temporal-Basic!42',
    suspended: 'Temporal-Suspended!42',
    expired: 'Temporal-Expired!42',
  };
  const ids = { stores: [], users: [], master: '' };
  let superToken = '';

  async function superCreate(collection, body) {
    const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
    assert.equal(result.status, 200, `${collection}: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async function masterPost(token, action, body) {
    return request(`/api/pz/master/store-users/${action}`, { token, body });
  }

  async function deleteByFilter(collection, filter) {
    const list = await request(`/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`, { token: superToken });
    if (list.status !== 200) return;
    for (const item of list.data?.items || []) {
      await request(`/api/collections/${collection}/records/${item.id}`, { token: superToken, method: 'DELETE' });
    }
  }

  try {
    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    assert.equal(superAuth.status, 200);
    superToken = superAuth.data.token;

    const premiumStore = await superCreate('stores', {
      name: `U7I7 Premium ${suffix}`, slug: `${suffix}-premium`, status: 'active', plan: 'premium', plan_is_permanent: true,
    });
    const basicStore = await superCreate('stores', {
      name: `U7I7 Basic ${suffix}`, slug: `${suffix}-basic`, status: 'active', plan: 'basic', plan_is_permanent: true,
    });
    ids.stores.push(premiumStore.id, basicStore.id);

    const master = await superCreate('users', {
      email: `${suffix}-master@example.com`, password: password.master, passwordConfirm: password.master,
      role: 'master_admin', status: 'active', display_name: 'Master U7I7', emailVisibility: true,
    });
    ids.master = master.id;
    const masterAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: master.email, password: password.master },
    });
    assert.equal(masterAuth.status, 200);
    const masterToken = masterAuth.data.token;
    const premiumPlan = await request('/api/pz/master/store-plan/change', {
      token: masterToken,
      body: { store_id: premiumStore.id, plan: 'premium', is_permanent: true, duration_months: 0, reason: 'Prueba U7I7' },
    });
    assert.equal(premiumPlan.status, 200, JSON.stringify(premiumPlan.data));
    const basicPlan = await request('/api/pz/master/store-plan/change', {
      token: masterToken,
      body: { store_id: basicStore.id, plan: 'basic', is_permanent: true, duration_months: 0, reason: 'Prueba U7I7' },
    });
    assert.equal(basicPlan.status, 200, JSON.stringify(basicPlan.data));

    const createAdmin = await masterPost(masterToken, 'create', {
      store_id: premiumStore.id, email: `${suffix}-admin@example.com`, password: password.adminTemp,
      display_name: 'Admin Temporal', phone: '+1 555 0101', role: 'store_admin', status: 'active', reason: 'Prueba U7I7',
    });
    assert.equal(createAdmin.status, 200, JSON.stringify(createAdmin.data));
    ids.users.push(createAdmin.data.user.id);
    assert.equal(createAdmin.data.user.must_change_password, true);
    assert.equal(createAdmin.data.user.temporary_password_state, 'pending');
    assert.equal(JSON.stringify(createAdmin.data).includes(password.adminTemp), false);
    const ttl = new Date(createAdmin.data.user.temporary_password_expires_at).getTime()
      - new Date(createAdmin.data.user.temporary_password_issued_at).getTime();
    assert.equal(ttl, 72 * 60 * 60 * 1000);

    const createStaff = await masterPost(masterToken, 'create', {
      store_id: premiumStore.id, email: `${suffix}-staff@example.com`, password: password.staffTemp,
      display_name: 'Staff Temporal', phone: '', role: 'store_staff', status: 'active', reason: 'Prueba U7I7',
    });
    assert.equal(createStaff.status, 200, JSON.stringify(createStaff.data));
    ids.users.push(createStaff.data.user.id);

    const createBasicAdmin = await masterPost(masterToken, 'create', {
      store_id: basicStore.id, email: `${suffix}-basic-admin@example.com`, password: password.basicAdmin,
      display_name: 'Basic Admin', phone: '', role: 'store_admin', status: 'active', reason: '',
    });
    assert.equal(createBasicAdmin.status, 200);
    ids.users.push(createBasicAdmin.data.user.id);
    const basicOverLimit = await masterPost(masterToken, 'create', {
      store_id: basicStore.id, email: `${suffix}-basic-active@example.com`, password: password.suspended,
      display_name: 'Basic Active', phone: '', role: 'store_staff', status: 'active', reason: '',
    });
    assert.equal(basicOverLimit.status, 409);
    assert.equal(basicOverLimit.data.error, 'active_user_limit_reached');
    const basicSuspended = await masterPost(masterToken, 'create', {
      store_id: basicStore.id, email: `${suffix}-basic-suspended@example.com`, password: password.suspended,
      display_name: 'Basic Suspended', phone: '', role: 'store_staff', status: 'suspended', reason: '',
    });
    assert.equal(basicSuspended.status, 200);
    ids.users.push(basicSuspended.data.user.id);

    const deviceAdmin = 'A'.repeat(43);
    const adminLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: createAdmin.data.user.email, password: password.adminTemp },
      headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.data));
    assert.equal(adminLogin.data.record.must_change_password, true);
    let temporaryToken = adminLogin.data.token;

    const pendingRefresh = await request('/api/collections/users/auth-refresh', {
      token: temporaryToken, body: {}, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(pendingRefresh.status, 200);
    assert.equal(pendingRefresh.data.record.must_change_password, true);
    temporaryToken = pendingRefresh.data.token;

    const wrongCurrent = await request('/api/pz/store/account/change-temporary-password', {
      token: temporaryToken,
      body: { currentPassword: 'Incorrect-Temporary!41', newPassword: password.adminPersonal, newPasswordConfirm: password.adminPersonal },
    });
    assert.equal(wrongCurrent.status, 400);
    assert.equal(wrongCurrent.data.error, 'current_password_invalid');
    const reusedTemporary = await request('/api/pz/store/account/change-temporary-password', {
      token: temporaryToken,
      body: { currentPassword: password.adminTemp, newPassword: password.adminTemp, newPasswordConfirm: password.adminTemp },
    });
    assert.equal(reusedTemporary.status, 400);
    assert.equal(reusedTemporary.data.error, 'password_reuse_not_allowed');
    const mismatchedConfirmation = await request('/api/pz/store/account/change-temporary-password', {
      token: temporaryToken,
      body: { currentPassword: password.adminTemp, newPassword: password.adminPersonal, newPasswordConfirm: 'Different-Personal!85' },
    });
    assert.equal(mismatchedConfirmation.status, 400);
    assert.equal(mismatchedConfirmation.data.error, 'password_confirmation_mismatch');

    const forcedAdmin = await request('/api/pz/store/account/change-temporary-password', {
      token: temporaryToken,
      body: { currentPassword: password.adminTemp, newPassword: password.adminPersonal, newPasswordConfirm: password.adminPersonal },
    });
    assert.equal(forcedAdmin.status, 200, JSON.stringify(forcedAdmin.data));
    assert.deepEqual(forcedAdmin.data, {
      ok: true, code: 'forced_password_changed', must_change_password: false, reauth_required: true, sessions_revoked: true,
    });
    const oldRefresh = await request('/api/collections/users/auth-refresh', {
      token: temporaryToken, body: {}, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(oldRefresh.status, 401);
    const adminPersonalLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: createAdmin.data.user.email, password: password.adminPersonal }, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(adminPersonalLogin.status, 200);
    assert.equal(adminPersonalLogin.data.record.must_change_password, false);
    const voluntaryAdmin = await request('/api/pz/store/account/change-password', {
      token: adminPersonalLogin.data.token,
      body: { currentPassword: password.adminPersonal, newPassword: password.adminVoluntary, newPasswordConfirm: password.adminVoluntary },
    });
    assert.equal(voluntaryAdmin.status, 200);
    assert.equal(voluntaryAdmin.data.reauth_required, true);
    const adminAfterVoluntary = await request('/api/collections/users/auth-with-password', {
      body: { identity: createAdmin.data.user.email, password: password.adminVoluntary }, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(adminAfterVoluntary.status, 200);
    const selfRevoke = await request('/api/pz/store/account/revoke-sessions', { token: adminAfterVoluntary.data.token, body: {} });
    assert.equal(selfRevoke.status, 200);
    assert.equal(selfRevoke.data.reauth_required, true);
    const revokedSelfRefresh = await request('/api/collections/users/auth-refresh', {
      token: adminAfterVoluntary.data.token, body: {}, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(revokedSelfRefresh.status, 401);

    const deviceStaff = 'B'.repeat(43);
    const staffLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: createStaff.data.user.email, password: password.staffTemp }, headers: { 'X-PZ-Admin-Device': deviceStaff },
    });
    assert.equal(staffLogin.status, 200);
    const staffMasterEndpoint = await masterPost(staffLogin.data.token, 'detail', {
      store_id: premiumStore.id, user_id: createStaff.data.user.id,
    });
    assert.equal(staffMasterEndpoint.status, 403);
    const forcedStaff = await request('/api/pz/store/account/change-temporary-password', {
      token: staffLogin.data.token,
      body: { currentPassword: password.staffTemp, newPassword: password.staffPersonal, newPasswordConfirm: password.staffPersonal },
    });
    assert.equal(forcedStaff.status, 200);
    const staffPersonalLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: createStaff.data.user.email, password: password.staffPersonal }, headers: { 'X-PZ-Admin-Device': deviceStaff },
    });
    assert.equal(staffPersonalLogin.status, 200);
    const staffVoluntary = await request('/api/pz/store/account/change-password', {
      token: staffPersonalLogin.data.token,
      body: { currentPassword: password.staffPersonal, newPassword: 'Another-Staff!55', newPasswordConfirm: 'Another-Staff!55' },
    });
    assert.equal(staffVoluntary.status, 403);

    const masterRevokeStaff = await masterPost(masterToken, 'revoke-sessions', {
      store_id: premiumStore.id, user_id: createStaff.data.user.id, reason: 'Cierre de prueba U7I7',
    });
    assert.equal(masterRevokeStaff.status, 200);
    assert.equal(masterRevokeStaff.data.sessions_revoked, true);
    const staffRevokedRefresh = await request('/api/collections/users/auth-refresh', {
      token: staffPersonalLogin.data.token, body: {}, headers: { 'X-PZ-Admin-Device': deviceStaff },
    });
    assert.equal(staffRevokedRefresh.status, 401);

    const suspendStaff = await masterPost(masterToken, 'update', {
      store_id: premiumStore.id, user_id: createStaff.data.user.id, email: createStaff.data.user.email,
      display_name: 'Staff Temporal Actualizado', phone: '+1 555 0199', role: 'store_staff', status: 'suspended',
      reason: 'Suspensión de prueba U7I7',
    });
    assert.equal(suspendStaff.status, 200, JSON.stringify(suspendStaff.data));
    assert.equal(suspendStaff.data.user.status, 'suspended');
    assert.equal(suspendStaff.data.sessions_revoked, true);
    const suspendedStaffLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: createStaff.data.user.email, password: password.staffPersonal }, headers: { 'X-PZ-Admin-Device': deviceStaff },
    });
    assert.equal(suspendedStaffLogin.status, 400);
    const activateStaff = await masterPost(masterToken, 'update', {
      store_id: premiumStore.id, user_id: createStaff.data.user.id, email: createStaff.data.user.email,
      display_name: 'Staff Temporal Actualizado', phone: '+1 555 0199', role: 'store_staff', status: 'active',
      reason: 'Activación de prueba U7I7',
    });
    assert.equal(activateStaff.status, 200, JSON.stringify(activateStaff.data));
    assert.equal(activateStaff.data.user.status, 'active');
    const staffAfterActivation = await request('/api/collections/users/auth-with-password', {
      body: { identity: createStaff.data.user.email, password: password.staffPersonal }, headers: { 'X-PZ-Admin-Device': deviceStaff },
    });
    assert.equal(staffAfterActivation.status, 200);

    const lastBasicAdmin = await masterPost(masterToken, 'update', {
      store_id: basicStore.id, user_id: createBasicAdmin.data.user.id, email: createBasicAdmin.data.user.email,
      display_name: 'Basic Admin', phone: '', role: 'store_admin', status: 'suspended', reason: 'Prueba último admin',
    });
    assert.equal(lastBasicAdmin.status, 409);
    assert.equal(lastBasicAdmin.data.error, 'last_active_admin_required');

    const reset = await masterPost(masterToken, 'change-password', {
      store_id: premiumStore.id, user_id: createAdmin.data.user.id, password: password.resetTemp, reason: 'Recuperación U7I7',
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.data.temporary_password_issued, true);
    assert.equal(reset.data.sessions_revoked, true);
    assert.equal(JSON.stringify(reset.data).includes(password.resetTemp), false);
    const previousPermanent = await request('/api/collections/users/auth-with-password', {
      body: { identity: createAdmin.data.user.email, password: password.adminVoluntary }, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(previousPermanent.status, 400);
    const resetLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: createAdmin.data.user.email, password: password.resetTemp }, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(resetLogin.status, 200);
    const reissue = await masterPost(masterToken, 'change-password', {
      store_id: premiumStore.id, user_id: createAdmin.data.user.id, password: password.resetTempAgain, reason: 'Segunda recuperación U7I7',
    });
    assert.equal(reissue.status, 200);
    assert.equal(reissue.data.sessions_revoked, true);
    const previousTemporary = await request('/api/collections/users/auth-with-password', {
      body: { identity: createAdmin.data.user.email, password: password.resetTemp }, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(previousTemporary.status, 400);
    const reissuedOldRefresh = await request('/api/collections/users/auth-refresh', {
      token: resetLogin.data.token, body: {}, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(reissuedOldRefresh.status, 401);
    const resetLoginAgain = await request('/api/collections/users/auth-with-password', {
      body: { identity: createAdmin.data.user.email, password: password.resetTempAgain }, headers: { 'X-PZ-Admin-Device': deviceAdmin },
    });
    assert.equal(resetLoginAgain.status, 200);

    const list = await masterPost(masterToken, 'list', {
      store_id: premiumStore.id, page: 1, per_page: 10, search: 'admin temporal', role: 'store_admin', status: 'active',
    });
    assert.equal(list.status, 200);
    assert.equal(list.data.users.length, 1);
    assert.equal(list.data.users[0].last_admin_activity_at.length > 0, true);
    assert.equal(list.data.plan.max_active_users, 4);
    assert.equal(list.data.plan.max_devices_per_user, 5);
    assert.equal(list.data.plan.max_store_devices, 20);
    assert.equal(list.data.plan.store_authorized_device_count, 2);

    const paginated = await masterPost(masterToken, 'list', {
      store_id: premiumStore.id, page: 1, per_page: 1, search: '', role: 'all', status: 'all',
    });
    assert.equal(paginated.status, 200);
    assert.equal(paginated.data.users.length, 1);
    assert.equal(paginated.data.pagination.total_items, 2);
    assert.equal(paginated.data.pagination.total_pages, 2);
    const detail = await masterPost(masterToken, 'detail', { store_id: premiumStore.id, user_id: createAdmin.data.user.id });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.user.id, createAdmin.data.user.id);

    const isolated = await masterPost(masterToken, 'detail', { store_id: basicStore.id, user_id: createAdmin.data.user.id });
    assert.equal(isolated.status, 404);
    assert.equal(isolated.data.error, 'user_not_found');
    const adminMasterEndpoint = await masterPost(resetLoginAgain.data.token, 'detail', { store_id: premiumStore.id, user_id: createAdmin.data.user.id });
    assert.equal(adminMasterEndpoint.status, 403);

    const deviceList = await request('/api/pz/master/store-user-devices/list', {
      token: masterToken,
      body: { store_id: premiumStore.id, user_id: createAdmin.data.user.id, page: 1, per_page: 10, status: 'authorized' },
    });
    assert.equal(deviceList.status, 200, JSON.stringify(deviceList.data));
    assert.equal(deviceList.data.devices.length, 1);
    const serializedDevice = JSON.stringify(deviceList.data.devices[0]);
    for (const forbidden of ['device_digest', 'user_agent', 'ip', 'location']) assert.equal(serializedDevice.toLowerCase().includes(forbidden), false);

    const userAudit = await masterPost(masterToken, 'audit', { store_id: premiumStore.id, user_id: createAdmin.data.user.id, page: 1, per_page: 50 });
    assert.equal(userAudit.status, 200);
    const actions = userAudit.data.audit.map((item) => item.action);
    assert.equal(actions.includes('temporary_password_issued'), true);
    assert.equal(actions.includes('forced_password_changed'), true);
    const auditPayload = JSON.stringify(userAudit.data);
    for (const secret of Object.values(password)) assert.equal(auditPayload.includes(secret), false);

    const expired = await superCreate('users', {
      email: `${suffix}-expired@example.com`, password: password.expired, passwordConfirm: password.expired,
      role: 'store_staff', status: 'active', store: premiumStore.id, display_name: 'Expired User', emailVisibility: true,
    });
    ids.users.push(expired.id);
    const expiredSessionLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: expired.email, password: password.expired }, headers: { 'X-PZ-Admin-Device': 'C'.repeat(43) },
    });
    assert.equal(expiredSessionLogin.status, 200);
    const expireSession = await request(`/api/collections/users/records/${expired.id}`, {
      token: superToken,
      method: 'PATCH',
      body: { must_change_password: true, temporary_password_issued_at: '2020-01-01T00:00:00.000Z', temporary_password_expires_at: '2020-01-04T00:00:00.000Z' },
    });
    assert.equal(expireSession.status, 200);
    const expiredRefresh = await request('/api/collections/users/auth-refresh', {
      token: expiredSessionLogin.data.token, body: {}, headers: { 'X-PZ-Admin-Device': 'C'.repeat(43) },
    });
    assert.equal(expiredRefresh.status, 400);
    assert.equal(expiredRefresh.data.data.temporary_password_expired.code, 'temporary_password_expired');
    const expiredLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: expired.email, password: password.expired }, headers: { 'X-PZ-Admin-Device': 'C'.repeat(43) },
    });
    assert.equal(expiredLogin.status, 400);
    assert.equal(expiredLogin.data.data.temporary_password_expired.code, 'temporary_password_expired');

    const revokeDevice = await request('/api/pz/master/store-user-devices/revoke', {
      token: masterToken,
      body: { store_id: premiumStore.id, user_id: createAdmin.data.user.id, device_id: deviceList.data.devices[0].id, reason: 'Prueba revocación U7I7' },
    });
    assert.equal(revokeDevice.status, 200);
    assert.equal(revokeDevice.data.sessions_revoked_for_user, true);
    const revokeAgain = await request('/api/pz/master/store-user-devices/revoke', {
      token: masterToken,
      body: { store_id: premiumStore.id, user_id: createAdmin.data.user.id, device_id: deviceList.data.devices[0].id, reason: 'Repetida' },
    });
    assert.equal(revokeAgain.status, 200);
    assert.equal(revokeAgain.data.already_revoked, true);
    assert.equal(revokeAgain.data.sessions_revoked_for_user, false);
    const deviceAudit = await request('/api/pz/master/store-user-devices/audit', {
      token: masterToken,
      body: { store_id: premiumStore.id, user_id: createAdmin.data.user.id, page: 1, per_page: 50 },
    });
    assert.equal(deviceAudit.status, 200);
    assert.equal(deviceAudit.data.audit.filter((item) => item.action === 'device_revoked').length, 1);
  } finally {
    if (superToken) {
      for (const storeId of ids.stores) {
        for (const collection of ['store_user_device_audit', 'store_user_audit', 'store_user_devices']) {
          await deleteByFilter(collection, `store = "${storeId}"`);
        }
        await deleteByFilter('users', `store = "${storeId}"`);
        await request(`/api/collections/stores/records/${storeId}`, { token: superToken, method: 'DELETE' });
      }
      if (ids.master) await request(`/api/collections/users/records/${ids.master}`, { token: superToken, method: 'DELETE' });
    }
  }
});
