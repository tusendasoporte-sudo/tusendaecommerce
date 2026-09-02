import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontUpdateVerifiedResponse,
  normalizeStorefrontUpdateVerifiedPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'updates_verified',
  internalPath: '/api/pz/storefront/v1/updates/verified',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.update_verified,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontUpdateVerifiedPayload,
  mapSuccess: mapStorefrontUpdateVerifiedResponse,
});
