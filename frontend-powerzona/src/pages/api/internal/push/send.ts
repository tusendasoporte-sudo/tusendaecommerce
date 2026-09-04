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

function safeFirebaseErrorCode(error: unknown) {
  const candidate = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '').trim().toLowerCase()
    : '';
  return /^[a-z0-9_/-]{1,80}$/.test(candidate) ? candidate : 'unknown';
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
  const failureCodes = new Map<string, number>();
  let successCount = 0;
  let failureCount = 0;
  let recipientCount = 0;

  try {
    for (const [appId, devices] of groupDevicesByAppId(payload.devices)) {
      recipientCount += devices.length;
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
            tag: `pz_admin_${payload.notification.id}`,
            visibility: 'private',
          },
        },
      });

      successCount += result.successCount;
      failureCount += result.failureCount;
      result.responses.forEach((response, index) => {
        if (!response.success) {
          const code = safeFirebaseErrorCode(response.error);
          failureCodes.set(code, (failureCodes.get(code) || 0) + 1);
        }
        if (!response.success && isInvalidInstallationError(response.error)) {
          invalidDeviceIds.add(devices[index].id);
        }
      });
    }
  } catch (error) {
    console.error(
      `[admin_push_relay] status=failed recipients=${recipientCount} code=${safeFirebaseErrorCode(error)}`,
    );
    return json(502, { ok: false, error: 'firebase_send_failed' });
  }

  const summarizedCodes = Array.from(failureCodes.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${code}:${count}`)
    .join(',') || 'none';
  console.info(
    `[admin_push_relay] status=completed recipients=${recipientCount} success=${successCount} failure=${failureCount} invalid=${invalidDeviceIds.size} codes=${summarizedCodes}`,
  );

  return json(200, {
    ok: true,
    success_count: successCount,
    failure_count: failureCount,
    invalid_device_ids: Array.from(invalidDeviceIds),
  });
};
