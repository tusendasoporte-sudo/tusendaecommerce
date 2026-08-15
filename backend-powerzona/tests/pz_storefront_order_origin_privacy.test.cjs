'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('el borrado de identidad del cliente elimina el vínculo privado app-pedido', () => {
  const monitoring = fs.readFileSync(
    path.join(root, 'backend-powerzona/pb_hooks/pz_security_monitoring_lib.js'),
    'utf8',
  );
  assert.match(monitoring, /STOREFRONT_ORDER_LINKS_COLLECTION = "storefront_order_links"/);
  assert.match(monitoring, /appOrderLinks: collectCustomerAppOrderLinks\(app, storeId, orders\)/);
  assert.match(monitoring, /deleteRecords\(app, scope\.appOrderLinks\)/);
  assert.ok(
    monitoring.indexOf('deleteRecords(app, scope.appOrderLinks)')
      > monitoring.indexOf('scope.orders.forEach((order) => eraseOrderSecurityIdentity'),
  );
});

test('el vínculo no guarda FID, HMAC abreviado ni datos de contacto dentro del pedido', () => {
  const installations = fs.readFileSync(
    path.join(root, 'backend-powerzona/pb_hooks/pz_storefront_installations_lib.js'),
    'utf8',
  );
  const helper = installations.slice(
    installations.indexOf('function ensureOrderInstallationLink'),
    installations.indexOf('function setPrivateHeaders'),
  );
  assert.match(helper, /link\.set\("installation", installationId\)/);
  assert.match(helper, /link\.set\("order", orderId\)/);
  assert.doesNotMatch(helper, /fid|customer_phone|customer_name|installationAdminReference/);
});
