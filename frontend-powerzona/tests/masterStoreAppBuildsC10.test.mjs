import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getMasterAppBuildErrorMessage,
  getMasterStoreAppEngineUpdates,
  markMasterStoreAppWhatsappSent,
  previewMasterStoreAppWhatsappDelivery,
  saveMasterWhatsappSettings,
} from '../src/lib/masterStoreAppBuilds.ts';

test('panel C10 es exclusivo Master y no contiene compilador, shell ni secretos', () => {
  const page = readFileSync(new URL('../src/pages/master/stores/[storeId]/app.astro', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/components/master/MasterStoreAppBuildView.astro', import.meta.url), 'utf8');
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
  assert.match(view, /previewCard\.hidden = true/);
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
