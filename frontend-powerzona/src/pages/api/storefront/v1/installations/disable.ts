import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  normalizeStorefrontEmptyPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'installations_disable',
  internalPath: '/api/pz/storefront/v1/installations/disable',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.disable,
  allowEmptyBody: true,
  credential: 'required',
  parsePayload: normalizeStorefrontEmptyPayload,
});
