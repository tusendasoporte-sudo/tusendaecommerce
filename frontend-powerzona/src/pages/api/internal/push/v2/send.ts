import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import {
  buildStorefrontMulticastMessage,
  classifyFirebaseDeliveryError,
  normalizePushRelayV2Payload,
} from '../../../../../lib/pushRelayV2Payload.ts';

export const prerender = false;

const FIREBASE_APP_NAME = 'pz-storefront-push-v2';
const JSON_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function secretMatches(received: string, expected: string) {
  if (!received || !expected || expected.length < 32) return false;
  const left = Buffer.from(received, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function initializeStorefrontFirebaseAdmin() {
  const existing = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  if (existing) return existing;

  const projectId = String(process.env.PZ_STOREFRONT_FIREBASE_PROJECT_ID || '').trim();
  const serviceAccountJson = String(process.env.PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!projectId || !serviceAccountJson) throw new Error('firebase_not_configured');
  const serviceAccount = JSON.parse(serviceAccountJson);
  if (!serviceAccount || String(serviceAccount.project_id || '').trim() !== projectId) {
    throw new Error('firebase_project_mismatch');
  }
  return initializeApp({ credential: cert(serviceAccount), projectId }, FIREBASE_APP_NAME);
}

export const POST: APIRoute = async ({ request }) => {
  const storefrontSecret = String(process.env.PZ_STOREFRONT_PUSH_RELAY_SECRET || '').trim();
  const adminSecret = String(process.env.PZ_PUSH_RELAY_SECRET || '').trim();
  if (!storefrontSecret || (adminSecret && storefrontSecret === adminSecret)) {
    return json(503, { ok: false, error: 'relay_secret_isolation_required', dispatched: false, retryable: false });
  }
  if (!secretMatches(request.headers.get('x-pz-storefront-push-secret') || '', storefrontSecret)) {
    return json(401, { ok: false, error: 'unauthorized', dispatched: false, retryable: false });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 262_144) {
    return json(413, { ok: false, error: 'payload_too_large', dispatched: false, retryable: false });
  }

  let payload = null;
  try {
    payload = normalizePushRelayV2Payload(await request.json());
  } catch {
    payload = null;
  }
  if (!payload) return json(400, { ok: false, error: 'invalid_payload', dispatched: false, retryable: false });

  let messaging;
  try {
    messaging = getMessaging(initializeStorefrontFirebaseAdmin());
  } catch {
    return json(503, { ok: false, error: 'firebase_not_configured', dispatched: false, retryable: true }, {
      'Retry-After': '60',
    });
  }

  try {
    const result = await messaging.sendEachForMulticast(buildStorefrontMulticastMessage(payload));
    if (!result || !Array.isArray(result.responses) || result.responses.length !== payload.deliveries.length) {
      return json(502, { ok: false, error: 'firebase_send_ambiguous', dispatched: true, retryable: false });
    }

    let successCount = 0;
    let failureCount = 0;
    const results = result.responses.map((response, index) => {
      const deliveryId = payload.deliveries[index].delivery_id;
      if (response.success && response.messageId) {
        successCount += 1;
        return {
          delivery_id: deliveryId,
          status: 'accepted',
          firebase_message_id: String(response.messageId).slice(0, 255),
          error_code: '',
          retry_after_seconds: 0,
        };
      }
      failureCount += 1;
      const classified = classifyFirebaseDeliveryError(response.error);
      return {
        delivery_id: deliveryId,
        status: classified.status,
        firebase_message_id: '',
        error_code: classified.error_code,
        retry_after_seconds: classified.retry_after_seconds,
      };
    });

    const retryAfter = results.reduce((maximum, item) => (
      item.status === 'failed_transient'
        ? Math.max(maximum, Number(item.retry_after_seconds) || 0)
        : maximum
    ), 0);
    return json(200, {
      ok: true,
      success_count: successCount,
      failure_count: failureCount,
      results,
    }, retryAfter ? { 'Retry-After': String(retryAfter) } : {});
  } catch {
    // Después de iniciar sendEachForMulticast no se puede probar que Firebase
    // no aceptó el lote. El backend marcará estas entregas como unknown y no
    // las reintentará automáticamente.
    return json(502, { ok: false, error: 'firebase_send_ambiguous', dispatched: true, retryable: false });
  }
};
