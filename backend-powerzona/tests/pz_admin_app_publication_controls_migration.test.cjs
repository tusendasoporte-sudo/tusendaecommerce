'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = readFileSync(path.join(__dirname, '../pb_migrations/1787194800_admin_app_publication_controls.js'), 'utf8');

test('la migración permite reanudar la misma publicación sin duplicar artefactos', () => {
  assert.match(migration, /release_resumed/);
  assert.match(migration, /Array\.from\(new Set/);
  assert.doesNotMatch(migration, /admin_app_artifacts.*delete|delete.*admin_app_artifacts/is);
});

test('el rollback falla cerrado si ya existen reanudaciones', () => {
  assert.match(migration, /action = 'release_resumed'/);
  assert.match(migration, /unsafe_rollback_admin_app_publication_controls/);
});
