import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontEventResponse,
  normalizeStorefrontEventPayload,
} from '../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'events_record',
  internalPath: '/api/pz/storefront/v1/events',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.event,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontEventPayload,
  mapSuccess: mapStorefrontEventResponse,
});
