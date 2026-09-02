import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  normalizeStorefrontPermissionPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'installations_permission',
  internalPath: '/api/pz/storefront/v1/installations/permission',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.permission,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontPermissionPayload,
});
