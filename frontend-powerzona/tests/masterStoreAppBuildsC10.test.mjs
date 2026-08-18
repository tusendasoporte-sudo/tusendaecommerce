import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getMasterAppBuildErrorMessage,
  getMasterStoreAppBuilds,
  getMasterStoreAppEngineUpdates,
  markMasterStoreAppWhatsappSent,
  previewMasterStoreAppWhatsappDelivery,
  proposeFirebaseProjectId,
  runMasterStoreAppAdminAction,
  saveMasterWhatsappSettings,
} from '../src/lib/masterStoreAppBuilds.ts';

test('conserva visible un trabajo C10 heredado para poder cancelarlo antes de cargar la marca', async () => {
  const originalFetch = globalThis.fetch;
  const storeId = 'storec10test001';
  const profileId = 'profilec10test1';
  const jobId = 'jobc10legacy001';
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    generated_at: '2026-08-17T12:00:00.000Z',
    store: { id: storeId, name: 'Tenant C10', slug: 'tenant-c10' },
    engine_release: { version: '1.0.0', revision: 'a'.repeat(40), severity: 'recommended' },
    brand_assets: {
      ready: false,
      normalizer_policy: {
        input: ['jpeg', 'png', 'webp'],
        icon: { width: 1024, height: 1024 },
        splash: { width: 1080, height: 1920 },
        fit: 'contain_without_crop',
        metadata_removed: true,
      },
      palette: { splash_background: '#ffffff' },
      icon: null,
      splash: null,
    },
    manual_whatsapp_delivery: {
      mode: 'manual_wa_me', automatic_send: false, cloud_api: false, attachment_mode: 'manual',
      sender: {
        user_id: 'masterc10test01', display_name: 'Master', whatsapp_number: '5351112233',
        configured: true, phone_state: 'configured',
      },
      recipient: {
        status: 'ready', user_id: 'primaryc10test1', display_name: 'Principal', whatsapp_number: '5354445566',
        configured: true, phone_state: 'configured',
      },
    },
    profile: {
      id: profileId,
      app_key: 'tenant-c10-storefront', display_name: 'Tenant C10', package_name: 'com.tusenda84.tenantc10',
      store_url: 'https://tusenda84.com/t/tenant-c10', brand_key: 'tenant-c10', distribution: 'direct',
      status: 'queued', firebase_project_id: 'ts84-tenant-c10-test001', firebase_project_number: '',
      firebase_app_id: '', signing_cert_sha256: '', upload_cert_sha256: '', current_version_code: 1,
      current_version_name: '1.0.1', current_engine_version: '', current_engine_revision: '',
      icon_asset_id: '', splash_asset_id: '',
      engine_update: {
        status: 'pending_first_build', available: false, severity: 'none', reason: 'first_build_pending',
        current_version: '', current_revision: '', target_version: '1.0.0', target_revision: 'a'.repeat(40),
      },
      created: '2026-08-17T12:00:00.000Z', updated: '2026-08-17T12:00:00.000Z',
    },
    jobs: [{
      id: jobId, profile_id: profileId, operation: 'provision', status: 'queued', preview_hash: 'b'.repeat(64),
      preview: {
        schema_version: 1, operation: 'provision', store: { id: storeId, name: 'Tenant C10', slug: 'tenant-c10' },
        identity: {},
        engine: { target_version: '1.0.0', target_revision: 'a'.repeat(40), change_scope: 'shared_native_engine' },
        firebase: {}, signing: {}, build: {}, delivery: {},
      },
      preview_expires_at: '', confirmed_at: '2026-08-17T12:00:00.000Z', runner_id: '', failure_code: '',
      started_at: '', completed_at: '', delivery_status: '', delivery_sender_id: '', delivery_recipient_id: '',
      delivery_sender_whatsapp: '', delivery_recipient_whatsapp: '', delivery_message_sha256: '',
      delivery_marked_at: '', created: '2026-08-17T12:00:00.000Z', updated: '2026-08-17T12:00:00.000Z',
    }],
    artifacts: [],
    policy: {
      firebase_project_per_store: true, signing_custodian: 'Tu Senda 84',
      store_admin_delivery: ['apk', 'checksums', 'instructions'], powerzona_distribution: 'play_and_direct',
      tenant_distribution: 'direct', runner_isolated: true,
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await getMasterStoreAppBuilds('https://pb.example.test', 'token-c10', storeId);
    assert.equal(result.available, true);
    assert.equal(result.data?.jobs.length, 1);
    assert.equal(result.data?.jobs[0].id, jobId);
    assert.equal(result.data?.jobs[0].status, 'queued');
    assert.equal(result.data?.jobs[0].preview, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('propone un ID Firebase reproducible desde el nombre y la identidad estable de la tienda', () => {
  const storeId = 'storec10test001';
  const proposal = proposeFirebaseProjectId('Ferretería El Sol', storeId);
  assert.equal(proposal, 'ts84-ferreteria-el-so-0test001');
  assert.equal(proposeFirebaseProjectId('Ferretería El Sol', storeId), proposal);
  assert.notEqual(proposeFirebaseProjectId('Ferretería El Sol', 'storec10test002'), proposal);
  assert.match(proposal, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
  assert.equal(proposal.length <= 30, true);
  assert.doesNotMatch(proposeFirebaseProjectId('Google SSL', storeId), /google|ssl/);
});

test('panel C10 es exclusivo Master y no contiene compilador, shell ni secretos', () => {
  const page = readFileSync(new URL('../src/pages/master/stores/[storeId]/app.astro', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/components/master/MasterStoreAppBuildView.astro', import.meta.url), 'utf8');
  const brandApi = readFileSync(new URL('../src/pages/api/master/store-app-brand-assets.ts', import.meta.url), 'utf8');
  assert.match(page, /requireMasterAdmin/);
  assert.match(page, /private, no-store/);
  assert.match(view, /previewMasterStoreAppBuild/);
  assert.match(view, /confirmMasterStoreAppBuild/);
  assert.doesNotMatch(view, /gradlew|child_process|exec\(|spawn\(|service.account|private.key|keystore/i);
  assert.match(view, /APK, checksum e instrucciones/);
  assert.match(view, /Actualización del motor/);
  assert.match(view, /Motor aprobado/);
  assert.match(view, /Entrega manual por WhatsApp/);
  assert.match(view, /Sin Cloud API/);
  assert.match(view, /data-app-whatsapp-account-check/);
  assert.match(view, /data-app-whatsapp-sent-check/);
  assert.match(view, /data-app-preview-close/);
  assert.match(view, /Cerrar vista previa/);
  assert.match(view, /data-app-preview-collapsed/);
  assert.match(view, /Vista previa pendiente cerrada/);
  assert.match(view, /data-app-preview-open/);
  assert.match(view, /Abrir vista previa/);
  assert.match(view, /pz-master-app-preview-closed:\$\{storeId\}/);
  assert.match(view, /window\.sessionStorage\.setItem\(previewDismissalKey, token\)/);
  assert.match(view, /readPreviewDismissal\(\) === previewToken\(\)/);
  assert.match(view, /clearPreviewDismissal\(\)/);
  assert.match(view, /previewCard\.hidden = true/);
  assert.match(view, /previewCollapsed\.hidden = false/);
  assert.match(view, /!profile \|\| job\.profile_id === profile\.id/);
  assert.match(view, /belongsToCurrentProfile\(job\).*job\.status === 'preview'/s);
  assert.match(view, /confirmCheck\.checked = false/);
  assert.match(view, /confirmButton\.disabled = true/);
  assert.equal(view.includes("pattern={'[a-z0-9][a-z0-9\\\\-]{1,62}[a-z0-9]'}"), true);
  assert.equal((view.match(/pattern=\{'\[0-9\]\+\\\\\.\[0-9\]\+\\\\\.\[0-9\]\+'\}/g) || []).length, 2);
  assert.match(view, /El APK debe adjuntarse manualmente/);
  assert.match(view, />Destinatario</);
  assert.match(view, /\/master\/settings#whatsapp-master/);
  assert.doesNotMatch(view, /data-app-whatsapp-settings-form|Guardar número|saveMasterWhatsappSettings/);
  assert.match(view, /previewMasterStoreAppWhatsappDelivery/);
  assert.match(view, /markMasterStoreAppWhatsappSent/);
  assert.match(view, /Icono y pantalla de inicio/);
  assert.match(view, /data-app-brand-form/);
  assert.match(view, /1024 × 1024/);
  assert.match(view, /1080 × 1920/);
  assert.match(view, /cancelMasterStoreAppBuild/);
  assert.match(view, /CANCELAR TRABAJO/);
  assert.match(view, /data-engine-release-ready/);
  assert.match(view, /data-preview-engine-ready/);
  assert.match(view, /Falta fijar la revisión exacta del motor aprobado/);
  assert.match(view, /Esta vista previa pertenece a otra release del motor/);
  assert.match(view, /disabled=\{!brandAssets\.ready \|\| !!queueNoticeJob \|\| !engineReleaseReady \|\| !buildActionsAllowed\}/);
  assert.match(view, /Estados y acciones administrativas/);
  assert.match(view, /data-app-admin-action="withdraw"/);
  assert.match(view, /data-app-admin-action="reactivate"/);
  assert.match(view, /data-app-admin-action="delete_artifacts"/);
  assert.match(view, /data-app-admin-action="delete_app"/);
  assert.match(view, /data-app-admin-action="recover_app"/);
  assert.match(view, /ELIMINAR ARTEFACTOS/);
  assert.match(view, /ELIMINAR APP \$\{profile\.package_name\}/);
  assert.match(view, /30 días para recuperarla/);
  assert.match(view, /No cambia con ninguna acción Android/);
  assert.match(brandApi, /requireMasterAdmin/);
  assert.match(brandApi, /storefrontAppBrandSameOriginMutation/);
  assert.match(brandApi, /normalizeStorefrontAppBrandAsset/);
  assert.match(brandApi, /serverPocketBaseUrl/);
  assert.doesNotMatch(brandApi, /service.account|private.key|keystore/i);
});

test('bloque lateral Master abre una configuración global y exclusiva', () => {
  const sidebar = readFileSync(new URL('../src/components/master/MasterSidebar.astro', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/master/settings.astro', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/components/master/MasterSettingsView.astro', import.meta.url), 'utf8');
  assert.match(sidebar, /Notificaciones[\s\S]*href="\/master\/settings"[\s\S]*>Master</);
  assert.equal((sidebar.match(/href="\/master\/settings"/g) || []).length, 1);
  assert.doesNotMatch(sidebar, /master-sidebar__profile[\s\S]{0,160}href=/);
  assert.match(sidebar, /isActive\('\/master\/settings'\)/);
  assert.match(page, /requireMasterAdmin/);
  assert.match(page, /private, no-store/);
  assert.match(page, /manual_whatsapp_sender/);
  assert.match(view, /Configuración del Master/);
  assert.match(view, /Un solo número para todas las tiendas/);
  assert.match(view, /data-master-whatsapp-settings-form/);
  assert.match(view, /saveMasterWhatsappSettings/);
  assert.equal(view.includes("pattern={'[+0-9 .\\\\(\\\\)\\\\-]{8,24}'}"), true);
  const phonePattern = new RegExp('^(?:[+0-9 .\\(\\)\\-]{8,24})$', 'v');
  assert.equal(phonePattern.test('+1 (305) 555-0187'), true);
  assert.equal(phonePattern.test('+53 ABC'), false);
  assert.doesNotMatch(view, /store_id|administrador destinatario.*input/i);
});

test('flujo WhatsApp prepara enlace manual y exige constancia separada', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const ids = {
    store: 'storec10test001', profile: 'profilec10test1', job: 'jobc10deliver01', artifact: 'artc10deliver01',
    master: 'masterc10test01', primary: 'primaryc10test1',
  };
  const deliveryPreview = {
    schema_version: 1,
    mode: 'manual_wa_me',
    automatic_send: false,
    cloud_api: false,
    store_id: ids.store,
    profile_id: ids.profile,
    job_id: ids.job,
    artifact_id: ids.artifact,
    sender_user_id: ids.master,
    sender_whatsapp: '5351112233',
    recipient_user_id: ids.primary,
    recipient_whatsapp: '5354445566',
    app_name: 'Tenant C10',
    version_code: 2,
    version_name: '1.0.1',
    attachment_file_name: 'tenant-c10-1.0.1-2-direct.apk',
    attachment_sha256: 'a'.repeat(64),
    attachment_required: true,
    message: 'Actualización lista\nSHA-256: ' + 'a'.repeat(64),
    message_sha256: 'b'.repeat(64),
    whatsapp_url: 'https://wa.me/5354445566?text=Actualizaci%C3%B3n',
    sender_warning: 'Confirma el número 5351112233.',
  };
  const job = (deliveryStatus) => ({
    id: ids.job,
    profile_id: ids.profile,
    operation: 'update',
    status: 'succeeded',
    preview_hash: 'c'.repeat(64),
    preview: null,
    preview_expires_at: '',
    confirmed_at: '2026-08-17T12:00:00.000Z',
    runner_id: 'runner-c10',
    failure_code: '',
    started_at: '2026-08-17T12:01:00.000Z',
    completed_at: '2026-08-17T12:02:00.000Z',
    delivery_status: deliveryStatus,
    delivery_sender_id: deliveryStatus === 'marked_sent' ? ids.master : '',
    delivery_recipient_id: deliveryStatus === 'marked_sent' ? ids.primary : '',
    delivery_sender_whatsapp: deliveryStatus === 'marked_sent' ? '5351112233' : '',
    delivery_recipient_whatsapp: deliveryStatus === 'marked_sent' ? '5354445566' : '',
    delivery_message_sha256: deliveryStatus === 'marked_sent' ? 'b'.repeat(64) : '',
    delivery_marked_at: deliveryStatus === 'marked_sent' ? '2026-08-17T12:05:00.000Z' : '',
    created: '2026-08-17T12:00:00.000Z',
    updated: '2026-08-17T12:05:00.000Z',
  });
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    if (String(url).endsWith('/whatsapp/settings')) return new Response(JSON.stringify({
      ok: true,
      sender: { user_id: ids.master, display_name: 'Master', whatsapp_number: '5351112233', configured: true, phone_state: 'configured' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/whatsapp/preview')) return new Response(JSON.stringify({
      ok: true, preview: deliveryPreview, job: job('pending'),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({
      ok: true, preview: deliveryPreview, job: job('marked_sent'), idempotent: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const settings = await saveMasterWhatsappSettings('https://pb.example.test', 'token-c10', '+53 5 111 2233');
    assert.equal(settings.data?.whatsapp_number, '5351112233');
    const prepared = await previewMasterStoreAppWhatsappDelivery('https://pb.example.test', 'token-c10', {
      store_id: ids.store, artifact_id: ids.artifact,
    });
    assert.equal(prepared.data?.preview.automatic_send, false);
    assert.equal(prepared.data?.preview.attachment_required, true);
    assert.equal(prepared.data?.job.delivery_status, 'pending');
    const marked = await markMasterStoreAppWhatsappSent('https://pb.example.test', 'token-c10', {
      store_id: ids.store,
      artifact_id: ids.artifact,
      message_sha256: 'b'.repeat(64),
      confirmation: 'MARCAR ENVIADO',
    });
    assert.equal(marked.data?.job.delivery_status, 'marked_sent');
    assert.equal(calls[2].body.confirmation, 'MARCAR ENVIADO');
    assert.equal(calls.every((call) => !/cloud-api|graph\.facebook/i.test(call.url)), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('UX separa primer aprovisionamiento de actualización y exige confirmación', () => {
  const view = readFileSync(new URL('../src/components/master/MasterStoreAppBuildView.astro', import.meta.url), 'utf8');
  assert.match(view, /Aprovisionar por primera vez/);
  assert.match(view, /Generar actualización/);
  assert.match(view, /data-app-confirm-check/);
  assert.match(view, /Vista previa pendiente de confirmación/);
  assert.match(view, /storeSlug === 'powerzona' \? 'play_and_direct' : 'direct'/);
  assert.match(view, /proposeFirebaseProjectId\(store\.name, store\.id\)/);
  assert.match(view, /value=\{proposedFirebaseProjectId\}/);
  assert.match(view, /Generado desde el nombre de la tienda y un sufijo estable/);
});

test('resumen Master muestra inventario visual de motores pendientes', () => {
  const dashboard = readFileSync(new URL('../src/pages/master/index.astro', import.meta.url), 'utf8');
  assert.match(dashboard, /getMasterStoreAppEngineUpdates/);
  assert.match(dashboard, /apps necesitan.*actualizar el motor nativo/);
  assert.match(dashboard, /cada tienda requiere vista previa y confirmación Master/);
  assert.match(dashboard, /para enviar por WhatsApp/);
});

test('errores de integridad tienen mensajes cerrados y accionables', () => {
  assert.match(getMasterAppBuildErrorMessage('preview_mismatch'), /no coincide/i);
  assert.match(getMasterAppBuildErrorMessage('version_code_must_increase'), /mayor/i);
  assert.match(getMasterAppBuildErrorMessage('app_identity_already_used'), /otra app/i);
  assert.match(getMasterAppBuildErrorMessage('premium_required'), /Premium/i);
  assert.match(getMasterAppBuildErrorMessage('brand_assets_required'), /icono y el splash/i);
  assert.match(getMasterAppBuildErrorMessage('brand_assets_changed'), /nueva vista previa/i);
  assert.match(getMasterAppBuildErrorMessage('engine_release_unconfigured'), /revisión Git exactas/i);
  assert.match(getMasterAppBuildErrorMessage('engine_release_changed'), /release aprobada.*cambió/i);
  assert.match(getMasterAppBuildErrorMessage('job_not_cancelable'), /runner/i);
  assert.match(getMasterAppBuildErrorMessage('app_distribution_withdrawn'), /Reactívala/i);
  assert.match(getMasterAppBuildErrorMessage('delete_confirmation_mismatch'), /exactamente/i);
  assert.match(getMasterAppBuildErrorMessage('recovery_window_expired'), /30 días/i);
});

test('acción administrativa C10.6 conserva separado el estado de la tienda web', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      ok: true,
      profile: {
        distribution_status: 'withdrawn',
        distribution_reason: 'manual',
        distribution_changed_at: '2026-08-18T12:00:00.000Z',
        lifecycle_status: 'active',
        deletion_requested_at: '',
        deletion_recover_until: '',
        deleted_at: '',
        downloads_allowed: false,
        can_recover: false,
      },
      action: null,
      store_status: 'active',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await runMasterStoreAppAdminAction('https://pb.example.test', 'token-c106', {
      store_id: 'storec106test01',
      action: 'withdraw',
      confirmation: '',
      reason: 'Pausa administrativa',
    });
    assert.equal(result.available, true);
    assert.equal(result.data?.profile.distribution_status, 'withdrawn');
    assert.equal(result.data?.profile.downloads_allowed, false);
    assert.equal(result.data?.store_status, 'active');
    assert.match(calls[0].url, /\/api\/pz\/master\/storefront-app-builds\/admin-action$/);
    assert.deepEqual(calls[0].body, {
      store_id: 'storec106test01', action: 'withdraw', confirmation: '', reason: 'Pausa administrativa',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runner y documentación prohíben efectos desde Preview y secretos en Git', () => {
  const runner = readFileSync(new URL('../../mobile-storefront/runner/store-app-runner.ps1', import.meta.url), 'utf8');
  const validator = readFileSync(new URL('../../mobile-storefront/scripts/validate-store-config.ps1', import.meta.url), 'utf8');
  assert.match(runner, /Preview no admite efectos externos ni compilacion/);
  assert.match(runner, /AllowFirebaseProvisioning/);
  assert.match(runner, /AllowSigningGeneration/);
  assert.match(runner, /La vista previa confirmada no coincide exactamente/);
  assert.match(validator, /google-services\.json/);
  assert.match(validator, /jks\|keystore\|p12/);
  assert.match(validator, /service-account/);
  assert.match(runner, /Release requiere un workspace Git limpio y versionado/);
  assert.match(runner, /engine_version/);
});

test('inventario Master normaliza alertas de motor sin ejecutar builds', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    generated_at: '2026-08-17T12:00:00.000Z',
    engine_release: { version: '1.1.0', revision: 'b'.repeat(40), severity: 'recommended' },
    total_apps: 2,
    update_count: 1,
    critical_count: 0,
    manual_whatsapp_sender: {
      user_id: 'masterc10test01', display_name: 'Master', whatsapp_number: '5351112233', configured: true, phone_state: 'configured',
    },
    delivery_pending_count: 1,
    deliveries: [{
      store: { id: 'storec10test001', name: 'Tenant C10', slug: 'tenant-c10' },
      profile_id: 'profilec10test1',
      job_id: 'jobc10deliver01',
      artifact_id: 'artc10deliver01',
      display_name: 'Tenant C10',
      version_code: 3,
      version_name: '1.0.2',
      file_name: 'tenant-c10-1.0.2-3-direct.apk',
      recipient: {
        status: 'ready', user_id: 'primaryc10test1', display_name: 'Admin principal',
        whatsapp_number: '5354445566', configured: true, phone_state: 'configured',
      },
      action_url: '/master/stores/storec10test001/app#entrega-whatsapp',
    }],
    apps: [{
      store: { id: 'storec10test001', name: 'Tenant C10', slug: 'tenant-c10' },
      profile_id: 'profilec10test1',
      app_key: 'tenant-c10-storefront',
      display_name: 'Tenant C10',
      app_version_code: 3,
      app_version_name: '1.0.2',
      engine_update: {
        status: 'update_available', available: true, severity: 'recommended', reason: 'version_changed',
        current_version: '1.0.0', current_revision: 'a'.repeat(40),
        target_version: '1.1.0', target_revision: 'b'.repeat(40),
      },
      action_url: '/master/stores/storec10test001/app',
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await getMasterStoreAppEngineUpdates('https://pb.example.test', 'token-c10');
    assert.equal(result.available, true);
    assert.equal(result.data?.update_count, 1);
    assert.equal(result.data?.apps[0].engine_update.target_version, '1.1.0');
    assert.equal(result.data?.delivery_pending_count, 1);
    assert.equal(result.data?.deliveries[0].recipient.status, 'ready');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
