import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontUpdatePolicyResponse,
  normalizeStorefrontUpdatePolicyPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'updates_policy',
  internalPath: '/api/pz/storefront/v1/updates/policy',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.update_policy,
  credential: 'required',
  parsePayload: normalizeStorefrontUpdatePolicyPayload,
  mapSuccess: mapStorefrontUpdatePolicyResponse,
});
