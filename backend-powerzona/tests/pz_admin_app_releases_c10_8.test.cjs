'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const releases = require('../pb_hooks/pz_admin_app_releases_lib.js');
const source = readFileSync(path.join(__dirname, '../pb_hooks/pz_admin_app_releases_lib.js'), 'utf8');

const security = {
  sha256(value) { return require('node:crypto').createHash('sha256').update(value).digest('hex'); },
  randomString(length) { return 'A'.repeat(length); },
  equal(left, right) { return left === right; },
};

test('grant y ticket usan dominios separados y tokens de 256 bits', () => {
  const token = releases.randomToken(security);
  assert.equal(token, 'A'.repeat(43));
  assert.match(releases.grantDigest(token, security), /^[a-f0-9]{64}$/);
  assert.match(releases.ticketDigest(token, security), /^[a-f0-9]{64}$/);
  assert.notEqual(releases.grantDigest(token, security), releases.ticketDigest(token, security));
  assert.equal(releases.grantDigest('copiado-invalido', security), '');
});

test('configuración exige identidad, baseline existente y confirmación literal', () => {
  const valid = {
    admin_url: 'https://tusenda84.com/admin', channel: 'staging', confirmation: 'CONFIGURAR MOBILE ADMIN',
    current_version_code: 3, current_version_name: '1.0.2', display_name: 'Tu Senda 84 Admin',
    firebase_app_id: '', firebase_project_id: '', package_name: 'com.tusenda84.admin', signing_cert_sha256: '',
  };
  assert.equal(releases.parseConfigure(valid).currentVersionCode, 3);
  assert.equal(releases.parseConfigure({ ...valid, confirmation: 'sí' }), null);
  assert.equal(releases.parseConfigure({ ...valid, package_name: 'admin-bad' }), null);
  assert.equal(releases.parseConfigure({ ...valid, firebase_project_id: 'project-ok', firebase_app_id: '' }), null);
});

test('preview fija entrega autenticada, piloto, rollout y obligatoriedad posterior', () => {
  const profile = {
    channel: 'staging', display_name: 'Tu Senda 84 Admin', package_name: 'com.tusenda84.admin',
    admin_url: 'https://tusenda84.com/admin', signing_cert_sha256: '11:'.repeat(31) + '11',
    firebase_app_id: '', latest_version_code: 3,
    get(key) { return this[key]; },
  };
  const preview = releases.buildPreview(profile, { versionCode: 4, versionName: '1.0.3' });
  assert.equal(preview.operation, 'update');
  assert.equal(preview.identity.package_name, 'com.tusenda84.admin');
  assert.equal(preview.delivery.authenticated_only, true);
  assert.equal(preview.delivery.pilot_required, true);
  assert.equal(preview.delivery.gradual_rollout, true);
  assert.equal(preview.delivery.mandatory_after_general, true);
  assert.equal(releases.buildPreview(profile, { versionCode: 4, versionName: '1.0.3' }).identity.signing_cert_sha256, preview.identity.signing_cert_sha256);
  assert.match(source, /signing_identity_required/);
  assert.match(source, /sha256Domain\("pz_admin_app_preview:v1", canonical\(currentPreview\)\) !== hash/);
});

test('política y check-in se resuelven desde la asignación exacta, no por un perfil global', () => {
  assert.match(source, /const access = activeAssignment\(\$app, context, ""\)/);
  assert.match(source, /const resolved = activeAssignment\(\$app, context, ""\)/);
  assert.match(source, /availableVersion >= minimumVersion/);
  assert.doesNotMatch(source, /first\(\$app, PROFILES, "package_name = \{:package\}/);
});

test('asignaciones y completion rechazan formas laxas o artefactos incompletos', () => {
  const assignment = {
    action: 'assign', artifact_id: 'artifactc108001', user_id: 'userc1080000001', device_id: 'devicec10800001', stage: 'pilot', wave: 0,
  };
  assert.equal(releases.parseAssignment(assignment).stage, 'pilot');
  assert.equal(releases.parseAssignment({ ...assignment, extra: true }), null);
  assert.equal(releases.parseAssignment({ ...assignment, stage: 'all' }), null);
  const complete = {
    job_id: 'jobc10800000001', runner_id: 'runner-c108', status: 'succeeded', failure_code: '',
    signing_cert_sha256: '11:'.repeat(31) + '11',
    artifacts: ['apk', 'checksums', 'instructions', 'build_manifest'].map((kind) => ({
      kind,
      file_name: kind === 'apk' ? 'mobile-admin-1.0.3-4.apk' : kind === 'checksums' ? 'SHA256SUMS.txt' : kind === 'instructions' ? 'INSTRUCCIONES.txt' : 'build-manifest.json',
      sha256: 'a'.repeat(64), bytes: 10,
    })),
  };
  assert.ok(releases.parseCompletion(complete));
  assert.equal(releases.parseCompletion({ ...complete, artifacts: complete.artifacts.slice(0, 3) }), null);
  assert.equal(releases.parseCompletion({ ...complete, signing_cert_sha256: '22' }), null);
});

test('secreto del runner compara hashes y rechaza valores cortos', () => {
  assert.equal(releases.secretEqual('a'.repeat(32), 'a'.repeat(32), security), true);
  assert.equal(releases.secretEqual('a'.repeat(32), 'b'.repeat(32), security), false);
  assert.equal(releases.secretEqual('short', 'short', security), false);
});
