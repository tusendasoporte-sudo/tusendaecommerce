import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const client = read('src/lib/promoMaster.ts');
const detail = read('src/pages/master/stores/[storeId].astro');
const list = read('src/components/master/MasterStoresView.astro');
const view = read('src/components/master/MasterPromoStoreView.astro');
const sidebar = read('src/components/master/MasterSidebar.astro');

test('cliente Master Promo usa exclusivamente POST privados, contexto header y contratos exactos', () => {
  for (const route of [
    '/api/pz/promo/master/v1/stores/catalog',
    '/api/pz/promo/master/v1/overview',
    '/api/pz/promo/master/v1/lifecycle/update',
    '/api/pz/promo/master/entitlements/update',
    '/api/pz/promo/private/v1/domains/create',
    '/api/pz/promo/private/v1/domains/verify',
    '/api/pz/promo/private/v1/domains/status/update',
    '/api/pz/promo/private/v1/themes/releases/update',
    '/api/pz/promo/private/v1/publication/candidates/create',
    '/api/pz/promo/private/v1/publication/publish',
    '/api/pz/promo/private/v1/publication/rollback',
    '/api/pz/promo/private/v1/publication/unpublish',
    '/api/pz/promo/private/v1/publication/canonical/switch',
    '/api/pz/promo/private/v1/publication/pause',
    '/api/pz/promo/private/v1/publication/resume',
  ]) assert.match(client, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(client, /'X-PZ-Promo-Store'/);
  assert.match(client, /idempotency_key/);
  assert.match(client, /expected_generation/);
  assert.doesNotMatch(client, /collection\('promo_/);
});

test('detalle solo habilita Commerce tras store_not_promo explícito y no degrada ante fallos', () => {
  assert.match(detail, /promoResult\.status === 404 && promoResult\.error === 'store_not_promo'/);
  assert.match(detail, /isPromo && promoResult\.data/);
  assert.match(detail, /explicitCommerce && commerceResult\?\.data/);
  assert.match(detail, /Tipo de tienda temporalmente no disponible/);
  assert.doesNotMatch(view, /MasterStoreOverviewView|MasterStoreActionsController/);
});

test('listado y sidebar separan Promo de acciones Commerce sin publicar shell futuro', () => {
  assert.match(list, /store\.storeType === 'promo'/);
  assert.match(list, /Abrir control Promo/);
  assert.match(sidebar, /currentStore\.storeType !== 'promo'/);
  assert.doesNotMatch(view, /\/t\/|\/admin|carrito|checkout|Productos|Pedidos|App Android/);
});

test('rutas Master específicas de Commerce fallan cerradas para Promo o clasificación ausente', () => {
  for (const route of [
    'src/pages/master/stores/[storeId]/plan.astro',
    'src/pages/master/stores/[storeId]/app.astro',
    'src/pages/master/stores/[storeId]/users/index.astro',
    'src/pages/master/stores/[storeId]/users/[userId].astro',
    'src/pages/master/products/[storeId].astro',
    'src/pages/master/products/[storeId]/[productId].astro',
    'src/pages/master/analytics/[storeId].astro',
    'src/pages/master/analytics/[storeId]/orders/[orderId].astro',
    'src/pages/master/security/[storeId].astro',
    'src/pages/master/security/[storeId]/visitors/[visitorSessionId].astro',
  ]) {
    const source = read(route);
    assert.match(source, /getMasterStoreKind/);
    assert.match(source, /!== 'commerce'/);
    assert.match(source, /\/master\/stores\/\$\{encodeURIComponent\(storeId\)\}/);
  }
});

test('UI limita Master a lifecycle, capacidades, dominios y catálogo sin flujo editorial', () => {
  assert.match(view, /El Admin guarda directamente/);
  assert.match(view, /estado canónico es informativo/i);
  assert.match(view, /overview\.site\.allowed_next_statuses/);
  assert.match(view, /binding\.allowed_next_statuses/);
  assert.match(view, /release\.allowed_next_statuses/);
  assert.match(view, /aria-live="polite"/);
  assert.match(view, /promo_capability_denied/);
  assert.match(view, /verification_evidence_sha256/);
  assert.doesNotMatch(view, /overview\.publication\.controls|overview\.revisions|Crear candidato|Rollback|Publicar revisión/);
  assert.doesNotMatch(view, /actor_id|tenant_id|site_id|filter:|expand:/);
  assert.doesNotMatch(view, /\['landing_qr_bridge_enabled',|Landing QR/);
  assert.match(view, /capabilities\.landing_qr_bridge_enabled = false/);
  assert.doesNotMatch(view, /Máximo de fotos en la página|\['max_gallery_assets',/);
  assert.match(view, /capabilities\.max_gallery_assets = 150/);
});
