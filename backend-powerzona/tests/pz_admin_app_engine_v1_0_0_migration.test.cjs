'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = readFileSync(path.join(__dirname, '../pb_migrations/1787187600_admin_app_engine_v1_0_0.js'), 'utf8');
const engine = JSON.parse(readFileSync(path.join(__dirname, '../../mobile-admin/engine.json'), 'utf8'));
const backend = require('../pb_hooks/pz_admin_app_releases_lib.js');

test('motor 1.0.1 comparte nombre, versión, contrato y Firebase obligatorio', () => {
  assert.deepEqual(engine, { name: 'Tu Senda 84 Admin Engine', version: '1.0.1', contract_version: 1, firebase_required: true });
  assert.deepEqual(backend.engineDescriptor(), engine);
  assert.match(migration, /admin_app_brand_assets/);
  assert.match(migration, /last_allocated_version_code/);
  assert.match(migration, /engine_contract_version/);
  assert.match(migration, /engine_version", "0\.0\.0"/);
  assert.match(migration, /engine_upgrade_required/);
  assert.match(migration, /confirmedCodes/);
});

test('activos de apariencia son privados, protegidos, versionados y rollback falla cerrado', () => {
  assert.match(migration, /listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null/);
  assert.match(migration, /protected: true/);
  assert.match(migration, /mimeTypes: \["image\/png"\]/);
  assert.match(migration, /idx_admin_app_brand_asset_revision/);
  assert.match(migration, /unsafe_rollback_admin_app_engine_brand_assets/);
  assert.match(migration, /unsafe_rollback_admin_app_engine_jobs/);
});
