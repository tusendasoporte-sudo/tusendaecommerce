import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createAdminAppDownloadTicket,
  getAdminAppPortal,
  parseNativeAdminAppUserAgent,
} from '../src/lib/mobileAdminReleases.ts';

const backendRoutes = readFileSync(new URL('../../backend-powerzona/pb_hooks/pz_admin_app_releases.pb.js', import.meta.url), 'utf8');
const backendLib = readFileSync(new URL('../../backend-powerzona/pb_hooks/pz_admin_app_releases_lib.js', import.meta.url), 'utf8');
const masterPage = readFileSync(new URL('../src/pages/master/mobile-admin.astro', import.meta.url), 'utf8');
const masterView = readFileSync(new URL('../src/components/master/MasterMobileAdminReleaseView.astro', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../src/pages/admin/mobile-app.astro', import.meta.url), 'utf8');
const ticketApi = readFileSync(new URL('../src/pages/api/admin/mobile-app/ticket.ts', import.meta.url), 'utf8');
const downloadApi = readFileSync(new URL('../src/pages/api/admin/mobile-app/download/[artifact]/[ticket]/[filename].ts', import.meta.url), 'utf8');
const middleware = readFileSync(new URL('../src/middleware.ts', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/admin/AdminSidebar.astro', import.meta.url), 'utf8');
const android = readFileSync(new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/MainActivity.java', import.meta.url), 'utf8');
const adminMessaging = readFileSync(new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/AdminMessagingService.java', import.meta.url), 'utf8');
const adminNotificationClient = readFileSync(new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/AdminNotificationClient.java', import.meta.url), 'utf8');
const adminNotificationStore = readFileSync(new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/AdminNotificationStore.java', import.meta.url), 'utf8');
const adminPushPayload = readFileSync(new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/AdminPushPayload.java', import.meta.url), 'utf8');
const adminPushBackend = readFileSync(new URL('../../backend-powerzona/pb_hooks/pz_admin_push_resilience_lib.js', import.meta.url), 'utf8');
const adminPushRoutes = readFileSync(new URL('../../backend-powerzona/pb_hooks/pz_admin_push_resilience.pb.js', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/AdminApkVerifier.java', import.meta.url), 'utf8');
const adminBuilder = readFileSync(new URL('../../scripts/build-admin-app.ps1', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../mobile-admin/runner/run-admin-app-job-queue.ps1', import.meta.url), 'utf8');
const runnerCustody = readFileSync(new URL('../../mobile-admin/runner/initialize-admin-runner-custody.ps1', import.meta.url), 'utf8');
const runnerInvoker = readFileSync(new URL('../../mobile-admin/runner/invoke-admin-runner.ps1', import.meta.url), 'utf8');
const runnerShortcut = readFileSync(new URL('../../mobile-admin/runner/install-admin-runner-shortcut.ps1', import.meta.url), 'utf8');
const gradle = readFileSync(new URL('../../mobile-admin/app/build.gradle', import.meta.url), 'utf8');
const launchBackground = readFileSync(new URL('../../mobile-admin/app/src/main/res/drawable/launch_background.xml', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../../mobile-admin/app/src/main/res/values/themes.xml', import.meta.url), 'utf8');
const theme31 = readFileSync(new URL('../../mobile-admin/app/src/main/res/values-v31/themes.xml', import.meta.url), 'utf8');

test('User-Agent distingue browser, APK histórica y versión reproducible nueva', () => {
  assert.equal(parseNativeAdminAppUserAgent('Mozilla/5.0 Chrome/140'), null);
  assert.deepEqual(parseNativeAdminAppUserAgent('Mozilla/5.0 TuSenda84Admin/1.0'), {
    package_name: 'com.tusenda84.admin', version_code: 3, version_name: '1.0.2',
  });
  assert.deepEqual(parseNativeAdminAppUserAgent('Mozilla/5.0 TuSenda84Admin/1.0.3 (4; com.tusenda84.admin.staging)'), {
    package_name: 'com.tusenda84.admin.staging', version_code: 4, version_name: '1.0.3',
  });
  assert.deepEqual(parseNativeAdminAppUserAgent('Mozilla/5.0 TuSenda84Admin/1.0.3 (4)'), {
    package_name: 'com.tusenda84.admin', version_code: 4, version_name: '1.0.3',
  });
});

test('ticket cliente usa autenticación y dispositivo y normaliza una descarga privada', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({
      ok: true,
      ticket: 'T'.repeat(43),
      expires_at: '2026-08-18T23:59:00.000Z',
      download_path: `/api/pz/admin-app-downloads/artifactc108001/${'T'.repeat(43)}/mobile-admin-1.0.3-4.apk`,
      artifact: {
        id: 'artifactc108001', profile_id: 'profilec1080001', job_id: 'jobc10800000001', kind: 'apk',
        file_name: 'mobile-admin-1.0.3-4.apk', sha256: 'a'.repeat(64), bytes: 22,
        version_code: 4, version_name: '1.0.3', lifecycle_status: 'available', stored: true,
      },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await createAdminAppDownloadTicket(
      'https://pb.example.test', 'auth-token', 'D'.repeat(43), {
        grant: 'G'.repeat(43), package_name: 'com.tusenda84.admin.staging', channel: 'staging',
      },
    );
    assert.equal(result.available, true);
    assert.equal(result.data?.artifact.version_code, 4);
    assert.match(request.url, /\/api\/pz\/admin-app\/releases\/ticket$/);
    assert.equal(request.options.headers.Authorization, 'Bearer auth-token');
    assert.equal(request.options.headers['X-PZ-Admin-Device'], 'D'.repeat(43));
    assert.deepEqual(JSON.parse(request.options.body), {
      grant: 'G'.repeat(43), package_name: 'com.tusenda84.admin.staging', channel: 'staging',
    });
  } finally { globalThis.fetch = originalFetch; }
});

test('portal normaliza el destinatario en tiempo real sin exigir asignación', async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      ok: true,
      access: {
        grant_present: false,
        recipient: {
          store: { id: 'storec108000001', name: 'QA', slug: 'qa' },
          user: { id: 'userc1080000001', name: 'Admin', email: 'admin@example.test' },
          device: { id: 'devicec10800001', label: 'Teléfono', status: 'authorized' },
        },
        profile: {
          id: 'profilec1080001', channel: 'production', display_name: 'Tu Senda 84 Admin',
          package_name: 'com.tusenda84.admin', admin_url: 'https://tusenda84.com/admin',
          firebase_configured: false, signing_configured: true, signing_cert_sha256: '',
          latest_version_code: 4, latest_version_name: '1.0.3', next_version_code: 5,
          identity_locked: true, icon: null, splash: null, splash_background_color: '#FFFFFF',
          minimum_supported_version_code: 0, status: 'active',
        },
        artifact: {
          id: 'artifactc108001', profile_id: 'profilec1080001', job_id: 'jobc10800000001', kind: 'apk',
          file_name: 'mobile-admin-1.0.3-4.apk', sha256: 'a'.repeat(64), bytes: 22,
          version_code: 4, version_name: '1.0.3', lifecycle_status: 'available', stored: true,
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await getAdminAppPortal('https://pb.example.test', 'auth-token', 'D'.repeat(43), {
      grant: '', package_name: 'com.tusenda84.admin', channel: 'production',
    });
    assert.equal(result.available, true);
    assert.equal(result.data?.recipient.device.label, 'Teléfono');
    assert.equal(Object.hasOwn(result.data || {}, 'assignment'), false);
    assert.deepEqual(body, { grant: '', package_name: 'com.tusenda84.admin', channel: 'production' });
  } finally { globalThis.fetch = originalFetch; }
});

test('backend no expone capacidad anónima y revalida identidad al descargar', () => {
  assert.match(backendRoutes, /\$apis\.requireAuth\(\)[\s\S]*admin-app-downloads|admin-app-downloads[\s\S]*\$apis\.requireAuth\(\)/);
  assert.doesNotMatch(backendRoutes, /storefront-app-downloads/);
  assert.match(backendLib, /authorizedAdminContext\(e\.app \|\| \$app, e\.auth/);
  assert.match(backendLib, /relationId\(ticket, "user"\) !== context\.user\.id/);
  assert.match(backendLib, /relationId\(ticket, "device"\) !== context\.device\.id/);
  assert.match(backendLib, /iso\(recordValue\(ticket, "used_at"\)\)/);
  assert.match(backendLib, /expires_at/);
  assert.match(backendLib, /Content-Disposition/);
  assert.match(backendLib, /X-PZ-APK-SHA256/);
  assert.match(backendLib, /profileSnapshot\(resolved\.profile, app, "admin"\)/);
  assert.match(backendLib, /generalPublished\(app, artifact\.id\)/);
  assert.match(backendRoutes, /master\/admin-app-artifacts/);
});

test('panel Master separa preparación de publicación y reutiliza la APK aprobada', () => {
  assert.match(masterPage, /requireMasterAdmin/);
  assert.match(masterPage, /private, no-store/);
  assert.match(masterView, /Configurar la aplicación/);
  assert.match(masterView, /Elegir la apariencia/);
  assert.match(masterView, /Preparar una nueva versión/);
  assert.match(masterView, /Probar y aprobar/);
  assert.match(masterView, /Aplicación publicada/);
  assert.match(masterView, /Lista para publicar/);
  assert.match(masterView, /data\.engine\.name/);
  assert.match(masterView, /!!previewJob \|\| !!activeExecutionJob/);
  assert.match(masterView, /automático/);
  assert.match(masterView, /Cambiar icono/);
  assert.match(masterView, /Cambiar pantalla/);
  assert.match(masterView, /Personalizar icono y pantalla de inicio/);
  assert.match(masterView, /use_engine_brand/);
  assert.doesNotMatch(masterView, /name="stage"|name="wave"|name="version_code"/);
  assert.doesNotMatch(masterView, /action: 'assign_next'/);
  assert.match(masterView, /action: 'publish_general'/);
  assert.match(masterView, /action: 'approve_test'/);
  assert.match(masterView, /Descargar APK de prueba/);
  assert.match(masterView, /Aprobar APK/);
  assert.match(masterView, /Publicar actualización/);
  assert.match(masterView, /Publicar primera versión/);
  assert.match(masterView, /Pausar temporalmente/);
  assert.match(masterView, /Retirar publicación/);
  assert.match(masterView, /resume_release/);
  assert.match(masterView, /Notificaciones Firebase incluidas/);
  assert.match(masterView, /Una sola APK Admin/);
  assert.match(masterView, /mismo archivo y el mismo SHA-256/);
  assert.doesNotMatch(masterView, /Firebase project ID|Firebase app ID|Firebase \(opcional\)/);
  assert.doesNotMatch(masterView, /Administrador y dispositivo|Oleada|data-assignment-form/);
  assert.match(masterView, /pb\.authStore\.loadFromCookie\(document\.cookie, 'pb_auth'\)/);
  assert.match(masterPage, /channel.*publication.*prepare|publication.*prepare/s);
  assert.match(masterView, /\?channel=prepare/);
  assert.match(masterView, /\?channel=publication/);
  assert.doesNotMatch(masterView, /\?channel=staging|\?channel=production/);
  assert.match(backendLib, /canonical_build_channel: "production"/);
  assert.match(backendLib, /single_artifact_release: true/);
  assert.match(backendLib, /publication_reuses_approved_artifact: true/);
  assert.match(adminBuilder, /\[ValidateSet\('production'\)\]\[string\]\$Channel = 'production'/);
  assert.doesNotMatch(adminBuilder, /ValidateSet\([^\r\n]*staging/);
  assert.match(runner, /job\.preview\.channel -cne 'production'/);
  assert.match(adminBuilder, /Push-Location -LiteralPath \$mobileRoot/);
  assert.match(adminBuilder, /if \(\$gradleLocationPushed\) \{ Pop-Location \}/);
  assert.match(runner, /\$iterationFailureCode = \$code/);
  assert.match(runner, /if \(\$Once -and \$iterationFailureCode\) \{ throw/);
  assert.doesNotMatch(masterView, /wa\.me|WhatsApp|Google Play|generate.*sign/i);
});

test('portal y proxy conservan sesión, dispositivo y APK privada sin asignación individual', () => {
  assert.match(portal, /isStoreAdmin/);
  assert.match(portal, /únicamente con su sesión[\s\S]*dispositivo autorizado/i);
  assert.match(portal, /access\.recipient\.user/);
  assert.doesNotMatch(portal, /access\.assignment|Oleada/);
  assert.match(portal, /\/api\/admin\/mobile-app\/ticket/);
  assert.match(portal, /PZAndroidUpdate/);
  assert.match(ticketApi, /refreshAuthFromCookie/);
  assert.match(ticketApi, /readAdminDeviceToken/);
  assert.match(downloadApi, /Authorization: `Bearer/);
  assert.match(downloadApi, /ADMIN_DEVICE_HEADER_NAME/);
  assert.match(downloadApi, /new Response\(response\.body/);
  assert.match(downloadApi, /private, no-store/);
});

test('enforcement afecta la app antigua y deja navegadores normales fuera del gate', () => {
  assert.match(middleware, /parseNativeAdminAppUserAgent/);
  assert.match(middleware, /policy\.data\?\.update_required/);
  assert.match(middleware, /status: 426/);
  assert.match(middleware, /requestedSection !== 'mobile-app'/);
  assert.match(middleware, /context\.locals\.adminAppPolicy = policy\.data/);
  assert.match(sidebar, /Actualizar aplicación/);
  assert.match(sidebar, /adminAppPolicy\?\.update_available/);
  assert.match(middleware, /change-temporary-password/);
});

test('Android verifica checksum, paquete, código y firma antes del instalador', () => {
  assert.match(android, /TuSenda84Admin\/" \+ BuildConfig\.VERSION_NAME/);
  assert.match(android, /AdminApkVerifier\.verify/);
  assert.match(android, /FileProvider\.getUriForFile/);
  assert.match(android, /canRequestPackageInstalls/);
  assert.match(android, /mobile-admin-\[0-9\]\+\\\\\.apk/);
  assert.match(verifier, /update_checksum_mismatch/);
  assert.match(verifier, /update_package_mismatch/);
  assert.match(verifier, /update_version_mismatch/);
  assert.match(verifier, /update_signature_mismatch/);
  assert.match(launchBackground, /@color\/pz_splash_background/);
  assert.match(launchBackground, /@drawable\/splash_icon/);
  assert.match(theme, /@drawable\/launch_background/);
  assert.match(theme31, /windowSplashScreenAnimatedIcon">@drawable\/splash_icon/);
});

test('runner solo acepta firma existente y usa un secreto exclusivo', () => {
  assert.match(runner, /PZ_ADMIN_APP_RUNNER_SECRET/);
  assert.match(runner, /SigningPropertiesPath/);
  assert.doesNotMatch(runner, /generate.*sign|keytool\s+-genkey/i);
  assert.match(runner, /admin-app-builds\/artifacts\/upload/);
  assert.match(runner, /admin-app-builds\/complete/);
  assert.match(runner, /admin-app-runners\/heartbeat/);
  assert.match(runner, /runner_engine_release_mismatch/);
  assert.match(runner, /engine_manifest|engineManifest/i);
  assert.match(runner, /admin-app-brand-assets/);
  assert.match(runner, /runner_brand_checksum_mismatch/);
  assert.match(runner, /MultipartFormDataContent/);
  assert.doesNotMatch(runner, /Invoke-RestMethod[^\r\n]*-Form/);
  assert.match(runnerCustody, /Windows DPAPI CurrentUser/);
  assert.match(runnerCustody, /SecretsRoot debe estar fuera del repositorio/);
  assert.match(runnerInvoker, /admin-runner-settings\.json/);
  assert.match(runnerShortcut, /Tu Senda 84 - Construir App Admin/);
  assert.match(runnerShortcut, /-Once/);
  assert.match(runnerShortcut, /SecretsInShortcutArguments = \$false/);
  assert.match(gradle, /releaseKeystorePropertiesFile\.parentFile/);
  assert.match(gradle, /Firebase es obligatorio/);
  assert.match(gradle, /releasePackagingRequested && !firebaseConfigFile\.exists/);
});

test('Mobile Admin recupera avisos sin depender exclusivamente de Firebase', () => {
  assert.match(sidebar, /\/api\/pz\/admin-push\/v2\/register/);
  assert.match(sidebar, /credential_required/);
  assert.match(sidebar, /completeRegistration\?\.\(credential, storeId\)/);
  assert.match(sidebar, /setNotificationsEnabled/);
  assert.doesNotMatch(sidebar, /\/api\/pz\/store-push\/disable/);
  assert.match(android, /localInstallationId/);
  assert.match(android, /TRIGGER_RESUME/);
  assert.match(android, /TRIGGER_FOREGROUND/);
  assert.match(adminNotificationClient, /\/api\/pz\/admin-push\/v2\/notifications\/sync/);
  assert.match(adminNotificationClient, /BuildConfig\.API_BASE_URL/);
  assert.doesNotMatch(adminNotificationClient, /BuildConfig\.ADMIN_URL/);
  assert.match(adminNotificationClient, /runDurableBackgroundSync/);
  assert.match(adminMessaging, /AdminPushPayload\.fromFcm/);
  assert.match(adminMessaging, /PushNotifications\.show/);
  assert.match(adminNotificationStore, /native_delivered/);
  assert.match(adminPushPayload, /source\.keySet\(\)\.equals\(FCM_KEYS\)/);
  assert.doesNotMatch(
    adminNotificationClient + adminNotificationStore + adminPushPayload,
    /\b(?:Set|List)\.(?:of|copyOf)\(/,
  );
  assert.match(adminNotificationClient, /while \(keys\.hasNext\(\)\)/);
  assert.match(adminPushPayload, /while \(keys\.hasNext\(\)\)/);
  assert.match(adminMessaging, /PushNotifications\.show/);
  assert.match(
    readFileSync(new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/PushNotifications.java', import.meta.url), 'utf8'),
    /static synchronized boolean show[\s\S]*boundStoreId[\s\S]*wasDisplayed[\s\S]*markDisplayed/,
  );
  assert.match(adminPushBackend, /SYNC_WINDOW_MS = 72/);
  assert.match(adminPushBackend, /credential_digest/);
  assert.match(adminPushRoutes, /admin_push_receipt_cleanup/);
  assert.match(masterView, /Firebase \+ recuperación automática/);
});
