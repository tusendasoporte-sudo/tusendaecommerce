import type { APIRoute } from 'astro';
import { refreshAuthFromCookie, requireMasterAdmin } from '../../../lib/auth';
import {
  getPublicHomepageSettings,
  normalizeHomepageCopy,
  PUBLIC_HOMEPAGE_SETTINGS_COLLECTION,
  validateHomepageFaqs,
} from '../../../lib/publicHomepageSettings';

const MAX_BODY_BYTES = 48_000;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const EXPECTED_KEYS = [
  'faq_eyebrow', 'faq_intro', 'faq_section_enabled', 'faq_title', 'faqs',
  'featured_store_ids', 'record_id', 'stores_section_enabled',
].sort();

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function sameOrigin(request: Request) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return false;
  try { return origin === new URL(request.url).origin; } catch (_) { return false; }
}

function exactKeys(value: Record<string, unknown>) {
  const keys = Object.keys(value).sort();
  return keys.length === EXPECTED_KEYS.length && keys.every((key, index) => key === EXPECTED_KEYS[index]);
}

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return json(403, { ok: false, error: 'invalid_origin' });
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json(413, { ok: false, error: 'invalid_payload' });

  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(400, { ok: false, error: 'invalid_payload' });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_payload');
    body = parsed;
  } catch (_) {
    return json(400, { ok: false, error: 'invalid_payload' });
  }
  if (!exactKeys(body)) return json(400, { ok: false, error: 'invalid_payload' });

  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!authPb.authStore.isValid || !requireMasterAdmin(authPb.authStore.record as any)) {
    return json(403, { ok: false, error: 'unauthorized' });
  }

  const recordId = String(body.record_id || '').trim();
  const copy = normalizeHomepageCopy(body);
  const faqs = validateHomepageFaqs(body.faqs);
  const selectedIds = Array.isArray(body.featured_store_ids)
    ? [...new Set(body.featured_store_ids.map((id) => String(id || '').trim()))]
    : [];
  if (!RECORD_ID_PATTERN.test(recordId) || !copy || !faqs || selectedIds.length > 100
    || selectedIds.some((id) => !RECORD_ID_PATTERN.test(id))
    || typeof body.stores_section_enabled !== 'boolean'
    || typeof body.faq_section_enabled !== 'boolean') {
    return json(400, { ok: false, error: 'invalid_payload' });
  }

  try {
    const current = await getPublicHomepageSettings(authPb);
    if (!current.available || current.recordId !== recordId) return json(409, { ok: false, error: 'settings_changed' });
    const activeStores = await authPb.collection('stores').getFullList({
      filter: 'status="active"',
      fields: 'id,name,slug,status,featured,featured_order',
      sort: 'name',
      requestKey: null,
    });
    let promoStoreIds = new Set<string>();
    try {
      const promoSites = await authPb.collection('promo_sites').getFullList({ fields: 'store', requestKey: null });
      promoStoreIds = new Set(promoSites.map((site: any) => String(site.store || '')).filter(Boolean));
    } catch (_) {}
    const eligibleStores = activeStores.filter((store: any) => !promoStoreIds.has(String(store.id || '')));
    const eligibleIds = new Set(eligibleStores.map((store: any) => String(store.id || '')));
    if (selectedIds.some((id) => !eligibleIds.has(id))) return json(400, { ok: false, error: 'invalid_store_selection' });

    await authPb.collection(PUBLIC_HOMEPAGE_SETTINGS_COLLECTION).update(recordId, {
      stores_section_enabled: body.stores_section_enabled,
      faq_section_enabled: body.faq_section_enabled,
      faq_eyebrow: copy.faqEyebrow,
      faq_title: copy.faqTitle,
      faq_intro: copy.faqIntro,
      faqs_json: faqs,
    }, { requestKey: null });

    const order = new Map(selectedIds.map((id, index) => [id, index + 1]));
    await Promise.all(eligibleStores.map((store: any) => authPb.collection('stores').update(String(store.id), {
      featured: order.has(String(store.id)),
      featured_order: order.get(String(store.id)) || 0,
    }, { requestKey: null })));

    const saved = await getPublicHomepageSettings(authPb);
    return json(200, { ok: true, settings: saved, featured_store_ids: selectedIds });
  } catch (_) {
    return json(503, { ok: false, error: 'homepage_settings_unavailable' });
  }
};
