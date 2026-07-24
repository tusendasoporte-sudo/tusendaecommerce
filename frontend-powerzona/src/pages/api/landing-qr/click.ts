import type { APIRoute } from 'astro';
import { getSettings } from '../../../lib/api';
import {
  LANDING_QR_PRIVATE_NO_STORE_HEADERS,
  buildDefaultLandingQrLinks,
  getLandingQrPath,
  isLandingQrStoredEnabled,
  normalizeLandingQrLinks,
  resolveLandingQrCapability,
} from '../../../lib/landingQr';
import { pb } from '../../../lib/pocketbase';
import type { PublicStore } from '../../../lib/stores';

const MAX_BODY_BYTES = 2048;
const CLICK_RATE_WINDOW_MS = 500;
const RECENT_CLICK_TTL_MS = 60 * 1000;
const recentClicks = new Map<string, number>();

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...LANDING_QR_PRIVATE_NO_STORE_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

function empty(status = 204) {
  return new Response(null, {
    status,
    headers: LANDING_QR_PRIVATE_NO_STORE_HEADERS,
  });
}

function cleanText(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function hasHtml(value: unknown) {
  return /[<>]/.test(String(value ?? ''));
}

function cleanId(value: unknown, max: number) {
  return cleanText(value, max).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, max);
}

function normalizeDay(value: unknown) {
  const text = cleanText(value, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Date().toISOString().slice(0, 10);
}

function normalizePath(value: unknown) {
  const path = cleanText(value, 240);
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

function shouldRateLimit(key: string) {
  const now = Date.now();

  recentClicks.forEach((value, itemKey) => {
    if (now - value > RECENT_CLICK_TTL_MS) recentClicks.delete(itemKey);
  });

  const last = recentClicks.get(key) || 0;
  recentClicks.set(key, now);
  return now - last < CLICK_RATE_WINDOW_MS;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return json({ ok: false }, 413);
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ ok: false }, 400);
    }

    const body = payload as Record<string, unknown>;
    const store = cleanId(body.store, 80);
    const linkId = cleanId(body.link_id, 80);
    const linkType = cleanId(body.link_type || 'link', 40) || 'link';
    const linkIcon = cleanId(body.link_icon || linkType, 40) || 'link';
    const linkLabel = cleanText(body.link_label, 100);
    const visitorId = cleanId(body.visitor_id || 'anonymous_visitor', 80) || 'anonymous_visitor';
    const sessionId = cleanId(body.session_id || 'anonymous_session', 80) || 'anonymous_session';

    if (!store || !linkId || !linkLabel) return json({ ok: false }, 400);
    if ([body.link_id, body.link_type, body.link_icon, body.link_label].some(hasHtml)) {
      return json({ ok: false }, 400);
    }

    let storeRecord: PublicStore;
    try {
      storeRecord = await pb.collection('stores').getOne(store) as unknown as PublicStore;
    } catch (_) {
      return json({ ok: false }, 404);
    }

    if (String(storeRecord.status || '').toLowerCase() !== 'active'
      || !resolveLandingQrCapability(storeRecord).allowed) {
      return json({ ok: false }, 404);
    }

    const settings = await getSettings({ storeId: storeRecord.id });
    if (!settings || !isLandingQrStoredEnabled(settings.landing_qr_enabled)) {
      return json({ ok: false }, 404);
    }

    const canonicalPath = getLandingQrPath(storeRecord);
    if (normalizePath(body.path) !== canonicalPath) {
      return json({ ok: false }, 404);
    }

    const configuredLinks = normalizeLandingQrLinks(settings.landing_qr_links);
    const availableLinks = configuredLinks.length
      ? configuredLinks
      : buildDefaultLandingQrLinks(storeRecord, settings);
    const canonicalLink = availableLinks.find((link) => link.id === linkId);
    if (!canonicalLink) return json({ ok: false }, 404);

    const rateKey = `${storeRecord.id}:${visitorId}:${canonicalLink.id}`;
    if (shouldRateLimit(rateKey)) return empty();

    await pb.collection('store_analytics_events').create({
      store: storeRecord.id,
      event_type: 'landing_qr_click',
      day: normalizeDay(body.day),
      visitor_id: visitorId,
      session_id: sessionId,
      page_type: 'landing_qr',
      entity_type: 'landing_qr',
      entity_id: storeRecord.id,
      path: canonicalPath,
      referrer: '',
      user_agent: '',
      link_id: canonicalLink.id,
      link_type: canonicalLink.type,
      link_icon: canonicalLink.icon,
      link_label: canonicalLink.label,
    });

    return empty();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    const schemaError = /page_type|event_type|link_id|link_type|link_icon|link_label|unknown|validation|field/i.test(message);

    return json({
      ok: false,
      error: schemaError ? 'analytics_schema_error' : 'analytics_error',
    }, 500);
  }
};
