const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hooks = path.resolve(__dirname, '..', 'pb_hooks');
const read = (name) => fs.readFileSync(path.join(hooks, name), 'utf8');

test('modo soporte exige Master activo y una tienda explicita en endpoints de equipo', () => {
  const source = read('pz_store_team_lib.js');
  assert.match(source, /activeMaster\(info\.auth\)/);
  assert.match(source, /requestHeader\(info, "X-PZ-Support-Store"\)/);
  assert.match(source, /master \? bounded\(requestedStoreId, 15\) : relationId\(actor, "store"\)/);
  assert.match(source, /context\.master[\s\S]*permissions\.ASSIGNABLE_PERMISSION_KEYS\.slice\(\)/);
  assert.match(source, /actor_role_snapshot: activeMaster\(actor\) \? "master_admin"/);
});

test('analiticas, selectores e historial aceptan la tienda de soporte solo desde header', () => {
  for (const name of [
    'pz_store_analytics_lib.js',
    'pz_store_marketing_selectors_lib.js',
    'pz_product_history_lib.js',
    'pz_product_expiration_lib.js',
  ]) {
    const source = read(name);
    assert.match(source, /X-PZ-Support-Store/, name);
    assert.match(source, /master_admin/, name);
    assert.match(source, /replace\(\/-\/g, "_"\)/, name);
  }
});

test('auditoria central conserva la identidad real del Master', () => {
  const source = read('pz_store_activity_audit_lib.js');
  assert.match(source, /role === "master_admin" \? "master_admin" : "store_admin"/);
  assert.match(source, /actor_role_snapshot: role/);
  assert.match(source, /origin,/);
});
