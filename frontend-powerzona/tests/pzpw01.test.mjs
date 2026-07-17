import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const route = read('src/pages/master/price-watch/[watchId].astro');
const list = read('src/pages/master/price-watch.astro');
const detail = read('src/components/master/MasterPriceWatchDetailView.astro');
const styles = read('src/styles/master-price-watch-detail.css');
const watches = read('src/lib/masterProductWatches.ts');
const notifications = read('src/lib/masterNotifications.ts');
const bell = read('src/components/master/MasterNotificationsBell.astro');
const notificationsView = read('src/components/master/MasterNotificationsView.astro');
const productView = read('src/components/master/MasterProductReadonlyView.astro');

test('existe la ruta exclusiva por watchId y consume el endpoint privado sanitizado', () => {
  assert.match(route, /Astro\.params\.watchId/);
  assert.match(route, /getMasterProductWatchDetail/);
  assert.match(watches, /\/api\/pz\/master\/product-watch-detail/);
  assert.match(watches, /watch_id: safeWatchId/);
  assert.doesNotMatch(watches, /fingerprint|dedupe_key/);
});

test('volver conserva solo página, estado, tienda y búsqueda validados', () => {
  for (const key of ['return_page', 'return_status', 'return_store_id', 'return_q']) {
    assert.match(route, new RegExp(key));
    assert.match(list, new RegExp(key));
  }
  assert.match(route, /\^\[a-z0-9\]\{15\}\$/);
  assert.match(route, /slice\(0, 100\)/);
  assert.doesNotMatch(route, /return_url|redirect_uri|new URL\(Astro\.url\.searchParams/);
  assert.match(detail, />Volver a seguimiento</);
});

test('detalle es exclusivo y omite los bloques amplios de la ficha general', () => {
  for (const forbidden of ['Información general', 'Descripción', 'Datos adicionales', 'Productos relacionados']) {
    assert.doesNotMatch(detail, new RegExp(forbidden, 'i'));
  }
  assert.match(detail, /Precio mínimo actual/);
  assert.match(detail, /Producto eliminado/);
  assert.match(detail, /Ver ficha del producto/);
});

test('formulario objetivo valida cliente y llama payload exacto', () => {
  assert.match(detail, /Activar alerta/);
  assert.match(detail, /Guardar objetivo/);
  assert.match(detail, /max="999999999\.99"/);
  assert.match(detail, /\^\\d\+\(\?:\\\.\\d\{1,2\}\)\?\$/);
  assert.match(watches, /\/api\/pz\/master\/product-watch-target/);
  assert.match(watches, /target_alert_enabled: targetAlertEnabled/);
  assert.match(watches, /target_price_usd: Math\.round\(target \* 100\) \/ 100/);
});

test('historial pagina diez eventos y muestra snapshots del objetivo', () => {
  assert.match(detail, /Historial de precios/);
  assert.match(detail, /<span>Objetivo<\/span>/);
  assert.match(detail, /item\.target_met/);
  assert.match(detail, /Objetivo alcanzado/);
  assert.match(watches, /slice\(0, 10\)/);
  assert.match(detail, /history\.total_pages/);
});

test('listado abre siempre por watch id y presenta objetivo alcanzado', () => {
  assert.match(list, /detailUrl\(item\.id\)/);
  assert.match(list, /target_alert_enabled/);
  assert.match(list, /watch-target-badge/);
  assert.match(list, /'is-met': item\.target_met/);
});

test('tone crítico llega a campana, página, badge textual y toast rojo', () => {
  assert.match(notifications, /MasterNotificationTone = 'normal' \| 'critical'/);
  assert.match(bell, /bell-item\.is-critical/);
  assert.match(bell, /Objetivo alcanzado/);
  assert.match(bell, /bell-toast\.is-critical/);
  assert.match(notificationsView, /notification-row\.is-critical/);
  assert.match(notificationsView, /Crítica · Objetivo alcanzado/);
});

test('ficha general conserva control compacto y enlaza al detalle exclusivo', () => {
  assert.match(productView, /Abrir detalle del seguimiento/);
  assert.match(productView, /\/master\/price-watch\/\$\{encodeURIComponent\(watch\.id\)\}/);
  assert.doesNotMatch(productView, /<h3>Historial de precios<\/h3>/);
});

test('responsive usa tarjetas móviles sin ancho rígido ni scroll horizontal propio', () => {
  for (const width of ['1180px', '768px', '520px']) assert.match(styles, new RegExp(width));
  assert.match(styles, /price-history-mobile/);
  assert.doesNotMatch(styles, /(?:^|[;{])\s*width:\s*(?:1440|1024|768|430|390|375)px/m);
  assert.doesNotMatch(styles, /overflow-x:\s*(?:auto|scroll)/);
});
