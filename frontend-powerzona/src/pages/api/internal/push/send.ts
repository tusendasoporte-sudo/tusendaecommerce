import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import {
  androidMessagePriority,
  androidNotificationChannelId,
  groupDevicesByAppId,
  isInvalidInstallationError,
  normalizeRelayPayload,
} from '../../../../lib/pushRelayPayload.js';

export const prerender = false;

const JSON_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function secretMatches(received: string, expected: string) {
  if (!received || !expected || expected.length < 32) return false;
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function initializeFirebaseAdmin() {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const inlineServiceAccount = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const credential = inlineServiceAccount
    ? cert(JSON.parse(inlineServiceAccount))
    : applicationDefault();

  return initializeApp({
    credential,
    ...(projectId ? { projectId } : {}),
  });
}

export const POST: APIRoute = async ({ request }) => {
  const configuredSecret = String(process.env.PZ_PUSH_RELAY_SECRET || '').trim();
  if (!secretMatches(request.headers.get('x-pz-push-secret') || '', configuredSecret)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 262_144) {
    return json(413, { ok: false, error: 'payload_too_large' });
  }

  let payload;
  try {
    payload = normalizeRelayPayload(await request.json());
  } catch {
    payload = null;
  }
  if (!payload) return json(400, { ok: false, error: 'invalid_payload' });

  let messaging;
  try {
    messaging = getMessaging(initializeFirebaseAdmin());
  } catch {
    return json(503, { ok: false, error: 'firebase_not_configured' });
  }

  const invalidDeviceIds = new Set<string>();
  let successCount = 0;
  let failureCount = 0;

  try {
    for (const [appId, devices] of groupDevicesByAppId(payload.devices)) {
      const result = await messaging.sendEachForMulticast({
        fids: devices.map((device) => device.fid),
        notification: {
          title: payload.notification.title,
          body: payload.notification.body,
        },
        data: {
          notification_id: payload.notification.id,
          store_id: payload.notification.store_id,
          type: payload.notification.type,
          title: payload.notification.title,
          body: payload.notification.body,
          target_url: payload.notification.target_url,
          priority: payload.notification.priority,
        },
        android: {
          priority: androidMessagePriority(payload.notification),
          ttl: 86_400_000,
          restrictedPackageName: appId,
          notification: {
            channelId: androidNotificationChannelId(payload.notification),
            icon: 'ic_notification',
            color: '#2563EB',
            tag: `pz_${payload.notification.id}`,
          },
        },
      });

      successCount += result.successCount;
      failureCount += result.failureCount;
      result.responses.forEach((response, index) => {
        if (!response.success && isInvalidInstallationError(response.error)) {
          invalidDeviceIds.add(devices[index].id);
        }
      });
    }
  } catch {
    return json(502, { ok: false, error: 'firebase_send_failed' });
  }

  return json(200, {
    ok: true,
    success_count: successCount,
    failure_count: failureCount,
    invalid_device_ids: Array.from(invalidDeviceIds),
  });
};
