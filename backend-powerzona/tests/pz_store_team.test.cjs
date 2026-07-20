const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hooks = path.resolve(__dirname, '..', 'pb_hooks');
const team = require(path.join(hooks, 'pz_store_team_lib.js'));
const enforcement = require(path.join(hooks, 'pz_store_permission_enforcement_lib.js'));
const permissionCatalog = require(path.join(hooks, 'pz_store_team_permissions_lib.js'));

test('registra el contrato privado completo de Mi equipo con auth y límites de cuerpo', () => {
  const source = fs.readFileSync(path.join(hooks, 'pz_store_team.pb.js'), 'utf8');
  const routes = [
    '/api/pz/store/access/context',
    '/api/pz/store/team/summary',
    '/api/pz/store/team/list',
    '/api/pz/store/team/detail',
    '/api/pz/store/team/create',
    '/api/pz/store/team/update',
    '/api/pz/store/team/suspend',
    '/api/pz/store/team/reactivate',
    '/api/pz/store/team/issue-temporary-access',
    '/api/pz/store/team/revoke-sessions',
    '/api/pz/store/team/revoke-devices',
    '/api/pz/store/team/audit',
  ];
  routes.forEach((route) => assert.match(source, new RegExp(route.replaceAll('/', '\\/'))));
  assert.match(source, /\$apis\.requireAuth\(\)/);
  assert.match(source, /\$apis\.bodyLimit\(/);
  assert.match(source, /rejectBlockedByPlanAuthentication/);
});

test('payloads exactos no aceptan campos de actor, tienda, rol ni estado', () => {
  const valid = {
    email: 'equipo@example.test',
    display_name: 'Equipo',
    phone: '',
    template_code: 'read_only',
    permissions: permissionCatalog.resolveTemplatePermissions('read_only'),
    reason: '',
  };
  const parsed = team.parseCreate(valid);
  assert.equal(parsed.email, valid.email);
  for (const extra of ['actor_id', 'store_id', 'role', 'status']) {
    assert.equal(team.parseCreate({ ...valid, [extra]: 'ignored' }), null);
  }
  assert.deepEqual(team.parseEmpty({}), {});
  assert.equal(team.parseEmpty({ store_id: 'abcdefghijklmn1' }), null);
});

test('permisos reservados y desconocidos se rechazan sin normalización silenciosa', () => {
  assert.throws(() => team.normalizedRawPermissions(['team.manage']), /reserved_permission/);
  assert.throws(() => team.normalizedRawPermissions(['catalog.unknown']), /invalid_permissions/);
  assert.throws(() => team.normalizedRawPermissions([null]), /invalid_permissions/);
});

test('dependencias se normalizan y una edición manual vuelve Personalizado', () => {
  const custom = team.permissionSelection('catalog_inventory', ['catalog.products.stock']);
  assert.equal(custom.templateCode, 'custom');
  assert.deepEqual(custom.permissions, ['catalog.products.stock', 'catalog.view']);

  const template = permissionCatalog.resolveTemplatePermissions('orders_shipping');
  const exact = team.permissionSelection('orders_shipping', template);
  assert.equal(exact.templateCode, 'orders_shipping');
  assert.deepEqual(exact.permissions, template.slice().sort());
});

test('Administrador secundario conserva rol administrativo sin recibir team.manage', () => {
  assert.equal(team.roleForTemplate('secondary_admin'), 'store_admin');
  assert.equal(team.roleForTemplate('orders_shipping'), 'store_staff');
  assert.equal(permissionCatalog.PERMISSION_TEMPLATES.secondary_admin.permissions.includes('team.manage'), false);
});

test('temporal se genera server-side con entropía y nunca forma parte del payload', () => {
  const previous = global.$security;
  global.$security = {
    randomStringWithAlphabet(length, alphabet) {
      assert.equal(length, 20);
      assert.ok(alphabet.length >= 60);
      return 'AbCdEfGhJkMnPqRsTuV2';
    },
  };
  try {
    const password = team.generateTemporaryPassword();
    assert.equal(password, 'T84!AbCdEfGhJkMnPqRsTuV2');
    assert.equal(password.length >= 24, true);
  } finally {
    if (previous === undefined) delete global.$security;
    else global.$security = previous;
  }
});

test('estados de error distinguen 403 propio, 404 ajeno y conflictos de cupo', () => {
  assert.equal(team.statusForError('permission_denied'), 403);
  assert.equal(team.statusForError('blocked_by_plan'), 403);
  assert.equal(team.statusForError('user_not_found'), 404);
  assert.equal(team.statusForError('active_user_limit_reached'), 409);
  assert.equal(team.statusForError('reserved_permission'), 400);
});

test('matriz backend protege lecturas y mutaciones con permisos específicos', () => {
  assert.equal(enforcement.READ_PERMISSIONS.products, 'catalog.view');
  assert.equal(enforcement.READ_PERMISSIONS.subcategories, 'catalog.view');
  assert.equal(enforcement.READ_PERMISSIONS.orders, 'orders.view');
  assert.equal(enforcement.READ_PERMISSIONS.store_notifications, 'notifications.view');
  assert.equal(enforcement.READ_PERMISSIONS.store_security_events, 'security.view');
  assert.deepEqual(enforcement.mutationPermissions('categories', 'update', []), ['catalog.categories.manage']);
  assert.deepEqual(enforcement.mutationPermissions('subcategories', 'update', []), ['catalog.categories.manage']);
  assert.deepEqual(enforcement.mutationPermissions('order_items', 'delete', []), [enforcement.DENY_PERMISSION]);
  assert.deepEqual(enforcement.mutationPermissions('raffles', 'create', []), ['raffles.manage']);
});

test('productos separan edición general de permisos sensibles por campo', () => {
  assert.deepEqual(
    enforcement.requiredProductPermissions('create', ['name', 'price_usd', 'stock', 'images']),
    ['catalog.products.create', 'catalog.products.price', 'catalog.products.stock', 'catalog.products.images'],
  );
  assert.deepEqual(
    enforcement.requiredProductPermissions('update', ['expiration_date']),
    ['catalog.expirations.manage'],
  );
  assert.deepEqual(
    enforcement.requiredProductPermissions('update', ['base_price_usd', 'regular_price_usd', 'cost_usd', 'profit_margin', 'is_offer']),
    ['catalog.products.price'],
  );
  assert.deepEqual(enforcement.requiredProductPermissions('update', ['stock']), ['catalog.products.stock']);
  assert.deepEqual(enforcement.requiredProductPermissions('update', ['images-', 'image_order']), ['catalog.products.images']);
  assert.deepEqual(enforcement.requiredProductPermissions('update', ['featured', 'featured_order']), ['catalog.products.visibility']);
  assert.deepEqual(enforcement.requiredProductPermissions('update', ['name']), ['catalog.products.edit']);
  assert.deepEqual(enforcement.requiredProductPermissions('delete', []), ['catalog.products.delete']);
});

test('uploads multipart no eluden permisos de imágenes aunque no aparezcan en requestInfo.body', () => {
  const productEvent = {
    requestInfo: () => ({ body: { name: 'Producto' } }),
    record: { getUnsavedFiles: (key) => key === 'images' ? [{ name: 'foto.webp' }] : [] },
  };
  assert.deepEqual(enforcement.mutationKeys(productEvent, 'products'), ['name', 'images']);
  assert.deepEqual(
    enforcement.requiredProductPermissions('update', enforcement.mutationKeys(productEvent, 'products')),
    ['catalog.products.edit', 'catalog.products.images'],
  );

  const variationEvent = {
    requestInfo: () => ({ body: {} }),
    record: { getUnsavedFiles: () => [] },
    findUploadedFiles: (key) => key === 'image+' ? [{ name: 'variante.webp' }] : [],
  };
  assert.deepEqual(enforcement.mutationKeys(variationEvent, 'product_variations'), ['image']);
});

test('ajustes distribuyen mutaciones por prefijo sin abrir campos generales', () => {
  assert.deepEqual(enforcement.requiredSettingsPermissions(['landing_qr_title', 'landing_qr_links']), ['landing_qr.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['review_request_delay_hours']), ['reviews.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['store_reviews_enabled', 'show_verified_badge']), ['reviews.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['gifts_public_title']), ['gifts.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['marketing_bar_active']), ['promotions.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['notify_expiration_alerts']), ['catalog.expirations.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['store', 'welcome_text']), ['store.settings.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['gifts_public_title', 'active'], 'update', { active: false }), ['gifts.manage', 'store.settings.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['store', 'store_name', 'gifts_public_title', 'active'], 'create', { active: true }), ['gifts.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['store', 'store_name', 'review_request_delay_hours', 'active'], 'create', { active: true }), ['reviews.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['store', 'store_name', 'landing_qr_title', 'active'], 'create', { active: true }), ['landing_qr.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['store', 'store_name', 'landing_qr_title', 'active'], 'create', { active: 'true' }), ['landing_qr.manage']);
  assert.deepEqual(enforcement.requiredSettingsPermissions(['store', 'store_name', 'active'], 'create', { active: true }), ['store.settings.manage']);
});

test('pedidos separan campos directos y reservan acciones atómicas oficiales', () => {
  assert.deepEqual(enforcement.requiredOrderPermissions('update', ['status'], { status: 'processing' }), [enforcement.DENY_PERMISSION]);
  assert.deepEqual(enforcement.requiredOrderPermissions('update', ['status'], { status: 'cancelled' }), [enforcement.DENY_PERMISSION]);
  assert.deepEqual(enforcement.requiredOrderPermissions('update', ['stock_deducted']), [enforcement.DENY_PERMISSION]);
  assert.deepEqual(enforcement.requiredOrderPermissions('update', ['receipt_token']), [enforcement.DENY_PERMISSION]);
  assert.deepEqual(enforcement.requiredOrderPermissions('update', ['review_token']), [enforcement.DENY_PERMISSION]);
  assert.deepEqual(enforcement.requiredOrderPermissions('update', ['customer_phone']), ['orders.contact_customer']);
  assert.deepEqual(enforcement.requiredOrderPermissions('update', ['total']), ['orders.price_adjustment']);
  assert.deepEqual(enforcement.requiredOrderPermissions('update', ['manual_adjustment_usd']), [enforcement.DENY_PERMISSION]);
  assert.deepEqual(enforcement.requiredOrderPermissions('delete', []), [enforcement.DENY_PERMISSION]);

  const pricing = fs.readFileSync(path.join(hooks, 'pz_order_pricing_lib.js'), 'utf8');
  assert.match(pricing, /orders\.items\.manage/);
  assert.match(pricing, /orders\.price_adjustment/);
  assert.match(pricing, /nextStatus === "cancelled" \? "orders\.cancel_delete" : "orders\.status\.manage"/);
  assert.match(pricing, /handleOrderDelete/);
  assert.match(pricing, /handleOrderReceiptToken/);
  assert.match(pricing, /handleOrderReviewToken/);
  assert.match(pricing, /permission_denied/);
});

test('notificaciones solo aceptan transiciones de lectura y detectan alertas V7E9', () => {
  assert.equal(enforcement.isSafeNotificationUpdate(['status', 'read_at', 'archived_at']), true);
  assert.equal(enforcement.isSafeNotificationUpdate(['title', 'status']), false);
  assert.equal(enforcement.isExpirationNotification({ type: 'product_expiring_soon' }), true);
  assert.equal(enforcement.isExpirationNotification({ type: 'new_order' }), false);
});

test('aislamiento impide cambiar la tienda o enlazar relaciones de otro tenant', () => {
  const previousNotFound = global.NotFoundError;
  global.NotFoundError = class NotFoundError extends Error {};
  const makeRecord = (id, values, original = null) => ({
    id,
    get(key) { return values[key]; },
    original() { return original; },
  });
  const auth = makeRecord('stafftenant0001', { role: 'store_staff', status: 'active', store: 'storetenant0001' });
  const otherCategory = makeRecord('categoryother01', { store: 'storetenant0002' });
  const app = {
    findRecordById(collection, id) {
      if (collection === 'categories' && id === otherCategory.id) return otherCategory;
      throw new Error('not_found');
    },
  };
  try {
    const original = makeRecord('producttenant01', { store: 'storetenant0001', category: '' });
    const moved = makeRecord('producttenant01', { store: 'storetenant0002', category: '' }, original);
    assert.throws(
      () => enforcement.assertTenantAndRelationIntegrity({ app, auth, record: moved }, 'products', 'update'),
      /requested resource|not_found/i,
    );

    const related = makeRecord('producttenant02', { store: 'storetenant0001', category: otherCategory.id });
    assert.throws(
      () => enforcement.assertTenantAndRelationIntegrity({ app, auth, record: related }, 'products', 'create'),
      /requested resource|not_found/i,
    );

    const foreignOriginal = makeRecord('producttenant03', { store: 'storetenant0002', category: '' });
    const foreignCurrent = makeRecord('producttenant03', { store: 'storetenant0002', category: '' }, foreignOriginal);
    assert.doesNotThrow(
      () => enforcement.assertTenantAndRelationIntegrity({ app, auth, record: foreignCurrent }, 'products', 'update'),
    );
  } finally {
    global.NotFoundError = previousNotFound;
  }
});

test('alta pública de notificación deriva contenido y URL segura desde una entidad real', () => {
  const values = {
    store: 'storenotify0001',
    type: 'review_pending',
    entity_collection: 'reviews',
    entity_id: 'reviewnotify001',
    title: '<img src=x onerror=alert(1)>',
    message: '<script>alert(1)</script>',
    target_url: 'javascript:alert(document.domain)',
  };
  const notification = {
    get(key) { return values[key]; },
    set(key, value) { values[key] = value; },
  };
  const store = { id: values.store, get(key) { return ({ slug: 'tienda-segura' })[key]; } };
  const review = {
    id: values.entity_id,
    get(key) {
      return ({ store: values.store, status: 'pending', customer_name: 'Cliente', rating: 5, source: 'public_product' })[key];
    },
  };
  const app = {
    findRecordById(collection, id) {
      if (collection === 'stores' && id === store.id) return store;
      if (collection === 'reviews' && id === review.id) return review;
      throw new Error('not_found');
    },
  };
  enforcement.sanitizePublicNotificationCreate({ app, record: notification });
  assert.equal(values.title, 'Nueva reseña pendiente');
  assert.equal(values.message.includes('<script>'), false);
  assert.equal(values.target_url, '/t/tienda-segura/admin/store-settings#rating-pending');
  assert.equal(values.status, 'unread');
  assert.deepEqual(values.metadata_json, { review_id: review.id, source: 'public_product' });
});

test('realtime usa exclusivamente la identidad viva del cliente y no revive una sesión revocada', () => {
  const authFromEvent = { id: 'staffrevoked001', get: (key) => ({ role: 'store_staff', status: 'active', store: 'storerevoke0001' })[key] };
  const noClientAuth = {
    auth: authFromEvent,
    client: { get() { return null; } },
    app: { findRecordById() { throw new Error('must_not_reload'); } },
  };
  assert.equal(enforcement.realtimeAuth(noClientAuth), null);

  const currentAuth = { id: authFromEvent.id, tokenKey: () => 'connected-key' };
  const suspended = { id: authFromEvent.id, tokenKey: () => 'connected-key', get: (key) => ({ role: 'store_staff', status: 'suspended', store: 'storerevoke0001' })[key] };
  const reloaded = enforcement.realtimeAuth({
    client: { get(key) { return key === 'auth' ? currentAuth : null; } },
    app: { findRecordById(collection, id) { return collection === 'users' && id === currentAuth.id ? suspended : null; } },
  });
  assert.equal(reloaded, suspended);

  const rotated = { ...suspended, tokenKey: () => 'rotated-key' };
  assert.equal(enforcement.realtimeAuth({
    client: { get(key) { return key === 'auth' ? currentAuth : null; } },
    app: { findRecordById(collection, id) { return collection === 'users' && id === currentAuth.id ? rotated : null; } },
  }), null);
  let revokedMessageForwarded = false;
  enforcement.enforceRealtimeMessage({
    client: { get(key) { return key === 'auth' ? currentAuth : null; } },
    app: { findRecordById(collection, id) { return collection === 'users' && id === currentAuth.id ? rotated : null; } },
    message: { name: 'orders/update', data: JSON.stringify({ record: { id: 'orderrevoked001' } }) },
    next() { revokedMessageForwarded = true; },
  });
  assert.equal(revokedMessageForwarded, false);
  const source = fs.readFileSync(path.join(hooks, 'pz_store_permission_enforcement_lib.js'), 'utf8');
  assert.doesNotMatch(source, /pz_store_auth_id/);
});

test('V7E9 exige capacidad Premium y permiso granular real', () => {
  const source = fs.readFileSync(path.join(hooks, 'pz_product_expiration_lib.js'), 'utf8');
  assert.match(source, /catalog\.expirations\.manage/);
  assert.match(source, /product_expiration_tools_enabled/);
  assert.match(source, /permission_denied/);
  assert.match(source, /e\.json\(403, \{ ok: false, error: "permission_denied" \}\)/);
});

test('downgrade y autenticación conservan status pero invalidan sesiones', () => {
  const source = fs.readFileSync(path.join(hooks, 'pz_store_team_lib.js'), 'utf8');
  assert.match(source, /plan_access_locked/);
  assert.match(source, /plan_access_restored/);
  assert.match(source, /user\.refreshTokenKey\(\)/);
  assert.doesNotMatch(source, /plan_access_locked[\s\S]{0,300}set\("status",\s*"suspended"\)/);
  assert.match(source, /rejectBlockedByPlanAuthentication/);
  assert.match(source, /Failed to authenticate\./);
});

test('no existe eliminación física en la API de tienda', () => {
  const routeSource = fs.readFileSync(path.join(hooks, 'pz_store_team.pb.js'), 'utf8');
  const libSource = fs.readFileSync(path.join(hooks, 'pz_store_team_lib.js'), 'utf8');
  assert.doesNotMatch(routeSource, /team\/delete/);
  assert.doesNotMatch(libSource, /function handleDelete/);
});
