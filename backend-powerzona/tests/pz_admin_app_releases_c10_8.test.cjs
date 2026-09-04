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

test('configuración acepta app nueva o baseline existente y exige color y confirmación', () => {
  const valid = {
    admin_url: 'https://tusenda84.com/admin', confirmation: 'CONFIGURAR MOBILE ADMIN',
    current_version_code: 3, current_version_name: '1.0.2', display_name: 'Tu Senda 84 Admin',
    package_name: 'com.tusenda84.admin', signing_cert_sha256: '', splash_background_color: '#FFFFFF',
  };
  assert.equal(releases.parseConfigure(valid).currentVersionCode, 3);
  assert.equal(releases.parseConfigure({ ...valid, confirmation: 'sí' }), null);
  assert.equal(releases.parseConfigure({ ...valid, package_name: 'admin-bad' }), null);
  assert.equal(releases.parseConfigure({ ...valid, firebase_project_id: 'project-ok' }), null);
  assert.equal(releases.parseConfigure({ ...valid, current_version_code: 0, current_version_name: '' }).currentVersionCode, 0);
  assert.equal(releases.parseConfigure({ ...valid, splash_background_color: 'white' }), null);
  const app = { findRecordsByFilter: () => [{ confirmed_at: '' }] };
  assert.equal(releases.profileIdentityLocked(app, 'profilec1080001'), false);
  app.findRecordsByFilter = () => [{ confirmed_at: '2026-08-18T12:00:00.000Z' }];
  assert.equal(releases.profileIdentityLocked(app, 'profilec1080001'), true);
});

test('preview fija entrega autenticada, aprobación Master y publicación automática', () => {
  const profile = {
    channel: 'production', display_name: 'Tu Senda 84 Admin', package_name: 'com.tusenda84.admin',
    admin_url: 'https://tusenda84.com/admin', signing_cert_sha256: '11:'.repeat(31) + '11',
    firebase_app_id: '', latest_version_code: 3,
    get(key) { return this[key]; },
  };
  const approvedRelease = { version: '2.0.0', revision: 'a'.repeat(40), severity: 'recommended' };
  const preview = releases.buildPreview(profile, { versionCode: 4, versionName: '1.0.3' }, null, approvedRelease);
  assert.equal(preview.operation, 'update');
  assert.deepEqual(preview.engine, {
    name: 'Tu Senda 84 Admin Engine', version: '2.0.0', revision: 'a'.repeat(40),
    contract_version: 2, firebase_required: true, api_base_url: 'https://api.tusenda84.com',
  });
  assert.deepEqual(preview.notifications, { firebase_required: true, managed_by_engine: true });
  assert.equal(preview.channel, 'production');
  assert.equal(preview.identity.package_name, 'com.tusenda84.admin');
  assert.equal(preview.engine.api_base_url, 'https://api.tusenda84.com');
  assert.equal(preview.delivery.authenticated_only, true);
  assert.equal(preview.delivery.master_test_approval_required, true);
  assert.equal(preview.delivery.automatic_authorized_admin_delivery, true);
  assert.equal(preview.delivery.mandatory_after_publication, true);
  assert.equal(releases.buildPreview(profile, { versionCode: 4, versionName: '1.0.3' }, null, approvedRelease).identity.signing_cert_sha256, preview.identity.signing_cert_sha256);
  assert.match(source, /signing_identity_required/);
  assert.match(source, /sha256Domain\("pz_admin_app_preview:v2", canonical\(currentPreview\)\) !== hash/);
  assert.equal(releases.nextVersionCode({ latest_version_code: 4, last_allocated_version_code: 7 }), 8);
});

test('la API nativa pertenece al motor y falla cerrada ante un origen no válido', () => {
  const previousOs = global.$os;
  try {
    global.$os = { getenv: (name) => (name === 'PZ_ADMIN_API_BASE_URL' ? 'https://api.example.test:8443' : '') };
    assert.equal(releases.adminApiBaseUrl(), 'https://api.example.test:8443');
    global.$os = { getenv: (name) => (name === 'PZ_ADMIN_API_BASE_URL' ? 'https://attacker.test/path' : '') };
    assert.equal(releases.adminApiBaseUrl(), '');
    global.$os = { getenv: (name) => (name === 'PZ_ADMIN_API_BASE_URL' ? 'https://user@attacker.test' : '') };
    assert.equal(releases.adminApiBaseUrl(), '');
  } finally {
    if (previousOs === undefined) delete global.$os;
    else global.$os = previousOs;
  }
});

test('política y check-in usan la última APK publicada sin asignaciones individuales', () => {
  assert.match(source, /resolveAdminRelease\(\$app, context, \{ grant: "", packageName, channel: "" \}\)/);
  assert.match(source, /publishedArtifactForProfile/);
  assert.match(source, /releaseState\(app, artifactId\) === "published"/);
  assert.match(source, /availableVersion >= minimumVersion/);
  assert.match(source, /assignment: resolved\.assignment \? resolved\.assignment\.id : ""/);
});

test('una compilación nueva sin publicar no reemplaza la versión anunciada', () => {
  const newest = { id: 'artifactnew0001' };
  const published = { id: 'artifactold0001' };
  const app = {
    findRecordsByFilter(collection, filter, _sort, _limit, _offset, params) {
      if (collection === releases.ARTIFACTS) return [newest, published];
      if (collection === releases.EVENTS) {
        return params.artifact === published.id ? [{ id: 'eventpublished01', action: 'release_published' }] : [];
      }
      return [];
    },
  };
  assert.equal(releases.publishedArtifactForProfile(app, 'profilec1080001'), published);
});

test('asignaciones y completion rechazan formas laxas o artefactos incompletos', () => {
  const assignment = {
    action: 'assign_next', artifact_id: 'artifactc108001', user_id: 'userc1080000001', device_id: 'devicec10800001',
  };
  assert.equal(releases.parseAssignment(assignment).deviceId, 'devicec10800001');
  assert.equal(releases.parseAssignment({ ...assignment, extra: true }), null);
  assert.equal(releases.parseAssignment({ ...assignment, action: 'assign' }), null);
  const complete = {
    job_id: 'jobc10800000001', runner_id: 'runner-c108', status: 'succeeded', failure_code: '',
    signing_cert_sha256: '11:'.repeat(31) + '11',
    engine_name: 'Tu Senda 84 Admin Engine', engine_version: '2.0.0', engine_contract_version: 2,
    engine_revision: 'b'.repeat(40),
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

test('activos visuales son PNG cuadrados acotados y el navegador no decide secuencia', () => {
  const valid = {
    kind: 'icon', sha256: 'a'.repeat(64), bytes: 1024, width: 1024, height: 1024,
    confirmation: 'CAMBIAR IMAGEN MOBILE ADMIN',
  };
  assert.equal(releases.parseBrandUpload(valid).kind, 'icon');
  assert.equal(releases.parseBrandUpload({ ...valid, width: 511, height: 511 }), null);
  assert.equal(releases.parseBrandUpload({ ...valid, height: 512 }), null);
  assert.equal(releases.parseBuildPreview({ version_name: '1.0.3' }).versionName, '1.0.3');
  assert.equal(releases.parseBuildPreview({ version_name: '1.0.3', version_code: 999 }), null);
});

test('una identidad global construye en producción y publica el mismo artefacto aprobado', () => {
  assert.match(source, /CANONICAL_PROFILE_CHANNEL = "production"/);
  assert.match(source, /channel: "production"/);
  assert.match(source, /single_artifact_release: true/);
  assert.match(source, /publication_reuses_approved_artifact: true/);
  assert.match(source, /const profile = masterProfile\(\$app\)/);
  assert.match(source, /\["pause_release", "resume_release", "withdraw_release"\]/);
  assert.match(source, /release_resumed/);
  assert.match(source, /new_release_optional/);
  assert.match(source, /use_engine_brand/);
  assert.match(source, /profile\.set\("latest_version_code", artifactVersionCode\)/);
  assert.doesNotMatch(source, /profile\.set\("latest_version_code", recordNumber\(job, "version_code"\)\)/);
});

test('secreto del runner compara hashes y rechaza valores cortos', () => {
  assert.equal(releases.secretEqual('a'.repeat(32), 'a'.repeat(32), security), true);
  assert.equal(releases.secretEqual('a'.repeat(32), 'b'.repeat(32), security), false);
  assert.equal(releases.secretEqual('short', 'short', security), false);
});

test('runner Admin exige revisión exacta, capacidades y autorización de un solo uso', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const agent = {
    runner_id: 'admin-runner-pc', mode: 'manual', engine_version: '2.0.0',
    engine_revision: 'a'.repeat(40), allow_firebase: true, allow_signing: true,
    workspace_clean: true, last_seen_at: now.toISOString(),
    get(key) { return this[key]; },
  };
  const preview = { engine: { version: '2.0.0', revision: 'a'.repeat(40) } };
  const compatible = releases.runnerCompatibility(agent, preview, now);
  assert.equal(compatible.engineMatches, true);
  assert.equal(compatible.capabilitiesMatch, true);
  assert.equal(compatible.snapshot.online, true);
  assert.equal(releases.runnerCompatibility({ ...agent, engine_revision: 'b'.repeat(40) }, preview, now).engineMatches, false);
  assert.equal(releases.runnerCompatibility({ ...agent, allow_signing: false }, preview, now).capabilitiesMatch, false);
  assert.match(source, /RUNNER_AUTHORIZATION_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(source, /execution_authorized_until/);
  assert.match(source, /execution_runner_id/);
});
