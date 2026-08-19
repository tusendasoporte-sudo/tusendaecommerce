'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.join(__dirname, '..', 'pb_migrations', '1787281200_storefront_app_single_candidate_release.js');
const source = readFileSync(migrationPath, 'utf8');

test('migración aditiva formaliza candidato, aprobación, publicación y secuencia', () => {
  assert.match(source, /last_allocated_version_code/);
  assert.match(source, /\["candidate", "approved", "published"\]/);
  assert.match(source, /approved_at/);
  assert.match(source, /approved_by/);
  assert.match(source, /published_at/);
  assert.match(source, /published_by/);
  assert.match(source, /kind = 'apk'/);
  assert.match(source, /lifecycle === "available" \? "published" : lifecycle === "staged" \? "candidate" : ""/);
});

test('rollback falla cerrado cuando ya existe estado nuevo que pudiera perderse', () => {
  assert.match(source, /unsafe_rollback_storefront_candidate_release_data/);
  assert.match(source, /release_status = 'candidate'/);
  assert.match(source, /release_status = 'approved'/);
  assert.match(source, /approved_at != ''/);
  assert.match(source, /published_at != ''/);
});
