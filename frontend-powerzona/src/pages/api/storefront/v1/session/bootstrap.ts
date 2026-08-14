import type { APIRoute } from 'astro';
import {
  mapBootstrapResponse,
  storefrontNativeGateway,
} from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  normalizeStorefrontEmptyPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'session_bootstrap',
  internalPath: '/api/pz/storefront/v1/session/bootstrap',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.session_bootstrap,
  allowEmptyBody: true,
  credential: 'required',
  parsePayload: normalizeStorefrontEmptyPayload,
  mapSuccess: (payload) => mapBootstrapResponse(request, payload, clientAddress),
});
