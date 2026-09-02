import type { APIRoute } from 'astro';
import { storefrontNativeGateway } from '../../../../../lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  mapStorefrontFirebaseEnrichmentResponse,
  normalizeStorefrontFirebaseEnrichmentPayload,
} from '../../../../../lib/storefrontPushContracts.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => storefrontNativeGateway({
  request,
  clientAddress,
  action: 'installations_firebase_enrich',
  internalPath: '/api/pz/storefront/v2/installations/firebase',
  maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.firebase_enrichment,
  credential: 'required',
  appCheck: 'optional',
  parsePayload: normalizeStorefrontFirebaseEnrichmentPayload,
  mapSuccess: mapStorefrontFirebaseEnrichmentResponse,
});
