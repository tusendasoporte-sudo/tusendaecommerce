import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const checkout = readFileSync(new URL('../src/pages/checkout.astro', import.meta.url), 'utf8');
const checkoutProxy = readFileSync(new URL('../src/pages/api/checkout/orders.ts', import.meta.url), 'utf8');
const tenantCheckout = readFileSync(new URL('../src/pages/t/[storeSlug]/checkout.astro', import.meta.url), 'utf8');
const adminOrders = readFileSync(new URL('../src/pages/admin/orders.astro', import.meta.url), 'utf8');
const receipt = readFileSync(new URL('../src/pages/orden/[orderNumber]/[token].astro', import.meta.url), 'utf8');

function checkoutRequestBlock() {
  const start = checkout.indexOf('const checkoutResult = await createCanonicalCheckoutOrder({');
  const end = checkout.indexOf('\n\t\t\tconst createdOrder = checkoutResult.order;', start);
  assert.ok(start >= 0 && end > start, 'No se encontro el payload canonico del checkout');
  return checkout.slice(start, end);
}

test('checkout publico escribe mediante el endpoint backend canonico', () => {
  assert.match(checkout, /fetch\('\/api\/checkout\/orders'/);
  assert.match(checkoutProxy, /fetch\(`\$\{baseUrl\}\/api\/pz\/checkout\/orders`/);
  assert.match(checkoutProxy, /const headers = publicSecurityProxyHeaders\(request, clientAddress\)/);
  assert.match(checkoutProxy, /headers: checkoutProxyHeaders\(request, clientAddress\)/);
  assert.equal(checkout.includes("pocketbaseRequest('orders'"), false);
  assert.equal(checkout.includes("pocketbaseRequest('order_items'"), false);
  assert.equal(checkout.includes("pocketbaseRequest('manual_coupon_usages'"), false);
  assert.match(tenantCheckout, /import StoreCheckoutPage from '\.\.\/\.\.\/checkout\.astro'/);
  assert.match(tenantCheckout, /<StoreCheckoutPage \/>/);
});

test('payload oficial envia solo tienda, identidad de intento, cliente y referencias del carrito', () => {
  const block = checkoutRequestBlock();
  for (const expected of [
    'store_id: CURRENT_STORE_ID',
    'idempotency_key: receiptToken',
    'currency_id: currencyId',
    'shipping_zone_id:',
    'coupon_code:',
    'product_id: item.id',
    "variation_id: item.variation_id || ''",
    'quantity: Number(item.quantity || 1)',
  ]) assert.ok(block.includes(expected), expected);
  for (const forbidden of [
    'unit_price_usd',
    'unit_price_final_usd',
    'variation_price_usd',
    'product_name',
    'variation_name',
    'line_total_usd',
    'subtotal:',
    'shipping:',
    'total:',
    'exchange_rate_used',
  ]) assert.equal(block.includes(forbidden), false, forbidden);
});

test('reintentos reutilizan una clave Web Crypto por huella de carrito y la limpian al completar', () => {
  assert.match(checkout, /window\.crypto\?\.getRandomValues/);
  assert.match(checkout, /window\.crypto\.getRandomValues\(cryptoValues\)/);
  assert.equal(checkoutRequestBlock().includes('Math.random'), false);
  assert.match(checkout, /current\?\.cartFingerprint === cartFingerprint/);
  assert.match(checkout, /JSON\.stringify\(checkoutContext\)/);
  assert.match(checkout, /getCheckoutAttemptKey\(cart, \{/);
  assert.match(checkout, /sessionStorage\.setItem\(CHECKOUT_ATTEMPT_KEY/);
  assert.match(checkout, /function clearCheckoutAttempt\(\)/);
  assert.ok((checkout.match(/clearCheckoutAttempt\(\);/g) || []).length >= 2);
});

test('WhatsApp y recibo se construyen con respuesta canonica del servidor', () => {
  assert.match(checkout, /const createdOrder = checkoutResult\.order/);
  assert.match(checkout, /const canonicalCart = Array\.isArray\(checkoutResult\.items\)/);
  assert.match(checkout, /\.\.\.\(checkoutResult\.totals \|\| \{\}\)/);
  assert.match(checkout, /cart: canonicalCart/);
  assert.match(checkout, /buildReceiptUrl\(createdOrder\.order_number, createdOrder\.receipt_token\)/);
});

test('administracion C1 usa endpoints privados y no envia precios libres', () => {
  for (const endpoint of [
    '/api/pz/admin/orders/${selectedOrder.id}/items/${itemId}/quantity',
    '/api/pz/admin/orders/${selectedOrder.id}/items',
    '/api/pz/admin/orders/${selectedOrder.id}/items/${itemId}',
    '/price-adjustments',
    '/price-adjustments/reset',
  ]) assert.ok(adminOrders.includes(endpoint), endpoint);
  assert.equal(adminOrders.includes('class="edit-item-unit-price"'), false);
  assert.equal(adminOrders.includes('id="add-product-price"'), false);
  assert.match(adminOrders, /Precio canónico vigente/);
  assert.match(adminOrders, /Motivo obligatorio/);
  assert.match(adminOrders, /confirm_zero_price/);
  assert.match(adminOrders, /handlePriceAdjustmentKeydown/);
});

test('linea, WhatsApp y recibo muestran solo el ajuste especial generico y precios finales', () => {
  assert.match(adminOrders, /Precio unitario final/);
  assert.match(adminOrders, /Ajuste especial aplicado/);
  assert.match(receipt, /Precio unitario final/);
  assert.match(receipt, /Ajuste especial/);
  for (const internal of ['manual_adjustment_reason_code', 'manual_adjustment_reason_text', 'manual_adjusted_by']) {
    assert.equal(receipt.includes(internal), false, internal);
  }
});

test('el recibo resuelve miniaturas de regalos contra PocketBase y usa fallback visual', () => {
  assert.match(receipt, /const pocketBaseOrigin = new URL\(`\$\{POCKETBASE_URL\}\/`\)/);
  assert.match(receipt, /parsed\.pathname\.startsWith\('\/api\/files\/'\)/);
  assert.match(receipt, /new URL\(`\$\{parsed\.pathname\}\$\{parsed\.search\}`, pocketBaseOrigin\)/);
  assert.match(receipt, /data-receipt-item-image/);
  assert.match(receipt, /data-receipt-item-fallback/);
  assert.match(receipt, /image\.complete && !image\.naturalWidth/);
  assert.match(receipt, /\.receipt-item-thumb-fallback\[hidden\]/);
  assert.match(receipt, /receipt-item-thumb--gift/);
  assert.match(receipt, /\.receipt-item-thumb--gift img \{[\s\S]*?object-fit: contain !important;/);
});

test('C2 restablece solo tras motivo nuevo y confirmacion explicita', () => {
  assert.match(adminOrders, /Restablecer precio del sistema/);
  assert.match(adminOrders, /Precio final actual/);
  assert.match(adminOrders, /Precio automático del sistema/);
  assert.match(adminOrders, /Diferencia que se retirará/);
  assert.match(adminOrders, /function openPriceAdjustmentResetConfirmation\(\)/);
  assert.match(adminOrders, /function submitPriceAdjustmentReset\(\)/);
  const start = adminOrders.indexOf('async function submitPriceAdjustmentReset()');
  const end = adminOrders.indexOf('\n      async function addProductToOrder()', start);
  const block = adminOrders.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /validatePriceAdjustmentReason\(\)/);
  assert.match(block, /reason_code: reason\.reasonCode/);
  assert.match(block, /reason_text: reason\.reasonText/);
  for (const forbidden of ['actor:', 'store:', 'final_unit_price_usd:', 'previousFinal:', 'total:']) {
    assert.equal(block.includes(forbidden), false, forbidden);
  }
  assert.match(adminOrders, /Para “Otro”, escribe entre 5 y 500 caracteres/);
});

test('C2 muestra advertencias de estado sin sustituir la advertencia de aumento', () => {
  assert.match(adminOrders, /La orden está confirmada\. Este cambio modificará el importe acordado, pero no modificará el inventario\./);
  assert.match(adminOrders, /La orden está en preparación\. Este cambio modificará el importe acordado, pero no modificará el inventario\./);
  assert.match(adminOrders, /Estás aumentando el total que deberá pagar el cliente\./);
  assert.match(adminOrders, /preparing: 'preparing', preparando: 'preparing'/);
  assert.match(adminOrders, /updatePriceAdjustmentStateWarning\(\);[\s\S]*updatePriceAdjustmentWarning\(\);/);
});

test('C2 agrega Total final despues del envio usando campos canonicos y separa monedas mixtas', () => {
  const totalsStart = receipt.indexOf('function getTotalsLines(order, items, currencyCode)');
  const totalsEnd = receipt.indexOf('\n    function renderTotals', totalsStart);
  const totalsBlock = receipt.slice(totalsStart, totalsEnd);
  assert.ok(totalsStart >= 0 && totalsEnd > totalsStart);
  const shippingIndex = totalsBlock.indexOf("rows.push(['Envío'");
  const finalIndex = totalsBlock.indexOf("rows.push(['Total final'");
  assert.ok(shippingIndex >= 0 && finalIndex > shippingIndex);
  assert.match(receipt, /canonicalTotalUsd = Number\(order\.total \?\? order\.usd_total \?\? 0\)/);
  assert.match(receipt, /localProducts \+ shippingVisual/);
  assert.match(receipt, /formatMoney\(localFinal, currencyCode\).*\+.*formatUSD\(usdOnlyTotal\)/s);
  assert.match(receipt, /receipt-total-final/);
  assert.match(receipt, /'total'/);
  assert.match(receipt, /'usd_total'/);
  assert.equal(receipt.includes('manual_adjustment_reason_code'), false);
});
