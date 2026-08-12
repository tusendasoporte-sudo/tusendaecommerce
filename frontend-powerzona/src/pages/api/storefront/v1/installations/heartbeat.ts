import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  normalizeStorefrontHeartbeatPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'installations_heartbeat',
  internalPath: '/api/pz/storefront/v1/installations/heartbeat',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.heartbeat,
  credential: 'required',
  parsePayload: normalizeStorefrontHeartbeatPayload,
});
