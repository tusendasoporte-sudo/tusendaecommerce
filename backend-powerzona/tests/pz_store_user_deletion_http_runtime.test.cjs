const assert = require('node:assert/strict');
const test = require('node:test');

const BASE_URL = String(process.env.PZ_U7I7_DELETE_BASE_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = process.env.PZ_U7I7_DELETE_SUPER_EMAIL || '';
const SUPER_PASSWORD = process.env.PZ_U7I7_DELETE_SUPER_PASSWORD || '';
const runtimeTest = BASE_URL && SUPER_EMAIL && SUPER_PASSWORD ? test : test.skip;

async function request(path, { token = '', body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
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

runtimeTest('U7I7F1D8 HTTP elimina fisicamente usuarios y preserva historial comercial', async () => {
  const suffix = unique('u7i7-delete');
  const password = {
    master: 'Master-Delete-Run!42',
    suspendedMaster: 'Master-Suspended!42',
    admin1: 'Admin-One-Temporary!42',
    admin2: 'Admin-Two-Temporary!42',
    staff: 'Staff-Temporary!42',
    staffSuspended: 'Staff-Suspended!42',
    otherAdmin: 'Other-Admin!42',
  };
  const ids = { stores: [], users: [], business: [], master: '', customer: '', notification: '' };
  let superToken = '';

  async function superCreate(collection, body) {
    const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
    assert.equal(result.status, 200, `${collection}: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async function superUpdate(collection, id, body) {
    const result = await request(`/api/collections/${collection}/records/${id}`, { token: superToken, body, method: 'PATCH' });
    assert.equal(result.status, 200, `${collection}: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async function masterPost(token, action, body) {
    return request(`/api/pz/master/store-users/${action}`, { token, body });
  }

  async function listByFilter(collection, filter) {
    return request(`/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`, { token: superToken });
  }

  async function deleteByFilter(collection, filter) {
    const list = await listByFilter(collection, filter);
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

    const storeA = await superCreate('stores', { name: `Delete A ${suffix}`, slug: `${suffix}-a`, status: 'active', plan: 'premium', plan_is_permanent: true });
    const storeB = await superCreate('stores', { name: `Delete B ${suffix}`, slug: `${suffix}-b`, status: 'active', plan: 'premium', plan_is_permanent: true });
    ids.stores.push(storeA.id, storeB.id);

    const master = await superCreate('users', {
      email: `${suffix}-master@example.com`, password: password.master, passwordConfirm: password.master,
      role: 'master_admin', status: 'active', display_name: 'Master Delete', emailVisibility: true,
    });
    ids.master = master.id;
    ids.users.push(master.id);
    const masterAuth = await request('/api/collections/users/auth-with-password', { body: { identity: master.email, password: password.master } });
    assert.equal(masterAuth.status, 200);
    const masterToken = masterAuth.data.token;

    for (const store of [storeA, storeB]) {
      const plan = await request('/api/pz/master/store-plan/change', {
        token: masterToken,
        body: { store_id: store.id, plan: 'premium', is_permanent: true, duration_months: 0, reason: 'Prueba eliminación' },
      });
      assert.equal(plan.status, 200, JSON.stringify(plan.data));
    }

    async function createUser(store, emailPrefix, pass, role, status = 'active') {
      const result = await masterPost(masterToken, 'create', {
        store_id: store.id,
        email: `${suffix}-${emailPrefix}@example.com`,
        password: pass,
        display_name: emailPrefix,
        phone: '+1 555 0100',
        role,
        status,
        reason: 'Fixture runtime eliminación',
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      ids.users.push(result.data.user.id);
      return result.data.user;
    }

    const adminA1 = await createUser(storeA, 'admin-a1', password.admin1, 'store_admin');
    const adminA2 = await createUser(storeA, 'admin-a2', password.admin2, 'store_admin');
    const staffA = await createUser(storeA, 'staff-a', password.staff, 'store_staff');
    const suspendedStaffA = await createUser(storeA, 'staff-suspended-a', password.staffSuspended, 'store_staff', 'suspended');
    const adminB = await createUser(storeB, 'admin-b', password.otherAdmin, 'store_admin');

    const publicDelete = await masterPost('', 'delete', {
      store_id: storeA.id, user_id: staffA.id, confirmation_email: staffA.email, reason: 'Público',
    });
    assert.equal(publicDelete.status, 403);

    const staffDevice = 'D'.repeat(43);
    const staffLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: staffA.email, password: password.staff },
      headers: { 'X-PZ-Admin-Device': staffDevice },
    });
    assert.equal(staffLogin.status, 200, JSON.stringify(staffLogin.data));
    const staffForbidden = await masterPost(staffLogin.data.token, 'delete', {
      store_id: storeA.id, user_id: suspendedStaffA.id, confirmation_email: suspendedStaffA.email, reason: 'Sin permiso',
    });
    assert.equal(staffForbidden.status, 403);

    const adminLogin = await request('/api/collections/users/auth-with-password', {
      body: { identity: adminA1.email, password: password.admin1 },
      headers: { 'X-PZ-Admin-Device': 'E'.repeat(43) },
    });
    assert.equal(adminLogin.status, 200);
    const adminForbidden = await masterPost(adminLogin.data.token, 'delete', {
      store_id: storeA.id, user_id: staffA.id, confirmation_email: staffA.email, reason: 'Sin permiso',
    });
    assert.equal(adminForbidden.status, 403);

    const suspendedMaster = await superCreate('users', {
      email: `${suffix}-master-suspended@example.com`, password: password.suspendedMaster, passwordConfirm: password.suspendedMaster,
      role: 'master_admin', status: 'active', display_name: 'Master Suspendido', emailVisibility: true,
    });
    ids.users.push(suspendedMaster.id);
    const suspendedMasterAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: suspendedMaster.email, password: password.suspendedMaster },
    });
    assert.equal(suspendedMasterAuth.status, 200);
    await superUpdate('users', suspendedMaster.id, { status: 'suspended' });
    const suspendedMasterForbidden = await masterPost(suspendedMasterAuth.data.token, 'delete', {
      store_id: storeA.id, user_id: staffA.id, confirmation_email: staffA.email, reason: 'Sin permiso',
    });
    assert.equal(suspendedMasterForbidden.status, 403);

    const injected = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: staffA.id, confirmation_email: staffA.email, reason: 'Motivo', payload: {},
    });
    assert.equal(injected.status, 400);
    assert.equal(injected.data.error, 'invalid_payload');
    const wrongEmail = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: staffA.id, confirmation_email: 'otro@example.com', reason: 'Motivo',
    });
    assert.equal(wrongEmail.status, 400);
    assert.equal(wrongEmail.data.error, 'delete_confirmation_mismatch');
    const missingReason = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: staffA.id, confirmation_email: staffA.email, reason: '   ',
    });
    assert.equal(missingReason.status, 400);
    assert.equal(missingReason.data.error, 'delete_reason_required');
    const crossStore = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: adminB.id, confirmation_email: adminB.email, reason: 'Cruce',
    });
    assert.equal(crossStore.status, 404);
    assert.equal(crossStore.data.error, 'user_not_found');
    const masterTarget = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: master.id, confirmation_email: master.email, reason: 'Master',
    });
    assert.equal(masterTarget.status, 404);
    assert.equal(masterTarget.data.error, 'user_not_found');

    const customer = await superCreate('store_customers', {
      store: storeA.id,
      display_name: 'Cliente conservado',
      phone_normalized: `${Date.now()}`.slice(-10),
      status: 'normal',
      archived: true,
      archived_by: staffA.id,
    });
    ids.customer = customer.id;
    const currency = await superCreate('currencies', {
      code: `T${suffix.slice(-5).toUpperCase()}`,
      name: 'Moneda runtime',
      symbol: '$',
      exchange_rate: 1,
      active: true,
      store: storeA.id,
    });
    ids.business.push(['currencies', currency.id]);
    const category = await superCreate('categories', {
      name: 'Categoría conservada', slug: `${suffix}-category`, active: true, store: storeA.id,
    });
    ids.business.push(['categories', category.id]);
    const product = await superCreate('products', {
      name: 'Producto conservado', slug: `${suffix}-product`, category: category.id,
      base_price_usd: 15, stock: 4, active: true, delivery_mode: 'pickup', store: storeA.id,
    });
    ids.business.push(['products', product.id]);
    const order = await superCreate('orders', {
      order_number: `ORD-${suffix}`,
      customer_name: 'Cliente conservado',
      customer_phone: customer.phone_normalized,
      currency: currency.id,
      subtotal: 15,
      total: 15,
      usd_total: 15,
      delivery_method: 'pickup',
      status: 'pending',
      store: storeA.id,
      customer: customer.id,
    });
    ids.business.push(['orders', order.id]);
    const review = await superCreate('reviews', {
      store: storeA.id, type: 'product', product: product.id, order: order.id,
      rating: 5, customer_name: 'Cliente conservado', comment: 'Historial conservado',
      status: 'approved', source: 'order_review_link', verified_purchase: true,
    });
    ids.business.push(['reviews', review.id]);
    const raffle = await superCreate('raffles', {
      store: storeA.id, title: 'Rifa conservada', slug: `${suffix}-raffle`, status: 'draft',
    });
    ids.business.push(['raffles', raffle.id]);
    const analytics = await superCreate('store_analytics_events', {
      store: storeA.id, day: new Date().toISOString().slice(0, 10), visitor_id: `${suffix}-visitor`,
      page_type: 'product', entity_type: 'product', entity_id: product.id, path: `/producto/${product.slug}`,
    });
    ids.business.push(['store_analytics_events', analytics.id]);
    const now = Date.now();
    const notification = await superCreate('master_notifications', {
      recipient: staffA.id,
      type: 'runtime_test',
      category: 'runtime',
      store: storeA.id,
      title: 'Referencia requerida temporal',
      message: 'Fuerza rollback seguro',
      tone: 'normal',
      status: 'unread',
      event_count: 1,
      first_event_at: new Date(now).toISOString(),
      last_event_at: new Date(now).toISOString(),
      expires_at: new Date(now + 86_400_000).toISOString(),
    });
    ids.notification = notification.id;

    const auditBeforeRollback = await listByFilter('store_user_audit', `target_user_id_snapshot="${staffA.id}" && action="user_deleted"`);
    const deviceBeforeRollback = await listByFilter('store_user_devices', `user="${staffA.id}"`);
    assert.equal(deviceBeforeRollback.data.totalItems, 1);
    const blockedRequiredRelation = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: staffA.id, confirmation_email: staffA.email, reason: 'Debe revertir',
    });
    assert.equal(blockedRequiredRelation.status, 500);
    assert.equal(blockedRequiredRelation.data.error, 'user_delete_failed');
    const userAfterRollback = await request(`/api/collections/users/records/${staffA.id}`, { token: superToken });
    assert.equal(userAfterRollback.status, 200);
    const deviceAfterRollback = await listByFilter('store_user_devices', `user="${staffA.id}"`);
    assert.equal(deviceAfterRollback.data.totalItems, 1);
    const auditAfterRollback = await listByFilter('store_user_audit', `target_user_id_snapshot="${staffA.id}" && action="user_deleted"`);
    assert.equal(auditAfterRollback.data.totalItems, auditBeforeRollback.data.totalItems);

    await request(`/api/collections/master_notifications/records/${notification.id}`, { token: superToken, method: 'DELETE' });
    ids.notification = '';
    const deleteStaff = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: staffA.id, confirmation_email: staffA.email, reason: 'Borrado Staff runtime',
    });
    assert.equal(deleteStaff.status, 200, JSON.stringify(deleteStaff.data));
    assert.deepEqual(deleteStaff.data, { ok: true, user_deleted: true, user_id: staffA.id, sessions_revoked: true });
    assert.equal(JSON.stringify(deleteStaff.data).includes(staffA.email), false);
    assert.equal(JSON.stringify(deleteStaff.data).includes(password.staff), false);

    const deletedUser = await request(`/api/collections/users/records/${staffA.id}`, { token: superToken });
    assert.equal(deletedUser.status === 404 || (deletedUser.status === 200 && deletedUser.data === null), true);
    const deletedUserList = await listByFilter('users', `id="${staffA.id}"`);
    assert.equal(deletedUserList.data.totalItems, 0);
    const loginAfterDelete = await request('/api/collections/users/auth-with-password', {
      body: { identity: staffA.email, password: password.staff }, headers: { 'X-PZ-Admin-Device': staffDevice },
    });
    assert.notEqual(loginAfterDelete.status, 200);
    const refreshAfterDelete = await request('/api/collections/users/auth-refresh', {
      token: staffLogin.data.token, body: {}, headers: { 'X-PZ-Admin-Device': staffDevice },
    });
    assert.equal(refreshAfterDelete.status, 401);
    const devicesAfterDelete = await listByFilter('store_user_devices', `user="${staffA.id}"`);
    assert.equal(devicesAfterDelete.data.totalItems, 0);
    const deletionAudits = await listByFilter('store_user_audit', `target_user_id_snapshot="${staffA.id}" && action="user_deleted"`);
    assert.equal(deletionAudits.data.totalItems, 1);
    const deletionAudit = deletionAudits.data.items[0];
    assert.equal(deletionAudit.target_user, '');
    assert.equal(deletionAudit.previous_email, staffA.email);
    assert.equal(deletionAudit.previous_display_name, staffA.display_name);
    assert.equal(deletionAudit.previous_role, 'store_staff');
    assert.equal(deletionAudit.previous_status, 'active');
    assert.equal(deletionAudit.sessions_revoked, true);
    for (const secret of [password.staff, staffDevice]) assert.equal(JSON.stringify(deletionAudit).includes(secret), false);
    const customerAfterDelete = await request(`/api/collections/store_customers/records/${customer.id}`, { token: superToken });
    assert.equal(customerAfterDelete.status, 200);
    assert.equal(customerAfterDelete.data.archived_by, '');
    assert.equal(customerAfterDelete.data.display_name, 'Cliente conservado');
    for (const [collection, id] of ids.business) {
      const preserved = await listByFilter(collection, `id="${id}"`);
      assert.equal(preserved.status, 200, collection);
      assert.equal(preserved.data.totalItems, 1, collection);
    }

    const deleteSuspendedStaff = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: suspendedStaffA.id, confirmation_email: suspendedStaffA.email, reason: 'Borrado Staff suspendido',
    });
    assert.equal(deleteSuspendedStaff.status, 200);

    const lastAdminBlocked = await masterPost(masterToken, 'delete', {
      store_id: storeB.id, user_id: adminB.id, confirmation_email: adminB.email, reason: 'Último Admin',
    });
    assert.equal(lastAdminBlocked.status, 409);
    assert.equal(lastAdminBlocked.data.error, 'last_active_admin_required');
    const adminBStillExists = await request(`/api/collections/users/records/${adminB.id}`, { token: superToken });
    assert.equal(adminBStillExists.status, 200);
    const adminBDeletionAudits = await listByFilter('store_user_audit', `target_user_id_snapshot="${adminB.id}" && action="user_deleted"`);
    assert.equal(adminBDeletionAudits.data.totalItems, 0);

    const deleteAdminWithReplacement = await masterPost(masterToken, 'delete', {
      store_id: storeA.id, user_id: adminA1.id, confirmation_email: adminA1.email, reason: 'Queda otro Administrador',
    });
    assert.equal(deleteAdminWithReplacement.status, 200);
    const detailRemainingAdmin = await masterPost(masterToken, 'detail', { store_id: storeA.id, user_id: adminA2.id });
    assert.equal(detailRemainingAdmin.status, 200);
    assert.equal(detailRemainingAdmin.data.plan.active_admins, 1);
    assert.equal(detailRemainingAdmin.data.user.id, adminA2.id);
  } finally {
    if (superToken) {
      if (ids.notification) await request(`/api/collections/master_notifications/records/${ids.notification}`, { token: superToken, method: 'DELETE' });
      for (const [collection, id] of ids.business.reverse()) {
        await request(`/api/collections/${collection}/records/${id}`, { token: superToken, method: 'DELETE' });
      }
      if (ids.customer) await request(`/api/collections/store_customers/records/${ids.customer}`, { token: superToken, method: 'DELETE' });
      for (const storeId of ids.stores) {
        for (const collection of ['store_user_device_audit', 'store_user_audit', 'store_plan_audit']) {
          await deleteByFilter(collection, `store_id_snapshot="${storeId}"`);
        }
        await deleteByFilter('store_user_devices', `store="${storeId}"`);
      }
      for (const userId of ids.users.reverse()) {
        await request(`/api/collections/users/records/${userId}`, { token: superToken, method: 'DELETE' });
      }
      for (const storeId of ids.stores.reverse()) {
        await request(`/api/collections/stores/records/${storeId}`, { token: superToken, method: 'DELETE' });
      }
    }
  }
});
