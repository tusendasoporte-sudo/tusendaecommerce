import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  normalizePromoAnalyticsSummary,
  PROMO_ANALYTICS_SUMMARY_CONTRACT,
} from '../src/lib/promoAnalytics.ts';
import {
  normalizePromoAnalyticsEvent,
  promoPublicAnalyticsEndpoint,
} from '../src/lib/promoPublicAnalytics.ts';

const EVENT_ID = '8f9760e2-1847-4b9c-83e8-2f09724e9e50';

function event(type, extra = {}) {
  return { contract: 'promo.analytics.collect.v1', event_id: EVENT_ID, event_type: type, locale: 'es', ...extra };
}

function summary() {
  const byDay = Array.from({ length: 7 }, (_, index) => {
    const date = new Date('2026-08-18T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + index);
    return {
      day: date.toISOString().slice(0, 10), page_views: index, section_views: 0,
      contact_activations: 0, landing_qr_opens: index === 6 ? 2 : 0,
    };
  });
  return {
    ok: true, contract: PROMO_ANALYTICS_SUMMARY_CONTRACT,
    range: { days: 7, from: '2026-08-18', to: '2026-08-24' },
    totals: { page_views: 21, section_views: 3, contact_activations: 1, landing_qr_opens: 2 },
    by_day: byDay,
    sections: [{ key: 'hero', count: 3 }],
    contact_actions: [{ key: 'whatsapp', count: 1 }],
    locales: [{ key: 'es', count: 27 }],
    privacy: { unique_visitors_measured: false, raw_event_retention_days: 7 },
  };
}

test('cliente público conserva payload exacto y rechaza atribución o PII', () => {
  assert.equal(normalizePromoAnalyticsEvent(event('landing_qr_open')).event_type, 'landing_qr_open');
  assert.equal(normalizePromoAnalyticsEvent(event('section_view', { section_key: 'hero' })).section_key, 'hero');
  for (const poison of [
    { url: 'https://custom.test/es?utm_source=qr' }, { referrer: 'https://search.test' },
    { visitor_id: 'abc' }, { action_type: 'whatsapp' }, { store: 'other' },
  ]) assert.throws(() => normalizePromoAnalyticsEvent({ ...event('page_view'), ...poison }));
});

test('endpoint depende del canonical servido y el dominio propio usa same-origin', () => {
  const profile = { site: { public_slug: 'demo-promo' } };
  assert.equal(promoPublicAnalyticsEndpoint(profile, {
    canonical_url: 'https://tusenda84.com/promo/demo-promo/es',
  }), '/api/promo/analytics/sites/demo-promo');
  assert.equal(promoPublicAnalyticsEndpoint(profile, {
    canonical_url: 'https://promo.example.test/es',
  }), '/api/promo/analytics/host');
  assert.throws(() => promoPublicAnalyticsEndpoint(profile, {
    canonical_url: 'https://tusenda84.com/promo/other/es',
  }));
});

test('resumen privado exige rango continuo, agregados y cero visitantes únicos', () => {
  const normalized = normalizePromoAnalyticsSummary(summary());
  assert.equal(normalized.totals.landing_qr_opens, 2);
  assert.equal(normalized.by_day.length, 7);
  assert.equal(normalized.privacy.unique_visitors_measured, false);
  assert.throws(() => normalizePromoAnalyticsSummary({
    ...summary(), privacy: { unique_visitors_measured: true, raw_event_retention_days: 7 },
  }));
  assert.throws(() => normalizePromoAnalyticsSummary({
    ...summary(), totals: { ...summary().totals, unique_visitors: 10 },
  }));
});

test('instrumentación honra privacidad y no toca Landing QR Commerce existente', () => {
  const layout = readFileSync(new URL('../src/layouts/PromoPublicLayout.astro', import.meta.url), 'utf8');
  const middleware = readFileSync(new URL('../src/middleware.ts', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../src/layouts/PromoAnalyticsAdminPage.astro', import.meta.url), 'utf8');
  assert.match(layout, /navigator\.doNotTrack === '1'/);
  assert.match(layout, /navigator\.globalPrivacyControl === true/);
  assert.match(layout, /credentials: 'omit'/);
  assert.match(layout, /referrerPolicy: 'no-referrer'/);
  assert.match(layout, /sendPromoEvent\('landing_qr_open'\)/);
  assert.doesNotMatch(layout, /localStorage|sessionStorage|document\.cookie|utm_/i);
  assert.match(middleware, /pathname === PROMO_CUSTOM_ANALYTICS_PATH/);
  assert.match(admin, /Aperturas Landing QR/);
  const commerceClick = readFileSync(new URL('../src/pages/api/landing-qr/click.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(commerceClick, /promo\.analytics|landing_qr_open/);
});
