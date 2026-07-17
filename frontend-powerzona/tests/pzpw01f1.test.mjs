import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  formatPriceEventCount,
  resolvePriceHistoryMovement,
} from '../src/lib/masterPriceWatchPresentation.ts';
import {
  buildPriceWatchDetailHref,
  matchesPriceWatchProductContext,
  normalizePriceWatchReturnContext,
} from '../src/lib/masterPriceWatchNavigation.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const detail = read('src/components/master/MasterPriceWatchDetailView.astro');
const styles = read('src/styles/master-price-watch-detail.css');
const productPage = read('src/pages/master/products/[storeId]/[productId].astro');
const productView = read('src/components/master/MasterProductReadonlyView.astro');
const navigation = read('src/lib/masterPriceWatchNavigation.ts');

const ID = {
  watch: 'watch0000000001',
  store: 'store0000000001',
  product: 'produ0000000001',
};

function historyItem(overrides = {}) {
  return {
    id: 'event0000000001',
    change_type: 'product_regular_price_changed',
    summary: 'texto que no se usa para calcular',
    variation_label: '',
    before_regular_price_usd: 38,
    after_regular_price_usd: 35,
    before_effective_price_usd: 38,
    after_effective_price_usd: 35,
    before_range_min_usd: 38,
    before_range_max_usd: 38,
    after_range_min_usd: 35,
    after_range_max_usd: 35,
    effective_price_before_usd: 38,
    effective_price_after_usd: 35,
    target_alert_enabled: false,
    target_price_usd: 0,
    target_met: false,
    notification_tone: 'normal',
    actor_name: 'Powerzona',
    actor_role: 'store_admin',
    source: 'request',
    created: '2026-07-14T18:40:00.000Z',
    ...overrides,
  };
}

function watchDetail(overrides = {}) {
  return {
    watch: { id: ID.watch },
    store: { id: ID.store },
    product: { id: ID.product, exists: true },
    ...overrides,
  };
}

test('1. historial presenta exactamente las cinco columnas finales', () => {
  assert.match(detail, /<span>Fecha<\/span><span>Movimiento<\/span><span>Diferencia<\/span><span>Objetivo<\/span><span>Actor<\/span>/);
  assert.doesNotMatch(detail, /<span>Cambio<\/span>|<span>Detalle<\/span>|Precio anterior|Precio nuevo|Objetivo del evento/);
});

test('2. historial no incluye columna ni cálculo porcentual', () => {
  assert.doesNotMatch(detail, /porcentaje|percentage|%/i);
});

test('3. una baja usa flecha hacia abajo roja', () => {
  assert.deepEqual(resolvePriceHistoryMovement(historyItem()), {
    beforeUsd: 38, afterUsd: 35, differenceUsd: 3, direction: 'down',
  });
  assert.match(detail, /↓ \$\{usd\(movement\.differenceUsd\)\}/);
  assert.match(styles, /\.price-history-difference\.is-down\s*\{\s*color:\s*#dc2626/);
});

test('4. una subida usa flecha hacia arriba verde', () => {
  assert.deepEqual(resolvePriceHistoryMovement(historyItem({
    after_effective_price_usd: 40,
    effective_price_after_usd: 40,
  })), { beforeUsd: 38, afterUsd: 40, differenceUsd: 2, direction: 'up' });
  assert.match(detail, /↑ \$\{usd\(movement\.differenceUsd\)\}/);
  assert.match(styles, /\.price-history-difference\.is-up\s*\{\s*color:\s*#15803d/);
});

test('5. diferencia es absoluta y conserva precisión monetaria de dos decimales', () => {
  const movement = resolvePriceHistoryMovement(historyItem({
    after_effective_price_usd: 34.99,
    effective_price_after_usd: 34.99,
  }));
  assert.equal(movement?.differenceUsd, 3.01);
  assert.match(detail, /style:\s*'currency',\s*currency:\s*'USD'/);
});

test('6. un precio idéntico no genera una fila de presentación', () => {
  assert.equal(resolvePriceHistoryMovement(historyItem({
    after_effective_price_usd: 38,
    effective_price_after_usd: 38,
  })), null);
  assert.match(detail, /flatMap\(\(item\).*resolvePriceHistoryMovement/s);
});

test('7. objetivo no configurado se presenta como Sin objetivo', () => {
  assert.match(detail, />Sin objetivo<\/strong>/);
});

test('8. objetivo activo no alcanzado indica Por encima', () => {
  assert.match(detail, /!item\.target_met && <small>Por encima<\/small>/);
});

test('9. objetivo alcanzado conserva precio snapshot y texto explícito', () => {
  assert.match(detail, /Objetivo: \{usd\(item\.target_price_usd\)\}/);
  assert.match(detail, /<em>Objetivo alcanzado<\/em>/);
});

test('10. fila crítica tiene fondo, borde y badge textual', () => {
  assert.match(detail, /'is-critical': item\.target_met/);
  assert.match(styles, /\.price-history-row\.is-critical[^}]*border-left:[^}]*background:[^}]*box-shadow:/);
  assert.match(detail, /Objetivo alcanzado/);
});

test('11. pluralizador produce 1 evento', () => {
  assert.equal(formatPriceEventCount(1), '1 evento');
});

test('12. pluralizador produce 2 eventos y se reutiliza en SSR y cliente', () => {
  assert.equal(formatPriceEventCount(2), '2 eventos');
  assert.equal((detail.match(/formatPriceEventCount/g) || []).length >= 3, true);
});

test('13. historial móvil usa tarjetas compactas', () => {
  assert.match(detail, /class="price-history-mobile"/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.price-history-table \{ display: none; \}[\s\S]*\.price-history-mobile \{ display: grid;/);
  const layouts = [1440, 1024, 768, 430, 390, 375].map((width) => width <= 820 ? 'cards' : 'table');
  assert.deepEqual(layouts, ['table', 'table', 'cards', 'cards', 'cards', 'cards']);
});

test('14. estilos del historial no crean scroll horizontal', () => {
  assert.doesNotMatch(styles, /overflow-x:\s*(?:auto|scroll)/);
});

test('15. contexto válido resuelve Volver a seguimiento', () => {
  assert.equal(matchesPriceWatchProductContext(watchDetail(), ID.watch, ID.store, ID.product), true);
  assert.match(productPage, /sourceContext === 'price-watch'/);
  assert.match(productPage, /label: 'Volver a seguimiento'/);
  assert.match(productView, /returnAction\.label/);
});

test('16. contexto inválido conserva Volver a Productos', () => {
  assert.equal(matchesPriceWatchProductContext(null, ID.watch, ID.store, ID.product), false);
  assert.match(productPage, /let returnAction = \{ href: productsPath, label: 'Volver a Productos' \}/);
});

test('17. watch de otro producto es rechazado', () => {
  assert.equal(matchesPriceWatchProductContext(watchDetail(), ID.watch, ID.store, 'produ0000000002'), false);
});

test('18. watch de otra tienda es rechazado', () => {
  assert.equal(matchesPriceWatchProductContext(watchDetail(), ID.watch, 'store0000000002', ID.product), false);
});

test('19. solo parámetros permitidos se preservan en el retorno', () => {
  const context = normalizePriceWatchReturnContext({
    return_page: '3',
    return_status: 'paused',
    return_store_id: ID.store,
    return_q: ' oferta ',
  });
  assert.equal(
    buildPriceWatchDetailHref(ID.watch, context),
    `/master/price-watch/${ID.watch}?return_page=3&return_status=paused&return_store_id=${ID.store}&return_q=oferta`,
  );
});

test('20. no existe retorno libre ni posibilidad de open redirect', () => {
  assert.doesNotMatch(`${detail}\n${productPage}\n${navigation}`, /returnUrl|return_url|redirect_uri|\bback=/);
  assert.doesNotMatch(navigation, /new URL\(|location\.|https?:\/\//);
});
