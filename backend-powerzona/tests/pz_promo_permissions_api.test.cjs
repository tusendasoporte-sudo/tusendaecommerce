const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const api = require('../pb_hooks/pz_promo_permissions_api_lib.js');

test('API Promo registra solo cuatro POST privados con auth, bodyLimit y sin CRUD genérico', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'pb_hooks', 'pz_promo_permissions.pb.js'),
    'utf8',
  );
  const routes = [...source.matchAll(/"(\/api\/pz\/promo\/[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, [
    '/api/pz/promo/access/context',
    '/api/pz/promo/team/detail',
    '/api/pz/promo/team/update-permissions',
    '/api/pz/promo/master/entitlements/update',
  ]);
  assert.equal((source.match(/\$apis\.requireAuth\(\)/g) || []).length, 4);
  assert.equal((source.match(/\$apis\.bodyLimit\(/g) || []).length, 4);
  assert.doesNotMatch(source, /routerAdd\(\s*"(?:GET|PATCH|DELETE)"/);
});

test('payloads exactos rechazan store_id, filtros, expansiones y campos de actor', () => {
  assert.deepEqual(api.parseDetail({ user_id: 'useraaaaaaaaaaa' }), { userId: 'useraaaaaaaaaaa' });
  for (const injected of [
    { store_id: 'storeaaaaaaaaaa' },
    { site_id: 'siteaaaaaaaaaaa' },
    { filter: 'site != ""' },
    { expand: 'site.store' },
    { fields: '*' },
    { actor_id: 'masteraaaaaaaaa' },
  ]) {
    assert.equal(api.parseDetail({ user_id: 'useraaaaaaaaaaa', ...injected }), null);
  }
});

test('actualización de permisos exige CAS y conserva rechazo estricto de unknown/reserved', () => {
  assert.deepEqual(api.parsePermissionsUpdate({
    user_id: 'useraaaaaaaaaaa',
    expected_version: 2,
    permissions: ['promo.publish'],
    reason: 'Asignación aprobada',
  }), {
    userId: 'useraaaaaaaaaaa',
    expectedVersion: 2,
    permissions: ['promo.site.view', 'promo.publish'],
    reason: 'Asignación aprobada',
  });
  assert.throws(() => api.parsePermissionsUpdate({
    user_id: 'useraaaaaaaaaaa', expected_version: 0,
    permissions: ['promo.unknown'], reason: 'Motivo válido',
  }), /invalid_promo_permissions/);
  assert.throws(() => api.parsePermissionsUpdate({
    user_id: 'useraaaaaaaaaaa', expected_version: 0,
    permissions: ['promo.entitlements.manage'], reason: 'Motivo válido',
  }), /invalid_promo_permissions/);
  assert.equal(api.parsePermissionsUpdate({
    user_id: 'useraaaaaaaaaaa', expected_version: 0,
    permissions: [], reason: 'Motivo válido', store_id: 'storeaaaaaaaaaa',
  }), null);
});

test('Master solo puede enviar capacidades canónicas, tipadas y dentro de hard ceilings', () => {
  assert.deepEqual(api.normalizeCapabilityChanges({
    promo_site_enabled: true,
    max_services: 50,
  }), {
    promo_site_enabled: true,
    max_services: 50,
  });
  assert.throws(() => api.normalizeCapabilityChanges({ unknown: true }), /unknown_promo_capability/);
  assert.throws(() => api.normalizeCapabilityChanges({ promo_site_enabled: 1 }), /invalid_promo_capability/);
  assert.throws(() => api.normalizeCapabilityChanges({ max_services: 51 }), /invalid_promo_capability/);
  assert.throws(() => api.normalizeCapabilityChanges({}), /invalid_promo_capability/);
});

test('errores públicos mantienen 400/403/404/409/503 sin reflejar claves desconocidas', () => {
  assert.equal(api.statusForError({ code: 'invalid_payload' }), 400);
  assert.equal(api.statusForError({ code: 'promo_permission_denied' }), 403);
  assert.equal(api.statusForError({ code: 'promo_not_found' }), 404);
  assert.equal(api.statusForError({ code: 'promo_permissions_conflict' }), 409);
  assert.equal(api.statusForError({ code: 'promo_permissions_unavailable' }), 503);
  assert.equal(api.statusForError({ code: 'attacker-supplied-secret' }), 503);
});

test('migración PERM solo añade dos fields ocultos a store_user_access y down falla si hay grants', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'pb_migrations', '1787520400_promo_permissions.js'),
    'utf8',
  );
  assert.match(source, /findCollectionByNameOrId\("store_user_access"\)/);
  assert.match(source, /name: "promo_permissions_json"/);
  assert.match(source, /name: "promo_permissions_version"/);
  assert.match(source, /hidden: true/);
  assert.match(source, /unsafe_rollback_promo_permissions/);
  assert.doesNotMatch(source, /new Collection\s*\(/);
  assert.doesNotMatch(source, /name: "permissions_json"/);
  assert.doesNotMatch(source, /template_code/);
});
