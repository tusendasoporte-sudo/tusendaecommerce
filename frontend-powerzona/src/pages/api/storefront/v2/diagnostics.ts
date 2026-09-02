import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  normalizeStorefrontDiagnosticsPayload,
} from '../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'diagnostics_batch',
  internalPath: '/api/pz/storefront/v2/diagnostics',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.diagnostics,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontDiagnosticsPayload,
});
