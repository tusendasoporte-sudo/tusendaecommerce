import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('el resumen se llama Analíticas, comparte cinco rangos y expone App instalaciones con Ver más', () => {
  const source = read('../src/pages/admin/index.astro');
  for (const range of ['today', '7', '15', '30', '90']) {
    assert.match(source, new RegExp(`data-range="${range}"`));
  }
  assert.match(source, /<h2 id="dashboard-traffic-title">Analíticas<\/h2>/);
  assert.match(source, /data-analytics-tab="appinstallations"[^>]*>App instalaciones/);
  assert.match(source, /Instalaciones activas estimadas/);
  assert.match(source, /Nuevas del período/);
  assert.match(source, /Bajas detectadas/);
  assert.match(source, /id="app-installations-more"[^>]+>.*Ver más/s);
  assert.match(source, /id="app-installations-more"[^>]+\?range=today/);
  assert.match(source, /appInstallationsMore\.setAttribute\('href', `\$\{ADMIN_APP_INSTALLATIONS_PATH\}\?range=today`\)/);
  assert.match(source, /\/api\/pz\/storefront\/v1\/analytics\/installations/);
  assert.match(source, /fetchAppInstallationsSummary\(\)\.catch\(\(\) => null\)/);
  assert.match(source, /normalizeAppInstallationAnalytics/);
  assert.match(source, /value\.metrics\.instalaciones_vigentes_ahora !== value\.status\.active/);
  assert.match(source, /no se muestran ceros parciales/);
  assert.match(source, /ANALYTICS_MAX_RETENTION_DAYS = 90/);
  const pageviews = read('../src/pages/admin/pageviews.astro');
  assert.match(pageviews, /data-pageviews-period="90d"/);
  assert.match(pageviews, /ANALYTICS_MAX_RETENTION_DAYS = 90/);
  const master = read('../src/lib/masterStoreAnalytics.ts');
  assert.match(master, /MASTER_ANALYTICS_RANGES = \['today', '7', '15', '30', '90'\]/);
  const storeBackend = read('../../backend-powerzona/pb_hooks/pz_store_analytics_lib.js');
  const masterBackend = read('../../backend-powerzona/pb_hooks/pz_master_dashboard_lib.js');
  assert.match(storeBackend, /"today", "7", "15", "30", "90"/);
  assert.match(masterBackend, /"90": 90/);
});

test('Ver más presenta solo agregados, privacidad explícita y los mismos rangos', () => {
  const source = read('../src/pages/admin/app-installations.astro');
  const details = read('../src/pages/admin/app-installation-details.astro');
  const tenantRoute = read('../src/pages/t/[storeSlug]/admin/app-installations.astro');
  const tenantDetailsRoute = read('../src/pages/t/[storeSlug]/admin/app-installation-details.astro');
  const middleware = read('../src/middleware.ts');
  const backendRoutes = read('../../backend-powerzona/pb_hooks/pz_storefront_analytics.pb.js');
  const backendAnalytics = read('../../backend-powerzona/pb_hooks/pz_storefront_analytics_lib.js');
  assert.match(tenantRoute, /AdminAppInstallations/);
  assert.match(tenantDetailsRoute, /AdminAppInstallationDetails/);
  assert.match(middleware, /normalized === 'app-installation-details'/);
  assert.match(source, /hasStorePermission[\s\S]*'analytics\.view'/);
  assert.match(source, /X-PZ-Support-Store/);
  assert.match(source, /Cache-Control', 'private, no-store/);
  assert.match(source, /new Set\(\['today', '7', '15', '30', '90'\]\)/);
  assert.match(source, /Instalaciones activas estimadas/);
  assert.doesNotMatch(source, /Estado actual/);
  assert.match(source, /class="admin-compact-summary"/);
  assert.match(source, /admin-compact-summary__list/);
  assert.match(source, />Instalaciones<\/h2>/);
  assert.match(source, /Permisos de notificaciones/);
  assert.doesNotMatch(source, /premium-list-panel|premium-list-row/);
  assert.match(source, />Más detalles</);
  assert.match(source, /app-installation-details/);
  assert.doesNotMatch(source, /const groups =/);
  assert.doesNotMatch(source, /Países|Regiones/);
  assert.match(source, /Altas y bajas detectadas/);
  assert.match(source, /data-installation-period/);
  assert.match(source, /class="installations-chart"/);
  assert.doesNotMatch(source, /<table|<tbody|class="table-wrap"/);
  assert.doesNotMatch(source, /<p class="notice">\{analytics\.measurement_note\}<\/p>/);
  assert.match(source, /const analytics = normalizeAnalytics\(payload\)/);
  assert.doesNotMatch(source, /fid_digest|credential_digest|ip_ciphertext|firebase_message_id/);
  assert.match(backendRoutes, /analytics\/installations\/details/);
  assert.match(details, /const PAGE_SIZE = 10/);
  assert.match(details, /per_page: PAGE_SIZE/);
  assert.match(details, /installation_code/);
  assert.doesNotMatch(details, /app_identifier|package_name|Identificador de app|>Paquete</);
  assert.match(details, /class="pagination-bar"/);
  assert.match(details, /class="pagination-actions"/);
  assert.match(details, /Listado de instalaciones/);
  assert.match(details, /class="installation-list-head"/);
  assert.match(details, /class="installation-row"/);
  assert.match(details, /class="page-btn"/);
  assert.match(details, /10 por página/);
  assert.doesNotMatch(details, /fid_digest|app_set_digest|credential_digest|firebase_app_id/);
  assert.doesNotMatch(backendAnalytics, /app_identifier:/);
  assert.doesNotMatch(backendAnalytics, /package_name:/);
});

test('Campañas push queda como entrada independiente inmediatamente después de Promos y conserva la puerta Premium', () => {
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  const promos = sidebar.indexOf('title="Promos"');
  const push = sidebar.indexOf('aria-label="Campañas push"');
  const personal = sidebar.indexOf('title="Mis datos"');
  assert.ok(promos >= 0 && push > promos && personal > push);
  assert.match(sidebar, /canShowPushCampaignsNav/);
  assert.match(sidebar, /push_campaigns_enabled/);
  assert.match(sidebar, /marketing\.push\.manage/);

  const page = read('../src/pages/admin/push-campaigns.astro');
  assert.match(page, /showPremiumGate = pushAccess\.isPrimaryAdmin && !pushAccess\.capability\.allowed/);
  assert.match(page, /StoreCapabilityGate/);
  assert.match(page, /Plan Premium requerido/);
  assert.match(page, /status: 404/);
});

test('checkout reenvía solo cookies públicas permitidas y la atribución nunca bloquea una compra', () => {
  const orders = read('../src/pages/api/checkout/orders.ts');
  assert.match(orders, /pz_storefront_session/);
  assert.match(orders, /STOREFRONT_SESSION_PATTERN/);
  assert.match(orders, /publicSecurityProxyHeaders/);
  assert.doesNotMatch(orders, /headers\.Cookie\s*=\s*raw/);

  const couponProxy = read('../src/pages/api/checkout/coupon-attribution.ts');
  assert.match(couponProxy, /\/api\/pz\/checkout\/coupon-attribution/);
  assert.match(couponProxy, /MAX_BODY_BYTES = 65536/);
  assert.match(couponProxy, /attributed: false/);
  assert.match(couponProxy, /catch \(_\)[\s\S]*attributed: false/);

  const checkout = read('../src/pages/checkout.astro');
  assert.match(checkout, /reportedCouponAttributions/);
  assert.match(checkout, /\/api\/checkout\/coupon-attribution/);
  assert.match(checkout, /product_id: item\.id/);
  assert.match(checkout, /shipping_zone_id: shippingZone\?\.id \|\| ''/);

  const backend = read('../../backend-powerzona/pb_hooks/pz_order_pricing_lib.js');
  assert.match(backend, /parseCouponAttributionPayload/);
  assert.match(backend, /buildCheckoutPlan\(txApp, parsed, now\)/);
  assert.match(backend, /plan\.totals\.couponWinner !== "manual_coupon"/);
});

test('el evento nativo exige App Check, credencial, contrato exacto e idempotencia determinista', () => {
  const route = read('../src/pages/api/storefront/v1/events.ts');
  assert.match(route, /storefrontNativeGateway/);
  assert.match(route, /action: 'events_record'/);
  assert.match(route, /credential: 'required'/);
  assert.match(route, /normalizeStorefrontEventPayload/);
  assert.match(route, /mapStorefrontEventResponse/);

  const contracts = read('../src/lib/storefrontPushContracts.ts');
  assert.match(contracts, /idempotencyKey !== `\$\{eventType\}:\$\{deliveryId\}`/);
  assert.match(contracts, /source\.event_type === 'opened' \|\| source\.event_type === 'destination_viewed'/);
  assert.match(contracts, /__order_verified__/);
});
