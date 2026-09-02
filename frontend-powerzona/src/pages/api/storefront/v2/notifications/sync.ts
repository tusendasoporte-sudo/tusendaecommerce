import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontNotificationsSyncResponse,
  normalizeStorefrontEmptyPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'notifications_sync',
  internalPath: '/api/pz/storefront/v2/notifications/sync',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.notifications_sync,
  allowEmptyBody: true,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontEmptyPayload,
  mapSuccess: mapStorefrontNotificationsSyncResponse,
});
