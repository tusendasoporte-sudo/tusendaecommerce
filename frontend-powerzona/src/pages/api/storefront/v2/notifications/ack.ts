import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontNotificationAckResponse,
  normalizeStorefrontNotificationReceiptsPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'notifications_ack',
  internalPath: '/api/pz/storefront/v2/notifications/ack',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.notifications_ack,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontNotificationReceiptsPayload,
  mapSuccess: mapStorefrontNotificationAckResponse,
});
