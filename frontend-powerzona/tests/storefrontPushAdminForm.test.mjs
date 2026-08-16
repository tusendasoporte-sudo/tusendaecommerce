import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildStorefrontPushAudiencePreviewPayload,
  buildStorefrontPushCampaignPayload,
  buildStorefrontPushSchedulePayload,
  campaignStatusLabel,
  deleteStorefrontPushCampaigns,
  filterStorefrontPushCampaigns,
  mutateStorefrontPushCampaign,
  normalizeStorefrontPushCampaign,
  normalizeStorefrontPushTargetOptions,
  previewStorefrontPushAudience,
  readStorefrontPushCampaignDetail,
  readStorefrontPushTargetOptions,
  resolveStorefrontPushQuotaTimezone,
  saveStorefrontPushCampaign,
  scheduleStorefrontPushCampaign,
  STOREFRONT_PUSH_DELETE_LIMIT,
  STOREFRONT_PUSH_PAGE_SIZE,
  STOREFRONT_PUSH_TIME_ZONE,
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

const pushCampaignViewSource = readFileSync(
  new URL('../src/components/admin/PushCampaignsView.astro', import.meta.url),
  'utf8',
);

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

  assert.deepEqual(buildStorefrontPushCampaignPayload({
    ...baseForm,
    target_ref: 'stale0000000001',
    target_section: 'search',
  }), buildStorefrontPushCampaignPayload(baseForm));
});

test('normaliza y carga únicamente opciones seguras para los selectores de destino', async () => {
  const payload = {
    categories: [{ id: 'category0000001', label: 'Proteínas' }, { id: 'bad', label: 'Inválida' }],
    products: [{ id: 'product00000001', label: 'Creatina', detail: 'SKU-01' }],
    raffles: [{ id: 'raffle000000001', label: 'Rifa agosto', detail: '2026-08-20T12:00:00Z' }],
    coupons: [{ id: 'coupon000000001', code: 'verano20' }, { id: 'bad', code: 'NO' }],
  };
  const normalized = normalizeStorefrontPushTargetOptions(payload);
  assert.deepEqual(normalized.categories, [{ id: 'category0000001', label: 'Proteínas', detail: '' }]);
  assert.deepEqual(normalized.products, [{ id: 'product00000001', label: 'Creatina', detail: 'SKU-01' }]);
  assert.deepEqual(normalized.raffles, [{ id: 'raffle000000001', label: 'Rifa agosto', detail: '2026-08-20T12:00:00Z' }]);
  assert.deepEqual(normalized.coupons, [{ id: 'coupon000000001', code: 'VERANO20' }]);

  const calls = [];
  const result = await readStorefrontPushTargetOptions(client, async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, targets: payload }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.equal(result.products[0].label, 'Creatina');
  assert.equal(new URL(calls[0].url).pathname, '/api/pz/storefront/v1/campaigns/targets');
  assert.equal(calls[0].init.method, 'GET');
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

test('estima una audiencia nueva sin guardar contenido ni crear un borrador', async () => {
  assert.equal(STOREFRONT_PUSH_TIME_ZONE, 'America/Havana');
  assert.deepEqual(buildStorefrontPushAudiencePreviewPayload(baseForm), {
    audience_type: 'all_active',
    audience_config: {},
    target_type: 'home',
  });
  const calls = [];
  const audience = await previewStorefrontPushAudience(client, baseForm, async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, audience: { count: 23, snapshot: false } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.deepEqual(audience, { count: 23, snapshot: false });
  assert.equal(new URL(calls[0].url).pathname, '/api/pz/storefront/v1/campaigns/audience-preview');
  assert.deepEqual(calls[0].body, {
    audience_type: 'all_active',
    audience_config: {},
    target_type: 'home',
  });
  assert.equal(calls[0].body.campaign_id, undefined);
  assert.equal(calls[0].body.title, undefined);
  assert.equal(calls[0].body.body, undefined);
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

test('listado, cancelación, duplicado y borrado usan rutas acotadas y respuestas normalizadas', async () => {
  assert.equal(STOREFRONT_PUSH_PAGE_SIZE, 10);
  assert.equal(STOREFRONT_PUSH_DELETE_LIMIT, 50);
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

  const deleted = await deleteStorefrontPushCampaigns(client, ['camp00000000001', 'camp00000000002'], async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      ok: true,
      deleted_ids: ['camp00000000001', 'camp00000000002'],
      deleted_count: 2,
      redacted_count: 2,
      deliveries_deleted: 4,
      events_deleted: 3,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  assert.deepEqual(deleted, {
    deleted_ids: ['camp00000000001', 'camp00000000002'],
    deleted_count: 2,
    redacted_count: 2,
    deliveries_deleted: 4,
    events_deleted: 3,
  });
  assert.equal(new URL(calls.at(-1).url).pathname, '/api/pz/storefront/v1/campaigns/delete');
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), {
    campaign_ids: ['camp00000000001', 'camp00000000002'],
  });
  await assert.rejects(
    () => deleteStorefrontPushCampaigns(client, []),
    (error) => error.code === 'invalid_payload',
  );
  await assert.rejects(
    () => deleteStorefrontPushCampaigns(
      client,
      Array.from({ length: 51 }, (_, index) => `bulk${String(index).padStart(11, '0')}`),
    ),
    (error) => error.code === 'invalid_payload',
  );

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
  assert.equal(storefrontPushCampaignActions('sent').delete, true);
  assert.equal(storefrontPushCampaignActions('processing').delete, false);
  assert.deepEqual(filterStorefrontPushCampaigns([draft, sent], 'aminos').map((item) => item.id), ['camp00000000003']);
  assert.match(storefrontPushAdminErrorMessage('daily_quota_exceeded'), /10 campañas diarias/);
  assert.match(storefrontPushAdminErrorMessage('monthly_quota_exceeded'), /310 campañas mensuales/);
  assert.match(storefrontPushAdminErrorMessage('media_expires_before_send'), /vencerá antes del envío/);
  assert.match(storefrontPushAdminErrorMessage('media_name_invalid'), /nombre del archivo no es válido/);
  assert.match(storefrontPushAdminErrorMessage('media_type_mismatch'), /extensión y el contenido/);
  assert.match(storefrontPushAdminErrorMessage('media_dimensions_too_large'), /6000 px/);
  assert.match(storefrontPushAdminErrorMessage('media_corrupt'), /decodificar/);
  assert.match(storefrontPushAdminErrorMessage('media_busy'), /procesador de imágenes está ocupado/);
});

test('detalle C09 normaliza embudo, incertidumbre y denominadores sin inventar tasas', async () => {
  const detail = await readStorefrontPushCampaignDetail(client, 'camp00000000001', async () => new Response(JSON.stringify({
    ok: true,
    campaign: campaignFixture({ status: 'sent' }),
    deliveries: { accepted: 4 },
    metrics: {
      selected: 6, accepted: 4, failed_confirmed: 1, failed_permanent: 1, invalid_fid: 0,
      unknown: 1, canceled: 0, retrying: 0, pending: 0, claimed: 0,
      opened: 3, destination_viewed: 2, coupon_applied: 1, coupon_applicable: true,
      orders_attributed: 1, buyer_installations: 1, orders_vigentes: 1, orders_canceled: 0,
      denominators: { acceptance: 6, failures: 6, opened: 4, destination_viewed: 3, coupon_applied: 2, conversion: 2 },
      measurement_note: 'Firebase aceptado no equivale a entregado.',
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  assert.equal(detail.metrics.failed_confirmed, 1);
  assert.equal(detail.metrics.unknown, 1);
  assert.deepEqual(detail.metrics.denominators, {
    acceptance: 6, failures: 6, opened: 4, destination_viewed: 3, coupon_applied: 2, conversion: 2,
  });
  await assert.rejects(
    readStorefrontPushCampaignDetail(client, 'camp00000000001', async () => new Response(JSON.stringify({
      ok: true,
      campaign: campaignFixture({ status: 'sent' }),
      metrics: { selected: 6, accepted: 4, denominators: { acceptance: 6 } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    (error) => error.code === 'campaign_invalid_response',
  );
});

test('fija siempre la zona horaria de campañas y cuotas en America/Havana', () => {
  const draft = normalizeStorefrontPushCampaign(campaignFixture({ timezone: 'America/Havana' }));
  const started = normalizeStorefrontPushCampaign(campaignFixture({
    id: 'camp00000000004',
    status: 'sent',
    timezone: 'UTC',
    started_at: '2026-08-14T16:00:00.000Z',
  }));
  assert.equal(resolveStorefrontPushQuotaTimezone([draft], 'America/Havana'), 'America/Havana');
  assert.equal(resolveStorefrontPushQuotaTimezone([draft, started], 'UTC'), 'America/Havana');
  assert.throws(
    () => buildStorefrontPushCampaignPayload({ ...baseForm, timezone: 'America/New_York' }),
    (error) => error.code === 'timezone_mismatch',
  );
});

test('el componente contiene todos los flujos C08, confirmaciones y accesibilidad responsive', () => {
  const source = pushCampaignViewSource;
  for (const marker of [
    'data-campaign-list', 'data-status-filter', 'data-new-campaign', 'data-save-draft',
    'data-media-upload', 'image/jpeg,image/png,image/webp', 'data-preview-image',
    'data-preview-title', 'data-target-validation', 'data-estimate-audience', 'data-audience-result',
    'data-send-now', 'data-field="schedule_enabled"', 'data-scheduled-at-field', 'data-confirm-dialog',
    'data-target-options-field', 'data-target-search', 'data-target-option-select', 'data-target-coupon-code',
    'data-edit-campaign', 'data-cancel-campaign', 'data-refresh-campaign-metrics',
    'data-select-all', 'data-select-campaign', 'data-delete-selected',
    'data-action="detail"', 'data-action="duplicate"', 'data-action="delete"',
    'pagination-bar push-pagination', 'pagination-summary', 'pagination-actions',
    'data-page-previous', 'data-page-label', 'data-page-next',
    'push-policy__premium-icon', 'push-policy__heading', 'push-policy__badge', 'push-policy__list',
  ]) assert.equal(source.includes(marker), true, marker);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /aria-labelledby="push-editor-title"/);
  assert.match(source, /\.android-notification__image img\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(source, /@media \(max-width: 720px\)/);
  assert.match(source, /prefers-reduced-motion/);
  assert.doesNotMatch(source, /data-only v2|push-preview-heading__badge/);
  assert.match(source, /Contenido visible: \{STOREFRONT_PUSH_RETENTION_DAYS\} días/);
  assert.match(source, /evidencia técnica mínima se conserva hasta 90 días/);
  assert.match(source, /data-quota-daily-remaining/);
  assert.match(source, /data-quota-monthly-remaining/);
  assert.match(source, /renderQuota\(result\.quota\)/);
  assert.match(source, /Aceptado no significa leído/);
  assert.match(source, /--policy-accent: #5b21b6; --policy-border: #ddd6fe; --policy-soft: #f5f3ff/);
  assert.doesNotMatch(source, /push-policy__item/);
  assert.match(source, /STOREFRONT_PUSH_TIME_ZONE/);
  assert.match(source, /data-campaign-metrics/);
  assert.match(source, /id="push-metrics-title" class="admin-compact-summary__title">Resultados</);
  assert.match(source, /data-detail-conversion/);
  assert.match(source, /data-open-push-image/);
  assert.match(source, /data-push-image-preview/);
  assert.match(source, /readStorefrontPushCampaignDetail/);
  assert.match(source, /refreshCampaignMetrics\(\{ silent: true \}\)/);
  assert.match(source, /15_000/);
  assert.doesNotMatch(source, /Una imagen caduca a las 24 horas/);
  assert.doesNotMatch(source, /data-action="\$\{actions\.edit|data-action="cancel"/);
  assert.match(source, /El contenido eliminado no se puede recuperar/);
  assert.match(source, /Las cuotas permanentes 10\/310 no se reinician/);
  assert.match(source, /calculateOpenedAudience\(campaign\)/);
  assert.match(source, /calculateEditableAudience\(\{ silent: true \}\)/);
  assert.match(source, /previewStorefrontPushAudience\(client, formValue\(\)\)/);
  assert.match(source, /one\('\[data-audience-estimate\]'\)\.textContent = 'Calculando…'/);
  assert.match(source, /requestId !== state\.audienceRequestId \|\| state\.editing\?\.id !== campaign\.id/);
  assert.match(source, /campaign\.status === 'draft' && !state\.editorReadonly/);
  assert.match(source, /Actualizando automáticamente la audiencia elegible/);
  assert.match(source, /Se muestran hasta 10 campañas por página/);
  assert.match(source, /state\.hasMore = typeof result\.has_more === 'boolean'/);
  assert.match(source, /nextButton\.disabled = state\.loading \|\| !state\.hasMore/);
  assert.match(source, /\.push-campaign-card \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;[^}]*align-items: center/);
  assert.match(source, /\.push-campaign-card__actions \{[^}]*align-self: center;[^}]*justify-content: flex-end/);
  assert.match(source, /target_section: targetType === 'section'/);
  assert.match(source, /target_ref: \['home', 'section'\]\.includes\(targetType\) \? ''/);
  assert.match(source, /one\('\[data-audience-estimate\]'\)\.textContent = 'No se pudo calcular'/);
  assert.match(source, /action\.dataset\.mode = enabled \? 'scheduled' : 'now'/);
  assert.match(source, /async function uploadMedia\(file\) \{[\s\S]*?if \(!file\) return;[\s\S]*?clearFormMessages\(\);/);
  assert.match(source, /previousButtonStates = buttons\.map\(\(button\) => button\.disabled\)/);
  assert.match(source, /readStorefrontPushTargetOptions\(client\)/);
  assert.match(source, /optionSelect\.disabled = state\.editorReadonly \|\| !isOptionsTarget/);
  assert.match(source, /versionInput\.disabled = state\.editorReadonly \|\| audienceType !== 'app_version'/);
  assert.match(source, /resolveStorefrontPushQuotaTimezone\(state\.campaigns, result\.quota_timezone\)/);
  assert.match(source, /root\.dataset\.storeSlug/);
  assert.match(source, /\/api\/admin\/push-media\?store=\$\{encodeURIComponent\(storeSlug\)\}/);
  assert.equal((source.match(/fetch\(mediaEndpoint/g) || []).length, 2);
});

test('el detalle enviado usa un panel de resultados y no reutiliza campos de creación', () => {
  const source = pushCampaignViewSource;
  const detailStart = source.indexOf('<section class="push-detail-view"');
  const detailEnd = source.indexOf('\n        </section>\n      </div>', detailStart);
  assert.notEqual(detailStart, -1);
  assert.notEqual(detailEnd, -1);
  const detailMarkup = source.slice(detailStart, detailEnd);

  for (const required of [
    'admin-compact-summary push-detail-summary', 'admin-compact-summary__list',
    'data-detail-target', 'data-detail-path', 'data-detail-audience', 'data-detail-selected',
    'data-campaign-metrics', '>Resultados</', 'data-detail-conversion', 'Conversión y atribución',
    'data-open-push-image',
    'data-metric="accepted"', 'data-metric="opened"', 'data-metric="destination_viewed"',
    'data-metric="coupon_applied"', 'data-metric="orders_attributed"',
    'data-metric="buyer_installations"', 'data-metric="orders_canceled"',
  ]) assert.equal(detailMarkup.includes(required), true, required);
  for (const forbidden of [
    'name="title"', 'data-field="body"', 'data-media-upload', 'android-device',
    'data-preview-title', 'data-preview-body', 'data-preview-image',
    'Embudo verificable', 'Estado técnico', 'push-metrics__grid', 'push-detail-results-grid',
    'data-metric="failed_permanent"', 'data-metric="invalid_fid"', 'data-metric="canceled"',
  ]) assert.equal(detailMarkup.includes(forbidden), false, forbidden);

  assert.match(source, /data-detail-image alt="Imagen asociada a la campaña push"/);
  assert.match(source, /const imageUrl = safeHttpsUrl\(media\?\.url\)/);
  assert.match(source, /imageButton\.textContent = imageUrl \? 'Ver imagen del push' : 'Sin imagen disponible'/);
  assert.match(source, /one\('\[data-detail-conversion\]'\)\?\.removeAttribute\('open'\)/);
  assert.match(source, /\.push-detail-view \.admin-compact-summary \{[^}]*display: block;[^}]*padding: 18px 20px;/);
  assert.match(source, /\.push-detail-view \.admin-compact-summary__item \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0,1fr\) auto;/);
  assert.match(source, /\.push-detail-view \.admin-compact-summary__icon svg \{[^}]*width: 20px;[^}]*height: 20px;/);
  assert.match(source, /one\('\[data-campaign-form-column\]'\)\.hidden = detailMode/);
  assert.match(source, /one\('\[data-campaign-preview-column\]'\)\.hidden = detailMode/);
  assert.match(source, /one\('\[data-campaign-detail-view\]'\)\.hidden = !detailMode/);
  assert.match(source, /if \(edit\) \{[\s\S]*?field\('title'\)\.value = campaign\.title/);
  assert.match(source, /Resumen operativo del destino, la audiencia y los resultados verificados/);
});
