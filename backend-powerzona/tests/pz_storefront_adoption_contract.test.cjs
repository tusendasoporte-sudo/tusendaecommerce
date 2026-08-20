'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const builds = require('../pb_hooks/pz_storefront_app_builds_lib.js');

const STORE = 'storeadoption01';
const ARTIFACT = 'artifactupdate1';
const SIGNING = '12:5B:DC:CC:B5:53:0D:94:FC:7C:0C:E3:32:21:BE:78:52:96:0C:45:3E:D2:F0:47:46:29:82:FC:C5:4F:B3:72';

const adoption = () => ({
  store_id: STORE,
  app_key: 'powerzona-storefront-staging',
  brand_key: 'powerzona',
  display_name: 'PowerZona',
  include_aab: true,
  firebase_project_id: 'tu-senda-84-storefront-staging',
  package_name: 'com.tusenda84.powerzona',
  store_url: 'https://tusenda84.com/t/powerzona',
  current_version_code: 10,
  current_version_name: '0.2.8',
  signing_cert_sha256: SIGNING,
  confirmation: 'ADOPTAR APP EXISTENTE',
});

test('adopción exige la identidad histórica completa y confirmación exacta', () => {
  assert.deepEqual(builds.parseAdoptionPayload(adoption()), {
    storeId: STORE,
    appKey: 'powerzona-storefront-staging',
    brandKey: 'powerzona',
    displayName: 'PowerZona',
    includeAab: true,
    firebaseProjectId: 'tu-senda-84-storefront-staging',
    packageName: 'com.tusenda84.powerzona',
    storeUrl: 'https://tusenda84.com/t/powerzona',
    versionCode: 10,
    versionName: '0.2.8',
    signingCertSha256: SIGNING,
    confirmation: 'ADOPTAR APP EXISTENTE',
  });
  assert.equal(builds.parseAdoptionPayload({ ...adoption(), confirmation: 'adoptar' }), null);
  assert.equal(builds.parseAdoptionPayload({ ...adoption(), signing_cert_sha256: 'AA' }), null);
  assert.equal(builds.parseAdoptionPayload({ ...adoption(), extra: true }), null);
});

test('Master controla obligatoriedad, pausa, reanudación y retirada con frases distintas', () => {
  const actions = {
    require_update: 'EXIGIR ACTUALIZACION CLIENTES',
    optional_update: 'HACER OPCIONAL ACTUALIZACION CLIENTES',
    pause_update: 'PAUSAR ACTUALIZACION CLIENTES',
    resume_update: 'REANUDAR ACTUALIZACION CLIENTES',
    withdraw_update: 'RETIRAR ACTUALIZACION CLIENTES',
  };
  for (const [action, confirmation] of Object.entries(actions)) {
    assert.deepEqual(builds.parseReleasePayload({
      action, artifact_id: ARTIFACT, confirmation, store_id: STORE,
    }), { action, artifactId: ARTIFACT, confirmation, storeId: STORE });
    assert.equal(builds.parseReleasePayload({
      action, artifact_id: ARTIFACT, confirmation: 'CONFIRMAR', store_id: STORE,
    }), null);
  }
});

test('migración crea tickets privados y estados sin reglas públicas', () => {
  const migration = readFileSync(path.resolve(
    __dirname, '../pb_migrations/1787367600_storefront_private_updates_and_adoption.js',
  ), 'utf8');
  assert.match(migration, /storefront_app_update_tickets/);
  assert.match(migration, /listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null/);
  assert.match(migration, /adopted_existing/);
  assert.match(migration, /inherit_existing/);
  assert.match(migration, /active.*paused.*withdrawn/s);
  assert.doesNotMatch(migration, /token\b(?!_digest)/);
});
