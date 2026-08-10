import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseCheckoutPayload } = require('../../backend-powerzona/pb_hooks/pz_order_pricing_lib.js');
const checkout = readFileSync(new URL('../src/pages/checkout.astro', import.meta.url), 'utf8');
const products = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');

function checkoutPayload(deliveryMethod) {
  return {
    store_id: 'store1234567890',
    idempotency_key: 'checkout-attempt-123456789',
    delivery_method: deliveryMethod,
    customer_name: 'Cliente nuevo',
    customer_phone: '+5355555555',
    customer_address: 'Calle 84, referencia azul',
    customer_municipality: '',
    items: [{ product_id: 'product12345678', quantity: 1 }],
  };
}

test('checkout cambia envio por coordinacion cuando no hay zonas activas', () => {
  assert.match(checkout, /method === 'coordinate'[\s\S]*?shippingZonesLoaded[\s\S]*?!hasActiveShippingZones\(\)[\s\S]*?cartIncludesDeliveryOption\(\)/);
  assert.match(checkout, /methods\.includes\('delivery'\)/);
  assert.match(checkout, /return \['coordinate', \.\.\.methods\.filter/);
  assert.match(checkout, /Esta tienda todavía no ha definido zonas de envío/);
  assert.match(checkout, /addressFieldBox\?\.classList\.toggle\('hidden', !coordinatedShippingFallback\)/);
  assert.match(checkout, /customerAddressOptional\?\.classList\.toggle\('hidden', !coordinatedShippingFallback\)/);
});

test('orden coordinada no conserva municipio ni una zona seleccionada anteriormente', () => {
  assert.match(checkout, /validation\.data\.delivery_method === 'delivery' \? getSelectedShippingZone\(\) : null/);
  assert.match(checkout, /customer_municipality: validation\.data\.delivery_method === 'delivery' \? validation\.data\.customer_municipality : ''/);
  assert.match(checkout, /shouldPersistCustomerAddress\(validation\.data\.delivery_method\)/);
});

test('backend conserva la referencia opcional solo para entrega coordinada', () => {
  const coordinate = parseCheckoutPayload(checkoutPayload('coordinate'));
  assert.equal(coordinate.customerAddress, 'Calle 84, referencia azul');

  const pickup = parseCheckoutPayload(checkoutPayload('pickup'));
  assert.equal(pickup.customerAddress, '');

  assert.equal(parseCheckoutPayload(checkoutPayload('delivery')), null);
});

test('editor de productos avisa cuando solo envio no tiene zonas activas', () => {
  assert.match(products, /id="product-delivery-zone-warning"/);
  assert.match(products, /productDeliveryModeInput\?\.value === 'delivery'/);
  assert.match(products, /loadAllRecords\('shipping_zones', withStoreFilter\('filter=active=true&fields=id'\)\)/);
  assert.match(products, /Los pedidos de este producto se recibirán como entrega por coordinar/);
});
