import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  normalizeStorefrontRegisterPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'installations_register',
  internalPath: '/api/pz/storefront/v1/installations/register',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.register,
  credential: 'optional',
  parsePayload: normalizeStorefrontRegisterPayload,
});
