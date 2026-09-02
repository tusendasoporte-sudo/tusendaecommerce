import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontUpdateTicketResponse,
  normalizeStorefrontUpdateTicketPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'updates_ticket',
  internalPath: '/api/pz/storefront/v1/updates/ticket',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.update_ticket,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontUpdateTicketPayload,
  mapSuccess: mapStorefrontUpdateTicketResponse,
});
