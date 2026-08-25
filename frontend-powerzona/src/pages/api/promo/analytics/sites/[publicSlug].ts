import type { APIRoute } from 'astro';
import { forwardPromoPublicAnalytics } from '../../../../../lib/promoPublicAnalytics';

export const POST: APIRoute = async ({ request, params }) => forwardPromoPublicAnalytics({
  request,
  publicSlug: String(params.publicSlug || ''),
});
