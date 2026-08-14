import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildStorefrontPushCampaignPayload,
  buildStorefrontPushSchedulePayload,
  campaignStatusLabel,
  filterStorefrontPushCampaigns,
  mutateStorefrontPushCampaign,
  normalizeStorefrontPushCampaign,
  previewStorefrontPushAudience,
  saveStorefrontPushCampaign,
  scheduleStorefrontPushCampaign,
  storefrontPushAdminErrorMessage,
  storefrontPushAdminRequest,
  storefrontPushCampaignActions,
} from '../src/lib/storefrontPushAdmin.ts';

const client = {
  baseUrl: 'https://pb.staging.example',
  token: 'signed-session-token',
  supportStoreId: 'store0000000001',
  adminDeviceToken: 'A'.repeat(43),
};

const baseForm = {
  campaign_id: '',
  title: 'Oferta Premium',
  body: 'Disponible por tiempo limitado.',
  media_id: '',
  timezone: 'America/Havana',
  audience_type: 'all_active',
  target_type: 'home',
  target_ref: '',
  target_section: '',
};

const campaignFixture = (overrides = {}) => ({
  id: 'camp00000000001',
  status: 'draft',
  title: 'Oferta Premium',
  body: 'Disponible por tiempo limitado.',
  media_id: '',
  audience_type: 'all_active',
  audience_config: {},
  target_type: 'home',
  target_section: '',
  target_ref: '',
  target_path: '/t/powerzona',
  timezone: 'America/Havana',
  scheduled_at: '',
  selected_count: 0,
  accepted_count: 0,
  failed_count: 0,
  invalid_count: 0,
  started_at: '',
  completed_at: '',
  canceled_at: '',
  failure_code: '',
  created: '2026-08-14 16:00:00.000Z',
  updated: '2026-08-14 16:00:00.000Z',
  ...overrides,
});

test('construye el contrato exacto de borrador y nunca acepta una URL libre', () => {
  assert.deepEqual(buildStorefrontPushCampaignPayload(baseForm), {
    campaign_id: '',
    title: 'Oferta Premium',
    body: 'Disponible por tiempo limitado.',
    media_id: '',
    timezone: 'America/Havana',
    audience_type: 'all_active',
    audience_config: {},
    target_type: 'home',
    target_ref: '',
    target_section: '',
  });

  assert.throws(
    () => buildStorefrontPushCampaignPayload({ ...baseForm, target_type: 'url', target_ref: 'https://evil.test' }),
    (error) => error.code === 'invalid_target',
  );
});

test('normaliza secciones, relaciones, pedidos y segmentos sin campos libres', () => {
  assert.deepEqual(buildStorefrontPushCampaignPayload({
    ...baseForm,
    target_type: 'section',
    target_section: 'gifts',
    audience_type: 'active_7d',
  }).audience_config, {});

  const product = buildStorefrontPushCampaignPayload({
    ...baseForm,
    target_type: 'product',
    target_ref: 'prod00000000001',
    audience_type: 'app_version',
    app_version_code: '6',
  });
  assert.equal(product.target_ref, 'prod00000000001');
  assert.deepEqual(product.audience_config, { app_version_code: 6 });

  const order = buildStorefrontPushCampaignPayload({
    ...baseForm,
    target_type: 'order',
    target_ref: 'order0000000001',
    installation_id: 'inst00000000001',
  });
  assert.deepEqual(order.audience_config, { installation_id: 'inst00000000001' });

  const region = buildStorefrontPushCampaignPayload({
    ...baseForm,
    audience_type: 'country_region',
    country_code: 'cu',
    region_code: 'La Habana',
  });
  assert.deepEqual(region.audience_config, { country_code: 'CU', region_code: 'La Habana' });
});

test('rechaza contenido, IDs, audiencia y programación inválidos antes de la red', () => {
  assert.throws(() => buildStorefrontPushCampaignPayload({ ...baseForm, title: '' }), (error) => error.code === 'invalid_title');
  assert.throws(() => buildStorefrontPushCampaignPayload({ ...baseForm, body: '' }), (error) => error.code === 'invalid_body');
  assert.throws(
    () => buildStorefrontPushCampaignPayload({ ...baseForm, target_type: 'coupon', target_ref: 'otro-tenant' }),
    (error) => error.code === 'invalid_record_id',
  );
  assert.throws(
    () => buildStorefrontPushCampaignPayload({ ...baseForm, target_type: 'order', target_ref: 'order0000000001', audience_type: 'active_7d' }),
    (error) => error.code === 'order_audience_required',
  );
  assert.throws(
    () => buildStorefrontPushSchedulePayload('camp00000000001', 'scheduled', '2026-08-14T15:00:00Z', new Date('2026-08-14T16:00:00Z')),
    (error) => error.code === 'invalid_schedule',
  );
});

test('flujo simulado end-to-end guarda, estima y programa usando solo C05', async () => {
  const calls = [];
  const responses = [
    { ok: true, campaign: campaignFixture() },
    { ok: true, audience: { count: 37, snapshot: false } },
    { ok: true, campaign: campaignFixture({ status: 'scheduled', scheduled_at: '2026-08-15T18:00:00.000Z' }) },
  ];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const saved = await saveStorefrontPushCampaign(client, baseForm, fakeFetch);
  const audience = await previewStorefrontPushAudience(client, saved.id, fakeFetch);
  const scheduled = await scheduleStorefrontPushCampaign(
    client,
    saved.id,
    'scheduled',
    new Date(Date.now() + 3_600_000).toISOString(),
    fakeFetch,
  );

  assert.equal(saved.status, 'draft');
  assert.deepEqual(audience, { count: 37, snapshot: false });
  assert.equal(scheduled.status, 'scheduled');
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    '/api/pz/storefront/v1/campaigns/save',
    '/api/pz/storefront/v1/campaigns/audience-preview',
    '/api/pz/storefront/v1/campaigns/schedule',
  ]);
  assert.equal(calls.every((call) => call.init.headers.Authorization === 'Bearer signed-session-token'), true);
  assert.equal(calls.every((call) => call.init.headers['X-PZ-Support-Store'] === 'store0000000001'), true);
  assert.equal(calls[0].body.store_id, undefined);
  assert.equal(calls[0].body.target_path, undefined);
});

test('listado, cancelación y duplicado usan rutas acotadas y respuestas normalizadas', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const action = new URL(url).pathname.endsWith('/duplicate') ? 'duplicate' : 'cancel';
    return new Response(JSON.stringify({
      ok: true,
      campaign: campaignFixture(action === 'duplicate'
        ? { id: 'camp00000000002', status: 'draft' }
        : { status: 'canceled' }),
    }), { status: action === 'duplicate' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  };

  const canceled = await mutateStorefrontPushCampaign(client, 'cancel', 'camp00000000001', fakeFetch);
  const duplicated = await mutateStorefrontPushCampaign(client, 'duplicate', 'camp00000000001', fakeFetch);
  assert.equal(canceled.status, 'canceled');
  assert.equal(duplicated.id, 'camp00000000002');
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    '/api/pz/storefront/v1/campaigns/cancel',
    '/api/pz/storefront/v1/campaigns/duplicate',
  ]);

  await assert.rejects(
    () => storefrontPushAdminRequest(client, '/api/internal/push/v2/send', { fetchImpl: fakeFetch }),
    (error) => error.code === 'invalid_request_path',
  );
  await assert.rejects(
    () => storefrontPushAdminRequest({ ...client, baseUrl: 'http://pb.example' }, '/api/pz/storefront/v1/campaigns', { fetchImpl: fakeFetch }),
    (error) => error.code === 'campaign_backend_unavailable',
  );
});

test('presenta estados, acciones, filtros y errores honestos', () => {
  const draft = normalizeStorefrontPushCampaign(campaignFixture());
  const sent = normalizeStorefrontPushCampaign(campaignFixture({ id: 'camp00000000003', status: 'sent', title: 'Aminos' }));
  assert.equal(campaignStatusLabel('partially_sent'), 'Envío parcial');
  assert.equal(storefrontPushCampaignActions('draft').edit, true);
  assert.equal(storefrontPushCampaignActions('scheduled').cancel, true);
  assert.equal(storefrontPushCampaignActions('processing').cancel, false);
  assert.deepEqual(filterStorefrontPushCampaigns([draft, sent], 'aminos').map((item) => item.id), ['camp00000000003']);
  assert.match(storefrontPushAdminErrorMessage('daily_quota_exceeded'), /10 campañas diarias/);
  assert.match(storefrontPushAdminErrorMessage('monthly_quota_exceeded'), /310 campañas mensuales/);
  assert.match(storefrontPushAdminErrorMessage('media_expires_before_send'), /vencerá antes del envío/);
});

test('el componente contiene todos los flujos C08, confirmaciones y accesibilidad responsive', () => {
  const source = readFileSync(new URL('../src/components/admin/PushCampaignsView.astro', import.meta.url), 'utf8');
  for (const marker of [
    'data-campaign-list', 'data-status-filter', 'data-new-campaign', 'data-save-draft',
    'data-media-upload', 'image/jpeg,image/png,image/webp', 'data-preview-image',
    'data-preview-title', 'data-target-validation', 'data-estimate-audience',
    'data-send-now', 'data-schedule-campaign', 'data-confirm-dialog',
    "data-action=\"duplicate\"", "data-action=\"cancel\"",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /aria-labelledby="push-editor-title"/);
  assert.match(source, /@media \(max-width: 720px\)/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /data-only v2/);
});
