import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  formatStorefrontAppDateTime,
  formatStorefrontAppDeliveryDateTime,
  normalizeStorefrontAppHealth,
  STOREFRONT_APP_HEALTH_TIME_ZONE,
} from '../src/lib/masterStoreAppBuilds.ts';

const NOW = '2026-09-02T18:00:00.000Z';

function event(overrides = {}) {
  return {
    result: 'success',
    error_code: '',
    http_status: 200,
    latency_ms: 325,
    occurred_at: '2026-09-02T17:58:00.000Z',
    ...overrides,
  };
}

function healthPayload() {
  return {
    available: true,
    generated_at: NOW,
    display_time_zone: 'America/Havana',
    overall_status: 'warning',
    fresh_window_hours: 24,
    retention_days: 30,
    summary: {
      total: 1,
      active: 1,
      recent: 1,
      healthy: 1,
      warning: 0,
      critical: 0,
      unknown: 0,
      monitored: 1,
      firebase_registered: 0,
      fcm_registered: 0,
      notification_granted: 1,
      notification_denied: 0,
      push_fcm: 1,
      push_native: 0,
      push_unknown: 0,
    },
    services: [{
      key: 'realtime',
      label: 'WebSocket',
      status: 'healthy',
      importance: 'accelerator',
      detail: 'Gateway disponible; 2 conexiones activas al comprobar.',
      checked_at: NOW,
      metrics: { configured: true, connections: 2, latency_ms: 15 },
    }],
    installations: [{
      support_ref: 'APP-1A2B-3C4D-5E6F',
      health_status: 'healthy',
      installation_status: 'active',
      monitoring_active: true,
      app_version: '0.2.14',
      app_version_code: 24,
      android_version: '15',
      device_model: 'Pixel soporte',
      locale: 'es-CU',
      timezone: 'America/Havana',
      country_code: 'cu',
      region_code: 'La Habana',
      notification_permission: 'granted',
      identity_source: 'app_uuid',
      trust_level: 'basic',
      firebase_status: 'unavailable',
      firebase_synced_at: '',
      fcm_registration_present: false,
      first_seen_at: '2026-09-01T12:00:00.000Z',
      last_seen_at: '2026-09-02T17:58:00.000Z',
      last_heartbeat_at: '2026-09-02T17:58:00.000Z',
      last_contact_at: '2026-09-02T17:58:00.000Z',
      backend_status: 'healthy',
      registration_status: 'healthy',
      native_sync_status: 'healthy',
      last_push_at: '2026-09-02T17:54:00.107Z',
      last_delivery: {
        state: 'displayed',
        delivery_trigger: 'fcm',
        accepted_at: '2026-09-02T17:53:59.000Z',
        fcm_received_at: '2026-09-02T17:54:00.100Z',
        displayed_at: '2026-09-02T17:54:00.107Z',
        read_at: '',
      },
      last_error: null,
      latest_events: {
        internet: event(),
        backend: event(),
        registration: event(),
        firebase: event({ result: 'failure', error_code: 'firebase_unavailable', http_status: 0 }),
        fcm: null,
        permission: event(),
        push: null,
        error: null,
      },
    }],
    privacy_note: 'UUID, FID, tokens, credenciales e IP permanecen ocultos.',
  };
}

test('normaliza estados técnicos sin exigir Firebase para una instalación saludable', () => {
  const result = normalizeStorefrontAppHealth(healthPayload());
  assert.ok(result);
  assert.equal(result.overall_status, 'warning');
  assert.equal(result.services[0].importance, 'accelerator');
  assert.equal(result.services[0].metrics.connections, 2);
  assert.equal(result.installations[0].health_status, 'healthy');
  assert.equal(result.installations[0].firebase_status, 'unavailable');
  assert.equal(result.installations[0].fcm_registration_present, false);
  assert.equal(result.installations[0].country_code, 'CU');
  assert.equal(result.installations[0].last_delivery.delivery_trigger, 'fcm');
  assert.equal(result.summary.push_fcm, 1);
  assert.equal(result.display_time_zone, STOREFRONT_APP_HEALTH_TIME_ZONE);
});

test('convierte fechas UTC a la hora civil de Cuba durante todo el año', () => {
  const summer = formatStorefrontAppDateTime('2026-09-03T13:05:31.000Z');
  const winter = formatStorefrontAppDateTime('2026-01-03T14:05:31.000Z');
  assert.match(summer, /(?:0?9):05/);
  assert.match(winter, /(?:0?9):05/);
  assert.match(summer, /hora de Cuba/);
  assert.doesNotMatch(summer, /13:05/);
  assert.doesNotMatch(winter, /14:05/);
  assert.match(
    formatStorefrontAppDeliveryDateTime('2026-09-03T13:05:31.603Z'),
    /(?:0?9):05:31[.,]603/,
  );
});

test('rechaza referencias, métricas y códigos de error fuera del contrato', () => {
  const invalidReference = healthPayload();
  invalidReference.installations[0].support_ref = 'raw-device-id';
  assert.equal(normalizeStorefrontAppHealth(invalidReference), null);

  const invalidMetric = healthPayload();
  invalidMetric.services[0].metrics.secret_value = 'not-allowed';
  assert.equal(normalizeStorefrontAppHealth(invalidMetric), null);

  const invalidError = healthPayload();
  invalidError.installations[0].latest_events.backend.error_code = '<script>alert(1)</script>';
  assert.equal(normalizeStorefrontAppHealth(invalidError), null);

  const invalidTrigger = healthPayload();
  invalidTrigger.installations[0].last_delivery.delivery_trigger = 'invented_transport';
  assert.equal(normalizeStorefrontAppHealth(invalidTrigger), null);
});

test('Master incorpora una cuarta vista privada con actualización controlada', () => {
  const page = readFileSync(new URL('../src/pages/master/stores/[storeId]/app.astro', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/components/master/MasterStoreAppBuildView.astro', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../src/lib/masterStoreAppBuilds.ts', import.meta.url), 'utf8');

  assert.match(page, /requireMasterAdmin/);
  assert.match(page, /private, no-store/);
  assert.match(page, /requestedChannel === 'health'/);
  assert.match(page, /includeHealth: channel === 'health'/);
  assert.match(client, /include_health: true/);
  assert.match(view, />4\. Estado y diagnóstico</);
  assert.match(view, /data-health-only/);
  assert.match(view, /Servicios de la aplicación/);
  assert.match(view, /Instalaciones observadas/);
  assert.match(view, /America\/Havana|display_time_zone/);
  assert.match(view, /Firebase \/ FCM/);
  assert.match(view, /Sistema resiliente/);
  assert.match(view, /no contienen el UUID real/);
  assert.match(view, /root\.dataset\.healthWatch === 'true'/);
  assert.match(view, /window\.setTimeout\(refreshHealth, 60_000\)/);
  assert.match(view, /document\.visibilityState === 'visible'/);
});
