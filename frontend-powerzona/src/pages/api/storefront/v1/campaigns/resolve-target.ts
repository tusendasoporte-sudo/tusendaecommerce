import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontResolvedTarget,
  normalizeStorefrontCampaignTargetPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'campaigns_resolve_target',
  internalPath: '/api/pz/storefront/v1/campaigns/resolve-target',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.resolve_target,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontCampaignTargetPayload,
  mapSuccess: mapStorefrontResolvedTarget,
});
