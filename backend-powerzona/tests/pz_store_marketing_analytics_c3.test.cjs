'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const analytics = require('../pb_hooks/pz_store_analytics_lib.js');
const masterAnalytics = require('../pb_hooks/pz_master_dashboard_lib.js');
const selectors = require('../pb_hooks/pz_store_marketing_selectors_lib.js');
const storeTeam = require('../pb_hooks/pz_store_team_lib.js');
const masterUsers = require('../pb_hooks/pz_master_store_users_lib.js');

const HOOKS = path.resolve(__dirname, '../pb_hooks');
const STORE_ID = 'storeprivacy001';
const STAFF_ID = 'staffprivacy001';
const PRIMARY_ID = 'primaryprivacy1';

function record(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] || ''); },
  };
}

function permissionFixture(assignedPermissions) {
  const store = record(STORE_ID, {
    name: 'Tienda segura',
    slug: 'tienda-segura',
    status: 'active',
    primary_admin_user: PRIMARY_ID,
    plan: 'premium',
    plan_started_at: '2026-07-01T00:00:00.000Z',
    plan_expires_at: '',
    plan_is_permanent: true,
  });
  const staff = record(STAFF_ID, {
    role: 'store_staff',
    status: 'active',
    store: STORE_ID,
  });
  const access = record('accessprivacy01', {
    store: STORE_ID,
    user: STAFF_ID,
    template_code: 'custom',
    permissions_json: assignedPermissions,
  });
  const app = {
    findRecordById(collection, id) {
      if (collection === 'stores' && id === STORE_ID) return store;
      if (collection === 'users' && id === STAFF_ID) return staff;
      throw new Error('not_found');
    },
    findFirstRecordByFilter(collection, _filter, params) {
      if (collection === 'store_user_access' && params.store === STORE_ID && params.user === STAFF_ID) return access;
      throw new Error('not_found');
    },
    findRecordsByFilter(collection) {
      if (collection === 'users') return [staff];
      throw new Error('not_found');
    },
  };
  return { access, app, staff, store };
}

function collectKeys(value, output = new Set()) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, output));
    return output;
  }
  Object.keys(value).forEach((key) => {
    output.add(key);
    collectKeys(value[key], output);
  });
  return output;
}

function withMasterAnalyticsStubs(callback) {
  const originals = {
    buildPeriod: masterAnalytics.buildPeriod,
    queryTraffic: masterAnalytics.queryTraffic,
    queryTopViewedProducts: masterAnalytics.queryTopViewedProducts,
    queryPages: masterAnalytics.queryPages,
    queryLandingQr: masterAnalytics.queryLandingQr,
    queryLandingQrDaily: masterAnalytics.queryLandingQrDaily,
  };
  const calls = [];
  masterAnalytics.buildPeriod = (range) => ({ periodDays: range === 'today' ? 1 : Number(range) });
  masterAnalytics.queryTraffic = (_app, storeId) => {
    calls.push(['traffic', storeId]);
    return {
      metrics: { visitors: 8, recurrent_visitors: 2, pageviews: 19, orders: 99 },
      daily: [{
        day: '2026-07-20',
        label: '20 jul',
        visitors: 8,
        recurrent_visitors: 2,
        pageviews: 19,
        orders: 7,
        customer_name: 'No devolver',
      }],
    };
  };
  masterAnalytics.queryTopViewedProducts = (_app, storeId) => {
    calls.push(['products', storeId]);
    return [{
      product_id: 'productsecret01',
      name: 'Producto público',
      slug: 'producto-publico',
      active: true,
      views: 12,
      cost_usd: 2,
      stock: 7,
    }];
  };
  masterAnalytics.queryPages = (_app, storeId) => {
    calls.push(['pages', storeId]);
    const safe = {
      page_type: 'product',
      entity_id: 'productsecret01',
      raw_path: '/internal/raw',
      name: 'Producto: Producto público',
      detail: 'Producto',
      visits: 12,
      last_visited_at: '2026-07-20T10:00:00.000Z',
      public_path: '/t/tienda-segura/producto/producto-publico',
    };
    const raw = {
      ...safe,
      page_type: 'other',
      name: 'Página pública',
      public_path: '/t/tienda-segura/private/raw-path',
    };
    return {
      topPages: [safe, raw],
      pages: { page: 1, per_page: 10, total_items: 2, total_pages: 1, items: [safe, raw] },
    };
  };
  masterAnalytics.queryLandingQr = (_app, storeId) => {
    calls.push(['landing', storeId]);
    return {
      views: 4,
      clicks: 3,
      top_buttons: [{
        link_id: 'link-secret',
        url: 'https://private.example.test',
        link_type: 'whatsapp',
        link_label: 'Escríbenos',
        clicks: 3,
      }],
    };
  };
  masterAnalytics.queryLandingQrDaily = (_app, storeId) => {
    calls.push(['landing-daily', storeId]);
    return [{
      day: '2026-07-20',
      label: '20 jul',
      views: 4,
      clicks: 3,
      session_id: 'session-secret',
      visitor_id: 'visitor-secret',
    }];
  };
  try {
    return callback(calls);
  } finally {
    Object.assign(masterAnalytics, originals);
  }
}

test('analytics summary deriva tenant y valida payload exacto sin store_id', () => {
  assert.deepEqual(analytics.parseSummaryPayload({ range: '7', pages_page: 1 }), { range: '7', pagesPage: 1 });
  assert.equal(analytics.parseSummaryPayload({ range: '7', pages_page: 1, store_id: STORE_ID }), null);
  assert.equal(analytics.parseSummaryPayload({ range: '365', pages_page: 1 }), null);
  assert.equal(analytics.parseSummaryPayload({ range: '7', pages_page: '1' }), null);

  const data = permissionFixture(['analytics.view']);
  const forgedAuth = record(STAFF_ID, { role: 'store_staff', status: 'active', store: 'storeforeign001' });
  const context = analytics.loadStoreContext(data.app, forgedAuth);
  assert.equal(context.storeId, STORE_ID);
  assert.equal(context.actor, data.staff);
});

test('analytics summary expone solo agregados seguros y Landing QR condicionado', () => {
  const data = permissionFixture(['analytics.view', 'landing_qr.manage']);
  const context = analytics.loadStoreContext(data.app, data.staff);
  const now = new Date('2026-07-20T15:30:00.000Z');
  withMasterAnalyticsStubs((calls) => {
    const response = analytics.buildSummary(data.app, context, { range: '7', pagesPage: 1 }, now);
    assert.deepEqual(Object.keys(response.metrics), ['visitors', 'recurrent_visitors', 'pageviews']);
    assert.deepEqual(Object.keys(response.daily[0]), ['day', 'label', 'visitors', 'recurrent_visitors', 'pageviews']);
    assert.deepEqual(Object.keys(response.top_viewed_products[0]), ['name', 'slug', 'active', 'views', 'public_path']);
    assert.deepEqual(Object.keys(response.top_pages[0]), ['page_type', 'name', 'detail', 'visits', 'last_visited_at', 'public_path']);
    assert.equal(response.top_pages[1].public_path, '');
    assert.deepEqual(Object.keys(response.landing_qr.top_buttons[0]), ['link_type', 'link_label', 'clicks']);
    assert.deepEqual(Object.keys(response.landing_qr.daily[0]), ['day', 'label', 'views', 'clicks']);
    const forbidden = [
      'customer_name', 'entity_id', 'link_id', 'orders', 'order_id', 'product_id', 'raw_path',
      'revenue', 'sales', 'session_id', 'store_id', 'url', 'visitor_id', 'cost_usd', 'stock',
    ];
    const keys = collectKeys(response);
    forbidden.forEach((key) => assert.equal(keys.has(key), false, key));
    assert.deepEqual(calls, [
      ['traffic', STORE_ID],
      ['products', STORE_ID],
      ['pages', STORE_ID],
      ['landing', STORE_ID],
      ['landing-daily', STORE_ID],
    ]);
  });

  const analyticsOnly = permissionFixture(['analytics.view']);
  const analyticsContext = analytics.loadStoreContext(analyticsOnly.app, analyticsOnly.staff);
  withMasterAnalyticsStubs((calls) => {
    const response = analytics.buildSummary(
      analyticsOnly.app,
      analyticsContext,
      { range: 'today', pagesPage: 1 },
      now,
    );
    assert.equal(Object.hasOwn(response, 'landing_qr'), false);
    assert.equal(calls.some(([kind]) => kind === 'landing'), false);
    assert.equal(calls.some(([kind]) => kind === 'landing-daily'), false);
  });
});

test('rutas privadas C3 registran auth, body limit y contratos POST', () => {
  const analyticsRoute = fs.readFileSync(path.join(HOOKS, 'pz_store_analytics.pb.js'), 'utf8');
  const selectorRoute = fs.readFileSync(path.join(HOOKS, 'pz_store_marketing_selectors.pb.js'), 'utf8');
  assert.match(analyticsRoute, /"POST"[\s\S]*\/api\/pz\/store\/analytics\/summary/);
  assert.match(selectorRoute, /"POST"[\s\S]*\/api\/pz\/store\/marketing\/selectors/);
  for (const source of [analyticsRoute, selectorRoute]) {
    assert.match(source, /\$apis\.requireAuth\(\)/);
    assert.match(source, /requireAuthenticatedUser/);
  }
  assert.match(analyticsRoute, /\$apis\.bodyLimit\(512\)/);
  assert.match(selectorRoute, /\$apis\.bodyLimit\(4096\)/);
});

test('E005: serie diaria Landing QR conserva días vacíos y usa solo agregados', () => {
  const previousArrayOf = global.arrayOf;
  const previousDynamicModel = global.DynamicModel;
  global.arrayOf = () => [];
  global.DynamicModel = class DynamicModel { constructor(values) { Object.assign(this, values); } };
  const queries = [];
  const app = {
    db() {
      return {
        newQuery(sql) {
          const query = { sql, bindings: null };
          queries.push(query);
          return {
            bind(bindings) { query.bindings = bindings; return this; },
            all(rows) {
              rows.push({ day: '2026-07-18', views: 2, clicks: 1 });
              rows.push({ day: '2026-07-20', views: 4, clicks: 3 });
            },
          };
        },
      };
    },
  };
  const period = {
    startDay: '2026-07-18',
    endDay: '2026-07-20',
    days: [
      { day: '2026-07-18', label: '18 jul' },
      { day: '2026-07-19', label: '19 jul' },
      { day: '2026-07-20', label: '20 jul' },
    ],
  };

  try {
    assert.deepEqual(masterAnalytics.queryLandingQrDaily(app, STORE_ID, period), [
      { day: '2026-07-18', label: '18 jul', views: 2, clicks: 1 },
      { day: '2026-07-19', label: '19 jul', views: 0, clicks: 0 },
      { day: '2026-07-20', label: '20 jul', views: 4, clicks: 3 },
    ]);
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].bindings, {
      storeId: STORE_ID,
      startDay: period.startDay,
      endDay: period.endDay,
    });
    assert.match(queries[0].sql, /COUNT\(DISTINCT CASE[\s\S]*session_id[\s\S]*visitor_id/);
    assert.match(queries[0].sql, /event_type = 'landing_qr_click'/);
    assert.match(queries[0].sql, /GROUP BY day/);
    assert.equal(queries[0].sql.includes(STORE_ID), false);
  } finally {
    if (previousArrayOf === undefined) delete global.arrayOf;
    else global.arrayOf = previousArrayOf;
    if (previousDynamicModel === undefined) delete global.DynamicModel;
    else global.DynamicModel = previousDynamicModel;
  }
});

test('selector acepta {} o search acotado, nunca tenant ni opciones de expand', () => {
  const defaults = {
    search: '',
    taxonomyPage: 1,
    taxonomyPerPage: selectors.DEFAULT_TAXONOMY_PER_PAGE,
  };
  assert.deepEqual(selectors.parseSelectorsPayload({}), defaults);
  assert.deepEqual(selectors.parseSelectorsPayload({ refs: [] }), { ...defaults, refs: [] });
  assert.deepEqual(selectors.parseSelectorsPayload({
    search: ' Producto ',
    refs: ['productselect01', ' categoryselect1 ', 'productselect01'],
  }), {
    search: 'Producto',
    taxonomyPage: 1,
    taxonomyPerPage: selectors.DEFAULT_TAXONOMY_PER_PAGE,
    refs: ['productselect01', 'categoryselect1'],
  });
  const maxRefs = Array.from(
    { length: selectors.MAX_SELECTOR_REFS },
    (_, index) => `r${String(index).padStart(14, '0')}`,
  );
  assert.equal(selectors.parseSelectorsPayload({ refs: maxRefs }).refs.length, selectors.MAX_SELECTOR_REFS);
  assert.equal(selectors.parseSelectorsPayload({ refs: [...maxRefs, 'overflowref0001'] }), null);
  assert.equal(selectors.parseSelectorsPayload({ refs: 'productselect01' }), null);
  assert.equal(selectors.parseSelectorsPayload({ refs: ['SHORT'] }), null);
  assert.equal(selectors.parseSelectorsPayload({ refs: ['productselect01'], ref_types: {} }), null);
  assert.deepEqual(selectors.parseSelectorsPayload({ search: ' Café ' }), {
    ...defaults,
    search: 'Café',
  });
  assert.deepEqual(selectors.parseSelectorsPayload({
    taxonomy_page: 3,
    taxonomy_per_page: 25,
  }), {
    search: '',
    taxonomyPage: 3,
    taxonomyPerPage: 25,
  });
  assert.equal(selectors.parseSelectorsPayload({ taxonomy_page: 0 }), null);
  assert.equal(selectors.parseSelectorsPayload({ taxonomy_page: '2' }), null);
  assert.equal(selectors.parseSelectorsPayload({ taxonomy_per_page: 101 }), null);
  assert.equal(selectors.parseSelectorsPayload({ store_id: STORE_ID }), null);
  assert.equal(selectors.parseSelectorsPayload({ search: '', expand: 'category' }), null);
  assert.equal(selectors.parseSelectorsPayload({ search: 'x'.repeat(101) }), null);

  const allowed = permissionFixture(['promotions.manage']);
  const denied = permissionFixture(['gifts.manage', 'raffles.manage', 'analytics.view']);
  assert.equal(selectors.hasSelectorPermission(
    allowed.app,
    selectors.loadStoreContext(allowed.app, allowed.staff),
  ), true);
  assert.equal(selectors.hasSelectorPermission(
    denied.app,
    selectors.loadStoreContext(denied.app, denied.staff),
  ), false);
});

test('selector usa tres consultas batch aisladas y serializa campos planos sanitizados', () => {
  const previousArrayOf = global.arrayOf;
  const previousDynamicModel = global.DynamicModel;
  global.arrayOf = () => [];
  global.DynamicModel = class DynamicModel { constructor(values) { Object.assign(this, values); } };
  const queries = [];
  const app = {
    db() {
      return {
        newQuery(sql) {
          const call = { sql, bindings: null };
          queries.push(call);
          return {
            bind(bindings) { call.bindings = bindings; return this; },
            all(rows) {
              if (sql.includes('pz-selector:products')) rows.push({
                ref: 'productselect01',
                name: 'Producto selector',
                slug: 'producto-selector',
                visible: 1,
                thumbnail: 'foto interna.webp',
                categoryRef: 'categoryselect1',
                categoryName: 'Categoría selector',
                subcategoryRef: 'subcatselect001',
                subcategoryName: 'Subcategoría selector',
                cost_usd: 5,
                stock: 9,
                internal_ref: 'PRIVATE',
              });
              else if (sql.includes('pz-selector:categories')) rows.push({
                ref: 'categoryselect1',
                name: 'Categoría selector',
                slug: 'categoria-selector',
                visible: true,
                thumbnail: 'categoria.webp',
                requestedPriority: 0,
                supplier: 'PRIVATE',
              });
              else if (sql.includes('pz-selector:subcategories')) rows.push({
                ref: 'subcatselect001',
                name: 'Subcategoría selector',
                slug: 'subcategoria-selector',
                visible: 'true',
                categoryRef: 'categoryselect1',
                categoryName: 'Categoría selector',
                requestedPriority: 0,
                expiration_date: '2026-07-20',
              });
              if (sql.includes('pz-selector:categories')) {
                for (let index = 0; index < 100; index += 1) rows.push({
                  ref: `c${String(index).padStart(14, '0')}`,
                  name: `Categoria completa ${index}`,
                  slug: `categoria-${index}`,
                  visible: true,
                  thumbnail: '',
                  requestedPriority: 1,
                });
              }
              if (sql.includes('pz-selector:subcategories')) {
                for (let index = 0; index < 200; index += 1) rows.push({
                  ref: `s${String(index).padStart(14, '0')}`,
                  name: `Subcategoria completa ${index}`,
                  slug: `subcategoria-${index}`,
                  visible: true,
                  categoryRef: '',
                  categoryName: '',
                  requestedPriority: 1,
                });
              }
            },
          };
        },
      };
    },
  };
  const context = {
    storeId: 'storeselector01',
    store: record('storeselector01', { slug: 'tienda-selector' }),
  };
  const requestedRefs = ['productselect01', 'categoryselect1', 'subcatselect001'];
  try {
    const response = selectors.buildSelectors(app, context, 'café%', requestedRefs);
    assert.equal(queries.length, 3);
    queries.forEach((query) => {
      assert.equal(query.bindings.storeId, context.storeId);
      assert.equal(query.bindings.refsJson, JSON.stringify(requestedRefs));
      assert.equal(Object.hasOwn(query.bindings, 'store_id'), false);
      assert.match(query.sql, /json_each\(\{:refsJson\}\)/);
      assert.match(query.sql, /ORDER BY requestedPriority ASC/);
      requestedRefs.forEach((ref) => assert.equal(query.sql.includes(ref), false));
    });
    const [productsQuery, categoriesQuery, subcategoriesQuery] = queries;
    assert.equal(productsQuery.bindings.search, '%café\\%%');
    assert.equal(categoriesQuery.bindings.search, '%café\\%%');
    assert.equal(subcategoriesQuery.bindings.search, '%café\\%%');
    for (const query of [categoriesQuery, subcategoriesQuery]) {
      assert.equal(query.bindings.taxonomyOffset, 0);
      assert.equal(query.bindings.taxonomyEnd, 101);
    }
    assert.match(productsQuery.sql, /WHERE products\.store = \{:storeId\}/);
    assert.match(productsQuery.sql, /input_refs\.ref = products\.id/);
    assert.match(productsQuery.sql, /requestedPriority = 0 OR selectorRank <= 200/);
    assert.match(productsQuery.sql, /LIMIT 300/);
    assert.match(categoriesQuery.sql, /WHERE categories\.store = \{:storeId\}/);
    assert.match(categoriesQuery.sql, /WHERE products\.store = \{:storeId\}/);
    assert.match(categoriesQuery.sql, /WHERE subcategories\.store = \{:storeId\}/);
    assert.match(categoriesQuery.sql, /input_refs\.ref = products\.id/);
    assert.match(categoriesQuery.sql, /input_refs\.ref = subcategories\.id/);
    assert.match(categoriesQuery.sql, /LIMIT 201/);
    assert.match(subcategoriesQuery.sql, /WHERE subcategories\.store = \{:storeId\}/);
    assert.match(subcategoriesQuery.sql, /WHERE products\.store = \{:storeId\}/);
    assert.match(subcategoriesQuery.sql, /input_refs\.ref = products\.id/);
    assert.match(subcategoriesQuery.sql, /LIMIT 201/);
    assert.equal(response.categories.length, 101);
    assert.equal(response.subcategories.length, 101);
    assert.deepEqual(response.taxonomy, {
      page: 1,
      per_page: 100,
      categories_has_more: false,
      subcategories_has_more: true,
      has_more: true,
    });
    assert.equal(response.products[0].ref, 'productselect01');
    assert.equal(response.categories[0].ref, 'categoryselect1');
    assert.equal(response.subcategories[0].ref, 'subcatselect001');
    assert.deepEqual(Object.keys(response.products[0]), [
      'ref', 'name', 'slug', 'public_path', 'thumbnail_url',
      'category_ref', 'category_name', 'subcategory_ref', 'subcategory_name', 'visible',
    ]);
    assert.deepEqual(Object.keys(response.categories[0]), [
      'ref', 'name', 'slug', 'public_path', 'thumbnail_url', 'visible',
    ]);
    assert.deepEqual(Object.keys(response.subcategories[0]), [
      'ref', 'name', 'slug', 'public_path', 'thumbnail_url', 'category_ref', 'category_name', 'visible',
    ]);
    assert.equal(response.products[0].category_ref, 'categoryselect1');
    assert.equal(response.products[0].subcategory_ref, 'subcatselect001');
    assert.match(response.products[0].thumbnail_url, /^\/api\/files\/products\/productselect01\//);
    const keys = collectKeys(response);
    for (const forbidden of [
      'base_price_usd', 'cost_usd', 'expiration_date', 'internal_ref', 'price', 'profit_margin',
      'provider', 'sku', 'stock', 'store', 'store_id', 'supplier',
    ]) assert.equal(keys.has(forbidden), false, forbidden);

    const secondPage = selectors.buildSelectors(app, context, '', [], 2, 50);
    assert.equal(queries.length, 5, 'paginas de taxonomia posteriores omiten consulta de productos');
    assert.equal(secondPage.products.length, 0);
    assert.equal(queries[3].bindings.taxonomyOffset, 50);
    assert.equal(queries[3].bindings.taxonomyEnd, 101);
    assert.equal(queries[4].bindings.taxonomyOffset, 50);
    assert.equal(secondPage.taxonomy.page, 2);
    assert.equal(secondPage.taxonomy.per_page, 50);
    assert.equal(secondPage.taxonomy.has_more, true);
  } finally {
    if (previousArrayOf === undefined) delete global.arrayOf;
    else global.arrayOf = previousArrayOf;
    if (previousDynamicModel === undefined) delete global.DynamicModel;
    else global.DynamicModel = previousDynamicModel;
  }
});

test('allowlists de auditoría reconocen team_permissions_normalized', () => {
  assert.equal(storeTeam.TEAM_AUDIT_ACTIONS.includes('team_permissions_normalized'), true);
  assert.equal(masterUsers.TEAM_AUDIT_ACTIONS.includes('team_permissions_normalized'), true);
});
