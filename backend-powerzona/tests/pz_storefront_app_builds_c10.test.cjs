'use strict';

const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const test = require('node:test');

const builds = require('../pb_hooks/pz_storefront_app_builds_lib.js');

const STORE_ID = 'storec10test001';
const PROFILE_ID = 'profilec10test1';
const JOB_ID = 'jobc10deliver01';
const ARTIFACT_ID = 'artc10deliver01';
const MASTER_ID = 'masterc10test01';
const PRIMARY_ID = 'primaryc10test1';

process.env.PZ_STOREFRONT_ENGINE_VERSION = '1.0.0';
process.env.PZ_STOREFRONT_ENGINE_REVISION = 'a'.repeat(40);
process.env.PZ_STOREFRONT_ENGINE_UPDATE_SEVERITY = 'recommended';
process.env.PZ_STOREFRONT_APP_DOWNLOAD_SECRET = 'c10-download-secret-abcdefghijklmnopqrstuvwxyz';

function record(id, values) {
  return { id, get(key) { return values[key]; } };
}

const provisionPayload = () => ({
  store_id: STORE_ID,
  operation: 'provision',
  app_key: 'tenant-c10-storefront',
  brand_key: 'tenant-c10',
  display_name: 'Tenant C10',
  include_aab: false,
  firebase_project_id: 'tusenda84-tenant-c10',
  package_name: 'com.tusenda84.tenantc10',
  store_url: 'https://tusenda84.com/t/tenant-c10',
  version_code: 1,
  version_name: '1.0.0',
});

const branding = () => ({
  palette: { deep_sapphire: '#2D185E', pearl_white: '#FFFFFF' },
  assets: {
    icon: {
      id: 'asseticonc10t01', kind: 'icon', file_name: `icon-${'a'.repeat(32)}.png`,
      sha256: 'b'.repeat(64), width: 1024, height: 1024, bytes: 2048,
      source_format: 'png', source_width: 800, source_height: 800,
      normalizer_version: 'storefront-brand-v1-sharp-0.34', status: 'active',
    },
    splash: {
      id: 'assetsplashc101', kind: 'splash', file_name: `splash-${'c'.repeat(32)}.png`,
      sha256: 'd'.repeat(64), width: 1080, height: 1920, bytes: 4096,
      source_format: 'jpeg', source_width: 1200, source_height: 2000,
      normalizer_version: 'storefront-brand-v1-sharp-0.34', status: 'active',
    },
  },
});

test('separa y valida estrictamente aprovisionamiento de actualización', () => {
  assert.deepEqual(builds.parsePreviewPayload(provisionPayload()), {
    operation: 'provision',
    storeId: STORE_ID,
    appKey: 'tenant-c10-storefront',
    brandKey: 'tenant-c10',
    displayName: 'Tenant C10',
    includeAab: false,
    firebaseProjectId: 'tusenda84-tenant-c10',
    packageName: 'com.tusenda84.tenantc10',
    storeUrl: 'https://tusenda84.com/t/tenant-c10',
    versionCode: 1,
    versionName: '1.0.0',
  });
  assert.deepEqual(builds.parsePreviewPayload({
    store_id: STORE_ID,
    operation: 'update',
    display_name: 'Power Zona',
    include_aab: false,
    profile_id: PROFILE_ID,
    version_code: 2,
    version_name: '1.0.1',
  }), {
    operation: 'update', displayName: 'Power Zona', includeAab: false, storeId: STORE_ID, profileId: PROFILE_ID,
    versionCode: 2, versionName: '1.0.1',
  });
  assert.equal(builds.parsePreviewPayload({
    store_id: STORE_ID,
    operation: 'update',
    display_name: 'Power Zona\nAlterada',
    include_aab: false,
    profile_id: PROFILE_ID,
    version_code: 2,
    version_name: '1.0.1',
  }), null);
  assert.equal(builds.parsePreviewPayload({ ...provisionPayload(), service_account: 'forbidden' }), null);
  assert.equal(builds.parsePreviewPayload({ ...provisionPayload(), package_name: 'com.tusenda84.bad-package' }), null);
  assert.equal(builds.parsePreviewPayload({ ...provisionPayload(), store_url: 'https://tusenda84.com/t/tenant-c10?admin=1' }), null);
});

test('preview tenant crea solo APK y enumera efectos sensibles sin incluir secretos', () => {
  const store = record(STORE_ID, { slug: 'tenant-c10', name: 'Tenant C10' });
  const parsed = builds.parsePreviewPayload(provisionPayload());
  const preview = builds.buildPreview(store, parsed, null, new Date('2026-08-16T20:00:00.000Z'), branding());
  assert.equal(preview.build.apk, true);
  assert.equal(preview.build.aab, false);
  assert.equal(preview.firebase.create_project, true);
  assert.equal(preview.signing.create_app_signing_key, true);
  assert.equal(preview.signing.create_play_upload_key, false);
  assert.equal(preview.engine.target_version, builds.engineRelease().version);
  assert.equal(preview.engine.change_scope, 'shared_native_engine');
  assert.equal(preview.engine.update_available, false);
  assert.equal(preview.schema_version, 2);
  assert.equal(preview.branding.assets.icon.width, 1024);
  assert.deepEqual(preview.delivery.admin_receives, ['apk', 'checksums', 'instructions']);
  assert.equal(JSON.stringify(preview).match(/password|service_account|private_key|keystore/i), null);
});

test('preview PowerZona conserva APK+AAB y puede adoptar app config existente', () => {
  const store = record(STORE_ID, { slug: 'powerzona', name: 'PowerZona' });
  const parsed = builds.parsePreviewPayload({
    ...provisionPayload(),
    app_key: 'powerzona-storefront-staging',
    brand_key: 'powerzona',
    display_name: 'PowerZona',
    include_aab: true,
    firebase_project_id: 'tu-senda-84-storefront-staging',
    package_name: 'com.tusenda84.powerzona',
    store_url: 'https://tusenda84.com/t/powerzona',
    store_id: STORE_ID,
    version_code: 10,
    version_name: '0.2.8',
  });
  parsed.existingAppConfigId = 'appconfigc10a01';
  const preview = builds.buildPreview(store, parsed, null, new Date('2026-08-16T20:00:00.000Z'), branding());
  assert.equal(preview.build.aab, true);
  assert.equal(preview.firebase.create_project, false);
  assert.equal(preview.firebase.register_android_app, false);
  assert.equal(preview.firebase.adopts_existing_app_config, true);
  assert.deepEqual(preview.irreversible_or_sensitive_steps, [
    'generate_app_signing_key',
    'generate_play_upload_key',
  ]);
  assert.equal(preview.signing.create_play_upload_key, true);
});

test('actualización bloquea identidad, reutiliza firma y exige incrementar versionCode', () => {
  const store = record(STORE_ID, { slug: 'tenant-c10', name: 'Tenant C10' });
  const profile = record(PROFILE_ID, {
    store: STORE_ID, app_key: 'tenant-c10-storefront', brand_key: 'tenant-c10', display_name: 'Tenant C10',
    package_name: 'com.tusenda84.tenantc10', store_url: 'https://tusenda84.com/t/tenant-c10',
    distribution: 'direct', status: 'provisioned', firebase_project_id: 'tusenda84-tenant-c10',
    signing_cert_sha256: 'AA:'.repeat(31) + 'AA', current_version_code: 3, current_version_name: '1.0.2',
    last_allocated_version_code: 3,
  });
  assert.throws(() => builds.buildPreview(store, {
    operation: 'update', displayName: 'Tenant C10', storeId: STORE_ID, profileId: PROFILE_ID,
    versionCode: 3, versionName: '1.0.3',
  }, profile, undefined, branding()), /version_code_must_increase/);
  const preview = builds.buildPreview(store, {
    operation: 'update', displayName: 'Tenant C10 Renovada', storeId: STORE_ID, profileId: PROFILE_ID,
    versionCode: 4, versionName: '1.0.3',
  }, profile, new Date('2026-08-16T20:00:00.000Z'), branding());
  assert.equal(preview.firebase.create_project, false);
  assert.equal(preview.signing.create_app_signing_key, false);
  assert.ok(preview.immutable_identity.includes('package_name'));
  assert.equal(preview.immutable_identity.includes('display_name'), false);
  assert.equal(preview.identity.display_name, 'Tenant C10 Renovada');
  assert.equal(preview.identity.package_name, 'com.tusenda84.tenantc10');
  assert.equal(preview.build.version_code, 4);
  assert.equal(preview.engine.update_available, true);
  assert.equal(preview.engine.update_reason, 'engine_untracked');
  const withOptionalAab = builds.buildPreview(store, {
    operation: 'update', displayName: 'Tenant C10', includeAab: true, storeId: STORE_ID, profileId: PROFILE_ID,
    versionCode: 5, versionName: '1.0.4',
  }, profile, new Date('2026-08-16T20:00:00.000Z'), branding());
  assert.equal(withOptionalAab.build.apk, true);
  assert.equal(withOptionalAab.build.aab, true);
  assert.equal(withOptionalAab.signing.create_play_upload_key, true);
  assert.deepEqual(withOptionalAab.delivery.master_only, ['aab', 'build_manifest']);
});

test('permite una vista previa nueva tras fallar una actualización sin confundirla con un primer build', () => {
  const store = record(STORE_ID, { slug: 'powerzona', name: 'PowerZona' });
  const establishedProfile = record(PROFILE_ID, {
    store: STORE_ID, app_key: 'powerzona-storefront-staging', brand_key: 'powerzona', display_name: 'Power Zona',
    package_name: 'com.tusenda84.powerzona', store_url: 'https://tusenda84.com/t/powerzona',
    distribution: 'play_and_direct', status: 'needs_attention', firebase_project_id: 'tu-senda-84-storefront-staging',
    firebase_app_id: '1:123456789012:android:0123456789abcdef012345',
    signing_cert_sha256: '12:'.repeat(31) + '12', current_version_code: 10, current_version_name: '0.2.8',
    last_allocated_version_code: 11,
  });
  const preview = builds.buildPreview(store, {
    operation: 'update', displayName: 'Power Zona', includeAab: true, storeId: STORE_ID, profileId: PROFILE_ID,
    versionCode: 12, versionName: '0.2.9',
  }, establishedProfile, new Date('2026-08-20T17:00:00.000Z'), branding());
  assert.equal(preview.operation, 'update');
  assert.equal(preview.build.version_code, 12);
  assert.equal(preview.firebase.create_project, false);
  assert.equal(preview.signing.create_app_signing_key, false);

  const incompleteFirstBuild = record(PROFILE_ID, {
    store: STORE_ID, status: 'needs_attention', current_version_code: 0,
    firebase_project_id: 'tu-senda-84-storefront-staging',
  });
  assert.throws(() => builds.buildPreview(store, {
    operation: 'update', displayName: 'Power Zona', includeAab: true, storeId: STORE_ID, profileId: PROFILE_ID,
    versionCode: 1, versionName: '0.1.0',
  }, incompleteFirstBuild, undefined, branding()), /profile_not_provisioned/);
});

test('release aprobada detecta apps atrasadas y conserva severidad visual', () => {
  const previous = {
    version: process.env.PZ_STOREFRONT_ENGINE_VERSION,
    revision: process.env.PZ_STOREFRONT_ENGINE_REVISION,
    severity: process.env.PZ_STOREFRONT_ENGINE_UPDATE_SEVERITY,
  };
  process.env.PZ_STOREFRONT_ENGINE_VERSION = '1.1.0';
  process.env.PZ_STOREFRONT_ENGINE_REVISION = 'b'.repeat(40);
  process.env.PZ_STOREFRONT_ENGINE_UPDATE_SEVERITY = 'critical';
  try {
    const profile = record(PROFILE_ID, {
      status: 'provisioned', current_engine_version: '1.0.0', current_engine_revision: 'a'.repeat(40),
    });
    assert.deepEqual(builds.engineRelease(), {
      version: '1.1.0', revision: 'b'.repeat(40), severity: 'critical',
    });
    assert.deepEqual(builds.engineUpdateState(profile), {
      status: 'update_available', available: true, severity: 'critical', reason: 'version_changed',
      current_version: '1.0.0', current_revision: 'a'.repeat(40),
      target_version: '1.1.0', target_revision: 'b'.repeat(40),
    });
  } finally {
    for (const [key, value] of Object.entries({
      PZ_STOREFRONT_ENGINE_VERSION: previous.version,
      PZ_STOREFRONT_ENGINE_REVISION: previous.revision,
      PZ_STOREFRONT_ENGINE_UPDATE_SEVERITY: previous.severity,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('preview y confirmación fallan cerrado sin una revisión exacta del motor', () => {
  const previousVersion = process.env.PZ_STOREFRONT_ENGINE_VERSION;
  const previousRevision = process.env.PZ_STOREFRONT_ENGINE_REVISION;
  const store = record(STORE_ID, { slug: 'tenant-c10', name: 'Tenant C10' });
  try {
    delete process.env.PZ_STOREFRONT_ENGINE_REVISION;
    assert.throws(
      () => builds.buildPreview(store, builds.parsePreviewPayload(provisionPayload()), null, undefined, branding()),
      /engine_release_unconfigured/,
    );
    process.env.PZ_STOREFRONT_ENGINE_REVISION = 'a'.repeat(40);
    const preview = builds.buildPreview(store, builds.parsePreviewPayload(provisionPayload()), null, undefined, branding());
    assert.equal(preview.engine.target_revision, 'a'.repeat(40));
    assert.doesNotThrow(() => builds.assertPreviewEngineRelease(preview));
    assert.throws(
      () => builds.assertPreviewEngineRelease({
        ...preview,
        engine: { ...preview.engine, target_revision: 'b'.repeat(40) },
      }),
      /engine_release_changed/,
    );
  } finally {
    process.env.PZ_STOREFRONT_ENGINE_VERSION = previousVersion;
    process.env.PZ_STOREFRONT_ENGINE_REVISION = previousRevision;
  }
});

test('hash de preview es canónico, reproducible y cambia ante cualquier versión', () => {
  const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
  const first = { z: [2, 1], a: { y: true, x: 'ok' } };
  const reordered = { a: { x: 'ok', y: true }, z: [2, 1] };
  assert.equal(builds.hashPreview(first, sha256), builds.hashPreview(reordered, sha256));
  assert.notEqual(builds.hashPreview(first, sha256), builds.hashPreview({ ...first, version: 2 }, sha256));
  assert.equal(builds.canonicalJson(first), builds.canonicalJson(reordered));
});

test('completion del runner acepta solo metadatos sanitizados y visibilidad fija', () => {
  const artifact = (kind, visibility, fileName) => ({
    kind, visibility, file_name: fileName, storage_locator: 'pocketbase_managed',
    sha256: 'a'.repeat(64), bytes: 123,
  });
  const completion = builds.parseRunnerCompletion({
    job_id: 'jobc10runner001',
    runner_id: 'runner-c10-01',
    status: 'succeeded',
    failure_code: '',
    engine_version: '1.0.0',
    engine_revision: 'b'.repeat(40),
    firebase_project_number: '115337530324',
    firebase_app_id: '1:115337530324:android:8d3f78f8a93cdc1ea8e441',
    signing_cert_sha256: 'AA:'.repeat(31) + 'AA',
    upload_cert_sha256: '',
    artifacts: [
      artifact('apk', 'store_delivery', 'tenant-1.0.0-1-direct.apk'),
      artifact('checksums', 'store_delivery', 'SHA256SUMS.txt'),
      artifact('instructions', 'store_delivery', 'INSTRUCCIONES.txt'),
      artifact('build_manifest', 'master_only', 'build-manifest.json'),
    ],
  });
  assert.equal(completion.status, 'succeeded');
  const exposedAab = completion.artifacts.map((item) => ({ ...item }));
  exposedAab[0].visibility = 'master_only';
  assert.equal(builds.parseRunnerCompletion({
    job_id: 'jobc10runner001', runner_id: 'runner-c10-01', status: 'succeeded', failure_code: '',
    engine_version: '1.0.0', engine_revision: 'b'.repeat(40),
    firebase_project_number: '115337530324',
    firebase_app_id: '1:115337530324:android:8d3f78f8a93cdc1ea8e441',
    signing_cert_sha256: 'AA:'.repeat(31) + 'AA', upload_cert_sha256: '', artifacts: exposedAab,
  }), null);
});

test('C10.7 valida carga privada y deriva enlaces permanentes por artefacto', () => {
  assert.deepEqual(builds.parseRunnerArtifactUpload({
    job_id: JOB_ID,
    runner_id: 'runner-c107-01',
    kind: 'apk',
    visibility: 'store_delivery',
    file_name: 'tenant-1.0.0-1-direct.apk',
    sha256: 'a'.repeat(64),
    bytes: 2048,
  }), {
    jobId: JOB_ID,
    runnerId: 'runner-c107-01',
    kind: 'apk',
    visibility: 'store_delivery',
    fileName: 'tenant-1.0.0-1-direct.apk',
    sha256: 'a'.repeat(64),
    bytes: 2048,
  });
  assert.equal(builds.parseRunnerArtifactUpload({
    job_id: JOB_ID, runner_id: 'runner-c107-01', kind: 'apk', visibility: 'master_only',
    file_name: 'tenant.aab', sha256: 'a'.repeat(64), bytes: 2048,
  }), null);
  const security = { hs256: (value, secret) => createHmac('sha256', secret).update(value).digest('hex') };
  const profile = record(PROFILE_ID, { download_nonce: 'n'.repeat(43) });
  const artifact = record(ARTIFACT_ID, {
    file_name: 'tenant-1.0.0-1-direct.apk', sha256: 'a'.repeat(64), bytes: 2048, version_code: 1,
  });
  const first = builds.artifactDownloadUrl(artifact, profile, { origin: 'https://downloads.example.test', security });
  const second = builds.artifactDownloadUrl(artifact, profile, { origin: 'https://downloads.example.test', security });
  assert.equal(first, second);
  assert.match(first, new RegExp(`/api/pz/storefront-app-downloads/${ARTIFACT_ID}/[a-f0-9]{64}/tenant-1\\.0\\.0-1-direct\\.apk$`));
  assert.notEqual(
    builds.artifactDownloadUrl(artifact, record(PROFILE_ID, { download_nonce: 'm'.repeat(43) }), {
      origin: 'https://downloads.example.test', security,
    }),
    first,
  );
  assert.notEqual(
    builds.artifactDownloadUrl(record(ARTIFACT_ID, {
      file_name: 'tenant-1.0.0-1-direct.apk', sha256: 'b'.repeat(64), bytes: 2048, version_code: 1,
    }), profile, { origin: 'https://downloads.example.test', security }),
    first,
  );
});

test('entrega WhatsApp manual exige numeros internacionales y administrador principal activo', () => {
  assert.equal(builds.normalizeWhatsappNumber('+53 5 555 1234'), '5355551234');
  assert.equal(builds.normalizeWhatsappNumber(''), '');
  assert.equal(builds.normalizeWhatsappNumber('WhatsApp 5355551234'), null);
  assert.equal(builds.normalizeWhatsappNumber('055551234'), null);
  assert.deepEqual(builds.parseWhatsappSettingsPayload({ whatsapp_number: '+1 (305) 555-0123' }), {
    whatsappNumber: '13055550123',
  });
  assert.equal(builds.parseWhatsappSettingsPayload({ whatsapp_number: '555' }), null);
  assert.deepEqual(builds.parseWhatsappPreviewPayload({ store_id: STORE_ID, artifact_id: ARTIFACT_ID }), {
    storeId: STORE_ID, artifactId: ARTIFACT_ID,
  });

  const store = record(STORE_ID, { name: 'Tenant C10', slug: 'tenant-c10', primary_admin_user: PRIMARY_ID });
  const profile = record(PROFILE_ID, { store: STORE_ID, display_name: 'Tenant C10', download_nonce: 'n'.repeat(43) });
  const job = record(JOB_ID, { store: STORE_ID, profile: PROFILE_ID, status: 'succeeded', operation: 'provision' });
  const artifact = record(ARTIFACT_ID, {
    store: STORE_ID, profile: PROFILE_ID, job: JOB_ID, kind: 'apk', visibility: 'store_delivery',
    file: 'tenant-c10-1.0.1-2-direct_x.apk', file_name: 'tenant-c10-1.0.1-2-direct.apk',
    sha256: 'a'.repeat(64), bytes: 2048, version_code: 2, version_name: '1.0.1',
    lifecycle_status: 'available', release_status: 'published',
  });
  const sender = record(MASTER_ID, {
    display_name: 'Master TS84', role: 'master_admin', status: 'active', phone: '+53 5 111 2233',
  });
  const recipient = record(PRIMARY_ID, {
    display_name: 'Admin principal', role: 'store_admin', status: 'active', store: STORE_ID, phone: '+53 5 444 5566',
  });
  const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
  assert.throws(() => builds.buildManualWhatsappPreview(
    store,
    profile,
    job,
    record(ARTIFACT_ID, {
      store: STORE_ID, profile: PROFILE_ID, job: JOB_ID, kind: 'apk', visibility: 'store_delivery',
      file: 'tenant-c10-1.0.1-2-direct_x.apk', file_name: 'tenant-c10-1.0.1-2-direct.apk',
      sha256: 'a'.repeat(64), bytes: 2048, version_code: 2, version_name: '1.0.1',
      lifecycle_status: 'available', release_status: 'candidate',
    }),
    sender,
    recipient,
    sha256,
  ), /apk_not_ready/);
  const preview = builds.buildManualWhatsappPreview(store, profile, job, artifact, sender, recipient, sha256, {
    origin: 'https://downloads.example.test',
    security: { hs256: (value, secret) => createHmac('sha256', secret).update(value).digest('hex') },
  });
  assert.equal(preview.mode, 'manual_wa_me');
  assert.equal(preview.automatic_send, false);
  assert.equal(preview.cloud_api, false);
  assert.equal(preview.schema_version, 2);
  assert.equal(preview.attachment_required, false);
  assert.equal(preview.recipient_whatsapp, '5354445566');
  assert.match(preview.whatsapp_url, /^https:\/\/wa\.me\/5354445566\?text=/);
  assert.match(preview.message, /SHA-256: a{64}/);
  assert.match(preview.download_url, /^https:\/\/downloads\.example\.test\/api\/pz\/storefront-app-downloads\//);
  assert.match(preview.message, /Enlace permanente de esta versión:/i);
  assert.match(preview.message, /descarga el APK físico/i);
  assert.match(preview.sender_warning, /5351112233/);
  assert.match(preview.message_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(builds.parseWhatsappMarkedPayload({
    store_id: STORE_ID,
    artifact_id: ARTIFACT_ID,
    message_sha256: preview.message_sha256,
    confirmation: 'MARCAR ENVIADO',
  }), {
    storeId: STORE_ID,
    artifactId: ARTIFACT_ID,
    messageSha256: preview.message_sha256,
    confirmation: 'MARCAR ENVIADO',
  });
  assert.throws(() => builds.buildManualWhatsappPreview(
    store,
    profile,
    job,
    artifact,
    sender,
    record(PRIMARY_ID, {
      display_name: 'Admin principal', role: 'store_admin', status: 'suspended', store: STORE_ID, phone: '5354445566',
    }),
    sha256,
    {
      origin: 'https://downloads.example.test',
      security: { hs256: (value, secret) => createHmac('sha256', secret).update(value).digest('hex') },
    }
  ), /primary_admin_invalid/);
});

test('inventario global separa builds pendientes de APK listos para WhatsApp', () => {
  const profile = record(PROFILE_ID, {
    store: STORE_ID, status: 'provisioned', app_key: 'tenant-c10-storefront', display_name: 'Tenant C10',
    current_version_code: 2, current_version_name: '1.0.1', current_engine_version: '1.0.0', current_engine_revision: '',
  });
  const job = record(JOB_ID, {
    store: STORE_ID, profile: PROFILE_ID, status: 'succeeded', delivery_status: 'pending',
    completed_at: '2026-08-17T12:00:00.000Z',
  });
  const artifact = record(ARTIFACT_ID, {
    store: STORE_ID, profile: PROFILE_ID, job: JOB_ID, kind: 'apk', visibility: 'store_delivery',
    file_name: 'tenant-c10-1.0.1-2-direct.apk', sha256: 'a'.repeat(64), version_code: 2, version_name: '1.0.1',
    lifecycle_status: 'available', release_status: 'published',
  });
  const store = record(STORE_ID, { name: 'Tenant C10', slug: 'tenant-c10', primary_admin_user: PRIMARY_ID });
  const primary = record(PRIMARY_ID, {
    display_name: 'Admin principal', role: 'store_admin', status: 'active', store: STORE_ID, phone: '5354445566',
  });
  const sender = record(MASTER_ID, {
    display_name: 'Master TS84', role: 'master_admin', status: 'active', phone: '5351112233',
  });
  const byId = new Map([[STORE_ID, store], [PRIMARY_ID, primary], [JOB_ID, job]]);
  const app = {
    findRecordsByFilter(collection) {
      if (collection === builds.PROFILES) return [profile];
      if (collection === builds.JOBS) return [job];
      if (collection === builds.ARTIFACTS) return [artifact];
      return [];
    },
    findFirstRecordByFilter(collection) {
      return collection === builds.ARTIFACTS ? artifact : null;
    },
    findRecordById(_collection, id) {
      const found = byId.get(id);
      if (!found) throw new Error('not_found');
      return found;
    },
  };
  const inventory = builds.engineUpdatesResponse(app, sender);
  assert.equal(inventory.delivery_pending_count, 1);
  assert.equal(inventory.deliveries[0].artifact_id, ARTIFACT_ID);
  assert.equal(inventory.deliveries[0].recipient.status, 'ready');
  assert.equal(inventory.manual_whatsapp_sender.whatsapp_number, '5351112233');
  assert.match(inventory.deliveries[0].action_url, /\?channel=publication#entrega-whatsapp$/);
});

test('rutas Master y runner usan autenticación separada y body limits', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const routes = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_storefront_app_builds.pb.js'), 'utf8');
  const implementation = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_storefront_app_builds_lib.js'), 'utf8');
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/preview/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/updates/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/whatsapp\/settings/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/whatsapp\/preview/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/whatsapp\/marked-sent/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/brand-assets\/upload/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/brand-assets\/file/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/cancel/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-builds\/release-action/);
  assert.match(routes, /\/api\/pz\/master\/storefront-app-artifacts\/\{artifact\}\/\{filename\}/);
  assert.match(routes, /\$apis\.requireAuth\(\)/);
  assert.match(routes, /\/api\/pz\/internal\/storefront-app-builds\/claim/);
  assert.match(routes, /\/api\/pz\/internal\/storefront-app-builds\/brand-assets/);
  assert.match(routes, /requireRunner/);
  assert.match(routes, /bodyLimit\(65536\)/);
  assert.doesNotMatch(routes, /service.account|private.key|keystore/i);
  assert.match(implementation, /profile\.set\("display_name", displayName\)/);
  assert.match(implementation, /appConfig\.set\("display_name", displayName\)/);
});
