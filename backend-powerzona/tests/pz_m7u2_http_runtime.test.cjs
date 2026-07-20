const assert = require('node:assert/strict');
const test = require('node:test');

const permissionCatalog = require('../pb_hooks/pz_store_team_permissions_lib.js');

const BASE_URL = String(process.env.PZ_M7U2_BASE_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = String(process.env.PZ_M7U2_SUPER_EMAIL || '');
const SUPER_PASSWORD = String(process.env.PZ_M7U2_SUPER_PASSWORD || '');
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(BASE_URL);
const SKIP_REASON = !BASE_URL || !SUPER_EMAIL || !SUPER_PASSWORD
  ? 'requiere PZ_M7U2_BASE_URL, PZ_M7U2_SUPER_EMAIL y PZ_M7U2_SUPER_PASSWORD'
  : !IS_LOCAL
    ? 'PZ_M7U2_BASE_URL debe apuntar a localhost, 127.0.0.1 o ::1'
    : false;

async function request(path, { token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return {
    status: response.status,
    data,
    raw,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function assertStatus(result, expected, label) {
  assert.equal(result.status, expected, `${label}: HTTP ${result.status} ${result.raw}`);
}

test('M7U2 HTTP runtime valida equipo, permisos, cuota, aislamiento, plan y V7E9', { skip: SKIP_REASON }, async () => {
  const stamp = Date.now();
  const prefix = `M7U2QA_${stamp}`;
  const slugPrefix = `m7u2qa-${stamp}`;
  const ids = Object.fromEntries([
    'products', 'store_user_access', 'store_user_audit', 'store_user_devices',
    'store_user_device_audit', 'store_plan_audit', 'product_expiration_cycles',
    'store_notifications', 'users', 'stores',
  ].map((collection) => [collection, []]));
  const passwords = {
    master: 'M7U2QA-Master-Local-2026!',
    primaryA: 'M7U2QA-Primary-A-Local-2026!',
    primaryB: 'M7U2QA-Primary-B-Local-2026!',
  };
  let superToken = '';
  let masterToken = '';
  let primaryAToken = '';
  let primaryBToken = '';
  let failure = null;

  async function create(collection, body) {
    const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
    assertStatus(result, 200, `crear ${collection}`);
    if (ids[collection]) ids[collection].push(result.data.id);
    return result.data;
  }

  async function patch(collection, id, body, token = superToken) {
    return request(`/api/collections/${collection}/records/${id}`, {
      token,
      method: 'PATCH',
      body,
    });
  }

  async function list(collection, filter = '') {
    const query = new URLSearchParams({ page: '1', perPage: '500' });
    if (filter) query.set('filter', filter);
    const result = await request(`/api/collections/${collection}/records?${query}`, { token: superToken });
    assertStatus(result, 200, `listar ${collection}`);
    return result.data?.items || [];
  }

  async function listMaybe(collection, filter = '') {
    const query = new URLSearchParams({ page: '1', perPage: '500' });
    if (filter) query.set('filter', filter);
    const result = await request(`/api/collections/${collection}/records?${query}`, { token: superToken });
    return result.status === 200 ? result.data?.items || [] : [];
  }

  async function remove(collection, id) {
    const result = await request(`/api/collections/${collection}/records/${id}`, {
      token: superToken,
      method: 'DELETE',
    });
    assert.ok([204, 404].includes(result.status), `eliminar ${collection}/${id}: ${result.raw}`);
  }

  async function removeByFilter(collection, filter) {
    const rows = await listMaybe(collection, filter);
    for (const row of rows) await remove(collection, row.id);
  }

  async function login(email, password, device = '') {
    return request('/api/collections/users/auth-with-password', {
      body: { identity: email, password },
      headers: device ? { 'X-PZ-Admin-Device': device } : {},
    });
  }

  async function refresh(token, device = '') {
    return request('/api/collections/users/auth-refresh', {
      token,
      body: {},
      headers: device ? { 'X-PZ-Admin-Device': device } : {},
    });
  }

  async function team(token, action, body) {
    return request(`/api/pz/store/team/${action}`, { token, body });
  }

  async function accessContext(token) {
    return request('/api/pz/store/access/context', { token, body: {} });
  }

  async function changePlan(storeId, plan, confirmExpirationCleanup = false) {
    return request('/api/pz/master/store-plan/change', {
      token: masterToken,
      body: {
        store_id: storeId,
        plan,
        is_permanent: plan !== 'free',
        duration_months: 0,
        reason: `${prefix} cambio de plan`,
        confirm_expiration_cleanup: confirmExpirationCleanup,
      },
    });
  }

  async function createTeamUser(primaryToken, suffix, templateCode, selectedPermissions) {
    const result = await team(primaryToken, 'create', {
      email: `${slugPrefix}-${suffix}@example.test`,
      display_name: `${prefix} ${suffix}`,
      phone: '+1 555 0100',
      template_code: templateCode,
      permissions: selectedPermissions,
      reason: `${prefix} alta ${suffix}`,
    });
    assertStatus(result, 200, `crear miembro ${suffix}`);
    assert.equal(typeof result.data.temporary_password, 'string');
    assert.ok(result.data.temporary_password.length >= 20);
    ids.users.push(result.data.user.id);
    return {
      user: result.data.user,
      password: result.data.temporary_password,
      expiresAt: result.data.temporary_password_expires_at,
    };
  }

  try {
    const superAuth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    assertStatus(superAuth, 200, 'autenticar superuser');
    superToken = superAuth.data.token;

    const storeA = await create('stores', {
      name: `${prefix} Tienda A`,
      slug: `${slugPrefix}-a`,
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });
    const storeB = await create('stores', {
      name: `${prefix} Tienda B`,
      slug: `${slugPrefix}-b`,
      status: 'active',
      plan: 'premium',
      plan_started_at: new Date().toISOString(),
      plan_expires_at: '',
      plan_duration_months: 0,
      plan_is_permanent: true,
    });

    const master = await create('users', {
      email: `${slugPrefix}-master@example.test`,
      password: passwords.master,
      passwordConfirm: passwords.master,
      display_name: `${prefix} Master`,
      role: 'master_admin',
      status: 'active',
      emailVisibility: true,
    });
    const primaryA = await create('users', {
      email: `${slugPrefix}-primary-a@example.test`,
      password: passwords.primaryA,
      passwordConfirm: passwords.primaryA,
      display_name: `${prefix} Principal A`,
      role: 'store_admin',
      status: 'active',
      store: storeA.id,
      emailVisibility: true,
    });
    const primaryB = await create('users', {
      email: `${slugPrefix}-primary-b@example.test`,
      password: passwords.primaryB,
      passwordConfirm: passwords.primaryB,
      display_name: `${prefix} Principal B`,
      role: 'store_admin',
      status: 'active',
      store: storeB.id,
      emailVisibility: true,
    });

    const masterAuth = await login(master.email, passwords.master);
    assertStatus(masterAuth, 200, 'login Master');
    masterToken = masterAuth.data.token;
    for (const store of [storeA, storeB]) {
      const premiumPlan = await changePlan(store.id, 'premium', false);
      assertStatus(premiumPlan, 200, `activar Premium ${store.id}`);
      assert.equal(premiumPlan.data.plan.plan, 'premium');
    }
    for (const [store, primary] of [[storeA, primaryA], [storeB, primaryB]]) {
      const assigned = await request('/api/pz/master/primary-admin/assign', {
        token: masterToken,
        body: {
          store_id: store.id,
          user_id: primary.id,
          reason: `${prefix} asignación principal`,
        },
      });
      assertStatus(assigned, 200, `asignar principal ${store.id}`);
      assert.equal(assigned.data.primary_admin.id, primary.id);
      assert.equal(assigned.data.state, 'configured');
    }

    const freePlan = await changePlan(storeB.id, 'free', true);
    assertStatus(freePlan, 200, 'activar Free en tienda B');
    assert.equal(freePlan.data.plan.plan, 'free');

    const primaryBAuth = await login(primaryB.email, passwords.primaryB, 'I'.repeat(43));
    assertStatus(primaryBAuth, 200, 'login principal Free B');
    primaryBToken = primaryBAuth.data.token;
    const freeSummary = await team(primaryBToken, 'summary', {});
    assertStatus(freeSummary, 200, 'resumen Free');
    assert.equal(freeSummary.data.plan.code, 'free');
    assert.equal(freeSummary.data.plan.max_active_users, 1);
    assert.equal(freeSummary.data.plan.product_expiration_tools_enabled, false);
    assert.equal(freeSummary.data.user_counts.active, 1);
    assert.equal(freeSummary.data.user_counts.stored_active, 1);
    assert.equal(freeSummary.data.user_counts.available, 0);
    assert.equal(freeSummary.data.can_create, false);

    const primaryAAuth = await login(primaryA.email, passwords.primaryA, 'A'.repeat(43));
    assertStatus(primaryAAuth, 200, 'login principal A');
    primaryAToken = primaryAAuth.data.token;

    const primaryContext = await accessContext(primaryAToken);
    assertStatus(primaryContext, 200, 'contexto principal');
    assert.equal(primaryContext.data.access.is_primary_admin, true);
    assert.equal(primaryContext.data.access.permissions.includes('team.manage'), true);
    assert.equal(primaryContext.data.access.permissions.includes('plan.manage'), true);
    assert.match(primaryContext.headers['cache-control'] || '', /no-store/);

    const initialSummary = await team(primaryAToken, 'summary', {});
    assertStatus(initialSummary, 200, 'resumen inicial');
    assert.equal(initialSummary.data.primary_admin.id, primaryA.id);
    assert.equal(initialSummary.data.user_counts.active, 1);
    assert.equal(initialSummary.data.user_counts.available, 3);

    const forgedStore = await team(primaryAToken, 'summary', { store_id: storeB.id });
    assertStatus(forgedStore, 400, 'rechazar store_id controlado por cliente');
    assert.equal(forgedStore.data.error, 'invalid_payload');

    const protectedPrimary = await team(primaryAToken, 'detail', { user_id: primaryA.id });
    assertStatus(protectedPrimary, 409, 'proteger principal');
    assert.equal(protectedPrimary.data.error, 'primary_admin_protected');

    const expirationPermissions = permissionCatalog.normalizePermissions([
      'catalog.products.edit',
      'catalog.expirations.manage',
    ]);
    const memberA = await createTeamUser(primaryAToken, 'catalogo', 'custom', expirationPermissions);
    const memberB = await createTeamUser(
      primaryAToken,
      'lectura',
      'read_only',
      permissionCatalog.resolveTemplatePermissions('read_only'),
    );
    const ordersPermissions = permissionCatalog.resolveTemplatePermissions('orders_shipping');
    const concurrentCreates = await Promise.all(['pedidos-a', 'pedidos-b'].map((suffix) => team(primaryAToken, 'create', {
      email: `${slugPrefix}-${suffix}@example.test`,
      display_name: `${prefix} ${suffix}`,
      phone: '+1 555 0102',
      template_code: 'orders_shipping',
      permissions: ordersPermissions,
      reason: `${prefix} carrera de ultimo cupo`,
    })));
    const successfulCreates = concurrentCreates.filter((result) => result.status === 200);
    const rejectedCreates = concurrentCreates.filter((result) => result.status === 409);
    for (const result of successfulCreates) {
      if (result.data?.user?.id) ids.users.push(result.data.user.id);
    }
    assert.equal(successfulCreates.length, 1, `solo una alta concurrente debe tomar el ultimo cupo: ${concurrentCreates.map((result) => `${result.status}:${result.raw}`).join(' | ')}`);
    assert.equal(rejectedCreates.length, 1, `una alta concurrente debe rechazarse por cupo: ${concurrentCreates.map((result) => `${result.status}:${result.raw}`).join(' | ')}`);
    assert.equal(rejectedCreates[0].data.error, 'active_user_limit_reached');
    const memberC = {
      user: successfulCreates[0].data.user,
      password: successfulCreates[0].data.temporary_password,
      expiresAt: successfulCreates[0].data.temporary_password_expires_at,
    };
    assert.equal(typeof memberC.password, 'string');
    assert.ok(memberC.password.length >= 20);
    const concurrentSummary = await team(primaryAToken, 'summary', {});
    assertStatus(concurrentSummary, 200, 'resumen tras carrera de cupo');
    assert.equal(concurrentSummary.data.user_counts.stored_active, 4);
    assert.equal(concurrentSummary.data.user_counts.active, 4);

    const overQuota = await team(primaryAToken, 'create', {
      email: `${slugPrefix}-sobre-cupo@example.test`,
      display_name: `${prefix} Sobre cupo`,
      phone: '',
      template_code: 'custom',
      permissions: [],
      reason: `${prefix} cupo`,
    });
    assertStatus(overQuota, 409, 'cuota Premium de cuatro activos');
    assert.equal(overQuota.data.error, 'active_user_limit_reached');

    const listResult = await team(primaryAToken, 'list', {});
    assertStatus(listResult, 200, 'listar equipo');
    assert.equal(listResult.data.users.length, 4);
    assert.equal(listResult.data.users[0].is_primary_admin, true);
    assert.equal(listResult.data.user_counts.active, 4);
    const listJson = JSON.stringify(listResult.data);
    for (const secret of [memberA.password, memberB.password, memberC.password]) {
      assert.equal(listJson.includes(secret), false);
    }

    const detailA = await team(primaryAToken, 'detail', { user_id: memberA.user.id });
    assertStatus(detailA, 200, 'detalle propio');
    assert.deepEqual(detailA.data.user.permissions, expirationPermissions.slice().sort());
    const isolatedDetail = await team(primaryAToken, 'detail', { user_id: primaryB.id });
    assertStatus(isolatedDetail, 404, 'aislamiento de detalle');
    assert.equal(isolatedDetail.data.error, 'user_not_found');

    const memberDeviceA = 'C'.repeat(43);
    let memberAAuth = await login(memberA.user.email, memberA.password, memberDeviceA);
    assertStatus(memberAAuth, 200, 'login miembro A');
    let memberAToken = memberAAuth.data.token;
    const memberContext = await accessContext(memberAToken);
    assertStatus(memberContext, 200, 'contexto miembro A');
    assert.equal(memberContext.data.access.is_primary_admin, false);
    assert.deepEqual(memberContext.data.access.permissions, expirationPermissions.slice().sort());
    assert.equal(memberContext.data.access.permissions.includes('team.manage'), false);

    const memberSummary = await team(memberAToken, 'summary', {});
    assertStatus(memberSummary, 403, 'miembro no administra equipo');
    assert.equal(memberSummary.data.error, 'permission_denied');
    const privateAccess = await request('/api/collections/store_user_access/records?perPage=20', { token: memberAToken });
    assert.ok([403, 404].includes(privateAccess.status), `store_user_access privado: ${privateAccess.raw}`);
    const deleteRoute = await team(primaryAToken, 'delete', { user_id: memberA.user.id });
    assertStatus(deleteRoute, 404, 'sin borrado fisico');

    const productA = await create('products', {
      store: storeA.id,
      name: `${prefix} Producto A`,
      slug: `${slugPrefix}-product-a`,
      base_price_usd: 10,
      regular_price_usd: 10,
      stock: 5,
      active: true,
      delivery_mode: 'both',
    });
    const productB = await create('products', {
      store: storeB.id,
      name: `${prefix} Producto B`,
      slug: `${slugPrefix}-product-b`,
      base_price_usd: 10,
      regular_price_usd: 10,
      stock: 5,
      active: true,
      delivery_mode: 'both',
    });

    const expirationWrite = await patch('products', productA.id, { expiration_date: '2099-12-30' }, memberAToken);
    assertStatus(expirationWrite, 200, 'V7E9 permitido por capacidad y permiso');
    const freeExpiration = await patch('products', productB.id, { expiration_date: '2099-12-30' }, primaryBToken);
    assertStatus(freeExpiration, 403, 'V7E9 bloqueado por plan Free');
    assert.match(freeExpiration.raw, /expiration_premium_required|permission_denied/);
    const crossWrite = await patch('products', productB.id, { expiration_date: '2099-12-30' }, memberAToken);
    assert.notEqual(crossWrite.status, 200, `V7E9 cross-tenant fue permitido: ${crossWrite.raw}`);
    const reparentForeign = await patch('products', productB.id, {
      store: storeA.id,
      name: `${prefix} Producto B reparentado`,
    }, memberAToken);
    assertStatus(reparentForeign, 404, 'reparent de recurso ajeno permanece oculto');
    const untouchedB = await request(`/api/collections/products/records/${productB.id}`, { token: superToken });
    assertStatus(untouchedB, 200, 'verificar producto B');
    assert.equal(untouchedB.data.store, storeB.id);
    assert.equal(untouchedB.data.name, `${prefix} Producto B`);
    assert.equal(String(untouchedB.data.expiration_date || ''), '');

    const updateWithoutExpiration = await team(primaryAToken, 'update', {
      user_id: memberA.user.id,
      email: memberA.user.email,
      display_name: `${prefix} Catálogo sin vencimientos`,
      phone: '+1 555 0101',
      template_code: 'custom',
      permissions: ['catalog.products.edit'],
      reason: `${prefix} retirar vencimientos`,
    });
    assertStatus(updateWithoutExpiration, 200, 'actualizar permisos');
    assert.equal(updateWithoutExpiration.data.sessions_revoked, true);
    assertStatus(await refresh(memberAToken, memberDeviceA), 401, 'actualizacion revoca token');
    memberAAuth = await login(memberA.user.email, memberA.password, memberDeviceA);
    assertStatus(memberAAuth, 200, 'relogin tras actualizar');
    memberAToken = memberAAuth.data.token;
    const deniedExpiration = await patch('products', productA.id, { expiration_date: '2099-12-31' }, memberAToken);
    assertStatus(deniedExpiration, 403, 'V7E9 denegado sin permiso');
    assert.match(deniedExpiration.raw, /permission_denied/);

    const restoreExpiration = await team(primaryAToken, 'update', {
      user_id: memberA.user.id,
      email: memberA.user.email,
      display_name: `${prefix} Catálogo`,
      phone: '+1 555 0102',
      template_code: 'custom',
      permissions: expirationPermissions,
      reason: `${prefix} restaurar vencimientos`,
    });
    assertStatus(restoreExpiration, 200, 'restaurar permiso V7E9');

    const memberBAuth = await login(memberB.user.email, memberB.password, 'B'.repeat(43));
    assertStatus(memberBAuth, 200, 'login miembro B');
    const suspendB = await team(primaryAToken, 'suspend', {
      user_id: memberB.user.id,
      reason: `${prefix} suspender`,
    });
    assertStatus(suspendB, 200, 'suspender miembro');
    assert.equal(suspendB.data.sessions_revoked, true);
    const suspendedLogin = await login(memberB.user.email, memberB.password, 'B'.repeat(43));
    assert.ok([400, 401, 403].includes(suspendedLogin.status), `login suspendido: ${suspendedLogin.raw}`);
    const replacement = await createTeamUser(
      primaryAToken,
      'reemplazo',
      'read_only',
      permissionCatalog.resolveTemplatePermissions('read_only'),
    );
    const reactivateAtCapacity = await team(primaryAToken, 'reactivate', {
      user_id: memberB.user.id,
      reason: `${prefix} reactivar sin cupo`,
    });
    assertStatus(reactivateAtCapacity, 409, 'reactivar miembro con cuota Premium llena');
    assert.equal(reactivateAtCapacity.data.error, 'active_user_limit_reached');
    const suspendReplacement = await team(primaryAToken, 'suspend', {
      user_id: replacement.user.id,
      reason: `${prefix} liberar cupo del reemplazo`,
    });
    assertStatus(suspendReplacement, 200, 'suspender reemplazo para liberar cupo');
    const reactivateB = await team(primaryAToken, 'reactivate', {
      user_id: memberB.user.id,
      reason: `${prefix} reactivar con cupo liberado`,
    });
    assertStatus(reactivateB, 200, 'reactivar miembro');
    const replacementSummary = await team(primaryAToken, 'summary', {});
    assertStatus(replacementSummary, 200, 'resumen tras reemplazo y reactivacion');
    assert.equal(replacementSummary.data.user_counts.active, 4);
    assert.equal(replacementSummary.data.user_counts.stored_active, 4);
    assert.equal(replacementSummary.data.user_counts.suspended, 1);
    assert.equal(JSON.stringify(replacementSummary.data).includes(replacement.password), false);

    const freshAccess = await team(primaryAToken, 'issue-temporary-access', {
      user_id: memberA.user.id,
      reason: `${prefix} temporal`,
    });
    assertStatus(freshAccess, 200, 'emitir acceso temporal');
    assert.equal(freshAccess.data.sessions_revoked, true);
    assert.ok(freshAccess.data.temporary_password.length >= 20);
    assert.notEqual(freshAccess.data.temporary_password, memberA.password);
    assert.ok(new Date(freshAccess.data.temporary_password_expires_at).getTime() > Date.now());
    const oldPasswordLogin = await login(memberA.user.email, memberA.password, 'D'.repeat(43));
    assert.ok([400, 401].includes(oldPasswordLogin.status), `contraseña anterior: ${oldPasswordLogin.raw}`);
    memberA.password = freshAccess.data.temporary_password;
    memberAAuth = await login(memberA.user.email, memberA.password, 'D'.repeat(43));
    assertStatus(memberAAuth, 200, 'login con temporal nueva');
    memberAToken = memberAAuth.data.token;

    const revokeSessions = await team(primaryAToken, 'revoke-sessions', {
      user_id: memberA.user.id,
      reason: `${prefix} revocar sesiones`,
    });
    assertStatus(revokeSessions, 200, 'revocar sesiones');
    assert.equal(revokeSessions.data.sessions_revoked, true);
    assertStatus(await refresh(memberAToken, 'D'.repeat(43)), 401, 'sesion revocada');

    const deviceE = 'E'.repeat(43);
    memberAAuth = await login(memberA.user.email, memberA.password, deviceE);
    assertStatus(memberAAuth, 200, 'login para revocar dispositivos');
    memberAToken = memberAAuth.data.token;
    const detailWithDevice = await team(primaryAToken, 'detail', { user_id: memberA.user.id });
    assertStatus(detailWithDevice, 200, 'detalle con dispositivo');
    assert.ok(detailWithDevice.data.user.authorized_device_count >= 1);
    const revokeDevices = await team(primaryAToken, 'revoke-devices', {
      user_id: memberA.user.id,
      reason: `${prefix} revocar dispositivos`,
    });
    assertStatus(revokeDevices, 200, 'revocar dispositivos');
    assert.ok(revokeDevices.data.devices_revoked >= 1);
    assert.equal(revokeDevices.data.sessions_revoked, true);
    assertStatus(await refresh(memberAToken, deviceE), 401, 'revocar dispositivos invalida sesion');

    const audit = await team(primaryAToken, 'audit', {
      user_id: memberA.user.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(audit, 200, 'auditoria del miembro');
    const actions = audit.data.audit.map((entry) => entry.action);
    for (const action of [
      'team_user_created',
      'team_user_updated',
      'team_permissions_changed',
      'team_sessions_revoked',
      'team_devices_revoked',
      'team_temporary_password_issued',
    ]) assert.equal(actions.includes(action), true, `falta auditoria ${action}`);
    const auditJson = JSON.stringify(audit.data);
    for (const secret of [memberA.password, memberB.password, memberC.password]) {
      assert.equal(auditJson.includes(secret), false);
    }

    const preDowngradeDevice = 'F'.repeat(43);
    memberAAuth = await login(memberA.user.email, memberA.password, preDowngradeDevice);
    assertStatus(memberAAuth, 200, 'login antes de downgrade');
    memberAToken = memberAAuth.data.token;

    const downgrade = await changePlan(storeA.id, 'basic', true);
    assertStatus(downgrade, 200, 'downgrade Premium a Basic');
    assert.equal(downgrade.data.team_access_transition.locked, 3);
    assert.equal(downgrade.data.team_access_transition.restored, 0);
    assertStatus(await refresh(memberAToken, preDowngradeDevice), 401, 'downgrade revoca sesion');
    const blockedLogin = await login(memberA.user.email, memberA.password, 'G'.repeat(43));
    assert.ok([400, 401].includes(blockedLogin.status), `login bloqueado por plan: ${blockedLogin.raw}`);

    const basicSummary = await team(primaryAToken, 'summary', {});
    assertStatus(basicSummary, 200, 'principal conserva acceso tras downgrade');
    assert.equal(basicSummary.data.plan.code, 'basic');
    assert.equal(basicSummary.data.user_counts.active, 1);
    assert.equal(basicSummary.data.user_counts.stored_active, 4);
    const persistedMember = await request(`/api/collections/users/records/${memberA.user.id}`, { token: superToken });
    assertStatus(persistedMember, 200, 'miembro persiste tras downgrade');
    assert.equal(persistedMember.data.status, 'active');
    const basicCreate = await team(primaryAToken, 'create', {
      email: `${slugPrefix}-basic-over@example.test`,
      display_name: `${prefix} Basic over`,
      phone: '',
      template_code: 'custom',
      permissions: [],
      reason: `${prefix} Basic cupo`,
    });
    assertStatus(basicCreate, 409, 'Basic no permite activo adicional');
    assert.equal(basicCreate.data.error, 'active_user_limit_reached');

    const basicExpiration = await patch('products', productA.id, { expiration_date: '2099-12-29' }, primaryAToken);
    assertStatus(basicExpiration, 403, 'V7E9 requiere Premium incluso para principal');
    assert.match(basicExpiration.raw, /expiration_premium_required|permission_denied/);

    const upgrade = await changePlan(storeA.id, 'premium', false);
    assertStatus(upgrade, 200, 'upgrade Basic a Premium');
    assert.equal(upgrade.data.team_access_transition.locked, 0);
    assert.equal(upgrade.data.team_access_transition.restored, 3);
    memberAAuth = await login(memberA.user.email, memberA.password, 'H'.repeat(43));
    assertStatus(memberAAuth, 200, 'login restaurado tras upgrade');
    memberAToken = memberAAuth.data.token;
    const restoredContext = await accessContext(memberAToken);
    assertStatus(restoredContext, 200, 'permisos restaurados tras upgrade');
    assert.equal(restoredContext.data.access.permissions.includes('catalog.expirations.manage'), true);
    const restoredExpiration = await patch('products', productA.id, { expiration_date: '2099-12-28' }, memberAToken);
    assertStatus(restoredExpiration, 200, 'V7E9 restaurado tras upgrade');

    const finalAudit = await team(primaryAToken, 'audit', {
      user_id: memberA.user.id,
      page: 1,
      per_page: 50,
    });
    assertStatus(finalAudit, 200, 'auditoria de transición de plan');
    const finalActions = finalAudit.data.audit.map((entry) => entry.action);
    assert.equal(finalActions.includes('plan_access_locked'), true);
    assert.equal(finalActions.includes('plan_access_restored'), true);

    const superAccess = await list('store_user_access', `store="${storeA.id}"`);
    assert.equal(superAccess.length, 4);
    ids.store_user_access.push(...superAccess.map((record) => record.id));
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (superToken) {
      try {
        for (const storeId of ids.stores) {
          for (const collection of [
            'product_expiration_cycles',
            'store_notifications',
            'store_user_device_audit',
            'store_user_devices',
            'store_user_audit',
            'store_user_access',
            'store_plan_audit',
          ]) await removeByFilter(collection, `store="${storeId}"`);

          for (const product of await listMaybe('products', `store="${storeId}"`)) {
            await remove('products', product.id);
          }
          const storeUsers = await listMaybe('users', `store="${storeId}"`);
          for (const user of storeUsers) {
            await removeByFilter('store_user_device_audit', `target_user="${user.id}" || actor="${user.id}"`);
            await removeByFilter('store_user_devices', `user="${user.id}" || revoked_by="${user.id}"`);
          }
          await remove('stores', storeId);
          for (const user of storeUsers) await remove('users', user.id);
        }
        for (const masterId of ids.users) {
          const masterRecord = await request(`/api/collections/users/records/${masterId}`, { token: superToken });
          if (masterRecord.status === 200 && masterRecord.data.role === 'master_admin') await remove('users', masterId);
        }

        const remainingStores = await listMaybe('stores', `name~"${prefix}"`);
        const remainingUsers = await listMaybe('users', `email~"${slugPrefix}"`);
        const remainingProducts = await listMaybe('products', `name~"${prefix}"`);
        assert.equal(remainingStores.length, 0, `quedan tiendas ${prefix}`);
        assert.equal(remainingUsers.length, 0, `quedan usuarios ${prefix}`);
        assert.equal(remainingProducts.length, 0, `quedan productos ${prefix}`);
      } catch (cleanupError) {
        if (!failure) throw cleanupError;
      }
    }
  }
});
