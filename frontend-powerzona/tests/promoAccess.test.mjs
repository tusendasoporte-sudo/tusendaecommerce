import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const promoBackend = require('../../backend-powerzona/pb_hooks/pz_promo_permissions_lib.js');
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(currentDirectory, '..', 'src', 'lib', 'promoAccess.ts'), 'utf8');

function quotedArray(name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(match, `${name} no encontrado`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

test('frontend replica exactamente catálogos backend sin ampliar permisos por su cuenta', () => {
  assert.deepEqual(quotedArray('PROMO_CAPABILITY_KEYS'), promoBackend.PROMO_CAPABILITY_KEYS);
  assert.deepEqual(quotedArray('PROMO_PERMISSION_KEYS'), promoBackend.PROMO_ASSIGNABLE_PERMISSION_KEYS);
  assert.deepEqual(quotedArray('PROMO_RESERVED_PERMISSION_KEYS'), promoBackend.PROMO_RESERVED_PERMISSION_KEYS);
  assert.deepEqual(quotedArray('PROMO_ACTION_KEYS'), promoBackend.PROMO_ACTION_KEYS);
});

test('defensa visual exige allowed_actions proyectadas por backend y falla cerrada en unknown', () => {
  assert.match(source, /backend-projected action set is authoritative/);
  assert.match(source, /context\.access\.allowed_actions\.includes\(action\)/);
  assert.match(source, /if \(!context \|\| !isPromoActionKey\(action\)\) return false/);
  assert.doesNotMatch(source, /is_primary_admin[^\n]+PROMO_PERMISSION_KEYS/);
});

test('cliente usa POST privado, no-store y contexto Master en header separado', () => {
  for (const route of [
    '/api/pz/promo/access/context',
    '/api/pz/promo/team/detail',
    '/api/pz/promo/team/update-permissions',
    '/api/pz/promo/master/entitlements/update',
  ]) assert.match(source, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /method: 'POST'/);
  assert.match(source, /cache: 'no-store'/);
  assert.match(source, /'X-PZ-Promo-Store'/);
  assert.doesNotMatch(source, /store_id\s*:/);
  assert.doesNotMatch(source, /site_id\s*:/);
});

test('mutaciones frontend no normalizan unknown ni versiones inválidas a valores aceptables', () => {
  assert.match(source, /value\.some\(\(permission\) => !isPromoPermissionKey\(permission\)\)/);
  assert.match(source, /invalid_promo_permissions/);
  assert.match(source, /!Number\.isSafeInteger\(version\) \|\| version < 0/);
  assert.match(source, /expected_version: strictExpectedVersion\(expectedVersion\)/);
  assert.match(source, /permissions: strictPermissionUpdate\(permissions\)/);
});

test('catálogo Promo no reutiliza semántica de promociones, pedidos, catálogo o checkout', () => {
  const promoPermissions = quotedArray('PROMO_PERMISSION_KEYS');
  for (const forbidden of ['promotions.', 'orders.', 'catalog.', 'products.', 'checkout.', 'cart.']) {
    assert.equal(promoPermissions.some((key) => key.startsWith(forbidden)), false, forbidden);
  }
  assert.ok(promoPermissions.includes('promo.reviews.manage'));
  assert.ok(promoPermissions.includes('promo.analytics.view'));
});
