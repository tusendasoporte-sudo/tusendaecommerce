import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeDeletionCounts } from '../src/lib/masterStoreDeletion.ts';

const COUNT_KEYS = [
  'store_users', 'products', 'product_variations', 'orders', 'order_items', 'gifts',
  'promotions', 'coupons', 'coupon_usages', 'raffles', 'raffle_entries', 'reviews',
  'analytics_events', 'store_notifications', 'customers', 'customer_phones',
  'customer_devices', 'customer_links', 'user_devices', 'user_device_audit',
  'visitor_sessions', 'visitor_pageviews', 'security_events', 'security_blocks',
  'security_audit', 'security_settings', 'activity_reviews', 'activity_audit',
  'price_watches', 'price_events', 'master_notifications', 'settings', 'categories',
  'subcategories', 'currencies', 'shipping_zones', 'visual_items',
  'storefront_app_configs', 'storefront_installations', 'storefront_web_sessions',
  'storefront_order_links', 'push_media', 'push_campaigns',
  'push_campaign_deliveries', 'push_events', 'push_daily_stats',
  'admin_app_release_events', 'admin_app_download_tickets', 'admin_app_release_assignments',
  'promo_sites', 'promo_entitlements', 'promo_domain_bindings', 'promo_drafts', 'promo_media',
  'promo_revisions', 'promo_revision_media_refs', 'promo_publication_slots', 'promo_publication_events',
  'promo_audit_events', 'promo_analytics_events', 'promo_analytics_daily', 'promo_review_requests',
];

function completeCounts() {
  const counts = Object.fromEntries(COUNT_KEYS.map((key, index) => [key, index % 3]));
  counts.total_records = 1 + COUNT_KEYS.reduce((total, key) => total + counts[key], 0);
  return counts;
}

test('acepta el contrato completo del preview Master, incluido el grafo Promo', () => {
  const counts = completeCounts();
  assert.deepEqual(normalizeDeletionCounts(counts), counts);
});

test('rechaza un preview que omita cualquier conteo C02', () => {
  const counts = completeCounts();
  delete counts.push_events;
  assert.equal(normalizeDeletionCounts(counts), null);
});

test('rechaza un total que no coincida con tienda más registros relacionados', () => {
  const counts = completeCounts();
  counts.total_records += 1;
  assert.equal(normalizeDeletionCounts(counts), null);
});
