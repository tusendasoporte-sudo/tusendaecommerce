import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontRealtimeTicketResponse,
  normalizeStorefrontEmptyPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'realtime_ticket',
  internalPath: '/api/pz/storefront/v2/realtime/ticket',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.realtime_ticket,
  allowEmptyBody: true,
  credential: 'required',
  appCheck: 'disabled',
  parsePayload: normalizeStorefrontEmptyPayload,
  mapSuccess: mapStorefrontRealtimeTicketResponse,
});
