import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontCoreRegisterResponse,
  normalizeStorefrontCoreRegisterPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'installations_register_core',
  internalPath: '/api/pz/storefront/v2/installations/register',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.register_core,
  credential: 'optional',
  appCheck: 'disabled',
  parsePayload: normalizeStorefrontCoreRegisterPayload,
  mapSuccess: mapStorefrontCoreRegisterResponse,
});
