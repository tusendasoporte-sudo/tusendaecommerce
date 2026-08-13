import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  STORE_ACTIVITY_API_PATHS,
  clearStoreLastModifiedCache,
  getStoreActivityDetail,
  getStoreActivityResourcePath,
  getStoreActivitySummary,
  getStoreActivityUserReport,
  getStoreLastModifiedBatch,
  getStoreSelfActivity,
  listStoreActivity,
  reviewStoreActivity,
} from '../src/lib/storeActivity.ts';
import {
  STORE_TEAM_API_PATHS,
  deleteStoreTeamUser,
} from '../src/lib/storeTeam.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('M7U2-C2: cliente de actividad usa endpoints privados y actor_id solo donde corresponde', async () => {
  const calls = [];
  const event = {
    id: 'activity0000001',
    actor_name: 'María González',
    actor_state: 'active',
    module: 'catalog',
    action: 'product_updated',
    severity: 'critical',
    resource_type: 'product',
    resource_label: 'Creatina',
    resource_state: 'active',
    resource_path: '/t/tienda-qa/admin/products?product=product00000001',
    changed_fields: ['price', 'stock'],
    previous_values: { price: 25, stock: 8 },
    new_values: { price: 22, stock: 12 },
    summary: 'Cambió precio y stock',
    created: '2026-07-20T19:42:00.000Z',
    review: { status: 'pending', note: '' },
  };
  const fetcher = async (url, options) => {
    const body = JSON.parse(String(options.body || '{}'));
    calls.push({ url, options, body });
    if (url.endsWith(STORE_ACTIVITY_API_PATHS.summary)) {
      return jsonResponse({ ok: true, summary: { changes_today: 1, pending_reviews: 1, critical_changes: 1, users_with_activity: 1 } });
    }
    if (url.endsWith(STORE_ACTIVITY_API_PATHS.userReport)) {
      return jsonResponse({ ok: true, actor: { name: 'María González', state: 'active' }, summary: { total_changes: 1 }, events: [event], pagination: { page: 1, per_page: 20, total_items: 1, total_pages: 1 } });
    }
    if (url.endsWith(STORE_ACTIVITY_API_PATHS.self)) {
      return jsonResponse({ ok: true, events: [event], pagination: { page: 1, per_page: 20, total_items: 1, total_pages: 1 } });
    }
    return jsonResponse({ ok: true, events: [event], actors: [{ ref: 'actor000000001', name: 'María González', state: 'active' }], pagination: { page: 1, per_page: 20, total_items: 1, total_pages: 1 } });
  };
  const options = { baseUrl: 'https://pb.example.test/', token: 'private-token', fetcher };

  const summary = await getStoreActivitySummary({ module: 'catalog' }, options);
  const list = await listStoreActivity({ user_id: 'actor000000001', module: 'catalog', resource_type: 'product', resource_id: 'product00000001', page: 1 }, options);
  const report = await getStoreActivityUserReport('actor000000001', { page: 1 }, options);
  const self = await getStoreSelfActivity({ user_id: 'forbidden-user', review_status: 'reviewed', page: 1 }, options);

  assert.deepEqual(calls[0].body, {});
  assert.equal(calls[1].body.actor_id, 'actor000000001');
  assert.equal(calls[1].body.resource_type, 'product');
  assert.equal(calls[1].body.resource_id, 'product00000001');
  assert.equal(Object.hasOwn(calls[1].body, 'user_id'), false);
  assert.equal(Object.hasOwn(calls[1].body, 'store_id'), false);
  assert.equal(calls[2].body.actor_id, 'actor000000001');
  assert.equal(Object.hasOwn(calls[3].body, 'actor_id'), false);
  assert.equal(Object.hasOwn(calls[3].body, 'user_id'), false);
  assert.equal(Object.hasOwn(calls[3].body, 'review_status'), false);
  assert.equal(Object.hasOwn(calls[3].body, 'store_id'), false);
  assert.equal(summary.summary.pending_review, 1);
  assert.equal(list.actors[0].label, 'María González');
  assert.equal(list.items[0].changes[0].before, '25');
  assert.equal(list.items[0].changes[0].after, '22');
  assert.equal(report.user.display_name, 'María González');
  assert.equal(self.items[0].can_review, false);
  assert.equal(self.items[0].review.note, '');
});

test('M7U2-C2: detalle y review normalizan el contrato sin alterar el evento original', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(String(options.body || '{}')) });
    if (url.endsWith(STORE_ACTIVITY_API_PATHS.detail)) {
      return jsonResponse({ ok: true, event: {
        id: 'activity0000001',
        actor_name: 'Usuario histórico',
        actor_state: 'deleted',
        module: 'team',
        action: 'user_deleted',
        severity: 'critical',
        resource_type: 'team_user',
        resource_label: 'Usuario eliminado',
        resource_state: 'deleted',
        summary: 'Usuario eliminado permanentemente',
        created: '2026-07-20T19:42:00.000Z',
        review: { status: 'pending', note: '' },
      } });
    }
    return jsonResponse({ ok: true, review: { status: 'requires_correction', note: 'Verificar permisos', reviewed_at: '2026-07-20T20:00:00.000Z' } });
  };
  const options = { baseUrl: 'https://pb.example.test', token: 'private-token', fetcher };
  const detail = await getStoreActivityDetail('activity0000001', options);
  const review = await reviewStoreActivity('activity0000001', 'requires_correction', 'Verificar permisos', options);

  assert.equal(detail.item.actor.is_deleted, true);
  assert.equal(detail.item.resource.exists, false);
  assert.deepEqual(calls[0].body, { activity_id: 'activity0000001' });
  assert.deepEqual(calls[1].body, { activity_id: 'activity0000001', status: 'requires_correction', note: 'Verificar permisos' });
  assert.equal(review.item, undefined);
  assert.equal(review.review.status, 'requires_correction');
  await assert.rejects(
    reviewStoreActivity('activity0000001', 'requires_correction', 'corta', options),
    (error) => error.code === 'correction_note_required',
  );
});

test('M7U2-C2: last-modified deduplica, consulta un solo lote y usa caché corta', async () => {
  clearStoreLastModifiedCache();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(String(options.body || '{}')) });
    return jsonResponse({ ok: true, items: {
      'product:product00000001': {
        actor_name: 'María González',
        actor_state: 'active',
        created: '2026-07-20T19:42:00.000Z',
        summary: 'Cambió precio y stock',
        severity: 'critical',
      },
    } });
  };
  const options = { baseUrl: 'https://pb.example.test', token: 'private-token', fetcher };
  const resources = [
    { type: 'product', id: 'product00000001' },
    { type: 'product', id: 'product00000001' },
  ];
  const first = await getStoreLastModifiedBatch(resources, options);
  const second = await getStoreLastModifiedBatch(resources, options);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://pb.example.test${STORE_ACTIVITY_API_PATHS.lastModified}`);
  assert.deepEqual(calls[0].body.resources, [{ type: 'product', id: 'product00000001' }]);
  assert.equal(first['product:product00000001'].actor_name, 'María González');
  assert.equal(second['product:product00000001'].summary, 'Cambió precio y stock');
  clearStoreLastModifiedCache();
});

test('M7U2-C2: mapa de rutas permite destinos internos y rechaza redirects arbitrarios', () => {
  const safe = getStoreActivityResourcePath('tienda-qa', {
    type: 'product',
    route_key: 'product',
    id_snapshot: '',
    exists: true,
    path: '/t/tienda-qa/admin/products?product=product00000001',
  });
  const hostile = getStoreActivityResourcePath('tienda-qa', {
    type: 'product',
    route_key: 'product',
    id_snapshot: 'product00000001',
    exists: true,
    path: 'https://attacker.example/steal',
  });
  const deleted = getStoreActivityResourcePath('tienda-qa', {
    type: 'order', route_key: 'order', id_snapshot: 'order000000001', exists: false, path: '',
  });
  const variation = getStoreActivityResourcePath('tienda-qa', {
    type: 'product_variation', route_key: 'product_variation', id_snapshot: 'variant00000001', exists: true, path: '',
  });

  assert.equal(safe, '/t/tienda-qa/admin/products?product=product00000001');
  assert.equal(hostile, '/t/tienda-qa/admin/products?product=product00000001');
  assert.equal(deleted, '');
  assert.equal(variation, '/t/tienda-qa/admin/products');
});

test('M7U2-C2/C2F1: eliminación normaliza correo y envía motivo allowlisted sin tienda ni actor', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(String(options.body || '{}')) });
    return jsonResponse({ ok: true, user_deleted: true, user_id: 'user0000000001', sessions_revoked: true });
  };
  const options = { baseUrl: 'https://pb.example.test/', token: 'private-token', fetcher };
  const response = await deleteStoreTeamUser(
    'user0000000001',
    ' PERSONA@EXAMPLE.COM ',
    'access_no_longer_needed',
    'texto que debe descartarse',
    options,
  );

  assert.equal(calls[0].url, `https://pb.example.test${STORE_TEAM_API_PATHS.delete}`);
  assert.deepEqual(calls[0].body, {
    user_id: 'user0000000001',
    confirmation_email: 'persona@example.com',
    reason_code: 'access_no_longer_needed',
    reason_detail: '',
  });
  assert.equal(Object.hasOwn(calls[0].body, 'store_id'), false);
  assert.equal(Object.hasOwn(calls[0].body, 'actor_id'), false);
  assert.equal(response.user_deleted, true);
  await assert.rejects(
    deleteStoreTeamUser('user0000000001', 'persona@example.com', 'other', 'corto', options),
    (error) => error.code === 'delete_reason_detail_too_short',
  );
  assert.equal(calls.length, 1);
});

test('M7U2-C2: UI cubre tabs, reporte, self aislado y diálogo destructivo sin romper C1', () => {
  const team = read('../src/components/admin/StoreTeamView.astro');
  const activity = read('../src/components/admin/StoreActivityView.astro');
  const activityStyles = read('../src/styles/store-activity.css');
  const middleware = read('../src/middleware.ts');
  const account = read('../src/pages/t/[storeSlug]/admin/account.astro');
  const accountHistory = read('../src/pages/t/[storeSlug]/admin/account/history.astro');
  const report = read('../src/pages/admin/team/[userId]/activity.astro');
  const wrapper = read('../src/pages/t/[storeSlug]/admin/team/[userId]/activity.astro');

  assert.match(team, /data-team-tab="users"/);
  assert.match(team, /data-team-tab="activity"/);
  assert.match(team, /<StoreActivityView[\s\S]*?mode="team"[\s\S]*?deferred=\{true\}/);
  assert.match(team, /data-team-action="activity">Ver actividad/);
  assert.match(team, /data-team-action="delete">Eliminar permanentemente/);
  assert.match(team, /name="confirmation_email"[\s\S]*?name="reason_code"[\s\S]*?name="reason_detail"/);
  assert.match(team, /minlength="8"/);
  assert.match(team, /maxlength="300"/);
  assert.match(team, /if \(deletingUser \|\| !pendingDeleteUser/);
  assert.match(team, /confirmationEmail !== expectedEmail/);
  assert.match(team, /deleteDialog\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(team, /await loadTeam\('Usuario eliminado permanentemente'\)/);
  const teamMarkup = team.slice(0, team.indexOf('<script define:vars'));
  assert.equal((teamMarkup.match(/data-team-floating-menu/g) || []).length, 1);
  assert.match(team, /window\.setTimeout\(\(\) => hideTeamToast\(\), 3800\)/);

  assert.match(activity, /Cambios hoy/);
  assert.match(activity, /Pendientes de revisar/);
  assert.match(activity, /data-activity-filter-form/);
  assert.match(activity, /name="action"/);
  assert.match(activity, /resource_type: resourceTypeFilter/);
  assert.match(activity, /resource_id: resourceIdFilter/);
  assert.match(activity, /STORE_ACTIVITY_PAGE_SIZE/);
  assert.match(activity, /Ver cambio/);
  assert.match(activity, /Requiere corrección/);
  assert.match(activity, /event\.review\.status === 'requires_correction'[\s\S]*?openReviewDialog\(event, 'reviewed'\)/);
  assert.match(activity, /Nueva nota de cierre/);
  assert.match(activity, /reviewStatus === 'reviewed'[\s\S]*?Corrección cerrada y cambio marcado como revisado/);
  assert.match(activity, /Antes/);
  assert.match(activity, /Después/);
  assert.match(activity, /if \(mode === 'self'\)/);
  assert.match(activity, /getStoreSelfActivity/);
  assert.doesNotMatch(activity, /JSON\.stringify/);
  assert.doesNotMatch(activity, /Deshacer/);
  assert.match(activityStyles, /@media \(max-width: 760px\)[\s\S]*?\.store-activity-item \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);

  assert.match(account, /Ver historial/);
  assert.doesNotMatch(account, /<StoreActivityView/);
  assert.match(accountHistory, /<StoreActivityView[\s\S]*?mode="self"/);
  assert.match(accountHistory, /filtersInitiallyOpen=\{false\}/);
  assert.match(accountHistory, /pageSize=\{10\}/);
  assert.match(report, /<StoreActivityView[\s\S]*?mode="user"/);
  assert.match(wrapper, /AdminTeamUserActivity/);
  assert.match(middleware, /normalized === 'team' \|\| normalized\.startsWith\('team\/'\)/);
});

test('M7U2-C2: metadato reutilizable integra una consulta batch en módulos reales', () => {
  const component = read('../src/components/admin/LastModificationMeta.astro');
  const client = read('../src/lib/storeActivity.ts');
  const team = read('../src/components/admin/StoreTeamView.astro');
  const products = read('../src/pages/admin/products.astro');
  const orders = read('../src/pages/admin/orders.astro');
  const expirations = read('../src/pages/admin/expirations.astro');
  const settings = read('../src/pages/admin/store-settings.astro');
  const catalog = read('../src/pages/admin/catalog.astro');
  const shipping = read('../src/pages/admin/shipping.astro');
  const promos = read('../src/pages/admin/promos.astro');
  const gifts = read('../src/pages/admin/gifts.astro');
  const raffles = read('../src/pages/admin/promos/raffles.astro');
  const landing = read('../src/components/admin/LandingQrSettings.astro');
  const securityPage = read('../src/pages/t/[storeSlug]/admin/security.astro');
  const securityView = read('../src/components/admin/SecurityMonitoringView.astro');

  assert.match(component, /getStoreLastModifiedBatch/);
  assert.match(component, /new MutationObserver/);
  assert.match(component, /astro:before-swap/);
  assert.match(component, /lifecycleController\.abort\(\)/);
  assert.match(component, /slice\(0, 100\)/);
  assert.match(component, /if \(!config\.enabled \|\| !config\.baseUrl\)[\s\S]*?return;[\s\S]*?const token = readPocketBaseAuthToken\(\)/);
  assert.match(client, /LAST_MODIFIED_CACHE_TTL_MS = 15_000/);
  assert.match(client, /new Map<string, \{ expires:/);
  assert.equal((component.match(/getStoreLastModifiedBatch\(/g) || []).length, 1);
  assert.match(team, /data-resource-type="team_user"/);
  assert.match(products, /data-resource-type="product"/);
  assert.match(orders, /data-resource-type="order"/);
  assert.match(expirations, /'product_variation' : 'product'/);
  assert.match(settings, /resourceType="settings"/);
  assert.match(settings, /setAttribute\('data-resource-id', resourceId\)/);
  assert.match(catalog, /data-resource-type="category"/);
  assert.match(catalog, /data-resource-type="subcategory"/);
  assert.match(shipping, /data-resource-type="shipping_zone"/);
  assert.match(promos, /data-resource-type="visual_item"/);
  assert.match(promos, /data-resource-type="promotion"/);
  assert.match(promos, /data-resource-type="coupon"/);
  assert.match(gifts, /data-resource-type="gift"/);
  assert.match(raffles, /data-resource-type="raffle"/);
  assert.match(settings, /data-resource-type="review"/);
  assert.match(settings, /data-resource-type="currency"/);
  assert.match(settings, /data-settings-last-modification/);
  assert.match(settings, /const settingsResourceId = String\(footerPreviewSettings\?\.id \|\| ''\)\.trim\(\)/);
  assert.match(settings, /id="settings-last-modification"[\s\S]*?resourceId=\{settingsResourceId\}/);
  assert.match(landing, /data-landing-last-modification[\s\S]*?data-resource-type="settings"/);
  assert.match(securityPage, /<LastModificationMeta[\s\S]*?controllerOnly=\{true\}[\s\S]*?is_primary_admin === true/);
  assert.match(securityView, /data-resource-type="security_settings"/);
  assert.match(securityView, /data-resource-type="security_block"/);
});

test('M7U2-C2: detalles enlazan al centro de historial sin exponer IDs ni redirects', () => {
  const team = read('../src/components/admin/StoreTeamView.astro');
  const products = read('../src/pages/admin/products.astro');
  const orders = read('../src/pages/admin/orders.astro');
  const expirations = read('../src/pages/admin/expirations.astro');
  const raffles = read('../src/pages/admin/promos/raffles.astro');

  assert.match(team, /params\.get\('tab'\) === 'activity'/);
  assert.match(products, /id="product-history-link"[\s\S]*?>Ver historial</);
  assert.match(products, /syncProductHistoryLink\(product\.id\)/);
  assert.match(products, /PRODUCT_HISTORY_BASE_PATH[\s\S]*?\/history\?from=products/);
  assert.match(orders, /resource_type: 'order', resource_id: initialOrderId/);
  assert.match(orders, /href=\{adminOrderHistoryPath\}>Ver historial/);
  assert.match(orders, /id="order-history-link"[\s\S]*?function fillDetail[\s\S]*?resource_id: orderId/);
  assert.match(expirations, /productHistoryPath\(item\?\.product_id, isVariationUnit \? variation\?\.id : ''\)/);
  assert.match(raffles, /activityHistoryPath\('raffle', raffle\.id\)/);
  [raffles].forEach((source) => {
    assert.match(source, /new URLSearchParams\(\{[\s\S]*?resource_type:[\s\S]*?resource_id:/);
  });
});
