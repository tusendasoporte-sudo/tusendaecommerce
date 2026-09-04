'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = readFileSync(path.join(__dirname, '../pb_migrations/1788448200_admin_app_engine_v2_runner_control.js'), 'utf8');
const routes = readFileSync(path.join(__dirname, '../pb_hooks/pz_admin_app_releases.pb.js'), 'utf8');
const backend = readFileSync(path.join(__dirname, '../pb_hooks/pz_admin_app_releases_lib.js'), 'utf8');

test('migración v2 crea runner Admin privado y fija autorización y revisión exacta', () => {
  assert.match(migration, /admin_app_runner_agents/);
  assert.match(migration, /current_engine_version/);
  assert.match(migration, /current_engine_revision/);
  assert.match(migration, /execution_authorized_at/);
  assert.match(migration, /execution_authorized_until/);
  assert.match(migration, /execution_runner_id/);
  assert.match(migration, /listRule: null/);
  assert.match(migration, /admin_engine_v2_required/);
  assert.match(migration, /unsafe_rollback_admin_app_engine_v2_runner_control/);
});

test('rutas del Runner Admin quedan separadas, autenticadas y sin cola compartida', () => {
  assert.match(routes, /\/api\/pz\/master\/admin-app-releases\/start-runner/);
  assert.match(routes, /\/api\/pz\/internal\/admin-app-runners\/heartbeat/);
  assert.match(routes, /requireRunner/);
  assert.match(backend, /PZ_ADMIN_APP_RUNNER_SECRET/);
  assert.match(backend, /execution_runner_id/);
  assert.match(backend, /runner_isolated: true/);
  assert.match(backend, /configuredVersion !== ENGINE_VERSION/);
  assert.match(
    backend,
    /lifecycle_status", 30\) === "deleted"[\s\S]*existing\.set\("file", files\[0\]\)[\s\S]*lifecycle_status", "staged"/,
  );
  assert.doesNotMatch(backend, /PZ_STORE_APP_RUNNER_SECRET/);
});
